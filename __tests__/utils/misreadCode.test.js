import { isMisreadCode, isValidEan13 } from '../../utils/productName';

// Kody z remanentu 11.11.2026: „Teresa NIEBIESKI 48” (6471604800000) to zniekształcony odczyt czarnej Teresy -
// zła cyfra kontrolna. Pozostałe nadwyżki z tego remanentu to prawdziwe kody (poprawna cyfra kontrolna).
describe('isMisreadCode - błędny odczyt z czytnika', () => {
  test('kod Teresy z remanentu jest odrzucany (zła cyfra kontrolna)', () => {
    expect(isValidEan13('6471604800000')).toBe(false);
    expect(isMisreadCode('6471604800000')).toBe(true);
  });

  test('prawdziwe kody z tego samego remanentu przechodzą', () => {
    ['1240601300003', '4602001300002', '6045400200005', '6796301300003', '0970600300001', '5000600300000'].forEach((code) => {
      expect(isMisreadCode(code)).toBe(false);
    });
  });

  test('kod dokładnie ze stanu przechodzi zawsze (stara metka bez poprawnej cyfry kontrolnej)', () => {
    expect(isMisreadCode('6471604800000', new Set(['6471604800000']))).toBe(false);
  });

  test('inny format ocenia ekran („Nieznany kod”), nie ta reguła', () => {
    expect(isMisreadCode('QR-XYZ')).toBe(false);
    expect(isMisreadCode('123')).toBe(false);
  });
});
