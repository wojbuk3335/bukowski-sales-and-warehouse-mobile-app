// Przejście z nazw na ID, krok 3 (25.10.2026): Dobieranie paruje pozycje po ID towaru (goodsId) i rozmiaru (sizeId),
// tak jak serwer. Przepisania i sprzedaże mają ID od kroku 1 (nowe) i 2 (uzupełnione stare); stan i magazyn mają je
// zawsze (fullName._id, size._id albo goodsId / sizeId z /api/state). Napisy zostają tylko dla wpisów bez ID.

// ID towaru i rozmiaru z dowolnej postaci pozycji: przepisanie / sprzedaż (goodsId, sizeId),
// sztuka ze stanu lub magazynu (fullName._id, size._id) albo wiersz z /api/state (goodsId, sizeId)
export const productRefs = (item) => {
  if (!item) return { goodsId: null, sizeId: null };
  const goodsId = item.goodsId || (item.fullName && typeof item.fullName === 'object' ? item.fullName._id : null) || null;
  const sizeId = item.sizeId || (item.size && typeof item.size === 'object' ? item.size._id : null) || null;
  return { goodsId: goodsId ? String(goodsId) : null, sizeId: sizeId ? String(sizeId) : null };
};

// true / false, gdy obie pozycje mają ID towaru; null, gdy którejś brakuje (wtedy decyduje stare porównanie napisów).
// Brak rozmiaru (torebki, portfele) po obu stronach = ten sam rozmiar.
export const sameProductByRefs = (a, b) => {
  const left = productRefs(a);
  const right = productRefs(b);
  if (!left.goodsId || !right.goodsId) return null;
  return left.goodsId === right.goodsId && (left.sizeId || '-') === (right.sizeId || '-');
};
