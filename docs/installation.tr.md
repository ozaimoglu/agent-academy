# Agent Academy · Kurulum ve işletim rehberi

Standart dağıtım yöntemi **Herdr tarafından yönetilen GitHub kurulumu**dur. Herdr kaynak revizyonunu indirir, manifestteki kurulum akışını çalıştırır ve doğrulama başarılıysa eklentiyi kaydeder. Kaynak checkout’una `link` vermek geliştirme içindir; yönetilen kurulumla aynı işlem değildir.

## 1. Önkoşullar

| Bileşen         | Gereksinim                                                    | Kontrol                           |
| --------------- | ------------------------------------------------------------- | --------------------------------- |
| İşletim sistemi | Linux veya macOS; birincil hedef Ubuntu 24.04                 | `uname -s`                        |
| Node.js         | 22.19 veya üzeri; `node:sqlite` desteği                       | `node --version`                  |
| npm             | 9 veya üzeri; lockfile v3                                     | `npm --version`                   |
| Git             | PATH üzerinden erişilebilir                                   | `git --version`                   |
| Herdr           | 0.9.3 veya üzeri; çalışan sunucuyla uyumlu istemci            | `herdr --version`, `herdr status` |
| Codex           | Canlı gözlem için normal, kalıcı CLI oturumu                  | `codex --version`                 |
| Açıklama modeli | İsteğe bağlı; kurulum ve çevrimdışı kabul testi model istemez | Onboarding’de seçilir             |

[Node.js](https://nodejs.org/en/download) ve [Herdr](https://herdr.dev/docs/install/) kurulumlarını kurumunuzun onaylı yöntemleriyle tamamlayın. Installer sistem paketlerini veya global Node sürümünü değiştirmez. Node/npm/Git kurulum komutunu çalıştırdığınız terminalin PATH’inde bulunmalıdır. Dosyalar mevcut kullanıcıya ait olmalı; `sudo` gerekmez.

Codex kotasıyla açıklama seçeneği ayrıca **Codex CLI 0.163.x ve ChatGPT girişi** gerektirir. Bu sınır diğer sağlayıcıların kurulumunu engellemez. API anahtarı ve proje verisi paylaşım izni kurulum önkoşulu değildir.

## 2. Standart kurulum

```bash
herdr plugin install ozaimoglu/agent-academy
```

Herdr’ün kaynak/komut önizlemesini inceleyerek kurulumu onaylayın. Varsayılan dalın o andaki revizyonu kurulur. Akış:

1. Platform, Node, npm, Git, SQLite ve paket/manifest sürümleri kontrol edilir.
2. Bağımlılıklar `npm ci --no-audit --no-fund` ile lockfile’dan kurulur.
3. TypeScript uygulaması geçici dizine derlenir.
4. SQLite, CLI ve gerçek çevrimdışı gözlem → ders → rapor hattı sınanır. Yalnızca sentetik fixture kullanılır; model/API çağrılmaz.
5. Doğrulanan çıktı etkinleştirilir; Herdr eklentiyi kaydeder.

Kurulum başarılı olmadan yeni yönetilen sürüm kaydedilmez. Herdr güncellemeleri yeni kurulum dizinlerinde hazırlar; çalışan paneller kendi eski dosyalarını kullanmayı sürdürür. Kurulum panel açmaz ve öğrenmeyi başlatmaz.

### Tekrarlanabilir kurum dağıtımı

Onayladığınız **tam commit SHA’sını** sabitleyin. Aşağıdaki değişkeni gerçek, incelenmiş bir revizyonla doldurun:

```bash
academy_revision="<onaylanmış-tam-commit-sha>"
herdr plugin install ozaimoglu/agent-academy --ref "$academy_revision"
```

Otomasyonda yalnızca önceden onaylanmış kaynak için `--yes` eklenebilir. İşlem çıkış kodunu denetleyin; başarıdan sonra aşağıdaki doğrulamayı çalıştırın. Paket sürümü `0.1.0` olması, GitHub’da `v0.1.0` etiketi bulunduğu anlamına gelmez. Var olmayan sürüm etiketi varsayılmaz.

## 3. Kurulum doğrulaması

```bash
herdr plugin list --plugin local.agent-academy --json
herdr plugin action list --plugin local.agent-academy
herdr plugin action invoke local.agent-academy.verify
herdr plugin log list --plugin local.agent-academy --limit 5
```

Kabul ölçütleri:

- Eklenti `enabled: true` olarak listelenir.
- `open`, `close`, `toggle`, `doctor` ve `verify` eylemleri görünür.
- Son `verify` kaydı **`succeeded` ve çıkış kodu 0** gösterir.
- Doğrulama çıktısında SQLite / CLI / çevrimdışı uçtan uca hat için `DOĞRULANDI` bulunur.

**`plugin_action_invoked` veya `status: running` tamamlanmış doğrulama değildir.** Eylemler asenkron çalışır; nihai sonucu log kaydından değerlendirin.

Tanı gerektiğinde:

```bash
herdr plugin action invoke local.agent-academy.doctor
herdr plugin log list --plugin local.agent-academy --limit 5
```

Tanı çıktısı sürümü, kaynak commit’ini, değiştirilmiş checkout durumunu, kullanılan Node yolunu, doğrulama tarihini ve veri dizinlerini gösterir. Codex giriş kontrolü model isteği yapmaz.

`dist/install-info.json`, kaynak revizyonunu, runtime’ı, lockfile/manifest SHA-256 özetlerini ve derlenen JavaScript dosyalarının özetlerini tutar. `verify` bu kayıtla karşılaştırır ve çevrimdışı kabul testini tekrarlar. Bu kayıt bir yayıncı imzası veya üçüncü taraf güvenlik sertifikası değildir.

## 4. İlk kullanım

Herdr içindeki ilgili Codex pane’inden:

```bash
herdr plugin action invoke local.agent-academy.open
```

İlk açılışta genel öğrenme tercihlerini ve sağlayıcıyı seçin. Panel **beklemede** açılır. Academy pane’ine odaklanıp **B** ile seçtiğiniz görev için başlatın; **D** durdurur, **Q** yalnızca Academy pane’ini kapatır. Tur sonunda son değerlendirme hazırlanır ve tekrar beklemeye geçilir. Uzak sağlayıcı/Codex için veri paylaşımı ayrıca, proje bazında onaylanır.

## 5. Güncelleme ve geri dönüş

Güncellemeden önce açık Academy panellerinde D ve Q kullanın. Codex’i ve Herdr sunucusunu kapatmanız gerekmez.

Dal izleyen yönetilen kurulum:

```bash
herdr plugin update local.agent-academy
```

Tam SHA’ya sabitlenmiş kurulum aynı SHA’yı izler; bu komut onu kendiliğinden yeni revizyona taşımaz. Yeni onaylı sürüme geçmek veya önceki onaylı revizyona dönmek için:

```bash
academy_revision="<hedef-onaylı-tam-commit-sha>"
herdr plugin install ozaimoglu/agent-academy --ref "$academy_revision"
```

Her işlemden sonra 3. bölümdeki doğrulamayı tamamlayın ve paneli yeniden açın. Tüm eklentileri etkileyen argümansız `plugin update` yerine yukarıdaki eklentiye özel komut kullanılır. Çalışan eski pane’ler yeni kodu otomatik yüklemez.

## 6. Kaynak checkout’undan kurulum

Geliştirme veya önceden incelenmiş yerel kaynak için:

```bash
git clone https://github.com/ozaimoglu/agent-academy.git
cd agent-academy
./scripts/install.sh --dry-run --link
./scripts/install.sh --link
./scripts/install.sh --check
```

`--dry-run` yalnızca önkoşulları ve uygulanacak adımları gösterir. `--link`, bu checkout’u kullanıcı genelindeki Herdr kaydına bağlamak için açık tercihtir. `--check` bağımlılık kurmaz veya kayıt değiştirmez; kurulum bütünlüğünü ve çevrimdışı hattı doğrular. Herdr olmadan demo için `./scripts/install.sh` ve `npm run demo` yeterlidir.

Kaynak installer eşzamanlı kurulumu kilitle engeller; yeni `dist` doğrulanmadan mevcut çıktıyı değiştirmez. Yerel Herdr kaydı başarısızsa önceki `dist` geri yüklenir. `npm ci` tarafından güncellenen `node_modules` bu geri alma kapsamına girmez; tam kurulum geri dönüşü için yönetilen Herdr dağıtımını ve onaylı ref’i kullanın.

Kurulumda bulunan Node’un mutlak yolu kaydedilir. Böylece Herdr sunucusunun PATH’i farklı olsa da pane aynı Node’u kullanır. O Node kurulumu kaldırılırsa Academy’yi yeniden kurun; kaynak kurulumda scripti yeniden çalıştırın.

### Mevcut yerel bağlantıyı yönetilen kuruluma taşıma

`plugin update` yerel bağlantıları derlemez. Yönetilen kurulum, mevcut yerel bağlantının üzerine yazmayı reddeder. Önce tüm Academy panellerini D/Q ile kapatın; ardından:

```bash
herdr plugin unlink local.agent-academy
herdr plugin install ozaimoglu/agent-academy
```

`unlink` kaynak checkout’unu, tercihleri veya dersleri silmez. Aynı plugin kimliği korunur. Yeni kurulum başarısızsa, mevcut checkout’tan `./scripts/install.sh --link` ile geri bağlayabilirsiniz. Bu geçiş script tarafından otomatik yapılmaz.

## 7. Kaldırma ve veri koruma

Academy panellerini kapatın; sonra:

```bash
herdr plugin uninstall local.agent-academy
```

Herdr kaydı kaldırılır; kullanıcı yapılandırması ve ders/rapor verileri korunur. Kaynak checkout’unu yalnızca kayıttan çıkarmak için `plugin unlink` kullanılır. Kurulum/kaldırma işlemleri Codex ayarlarını değiştirmez, API anahtarı kaydetmez ve ders veritabanını temizlemez.

Yedek için tüm Academy panelleri kapalıyken yapılandırma dizinini ve `doctor` çıktısındaki yerel depo dizinini birlikte kopyalayın. Gerçek yapılandırma yolunu `herdr plugin config-dir local.agent-academy` verir. SQLite dosyasını çalışan paneller varken tek başına kopyalamayın.

## 8. Hata tanılama

| Durum                           | İşlem                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node/npm/Git bulunamıyor        | Aynı terminalde sürüm komutlarını kontrol edin; onaylı toolchain’i PATH’e ekleyin. Installer sistem araçlarını kendisi yüklemez.                            |
| Herdr minimum sürüm hatası      | İstemciyi ve `herdr status` uyumluluğunu kontrol edin. Installer sunucuyu durdurmaz/güncellemez.                                                            |
| Registry veya bağımlılık hatası | Ağ/kurum registry erişimini ve npm çıktısını kontrol edin. Lockfile’ı silerek çözmeye çalışmayın.                                                           |
| `Kurulum bütünlüğü eşleşmiyor`  | Derleme veya manifest değişmiştir. Kaynak installer’ı yeniden çalıştırın; yönetilen kurulumu onaylı ref’ten yeniden kurun.                                  |
| Kayıtlı Node yolu kayıp         | Node güncellenmiş/kaldırılmış olabilir. Yeni Node ile kurulumu yeniden çalıştırın.                                                                          |
| `running` durumunda eylem       | Sonucu `plugin log list` üzerinden bekleyin; sırf `invoked` görüldü diye başarılı saymayın.                                                                 |
| `.academy-install.lock` var     | Önce devam eden kurulum olup olmadığını denetleyin. Yalnızca kurulumun artık çalışmadığı doğrulandıktan sonra checkout içindeki bu kilit dizinini kaldırın. |
| Kaynak scripti başarısız        | Çıkış kodunu ve son aşamayı kullanın: 2 önkoşul/argüman, 3 bağımlılık, 4 derleme, 5 kabul kontrolü, 6 yerel Herdr kaydı.                                    |

Kurulum ve bakım davranışları [Herdr plugin yaşam döngüsü](https://herdr.dev/docs/plugins/#install-and-link) ile doğrulandı. Yerel kurulum, geri alma ve kabul kontrollerinin test kapsamı [doğrulama kaydında](verification.md) yer alır. Ubuntu 24.04 üzerinde tam masaüstü kabulü ve gerçek model kalitesi ayrıca doğrulanmalıdır; bu geliştirme ortamı macOS’tur.
