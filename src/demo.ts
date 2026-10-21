import { mkdtemp, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
export async function prepareDemo() {
  const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));
  const base = await mkdtemp(path.join(os.tmpdir(), 'agent-academy-demo-'));
  const project = path.join(base, 'project');
  const sessions = path.join(base, 'sessions');
  await cp(path.join(fixtures, 'demo-project'), project, { recursive: true });
  await mkdir(sessions);
  const contents = await readFile(path.join(fixtures, 'session.jsonl'), 'utf8');
  await writeFile(
    path.join(sessions, 'rollout-demo.jsonl'),
    contents.replaceAll('__ACADEMY_PROJECT__', JSON.stringify(project).slice(1, -1)),
  );
  return {
    project,
    sessions,
    state: path.join(base, 'state'),
    config: path.join(base, 'config'),
    base,
  };
}
