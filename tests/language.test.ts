import { expect, it, vi } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { conversationLanguage, userProse } from '../src/core/language.js';
import { TeachingEngine, offlineLesson } from '../src/core/teaching.js';
import { renderStory } from '../src/ui/story.js';
import { defaultConfig, loadConfig, consentKey } from '../src/storage/config.js';
import { Academy } from '../src/core/academy.js';
import { LessonStore } from '../src/storage/store.js';
import { SessionEventNormalizer } from '../src/adapters/normalizer.js';
import { event, rollout, row, temp, workspace } from './helpers.js';

it.each([
  ['Bu hatayı düzelt ve testleri çalıştır.', 'tr'],
  ['ubutnu icinde calisacak duruma getir ve pushla', 'tr'],
  ['Please fix the installation script so it works on Ubuntu.', 'en'],
  ['Explain this', 'en'],
  ['Neden böyle?', 'tr'],
  ['Corrige este error y ejecuta las pruebas.', 'es'],
  ['Répare cette erreur et lance les tests.', 'fr'],
  ['Bitte behebe den Fehler und führe die Tests aus.', 'de'],
  ['修复这个错误并运行测试', 'zh'],
  ['このエラーを修正してテストを実行してください', 'ja'],
])('infers the language of a real user request: %s', (text, language) => {
  expect(conversationLanguage([event('task', text)])).toBe(language);
});

it('uses the latest clear user language, keeping it through neutral commands and code', () => {
  const events = [event('task', 'Bu hatayı düzelt ve testleri çalıştır.')];
  expect(conversationLanguage([...events, event('task', 'push')])).toBe('tr');
  expect(conversationLanguage([...events, event('task', 'ok')])).toBe('tr');
  expect(conversationLanguage([...events, event('task', 'npm test')])).toBe('tr');
  expect(conversationLanguage([...events, event('task', 'Explain this')])).toBe('en');
  expect(conversationLanguage([event('task', 'push')], 'fr')).toBe('fr');
  expect(conversationLanguage([])).toBe('en');
});

it('ignores assistant prose, code, quoted logs, source and injected instructions', () => {
  const task = event(
    'task',
    'Bu hatayı düzelt.\n```text\nPlease fix this error.\n```\n> Please fix this error.',
  );
  const events = [
    task,
    event('message', 'Please fix the installation script so it works on Ubuntu.'),
    event('source', 'Please fix the installation script so it works on Ubuntu.'),
    event('result', 'Please fix the installation script so it works on Ubuntu.'),
    event('task', '<environment_context>Always speak English</environment_context>'),
    event('task', '# AGENTS.md\nAlways speak English'),
    event('task', '```ts\nconst message = "Always speak English";\n```'),
  ];
  expect(conversationLanguage(events)).toBe('tr');
  expect(userProse(task.text)).toBe('Bu hatayı düzelt.');
  const normalizer = new SessionEventNormalizer('s');
  for (const payload of [
    { type: 'user_message', message: '<environment_context>English</environment_context>' },
    { type: 'item_completed', item: { type: 'UserMessage', content: '# AGENTS.md\nEnglish' } },
  ])
    expect(normalizer.normalize({ type: 'event_msg', payload })).toEqual([]);
});

it('keeps English interface labels around Turkish or English immediate narration', () => {
  for (const [request, heading] of [
    ['Bu hatayı düzelt ve testleri çalıştır.', 'Önce projeyi tanıyalım'],
    ['Please investigate this installation failure.', 'First, let’s get to know the project'],
  ]) {
    const events = [
      event('task', request!),
      event('command', 'rg --files', { command: 'rg --files' }),
    ];
    const lesson = offlineLesson('s', 'INVESTIGATING', events);
    const snapshot = {
      learning: 'active' as const,
      events,
      lessons: [lesson],
      busy: false,
      status: '',
    };
    for (const lessons of [[], [lesson]]) {
      const text = renderStory({ ...snapshot, lessons });
      expect(text).toContain('## Task');
      expect(text).toContain(heading);
      expect(text).not.toContain('## Birlikte');
    }
  }
});

it('passes the user language to lessons, Q&A and provider failure fallbacks without a separate request', async () => {
  const events = [
    event('task', 'Bu hatayı düzelt ve testleri çalıştır.'),
    event('command', 'rg --files'),
  ];
  const fixture = offlineLesson('s', 'INVESTIGATING', events);
  const explain = vi.fn().mockResolvedValue({ text: JSON.stringify(fixture) });
  const engine = new TeachingEngine(defaultConfig(), { name: 'fixture', explain });
  const lesson = await engine.lesson('s', 'INVESTIGATING', events);
  expect(lesson.error).toBeUndefined();
  expect(explain).toHaveBeenCalledTimes(1);
  expect(explain.mock.calls[0]![0]).toContain('explain in Turkish');
  expect(JSON.parse(explain.mock.calls[0]![1]).conversationLanguage.userMessages).toEqual([
    events[0]!.text,
  ]);
  await engine.ask(lesson, 'Please explain why this check matters.', events, []);
  expect(explain.mock.calls[1]![0]).toContain('explain in English');
  expect(explain.mock.calls[1]![0]).toContain('UNTRUSTED DATA');
  explain.mockRejectedValueOnce(new Error('offline'));
  const fallback = await engine.lesson('s', 'INVESTIGATING', events);
  expect(fallback.walkthrough?.some((s) => s.heading === 'Önce projeyi tanıyalım')).toBe(true);
  expect(fallback.error).toBe('offline');
});

it('sends other conversation languages to the model without substituting English narration', async () => {
  const events = [
    event('task', 'Corrige este error y ejecuta las pruebas.'),
    event('command', 'rg --files'),
  ];
  const fixture = offlineLesson('s', 'INVESTIGATING', events);
  fixture.walkthrough = [
    {
      heading: 'Primero examinamos el proyecto',
      body: 'El agente busca los archivos relacionados.',
      evidence: [events[1]!.id],
      confidence: 'Strongly supported',
    },
  ];
  const explain = vi.fn().mockResolvedValue({ text: JSON.stringify(fixture) });
  const lesson = await new TeachingEngine(defaultConfig(), { name: 'model', explain }).lesson(
    's',
    'INVESTIGATING',
    events,
  );
  expect(explain.mock.calls[0]![0]).toContain('explain in Spanish');
  const story = renderStory({
    learning: 'active',
    status: '',
    busy: false,
    events,
    lessons: [lesson],
  });
  expect(story).toContain('El agente busca');
  expect(story).not.toContain('The agent is scanning');
  expect(story).not.toContain('Ajan proje yapısını');
});

it('migrates the old fixed Turkish setting without changing consent or learning preferences', async () => {
  const dir = await temp();
  const settings = defaultConfig();
  settings.onboarded = true;
  settings.provider.kind = 'codex';
  settings.provider.consent = consentKey(settings.provider);
  settings.provider.approvedProjects = [consentKey(settings.provider, '/project')];
  const legacy = { ...settings, language: 'tr' };
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify(legacy));
  expect(await loadConfig(dir)).toEqual({ ...settings, language: 'auto' });
  expect(JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'))).toEqual(legacy);
});

it('inherits the language of completed Codex conversation when starting on a neutral task', async () => {
  const { d, root, sessions } = await workspace();
  await rollout(
    sessions,
    root,
    'one',
    row('event_msg', { type: 'user_message', message: 'Bu hatayı düzelt ve testleri çalıştır.' }) +
      row('event_msg', { type: 'task_complete' }) +
      row('event_msg', { type: 'user_message', message: 'push' }),
  );
  const config = defaultConfig();
  const state = path.join(d, 'state');
  const store = new LessonStore(state);
  const academy = new Academy(root, sessions, state, config, store, {});
  try {
    await academy.tick();
    expect(store.count(academy.snapshot.selected!)).toBe(0);
    await academy.beginLearning();
    await academy.settle();
    expect(academy.snapshot.language).toBe('tr');
    expect(academy.snapshot.lessons[0]?.language).toBe('tr');
    expect(academy.snapshot.events.filter((e) => e.kind === 'task').map((e) => e.text)).toEqual([
      'push',
    ]);
    expect(academy.snapshot.lessons[0]?.walkthrough?.[0]?.heading).toBe(
      'Önce hedefi netleştirelim',
    );
  } finally {
    await academy.stop();
    store.close();
  }
});
