// Sprzedaż w kilku walutach: zapłacono w PLN, do dopłaty w wybranej walucie (kursy „za 100” np. HUF)
import { computePaymentBalance, plnPerUnit, plnToCurrency, formatMoney } from '../../utils/paymentBalance';

const RATES = [
  { currency: { code: 'EUR', name: 'Euro' }, buyRate: 4.25 },
  { currency: { code: 'USD', name: 'Dolar' }, buyRate: 3.9 },
  { currency: { code: 'HUF', name: 'Forint węgierski (za 100)' }, buyRate: 1.08 },
];

describe('paymentBalance', () => {
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
});
