import type { AcademySnapshot } from '../core/academy.js';
import type { Question, Section } from '../core/types.js';
import { observationWalkthrough } from '../core/live.js';
import { safeText } from '../core/privacy.js';
import { renderDiagram } from './diagrams.js';
import { conversationLanguage, hasLocalNarration, languageName } from '../core/language.js';

type StoryContext = Pick<
  AcademySnapshot,
  'learning' | 'captureId' | 'selected' | 'events' | 'lessons' | 'busy' | 'status' | 'language'
>;
interface StoryOptions {
  offline?: boolean;
  width?: number;
  questions?: Question[];
}
function short(value: string, max = 2400) {
  const text = safeText(value, max + 1).trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}
/** One chronological reading surface: explanation, actual code, visuals and replies. */
export function renderStory(snapshot: StoryContext, options: StoryOptions = {}): string {
  const width = Math.max(12, options.width ?? 72);
  const lessons = snapshot.lessons.filter((l) => l.captureId === snapshot.captureId);
  const language = conversationLanguage(
    snapshot.events,
    snapshot.language ?? lessons.at(-1)?.language,
  );
  const task = snapshot.events.find((e) => e.kind === 'task');
  const covered = new Set<string>();
  const seen = new Set<string>();
  const blocks: string[] = [];
  const add = (section: Section) => {
    const body = safeText(section.body, 60000).trim();
    const key = section.heading + '\n' + body;
    if (seen.has(key)) return;
    seen.add(key);
    blocks.push(
      `## ${short(section.heading, 150)}${section.confidence === 'Hypothesis' ? ' · hypothesis' : ''}\n\n${body}`,
    );
  };
  for (const lesson of lessons) {
    const ids = new Set(lesson.evidenceIds);
    const sections = (
      lesson.provider === 'offline' && !hasLocalNarration(language)
        ? []
        : lesson.walkthrough?.length
          ? lesson.walkthrough
          : lesson.sections.filter((s) =>
              [
                'What happened?',
                'Ne oldu?',
                'Root cause',
                'Kök neden',
                'Relevant code',
                'İlgili kod',
                'Why does the solution work?',
                'Çözüm neden çalışır?',
                'How do we verify it?',
                'Nasıl doğrularız?',
              ].includes(s.heading),
            )
    ).filter((s) => s.evidence.length && s.evidence.every((id) => ids.has(id)));
    for (const section of sections) {
      add(section);
    }
    if (sections.length) for (const id of lesson.evidenceIds) covered.add(id);
    const edges = lesson.diagram.filter(
      (edge) => edge.evidence.length && edge.evidence.every((id) => ids.has(id)),
    );
    if (edges.length) {
      const key = JSON.stringify(edges.map(({ from, to, label }) => ({ from, to, label })));
      if (!seen.has(key)) {
        seen.add(key);
        blocks.push('Flow:\n\n' + renderDiagram(edges.slice(0, 3), width, false));
      }
    }
    for (const q of (options.questions ?? []).filter((q) => q.lessonId === lesson.id)) {
      blocks.push(
        `## Your question\n\n${short(q.question, 2000)}\n\n${q.answer.map((a) => safeText(a.body, 60000)).join('\n\n')}`,
      );
    }
  }
  for (const section of observationWalkthrough(
    snapshot.events.filter((e) => !covered.has(e.id)),
    language,
  )) {
    if (task && section.evidence.length === 1 && section.evidence[0] === task.id) continue;
    add(section);
  }
  const paused = snapshot.learning === 'paused';
  const complete = snapshot.status.startsWith('Turn completed');
  return [
    task ? '## Task\n\n' + short(task.text, 600) : '',
    !blocks.length
      ? paused
        ? 'Press B to start learning from a task. Explanations will follow your Codex conversation language automatically.'
        : snapshot.events.length && !hasLocalNarration(language)
          ? `Narration language: ${languageName(language)}. ${snapshot.busy ? 'Preparing your explanation…' : 'Choose an explanation model in Settings to continue.'}`
          : task
            ? 'Waiting for the first observations of this task. Explanations will follow your conversation language.'
            : 'Waiting for new session activity. No investigation or failure has been observed yet.'
      : '',
    ...blocks,
    snapshot.busy ? 'Preparing an explanation of the code, findings and results…' : '',
    lessons.at(-1)?.error
      ? 'Could not prepare the detailed explanation: ' + lessons.at(-1)!.error
      : '',
    options.offline && !paused
      ? 'Offline mode: choose an explanation model in Settings for code-specific reasoning and explanations in any conversation language.'
      : '',
    complete ? 'Turn completed. Press B to follow a new task.' : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
