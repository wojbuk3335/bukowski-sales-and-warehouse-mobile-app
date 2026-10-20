// Sprzedaż w kilku walutach: zapłacono w PLN, do dopłaty w wybranej walucie (kursy „za 100” np. HUF)
import { applyChangeToCash, computePaymentBalance, inferPaymentMode, plnPerUnit, plnToCurrency, formatMoney, formatMoneyExact, roundDownMoney, roundUpMoney } from '../../utils/paymentBalance';

const RATES = [
  { currency: { code: 'EUR', name: 'Euro' }, buyRate: 4.25 },
  { currency: { code: 'USD', name: 'Dolar' }, buyRate: 3.9 },
  { currency: { code: 'HUF', name: 'Forint węgierski (za 100)' }, buyRate: 1.08 },
];

describe('paymentBalance', () => {
  test('odtwarza tryb płatności istniejącej sprzedaży z zapisanych wpłat', () => {
    expect(inferPaymentMode({ cash: [{ price: 20 }], card: [] })).toBe('cash');
    expect(inferPaymentMode({ cash: [{ price: 0 }], card: [{ price: 100 }] })).toBe('card');
    expect(inferPaymentMode({ cash: [{ price: 20 }], card: [{ price: 100 }] })).toBe('mixed');
    expect(inferPaymentMode({ cash: null, card: null })).toBe('cash');
    expect(inferPaymentMode({ paymentMode: 'mixed', cash: [], card: [] })).toBe('mixed');
  });

  test('kurs za 1 jednostkę; HUF za 100; PLN = 1; brak kursu = null', () => {
    expect(plnPerUnit('PLN', RATES)).toBe(1);
    expect(plnPerUnit('EUR', RATES)).toBe(4.25);
    expect(plnPerUnit('HUF', RATES)).toBeCloseTo(0.0108);
    expect(plnPerUnit('GBP', RATES)).toBeNull();
  });

  test('kurtka 850 zł: 100 EUR + 50 USD → do dopłaty w HUF', () => {
    const balance = computePaymentBalance({
      price: '850',
      payments: [{ price: '100', currency: 'EUR' }, { price: '50', currency: 'USD' }, { price: '', currency: 'PLN' }],
      currencyRates: RATES,
    });
    expect(balance.paidPln).toBeCloseTo(620); // 425 + 195
    expect(balance.remainingPln).toBeCloseTo(230);
    expect(formatMoney(plnToCurrency(balance.remainingPln, 'HUF', RATES))).toBe('21296.30');
    expect(formatMoney(plnToCurrency(balance.remainingPln, 'PLN', RATES))).toBe('230.00');
  });

  test('nadpłata = ujemne do dopłaty (reszta); waluta bez kursu nie jest liczona', () => {
    const balance = computePaymentBalance({
      price: '850',
      payments: [{ price: '100', currency: 'EUR' }, { price: '430', currency: 'PLN' }, { price: '20', currency: 'GBP' }],
      currencyRates: RATES,
    });
    expect(balance.remainingPln).toBeCloseTo(-5);
    expect(balance.missingRates).toEqual(['GBP']);
  });

  test('wydana reszta: najpierw z wpłaty w tej samej walucie', () => {
    const pairs = applyChangeToCash([{ price: '100', currency: 'EUR' }, { price: '450', currency: 'PLN' }], 25, 'PLN', RATES);
    expect(pairs).toEqual([{ price: '100', currency: 'EUR' }, { price: '425.00', currency: 'PLN' }]);
  });

  test('wydana reszta w zł, a klient płacił tylko w EUR: zmniejsza EUR (bez ujemnych kwot)', () => {
    const pairs = applyChangeToCash([{ price: '200', currency: 'EUR' }], 42.5, 'PLN', RATES);
    expect(pairs).toEqual([{ price: '190.00', currency: 'EUR' }]);
  });

  test('reszta odjęta od wpłaty zostaje dokładna (do 4 miejsc), ułamek grosza nie przepada', () => {
    expect(applyChangeToCash([{ price: '200', currency: 'EUR' }], 1.14, 'PLN', RATES)).toEqual([{ price: '199.7318', currency: 'EUR' }]); // 200 - 1.14/4.25
    expect(applyChangeToCash([{ price: '10.003', currency: 'PLN' }], 10, 'PLN', RATES)).toEqual([{ price: '0.003', currency: 'PLN' }]);
    expect(applyChangeToCash([{ price: '10', currency: 'PLN' }], 10, 'PLN', RATES)).toEqual([]);
  });

  test('zaokrąglenia na korzyść sprzedawcy: dopłata w górę, reszta w dół, bez błędu zmiennoprzecinkowego', () => {
    expect(roundUpMoney(199.5305)).toBe('199.54');
    expect(roundUpMoney(0.1 + 0.2)).toBe('0.30');
    expect(roundUpMoney(850.00000000001)).toBe('850.00');
    expect(roundUpMoney(0)).toBe('0.00');
    expect(roundDownMoney(0.4695)).toBe('0.46');
    expect(roundDownMoney(1.148)).toBe('1.14');
    expect(roundDownMoney(849.99999999999)).toBe('850.00');
    expect(formatMoneyExact(199.530047)).toBe('199.53');
    expect(formatMoneyExact(199.5324)).toBe('199.5324');
    expect(formatMoneyExact(425)).toBe('425.00');
  });
});
