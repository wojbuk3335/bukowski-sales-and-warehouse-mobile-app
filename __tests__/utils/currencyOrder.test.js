// Okno wyboru waluty: PLN, EUR, USD, HUF, CAD na górze, reszta w kolejności z Tabeli walut
import { sortCurrenciesForPicker } from '../../utils/currencyOrder';

const codes = (list) => list.map((item) => item.code);

describe('sortCurrenciesForPicker', () => {
  test('najczęściej wybierane na górze, reszta bez zmiany kolejności', () => {
    const list = ['GBP', 'HUF', 'ILS', 'USD', 'CZK', 'EUR', 'CAD', 'PLN', 'NOK'].map((code) => ({ code }));
    expect(codes(sortCurrenciesForPicker(list))).toEqual(['PLN', 'EUR', 'USD', 'HUF', 'CAD', 'GBP', 'ILS', 'CZK', 'NOK']);
  });

  test('CAN (stary kod dolara kanadyjskiego) traktowany jak CAD; brakujące waluty nie psują kolejności', () => {
    const list = ['GBP', 'CAN', 'EUR'].map((code) => ({ code }));
    expect(codes(sortCurrenciesForPicker(list))).toEqual(['EUR', 'CAN', 'GBP']);
    expect(sortCurrenciesForPicker(null)).toEqual([]);
  });
});
