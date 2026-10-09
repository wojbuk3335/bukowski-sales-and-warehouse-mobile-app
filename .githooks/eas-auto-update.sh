#!/bin/sh
# Automatyczna aktualizacja OTA (EAS Update) po zmianie na main: po commicie (post-commit)
# i po scaleniu gałęzi, także fast-forward (post-merge).
# Pracownicy dostają ją przy następnym logowaniu (Android i iOS, aplikacja publiczna i prywatna).
#
# Użycie: eas-auto-update.sh <commit bazowy>  - sprawdza zmiany od bazy do HEAD.
#
# Pomijane, gdy:
#   - gałąź inna niż main,
#   - w treści ostatniego commita jest [skip-update],
#   - zmiany dotyczą tylko dokumentacji / testów,
#   - w katalogu zostały niezacommitowane zmiany (eas update wysyła pliki z dysku, nie z commita),
#   - zmiany dotyczą części natywnej (zależności, app.json, app.config.js, eas.json) - wtedy potrzebny nowy build ze sklepu.
# Wynik: .eas-update.log w katalogu projektu.

BASE="$1"
LOG=".eas-update.log"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
SUBJECT=$(git log -1 --pretty=%s)
HASH=$(git rev-parse --short HEAD)

[ "$BRANCH" = "main" ] || exit 0

case "$SUBJECT" in
  *"[skip-update]"*) echo "[eas-update] Pominięto ($HASH): [skip-update] w treści commita."; exit 0 ;;
esac

if [ -n "$BASE" ] && git rev-parse --verify --quiet "$BASE" >/dev/null; then
  CHANGED=$(git diff --name-only "$BASE" HEAD)
else
  CHANGED=$(git diff-tree --no-commit-id --name-only -r HEAD)
fi

if echo "$CHANGED" | grep -qE '^(package\.json|package-lock\.json|app\.json|app\.config\.js|eas\.json)$'; then
  echo "[eas-update] UWAGA ($HASH): zmiany dotyczą zależności lub konfiguracji aplikacji."
  echo "[eas-update] Aktualizacja automatyczna NIE została wysłana - takie zmiany wymagają nowego buildu ze sklepu."
  echo "[eas-update] Jeśli zmiana na pewno nie dotyczy części natywnej, wyślij ręcznie: npm run update -- \"opis\""
  exit 0
fi

APP_FILES=$(echo "$CHANGED" | grep -vE '(\.md$|^docs/|^\.github/|^\.githooks/|__tests__/|\.test\.[jt]sx?$|^\.gitignore$)')
if [ -z "$APP_FILES" ]; then
  echo "[eas-update] Pominięto ($HASH): zmiany nie dotyczą kodu aplikacji."
  exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "[eas-update] Pominięto ($HASH): są niezacommitowane zmiany. Zacommituj je, a aktualizacja pójdzie z następnym commitem."
  exit 0
fi

echo "[eas-update] Wysyłam aktualizację w tle ($HASH: $SUBJECT). Log: $LOG"
(
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') $HASH $SUBJECT ==="
  EXPO_PUBLIC_API_URL=https://bukowskiapp.pl/api EXPO_PUBLIC_ENVIRONMENT=production \
    npx eas update --channel production --message "$SUBJECT" --non-interactive 2>&1
  echo "=== koniec: kod $? ==="
) >> "$LOG" 2>&1 &

exit 0
