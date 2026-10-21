import { it, expect } from 'vitest';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { temp } from './helpers.js';
import { createHerdrCall, closeAcademyPane } from '../src/integration/herdr.js';
import { fileURLToPath } from 'node:url';

it('keeps the server validation message when a Herdr CLI request fails', async () => {
  const dir = await temp();
  const executable = path.join(dir, 'fake-herdr');
  await writeFile(
    executable,
    `#!${process.execPath}\nprocess.stderr.write(JSON.stringify({error:{code:'invalid_params',message:'split and zoomed plugin panes target an existing pane; use target_pane_id'}}));process.exit(1);\n`,
    { mode: 0o700 },
  );
  const call = createHerdrCall({ HERDR_ENV: '1', HERDR_BIN_PATH: executable });
  await expect(call(['plugin', 'pane', 'open'])).rejects.toThrow(
    'invalid_params: split and zoomed plugin panes target an existing pane; use target_pane_id',
  );
});

it('starts the installed launcher from another project directory', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { fileURLToPath } = await import('node:url');
  const cwd = await temp();
  const installation = await temp();
  await mkdir(path.join(installation, 'scripts'));
  await mkdir(path.join(installation, 'dist'));
  const original = fileURLToPath(new URL('../scripts/academy.sh', import.meta.url));
  const launcher = path.join(installation, 'scripts', 'academy.sh');
  await writeFile(launcher, await readFile(original), { mode: 0o700 });
  const entry = path.join(installation, 'dist', 'cli.js');
  await writeFile(
    entry,
    'console.log(JSON.stringify({entry:process.argv[1],cwd:process.cwd(),args:process.argv.slice(2)}));',
  );
  const { stdout } = await promisify(execFile)(launcher, ['--pane'], { cwd });
  expect(JSON.parse(stdout)).toEqual({ entry, cwd, args: ['--pane'] });
});
it('closes only the current verified Academy pane from the panel shortcut', async () => {
  const calls: string[][] = [];
  const call = async (args: string[]) => {
    calls.push(args);
    if (args[1] === 'get') return { pane: { pane_id: 'w1:p2', workspace_id: 'w1' } };
    if (args[1] === 'process-info')
      return {
        process_info: {
          foreground_processes: [
            { argv: ['node', fileURLToPath(new URL('../src/cli.js', import.meta.url)), '--pane'] },
          ],
        },
      };
    return {};
  };
  await closeAcademyPane(
    { HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p2', HERDR_WORKSPACE_ID: 'w1' },
    call,
  );
  expect(calls.at(-1)).toEqual(['plugin', 'pane', 'close', 'w1:p2']);
  expect(calls.some((args) => args.includes('w1:p1'))).toBe(false);
});
it('refuses to close a coding pane or a pane in another workspace', async () => {
  for (const workspace of ['w1', 'other']) {
    const calls: string[][] = [];
    const call = async (args: string[]) => {
      calls.push(args);
      return args[1] === 'get'
        ? { pane: { pane_id: 'w1:p1', workspace_id: workspace } }
        : { process_info: { foreground_processes: [{ argv: ['codex'] }] } };
    };
    await expect(
      closeAcademyPane({ HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p1', HERDR_WORKSPACE_ID: 'w1' }, call),
    ).rejects.toThrow('doğrulanamadı');
    expect(calls.some((args) => args.includes('close'))).toBe(false);
  }
});
