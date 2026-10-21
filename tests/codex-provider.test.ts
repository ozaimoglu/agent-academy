import { it, expect } from 'vitest';
import { access, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { temp } from './helpers.js';
import { event } from './helpers.js';
import { TeachingEngine, offlineLesson } from '../src/core/teaching.js';
import { CodexCLIProvider, codexArguments, codexEnvironment } from '../src/providers/codex-cli.js';
import { createProvider } from '../src/providers/openai-compatible.js';
import {
  defaultConfig,
  consentKey,
  validateProvider,
  saveConfig,
  loadConfig,
} from '../src/storage/config.js';

function config() {
  const p = { ...defaultConfig().provider, kind: 'codex' as const };
  p.consent = consentKey(p);
  p.approvedProjects = [consentKey(p, '/project')];
  return p;
}
async function fakeCodex(options: { version?: string; login?: string; run?: string } = {}) {
  const dir = await temp();
  const file = path.join(dir, 'codex');
  const capture = path.join(dir, 'capture.json');
  await writeFile(
    file,
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log(${JSON.stringify(options.version ?? 'codex-cli 0.163.0')}); }
else if (args.includes('--help')) { console.log('--ignore-user-config --ignore-rules --ephemeral --thread-source --strict-config'); }
else if (args.includes('login') && args.includes('status')) { console.error(${JSON.stringify(options.login ?? 'Logged in using ChatGPT')}); }
else {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => {
    fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ args, cwd: process.cwd(), env: process.env, input }));
    const emit = value => process.stdout.write(JSON.stringify(value) + '\\n');
    ${
      options.run ??
      `
    emit({type:'thread.started',thread_id:'teacher'});
    emit({type:'item.completed',item:{type:'reasoning',text:'PRIVATE REASONING'}});
    const answer = Buffer.from(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'İşlem 🔎'}}) + '\\n');
    const split = answer.indexOf(Buffer.from('🔎')) + 1;
    process.stdout.write(answer.subarray(0, split));
    setTimeout(() => {
      process.stdout.write(answer.subarray(split));
      emit({type:'turn.completed',usage:{input_tokens:123,output_tokens:45}});
    }, 10);`
    }
  });
}
`,
    { mode: 0o700 },
  );
  return { file, capture };
}

it('persists Codex configuration, requires explicit project consent, allows the CLI default model', async () => {
  const p = config();
  expect(() => validateProvider(p, '/project')).not.toThrow();
  expect(() => validateProvider(p, '/other')).toThrow('for this project');
  expect(() => validateProvider({ ...p, consent: '' })).toThrow('consent');
  expect(() => validateProvider({ ...p, model: 'other' }, '/project')).toThrow('for this project');
  const dir = await temp();
  const settings = { ...defaultConfig(), onboarded: true, provider: p };
  await saveConfig(dir, settings);
  expect(await loadConfig(dir)).toEqual(settings);
  expect(createProvider(p, '/project')).toBeInstanceOf(CodexCLIProvider);
});
it('uses a separate ephemeral context, passes redacted stdin, ignores reasoning, and returns actual usage', async () => {
  const { file, capture } = await fakeCodex();
  const provider = new CodexCLIProvider(
    config(),
    {
      ...process.env,
      OPENAI_API_KEY: 'do-not-inherit',
      CODEX_API_KEY: 'do-not-inherit',
      HERDR_PANE_ID: 'coding-pane',
      CODEX_THREAD_ID: 'coding-thread',
      DATABASE_PASSWORD: 'do-not-inherit',
    },
    file,
  );
  const reply = await provider.explain(
    'Teach with evidence',
    'API_KEY=source-secret\nselected evidence',
  );
  expect(reply).toEqual({ text: 'İşlem 🔎', usage: { input: 123, output: 45, estimated: false } });
  const call = JSON.parse(await readFile(capture, 'utf8'));
  expect(call.cwd).toContain('agent-academy-teacher-');
  expect(call.args).toContain('--ephemeral');
  expect(call.args).not.toContain('coding-thread');
  expect(call.args).not.toContain('selected evidence');
  expect(call.input).toContain('selected evidence');
  expect(call.input).not.toContain('source-secret');
  for (const key of [
    'OPENAI_API_KEY',
    'CODEX_API_KEY',
    'HERDR_PANE_ID',
    'CODEX_THREAD_ID',
    'DATABASE_PASSWORD',
  ])
    expect(call.env[key]).toBeUndefined();
  await expect(access(call.cwd)).rejects.toThrow();
});
it('disables capabilities and applies a restricted filesystem profile without shell interpolation', () => {
  const p = { ...config(), model: 'model; $(never-run)' };
  const args = codexArguments(p, '/tmp/academy space');
  for (const entry of [
    'forced_login_method="chatgpt"',
    'approval_policy="never"',
    'default_permissions="academy-teacher"',
    'features.shell_tool=false',
    'features.hooks=false',
    'features.apps=false',
    'features.plugins=false',
    'features.multi_agent=false',
    'agents.enabled=false',
    'web_search="disabled"',
    'features.computer_use=false',
    'project_doc_max_bytes=0',
    'mcp_servers={}',
    'permissions.academy-teacher.network.enabled=false',
  ])
    expect(args).toContain(entry);
  expect(args).toContain(
    'permissions.academy-teacher.filesystem={":minimal"="read","/tmp/academy space"="read"}',
  );
  expect(args).not.toContain('--sandbox'); // Named permissions and legacy sandbox flags cannot be mixed.
  expect(args[args.indexOf('--model') + 1]).toBe('model; $(never-run)');
  expect(codexEnvironment({ CODEX_HOME: '/auth', SECRET: 'x' }).CODEX_HOME).toBe('/auth');
});
it.each([
  { version: 'codex-cli 0.162.0', error: 'not been verified' },
  { version: 'codex-cli 0.164.0', error: 'not been verified' },
  { login: 'Logged in using an API key', error: 'ChatGPT login' },
])(
  'rejects unsupported CLI or API-key auth before sending context: $version $login',
  async (options) => {
    const { file, capture } = await fakeCodex(options);
    await expect(
      new CodexCLIProvider(config(), process.env, file).explain('s', 'c'),
    ).rejects.toThrow(options.error);
    await expect(access(capture)).rejects.toThrow();
  },
);
it('exposes quota errors without echoing source, and never switches to an HTTP provider', async () => {
  const { file } = await fakeCodex({
    run: `emit({type:'turn.failed',error:{message:'429 quota reached project-secret'}});`,
  });
  const provider = new CodexCLIProvider(config(), process.env, file);
  await expect(provider.explain('s', 'c')).rejects.toThrow('quota');
  await expect(provider.explain('s', 'c')).rejects.not.toThrow('project-secret');
});
it('stops on unexpected tool activity and rejects incomplete or oversized output', async () => {
  for (const [run, error] of [
    [
      `emit({type:'item.started',item:{type:'command_execution'}}); setInterval(()=>{},1000);`,
      'tool call',
    ],
    [
      `emit({type:'item.completed',item:{type:'agent_message',text:'incomplete'}});`,
      'did not finish',
    ],
    [`process.stdout.write('x'.repeat(1024*1024+1));`, 'line limit'],
    [`console.log('bad json');`, 'invalid JSONL'],
    [`console.log('null');`, 'event shape'],
  ]) {
    const { file } = await fakeCodex({ run });
    await expect(
      new CodexCLIProvider(config(), process.env, file).explain('s', 'c'),
    ).rejects.toThrow(error);
  }
});
it('kills only its own process on cancellation and cleans the isolated directory', async () => {
  const { file, capture } = await fakeCodex({ run: 'setInterval(()=>{},1000);' });
  const controller = new AbortController();
  const result = new CodexCLIProvider(config(), process.env, file).explain(
    's',
    'c',
    controller.signal,
  );
  const rejected = expect(result).rejects.toThrow('cancelled');
  for (let i = 0; i < 100; i++) {
    try {
      await access(capture);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  const call = JSON.parse(await readFile(capture, 'utf8'));
  controller.abort();
  await rejected;
  await expect(access(call.cwd)).rejects.toThrow();
});
it('labels usage estimates when the CLI omits accounting', async () => {
  const { file } = await fakeCodex({
    run: `emit({type:'item.completed',item:{type:'agent_message',text:'answer'}}); emit({type:'turn.completed'});`,
  });
  const result = await new CodexCLIProvider(config(), process.env, file).explain('s', 'c');
  expect(result.usage?.estimated).toBe(true);
});
it('accepts the real Codex 0.163 startup warnings without mistaking them for tool calls', async () => {
  const { file } = await fakeCodex({
    run: `
    emit({type:'item.completed',item:{type:'error',message:'Under-development features enabled: skip_host_skill_discovery. Under-development features are incomplete.'}});
    emit({type:'item.completed',item:{type:'error',message:'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable features.code_mode_host.'}});
    emit({type:'item.completed',item:{type:'agent_message',text:'Türkçe açıklama hazır.'}});
    emit({type:'turn.completed',usage:{input_tokens:10,output_tokens:5}});
  `,
  });
  const reply = await new CodexCLIProvider(config(), process.env, file).explain('s', 'c');
  expect(reply.text).toBe('Türkçe açıklama hazır.');
  expect(reply.usage?.input).toBe(10);
});
it('stops on other CLI item errors and keeps private diagnostics out of the UI', async () => {
  const { file } = await fakeCodex({
    run: `emit({type:'item.completed',item:{type:'error',message:'private-project-context unexpected failure'}}); emit({type:'turn.completed'});`,
  });
  try {
    await new CodexCLIProvider(config(), process.env, file).explain('s', 'c');
    expect.fail('Expected CLI error');
  } catch (error) {
    expect((error as Error).message).toContain('session error');
    expect((error as Error).message).not.toContain('private-project-context');
  }
});
it('classifies blocked process startup without exposing stderr context', async () => {
  const { file } = await fakeCodex({
    run: `console.error('Operation not permitted private-project-context'); process.exitCode = 1;`,
  });
  try {
    await new CodexCLIProvider(config(), process.env, file).explain('s', 'c');
    expect.fail('Expected startup failure');
  } catch (error) {
    expect((error as Error).message).toContain('sandbox');
    expect((error as Error).message).not.toContain('private-project-context');
  }
});
it('preserves complete Q&A JSON including the final question beyond the evidence budget', async () => {
  const { file, capture } = await fakeCodex();
  const p = config();
  const context = JSON.stringify({
    selectedLesson: 'x'.repeat(p.contextChars),
    question: 'Neden proxy?',
  });
  await new CodexCLIProvider(p, process.env, file).explain('s', context);
  const call = JSON.parse(await readFile(capture, 'utf8'));
  expect(call.input).toContain(context);
  expect(call.input).toContain('Neden proxy?');
});
it('runs a cited lesson and independent follow-up through the Codex subprocess adapter', async () => {
  const events = [event('task', 'Investigate a failed test', { id: 'verified-evidence' })];
  const fixture = offlineLesson('session', 'INVESTIGATING', events);
  const { file, capture } = await fakeCodex({
    run: `
    emit({type:'item.completed',item:{type:'agent_message',text:${JSON.stringify(JSON.stringify(fixture))}}});
    emit({type:'turn.completed',usage:{input_tokens:321,output_tokens:123}});
  `,
  });
  const p = config();
  const settings = { ...defaultConfig(), provider: p };
  const engine = new TeachingEngine(settings, new CodexCLIProvider(p, process.env, file));
  const lesson = await engine.lesson('session', 'INVESTIGATING', events);
  expect(lesson.error).toBeUndefined();
  expect(lesson.provider).toContain('ChatGPT quota');
  expect(lesson.evidenceIds).toContain('verified-evidence');
  const question = await engine.ask(lesson, 'Bu kanıt neyi doğruluyor?', events, []);
  expect(question.lessonId).toBe(lesson.id);
  expect(question.usage).toEqual({ input: 321, output: 123, estimated: false });
  const call = JSON.parse(await readFile(capture, 'utf8'));
  expect(call.input).toContain('selectedLesson');
  expect(call.input).toContain('verified-evidence');
  expect(call.input).toContain('Bu kanıt neyi doğruluyor?');
});
