// Zamówienia do wydania przy sprzedaży (odbiór w punkcie / dostawa): opis zaliczki i kolejność na liście.
import { formatMoney } from './paymentBalance';

const normalize = (text) => String(text || '').trim().toLowerCase();

// „100.00 EUR + 200.00 zł”; brak zaliczki - „brak”
export const formatOrderDeposit = (payment = {}) => {
  const list = Array.isArray(payment.deposits) && payment.deposits.length > 0
    ? payment.deposits
    : (Number(payment.deposit) > 0 ? [{ amount: payment.deposit, currency: payment.depositCurrency || 'PLN' }] : []);
  if (list.length === 0) return 'brak';
  return list
    .map((item) => `${formatMoney(Number(item.amount) || 0)} ${!item.currency || item.currency === 'PLN' ? 'zł' : item.currency}`)
    .join(' + ');
};

// Nazwa zamówionego produktu: model, kolor, rozmiar
export const orderProductName = (order) => [order?.product?.name, order?.product?.color, order?.product?.size].filter(Boolean).join(' ');

// Ile cech zamówienia (model, kolor, rozmiar) zgadza się z nazwą zeskanowanej kurtki („ADELA CZARNY XL”)
export const orderMatchScore = (order, scannedName) => {
  const scanned = normalize(scannedName);
  if (!scanned) return 0;
  const words = scanned.split(/\s+/);
  const product = order?.product || {};
  let score = 0;
  if (product.name && scanned.includes(normalize(product.name))) score += 2; // model najważniejszy
  if (product.color && scanned.includes(normalize(product.color))) score += 1;
  if (product.size && words.includes(normalize(product.size))) score += 1;
  return score;
};

// Najpierw zamówienia pasujące do zeskanowanej kurtki, potem po terminie realizacji
export const sortPickupOrders = (orders, scannedName) => [...(orders || [])].sort((a, b) => {
  const byMatch = orderMatchScore(b, scannedName) - orderMatchScore(a, scannedName);
  if (byMatch !== 0) return byMatch;
  return new Date(a.realizationDate || 0) - new Date(b.realizationDate || 0);
});
