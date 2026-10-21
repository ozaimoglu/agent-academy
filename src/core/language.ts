import { detectAll } from 'tinyld';
import type { AcademyEvent } from './types.js';
import { safeText } from './privacy.js';

export const isInjectedMessage = (text: string) =>
  /^\s*(?:<(?:environment_context|user_instructions|permissions|INSTRUCTIONS|skills_instructions)\b|#\s*AGENTS\.md\b)/i.test(
    text,
  );

/** Only the user's prose is a language signal, never code, logs or injected instructions. */
export function userProse(text: string): string {
  if (isInjectedMessage(text)) return '';
  return safeText(text, 12000)
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .split('\n')
    .filter(
      (line) =>
        !/^\s*(?:>|\$|diff --git|[+\-@]{2,}|(?:npm|pnpm|git|node|docker)\s|(?:const|let|import|export|function)\b|[{}])/i.test(
          line,
        ),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectUserLanguage(text: string): string | undefined {
  const prose = userProse(text);
  // Short acknowledgements and commands should retain the conversation's language.
  if (!prose || /^(?:ok(?:ay)?|yes|no|done|push|fix|test|continue|go|ship it)[.!\s]*$/i.test(prose))
    return;
  // Common chat spelling also works without Turkish diacritics.
  if (
    /\b(?:pushla|duzelt|calistir|calisacak|olsun|anlat|anlatim|yapalim|nasil|tamam|evet|hayir)\b/i.test(
      prose,
    )
  )
    return 'tr';
  if (
    /(?:\b(?:bu|su|şu)\s+(?:kodu|hatayi|hatayı|sorunu|projeyi)\b|düzelt|çalıştır|nasıl|anlatım|türkçe)/i.test(
      prose,
    )
  )
    return 'tr';
  const letters = prose.match(/\p{L}/gu)?.length ?? 0;
  const nonLatin =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Arabic}\p{Script=Cyrillic}]/u.test(
      prose,
    );
  if (letters < (nonLatin ? 4 : 5)) return;
  const [first, second] = detectAll(prose);
  if (!first || first.accuracy < 0.06) return;
  if (letters < 12 && first.accuracy < 0.5 && first.accuracy - (second?.accuracy ?? 0) < 0.025)
    return;
  return first.lang;
}

export function conversationLanguage(events: AcademyEvent[], fallback = 'en'): string {
  const tasks = events.filter((e) => e.kind === 'task' && e.origin === 'codex');
  return messagesLanguage(
    tasks.map((e) => e.text),
    fallback,
  );
}

export function messagesLanguage(messages: string[], fallback = 'en'): string {
  for (const message of messages.slice(-8).reverse()) {
    const language = detectUserLanguage(message);
    if (language) return language;
  }
  return fallback;
}

export const hasLocalNarration = (language: string) =>
  ['tr', 'en'].includes(language.split('-')[0]!);
export const narrationText = (language: string, tr: string, en: string) =>
  language.split('-')[0] === 'tr' ? tr : en;

export function languageName(language: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(language) ?? language;
  } catch {
    return 'the user’s conversation language';
  }
}
