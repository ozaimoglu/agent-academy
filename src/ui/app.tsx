import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import wrapAnsi from 'wrap-ansi';
import type { Academy, AcademySnapshot } from '../core/academy.js';
import type { Config } from '../storage/config.js';
import { saveConfig } from '../storage/config.js';
import { OnboardingWizard } from './onboarding.js';
import { theme as c } from './theme.js';
import { safeText } from '../core/privacy.js';
import { renderStory } from './story.js';
import type { ConceptChoice, Lesson } from '../core/types.js';
import { pendingConcept } from '../core/concepts.js';

function useSize() {
  const stdout = useStdout().stdout as NodeJS.WriteStream;
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

export function AcademyTUI({
  academy,
  configDir,
  initialConfig,
  demo = false,
  onClosePanel,
}: {
  academy: Academy;
  configDir: string;
  initialConfig: Config;
  demo?: boolean;
  onClosePanel?: () => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<AcademySnapshot>({ ...academy.snapshot });
  const [config, setConfig] = useState(initialConfig);
  const [wizard, setWizard] = useState(!initialConfig.onboarded);
  const [offset, setOffset] = useState(0);
  const [following, setFollowing] = useState(true);
  const [choosingSession, setChoosingSession] = useState(false);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [question, setQuestion] = useState('');
  const [typing, setTyping] = useState(false);
  const [questionTarget, setQuestionTarget] = useState<Lesson>();
  const [notice, setNotice] = useState('');
  const [answerVersion, setAnswerVersion] = useState(0);
  const { exit } = useApp();
  const { width, height } = useSize();
  const innerWidth = Math.max(12, width - 6);
  const visibleRows = Math.max(3, height - 7 - (typing ? 3 : 0));
  const lessons = snapshot.lessons.filter((l) => l.captureId === snapshot.captureId);
  const lesson = lessons.at(-1);
  const questions = lessons.flatMap((l) => academy.questions(l));
  const knowledge = academy.conceptKnowledge();
  const conceptLesson = pendingConcept(lessons, questions, knowledge);
  const needsSession = !snapshot.selected && snapshot.sessions.length > 1;
  const sessionText = [
    'Which Codex session should we follow?',
    '',
    ...snapshot.sessions.map(
      (s, i) =>
        `${i === sessionIndex ? '›' : ' '} ${s.branch ?? 'Codex'} · ${new Date(s.modified).toLocaleString('en-US')}\n  ${s.id}`,
    ),
    '',
    '↑↓ select · Enter connect · Esc back',
  ].join('\n');
  const content = choosingSession
    ? sessionText
    : renderStory(snapshot, {
        offline: config.provider.kind === 'offline',
        width: innerWidth,
        questions,
        knowledge,
      });
  const lines = wrapAnsi(content, innerWidth, { hard: true, trim: false }).split('\n');
  const bottom = Math.max(0, lines.length - visibleRows);
  const start = following && !choosingSession ? bottom : Math.min(offset, bottom);

  useEffect(() => {
    const changed = (s: AcademySnapshot) => setSnapshot({ ...s });
    academy.on('change', changed);
    if (initialConfig.onboarded) academy.watch();
    return () => {
      academy.off('change', changed);
    };
  }, [academy, initialConfig.onboarded]);

  const ask = async (text: string) => {
    const target = questionTarget ?? lesson;
    if (!target || !text.trim()) return;
    setTyping(false);
    setNotice('Preparing your answer…');
    setFollowing(true);
    try {
      await academy.ask(target, text);
      setAnswerVersion((v) => v + 1);
      setNotice('');
    } catch (error) {
      setNotice(safeText((error as Error).message, 300));
    }
  };
  const respond = async (target: Lesson, choice: ConceptChoice) => {
    try {
      await academy.respondToConcept(target, choice);
      setAnswerVersion((v) => v + 1);
      setFollowing(true);
      setNotice('');
    } catch (error) {
      setNotice(safeText((error as Error).message, 300));
    }
  };
  useInput((input, key) => {
    if (wizard) return;
    if (typing) {
      if (key.escape) setTyping(false);
      return;
    }
    input = input.toLowerCase();
    if (choosingSession) {
      if (key.escape) setChoosingSession(false);
      if (key.downArrow) setSessionIndex((n) => (n + 1) % Math.max(1, snapshot.sessions.length));
      if (key.upArrow)
        setSessionIndex(
          (n) => (n + snapshot.sessions.length - 1) % Math.max(1, snapshot.sessions.length),
        );
      if (key.return && snapshot.sessions[sessionIndex]) {
        void academy
          .select(snapshot.sessions[sessionIndex]!)
          .catch((error) => setNotice(safeText((error as Error).message, 300)));
        setChoosingSession(false);
        setFollowing(true);
      }
      return;
    }
    if (input === 'q') {
      academy.pauseLearning();
      if (onClosePanel)
        void onClosePanel()
          .then(exit)
          .catch((error) => setNotice(safeText((error as Error).message, 300)));
      else exit();
      return;
    }
    if (input === 'b') {
      setNotice('');
      setFollowing(true);
      void academy
        .beginLearning({ replay: demo })
        .catch((error) => setNotice(safeText((error as Error).message, 300)));
      return;
    }
    if (input === 'd') {
      academy.pauseLearning();
      setNotice('Stopped. Press B to start again.');
      return;
    }
    if (input === 's') {
      academy.pauseLearning('Settings open · press B after saving.');
      setWizard(true);
      return;
    }
    if (input === 'c' && needsSession) {
      setSessionIndex(0);
      setOffset(0);
      setChoosingSession(true);
      return;
    }
    if (conceptLesson && ['1', '2', '3'].includes(input)) {
      void respond(
        conceptLesson,
        ({ '1': 'explain', '2': 'familiar', '3': 'skip' } as const)[input as '1' | '2' | '3'],
      );
      return;
    }
    if (key.return) {
      if (snapshot.busy) setNotice('You can ask once the current explanation is ready.');
      else if (!lesson) {
        if (!snapshot.events.length) setNotice('You can ask here after the first observation.');
        else {
          try {
            academy.requestLesson();
            setSnapshot({ ...academy.snapshot });
            setNotice('');
          } catch (error) {
            setNotice(safeText((error as Error).message, 300));
          }
        }
      } else {
        setQuestion('');
        setQuestionTarget(conceptLesson ?? lesson);
        setTyping(true);
        setNotice('');
      }
      return;
    }
    if (key.upArrow || input === 'k' || key.pageUp || key.home) {
      setFollowing(false);
      setOffset(key.home ? 0 : Math.max(0, start - (key.pageUp ? visibleRows - 1 : 1)));
    }
    if (key.downArrow || input === 'j' || key.pageDown || input === ' ' || key.end) {
      const next = key.end
        ? bottom
        : Math.min(bottom, start + (key.pageDown || input === ' ' ? visibleRows - 1 : 1));
      setOffset(next);
      setFollowing(next === bottom);
    }
  });
  if (wizard)
    return (
      <OnboardingWizard
        project={academy.root}
        initial={config}
        settings={config.onboarded}
        width={width}
        height={height}
        onCancel={() => (config.onboarded ? setWizard(false) : exit())}
        onSave={async (next) => {
          await saveConfig(configDir, next);
          const wasOnboarded = config.onboarded;
          setConfig(next);
          academy.setConfig(next);
          setWizard(false);
          setFollowing(true);
          if (!wasOnboarded) academy.watch();
        }}
      />
    );
  if (width < 24 || height < 12)
    return (
      <Box flexDirection="column">
        <Text>◈ Academy</Text>
        <Text>Please enlarge the terminal.</Text>
        <Text>Q close</Text>
      </Box>
    );
  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color={c.accent}>
          ◈ {width < 45 ? 'ACADEMY' : 'AGENT ACADEMY'}
        </Text>
        <Text color={c.muted}>
          {demo ? 'DEMO · ' : ''}
          {snapshot.learning === 'paused'
            ? 'STANDBY'
            : snapshot.busy
              ? 'Explaining…'
              : 'Following Codex'}
        </Text>
      </Box>
      <Box
        flexDirection="column"
        flexGrow={1}
        overflow="hidden"
        borderStyle="round"
        borderColor={c.border}
        paddingX={1}
      >
        {lines.slice(start, start + visibleRows).map((line, i) => (
          <Text
            key={`${i}-${answerVersion}`}
            color={line.startsWith('#') ? c.blue : c.text}
            wrap="truncate-end"
          >
            {line.replace(/^#{1,3}\s+/, '') || ' '}
          </Text>
        ))}
      </Box>
      {typing && (
        <Box flexDirection="column">
          <Text color={c.accent}>
            {questionTarget?.conceptCheck && conceptLesson?.id === questionTarget.id
              ? 'Type your reply · Enter send · Esc cancel'
              : 'Type your question · Enter send · Esc cancel'}
          </Text>
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
          (needsSession
            ? 'Press C to choose a session.'
            : following
              ? 'New explanations continue here.'
              : 'Reading history · End returns to the latest.')}
      </Text>
      <Text color={c.accent} wrap="truncate-end">
        {snapshot.learning === 'paused' ? '[B Start] · S settings · Q close' : '[D Stop] · Q close'}
      </Text>
      <Text color={c.muted} wrap="truncate-end">
        {conceptLesson ? (
          '1 / 2 / 3 respond · Enter reply'
        ) : (
          <>↑↓ scroll{lesson ? ' · Enter ask' : snapshot.events.length ? ' · Enter explain' : ''}</>
        )}
      </Text>
    </Box>
  );
}
