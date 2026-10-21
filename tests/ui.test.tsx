import React from 'react';
import { afterEach, it, expect, vi } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import { OnboardingWizard } from '../src/ui/onboarding.js';
import { defaultConfig, consentKey } from '../src/storage/config.js';
import { renderDiagram } from '../src/ui/diagrams.js';
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
  expect(ui.lastFrame()).toContain('hangi konularda');
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
it('browses every live TUI view from the deterministic observation and teaching pipeline', async () => {
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
    await vi.waitFor(() => expect(academy.snapshot.lessons.length).toBe(1));
    await pause();
    expect(ui.lastFrame()).toContain('Tur tamamlandı');
    for (const [key, expected] of [
      ['2', 'Ne oldu?'],
      ['3', 'Gerçek kod'],
      ['4', 'Kanıta bağlı akış'],
      ['5', 'Birlikte derinleşelim'],
      ['6', 'Mühendislik değerlendirmesi'],
    ]) {
      ui.stdin.write(key!);
      await pause();
      expect(ui.lastFrame()).toContain(expected);
    }
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
