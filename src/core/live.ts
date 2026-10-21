import path from 'node:path';
import type { AcademyEvent, Section } from './types.js';
import { isTestCommand } from './milestones.js';
import { safeText } from './privacy.js';
import { conversationLanguage, hasLocalNarration, narrationText } from './language.js';

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
function commandStep(e: AcademyEvent, language: string): Section | undefined {
  const t = (tr: string, en: string) => narrationText(language, tr, en);
  const cmd = e.command ?? e.text;
  if (isTestCommand(cmd))
    return step(
      e,
      t('Şimdi davranışı kontrol ediyoruz', 'Now we check the behavior'),
      t(
        `Ajan ${prose(cmd, 160)} komutunu çalıştırıyor. Burada değişikliğin beklediğimiz davranışı sağlayıp sağlamadığına bakıyoruz. Sonuç geldiğinde hangi beklentilerin karşılandığını konuşacağız.`,
        `The agent is running ${prose(cmd, 160)}. We are checking whether the change produces the expected behavior. Once the result arrives, we can discuss which expectations it covers.`,
      ),
    );
  if (/\bgit\s+(?:[^\n]*\s)?(?:diff|status|log|show)\b/.test(cmd))
    return step(
      e,
      t('Önce neyin değiştiğine bakalım', 'First, let’s see what changed'),
      t(
        'Ajan kodun önceki hali ile şimdiki halini karşılaştırıyor. Böylece hangi davranışın değiştiğini ve incelemeyi nereye odaklamamız gerektiğini görebiliriz.',
        'The agent is comparing the previous and current code. This helps us see which behavior changed and where to focus the investigation.',
      ),
    );
  if (/(?:\brg\s+--files\b|\bls\b|\bfind\b)/.test(cmd))
    return step(
      e,
      t('Önce projeyi tanıyalım', 'First, let’s get to know the project'),
      t(
        'Ajan proje yapısını ve ilgili dosyaları tarıyor. Önce giriş noktalarını, ayarları ve testleri bulup hangi parçaların birbiriyle ilişkili olduğunu anlamaya çalışıyoruz.',
        'The agent is scanning the project structure and related files. We first look for entry points, configuration and tests to understand how the pieces connect.',
      ),
    );
  if (/\b(?:cat|sed|head|tail|rg|grep)\b/.test(cmd))
    return step(
      e,
      t('İlgili kodu birlikte okuyalım', 'Let’s read the relevant code'),
      t(
        'Ajan dosyaların içeriğini okuyor veya belirli bir kullanımı arıyor. Burada hedefimiz, davranışın nerede tanımlandığını ve çağrının hangi yoldan geçtiğini bulmak.',
        'The agent is reading files or looking for a particular usage. Our goal is to find where the behavior is defined and trace the path of the call.',
      ),
    );
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:ci|install|add)\b/.test(cmd))
    return step(
      e,
      t('Çalışma ortamını hazırlıyoruz', 'Preparing the environment'),
      t(
        'Ajan proje bağımlılıklarını kuruyor. Derleme ve kontrollerin doğru araçlarla çalışabilmesi için önce bu adımın tamamlanması gerekiyor.',
        'The agent is installing project dependencies. This prepares the tools needed to build the code and run the checks.',
      ),
    );
  if (/\b(?:build|tsc|compile|docker\s+build)\b/.test(cmd))
    return step(
      e,
      t('Yazdığımız kod derlenebiliyor mu?', 'Does the changed code build?'),
      t(
        'Ajan derlemeyi çalıştırıyor. Bu adım kodun kullanılabilir çıktıya dönüşebildiğini kontrol eder; uygulamanın doğru davrandığını ayrıca testlerle değerlendireceğiz.',
        'The agent is running the build. This checks whether the code can produce usable output; tests will separately check its behavior.',
      ),
    );
  if (/\bgit\s+(?:commit|push)\b/.test(cmd))
    return step(
      e,
      t('Değişikliği kaydediyoruz', 'Saving the change'),
      t(
        'Ajan değişiklikleri sürüm kontrolüne kaydediyor veya uzak depoya gönderiyor. Neyi değiştirdiğimizi ve kontrol sonuçlarını birlikte gözden geçirelim.',
        'The agent is recording the changes in version control or sending them to the remote repository. Let’s review what changed alongside the actual check results.',
      ),
    );
  return step(
    e,
    t('İnceleme devam ediyor', 'The investigation continues'),
    t(
      `Ajan şu kontrolü çalıştırıyor: ${prose(cmd, 180)}. Çıktı geldiğinde bunun problemle ilişkisini birlikte değerlendireceğiz.`,
      `The agent is running this check: ${prose(cmd, 180)}. When the output arrives, we can examine how it relates to the problem.`,
    ),
  );
}

function changeStep(e: AcademyEvent, language: string): Section {
  const t = (tr: string, en: string) => narrationText(language, tr, en);
  const files = e.file
    ? [e.file]
    : [...e.text.matchAll(/(?:\*\*\* (?:Update|Add|Delete) File: |^\+\+\+ b\/)([^\n]+)/gm)].map(
        (m) => m[1]!,
      );
  const where = files.length
    ? files.slice(0, 3).map(displayFile).join(', ')
    : t('ilgili kod', 'the relevant code');
  const before: string[] = [],
    after: string[] = [];
  for (const line of e.text.split('\n')) {
    if (line.startsWith('-') && !line.startsWith('---') && line.slice(1).trim())
      before.push(line.slice(1).trim());
    if (line.startsWith('+') && !line.startsWith('+++') && line.slice(1).trim())
      after.push(line.slice(1).trim());
  }
  const snippets = [
    before.length ? t('Önce: ', 'Before: ') + prose(before.slice(0, 3).join('\n'), 280) : '',
    after.length ? t('Şimdi: ', 'After: ') + prose(after.slice(0, 3).join('\n'), 280) : '',
  ].filter(Boolean);
  return step(
    e,
    t('Kodda ne değişti?', 'What changed in the code?'),
    [
      e.origin === 'git'
        ? t(
            `${where} içindeki güncel değişikliği inceleyelim. Önceki kayıtla karşılaştırınca aşağıdaki farkı görüyoruz.`,
            `Let’s examine the current change in ${where}. Compared with the previous version, we can see the following difference.`,
          )
        : t(
            `Ajan ${where} üzerinde değişiklik yaptı. Aşağıdaki satırlar, önceki davranış ile yeni uygulamayı karşılaştırmamıza yardımcı oluyor.`,
            `The agent changed ${where}. These lines help us compare the previous behavior with the new implementation.`,
          ),
      ...snippets,
    ].join('\n\n'),
  );
}

/** Immediate, local narration. It describes observations without inventing a cause. */
export function narrateEvent(e: AcademyEvent, language = 'en'): Section | undefined {
  if (!hasLocalNarration(language)) return;
  const t = (tr: string, en: string) => narrationText(language, tr, en);
  if (e.kind === 'task')
    return step(
      e,
      t('Önce hedefi netleştirelim', 'First, let’s clarify the goal'),
      t(
        `Üzerinde çalıştığımız istek: ${prose(e.text, 400)}\n\nBu hedefe giderken önce mevcut davranışı, sonra değişen kodu ve kontrol sonuçlarını birlikte inceleyeceğiz.`,
        `Our task is: ${prose(e.text, 400)}\n\nWe will examine the current behavior, then the changed code and the actual check results as we work toward this goal.`,
      ),
    );
  if (e.kind === 'message') {
    const hypothesis = /hipotez|olabilir|muhtemelen|suspect|probably|likely|hypothes/i.test(e.text);
    const root = /kök neden|asıl (?:neden|sorun)|root cause|caused by/i.test(e.text);
    return {
      ...step(
        e,
        root
          ? t('Sorunun kaynağına dair bulgu', 'An observation about the cause')
          : hypothesis
            ? t('Bir ihtimali araştırıyoruz', 'Investigating a possibility')
            : t('Ajan ne yapıyor, neden?', 'What is the agent doing, and why?'),
        `${root || hypothesis ? t('Ajanın bulgusu; henüz bir ihtimal:\n\n', 'The agent’s observation; still a hypothesis:\n\n') : ''}${prose(e.text)}`,
      ),
      confidence: root || hypothesis ? 'Hypothesis' : 'Confirmed',
    };
  }
  if (e.kind === 'command') return commandStep(e, language);
  if (e.kind === 'diff' || e.kind === 'edit') return changeStep(e, language);
  if (e.kind === 'source')
    return step(
      e,
      t('Bakacağımız kodu bulduk', 'We found the code to examine'),
      t(
        `${e.file ? displayFile(e.file) : t('İlgili dosya', 'The relevant file')}${e.startLine ? ` dosyasının ${e.startLine}–${e.endLine ?? e.startLine}. satırları` : ''} artık elimizde. Şimdi bu bölümde hangi davranışın tanımlandığını ve bunun üzerinde çalıştığımız işle ilişkisini inceleyebiliriz.`,
        `${e.file ? displayFile(e.file) : 'The relevant file'}${e.startLine ? `, lines ${e.startLine}–${e.endLine ?? e.startLine}` : ''}, is now available. We can examine the behavior defined here and how it relates to our task.`,
      ),
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
        ? t('Bu kontrol geçti', 'This check passed')
        : e.exitCode === undefined
          ? t('Sonucu kesinleştirelim', 'Let’s establish the result')
          : t('Kontrol bir sorun gösterdi', 'The check found a problem'),
      e.exitCode === 0
        ? t(
            `${prose(e.command ?? t('Çalıştırılan kontrol', 'The check'), 160)} başarıyla tamamlandı. Şimdi bu kontrolün hangi davranışı kapsadığını, değişen kodla nasıl ilişkili olduğunu birlikte değerlendirebiliriz.`,
            `${prose(e.command ?? 'The check', 160)} completed successfully. We can now examine which behavior this check covers and how it relates to the changed code.`,
          )
        : e.exitCode === undefined
          ? t(
              `${prose(e.command ?? t('Kontrol', 'The check'), 160)} için çıktı geldi, ancak tamamlanmış bir çıkış kodu yok. Başarılı ya da başarısız sonucunu henüz vermeyelim.`,
              `Output arrived for ${prose(e.command ?? 'the check', 160)}, but there is no final exit code. We cannot yet call it a success or a failure.`,
            )
          : t(
              `${prose(e.command ?? t('Çalıştırılan komut', 'The command'), 160)} ${e.exitCode} çıkış koduyla tamamlandı.${detail ? '\n\nÇıktıdaki ipucu: ' + prose(detail, 260) : ''}\n\nŞimdi bu sonucu ilgili kodla karşılaştırıp hangi beklentinin karşılanmadığını bulmamız gerekiyor.`,
              `${prose(e.command ?? 'The command', 160)} finished with exit code ${e.exitCode}.${detail ? '\n\nA clue in the output: ' + prose(detail, 260) : ''}\n\nWe need to compare this result with the relevant code to find which expectation was not met.`,
            ),
    );
  }
  if (e.kind === 'completed')
    return step(
      e,
      t('Yapılanları bir araya getirelim', 'Let’s connect what we observed'),
      t(
        `${prose(e.text)}\n\nAjan çalışmasını tamamladığını bildirdi. Şimdi değişikliği, gerekçesini ve gerçek kontrol sonuçlarını birlikte değerlendirelim.`,
        `${prose(e.text)}\n\nThe agent reported that the work is complete. Let’s review the change, its rationale and the actual check results together.`,
      ),
    );
  if (e.kind === 'error')
    return step(
      e,
      t('Burada durup sorunu inceleyelim', 'Let’s examine the problem here'),
      t(
        `${prose(e.text, 400)}\n\nBu adım beklendiği gibi tamamlanmadı. Sonraki incelemede bu çıktıyı başlangıç noktası olarak kullanacağız.`,
        `${prose(e.text, 400)}\n\nThis step did not finish as expected. We will use this output as the starting point for the next investigation.`,
      ),
    );
}

export function observationWalkthrough(
  events: AcademyEvent[],
  language = conversationLanguage(events),
): Section[] {
  // A source excerpt and its diff are one change, not two separate things to read.
  const changed = new Set(
    events
      .filter((e) => ['diff', 'edit'].includes(e.kind))
      .map((e) => e.file)
      .filter(Boolean),
  );
  const cards = events
    .filter((e) => !(e.kind === 'source' && changed.has(e.file)))
    .map((e) => narrateEvent(e, language))
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
