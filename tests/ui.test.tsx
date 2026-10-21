import React from 'react';
import { afterEach, it, expect, vi } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import { OnboardingWizard } from '../src/ui/onboarding.js';
import { defaultConfig, consentKey } from '../src/storage/config.js';
import { renderDiagram } from '../src/ui/diagrams.js';
import { workspace, rollout, row, event } from './helpers.js';
import path from 'node:path';
const pause = () => new Promise((r) => setTimeout(r, 40));
afterEach(cleanup);
it('completes four onboarding screens with deep/default preferences in seconds', async () => {
  const save = vi.fn(async () => {});
  const ui = render(<OnboardingWizard initial={defaultConfig()} onSave={save} />);
  await pause();
  expect(ui.lastFrame()).toContain('Ne kadar derin');
  expect(ui.lastFrame()).toContain('◉ Derinlemesine');
  ui.stdin.write('\r');
  await pause();
  expect(ui.lastFrame()).toContain('nasıl öğrenmeyi');
  ui.stdin.write('\r');
  await pause();
  expect(ui.lastFrame()).toContain('neye odaklanalım');
  ui.stdin.write('\r');
  await pause();
  expect(ui.lastFrame()).toContain('hangi model');
  ui.stdin.write('\r');
  await pause();
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0]?.[0]).toMatchObject({
    depth: 'deep',
    onboarded: true,
    provider: { kind: 'offline' },
  });
});
it('supports keyboard multi-select and back navigation without losing preferences', async () => {
  const save = vi.fn(async () => {});
  const ui = render(<OnboardingWizard initial={defaultConfig()} onSave={save} />);
  await pause();
  ui.stdin.write('\r');
  await pause();
  ui.stdin.write(' ');
  await pause();
  expect(ui.lastFrame()).toContain('□ Görsel');
  ui.stdin.write('\x1b');
  await pause();
  expect(ui.lastFrame()).toContain('Ne kadar derin');
  ui.stdin.write('\r');
  await pause();
  expect(ui.lastFrame()).toContain('□ Görsel');
});
it('collects generic learning priorities without asking for a language or framework', async () => {
  const save = vi.fn(async () => {});
  const ui = render(<OnboardingWizard initial={defaultConfig()} settings onSave={save} />);
  await pause();
  ui.stdin.write('3');
  await pause();
  expect(ui.lastFrame()).toContain('Temel kavramlar');
  expect(ui.lastFrame()).toContain('Projedeki tüm konular');
  for (const technology of ['Java', 'Spring', 'TypeScript', 'Frontend'])
    expect(ui.lastFrame()).not.toContain(technology);
  ui.stdin.write('\x1b[B');
  await pause();
  ui.stdin.write(' ');
  await pause();
  ui.stdin.write('4');
  await pause();
  ui.stdin.write('\r');
  await pause();
  expect(save.mock.calls[0]?.[0]?.priorities).toEqual(['fundamentals']);
});
it('requires an explicit remote data-sharing confirmation inside the product', async () => {
  const config = defaultConfig();
  config.onboarded = true;
  config.provider = {
    ...config.provider,
    kind: 'remote',
    baseUrl: 'https://example.com/v1',
    model: 'test-model',
  };
  const save = vi.fn(async () => {});
  const ui = render(<OnboardingWizard initial={config} settings onSave={save} />);
  await pause();
  ui.stdin.write('4');
  await pause();
  ui.stdin.write('\r');
  await pause();
  expect(ui.lastFrame()).toContain('Dış servise veri gönderme izni');
  expect(save).not.toHaveBeenCalled();
  ui.stdin.write('o');
  await pause();
  expect(save).toHaveBeenCalledTimes(1);
});
it('renders narrow diagrams from actual cited edges', () => {
  const result = renderDiagram(
    [
      {
        from: 'OrderService',
        to: 'OrderWriter transaction boundary',
        label: 'persist(order)',
        evidence: ['verified-id'],
      },
    ],
    28,
  );
  expect(result).toContain('verified-id');
  expect(result).toContain('▼');
  expect(result).toContain('OrderService');
  for (const line of result.split('\n').filter((l) => l.startsWith('│')))
    expect(line.length).toBeLessThanOrEqual(28);
});
it('selects existing Codex quota without an API key and obtains explicit project consent', async () => {
  const config = defaultConfig();
  const save = vi.fn(async () => {});
  const ui = render(
    <OnboardingWizard
      initial={config}
      settings
      project="/project"
      width={38}
      height={24}
      onSave={save}
    />,
  );
  await pause();
  ui.stdin.write('4');
  await pause();
  ui.stdin.write('\x1b[A'); // The last provider is Codex; wrap from the first option.
  await pause();
  ui.stdin.write(' ');
  await pause();
  expect(ui.lastFrame()).toContain('ortak Codex kotası');
  ui.stdin.write('a');
  await pause();
  expect(ui.lastFrame()).not.toContain('API adresi');
  expect(ui.lastFrame()).not.toContain('Anahtar ortam');
  expect((ui.lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(24);
  ui.stdin.write('\x1b');
  await pause();
  ui.stdin.write('\r');
  await pause();
  expect(ui.lastFrame()).toContain('Aynı Codex kotası');
  expect((ui.lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(24);
  expect(save).not.toHaveBeenCalled();
  ui.stdin.write('o');
  await pause();
  const saved = save.mock.calls[0]?.[0];
  expect(saved?.provider.kind).toBe('codex');
  expect(saved?.provider.model).toBe('');
  expect(saved?.provider.approvedProjects).toContain(consentKey(saved!.provider, '/project'));
});
it('keeps narrow onboarding readable inside a 38-column pane', async () => {
  const ui = render(
    <OnboardingWizard initial={defaultConfig()} width={38} height={24} onSave={async () => {}} />,
  );
  await pause();
  const frame = ui.lastFrame() ?? '';
  expect(frame).toContain('Derinlemesine');
  expect(frame.split('\n').length).toBeLessThanOrEqual(24);
});
it('fits all onboarding screens and advanced fields in a narrow pane', async () => {
  const config = defaultConfig();
  config.onboarded = true;
  const ui = render(
    <OnboardingWizard initial={config} settings width={38} height={24} onSave={async () => {}} />,
  );
  await pause();
  for (const step of ['1', '2', '3', '4']) {
    ui.stdin.write(step);
    await pause();
    expect((ui.lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(24);
  }
  ui.stdin.write('a');
  await pause();
  expect((ui.lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(24);
});
it('keeps one narrative surface throughout the deterministic teaching pipeline', async () => {
  const { AcademyTUI } = await import('../src/ui/app.js');
  const { Academy } = await import('../src/core/academy.js');
  const { LessonStore } = await import('../src/storage/store.js');
  const { prepareDemo } = await import('../src/demo.js');
  const { canonical } = await import('../src/core/privacy.js');
  const { rm } = await import('node:fs/promises');
  const demo = await prepareDemo();
  const config = defaultConfig();
  config.onboarded = true;
  const store = new LessonStore(demo.state);
  const academy = new Academy(
    await canonical(demo.project),
    demo.sessions,
    demo.state,
    config,
    store,
    {},
  );
  const ui = render(
    <AcademyTUI academy={academy} configDir={demo.config} initialConfig={config} demo />,
  );
  try {
    await pause();
    expect(ui.lastFrame()).toContain('BEKLEMEDE');
    expect(academy.snapshot.lessons).toHaveLength(0);
    ui.stdin.write('b');
    await vi.waitFor(() => expect(academy.snapshot.lessons.length).toBe(1));
    await pause();
    expect(ui.lastFrame()).toContain('Tur tamamlandı');
    const frame = ui.lastFrame();
    for (const key of ['1', '2', '3', '4', '5', '6', '\t', '\x1b[C']) {
      ui.stdin.write(key);
      await pause();
      expect(ui.lastFrame()).toBe(frame);
    }
    for (const tab of ['LIVE', 'WHY', 'CODE', 'VISUALIZE', 'ASK', 'REPORT'])
      expect(ui.lastFrame()).not.toContain(tab);
    ui.stdin.write('s');
    await pause();
    expect(ui.lastFrame()).toContain('Ne kadar derin');
  } finally {
    ui.unmount();
    await academy.stop();
    store.close();
    await rm(demo.base, { recursive: true, force: true });
  }
});
it('offers keyboard Start, Stop and panel Close without starting automatically', async () => {
  const { AcademyTUI } = await import('../src/ui/app.js');
  const { Academy } = await import('../src/core/academy.js');
  const { LessonStore } = await import('../src/storage/store.js');
  const { d, root, sessions } = await workspace();
  await rollout(sessions, root, 'one', row('event_msg', { type: 'task_complete' }));
  const config = defaultConfig();
  config.onboarded = true;
  const store = new LessonStore(path.join(d, 'state'));
  const academy = new Academy(root, sessions, path.join(d, 'state'), config, store, {});
  const close = vi.fn(async () => {});
  const ui = render(
    <AcademyTUI
      academy={academy}
      configDir={path.join(d, 'config')}
      initialConfig={config}
      onClosePanel={close}
    />,
  );
  try {
    await pause();
    expect(ui.lastFrame()).toContain('[B Başlat]');
    expect(academy.snapshot.lessons).toHaveLength(0);
    ui.stdin.write('B');
    await vi.waitFor(() => expect(academy.snapshot.learning).toBe('active'));
    await pause();
    expect(ui.lastFrame()).toContain('[D Durdur]');
    ui.stdin.write('D');
    await pause();
    expect(academy.snapshot.learning).toBe('paused');
    ui.stdin.write('Q');
    await pause();
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    ui.unmount();
    await academy.stop();
    store.close();
  }
});
it('keeps the actual code comparison inside the single narration', async () => {
  const { AcademyTUI } = await import('../src/ui/app.js');
  const { Academy } = await import('../src/core/academy.js');
  const { LessonStore } = await import('../src/storage/store.js');
  const { GitChangeTracker } = await import('../src/core/git.js');
  const { d, root, sessions } = await workspace();
  await rollout(sessions, root, 'one', row('event_msg', { type: 'task_complete' }));
  const diff = event(
    'diff',
    'diff --git a/install.sh b/install.sh\n-npm ci\n+npm ci --include=dev',
    { file: 'install.sh', origin: 'git' },
  );
  const git = vi
    .spyOn(GitChangeTracker.prototype, 'collect')
    .mockImplementation(async (session) => ({ session, events: [diff] }));
  const config = defaultConfig();
  config.onboarded = true;
  config.provider.autoAnalyze = false;
  const store = new LessonStore(path.join(d, 'state'));
  const academy = new Academy(root, sessions, path.join(d, 'state'), config, store, {});
  const ui = render(
    <AcademyTUI academy={academy} configDir={path.join(d, 'config')} initialConfig={config} />,
  );
  try {
    await pause();
    ui.stdin.write('b');
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('--include=dev'));
    expect(academy.snapshot.lessons).toHaveLength(0);
    ui.stdin.write('\r');
    await vi.waitFor(() => expect(academy.snapshot.lessons).toHaveLength(1));
    await pause();
    expect(ui.lastFrame()).toContain('npm ci --include=dev');
    expect(ui.lastFrame()).not.toContain('0 ders');
    expect(ui.lastFrame()).not.toContain(diff.id);
    expect(ui.lastFrame()).not.toContain('diff --git');
    ui.stdin.write('3');
    await pause();
    expect(ui.lastFrame()).not.toContain('diff --git');
    expect(ui.lastFrame()).toContain('--include=dev');
  } finally {
    ui.unmount();
    await academy.stop();
    store.close();
    git.mockRestore();
  }
});
it('keeps a reader in history as new activity arrives and resumes following with End', async () => {
  const { AcademyTUI } = await import('../src/ui/app.js');
  const { Academy } = await import('../src/core/academy.js');
  const { LessonStore } = await import('../src/storage/store.js');
  const { d, root, sessions } = await workspace();
  const config = defaultConfig();
  config.onboarded = true;
  const store = new LessonStore(path.join(d, 'state'));
  const academy = new Academy(root, sessions, path.join(d, 'state'), config, store, {});
  const watch = vi.spyOn(academy, 'watch').mockImplementation(() => {});
  academy.snapshot.learning = 'active';
  academy.snapshot.events = [
    event('task', 'Başlangıç hedefi'),
    ...Array.from({ length: 8 }, (_, i) =>
      event('message', `Adım ${i}: ` + 'Bu bağlantıyı birlikte açıklıyoruz. '.repeat(15), {
        id: `step-${i}`,
      }),
    ),
  ];
  const ui = render(
    <AcademyTUI academy={academy} configDir={path.join(d, 'config')} initialConfig={config} />,
  );
  try {
    await pause();
    ui.stdin.write('\x1b[H');
    await pause();
    expect(ui.lastFrame()).toContain('Başlangıç hedefi');
    academy.snapshot.events.push(event('message', 'NEW_LAST_STEP: Şimdi yeni bir bulgu geldi.'));
    academy.emit('change', academy.snapshot);
    await pause();
    expect(ui.lastFrame()).toContain('Başlangıç hedefi');
    expect(ui.lastFrame()).not.toContain('NEW_LAST_STEP');
    ui.stdin.write('\x1b[F');
    await pause();
    expect(ui.lastFrame()).toContain('NEW_LAST_STEP');
    expect(ui.lastFrame()).toContain('Yeni açıklamalar burada devam eder.');
  } finally {
    ui.unmount();
    await academy.stop();
    store.close();
    watch.mockRestore();
  }
});
it('accepts a question and displays its answer in the same narrative', async () => {
  const { AcademyTUI } = await import('../src/ui/app.js');
  const { Academy } = await import('../src/core/academy.js');
  const { LessonStore } = await import('../src/storage/store.js');
  const { offlineLesson } = await import('../src/core/teaching.js');
  const { d, root, sessions } = await workspace();
  const config = defaultConfig();
  config.onboarded = true;
  const store = new LessonStore(path.join(d, 'state'));
  const academy = new Academy(root, sessions, path.join(d, 'state'), config, store, {});
  const watch = vi.spyOn(academy, 'watch').mockImplementation(() => {});
  const source = event('source', 'const value = 1;', { file: 'example.ts' });
  const lesson = offlineLesson('one', 'INVESTIGATING', [source]);
  academy.snapshot.lessons = [lesson];
  academy.snapshot.events = [source];
  const ask = vi.spyOn(academy, 'ask').mockImplementation(async (l, text) => {
    const q = {
      id: 'answer',
      lessonId: l.id,
      question: text,
      created: new Date().toISOString(),
      answer: [
        {
          heading: 'Açıklama',
          body: 'Çünkü burada değer yeniden atanıyor.',
          evidence: [source.id],
          confidence: 'Strongly supported' as const,
        },
      ],
    };
    store.question(q);
    return q;
  });
  const ui = render(
    <AcademyTUI academy={academy} configDir={path.join(d, 'config')} initialConfig={config} />,
  );
  try {
    await pause();
    ui.stdin.write('\r');
    await pause();
    expect(ui.lastFrame()).toContain('Sorunu yaz');
    ui.stdin.write('Neden böyle?');
    await pause();
    ui.stdin.write('\r');
    await vi.waitFor(() => expect(ask).toHaveBeenCalledWith(lesson, 'Neden böyle?'));
    await pause();
    expect(ui.lastFrame()).toContain('Senin sorun');
    expect(ui.lastFrame()).toContain('Çünkü burada değer yeniden atanıyor.');
    expect(ui.lastFrame()).not.toContain('ASK');
  } finally {
    ui.unmount();
    await academy.stop();
    store.close();
    watch.mockRestore();
    ask.mockRestore();
  }
});
