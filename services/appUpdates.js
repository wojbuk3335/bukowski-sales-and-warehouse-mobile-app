import Constants from "expo-constants";

// Expo Go and older development builds have no ExpoUpdates native module: importing it
// there crashes the sign-in screen, so the module is loaded only when it is available.
let Updates = null;
try {
  Updates = require("expo-updates");
} catch (_error) {
  Updates = null;
}

// Aktualizacje OTA (EAS Update). app.json: checkAutomatically NEVER - sprawdzamy sami, w bezpiecznych chwilach:
//  - ekran logowania (sign-in) - jak dotąd,
//  - blokada aplikacji (odblokowanie wzorem / PIN-em / odciskiem przy otwarciu i po 5 min w tle) - 31.10.2026:
//    dawniej tam nie sprawdzaliśmy, a kto tylko odblokowywał aplikację (bez ekranu logowania), zostawał na starej wersji,
//  - otwarcie aplikacji i powrót po 5 min w tle (components/AppUpdater) - nowa wersja wgrywa się od razu,
//  - krótszy powrót z tła - pobranie po cichu; wgra się przy następnym otwarciu / bezpiecznej chwili.
// Wszystkie miejsca korzystają z JEDNEGO sprawdzania naraz (nie pobieramy dwa razy).

const DEFAULT_TIMEOUT_MS = 10000;

let run = null; // trwające sprawdzanie + pobieranie (wspólne dla wszystkich wywołań)
let stage = null; // null | 'checking' | 'downloading' | 'downloaded' | 'reloading'
let downloaded = false; // nowa wersja pobrana - wgra się przy reloadAsync albo następnym uruchomieniu
let reloading = false;
const listeners = new Set();

const setStage = (next) => {
  stage = next;
  listeners.forEach((listener) => {
    try { listener(next); } catch (_error) { /* ignore */ }
  });
};

// Etap aktualizacji dla nakładki (components/AppUpdater). Zwraca funkcję wypisującą.
export const subscribeUpdateStage = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getUpdateStage = () => stage;

const updatesEnabled = () => !__DEV__ && Boolean(Updates?.isEnabled);

// Sprawdzenie i pobranie nowej wersji (bez wgrywania). Wynik: 'up-to-date' | 'downloaded' | 'skipped' | 'error'
const fetchLatest = () => {
  if (!updatesEnabled()) return Promise.resolve("skipped");
  if (downloaded) return Promise.resolve("downloaded");
  if (!run) {
    run = (async () => {
      setStage("checking");
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check?.isAvailable) {
          setStage(null);
          return "up-to-date";
        }
        setStage("downloading");
        await Updates.fetchUpdateAsync();
        downloaded = true;
        setStage("downloaded");
        return "downloaded";
      } catch (_error) {
        setStage(null);
        return "error";
      }
    })().finally(() => {
      run = null;
    });
  }
  return run;
};

// Wgranie pobranej wersji (przeładowanie aplikacji)
const applyDownloaded = async (onApplying) => {
  if (reloading) return { status: "reloading" };
  reloading = true;
  onApplying?.();
  setStage("reloading");
  try {
    await Updates.reloadAsync();
    return { status: "reloading" };
  } catch (error) {
    reloading = false;
    setStage("downloaded");
    return { status: "error", error };
  }
};

// Sprawdza i instaluje aktualizację; przeładowuje aplikację, gdy jest nowa wersja.
// Limit dotyczy sprawdzenia dostępności; pobieranie trwa do sukcesu albo błędu.
export const checkAndApplyUpdate = async ({ timeoutMs = DEFAULT_TIMEOUT_MS, onDownloading, onApplying } = {}) => {
  if (!updatesEnabled()) return { status: "skipped" };
  if (downloaded) return applyDownloaded(onApplying);

  const result = await new Promise((resolve) => {
    let started = stage === "downloading"; // pobieranie już trwa (np. zaczęte przez inny ekran)
    if (started) onDownloading?.();
    const timer = setTimeout(() => {
      if (!started) resolve("timeout");
    }, timeoutMs);
    const unsubscribe = subscribeUpdateStage((next) => {
      if (next === "downloading" && !started) {
        started = true;
        clearTimeout(timer);
        onDownloading?.();
      }
    });
    fetchLatest().then((value) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(value);
    });
  });

  if (result === "downloaded") return applyDownloaded(onApplying);
  if (result === "timeout") return { status: "timeout" }; // pobieranie (jeśli ruszy) dokończy się w tle
  if (result === "error") return { status: "error" };
  return { status: result };
};

// Pobranie w tle bez wgrywania (krótki powrót z tła): nowa wersja wgra się przy następnym otwarciu
export const prefetchUpdate = () => fetchLatest();

export const isUpdateDownloaded = () => downloaded;

// Tylko testy: stan modułu od zera
export const __resetUpdatesForTests = () => {
  run = null;
  stage = null;
  downloaded = false;
  reloading = false;
  listeners.clear();
};
export const __setUpdatesModuleForTests = (module) => {
  Updates = module;
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
