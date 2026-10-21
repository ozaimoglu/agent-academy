import { it, expect, vi } from 'vitest';
import type { LLMProvider } from '../src/core/types.js';
import { EngineeringMilestoneDetector, isTestCommand } from '../src/core/milestones.js';
import { headings, offlineLesson, TeachingEngine, selectEvidence } from '../src/core/teaching.js';
import { defaultConfig } from '../src/storage/config.js';
import { generateReport } from '../src/core/report.js';
import { event, session } from './helpers.js';

it('classifies milestones without claiming a successful push is validation', () => {
  const d = new EngineeringMilestoneDetector();
  expect(d.observe(event('task', 'fix'))).toBe('INVESTIGATING');
  expect(d.observe(event('message', 'Hipotez: olabilir'))).toBe('HYPOTHESIS');
  expect(d.observe(event('message', 'Kök neden gözlemi: proxy'))).toBe('ROOT_CAUSE_IDENTIFIED');
  expect(d.observe(event('edit', 'patch'))).toBe('IMPLEMENTING');
  expect(
    d.observe(event('result', 'pass', { command: './mvnw -Dtest=OrderTest test', exitCode: 0 })),
  ).toBe('VALIDATING');
  expect(
    d.observe(event('result', 'pushed', { command: 'git push', exitCode: 0 })),
  ).toBeUndefined();
  expect(d.observe(event('completed', 'done'))).toBe('COMPLETED');
  expect(d.observe(event('task', 'next task'))).toBe('INVESTIGATING');
  expect(isTestCommand('npm test')).toBe(true);
});
it('keeps evidence selection bounded and retains the original task', () => {
  const events = [
    event('task', 'original'),
    ...Array.from({ length: 1000 }, (_, i) =>
      event('result', 'x'.repeat(8000), { id: String(i), command: 'npm test' }),
    ),
  ];
  const selected = selectEvidence(events, 12000);
  expect(selected[0]?.kind).toBe('task');
  expect(JSON.stringify(selected).length).toBeLessThan(12500);
  expect(selected.length).toBeLessThan(10);
});
it('offline lessons preserve uncertainty and actual failure results', () => {
  const events = [
    event('task', 'fix'),
    event('message', 'Kök neden: this invocation'),
    event('result', 'FAIL', { command: 'npm test', exitCode: 1 }),
  ];
  const lesson = offlineLesson('s', 'VALIDATING', events);
  expect(lesson.sections).toHaveLength(11);
  expect(lesson.sections.find((s) => s.heading === 'Root cause')?.confidence).toBe('Hypothesis');
  expect(lesson.sections.find((s) => s.heading === 'How do we verify it?')?.body).toContain(
    'Exit: 1',
  );
  expect(lesson.provider).toBe('offline');
});
function modelReply(id: string) {
  return JSON.stringify({
    title: 'Proxy çağrı sınırı',
    concepts: ['Spring AOP'],
    walkthrough: [
      {
        heading: 'Bu satır neden önemli?',
        body: 'Gerçek kodu davranışla ilişkilendiriyoruz.',
        evidence: [id],
        confidence: 'Confirmed',
      },
    ],
    sections: headings.map((heading) => ({
      heading,
      body: 'Gerçek proje gözlemi ve temel mekanizma.',
      evidence: [id],
      confidence: 'Confirmed',
    })),
    diagram: [{ from: 'service', to: 'writer', label: 'invoke', evidence: [id] }],
  });
}
it('validates citations, downgrades generated certainty and supplies real code for Q&A', async () => {
  const e = event('source', '12 │ writer.persist(order);');
  const explain = vi.fn().mockResolvedValue({
    text: modelReply(e.id),
    usage: { input: 100, output: 200, estimated: false },
  });
  const engine = new TeachingEngine(defaultConfig(), { name: 'mock', explain });
  const lesson = await engine.lesson('s', 'COMPLETED', [e]);
  expect(lesson.error).toBeUndefined();
  expect(lesson.sections[0]?.confidence).toBe('Strongly supported');
  expect(lesson.walkthrough?.[0]?.confidence).toBe('Strongly supported');
  expect(lesson.walkthrough?.[0]?.evidence).toEqual([e.id]);
  expect(lesson.usage?.input).toBe(100);
  const q = await engine.ask(lesson, 'Neden proxy?', [e], []);
  expect(q.answer[0]?.evidence).toContain(e.id);
  expect(explain.mock.calls[1]?.[1]).toContain('writer.persist');
  expect(explain.mock.calls[0]?.[0]).toContain('UNTRUSTED');
  expect(explain.mock.calls[0]?.[0]).toContain('no paragraph limit');
  expect(explain.mock.calls[0]?.[0]).toContain('walkthrough');
});
it('rejects fabricated evidence and falls back honestly on failed or missing providers', async () => {
  const e = event('task', 'fix');
  const fabricated = new TeachingEngine(defaultConfig(), {
    name: 'bad',
    explain: async () => ({ text: modelReply('invented-id') }),
  });
  expect((await fabricated.lesson('s', 'INVESTIGATING', [e])).error).toContain('evidence');
  const inventedWalkthrough = JSON.parse(modelReply(e.id));
  inventedWalkthrough.walkthrough[0].evidence = ['invented-id'];
  const invalidLive = new TeachingEngine(defaultConfig(), {
    name: 'bad-live',
    explain: async () => ({ text: JSON.stringify(inventedWalkthrough) }),
  });
  expect((await invalidLive.lesson('s', 'INVESTIGATING', [e])).error).toContain('evidence');
  const failed: LLMProvider = {
    name: 'failed',
    explain: async () => {
      throw new Error('unavailable');
    },
  };
  expect(
    (await new TeachingEngine(defaultConfig(), failed).lesson('s', 'INVESTIGATING', [e])).error,
  ).toBe('unavailable');
  await expect(
    new TeachingEngine(defaultConfig()).ask(
      offlineLesson('s', 'INVESTIGATING', [e]),
      'why',
      [e],
      [],
    ),
  ).rejects.toThrow('model');
});
it('exports a comprehensive Markdown debrief with observed tests, assumptions and evidence', () => {
  const events = [
    event('task', 'Rollback'),
    event('result', 'actual failure', { command: 'npm test', exitCode: 1 }),
    event('diff', '- old\n+ new', { file: 'src/A.java' }),
  ];
  const report = generateReport(session(), events, [
    offlineLesson('session-1', 'COMPLETED', events),
  ]);
  for (const expected of [
    'Rollback',
    'Exit code: 1',
    'actual failure',
    'Tradeoffs',
    'Unverified',
    'src/A.java',
    events[1]!.id,
  ])
    expect(report).toContain(expected);
  expect(report).not.toContain('BUILD SUCCESS');
});
