// Krok 3 przejścia na ID (25.10.2026): parowanie pozycji Dobierania po ID towaru i rozmiaru
import { productRefs, sameProductByRefs } from '../utils/productPairing';

const GOODS = '64a000000000000000000001';
const OTHER_GOODS = '64a000000000000000000002';
const XL = '64b000000000000000000001';
const XXL = '64b000000000000000000002';

describe('productRefs', () => {
  test('przepisanie / sprzedaż: goodsId i sizeId jako tekst', () => {
    expect(productRefs({ goodsId: GOODS, sizeId: { toString: () => XL } })).toEqual({ goodsId: GOODS, sizeId: XL });
  });

  test('sztuka ze stanu / magazynu: fullName._id i size._id', () => {
    expect(productRefs({ fullName: { _id: GOODS, fullName: 'Ada CZERWONY' }, size: { _id: XL, Roz_Opis: 'XL' } }))
      .toEqual({ goodsId: GOODS, sizeId: XL });
  });

  test('stary wpis bez ID (nazwy jako tekst) → null', () => {
    expect(productRefs({ fullName: 'Ada CZERWONY', size: 'XL' })).toEqual({ goodsId: null, sizeId: null });
    expect(productRefs(null)).toEqual({ goodsId: null, sizeId: null });
  });
});

describe('sameProductByRefs', () => {
  const transfer = { fullName: 'Ada CZERWONY (stara nazwa)', size: 'XL', barcode: 'STARY-KOD', goodsId: GOODS, sizeId: XL };

  test('ten sam towar i rozmiar mimo innej nazwy i kodu → true', () => {
    const warehouse = { fullName: { _id: GOODS, fullName: 'Ada BORDO' }, size: { _id: XL, Roz_Opis: 'XL' }, barcode: 'NOWY-KOD' };
    expect(sameProductByRefs(transfer, warehouse)).toBe(true);
  });

  test('inny rozmiar albo inny towar → false', () => {
    expect(sameProductByRefs(transfer, { goodsId: GOODS, sizeId: XXL })).toBe(false);
    expect(sameProductByRefs(transfer, { goodsId: OTHER_GOODS, sizeId: XL })).toBe(false);
  });

  test('torebki: brak rozmiaru po obu stronach = ten sam rozmiar', () => {
    expect(sameProductByRefs({ goodsId: GOODS, sizeId: null }, { fullName: { _id: GOODS }, size: null })).toBe(true);
    expect(sameProductByRefs({ goodsId: GOODS, sizeId: null }, { fullName: { _id: GOODS }, size: { _id: XL } })).toBe(false);
  });

  test('którejś stronie brakuje ID → null (decydują napisy)', () => {
    expect(sameProductByRefs({ fullName: 'Ada CZERWONY', size: 'XL' }, { goodsId: GOODS, sizeId: XL })).toBeNull();
    expect(sameProductByRefs(transfer, { fullName: 'Ada CZERWONY', size: 'XL' })).toBeNull();
  });
});
