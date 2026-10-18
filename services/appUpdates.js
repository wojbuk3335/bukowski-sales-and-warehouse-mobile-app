import Constants from "expo-constants";

// Expo Go and older development builds have no ExpoUpdates native module: importing it
// there crashes the sign-in screen, so the module is loaded only when it is available.
let Updates = null;
try {
  Updates = require("expo-updates");
} catch (_error) {
  Updates = null;
}

// Aktualizacje OTA (EAS Update) są sprawdzane tylko na ekranie logowania: o północy backend
// wylogowuje wszystkich, więc rano każdy przechodzi przez logowanie i dostaje nową wersję
// zanim zacznie pracę. W ciągu dnia nic się nie zmienia (app.json: checkAutomatically NEVER).

const DEFAULT_TIMEOUT_MS = 10000;

// Sprawdza i instaluje aktualizację; przeładowuje aplikację, gdy jest nowa wersja.
// Limit dotyczy sprawdzenia dostępności; pobieranie trwa do sukcesu albo błędu.
export const checkAndApplyUpdate = async ({ timeoutMs = DEFAULT_TIMEOUT_MS, onDownloading, onApplying } = {}) => {
  if (__DEV__ || !Updates?.isEnabled) return { status: "skipped" };

  let timeoutId;
  try {
    const check = await Promise.race([
      Updates.checkForUpdateAsync(),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    clearTimeout(timeoutId);
    if (!check) return { status: "timeout" };
    if (!check.isAvailable) return { status: "up-to-date" };

    onDownloading?.();
    await Updates.fetchUpdateAsync();
    onApplying?.();
    await Updates.reloadAsync();
    return { status: "reloading" };
  } catch (error) {
    clearTimeout(timeoutId);
    return { status: "error", error };
  }
};

const formatDateTime = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${d.getFullYear()} ${hours}:${minutes}`;
};

// Napis na ekranie logowania: wersja ze sklepu + data aktualizacji OTA, jeśli jakaś działa
export const getVersionLabel = () => {
  const version = Constants.expoConfig?.version || "?";
  const updatedAt = Updates && !Updates.isEmbeddedLaunch && Updates.createdAt ? formatDateTime(Updates.createdAt) : null;
  return updatedAt ? `Wersja ${version} · aktualizacja ${updatedAt}` : `Wersja ${version}`;
};
