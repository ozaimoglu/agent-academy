import { it, expect } from 'vitest';
import { readFile, writeFile, symlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { temp, workspace } from './helpers.js';
import {
  defaultConfig,
  loadConfig,
  saveConfig,
  consentKey,
  validateProvider,
} from '../src/storage/config.js';
import { redact, readSource } from '../src/core/privacy.js';

it('persists all onboarding preferences atomically with restrictive permissions', async () => {
  const dir = await temp();
  const config = defaultConfig();
  expect(config.depth).toBe('deep');
  expect(config.provider.kind).toBe('offline');
  config.onboarded = true;
  config.styles = ['code', 'senior'];
  config.priorities = ['spring'];
  await saveConfig(dir, config);
  expect(await loadConfig(dir)).toEqual(config);
  expect((await stat(path.join(dir, 'settings.json'))).mode & 0o777).toBe(0o600);
});
it('does not silently replace malformed settings', async () => {
  const dir = await temp();
  await writeFile(path.join(dir, 'settings.json'), 'broken');
  await expect(loadConfig(dir)).rejects.toThrow('Ayarlar');
});
it('requires endpoint/model-specific external consent and never stores a raw key', async () => {
  const dir = await temp();
  const config = defaultConfig();
  config.provider = {
    ...config.provider,
    kind: 'remote',
    model: 'chosen-model',
    baseUrl: 'https://example.com/v1',
    keyEnv: 'ACADEMY_API_KEY',
  };
  await expect(saveConfig(dir, config)).rejects.toThrow('izni');
  config.provider.consent = consentKey(config.provider);
  await saveConfig(dir, config);
  expect(await readFile(path.join(dir, 'settings.json'), 'utf8')).not.toContain('secret-value');
  config.provider.model = 'different';
  expect(() => validateProvider(config.provider)).toThrow('izni');
});
it('requires explicit remote mode for LAN and rejects insecure remote URLs', () => {
  const p = {
    ...defaultConfig().provider,
    kind: 'local' as const,
    model: 'local-model',
    baseUrl: 'http://192.168.1.2:11434/v1',
  };
  expect(() => validateProvider(p)).toThrow('loopback');
  expect(() => validateProvider({ ...p, kind: 'remote' })).toThrow('HTTPS');
  expect(() => validateProvider({ ...p, baseUrl: 'http://user:password@localhost/v1' })).toThrow(
    'kimlik',
  );
});
it('redacts obvious secrets and terminal control sequences before persistence or upload', () => {
  const source =
    'API_KEY=supersecret password="my pass" Bearer abcd sk-abcdefghijk ghp_abcdefghijk https://name:pass@example.com\n-----BEGIN PRIVATE KEY-----\nhidden\n-----END PRIVATE KEY-----\n\x1b]52;c;base64-secret\x07visible';
  const out = redact(source);
  for (const secret of [
    'supersecret',
    'my pass',
    'abcd',
    'abcdefghijk',
    'name:pass',
    'hidden',
    'base64-secret',
  ])
    expect(out).not.toContain(secret);
  expect(out).toContain('visible');
});
it('limits source reads to the selected project and excludes secrets, symlink escapes and oversized files', async () => {
  const { root, d } = await workspace();
  await writeFile(path.join(root, 'safe.ts'), 'const answer = 42;\n');
  expect((await readSource(root, 'safe.ts')).text).toContain('1 │ const answer');
  await writeFile(path.join(d, 'outside'), 'secret');
  await symlink(path.join(d, 'outside'), path.join(root, 'escape'));
  await expect(readSource(root, 'escape')).rejects.toThrow('Proje dışı');
  await writeFile(path.join(root, '.env'), 'TOKEN=secret');
  await expect(readSource(root, '.env')).rejects.toThrow('hassas');
  await writeFile(path.join(root, 'large'), 'x'.repeat(600000));
  await expect(readSource(root, 'large')).rejects.toThrow('boyut');
});
it('redacts prefixed environment secrets, authorization headers and database URL passwords', () => {
  const out = redact(
    'OPENAI_API_KEY=plain-secret AWS_SECRET_ACCESS_KEY=cloud-secret Authorization: Bearer header-secret\n--password cli-secret postgresql://user:db-secret@localhost/db',
  );
  for (const secret of ['plain-secret', 'cloud-secret', 'header-secret', 'cli-secret', 'db-secret'])
    expect(out).not.toContain(secret);
});
it('binds remote source consent to the canonical selected project', () => {
  const p = {
    ...defaultConfig().provider,
    kind: 'remote' as const,
    model: 'test',
    baseUrl: 'https://example.com/v1',
  };
  p.consent = consentKey(p);
  expect(() => validateProvider(p, '/project/a')).toThrow('Bu proje');
  p.approvedProjects = [consentKey(p, '/project/a')];
  expect(() => validateProvider(p, '/project/a')).not.toThrow();
  expect(() => validateProvider(p, '/project/b')).toThrow('Bu proje');
});
