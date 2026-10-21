import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from 'ink-testing-library';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { Academy } from '../src/core/academy.js';
import { conceptChoice, pendingConcept } from '../src/core/concepts.js';
import { offlineLesson, TeachingEngine } from '../src/core/teaching.js';
import type {
  AcademyEvent,
  ConceptChoice,
  ConceptKnowledge,
  Lesson,
  Question,
} from '../src/core/types.js';
import { generateReport } from '../src/core/report.js';
import { defaultConfig } from '../src/storage/config.js';
import { LessonStore } from '../src/storage/store.js';
import { AcademyTUI } from '../src/ui/app.js';
import { renderStory } from '../src/ui/story.js';
import { event, rollout, row, session, workspace } from './helpers.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const pause = () => new Promise((resolve) => setTimeout(resolve, 40));
const events = [
  event('task', 'Bu transaction hatasını düzelt.', { sessionId: 'one' }),
  event('source', '@Transactional\nvoid persist() { repository.save(order); }', {
    id: 'source',
    sessionId: 'one',
    file: 'OrderService.java',
  }),
];
function fixture(evidence: AcademyEvent[] = events): Lesson {
  const id = evidence.at(-1)!.id;
  return {
    ...offlineLesson('one', 'IMPLEMENTING', evidence, 'tr'),
    provider: 'fixture',
    captureId: 'now',
    conceptCheck: {
      key: 'spring.transaction',
      concept: 'Transaction',
      question:
        'Transaction kavramını biliyor musun? Bilmiyorsan kısaca anlatayım; sonra bu koda dönelim.',
      brief:
        'Transaction, bir grup veritabanı işlemini tek bir bütün olarak ele alır. Hata durumunda bu işlemler geri alınabilir.',
      connection:
        'Bu kodda @Transactional, persist çağrısının işlem sınırıyla ilişkili. Şimdi çağrının bu sınıra nasıl ulaştığına bakalım.',
      evidence: [id],
    },
    walkthrough: [
      {
        heading: 'Önce mevcut çağrıya bakalım',
        body: 'Ajan persist çağrısını inceliyor.',
        evidence: [id],
        confidence: 'Strongly supported',
      },
      {
        heading: 'Gerçek koda dönelim',
        body: 'CONTINUE_REAL_CODE: repository.save(order) çağrısını ve işlem sınırını birlikte inceleyelim.',
        evidence: [id],
        confidence: 'Strongly supported',
      },
    ],
  };
}
function story(lesson: Lesson, questions: Question[] = [], knowledge: ConceptKnowledge[] = []) {
  return renderStory(
    { learning: 'active', captureId: 'now', events, lessons: [lesson], busy: false, status: '' },
    { questions, knowledge },
  );
}
async function setup() {
  const { d, root, sessions } = await workspace();
  await rollout(sessions, root, 'one');
  const config = defaultConfig();
  config.onboarded = true;
  config.provider.kind = 'local';
  config.provider.model = 'fixture';
  const state = path.join(d, 'state');
  const store = new LessonStore(state);
  const academy = new Academy(root, sessions, state, config, store, {});
  await academy.tick();
  const lesson = fixture();
  store.ingest(academy.snapshot.selected!, events);
  store.saveLesson(academy.snapshot.selected!, lesson);
  Object.assign(academy.snapshot, {
    captureId: 'now',
    events: [...events],
    lessons: [lesson],
    learning: 'active',
  });
  vi.spyOn(academy, 'watch').mockImplementation(() => {});
  return {
    d,
    root,
    state,
    config,
    store,
    academy,
    lesson,
    close: async () => {
      await academy.stop();
      store.close();
    },
  };
}

it.each([
  ['spring.transaction', 'Transaction', '@Transactional void persist() {}'],
  ['angular.lifecycle', 'ngOnInit', '@Component({}) class App { ngOnInit() {} }'],
])('offers a contextual concept check across technologies: %s', async (key, concept, code) => {
  const evidence = [event('source', code!)];
  const reply = fixture(evidence);
  reply.conceptCheck!.key = key!;
  reply.conceptCheck!.concept = concept!;
  const explain = vi.fn().mockResolvedValue({ text: JSON.stringify(reply) });
  const lesson = await new TeachingEngine(defaultConfig(), { name: 'model', explain }).lesson(
    'one',
    'IMPLEMENTING',
    evidence,
  );
  expect(lesson.error).toBeUndefined();
  expect(lesson.conceptCheck?.key).toBe(key);
  expect(JSON.parse(explain.mock.calls[0]![1]).learner.canAskConcept).toBe(true);
  expect(explain.mock.calls[0]![0]).toContain('friendly offer, not an exam');
});

it('rejects a fabricated concept citation and removes terminal escapes from a valid prompt', async () => {
  const reply = fixture();
  reply.conceptCheck!.question = '\x1b[31m' + reply.conceptCheck!.question;
  const explain = vi.fn().mockResolvedValue({ text: JSON.stringify(reply) });
  const engine = new TeachingEngine(defaultConfig(), { name: 'model', explain });
  expect((await engine.lesson('one', 'IMPLEMENTING', events)).conceptCheck?.question).not.toContain(
    '\x1b',
  );
  reply.conceptCheck!.evidence = ['invented'];
  explain.mockResolvedValueOnce({ text: JSON.stringify(reply) });
  const rejected = await engine.lesson('one', 'IMPLEMENTING', events);
  expect(rejected.error).toContain('evidence');
  expect(rejected.conceptCheck).toBeUndefined();
});

it('does not ask another concept while one is pending or in the next two lessons', async () => {
  const first = fixture();
  const next = {
    ...fixture(),
    id: 'next',
    conceptCheck: { ...fixture().conceptCheck!, key: 'spring.proxy' },
  };
  const explain = vi.fn().mockResolvedValue({ text: JSON.stringify(next) });
  const engine = new TeachingEngine(defaultConfig(), { name: 'model', explain });
  const pending = await engine.lesson('one', 'IMPLEMENTING', events, [first]);
  expect(pending.conceptCheck).toBeUndefined();
  expect(JSON.parse(explain.mock.calls[0]![1]).learner.pendingConcept.key).toBe(
    'spring.transaction',
  );
  const recent = await engine.lesson('one', 'IMPLEMENTING', events, [first], undefined, 'tr', {
    knowledge: [{ key: 'spring.transaction', concept: 'Transaction', status: 'familiar' }],
    responses: [],
  });
  expect(recent.conceptCheck).toBeUndefined();
  expect(JSON.parse(explain.mock.calls[1]![1]).learner.canAskConcept).toBe(false);
});

it('passes project knowledge to the teacher and suppresses familiar or already explained concepts', async () => {
  const explain = vi.fn().mockResolvedValue({ text: JSON.stringify(fixture()) });
  const knowledge: ConceptKnowledge[] = [
    { key: 'spring.transaction', concept: 'Transaction', status: 'explained' },
  ];
  const lesson = await new TeachingEngine(defaultConfig(), { name: 'model', explain }).lesson(
    'one',
    'IMPLEMENTING',
    events,
    [],
    undefined,
    'tr',
    { knowledge, responses: [] },
  );
  expect(lesson.conceptCheck).toBeUndefined();
  expect(JSON.parse(explain.mock.calls[0]![1]).learner.knowledge).toEqual(knowledge);
});

it('asks before the deeper explanation and keeps the question visible after newer progress', () => {
  const lesson = fixture();
  const newer = {
    ...fixture(),
    id: 'newer',
    conceptCheck: undefined,
    walkthrough: [
      { ...fixture().walkthrough![0]!, body: 'NEW_PROGRESS: Ajan şimdi test çıktısını okuyor.' },
    ],
  };
  const text = renderStory({
    learning: 'active',
    captureId: 'now',
    events,
    lessons: [lesson, newer],
    busy: true,
    status: '',
  });
  expect(text).toContain('Ajan persist çağrısını inceliyor.');
  expect(text).not.toContain('CONTINUE_REAL_CODE');
  expect(text).not.toContain(lesson.conceptCheck!.brief);
  expect(text.indexOf('Transaction kavramını biliyor musun?')).toBeGreaterThan(
    text.indexOf('NEW_PROGRESS'),
  );
  for (const action of ['Explain briefly', 'I know this', 'Skip for now'])
    expect(text).toContain(action);
  expect(
    pendingConcept(
      [{ ...lesson, conceptCheck: { ...lesson.conceptCheck!, evidence: ['invented'] } }],
      [],
    ),
  ).toBeUndefined();
});

it.each(['1', '2', '3'])(
  'handles inline keyboard response %s and continues without another model call',
  async (key) => {
    const x = await setup();
    const transport = vi.fn();
    vi.stubGlobal('fetch', transport);
    const ui = render(
      <AcademyTUI
        academy={x.academy}
        configDir={path.join(x.d, 'config')}
        initialConfig={x.config}
      />,
    );
    try {
      await pause();
      expect(ui.lastFrame()).toContain('Transaction kavramını biliyor musun?');
      expect(ui.lastFrame()).not.toContain('CONTINUE_REAL_CODE');
      ui.stdin.write(key);
      await vi.waitFor(() => expect(x.academy.questions(x.lesson)).toHaveLength(1));
      await pause();
      expect(ui.lastFrame()).toContain('CONTINUE_REAL_CODE');
      const q = x.academy.questions(x.lesson)[0]!;
      expect(q.conceptResponse?.choice).toBe(
        ({ '1': 'explain', '2': 'familiar', '3': 'skip' } as const)[key as '1' | '2' | '3'],
      );
      const text = story(x.lesson, [q], x.academy.conceptKnowledge());
      expect(text.indexOf(q.question)).toBeLessThan(text.indexOf('CONTINUE_REAL_CODE'));
      if (key === '1') {
        expect(text.indexOf(x.lesson.conceptCheck!.brief)).toBeLessThan(
          text.indexOf(x.lesson.conceptCheck!.connection),
        );
        expect(text.indexOf(x.lesson.conceptCheck!.connection)).toBeLessThan(
          text.indexOf('CONTINUE_REAL_CODE'),
        );
      } else expect(text).not.toContain(x.lesson.conceptCheck!.brief);
      expect(transport).not.toHaveBeenCalled();
      expect(x.academy.snapshot.learning).toBe('active');
      ui.unmount();
    } finally {
      await x.close();
    }
  },
);

it('recognizes natural replies and keeps the input bound to its concept as new lessons arrive', async () => {
  const x = await setup();
  const transport = vi.fn();
  vi.stubGlobal('fetch', transport);
  const ask = vi.spyOn(x.academy, 'ask');
  const ui = render(
    <AcademyTUI
      academy={x.academy}
      configDir={path.join(x.d, 'config')}
      initialConfig={x.config}
    />,
  );
  try {
    await pause();
    ui.stdin.write('\r');
    await pause();
    expect(ui.lastFrame()).toContain('Type your reply');
    const newer = { ...fixture(), id: 'newer', conceptCheck: undefined };
    x.store.saveLesson(x.academy.snapshot.selected!, newer);
    x.academy.snapshot.lessons.push(newer);
    x.academy.emit('change', x.academy.snapshot);
    ui.stdin.write('bilmiyorum');
    await pause();
    ui.stdin.write('\r');
    await vi.waitFor(() => expect(x.academy.questions(x.lesson)).toHaveLength(1));
    expect(ask).toHaveBeenCalledWith(x.lesson, 'bilmiyorum');
    expect(x.academy.questions(newer)).toHaveLength(0);
    expect(x.academy.conceptKnowledge()[0]?.status).toBe('explained');
    expect(transport).not.toHaveBeenCalled();
    ui.unmount();
  } finally {
    await x.close();
  }
});

it('persists familiarity per project and rejects duplicate or stale responses', async () => {
  const x = await setup();
  try {
    await x.academy.respondToConcept(x.lesson, 'familiar');
    await expect(x.academy.respondToConcept(x.lesson, 'explain')).rejects.toThrow(
      'already been answered',
    );
    expect(x.academy.conceptKnowledge()).toEqual([
      { key: 'spring.transaction', concept: 'Transaction', status: 'familiar' },
    ]);
    expect(x.store.conceptKnowledge('/other/project')).toEqual([]);
    x.academy.snapshot.captureId = 'next';
    await expect(x.academy.respondToConcept(x.lesson, 'skip')).rejects.toThrow(
      'current session and capture',
    );
  } finally {
    await x.close();
  }
  const reopened = new LessonStore(x.state);
  try {
    expect(reopened.conceptKnowledge(x.root)[0]?.status).toBe('familiar');
  } finally {
    reopened.close();
  }
});

it('skips only for this capture and allows a local response while a progress model is busy', async () => {
  const x = await setup();
  try {
    x.academy.snapshot.busy = true;
    const q = await x.academy.respondToConcept(x.lesson, 'skip');
    expect(x.academy.snapshot.busy).toBe(true);
    expect(x.academy.conceptKnowledge()).toEqual([]);
    expect(pendingConcept([x.lesson], [q])).toBeUndefined();
    const next = { ...x.lesson, id: 'next', captureId: 'next' };
    expect(pendingConcept([next], [q])?.id).toBe('next');
    expect(story(x.lesson, [q])).toContain('CONTINUE_REAL_CODE');
  } finally {
    await x.close();
  }
});

it('uses a custom learner question as the response and records its answer inline', async () => {
  const x = await setup();
  vi.spyOn(TeachingEngine.prototype, 'ask').mockResolvedValue({
    id: 'custom',
    lessonId: x.lesson.id,
    question: 'Burada neden geri alma gerekir?',
    created: new Date().toISOString(),
    answer: [
      {
        heading: 'Yanıt',
        body: 'CUSTOM_ANSWER: Bu hata yolunda kısmi kaydı önlemek için.',
        evidence: ['source'],
        confidence: 'Hypothesis',
      },
    ],
  });
  try {
    const q = await x.academy.ask(x.lesson, 'Burada neden geri alma gerekir?');
    expect(q.conceptResponse?.choice).toBe('explain');
    expect(story(x.lesson, [q], x.academy.conceptKnowledge())).toContain('CUSTOM_ANSWER');
    const report = generateReport(session(x.root, 'one'), events, [x.lesson], [q]);
    expect(report).toContain('Concept check · Transaction');
    expect(report).toContain('Burada neden geri alma gerekir?');
    expect(report).toContain('CUSTOM_ANSWER');
  } finally {
    await x.close();
  }
});

it('continues observing and completes the task while an optional concept question is unanswered', async () => {
  const { d, root, sessions } = await workspace();
  const file = await rollout(
    sessions,
    root,
    'one',
    row('event_msg', { type: 'user_message', message: events[0]!.text }),
  );
  const config = defaultConfig();
  config.provider.kind = 'local';
  config.provider.model = 'fixture';
  const transport = vi.fn(async (_url: string, request: RequestInit) => {
    const context = JSON.parse(JSON.parse(String(request.body)).messages[1].content);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { content: JSON.stringify(fixture(context.evidence)) },
            finish_reason: 'stop',
          },
        ],
      }),
    );
  });
  vi.stubGlobal('fetch', transport);
  const store = new LessonStore(path.join(d, 'state'));
  const academy = new Academy(root, sessions, path.join(d, 'state'), config, store, {});
  try {
    await academy.beginLearning();
    await academy.settle();
    expect(academy.pendingConceptCheck()).toBeDefined();
    await appendFile(
      file,
      row('event_msg', { type: 'agent_message', message: 'Kontrol tamamlandı.' }) +
        row('event_msg', { type: 'task_complete' }),
    );
    await academy.tick();
    await academy.settle();
    expect(academy.snapshot.events.some((e) => e.kind === 'completed')).toBe(true);
    expect(academy.snapshot.learning).toBe('paused');
    expect(academy.snapshot.report).toBeDefined();
    expect(academy.pendingConceptCheck()).toBeDefined();
    expect(transport).toHaveBeenCalledTimes(2);
    const target = academy.pendingConceptCheck()!;
    await academy.respondToConcept(target, 'explain');
    expect(academy.pendingConceptCheck()).toBeUndefined();
    expect(academy.snapshot.learning).toBe('paused');
    expect(academy.report()).toContain(target.conceptCheck!.brief);
    expect(transport).toHaveBeenCalledTimes(2);
  } finally {
    await academy.stop();
    store.close();
  }
});

it.each([
  ['BİLMİYORUM', 'explain'],
  ['I don’t know', 'explain'],
  ['kısaca anlat', 'explain'],
  ['biliyorum', 'familiar'],
  ['I know this', 'familiar'],
  ['şimdilik geç', 'skip'],
] as [string, ConceptChoice][])('understands the natural response %s', (text, expected) => {
  expect(conceptChoice(text)).toBe(expected);
});
