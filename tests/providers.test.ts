import { afterEach, it, expect, vi } from 'vitest';
import { OpenAICompatibleProvider } from '../src/providers/openai-compatible.js';
import { defaultConfig } from '../src/storage/config.js';
afterEach(() => vi.unstubAllGlobals());
const local = () => ({ ...defaultConfig().provider, kind: 'local' as const, model: 'test-model' });
it('sends the verified OpenAI-compatible request contract, no tools, and reads actual usage', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"title":"lesson"}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 123, completion_tokens: 45 },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  const provider = new OpenAICompatibleProvider(
    { ...local(), keyEnv: 'TEST_KEY' },
    { TEST_KEY: 'secret-value' },
  );
  const result = await provider.explain('instructions', 'evidence');
  const [url, request] = fetch.mock.calls[0]!;
  const body = JSON.parse(request.body);
  expect(url).toBe('http://127.0.0.1:11434/v1/chat/completions');
  expect(body.tools).toBeUndefined();
  expect(body.max_tokens).toBe(8192);
  expect(request.headers.Authorization).toBe('Bearer secret-value');
  expect(request.redirect).toBe('error');
  expect(result.usage).toEqual({ input: 123, output: 45, estimated: false });
});
it('labels estimates when usage is unavailable', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'answer' } }] })),
      ),
  );
  const result = await new OpenAICompatibleProvider(local()).explain('system', 'context');
  expect(result.usage?.estimated).toBe(true);
});
it('handles provider failure without leaking response bodies or credentials', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('secret-value project source', { status: 401 })),
  );
  await expect(new OpenAICompatibleProvider(local()).explain('s', 'c')).rejects.toThrow('HTTP 401');
});
it('fails missing credentials before attempting the request', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const p = new OpenAICompatibleProvider({ ...local(), keyEnv: 'MISSING_KEY' }, {});
  await expect(p.explain('s', 'c')).rejects.toThrow('MISSING_KEY');
  expect(fetch).not.toHaveBeenCalled();
});
it('does not retry redirects or connection failures', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
  vi.stubGlobal('fetch', fetch);
  await expect(new OpenAICompatibleProvider(local()).explain('s', 'c')).rejects.toThrow(
    'fetch failed',
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('propagates cancellation and bounds overly large or malformed responses', async () => {
  const fetch = vi.fn().mockImplementation((_url, request) => {
    expect(request.signal.aborted).toBe(true);
    throw new Error('aborted');
  });
  vi.stubGlobal('fetch', fetch);
  const controller = new AbortController();
  controller.abort();
  await expect(
    new OpenAICompatibleProvider(local()).explain('s', 'c', controller.signal),
  ).rejects.toThrow('aborted');
  fetch.mockResolvedValue(new Response('x'.repeat(1024 * 1024 + 1)));
  await expect(new OpenAICompatibleProvider(local()).explain('s', 'c')).rejects.toThrow('1 MiB');
  fetch.mockResolvedValue(new Response('bad'));
  await expect(new OpenAICompatibleProvider(local()).explain('s', 'c')).rejects.toThrow(
    'invalid JSON',
  );
});
it('rejects truncated model replies instead of silently teaching incomplete output', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'partial' }, finish_reason: 'length' }],
        }),
      ),
    ),
  );
  await expect(new OpenAICompatibleProvider(local()).explain('s', 'c')).rejects.toThrow(
    'truncated',
  );
});
