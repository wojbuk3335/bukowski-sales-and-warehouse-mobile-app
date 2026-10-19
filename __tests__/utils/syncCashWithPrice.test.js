/**
 * Edycja sprzedaży (19.10.2026): zmiana pola „Cena” zmienia wpłatę gotówką. Dawniej po zmianie 820 → 621
 * bez wpisania „reszty” telefon wysyłał dalej 820 zł, a dziennik pokazywał „bez zmian (820 zł)”.
 */
import { syncCashWithPrice } from '../../utils/paymentBalance';

test('jedna wpłata gotówką w zł: cena 820 -> 621 ustawia gotówkę 621', () => {
  expect(syncCashWithPrice({ price: '621', cashPairs: [{ price: '820', currency: 'PLN' }], cardPairs: [{ price: '', currency: 'PLN' }] }))
    .toEqual([{ price: '621', currency: 'PLN' }]);
});

test('brak wpłat (puste pola): cena ustawia gotówkę; wyczyszczona cena czyści gotówkę', () => {
  expect(syncCashWithPrice({ price: '500', cashPairs: [{ price: '', currency: 'PLN' }], cardPairs: [] })).toEqual([{ price: '500', currency: 'PLN' }]);
  expect(syncCashWithPrice({ price: '', cashPairs: [{ price: '500', currency: 'PLN' }], cardPairs: [] })).toEqual([{ price: '', currency: 'PLN' }]);
});

test('karta, kilka walut albo gotówka w innej walucie: bez synchronizacji (wpłaty do ręcznej poprawki)', () => {
  expect(syncCashWithPrice({ price: '621', cashPairs: [{ price: '500', currency: 'PLN' }], cardPairs: [{ price: '320', currency: 'PLN' }] })).toBeNull();
  expect(syncCashWithPrice({ price: '621', cashPairs: [{ price: '100', currency: 'EUR' }, { price: '400', currency: 'PLN' }], cardPairs: [] })).toBeNull();
  expect(syncCashWithPrice({ price: '621', cashPairs: [{ price: '200', currency: 'EUR' }], cardPairs: [] })).toBeNull();
});
