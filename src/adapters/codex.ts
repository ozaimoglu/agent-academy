import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { AcademyEvent, Checkpoint, Session, SessionAdapter } from '../core/types.js';
import { canonical, hash } from '../core/privacy.js';
import { SessionEventNormalizer } from './normalizer.js';

const BATCH = 1024 * 1024;
export interface CodexCheckpoint extends Checkpoint {
  turnId?: string;
  discarding?: boolean;
}
/** A bounded reader. Checkpoints advance only past complete lines, except explicitly skipped oversized lines. */
export async function readJsonl(file: string, previous?: CodexCheckpoint) {
  const f = await open(file, 'r');
  try {
    const st = await f.stat();
    const identity = `${st.dev}:${st.ino}`;
    const prefixBuffer = Buffer.alloc(Math.min(128, st.size));
    await f.read(prefixBuffer, 0, prefixBuffer.length, 0);
    const prefix = hash(prefixBuffer.toString('hex'));
    const reset =
      !previous ||
      previous.identity !== identity ||
      previous.offset > st.size ||
      (st.size >= 128 && previous.prefix !== prefix);
    const cp: CodexCheckpoint = reset
      ? { offset: 0, identity, prefix }
      : { ...previous, identity, prefix };
    const buf = Buffer.alloc(Math.min(BATCH, Math.max(0, st.size - cp.offset)));
    const { bytesRead } = await f.read(buf, 0, buf.length, cp.offset);
    const bytes = buf.subarray(0, bytesRead);
    const last = bytes.lastIndexOf(10);
    const warnings: string[] = [];
    const records: unknown[] = [];
    if (last < 0) {
      if (bytesRead === BATCH) {
        cp.offset += bytesRead;
        cp.discarding = true;
        warnings.push('1 MiB sınırını aşan JSONL satırı atlanıyor.');
      }
      return {
        records,
        checkpoint: cp,
        warnings,
        more: cp.offset < st.size && bytesRead === BATCH,
      };
    }
    const complete = bytes.subarray(0, last).toString('utf8').split('\n');
    if (cp.discarding) {
      complete.shift();
      cp.discarding = false;
    }
    for (const line of complete) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line));
      } catch {
        warnings.push('Bozuk tamamlanmış JSONL satırı atlandı.');
      }
    }
    cp.offset += last + 1;
    return { records, checkpoint: cp, warnings, more: st.size - cp.offset >= BATCH };
  } finally {
    await f.close();
  }
}

export class CodexSessionAdapter implements SessionAdapter {
  private cache = new Map<string, { mtime: number; size: number; session?: Session }>();
  constructor(private lookup?: (sessionId: string, callId: string) => string | undefined) {}
  async discover(root: string): Promise<Session[]> {
    const candidates: { file: string; mtime: number; size: number }[] = [];
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 5 || candidates.length >= 20000) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw e;
      }
      for (const ent of entries) {
        if (candidates.length >= 20000) break;
        const file = path.join(dir, ent.name);
        if (ent.isDirectory()) await walk(file, depth + 1);
        else if (ent.isFile() && ent.name.endsWith('.jsonl')) {
          const s = await stat(file);
          candidates.push({ file, mtime: s.mtimeMs, size: s.size });
        }
      }
    };
    await walk(root, 0);
    candidates.sort((a, b) => b.mtime - a.mtime);
    const sessions: Session[] = [];
    for (const c of candidates.slice(0, 5000)) {
      const cached = this.cache.get(c.file);
      if (cached && cached.mtime === c.mtime && cached.size === c.size) {
        if (cached.session) sessions.push(cached.session);
        continue;
      }
      let session: Session | undefined;
      if (!session) {
        const f = await open(c.file, 'r');
        try {
          const b = Buffer.alloc(Math.min(c.size, BATCH));
          const { bytesRead } = await f.read(b, 0, b.length, 0);
          const end = b.subarray(0, bytesRead).indexOf(10);
          if (end >= 0) {
            const row = JSON.parse(b.subarray(0, end).toString('utf8'));
            const m = row.payload;
            if (
              row.type === 'session_meta' &&
              typeof m?.id === 'string' &&
              typeof m?.cwd === 'string' &&
              !m.originator?.includes('agent-academy') &&
              !m.parent_thread_id &&
              !m.source?.subagent &&
              !m.thread_source?.includes?.('agent-academy')
            ) {
              session = {
                id: m.id,
                file: c.file,
                cwd: await canonical(m.cwd),
                modified: c.mtime,
                source: typeof m.source === 'string' ? m.source : 'unknown',
                version: m.cli_version,
                branch: m.git?.branch,
                commit: m.git?.commit_hash,
              };
            }
          }
        } catch {
          /* Partial metadata or deleted project: rediscover when it changes. */
        } finally {
          await f.close();
        }
      }
      if (session) {
        session = { ...session, modified: c.mtime };
        sessions.push(session);
      }
      this.cache.set(c.file, { mtime: c.mtime, size: c.size, session });
    }
    const live = new Set(candidates.map((c) => c.file));
    for (const f of this.cache.keys()) if (!live.has(f)) this.cache.delete(f);
    // Rotation may leave several files for one stable thread. Prefer the most recently written.
    return [...new Map(sessions.reverse().map((s) => [s.cwd + '\0' + s.id, s])).values()].sort(
      (a, b) => b.modified - a.modified,
    );
  }
  async read(s: Session, checkpoint?: CodexCheckpoint) {
    const batch = await readJsonl(s.file, checkpoint);
    for (const record of batch.records) {
      const row = record as { type?: string; payload?: { id?: string; cwd?: string } };
      if (
        row.type === 'session_meta' &&
        (row.payload?.id !== s.id ||
          !row.payload?.cwd ||
          (await canonical(row.payload.cwd)) !== s.cwd)
      ) {
        throw new Error(
          'Oturum dosyasının kimliği değişti; yeniden keşif veya elle seçim gerekli.',
        );
      }
    }
    const normalizer = new SessionEventNormalizer(s.id, (id) => this.lookup?.(s.id, id));
    normalizer.turnId = batch.checkpoint.turnId ?? 'initial';
    const events: AcademyEvent[] = [];
    for (const record of batch.records) events.push(...normalizer.normalize(record));
    batch.checkpoint.turnId = normalizer.turnId;
    return { events, checkpoint: batch.checkpoint, warnings: batch.warnings, more: batch.more };
  }
}
export function matchSessions(
  sessions: Session[],
  cwd: string,
  identity?: { kind: string; value: string },
): { selected?: Session; choices: Session[]; reason: string } {
  const choices = sessions.filter((s) => s.cwd === cwd);
  if (identity) {
    const exact = choices.find((s) =>
      identity.kind === 'id' ? s.id === identity.value : s.file === identity.value,
    );
    if (exact) return { selected: exact, choices, reason: 'Herdr oturum kimliği' };
    return { choices, reason: 'Herdr oturum kimliği henüz bulunamadı; elle seçebilirsiniz.' };
  }
  if (choices.length === 1)
    return { selected: choices[0], choices, reason: 'Tek eşleşen proje oturumu' };
  return {
    choices,
    reason: choices.length
      ? 'Birden fazla oturum var; seçim gerekli.'
      : 'Bu proje için Codex oturumu bekleniyor.',
  };
}
