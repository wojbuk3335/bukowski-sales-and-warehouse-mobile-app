// Zdjęcie produktu do karty w Dobieraniu (transfer, sprzedaż, sztuka z magazynu).
// Karta produktu po nazwie, a gdy nazwa się nie zgadza (zmieniona) - po kodzie kreskowym,
// tak jak serwer: pełny kod, dla kurtek pierwsze 5 cyfr (model + kolor).
import { API_CONFIG } from '../config/api';

const JACKETS_CATEGORY = 'Kurtki kożuchy futra';

const nameOf = (value) => (value && typeof value === 'object' ? value.fullName : value) || '';

export const findGoodForItem = (goods, item) => {
  if (!Array.isArray(goods) || goods.length === 0 || !item) return null;
  const name = String(nameOf(item.fullName)).trim().toLowerCase();
  if (name) {
    const byName = goods.find((good) => String(good?.fullName || '').trim().toLowerCase() === name);
    if (byName) return byName;
  }
  const barcode = String(item.barcode || '').trim();
  if (!barcode) return null;
  const byCode = goods.find((good) => good?.code === barcode);
  if (byCode) return byCode;
  if (/^\d{13}$/.test(barcode) && !barcode.startsWith('000')) {
    const prefix = barcode.slice(0, 5);
    return goods.find((good) => good?.category === JACKETS_CATEGORY && String(good?.code || '').startsWith(prefix)) || null;
  }
  return null;
};

// Adres zdjęcia jak na liście produktów: pełny URL (localhost podmieniony na serwer), ścieżka, albo nazwa pliku → /images/<plik>
export const pictureUrl = (picture, baseUrl = String(API_CONFIG.BASE_URL || '').replace('/api', '')) => {
  const value = String(picture || '').trim();
  if (!value) return null;
  if (/^https?:\/\//.test(value)) return value.replace('http://localhost:3000', baseUrl);
  if (value.startsWith('/')) return `${baseUrl}${value}`;
  return `${baseUrl}/images/${value}`;
};

// Wersja zdjęcia z serwera: 'thumb' 160 px do kart i list, 'preview' 1200 px do powiększenia (zamiast 3 MB oryginału).
// Adres powstaje z adresu oryginału przez wstawienie /thumb/ lub /preview/ po /images/.
// Miniatury robi tylko nasz serwer - zdjęcia z innych adresów zostają bez zmian (inaczej obcy serwer dostałby /thumb/)
const hostOf = (url) => {
  const match = String(url || '').match(/^https?:\/\/([^/]+)/);
  return match ? match[1].toLowerCase() : '';
};
const isOwnImageUrl = (url, baseUrl) => {
  const host = hostOf(url);
  if (!host) return true;
  const own = new Set(['bukowskiapp.pl', 'www.bukowskiapp.pl', 'localhost:3000']);
  const baseHost = hostOf(baseUrl || String(API_CONFIG.BASE_URL || ''));
  if (baseHost) own.add(baseHost);
  return own.has(host);
};

export const pictureVariantUrl = (picture, variant = 'thumb', baseUrl) => {
  const url = pictureUrl(picture, baseUrl);
  if (!url || !['thumb', 'preview'].includes(variant) || !isOwnImageUrl(url, baseUrl)) return url;
  return url.replace(/\/images\/(?!thumb\/|preview\/)([^/?#]+)(?=[?#]|$)/, `/images/${variant}/$1`);
};

export const itemPictureUrl = (goods, item, baseUrl) => pictureUrl(findGoodForItem(goods, item)?.picture, baseUrl);
export const itemPictureVariantUrl = (goods, item, variant, baseUrl) => pictureVariantUrl(findGoodForItem(goods, item)?.picture, variant, baseUrl);

export default itemPictureUrl;
