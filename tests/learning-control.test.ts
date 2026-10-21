import { afterEach, it, expect, vi } from 'vitest';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Academy } from '../src/core/academy.js';
import { LessonStore } from '../src/storage/store.js';
import { defaultConfig } from '../src/storage/config.js';
import { CodexSessionAdapter } from '../src/adapters/codex.js';
import { EvidenceCollector } from '../src/core/evidence.js';
import { GitChangeTracker } from '../src/core/git.js';
import { workspace, rollout, row, event } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const task = (message: string) => row('event_msg', { type: 'user_message', message });
const done = () => row('event_msg', { type: 'task_complete', last_agent_message: 'done' });
async function setup(extra = task('unselected-old-work') + done()) {
  const ws = await workspace();
  const file = await rollout(ws.sessions, ws.root, 'one', extra);
  const state = path.join(ws.d, 'state');
  const store = new LessonStore(state);
  const config = defaultConfig();
  const academy = new Academy(ws.root, ws.sessions, state, config, store, {});
  return { ...ws, file, state, store, config, academy };
}

it('opens paused and discovers sessions without ingesting, collecting source/git or requesting models', async () => {
  const { academy, store } = await setup();
  const read = vi.spyOn(CodexSessionAdapter.prototype, 'read');
  const source = vi.spyOn(EvidenceCollector.prototype, 'sources');
  const git = vi.spyOn(GitChangeTracker.prototype, 'collect');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  try {
    const config = defaultConfig();
    config.provider = { ...config.provider, kind: 'local', model: 'test' };
    academy.setConfig(config);
    await academy.tick();
    await academy.tick();
    expect(academy.snapshot.selected?.id).toBe('one');
    expect(academy.snapshot.learning).toBe('paused');
    expect(store.count(academy.snapshot.selected!)).toBe(0);
    for (const call of [read, source, git, fetch]) expect(call).not.toHaveBeenCalled();
  } finally {
    await academy.stop();
    store.close();
  }
});

it('learns only after Start, stops at completion and excludes the next task in the same JSONL batch', async () => {
  const { academy, file, store } = await setup();
  try {
    await academy.beginLearning();
    expect(academy.snapshot.events).toHaveLength(0);
    expect(academy.snapshot.lessons).toHaveLength(0);
    await appendFile(
      file,
      task('chosen-work') +
        row('event_msg', { type: 'agent_message', message: 'observable evidence' }) +
        done() +
        task('not-selected-next-work'),
    );
    await academy.tick();
    await academy.settle();
    expect(academy.snapshot.learning).toBe('paused');
    expect(academy.snapshot.stage).toBe('COMPLETED');
    expect(academy.snapshot.lessons).toHaveLength(1);
    const report = academy.report();
    expect(report).toContain('chosen-work');
    expect(report).not.toContain('unselected-old-work');
    expect(report).not.toContain('not-selected-next-work');
    await academy.tick();
    expect(
      store
        .events(academy.snapshot.selected!)
        .some((e) => e.text.includes('not-selected-next-work')),
    ).toBe(false);
  } finally {
    await academy.stop();
    store.close();
  }
});

it('skips paused jobs on restart, isolates each capture report and reopens paused', async () => {
  const { academy, file, root, sessions, state, config, store } = await setup();
  try {
    await academy.beginLearning();
    await appendFile(file, task('first-chosen-work') + done());
    await academy.tick();
    await academy.settle();
    const firstReport = academy.snapshot.report!;
    await appendFile(file, task('skipped-while-paused') + done());
    await academy.beginLearning();
    await appendFile(file, task('second-chosen-work') + done());
    await academy.tick();
    await academy.settle();
    expect(academy.report()).toContain('second-chosen-work');
    expect(academy.report()).not.toContain('first-chosen-work');
    expect(academy.report()).not.toContain('skipped-while-paused');
    expect(academy.snapshot.report).not.toBe(firstReport);
    expect(await readFile(firstReport, 'utf8')).toContain('first-chosen-work');
    await academy.stop();
    const reopened = new Academy(root, sessions, state, config, store, {});
    try {
      await appendFile(file, task('new-work-after-reopen'));
      await reopened.tick();
      expect(reopened.snapshot.learning).toBe('paused');
      expect(reopened.snapshot.events.some((e) => e.text.includes('new-work-after-reopen'))).toBe(
        false,
      );
      expect(reopened.report()).toContain('second-chosen-work');
    } finally {
      await reopened.stop();
    }
  } finally {
    await academy.stop();
    store.close();
  }
});

it('Stop aborts an in-flight provider and settings cannot silently restart it', async () => {
  const { academy, config, store, file } = await setup();
  let aborted = false;
  const fetch = vi.fn(
    (_url, request: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        request.signal?.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error('aborted'));
          },
          { once: true },
        );
      }),
  );
  vi.stubGlobal('fetch', fetch);
  try {
    config.provider = { ...config.provider, kind: 'local', model: 'test' };
    academy.setConfig(config);
    await academy.beginLearning();
    await appendFile(file, task('chosen-live-work'));
    await academy.tick();
    expect(fetch).toHaveBeenCalledTimes(1);
    academy.pauseLearning();
    await academy.settle();
    expect(aborted).toBe(true);
    expect(academy.snapshot.lessons).toHaveLength(0);
    await appendFile(
      file,
      row('event_msg', { type: 'agent_message', message: 'ignored-after-stop' }),
    );
    academy.setConfig(config);
    await academy.tick();
    expect(academy.snapshot.learning).toBe('paused');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(academy.snapshot.events.some((e) => e.text.includes('ignored-after-stop'))).toBe(false);
  } finally {
    await academy.stop();
    store.close();
  }
});

it('discards late source reads after Stop instead of launching an explanation', async () => {
  const { academy, store } = await setup(task('chosen-work'));
  let finish!: (value: ReturnType<typeof event>[]) => void;
  const sources = vi.spyOn(EvidenceCollector.prototype, 'sources').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const beginning = academy.beginLearning({ replay: true });
  try {
    await vi.waitFor(() => expect(sources).toHaveBeenCalled());
    academy.pauseLearning();
    finish([event('source', 'late-secret', { id: 'late-source' })]);
    await beginning;
    await academy.settle();
    expect(academy.snapshot.lessons).toHaveLength(0);
    expect(store.events(academy.snapshot.selected!).some((e) => e.id === 'late-source')).toBe(
      false,
    );
  } finally {
    finish?.([]);
    await academy.stop();
    store.close();
  }
});
it('requires another Start when a distinct task arrives without a completion marker', async () => {
  const { academy, file, store } = await setup(task('selected-current-work'));
  try {
    await academy.beginLearning();
    await academy.settle();
    await appendFile(
      file,
      task('new-unselected-work') +
        row('event_msg', { type: 'agent_message', message: 'new task output' }),
    );
    await academy.tick();
    expect(academy.snapshot.learning).toBe('paused');
    expect(academy.snapshot.status).toContain('Yeni görev');
    expect(academy.report()).toContain('selected-current-work');
    expect(academy.report()).not.toContain('new-unselected-work');
    expect(academy.report()).not.toContain('new task output');
  } finally {
    await academy.stop();
    store.close();
  }
});
it('retains a reused source snapshot in each explicitly selected capture window', async () => {
  const { academy, store, config } = await setup(task('current-task'));
  config.provider.autoAnalyze = false;
  vi.spyOn(GitChangeTracker.prototype, 'collect').mockImplementation(async (session) => ({
    session,
    events: [
      event('source', 'const answer = 42;', { id: 'same-source', file: 'code.ts', origin: 'git' }),
    ],
  }));
  try {
    academy.setConfig(config);
    await academy.beginLearning();
    const first = academy.snapshot.events.find((e) => e.kind === 'source');
    academy.pauseLearning();
    await academy.beginLearning();
    const next = academy.snapshot.events.find((e) => e.kind === 'source');
    expect(first?.text).toBe('const answer = 42;');
    expect(next?.text).toBe(first?.text);
    expect(next?.id).not.toBe(first?.id);
    expect(academy.report()).toContain('const answer = 42;');
  } finally {
    await academy.stop();
    store.close();
  }
});
