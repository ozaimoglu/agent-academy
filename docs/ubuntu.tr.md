# Ubuntu 24.04 kurulumu

Academy, Ubuntu üzerinde normal kullanıcıyla çalışır. Canlı Codex oturumunu Herdr panelinde gözlemek için uygulamayı doğrudan Ubuntu’ya kurun. Docker seçeneği bağımsız demo ve tekrarlanabilir kabul kontrolleri içindir.

## Doğrudan Ubuntu üzerinde

Temiz Ubuntu’da temel araçları hazırlayın:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
```

**Node.js >=22.19 ve npm >=9** gerekir. Ubuntu’nun varsayılan `nodejs` paketi yerine [Node.js’in resmi kurulum yöntemlerinden](https://nodejs.org/en/download) biriyle Node 22 LTS kurun. `nvm` kullanıyorsanız checkout’taki `.nvmrc` Node 22’yi seçer:

```bash
git clone https://github.com/ozaimoglu/agent-academy.git
cd agent-academy
nvm install
nvm use
node --version
npm --version
./scripts/install.sh
./scripts/install.sh --check
npm run demo
```

Zaten uygun Node/npm kuruluysa `nvm` komutlarını atlayın. Uygulama kurulumu için `sudo` kullanmayın. Derleme için C/C++ toolchain veya ayrıca SQLite paketi gerekmez; SQLite Node’un içindedir. Installer `NODE_ENV=production` veya `npm_config_omit=dev` tanımlı olsa da TypeScript derleyicisini yükler.

[Herdr >=0.9.3](https://herdr.dev/docs/install/) ve Codex kurulu olduğunda standart yönetilen kurulum:

```bash
herdr plugin install ozaimoglu/agent-academy
herdr plugin action invoke local.agent-academy.verify
herdr plugin log list --plugin local.agent-academy --limit 5
```

`verify` kaydı `succeeded`, çıkış kodu `0` olmalı. Ardından Herdr içindeki Codex pane’inden `herdr plugin action invoke local.agent-academy.open` çalıştırın. Panelde **B** öğrenmeyi başlatır, **D** durdurur, **Q** kapatır. Geliştirme checkout’unu bağlamak için `./scripts/install.sh --link` kullanılabilir; [kurulum rehberi](installation.tr.md) güncelleme ve geri dönüş ayrıntılarını içerir.

Launcher kurulumda kaydedilen Node’un mutlak yolunu kullanır ve onun dizinini alt süreçlerin PATH’ine ekler. Bu, Herdr farklı bir PATH ile açılmış olsa da aynı Node kurulumu altındaki `codex` gibi araçların çalışmasını sağlar. Node kurulumu kaldırılır veya taşınırsa installer’ı tekrar çalıştırın.

## Ubuntu konteynerinde bağımsız kullanım

```bash
docker build --tag agent-academy:ubuntu .
docker run --rm agent-academy:ubuntu
docker run --rm agent-academy:ubuntu --verify-install
docker run --rm -it agent-academy:ubuntu --demo --no-onboarding
```

İlk komut Ubuntu 24.04 imajını üretir. Varsayılan çalışma sentetik demo üzerinden Markdown raporu yazdırır; etkileşimli kullanım için `-it` gerekir. Uygulama UID `10001` ile, geliştirme bağımlılıkları çıkarılmış olarak çalışır. Node ana sürümü varsayılan `22`’dir; örneğin `docker build --build-arg NODE_VERSION=24 --tag agent-academy:ubuntu .` ile değiştirilebilir.

Bu imaj Herdr sunucusu veya Codex içermez. Ana makinenin oturumları ve ayarları otomatik bağlanmaz. Herdr pane entegrasyonu için yukarıdaki doğrudan kurulum yolunu kullanın.

## Kabul kontrolleri

```bash
docker build --target check --tag agent-academy:ubuntu-check .
```

Bu hedef Ubuntu 24.04 üzerinde temiz bağımlılık kurulumu, lint, TypeScript, tüm testler, üretim ortamı ayarlarıyla gerçek installer, kurulum bütünlüğü, gerçek loopback HTTP ve gerçek PTY kontrollerini çalıştırır. PTY kontrolü demo panelini açar, B ile öğrenmeyi başlatır, altı görünümü dolaşır, D/Q kısayollarını ve terminalin geri yüklenmesini doğrular. Model isteği yapılmaz.

Doğrudan checkout’ta aynı ek kontroller için:

```bash
sudo apt-get install -y python3
npm run check
./scripts/install.sh
npm run smoke:provider
npm run smoke:terminal
```

Python yalnızca PTY kabul kontrolünde gerekir. GitHub Actions ayrıca Ubuntu 24.04 üzerinde minimum Node `22.19.0` ve Node `24` ile testleri; konteynerde kabul ve üretim derlemelerini çalıştırır. Yerel çalıştırma kanıtları ve Herdr masaüstü doğrulamasının kapsamı [doğrulama kaydındadır](verification.md).
