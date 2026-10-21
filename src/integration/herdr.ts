import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { academyPaths, canonical, hash, safeText } from '../core/privacy.js';
import { loadConfig } from '../storage/config.js';
const exec = promisify(execFile);
export const PLUGIN_ID = 'local.agent-academy';
export interface HerdrPane {
  pane_id: string;
  workspace_id: string;
  foreground_cwd?: string;
  cwd?: string;
  agent?: string;
  agent_session?: { agent: string; kind: string; value: string };
}
export type HerdrCall = (args: string[]) => Promise<any>;
export function createHerdrCall(env: NodeJS.ProcessEnv = process.env): HerdrCall {
  return async (args) => {
    if (env.HERDR_ENV !== '1') throw new Error('Bu işlem Herdr içinde çalıştırılmalı.');
    try {
      const result = await exec(env.HERDR_BIN_PATH ?? 'herdr', args, {
        env,
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      });
      const response = JSON.parse(result.stdout);
      if (response.error)
        throw new Error(
          [response.error.code, response.error.message].filter(Boolean).join(': ') ||
            'Herdr API hatası',
        );
      return response.result;
    } catch (e) {
      let reason = e instanceof Error ? e.message.slice(0, 160) : 'bağlantı yok';
      try {
        const body = JSON.parse((e as { stderr?: string }).stderr ?? '');
        if (body.error?.code)
          reason = [body.error.code, body.error.message].filter(Boolean).join(': ');
      } catch {
        /* Non-JSON transport failure. */
      }
      throw new Error(
        `Herdr çağrısı başarısız (${args.slice(0, 2).join(' ')}): ${safeText(reason, 600)}`,
      );
    }
  };
}
export async function associatedPane(
  call: HerdrCall,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HerdrPane | undefined> {
  const target = env.ACADEMY_TARGET_PANE_ID;
  if (!target) return undefined;
  const result = await call(['pane', 'get', target]);
  const pane = result.pane as HerdrPane | undefined;
  if (!pane || (env.HERDR_WORKSPACE_ID && pane.workspace_id !== env.HERDR_WORKSPACE_ID))
    return undefined;
  return pane;
}
interface PaneRecord {
  target: string;
  panel: string;
  workspace: string;
  socket: string;
}
async function owns(call: HerdrCall, id: string, entry: string): Promise<boolean> {
  const r = await call(['pane', 'process-info', '--pane', id]);
  return (r.process_info?.foreground_processes ?? []).some(
    (p: any) =>
      p.argv?.some((a: string) => path.resolve(a) === entry) && p.argv?.includes('--pane'),
  );
}
/** Closing from inside the panel leaves a harmless stale record for the next open to prune. */
export async function closeAcademyPane(
  env: NodeJS.ProcessEnv = process.env,
  call: HerdrCall = createHerdrCall(env),
) {
  if (env.HERDR_ENV !== '1' || !env.HERDR_PANE_ID || !env.HERDR_WORKSPACE_ID)
    throw new Error('Academy pane bağlamı gerekli.');
  const pane = (await call(['pane', 'get', env.HERDR_PANE_ID])).pane as HerdrPane | undefined;
  const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../cli.js');
  if (
    !pane ||
    pane.pane_id !== env.HERDR_PANE_ID ||
    pane.workspace_id !== env.HERDR_WORKSPACE_ID ||
    !(await owns(call, pane.pane_id, entry))
  )
    throw new Error('Bu pane Academy olarak doğrulanamadı; kapatılmadı.');
  await call(['plugin', 'pane', 'close', pane.pane_id]);
}
export async function pluginAction(
  action: string,
  env: NodeJS.ProcessEnv = process.env,
  call: HerdrCall = createHerdrCall(env),
) {
  if (!['open', 'close', 'toggle'].includes(action)) throw new Error('Geçersiz plugin eylemi.');
  if (
    env.HERDR_ENV !== '1' ||
    !env.HERDR_PANE_ID ||
    !env.HERDR_WORKSPACE_ID ||
    !env.HERDR_SOCKET_PATH
  )
    throw new Error('Herdr pane/workspace/socket bağlamı gerekli.');
  const paths = academyPaths(env);
  const config = await loadConfig(paths.config);
  const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../cli.js');
  const recordDir = path.join(paths.state, 'panes');
  await mkdir(recordDir, { recursive: true, mode: 0o700 });
  const scope = hash(env.HERDR_SOCKET_PATH + '|' + env.HERDR_WORKSPACE_ID);
  const recordFile = path.join(recordDir, scope + '.json');
  const lock = recordFile + '.lock';
  for (let tries = 0; ; tries++) {
    try {
      await mkdir(lock);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (Date.now() - (await stat(lock)).mtimeMs > 30000) {
        await rm(lock, { recursive: true, force: true });
        continue;
      }
      if (tries > 50) throw new Error('Başka bir Academy eylemi sürüyor.');
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    let records: PaneRecord[] = [];
    try {
      records = JSON.parse(await readFile(recordFile, 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    const ownRecord = records.find((r) => r.panel === env.HERDR_PANE_ID);
    const target = ownRecord?.target ?? env.HERDR_PANE_ID;
    const paneResult = await call(['pane', 'get', target]);
    const pane = paneResult.pane as HerdrPane;
    if (!pane || pane.workspace_id !== env.HERDR_WORKSPACE_ID)
      throw new Error('Hedef pane bu workspace içinde değil.');
    const existing = records.find((r) => r.target === target && r.socket === env.HERDR_SOCKET_PATH);
    if (existing) {
      const list = await call(['pane', 'list', '--workspace', pane.workspace_id]);
      const live = (list.panes ?? []).some((p: HerdrPane) => p.pane_id === existing.panel);
      if (live) {
        if (!(await owns(call, existing.panel, entry)))
          throw new Error('Kayıtlı pane Academy olarak doğrulanamadı; kapatılmadı.');
        if (action === 'open') return;
        try {
          await call(['plugin', 'pane', 'close', existing.panel]);
        } catch (e) {
          if (!(e instanceof Error) || !e.message.includes('plugin_pane_not_found')) throw e;
          await call(['pane', 'close', existing.panel]);
        }
        records = records.filter((r) => r !== existing);
        await writeFile(recordFile, JSON.stringify(records), { mode: 0o600 });
        return;
      }
      records = records.filter((r) => r !== existing);
    }
    if (action === 'close') return;
    const cwd = await canonical(pane.foreground_cwd ?? pane.cwd ?? '');
    const response = await call([
      'plugin',
      'pane',
      'open',
      '--plugin',
      PLUGIN_ID,
      '--entrypoint',
      'academy',
      '--placement',
      'split',
      '--direction',
      'right',
      '--target-pane',
      target,
      // Split placement derives workspace from target; Herdr rejects workspace_id here.
      '--cwd',
      cwd,
      '--env',
      `ACADEMY_TARGET_PANE_ID=${target}`,
      '--env',
      `ACADEMY_PROJECT=${cwd}`,
      '--no-focus',
    ]);
    const panel = response.plugin_pane?.pane as HerdrPane | undefined;
    if (!panel?.pane_id) throw new Error('Herdr yeni Academy pane kimliğini döndürmedi.');
    records.push({
      target,
      panel: panel.pane_id,
      workspace: pane.workspace_id,
      socket: env.HERDR_SOCKET_PATH,
    });
    await writeFile(recordFile, JSON.stringify(records), { mode: 0o600 });
    // New plugin splits start at 0.5. Move the divider from the LEFT target pane.
    const delta = (100 - config.panelWidth) / 100 - 0.5;
    if (Math.abs(delta) > 0.001)
      await call([
        'pane',
        'resize',
        '--pane',
        target,
        '--direction',
        delta > 0 ? 'right' : 'left',
        '--amount',
        Math.abs(delta).toFixed(3),
      ]);
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
