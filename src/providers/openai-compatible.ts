import type { LLMProvider, ModelReply } from '../core/types.js';
import type { ProviderConfig } from '../storage/config.js';
import { validateProvider } from '../storage/config.js';
import { safeText } from '../core/privacy.js';

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  constructor(
    private config: ProviderConfig,
    private env: NodeJS.ProcessEnv = process.env,
  ) {
    validateProvider(config);
    this.name = `${config.kind}:${config.model}`;
  }
  async explain(system: string, context: string, signal?: AbortSignal): Promise<ModelReply> {
    validateProvider(this.config);
    const key = this.config.keyEnv ? this.env[this.config.keyEnv] : undefined;
    if (this.config.keyEnv && !key)
      throw new Error(`${this.config.keyEnv} ortam değişkeni bulunamadı.`);
    const timeout = AbortSignal.timeout(120000);
    const response = await fetch(this.config.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: context },
        ],
        [this.config.kind === 'local' ? 'max_tokens' : this.config.tokenParameter]:
          this.config.maxOutputTokens,
      }),
    });
    // Do not echo provider error bodies: they may contain echoed credentials or project context.
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Model isteği başarısız: HTTP ${response.status}.`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Sağlayıcı boş yanıt döndürdü.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw new Error('Model yanıtı 1 MiB sınırını aştı.');
      }
      chunks.push(value);
    }
    let body: any;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new Error('Sağlayıcı geçersiz JSON döndürdü.');
    }
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Model metin yanıtı döndürmedi.');
    if (body.choices?.[0]?.finish_reason === 'length')
      throw new Error('Model çıktısı kesildi. Ayarlardan çıktı bütçesini artırın.');
    const u = body.usage;
    return {
      text: safeText(text, 256000),
      usage:
        u && Number.isFinite(u.prompt_tokens) && Number.isFinite(u.completion_tokens)
          ? { input: u.prompt_tokens, output: u.completion_tokens, estimated: false }
          : {
              input: Math.ceil((system.length + context.length) / 4),
              output: Math.ceil(text.length / 4),
              estimated: true,
            },
    };
  }
}
export function createProvider(config: ProviderConfig, project?: string): LLMProvider | undefined {
  if (config.kind === 'offline') return undefined;
  validateProvider(config, project);
  return new OpenAICompatibleProvider(config);
}
