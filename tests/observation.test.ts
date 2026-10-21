import { describe, it, expect } from 'vitest';
import { appendFile, rename, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { CodexSessionAdapter, matchSessions, readJsonl } from '../src/adapters/codex.js';
import { SessionEventNormalizer } from '../src/adapters/normalizer.js';
import { LessonStore } from '../src/storage/store.js';
import { workspace, rollout, row, session } from './helpers.js';

describe('incremental Codex observation', () => {
  it('defers partial JSON and handles UTF-8 byte boundaries', async () => {
    const { root, sessions } = await workspace();
    const file = await rollout(sessions, root);
    const cp = (await readJsonl(file)).checkpoint;
    const data = Buffer.from(
      row('event_msg', { type: 'agent_message', message: 'İşlem sınırı 🔎' }),
    );
    await appendFile(file, data.subarray(0, data.length - 4));
    const part = await readJsonl(file, cp);
    expect(part.records).toHaveLength(0);
    expect(part.checkpoint.offset).toBe(cp.offset);
    await appendFile(file, data.subarray(data.length - 4));
    const complete = await readJsonl(file, part.checkpoint);
    expect((complete.records[0] as any).payload.message).toBe('İşlem sınırı 🔎');
  });
  it('deduplicates replay after reconnect, with transactional checkpoints', async () => {
    const { d, root, sessions } = await workspace();
    await rollout(
      sessions,
      root,
      'one',
      row('event_msg', { type: 'user_message', message: 'fix it' }),
    );
    const adapter = new CodexSessionAdapter();
    const s = (await adapter.discover(sessions))[0]!;
    let store = new LessonStore(path.join(d, 'state'));
    const batch = await adapter.read(s);
    expect(store.ingest(s, batch.events, batch.checkpoint)).toHaveLength(1);
    store.close();
    store = new LessonStore(path.join(d, 'state'));
    expect((await adapter.read(s, store.checkpoint(s.file))).events).toHaveLength(0);
    expect(store.ingest(s, batch.events)).toHaveLength(0);
    expect(store.count(s)).toBe(1);
    store.close();
  });
  it('detects file replacement and truncation', async () => {
    const { root, sessions } = await workspace();
    const file = await rollout(sessions, root, 'one');
    const cp = (await readJsonl(file)).checkpoint;
    await rename(file, file + '.old');
    await writeFile(file, row('event_msg', { type: 'agent_message', message: 'new' }));
    expect((await readJsonl(file, cp)).records).toHaveLength(1);
    const cp2 = (await readJsonl(file)).checkpoint;
    await writeFile(file, '{}\n');
    expect((await readJsonl(file, cp2)).records).toEqual([{}]);
  });
  it('skips malformed complete lines without losing later events', async () => {
    const { root, sessions } = await workspace();
    const file = await rollout(
      sessions,
      root,
      'one',
      'bad\n' + row('event_msg', { type: 'task_complete' }),
    );
    const data = await readJsonl(file);
    expect(data.warnings).toHaveLength(1);
    expect(data.records).toHaveLength(2);
  });
  it('bounds oversized lines and recovers at the next newline', async () => {
    const { sessions } = await workspace();
    const file = path.join(sessions, 'huge.jsonl');
    await writeFile(file, 'x'.repeat(2 * 1024 * 1024) + '\n{}\n');
    const one = await readJsonl(file);
    const two = await readJsonl(file, one.checkpoint);
    const three = await readJsonl(file, two.checkpoint);
    expect(three.records).toEqual([{}]);
    expect(one.warnings.length).toBe(1);
  });
  it('discovers normal sessions, excludes teaching/subagent sessions and selects no ambiguous latest', async () => {
    const { root, sessions } = await workspace();
    await rollout(sessions, root, 'one');
    await rollout(sessions, root, 'two');
    await rollout(sessions, root, 'child', '', { subagent: { parent_thread_id: 'one' } });
    const found = await new CodexSessionAdapter().discover(sessions);
    expect(found.map((s) => s.id).sort()).toEqual(['one', 'two']);
    expect(matchSessions(found, root).selected).toBeUndefined();
    expect(matchSessions(found, root, { kind: 'id', value: 'two' }).selected?.id).toBe('two');
    expect(matchSessions(found, root, { kind: 'id', value: 'missing' }).selected).toBeUndefined();
  });
  it('never mixes different workspaces including sibling paths', () => {
    const a = session('/tmp/repo', 'a'),
      b = session('/tmp/repo-other', 'b');
    expect(matchSessions([a, b], a.cwd).selected?.id).toBe('a');
    expect(matchSessions([a, b], '/tmp').choices).toHaveLength(0);
  });
  it('canonicalizes a real project cwd and finds a new date directory', async () => {
    const { root, sessions } = await workspace();
    const a = new CodexSessionAdapter();
    expect(await a.discover(sessions)).toEqual([]);
    const nested = path.join(sessions, '2026', '10', '21');
    await mkdir(nested, { recursive: true });
    await rollout(nested, root);
    expect((await a.discover(sessions))[0]?.cwd).toBe(root);
  });
  it('correlates tool results after restarting the normalizer', () => {
    const n = new SessionEventNormalizer('one');
    const call = n.normalize({
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'exec_command',
        call_id: 'x',
        arguments: '{"cmd":"npm test"}',
      },
    })[0]!;
    const second = new SessionEventNormalizer('one', (id) =>
      id === 'x' ? call.command : undefined,
    );
    const output = second.normalize({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'x',
        output: 'Process exited with code 1\nFAIL',
      },
    })[0]!;
    expect(output.command).toBe('npm test');
    expect(output.exitCode).toBe(1);
  });
  it('ignores analysis, reasoning, encrypted payloads and system instructions', () => {
    const n = new SessionEventNormalizer('one');
    for (const payload of [
      { type: 'reasoning', summary: [{ text: 'private' }] },
      {
        type: 'message',
        role: 'assistant',
        channel: 'analysis',
        content: [{ type: 'output_text', text: 'private' }],
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '<environment_context>data' }],
      },
    ])
      expect(n.normalize({ type: 'response_item', payload })).toEqual([]);
  });
  it('deduplicates redundant event_msg/response_item messages and commands', () => {
    const n = new SessionEventNormalizer('one');
    const a = n.normalize({
      type: 'event_msg',
      payload: { type: 'agent_message', message: 'hello' },
    })[0];
    const b = n.normalize({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'hello' }],
      },
    })[0];
    expect(a?.id).toBe(b?.id);
  });
});
it('supports actual Codex 0.163 structured item_completed records without reading reasoning', () => {
  const n = new SessionEventNormalizer('one');
  const events = n.normalize({
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      item: {
        type: 'CommandExecution',
        id: 'command-item',
        command: ['npm', 'test'],
        aggregated_output: 'Tests passed',
        exit_code: 0,
        status: 'Completed',
      },
    },
  });
  expect(events.map((e) => e.kind)).toEqual(['command', 'result']);
  expect(events[1]?.command).toBe('npm test');
  expect(events[1]?.exitCode).toBe(0);
  expect(
    n.normalize({
      type: 'event_msg',
      payload: {
        type: 'item_completed',
        item: { type: 'Reasoning', raw_content: ['private'], summary_text: ['private'] },
      },
    }),
  ).toEqual([]);
});
it('rediscovers changed metadata when a rollout filename is replaced', async () => {
  const { root, sessions } = await workspace();
  const file = await rollout(sessions, root, 'old');
  const adapter = new CodexSessionAdapter();
  expect((await adapter.discover(sessions))[0]?.id).toBe('old');
  await writeFile(
    file,
    row('session_meta', {
      id: 'new-session-id',
      cwd: root,
      originator: 'codex_cli_rs',
      source: 'cli',
    }),
  );
  expect((await adapter.discover(sessions))[0]?.id).toBe('new-session-id');
});
it('refuses to ingest a replaced file into the previously selected session', async () => {
  const { root, sessions } = await workspace();
  const file = await rollout(sessions, root, 'old');
  const adapter = new CodexSessionAdapter();
  const selected = (await adapter.discover(sessions))[0]!;
  await writeFile(file, row('session_meta', { id: 'different-session', cwd: root, source: 'cli' }));
  await expect(adapter.read(selected)).rejects.toThrow('kimliği değişti');
});
