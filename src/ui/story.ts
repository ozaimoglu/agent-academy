import type { AcademySnapshot } from '../core/academy.js';
import type { Question, Section } from '../core/types.js';
import { observationWalkthrough } from '../core/live.js';
import { safeText } from '../core/privacy.js';
import { renderDiagram } from './diagrams.js';

type StoryContext = Pick<
  AcademySnapshot,
  'learning' | 'captureId' | 'selected' | 'events' | 'lessons' | 'busy' | 'status'
>;
interface StoryOptions {
  offline?: boolean;
  width?: number;
  questions?: Question[];
}
function short(value: string, max = 2400) {
  const text = safeText(value, max + 1).trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}
/** One chronological reading surface: explanation, actual code, visuals and replies. */
export function renderStory(snapshot: StoryContext, options: StoryOptions = {}): string {
  const width = Math.max(12, options.width ?? 72);
  const lessons = snapshot.lessons.filter((l) => l.captureId === snapshot.captureId);
  const task = snapshot.events.find((e) => e.kind === 'task');
  const covered = new Set<string>();
  const seen = new Set<string>();
  const blocks: string[] = [];
  const add = (section: Section) => {
    const body = safeText(section.body, 60000).trim();
    const key = section.heading + '\n' + body;
    if (seen.has(key)) return;
    seen.add(key);
    blocks.push(
      `## ${short(section.heading, 150)}${section.confidence === 'Hypothesis' ? ' · olası açıklama' : ''}\n\n${body}`,
    );
  };
  for (const lesson of lessons) {
    const ids = new Set(lesson.evidenceIds);
    const sections = (
      lesson.walkthrough?.length
        ? lesson.walkthrough
        : lesson.sections.filter((s) =>
            [
              'Ne oldu?',
              'Kök neden',
              'İlgili kod',
              'Çözüm neden çalışır?',
              'Nasıl doğrularız?',
            ].includes(s.heading),
          )
    ).filter((s) => s.evidence.length && s.evidence.every((id) => ids.has(id)));
    for (const section of sections) {
      add(section);
    }
    if (sections.length) for (const id of lesson.evidenceIds) covered.add(id);
    const edges = lesson.diagram.filter(
      (edge) => edge.evidence.length && edge.evidence.every((id) => ids.has(id)),
    );
    if (edges.length) {
      const key = JSON.stringify(edges.map(({ from, to, label }) => ({ from, to, label })));
      if (!seen.has(key)) {
        seen.add(key);
        blocks.push(
          'Bu ilişkiyi küçük bir şemayla okuyalım:\n\n' +
            renderDiagram(edges.slice(0, 3), width, false),
        );
      }
    }
    for (const q of (options.questions ?? []).filter((q) => q.lessonId === lesson.id)) {
      blocks.push(
        `## Senin sorun\n\n${short(q.question, 2000)}\n\n${q.answer.map((a) => safeText(a.body, 60000)).join('\n\n')}`,
      );
    }
  }
  for (const section of observationWalkthrough(snapshot.events.filter((e) => !covered.has(e.id)))) {
    if (task && section.evidence.length === 1 && section.evidence[0] === task.id) continue;
    add(section);
  }
  const paused = snapshot.learning === 'paused';
  const complete = snapshot.status.startsWith('Tur tamamlandı');
  return [
    task ? '## Birlikte ele aldığımız iş\n\n' + short(task.text, 600) : '',
    !blocks.length
      ? paused
        ? 'Öğrenmek istediğin işte B Başlat. Codex ilerledikçe neye baktığımızı, bulduğumuz ipuçlarını ve değişikliğin neden işe yaradığını burada birlikte konuşacağız.'
        : task
          ? 'Önce mevcut davranışı anlayalım. İlgili kod ve ilk kontroller geldikçe bu hedefe nasıl ilerlediğimizi açıklayacağım.'
          : 'Oturumdaki yeni adımları bekliyorum. Henüz bir inceleme veya hata bulgusu gözlenmedi.'
      : '',
    ...blocks,
    snapshot.busy ? 'Kod, bulgu ve sonucu birbirine bağlayan açıklamayı hazırlıyorum…' : '',
    lessons.at(-1)?.error ? 'Ayrıntılı açıklama hazırlanamadı: ' + lessons.at(-1)!.error : '',
    options.offline && !paused
      ? 'Şimdilik gözlediğimiz adımları özetliyorum. Koda özel neden-sonuç açıklamaları için S ayarlar üzerinden bir açıklama modeli seçebilirsin.'
      : '',
    complete ? 'Tur tamamlandı. Yeni bir işi birlikte izlemek için B Başlat.' : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
