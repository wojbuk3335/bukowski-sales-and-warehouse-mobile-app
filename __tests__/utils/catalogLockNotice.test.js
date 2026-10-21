// Okienko „Edycja zablokowana” w telefonie - tylko dla 409 z kodem blokady tabel, jedno na próbę
jest.mock('../../services/appAlert', () => ({ appAlert: jest.fn() }));
import { appAlert } from '../../services/appAlert';
import { notifyCatalogLock, CATALOG_LOCK_CODE } from '../../utils/catalogLockNotice';

describe('notifyCatalogLock (mobile)', () => {
  beforeEach(() => appAlert.mockClear());

  test('409 z kodem blokady → komunikat serwera, drugie żądanie zaraz potem bez drugiego okienka', () => {
    const data = { code: CATALOG_LOCK_CODE, message: 'Edycja zablokowana: w Dobieraniu czeka 1 przepisanie (punkty: P, T).' };
    expect(notifyCatalogLock(409, data)).toBe(true);
    expect(notifyCatalogLock(409, data)).toBe(true);
    expect(appAlert).toHaveBeenCalledTimes(1);
    expect(appAlert).toHaveBeenCalledWith('Edycja zablokowana', data.message);
  });

  test('inne błędy nie pokazują okienka', () => {
    expect(notifyCatalogLock(409, { code: 'ITEM_ALREADY_SOLD' })).toBe(false);
    expect(notifyCatalogLock(400, { code: CATALOG_LOCK_CODE })).toBe(false);
    expect(appAlert).not.toHaveBeenCalled();
  });
});
