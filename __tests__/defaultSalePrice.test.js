import { defaultDiscountMinimum, defaultRegularMinimum, defaultSalePrice, discountedRegularPrice, minimumPriceError, minimumRegularPrice, regularOrPromoRule, salePriceRule, salePriceRuleForGood, stateItemStoredMinimum } from '../utils/defaultSalePrice';

describe('discountedRegularPrice - domyślna cena', () => {
  it('końcówkę 90 opuszcza o 40 zł', () => {
    expect(discountedRegularPrice(990)).toBe(950);
    expect(discountedRegularPrice(1190)).toBe(1150);
    expect(discountedRegularPrice(1990)).toBe(1950);
    expect(discountedRegularPrice(2190)).toBe(2150);
  });

  it('końcówkę 50 opuszcza o 30 zł', () => {
    expect(discountedRegularPrice(950)).toBe(920);
    expect(discountedRegularPrice(1550)).toBe(1520);
    expect(discountedRegularPrice(2150)).toBe(2120);
  });

  it('inne końcówki zostawia jak w cenniku', () => {
    expect(discountedRegularPrice(2000)).toBe(2000);
    expect(discountedRegularPrice(2199)).toBe(2199);
    expect(discountedRegularPrice(1500)).toBe(1500);
    expect(discountedRegularPrice(1590.5)).toBe(1590.5);
  });
});

describe('minimumRegularPrice - blokada rabatu', () => {
  it('końcówka 90 do 2000 zł - maks. 40 zł rabatu', () => {
    expect(minimumRegularPrice(990)).toBe(950);
    expect(minimumRegularPrice(1190)).toBe(1150);
    expect(minimumRegularPrice(1990)).toBe(1950);
  });

  it('końcówka 90 powyżej 2000 zł - do pełnej setki', () => {
    expect(minimumRegularPrice(2190)).toBe(2100);
    expect(minimumRegularPrice(2090)).toBe(2000);
  });

  it('końcówka 50 - maks. 50 zł rabatu', () => {
    expect(minimumRegularPrice(950)).toBe(900);
    expect(minimumRegularPrice(2150)).toBe(2100);
  });

  it('inne końcówki - bez blokady', () => {
    expect(minimumRegularPrice(2000)).toBeNull();
    expect(minimumRegularPrice(1599)).toBeNull();
    expect(minimumRegularPrice(0)).toBeNull();
  });
});

describe('minimumPriceError', () => {
  it('blokuje kwotę poniżej minimum', () => {
    expect(minimumPriceError(2050, 2100)).toMatch('Minimalna cena tego produktu to 2100 zł');
  });

  it('przepuszcza minimum i więcej, a bez minimum nic nie blokuje', () => {
    expect(minimumPriceError(2100, 2100)).toBeNull();
    expect(minimumPriceError(2150, 2100)).toBeNull();
    expect(minimumPriceError(10, null)).toBeNull();
  });
});

describe('salePriceRule - cennik punktu, bez cennika karta produktu', () => {
  const sizeL = { _id: 's-l', Roz_Kod: '003', Roz_Opis: 'L' };
  const sizes = [sizeL, { _id: 's-m', Roz_Kod: '002', Roz_Opis: 'M' }];
  const jacket = { _id: 'g1', code: '0040600000004', category: 'Kurtki kożuchy futra', fullName: 'Agnieszka CZARNY', price: 1890, discount_price: 0, priceExceptions: [] };
  const bag = { _id: 'g2', code: '0000500100123', category: 'Torebki', fullName: 'Torebka', price: 450, discount_price: 0, minimumPrice: 360, priceExceptions: [] };
  const goods = [jacket, bag];
  const jacketL = '0040600300009'; // model+kolor 00406, rozmiar 003 (L)

  it('cena z cennika punktu: domyślna i minimum', () => {
    const priceList = [{ originalGoodId: 'g1', price: 2190, discountPrice: 0, minimumPrice: 2100, priceExceptions: [] }];
    expect(salePriceRule({ barcode: jacketL, goods, sizes, priceList })).toEqual({ defaultPrice: 2150, minPrice: 2100 });
  });

  it('wyjątek rozmiaru z cennika ma pierwszeństwo', () => {
    const priceList = [{ originalGoodId: 'g1', price: 2190, discountPrice: 0, priceExceptions: [{ size: { _id: 's-l', Roz_Opis: 'L' }, value: 1590 }] }];
    expect(salePriceRule({ barcode: jacketL, goods, sizes, priceList })).toEqual({ defaultPrice: 1590, minPrice: 1590 });
  });

  it('promocja z cennika bez opuszczania i bez blokady', () => {
    const priceList = [{ originalGoodId: 'g1', price: 2190, discountPrice: 1990, priceExceptions: [] }];
    expect(salePriceRule({ barcode: jacketL, goods, sizes, priceList })).toEqual({ defaultPrice: 1990, minPrice: 1990 });
  });

  it('bez cennika punktu bierze kartę produktu', () => {
    expect(defaultSalePrice({ barcode: jacketL, goods, sizes, priceList: null })).toBe(1850);
  });

  it('produkt nieobecny w cenniku albo z ceną 0 - karta produktu', () => {
    expect(defaultSalePrice({ barcode: jacketL, goods, sizes, priceList: [] })).toBe(1850);
    expect(defaultSalePrice({ barcode: jacketL, goods, sizes, priceList: [{ originalGoodId: 'g1', price: 0 }] })).toBe(1850);
  });

  it('torebka po pełnym kodzie z karty produktu (minimum zapisane w karcie: 450 → 360)', () => {
    expect(salePriceRule({ barcode: '0000500100123', goods, sizes, priceList: null })).toEqual({ defaultPrice: 360, minPrice: 360 });
  });

  it('portfel: cena z cennika -20% jest domyślna i minimum', () => {
    const wallet = { _id: 'g3', code: '0000001000123', category: 'Portfele', fullName: 'Portfel', price: 300, discount_price: 0, minimumPrice: 240, priceExceptions: [] };
    expect(salePriceRuleForGood({ good: wallet, size: null, priceList: null })).toEqual({ defaultPrice: 240, minPrice: 240 });
  });

  it('pozostały asortyment: cena z cennika jako domyślna, bez minimum', () => {
    const other = { _id: 'g4', code: '0000000100123', category: 'Pozostały asortyment', fullName: 'Pasek', price: 150, discount_price: 0, priceExceptions: [] };
    expect(salePriceRuleForGood({ good: other, size: null, priceList: null })).toEqual({ defaultPrice: 150, minPrice: null });
  });

  it('pozostały asortyment z promocją: promocja jako domyślna, bez minimum', () => {
    const other = { _id: 'g4', code: '0000000100123', category: 'Pozostały asortyment', fullName: 'Pasek', price: 150, discount_price: 120, priceExceptions: [] };
    expect(salePriceRuleForGood({ good: other, size: null, priceList: null })).toEqual({ defaultPrice: 120, minPrice: 120 });
  });

  it('nieznany kod - null', () => {
    expect(salePriceRule({ barcode: '9999999999999', goods, sizes, priceList: null })).toBeNull();
    expect(defaultSalePrice({ barcode: '9999999999999', goods, sizes, priceList: null })).toBeNull();
  });
});

describe('regularOrPromoRule - minima zapisane w bazie (goods / cennik)', () => {
  it('zapisane minimum ma pierwszeństwo przed zasadami', () => {
    expect(regularOrPromoRule(1990, 0, 'Kurtki kożuchy futra', { minimumPrice: 1900 })).toEqual({ defaultPrice: 1950, minPrice: 1900 });
  });

  it('zapisane null = brak blokady', () => {
    expect(regularOrPromoRule(1990, 0, 'Kurtki kożuchy futra', { minimumPrice: null })).toEqual({ defaultPrice: 1950, minPrice: null });
  });

  it('R&B: minimum = cena, sprzedaż bez zniżki', () => {
    expect(regularOrPromoRule(990, 0, 'Kurtki kożuchy futra', { minimumPrice: 990 })).toEqual({ defaultPrice: 990, minPrice: 990 });
  });

  it('promocja: zapisane minimum promocji (Aneta 750 → 700)', () => {
    expect(regularOrPromoRule(850, 750, 'Kurtki kożuchy futra', { minimumPrice: 800, discountMinimumPrice: 700 })).toEqual({ defaultPrice: 750, minPrice: 700 });
  });

  it('promocja bez zapisanego minimum - cena promocyjna', () => {
    expect(regularOrPromoRule(850, 750, 'Kurtki kożuchy futra', { minimumPrice: 800, discountMinimumPrice: null })).toEqual({ defaultPrice: 750, minPrice: 750 });
  });
});

describe('salePriceRuleForGood - minima z bazy', () => {
  it('karta produktu z zapisanym minimum i minimum promocji', () => {
    const good = { _id: 'g5', code: '0040700000005', category: 'Kurtki kożuchy futra', fullName: 'Aneta', price: 850, discount_price: 750, minimumPrice: 800, discountMinimumPrice: 700, priceExceptions: [] };
    expect(salePriceRuleForGood({ good, size: null, priceList: null })).toEqual({ defaultPrice: 750, minPrice: 700 });
  });

  it('wyjątek rozmiaru z własnym minimum', () => {
    const sizeL = { _id: 's-l', Roz_Kod: '003', Roz_Opis: 'L' };
    const good = { _id: 'g6', code: '0040800000006', category: 'Kurtki kożuchy futra', fullName: 'Aneta', price: 850, discount_price: 0, minimumPrice: 800, priceExceptions: [{ size: { _id: 's-l', Roz_Opis: 'L' }, value: 850, minimumPrice: 800 }] };
    expect(salePriceRuleForGood({ good, size: sizeL, priceList: null })).toEqual({ defaultPrice: 820, minPrice: 800 });
  });
});

describe('salePriceRuleForGood - produkt wybrany z listy (zaliczka)', () => {
  const sizeL = { _id: 's-l', Roz_Kod: '003', Roz_Opis: 'L' };
  const good = { _id: 'g1', code: '0040600000004', category: 'Kurtki kożuchy futra', fullName: 'Agnieszka CZARNY', price: 1890, discount_price: 0, minimumPrice: 1850, priceExceptions: [] };

  it('cennik punktu z wyjątkiem rozmiaru', () => {
    const priceList = [{ originalGoodId: 'g1', price: 2190, discountPrice: 0, minimumPrice: 2100, priceExceptions: [{ size: { _id: 's-l', Roz_Opis: 'L' }, value: 2290 }] }];
    expect(salePriceRuleForGood({ good, size: sizeL, priceList })).toEqual({ defaultPrice: 2290, minPrice: 2290 });
    expect(salePriceRuleForGood({ good, size: null, priceList })).toEqual({ defaultPrice: 2150, minPrice: 2100 });
  });

  it('bez cennika - karta produktu; bez produktu - null', () => {
    expect(salePriceRuleForGood({ good, size: sizeL, priceList: null })).toEqual({ defaultPrice: 1850, minPrice: 1850 });
    expect(salePriceRuleForGood({ good: null, size: sizeL, priceList: null })).toBeNull();
  });
});

describe('sprzedaż - minimum tylko z zapisu (karta / cennik), bez zasad', () => {
  it('karta bez zapisanego minimum - brak blokady, zasady nie są liczone', () => {
    expect(regularOrPromoRule(1990, 0, 'Kurtki kożuchy futra')).toEqual({ defaultPrice: 1950, minPrice: null });
    expect(regularOrPromoRule(450, 0, 'Torebki')).toEqual({ defaultPrice: 450, minPrice: null });
  });

  it('promocja bez zapisanego minimum - cena promocyjna, bez zniżki', () => {
    expect(regularOrPromoRule(null, 450, 'Torebki')).toEqual({ defaultPrice: 450, minPrice: 450 });
  });

  it('pozycja stanu spoza kart: minimum z karty o tej samej nazwie', () => {
    const goods = [{ fullName: 'Torebka', category: 'Torebki', minimumPrice: 360, discountMinimumPrice: null }];
    expect(stateItemStoredMinimum({ fullName: 'Torebka' }, goods)).toEqual({ minimumPrice: 360, discountMinimumPrice: null });
    expect(stateItemStoredMinimum({ fullName: { fullName: 'Torebka' } }, goods)).toEqual({ minimumPrice: 360, discountMinimumPrice: null });
    expect(stateItemStoredMinimum({ fullName: 'Nieznana' }, goods)).toBeNull();
  });

  it('podpowiedź minimum dla formularza karty z zasad kategorii', () => {
    expect(defaultRegularMinimum('Kurtki kożuchy futra', 1990)).toBe(1950);
    expect(defaultRegularMinimum('Torebki', 450)).toBe(360);
    expect(defaultDiscountMinimum('Torebki', 450)).toBe(360);
    expect(defaultDiscountMinimum('Kurtki kożuchy futra', 750)).toBe(750);
  });
});
