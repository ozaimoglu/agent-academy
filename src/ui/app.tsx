import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import wrapAnsi from 'wrap-ansi';
import { highlight } from 'cli-highlight';
import type { Academy, AcademySnapshot } from '../core/academy.js';
import type { Config } from '../storage/config.js';
import { saveConfig } from '../storage/config.js';
import { confidenceLabels, stageLabels } from '../core/types.js';
import { OnboardingWizard } from './onboarding.js';
import { theme as c } from './theme.js';
import { renderDiagram } from './diagrams.js';
import { timelineEdges } from '../core/teaching.js';
import { createHerdrCall } from '../integration/herdr.js';
import { safeText } from '../core/privacy.js';

const tabs = ['LIVE', 'WHY', 'CODE', 'VISUALIZE', 'ASK', 'REPORT'];
const presets = [
  'Bunu daha temelden anlat.',
  'Bu sınıftaki gerçek kod üzerinden açıkla.',
  'Buradaki mekanizma neden çalışmadı?',
  'Alternatif çözüm ne olurdu?',
  'Bu kod production’da hangi problemleri doğurabilir?',
  'Bu davranışı testle nasıl kanıtlarız?',
];
function useSize() {
  const stream = useStdout().stdout;
  const stdout = stream as NodeJS.WriteStream;
  const [size, setSize] = useState({ width: stdout.columns || 80, height: stdout.rows || 28 });
  useEffect(() => {
    const resize = () => setSize({ width: stdout.columns || 80, height: stdout.rows || 28 });
    stdout.on('resize', resize);
    return () => {
      stdout.off('resize', resize);
    };
  }, [stdout]);
  return size;
}
function colorLine(line: string) {
  if (line.startsWith('+') && !line.startsWith('+++')) return c.accent;
  if (line.startsWith('-') && !line.startsWith('---')) return c.error;
  if (line.startsWith('#') || line.startsWith('@@')) return c.blue;
  if (line.startsWith('Kanıt') || line.startsWith('[')) return c.muted;
  return c.text;
}
export function AcademyTUI({
  academy,
  configDir,
  initialConfig,
  demo = false,
}: {
  academy: Academy;
  configDir: string;
  initialConfig: Config;
  demo?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<AcademySnapshot>({ ...academy.snapshot });
  const [config, setConfig] = useState(initialConfig);
  const [wizard, setWizard] = useState(!initialConfig.onboarded);
  const [tab, setTab] = useState(0);
  const [lessonIndex, setLessonIndex] = useState(-1);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [outline, setOutline] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sessions, setSessions] = useState(false);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [codeIndex, setCodeIndex] = useState(0);
  const [question, setQuestion] = useState('');
  const [typing, setTyping] = useState(false);
  const [preset, setPreset] = useState(0);
  const [concept, setConcept] = useState(0);
  const [notice, setNotice] = useState('');
  const [qaVersion, setQaVersion] = useState(0);
  const { exit } = useApp();
  const { width, height } = useSize();
  useEffect(() => {
    const changed = (s: AcademySnapshot) => setSnapshot({ ...s });
    academy.on('change', changed);
    if (initialConfig.onboarded) academy.start();
    return () => {
      academy.off('change', changed);
    };
  }, [academy, initialConfig.onboarded]);
  const lesson =
    snapshot.lessons[
      lessonIndex < 0
        ? snapshot.lessons.length - 1
        : Math.min(lessonIndex, snapshot.lessons.length - 1)
    ];
  const evidence = lesson ? academy.evidence(lesson) : snapshot.events;
  const code = evidence.filter((e) => ['diff', 'edit', 'source'].includes(e.kind));
  const selectedCode = code[codeIndex % Math.max(1, code.length)];
  const selectedSection = lesson?.sections[sectionIndex % (lesson?.sections.length || 1)];
  const questions = lesson ? academy.questions(lesson) : [];
  const innerWidth = Math.max(12, width - 6);
  const visibleRows = Math.max(3, height - (width < 60 ? 10 : 9) - (typing ? 3 : 0));
  const switchTab = (n: number) => {
    setTab(n);
    setOffset(0);
    setOutline(false);
  };
  const ask = async (text: string) => {
    if (!lesson) {
      setNotice('Önce bir ders oluşmalı.');
      return;
    }
    setTyping(false);
    setNotice('Soru bağımsız öğretim modeline gönderiliyor…');
    const selectedConcept = lesson.concepts[concept % Math.max(1, lesson.concepts.length)];
    try {
      await academy.ask(
        lesson,
        (selectedConcept ? `Seçili kavram: ${selectedConcept}.\n` : '') + text,
      );
      setQaVersion((v) => v + 1);
      setNotice('Yanıt derse kaydedildi.');
      setOffset(0);
    } catch (e) {
      setNotice(safeText((e as Error).message, 300));
    }
  };
  useInput((input, key) => {
    if (wizard) return;
    if (typing) {
      if (key.escape) setTyping(false);
      return;
    }
    if (sessions) {
      if (key.escape) {
        setSessions(false);
        return;
      }
      if (key.downArrow)
        setSessionIndex((sessionIndex + 1) % Math.max(1, snapshot.sessions.length));
      if (key.upArrow)
        setSessionIndex(
          (sessionIndex + snapshot.sessions.length - 1) % Math.max(1, snapshot.sessions.length),
        );
      if (key.return && snapshot.sessions[sessionIndex]) {
        void academy.select(snapshot.sessions[sessionIndex]!);
        setSessions(false);
        setLessonIndex(-1);
        setOffset(0);
      }
      return;
    }
    if (input === 'q') {
      exit();
      return;
    }
    if (input === 's') {
      setWizard(true);
      return;
    }
    if (input === 'c') {
      setSessions(true);
      return;
    }
    if (input === 'g') {
      academy.requestLesson();
      setNotice('Açıklama isteği sıraya alındı.');
      return;
    }
    if (input === 'e') {
      void academy
        .export()
        .then((file) => setNotice('Dışa aktarıldı: ' + file))
        .catch((e) => setNotice((e as Error).message));
      return;
    }
    if (input === 'z') {
      if (process.env.HERDR_ENV === '1' && process.env.HERDR_PANE_ID)
        void createHerdrCall()([
          'pane',
          'zoom',
          '--pane',
          process.env.HERDR_PANE_ID,
          '--toggle',
        ]).catch((e) => setNotice((e as Error).message));
      else setNotice('Geniş okuma için terminali büyütün; Herdr içinde Z pane’i yakınlaştırır.');
      return;
    }
    if (/^[1-6]$/.test(input)) {
      switchTab(Number(input) - 1);
      return;
    }
    if (key.tab || key.rightArrow) {
      switchTab((tab + 1) % tabs.length);
      return;
    }
    if (key.leftArrow) {
      switchTab((tab + tabs.length - 1) % tabs.length);
      return;
    }
    if (input === '[' || input === ']') {
      setLessonIndex(
        Math.max(
          0,
          Math.min(
            snapshot.lessons.length - 1,
            (lessonIndex < 0 ? snapshot.lessons.length - 1 : lessonIndex) +
              (input === ']' ? 1 : -1),
          ),
        ),
      );
      setOffset(0);
      return;
    }
    if (tab === 1 && (input === ',' || input === '.')) {
      setSectionIndex(
        (sectionIndex + (input === '.' ? 1 : (lesson?.sections.length ?? 1) - 1)) %
          (lesson?.sections.length || 1),
      );
      setOffset(0);
      return;
    }
    if (tab === 1 && key.return) {
      setOutline(!outline);
      setOffset(0);
      return;
    }
    if (tab === 1 && outline && (key.downArrow || key.upArrow)) {
      setSectionIndex(
        (sectionIndex + (key.downArrow ? 1 : (lesson?.sections.length ?? 1) - 1)) %
          (lesson?.sections.length || 1),
      );
      return;
    }
    if (tab === 2 && input === 'n') {
      setCodeIndex(codeIndex + 1);
      setOffset(0);
      return;
    }
    if (tab === 4) {
      if (input === 'a') {
        setTyping(true);
        setQuestion('');
        return;
      }
      if (input === 'p') {
        setPreset((preset + 1) % presets.length);
        return;
      }
      if (input === 'k') {
        setConcept(concept + 1);
        return;
      }
      if (key.return) {
        void ask(presets[preset]!);
        return;
      }
    }
    if (key.downArrow || input === 'j') setOffset((o) => o + 1);
    if (key.upArrow || input === 'k') setOffset((o) => Math.max(0, o - 1));
    if (key.pageDown || input === ' ') setOffset((o) => o + visibleRows - 1);
    if (key.pageUp) setOffset((o) => Math.max(0, o - visibleRows + 1));
    if (key.home) setOffset(0);
  });
  if (wizard)
    return (
      <OnboardingWizard
        project={academy.root}
        initial={config}
        settings={config.onboarded}
        width={width}
        height={height}
        onCancel={() => {
          if (config.onboarded) setWizard(false);
          else exit();
        }}
        onSave={async (next) => {
          await saveConfig(configDir, next);
          const was = config.onboarded;
          setConfig(next);
          academy.setConfig(next);
          setWizard(false);
          if (!was) academy.start();
        }}
      />
    );
  if (width < 24 || height < 12)
    return (
      <Box flexDirection="column">
        <Text color={c.accent}>◈ Academy</Text>
        <Text>En az 24 sütun × 12 satır.</Text>
        <Text>Z: yakınlaştır · Q: çık</Text>
      </Box>
    );
  let content: string;
  if (sessions)
    content = [
      '# Codex oturumu seç',
      snapshot.status,
      '',
      ...snapshot.sessions.map(
        (s, i) =>
          `${i === sessionIndex ? '›' : ' '} ${s.id}\n  ${s.source} · ${new Date(s.modified).toLocaleString('tr-TR')}\n  ${s.cwd}`,
      ),
      '',
      '↑↓ seç · Enter bağlan · Esc dön',
    ].join('\n');
  else if (tab === 0)
    content = [
      `# ${stageLabels[snapshot.stage]}`,
      snapshot.status,
      snapshot.selected
        ? `${snapshot.selected.cwd}\n${snapshot.selected.branch ?? 'dal bilinmiyor'} · ${snapshot.selected.id}`
        : 'Codex’i bu projede normal biçimde başlat. C ile oturum seç.',
      '',
      snapshot.busy
        ? '◌ Ders hazırlanıyor…'
        : `${snapshot.eventCount} gözlem · ${snapshot.lessons.length} ders`,
      '',
      ...snapshot.events
        .slice(-22)
        .reverse()
        .map(
          (e) =>
            `${e.kind === 'result' ? (e.exitCode === 0 ? '✓' : e.exitCode === undefined ? '○' : '!') : '·'} ${e.time.slice(11, 19)} ${e.kind.toUpperCase()}\n  ${(e.command ?? (e.kind === 'source' ? `${e.file}:${e.startLine}–${e.endLine}` : (e.text.split('\n')[0] ?? ''))).slice(0, 240)}${e.kind === 'result' ? '\n  çıkış: ' + (e.exitCode ?? 'bilinmiyor') : ''}\n  [${e.id}]`,
        ),
    ].join('\n');
  else if (tab === 1)
    content = !lesson
      ? '# Ders bekleniyor\nAnlamlı bir aşamada açıklama oluşacak. G ile isteyebilirsin.'
      : outline
        ? [
            '# Ders bölümleri',
            lesson.title,
            '',
            ...lesson.sections.map(
              (s, i) =>
                `${i === sectionIndex ? '›' : ' '} ${String(i + 1).padStart(2, '0')} ${s.heading} · ${confidenceLabels[s.confidence]}`,
            ),
            '',
            '↑↓ bölüm seç · Enter oku',
          ].join('\n')
        : [
            `# ${lesson.title}`,
            `Ders ${snapshot.lessons.indexOf(lesson) + 1}/${snapshot.lessons.length} · ${lesson.provider}`,
            lesson.error ? 'Model kullanılamadı: ' + lesson.error : '',
            lesson.concepts.length ? 'Kavramlar: ' + lesson.concepts.join(' · ') : '',
            `## ${selectedSection?.heading ?? ''}`,
            `[${selectedSection ? confidenceLabels[selectedSection.confidence] : ''}]`,
            selectedSection?.body ?? '',
            `Kanıt: ${selectedSection?.evidence.join(', ') || 'yok / doğrulanmadı'}`,
            '',
            ', / . bölüm · Enter içindekiler · [ / ] ders',
          ].join('\n');
  else if (tab === 2) {
    let text =
      selectedCode?.text ??
      'Kod farkı veya kaynak henüz gözlenmedi. Git HEAD ile çalışma ağacı karşılaştırılır; gözlenen apply_patch içerikleri de gösterilir.';
    if (selectedCode?.kind === 'source') {
      try {
        text = highlight(text, {
          language: selectedCode.file?.endsWith('.java') ? 'java' : 'typescript',
          ignoreIllegals: true,
        });
      } catch {
        /* Plain source remains readable. */
      }
    }
    content = [
      `# Gerçek kod · ${code.length ? (codeIndex % code.length) + 1 : 0}/${code.length}`,
      selectedCode
        ? `${selectedCode.file ?? 'Gözlenen yama'} ${selectedCode.startLine ? ':' + selectedCode.startLine + '-' + selectedCode.endLine : ''}\n[${selectedCode.id}]`
        : '',
      selectedCode?.kind === 'diff'
        ? 'HEAD → gözlenen çalışma ağacı (başka değişiklikler de olabilir)'
        : '',
      text,
      '',
      'N sonraki kaynak · [ / ] ders',
    ].join('\n');
  } else if (tab === 3)
    content = [
      '# Kanıta bağlı akış',
      lesson?.diagram.length
        ? 'Modelin kanıta bağlı ilişkileri'
        : 'Gözlenen olayların zaman sırası; mimari ilişki iddiası değildir.',
      '',
      renderDiagram(lesson?.diagram.length ? lesson.diagram : timelineEdges(evidence), innerWidth),
      '',
      '[ / ] ders · Z geniş okuma',
    ].join('\n');
  else if (tab === 4)
    content = [
      '# Birlikte derinleşelim',
      lesson?.title ?? 'Önce bir ders seç.',
      `Kavram: ${lesson?.concepts[concept % Math.max(1, lesson.concepts.length)] ?? 'Dersin tamamı'} · K değiştir`,
      '',
      `› ${presets[preset]}`,
      'P öneri değiştir · Enter sor · A kendi sorunu yaz',
      '',
      ...questions
        .slice()
        .reverse()
        .flatMap((q) => [
          `## ${q.question}`,
          ...q.answer.flatMap((a) => [
            `[${confidenceLabels[a.confidence]}] ${a.heading}`,
            a.body,
            `Kanıt: ${a.evidence.join(', ') || 'yok'}`,
          ]),
          '',
        ]),
    ].join('\n');
  else content = academy.report();
  const lines = wrapAnsi(content, innerWidth, { hard: true, trim: false }).split('\n');
  const start = Math.min(offset, Math.max(0, lines.length - visibleRows));
  const usage = [...snapshot.lessons.map((l) => l.usage), ...questions.map((q) => q.usage)].filter(
    (u) => !!u,
  );
  const total = snapshot.usage
    ? snapshot.usage.input + snapshot.usage.output
    : usage.reduce((sum, u) => sum + u!.input + u!.output, 0);
  const estimated = snapshot.usage?.estimated ?? usage.some((u) => u?.estimated);
  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color={c.accent}>
          ◈ {width < 45 ? 'ACADEMY' : 'AGENT ACADEMY'}
        </Text>
        <Text color={demo ? c.warning : c.muted}>{demo ? 'DEMO · yerel' : '● YEREL'}</Text>
      </Box>
      <Text color={c.muted}>
        {snapshot.busy ? '◌ açıklanıyor' : stageLabels[snapshot.stage]} ·{' '}
        {total.toLocaleString('tr-TR')} token{estimated ? ' (tahmini)' : ''}
        {config.provider.kind === 'codex' ? ' · Codex kotası' : ''}
      </Text>
      <Box marginTop={1} flexWrap="wrap">
        {tabs.map((t, i) => (
          <Text key={t} bold={tab === i} color={tab === i ? c.accent : c.muted}>
            {i + 1} {width < 48 ? t.slice(0, 4) : t}
            {'  '}
          </Text>
        ))}
      </Box>
      <Box
        flexDirection="column"
        flexGrow={1}
        overflow="hidden"
        borderStyle="round"
        borderColor={c.border}
        paddingX={1}
      >
        {lines.slice(start, start + visibleRows).map((l, i) => (
          <Text key={`${tab}-${i}-${qaVersion}`} color={colorLine(l)} wrap="truncate-end">
            {l || ' '}
          </Text>
        ))}
      </Box>
      {typing && (
        <Box flexDirection="column">
          <Text color={c.accent}>Sorun · Enter gönder / Esc iptal</Text>
          <TextInput
            value={question}
            onChange={(v) => setQuestion(v.slice(0, 2000))}
            onSubmit={(v) => void ask(v)}
          />
        </Box>
      )}
      <Text color={notice ? c.accent : snapshot.warning ? c.warning : c.muted} wrap="truncate-end">
        {notice ||
          snapshot.warning ||
          `${start + 1}–${Math.min(start + visibleRows, lines.length)} / ${lines.length} · ↑↓ kaydır · Space sayfa`}
      </Text>
      <Text color={c.muted} wrap="truncate-end">
        {width < 55
          ? 'S ayar · C oturum · Z geniş · Q çık'
          : 'S ayarlar · C oturum · G açıkla · E dışa aktar · Z geniş · Q çık'}
      </Text>
    </Box>
  );
}
