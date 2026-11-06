import {
  codeRectFromScan,
  createConfirmCounter,
  isPlausibleCode,
  isEanFamily,
  normalizeScannedCode,
  restoreLeadingZero,
  isRectCenterInsideFrame,
} from "../../components/scanner/smartScanLogic";

const FRAME = { x: 50, y: 300, width: 280, height: 200 };

describe("smartScanLogic", () => {
  test("prostokąt kodu z narożników albo z bounds; brak położenia = null", () => {
    expect(codeRectFromScan({ cornerPoints: [{ x: 100, y: 350 }, { x: 200, y: 350 }, { x: 200, y: 400 }, { x: 100, y: 400 }] }))
      .toEqual({ x: 100, y: 350, width: 100, height: 50 });
    expect(codeRectFromScan({ cornerPoints: [], bounds: { origin: { x: 10, y: 20 }, size: { width: 30, height: 40 } } }))
      .toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(codeRectFromScan({ cornerPoints: [], bounds: { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } } })).toBeNull();
    expect(codeRectFromScan({ data: "x" })).toBeNull();
  });

  test("kod w ramce przyjęty, kod z boku odrzucony; brak położenia nie blokuje", () => {
    expect(isRectCenterInsideFrame({ x: 120, y: 380, width: 100, height: 40 }, FRAME)).toBe(true);
    expect(isRectCenterInsideFrame({ x: 120, y: 60, width: 100, height: 40 }, FRAME)).toBe(false); // nad ramką
    expect(isRectCenterInsideFrame({ x: 340, y: 380, width: 60, height: 40 }, FRAME)).toBe(false); // obok ramki
    expect(isRectCenterInsideFrame(null, FRAME)).toBe(true);
    expect(isRectCenterInsideFrame({ x: 1, y: 1, width: 1, height: 1 }, null)).toBe(true);
  });

  test("EAN-13 ze złą cyfrą kontrolną odrzucony, poprawny i inne formaty przyjęte", () => {
    expect(isPlausibleCode("0100600300002", "ean13")).toBe(true);
    expect(isPlausibleCode("0100600300003", "ean13")).toBe(false);
    expect(isPlausibleCode("0100600300003", "code128")).toBe(true); // Code 128 ma własną sumę kontrolną - nie sprawdzamy jak EAN-13 (26.10.2026)
    expect(isPlausibleCode("0100600300003", "32")).toBe(false); // ean13 jako numer typu (iOS)
    expect(isPlausibleCode("ABC-123", "code128")).toBe(true);
    expect(isPlausibleCode("", "ean13")).toBe(false);
  });

  // Próba EAN-13 na metkach (6.11.2026): kod zaczynający się od zera jest też kodem UPC-A - iPhone oddaje go bez zera
  // (typ ean13, 12 cyfr), Android potrafi zgłosić upc_a. Aplikacja ma dostać kod taki, jak w systemie (13 cyfr).
  test("EAN-13 z zerem na początku: obcięte zero wraca, zły odczyt nie przechodzi, inne formaty bez zmian", () => {
    expect(restoreLeadingZero("040408300005")).toBe("0040408300005");
    expect(restoreLeadingZero("040408300006")).toBe("040408300006"); // po dopisaniu zera zła cyfra kontrolna - bez zmian
    expect(restoreLeadingZero("0040408300005")).toBe("0040408300005"); // pełny kod bez zmian
    expect(normalizeScannedCode("040408300005", "ean13")).toBe("0040408300005"); // iPhone
    expect(normalizeScannedCode("040408300005", "upc_a")).toBe("0040408300005"); // Android
    expect(normalizeScannedCode("040408300005", "512")).toBe("0040408300005"); // upc_a jako numer formatu
    expect(normalizeScannedCode("040408300005", "code128")).toBe("040408300005"); // Code 128 czytamy dosłownie
    expect(normalizeScannedCode("https://x.pl/040408300005", "qr")).toBe("https://x.pl/040408300005");
    expect(isPlausibleCode("040408300005", "ean13")).toBe(true); // dawniej iPhone odrzucał taki odczyt po cichu
    expect(isPlausibleCode("040408300005", "upc_a")).toBe(true);
    expect(isPlausibleCode("040408300006", "upc_a")).toBe(false);
    expect(isEanFamily("ean13")).toBe(true);
    expect(isEanFamily("code128")).toBe(false);
  });

  test("potwierdzenie: ten sam kod 3 razy pod rząd; inny kod w środku zeruje; przerwa > okno zeruje", () => {
    const c = createConfirmCounter({ requiredHits: 3, windowMs: 600 });
    expect(c.push("A", 0)).toBe(1);
    expect(c.push("A", 100)).toBe(2);
    expect(c.isConfirmed(c.push("A", 200))).toBe(true);

    c.reset();
    c.push("A", 0);
    c.push("B", 100); // błędna klatka
    expect(c.push("A", 200)).toBe(1);

    c.reset();
    c.push("A", 0);
    expect(c.push("A", 1000)).toBe(1); // za długa przerwa
  });
});
