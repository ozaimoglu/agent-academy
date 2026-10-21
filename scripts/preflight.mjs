import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireHerdr = process.argv.slice(2).includes('--require-herdr');
function fail(message) {
  throw new Error(message);
}
function version(value) {
  const match = value.match(/(?:^|\s)v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) fail(`Sürüm okunamadı: ${value.slice(0, 100)}`);
  return match.slice(1).map(Number);
}
function atLeast(value, minimum) {
  const parts = version(value);
  return (
    parts[0] > minimum[0] ||
    (parts[0] === minimum[0] &&
      (parts[1] > minimum[1] || (parts[1] === minimum[1] && parts[2] >= minimum[2])))
  );
}
function command(binary, args) {
  try {
    return execFileSync(binary, args, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    fail(
      `${binary} çalıştırılamıyor. Aracı kurup aynı terminalin PATH değişkeninden erişilebilir yapın.`,
    );
  }
}
try {
  if (!['linux', 'darwin'].includes(process.platform)) fail('Bu sürüm Linux ve macOS destekler.');
  if (!atLeast(process.version, [22, 19, 0])) fail('Node.js >=22.19 gerekli.');
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const manifest = readFileSync(path.join(root, 'herdr-plugin.toml'), 'utf8').split('[[build]]')[0];
  if (
    manifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1] !== pkg.version ||
    lock.packages?.['']?.version !== pkg.version
  )
    fail('Paket, lockfile ve plugin sürümleri tutarsız. Kaynak checkout’unu kontrol edin.');
  const npm = command('npm', ['--version']);
  if (!atLeast(npm, [9, 0, 0])) fail('Lockfile v3 için npm >=9 gerekli.');
  const git = command('git', ['--version']);
  let herdr = 'opsiyonel; bu derlemede Herdr kaydı istenmedi';
  if (requireHerdr) {
    herdr = command('herdr', ['--version']);
    if (!atLeast(herdr, [0, 9, 3])) fail('Herdr >=0.9.3 gerekli.');
  }
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE installation_check (ok INTEGER);');
  db.close();
  console.log(`  Academy ${pkg.version} · ${process.platform}/${process.arch}`);
  console.log(`  Node ${process.version} · npm ${npm} · ${git}`);
  console.log(`  Herdr: ${herdr}`);
  console.log('  SQLite: hazır · model/kimlik bilgisi gerekmez');
} catch (error) {
  console.error(`ÖNKOŞUL: ${error.message}`);
  process.exitCode = 2;
}
