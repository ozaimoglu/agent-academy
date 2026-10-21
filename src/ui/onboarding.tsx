import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Config } from '../storage/config.js';
import { consentKey, validateProvider } from '../storage/config.js';
import { theme as c } from './theme.js';

const depths: [string, string, string][] = [
  ['quick', 'Hızlı Özet', 'Ne değişti, neden değişti? · 1–2 dk'],
  ['balanced', 'Dengeli', 'Problem, neden ve kararlar · örneklerle'],
  ['deep', 'Derinlemesine', 'Mekanizmalar, kod, alternatifler ve testler · önerilen'],
];
const styles: [string, string, string][] = [
  ['visual', 'Görsel', 'Diyagramlar ve çağrı akışları'],
  ['code', 'Kod üzerinden', 'Gerçek proje koduyla açıklamalar'],
  ['fundamentals', 'Temelden başlayarak', 'Önce doğru zihinsel model'],
  ['senior', 'Senior mühendis yaklaşımı', 'Mimari, ödünleşimler ve üretim riskleri'],
  ['interactive', 'Etkileşimli', 'Takip soruları ve isteğe bağlı bilgi kontrolü'],
];
const priorities: [string, string][] = [
  ['debugging', 'Debugging & Root Cause Analysis'],
  ['spring', 'Java / Spring Internals'],
  ['architecture', 'Architecture & Design Patterns'],
  ['performance', 'Performance & Concurrency'],
  ['testing', 'Testing & Quality'],
  ['security', 'Security'],
  ['frontend', 'Frontend / TypeScript'],
  ['everything', 'Everything'],
];
const providers: [string, string, string][] = [
  ['offline', 'Çevrimdışı gözlem', 'API anahtarı gerekmez · veri dışarı çıkmaz'],
  ['local', 'Ollama / yerel model', 'Loopback OpenAI uyumlu sunucu'],
  ['remote', 'Uzak OpenAI uyumlu API', 'Seçili kod ve kanıtlar dış servise gönderilir'],
  ['codex', 'Mevcut Codex CLI', 'Bu MVP’de kullanılamıyor · araçsız izolasyon yok'],
];
const titles = [
  'Ne kadar derin öğrenmek istiyorsun?',
  'Konuları nasıl öğrenmeyi tercih edersin?',
  'En çok hangi konularda gelişmek istiyorsun?',
  'Açıklamaları hangi model hazırlasın?',
];
const fields = [
  ['model', 'Model'],
  ['baseUrl', 'API adresi'],
  ['keyEnv', 'Anahtar ortam değişkeni'],
  ['minIntervalSeconds', 'En az analiz aralığı (sn)'],
  ['maxOutputTokens', 'Çıktı token bütçesi'],
  ['tokenParameter', 'Token alanı (uzak API)'],
  ['contextChars', 'Bağlam karakter bütçesi'],
  ['panelWidth', 'Panel genişliği (%)'],
  ['autoAnalyze', 'Otomatik analiz (true/false)'],
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
      next.provider.kind === 'remote' &&
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
      if (input === 'o' || input === 'O') {
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
          [k]: ['minIntervalSeconds', 'maxOutputTokens', 'contextChars'].includes(k)
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
        <Text color={c.muted}> / {settings ? 'AYARLAR' : 'HOŞ GELDİN'}</Text>
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
            Dış servise veri gönderme izni
          </Text>
          <Text>{config.provider.baseUrl}</Text>
          <Text>Proje: {project ?? 'seçili bağlam'}</Text>
          <Text>Model: {config.provider.model || '(belirlenmedi)'}</Text>
          <Text>
            Seçili görevin mesajları, komut sonuçları, kod farkları ve kaynak parçaları bu adrese
            gönderilecek. Maskeleme tüm sırları yakalayamaz.
          </Text>
          <Text color={c.accent}>O: açıkça onayla ve kaydet · Esc: geri</Text>
        </Box>
      ) : advanced ? (
        <Box flexDirection="column">
          <Text color={c.muted}>Enter: düzenle · A / Esc: sağlayıcıya dön</Text>
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
            Anahtarın kendisini yazma; yalnızca ortam değişkeninin adını gir.
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
              ? 'Kanıt ve rapor hazır. Derin açıklama ve ASK için daha sonra model ekleyebilirsin.'
              : `Model: ${config.provider.model || 'A ile model adını gir'} · ${config.provider.minIntervalSeconds} sn`}
          </Text>
          <Text color={c.muted}>
            Yerel sunucuda da gerçekten yerel model kullan; bulut modelleri veri iletebilir.
          </Text>
          <Text color={c.accent}>A: gelişmiş ayarlar</Text>
        </Box>
      )}
      {error && <Text color={c.error}>{error}</Text>}
      <Box marginTop={1}>
        <Text color={c.muted}>
          {saving
            ? 'Kaydediliyor…'
            : advanced
              ? 'Alanlar yerel ayar dosyasına kaydedilir.'
              : '↑↓ gezin · Space seç · Enter ' + (step === 3 ? 'başla' : 'devam') + ' · Esc geri'}
          {settings ? ' · 1–4 doğrudan düzenle' : ''}
        </Text>
      </Box>
    </Box>
  );
}
