import React, { useContext, useEffect, useRef, useState } from 'react';
import { GlobalStateContext } from '../context/GlobalState';
import tokenService from '../services/tokenService';
import { getApiUrl } from '../config/api';
import { isUnknownProductName, productNameFromBarcode } from '../utils/productName';

// Karty produktów i słowniki (asortyment, kolory, rozmiary) do nazw produktów po kodzie z metki
// i do „Z bazy” w skanerze. Te same źródła i ta sama logika nazw co w Remanencie.

// Kolejność rozmiarów: literowe od najmniejszego, potem liczbowe rosnąco
const LETTER_SIZE_ORDER = ['XXXS', '3XS', 'XXS', '2XS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL', '9XL'];
const sizeRank = (name) => {
  const text = String(name || '').trim().toUpperCase();
  const letterIndex = LETTER_SIZE_ORDER.indexOf(text);
  if (letterIndex !== -1) return [0, letterIndex];
  const number = parseFloat(text.replace(',', '.'));
  if (Number.isFinite(number)) return [1, number];
  return [2, 0];
};
export const compareSizes = (a, b) => {
  const [groupA, valueA] = sizeRank(a);
  const [groupB, valueB] = sizeRank(b);
  if (groupA !== groupB) return groupA - groupB;
  if (valueA !== valueB) return valueA - valueB;
  return String(a).localeCompare(String(b), 'pl');
};

const toList = (value, key) => (Array.isArray(value) ? value : (value?.data || value?.[key] || []));

const useProductCatalog = () => {
  const { sizes, colors, stocks, stateData, fetchSizes, fetchColors, fetchStock } = useContext(GlobalStateContext) || {};
  const [goodsList, setGoodsList] = useState([]);

  // Słowniki są wspólne dla aplikacji i inne ekrany mogą je chwilowo wyzerować - trzymamy ostatnią NIEPUSTĄ kopię
  const lastStocksRef = useRef([]);
  const lastColorsRef = useRef([]);
  const lastSizesRef = useRef([]);
  const stableList = (value, key, ref) => {
    const list = toList(value, key);
    if (list.length > 0) ref.current = list;
    return ref.current;
  };

  useEffect(() => {
    if (toList(stocks, 'stocks').length === 0 && fetchStock) fetchStock();
    if (toList(colors, 'colors').length === 0 && fetchColors) fetchColors();
    if (toList(sizes, 'sizes').length === 0 && fetchSizes) fetchSizes();
    let cancelled = false;
    const loadGoods = async () => {
      try {
        const response = await tokenService.authenticatedFetch(getApiUrl('/excel/goods/get-all-goods'));
        if (response?.ok) {
          const data = await response.json();
          if (!cancelled) setGoodsList(Array.isArray(data?.goods) ? data.goods : []);
        }
      } catch (error) {
        // bez kart produktów - nazwy kurtek nadal ze słowników
      }
    };
    loadGoods();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stockByKod = React.useMemo(
    () => Object.fromEntries(stableList(stocks, 'stocks', lastStocksRef).filter((item) => item?.Tow_Kod).map((item) => [String(item.Tow_Kod), item.Tow_Opis])),
    [stocks]
  );
  const colorByKod = React.useMemo(
    () => Object.fromEntries(stableList(colors, 'colors', lastColorsRef).filter((item) => item?.Kol_Kod).map((item) => [String(item.Kol_Kod), item.Kol_Opis])),
    [colors]
  );
  const sizeByKod = React.useMemo(
    () => Object.fromEntries(stableList(sizes, 'sizes', lastSizesRef).filter((item) => item?.Roz_Kod).map((item) => [String(item.Roz_Kod), item.Roz_Opis])),
    [sizes]
  );
  const goodsByCode = React.useMemo(
    () => Object.fromEntries(goodsList.filter((good) => good?.code).map((good) => [String(good.code), good])),
    [goodsList]
  );
  const jacketGoodsByPrefix = React.useMemo(
    () => Object.fromEntries(
      goodsList
        .filter((good) => good?.category === 'Kurtki kożuchy futra' && good?.code)
        .map((good) => [String(good.code).slice(0, 5), good])
    ),
    [goodsList]
  );
  const pickerSizes = React.useMemo(
    () => stableList(sizes, 'sizes', lastSizesRef)
      .filter((size) => size?.Roz_Kod && size?.Roz_Opis && !/NIEOKRE/i.test(size.Roz_Opis))
      .sort((a, b) => compareSizes(a.Roz_Opis, b.Roz_Opis)),
    [sizes]
  );

  const getProductNameFromBarcode = (code) => productNameFromBarcode(code, {
    sizeByKod, stockByKod, colorByKod, goodsByCode, jacketGoodsByPrefix, stateData,
  });

  // Czy kod to metka z naszej bazy? Gdy karty i słowniki jeszcze się nie wczytały, nie da się tego sprawdzić.
  const catalogLoaded = goodsList.length > 0 || Object.keys(stockByKod).length > 0;
  const isKnownProductCode = (code, resolvedName) => {
    if (!/^\d{13}$/.test(String(code || '').trim())) return false; // nasze metki to zawsze EAN-13
    if (!catalogLoaded) return true;
    return !isUnknownProductName(resolvedName);
  };

  return { goodsList, pickerSizes, getProductNameFromBarcode, isKnownProductCode, catalogLoaded };
};

export default useProductCatalog;
