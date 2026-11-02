#!/bin/sh
# Aktualizacja OTA (EAS Update) na telefony - wywoływana przez .githooks/pre-push po udanym wypchnięciu main
# na GitHub. Pracownicy dostają ją przy następnym otwarciu aplikacji (Android i iOS, aplikacja publiczna i prywatna).
#
# 2.11.2026: wysyła TYLKO ten komputer, przy pushu (nie przy commicie). Dawniej: każdy commit stąd + każdy push
# przez GitHub (workflow z tokenem Expo, omijającym 2FA) - zmiana szła na telefony dwa razy, commit lokalny też.
#
# Użycie: eas-auto-update.sh <commit bazowy>  - sprawdza zmiany od bazy (stan GitHuba przed pushem) do HEAD.
#
# Pomijane, gdy:
#   - gałąź inna niż main,
#   - w treści ostatniego commita jest [skip-update],
#   - zmiany dotyczą tylko dokumentacji / testów / hooków,
#   - w katalogu zostały niezacommitowane zmiany (eas update wysyła pliki z dysku, nie z commita),
#   - zmiany dotyczą części natywnej (zależności, app.json, app.config.js, eas.json) - wtedy potrzebny nowy build ze sklepu,
#   - na tym komputerze nie ma klucza podpisu keys/private-key.pem (telefony z buildem 1.2.1+ odrzuciłyby
#     niepodpisaną paczkę; klucz jest w Bitwardenie: „Expo OTA - klucz podpisu”).
# Ręcznie (np. po pominięciu): npm run update -- "opis". Test bez wysyłki: EAS_UPDATE_DRY_RUN=1.
# Wynik: .eas-update.log w katalogu projektu.

BASE="$1"
PRIVATE_KEY="keys/private-key.pem"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
SUBJECT=$(git log -1 --pretty=%s)
BODY=$(git log -1 --pretty=%B)
HASH=$(git rev-parse --short HEAD)
STAMP=$(date '+%Y-%m-%d %H:%M:%S')

[ "$BRANCH" = "main" ] || exit 0

case "$BODY" in
  *"[skip-update]"*) echo "=== $STAMP $HASH Pominięto: [skip-update] w treści commita ==="; exit 0 ;;
esac

if [ -n "$BASE" ] && git rev-parse --verify --quiet "$BASE" >/dev/null; then
  CHANGED=$(git diff --name-only "$BASE" HEAD)
else
  CHANGED=$(git diff-tree --no-commit-id --name-only -r HEAD)
fi

if echo "$CHANGED" | grep -qE '^(package\.json|package-lock\.json|app\.json|app\.config\.js|eas\.json)$'; then
  echo "=== $STAMP $HASH UWAGA: zmiany dotyczą zależności lub konfiguracji aplikacji - aktualizacja NIE wysłana (potrzebny nowy build ze sklepu; jeśli zmiana na pewno nie jest natywna: npm run update -- \"opis\") ==="
  exit 0
fi

APP_FILES=$(echo "$CHANGED" | grep -vE '(\.md$|^docs/|^\.github/|^\.githooks/|__tests__/|\.test\.[jt]sx?$|^\.gitignore$)')
if [ -z "$APP_FILES" ]; then
  echo "=== $STAMP $HASH Pominięto: zmiany nie dotyczą kodu aplikacji ==="
  exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "=== $STAMP $HASH Pominięto: są niezacommitowane zmiany - zacommituj je i wypchnij, albo wyślij ręcznie: npm run update -- \"opis\" ==="
  exit 0
fi

if [ ! -f "$PRIVATE_KEY" ]; then
  echo "=== $STAMP $HASH STOP: brak klucza podpisu $PRIVATE_KEY na tym komputerze - aktualizacja NIE wysłana (klucz w Bitwardenie: „Expo OTA - klucz podpisu”) ==="
  exit 0
fi

echo "=== $STAMP $HASH $SUBJECT ==="
if [ "$EAS_UPDATE_DRY_RUN" = "1" ]; then
  echo "[próba] npx eas update --channel production --private-key-path $PRIVATE_KEY --message \"$SUBJECT\" --non-interactive"
  echo "=== koniec: kod 0 (próba, nic nie wysłano) ==="
  exit 0
fi
EXPO_PUBLIC_API_URL=https://bukowskiapp.pl/api EXPO_PUBLIC_ENVIRONMENT=production \
  npx eas update --channel production --private-key-path "$PRIVATE_KEY" --message "$SUBJECT" --non-interactive 2>&1
echo "=== koniec: kod $? ==="
exit 0
