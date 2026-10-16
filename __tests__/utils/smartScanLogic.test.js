import {
  codeRectFromScan,
  createConfirmCounter,
  isPlausibleCode,
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
    expect(isPlausibleCode("0100600300003", "code128")).toBe(false); // 13 cyfr = sprawdzamy jak EAN-13
    expect(isPlausibleCode("ABC-123", "code128")).toBe(true);
    expect(isPlausibleCode("", "ean13")).toBe(false);
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
