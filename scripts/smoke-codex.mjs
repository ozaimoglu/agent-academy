// Uses the real saved ChatGPT login and consumes Codex quota. No project source is sent.
import assert from 'node:assert/strict';
import { CodexCLIProvider } from '../dist/providers/codex-cli.js';
import { defaultConfig, consentKey } from '../dist/storage/config.js';

const provider = {
  ...defaultConfig().provider,
  kind: 'codex',
  model: process.env.ACADEMY_CODEX_MODEL ?? '',
};
provider.consent = consentKey(provider);
console.log(
  'Codex ChatGPT girişiyle sentetik öğretici testi (kota kullanır; proje kodu gönderilmez).',
);
const reply = await new CodexCLIProvider(provider).explain(
  'Return only a JSON object with keys ok (boolean) and explanation (a Turkish string). Do not use tools.',
  'Synthetic evidence: a TypeScript function uses Array.map to transform [1,2] into [2,4]. Explain why the input array is unchanged. This is a synthetic example, not project code.',
);
const parsed = JSON.parse(reply.text);
assert.equal(parsed.ok, true);
assert.equal(typeof parsed.explanation, 'string');
assert.ok(parsed.explanation.length > 30);
console.log('Gerçek Codex açıklaması alındı. Kullanım:', reply.usage);
