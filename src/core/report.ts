import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { AcademyEvent, Lesson, Question, Session } from './types.js';
import { confidenceLabels, stageLabels } from './types.js';
import { hash, safeText } from './privacy.js';
import { isTestCommand } from './milestones.js';
function fence(text: string) {
  const ticks = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${ticks}text\n${text}\n${ticks}`;
}
export function generateReport(
  s: Session,
  events: AcademyEvent[],
  lessons: Lesson[],
  questions: Question[] = [],
  total = events.length,
): string {
  const tests = events.filter((e) => e.kind === 'result' && isTestCommand(e.command ?? ''));
  const lines = [
    `# Agent Academy · Mühendislik değerlendirmesi`,
    `Proje: ${s.cwd}`,
    `Oturum: ${s.id} · Dal: ${s.branch ?? 'bilinmiyor'} · Commit: ${s.commit ?? 'bilinmiyor'}`,
    '> Bu rapor gözlemlenebilir mesaj, kod farkı ve komut sonuçlarını kullanır. Gizli muhakeme içermez. Ajanın tamamlandı demesi veya push başarısı sistemin doğruluğunu kanıtlamaz.',
    `## İlk görev / gözlenen problem`,
    events.find((e) => e.kind === 'task')?.text ?? 'Bu gözlem aralığında görev mesajı yok.',
    `## İnceleme zaman çizelgesi (${events.length}/${total} kayıt)`,
    ...events
      .filter((e) => e.kind !== 'source')
      .map((e) => `- ${e.time} · ${e.kind} · ${e.command ?? e.text.slice(0, 200)} [${e.id}]`),
    '## Dersler, nedenler, mekanizmalar ve kararlar',
  ];
  for (const l of lessons) {
    lines.push(
      `### ${l.title} · ${stageLabels[l.stage]}`,
      `Sağlayıcı: ${l.provider}${l.error ? ' · Model hatası: ' + l.error : ''}`,
    );
    for (const sec of l.sections)
      lines.push(
        `#### ${sec.heading} · ${confidenceLabels[sec.confidence]}`,
        sec.body,
        `Kanıt: ${sec.evidence.join(', ') || 'yok / doğrulanmadı'}`,
      );
  }
  lines.push(
    '## Gerçek test sonuçları',
    ...(tests.length
      ? tests.map((t) =>
          fence(`${t.command}\nÇıkış kodu: ${t.exitCode ?? 'bilinmiyor'}\n${t.text}`),
        )
      : ['Test sonucu gözlenmedi.']),
  );
  lines.push(
    '## Kaynak ve önce/sonra kanıtları',
    'Git farkları HEAD ile mevcut çalışma ağacını karşılaştırır; başka aktörlerin değişikliklerini de içerebilir. Gözlenen zamandaki anlık görüntüdür.',
  );
  for (const e of events.filter((e) => ['source', 'diff', 'edit'].includes(e.kind)))
    lines.push(
      `### ${e.file ?? e.kind}${e.startLine ? ':' + e.startLine + '-' + e.endLine : ''} [${e.id}]`,
      fence(e.text),
    );
  lines.push('## Soru-cevap');
  for (const q of questions)
    lines.push(
      `### ${q.question}`,
      ...q.answer.map((a) => `${a.body}\n\nKanıt: ${a.evidence.join(', ') || 'yok'}`),
    );
  lines.push(
    '## Doğrulanmamış varsayımlar ve kalan riskler',
    'Model atıflarının varlığı otomatik kontrol edilir; teknik doğruluk ayrıca değerlendirilmelidir. Çıktıların kesilmesi, kayıt formatı değişiklikleri, yakalanmamış komutlar ve test kapsamı belirsizliği mümkündür. Geçmiş HEAD değişiklikleri veya gözlem öncesi kaydedilmemiş dosyalar tam yeniden oluşturulamaz.',
    '## Hatırlanacak kavramlar',
    [...new Set(lessons.flatMap((l) => l.concepts))].join('\n') || 'Henüz belirlenmedi.',
  );
  return safeText(lines.join('\n\n') + '\n', 2 * 1024 * 1024);
}
export async function exportReport(state: string, s: Session, markdown: string) {
  const dir = path.join(state, 'reports', hash(s.cwd));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, hash(s.id) + '.md');
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, markdown, { mode: 0o600 });
  await rename(temporary, file);
  return file;
}
