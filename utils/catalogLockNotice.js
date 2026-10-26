// Serwer blokuje edycję produktów i tabel produktowych, dopóki w Dobieraniu czekają nieprzetworzone pozycje
// (409 CATALOG_LOCKED_PENDING_PROCESSING, backend middleware/catalogEditLock.js). Okienko z komunikatem serwera
// pokazujemy w jednym miejscu (tokenService.authenticatedFetch), żeby miał je każdy ekran edycji w panelu admina.
export const CATALOG_LOCK_CODE = 'CATALOG_LOCKED_PENDING_PROCESSING';
// Towar na stanie (26.10.2026): nazwy / kodu / koloru / rozmiaru nie zmienia się, gdy jest choć jedna sztuka
export const CATALOG_IN_STOCK_CODE = 'CATALOG_ITEM_IN_STOCK';

let lastShownAt = 0;

export const notifyCatalogLock = (status, data) => {
  if (status !== 409 || (data?.code !== CATALOG_LOCK_CODE && data?.code !== CATALOG_IN_STOCK_CODE)) return false;
  // Jedno okienko na jedną próbę (ekran potrafi wysłać kilka żądań naraz)
  const now = Date.now();
  if (now - lastShownAt < 2000) return true;
  lastShownAt = now;
  const { appAlert } = require('../services/appAlert'); // leniwie - bez cyklu importów z tokenService
  appAlert('Edycja zablokowana', data.message);
  return true;
};
