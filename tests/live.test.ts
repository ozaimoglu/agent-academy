import { expect, it } from 'vitest';
import { narrateEvent, observationWalkthrough, renderLiveNarration } from '../src/core/live.js';
import { offlineLesson } from '../src/core/teaching.js';
import { event, session } from './helpers.js';
import type { AcademyEvent, Lesson } from '../src/core/types.js';

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
  const text = renderLiveNarration({ ...context([e]), busy: true });
  expect(text).toContain('Önce projeyi tanıyalım');
  expect(text).toContain('hangi parçaların birbiriyle ilişkili');
  expect(text).toContain('açıklamayı hazırlıyorum');
  for (const raw of ['raw-evidence-hash', 'COMMAND', '0 ders', '/home/person'])
    expect(text).not.toContain(raw);
  const waiting = renderLiveNarration(context());
  expect(waiting).toContain('Henüz bir inceleme veya hata bulgusu gözlenmedi');
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
  const text = renderLiveNarration(context([diff, source]), true);
  expect(text).toContain('Kodda ne değişti?');
  expect(text).toContain('Önce: npm ci');
  expect(text).toContain('Şimdi: npm ci --include=dev');
  expect(text).not.toContain('diff --git');
  expect(text).not.toContain(source.id);
  expect(observationWalkthrough([diff, source])).toHaveLength(1);
});

it('distinguishes a possible cause, an unfinished check, a failure and a passing test', () => {
  expect(
    narrateEvent(event('message', 'Kök neden: çağrı proxy üzerinden geçmiyor.'))?.confidence,
  ).toBe('Hypothesis');
  const unknown = narrateEvent(event('result', 'still running', { command: 'npm test' }));
  expect(unknown?.body).toContain('çıkış kodu yok');
  expect(unknown?.heading).not.toContain('geçti');
  expect(
    narrateEvent(event('result', 'FAIL rollback', { command: 'npm test', exitCode: 1 }))?.body,
  ).toContain('FAIL rollback');
  expect(
    narrateEvent(event('result', 'passed', { command: 'npm test', exitCode: 0 }))?.heading,
  ).toBe('Bu kontrol geçti');
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
  const text = renderLiveNarration(context([change], [lesson]));
  expect(text).toContain('proxy işlem sınırını kurabilir');
  expect(text).toContain('henüz bir ihtimal');
  expect(text).not.toContain('Kodda ne değişti?');
  const checking = event('command', 'npm test', { command: 'npm test' });
  const live = renderLiveNarration({ ...context([change, checking], [lesson]), busy: true });
  expect(live.indexOf('Şimdi davranışı kontrol ediyoruz')).toBeLessThan(
    live.indexOf('proxy işlem sınırını'),
  );
  const stale = { ...lesson, captureId: 'previous' };
  expect(renderLiveNarration(context([change], [stale]))).not.toContain('proxy işlem sınırını');
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
  const text = renderLiveNarration(context([e], [lesson]));
  expect(text).not.toContain('invented cause');
  expect(text).not.toContain('\x1b');
});
