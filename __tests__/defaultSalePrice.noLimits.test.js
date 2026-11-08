// Zasada klienta (8.11.2026): przy sprzedaży cena z cennika BEZ ŻADNYCH ZNIŻEK i BEZ LIMITÓW ceny minimalnej.
// Dawne zasady (opuszczanie końcówki, -20% torebek, blokada minimum) są w kodzie, ale wyłączone - pilnują ich
// defaultSalePrice.test.js i testy QRScanner z włączonym przełącznikiem.
import {
  minimumPriceError,
  regularOrPromoRule,
  salePriceLimitsOn,
  salePriceRule,
} from '../utils/defaultSalePrice';
import { buildQuickSale } from '../utils/quickSale';

describe('sprzedaż bez zniżek i bez limitów (zasada klienta 8.11.2026)', () => {
  test('przełącznik dawnych zasad jest wyłączony', () => {
    expect(salePriceLimitsOn()).toBe(false);
  });

  test('cena domyślna = cena z cennika bez opuszczania końcówki; brak minimum', () => {
    expect(regularOrPromoRule(1190, 0, 'Kurtki kożuchy futra', { minimumPrice: 1150 })).toEqual({ defaultPrice: 1190, minPrice: null });
    expect(regularOrPromoRule(1550, 0, 'Kurtki kożuchy futra')).toEqual({ defaultPrice: 1550, minPrice: null });
  });

  test('promocja: cena promocyjna bez dalszych zniżek; brak minimum', () => {
    expect(regularOrPromoRule(1190, 990, 'Kurtki kożuchy futra', { discountMinimumPrice: 950 })).toEqual({ defaultPrice: 990, minPrice: null });
  });

  test('torebki i portfele: pełna cena z cennika (bez -20%)', () => {
    expect(regularOrPromoRule(450, 0, 'Torebki', { minimumPrice: 360 })).toEqual({ defaultPrice: 450, minPrice: null });
    expect(regularOrPromoRule(300, 0, 'Portfele')).toEqual({ defaultPrice: 300, minPrice: null });
  });

  test('wyjątek rozmiaru: cena wyjątku bez zmian', () => {
    expect(regularOrPromoRule(1390, 0, 'Kurtki kożuchy futra', { exception: true, minimumPrice: 1350 })).toEqual({ defaultPrice: 1390, minPrice: null });
  });

  test('brak ceny = brak domyślnej ceny', () => {
    expect(regularOrPromoRule(0, 0, 'Kurtki kożuchy futra').defaultPrice).toBeNull();
  });

  test('blokada minimum nie działa - każda kwota przechodzi', () => {
    expect(minimumPriceError(1, 1150)).toBeNull();
    expect(minimumPriceError(0, 500)).toBeNull();
  });

  test('karta produktu z ceną 1190 i minimum 1150 - sprzedaż domyślnie 1190', () => {
    const goods = [{ _id: 'g1', code: '0010600000001', fullName: 'Ada CZARNY', category: 'Kurtki kożuchy futra', price: 1190, minimumPrice: 1150, discount_price: 0 }];
    expect(salePriceRule({ barcode: '0010600000001', goods, sizes: [], priceList: [] })).toEqual({ defaultPrice: 1190, minPrice: null });
  });

  test('sprzedaż ciągła zapisuje pełną cenę z cennika', () => {
    const goods = [{ _id: 'g1', code: '1234567890', fullName: 'Kurtka', category: 'Kurtki kożuchy futra', price: 1190, minimumPrice: 1150, discount_price: 0 }];
    const result = buildQuickSale({
      code: '1234567890',
      stateData: [{ barcode: '1234567890', fullName: 'Kurtka', size: 'M', symbol: 'P' }],
      goods,
      sizes: [],
      priceList: [],
      user: { symbol: 'P' },
    });
    expect(result.ok).toBe(true);
    expect(result.sale.amount).toBe(1190);
    expect(result.sale.cash).toEqual([{ price: '1190.00', currency: 'PLN' }]);
  });
});
