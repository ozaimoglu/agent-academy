import { createHash } from 'node:crypto';
import { realpath, stat, open } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex').slice(0, 24);
export function redact(text: string): string {
  return (
    text
      // Prevent terminal escape/OSC injection from untrusted tool/model output.
      .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
      .replace(
        /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
        '[REDACTED PRIVATE KEY]',
      )
      .replace(
        /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]+|AKIA[A-Z0-9]{16})\b/g,
        '[REDACTED]',
      )
      .replace(/\bBearer\s+[^\s"',;}]+/gi, 'Bearer [REDACTED]')
      .replace(
        /(\b(?:[A-Za-z0-9_-]*[_-])?(?:api[_-]?key|access[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret|authorization)\b["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi,
        '$1[REDACTED]',
      )
      .replace(/(--(?:api-key|token|password|secret)\s+)(?:"[^"]*"|'[^']*'|\S+)/gi, '$1[REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED JWT]')
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
      .replace(/([?&](?:key|token|secret|password)=)[^\s&#]+/gi, '$1[REDACTED]')
  );
}
export const safeText = (value: unknown, max = 8000) =>
  redact(typeof value === 'string' ? value : (JSON.stringify(value) ?? '')).slice(0, max);
export async function canonical(p: string): Promise<string> {
  return realpath(path.resolve(p));
}
export function sensitivePath(p: string): boolean {
  return (
    p
      .split(/[\\/]/)
      .some((x) =>
        /^(?:\.env(?:\..*)?|\.git|\.ssh|\.aws|\.codex|\.npmrc|\.netrc|credentials(?:\.json)?|auth\.json)$/i.test(
          x,
        ),
      ) || /\.(pem|key|p12|pfx)$/i.test(p)
  );
}
export async function readSource(
  root: string,
  filename: string,
  start = 1,
  end = 80,
): Promise<{ file: string; text: string; start: number; end: number }> {
  const base = await canonical(root);
  const resolved = await canonical(path.resolve(base, filename));
  const relative = path.relative(base, resolved);
  if (
    relative.startsWith('..' + path.sep) ||
    relative === '..' ||
    path.isAbsolute(relative) ||
    sensitivePath(relative)
  )
    throw new Error('Proje dışı veya hassas dosya okunamaz.');
  const s = await stat(resolved);
  if (!s.isFile() || s.size > 512 * 1024) throw new Error('Kaynak dosya boyut sınırını aşıyor.');
  const handle = await open(resolved, 'r');
  try {
    const content = await handle.readFile('utf8');
    const lines = content.split('\n');
    const first = Math.max(1, Math.floor(start));
    const last = Math.min(lines.length, Math.max(first, Math.min(end, first + 119)));
    return {
      file: relative,
      start: first,
      end: last,
      text: safeText(
        lines
          .slice(first - 1, last)
          .map((l, i) => `${i + first} │ ${l}`)
          .join('\n'),
        12000,
      ),
    };
  } finally {
    await handle.close();
  }
}
export function academyPaths(env: NodeJS.ProcessEnv = process.env) {
  return {
    config:
      env.ACADEMY_CONFIG_DIR ??
      env.HERDR_PLUGIN_CONFIG_DIR ??
      path.join(env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'agent-academy'),
    state:
      env.ACADEMY_STATE_DIR ??
      env.HERDR_PLUGIN_STATE_DIR ??
      path.join(env.XDG_STATE_HOME ?? path.join(os.homedir(), '.local/state'), 'agent-academy'),
    sessions:
      env.ACADEMY_SESSIONS_DIR ??
      path.join(env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions'),
  };
}
