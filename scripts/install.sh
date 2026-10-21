#!/usr/bin/env bash
set -euo pipefail

academy_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
academy_link=0
academy_check=0
academy_dry_run=0
academy_host_build=0
academy_stage=''
academy_promoted=0
academy_had_dist=0
academy_success=0
academy_lock_owned=0

usage() {
  cat <<'HELP'
Agent Academy · Kaynak kurulum ve doğrulama

Standart dağıtım: herdr plugin install ozaimoglu/agent-academy

./scripts/install.sh             Kontrol et, kilitli bağımlılıkları yükle, derle ve doğrula
./scripts/install.sh --link      Ardından bu checkout'u Herdr'e kaydet
./scripts/install.sh --check     Mevcut kurulumu doğrula; derleme/kayıt yapma
./scripts/install.sh --dry-run   Ortamı kontrol et ve uygulanacak adımları göster
./scripts/install.sh --build-only  Herdr'ün yönetilen kurulum aşaması

Çıkış: 0 başarılı · 2 önkoşul/argüman · 3 bağımlılık · 4 derleme · 5 doğrulama · 6 Herdr kaydı
Kullanıcı tercihleri, dersler ve Codex ayarları değiştirilmez. Panel otomatik açılmaz.
HELP
}
fail() { printf '\nHATA [%s]: %s\n' "$1" "$2" >&2; exit "$1"; }
step() { printf '\n[%s] %s\n' "$1" "$2"; }
cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$academy_promoted" == 1 && "$academy_success" != 1 ]]; then
    if [[ -e "$academy_stage/previous-dist" ]]; then
      rm -rf -- "$academy_root/dist"
      mv -- "$academy_stage/previous-dist" "$academy_root/dist"
    elif [[ "$academy_had_dist" == 0 ]]; then
      rm -rf -- "$academy_root/dist"
    fi
    printf '%s\n' 'Önceki uygulama çıktısı geri yüklendi.' >&2
  fi
  if [[ -n "$academy_stage" ]]; then rm -rf -- "$academy_stage"; fi
  if [[ "$academy_lock_owned" == 1 ]]; then
    rm -f -- "$academy_root/.academy-install.lock/pid"
    rmdir -- "$academy_root/.academy-install.lock" || true
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for academy_arg in "$@"; do
  case "$academy_arg" in
    --link) academy_link=1 ;;
    --check) academy_check=1 ;;
    --dry-run) academy_dry_run=1 ;;
    --build-only) academy_host_build=1 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fail 2 "Bilinmeyen argüman: $academy_arg" ;;
  esac
done
if [[ "$academy_check" == 1 && ( "$academy_link" == 1 || "$academy_host_build" == 1 || "$academy_dry_run" == 1 ) ]]; then
  fail 2 '--check tek başına kullanılmalı.'
fi
if [[ "$academy_host_build" == 1 && "$academy_link" == 1 ]]; then fail 2 '--build-only ve --link birlikte kullanılamaz.'; fi
cd -- "$academy_root"

printf '%s\n' 'AGENT ACADEMY · Kurulum'
step '1/5' 'Önkoşullar ve çalışma ortamı'
command -v node >/dev/null 2>&1 || fail 2 'Node.js >=22.19 bulunamadı. https://nodejs.org/en/download'
# Keep this bootstrap compatible with older Node versions so the error is actionable.
node -e 'const v=process.versions.node.split(".").map(Number);if(v[0]<22||(v[0]===22&&v[1]<19)){console.error("Node.js >=22.19 gerekli; kurulu: "+process.version);process.exit(1)}' || fail 2 'Önce Node.js sürümünü güncelleyin.'
if [[ "$academy_link" == 1 ]]; then
  node --disable-warning=ExperimentalWarning scripts/preflight.mjs --require-herdr || fail 2 'Önkoşul kontrolü başarısız; sistemde otomatik değişiklik yapılmadı.'
else
  node --disable-warning=ExperimentalWarning scripts/preflight.mjs || fail 2 'Önkoşul kontrolü başarısız; sistemde otomatik değişiklik yapılmadı.'
fi

if [[ "$academy_dry_run" == 1 ]]; then
  printf '\n%s\n' 'PLAN · hiçbir bağımlılık, derleme çıktısı veya Herdr kaydı değiştirilmedi.'
  printf '%s\n' '  2. npm ci --no-audit --no-fund' '  3. Geçici dizine TypeScript derlemesi' '  4. SQLite + CLI + çevrimdışı uçtan uca doğrulama ve kurulum kaydı' '  5. Doğrulanan dist çıktısını etkinleştir'
  if [[ "$academy_link" == 1 ]]; then printf '  6. herdr plugin link %q\n' "$academy_root"; fi
  exit 0
fi
if [[ "$academy_check" == 1 ]]; then
  node --disable-warning=ExperimentalWarning scripts/verify-install.mjs || fail 5 'Kurulum doğrulanamadı. Kaynak kurulum scriptini yeniden çalıştırın.'
  academy_success=1
  exit 0
fi

mkdir -- "$academy_root/.academy-install.lock" 2>/dev/null || fail 2 'Başka bir kurulum kilidi var: .academy-install.lock. Devam eden kurulumu bekleyin.'
academy_lock_owned=1
printf '%s\n' "$$" > "$academy_root/.academy-install.lock/pid"
academy_stage="$(mktemp -d "$academy_root/.academy-install.XXXXXX")" || fail 4 'Kurulum dizinine yazılamıyor.'
step '2/5' 'Kilit dosyasından bağımlılık kurulumu'
npm ci --no-audit --no-fund || fail 3 'Bağımlılıklar yüklenemedi. Ağ/registry erişimini ve npm çıktısını kontrol edin.'
step '3/5' 'Yalıtılmış uygulama derlemesi'
npm run build -- --outDir "$academy_stage/dist" --sourceMap false --declaration false || fail 4 'Derleme başarısız; önceki dist çıktısı korundu.'
cp -R -- fixtures "$academy_stage/fixtures" || fail 4 'Kabul testi fixture dosyaları hazırlanamadı.'
step '4/5' 'Kurulum kabul kontrolleri'
node --disable-warning=ExperimentalWarning scripts/verify-install.mjs --dist "$academy_stage/dist" --record || fail 5 'Yeni çıktı doğrulanamadı; önceki dist çıktısı korundu.'

step '5/5' 'Doğrulanan uygulamayı etkinleştirme'
if [[ -L "$academy_root/dist" ]]; then fail 5 'dist bir sembolik bağlantı; otomatik değiştirilmedi.'; fi
if [[ -e "$academy_root/dist" ]]; then
  academy_had_dist=1
fi
# Mark the promotion before moving: the EXIT trap restores the backup on any failure.
academy_promoted=1
if [[ "$academy_had_dist" == 1 ]]; then mv -- "$academy_root/dist" "$academy_stage/previous-dist"; fi
mv -- "$academy_stage/dist" "$academy_root/dist"
if [[ "$academy_link" == 1 ]]; then
  herdr plugin link "$academy_root" || fail 6 'Herdr kaydı başarısız; önceki uygulama çıktısı geri yükleniyor.'
fi
academy_success=1
printf '\n%s\n' 'BAŞARILI · Kurulum ve çevrimdışı kabul kontrolleri tamamlandı.' 'Kayıt: dist/install-info.json'
if [[ "$academy_host_build" == 1 ]]; then
  printf '%s\n' 'Herdr yönetilen kurulumu kaydetmeye devam edecek.'
elif [[ "$academy_link" == 1 ]]; then
  printf '%s\n' 'Herdr kaydı tamamlandı. Codex pane’inizden açın:' '  herdr plugin action invoke local.agent-academy.open'
else
  printf '%s\n' 'Yerel demo: npm run demo' 'Herdr kaydı ayrıca isteniyorsa: ./scripts/install.sh --link'
fi
printf '%s\n' 'Panel beklemede açılır · B başlat · D durdur · Q kapat'
