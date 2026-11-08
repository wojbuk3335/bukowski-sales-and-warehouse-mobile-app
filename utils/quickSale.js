// Sprzedaż ciągła (8.11.2026): skan = sprzedaż zapisana od razu, bez formularza - przy dużym ruchu czytnikiem
// Bluetooth (DS2278) albo kamerą. Cena i minimum DOKŁADNIE jak w formularzu „Nowa sprzedaż” (utils/defaultSalePrice):
// gotówka = cena domyślna z cennika punktu (regularna opuszczona o końcówkę, promocja bez zmian), karta = pełna cena
// z cennika (bez rabatu). Gdy czegoś nie da się ustalić bez sprzedawcy (kurtki nie ma na stanie TEGO punktu, brak
// ceny, cena poniżej minimum), zwracamy powód - ekran otwiera wtedy zwykły formularz.
import { listPriceOf, minimumPriceError, regularOrPromoRule, salePriceListForBarcode, salePriceRule, stateItemStoredMinimum } from './defaultSalePrice';
import { formatMoneyExact } from './paymentBalance';

export const QUICK_SALE_MODE_KEY = 'quick-sale-mode'; // przełącznik zapamiętany w telefonie
export const QUICK_REPEAT_MS = 5000; // ten sam kod ponownie w tym czasie = pytanie o drugą sztukę (kamera: pomijany)

const itemName = (item) => (typeof item?.fullName === 'object' ? item.fullName?.fullName : item?.fullName) || '';
const hasRealSize = (size) => {
  const value = String(size || '').trim();
  return Boolean(value) && value !== '-' && value !== 'Nieznany rozmiar';
};

// Zwraca { ok: true, sale } albo { ok: false, reason }.
// sale: { fullName, size, symbol, cash, card, amount, payment, label }
export const buildQuickSale = ({ code, stateData, goods, sizes, priceList, user, payment = 'cash' }) => {
  const barcode = String(code || '').trim();
  if (!barcode) return { ok: false, reason: 'Pusty kod.' };
  const items = (stateData || []).filter((item) => item.barcode === barcode);
  if (items.length === 0) return { ok: false, reason: 'Tego kodu nie ma na stanie - sprawdź produkt w formularzu.' };
  const own = items.find((item) => item.symbol === user?.symbol);
  if (!own) return { ok: false, reason: 'Tej sztuki nie ma na stanie Twojego punktu - wybierz w formularzu, z którego punktu sprzedajesz.' };

  // jak w formularzu: karta produktu (cennik punktu), a bez karty - cena zapisana na stanie
  const fromGoods = salePriceRule({ barcode, goods, sizes, priceList });
  const rule = fromGoods || regularOrPromoRule(own.price, own.discount_price, own.category, stateItemStoredMinimum(own, goods));
  const listPrice = fromGoods ? salePriceListForBarcode({ barcode, goods, sizes, priceList }) : listPriceOf(own.price, own.discount_price);

  const fullName = itemName(own);
  const size = hasRealSize(own.size) ? String(own.size).trim() : '-';
  const label = size !== '-' ? `${fullName} ${size}` : fullName;
  const base = { fullName, size, symbol: user.symbol, label };

  if (payment === 'card') {
    // karta: bez rabatu - pełna cena z cennika (jak blokada w formularzu)
    if (!(Number(listPrice) > 0)) return { ok: false, reason: 'Brak ceny z cennika do płatności kartą.' };
    return {
      ok: true,
      sale: { ...base, payment: 'card', amount: Number(listPrice), cash: [{ price: '0', currency: 'PLN' }], card: [{ price: String(listPrice), currency: 'PLN' }] },
    };
  }

  const amount = Number(rule?.defaultPrice);
  if (!(amount > 0)) return { ok: false, reason: 'Brak ceny tego produktu w cenniku - wpisz cenę w formularzu.' };
  const minimumError = minimumPriceError(amount, rule?.minPrice);
  if (minimumError) return { ok: false, reason: minimumError };
  return {
    ok: true,
    sale: { ...base, payment: 'cash', amount, cash: [{ price: formatMoneyExact(amount), currency: 'PLN' }], card: [] },
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
