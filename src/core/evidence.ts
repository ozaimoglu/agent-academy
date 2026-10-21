import type { AcademyEvent, Session } from './types.js';
import { hash, readSource } from './privacy.js';
/** Extract only explicit patch paths. Realpath checks and secret exclusions apply to every read. */
export class EvidenceCollector {
  async sources(session: Session, events: AcademyEvent[]): Promise<AcademyEvent[]> {
    const paths = new Set<string>();
    for (const e of events.filter((e) => e.kind === 'edit' || e.kind === 'diff')) {
      if (e.file) paths.add(e.file);
      for (const m of e.text.matchAll(/^(?:\*\*\* (?:Update|Add) File: |\+\+\+ b\/)(.+)$/gm))
        paths.add(m[1]!);
    }
    const collected: AcademyEvent[] = [];
    for (const file of [...paths].slice(0, 12))
      try {
        const source = await readSource(session.cwd, file);
        collected.push({
          id: hash(session.id + '|source|' + source.file + source.text),
          sessionId: session.id,
          kind: 'source',
          origin: 'source',
          time: new Date().toISOString(),
          text: source.text,
          file: source.file,
          startLine: source.start,
          endLine: source.end,
        });
      } catch {
        /* Out-of-context, removed, oversized or sensitive paths are deliberately excluded. */
      }
    return collected;
  }
}
