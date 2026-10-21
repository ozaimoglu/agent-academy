# Agent Academy · Kullanım rehberi

**Codex çalışırken, sen mühendisliği öğren.** Ubuntu 24.04 ve Herdr için yerel öncelikli bir terminal öğrenme arkadaşı. Arayüz İngilizcedir; anlatım dili Codex’e yazdığınız mesajlardan otomatik anlaşılır. Kodlama ajanının oturumunu gözlemler; görevleri, hataları, değişiklikleri ve gerçek test sonuçlarını kanıta bağlı derslere dönüştürür. Codex’e giriş göndermez ve uygulama deponuzu değiştirmez.

Bu MVP çalışır uygulama kodunu, Herdr plugin’ini, onboarding’i, SQLite kalıcılığını, gerçek Codex JSONL gözlemini, OpenAI uyumlu sağlayıcıyı, Q&A ve Markdown raporlarını içerir. API anahtarı olmadan çevrimdışı kullanılabilir. Derin teknoloji açıklamaları ve soru-cevap için bir açıklama modeli gerekir.

## Hızlı başlangıç

Standart kurulum, kaynak checkout’u gerektirmeyen **Herdr yönetilen kurulumu**dur. Gereksinimler: **Node.js ≥22.19**, **npm ≥9**, Git ve **Herdr ≥0.9.3**. [Kurulum ve işletim rehberi](installation.tr.md), önkoşulları, sürüm sabitlemeyi, kabul ölçütlerini, güncellemeyi, geri dönüşü ve kaldırmayı açıklar.

```bash
herdr plugin install ozaimoglu/agent-academy
herdr plugin action invoke local.agent-academy.verify
herdr plugin log list --plugin local.agent-academy --limit 5
```

Kurulum ortamı denetler, lockfile’dan bağımlılıkları kurar ve geçici derlemeyi çevrimdışı uçtan uca kontrol ettikten sonra kaydeder. Model/API anahtarı gerekmez. Son `verify` kaydı `succeeded` ve çıkış kodu 0 olmalıdır; `running` tamamlanma anlamına gelmez. Daha önce kaynak checkout’una bağladıysanız [geçiş adımlarını](installation.tr.md#mevcut-yerel-bağlantıyı-yönetilen-kuruluma-taşıma) uygulayın. Geliştirme kurulumu için `./scripts/install.sh --link` kullanılır.

Ardından Herdr içindeki **Codex’in bulunduğu pane’den** açın:

```bash
herdr plugin action invoke local.agent-academy.open
```

Sağda varsayılan %38 genişliğinde kalıcı bir terminal pane’i açılır. Codex normal biçimde çalışmaya devam eder. İlk açılışta dört kısa ekran gelir: derinlik, öğretim tarzı, genel öğrenme odağı ve açıklama sağlayıcısı. Varsayılanlar: **Derinlemesine**, görsel + kod + temeller + senior mühendis yaklaşımı, projedeki tüm konular ve çevrimdışı sağlayıcı. Java/Spring/TypeScript gibi teknoloji seçimi sorulmaz; ilgili teknoloji gerçek proje kanıtlarından belirlenir. Eski Spring tercihi temel kavramlara, frontend tercihi kod okumaya taşınır; sağlayıcı ayarları korunur.

**Panel açılınca veya onboarding kaydedilince otomatik öğrenme başlamaz.** Sağdaki Academy pane’ine odaklanıp **B Start** ile seçtiğiniz görev için öğrenmeyi açın. **D Stop**, yeni olay/kaynak/Git toplamayı durdurur ve devam eden model isteğini iptal eder. Codex turu bitince son rapor hazırlanır, sonra Academy yeniden bekler. Yeni bir görev için tekrar B gerekir. Tamamlanma işareti olmadan farklı bir kullanıcı görevi görülürse de beklemeye geçer.

Beklemede yalnızca yerel oturum keşfi yapılır; otomatik model isteği veya kota tüketimi yoktur. Durdurulmuş aralıktaki tamamlanmış işler sonraki Başlat’ta işlenmez. Devam eden görevin son görev mesajı bağlam olarak alınabilir; önceki inceleme olayları geriye dönük toplanmaz. Her öğrenme aralığının raporu ayrı tutulur. Önceki dersleri okumak ücretsizdir; **Enter** ile yazıp gönderdiğiniz sorular model kullanabilir. İptal, sağlayıcının zaten işlediği tokenları geri almaz.

Panelde **Q**, yalnızca kimliği doğrulanan Academy pane’ini kapatır. Codex pane’i açık kalır. Aynı işlemleri Herdr eylemleriyle yapabilirsiniz:

```bash
herdr plugin action invoke local.agent-academy.toggle
herdr plugin action invoke local.agent-academy.close
```

`./scripts/install.sh --link` derleme ve global plugin kaydını birlikte yapar; yalnızca bu kaydı yapmak istediğinizde kullanın. `plugin link` Herdr’ün global plugin kaydını değiştirir. Uygulama kendiliğinden kurulum/kayıt yapmaz.

## API anahtarı olmadan dene

```bash
npm run demo
```

Demo gerçek JSONL adaptörünü, ders motorunu, kaynak kanıtlarını ve rapor hattını çalıştırır. İzole geçici bir proje ve veritabanı kullanır; dış model çağırmaz. Spring transaction senaryosu **kaydedilmiş test fixture’ıdır**. Java testleri demo sırasında çalıştırılmaz; örnek Java dosyaları bağımsız derlenebilir bir Spring projesi değildir.

Onboarding’den sonra **B** ile örnek oturumu oynatın. Yalnızca demo ve açık `--headless` rapor komutu geçmiş kayıtları işler; canlı panel kullanıcının başlattığı andan ilerler.

```bash
# Onboarding’i atlayarak TUI
npm run demo -- --no-onboarding

# Terminal gerektirmeyen deterministik Markdown raporu
node --disable-warning=ExperimentalWarning dist/cli.js --demo --headless > demo-report.md
```

Gerçek projeyi Herdr dışında izlemek için:

```bash
npm start -- --project /absolute/path/to/project
```

Yalnızca seçili projenin kanonik cwd’siyle eşleşen oturumlar kabul edilir. Codex’i bir alt dizinde çalıştırdıysanız aynı alt dizini seçin. Herdr eylemi hedef pane’in gerçek foreground cwd’sini kullanır.

## Tek anlatım: Yanında oturan kıdemli mühendis gibi

Dil seçmeniz gerekmez: yalnızca sizin Codex’e yazdığınız doğal dil mesajları değerlendirilir. Kod, log, alıntı veya ajan yanıtının dili anlatım dilini belirlemez. Açıkça başka bir dilde yazarsanız sonraki açıklamalar o dili izler; `push` gibi kısa komutlar önceki dili korur. Dil algılama yereldir ve ayrı model isteği oluşturmaz. İlk B başlangıcında mevcut sınırlı oturum sonundan yalnızca dil bilgisi alınır; önceki tamamlanmış işler tekrar işlenmez veya modele gönderilmez. Çevrimdışı anlatım Türkçe ve İngilizce içerir; diğer diller yapılandırılan modelden gelir. Eski `language: "tr"` ayarı otomatik moda geçer; model, tercihler ve veri paylaşım izinleri korunur.

Panelde tek bir sohbet akışı vardır. Codex ilerledikçe **neye bakıyoruz → bulgu veya olası neden → önce/sonra kodu ve beklenen etkisi → gözlenen kontrol sonucu** anlatılır. İlk gözlem hemen açıklanır; model yanıtı hazırlanırken ekran boş kalmaz. Kod örnekleri ve anlamayı kolaylaştıran küçük şemalar aynı açıklamanın içindedir. Şemalar yalnızca verilen kanıtlara bağlı ilişkileri gösterir.

Yeni açıklamalar alta eklenir. Yukarı kaydırıp önceki bir bölümü okurken yeni mesajlar seni aşağı atmaz. **End** en yeni açıklamaya döner ve otomatik takibi sürdürür. **Enter** ile sorunu yazıp gönder; yanıt aynı sohbetin içinde görünür. İlk açıklama gelmeden veya model devam eden açıklamayı bitirmeden soru alanı açılmaz.

Çevrimdışı mod gözlenen adımları ve gerçek kod farklarını özetler. Koda özel neden-sonuç açıklamaları için bir açıklama modeli seçilir. B ile başlatıldığında devam eden görevin hedefi hemen bağlama alınır. Yalnızca Git değişikliği gözlense bile otomatik analiz açıksa açıklama hazırlanır; değişmeyen kod için tekrar tekrar istek yapılmaz.

## Terminal kullanımı

| Tuş | İşlem |
| --- | --- |
| B | Seçili görev için öğrenmeyi başlat |
| D | Gözlemi durdur, devam eden açıklamayı iptal et |
| Q | Academy panelini kapat |
| ↑/↓, Space, PgUp/PgDn | Aynı sohbet içinde kaydır |
| Home / End | Başlangıca / en yeni açıklamaya dön |
| Enter | Sorunu yaz; tekrar Enter ile gönder, Esc ile vazgeç |
| S | Öğrenme ve model ayarlarını aç |
| C | Yalnızca oturum belirsizse izlenecek Codex oturumunu seç |

Ayarlar ekranında `1`–`4` ilgili tercihe gider. Çoklu seçimde Space kullanın. AI ekranında Space sağlayıcıyı seçer, A gelişmiş ayarları açar. Alan üzerinde Enter düzenler. Panel genişliği bir sonraki açılışta uygulanır. Anlatım en az 24 sütun × 12 satır ister; dar panellerde metin ve şemalar genişliğe uyarlanır.

## Açıklama modeli yapılandırma

**Hiçbir anahtar varsayılmaz.** Onboarding ve S → 4 içinde sağlayıcı seçin. Kimlik doğrulama için yalnızca ortam değişkeninin adını girin; anahtarın kendisi kaydedilmez.

### Yerel Ollama / OpenAI uyumlu sunucu

Sunucunuzu kendi kurulum yönergeleriyle başlatın ve kurulu model adını kullanın (`ollama list`).

- Tür: Ollama / yerel model
- Adres: `http://127.0.0.1:11434/v1`
- Model: kurulu yerel modelin tam adı
- Anahtar ortam değişkeni: genellikle boş

Yerel mod yalnızca loopback adreslerini kabul eder. LAN sunucuları uzak sağlayıcı olarak yapılandırılmalı ve HTTPS kullanmalıdır. Yerel Ollama üzerinden **bulut modeli** seçmek de veri dışarı gönderebilir; yerel modda gerçekten yerel model kullanın. Uygulama bir localhost sunucusunun arkasındaki yönlendirmeyi doğrulayamaz.

### Uzak OpenAI uyumlu API

- Tür: Uzak OpenAI uyumlu API
- Adres: örneğin `https://api.openai.com/v1`
- Model: hesabınızın erişebildiği modelin tam adı
- Anahtar ortam değişkeni: örneğin `ACADEMY_API_KEY`

Ortam değişkeni Academy işlemi tarafından görülebilmeli. Herdr’ün plugin işlemleri server ortamını kullanır; anahtarı Herdr’ü başlatmadan önce güvenli biçimde sağlayın veya bağımsız TUI’yi ilgili shell’den başlatın. Çalışan bir shell’de değişken tanımlamak, önceden başlamış Herdr server’ın ortamını değiştirmez.

**Proje + adres + model için açık izin ekranı** gösterilir. İzin olmadan kaynak bağlamı uzak modele gönderilmez. Başka projede tekrar izin gerekir; sağlayıcı/model/adres değişikliği önceki izni geçersiz kılar. İzin verilen bağlam: seçilmiş görev mesajları, ilgili açık ajan mesajları, komut sonuçları, diff ve sınırlı kaynak parçaları. Oturumun tamamı gönderilmez. Ağ yönlendirmeleri takip edilmez.

HTTP sağlayıcı `/chat/completions` kullanır. Yerel sunucuda `max_tokens`, uzak API’de varsayılan `max_completion_tokens` gönderir. Eski uyumlu sunucular için gelişmiş ayarlarda token alanını `max_tokens` yapabilirsiniz. Her uyumlu sunucu/model yapılandırılmış JSON üretimini eşit derecede iyi desteklemez; geçersiz veya kesilmiş yanıtta açık hata ve çevrimdışı kanıt dersi gösterilir.

Varsayılan otomatik analiz aralığı 60 saniye, seçilmiş kanıt bütçesi 40.000 karakter, çıktı bütçesi 8.192 tokendır. Derin modda birkaç paragraf sınırı yoktur; çıktı bütçesi 32.768’e kadar ayarlanabilir. Görev, uygulama, doğrulama ve tamamlanma gibi aşamalar birleştirilir; her shell komutu model çağrısı üretmez. `autoAnalyze=false` otomatik açıklamayı durdurur; ilk açıklama yoksa Enter elle açıklama ister. Gerçek token kullanımı mevcutsa kaydedilir; yoksa açıkça **tahmini** etiketiyle gösterilir. Para cinsinden maliyet tahmin edilmez. Model hatasında sağlayıcının kullanım verisi dönmemişse tüketim bilinemez.

### Mevcut Codex CLI

**Mevcut Codex/ChatGPT kotanızı kullanabilirsiniz.** Ayrı API anahtarı gerekmez. Codex CLI 0.163.x ve macOS/Linux gerekir. `codex login status` çıktısı ChatGPT girişini göstermeli; API anahtarıyla giriş bu seçenek için kabul edilmez.

1. Panelde **S → 4** açın.
2. **Codex quota / ChatGPT login** üzerine gidip **Space** ile seçin.
3. **Enter** ile ilerleyin; proje ve veri paylaşımı bilgisini okuyup **Y** ile onaylayın.
4. Modeli boş bırakabilirsiniz: Codex’in yerleşik varsayılanı kullanılır. **A** ile model, analiz sıklığı, bağlam bütçesi, zaman aşımı ve otomatik analiz değiştirilebilir. Giriş deposu varsayılan `auto`; mevcut girişinizi bulamazsa Codex’in kullandığı `file` veya `keyring` değerini seçin. Kontrol ve model isteği aynı depoyu kullanır; Academy kimlik bilgilerini taşımaz.

Öğretici istekleri **aynı hesabın kullanım limitinden düşer**; ücretsiz ek kota değildir. Seçilmiş kod parçaları ve kanıtlar Codex üzerinden OpenAI’a gönderildiği için her proje için açık izin gerekir. Academy token sayacı öğretici kullanımını gösterir; kalan kota yüzdesi değildir. Kalan limiti Codex’in `/status` ekranından kontrol edin. Kota hatasında otomatik tekrar veya ücretli API’ye geçiş yapılmaz.

Öğretici, kod yazan oturumdan bağımsız, geçici bir `codex exec --ephemeral` isteğidir. Kodlama oturumu devam ettirilmez veya fork edilmez; ona mesaj gönderilmez. Öğreticinin cwd’si boş geçici bir dizindir. Kullanıcı config/rules, AGENTS, host skill keşfi, shell, MCP, plugin, tarayıcı, bilgisayar kontrolü ve alt ajan yetenekleri kapalıdır. Ayrı izin profili yalnızca asgari runtime ve geçici dizine okuma izni verir; yazma ve komut ağına izin vermez. Beklenmeyen araç olayı açıklamayı durdurur. Geçici oturum kaydı üretilmez; `agent-academy` thread kaynağı ayrıca gözlem adaptörü tarafından dışlanır. Academy giriş tokenını okumaz/kopyalamaz ve global Codex ayarlarını değiştirmez.

Codex sağlayıcısında HTTP’ye ait çıktı token sınırı uygulanmaz; CLI bu sınırı desteklenen bir ayar olarak sunmuyor. Bağlam ve analiz sıklığı sınırlıdır; varsayılan zaman aşımı 240 saniyedir. Farklı CLI minor sürümü desteklenene kadar açık hata verir.

Gerçek giriş/model bağlantısını yalnızca sentetik veriyle sınamak için: `npm run smoke:codex`. Bu komut kota tüketir. Bu geliştirme sandbox’ı Codex’in iç sunucusunu başlatmayı engellediği için canlı model testi burada tamamlanamadı; normal terminalinizde çalıştırın.

## Gözlem ve kanıt modeli

- Codex normal biçimde başlatılır. Wrapper, hook veya Codex config değişikliği gerekmez.
- `$CODEX_HOME/sessions` (varsayılan `~/.codex/sessions`) altında mevcut JSONL dosyaları keşfedilir.
- Herdr’ün hedef pane’inde `agent_session` varsa önce bu kimlik eşleştirilir. Yoksa tek cwd eşleşmesi otomatik bağlanır. Birden fazla eşleşmede en yenisi tahmin edilmez; C ile seçilir.
- Kullanıcı seçim yaptıktan sonra seçim sabit kalır. Otomatik modda güvenilir Herdr oturum kimliği değişirse yeni oturuma geçilir. Kimlik belirsizleşirse mevcut seçim korunur ve seçim ekranı kullanılabilir.
- Legacy `event_msg` / `response_item` ve Codex 0.163’ün `item_completed` komut/mesaj kayıtları desteklenir. Reasoning ve encrypted içerik atlanır.
- Tamamlanmamış JSONL satırı checkpoint’i ilerletmez. UTF-8 byte offset, dosya kimliği, prefix hash, SQLite transaction ve normalize event kimlikleri yeniden bağlanmada tekrarları engeller. Dosya değiştirme, küçülme, yeni tarih dizinleri ve aynı session ID’ye ait yeni rollout keşfedilir.
- Bir satır 1 MiB’ı aşarsa açık uyarıyla atlanır. Okuma parti başına 1 MiB, UI bağlamı son 400 olay + geçerli görev ile sınırlıdır. Keşif en çok 20.000 dosya tarar, en güncel 5.000 adayın metadata’sını değerlendirir.
- Git salt okunur komutlarla HEAD → çalışma ağacı farkını ve ilgili satırları toplar. Fark başka aktörlerin değişikliklerini de içerebilir. Açık `apply_patch` yollarından yeni/izlenmeyen dosyaların kaynak parçaları da alınır. Kaydedilmemiş editör tamponlarına erişilmez.
- Başlangıç, komut sonucu, çıkış kodu, açık kök neden gözlemi, değişiklik ve Codex tur tamamlanması ayrı kanıtlardır. Test gibi görünen komutlar gözlenen sonuç olarak listelenir; Academy bunları çalıştırmaz. Sıfır çıkış kodu test kapsamının yeterli olduğunu kanıtlamaz.
- Her ders 11 bölüme ayrılır: olay, problem, kanıt, kök neden, mekanizma, gerçek kod, çözüm gerekçesi, alternatif, ödünleşim, doğrulama ve öğrenilecek kavramlar. Model atıflarının seçilen kanıt kümesinde bulunması doğrulanır. Bunun teknik doğruluğu kanıtladığı iddia edilmez.
- Güven düzeyleri: Doğrulandı / Güçlü destek / Hipotez / Bilinmiyor. Doğrudan kayıtlar doğrulanmış gözlemdir; modelin yeni iddiaları otomatik olarak “Doğrulandı” seviyesine yükseltilmez.

App Server araştırıldı. Bir uygulamanın sahip olduğu oturumları yönetmek için uygundur; bu MVP’nin mevcut bağımsız CLI süreçlerine pasif bağlanma yöntemi olarak kullanılmaz. JSONL rollout biçimi resmi, sabit bir gözlem API’si değildir; sürüm değişikliklerinde adaptör güncellenebilir.

## Yerel veri ve gizlilik

| Veri                    | Varsayılan konum                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Bağımsız ayarlar        | `$XDG_CONFIG_HOME/agent-academy/settings.json` veya `~/.config/agent-academy/settings.json` |
| Bağımsız SQLite / rapor | `$XDG_STATE_HOME/agent-academy` veya `~/.local/state/agent-academy`                         |
| Herdr ayarları          | `HERDR_PLUGIN_CONFIG_DIR/settings.json`                                                     |
| Herdr SQLite / rapor    | `HERDR_PLUGIN_STATE_DIR`                                                                    |
| Rapor                   | `STATE/reports/REPO_HASH/SESSION_HASH.md`                                                   |

`ACADEMY_CONFIG_DIR`, `ACADEMY_STATE_DIR`, `ACADEMY_SESSIONS_DIR` veya CLI’nin `--config-dir`, `--state-dir`, `--sessions-dir` seçenekleriyle konumlar değiştirilebilir. Herdr ve bağımsız mod varsayılan olarak kendi ayar dizinlerini kullanır. `--demo` her çalıştırmada ayrı geçici dizin oluşturur; çıktıda görülen demo dizinleri inceleme sonrasında silinebilir.

SQLite WAL modu kullanılır. Yerel dosyalar 0600, oluşturulan dizinler 0700 izinlidir. Ham transcript kopyası ve kimlik bilgisi saklanmaz; maskelenmiş normalleştirilmiş kanıtlar, dersler, Q&A, kullanım ve byte checkpoint’leri saklanır. Görev deposu, dal ve commit bilindiği ölçüde rapora bağlanır. Saklama süresi otomatik sınırlandırılmaz; yerel Academy state dizinini silmek geçmişi temizler. Önce Academy pane’lerini kapatın.

Kaynak okuma gerçek dosya yolunu çözer; seçili proje dışına çıkan symlink’ler, `.env`, `.ssh`, `.aws`, `.git`, özel anahtar ve benzeri hassas yollar engellenir. Kaynak dosyası en çok 512 KiB, bir parça en çok 120 satırdır. Komut ve model çıktılarında açık token, şifre, authorization, özel anahtar ve terminal kaçış dizileri temizlenir. **Maskeleme bütün sırları yakalayamaz.** Kod ve dokümanlar model için talimat değil, güvenilmeyen veri olarak etiketlenir. HTTP sağlayıcısına hiçbir çalıştırılabilir araç verilmez.

Academy git commit/push, kod düzenleme, agent prompt/send-text veya lifecycle override yapmaz. Eylemler yalnızca kendisinin açtığı, proses kimliği doğrulanan Academy pane’ini kapatır. Workspace ve socket kimliği ayrı tutulur. Pane’ler workspace’ler arasında taşınırsa güvenli biçimde kapatıp doğru Codex pane’inden yeniden açın; hareketi izleyerek varsayımsal yeniden eşleme yapılmaz.

## Doğrulama ve geliştirme

```bash
npm ci
npm run check
# lint + TypeScript, Vitest testleri ve build

npm run smoke:provider
# Gerçek loopback HTTP sözleşmesi: yerel fixture sunucusu; API anahtarı/model gerekmez

npm start -- --doctor
npm start -- --help
```

Testler onboarding klavye akışını, ayar kalıcılığını, çoklu oturum/proje ayrımını, kısmi UTF-8 JSONL’yi, tekrarları, dosya değişimini, restart checkpoint’lerini, gerçek Git diff’ini, milestone sınıflandırmasını, kaynak sınırlarını, maskelemeyi, sağlayıcı hatalarını/iptalini, kanıt atıflarını, sıklık kontrolünü, Q&A bağlamını, raporu ve Herdr CLI sözleşmesini kapsar. Ağsız testler Fetch Request/Response sözleşmesini bellek içinde doğrular; `smoke:provider` gerçekten TCP bağlantısı açar.

Bu geliştirme ortamında Node 22.19 / Herdr 0.9.3 / Codex 0.163.0 kullanıldı. Build, lint, otomatik testler ve gerçek bu-proje Codex kayıtlarının keşfi/komut ayrıştırması doğrulandı. Kullanıcının yükleme isteği sonrasında gerçek Herdr sağ pane aç/kapa doğrulandı. Sandbox loopback TCP dinlemeyi ve Codex öğreticinin iç sunucu başlangıcını engelledi; canlı model kalitesi burada uçtan uca doğrulanamadı. [Ayrıntılı doğrulama notları](verification.md).

### Canlı Herdr kabul kontrolü

Kendi Ubuntu ortamınızda link işleminden sonra:

1. Codex’i her zamanki gibi başlatın ve yeni bir görev verin.
2. Academy open eylemini çağırın; sağ pane’in yaklaşık %38 olduğunu kontrol edin.
3. Onboarding’i tamamlayın, gerekirse C ile oturumu seçin.
4. Panelin beklemede olduğunu ve model isteği yapmadığını doğrulayın; B ile başlatıp Codex çalışırken tek akıştaki açıklamaları izleyin.
5. Model ayarlayın; aynı açıklamadaki kodu ve gerekirse şemayı okuyun. Enter ile bir soru sorun.
6. D ile durdurup yeni olayların işlenmediğini kontrol edin. B ile yeniden seçtiğiniz işi izleyin. Tur bitince otomatik kaydedilen Markdown raporunu ve bekleme durumunu kontrol edin.
7. Toggle/close çağırın; Codex’in çalışmaya devam ettiğini doğrulayın.
8. İkinci workspace’te farklı proje başlatın; oturumların karışmadığını kontrol edin.

## Sorun giderme ve MVP sınırları

**“Oturum bekleniyor”**: Codex JSONL kaydı oluşturmalı; `--ephemeral` kodlama oturumu gözlenemez. `--doctor` ile dizini kontrol edin. Proje alt dizini, symlink ve worktree yolu farklı olabilir. `--project` tam Codex cwd’si olmalı. Birden çok oturumda C kullanın.

**Pane açılmıyor**: `npm run build`, `herdr --version`, `herdr plugin action list --plugin local.agent-academy` ve `herdr plugin log list --plugin local.agent-academy` kontrol edin. Eylemi Herdr içindeki hedef Codex pane’inden çalıştırın. Herdr 0.9.3’ten eski sürümde plugin çalışmaz. Popup width alanları split yüzdesi değildir; gerçek resize API’si kullanılır.

**“Model kullanılamadı”**: Ayarlar → 4 → A içinde tam model adını, `/v1` adresini, key ortam değişkenini ve token alanını kontrol edin. 401/403 yetki, bağlantı hatası sunucu erişimi, geçersiz JSON ise modelin ders şemasını tamamlayamadığı anlamına gelebilir. Kesilmede çıktı bütçesini artırın. Otomatik deneme yağmuru yapılmaz; bir sonraki açıklama aralığını bekleyin. Model 120 saniye içinde yanıt vermelidir. Model API hata gövdesi sır sızdırmamak için ekrana basılmaz.

**Dar görünüm**: Terminal pane’ini büyütün veya aynı akışta Space/PgDn ile kaydırın. End en yeni açıklamaya döner. Terminalde HTML veya keyfi resim render edilmez. Görüntü protokolü ve browser viewer bu MVP’de yoktur.

**Biçim değişti / komut görünmüyor**: JSONL iç protokolü değişebilir. Tanınmayan araçlar çalıştırılmaz ve bilinmeyen araç çıktıları shell sonucu sayılmaz. Shell komutu içinde yapılan bütün dosya değişikliklerini veya tüm test araçlarının semantiğini eksiksiz tanımak garanti edilmez. Git anlık görüntüsü bu boşluğu kısmen doldurur. Kod commit edilmeden önce gözlenmemiş ve HEAD ilerlemişse tam önce/sonra yeniden oluşturulamaz.

**Rapor ve bellek sınırı**: Rapor son 3.000 olay + ilk görev, son 200 ders ve ders başına son 10 Q&A üzerinden oluşturulur; toplam Markdown 2 MiB ile sınırlıdır. UI mevcut öğrenme aralığındaki son 100 dersin anlatımını ve bu derslere bağlı soru-cevapları gösterir; daha eski veriler SQLite’ta kalır. Uzun oturumlarda kapsam raporda belirtilir. SQLite/rapor, kaynak deponuzun dışında tutulmalıdır; kullanıcı `--state-dir` ile açıkça depo içini seçerse bu sınırı kendisi değiştirir.

**Henüz kapsamda olmayanlar**: Claude Code/OpenCode somut adaptörleri (arayüz hazır), otomatik resmi teknik doküman getirme, tam semantik çağrı grafiği, bağımsız kod/test doğrulayıcısı, resim protokolleri, browser viewer ve tam metin geçmiş arama. Offline mod öğretici bir kanıt iskeleti sağlar; model olmadan ayrıntılı framework dersi uydurmaz.

## Kaynaklar ve mimari

Mimarinin gerekçesi ve doğrulanmış sürümler: [docs/architecture.md](architecture.md).

Entegrasyon ayrıntıları [Herdr plugins](https://herdr.dev/docs/plugins/), [CLI](https://herdr.dev/docs/cli-reference/) ve [socket API](https://herdr.dev/docs/socket-api/) üzerinden doğrulandı. [herdr-reviewr](https://github.com/persiyanov/herdr-reviewr) yaşam döngüsü, kurulum ve pane yönetimi için incelendi; uygulaması kopyalanmadı. [Codex protokol kaynağı](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs), [noninteractive belgeleri](https://developers.openai.com/codex/noninteractive/) ve [App Server](https://developers.openai.com/codex/app-server/) gözlem/öğretmen ayrımını belirledi. HTTP alanları [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) ve [Ollama uyumluluğu](https://docs.ollama.com/api/openai-compatibility), terminal akışı [Ink](https://github.com/vadimdemedes/ink) ile karşılaştırıldı.
