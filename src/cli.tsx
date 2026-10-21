#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { academyPaths, canonical, safeText } from './core/privacy.js';
import { loadConfig, defaultConfig, consentKey, sharesExternally } from './storage/config.js';
import { checkCodex } from './providers/codex-cli.js';
import { LessonStore } from './storage/store.js';
import { Academy } from './core/academy.js';
import { AcademyTUI } from './ui/app.js';
import { pluginAction, createHerdrCall, closeAcademyPane } from './integration/herdr.js';
import { prepareDemo } from './demo.js';

const help = `Agent Academy 0.1.0 · Yerel mühendislik öğrenme arkadaşı

Herdr içinde: herdr plugin action invoke local.agent-academy.open
Bağımsız:     npm start -- --project /mutlak/proje/yolu
Demo:         npm run demo
Rapor demosu: npm start -- --demo --headless

--project PATH       Seçili projenin gerçek dizini
--sessions-dir PATH  Codex JSONL oturum dizini (varsayılan CODEX_HOME/sessions)
--session ID         Aynı projedeki oturumun açık seçimi
--config-dir PATH    Ayar dizini
--state-dir PATH     SQLite ve rapor dizini
--demo               İzole, deterministik fixture; uzak API kullanılmaz
--headless           Bir gözlem turu çalıştır ve Markdown raporu yazdır
--no-onboarding      Mevcut/varsayılan ayarlarla TUI aç
--doctor             Araç ve veri erişimi tanısı
--verify-install     Kurulum bütünlüğü ve çevrimdışı kabul kontrolü
--help               Bu yardım

Panel beklemede açılır. B başlat · D durdur · Q paneli kapat / çık
TUI: 1–6 sekme · S ayarlar · C oturum · G açıkla · E dışa aktar · Z geniş
WHY: ,/. bölüm · Enter içindekiler · [/] ders
ASK: A yaz · P öneri · K kavram · Enter sor`;
async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean' },
      project: { type: 'string' },
      'sessions-dir': { type: 'string' },
      session: { type: 'string' },
      'config-dir': { type: 'string' },
      'state-dir': { type: 'string' },
      demo: { type: 'boolean' },
      headless: { type: 'boolean' },
      doctor: { type: 'boolean' },
      'verify-install': { type: 'boolean' },
      pane: { type: 'boolean' },
      action: { type: 'string' },
      'no-onboarding': { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  if (values['verify-install']) {
    const verifier = fileURLToPath(new URL('../scripts/verify-install.mjs', import.meta.url));
    try {
      const result = await promisify(execFile)(
        process.execPath,
        ['--disable-warning=ExperimentalWarning', verifier],
        { timeout: 60000, maxBuffer: 2 * 1024 * 1024 },
      );
      console.log(result.stdout.trim());
    } catch (error) {
      throw new Error(
        safeText(
          (error as { stderr?: string }).stderr ??
            'Kurulum doğrulanamadı. Kurulum rehberini kontrol edin.',
          600,
        ),
      );
    }
    return;
  }
  if (values.action) {
    await pluginAction(values.action);
    return;
  }
  let paths = academyPaths();
  let project = values.project ?? process.env.ACADEMY_PROJECT;
  if (values.demo) {
    const demo = await prepareDemo();
    paths = { config: demo.config, state: demo.state, sessions: demo.sessions };
    project = demo.project;
  }
  paths = {
    config: values['config-dir'] ?? paths.config,
    state: values['state-dir'] ?? paths.state,
    sessions: values['sessions-dir'] ?? paths.sessions,
  };
  if (!project && values.pane && process.env.HERDR_ENV === '1') {
    // Plugin process cwd is the plugin root. Resolve the invocation context explicitly.
    const context = JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON ?? '{}');
    project = context.focused_pane_cwd ?? context.worktree?.checkout_path;
    if (!project && process.env.ACADEMY_TARGET_PANE_ID) {
      const r = await createHerdrCall()(['pane', 'get', process.env.ACADEMY_TARGET_PANE_ID]);
      project = r.pane?.foreground_cwd ?? r.pane?.cwd;
    }
    if (!project)
      throw new Error('Plugin proje bağlamı bulunamadı. Pane’i Academy open eylemiyle açın.');
  }
  const root = await canonical(project ?? process.cwd());
  if (values.doctor) {
    const exec = promisify(execFile);
    const checks: string[] = [
      `Node: ${process.version}`,
      `Node çalıştırıcı: ${process.execPath}`,
      `Proje: ${root}`,
      `Ayarlar: ${paths.config}`,
      `Yerel depo: ${paths.state}`,
    ];
    try {
      const record = JSON.parse(
        await readFile(new URL('./install-info.json', import.meta.url), 'utf8'),
      );
      checks.unshift(
        `Academy: ${record.version} · revizyon ${record.source?.commit ?? 'bilinmiyor'}${record.source?.dirty ? ' (değiştirilmiş checkout)' : ''}`,
        `Kurulum doğrulaması: ${record.validatedAt ?? 'bilinmiyor'}`,
      );
    } catch {
      checks.unshift('Academy: geliştirme derlemesi · doğrulanmış kurulum kaydı yok');
    }
    for (const command of ['herdr', 'codex'])
      try {
        const r = await exec(command, ['--version'], { timeout: 5000 });
        checks.push(`${command}: ${r.stdout.trim()}`);
      } catch {
        checks.push(`${command}: bulunamadı veya erişilemiyor`);
      }
    try {
      await access(paths.sessions);
      checks.push('Codex oturum dizini: erişilebilir');
    } catch {
      checks.push('Codex oturum dizini: henüz yok / erişilemiyor');
    }
    checks.push(`Herdr bağlamı: ${process.env.HERDR_ENV === '1' ? 'var' : 'yok'}`);
    try {
      await checkCodex(process.env.ACADEMY_CODEX_BIN || 'codex');
      checks.push(
        'Codex açıklama sağlayıcısı: hazır · ChatGPT girişi / Codex kotası (model isteği yapılmadı)',
      );
    } catch (error) {
      checks.push(`Codex açıklama sağlayıcısı: ${safeText((error as Error).message, 250)}`);
    }
    console.log(checks.join('\n'));
    return;
  }
  const config = values.demo ? defaultConfig() : await loadConfig(paths.config);
  if (
    sharesExternally(config.provider) &&
    !config.provider.approvedProjects.includes(consentKey(config.provider, root))
  )
    config.onboarded = false;
  if (values['no-onboarding']) config.onboarded = true;
  const store = new LessonStore(paths.state);
  const env = values.demo
    ? { ...process.env, HERDR_ENV: '0', ACADEMY_TARGET_PANE_ID: undefined }
    : process.env;
  const academy = new Academy(root, paths.sessions, paths.state, config, store, env);
  let screen: ReturnType<typeof render> | undefined;
  let alternate = false;
  const term = () => {
    screen?.unmount();
  };
  process.once('SIGTERM', term);
  try {
    if (values.headless || values.session) {
      await academy.tick();
      if (values.session) {
        const s = academy.snapshot.sessions.find((s) => s.id === values.session);
        if (!s) throw new Error('İstenen oturum seçili projede bulunamadı.');
        await academy.select(s);
        await academy.tick();
      }
    }
    if (values.headless) {
      if (!academy.snapshot.selected)
        throw new Error(academy.snapshot.status + ' --session ID ile seçin.');
      await academy.beginLearning({ replay: true });
      await academy.settle();
      if (!config.provider.autoAnalyze) {
        academy.requestLesson();
        await academy.settle();
      }
      console.log(academy.report());
      console.error('Rapor: ' + (await academy.export()));
      return;
    }
    if (!process.stdin.isTTY)
      throw new Error('Etkileşimli terminal gerekli. Rapor için --headless kullanın.');
    process.stdout.write('\x1b[?1049h');
    alternate = true;
    screen = render(
      <AcademyTUI
        academy={academy}
        initialConfig={config}
        configDir={paths.config}
        demo={values.demo}
        onClosePanel={
          values.pane && process.env.HERDR_ENV === '1'
            ? async () => {
                await closeAcademyPane();
              }
            : undefined
        }
      />,
      { exitOnCtrlC: true },
    );
    await screen.waitUntilExit();
  } finally {
    process.removeListener('SIGTERM', term);
    await academy.stop();
    store.close();
    if (alternate) process.stdout.write('\x1b[?1049l');
  }
}
main().catch((e) => {
  console.error(
    'Agent Academy: ' + safeText(e instanceof Error ? e.message : 'Bilinmeyen hata', 600),
  );
  process.exitCode = 1;
});
