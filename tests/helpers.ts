import { mkdtemp, mkdir, rm, writeFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import type { AcademyEvent, Session } from '../src/core/types.js';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
export async function temp() {
  const d = await realpath(await mkdtemp(path.join(os.tmpdir(), 'academy-test-')));
  dirs.push(d);
  return d;
}
export async function workspace() {
  const d = await temp();
  const root = path.join(d, 'project');
  const sessions = path.join(d, 'sessions');
  await mkdir(root);
  await mkdir(sessions);
  return { d, root, sessions };
}
export const row = (type: string, payload: unknown, time = '2026-01-01T00:00:00Z') =>
  JSON.stringify({ timestamp: time, type, payload }) + '\n';
export async function rollout(
  sessions: string,
  root: string,
  id = 'session-1',
  extra = '',
  source: unknown = 'cli',
) {
  const file = path.join(sessions, id + '.jsonl');
  await writeFile(
    file,
    row('session_meta', { id, cwd: root, source, originator: 'codex_cli_rs' }) + extra,
  );
  return file;
}
export const session = (cwd = '/tmp/project', id = 'session-1'): Session => ({
  id,
  cwd,
  file: '/tmp/rollout.jsonl',
  modified: 0,
  source: 'cli',
});
export const event = (
  kind: AcademyEvent['kind'],
  text: string,
  extra: Partial<AcademyEvent> = {},
): AcademyEvent => ({
  id: `e-${kind}-${text.slice(0, 8)}`,
  sessionId: 'session-1',
  time: '2026-01-01T00:00:00Z',
  kind,
  text,
  origin: 'codex',
  ...extra,
});
