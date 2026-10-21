import path from 'node:path';
import type { AcademyEvent, Section } from './types.js';
import { isTestCommand } from './milestones.js';
import { safeText } from './privacy.js';

const prose = (value: string, limit = 850) => {
  const text = safeText(value, 4000).trim();
  if (text.length <= limit) return text;
  const end = text.lastIndexOf(' ', limit);
  return text.slice(0, end > limit / 2 ? end : limit) + '…';
};
const step = (e: AcademyEvent, heading: string, body: string): Section => ({
  heading,
  body: safeText(body, 4000),
  evidence: [e.id],
  confidence: 'Confirmed',
});
const displayFile = (file: string) =>
  path.isAbsolute(file) ? file.split(path.sep).slice(-2).join('/') : file;
function commandStep(e: AcademyEvent): Section | undefined {
  const cmd = e.command ?? e.text;
  if (isTestCommand(cmd))
    return step(
      e,
      'Şimdi davranışı kontrol ediyoruz',
      `Ajan ${prose(cmd, 160)} komutunu çalıştırıyor. Burada değişikliğin beklediğimiz davranışı sağlayıp sağlamadığına bakıyoruz. Sonuç geldiğinde hangi beklentilerin karşılandığını konuşacağız.`,
    );
  if (/\bgit\s+(?:[^\n]*\s)?(?:diff|status|log|show)\b/.test(cmd))
    return step(
      e,
      'Önce neyin değiştiğine bakalım',
      'Ajan kodun önceki hali ile şimdiki halini karşılaştırıyor. Böylece hangi davranışın değiştiğini ve incelemeyi nereye odaklamamız gerektiğini görebiliriz.',
    );
  if (/(?:\brg\s+--files\b|\bls\b|\bfind\b)/.test(cmd))
    return step(
      e,
      'Önce projeyi tanıyalım',
      'Ajan proje yapısını ve ilgili dosyaları tarıyor. Önce giriş noktalarını, ayarları ve testleri bulup hangi parçaların birbiriyle ilişkili olduğunu anlamaya çalışıyoruz.',
    );
  if (/\b(?:cat|sed|head|tail|rg|grep)\b/.test(cmd))
    return step(
      e,
      'İlgili kodu birlikte okuyalım',
      'Ajan dosyaların içeriğini okuyor veya belirli bir kullanımı arıyor. Burada hedefimiz, davranışın nerede tanımlandığını ve çağrının hangi yoldan geçtiğini bulmak.',
    );
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:ci|install|add)\b/.test(cmd))
    return step(
      e,
      'Çalışma ortamını hazırlıyoruz',
      'Ajan proje bağımlılıklarını kuruyor. Derleme ve kontrollerin doğru araçlarla çalışabilmesi için önce bu adımın tamamlanması gerekiyor.',
    );
  if (/\b(?:build|tsc|compile|docker\s+build)\b/.test(cmd))
    return step(
      e,
      'Yazdığımız kod derlenebiliyor mu?',
      'Ajan derlemeyi çalıştırıyor. Bu adım kodun kullanılabilir çıktıya dönüşebildiğini kontrol eder; uygulamanın doğru davrandığını ayrıca testlerle değerlendireceğiz.',
    );
  if (/\bgit\s+(?:commit|push)\b/.test(cmd))
    return step(
      e,
      'Değişikliği kaydediyoruz',
      'Ajan değişiklikleri sürüm kontrolüne kaydediyor veya uzak depoya gönderiyor. Neyi değiştirdiğimizi ve kontrol sonuçlarını birlikte gözden geçirelim.',
    );
  return step(
    e,
    'İnceleme devam ediyor',
    `Ajan şu kontrolü çalıştırıyor: ${prose(cmd, 180)}. Çıktı geldiğinde bunun problemle ilişkisini birlikte değerlendireceğiz.`,
  );
}

function changeStep(e: AcademyEvent): Section {
  const files = e.file
    ? [e.file]
    : [...e.text.matchAll(/(?:\*\*\* (?:Update|Add|Delete) File: |^\+\+\+ b\/)([^\n]+)/gm)].map(
        (m) => m[1]!,
      );
  const where = files.length ? files.slice(0, 3).map(displayFile).join(', ') : 'ilgili kod';
  const before: string[] = [],
    after: string[] = [];
  for (const line of e.text.split('\n')) {
    if (line.startsWith('-') && !line.startsWith('---') && line.slice(1).trim())
      before.push(line.slice(1).trim());
    if (line.startsWith('+') && !line.startsWith('+++') && line.slice(1).trim())
      after.push(line.slice(1).trim());
  }
  const snippets = [
    before.length ? 'Önce: ' + prose(before.slice(0, 3).join('\n'), 280) : '',
    after.length ? 'Şimdi: ' + prose(after.slice(0, 3).join('\n'), 280) : '',
  ].filter(Boolean);
  return step(
    e,
    'Kodda ne değişti?',
    [
      e.origin === 'git'
        ? `${where} içindeki güncel değişikliği inceleyelim. Önceki kayıtla karşılaştırınca aşağıdaki farkı görüyoruz.`
        : `Ajan ${where} üzerinde değişiklik yaptı. Aşağıdaki satırlar, önceki davranış ile yeni uygulamayı karşılaştırmamıza yardımcı oluyor.`,
      ...snippets,
    ].join('\n\n'),
  );
}

/** Immediate, local narration. It describes observations without inventing a cause. */
export function narrateEvent(e: AcademyEvent): Section | undefined {
  if (e.kind === 'task')
    return step(
      e,
      'Önce hedefi netleştirelim',
      `Üzerinde çalıştığımız istek: ${prose(e.text, 400)}\n\nBu hedefe giderken önce mevcut davranışı, sonra değişen kodu ve kontrol sonuçlarını birlikte inceleyeceğiz.`,
    );
  if (e.kind === 'message') {
    const hypothesis = /hipotez|olabilir|muhtemelen|suspect|probably|likely|hypothes/i.test(e.text);
    const root = /kök neden|asıl (?:neden|sorun)|root cause|caused by/i.test(e.text);
    return {
      ...step(
        e,
        root
          ? 'Sorunun kaynağına dair bulgu'
          : hypothesis
            ? 'Bir ihtimali araştırıyoruz'
            : 'Ajan ne yapıyor, neden?',
        `${root || hypothesis ? 'Ajanın bulgusu; henüz bir ihtimal:\n\n' : ''}${prose(e.text)}`,
      ),
      confidence: root || hypothesis ? 'Hypothesis' : 'Confirmed',
    };
  }
  if (e.kind === 'command') return commandStep(e);
  if (e.kind === 'diff' || e.kind === 'edit') return changeStep(e);
  if (e.kind === 'source')
    return step(
      e,
      'Bakacağımız kodu bulduk',
      `${e.file ? displayFile(e.file) : 'İlgili dosya'}${e.startLine ? ` dosyasının ${e.startLine}–${e.endLine ?? e.startLine}. satırları` : ''} artık elimizde. Şimdi bu bölümde hangi davranışın tanımlandığını ve bunun üzerinde çalıştığımız işle ilişkisini inceleyebiliriz.`,
    );
  if (e.kind === 'result') {
    const test = isTestCommand(e.command ?? '');
    if (!test && (e.exitCode === 0 || e.exitCode === undefined)) return;
    const detail = e.text
      .split('\n')
      .find((line) => /error|fail|exception|hata|başarısız/i.test(line));
    return step(
      e,
      e.exitCode === 0
        ? 'Bu kontrol geçti'
        : e.exitCode === undefined
          ? 'Sonucu kesinleştirelim'
          : 'Kontrol bir sorun gösterdi',
      e.exitCode === 0
        ? `${prose(e.command ?? 'Çalıştırılan kontrol', 160)} başarıyla tamamlandı. Şimdi bu kontrolün hangi davranışı kapsadığını, değişen kodla nasıl ilişkili olduğunu birlikte değerlendirebiliriz.`
        : e.exitCode === undefined
          ? `${prose(e.command ?? 'Kontrol', 160)} için çıktı geldi, ancak tamamlanmış bir çıkış kodu yok. Başarılı ya da başarısız sonucunu henüz vermeyelim.`
          : `${prose(e.command ?? 'Çalıştırılan komut', 160)} ${e.exitCode} çıkış koduyla tamamlandı.${detail ? '\n\nÇıktıdaki ipucu: ' + prose(detail, 260) : ''}\n\nŞimdi bu sonucu ilgili kodla karşılaştırıp hangi beklentinin karşılanmadığını bulmamız gerekiyor.`,
    );
  }
  if (e.kind === 'completed')
    return step(
      e,
      'Yapılanları bir araya getirelim',
      `${prose(e.text)}\n\nAjan çalışmasını tamamladığını bildirdi. Şimdi değişikliği, gerekçesini ve gerçek kontrol sonuçlarını birlikte değerlendirelim.`,
    );
  if (e.kind === 'error')
    return step(
      e,
      'Burada durup sorunu inceleyelim',
      `${prose(e.text, 400)}\n\nBu adım beklendiği gibi tamamlanmadı. Sonraki incelemede bu çıktıyı başlangıç noktası olarak kullanacağız.`,
    );
}

export function observationWalkthrough(events: AcademyEvent[]): Section[] {
  // A source excerpt and its diff are one change, not two separate things to read.
  const changed = new Set(
    events
      .filter((e) => ['diff', 'edit'].includes(e.kind))
      .map((e) => e.file)
      .filter(Boolean),
  );
  const cards = events
    .filter((e) => !(e.kind === 'source' && changed.has(e.file)))
    .map(narrateEvent)
    .filter((s): s is Section => !!s);
  const seen = new Set<string>();
  return cards
    .reverse()
    .filter((s) => {
      const key = s.heading + '\n' + s.body;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .reverse();
}
