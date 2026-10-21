// Serwer blokuje edycję produktów i tabel produktowych, dopóki w Dobieraniu czekają nieprzetworzone pozycje
// (409 CATALOG_LOCKED_PENDING_PROCESSING, backend middleware/catalogEditLock.js). Okienko z komunikatem serwera
// pokazujemy w jednym miejscu (tokenService.authenticatedFetch), żeby miał je każdy ekran edycji w panelu admina.
export const CATALOG_LOCK_CODE = 'CATALOG_LOCKED_PENDING_PROCESSING';

let lastShownAt = 0;

export const notifyCatalogLock = (status, data) => {
  if (status !== 409 || data?.code !== CATALOG_LOCK_CODE) return false;
  // Jedno okienko na jedną próbę (ekran potrafi wysłać kilka żądań naraz)
  const now = Date.now();
  if (now - lastShownAt < 2000) return true;
  lastShownAt = now;
  const { appAlert } = require('../services/appAlert'); // leniwie - bez cyklu importów z tokenService
  appAlert('Edycja zablokowana', data.message);
  return true;
};
