import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Config } from '../storage/config.js';
import {
  consentKey,
  validateProvider,
  sharesExternally,
  providerDestination,
  learningPriorities,
} from '../storage/config.js';
import { theme as c } from './theme.js';

const depths: [string, string, string][] = [
  ['quick', 'Quick summary', 'What changed and why? · 1–2 min'],
  ['balanced', 'Balanced', 'Problem, cause and decisions · with examples'],
  ['deep', 'In depth', 'Mechanisms, code, alternatives and tests · recommended'],
];
const styles: [string, string, string][] = [
  ['visual', 'Visual', 'Diagrams and call flows'],
  ['code', 'Through code', 'Explanations using actual project code'],
  ['fundamentals', 'From fundamentals', 'Build the right mental model first'],
  ['senior', 'Senior engineer approach', 'Architecture, tradeoffs and production risks'],
  ['interactive', 'Interactive', 'Follow-up questions and optional knowledge checks'],
];
const priorities = learningPriorities;
const providers: [string, string, string][] = [
  ['offline', 'Offline observation', 'No API key · no data leaves your device'],
  ['local', 'Ollama / local model', 'Loopback OpenAI-compatible server'],
  [
    'remote',
    'Remote OpenAI-compatible API',
    'Selected code and evidence go to an external service',
  ],
  ['codex', 'Codex quota / ChatGPT login', 'No API key · selected evidence goes to OpenAI'],
];
const titles = [
  'How deeply would you like to learn?',
  'How do you prefer to learn?',
  'What should we focus on?',
  'Which model should explain?',
];
const allFields = [
  ['model', 'Model'],
  ['baseUrl', 'API address'],
  ['keyEnv', 'API key environment variable'],
  ['minIntervalSeconds', 'Minimum analysis interval (s)'],
  ['maxOutputTokens', 'Output token budget'],
  ['tokenParameter', 'Token field (remote API)'],
  ['contextChars', 'Context character budget'],
  ['panelWidth', 'Panel width (%)'],
  ['autoAnalyze', 'Automatic analysis (true/false)'],
  ['codexTimeoutSeconds', 'Codex timeout (s)'],
  ['codexCredentialStore', 'Codex credentials (auto/file/keyring)'],
] as const;
export function OnboardingWizard({
  initial,
  onSave,
  onCancel,
  settings = false,
  width = 70,
  height = 30,
  project,
}: {
  initial: Config;
  onSave: (c: Config) => Promise<void>;
  onCancel?: () => void;
  settings?: boolean;
  width?: number;
  height?: number;
  project?: string;
}) {
  const [config, setConfig] = useState<Config>(() => structuredClone(initial));
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState(
    Math.max(
      0,
      depths.findIndex((d) => d[0] === initial.depth),
    ),
  );
  const [advanced, setAdvanced] = useState(false);
  const [field, setField] = useState(0);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const fields = allFields.filter(([key]) =>
    config.provider.kind === 'codex'
      ? !['baseUrl', 'keyEnv', 'maxOutputTokens', 'tokenParameter'].includes(key)
      : !['codexTimeoutSeconds', 'codexCredentialStore'].includes(key),
  );
  const options = step === 0 ? depths : step === 1 ? styles : step === 2 ? priorities : providers;
  const moveStep = (to: number) => {
    setStep(to);
    setFocus(
      to === 0
        ? Math.max(
            0,
            depths.findIndex((d) => d[0] === config.depth),
          )
        : 0,
    );
    setError('');
    setAdvanced(false);
  };
  const save = async (approved = false) => {
    let next: Config = { ...config, onboarded: true };
    if (
      sharesExternally(next.provider) &&
      (next.provider.consent !== consentKey(next.provider) ||
        (project &&
          !next.provider.approvedProjects.includes(consentKey(next.provider, project)))) &&
      !approved
    ) {
      setConsent(true);
      return;
    }
    if (approved)
      next = {
        ...next,
        provider: {
          ...next.provider,
          consent: consentKey(next.provider),
          approvedProjects: project
            ? [...new Set([...next.provider.approvedProjects, consentKey(next.provider, project)])]
            : next.provider.approvedProjects,
        },
      };
    try {
      validateProvider(next.provider);
      setSaving(true);
      await onSave(next);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
      setConsent(false);
    }
  };
  const selected = (id: string) =>
    step === 0
      ? config.depth === id
      : step === 1
        ? config.styles.includes(id as Config['styles'][number])
        : step === 2
          ? config.priorities.includes(id)
          : config.provider.kind === id;
  const choose = (id: string) => {
    setError('');
    if (step === 0) setConfig({ ...config, depth: id as Config['depth'] });
    if (step === 1) {
      const a = config.styles.includes(id as Config['styles'][number])
        ? config.styles.filter((s) => s !== id)
        : [...config.styles, id as Config['styles'][number]];
      if (a.length) setConfig({ ...config, styles: a });
    }
    if (step === 2) {
      const a =
        id === 'everything'
          ? ['everything']
          : config.priorities.includes(id)
            ? config.priorities.filter((s) => s !== id)
            : [...config.priorities.filter((s) => s !== 'everything'), id];
      setConfig({ ...config, priorities: a.length ? a : ['everything'] });
    }
    if (step === 3)
      setConfig({
        ...config,
        provider: {
          ...config.provider,
          kind: id as Config['provider']['kind'],
          model: config.provider.kind === id ? config.provider.model : '',
          consent: '',
          baseUrl:
            id === 'remote'
              ? 'https://api.openai.com/v1'
              : id === 'local'
                ? 'http://127.0.0.1:11434/v1'
                : config.provider.baseUrl,
        },
      });
  };
  useInput((input, key) => {
    if (saving) return;
    if (consent) {
      if (input === 'y' || input === 'Y') {
        setConsent(false);
        void save(true);
      } else if (key.escape) {
        setConsent(false);
      }
      return;
    }
    if (editing) {
      if (key.escape) setEditing(false);
      return;
    }
    input = input.toLowerCase();
    if (settings && /^[1-4]$/.test(input)) {
      moveStep(Number(input) - 1);
      return;
    }
    if (key.escape) {
      if (advanced) setAdvanced(false);
      else if (step > 0) moveStep(step - 1);
      else onCancel?.();
      return;
    }
    if (step === 3 && input === 'a') {
      setAdvanced(!advanced);
      return;
    }
    if (advanced) {
      if (key.upArrow) setField((field + fields.length - 1) % fields.length);
      if (key.downArrow) setField((field + 1) % fields.length);
      if (key.return) {
        const k = fields[field]![0];
        setValue(String(k === 'panelWidth' ? config.panelWidth : config.provider[k]));
        setEditing(true);
      }
      return;
    }
    if (key.upArrow) setFocus((focus + options.length - 1) % options.length);
    if (key.downArrow) setFocus((focus + 1) % options.length);
    if (input === ' ') choose(options[focus]![0]!);
    if (key.return) {
      if (step === 0) {
        choose(options[focus]![0]!);
        moveStep(1);
      } else if (step < 3) moveStep(step + 1);
      else void save();
    }
  });
  const submitField = () => {
    const k = fields[field]![0];
    let updated: Config;
    if (k === 'panelWidth') updated = { ...config, panelWidth: Number(value) };
    else
      updated = {
        ...config,
        provider: {
          ...config.provider,
          [k]: [
            'minIntervalSeconds',
            'maxOutputTokens',
            'contextChars',
            'codexTimeoutSeconds',
          ].includes(k)
            ? Number(value)
            : k === 'autoAnalyze'
              ? value === 'true'
              : value,
          consent: '',
        },
      };
    setConfig(updated);
    setEditing(false);
  };
  const compact = height < 26;
  return (
    <Box flexDirection="column" width={width} paddingX={1}>
      <Box marginBottom={compact ? 0 : 1}>
        <Text color={c.accent} bold>
          ◈ AGENT ACADEMY
        </Text>
        <Text color={c.muted}> / {settings ? 'SETTINGS' : 'WELCOME'}</Text>
      </Box>
      <Text color={c.muted}>
        {['01', '02', '03', '04'].map((n, i) => (i === step ? `● ${n}` : `○ ${n}`)).join(' ── ')}{' '}
        {step + 1}/4
      </Text>
      <Box marginY={1}>
        <Text bold color={c.text}>
          {titles[step]}
        </Text>
      </Box>
      {consent ? (
        <Box flexDirection="column" borderStyle="round" borderColor={c.warning} paddingX={1}>
          <Text bold color={c.warning}>
            External data sharing consent
          </Text>
          <Text wrap="truncate-middle">{providerDestination(config.provider)}</Text>
          <Text wrap="truncate-middle">Project: {project ?? 'selected context'}</Text>
          <Text>
            Model:{' '}
            {config.provider.model ||
              (config.provider.kind === 'codex' ? 'Codex CLI default' : '(not set)')}
          </Text>
          <Text>
            {compact
              ? 'Selected messages, results, diffs and code go to the service. Redaction may miss secrets.'
              : 'Selected task messages, command results, diffs and source excerpts will be sent to this destination. Redaction may miss secrets.'}
          </Text>
          {config.provider.kind === 'codex' && (
            <Text>
              {compact
                ? 'Uses your Codex quota; no API key.'
                : 'Explanations use your existing ChatGPT/Codex limits. No separate API key is used.'}
            </Text>
          )}
          <Text color={c.accent}>Y: approve and save · Esc: back</Text>
        </Box>
      ) : advanced ? (
        <Box flexDirection="column">
          <Text color={c.muted}>Enter: edit · A / Esc: back to provider</Text>
          {fields.map(([k, label], i) => (
            <Box key={k} flexDirection="column">
              <Text color={field === i ? c.accent : c.text}>
                {field === i ? '›' : ' '} {label}:{' '}
                {String(k === 'panelWidth' ? config.panelWidth : config.provider[k]) || '—'}
              </Text>
              {editing && field === i && (
                <Box paddingLeft={2}>
                  <TextInput value={value} onChange={setValue} onSubmit={submitField} />
                </Box>
              )}
            </Box>
          ))}
          <Text color={c.muted}>
            {config.provider.kind === 'codex'
              ? 'Leave model blank for the CLI default. The CLI has no output token setting.'
              : 'Enter the environment variable name, not the API key.'}
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" gap={compact ? 0 : 1}>
          {options.map(([id, label, description], i) => (
            <Box
              key={id}
              flexDirection="column"
              paddingLeft={1}
              borderStyle={focus === i ? 'single' : undefined}
              borderColor={c.border}
            >
              <Text color={focus === i ? c.accent : c.text} bold={selected(id)}>
                {focus === i ? '›' : ' '}{' '}
                {step === 1 || step === 2 ? (selected(id) ? '▣' : '□') : selected(id) ? '◉' : '○'}{' '}
                {label}
              </Text>
              {description && !compact && focus === i && (
                <Text color={c.muted}> {description}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}
      {step === 3 && !consent && !advanced && (
        <Box marginTop={1} flexDirection="column">
          <Text color={c.muted}>
            {config.provider.kind === 'offline'
              ? 'Follow observed steps now. Add a model later for deeper explanations and questions.'
              : `Model: ${config.provider.model || (config.provider.kind === 'codex' ? 'CLI default' : 'press A to set a model')} · ${config.provider.minIntervalSeconds} s`}
          </Text>
          <Text color={c.muted}>
            {config.provider.kind === 'codex'
              ? 'ChatGPT login · shared Codex quota · project consent required.'
              : 'Use a local model on a local server; cloud models may send data externally.'}
          </Text>
          <Text color={c.accent}>A: advanced settings</Text>
        </Box>
      )}
      {error && <Text color={c.error}>{error}</Text>}
      <Box marginTop={1}>
        <Text color={c.muted}>
          {saving
            ? 'Saving…'
            : advanced
              ? 'Fields are saved to your local settings file.'
              : '↑↓ navigate · Space select · Enter ' +
                (step === 3 ? 'save' : 'next') +
                ' · Esc back'}
          {settings ? ' · 1–4 jump to a step' : ''}
        </Text>
      </Box>
      {step === 3 && !consent && !advanced && (
        <Text color={c.muted}>The panel opens in standby. B start · D stop.</Text>
      )}
    </Box>
  );
}
