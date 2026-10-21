// Optional real loopback HTTP smoke test. No model, key or external service is used.
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { OpenAICompatibleProvider } from '../dist/providers/openai-compatible.js';
import { defaultConfig } from '../dist/storage/config.js';
const server = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  assert.equal(req.url, '/v1/chat/completions');
  assert.equal(body.tools, undefined);
  assert.equal(body.max_tokens, 8192);
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    }),
  );
});
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const provider = new OpenAICompatibleProvider({
    ...defaultConfig().provider,
    kind: 'local',
    baseUrl,
    model: 'smoke-fixture',
  });
  const result = await provider.explain(
    'Explain only supplied evidence.',
    'Smoke test, no project source.',
  );
  assert.equal(result.usage.input, 10);
  assert.equal(JSON.parse(result.text).ok, true);
  console.log('PASS: actual loopback HTTP provider integration');
} catch (e) {
  console.error('FAIL: ' + e.message);
  process.exitCode = 1;
} finally {
  server.closeAllConnections();
  server.close();
}
