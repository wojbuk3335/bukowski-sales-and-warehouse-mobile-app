// Porównanie listy oczekiwanych sztuk (stan punktu, kurtki dobrane w systemie) z listą zeskanowanych.
// Grupowanie po kodzie kreskowym: każda pozycja listy to JEDNA sztuka, identyczne sztuki mają ten sam kod.
// Wspólne dla Remanentu (panel użytkownika) i zakładki „Sprawdź” (panel admina).
//
// Wynik:
//   missingItems - kody, których zeskanowano MNIEJ niż oczekiwano (brak całkowity albo częściowy)
//   extraItems   - kody, których zeskanowano WIĘCEJ niż oczekiwano (także kody spoza oczekiwanych)
//   missingCount / excessCount - łączna liczba brakujących / nadwyżkowych sztuk
//   matchedCount - sztuki zgodne (dla każdego kodu min(oczekiwane, zeskanowane))

const groupBy = (list, keyOf) => {
  const groups = {};
  (Array.isArray(list) ? list : []).forEach((item) => {
    const code = keyOf(item);
    if (!groups[code]) {
      groups[code] = [];
    }
    groups[code].push(item);
  });
  return groups;
};

// Domyślnie: oczekiwane mają pole barcode (stan / dobrane kurtki), zeskanowane - pole code (skaner)
const DEFAULT_OPTIONS = {
  expectedKey: (item) => item.barcode,
  scannedKey: (item) => item.code,
  describeExpected: (first) => ({ name: first.fullName, size: first.size, price: first.price }),
  describeScanned: (first) => ({ name: first.name, size: first.size, price: first.value }),
};

export const compareScans = (expected, scanned, options = {}) => {
  const { expectedKey, scannedKey, describeExpected, describeScanned } = { ...DEFAULT_OPTIONS, ...options };
  const expectedByCode = groupBy(expected, expectedKey);
  const scannedByCode = groupBy(scanned, scannedKey);
  const missingItems = [];
  const extraItems = [];
  let matchedCount = 0;

  Object.keys(expectedByCode).forEach((code) => {
    const expectedItems = expectedByCode[code];
    const scannedItems = scannedByCode[code] || [];
    const expectedCount = expectedItems.length;
    const actualCount = scannedItems.length;
    matchedCount += Math.min(expectedCount, actualCount);

    if (actualCount < expectedCount) {
      // brak całkowity (nic nie zeskanowano) albo częściowy (mniej niż powinno być)
      missingItems.push({
        ...describeExpected(expectedItems[0]),
        code,
        expectedCount,
        actualCount,
        missingCount: expectedCount - actualCount,
      });
    } else if (actualCount > expectedCount) {
      extraItems.push({
        ...describeScanned(scannedItems[0]),
        code,
        expectedCount,
        actualCount,
        excessCount: actualCount - expectedCount,
      });
    }
    // actualCount === expectedCount - zgodne, nie trafia na żadną listę
  });

  // Kody zeskanowane, których w ogóle nie było wśród oczekiwanych
  Object.keys(scannedByCode).forEach((code) => {
    if (!expectedByCode[code]) {
      const scannedItems = scannedByCode[code];
      extraItems.push({
        ...describeScanned(scannedItems[0]),
        code,
        expectedCount: 0,
        actualCount: scannedItems.length,
        excessCount: scannedItems.length,
      });
    }
  });

  return {
    missingItems,
    extraItems,
    missingCount: missingItems.reduce((sum, item) => sum + (item.missingCount || 0), 0),
    excessCount: extraItems.reduce((sum, item) => sum + (item.excessCount || 0), 0),
    matchedCount,
    expectedCount: Array.isArray(expected) ? expected.length : 0,
    scannedCount: Array.isArray(scanned) ? scanned.length : 0,
  };
};

// Liczby braków/nadwyżek z wyniku (wynik zapisany wcześniej może nie mieć missingCount przy braku całkowitym)
export const missingOf = (item) => Number(item.missingCount ?? (Number(item.expectedCount || 0) - Number(item.actualCount || 0)));
export const excessOf = (item) => Number(item.excessCount ?? (Number(item.actualCount || 0) - Number(item.expectedCount || 0)));
export const countsOf = (result) => ({
  missing: result ? (result.missingCount ?? (result.missingItems || []).reduce((sum, item) => sum + missingOf(item), 0)) : 0,
  excess: result ? (result.excessCount ?? (result.extraItems || []).reduce((sum, item) => sum + excessOf(item), 0)) : 0,
});

export const productsLabel = (count) => (count === 1 ? 'produkt' : (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? 'produkty' : 'produktów'));
export const piecesSummary = (pieces, products) => `${pieces} szt. (${products} ${productsLabel(products)})`;

export default compareScans;
