// Czysta logika „inteligentnego” skanera (bez Reacta) - łatwa do testowania.
//
// 1. Położenie kodu: expo-camera podaje narożniki / prostokąt kodu we współrzędnych widoku kamery
//    (iOS natywnie, Android przeliczony z obrazu na podgląd). Środek kodu musi leżeć w ramce.
// 2. Potwierdzenie: ten sam odczyt kilka razy pod rząd w krótkim czasie - pojedyncza błędna klatka
//    (pomięta metka, odbicie, kąt) nie przejdzie.
// 3. EAN-13: zła cyfra kontrolna = odczyt odrzucony od razu.

import { isValidEan13 } from "../../utils/productName";

// Prostokąt kodu {x, y, width, height} z wyniku skanu; null, gdy kamera nie podała położenia
export const codeRectFromScan = (scan) => {
  const points = Array.isArray(scan?.cornerPoints) ? scan.cornerPoints.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)) : [];
  if (points.length >= 2) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    if (width > 0 && height > 0) return { x, y, width, height };
  }
  const b = scan?.bounds;
  const x = b?.origin?.x;
  const y = b?.origin?.y;
  const width = b?.size?.width;
  const height = b?.size?.height;
  if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
    return { x, y, width, height };
  }
  return null;
};

// Czy środek kodu leży w ramce (z małym zapasem na krawędziach)
export const isRectCenterInsideFrame = (rect, frame, margin = 12) => {
  if (!rect || !frame) return true; // brak danych o położeniu - nie blokujemy (decyduje potwierdzenie)
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return (
    cx >= frame.x - margin &&
    cx <= frame.x + frame.width + margin &&
    cy >= frame.y - margin &&
    cy <= frame.y + frame.height + margin
  );
};

// Odczyt wiarygodny sam w sobie (np. EAN-13 z poprawną cyfrą kontrolną).
// Cyfrę kontrolną EAN-13 sprawdzamy TYLKO, gdy aparat zgłosił format ean13 (audyt skanera 26.10.2026): nasze metki to
// Code 128 z własną sumą kontrolną, a dawniej każdy 13-cyfrowy odczyt przechodził test EAN-13 - kod z katalogu
// bez „ładnej” 13. cyfry był po cichu nieskanowalny.
export const isPlausibleCode = (data, type) => {
  const value = String(data || "").trim();
  if (!value) return false;
  if (isEanFamily(type)) {
    return isValidEan13(restoreLeadingZero(value));
  }
  return true;
};

// EAN-13 zaczynający się od zera jest jednocześnie kodem UPC-A (próba EAN-13 na metkach, 6.11.2026): iPhone
// (expo-camera obcina zero), Android (ML Kit potrafi zgłosić upc_a) i część czytników oddają go jako 12 cyfr
// (0040408300005 -> 040408300005). Dopisujemy zero z powrotem, gdy wynik jest poprawnym EAN-13 - nasze kody mają
// zawsze 13 cyfr, więc taki 12-cyfrowy odczyt to obcięte zero. Inne wartości zostają bez zmian.
export const restoreLeadingZero = (data) => {
  const value = String(data ?? "").trim();
  return /^\d{12}$/.test(value) && isValidEan13(`0${value}`) ? `0${value}` : value;
};

// Typ z rodziny EAN-13 / UPC-A (nazwa z expo-camera albo numer formatu: 32 = EAN-13, 512 = UPC-A)
export const isEanFamily = (type) => {
  const name = String(type || "").toLowerCase();
  return name.includes("ean13") || name.includes("upc_a") || name.includes("upca") || name === "32" || name === "512";
};

// Kod w postaci, w jakiej jest w systemie: odczyt EAN-13 / UPC-A z przywróconym zerem, reszta bez zmian
export const normalizeScannedCode = (data, type) => (isEanFamily(type) ? restoreLeadingZero(data) : data);

// Licznik potwierdzeń: ten sam kod `requiredHits` razy, kolejne odczyty nie dalej niż `windowMs` od poprzedniego.
// Inny kod w międzyczasie zaczyna liczenie od nowa.
export const createConfirmCounter = ({ requiredHits = 3, windowMs = 600 } = {}) => {
  let last = null;
  let hits = 0;
  let lastAt = 0;

  return {
    // zwraca liczbę potwierdzeń dla tego kodu (>= requiredHits = przyjęty)
    push(data, now = Date.now()) {
      if (data === last && now - lastAt <= windowMs) {
        hits += 1;
      } else {
        last = data;
        hits = 1;
      }
      lastAt = now;
      return hits;
    },
    isConfirmed(hitsCount) {
      return hitsCount >= requiredHits;
    },
    reset() {
      last = null;
      hits = 0;
      lastAt = 0;
    },
    get requiredHits() {
      return requiredHits;
    },
  };
};
