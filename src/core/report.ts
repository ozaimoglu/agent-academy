import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { AcademyEvent, Lesson, Question, Session } from './types.js';
import { confidenceLabels, stageLabels } from './types.js';
import { hash, safeText } from './privacy.js';
import { isTestCommand } from './milestones.js';
function fence(text: string) {
  const ticks = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${ticks}text\n${text}\n${ticks}`;
}
export function generateReport(
  s: Session,
  events: AcademyEvent[],
  lessons: Lesson[],
  questions: Question[] = [],
  total = events.length,
): string {
  const tests = events.filter((e) => e.kind === 'result' && isTestCommand(e.command ?? ''));
  const lines = [
    `# Agent Academy · Engineering debrief`,
    `Project: ${s.cwd}`,
    `Session: ${s.id} · Branch: ${s.branch ?? 'unknown'} · Commit: ${s.commit ?? 'unknown'}`,
    '> This report uses observable messages, code changes and command results. It contains no private reasoning. Completion messages and successful pushes do not prove correctness.',
    `## Initial task / observed problem`,
    events.find((e) => e.kind === 'task')?.text ?? 'No task message in this observation window.',
    `## Investigation timeline (${events.length}/${total} records)`,
    ...events
      .filter((e) => e.kind !== 'source')
      .map((e) => `- ${e.time} · ${e.kind} · ${e.command ?? e.text.slice(0, 200)} [${e.id}]`),
    '## Lessons, causes, mechanisms and decisions',
  ];
  for (const l of lessons) {
    lines.push(
      `### ${l.title} · ${stageLabels[l.stage]}`,
      `Provider: ${l.provider}${l.error ? ' · Model error: ' + l.error : ''}`,
    );
    for (const sec of l.sections)
      lines.push(
        `#### ${sec.heading} · ${confidenceLabels[sec.confidence]}`,
        sec.body,
        `Evidence: ${sec.evidence.join(', ') || 'none / unverified'}`,
      );
  }
  lines.push(
    '## Actual test results',
    ...(tests.length
      ? tests.map((t) => fence(`${t.command}\nExit code: ${t.exitCode ?? 'unknown'}\n${t.text}`))
      : ['No test result observed.']),
  );
  lines.push(
    '## Source and before/after evidence',
    'Git diffs compare HEAD with the current working tree and may include changes by other actors. They are snapshots at observation time.',
  );
  for (const e of events.filter((e) => ['source', 'diff', 'edit'].includes(e.kind)))
    lines.push(
      `### ${e.file ?? e.kind}${e.startLine ? ':' + e.startLine + '-' + e.endLine : ''} [${e.id}]`,
      fence(e.text),
    );
  lines.push('## Questions and answers');
  for (const q of questions)
    lines.push(
      `### ${q.question}`,
      ...q.answer.map((a) => `${a.body}\n\nEvidence: ${a.evidence.join(', ') || 'none'}`),
    );
  lines.push(
    '## Unverified assumptions and remaining risks',
    'Model citations are checked automatically; technical correctness needs separate evaluation. Truncated output, log format changes, missed commands and uncertain test coverage are possible. Historical HEAD changes and unsaved files from before observation cannot be fully reconstructed.',
    '## Concepts to remember',
    [...new Set(lessons.flatMap((l) => l.concepts))].join('\n') || 'Not identified yet.',
  );
  return safeText(lines.join('\n\n') + '\n', 2 * 1024 * 1024);
}
export async function exportReport(
  state: string,
  s: Session,
  markdown: string,
  captureId?: string,
) {
  const dir = path.join(state, 'reports', hash(s.cwd));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, hash(s.id + (captureId ? '|' + captureId : '')) + '.md');
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, markdown, { mode: 0o600 });
  await rename(temporary, file);
  return file;
}
