import { it, expect, vi } from 'vitest';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { workspace, rollout, row, event, session } from './helpers.js';
import { Academy } from '../src/core/academy.js';
import { canonical } from '../src/core/privacy.js';
import { EvidenceCollector } from '../src/core/evidence.js';
import { LessonStore } from '../src/storage/store.js';
import { defaultConfig } from '../src/storage/config.js';
import { pluginAction } from '../src/integration/herdr.js';
import { GitChangeTracker } from '../src/core/git.js';
import { prepareDemo } from '../src/demo.js';

it('runs the entire deterministic fixture through discovery, teaching, source evidence, persistence and reports', async () => {
  const demo = await prepareDemo();
  const store = new LessonStore(demo.state);
  const academy = new Academy(
    await canonical(demo.project),
    demo.sessions,
    demo.state,
    defaultConfig(),
    store,
    {},
  );
  try {
    await academy.tick();
    await academy.settle();
    expect(academy.snapshot.stage).toBe('COMPLETED');
    expect(
      academy.snapshot.events.some((e) => e.kind === 'source' && e.file === 'src/OrderWriter.java'),
    ).toBe(true);
    expect(academy.snapshot.lessons).toHaveLength(1);
    expect(academy.report()).toContain('Tests run: 1, Failures: 0');
    const exported = await academy.export();
    expect(await readFile(exported, 'utf8')).toContain('Hipotez');
    const count = academy.snapshot.eventCount;
    await academy.tick();
    expect(academy.snapshot.eventCount).toBe(count);
    expect(academy.snapshot.lessons).toHaveLength(1);
  } finally {
    await academy.stop();
    store.close();
    await rm(demo.base, { recursive: true, force: true });
  }
});
it('requires manual selection with multiple same-project sessions, then isolates events', async () => {
  const { d, root, sessions } = await workspace();
  await rollout(sessions, root, 'a', row('event_msg', { type: 'user_message', message: 'task A' }));
  await rollout(sessions, root, 'b', row('event_msg', { type: 'user_message', message: 'task B' }));
  const store = new LessonStore(path.join(d, 'state'));
  const academy = new Academy(root, sessions, path.join(d, 'state'), defaultConfig(), store, {});
  try {
    await academy.tick();
    expect(academy.snapshot.selected).toBeUndefined();
    await academy.select(academy.snapshot.sessions.find((s) => s.id === 'b')!);
    await academy.tick();
    await academy.settle();
    expect(academy.snapshot.events.map((e) => e.text)).toContain('task B');
    expect(academy.snapshot.events.map((e) => e.text)).not.toContain('task A');
  } finally {
    await academy.stop();
    store.close();
  }
});
it('coalesces command-heavy batches and respects analysis frequency', async () => {
  const { d, root, sessions } = await workspace();
  await rollout(sessions, root, 'a', row('event_msg', { type: 'user_message', message: 'task' }));
  const store = new LessonStore(path.join(d, 'state'));
  const academy = new Academy(root, sessions, path.join(d, 'state'), defaultConfig(), store, {});
  try {
    await academy.tick();
    await academy.settle();
    expect(academy.snapshot.lessons).toHaveLength(1);
    const { appendFile } = await import('node:fs/promises');
    await appendFile(
      academy.snapshot.selected!.file,
      row('event_msg', { type: 'agent_message', message: 'Hipotez: proxy olabilir' }),
    );
    await academy.tick();
    await academy.settle();
    expect(academy.snapshot.lessons).toHaveLength(1);
  } finally {
    await academy.stop();
    store.close();
  }
});
it('does not use untrusted patch paths to escape the project', async () => {
  const { root, d } = await workspace();
  await writeFile(path.join(d, 'secret.ts'), 'outside');
  await writeFile(path.join(root, 'Good.ts'), 'export const answer=42;');
  const s = session(root);
  const evidence = await new EvidenceCollector().sources(s, [
    event('edit', '*** Update File: ../secret.ts\n*** Add File: Good.ts'),
  ]);
  expect(evidence).toHaveLength(1);
  expect(evidence[0]?.file).toBe('Good.ts');
  expect(evidence[0]?.startLine).toBe(1);
});
it('collects actual Git HEAD-to-worktree diffs and code ranges without mutating the repository', async () => {
  const { root } = await workspace();
  const exec = promisify(execFile);
  const git = (args: string[]) => exec('git', ['-C', root, ...args]);
  await git(['init']);
  await writeFile(path.join(root, 'sample.ts'), 'export const value = 1;\n');
  await git(['add', 'sample.ts']);
  await git(['-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '-m', 'fixture']);
  await writeFile(path.join(root, 'sample.ts'), 'export const value = 2;\n');
  const before = (await git(['status', '--porcelain'])).stdout;
  const collected = await new GitChangeTracker().collect(session(root));
  expect(
    collected.events.some(
      (e) =>
        e.kind === 'diff' &&
        e.text.includes('-export const value = 1;') &&
        e.text.includes('+export const value = 2;'),
    ),
  ).toBe(true);
  expect(collected.events.some((e) => e.kind === 'source' && e.startLine === 1)).toBe(true);
  expect((await git(['status', '--porcelain'])).stdout).toBe(before);
});
it('opens an explicit right split, scopes by workspace, and never sends agent input', async () => {
  const { d, root } = await workspace();
  const calls: string[][] = [];
  const call = vi.fn(async (args: string[]) => {
    calls.push(args);
    if (args[0] === 'pane' && args[1] === 'get')
      return { pane: { pane_id: 'w1:p1', workspace_id: 'w1', cwd: root } };
    if (args[0] === 'plugin')
      return { plugin_pane: { pane: { pane_id: 'w1:p2', workspace_id: 'w1' } } };
    return {};
  });
  const env = {
    HERDR_ENV: '1',
    HERDR_PANE_ID: 'w1:p1',
    HERDR_WORKSPACE_ID: 'w1',
    HERDR_SOCKET_PATH: '/tmp/test-socket',
    ACADEMY_CONFIG_DIR: path.join(d, 'config'),
    ACADEMY_STATE_DIR: path.join(d, 'state'),
  };
  await pluginAction('open', env, call);
  const open = calls.find((a) => a.includes('open'))!;
  expect(open).toContain('right');
  expect(open).toContain('w1:p1');
  expect(open).toContain('--no-focus');
  expect(open).not.toContain('--workspace');
  expect(calls.find((a) => a.includes('resize'))).toContain('0.120');
  expect(
    calls.some((a) => a.includes('send-text') || a.includes('run') || a.includes('prompt')),
  ).toBe(false);
});
it('refuses cross-workspace control and cannot operate from outside Herdr', async () => {
  const { d } = await workspace();
  const env = {
    HERDR_ENV: '1',
    HERDR_PANE_ID: 'w1:p1',
    HERDR_WORKSPACE_ID: 'w1',
    HERDR_SOCKET_PATH: '/tmp/s',
    ACADEMY_CONFIG_DIR: path.join(d, 'config'),
    ACADEMY_STATE_DIR: path.join(d, 'state'),
  };
  const call = vi.fn(async () => ({ pane: { workspace_id: 'w2' } }));
  await expect(pluginAction('open', env, call)).rejects.toThrow('workspace');
  await expect(pluginAction('open', {}, call)).rejects.toThrow('bağlamı');
  expect(call).toHaveBeenCalledTimes(1);
});
it('retains the current task when the bounded event window advances', async () => {
  const { d, root } = await workspace();
  const store = new LessonStore(path.join(d, 'state'));
  const s = session(root);
  store.ingest(s, [
    event('task', 'original problem'),
    ...Array.from({ length: 450 }, (_, i) => event('command', 'inspect', { id: `cmd-${i}` })),
  ]);
  expect(store.contextEvents(s)).toHaveLength(401);
  expect(store.contextEvents(s)[0]?.text).toBe('original problem');
  store.close();
});
it('integrates HTTP teaching, cited Q&A, persistent history and a usage ledger', async () => {
  const { headings } = await import('../src/core/teaching.js');
  const demo = await prepareDemo();
  const config = defaultConfig();
  config.provider = { ...config.provider, kind: 'local', model: 'fixture-model' };
  const transport = vi.fn(async (_url: string, request: RequestInit) => {
    const body = JSON.parse(String(request.body));
    const context = JSON.parse(body.messages[1].content);
    const id = context.evidence[0].id;
    expect(body.tools).toBeUndefined();
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Fixture lesson',
                concepts: ['Spring AOP'],
                sections: headings.map((heading) => ({
                  heading,
                  body: 'Kanıtla ilişkilendirilmiş test açıklaması.',
                  evidence: [id],
                  confidence: 'Hypothesis',
                })),
                diagram: [],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 200 },
      }),
    );
  });
  vi.stubGlobal('fetch', transport);
  const store = new LessonStore(demo.state);
  const academy = new Academy(
    await canonical(demo.project),
    demo.sessions,
    demo.state,
    config,
    store,
    {},
  );
  try {
    await academy.tick();
    await academy.settle();
    const lesson = academy.snapshot.lessons[0]!;
    expect(lesson.provider).toBe('local:fixture-model');
    expect(lesson.error).toBeUndefined();
    await academy.ask(lesson, 'Gerçek kod üzerinden anlat.');
    expect(academy.questions(lesson)).toHaveLength(1);
    expect(store.usage(academy.snapshot.selected!)).toEqual({
      input: 200,
      output: 400,
      estimated: false,
    });
    const context = JSON.parse(
      JSON.parse(String(transport.mock.calls[1]![1].body)).messages[1].content,
    );
    expect(context.evidence.some((e: any) => e.kind === 'source')).toBe(true);
    expect(academy.report()).toContain('Gerçek kod üzerinden anlat.');
  } finally {
    await academy.stop();
    store.close();
    vi.unstubAllGlobals();
    await rm(demo.base, { recursive: true, force: true });
  }
});
it('makes open idempotent and toggles only a verified Academy pane', async () => {
  const { d, root } = await workspace();
  const calls: string[][] = [];
  const entry = new URL('../src/cli.js', import.meta.url).pathname;
  const call = vi.fn(async (args: string[]) => {
    calls.push(args);
    if (args[0] === 'pane' && args[1] === 'get')
      return { pane: { pane_id: 'w1:p1', workspace_id: 'w1', cwd: root } };
    if (args[0] === 'pane' && args[1] === 'list')
      return { panes: [{ pane_id: 'w1:p2', workspace_id: 'w1' }] };
    if (args[0] === 'pane' && args[1] === 'process-info')
      return { process_info: { foreground_processes: [{ argv: [entry, '--pane'] }] } };
    if (args[0] === 'plugin' && args.includes('open'))
      return { plugin_pane: { pane: { pane_id: 'w1:p2', workspace_id: 'w1' } } };
    return {};
  });
  const env = {
    HERDR_ENV: '1',
    HERDR_PANE_ID: 'w1:p1',
    HERDR_WORKSPACE_ID: 'w1',
    HERDR_SOCKET_PATH: '/tmp/test-socket',
    ACADEMY_CONFIG_DIR: path.join(d, 'config'),
    ACADEMY_STATE_DIR: path.join(d, 'state'),
  };
  await pluginAction('open', env, call);
  await pluginAction('open', env, call);
  expect(calls.filter((a) => a.includes('open'))).toHaveLength(1);
  await pluginAction('toggle', env, call);
  expect(calls.find((a) => a.includes('close'))).toEqual(['plugin', 'pane', 'close', 'w1:p2']);
  expect(calls.some((a) => a[1] === 'close' && a[2] === 'w1:p1')).toBe(false);
});
it('writes an evidence report on completion even when automatic model analysis is paused', async () => {
  const demo = await prepareDemo();
  const config = defaultConfig();
  config.provider.autoAnalyze = false;
  const store = new LessonStore(demo.state);
  const academy = new Academy(
    await canonical(demo.project),
    demo.sessions,
    demo.state,
    config,
    store,
    {},
  );
  try {
    await academy.tick();
    expect(academy.snapshot.lessons).toHaveLength(0);
    expect(academy.snapshot.report).toBeTruthy();
    expect(await readFile(academy.snapshot.report!, 'utf8')).toContain('Gerçek test sonuçları');
  } finally {
    await academy.stop();
    store.close();
    await rm(demo.base, { recursive: true, force: true });
  }
});
it('allows retry after a failed explanation without needing another coding event', async () => {
  const demo = await prepareDemo();
  const config = defaultConfig();
  config.provider = { ...config.provider, kind: 'local', model: 'fixture' };
  const fetch = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  const store = new LessonStore(demo.state);
  const academy = new Academy(
    await canonical(demo.project),
    demo.sessions,
    demo.state,
    config,
    store,
    {},
  );
  try {
    await academy.tick();
    await academy.settle();
    expect(academy.snapshot.lessons[0]?.error).toContain('HTTP 503');
    academy.requestLesson();
    await academy.settle();
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    await academy.stop();
    store.close();
    vi.unstubAllGlobals();
    await rm(demo.base, { recursive: true, force: true });
  }
});
it('namespaces lessons even if different projects contain copied native session IDs', async () => {
  const first = await workspace(),
    second = await workspace();
  const store = new LessonStore(path.join(first.d, 'shared-state'));
  await rollout(
    first.sessions,
    first.root,
    'copied-id',
    row('event_msg', { type: 'user_message', message: 'same task' }),
  );
  await rollout(
    second.sessions,
    second.root,
    'copied-id',
    row('event_msg', { type: 'user_message', message: 'same task' }),
  );
  const a = new Academy(
    first.root,
    first.sessions,
    path.join(first.d, 'state'),
    defaultConfig(),
    store,
    {},
  );
  const b = new Academy(
    second.root,
    second.sessions,
    path.join(second.d, 'state'),
    defaultConfig(),
    store,
    {},
  );
  try {
    await a.tick();
    await a.settle();
    await b.tick();
    await b.settle();
    expect(a.snapshot.lessons[0]?.id).not.toBe(b.snapshot.lessons[0]?.id);
    expect(store.lessons(a.snapshot.selected!)).toHaveLength(1);
    expect(store.lessons(b.snapshot.selected!)).toHaveLength(1);
  } finally {
    await a.stop();
    await b.stop();
    store.close();
  }
});
