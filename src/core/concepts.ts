import type { ConceptCheck, ConceptChoice, ConceptKnowledge, Lesson, Question } from './types.js';

export const conceptChoices: Record<ConceptChoice, string> = {
  explain: 'Explain briefly',
  familiar: 'I know this',
  skip: 'Skip for now',
};

export function citedConcept(lesson: Lesson): ConceptCheck | undefined {
  const check = lesson.conceptCheck;
  if (lesson.provider === 'offline' || !check?.evidence.length) return;
  if (check.evidence.every((id) => lesson.evidenceIds.includes(id))) return check;
}

/** One optional question at a time. The caller supplies only the current capture's lessons. */
export function pendingConcept(
  lessons: Lesson[],
  questions: Question[],
  knowledge: ConceptKnowledge[] = [],
): Lesson | undefined {
  const ids = new Set(lessons.map((l) => l.id));
  const answered = new Set(knowledge.map((k) => k.key));
  for (const q of questions) {
    if (ids.has(q.lessonId) && q.conceptResponse) answered.add(q.conceptResponse.key);
  }
  return lessons.find((l) => {
    const check = citedConcept(l);
    return check && !answered.has(check.key);
  });
}

/** Common natural replies are handled locally; other questions use the normal teacher. */
export function conceptChoice(text: string): ConceptChoice | undefined {
  const reply = text
    .trim()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/[.!?]+$/g, '')
    .trim();
  if (
    /^(?:1|explain(?: briefly)?|please explain|i (?:don['’]?t|do not) know|not sure|bilmiyorum|bilmiyordum|anlat(?:ir misin)?|kisaca anlat|hayir|no|nope|no se|explicalo|je ne sais pas|ich wei(?:ss|ß) nicht)$/.test(
      reply,
    )
  )
    return 'explain';
  if (
    /^(?:2|i know(?: this| it)?|familiar|yes(?: i know)?|biliyorum|evet|biliyorum devam et)$/.test(
      reply,
    )
  )
    return 'familiar';
  if (/^(?:3|skip(?: for now)?|later|simdilik gec|gec|atla|pas|continue|devam)$/.test(reply))
    return 'skip';
}
