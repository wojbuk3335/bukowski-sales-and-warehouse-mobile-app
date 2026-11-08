// Sprzedaż ciągła (8.11.2026): skan = sprzedaż zapisana od razu, ZAWSZE gotówką, bez formularza - przy dużym ruchu
// czytnikiem Bluetooth (DS2278) albo kamerą. Decyzja właściciela (8.11): zapis „bez względu na wszystko” - także gdy
// sztuki nie ma na stanie (serwer stanu nie wymaga) - i ZAWSZE „sprzedano od” punktu zalogowanego sprzedawcy
// („najbezpieczniejsze”: kurtkę trzyma w ręku sprzedawca tego punktu; rozjazd ze stanem wyjdzie na remanencie).
// Stan innych punktów służy tylko do nazwy, rozmiaru i ceny. Cena DOKŁADNIE jak podpowiedź formularza „Nowa sprzedaż”
// (utils/defaultSalePrice): cena domyślna z cennika punktu (regularna opuszczona o końcówkę, promocja bez zmian).
// Nie zapisze się tylko to, czego serwer i tak nie przyjmie: kod bez nazwy produktu i produkt bez ceny.
import { regularOrPromoRule, salePriceRule, stateItemStoredMinimum } from './defaultSalePrice';
import { formatMoneyExact } from './paymentBalance';

export const QUICK_SALE_MODE_KEY = 'quick-sale-mode'; // przełącznik zapamiętany w telefonie
export const QUICK_REPEAT_MS = 5000; // kamera: ten sam kod w tym czasie = ta sama metka wciąż w kadrze (pomijany)

const itemName = (item) => (typeof item?.fullName === 'object' ? item.fullName?.fullName : item?.fullName) || '';
const hasRealSize = (size) => {
  const value = String(size || '').trim();
  return Boolean(value) && value !== '-' && value !== 'Nieznany rozmiar';
};

// unstocked: { fullName, size } produktu rozpoznanego z samego kodu (karta produktu), gdy sztuki nie ma na żadnym stanie.
// Zwraca { ok: true, sale } albo { ok: false, reason }. sale: { fullName, size, symbol, cash, card, amount, label }
export const buildQuickSale = ({ code, stateData, goods, sizes, priceList, user, unstocked = null }) => {
  const barcode = String(code || '').trim();
  if (!barcode) return { ok: false, reason: 'Pusty kod.' };
  const items = (stateData || []).filter((item) => item.barcode === barcode);
  // sprzedaż ZAWSZE z punktu zalogowanego; sztuka ze stanu (najlepiej własnego) - tylko nazwa, rozmiar i cena
  const stocked = items.find((item) => item.symbol === user?.symbol) || items[0] || null;
  const symbol = user?.symbol;
  if (!symbol) return { ok: false, reason: 'Brak punktu zalogowanego konta - zaloguj się ponownie.' };

  let fullName;
  let size;
  if (stocked) {
    fullName = itemName(stocked);
    size = hasRealSize(stocked.size) ? String(stocked.size).trim() : '-';
  } else if (unstocked?.fullName) {
    fullName = unstocked.fullName;
    size = hasRealSize(unstocked.size) ? String(unstocked.size).trim() : '-';
  } else {
    return { ok: false, reason: `Nieznany kod ${barcode} - nie ma go w kartach produktów ani na stanie.` };
  }
  const label = size !== '-' ? `${fullName} ${size}` : fullName;

  // cena: karta produktu (cennik punktu), a bez karty - cena zapisana na stanie
  const rule = salePriceRule({ barcode, goods, sizes, priceList })
    || (stocked ? regularOrPromoRule(stocked.price, stocked.discount_price, stocked.category, stateItemStoredMinimum(stocked, goods)) : null);
  const amount = Number(rule?.defaultPrice);
  if (!(amount > 0)) return { ok: false, reason: `${label}: brak ceny w cenniku - sprzedaj przez formularz (wyłącz sprzedaż ciągłą).` };

  return {
    ok: true,
    sale: { fullName, size, symbol, label, amount, payment: 'cash', cash: [{ price: formatMoneyExact(amount), currency: 'PLN' }], card: [] },
  };
};

// Treść zapisu - te same pola co formularz (POST /sales/save-sales), zwykła sprzedaż bez odbioru zamówienia
export const buildQuickSalePayload = ({ sale, code, user, clientRequestId, now = new Date() }) => ({
  fullName: sale.fullName,
  timestamp: now.toISOString(),
  barcode: String(code).trim(),
  size: sale.size,
  sellingPoint: user?.sellingPoint || 'Unknown',
  from: sale.symbol,
  cash: sale.cash,
  card: sale.card,
  symbol: sale.symbol,
  isPickup: false,
  advanceAmount: 0,
  advanceOperationId: null,
  employeeId: user?.employeeId || null,
  employeeName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : null,
  clientRequestId,
});

export const newQuickSaleId = () => `sale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
