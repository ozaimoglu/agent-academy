import { z } from 'zod';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hash } from '../core/privacy.js';

export const providerSchema = z.object({
  kind: z.enum(['offline', 'local', 'remote', 'codex']).default('offline'),
  baseUrl: z.string().default('http://127.0.0.1:11434/v1'),
  model: z.string().default(''),
  keyEnv: z
    .string()
    .regex(/^(?:[A-Za-z_][A-Za-z0-9_]*)?$/)
    .default(''),
  consent: z.string().default(''),
  approvedProjects: z.array(z.string()).default([]),
  minIntervalSeconds: z.number().int().min(15).max(3600).default(60),
  tokenParameter: z.enum(['max_tokens', 'max_completion_tokens']).default('max_completion_tokens'),
  maxOutputTokens: z.number().int().min(512).max(32768).default(8192),
  contextChars: z.number().int().min(8000).max(100000).default(40000),
  codexTimeoutSeconds: z.number().int().min(30).max(900).default(240),
  codexCredentialStore: z.enum(['auto', 'file', 'keyring']).default('auto'),
  autoAnalyze: z.boolean().default(true),
});
export const configSchema = z.object({
  version: z.literal(1).default(1),
  onboarded: z.boolean().default(false),
  language: z.literal('tr').default('tr'),
  depth: z.enum(['quick', 'balanced', 'deep']).default('deep'),
  styles: z
    .array(z.enum(['visual', 'code', 'fundamentals', 'senior', 'interactive']))
    .min(1)
    .default(['visual', 'code', 'fundamentals', 'senior']),
  priorities: z.array(z.string()).min(1).default(['everything']),
  panelWidth: z.number().min(25).max(60).default(38),
  provider: providerSchema.default(() => providerSchema.parse({})),
});
export type Config = z.infer<typeof configSchema>;
export type ProviderConfig = Config['provider'];
export const defaultConfig = (): Config => configSchema.parse({});
export const sharesExternally = (p: ProviderConfig) => p.kind === 'remote' || p.kind === 'codex';
export const providerDestination = (p: ProviderConfig) =>
  p.kind === 'codex' ? 'Codex CLI · OpenAI / ChatGPT hesabı' : p.baseUrl;
export const consentKey = (p: ProviderConfig, project?: string) =>
  hash(
    `${p.kind}|${p.kind === 'codex' ? 'chatgpt' : p.baseUrl}|${p.model}${project ? '|' + project : ''}`,
  );
export function isLoopback(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      ['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname) &&
      ['http:', 'https:'].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash
    );
  } catch {
    return false;
  }
}
export function validateProvider(p: ProviderConfig, project?: string) {
  if (p.kind === 'offline') return;
  if (p.kind !== 'codex') {
    if (!p.model.trim()) throw new Error('Model adı gerekli.');
    const u = new URL(p.baseUrl);
    if (u.username || u.password || u.search || u.hash)
      throw new Error('URL içinde kimlik bilgisi veya sorgu kullanmayın.');
    if (p.kind === 'local' && !isLoopback(p.baseUrl))
      throw new Error(
        'Yerel sağlayıcı loopback adresi kullanmalı. LAN için uzak sağlayıcıyı ve açık izni seçin.',
      );
    if (p.kind === 'remote' && u.protocol !== 'https:')
      throw new Error('Uzak sağlayıcı HTTPS gerektirir.');
  }
  if (sharesExternally(p) && project && !p.approvedProjects.includes(consentKey(p, project)))
    throw new Error(
      'Bu proje için uzak modele veri gönderme izni gerekli. Onboarding veya Ayarlar ekranını açın.',
    );
  if (sharesExternally(p) && p.consent !== consentKey(p))
    throw new Error('Bu sağlayıcı, model ve adres için açık veri paylaşım izni gerekli.');
}
export async function loadConfig(dir: string): Promise<Config> {
  try {
    return configSchema.parse(JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8')));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return defaultConfig();
    throw new Error(`Ayarlar okunamadı: ${e instanceof Error ? e.message : 'geçersiz dosya'}`);
  }
}
export async function saveConfig(dir: string, config: Config) {
  const valid = configSchema.parse(config);
  validateProvider(valid.provider);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const destination = path.join(dir, 'settings.json');
  const temp = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify(valid, null, 2) + '\n', { mode: 0o600 });
  await rename(temp, destination);
}
