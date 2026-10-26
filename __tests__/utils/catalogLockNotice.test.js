// Okienko „Edycja zablokowana” w telefonie - tylko dla 409 z kodem blokady tabel, jedno na próbę
jest.mock('../../services/appAlert', () => ({ appAlert: jest.fn() }));
import { appAlert } from '../../services/appAlert';
import { notifyCatalogLock, CATALOG_LOCK_CODE, CATALOG_IN_STOCK_CODE } from '../../utils/catalogLockNotice';

describe('notifyCatalogLock (mobile)', () => {
  beforeEach(() => appAlert.mockClear());

  test('409 z kodem blokady → komunikat serwera, drugie żądanie zaraz potem bez drugiego okienka', () => {
    const data = { code: CATALOG_LOCK_CODE, message: 'Edycja zablokowana: w Dobieraniu czeka 1 przepisanie (punkty: P, T).' };
    expect(notifyCatalogLock(409, data)).toBe(true);
    expect(notifyCatalogLock(409, data)).toBe(true);
    expect(appAlert).toHaveBeenCalledTimes(1);
    expect(appAlert).toHaveBeenCalledWith('Edycja zablokowana', data.message);
  });

  test('towar na stanie (CATALOG_ITEM_IN_STOCK) → to samo okienko z komunikatem serwera', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10000); // po przerwie od poprzedniego okienka
    const data = { code: CATALOG_IN_STOCK_CODE, message: 'Rozmiar „XL” jest na stanie: MAGAZYN 2 szt. (razem 2 szt.).' };
    expect(notifyCatalogLock(409, data)).toBe(true);
    expect(appAlert).toHaveBeenCalledWith('Edycja zablokowana', data.message);
    now.mockRestore();
  });

  test('inne błędy nie pokazują okienka', () => {
    expect(notifyCatalogLock(409, { code: 'ITEM_ALREADY_SOLD' })).toBe(false);
    expect(notifyCatalogLock(400, { code: CATALOG_LOCK_CODE })).toBe(false);
    expect(appAlert).not.toHaveBeenCalled();
  });
});
