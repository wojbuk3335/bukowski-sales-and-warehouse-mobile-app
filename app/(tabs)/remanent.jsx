import React, { useContext, useState, useEffect, useRef } from 'react';
import { comparePl } from '../../utils/plSort'; // szybkie sortowanie po polsku
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';
import useLiveRefresh from '../../services/useLiveRefresh'; // skany drugiego telefonu punktu widoczne od razu
import Logger from '../../services/logger'; // Import logger service
import { getApiUrl } from '../../config/api';
import { REMAINING_CATEGORY_LABELS, getRemainingProductTypeByKey } from '../../config/remainingProductTypes';
import LogoutButton from '../../components/LogoutButton';
import { ScreenHeader } from '../../components/AdminLook';
import { KeyboardSafeOverlay } from '../../components/KeyboardSafe'; // klawiatura nie zasłania pola w okienku
import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu
import BarcodeScannerModal from '../../components/scanner/BarcodeScannerModal';
import ScanCompareResultModal from '../../components/scanner/ScanCompareResultModal';
import { productNameFromBarcode } from '../../utils/productName';
import { searchWords as toSearchWords, filterBySearch } from '../../utils/searchText'; // wyszukiwarka jak w Stanie i Szukaj
const Remanent = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets(); // Get safe area insets
  // Dolny pasek zakładek jest nałożony na ekran (position: absolute, wysokość jak w (tabs)/_layout.jsx) -
  // rezerwujemy jego pełną wysokość, żeby przyciski na dole nie chowały się pod nim.
  const tabBarSpace = Math.max(90, 70 + insets.bottom) + 8;
  const { user, sizes, colors, stocks, stateData, fetchSizes, fetchColors, fetchStock } = useContext(GlobalStateContext);
  const [remanentData, setRemanentData] = useState([]);
  // Sesja remanentu PUNKTU (od „Rozpocznij remanent” do „Zakończ remanent”), wspólna dla wszystkich telefonów punktu
  const [session, setSession] = useState(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  const [selectSearch, setSelectSearch] = useState({}); // wyszukiwarka w listach filtrów (klucz pola -> tekst)
  // Historia zakończonych remanentów punktu (wyniki zapisane na serwerze)
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState(null); // { session, loading }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Skaner (components/scanner/BarcodeScannerModal - wspólny z zakładką „Sprawdź” w panelu admina)
  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false); // potwierdzenie „Wyczyść wszystko”
  const [clearingAll, setClearingAll] = useState(false);
  const [clearResult, setClearResult] = useState(null); // { ok, text } - wynik czyszczenia w oknie aplikacji

  // Comparison modal states
  const [comparisonModalVisible, setComparisonModalVisible] = useState(false);
  const [comparisonResults, setComparisonResults] = useState(null);

  // Assortment filter states
  // Stan punktu (sztuki na stanie) - pobierany raz przy wejściu/odświeżeniu/zatwierdzeniu, nie przy każdej zmianie listy
  const [pointState, setPointState] = useState([]);
  const [filteredRemanentData, setFilteredRemanentData] = useState([]); // Przefiltrowane dane
  const [scanSearch, setScanSearch] = useState(''); // wyszukiwarka zeskanowanych sztuk (nazwa, rozmiar, kod) - 26.10.2026

  // Advanced filter modal states
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [openFilterSelect, setOpenFilterSelect] = useState(null); // które pole filtra ma rozwiniętą listę opcji
  // Filtry: kategoria główna -> wielokrotny wybór w kategorii (modele kurtek, kody torebek/portfeli,
  // rodzaje pozostałego asortymentu), kolor, rozmiar (tylko kurtki)
  const EMPTY_FILTERS = { category: '', items: [], models: [], colors: [], sizes: [] }; // kolory i rozmiary: wybór wielokrotny
  const [advancedFilters, setAdvancedFilters] = useState(EMPTY_FILTERS);
  const [goodsList, setGoodsList] = useState([]); // karty produktów: wszystkie możliwe opcje filtrów
  const [availableColors, setAvailableColors] = useState([]);
  const [availableSizes, setAvailableSizes] = useState([]);

  // Progress tracking states
  const [scanProgress, setScanProgress] = useState({
    totalExpected: 0,
    totalScanned: 0,
    uniqueScanned: 0,
    percentage: 0
  });
  const [scanStartTime, setScanStartTime] = useState(null);

  // ---------------------------------------------------------------------------
  // Filtry oparte na KODZIE KRESKOWYM i słownikach (asortyment, kolory, rozmiary),
  // a nie na słowach w nazwie (dawniej „APS 054 CZARNY” dawało kolor „054”).
  // Kurtki: Tow_Kod(3) + Kol_Kod(2) + Roz_Kod(3) + ...; reszta: 000 + Kol_Kod(2) + ...
  // ---------------------------------------------------------------------------
  const toList = (value, key) => (Array.isArray(value) ? value : (value?.data || value?.[key] || []));
  // Słowniki są wspólne dla całej aplikacji i inne ekrany mogą je chwilowo wyzerować (np. przy przekroczeniu
  // czasu pobierania). Remanent trzyma ostatnią NIEPUSTĄ kopię, żeby filtr nie uznawał nagle skanów za „nieznane”.
  const lastStocksRef = useRef([]);
  const lastColorsRef = useRef([]);
  const lastSizesRef = useRef([]);
  const stableList = (value, key, ref) => {
    const list = toList(value, key);
    if (list.length > 0) ref.current = list;
    return ref.current;
  };
  const stockByKod = React.useMemo(
    () => Object.fromEntries(stableList(stocks, "stocks", lastStocksRef).filter((item) => item?.Tow_Kod).map((item) => [String(item.Tow_Kod), item.Tow_Opis])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stocks]
  );
  const colorByKod = React.useMemo(
    () => Object.fromEntries(stableList(colors, "colors", lastColorsRef).filter((item) => item?.Kol_Kod).map((item) => [String(item.Kol_Kod), item.Kol_Opis])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors]
  );
  const sizeByKod = React.useMemo(
    () => Object.fromEntries(stableList(sizes, "sizes", lastSizesRef).filter((item) => item?.Roz_Kod).map((item) => [String(item.Roz_Kod), item.Roz_Opis])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sizes]
  );

  // Kolejność rozmiarów: literowe od najmniejszego (XXS, XS, S, M, L, XL, 2XL…8XL),
  // potem liczbowe rosnąco (34, 36… dla dorosłych, 92, 104… dla dzieci)
  const LETTER_SIZE_ORDER = ["XXXS", "3XS", "XXS", "2XS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL", "9XL"];
  const sizeRank = (name) => {
    const text = String(name || "").trim().toUpperCase();
    const letterIndex = LETTER_SIZE_ORDER.indexOf(text);
    if (letterIndex !== -1) return [0, letterIndex];
    const number = parseFloat(text.replace(",", "."));
    if (Number.isFinite(number)) return [1, number];
    return [2, 0];
  };
  const compareSizes = (a, b) => {
    const [groupA, valueA] = sizeRank(a);
    const [groupB, valueB] = sizeRank(b);
    if (groupA !== groupB) return groupA - groupB;
    if (valueA !== valueB) return valueA - valueB;
    return comparePl(a, b);
  };

  const FILTER_CATEGORIES = ["Kurtki kożuchy futra", "Torebki", "Portfele", "Pozostały asortyment"];
  const ITEM_FILTER_TITLES = {
    "Kurtki kożuchy futra": "Modele",
    "Torebki": "Torebki",
    "Portfele": "Portfele",
    "Pozostały asortyment": "Rodzaje",
  };
  const goodsByCode = React.useMemo(
    () => Object.fromEntries(goodsList.filter((good) => good?.code).map((good) => [String(good.code), good])),
    [goodsList]
  );
  // Kurtki: Tow_Kod + Kol_Kod (5 pierwszych cyfr) -> karta produktu (zapas, gdy słowniki są puste)
  const jacketGoodsByPrefix = React.useMemo(
    () => Object.fromEntries(
      goodsList
        .filter((good) => good?.category === "Kurtki kożuchy futra" && good?.code)
        .map((good) => [String(good.code).slice(0, 5), good])
    ),
    [goodsList]
  );

  // Element filtra w kategorii dla karty produktu: model kurtki, kod torebki/portfela, rodzaj pozostałego asortymentu
  const filterItemOfGood = (good) => {
    if (!good) return "";
    if (good.category === "Kurtki kożuchy futra") return good.stock?.Tow_Opis || stockByKod[String(good.code || "").slice(0, 3)] || "";
    if (good.category === "Torebki" || good.category === "Portfele") return good.bagProduct || "";
    if (good.category === "Pozostały asortyment") {
      // lista produktów zwraca podkategorię jako { _id: "belts", Rem_Kat_1_Opis_1: "Paski" } albo sam klucz
      const typeKey = good.subcategory?._id || good.subcategory || good.bagsCategoryId;
      return getRemainingProductTypeByKey(typeKey)?.plural || good.subcategory?.Rem_Kat_1_Opis_1 || "";
    }
    return "";
  };

  // { category, item, color, size } dla kodu kreskowego sztuki

  const describeBarcode = (barcode) => {
    const code = String(barcode || "").trim();
    if (!/^\d{13}$/.test(code)) return { category: "", item: "", color: "", size: "" };
    const color = colorByKod[code.slice(3, 5)] || "";
    if (code.slice(0, 3) !== "000") {
      const sizeName = sizeByKod[code.slice(5, 8)] || "";
      const jacketGood = jacketGoodsByPrefix[code.slice(0, 5)];
      return {
        category: "Kurtki kożuchy futra",
        item: stockByKod[code.slice(0, 3)] || jacketGood?.stock?.Tow_Opis || "",
        color: color || jacketGood?.color?.Kol_Opis || "",
        size: /NIEOKRE/i.test(sizeName) ? "" : sizeName,
      };
    }
    const category = code[5] !== "0" ? "Torebki" : (code[6] !== "0" ? "Portfele" : "Pozostały asortyment");
    const good = goodsByCode[code];
    return {
      category,
      item: filterItemOfGood(good),
      model: category === "Pozostały asortyment" ? (good?.bagProduct || "") : "",
      color,
      size: "",
    };
  };

  const hasActiveFilters = Boolean(advancedFilters.category || advancedFilters.colors.length > 0 || advancedFilters.sizes.length > 0);
  const activeFilterLabels = [
    advancedFilters.category,
    advancedFilters.items.length > 0 ? advancedFilters.items.join(", ") : "",
    advancedFilters.models.length > 0 ? advancedFilters.models.join(", ") : "",
    advancedFilters.colors.length > 0 ? advancedFilters.colors.join(", ") : "",
    advancedFilters.sizes.length > 0 ? advancedFilters.sizes.join(", ") : "",
  ].filter(Boolean);

  // Czy sztuka o danym kodzie pasuje do aktywnych filtrów (porównanie dokładne)
  const matchesFilters = (barcode) => {
    if (!hasActiveFilters) return true;
    const info = describeBarcode(barcode);
    if (advancedFilters.category && info.category !== advancedFilters.category) return false;
    if (advancedFilters.items.length > 0 && !advancedFilters.items.includes(info.item)) return false;
    if (advancedFilters.models.length > 0 && !advancedFilters.models.includes(info.model)) return false;
    if (advancedFilters.colors.length > 0 && !advancedFilters.colors.includes(info.color)) return false;
    if (advancedFilters.sizes.length > 0 && !advancedFilters.sizes.includes(info.size)) return false;
    return true;
  };

  // Słowniki i karty produktów ładujemy od razu po wejściu na zakładkę
  useEffect(() => {
    if (toList(stocks, "stocks").length === 0 && fetchStock) fetchStock();
    if (toList(colors, "colors").length === 0 && fetchColors) fetchColors();
    if (toList(sizes, "sizes").length === 0 && fetchSizes) fetchSizes();
    const loadGoods = async () => {
      try {
        const response = await tokenService.authenticatedFetch(getApiUrl("/excel/goods/get-all-goods"));
        if (response.ok) {
          const data = await response.json();
          setGoodsList(data?.goods || []);
        }
      } catch (error) {
        // bez kart produktów - modele kurtek nadal z tabeli asortymentu
      }
    };
    loadGoods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opcje w wybranej kategorii: WSZYSTKIE możliwe z kart produktów (nie tylko to, co jest na stanie)
  const categoryItemOptions = React.useMemo(() => {
    const category = advancedFilters.category;
    if (!category) return [];
    if (category === "Pozostały asortyment") return REMAINING_CATEGORY_LABELS;
    const items = new Set(goodsList.filter((good) => good.category === category).map(filterItemOfGood).filter(Boolean));
    return [...items].sort(comparePl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancedFilters.category, goodsList, stockByKod]);

  // Pozostały asortyment: konkretne modele (kody z metek, np. APS 056) w wybranych rodzajach
  const remainingModelOptions = React.useMemo(() => {
    if (advancedFilters.category !== "Pozostały asortyment") return [];
    const models = new Set(
      goodsList
        .filter((good) => good.category === "Pozostały asortyment")
        .filter((good) => advancedFilters.items.length === 0 || advancedFilters.items.includes(filterItemOfGood(good)))
        .map((good) => good.bagProduct)
        .filter(Boolean)
    );
    return [...models].sort(comparePl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancedFilters.category, advancedFilters.items, goodsList]);

  // Kolory: tylko kolory, w jakich istnieją karty produktów pasujące do WSZYSTKICH wybranych poziomów
  // (kategoria -> modele/rodzaje -> modele pozostałego asortymentu). Rozmiary ze słownika rozmiarów.
  useEffect(() => {
    const relevantGoods = goodsList.filter((good) => {
      if (advancedFilters.category && good.category !== advancedFilters.category) return false;
      if (advancedFilters.items.length > 0 && !advancedFilters.items.includes(filterItemOfGood(good))) return false;
      if (advancedFilters.models.length > 0 && !advancedFilters.models.includes(good.bagProduct)) return false;
      return true;
    });
    const colorNames = [...new Set(
      relevantGoods.map((good) => good.color?.Kol_Opis || colorByKod[String(good.code || "").slice(3, 5)] || "").filter(Boolean)
    )].sort(comparePl);
    setAvailableColors(colorNames);
    // wybrany kolor, którego nie ma w zawężonej liście, przestaje obowiązywać
    if (advancedFilters.colors.some((color) => !colorNames.includes(color))) {
      setAdvancedFilters((prev) => ({ ...prev, colors: prev.colors.filter((color) => colorNames.includes(color)) }));
    }
    setAvailableSizes(
      [...new Set(
        toList(sizes, "sizes")
          .map((size) => size.Roz_Opis)
          .filter((name) => name && !/NIEOKRE/i.test(name))
      )].sort(compareSizes)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goodsList, advancedFilters.category, advancedFilters.items, advancedFilters.models, colorByKod, sizes, stockByKod]);

  // Filter remanent data based on advanced filters
  useEffect(() => {
    if (!remanentData || remanentData.length === 0) {
      setFilteredRemanentData([]);
      return;
    }

    let filtered = remanentData;

    // Filtry po kodzie kreskowym (asortyment, kolor, rozmiar ze słowników)
    filtered = filtered.filter(item => matchesFilters(item.code));

    setFilteredRemanentData(filtered);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remanentData, advancedFilters, stockByKod, colorByKod, sizeByKod, goodsByCode]);

  // Wyszukiwarka zeskanowanych sztuk: nazwa, rozmiar, kolor, model i kod; kilka słów = wszystkie muszą pasować;
  // bez polskich znaków i wielkości liter („czarny 44”, „amanda”, „0040408”). Tylko do znalezienia pozycji na liście -
  // postęp i porównanie ze stanem liczą się z całej przefiltrowanej listy, nie z wyniku szukania.
  // Wspólna wyszukiwarka (utils/searchText): całe słowo wygrywa z początkiem słowa („Dominik” nie pokazuje „Dominika”)
  const searchWords = toSearchWords(scanSearch);
  const visibleRemanentData = React.useMemo(() => {
    if (searchWords.length === 0) return filteredRemanentData;
    return filterBySearch(filteredRemanentData, (item) => {
      const info = describeBarcode(item.code);
      return [item.name, item.code, info.item, info.model, info.color, info.size];
    }, searchWords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRemanentData, scanSearch, stockByKod, colorByKod, sizeByKod, goodsByCode]);

  // Postęp liczony lokalnie ze stanu punktu i skanów (bez zapytań do serwera przy każdej zmianie)
  useEffect(() => {
    const expectedByBarcode = {};
    pointState.filter((item) => matchesFilters(item.barcode)).forEach((item) => {
      expectedByBarcode[item.barcode] = (expectedByBarcode[item.barcode] || 0) + 1;
    });
    const scannedByBarcode = {};
    filteredRemanentData.forEach((item) => {
      scannedByBarcode[item.code] = (scannedByBarcode[item.code] || 0) + 1;
    });
    let fullyScannedCount = 0;
    Object.keys(expectedByBarcode).forEach((barcode) => {
      fullyScannedCount += Math.min(expectedByBarcode[barcode], scannedByBarcode[barcode] || 0);
    });
    const totalExpected = Object.values(expectedByBarcode).reduce((sum, count) => sum + count, 0);
    setScanProgress({
      totalExpected,
      totalScanned: filteredRemanentData.length,
      uniqueScanned: fullyScannedCount,
      percentage: totalExpected > 0 ? Math.round((fullyScannedCount / totalExpected) * 100) : 0
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointState, filteredRemanentData, advancedFilters]);

  // Czas liczony od rozpoczęcia remanentu (sesji punktu)
  useEffect(() => {
    setScanStartTime(session?.startedAt ? new Date(session.startedAt) : null);
  }, [session?.startedAt]);

  // Czas trwania remanentu odświeżany co 30 s (dawniej cały ekran przerysowywał się co sekundę)
  const [, setElapsedTick] = useState(0);
  useEffect(() => {
    if (!scanStartTime) return undefined;
    const interval = setInterval(() => setElapsedTick((tick) => tick + 1), 30000);
    return () => clearInterval(interval);
  }, [scanStartTime]);

  const formatElapsedTime = () => {
    if (!scanStartTime) return '-';
    const minutes = Math.max(0, Math.floor((Date.now() - scanStartTime.getTime()) / 60000));
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
  };

  // Fetch remanent data
  // Stan TYLKO tego punktu (dawniej: cały stan wszystkich punktów przy każdej zmianie listy)
  const fetchPointState = async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/remanent/current-state'));
      if (!response.ok) return null;
      const data = await response.json();
      const list = Array.isArray(data?.data) ? data.data : [];
      setPointState(list);
      return list;
    } catch (error) {
      return null;
    }
  };

  // Skan z sesji -> pozycja listy (ten sam kształt co dawniej, żeby reszta ekranu działała bez zmian)
  const toRemanentItem = (item, sessionId) => ({
    id: item._id,
    remanentId: sessionId,
    name: item.name,
    code: item.code,
    quantity: 1,
    manual: Boolean(item.manual),
    value: item.value || 0,
    location: user?.symbol,
    scannedAt: item.scannedAt,
    timestamp: item.scannedAt,
    device: item.device || '' // nazwa telefonu (remanent we dwie osoby na jednym koncie)
  });

  // Wczytuje OTWARTĄ sesję remanentu punktu (bez limitu skanów, wspólną dla wszystkich telefonów punktu)
  // silent: odświeżenie w tle (np. po odmowie zapisu) bez pełnoekranowego spinnera - spinner zastępował cały ekran
  // razem ze skanerem, a skaner przy ponownym zamontowaniu tracił niezatwierdzone skany (audyt 26.10.2026)
  const fetchRemanentData = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      fetchPointState();
      const response = await tokenService.authenticatedFetch(getApiUrl('/remanent/session/current'));
      if (response.ok) {
        const data = await response.json();
        const current = data?.session || null;
        setSession(current);
        setRemanentData(current ? (current.items || []).map((item) => toRemanentItem(item, current._id)) : []);
      }
    } catch (error) {
      // wylogowanie w trakcie pobierania to nie błąd (ekran i tak się zamyka)
      if (!String(error?.message || '').includes('logout in progress')) {
        Logger.error('Error fetching remanent session:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  // „Rozpocznij remanent”: nowa sesja punktu (albo dołączenie do już otwartej)
  const startSession = async () => {
    setSessionBusy(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/remanent/session/start'), { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.session) {
        setClearResult({ ok: false, text: data?.message || 'Nie udało się rozpocząć remanentu. Sprawdź połączenie.' });
        return null;
      }
      setSession(data.session);
      setRemanentData((data.session.items || []).map((item) => toRemanentItem(item, data.session._id)));
      if (data.alreadyOpen) {
        setClearResult({ ok: true, text: 'Remanent tego punktu jest już rozpoczęty - dołączono do niego.' });
      }
      return data.session;
    } catch (error) {
      setClearResult({ ok: false, text: 'Nie udało się rozpocząć remanentu. Sprawdź połączenie.' });
      return null;
    } finally {
      setSessionBusy(false);
    }
  };

  // „Zakończ remanent”: zapis wyniku porównania (z aktywnymi filtrami) i zamknięcie sesji
  const finishSession = async () => {
    setConfirmFinishOpen(false);
    if (!session) return;
    setSessionBusy(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl(`/remanent/session/${session._id}/close`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // wynik liczy serwer; telefon podaje tylko kody z filtrów (z podglądu „Sprawdź”)
        body: JSON.stringify({ filterCodes: comparisonCodesRef.current, filters: activeFilterLabels })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setClearResult({ ok: false, text: data?.message || 'Nie udało się zakończyć remanentu.' });
        return;
      }
      setComparisonModalVisible(false);
      setSession(null);
      setRemanentData([]);
      const result = data?.session?.result || {};
      setClearResult({
        ok: true,
        text: `Remanent zakończony i zapisany.\nBraki: ${result.missingCount ?? (result.missingItems || []).reduce((sum, item) => sum + (item.missingCount || item.expectedCount || 0), 0)} szt., nadwyżki: ${result.excessCount ?? (result.extraItems || []).reduce((sum, item) => sum + (item.excessCount || item.actualCount || 0), 0)} szt.`
      });
    } catch (error) {
      setClearResult({ ok: false, text: 'Nie udało się zakończyć remanentu. Sprawdź połączenie.' });
    } finally {
      setSessionBusy(false);
    }
  };

  // Refresh handler
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRemanentData();
    setRefreshing(false);
  };

  // Remanent we dwie osoby (27.10.2026): serwer zgłasza każdą zmianę skanów sesji punktu - lista i postęp
  // odświeżają się w tle na obu telefonach (bez pociągania listy w dół); także rozpoczęcie / zakończenie remanentu
  useLiveRefresh(['remanent'], () => fetchRemanentData({ silent: true }));

  // Skaner
  const openQRScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setClearResult({ ok: false, text: 'Brak dostępu do kamery. Włącz go w ustawieniach telefonu dla tej aplikacji.' });
        return;
      }
    }

    setScannerVisible(true);
  };

  // Decyzja remanentu dla kodu ze skanera (skan, „Wpisz kod”, „Z bazy”): obcy kod i kod spoza filtrów są odrzucane
  const validateRemanentCode = (data, { name: jacketName }) => {
    // Obcy kod (opakowanie, kod QR, metka spoza naszej bazy) nie jest sztuką remanentu:
    // odrzucamy go z komunikatem zamiast dopisywać jako „nadwyżkę”
    if (!isKnownProductCode(data, jacketName)) {
      return { ok: false, tone: 'warn', message: `Nieznany kod: ${data}\nTo nie jest metka z bazy produktów - pominięto.` };
    }

    // Czy sztuka pasuje do aktywnych filtrów
    if (!matchesFilters(data)) {
      const activeFilters = [];
      const info = describeBarcode(data);
      if (advancedFilters.category && info.category !== advancedFilters.category) activeFilters.push(`Kategoria: ${advancedFilters.category} (zeskanowano: ${info.category || "nieznana"})`);
      if (advancedFilters.models.length > 0 && !advancedFilters.models.includes(info.model)) activeFilters.push(`Modele: ${advancedFilters.models.join(", ")} (zeskanowano: ${info.model || "nieznany"})`);
      if (advancedFilters.items.length > 0 && !advancedFilters.items.includes(info.item)) activeFilters.push(`${ITEM_FILTER_TITLES[advancedFilters.category] || "Wybór"}: ${advancedFilters.items.join(", ")} (zeskanowano: ${info.item || "nieznany"})`);
      if (advancedFilters.colors.length > 0 && !advancedFilters.colors.includes(info.color)) activeFilters.push(`Kolor: ${advancedFilters.colors.join(", ")} (zeskanowano: ${info.color || "nieznany"})`);
      if (advancedFilters.sizes.length > 0 && !advancedFilters.sizes.includes(info.size)) activeFilters.push(`Rozmiar: ${advancedFilters.sizes.join(", ")} (zeskanowano: ${info.size || "brak"})`);
      // Komunikat nad kamerą (bez blokującego okienka): co zeskanowano i czego nie spełnia
      return { ok: false, tone: 'warn', message: `Nie pasuje do filtrów: ${jacketName || data}\n${activeFilters.join("\n")}` };
    }

    return { ok: true }; // domyślny komunikat skanera „Dodano: …”
  };

  // Rozmiary do „Z bazy” (kurtka wymaga wyboru rozmiaru)
  const pickerSizes = React.useMemo(
    () => stableList(sizes, "sizes", lastSizesRef)
      .filter((size) => size?.Roz_Kod && size?.Roz_Opis && !/NIEOKRE/i.test(size.Roz_Opis))
      .sort((a, b) => compareSizes(a.Roz_Opis, b.Roz_Opis)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sizes]
  );

  const pad2 = (value) => String(value).padStart(2, '0');
  // „DD.MM HH:MM” w czasie telefonu
  const formatDayClock = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '?';
    return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  };
  // Odpowiedź 409 z serwera: { message, closed?: { closedAt, closedBy } } gdy remanent został zakończony
  const closedElsewhereText = (data) => {
    const closed = data?.closed;
    if (closed && (closed.closedAt || closed.closedBy)) {
      const who = closed.closedBy || 'inny telefon';
      const when = closed.closedAt ? ` o ${formatDayClock(closed.closedAt)}` : '';
      return `Remanent został zakończony przez ${who}${when}. Niezatwierdzone skany zostają w skanerze - rozpocznij nowy remanent, żeby je zapisać, albo odrzuć je.`;
    }
    return data?.message || 'Remanent nie jest otwarty. Odśwież ekran.';
  };

  // „Zatwierdź (N)” w skanerze: zapis skanów do sesji punktu. true = zapisane (lista skanera się czyści),
  // false = skany zostają w skanerze i można zatwierdzić ponownie
  const confirmScannedJackets = async (scannedJackets, { showToast: showScanToast, batchId }) => {
    try {
      // Autora (scannedBy) i punkt ustawia serwer z tokenu; ceny w remanencie nie są używane
      const remanentItemsForAPI = scannedJackets.map(jacket => ({
        name: jacket.name,
        code: jacket.code,
        quantity: 1,
        manual: Boolean(jacket.manual),
        scannedAt: new Date().toISOString()
      }));

      // Zapis do sesji punktu. Bez otwartej sesji NIE zakładamy nowej po cichu (R8, audyt 26.10.2026): gdy drugi telefon
      // zakończył remanent, „Zatwierdź” dopisywałoby skany do nowego, pustego remanentu
      const activeSession = session;
      if (!activeSession) {
        showScanToast('Remanent nie jest rozpoczęty - kliknij „Rozpocznij remanent”, skany zostają w skanerze.', 'warn');
        return false;
      }
      const response = await tokenService.authenticatedFetch(getApiUrl(`/remanent/session/${activeSession._id}/items`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // batchId: ten sam klucz przy ponownej próbie tego samego zestawu - serwer nie dopisze skanów drugi raz
        body: JSON.stringify({ items: remanentItemsForAPI, batchId: batchId || undefined })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Skany NIE giną: zostają na liście skanera, można zatwierdzić ponownie
        if (response.status === 409) {
          // Remanent zamknięty (np. na innym telefonie): kto i kiedy - w skanerze i w oknie (R8, audyt 26.10.2026)
          const text = closedElsewhereText(data);
          showScanToast(text, 'warn');
          setClearResult({ ok: false, text });
          fetchRemanentData({ silent: true });
          return false;
        }
        showScanToast(data?.message || 'Nie zapisano skanów - sprawdź połączenie i zatwierdź ponownie.', 'warn');
        return false;
      }
      if (data?.duplicate) {
        // Poprzednia próba doszła do serwera, tylko odpowiedź nie wróciła - lista z serwera, bez podwójnego liczenia
        showScanToast('Te skany były już zapisane.', 'warn');
        fetchRemanentData({ silent: true });
        return true;
      }
      setRemanentData(prev => [...prev, ...(data.added || []).map((item) => toRemanentItem(item, activeSession._id))]);
      showScanToast(`Zapisano ${remanentItemsForAPI.length} szt.`);
      return true;
    } catch (error) {
      Logger.error('Error saving scanned jackets:', error);
      showScanToast('Nie zapisano skanów - sprawdź połączenie i zatwierdź ponownie.', 'warn');
      return false;
    }
  };


  // Wyczyść wszystko: usuwa WSZYSTKIE skany bieżącego remanentu punktu na serwerze - także te zrobione na innych
  // telefonach punktu (R9, audyt 26.10.2026: dawniej okno mówiło tylko o liczbie z tego telefonu). Przed oknem
  // odświeżamy listę w tle, żeby liczba w pytaniu była aktualna.
  const openClearDialog = () => {
    fetchRemanentData({ silent: true });
    setConfirmClearOpen(true);
  };
  const clearAllRemanent = async () => {
    setConfirmClearOpen(false);
    if (!session) return;
    setClearingAll(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl(`/remanent/session/${session._id}/items`), { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setClearResult({ ok: false, text: data?.message || 'Nie udało się wyczyścić remanentu.' });
        return;
      }
      setRemanentData([]);
      const removed = Number.isFinite(Number(data?.removed)) ? Number(data.removed) : null;
      setClearResult({ ok: true, text: removed === null
        ? 'Skany tego remanentu (ze wszystkich telefonów punktu) zostały wyczyszczone. Możesz liczyć od nowa.'
        : `Usunięto ${removed} skanów (ze wszystkich telefonów punktu). Możesz liczyć od nowa.` });
    } catch (error) {
      setClearResult({ ok: false, text: 'Nie udało się wyczyścić remanentu. Sprawdź połączenie i spróbuj ponownie.' });
    } finally {
      setClearingAll(false);
    }
  };

  const removeRemanentItem = async (itemId) => {
    if (!session) return;
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl(`/remanent/session/${session._id}/items/${itemId}`), { method: 'DELETE' });
      if (response.ok) {
        setRemanentData(prev => prev.filter(item => item.id !== itemId));
      } else {
        const data = await response.json().catch(() => ({}));
        setClearResult({ ok: false, text: data?.message || 'Nie udało się usunąć skanu.' });
      }
    } catch (error) {
      setClearResult({ ok: false, text: 'Nie udało się usunąć skanu. Sprawdź połączenie.' });
    }
  };

  // Liczby braków/nadwyżek z zapisanego wyniku (wynik z telefonu może nie mieć missingCount przy braku całkowitym)
  const missingOf = (item) => Number(item.missingCount ?? (Number(item.expectedCount || 0) - Number(item.actualCount || 0)));
  const excessOf = (item) => Number(item.excessCount ?? (Number(item.actualCount || 0) - Number(item.expectedCount || 0)));
  const countsOf = (result) => ({
    missing: result ? (result.missingCount ?? (result.missingItems || []).reduce((sum, item) => sum + missingOf(item), 0)) : 0,
    excess: result ? (result.excessCount ?? (result.extraItems || []).reduce((sum, item) => sum + excessOf(item), 0)) : 0,
  });
  const productsLabel = (count) => (count === 1 ? 'produkt' : (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? 'produkty' : 'produktów'));
  const piecesSummary = (pieces, products) => `${pieces} szt. (${products} ${productsLabel(products)})`;
  const formatHistoryDate = (value) => (value ? new Date(value).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');

  const openHistory = async () => {
    setHistoryVisible(true);
    setHistoryDetail(null);
    setHistoryLoading(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/remanent/sessions?status=closed&limit=50'));
      const data = await response.json().catch(() => ({}));
      setHistoryList(response.ok ? (data.sessions || []) : []);
      if (!response.ok) setClearResult({ ok: false, text: data?.message || 'Nie udało się pobrać historii remanentów.' });
    } catch (error) {
      setHistoryList([]);
      setClearResult({ ok: false, text: 'Nie udało się pobrać historii remanentów. Sprawdź połączenie.' });
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistoryDetail = async (summary) => {
    setHistoryDetail({ session: summary, loading: true });
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl(`/remanent/session/${summary._id}`));
      const data = await response.json().catch(() => ({}));
      setHistoryDetail({ session: response.ok && data.session ? data.session : summary, loading: false });
    } catch (error) {
      setHistoryDetail({ session: summary, loading: false });
    }
  };

  // Zamknięcie skanera (X / wstecz) - o niezatwierdzone skany pyta sam skaner
  const closeScanner = () => {
    setScannerVisible(false);
  };

  const checkCurrentState = async () => {
    try {
      performStateCheck();
    } catch (error) {
      Logger.error('❌ Error in checkCurrentState:', error);
      setClearResult({ ok: false, text: 'Nie udało się sprawdzić stanu. Spróbuj ponownie.' });
    }
  };

  // „Sprawdź”: wynik liczy SERWER (skany ze wszystkich telefonów punktu, stan fizyczny: bez sprzedanych / przepisanych
  // a nieprzetworzonych, z przychodzącymi i zwrotami od klienta). Telefon wybiera tylko kody pasujące do filtrów
  // (serwer nie zna słowników filtrów) - audyt Remanentu 26.10.2026, dawniej liczone z lokalnej listy tego telefonu.
  const comparisonCodesRef = useRef(null); // kody z filtrów użyte w podglądzie - te same idą do zakończenia
  const fetchServerResult = async (filterCodes) => {
    if (!session) return null;
    const response = await tokenService.authenticatedFetch(getApiUrl(`/remanent/session/${session._id}/preview`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filterCodes ? { filterCodes } : {})
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    return data?.result || null;
  };
  const performStateCheck = async () => {
    try {
      fetchPointState(); // odświeżenie postępu w tle
      let result = await fetchServerResult(null);
      if (!result) {
        setClearResult({ ok: false, text: 'Nie udało się pobrać wyniku z serwera. Sprawdź połączenie i spróbuj ponownie.' });
        return;
      }
      let codes = null;
      if (hasActiveFilters) {
        // Te same filtry co na liście (po kodzie kreskowym: asortyment, kolor, rozmiar) - zbiór kodów z pełnego wyniku
        const allCodes = [...(result.expectedItems || []), ...(result.scannedItems || [])].map((item) => String(item.code));
        codes = [...new Set(allCodes)].filter((code) => matchesFilters(code));
        result = (await fetchServerResult(codes.length > 0 ? codes : ['-'])) || { ...result, scope: 'filtered', currentStateCount: 0, remanentCount: 0, manualCount: 0, missingCount: 0, excessCount: 0, missingItems: [], extraItems: [] };
      }
      comparisonCodesRef.current = codes;
      Logger.debug('🔍 Porównanie (serwer):', { currentStateCount: result.currentStateCount, remanentCount: result.remanentCount, adjustments: result.adjustments });
      setComparisonResults(result);
      setComparisonModalVisible(true);
    } catch (error) {
      Logger.error('❌ Error checking current state:', error);
      setClearResult({ ok: false, text: 'Nie udało się sprawdzić stanu. Sprawdź połączenie i spróbuj ponownie.' });
    }
  };

  // Opis uwzględnionych nieprzetworzonych operacji (pod tytułem wyniku)
  const adjustmentsNote = (result) => {
    const adj = result?.adjustments;
    if (!adj) return null;
    const parts = [];
    if (adj.unprocessedSales > 0) parts.push(`sprzedane ${adj.unprocessedSales} szt.`);
    if (adj.unprocessedOutgoing > 0) parts.push(`przepisane dalej ${adj.unprocessedOutgoing} szt.`);
    if (adj.unprocessedIncoming > 0) parts.push(`przychodzące ${adj.unprocessedIncoming} szt.`);
    if (adj.exchangeReturns > 0) parts.push(`zwroty od klienta ${adj.exchangeReturns} szt.`);
    if (parts.length === 0) return null;
    return `Uwzględniono nieprzetworzone: ${parts.join(', ')}. Liczymy tak, jak kurtki leżą w punkcie.`;
  };


  useEffect(() => {
    fetchRemanentData();
    
    // Ensure lookup data is loaded
    const loadLookupData = async () => {
      try {
        if (fetchSizes && (!sizes || sizes.length === 0)) {
          await fetchSizes();
        }
        if (fetchColors && (!colors || colors.length === 0)) {
          await fetchColors();
        }
        if (fetchStock && (!stocks || stocks.length === 0)) {
          await fetchStock();
        }
      } catch (error) {
        Logger.debug('Error loading lookup data:', error);
      }
    };
    
    loadLookupData();
  }, [user?.symbol]); // Dodano user?.symbol jako dependency

  // Nazwa produktu po kodzie z metki - WYŁĄCZNIE z bazy głównej (karty produktów i słowniki),
  // bez list testowych. Kod, którego nie ma w bazie, jest pokazany jako „Nieznany kod …”.
  const getProductNameFromBarcode = (barcodeData) => productNameFromBarcode(barcodeData, {
    sizeByKod, stockByKod, colorByKod, goodsByCode, jacketGoodsByPrefix, stateData,
  });

  // Zachowana nazwa dla istniejących wywołań
  const getJacketNameFromBarcode = async (barcodeData) => getProductNameFromBarcode(barcodeData);

  // Czy kod to metka z naszej bazy (karta produktu albo sztuka na stanie)?
  // Gdy karty produktów jeszcze się nie wczytały, nie blokujemy - nie da się tego sprawdzić.
  const isKnownProductCode = (code, resolvedName) => {
    if (!/^\d{13}$/.test(String(code || "").trim())) return false; // nasze metki to zawsze EAN-13
    if (goodsList.length === 0 && Object.keys(stockByKod).length === 0) return true;
    return !String(resolvedName || "").startsWith("Nieznany kod");
  };

  // Render individual remanent item
  // Wiek otwartego remanentu - powyżej 20 h pokazujemy ostrzeżenie (remanent liczy się jednego dnia)
  const OLD_SESSION_MS = 20 * 60 * 60 * 1000;
  const sessionAgeMs = session?.startedAt ? Math.max(0, Date.now() - new Date(session.startedAt).getTime()) : 0;
  const sessionAgeHours = Math.floor(sessionAgeMs / (60 * 60 * 1000));
  const sessionAgeLabel = sessionAgeHours >= 48 ? `${Math.floor(sessionAgeHours / 24)} dni` : `${sessionAgeHours} godz.`;

  // Lista: jeden wiersz na kod z licznikiem ×N (audyt 26.10.2026 - dawniej 1 wiersz = 1 sztuka, 500 sztuk = 500 wierszy).
  // Postęp, wyszukiwarka („Znaleziono N z M szt.”) i porównanie liczą się nadal po sztukach (visibleRemanentData).
  // X w wierszu usuwa JEDNĄ sztukę - ostatnio zeskanowaną z tego kodu. Grupy od ostatnio skanowanego.
  const groupedRemanentData = React.useMemo(() => {
    const groups = new Map();
    visibleRemanentData.forEach((item) => {
      const code = String(item.code || '');
      const at = new Date(item.scannedAt || 0).getTime() || 0;
      const group = groups.get(code) || { code, name: item.name, count: 0, ids: [], manualCount: 0, latestScannedAt: -1, latestId: item.id, devices: [] };
      group.count += 1;
      group.ids.push(item.id);
      if (item.device && !group.devices.includes(item.device)) group.devices.push(item.device);
      if (item.manual) group.manualCount += 1;
      if (at >= group.latestScannedAt) {
        group.latestScannedAt = at;
        group.latestId = item.id;
        group.name = item.name || group.name;
      }
      groups.set(code, group);
    });
    return [...groups.values()].sort((a, b) => b.latestScannedAt - a.latestScannedAt);
  }, [visibleRemanentData]);
  // Nazwa telefonu przy pozycji tylko wtedy, gdy skanuje więcej niż jeden telefon (jeden telefon = szum)
  const multiDevice = React.useMemo(() => new Set(remanentData.map((item) => item.device).filter(Boolean)).size > 1, [remanentData]);

  const renderRemanentItem = ({ item }) => (
    <View style={styles.remanentItem}>
      <View style={[styles.itemHeader, { marginBottom: 0 }]}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.itemName, { flexShrink: 1 }]}>{item.name || 'Produkt'}</Text>
            {item.count > 1 ? <Text style={styles.countBadge} testID="remanent-row-count">×{item.count}</Text> : null}
          </View>
          {item.manualCount > 0 ? <Text style={styles.manualBadge}>wpisane ręcznie: {item.manualCount}</Text> : null}
          {multiDevice && item.devices.length > 0 ? <Text style={styles.deviceText} testID="remanent-row-device">{item.devices.join(', ')}</Text> : null}
        </View>
        <View style={styles.itemHeaderRight}>
          <Text style={styles.itemCode}>{item.code || 'N/A'}</Text>
          <TouchableOpacity
            onPress={() => removeRemanentItem(item.latestId)}
            style={styles.removeRemanentButton}
            accessibilityLabel="Usuń jedną sztukę"
            testID={`remanent-remove-${item.code}`}
          >
            <Ionicons name="close" size={18} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // Loading state
  if (loading) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={{ backgroundColor: tc('bg', "#000"), flex: 1, paddingBottom: tabBarSpace }}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0d6efd" />
          <Text style={styles.loadingText}>Ładowanie remanentów...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ backgroundColor: tc('bg', "#000"), flex: 1, paddingBottom: tabBarSpace }}>
      <View style={styles.header}>
        <ScreenHeader icon="clipboard" title="Remanent" subtitle="Stan magazynowy" />
        
        {/* Przycisk filtrów na pełnej szerokości */}
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={styles.filterButton}
            onPress={() => setShowFilterModal(true)}
          >
            <Ionicons name="filter" size={18} color="#0D6EFD" />
            <Text style={styles.filterButtonText}>
              Filtry
              {hasActiveFilters && ` (${activeFilterLabels.length})`
              }
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.historyButton} onPress={openHistory}>
            <Ionicons name="time-outline" size={18} color="#8B5CF6" />
            <Text style={styles.filterButtonText}>Historia</Text>
          </TouchableOpacity>
        </View>

        {/* Pasek postępu skanowania */}
        {scanProgress.totalExpected > 0 && (
          <View style={styles.progressContainer}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Postęp skanowania</Text>
                  <Text style={styles.progressStats}>
                    {scanProgress.uniqueScanned}/{scanProgress.totalExpected} ({scanProgress.percentage}%)
                  </Text>
                </View>
                
                <View style={styles.progressBarContainer}>
                  <View 
                    style={[
                      styles.progressBarFill, 
                      { width: `${scanProgress.percentage}%` }
                    ]} 
                  />
                </View>
                
                <View style={styles.progressDetails}>
                  <Text style={styles.progressDetailText}>
                    <Ionicons name="cube-outline" size={12} color={tc('muted', '#94A3B8')} /> Sztuki: {scanProgress.uniqueScanned}/{scanProgress.totalExpected}
                  </Text>
                  <Text style={styles.progressDetailText}>
                    <Ionicons name="scan-outline" size={12} color={tc('muted', '#94A3B8')} /> Skanowania: {scanProgress.totalScanned}
                  </Text>
                  {scanStartTime && (
                    <Text style={styles.progressDetailText}>
                      <Ionicons name="time-outline" size={12} color={tc('muted', '#94A3B8')} /> Czas: {formatElapsedTime()}
                    </Text>
                  )}
                </View>
              </View>
            )}
      </View>

      {/* Pasek sesji remanentu */}
      {session ? (
        <View style={styles.sessionBar}>
          <Ionicons name="time-outline" size={18} color="#60A5FA" />
          <Text style={styles.sessionBarText} numberOfLines={2}>
            Remanent od {new Date(session.startedAt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {remanentData.length} szt.
          </Text>
          <TouchableOpacity style={styles.sessionFinishButton} onPress={checkCurrentState} disabled={sessionBusy}>
            <Ionicons name="flag" size={16} color="white" />
            <Text style={styles.sessionFinishText}>Zakończ</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Stary, wciąż otwarty remanent (audyt 26.10.2026): żeby nie dosypywać skanów do liczenia sprzed dni */}
      {session && sessionAgeMs > OLD_SESSION_MS ? (
        <View style={styles.oldSessionBanner} testID="remanent-old-session">
          <Ionicons name="alert-circle" size={18} color="#F59E0B" />
          <Text style={styles.oldSessionText}>
            Ten remanent trwa od {formatDayClock(session.startedAt)} ({sessionAgeLabel}). Jeśli to stare liczenie, zakończ je albo wyczyść i zacznij od nowa.
          </Text>
        </View>
      ) : null}

      {!session ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="clipboard-outline" size={64} color={tc('muted', "#CDCDE0")} />
          <Text style={styles.emptyText}>Brak rozpoczętego remanentu</Text>
          <Text style={styles.emptySubtext}>
            Rozpocznij remanent, zeskanuj wszystkie sztuki w punkcie, a potem kliknij „Sprawdź” i „Zakończ remanent”.
          </Text>
          <TouchableOpacity style={styles.startSessionButton} onPress={startSession} disabled={sessionBusy}>
            {sessionBusy ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="play" size={20} color="white" />}
            <Text style={styles.startSessionText}>Rozpocznij remanent</Text>
          </TouchableOpacity>
        </View>
      ) : remanentData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="scan-outline" size={64} color="#CDCDE0" />
          <Text style={styles.emptyText}>Remanent rozpoczęty</Text>
          <Text style={styles.emptySubtext}>Kliknij „Skanuj” i zeskanuj sztuki. Każdy skan to jedna sztuka.</Text>
        </View>
      ) : (
        <>
        {/* Wyszukiwarka zeskanowanych sztuk */}
        <View style={styles.scanSearchWrap}>
          <View style={styles.selectSearchBox}>
            <Ionicons name="search" size={16} color={tc('muted', "#94A3B8")} />
            <TextInput
              style={styles.selectSearchInput}
              placeholder="Szukaj zeskanowanych: nazwa, rozmiar, kod"
              placeholderTextColor={tc('muted', "#64748B")}
              value={scanSearch}
              onChangeText={setScanSearch}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              testID="remanent-search-input"
            />
            {scanSearch ? (
              <TouchableOpacity onPress={() => setScanSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID="remanent-search-clear">
                <Ionicons name="close-circle" size={16} color={tc('muted', "#94A3B8")} />
              </TouchableOpacity>
            ) : null}
          </View>
          {searchWords.length > 0 && (
            <Text style={styles.scanSearchCount} testID="remanent-search-count">
              Znaleziono {visibleRemanentData.length} z {filteredRemanentData.length} szt.
            </Text>
          )}
        </View>
        <FlatList alwaysBounceVertical
          data={groupedRemanentData}
          renderItem={renderRemanentItem}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={searchWords.length > 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color="#CDCDE0" />
              <Text style={styles.emptyText}>Nic nie znaleziono</Text>
              <Text style={styles.emptySubtext}>Żadna zeskanowana sztuka nie pasuje do „{scanSearch.trim()}”.</Text>
            </View>
          ) : null}
          contentContainerStyle={[styles.listContainer, { paddingBottom: 16 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#0d6efd']}
              tintColor="#0d6efd"
            />
          }
          showsVerticalScrollIndicator={false}
        />
        </>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.addButton, !session && { opacity: 0.5 }]}
          onPress={openQRScanner}
          disabled={!session}
        >
          <Ionicons name="qr-code" size={20} color="white" />
          <Text style={styles.addButtonText}>Skanuj</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.checkButton, !session && { opacity: 0.5 }]} onPress={checkCurrentState} disabled={!session}>
          <Ionicons name="checkmark-circle" size={20} color="white" />
          <Text style={styles.checkButtonText}>Sprawdź</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.clearAllButton, (clearingAll || remanentData.length === 0) && { opacity: 0.5 }]}
          onPress={openClearDialog}
          disabled={clearingAll || remanentData.length === 0}
        >
          {clearingAll ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="trash" size={20} color="white" />}
          <Text style={styles.checkButtonText}>Wyczyść</Text>
        </TouchableOpacity>
      </View>

      {/* Potwierdzenie „Wyczyść wszystko” (w stylu aplikacji) */}
      <Modal visible={confirmClearOpen} transparent animationType="fade" onRequestClose={() => setConfirmClearOpen(false)}>
        <View style={styles.filterOverlay}>
          <View style={styles.filterCard}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="warning" size={56} color="#F59E0B" />
            </View>
            <Text style={[styles.filterCardTitle, { textAlign: 'center', marginBottom: 8 }]}>Wyczyścić cały remanent?</Text>
            <Text style={{ color: tc('muted', '#CBD5E1'), fontSize: 15, textAlign: 'center', marginBottom: 8 }}>
              Zostaną usunięte wszystkie skany bieżącego remanentu ze wszystkich telefonów punktu ({remanentData.length} szt. wg ostatniego odświeżenia). Remanent pozostaje rozpoczęty. Tej operacji nie da się cofnąć.
            </Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={[styles.dialogStackButton, { backgroundColor: '#DC2626' }]} onPress={clearAllRemanent}>
                <Ionicons name="trash" size={18} color="white" />
                <Text style={styles.filterCardButtonText}>Tak, wyczyść wszystko</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogStackButton, styles.filterCardButtonSecondary]} onPress={() => setConfirmClearOpen(false)}>
                <Text style={styles.filterCardButtonText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Wynik czyszczenia */}
      <Modal visible={Boolean(clearResult)} transparent animationType="fade" onRequestClose={() => setClearResult(null)}>
        <View style={styles.filterOverlay}>
          <View style={styles.filterCard}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name={clearResult?.ok ? 'checkmark-circle' : 'close-circle'} size={56} color={clearResult?.ok ? '#10B981' : '#EF4444'} />
            </View>
            <Text style={[styles.filterCardTitle, { textAlign: 'center', marginBottom: 8 }]}>{clearResult?.ok ? 'Gotowe' : 'Błąd'}</Text>
            <Text style={{ color: tc('muted', '#CBD5E1'), fontSize: 15, textAlign: 'center', marginBottom: 16 }}>{clearResult?.text}</Text>
            <TouchableOpacity style={[styles.dialogStackButton, styles.filterCardButtonPrimary]} onPress={() => setClearResult(null)}>
              <Text style={styles.filterCardButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Skaner (wspólny z zakładką „Sprawdź” w panelu admina) */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={closeScanner}
        title="Skanuj kody kurtek"
        permission={permission}
        requestPermission={requestPermission}
        resolveName={getJacketNameFromBarcode}
        previewName={getProductNameFromBarcode}
        validateCode={validateRemanentCode}
        countSaved={(code) => remanentData.filter((item) => item.code === code).length}
        onConfirm={confirmScannedJackets}
        goods={goodsList}
        pickerSizes={pickerSizes}
        draftKey={user?.symbol ? `remanent-${user.symbol}` : null}
      />

      {/* Historia zakończonych remanentów punktu */}
      <Modal
        visible={historyVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => (historyDetail ? setHistoryDetail(null) : setHistoryVisible(false))}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.comparisonHeader}>
            <TouchableOpacity
              onPress={() => (historyDetail ? setHistoryDetail(null) : setHistoryVisible(false))}
              style={styles.comparisonBackButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={24} color={tc('text', "white")} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.comparisonTitle} numberOfLines={1}>
                {historyDetail ? `Remanent ${formatHistoryDate(historyDetail.session.closedAt).slice(0, 10)}` : 'Historia remanentów'}
              </Text>
              <Text style={styles.comparisonSubtitle} numberOfLines={1}>
                {historyDetail
                  ? (historyDetail.session.result?.filters?.length ? `Filtry: ${historyDetail.session.result.filters.join(' · ')}` : 'Cały punkt')
                  : `Punkt ${user?.sellingPoint || user?.symbol || ''}`}
              </Text>
            </View>
          </View>

          {historyDetail ? (
            historyDetail.loading || !historyDetail.session.result ? (
              <View style={styles.comparisonContent}>
                <ActivityIndicator size="large" color="#0d6efd" />
              </View>
            ) : (
              <ScrollView style={styles.comparisonContent} showsVerticalScrollIndicator={false}>
                <View style={styles.historyMeta}>
                  <Text style={styles.historyMetaText}>Rozpoczęto: {formatHistoryDate(historyDetail.session.startedAt)} ({historyDetail.session.startedBy || '-'})</Text>
                  <Text style={styles.historyMetaText}>Zakończono: {formatHistoryDate(historyDetail.session.closedAt)} ({historyDetail.session.closedBy || '-'})</Text>
                  {historyDetail.session.result.manualCount > 0 ? (
                    <Text style={[styles.historyMetaText, { color: '#F59E0B' }]}>Wpisane ręcznie (bez skanu): {historyDetail.session.result.manualCount} szt.</Text>
                  ) : null}
                </View>
                <View style={styles.statsContainer}>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{historyDetail.session.result.currentStateCount || 0}</Text>
                    <Text style={styles.statLabel}>Na stanie</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{historyDetail.session.result.remanentCount ?? historyDetail.session.itemsCount ?? 0}</Text>
                    <Text style={styles.statLabel}>Zeskanowane</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statNumber, { color: '#dc3545' }]}>{countsOf(historyDetail.session.result).missing}</Text>
                    <Text style={styles.statLabel}>Braki</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statNumber, { color: '#ffc107' }]}>{countsOf(historyDetail.session.result).excess}</Text>
                    <Text style={styles.statLabel}>Nadwyżki</Text>
                  </View>
                </View>

                {(historyDetail.session.result.missingItems || []).length > 0 && (
                  <View style={styles.resultSection}>
                    <Text style={styles.sectionTitle}>❌ Brakuje: {piecesSummary(countsOf(historyDetail.session.result).missing, historyDetail.session.result.missingItems.length)}</Text>
                    {historyDetail.session.result.missingItems.map((item, index) => (
                      <View key={`m-${item.code}-${index}`} style={styles.resultItem}>
                        <View style={styles.resultItemContent}>
                          <Text style={styles.itemName}>{item.name && item.size && item.size !== '-' ? `${item.name} ${item.size}` : item.name || 'Nieznany produkt'}</Text>
                          <Text style={styles.itemQuantity}>Na stanie: {item.expectedCount || 0}, zeskanowano: {item.actualCount || 0}</Text>
                        </View>
                        <Text style={[styles.historyDelta, { color: '#dc3545' }]}>-{missingOf(item)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {(historyDetail.session.result.extraItems || []).length > 0 && (
                  <View style={styles.resultSection}>
                    <Text style={styles.sectionTitle}>⚠️ Nadwyżka: {piecesSummary(countsOf(historyDetail.session.result).excess, historyDetail.session.result.extraItems.length)}</Text>
                    {historyDetail.session.result.extraItems.map((item, index) => (
                      <View key={`e-${item.code}-${index}`} style={styles.resultItem}>
                        <View style={styles.resultItemContent}>
                          <Text style={styles.itemName}>{item.name && item.size && item.size !== '-' ? `${item.name} ${item.size}` : item.name || 'Nieznany produkt'}</Text>
                          <Text style={styles.itemQuantity}>Na stanie: {item.expectedCount || 0}, zeskanowano: {item.actualCount || 0}</Text>
                        </View>
                        <Text style={[styles.historyDelta, { color: '#ffc107' }]}>+{excessOf(item)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {countsOf(historyDetail.session.result).missing === 0 && countsOf(historyDetail.session.result).excess === 0 && (
                  <View style={styles.historyOk}>
                    <Ionicons name="checkmark-circle" size={22} color="#28a745" />
                    <Text style={styles.historyOkText}>Wszystko się zgadzało</Text>
                  </View>
                )}
                <View style={{ height: 32 }} />
              </ScrollView>
            )
          ) : historyLoading ? (
            <View style={styles.comparisonContent}>
              <ActivityIndicator size="large" color="#0d6efd" />
            </View>
          ) : historyList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="time-outline" size={64} color={tc('muted', "#CDCDE0")} />
              <Text style={styles.emptyText}>Brak zakończonych remanentów</Text>
              <Text style={styles.emptySubtext}>Wynik pojawi się tutaj po kliknięciu „Zakończ remanent i zapisz wynik”.</Text>
            </View>
          ) : (
            <FlatList
              data={historyList}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
              renderItem={({ item }) => {
                const counts = countsOf(item.result);
                return (
                  <TouchableOpacity style={styles.historyRow} onPress={() => openHistoryDetail(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyRowTitle}>{formatHistoryDate(item.closedAt)}</Text>
                      <Text style={styles.historyRowSub} numberOfLines={1}>
                        {item.closedBy || item.startedBy || '-'} · {item.result?.filters?.length ? item.result.filters.join(' · ') : 'cały punkt'}
                      </Text>
                      <Text style={styles.historyRowSub}>Zeskanowano {item.result?.remanentCount ?? item.itemsCount ?? 0} szt.</Text>
                    </View>
                    <View style={styles.historyCounts}>
                      <Text style={[styles.historyCount, { color: '#dc3545' }]}>-{counts.missing}</Text>
                      <Text style={[styles.historyCount, { color: '#ffc107' }]}>+{counts.excess}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={tc('muted', "#888")} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Modal porównania remanent vs stan */}
      <ScanCompareResultModal
        visible={comparisonModalVisible}
        onClose={() => setComparisonModalVisible(false)}
        title="Remanent vs stan"
        subtitle={hasActiveFilters ? `Filtry: ${activeFilterLabels.join(' · ')}` : null}
        note={adjustmentsNote(comparisonResults)}
        results={comparisonResults}
        actions={session ? (
          // Zakończenie remanentu: zapis wyniku w historii punktu
          <View style={styles.finishSection}>
            <TouchableOpacity style={styles.finishSessionButton} onPress={() => setConfirmFinishOpen(true)} disabled={sessionBusy}>
              {sessionBusy ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="flag" size={20} color="white" />}
              <Text style={styles.startSessionText}>Zakończ remanent i zapisz wynik</Text>
            </TouchableOpacity>
            <Text style={styles.finishHint}>Po zakończeniu skany tego remanentu zostaną zamknięte, a kolejny remanent zacznie się od zera.</Text>
          </View>
        ) : null}
      >
        {confirmFinishOpen && (
          <View style={[StyleSheet.absoluteFill, styles.filterOverlay]}>
            <View style={styles.filterCard}>
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="flag" size={52} color="#F59E0B" />
              </View>
              <Text style={[styles.filterCardTitle, { textAlign: 'center', marginBottom: 8 }]}>Zakończyć remanent?</Text>
              <Text style={{ color: tc('muted', '#CBD5E1'), fontSize: 15, textAlign: 'center', marginBottom: 12 }}>
                Wynik (braki i nadwyżki) zostanie zapisany w historii punktu. Kolejny remanent zacznie się od pustej listy.
              </Text>
              <View style={{ gap: 10 }}>
                <TouchableOpacity style={[styles.dialogStackButton, styles.filterCardButtonPrimary]} onPress={finishSession}>
                  <Ionicons name="flag" size={18} color="white" />
                  <Text style={styles.filterCardButtonText}>Tak, zakończ remanent</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dialogStackButton, styles.filterCardButtonSecondary]} onPress={() => setConfirmFinishOpen(false)}>
                  <Text style={styles.filterCardButtonText}>Anuluj</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScanCompareResultModal>

      {/* Modal filtrów zaawansowanych - w stylu aplikacji (karta na przyciemnionym tle) */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setOpenFilterSelect(null); setShowFilterModal(false); }}
      >
        <KeyboardSafeOverlay>
        <View style={styles.filterOverlay}>
          <View style={styles.filterCard}>
            <View style={styles.filterCardHeader}>
              <Text style={styles.filterCardTitle}>Filtry remanentu</Text>
              <TouchableOpacity onPress={() => { setOpenFilterSelect(null); setShowFilterModal(false); }}>
                <Ionicons name="close" size={24} color={tc('text', "white")} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {[
                { key: "category", title: "Kategoria", placeholder: "Wszystkie kategorie", options: FILTER_CATEGORIES, icon: "albums-outline" },
                ...(advancedFilters.category ? [{
                  key: "items",
                  multi: true,
                  title: `${ITEM_FILTER_TITLES[advancedFilters.category]} (można wybrać kilka)`,
                  placeholder: `Wszystkie: ${ITEM_FILTER_TITLES[advancedFilters.category].toLowerCase()}`,
                  options: categoryItemOptions,
                  icon: "list-outline",
                }] : []),
                ...(advancedFilters.category === "Pozostały asortyment" ? [{
                  key: "models",
                  multi: true,
                  title: "Modele (można wybrać kilka)",
                  placeholder: advancedFilters.items.length > 0 ? `Wszystkie modele: ${advancedFilters.items.join(", ").toLowerCase()}` : "Wszystkie modele",
                  options: remainingModelOptions,
                  icon: "pricetag-outline",
                }] : []),
                { key: "colors", multi: true, title: "Kolor (można wybrać kilka)", placeholder: "Wszystkie kolory", options: availableColors, icon: "color-palette-outline" },
                ...(!advancedFilters.category || advancedFilters.category === "Kurtki kożuchy futra"
                  ? [{ key: "sizes", multi: true, title: "Rozmiar - kurtki (można wybrać kilka)", placeholder: "Wszystkie rozmiary", options: availableSizes, icon: "resize-outline" }]
                  : []),
              ].map((field) => {
                const value = advancedFilters[field.key];
                const isOpen = openFilterSelect === field.key;
                const shown = field.multi ? (value.length > 0 ? value.join(", ") : "") : value;
                const pick = (option) => {
                  if (field.multi) {
                    setAdvancedFilters((prev) => {
                      const current = prev[field.key];
                      const nextValues = option === "" ? [] : (current.includes(option) ? current.filter((entry) => entry !== option) : [...current, option]);
                      const next = { ...prev, [field.key]: nextValues };
                      if (field.key === "items" && prev.category === "Pozostały asortyment" && nextValues.length > 0) {
                        // zostają tylko modele z wybranych rodzajów
                        const allowedModels = new Set(
                          goodsList
                            .filter((good) => good.category === "Pozostały asortyment" && nextValues.includes(filterItemOfGood(good)))
                            .map((good) => good.bagProduct)
                        );
                        next.models = prev.models.filter((model) => allowedModels.has(model));
                      }
                      return next;
                    });
                    if (option === "") setOpenFilterSelect(null);
                    return;
                  }
                  if (field.key === "category") {
                    // nowa kategoria = nowy wybór w kategorii; rozmiar tylko dla kurtek
                    setAdvancedFilters((prev) => ({
                      ...prev,
                      category: option,
                      items: [],
                      models: [],
                      sizes: option && option !== "Kurtki kożuchy futra" ? [] : prev.sizes,
                    }));
                  } else {
                    setAdvancedFilters((prev) => ({ ...prev, [field.key]: option }));
                  }
                  setOpenFilterSelect(null);
                };
                return (
                  <View key={field.key} style={styles.filterSection}>
                    <Text style={styles.filterSectionTitle}>{field.title}</Text>
                    <TouchableOpacity
                      style={[styles.selectField, isOpen && styles.selectFieldOpen]}
                      onPress={() => setOpenFilterSelect(isOpen ? null : field.key)}
                    >
                      <Ionicons name={field.icon} size={18} color={shown ? "#0D6EFD" : "#64748B"} style={{ marginRight: 8 }} />
                      <Text style={[styles.selectFieldText, !shown && styles.selectFieldPlaceholder]} numberOfLines={2}>
                        {shown || field.placeholder}
                      </Text>
                      <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={tc('muted', "#94A3B8")} />
                    </TouchableOpacity>
                    {isOpen && field.key !== "category" && (
                      <View style={styles.selectSearchBox}>
                        <Ionicons name="search" size={16} color={tc('muted', "#94A3B8")} />
                        <TextInput
                          style={styles.selectSearchInput}
                          placeholder={`Szukaj: ${({ items: 'model, rodzaj', models: 'model', colors: 'kolor', sizes: 'rozmiar' })[field.key] || field.title.split(' ')[0].toLowerCase()}`}
                          placeholderTextColor={tc('muted', "#64748B")}
                          value={selectSearch[field.key] || ""}
                          onChangeText={(text) => setSelectSearch((prev) => ({ ...prev, [field.key]: text }))}
                          autoCorrect={false}
                          autoCapitalize="characters"
                        />
                        {selectSearch[field.key] ? (
                          <TouchableOpacity onPress={() => setSelectSearch((prev) => ({ ...prev, [field.key]: "" }))}>
                            <Ionicons name="close-circle" size={16} color={tc('muted', "#94A3B8")} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}
                    {isOpen && (
                      <ScrollView style={styles.optionList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {["", ...field.options.filter((option) => !selectSearch[field.key] || String(option).toLowerCase().includes(String(selectSearch[field.key]).toLowerCase()))].map((option) => {
                          const selected = field.multi ? (option === "" ? value.length === 0 : value.includes(option)) : option === value;
                          return (
                            <TouchableOpacity
                              key={option || "__all__"}
                              style={[styles.optionItem, selected && styles.optionItemSelected]}
                              onPress={() => pick(option)}
                            >
                              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                                {option || field.placeholder}
                              </Text>
                              {field.multi && option !== "" ? (
                                <Ionicons name={selected ? "checkbox" : "square-outline"} size={20} color={selected ? "#0D6EFD" : "#64748B"} />
                              ) : (
                                selected && <Ionicons name="checkmark" size={18} color="#0D6EFD" />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                        {field.options.length === 0 && (
                          <Text style={[styles.optionText, { padding: 12, color: tc('muted', "#64748B") }]}>Brak opcji do wyboru</Text>
                        )}
                      </ScrollView>
                    )}
                    {field.multi && isOpen && (
                      <TouchableOpacity style={styles.multiDoneButton} onPress={() => setOpenFilterSelect(null)}>
                        <Text style={styles.filterCardButtonText}>Gotowe</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              {/* Aktywne filtry */}
              {hasActiveFilters ? (
                <View style={styles.activeFiltersSection}>
                  <Text style={styles.filterSectionTitle}>Aktywne filtry:</Text>
                  <View style={styles.activeFiltersContainer}>
                    {[
                      advancedFilters.category && { key: "category", label: `📦 ${advancedFilters.category}`, clear: () => setAdvancedFilters((prev) => ({ ...prev, category: "", items: [], models: [] })) },
                      ...advancedFilters.items.map((entry) => ({ key: `item-${entry}`, label: `• ${entry}`, clear: () => setAdvancedFilters((prev) => ({ ...prev, items: prev.items.filter((item) => item !== entry) })) })),
                      ...advancedFilters.models.map((entry) => ({ key: `model-${entry}`, label: `🏷 ${entry}`, clear: () => setAdvancedFilters((prev) => ({ ...prev, models: prev.models.filter((model) => model !== entry) })) })),
                      ...advancedFilters.colors.map((entry) => ({ key: `color-${entry}`, label: `🎨 ${entry}`, clear: () => setAdvancedFilters((prev) => ({ ...prev, colors: prev.colors.filter((color) => color !== entry) })) })),
                      ...advancedFilters.sizes.map((entry) => ({ key: `size-${entry}`, label: `📏 ${entry}`, clear: () => setAdvancedFilters((prev) => ({ ...prev, sizes: prev.sizes.filter((size) => size !== entry) })) })),
                    ].filter(Boolean).map((tag) => (
                      <View key={tag.key} style={styles.activeFilterTag}>
                        <Text style={styles.activeFilterText}>{tag.label}</Text>
                        <TouchableOpacity onPress={tag.clear} style={styles.removeFilterButton}>
                          <Ionicons name="close-circle" size={16} color="#ff6b6b" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </ScrollView>

            {/* Przyciski akcji */}
            <View style={styles.filterCardActions}>
              <TouchableOpacity
                style={[styles.filterCardButton, styles.filterCardButtonSecondary]}
                onPress={() => {
                  setAdvancedFilters(EMPTY_FILTERS);
                  setOpenFilterSelect(null);
                }}
              >
                <Ionicons name="refresh" size={18} color={tc('text', "white")} />
                <Text style={styles.filterCardButtonText}>Wyczyść</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterCardButton, styles.filterCardButtonPrimary]}
                onPress={() => { setOpenFilterSelect(null); setShowFilterModal(false); }}
              >
                <Ionicons name="checkmark" size={18} color="white" />
                <Text style={styles.filterCardButtonText}>Zastosuj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardSafeOverlay>
      </Modal>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: tc('text', 'white'),
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: tc('muted', '#CDCDE0'),
  },
  resetButton: {
    backgroundColor: '#6c757d',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  resetButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: tc('text', 'white'),
    marginTop: 12,
    fontSize: 16,
  },
  listContainer: {
    padding: 16,
  },
  remanentItem: {
    backgroundColor: tc('surface', '#1E1E2D'),
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemCode: {
    fontSize: 14,
    color: tc('muted', '#CDCDE0'),
    backgroundColor: tc('surface', '#232533'),
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  removeRemanentButton: {
    backgroundColor: '#dc3545',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBadge: {
    color: tc('text', 'white'),
    backgroundColor: tc('surface2', '#2A2A3C'),
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  oldSessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B45309',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  oldSessionText: {
    flex: 1,
    color: tc('text', 'white'),
    fontSize: 13,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: tc('muted', '#CDCDE0'),
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: tc('text', 'white'),
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#232533'),
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: tc('surface', '#232533'),
    minWidth: 100,
    justifyContent: 'center',
  },
  actionText: {
    color: tc('text', 'white'),
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
  },
  pieceCountEditable: {
    textDecorationLine: 'underline',
  },
  quantityInput: {
    color: tc('text', 'white'),
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    backgroundColor: tc('surface', '#0F172A'),
    paddingVertical: 10,
  },
  historyButton: {
    flex: 1,
    backgroundColor: tc('surface', '#161622'),
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tc('surface', '#232533'),
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  historyRowTitle: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: '700',
  },
  historyRowSub: {
    color: tc('muted', '#9CA3AF'),
    fontSize: 13,
    marginTop: 2,
  },
  historyCounts: {
    alignItems: 'flex-end',
  },
  historyCount: {
    fontSize: 16,
    fontWeight: '700',
  },
  historyMeta: {
    marginBottom: 12,
  },
  historyMetaText: {
    color: tc('muted', '#9CA3AF'),
    fontSize: 13,
    marginBottom: 2,
  },
  historyDelta: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 10,
  },
  historyOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(40, 167, 69, 0.15)',
    borderRadius: 12,
    padding: 14,
  },
  historyOkText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
  },
  sessionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E3A8A',
    backgroundColor: 'rgba(13, 110, 253, 0.12)',
  },
  sessionBarText: {
    flex: 1,
    color: tc('text', 'white'),
    fontSize: 14,
    fontWeight: '600',
  },
  sessionFinishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  sessionFinishText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  startSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    backgroundColor: '#0D6EFD',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  startSessionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  finishSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  finishSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    borderRadius: 12,
  },
  finishHint: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  selectSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    backgroundColor: tc('surface', '#0F172A'),
  },
  selectSearchInput: {
    flex: 1,
    color: tc('text', 'white'),
    fontSize: 15,
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  scanSearchWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  scanSearchCount: {
    fontSize: 12,
    color: tc('muted', '#94A3B8'),
    marginTop: 6,
    marginLeft: 4,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: tc('text', 'white'),
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: tc('muted', '#CDCDE0'),
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#232533'),
    flexDirection: 'row',
    gap: 8,
  },
  addButton: {
    backgroundColor: '#0D6EFD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    flex: 1,
  },
  checkButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    flex: 1,
  },
  addButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  clearAllButton: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    flex: 1,
  },
  checkButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  // QR Scanner styles
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#232533'),
  },
  scannerTitle: {
    color: tc('text', 'white'),
    fontSize: 18,
    fontWeight: '600',
  },
  placeholderButton: {
    width: 44,
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('surface', '#161622'),
  },
  permissionText: {
    color: tc('text', 'white'),
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#0D6EFD',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: '#0D6EFD',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  scanningDisabled: {
    position: 'absolute',
    bottom: -50,
    backgroundColor: 'rgba(220, 53, 69, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  scanningDisabledText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  scannedListContainer: {
    backgroundColor: tc('surface', '#1E1E2D'),
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#232533'),
    maxHeight: 170,
  },
  pieceCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  pieceButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pieceButtonMinus: {
    backgroundColor: '#DC2626',
  },
  pieceButtonPlus: {
    backgroundColor: '#16A34A',
  },
  pieceCount: {
    color: tc('text', 'white'),
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 10,
  },
  scanToast: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(22, 163, 74, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  scanToastWarn: {
    backgroundColor: 'rgba(217, 119, 6, 0.95)',
  },
  scanToastText: {
    flex: 1,
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  scannedListTitle: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  scannedJacket: {
    backgroundColor: tc('surface', '#232533'),
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    minWidth: 120,
    position: 'relative',
  },
  removeJacketButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#dc3545',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  jacketName: {
    color: tc('text', 'white'),
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 16,
  },
  jacketCode: {
    color: tc('muted', '#CDCDE0'),
    fontSize: 12,
    marginBottom: 4,
  },
  jacketTime: {
    color: tc('muted', '#CDCDE0'),
    fontSize: 12,
  },
  scannerFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#232533'),
    gap: 10,
  },
  manualRow: {
    flexDirection: 'row',
    gap: 10,
  },
  manualButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: tc('surface2', '#343a40'),
    paddingVertical: 12,
    borderRadius: 10,
  },
  manualButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  deviceText: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    marginTop: 2,
  },
  manualBadge: {
    color: '#F59E0B',
    fontSize: 12,
    marginTop: 2,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#1E293B'),
  },
  pickerRowTitle: {
    color: tc('text', 'white'),
    fontSize: 15,
    fontWeight: '600',
  },
  pickerRowSub: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    marginTop: 2,
  },
  pickerSizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerSizeChip: {
    minWidth: 64,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: tc('surface', '#1E293B'),
  },
  pickerSizeText: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: '700',
  },
  confirmButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Styles for comparison modal
  comparisonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#232533'),
  },
  comparisonBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('surface', '#1E293B'),
  },
  comparisonTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: tc('text', 'white'),
  },
  comparisonSubtitle: {
    fontSize: 13,
    color: tc('muted', '#94A3B8'),
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: tc('bg', '#000000'),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#232533'),
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: tc('text', 'white'),
  },
  closeButton: {
    padding: 8,
  },
  comparisonContent: {
    flex: 1,
    padding: 20,
    backgroundColor: tc('bg', '#000000'),
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    backgroundColor: tc('surface', '#232533'),
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#0D6EFD',
  },
  statLabel: {
    fontSize: 14,
    color: tc('muted', '#888'),
    marginTop: 4,
  },
  resultSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: tc('text', 'white'),
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: tc('muted', '#888'),
    marginBottom: 12,
  },
  resultItem: {
    backgroundColor: tc('surface', '#232533'),
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultItemContent: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: tc('text', 'white'),
    marginBottom: 4,
  },
  itemDetails: {
    fontSize: 14,
    color: tc('muted', '#888'),
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10B981',
    textAlign: 'center',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  // Styles for assortment filter
  filterContainer: {
    marginTop: 12,
    backgroundColor: tc('surface', '#2A2A3E'),
    borderRadius: 8,
    padding: 8,
  },
  filterLabel: {
    fontSize: 12,
    color: tc('muted', '#CDCDE0'),
    marginBottom: 4,
    fontWeight: '500',
  },
  pickerContainer: {
    backgroundColor: tc('surface', '#1E1E2D'),
    borderRadius: 6,
    borderWidth: 1,
    borderColor: tc('border', '#444'),
  },
  picker: {
    height: 35,
    color: tc('text', 'white'),
    fontSize: 14,
  },
  // Filter button styles
  filterButton: {
    flex: 1,
    backgroundColor: tc('surface', '#161622'),
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  filterButtonText: {
    color: tc('text', '#fff'),
    fontSize: 15,
    fontWeight: '600',
  },
  // Header buttons container
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  // Filter modal styles
  filterOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  filterCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
    padding: 20,
  },
  filterCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  filterCardTitle: {
    color: tc('text', "white"),
    fontSize: 20,
    fontWeight: "700",
  },
  selectField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#111827"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectFieldOpen: {
    borderColor: "#0D6EFD",
  },
  selectFieldText: {
    flex: 1,
    color: tc('text', "white"),
    fontSize: 15,
    fontWeight: "600",
  },
  selectFieldPlaceholder: {
    color: tc('muted', "#94A3B8"),
    fontWeight: "400",
  },
  optionList: {
    maxHeight: 220,
    marginTop: 6,
    backgroundColor: tc('surface', "#111827"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderRadius: 10,
  },
  optionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  optionItemSelected: {
    backgroundColor: "rgba(13, 110, 253, 0.15)",
  },
  optionText: {
    color: tc('text', "white"),
    fontSize: 15,
  },
  optionTextSelected: {
    color: "#60A5FA",
    fontWeight: "700",
  },
  multiDoneButton: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#0D6EFD",
  },
  filterCardActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  filterCardButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  // Przycisk na całą szerokość w oknach z przyciskami jeden pod drugim (bez flex: 1, który w kolumnie zeruje wysokość)
  dialogStackButton: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  filterCardButtonPrimary: {
    backgroundColor: "#0D6EFD",
  },
  filterCardButtonSecondary: {
    backgroundColor: "#64748B",
  },
  filterCardButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  filterModalContent: {
    flex: 1,
    padding: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    color: tc('text', 'white'),
    fontWeight: '600',
    marginBottom: 8,
  },
  activeFiltersSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: tc('surface', '#2A2A3E'),
    borderRadius: 12,
    marginBottom: 20,
  },
  activeFiltersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  activeFilterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 110, 253, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(13, 110, 253, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  activeFilterText: {
    color: tc('text', '#fff'),
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
  },
  removeFilterButton: {
    marginLeft: 4,
  },
  filterActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#3C3C43',
  },
  clearFiltersButton: {
    flex: 1,
    backgroundColor: '#64748B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  clearFiltersText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  applyFiltersButton: {
    flex: 1,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  applyFiltersText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  itemQuantity: {
    fontSize: 12,
    color: tc('muted', '#CDCDE0'),
    marginTop: 2,
    fontStyle: 'italic',
  },
  // Progress bar styles
  progressContainer: {
    marginTop: 12,
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressTitle: {
    fontSize: 14,
    color: tc('text', 'white'),
    fontWeight: '600',
  },
  progressStats: {
    fontSize: 14,
    color: '#0D6EFD',
    fontWeight: 'bold',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: tc('surface', '#1E1E2D'),
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  progressDetailText: {
    fontSize: 12,
    color: tc('muted', '#94A3B8'),
    marginRight: 8,
  },
}));

export default Remanent;
