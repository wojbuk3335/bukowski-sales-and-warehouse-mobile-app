import Constants from "expo-constants";
import * as Updates from "expo-updates";

// Aktualizacje OTA (EAS Update) są sprawdzane tylko na ekranie logowania: o północy backend
// wylogowuje wszystkich, więc rano każdy przechodzi przez logowanie i dostaje nową wersję
// zanim zacznie pracę. W ciągu dnia nic się nie zmienia (app.json: checkAutomatically NEVER).

const DEFAULT_TIMEOUT_MS = 10000;

// Sprawdza i instaluje aktualizację; przeładowuje aplikację, gdy jest nowa wersja.
// Przy braku sieci, błędzie albo po przekroczeniu czasu logowanie idzie dalej na obecnej wersji.
export const checkAndApplyUpdate = async ({ timeoutMs = DEFAULT_TIMEOUT_MS, onDownloading } = {}) => {
  if (__DEV__ || !Updates.isEnabled) return { status: "skipped" };

  let timedOut = false;
  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve({ status: "timeout" });
    }, timeoutMs);
  });

  const work = (async () => {
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable || timedOut) return { status: "up-to-date" };
      onDownloading?.();
      await Updates.fetchUpdateAsync();
      // Po przekroczeniu czasu nie przerywamy logowania: pobrana wersja uruchomi się następnym razem
      if (timedOut) return { status: "downloaded-late" };
      await Updates.reloadAsync();
      return { status: "reloading" };
    } catch (error) {
      return { status: "error", error };
    }
  })();

  return Promise.race([work, timeout]);
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
  const updatedAt = !Updates.isEmbeddedLaunch && Updates.createdAt ? formatDateTime(Updates.createdAt) : null;
  return updatedAt ? `Wersja ${version} · aktualizacja ${updatedAt}` : `Wersja ${version}`;
};
