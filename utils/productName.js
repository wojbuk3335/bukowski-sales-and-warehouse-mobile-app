// Kody z metek (EAN-13) i nazwa produktu po kodzie - wspólne dla Remanentu i zakładki „Sprawdź”.
// Kurtki: Tow_Kod(3) + Kol_Kod(2) + Roz_Kod(3) + ...; reszta: 000 + Kol_Kod(2) + ...

// Cyfra kontrolna EAN-13 (ostatnia cyfra metki) - chroni ręcznie wpisany kod przed literówką
export const ean13Checksum = (digits12) => {
  const sum = String(digits12).split('').reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
};

export const isValidEan13 = (code) => /^\d{13}$/.test(code) && ean13Checksum(code.slice(0, 12)) === code[12];

// Kod kurtki z karty produktu (model + kolor = 5 pierwszych cyfr) i rozmiaru: base + 0000 + cyfra kontrolna
export const jacketCodeForSize = (goodCode, rozKod) => {
  const base = `${String(goodCode).slice(0, 5)}${String(rozKod).padStart(3, '0')}0000`;
  return `${base}${ean13Checksum(base)}`;
};

// Nazwa produktu po kodzie z metki - WYŁĄCZNIE z bazy głównej (karty produktów i słowniki),
// bez list testowych. Kod, którego nie ma w bazie, jest pokazany jako „Nieznany kod …”.
// lookup: { sizeByKod, stockByKod, colorByKod, goodsByCode, jacketGoodsByPrefix, stateData }
export const productNameFromBarcode = (barcodeData, lookup = {}) => {
  const {
    sizeByKod = {}, stockByKod = {}, colorByKod = {}, goodsByCode = {}, jacketGoodsByPrefix = {}, stateData,
  } = lookup;
  const code = String(barcodeData || '').trim();

  if (/^\d{13}$/.test(code) && code.slice(0, 3) !== '000') {
    // Kurtki: karta produktu (model + kolor) po 5 pierwszych cyfrach + rozmiar ze słownika
    const sizeName = sizeByKod[code.slice(5, 8)] || '';
    const size = /NIEOKRE/i.test(sizeName) ? '' : sizeName;
    const good = jacketGoodsByPrefix[code.slice(0, 5)];
    if (good?.fullName) return `${good.fullName}${size ? ` ${size}` : ''}`;
    const model = stockByKod[code.slice(0, 3)];
    const color = colorByKod[code.slice(3, 5)];
    if (model && color) return `${model} ${color}${size ? ` ${size}` : ''}`;
  } else {
    // Torebki, portfele, pozostały asortyment: kod z metki = kod karty produktu
    const good = goodsByCode[code];
    if (good?.fullName) return good.fullName;
  }

  // Zapas: sztuka na stanie z tym kodem (nazwa ze stanu)
  const stateList = Array.isArray(stateData) ? stateData : [];
  const matchedItem = stateList.find((item) => item.barcode === code);
  if (matchedItem?.fullName) {
    return matchedItem.size && matchedItem.size !== '-' ? `${matchedItem.fullName} ${matchedItem.size}` : matchedItem.fullName;
  }

  return `Nieznany kod ${code}`;
};

export const isUnknownProductName = (name) => String(name || '').startsWith('Nieznany kod');
