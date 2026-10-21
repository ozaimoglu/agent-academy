import { expect, it } from 'vitest';
import { narrateEvent, observationWalkthrough } from '../src/core/live.js';
import { renderStory } from '../src/ui/story.js';
import { offlineLesson } from '../src/core/teaching.js';
import { event, session } from './helpers.js';
import type { AcademyEvent, Lesson } from '../src/core/types.js';
import stringWidth from 'string-width';

function context(events: AcademyEvent[] = [], lessons: Lesson[] = []) {
  return {
    learning: 'active' as const,
    captureId: 'now',
    selected: session('/home/person/project'),
    events,
    lessons,
    busy: false,
    status: 'Öğrenme açık',
  };
}

it('explains the very first step before a lesson or model response exists', () => {
  const e = event('command', 'rg --files', { id: 'raw-evidence-hash', command: 'rg --files' });
  const text = renderStory({ ...context([e]), busy: true });
  expect(text).toContain('First, let’s get to know the project');
  expect(text).toContain('how the pieces connect');
  expect(text).toContain('Preparing an explanation');
  for (const raw of ['raw-evidence-hash', 'COMMAND', '0 ders', '/home/person'])
    expect(text).not.toContain(raw);
  const waiting = renderStory(context());
  expect(waiting).toContain('No investigation or failure has been observed yet');
  expect(waiting).not.toContain('hatayı buldum');
});

it('turns the reported source/diff-only case into one readable code comparison', () => {
  const diff = event(
    'diff',
    'diff --git a/install.sh b/install.sh\n--- a/install.sh\n+++ b/install.sh\n-npm ci\n+npm ci --include=dev',
    { file: 'scripts/install.sh', origin: 'git' },
  );
  const source = event('source', '12 │ npm ci --include=dev', {
    file: diff.file,
    origin: 'source',
  });
  const text = renderStory(context([diff, source]), { offline: true });
  expect(text).toContain('What changed in the code?');
  expect(text).toContain('Before');
  expect(text).toContain('npm ci --include=dev');
  expect(text).not.toContain('diff --git');
  expect(text).not.toContain(source.id);
  expect(observationWalkthrough([diff, source])).toHaveLength(1);
});

it('distinguishes a possible cause, an unfinished check, a failure and a passing test', () => {
  expect(
    narrateEvent(event('message', 'Kök neden: çağrı proxy üzerinden geçmiyor.'))?.confidence,
  ).toBe('Hypothesis');
  const unknown = narrateEvent(event('result', 'still running', { command: 'npm test' }));
  expect(unknown?.body).toContain('no final exit code');
  expect(unknown?.heading).not.toContain('geçti');
  expect(
    narrateEvent(event('result', 'FAIL rollback', { command: 'npm test', exitCode: 1 }))?.body,
  ).toContain('FAIL rollback');
  expect(
    narrateEvent(event('result', 'passed', { command: 'npm test', exitCode: 0 }))?.heading,
  ).toBe('This check passed');
  expect(
    narrateEvent(event('result', 'pushed', { command: 'git push', exitCode: 0 })),
  ).toBeUndefined();
});

it('surfaces grounded model explanations and immediately narrates newer activity', () => {
  const change = event('edit', '- this.persist(order)\n+ writer.persist(order)', {
    file: 'src/OrderService.java',
  });
  const lesson = offlineLesson('one', 'IMPLEMENTING', [change]);
  lesson.captureId = 'now';
  lesson.provider = 'model';
  lesson.walkthrough = [
    {
      heading: 'Bu değişiklik neden işe yarayabilir?',
      body: 'Çağrı artık başka bir bean üzerinden geçtiği için proxy işlem sınırını kurabilir.',
      evidence: [change.id],
      confidence: 'Hypothesis',
    },
  ];
  const text = renderStory(context([change], [lesson]));
  expect(text).toContain('proxy işlem sınırını kurabilir');
  expect(text).toContain('hypothesis');
  expect(text).not.toContain('What changed in the code?');
  const checking = event('command', 'npm test', { command: 'npm test' });
  const live = renderStory({ ...context([change, checking], [lesson]), busy: true });
  expect(live.indexOf('Now we check the behavior')).toBeGreaterThan(
    live.indexOf('proxy işlem sınırını'),
  );
  const stale = { ...lesson, captureId: 'previous' };
  expect(renderStory(context([change], [stale]))).not.toContain('proxy işlem sınırını');
});

it('does not show uncited model claims or terminal control sequences', () => {
  const e = event('source', 'source', { file: 'src/test.ts\x1b[31m' });
  const lesson = {
    ...offlineLesson('one', 'INVESTIGATING', [e]),
    provider: 'model',
    captureId: 'now',
    walkthrough: [
      {
        heading: 'Unsupported',
        body: 'invented cause',
        evidence: ['missing'],
        confidence: 'Confirmed' as const,
      },
    ],
  };
  const text = renderStory(context([e], [lesson]));
  expect(text).not.toContain('invented cause');
  expect(text).not.toContain('\x1b');
});
it('keeps earlier explanations and follow-up answers in one chronological story', () => {
  const source = event('source', 'const value = 1;', { file: 'example.ts' });
  const first = {
    ...offlineLesson('one', 'INVESTIGATING', [source]),
    id: 'first',
    captureId: 'now',
    provider: 'model',
    walkthrough: [
      {
        heading: 'Önce mevcut davranış',
        body: 'İlk açıklama burada kalır.',
        evidence: [source.id],
        confidence: 'Strongly supported' as const,
      },
    ],
  };
  const second = {
    ...first,
    id: 'second',
    walkthrough: [
      {
        ...first.walkthrough[0]!,
        heading: 'Sonra değişikliği anlayalım',
        body: 'Yeni açıklama alta eklenir.',
      },
    ],
  };
  const text = renderStory(context([source], [first, second]), {
    questions: [
      {
        id: 'q',
        lessonId: 'first',
        question: 'Peki neden?',
        answer: [
          {
            heading: 'Yanıt',
            body: 'Bu yüzden.',
            evidence: [source.id],
            confidence: 'Strongly supported',
          },
        ],
        created: '2026-01-01',
      },
    ],
  });
  expect(text.indexOf('İlk açıklama')).toBeLessThan(text.indexOf('Peki neden?'));
  expect(text.indexOf('Bu yüzden.')).toBeLessThan(text.indexOf('Yeni açıklama'));
  expect(text).not.toMatch(/\b(?:LIVE|WHY|CODE|VISUALIZE|ASK|REPORT)\b/);
});
it('puts a cited diagram beside the explanation and fits it to a narrow pane', () => {
  const source = event('source', 'writer.persist(order);', { file: 'Service.java' });
  const lesson = {
    ...offlineLesson('one', 'IMPLEMENTING', [source]),
    captureId: 'now',
    provider: 'model',
    walkthrough: [
      {
        heading: 'Çağrı akışı',
        body: 'Çağrı ayrı bir nesneye ulaşıyor.',
        evidence: [source.id],
        confidence: 'Strongly supported' as const,
      },
    ],
    diagram: [
      { from: 'Service', to: 'Writer', label: '\x1b[31mpersist(order)', evidence: [source.id] },
      { from: 'Invented', to: 'Database', label: 'unknown', evidence: ['missing'] },
    ],
  };
  const text = renderStory(context([source], [lesson]), { width: 28 });
  expect(text).toContain('Çağrı ayrı bir nesneye');
  expect(text).toContain('┌');
  expect(text).toContain('Service');
  expect(text).toContain('Writer');
  expect(text).not.toContain(source.id);
  expect(text).not.toContain('Invented');
  expect(text).not.toContain('\x1b');
  for (const line of text.split('\n').filter((line) => /^[┌│└]/.test(line)))
    expect(stringWidth(line)).toBeLessThanOrEqual(28);
  expect(renderStory(context([event('command', 'cat file.ts')]))).not.toContain('┌');
});
