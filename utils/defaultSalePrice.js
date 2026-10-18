/**
 * Domyślna cena sprzedaży (pole „Cena” w „Płatność gotówką”).
 *
 * Źródło ceny - ta sama kolejność co na backendzie (services/statePriceResolver):
 * cennik punktu zalogowanego sprzedawcy (wyjątek rozmiaru > promocja > cena), a gdy punkt nie ma cennika,
 * nie ma w nim produktu albo cena jest 0 - karta produktu (wyjątek rozmiaru > promocja > cena).
 *
 * Regularna cena jest od razu opuszczona o końcówkę (discountedRegularPrice) i ma minimum (minimumRegularPrice),
 * promocyjna wpisuje się bez zmian i bez blokady.
 */

const JACKETS_CATEGORY = 'Kurtki kożuchy futra';
const BAG_WALLET_CATEGORIES = ['Torebki', 'Portfele'];
const OTHER_CATEGORY = 'Pozostały asortyment';
const BAG_WALLET_PRICE_FACTOR = 0.8; // cena z cennika -20%

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/**
 * Sprzedawca od razu opuszcza klientowi końcówkę ceny regularnej:
 * - końcówka 90 - o 40 zł (1190 → 1150, 2190 → 2150),
 * - końcówka 50 - o 30 zł (1550 → 1520, 2150 → 2120).
 * Inne końcówki zostają jak w cenniku.
 */
export const discountedRegularPrice = (price) => {
  const value = Number(price);
  if (!Number.isInteger(value) || value <= 0) return value;

  const ending = value % 100;
  if (ending === 90) return value - 40;
  if (ending === 50) return value - 30;
  return value;
};

/**
 * Najniższa cena, za jaką wolno sprzedać (blokada rabatu) - liczona od ceny regularnej:
 * - końcówka 90 do 2000 zł - rabat maks. 40 zł (990 → 950, 1190 → 1150),
 * - końcówka 90 powyżej 2000 zł - do pełnej setki (2190 → 2100),
 * - końcówka 50 - rabat maks. 50 zł (950 → 900, 2150 → 2100).
 * Inne końcówki: null = bez blokady.
 */
export const minimumRegularPrice = (price) => {
  const value = Number(price);
  if (!Number.isInteger(value) || value <= 0) return null;

  const ending = value % 100;
  if (ending === 90) return value > 2000 ? value - 90 : value - 40;
  if (ending === 50) return value - 50;
  return null;
};

// Karta produktu po kodzie z metki: kurtki po modelu + kolorze (5 pierwszych cyfr), reszta po pełnym kodzie
export const findGoodForBarcode = (barcode, goods) => {
  const code = String(barcode || '').trim();
  const list = Array.isArray(goods) ? goods : [];
  if (!code) return null;
  return list.find((good) => good?.code && String(good.code) === code)
    || (/^\d{13}$/.test(code) && code.slice(0, 3) !== '000'
      ? list.find((good) => good?.category === JACKETS_CATEGORY && good?.code && String(good.code).slice(0, 5) === code.slice(0, 5))
      : null)
    || null;
};

// Rozmiar z metki kurtki (cyfry 6-8 = Roz_Kod)
export const findSizeForBarcode = (barcode, sizes) => {
  const code = String(barcode || '').trim();
  const list = Array.isArray(sizes) ? sizes : [];
  if (!/^\d{13}$/.test(code) || code.slice(0, 3) === '000') return null;
  return list.find((size) => size?.Roz_Kod === code.slice(5, 8)) || null;
};

const sizeMatches = (exception, size) => {
  if (!exception || !size) return false;
  const exceptionSize = exception.size;
  const exceptionId = exceptionSize?._id ? String(exceptionSize._id) : (exceptionSize ? String(exceptionSize) : '');
  return (size._id && exceptionId === String(size._id))
    || (size.Roz_Opis && exceptionSize?.Roz_Opis === size.Roz_Opis);
};

const findSizeException = (exceptions, size) => {
  if (!Array.isArray(exceptions) || !size) return null;
  const found = exceptions.find((exception) => sizeMatches(exception, size) && toNumber(exception.value) > 0);
  return found ? toNumber(found.value) : null;
};

const findPriceListItem = (priceList, good) => {
  if (!Array.isArray(priceList) || !good) return null;
  const goodId = String(good._id || '');
  const code = String(good.code || '').trim();
  const fullName = String(good.fullName || '').trim().toLowerCase();
  return priceList.find((item) => item.originalGoodId && String(item.originalGoodId) === goodId)
    || (code ? priceList.find((item) => item.code && String(item.code).trim() === code) : null)
    || (fullName ? priceList.find((item) => item.fullName && String(item.fullName).trim().toLowerCase() === fullName) : null)
    || null;
};

// { price, discount_price, source } - source: 'priceList' | 'priceListSizeException' | 'goods' | 'goodsSizeException'
export const resolveSalePrice = ({ good, size, priceList }) => {
  const item = findPriceListItem(priceList, good);
  if (item && toNumber(item.price) > 0) {
    const exception = findSizeException(item.priceExceptions, size);
    if (exception !== null) return { price: exception, discount_price: 0, source: 'priceListSizeException' };
    return { price: toNumber(item.price), discount_price: toNumber(item.discountPrice), source: 'priceList' };
  }
  const goodsException = good ? findSizeException(good.priceExceptions, size) : null;
  if (goodsException !== null) return { price: goodsException, discount_price: 0, source: 'goodsSizeException' };
  return { price: toNumber(good?.price), discount_price: toNumber(good?.discount_price), source: 'goods' };
};

// Pole „Cena” i blokada: promocja wpisuje się bez zmian i bez blokady, regularna z opuszczoną końcówką i minimum.
// { defaultPrice, minPrice } - null = brak ceny / brak blokady; null zamiast obiektu = kod spoza kart produktów
export const salePriceRule = ({ barcode, goods, sizes, priceList }) => {
  const good = findGoodForBarcode(barcode, goods);
  if (!good) return null;
  return salePriceRuleForGood({ good, size: findSizeForBarcode(barcode, sizes), priceList });
};

// Ta sama reguła dla karty produktu wybranej z listy (zaliczka na produkt: produkt + rozmiar zamiast kodu)
export const salePriceRuleForGood = ({ good, size, priceList }) => {
  if (!good) return null;
  const { price, discount_price } = resolveSalePrice({ good, size, priceList });
  return regularOrPromoRule(price, discount_price, good.category);
};

// Ta sama reguła dla ceny zapisanej na stanie (kod spoza kart produktów).
// Torebki i portfele: cena z cennika -20% jest też minimum; pozostały asortyment: cena z cennika bez minimum.
export const regularOrPromoRule = (price, discountPrice, category) => {
  if (category === OTHER_CATEGORY) return { defaultPrice: listPriceOf(price, discountPrice), minPrice: null };
  if (BAG_WALLET_CATEGORIES.includes(category)) {
    const list = listPriceOf(price, discountPrice);
    const floor = list === null ? null : Math.round(list * BAG_WALLET_PRICE_FACTOR);
    return { defaultPrice: floor, minPrice: floor };
  }
  const promo = Number(discountPrice);
  if (promo > 0) return { defaultPrice: promo, minPrice: null };
  const regular = Number(price);
  if (!(regular > 0)) return { defaultPrice: null, minPrice: null };
  return { defaultPrice: discountedRegularPrice(regular), minPrice: minimumRegularPrice(regular) };
};

// Cena z cennika bez pomniejszeń (promocja, a gdy jej nie ma - regularna); null = brak ceny
export const listPriceOf = (price, discountPrice) => {
  const promo = Number(discountPrice);
  if (promo > 0) return promo;
  const regular = Number(price);
  return regular > 0 ? regular : null;
};

// Pełna cena z cennika dla kodu (bez rabatu); null = brak ceny albo kod spoza kart produktów
export const salePriceListForBarcode = ({ barcode, goods, sizes, priceList }) => {
  const good = findGoodForBarcode(barcode, goods);
  if (!good) return null;
  const { price, discount_price } = resolveSalePrice({ good, size: findSizeForBarcode(barcode, sizes), priceList });
  return listPriceOf(price, discount_price);
};

// Wartość do pola „Cena”; null = brak ceny
export const defaultSalePrice = (args) => salePriceRule(args)?.defaultPrice ?? null;

// Komunikat blokady albo null, gdy kwota jest w porządku
export const minimumPriceError = (paidPln, minPrice) => (
  minPrice && paidPln < minPrice - 0.005
    ? `Minimalna cena tego produktu to ${minPrice} zł. Klient płaci ${(Math.round(paidPln * 100) / 100).toFixed(2)} zł - zwiększ kwotę.`
    : null
);
