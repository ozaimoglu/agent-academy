import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { access, readFile, writeFile, readdir, mkdtemp, rm, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = (value) => createHash('sha256').update(value).digest('hex');
async function artifacts(directory, prefix = '') {
  const hashes = {};
  for (const entry of (await readdir(path.join(directory, prefix), { withFileTypes: true })).sort(
    (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  )) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink())
      throw new Error('Derleme çıktısında sembolik bağlantı kabul edilmiyor.');
    if (entry.isDirectory()) Object.assign(hashes, await artifacts(directory, relative));
    else if (entry.isFile() && entry.name.endsWith('.js'))
      hashes[relative] = digest(await readFile(path.join(directory, relative)));
  }
  return hashes;
}
async function sourceRevision() {
  try {
    const { stdout } = await exec('git', ['-C', root, 'rev-parse', 'HEAD'], { timeout: 5000 });
    const { stdout: status } = await exec(
      'git',
      ['-C', root, 'status', '--porcelain', '--untracked-files=normal'],
      { timeout: 5000 },
    );
    return { commit: stdout.trim(), dirty: !!status.trim() };
  } catch {
    return { commit: null, dirty: null };
  }
}
async function main() {
  const { values } = parseArgs({
    options: { dist: { type: 'string' }, record: { type: 'boolean' }, help: { type: 'boolean' } },
  });
  if (values.help) {
    console.log(
      'node scripts/verify-install.mjs [--dist PATH] [--record]\nVarsayılan: kurulum kaydını ve çevrimdışı hattı doğrula. --record: yeni derleme kaydı oluştur.',
    );
    return;
  }
  const dist = path.resolve(values.dist ?? path.join(root, 'dist'));
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const hashes = await artifacts(dist);
  if (!hashes['cli.js']) throw new Error('dist/cli.js eksik. Kurulum scriptini çalıştırın.');
  const lockfileSha256 = digest(await readFile(path.join(root, 'package-lock.json')));
  const manifestSha256 = digest(await readFile(path.join(root, 'herdr-plugin.toml')));
  let runtimeExecutable = process.execPath;
  if (!values.record) {
    let saved;
    try {
      saved = JSON.parse(await readFile(path.join(dist, 'install-info.json'), 'utf8'));
    } catch {
      throw new Error(
        'Geçerli kurulum kaydı yok. ./scripts/install.sh ile doğrulanmış bir derleme oluşturun.',
      );
    }
    if (
      saved.formatVersion !== 1 ||
      saved.version !== pkg.version ||
      saved.lockfileSha256 !== lockfileSha256 ||
      saved.manifestSha256 !== manifestSha256 ||
      JSON.stringify(saved.artifacts) !== JSON.stringify(hashes)
    )
      throw new Error(
        'Kurulum bütünlüğü eşleşmiyor. Kaynaklar veya derleme değişmiş; kurulumu yeniden çalıştırın.',
      );
    const executable = (await readFile(path.join(dist, 'node-executable'), 'utf8')).trim();
    if (executable !== saved.runtime?.executable || !path.isAbsolute(executable))
      throw new Error('Kaydedilen Node çalıştırıcısı tutarsız.');
    await access(executable, constants.X_OK);
    runtimeExecutable = executable;
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'academy-install-check-'));
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const database = new DatabaseSync(':memory:');
    database.exec('CREATE TABLE health (ok INTEGER); INSERT INTO health VALUES (1);');
    if (database.prepare('SELECT ok FROM health').get()?.ok !== 1)
      throw new Error('SQLite kontrolü başarısız.');
    database.close();
    const options = {
      cwd: root,
      env: { ...process.env, TMPDIR: temporary, HERDR_ENV: '0' },
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
    };
    const help = await exec(
      runtimeExecutable,
      ['--disable-warning=ExperimentalWarning', path.join(dist, 'cli.js'), '--help'],
      options,
    );
    if (!help.stdout.includes('Agent Academy') || !help.stdout.includes('--headless'))
      throw new Error('CLI yardım sözleşmesi doğrulanamadı.');
    const demo = await exec(
      runtimeExecutable,
      ['--disable-warning=ExperimentalWarning', path.join(dist, 'cli.js'), '--demo', '--headless'],
      options,
    );
    if (
      !demo.stdout.includes('# Agent Academy') ||
      !demo.stdout.includes('DEMO FIXTURE') ||
      !demo.stdout.includes('Gerçek test sonuçları')
    )
      throw new Error('Çevrimdışı gözlem/öğretim/rapor hattı doğrulanamadı.');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  if (values.record) {
    if (!path.isAbsolute(process.execPath) || /[\r\n]/.test(process.execPath))
      throw new Error('Node çalıştırıcı yolu kaydedilemiyor.');
    const record = {
      formatVersion: 1,
      name: pkg.name,
      version: pkg.version,
      source: await sourceRevision(),
      runtime: {
        node: process.version,
        executable: process.execPath,
        platform: process.platform,
        arch: process.arch,
      },
      validatedAt: new Date().toISOString(),
      lockfileSha256,
      manifestSha256,
      artifacts: hashes,
      checks: ['sqlite', 'cli-help', 'offline-observation-teaching-report'],
    };
    const temporaryRecord = path.join(dist, `install-info.${process.pid}.tmp`);
    await writeFile(temporaryRecord, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
    await rename(temporaryRecord, path.join(dist, 'install-info.json'));
    await writeFile(path.join(dist, 'node-executable'), process.execPath + '\n', { mode: 0o600 });
  }
  console.log(`  DOĞRULANDI · Academy ${pkg.version} · SQLite / CLI / çevrimdışı uçtan uca hat`);
  console.log('  Dış servise istek ve kullanıcı projesi okuması yapılmadı.');
}
main().catch((error) => {
  // Do not echo child stderr: environments and diagnostics can contain credentials.
  console.error(
    'DOĞRULAMA: ' +
      (error.code === 'ENOENT'
        ? 'Gerekli kurulum dosyası bulunamadı.'
        : error.stdout !== undefined
          ? 'Uygulama kabul kontrolünü geçemedi; dist ve Node sürümünü kontrol edin.'
          : error.message),
  );
  process.exitCode = 5;
});
