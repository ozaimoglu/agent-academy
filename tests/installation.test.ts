import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, readdir, symlink, access, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { temp } from './helpers.js';

const exec = promisify(execFile);
async function fixture(overrides: NodeJS.ProcessEnv = {}) {
  const d = await temp();
  const root = path.join(d, 'checkout with spaces');
  const bin = path.join(d, 'bin');
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'fixtures'));
  await mkdir(bin);
  for (const name of ['install.sh', 'preflight.mjs', 'verify-install.mjs', 'academy.sh']) {
    await writeFile(
      path.join(root, 'scripts', name),
      await readFile(fileURLToPath(new URL('../scripts/' + name, import.meta.url))),
      { mode: 0o700 },
    );
  }
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'agent-academy', version: '0.1.0', type: 'module' }),
  );
  await writeFile(
    path.join(root, 'package-lock.json'),
    JSON.stringify({ lockfileVersion: 3, packages: { '': { version: '0.1.0' } } }),
  );
  await writeFile(
    path.join(root, 'herdr-plugin.toml'),
    'id = "local.agent-academy"\nversion = "0.1.0"\nmin_herdr_version = "0.9.3"\n',
  );
  await writeFile(path.join(root, 'settings.json'), 'preserve user preferences');
  const log = path.join(d, 'calls.jsonl');
  const fixtureApp = `console.log(process.argv.includes('--headless') ? ${JSON.stringify('# Agent Academy\nDEMO FIXTURE\nActual test results')} : 'Agent Academy --headless');`;
  await writeFile(log, '');
  await symlink(process.execPath, path.join(bin, 'node'));
  for (const name of ['npm', 'git', 'herdr']) {
    await writeFile(
      path.join(bin, name),
      `#!${process.execPath}
const fs=require('node:fs'), path=require('node:path');
const args=process.argv.slice(2), name=${JSON.stringify(name)};
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify([name,...args])+'\\n');
if(name==='npm') {
  if(args[0]==='--version') console.log(process.env.TEST_NPM_VERSION || '10.9.3');
  else if(args[0]==='ci') { if(process.env.TEST_FAIL==='dependency') process.exit(1); }
  else if(args[0]==='run' && args[1]==='build') {
    if(process.env.TEST_FAIL==='build') process.exit(1);
    const dist=args[args.indexOf('--outDir')+1];
    fs.mkdirSync(dist,{recursive:true});
    const source=process.env.TEST_FAIL==='validation'
      ? 'process.stderr.write("private-child-diagnostic");process.exit(1)'
      : ${JSON.stringify(fixtureApp)};
    fs.writeFileSync(path.join(dist,'cli.js'),source);
  } else process.exit(2);
} else if(name==='git') {
  if(args.includes('--version')) console.log('git version 2.45.0');
  else if(args.includes('rev-parse')) console.log('a'.repeat(40));
} else {
  if(args[0]==='--version') console.log(process.env.TEST_HERDR_VERSION || 'herdr 0.9.5');
  else if(args[0]==='plugin' && args[1]==='link') { if(process.env.TEST_FAIL==='registration') process.exit(1); console.log('{"linked":true}'); }
  else process.exit(2);
}
`,
      { mode: 0o700 },
    );
  }
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...overrides };
  const run = (args: string[] = []) =>
    exec('/bin/bash', [path.join(root, 'scripts/install.sh'), ...args], {
      cwd: d,
      env,
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    });
  const calls = async (): Promise<string[][]> =>
    (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  return { d, root, bin, env, run, calls };
}

it('previews source installation without dependency/build/registration writes', async () => {
  const f = await fixture();
  const result = await f.run(['--dry-run', '--link']);
  expect(result.stdout).toContain('PLAN');
  expect((await f.calls()).every((args) => args.includes('--version'))).toBe(true);
  expect(await readdir(f.root)).not.toContain('dist');
  expect(await readFile(path.join(f.root, 'settings.json'), 'utf8')).toBe(
    'preserve user preferences',
  );
});
it.each([
  { env: { TEST_HERDR_VERSION: 'herdr 0.9.2' }, message: 'Herdr >=0.9.3' },
  { env: { TEST_NPM_VERSION: '8.0.0' }, message: 'npm >=9' },
  { env: { TEST_HERDR_VERSION: 'unknown' }, message: 'Could not read version' },
])(
  'fails incompatible prerequisites before changing the installation: $message',
  async ({ env, message }) => {
    const f = await fixture(env);
    await expect(f.run(['--link'])).rejects.toMatchObject({
      code: 2,
      stderr: expect.stringContaining(message),
    });
    expect((await f.calls()).some((args) => args.includes('ci') || args.includes('link'))).toBe(
      false,
    );
  },
);
it('promotes only verified builds, records provenance, supports repeated install/check and binds Node independent of PATH', async () => {
  const f = await fixture();
  await f.run(['--link']);
  await f.run(['--check']);
  await f.run(['--build-only']);
  const receipt = JSON.parse(await readFile(path.join(f.root, 'dist/install-info.json'), 'utf8'));
  expect(receipt).toMatchObject({
    version: '0.1.0',
    source: { commit: 'a'.repeat(40), dirty: false },
    runtime: { executable: process.execPath },
    checks: ['sqlite', 'cli-help', 'offline-observation-teaching-report'],
  });
  expect(receipt.artifacts['cli.js']).toMatch(/^[a-f0-9]{64}$/);
  expect(
    (await f.calls()).filter((args) => args[0] === 'herdr' && args[1] === 'plugin'),
  ).toHaveLength(1);
  await unlink(path.join(f.bin, 'node'));
  await writeFile(path.join(f.bin, 'node'), '#!/bin/sh\nexit 99\n', { mode: 0o700 });
  const launched = await exec('/bin/bash', [path.join(f.root, 'scripts/academy.sh'), '--help'], {
    env: f.env,
  });
  expect(launched.stdout).toContain('Agent Academy --headless');
}, 20000);
it('makes the recorded Node available to child CLIs with a minimal host PATH', async () => {
  const f = await fixture();
  await f.run();
  await writeFile(
    path.join(f.root, 'dist/cli.js'),
    `import { execFileSync } from 'node:child_process';
console.log(execFileSync('/usr/bin/env', ['node', '-p', 'process.execPath'], { encoding: 'utf8' }).trim());`,
  );
  const launched = await exec('/bin/bash', [path.join(f.root, 'scripts/academy.sh')], {
    env: { ...f.env, PATH: '/usr/bin:/bin' },
  });
  expect(launched.stdout.trim()).toBe(process.execPath);
});
it.each([
  { stage: 'dependency', code: 3 },
  { stage: 'build', code: 4 },
  { stage: 'validation', code: 5 },
])('preserves the old build and never registers after $stage failure', async ({ stage, code }) => {
  const f = await fixture({ TEST_FAIL: stage });
  await mkdir(path.join(f.root, 'dist'));
  await writeFile(path.join(f.root, 'dist/previous'), 'previous working build');
  await expect(f.run(['--link'])).rejects.toMatchObject({ code });
  expect(await readFile(path.join(f.root, 'dist/previous'), 'utf8')).toBe('previous working build');
  expect((await f.calls()).some((args) => args.includes('link'))).toBe(false);
  expect((await readdir(f.root)).some((name) => name.startsWith('.academy-install.'))).toBe(false);
});
it('restores the previous dist when local Herdr registration fails', async () => {
  const f = await fixture({ TEST_FAIL: 'registration' });
  await mkdir(path.join(f.root, 'dist'));
  await writeFile(path.join(f.root, 'dist/previous'), 'previous working build');
  await expect(f.run(['--link'])).rejects.toMatchObject({ code: 6 });
  expect(await readFile(path.join(f.root, 'dist/previous'), 'utf8')).toBe('previous working build');
  await expect(access(path.join(f.root, 'dist/cli.js'))).rejects.toThrow();
});
it('detects changed build artifacts before executing them during verification', async () => {
  const f = await fixture();
  await f.run();
  const marker = path.join(f.d, 'unexpected-execution');
  await writeFile(
    path.join(f.root, 'dist/cli.js'),
    `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)},'should not run');`,
  );
  await expect(f.run(['--check'])).rejects.toMatchObject({
    code: 5,
    stderr: expect.stringContaining('integrity'),
  });
  await expect(access(marker)).rejects.toThrow();
});
it('refuses a concurrent install without removing another installer lock', async () => {
  const f = await fixture();
  await mkdir(path.join(f.root, '.academy-install.lock'));
  await writeFile(path.join(f.root, '.academy-install.lock/pid'), 'another installer');
  await expect(f.run()).rejects.toMatchObject({ code: 2 });
  expect(await readFile(path.join(f.root, '.academy-install.lock/pid'), 'utf8')).toBe(
    'another installer',
  );
  expect((await f.calls()).some((args) => args.includes('ci'))).toBe(false);
});
it('rejects unknown and incompatible flags before running any tools', async () => {
  const f = await fixture();
  await expect(f.run(['--unknown'])).rejects.toMatchObject({ code: 2 });
  await expect(f.run(['--check', '--link'])).rejects.toMatchObject({ code: 2 });
  expect(await f.calls()).toEqual([]);
});
