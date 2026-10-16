import { compareScans, countsOf, piecesSummary } from '../../utils/compareScans';

// Porównanie oczekiwanych sztuk (stan punktu / dobrane kurtki) z zeskanowanymi - wspólne dla Remanentu i „Sprawdź”

const stateItem = (barcode, fullName = 'Amanda CZARNY', size = '44', price = 999) => ({ barcode, fullName, size, price });
const scan = (code, name = 'Amanda CZARNY 44', value = 0) => ({ code, name, value });

describe('compareScans', () => {
  test('zgodność: te same kody i liczby sztuk - brak braków i nadwyżek', () => {
    const result = compareScans(
      [stateItem('1'), stateItem('1'), stateItem('2')],
      [scan('2'), scan('1'), scan('1')]
    );
    expect(result.missingItems).toEqual([]);
    expect(result.extraItems).toEqual([]);
    expect(result.missingCount).toBe(0);
    expect(result.excessCount).toBe(0);
    expect(result.matchedCount).toBe(3);
    expect(result.expectedCount).toBe(3);
    expect(result.scannedCount).toBe(3);
  });

  test('braki: kod niezeskanowany wcale - brak całkowity', () => {
    const result = compareScans([stateItem('1', 'Amanda CZARNY', '44', 1200)], []);
    expect(result.missingItems).toEqual([{
      name: 'Amanda CZARNY', size: '44', price: 1200, code: '1', expectedCount: 1, actualCount: 0, missingCount: 1,
    }]);
    expect(result.missingCount).toBe(1);
    expect(result.extraItems).toEqual([]);
    expect(result.matchedCount).toBe(0);
  });

  test('częściowe: zeskanowano mniej sztuk niż jest na stanie', () => {
    const result = compareScans(
      [stateItem('5'), stateItem('5'), stateItem('5')],
      [scan('5')]
    );
    expect(result.missingItems).toHaveLength(1);
    expect(result.missingItems[0]).toMatchObject({ code: '5', expectedCount: 3, actualCount: 1, missingCount: 2 });
    expect(result.missingCount).toBe(2);
    expect(result.matchedCount).toBe(1);
  });

  test('nadwyżki: więcej sztuk niż na stanie oraz kod spoza stanu', () => {
    const result = compareScans(
      [stateItem('1')],
      [scan('1', 'Amanda CZARNY 44', 10), scan('1'), scan('9', 'Kasia BRĄZ 40', 5)]
    );
    expect(result.missingItems).toEqual([]);
    expect(result.extraItems).toEqual([
      { name: 'Amanda CZARNY 44', size: undefined, price: 10, code: '1', expectedCount: 1, actualCount: 2, excessCount: 1 },
      { name: 'Kasia BRĄZ 40', size: undefined, price: 5, code: '9', expectedCount: 0, actualCount: 1, excessCount: 1 },
    ]);
    expect(result.excessCount).toBe(2);
    expect(result.matchedCount).toBe(1);
  });

  test('braki i nadwyżki naraz, kolejność: najpierw kody oczekiwane, potem spoza listy', () => {
    const result = compareScans(
      [stateItem('5900000000001'), stateItem('5900000000002')],
      [scan('5900000000003'), scan('5900000000002'), scan('5900000000002')]
    );
    expect(result.missingItems.map((item) => item.code)).toEqual(['5900000000001']);
    expect(result.extraItems.map((item) => item.code)).toEqual(['5900000000002', '5900000000003']);
    expect(countsOf(result)).toEqual({ missing: 1, excess: 2 });
  });

  test('własne pola i opisy („Sprawdź”: nazwa z dobranych albo kod)', () => {
    const result = compareScans(
      [{ barcode: '1', fullName: '', size: '-' }],
      [{ code: '2', name: '' }],
      {
        describeExpected: (first) => ({ name: first.fullName || first.barcode }),
        describeScanned: (first) => ({ name: first.name || first.code }),
      }
    );
    expect(result.missingItems[0]).toEqual({ name: '1', code: '1', expectedCount: 1, actualCount: 0, missingCount: 1 });
    expect(result.extraItems[0]).toEqual({ name: '2', code: '2', expectedCount: 0, actualCount: 1, excessCount: 1 });
  });

  test('puste i niepoprawne wejście nie wywraca porównania', () => {
    expect(compareScans(undefined, null)).toMatchObject({ missingItems: [], extraItems: [], missingCount: 0, excessCount: 0, matchedCount: 0 });
  });

  test('countsOf liczy z list, gdy zapisany wynik nie ma sum; piecesSummary odmienia „produkt”', () => {
    expect(countsOf({ missingItems: [{ expectedCount: 3, actualCount: 0 }], extraItems: [{ expectedCount: 0, actualCount: 2 }] }))
      .toEqual({ missing: 3, excess: 2 });
    expect(countsOf(null)).toEqual({ missing: 0, excess: 0 });
    expect(piecesSummary(1, 1)).toBe('1 szt. (1 produkt)');
    expect(piecesSummary(3, 2)).toBe('3 szt. (2 produkty)');
    expect(piecesSummary(7, 5)).toBe('7 szt. (5 produktów)');
    expect(piecesSummary(12, 12)).toBe('12 szt. (12 produktów)');
  });
});
