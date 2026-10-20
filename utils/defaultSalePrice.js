/**
 * Domyślna cena sprzedaży (pole „Cena” w „Płatność gotówką”).
 *
 * Źródło ceny - ta sama kolejność co na backendzie (services/statePriceResolver):
 * cennik punktu zalogowanego sprzedawcy (wyjątek rozmiaru > promocja > cena), a gdy punkt nie ma cennika,
 * nie ma w nim produktu albo cena jest 0 - karta produktu (wyjątek rozmiaru > promocja > cena).
 *
 * Regularna cena jest od razu opuszczona o końcówkę (discountedRegularPrice). Minimum (blokada rabatu) jest tylko
 * zapisane w karcie produktu albo cenniku punktu - zasady kategorii nie są liczone przy sprzedaży.
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
  return exceptions.find((exception) => sizeMatches(exception, size) && toNumber(exception.value) > 0) || null;
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

// { price, discount_price, source, minimumPrice, discountMinimumPrice } - source: 'priceList' | 'priceListSizeException' | 'goods' | 'goodsSizeException'
// Minimum zapisane w bazie (undefined = brak danych). Wyjątek: własne minimum wyjątku. Cennik: minimum pozycji, a gdy go nie ma - karty produktu (jak w backendzie).
export const resolveSalePrice = ({ good, size, priceList }) => {
  const item = findPriceListItem(priceList, good);
  if (item && toNumber(item.price) > 0) {
    const exception = findSizeException(item.priceExceptions, size);
    if (exception) {
      return { price: toNumber(exception.value), discount_price: 0, source: 'priceListSizeException', minimumPrice: exception.minimumPrice, discountMinimumPrice: undefined };
    }
    return {
      price: toNumber(item.price),
      discount_price: toNumber(item.discountPrice),
      source: 'priceList',
      minimumPrice: item.minimumPrice ?? good?.minimumPrice,
      discountMinimumPrice: item.discountMinimumPrice,
    };
  }
  const goodsException = good ? findSizeException(good.priceExceptions, size) : null;
  if (goodsException) {
    return { price: toNumber(goodsException.value), discount_price: 0, source: 'goodsSizeException', minimumPrice: goodsException.minimumPrice, discountMinimumPrice: undefined };
  }
  return {
    price: toNumber(good?.price),
    discount_price: toNumber(good?.discount_price),
    source: 'goods',
    minimumPrice: good?.minimumPrice,
    discountMinimumPrice: good?.discountMinimumPrice,
  };
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
  const resolved = resolveSalePrice({ good, size, priceList });
  const stored = {
    exception: resolved.source.endsWith('SizeException'),
    minimumPrice: resolved.minimumPrice,
    discountMinimumPrice: resolved.discountMinimumPrice,
  };
  return regularOrPromoRule(resolved.price, resolved.discount_price, good.category, stored);
};

// Podpowiedź minimum dla formularza karty produktu (zasady kategorii, zapisywane w karcie) - sprzedaż ich nie używa
const fallbackRegularMinimum = (category, regular) => {
  if (BAG_WALLET_CATEGORIES.includes(category)) return Math.round(regular * BAG_WALLET_PRICE_FACTOR);
  if (category === JACKETS_CATEGORY) return minimumRegularPrice(regular);
  return null;
};

// Minimum zapisane w karcie albo cenniku (PLN); puste lub 0 = brak
const storedMinimum = (value) => (Number(value) > 0 ? Number(value) : null);

// Reguła ceny i minimum. stored (z bazy): exception - wyjątek rozmiaru; minimumPrice / discountMinimumPrice - zapisane minima.
// Brak zapisu = brak blokady. Zwraca { defaultPrice, minPrice }; minPrice null = bez blokady.
export const regularOrPromoRule = (price, discountPrice, category, stored = null) => {
  const regular = Number(price);
  const promo = Number(discountPrice);
  const bag = BAG_WALLET_CATEGORIES.includes(category);

  // Wyjątek rozmiaru: własne minimum; bez minimum = cena wyjątku bez rabatu (jak w backendzie)
  if (stored?.exception) {
    if (!(regular > 0)) return { defaultPrice: null, minPrice: null };
    const minPrice = storedMinimum(stored.minimumPrice) ?? regular;
    return { defaultPrice: Math.max(discountedRegularPrice(regular), minPrice), minPrice };
  }

  // Promocja: sprzedaje się za cenę promocyjną; zapisane minimum promocji, a bez zapisu - cena promocyjna (bez zniżki)
  if (promo > 0) {
    const minPrice = storedMinimum(stored?.discountMinimumPrice) ?? promo;
    return { defaultPrice: bag ? minPrice : promo, minPrice };
  }

  if (category === OTHER_CATEGORY) {
    return { defaultPrice: listPriceOf(price, discountPrice), minPrice: storedMinimum(stored?.minimumPrice) };
  }

  if (!(regular > 0)) return { defaultPrice: null, minPrice: null };
  const minPrice = storedMinimum(stored?.minimumPrice);
  if (bag) return { defaultPrice: minPrice ?? regular, minPrice };
  // R&B (minimum = cena): sprzedawca nie opuszcza ceny poniżej minimum
  return { defaultPrice: Math.max(discountedRegularPrice(regular), minPrice ?? 0), minPrice };
};

// Minimum regularne wyliczone z zasad kategorii - tylko podpowiedź przy zapisie karty produktu
export const defaultRegularMinimum = (category, price) => (Number(price) > 0 ? fallbackRegularMinimum(category, Number(price)) : null);

// Minimum promocji wyliczone z zasad kategorii - tylko podpowiedź przy zapisie karty produktu
export const defaultDiscountMinimum = (category, promo) => {
  const value = Number(promo);
  if (!(value > 0)) return null;
  return BAG_WALLET_CATEGORIES.includes(category) ? Math.round(value * BAG_WALLET_PRICE_FACTOR) : value;
};

// Pozycja stanu spoza kart produktów: minimum z karty o tej samej nazwie (jak na backendzie); brak karty = null
export const stateItemStoredMinimum = (item, goods) => {
  const name = String((typeof item?.fullName === 'object' ? item.fullName?.fullName : item?.fullName) || '').trim();
  const good = (Array.isArray(goods) ? goods : []).find((entry) => name && String(entry?.fullName || '').trim() === name);
  return good ? { minimumPrice: good.minimumPrice ?? null, discountMinimumPrice: good.discountMinimumPrice ?? null } : null;
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
  minPrice && paidPln < minPrice - 0.0001 // tylko błąd zmiennoprzecinkowy, nie pół grosza na korzyść klienta
    ? `Minimalna cena tego produktu to ${minPrice} zł. Klient płaci ${(Math.round(paidPln * 100) / 100).toFixed(2)} zł - zwiększ kwotę.`
    : null
);
