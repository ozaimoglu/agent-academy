import { it, expect } from 'vitest';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { temp } from './helpers.js';
import { createHerdrCall } from '../src/integration/herdr.js';

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
