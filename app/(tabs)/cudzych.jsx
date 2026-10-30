import React, { useContext, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  ScrollView,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useCameraPermissions } from "expo-camera";
import ScanCamera from "../../components/scanner/ScanCamera"; // skaner jak w całej aplikacji: ramka, zdjęcie, „Wpisz kod”
import SalePointPicker from "../../components/scanner/SalePointPicker"; // „Sprzedano od” jak w „Dodaj”: stan w punktach i korekta
import ProductBasePicker from "../../components/scanner/ProductBasePicker"; // „Z bazy” - wybór produktu zamiast skanu (jak w Remanencie)
import CudzichFilterModal, { filterLabel } from "../../components/CudzichFilterModal"; // filtr historii: zakres dat, szybkie zakresy, rodzaje
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafeScreen, KeyboardSafeOverlay } from "../../components/KeyboardSafe"; // klawiatura nie zasłania pola tekstowego (ekrany i okienka)
import { useFocusEffect } from "@react-navigation/native";
import { GlobalStateContext } from '../../context/GlobalState';

import { getApiUrl } from '../../config/api';
import tokenService from '../../services/tokenService';
import Logger from '../../services/logger'; // Import logger service
import { appAlert } from '../../services/appAlert';
import Ionicons from '@expo/vector-icons/Ionicons';
import { IconButton, MenuCard, ModalHeader, OptionCard, ScreenHeader, look } from '../../components/AdminLook';
import { findGoodForBarcode, findSizeForBarcode, listPriceOf, resolveSalePrice } from '../../utils/defaultSalePrice'; // cena: cennik Cudzich, bez niego karta produktu
import { jacketCodeForSize, productNameFromBarcode } from '../../utils/productName'; // nazwa z kodu jak w całej aplikacji; kod metki z karty + rozmiaru
import { sanitizeAmountInput } from '../../utils/amountInput'; // przecinek = kropka w polu kwoty
import { searchWords, filterBySearch } from '../../utils/searchText'; // wyszukiwarka na liście kurtek u Cudzicha
import { CUDZICH_TYPES, CudzichBalanceCard, CudzichTransactionCard, cudzichBalanceInfo } from '../../components/CudzichLook'; // karty jak na ekranie admina

import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu

// Saldo słownie w komunikatach po zapisie: „Cudzich jest nam winien: 400 zł” / „Należy zwrócić Cudzichowi: 590 zł”
const balanceText = (value) => {
  const info = cudzichBalanceInfo(value);
  return info.amount > 0 ? `${info.label}: ${info.amount.toFixed(2)} zł` : info.label;
};

const formatPln = (value) => `${(Number(value) || 0).toFixed(2)} zł`;
// „1 kurtka / 2 kurtki / 5 kurtek” (mianownik) i „1 kurtkę / 2 kurtki / 5 kurtek” (biernik)
const pluralKurtka = (count, one) => (count === 1 ? one
  : (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? 'kurtki' : 'kurtek'));
// Ten sam produkt: po id karty, a bez id - po pełnej nazwie; puste wartości nigdy nie pasują
// (dawniej '' === '' przy kodzie spoza bazy dopasowywało każdy odbiór i zaznaczało przypadkową kurtkę)
const sameProduct = (candidate, info) => {
  const candidateId = String(candidate?.goodsId || '');
  const infoId = String(info?.productId || '');
  if (candidateId && infoId) return candidateId === infoId;
  return Boolean(info?.name) && candidate?.fullName === info.name;
};
const sameSize = (candidate, info) => !info?.size || info.size === '-' || candidate?.size === info.size;
// Drugie okienko dopiero po zamknięciu pierwszego - iOS nie pokaże nowego Modal, dopóki stary się chowa
const afterModalClose = (fn) => setTimeout(fn, Platform.OS === 'ios' ? 450 : 250);

const Cudzych = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets(); // Get safe area insets
  const { 
    user,
    goods,
    sizes,
    stocks,
    colors,
    stateData,
    users,
    ensureData
  } = useContext(GlobalStateContext);
  
  // State management
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  // Blokada podwójnego zapisu (odbiór, zwrot, rozliczenie): ref zmienia się od razu, a `loading` dopiero po
  // przerysowaniu - dwa szybkie stuknięcia przechodziły oba i zapisywały operację dwa razy
  const savingRef = useRef(false);
  // Numer zapisu dla serwera (clientRequestId): ta sama operacja (ten sam odbiór / kwota / kurtki) ponowiona po
  // błędzie połączenia - także po zamknięciu i ponownym otwarciu okienka - wysyła ten sam numer, więc serwer odsyła
  // zapisaną transakcję zamiast tworzyć drugą. Po udanym zapisie numer przepada - kolejna operacja dostaje nowy.
  const pendingRequestsRef = useRef({});
  const requestIdFor = (kind, payload) => {
    const key = JSON.stringify(payload);
    const pending = pendingRequestsRef.current[kind];
    if (pending && pending.key === key) return pending.id;
    const id = `cudz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    pendingRequestsRef.current[kind] = { key, id };
    return id;
  };
  const requestDone = (kind) => { delete pendingRequestsRef.current[kind]; };
  const [refreshing, setRefreshing] = useState(false);
  
  // QR Scanner states
  const facing = "back";
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannerType, setScannerType] = useState('odbior'); // 'odbior' lub 'zwrot'
  const [barcode, setBarcode] = useState(""); // State for barcode input
  const [scannedProductModalVisible, setScannedProductModalVisible] = useState(false);
  const [scannedProductData, setScannedProductData] = useState({ name: "", size: "", barcode: "", price: "" });
  const [selectedOption, setSelectedOption] = useState(""); // State for selling point selection
  
  // Modal states
  const [odbiorModalVisible, setOdbiorModalVisible] = useState(false);
  const [zwrotModalVisible, setZwrotModalVisible] = useState(false);
  const [wplataModalVisible, setWplataModalVisible] = useState(false);
  const [wyplataModalVisible, setWyplataModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  
  // Form states
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productSearchText, setProductSearchText] = useState('');
  const [selectedSize, setSelectedSize] = useState(null);
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  // Zwrot (30.10.2026): wskazanie odbioru, którego dotyczy (cena z odbioru), albo „Kurtka sprzed systemu” (zapłacona)
  const [returnCandidates, setReturnCandidates] = useState([]);
  // Zwrot wielu kurtek naraz (30.10.2026): zaznaczone odbiory + kurtki sprzed systemu dodane do tego samego zwrotu
  const [selectedSaleIds, setSelectedSaleIds] = useState([]);
  const [historicalItems, setHistoricalItems] = useState([]); // { key, productId, name, size, barcode, price }
  // „Z bazy”: dla odbioru (zamiast skanu) albo zwrotu (zawęża listę jak skan)
  const [basePickerFor, setBasePickerFor] = useState(null); // 'odbior' | 'zwrot' | null
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  // Zwrot (30.10.2026): od razu lista kurtek u Cudzicha (niezwrócone odbiory) z wyszukiwarką i skanem metki
  const [returnListVisible, setReturnListVisible] = useState(false);
  const [returnSearch, setReturnSearch] = useState('');
  const [returnFilter, setReturnFilter] = useState(null); // po skanie: { productId, name, size, barcode, price }
  
  // Dropdown states
  const [productDropdownVisible, setProductDropdownVisible] = useState(false);
  const [sizeDropdownVisible, setSizeDropdownVisible] = useState(false);
  
  // Filtered products for search
  const [filteredProducts, setFilteredProducts] = useState([]);
  
  // Payment form states
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Date filter states
  const [dateFilterVisible, setDateFilterVisible] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState(null);
  const [filterEndDate, setFilterEndDate] = useState(null);
  const [filterTypes, setFilterTypes] = useState([]); // rodzaje operacji (puste = wszystkie)
  const [periodSummary, setPeriodSummary] = useState(null); // liczba i suma każdego rodzaju w wybranym okresie (serwer)
  // Historia porcjami (30.10.2026), jak Historia i Stan: 30 wpisów, kolejne przy przewijaniu; filtr dat liczy serwer
  const [transactionsTotal, setTransactionsTotal] = useState(0);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsHasMore, setTransactionsHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const transactionsRequestRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const firstPageLoadingRef = useRef(false);
  const [transactionsError, setTransactionsError] = useState(false); // historia się nie wczytała - komunikat i „Spróbuj ponownie”
  const priceTouchedRef = useRef(false); // cena wpisana ręcznie - cennik jej już nie nadpisuje
  const historicalConfirmedRef = useRef(false); // „To inna kurtka” - dodanie sprzed systemu mimo podobnej na liście

  
  // Price list state
  const [cudzichPriceList, setCudzichPriceList] = useState(null);

  // Fetch current balance
  const fetchBalance = React.useCallback(async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/cudzich/balance?userSymbol=P&recipientId=cudzich'));
      
      if (response.ok) {
        const data = await response.json();
        setBalance(data.balance || 0);
      }
    } catch (error) {
      Logger.error('Error fetching balance:', error);
    }
  }, []);

  // Historia transakcji porcjami: strona 1 zastępuje listę, kolejne doklejają; starsze odpowiedzi są pomijane
  const TRANSACTIONS_PAGE_SIZE = 30;
  const dayParam = (date) => (date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    : '');
  const filterDatesRef = useRef({ start: null, end: null, types: [] });
  filterDatesRef.current = { start: filterStartDate, end: filterEndDate, types: filterTypes };
  // Strona 1 (nowy filtr, odświeżenie) unieważnia wszystko w drodze; kolejne strony nie unieważniają strony 1
  // i nie ruszają, dopóki strona 1 się wczytuje (dawniej przewinięcie w trakcie zmiany filtra doklejało
  // stronę 2 do starej listy, a odpowiedź z nowym filtrem przepadała)
  const fetchTransactions = React.useCallback(async (page = 1) => {
    const requestId = page === 1 ? ++transactionsRequestRef.current : transactionsRequestRef.current;
    if (page === 1) firstPageLoadingRef.current = true;
    try {
      const params = new URLSearchParams({ userSymbol: 'P', recipientId: 'cudzich', page: String(page), limit: String(TRANSACTIONS_PAGE_SIZE) });
      const { start, end, types } = filterDatesRef.current;
      if (start) params.set('startDate', dayParam(start));
      if (end) params.set('endDate', dayParam(end));
      if (types && types.length > 0) params.set('types', types.join(','));
      const response = await tokenService.authenticatedFetch(getApiUrl(`/cudzich/transactions?${params.toString()}`));
      if (requestId !== transactionsRequestRef.current) return;
      if (response.ok) {
        const data = await response.json();
        const rows = Array.isArray(data?.transactions) ? data.transactions : (Array.isArray(data) ? data : []);
        setTransactions((prev) => (page === 1 ? rows : [...prev, ...rows]));
        setTransactionsTotal(Number(data?.total) || rows.length);
        setTransactionsPage(page);
        setTransactionsHasMore(Boolean(data?.hasMore));
        if (page === 1) setPeriodSummary(data?.summary || null);
        setTransactionsError(false);
      } else {
        setTransactionsError(true);
      }
    } catch (error) {
      Logger.error('Error fetching transactions:', error);
      if (requestId === transactionsRequestRef.current) setTransactionsError(true);
    } finally {
      if (page === 1 && requestId === transactionsRequestRef.current) firstPageLoadingRef.current = false;
    }
  }, []);

  const loadMoreTransactions = async () => {
    if (!transactionsHasMore || loadingMoreRef.current || firstPageLoadingRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await fetchTransactions(transactionsPage + 1);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  // Fetch Cudzich price list
  const fetchCudzichPriceList = React.useCallback(async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/cudzich/pricelist'));
      
      if (response.ok) {
        const data = await response.json();
        setCudzichPriceList(data);
      } else {
        Logger.error('❌ Błąd pobierania cennika:', response.status);
      }
    } catch (error) {
      Logger.error('❌ Error fetching Cudzich price list:', error);
    }
  }, []);

  // Load balance, transactions and price list
  const loadInitialData = React.useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchBalance(),
        fetchTransactions(1),
        fetchCudzichPriceList(),
        fetchOpenOdbiory(), // kurtki u Cudzicha: licznik na karcie salda i lista zwrotu
        // Słowniki i stan tylko gdy nieświeże - wcześniej 8 pełnych pobrań przy każdym wejściu na zakładkę
        ensureData(['goods', 'sizes', 'stocks', 'colors', 'state', 'users']),
      ]);
    } catch (error) {
      Logger.error('Error loading initial data:', error);
      appAlert('Błąd', 'Nie udało się załadować danych');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pobierz dane przy każdym wejściu w zakładkę (useFocusEffect uruchamia się też przy zamontowaniu -
  // osobny useEffect na mount dublował wszystkie zapytania)
  useFocusEffect(
    React.useCallback(() => {
      loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // Filter products based on search text
  useEffect(() => {
    if (productSearchText.length > 0) {
      const filtered = goods.filter(product =>
        product.fullName?.toLowerCase().includes(productSearchText.toLowerCase())
      );
      setFilteredProducts(filtered.slice(0, 10)); // Limit to 10 results
    } else {
      setFilteredProducts([]);
    }
  }, [productSearchText, goods]);

  // Zmiana filtra dat - pierwsza strona od nowa z serwera (pierwsze pobranie robi wejście na zakładkę)
  const filterMountedRef = useRef(false);
  useEffect(() => {
    if (!filterMountedRef.current) {
      filterMountedRef.current = true;
      return;
    }
    fetchTransactions(1);
  }, [filterStartDate, filterEndDate, filterTypes, fetchTransactions]);

  // Cena z cennika po wyborze produktu/rozmiaru - dopóki użytkownik nie wpisał własnej
  useEffect(() => {
    if (selectedProduct && !priceTouchedRef.current) {
      setPrice(getPriceFromProduct(selectedProduct, selectedSize));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct, selectedSize, cudzichPriceList]);

  // Handle product selection
  const handleProductSelect = (product) => {
    // inny produkt = rozmiar i cena od nowa (dawniej zostawał rozmiar poprzedniego produktu)
    if (String(product?._id) !== String(selectedProduct?._id)) {
      setSelectedSize(null);
      setSize('');
    }
    priceTouchedRef.current = false;
    setSelectedProduct(product);
    setProductSearchText(product.fullName); // Set search text to selected product name
    setProductDropdownVisible(false);
    
    // Cena od razu w polu: cennik Cudzich, a gdy go nie ma (albo nie ma w nim produktu) - karta produktu
    setPrice(getPriceFromProduct(product, null));
  };

  // Formularz ręczny (produkt bez metki): odbiór jak ze skanu (transakcja + sprzedaż z kodem z karty i rozmiaru -
  // kurtka wychodzi z punktu przez Dobieranie; dawniej ręczny odbiór nie tworzył sprzedaży), zwrot - jak ze skanu
  const createTransaction = async (type) => {
    if (!selectedProduct) {
      appAlert('Błąd', 'Proszę wybrać produkt z listy');
      return;
    }
    if (productSearchText !== selectedProduct.fullName) {
      appAlert('Błąd', 'Proszę wybrać produkt z listy wyszukiwania');
      return;
    }
    if (!selectedSize || !size || size !== (selectedSize.Roz_Opis || selectedSize.nazwa || selectedSize.name)) {
      appAlert('Błąd', 'Proszę wybrać rozmiar z listy');
      return;
    }

    if (type === 'zwrot') {
      const amount = Number(String(price || '').replace(',', '.'));
      if (!(amount > 0)) {
        appAlert('Brak ceny', 'Wpisz cenę, za którą kurtka była rozliczona przed systemem.');
        return;
      }
      // Ta kurtka jest na liście odbiorów - dodana jeszcze raz jako „sprzed systemu” dostałaby kredyt drugi raz
      const info = { productId: selectedProduct._id, name: selectedProduct.fullName, size };
      const onList = returnCandidates.filter((candidate) => sameProduct(candidate, info) && sameSize(candidate, info));
      if (onList.length > 0 && !historicalConfirmedRef.current) {
        appAlert(
          'Kurtka jest na liście',
          `${selectedProduct.fullName} ${size} jest na liście kurtek u Cudzicha (${onList.length} z odbioru). Jeśli to ta sama kurtka - zaznacz ją na liście, inaczej Cudzich dostanie kredyt dwa razy.`,
          [
            { text: 'Wróć do listy', onPress: () => { resetForm(); setZwrotModalVisible(false); setReturnFilter({ ...info, barcode: '' }); afterModalClose(() => setReturnListVisible(true)); } },
            { text: 'To inna kurtka', style: 'destructive', onPress: () => { historicalConfirmedRef.current = true; createTransaction('zwrot'); } },
          ]
        );
        return;
      }
      historicalConfirmedRef.current = false;
      setHistoricalItems((prev) => [...prev, {
        key: `h-${Date.now()}-${prev.length}`,
        productId: selectedProduct._id,
        name: selectedProduct.fullName,
        size,
        barcode: manualBarcode(),
        price: amount,
      }]);
      resetForm();
      setZwrotModalVisible(false);
      afterModalClose(() => setReturnListVisible(true)); // z powrotem do listy zwrotu
      return;
    }

    if (!(Number(price) > 0)) {
      appAlert('Błąd', 'Wpisz cenę większą od 0');
      return;
    }
    const saved = await saveTransaction('odbior', selectedProduct.fullName, size, Number(price), notes, manualBarcode(), selectedProduct._id);
    if (saved) {
      resetForm();
      setOdbiorModalVisible(false);
    }
  };

  // Kod metki dla produktu z formularza ręcznego: kurtki - karta + rozmiar, reszta - kod karty.
  // Kurtka po kategorii karty; karta bez kategorii - po kodzie (kurtki nie zaczynają się od 000)
  const manualBarcode = () => {
    const code = String(selectedProduct?.code || '').trim();
    if (!code) return '';
    const isJacket = selectedProduct?.category
      ? selectedProduct.category === 'Kurtki kożuchy futra'
      : code.slice(0, 3) !== '000';
    return isJacket && /^\d{13}$/.test(code) && selectedSize?.Roz_Kod
      ? jacketCodeForSize(code, selectedSize.Roz_Kod)
      : code;
  };

  // --- Zwrot od Cudzicha: lista kurtek u Cudzicha (niezwrócone odbiory) i zapis ---
  // Zwrot nie dopisuje kurtki do stanu: tworzy przesunięcie P → MAGAZYN do przyjęcia w Dobieraniu MAGAZYNU
  // (jak kurtki odsyłane ze sklepu do domu i zwroty z wymiany).
  const fetchOpenOdbiory = React.useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/cudzich/returns/candidates'));
      const data = response.ok ? await response.json() : {};
      setReturnCandidates(Array.isArray(data.candidates) ? data.candidates : []);
    } catch (error) {
      Logger.error('Error fetching Cudzich items:', error);
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  const selectedCandidates = returnCandidates.filter((candidate) => selectedSaleIds.includes(String(candidate.saleId)));
  const returnCount = selectedCandidates.length + historicalItems.length;
  const returnCredit = selectedCandidates.reduce((sum, candidate) => sum + (Number(candidate.price) || 0), 0)
    + historicalItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const jacketsWord = (count) => pluralKurtka(count, 'kurtkę');
  const toggleSale = (saleId) => setSelectedSaleIds((prev) => (
    prev.includes(saleId) ? prev.filter((id) => id !== saleId) : [...prev, saleId]
  ));

  // Lista zwrotu: po skanie tylko ta kurtka (produkt + rozmiar), do tego wyszukiwarka (nazwa, rozmiar, kod)
  const matchesFilter = (candidate) => !returnFilter || (sameProduct(candidate, returnFilter) && sameSize(candidate, returnFilter));
  const visibleCandidates = filterBySearch(
    returnCandidates.filter(matchesFilter),
    (candidate) => [candidate.fullName, candidate.size, candidate.barcode],
    searchWords(returnSearch)
  );

  const openReturnList = () => {
    setReturnFilter(null);
    setReturnSearch('');
    setSelectedSaleIds([]);
    setHistoricalItems([]);
    fetchOpenOdbiory();
    setReturnListVisible(true);
  };

  // Kod ze skanu albo z „Z bazy” przy zwrocie: zawęża listę do tej kurtki; jedna niezaznaczona pasująca - zaznacza ją
  const applyReturnCode = (code) => {
    const info = describeScannedCode(code);
    // kod spoza bazy: tylko napis filtra, nic nie zaznaczamy automatycznie
    const matching = info.known
      ? returnCandidates.filter((candidate) => sameProduct(candidate, info) && sameSize(candidate, info))
      : [];
    const notSelected = matching.filter((candidate) => !selectedSaleIds.includes(String(candidate.saleId)));
    setReturnFilter({ productId: info.productId, name: info.name, size: info.size, barcode: code, price: info.price });
    setReturnSearch('');
    if (notSelected.length === 1) setSelectedSaleIds((prev) => [...prev, String(notSelected[0].saleId)]);
    setReturnListVisible(true);
  };

  const startReturnScan = () => {
    setReturnListVisible(false);
    setScannerType('zwrot');
    setScanned(false);
    setScannerVisible(true);
  };

  // Kurtka sprzed systemu (już zapłacona): formularz ręczny - produkt, rozmiar, cena rozliczenia (= kredyt)
  const openHistoricalReturn = (prefill = null) => {
    setReturnListVisible(false);
    resetForm();
    if (prefill?.productId) {
      const good = (Array.isArray(goods) ? goods : []).find((item) => String(item._id) === String(prefill.productId));
      if (good) {
        setSelectedProduct(good);
        setProductSearchText(good.fullName);
      }
      const sizeItem = (Array.isArray(sizes) ? sizes : []).find((item) => item.Roz_Opis === prefill.size);
      if (sizeItem) {
        setSelectedSize(sizeItem);
        setSize(sizeItem.Roz_Opis);
      }
    }
    if (prefill?.price) {
      setPrice(String(prefill.price));
      priceTouchedRef.current = true;
    }
    setScannerType('zwrot');
    afterModalClose(() => setZwrotModalVisible(true));
  };

  // Zapis zwrotu: zaznaczone odbiory (cena z odbioru) i kurtki sprzed systemu (cena wpisana) - jednym zapisem
  const submitReturn = async () => {
    if (returnCount === 0) {
      appAlert('Zwrot', 'Zaznacz kurtki z listy albo dodaj kurtkę sprzed systemu.');
      return false;
    }
    if (savingRef.current) return false;
    savingRef.current = true;
    try {
      setLoading(true);
      const items = [
        ...selectedSaleIds.map((saleId) => ({ saleId })),
        ...historicalItems.map((item) => ({ historical: true, productId: item.productId, size: item.size || '-', barcode: item.barcode || '', price: item.price })),
      ];
      const clientRequestId = requestIdFor('zwrot', items);
      const response = await tokenService.authenticatedFetch(getApiUrl('/cudzich/returns'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, notes: '', clientRequestId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        appAlert('Błąd', data.error || 'Nie udało się zapisać zwrotu');
        return false;
      }
      requestDone('zwrot');
      const count = data.count || items.length;
      setSuccessMessage(`Zwrot zapisany: ${count} ${jacketsWord(count)}\nCzeka na przyjęcie w MAGAZYNIE (Dobieranie)\nKredyt: ${formatPln(data.credit ?? returnCredit)}\n${balanceText(data.newBalance)}`);
      setSuccessModalVisible(true);
      setSelectedSaleIds([]);
      setHistoricalItems([]);
      await Promise.all([fetchBalance(), fetchTransactions(1), fetchOpenOdbiory()]);
      return true;
    } catch (error) {
      Logger.error('Error saving Cudzich return:', error);
      appAlert('Błąd', 'Nie udało się połączyć z serwerem');
      return false;
    } finally {
      savingRef.current = false;
      setLoading(false);
    }
  };

  const confirmReturnFromList = async () => {
    const saved = await submitReturn();
    if (saved) setReturnListVisible(false);
  };

  const formatCandidateDate = (value) => new Date(value).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });

  // Save scanned product transaction
  const saveTransaction = async (type, productName, productSize, productPrice, productNotes, scannedBarcode = '', knownProductId = null) => {
    // Tylko odbiór - zwrot idzie przez listę kurtek (POST /cudzich/returns), nigdy tędy
    if (type !== 'odbior') return false;
    if (savingRef.current) return false;
    savingRef.current = true;
    try {
      setLoading(true);
      
      // Produkt: z odczytu kodu (karta produktu), a w ręcznym formularzu - po nazwie
      let productId = knownProductId;
      
      if (!productId && goods && Array.isArray(goods)) {
        const matchedProduct = goods.find(good => 
          good.fullName === productName
        );
        
        if (matchedProduct) {
          productId = matchedProduct._id;
          Logger.debug('DEBUG: Found matching product ID:', productId, 'for name:', productName);
        } else {
          Logger.debug('DEBUG: No matching product found for name:', productName);
          Logger.debug('DEBUG: Available products sample:', goods.slice(0, 3).map(g => g.fullName));
        }
      }
      
      // If no productId found, alert user
      if (!productId) {
        appAlert('Błąd', `Nie znaleziono produktu "${productName}" w bazie danych. Sprawdź czy produkt istnieje w systemie.`);
        return false;
      }
      
      // Odbiór jednym zapisem (30.10.2026): serwer zapisuje wpis w saldzie i sprzedaż w kasie P razem albo wcale.
      // Dawniej dwa osobne zapisy - gdy sprzedaż się nie udała, zostawał dług bez sprzedaży, a telefon pokazywał sukces.
      const clientRequestId = requestIdFor('odbior', [productId, productSize, parseFloat(productPrice), scannedBarcode, selectedOption]);
      const response = await tokenService.authenticatedFetch(getApiUrl('/cudzich/odbior'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId,
          productId,
          productName,
          size: productSize,
          price: parseFloat(productPrice),
          barcode: scannedBarcode || '',
          from: selectedOption || 'P', // „Sprzedano od”
          notes: productNotes || '',
        }),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        requestDone('odbior');
        setSuccessMessage(
          `Odbiór został zapisany\nProdukt: ${productName} ${productSize}\nCena: ${formatPln(productPrice)}\n${balanceText(data.newBalance)}`
        );
        setSuccessModalVisible(true);
        await Promise.all([fetchBalance(), fetchTransactions(1), fetchOpenOdbiory()]);
        return true;
      }
      const errorData = await response.json().catch(() => ({}));
      appAlert('Błąd', errorData.error || 'Nie udało się zapisać odbioru');
      return false;
    } catch (error) {
      Logger.error('Error saving scanned transaction:', error);
      appAlert('Błąd', 'Nie udało się połączyć z serwerem');
      return false;
    } finally {
      savingRef.current = false;
      setLoading(false);
    }
  };

  // Create payment transaction (wpłata lub wypłata)
  // „Rozlicz saldo” (30.10.2026) zamiast osobnych Wpłata / Wypłata: kierunek wynika z salda - Cudzich jest nam winien
  // → wpłata od Cudzicha, należy zwrócić Cudzichowi → wypłata dla Cudzicha; kwota do rozliczenia od razu w polu
  // (można wpisać mniej - rozliczenie częściowe, więcej niż saldo nie)
  const settleSubtitle = () => {
    const info = cudzichBalanceInfo(balance);
    if (Number(balance) > 0.004) return `Cudzich płaci nam ${info.amount.toFixed(2)} zł`;
    if (Number(balance) < -0.004) return `Oddajemy Cudzichowi ${info.amount.toFixed(2)} zł`;
    return 'Saldo rozliczone';
  };
  const settleDue = Math.abs(Number(balance) || 0);
  const openSettle = () => {
    const value = Number(balance) || 0;
    if (Math.abs(value) < 0.005) {
      appAlert('Rozlicz saldo', 'Saldo jest rozliczone - nikt nikomu nic nie jest winien.');
      return;
    }
    resetPaymentForm();
    setPaymentAmount(String(Math.round(Math.abs(value) * 100) / 100));
    if (value > 0) setWplataModalVisible(true);
    else setWyplataModalVisible(true);
  };
  const confirmSettle = () => {
    const amount = Number(String(paymentAmount || '').replace(',', '.'));
    if (amount > settleDue + 0.004) {
      appAlert('Rozlicz saldo', `Kwota nie może być większa niż saldo do rozliczenia (${settleDue.toFixed(2)} zł).`);
      return;
    }
    createPaymentTransaction(wplataModalVisible ? 'wplata' : 'wyplata');
  };

  const createPaymentTransaction = async (type) => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      appAlert('Błąd', 'Proszę wpisać prawidłową kwotę');
      return;
    }

    if (savingRef.current) return;
    savingRef.current = true;
    try {
      setLoading(true);
      
      const response = await tokenService.authenticatedFetch(getApiUrl('/cudzich/transactions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientRequestId: requestIdFor('rozliczenie', [type, parseFloat(paymentAmount)]),
          type: type,
          price: parseFloat(paymentAmount),
          userSymbol: 'P',
          recipientId: 'cudzich',
          notes: paymentNotes
        })
      });

      if (response.ok) {
        const data = await response.json();
        requestDone('rozliczenie');
        setSuccessMessage(
          `${type === 'wplata' ? 'Cudzich zapłacił' : 'Oddano Cudzichowi'}: ${parseFloat(paymentAmount).toFixed(2)} zł\n${balanceText(data.newBalance)}`
        );
        setSuccessModalVisible(true);
        
        // Refresh data
        await Promise.all([fetchBalance(), fetchTransactions(1)]);
        
        // Reset form and close modal
        resetPaymentForm();
        setWplataModalVisible(false);
        setWyplataModalVisible(false);
      } else {
        const errorData = await response.json();
        appAlert('Błąd', errorData.error || 'Nie udało się zapisać płatności');
      }
    } catch (error) {
      Logger.error('❌ Error creating payment:', error);
      appAlert('Błąd', 'Nie udało się połączyć z serwerem');
    } finally {
      savingRef.current = false;
      setLoading(false);
    }
  };

  // Reset form
  const resetForm = () => {
    priceTouchedRef.current = false;
    historicalConfirmedRef.current = false;
    setSelectedProduct(null);
    setProductSearchText('');
    setSelectedSize(null);
    setSize('');
    setPrice('');
    setNotes('');
    setProductDropdownVisible(false);
    setSizeDropdownVisible(false);
  };

  // Reset payment form
  const resetPaymentForm = () => {
    setPaymentAmount('');
    setPaymentNotes('');
  };

  // --- Odczyt kodu z metki (30.10.2026): jak w „Dodaj” i w całej aplikacji ---
  // Nazwa: karta produktu (kurtki po modelu + kolorze z kodu, reszta po pełnym kodzie), potem sztuka na stanie,
  // na końcu słowniki (model + kolor). Dawniej nazwa była składana tylko ze słowników - nie zgadzała się z kartą
  // produktu, więc nie było pełnej nazwy, ceny ani produktu do zapisu.
  // Cena: cennik Cudzich (z wyjątkiem rozmiaru), a gdy go nie ma albo nie ma w nim produktu - karta produktu.
  const priceListItems = Array.isArray(cudzichPriceList?.items) ? cudzichPriceList.items : null;
  const priceText = (value) => (Number(value) > 0 ? String(Number(value)) : '');

  const getPriceFromProduct = (product, sizeItem = null) => {
    if (!product) return '';
    const { price: listPrice, discount_price } = resolveSalePrice({ good: product, size: sizeItem, priceList: priceListItems });
    return priceText(listPriceOf(listPrice, discount_price));
  };

  const describeScannedCode = (code) => {
    const goodsList = Array.isArray(goods) ? goods : [];
    const sizesList = Array.isArray(sizes) ? sizes : [];
    const good = findGoodForBarcode(code, goodsList);
    if (good) {
      const sizeItem = findSizeForBarcode(code, sizesList);
      const sizeLabel = sizeItem?.Roz_Opis && !/NIEOKRE/i.test(sizeItem.Roz_Opis) ? sizeItem.Roz_Opis : '-';
      return { name: good.fullName, size: sizeLabel, productId: good._id, price: getPriceFromProduct(good, sizeItem), known: true };
    }
    const stateItem = (Array.isArray(stateData) ? stateData : []).find((item) => item.barcode === code);
    if (stateItem?.fullName) {
      const stateGood = goodsList.find((item) => item.fullName === stateItem.fullName) || null;
      const sizeItem = sizesList.find((item) => item.Roz_Opis === stateItem.size) || null;
      return {
        name: stateItem.fullName,
        size: stateItem.size || '-',
        productId: stateGood?._id || null,
        price: stateGood ? getPriceFromProduct(stateGood, sizeItem) : '',
        known: true,
      };
    }
    const toMap = (list, key, value) => Object.fromEntries((Array.isArray(list) ? list : []).map((item) => [item[key], item[value]]));
    const fallbackName = productNameFromBarcode(code, {
      sizeByKod: toMap(sizes, 'Roz_Kod', 'Roz_Opis'),
      stockByKod: toMap(stocks, 'Tow_Kod', 'Tow_Opis'),
      colorByKod: toMap(colors, 'Kol_Kod', 'Kol_Opis'),
    });
    return { name: fallbackName, size: '-', productId: null, price: '', known: false };
  };

  // Pełna nazwa do okienka „Wpisz kod” i napisu w ramce skanera (null = kod spoza bazy)
  const displayName = (info) => (info.size && info.size !== '-' ? `${info.name} ${info.size}` : info.name);
  const resolveScannedName = (code) => {
    const info = describeScannedCode(code);
    return info.known ? displayName(info) : null;
  };

  const handleScan = async ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setBarcode(data);
    const info = describeScannedCode(data);
    setScannedProductData({ name: info.name, size: info.size, barcode: data, price: info.price, productId: info.productId });

    // „Sprzedano od” - tylko przy odbiorze (zalogowany punkt, gdy jest w tej lokalizacji)
    if (scannerType === 'odbior') {
      const availableOptions = getMatchingSymbols(data);
      const currentUserInLocation = availableOptions.find((option) => option.symbol === user?.symbol);
      setSelectedOption(currentUserInLocation ? user.symbol : (availableOptions[0]?.symbol || ''));
    }

    if (scannerType === 'zwrot') {
      setScannerVisible(false);
      setScanned(false);
      applyReturnCode(data);
      return;
    }

    setScannerVisible(false);
    setScannedProductModalVisible(true);
  };

  const confirmScannedProduct = async () => {
    const amount = Number(String(scannedProductData.price || '').replace(',', '.'));
    if (!(amount > 0)) {
      appAlert('Brak ceny', `Wpisz cenę dla „${displayName(scannedProductData)}” - nie ma jej w cenniku Cudzich ani na karcie produktu.`);
      return;
    }
    const saved = await saveTransaction(
      scannerType, scannedProductData.name, scannedProductData.size, amount, '', scannedProductData.barcode, scannedProductData.productId
    );
    if (saved) {
      setScannedProductModalVisible(false);
      setScanned(false);
    }
  };


  // Get matching symbols for selling point selection (copied from QRScanner)
  const getMatchingSymbols = (currentBarcode = barcode) => {
    if (!users || !user) {
      return [];
    }

    // Filtruj użytkowników z tej samej lokalizacji co zalogowany użytkownik
    const sameLocationUsers = users.filter(u => 
      u.location && user.location && 
      u.location.trim() === user.location.trim() && 
      u.role !== 'admin' && 
      u.role !== 'magazyn' &&
      u.sellingPoint && 
      u.sellingPoint.trim() !== ''
    );
    
    return sameLocationUsers;
  };




  // Date filter functions
  const clearDateFilters = () => {
    setFilterStartDate(null);
    setFilterEndDate(null);
    setFilterTypes([]);
  };




  // Pull to refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  };

  // Lista transakcji: z filtrem dat - tylko wynik filtra (także pusty), bez filtra - cała historia
  const dateFilterActive = Boolean(filterStartDate || filterEndDate || filterTypes.length > 0);

  // Access control check
  if (user?.symbol !== 'P') {
    return (
      <SafeAreaView style={{
        flex: 1,
        backgroundColor: tc('bg', "#000000"),
        paddingBottom: Math.max(20, insets.bottom + 20)
      }}>
        <View style={styles.content}>
          <Text style={styles.text}>Brak dostępu do tej sekcji</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{
      flex: 1,
      backgroundColor: tc('bg', "#000000"),
      paddingBottom: Math.max(20, insets.bottom + 20)
    }}>
      {/* Kamera i formularz po skanie zajmują cały ekran (jak w „Dodaj”) - lista schowana, nie dzieli z nimi ekranu */}
      {!scannerVisible && !scannedProductModalVisible && (
        <FlatList
          testID="cudzich-transactions-list"
          data={transactions}
          keyExtractor={(item) => String(item._id)}
          renderItem={({ item }) => <CudzichTransactionCard transaction={item} />}
          ListHeaderComponent={(
            <View>
        {/* Wygląd jak w panelu admina (30.10.2026): nagłówek zakładki, karta salda, karty menu, karty transakcji */}
        <View>
          <ScreenHeader icon="people" title="Cudzich" subtitle="Odbiory, zwroty i rozliczenia" />

          <CudzichBalanceCard balance={balance} itemsCount={returnCandidates.length} />

          <Text style={look.sectionLabel}>Operacje</Text>
          <MenuCard
            testID="cudzich-action-odbior"
            icon={CUDZICH_TYPES.odbior.icon}
            color={CUDZICH_TYPES.odbior.color}
            title="Odbiór"
            subtitle="Cudzich bierze kurtkę - skanuj metkę"
            onPress={() => {
              setScannerType('odbior');
              setScannerVisible(true);
            }}
          />
          <MenuCard
            testID="cudzich-action-zwrot"
            icon={CUDZICH_TYPES.zwrot.icon}
            color={CUDZICH_TYPES.zwrot.color}
            title="Zwrot"
            subtitle="Cudzich oddaje kurtkę - wybierz z listy albo zeskanuj"
            onPress={openReturnList}
          />
          <MenuCard
            testID="cudzich-action-settle"
            icon="swap-horizontal"
            color={cudzichBalanceInfo(balance).color}
            title="Rozlicz saldo"
            subtitle={settleSubtitle()}
            onPress={openSettle}
          />

          {/* Historia transakcji: nagłówek sekcji z przyciskiem filtra jak w ekranach admina */}
          <View style={styles.historyHeader}>
            <Text style={[look.sectionLabel, { flex: 1, marginBottom: 0 }]}>
              Historia transakcji{transactionsTotal > 0 ? ` (${transactionsTotal})` : ''}
            </Text>
            <IconButton
              icon={dateFilterActive ? 'funnel' : 'funnel-outline'}
              color={dateFilterActive ? '#0D6EFD' : tc('muted', '#94A3B8')}
              onPress={() => setDateFilterVisible(true)}
              accessibilityLabel="Filtruj historię"
              testID="cudzich-date-filter"
            />
          </View>

          {dateFilterActive && (
            <View style={[look.chip, styles.periodChip]} testID="cudzich-filter-chip">
              <Ionicons name="funnel-outline" size={14} color="#0D6EFD" />
              <Text style={[look.chipText, { flexShrink: 1 }]} numberOfLines={2}>
                {filterLabel({ start: filterStartDate, end: filterEndDate, types: filterTypes })}
              </Text>
              <TouchableOpacity onPress={clearDateFilters} accessibilityLabel="Wyczyść filtry" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={tc('muted', '#94A3B8')} />
              </TouchableOpacity>
            </View>
          )}

          {/* Podsumowanie wybranego okresu (serwer): ile i za ile każdego rodzaju - pomocne przy rozliczeniu miesiąca */}
          {dateFilterActive && periodSummary ? (
            <View style={styles.summaryGrid} testID="cudzich-period-summary">
              {['odbior', 'zwrot', 'wplata', 'wyplata']
                .filter((type) => filterTypes.length === 0 || filterTypes.includes(type))
                .map((type) => (
                  <View key={type} style={[styles.summaryTile, { borderColor: `${CUDZICH_TYPES[type].color}80` }]}>
                    <Text style={[styles.summaryTileLabel, { color: CUDZICH_TYPES[type].color }]} numberOfLines={1}>
                      {{ odbior: 'Odbiory', zwrot: 'Zwroty', wplata: 'Wpłaty', wyplata: 'Wypłaty' }[type]} ({periodSummary[type]?.count || 0})
                    </Text>
                    <Text style={styles.summaryTileValue} numberOfLines={1} testID={`cudzich-summary-${type}`}>
                      {formatPln(periodSummary[type]?.sum)}
                    </Text>
                  </View>
                ))}
            </View>
          ) : null}
        </View>
            </View>
          )}
          ListEmptyComponent={transactionsError ? null : (
            <View style={look.emptyState}>
              <Ionicons name="swap-horizontal-outline" size={48} color={tc('muted', '#64748B')} />
              <Text style={look.emptyStateText}>
                {dateFilterActive ? 'Brak transakcji w wybranym okresie' : 'Brak transakcji'}
              </Text>
            </View>
          )}
          ListFooterComponent={loadingMore ? (
            <View style={{ paddingVertical: 16 }}><ActivityIndicator color="#0D6EFD" /></View>
          ) : (transactionsError ? (
            // historia się nie wczytała (brak sieci, błąd serwera) - nie udajemy pustej listy
            <View style={look.emptyState} testID="cudzich-transactions-error">
              <Ionicons name="cloud-offline-outline" size={40} color="#EF4444" />
              <Text style={look.emptyStateText}>Nie udało się wczytać historii.</Text>
              <TouchableOpacity
                style={[look.neutralButton, { flex: 0, paddingHorizontal: 20, marginTop: 10 }]}
                onPress={() => fetchTransactions(transactions.length > 0 && transactionsHasMore ? transactionsPage + 1 : 1)}
                testID="cudzich-transactions-retry"
              >
                <Text style={look.neutralButtonText}>Spróbuj ponownie</Text>
              </TouchableOpacity>
            </View>
          ) : null)}
          onEndReached={loadMoreTransactions}
          onEndReachedThreshold={0.6}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          // miejsce na dolny pasek zakładek - ostatnia transakcja nie chowa się pod nim (jak na innych ekranach)
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: Math.max(120, insets.bottom + 120) }}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Transaction Modal (shared for odbior and zwrot) */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={odbiorModalVisible || zwrotModalVisible}
        onRequestClose={() => {
          const backToReturn = zwrotModalVisible;
          setOdbiorModalVisible(false);
          setZwrotModalVisible(false);
          resetForm();
          if (backToReturn) afterModalClose(() => setReturnListVisible(true));
        }}
      >
        <KeyboardSafeOverlay>
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, { maxHeight: '90%' }]}>
            <ModalHeader
              icon={odbiorModalVisible ? 'arrow-down-circle' : 'return-up-back'}
              color={odbiorModalVisible ? '#EF4444' : '#10B981'}
              title={odbiorModalVisible ? 'Odbiór kurtki' : 'Kurtka sprzed systemu (zapłacona)'}
            />

            <ScrollView 
              style={{ width: '100%' }}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >

            {/* Product search */}
            <View style={styles.formField}>
              <View style={styles.productHeaderContainer}>
                <Text style={look.formLabel}>Wybierz produkt:</Text>
                {odbiorModalVisible && (
                  <TouchableOpacity
                    style={styles.scanButton}
                    onPress={() => {
                      if (!permission) {
                        requestPermission();
                        return;
                      }
                      if (!permission.granted) {
                        requestPermission();
                        return;
                      }
                      setScannerVisible(true);
                      setScanned(false);
                    }}
                  >
                    <Ionicons name="barcode-outline" size={18} color="#fff" />
                    <Text style={styles.scanButtonText}>Skanuj kod</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Wyszukaj kurtkę lub zeskanuj kod..."
                value={productSearchText}
                onChangeText={(text) => {
                  setProductSearchText(text);
                  setProductDropdownVisible(text.length > 0);
                  // Clear selected product if text doesn't match
                  if (selectedProduct && !selectedProduct.fullName.toLowerCase().includes(text.toLowerCase())) {
                    setSelectedProduct(null);
                    priceTouchedRef.current = false;
                    setPrice('');
                  }
                }}
                onFocus={() => {
                  if (productSearchText.length > 0) setProductDropdownVisible(true);
                }}
                placeholderTextColor={tc('muted', "#666")}
              />

              {/* Product dropdown */}
              {productDropdownVisible && productSearchText && (
                <View style={{
                  maxHeight: 160,
                  backgroundColor: tc('surface2', '#1E1E2D'),
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: tc('border', '#334155'),
                  marginBottom: 10,
                }}>
                  <TouchableOpacity
                    style={{
                      position: 'absolute',
                      top: 5,
                      right: 10,
                      zIndex: 1,
                      backgroundColor: tc('surface2', '#333'),
                      borderRadius: 10,
                      width: 20,
                      height: 20,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                    onPress={() => setProductDropdownVisible(false)}
                  >
                    <Text style={{ color: tc('text', '#fff'), fontSize: 12 }}>×</Text>
                  </TouchableOpacity>
                  <ScrollView>
                    {filteredProducts.length > 0 ? (
                      filteredProducts.slice(0, 10).map((item) => (
                        <TouchableOpacity
                          key={item._id}
                          style={{
                            padding: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: tc('border', '#333'),
                            backgroundColor: selectedProduct?._id === item._id ? 'rgba(13, 110, 253, 0.2)' : 'transparent',
                          }}
                          onPress={() => {
                            handleProductSelect(item);
                            setProductDropdownVisible(false);
                          }}
                        >
                          <Text style={{ color: tc('text', '#fff'), fontSize: 14 }}>
                            {item.fullName}
                          </Text>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <Text style={{ color: tc('muted', '#ccc'), fontSize: 13, padding: 12, textAlign: 'center' }}>
                        {!goods || goods.length === 0 ? 'Brak dostępnych produktów' : 'Brak produktów pasujących do wyszukiwania'}
                      </Text>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Size dropdown */}
            <View style={styles.formField}>
              <Text style={look.formLabel}>Rozmiar:</Text>
              <TextInput
                style={styles.input}
                placeholder="Wpisz rozmiar..."
                autoCapitalize="characters" // rozmiar wielkimi literami
                placeholderTextColor={tc('muted', "#ccc")}
                value={size}
                onChangeText={(text) => {
                  setSize(text);
                  // wpisany ręcznie rozmiar różny od wybranego - wybór z listy od nowa (inaczej kod metki z poprzedniego rozmiaru)
                  if (selectedSize && text !== (selectedSize.Roz_Opis || selectedSize.nazwa || selectedSize.name)) setSelectedSize(null);
                  setSizeDropdownVisible(text.length > 0);
                }}
                onFocus={() => {
                  if (size.length > 0) setSizeDropdownVisible(true);
                }}
              />

              {/* Size dropdown list */}
              {sizeDropdownVisible && size && (
                <View style={{
                  maxHeight: 160,
                  backgroundColor: tc('surface2', '#1E1E2D'),
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: tc('border', '#334155'),
                  marginBottom: 10,
                }}>
                  <TouchableOpacity
                    style={{
                      position: 'absolute',
                      top: 5,
                      right: 10,
                      zIndex: 1,
                      backgroundColor: tc('surface2', '#333'),
                      borderRadius: 10,
                      width: 20,
                      height: 20,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                    onPress={() => setSizeDropdownVisible(false)}
                  >
                    <Text style={{ color: tc('text', '#fff'), fontSize: 12 }}>×</Text>
                  </TouchableOpacity>
                  <ScrollView>
                    {sizes.filter((item) => {
                      const query = size.toLowerCase().trim();
                      const opis = (item.Roz_Opis || item.nazwa || item.name || '').toLowerCase();
                      const kod = (item.Roz_Kod || '').toLowerCase();
                      
                      // Exact match or starts with query
                      return opis === query || kod === query || 
                             opis.startsWith(query + ' ') || kod.startsWith(query + ' ') ||
                             opis.startsWith(query) || kod.startsWith(query);
                    }).length > 0 ? (
                      sizes.filter((item) => {
                        const query = size.toLowerCase().trim();
                        const opis = (item.Roz_Opis || item.nazwa || item.name || '').toLowerCase();
                        const kod = (item.Roz_Kod || '').toLowerCase();
                        
                        // Exact match or starts with query
                        return opis === query || kod === query || 
                               opis.startsWith(query + ' ') || kod.startsWith(query + ' ') ||
                               opis.startsWith(query) || kod.startsWith(query);
                      }).slice(0, 10).map((item) => {
                        const sizeText = item.Roz_Opis || item.nazwa || item.name;
                        return (
                          <TouchableOpacity
                            key={item._id}
                            style={{
                              padding: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: tc('border', '#333'),
                              backgroundColor: selectedSize?._id === item._id ? 'rgba(13, 110, 253, 0.2)' : 'transparent',
                            }}
                            onPress={() => {
                              setSelectedSize(item);
                              setSize(sizeText);
                              setSizeDropdownVisible(false);
                            }}
                          >
                            <Text style={{ color: tc('text', '#fff'), fontSize: 14 }}>
                              {sizeText}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    ) : (
                      <Text style={{ color: tc('muted', '#ccc'), fontSize: 13, padding: 12, textAlign: 'center' }}>
                        {!sizes || sizes.length === 0 ? 'Brak dostępnych rozmiarów' : 'Brak pasujących rozmiarów'}
                      </Text>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Price input */}
            <View style={styles.formField}>
              <Text style={look.formLabel}>{zwrotModalVisible ? 'Kredyt dla Cudzicha (cena rozliczenia sprzed systemu):' : 'Cena (zł):'}</Text>
              {/* Cena od razu po wyborze produktu (i rozmiaru): cennik Cudzich, bez niego karta produktu; można poprawić.
                  Zwrot wskazanego odbioru - cena z odbioru (bez edycji) */}
              <TextInput
                testID="cudzich-manual-price"
                style={styles.input}
                placeholder="Brak ceny w cenniku - wpisz cenę"
                value={price}
                onChangeText={(value) => { priceTouchedRef.current = true; setPrice(sanitizeAmountInput(value)); }}
                keyboardType="decimal-pad"
                placeholderTextColor={tc('muted', "#666")}
              />
            </View>

            {/* Notes input */}
            <View style={styles.formField}>
              <Text style={look.formLabel}>Uwagi (opcjonalne):</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder="Dodatkowe informacje..."
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholderTextColor={tc('muted', "#666")}
              />
            </View>

            {/* Zwrot: wybór odbioru (cena z odbioru) albo kurtka sprzed systemu (cena do wpisania) */}

            </ScrollView>

            {/* Modal buttons */}
            <View style={look.buttonRow}>
              <TouchableOpacity
                style={look.neutralButton}
                onPress={() => {
                  const backToReturn = zwrotModalVisible;
                  setOdbiorModalVisible(false);
                  setZwrotModalVisible(false);
                  resetForm();
                  if (backToReturn) afterModalClose(() => setReturnListVisible(true));
                }}
              >
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  look.primaryButton,
                  { backgroundColor: odbiorModalVisible ? '#EF4444' : '#10B981' }
                ]}
                onPress={() => createTransaction(odbiorModalVisible ? 'odbior' : 'zwrot')}
                disabled={loading}
              >
                <Text style={look.buttonText}>
                  {odbiorModalVisible ? 'Zapisz Odbiór' : 'Dodaj do zwrotu'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardSafeOverlay>
      </Modal>

      {/* Payment Modal (shared for wpłata and wypłata) */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={wplataModalVisible || wyplataModalVisible}
        onRequestClose={() => {
          resetPaymentForm();
          setWplataModalVisible(false);
          setWyplataModalVisible(false);
        }}
      >
        <KeyboardSafeOverlay>
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, { maxHeight: '90%' }]}>
            <ModalHeader
              icon="swap-horizontal"
              color={cudzichBalanceInfo(balance).color}
              title="Rozlicz saldo"
            />
            {/* Kto komu ile - słownie, jak na karcie salda */}
            <View style={[styles.settleInfo, { borderColor: cudzichBalanceInfo(balance).color }]} testID="cudzich-settle-info">
              <Text style={[styles.settleInfoLabel, { color: cudzichBalanceInfo(balance).color }]}>{cudzichBalanceInfo(balance).label}</Text>
              <Text style={[styles.settleInfoAmount, { color: cudzichBalanceInfo(balance).color }]}>{settleDue.toFixed(2)} zł</Text>
            </View>

            <ScrollView 
              style={{ width: '100%' }}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >

            {/* Amount input */}
            <View style={styles.formField}>
              <Text style={look.formLabel}>{wplataModalVisible ? 'Kwota, którą Cudzich płaci (zł):' : 'Kwota, którą oddajemy Cudzichowi (zł):'}</Text>
              <TextInput
                testID="cudzich-settle-amount"
                style={styles.input}
                placeholder="Wpisz kwotę..."
                value={paymentAmount}
                onChangeText={(value) => setPaymentAmount(sanitizeAmountInput(value))}
                keyboardType="decimal-pad"
                placeholderTextColor={tc('muted', "#666")}
              />
              {Number(paymentAmount) > 0 && Number(paymentAmount) < settleDue - 0.004 ? (
                <Text style={styles.settleHint}>Rozliczenie częściowe - zostanie {(settleDue - Number(paymentAmount)).toFixed(2)} zł</Text>
              ) : null}
            </View>

            {/* Notes input */}
            <View style={styles.formField}>
              <Text style={look.formLabel}>Uwagi (opcjonalne):</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder="Dodatkowe informacje..."
                value={paymentNotes}
                onChangeText={setPaymentNotes}
                multiline={true}
                numberOfLines={3}
                placeholderTextColor={tc('muted', "#666")}
              />
            </View>

            </ScrollView>

            {/* Modal buttons */}
            <View style={styles.stackedButtons}>
              <TouchableOpacity
                testID="cudzich-settle-confirm"
                style={[look.primaryButton, styles.stackedButton, { backgroundColor: cudzichBalanceInfo(balance).color }, loading && look.disabled]}
                onPress={confirmSettle}
                disabled={loading}
              >
                <Text style={look.buttonText} numberOfLines={1}>
                  {loading ? 'Zapisywanie…' : (wplataModalVisible ? 'Cudzich zapłacił - rozlicz' : 'Oddajemy Cudzichowi - rozlicz')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[look.neutralButton, styles.stackedButton]}
                onPress={() => {
                  resetPaymentForm();
                  setWplataModalVisible(false);
                  setWyplataModalVisible(false);
                }}
              >
                <Text style={look.neutralButtonText} numberOfLines={1}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardSafeOverlay>
      </Modal>

      {/* Filtr historii: zakres „Od – Do” z kalendarzem, szybkie zakresy, rodzaje operacji */}
      <CudzichFilterModal
        visible={dateFilterVisible}
        value={{ start: filterStartDate, end: filterEndDate, types: filterTypes }}
        onClose={() => setDateFilterVisible(false)}
        onApply={({ start, end, types }) => {
          setFilterStartDate(start);
          setFilterEndDate(end);
          setFilterTypes(types);
          setDateFilterVisible(false);
        }}
      />

      {/* QR Scanner Modal - identical to QRScanner component */}
      {scannerVisible && (
        <View style={qrStyles.container} testID="cudzich-scanner">
          {/* Ta sama kamera co w zakładce „Dodaj” (QRScanner): ramka, „Odczytaj ze zdjęcia”, „Wpisz kod”, czytnik;
              na cały ekran zakładki. Produkt bez metki: „Z bazy” (jak w Remanencie). */}
          <ScanCamera
            enabled={!scanned && basePickerFor === null}
            onScanned={handleScan}
            resolveName={resolveScannedName}
            facing={facing}
            extraActions={[{ label: 'Z bazy', icon: 'list-outline', testID: 'cudzich-scan-base', onPress: () => setBasePickerFor(scannerType === 'zwrot' ? 'zwrot' : 'odbior') }]}
          >
            
            {/* Close button in top right corner */}
            <TouchableOpacity
              style={qrStyles.closeButton}
              onPress={() => {
                setScannerVisible(false);
                setScanned(false);
              }}
            >
              <Ionicons name="close" size={24} color={tc('text', '#fff')} />
            </TouchableOpacity>
            
            {/* Przycisk do resetowania skanowania - pokazuje się tylko gdy scanned=true */}
            {scanned && (
              <View style={{ position: "absolute", bottom: 100, left: 0, right: 0, alignItems: "center" }}>
                <TouchableOpacity
                  style={[look.primaryButton, { flex: 0, flexDirection: 'row', gap: 8, paddingHorizontal: 24 }]}
                  onPress={() => {
                    setScanned(false);
                  }}
                >
                  <Ionicons name="scan" size={20} color="#fff" />
                  <Text style={look.buttonText}>Skanuj ponownie</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScanCamera>
        </View>
      )}

      {/* Scanned Product Modal - identical to QRScanner */}
      {scannedProductModalVisible && (
        <KeyboardSafeScreen>
        <View style={{ flex: 1, backgroundColor: tc('bg', "black"), width: "100%", height: "100%", justifyContent: "flex-start", alignItems: "stretch", zIndex: 5 }}>
          <ScrollView style={{ width: '100%' }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={[qrStyles.scrollViewContent, { padding: 0, paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(120, insets.bottom + 120) }]}>
            <View style={[qrStyles.modalContent, { flex: 1, backgroundColor: tc('bg', "black"), width: undefined, height: undefined, alignSelf: 'stretch', padding: 0, paddingHorizontal: 20, paddingTop: 64, paddingBottom: 24, justifyContent: "flex-start", alignItems: "stretch", zIndex: 5 }]}>
              <TouchableOpacity
                style={qrStyles.closeButton}
                onPress={() => {
                  setScannedProductModalVisible(false);
                  setScanned(false);
                }}
              >
                <Ionicons name="close" size={24} color={tc('text', '#fff')} />
              </TouchableOpacity>
              <ModalHeader
                icon={scannerType === 'odbior' ? CUDZICH_TYPES.odbior.icon : CUDZICH_TYPES.zwrot.icon}
                color={scannerType === 'odbior' ? CUDZICH_TYPES.odbior.color : CUDZICH_TYPES.zwrot.color}
                title={scannerType === 'odbior' ? 'Odbiór - Cudzich bierze kurtkę' : 'Zwrot - Cudzich oddaje kurtkę'}
              />
              <Text style={look.formLabel}>Produkt</Text>
              <TextInput
                style={qrStyles.inputField}
                value={
                  // Kurtki: nazwa bez rozmiaru (do ceny z cennika), rozmiar osobno - pokazujemy oba
                  scannedProductData.size && scannedProductData.size !== '-' && !String(scannedProductData.name || '').endsWith(` ${scannedProductData.size}`)
                    ? `${scannedProductData.name} ${scannedProductData.size}`
                    : scannedProductData.name
                }
                editable={false}
              />
              <Text style={look.formLabel}>Gdzie</Text>
              <TextInput
                style={qrStyles.inputField}
                value={user?.sellingPoint || "Unknown"}
                editable={false}
                placeholder="Selling Point"
              />
              <Text style={look.formLabel}>Kod kreskowy</Text>
              <TextInput
                style={qrStyles.inputField}
                value={scannedProductData.barcode}
                editable={false}
                placeholder="Barcode"
              />
              {/* „Sprzedano od” jak w „Dodaj”: stan sztuki w każdym punkcie, punkt bez sztuki - korekta po Dobieraniu */}
              {scannerType === 'odbior' && (
                <SalePointPicker
                  value={selectedOption}
                  onChange={setSelectedOption}
                  barcode={scannedProductData.barcode}
                  points={getMatchingSymbols()}
                  users={users}
                  stateData={stateData}
                  location={user?.location}
                />
              )}
              

              {/* Cena od razu w polu: cennik Cudzich, bez niego karta produktu; można poprawić.
                  Zwrot wskazanego odbioru - cena z odbioru (bez edycji), żeby saldo się nie przesunęło */}
              <Text style={look.formLabel}>Cena (PLN)</Text>
              <TextInput
                testID="cudzich-scanned-price"
                style={qrStyles.inputField}
                value={scannedProductData.price}
                onChangeText={(value) => setScannedProductData((prev) => ({ ...prev, price: sanitizeAmountInput(value) }))}
                keyboardType="decimal-pad"
                placeholder="Brak ceny w cenniku - wpisz cenę"
                placeholderTextColor={tc('muted', '#64748B')}
              />
              
              <View style={look.buttonRow}>
                <TouchableOpacity
                  style={look.neutralButton}
                  onPress={() => {
                    setScannedProductModalVisible(false);
                    setScanned(false);
                  }}
                >
                  <Text style={look.neutralButtonText}>Anuluj</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[look.primaryButton, { backgroundColor: '#10B981' }, loading && look.disabled]}
                  testID="cudzich-scanned-confirm"
                  onPress={confirmScannedProduct}
                  disabled={loading}
                >
                  <Text style={look.buttonText} numberOfLines={1}>{loading ? 'Zapisywanie…' : 'Potwierdź'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
        </KeyboardSafeScreen>
      )}

      {/* Zwrot: lista kurtek u Cudzicha (niezwrócone odbiory) - wyszukiwarka, skan metki zawęża listę;
          zapis tworzy kurtkę do przyjęcia w Dobieraniu MAGAZYNU (nic nie dopisuje się do stanu automatycznie) */}
      <Modal
        transparent
        animationType="slide"
        visible={returnListVisible}
        onRequestClose={() => setReturnListVisible(false)}
      >
        <KeyboardSafeOverlay>
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, { maxHeight: '92%' }]} testID="cudzich-return-list">
            <ModalHeader
              icon={CUDZICH_TYPES.zwrot.icon}
              color={CUDZICH_TYPES.zwrot.color}
              title="Zwrot - zaznacz kurtki"
              subtitle={`U Cudzicha: ${returnCandidates.length} ${pluralKurtka(returnCandidates.length, 'kurtka')}`}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                testID="cudzich-return-search"
                style={[look.formInput, { flex: 1 }]}
                value={returnSearch}
                onChangeText={setReturnSearch}
                placeholder="Szukaj: nazwa, rozmiar, kod"
                placeholderTextColor={tc('muted', '#64748B')}
                autoCorrect={false}
              />
              <IconButton icon="scan" onPress={startReturnScan} accessibilityLabel="Skanuj metkę" testID="cudzich-return-scan" />
              <IconButton
                icon="list-outline"
                onPress={() => { setReturnListVisible(false); afterModalClose(() => setBasePickerFor('zwrot')); }}
                accessibilityLabel="Z bazy"
                testID="cudzich-return-base"
              />
            </View>
            {returnFilter ? (
              <View style={[look.chip, { alignSelf: 'flex-start', marginTop: 0, marginBottom: 8 }]}>
                <Ionicons name="scan-outline" size={14} color="#0D6EFD" />
                <Text style={look.chipText}>{displayName(returnFilter)}</Text>
                <TouchableOpacity onPress={() => setReturnFilter(null)} accessibilityLabel="Pokaż wszystkie kurtki" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={tc('muted', '#94A3B8')} />
                </TouchableOpacity>
              </View>
            ) : null}

            <ScrollView style={{ flexGrow: 0, maxHeight: 340 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {candidatesLoading ? <ActivityIndicator color="#0D6EFD" style={{ marginVertical: 12 }} /> : null}
              {visibleCandidates.map((candidate) => (
                <OptionCard
                  key={String(candidate.saleId)}
                  testID={`cudzich-return-sale-${candidate.saleId}`}
                  selected={selectedSaleIds.includes(String(candidate.saleId))}
                  icon={CUDZICH_TYPES.odbior.icon}
                  color={CUDZICH_TYPES.zwrot.color}
                  label={`${candidate.fullName} ${candidate.size && candidate.size !== '-' ? candidate.size : ''}\nodbiór ${formatCandidateDate(candidate.date)} · ${formatPln(candidate.price)}`}
                  onPress={() => toggleSale(String(candidate.saleId))}
                />
              ))}
              {!candidatesLoading && visibleCandidates.length === 0 ? (
                <Text style={[look.emptyStateText, { textAlign: 'center', marginVertical: 12 }]} testID="cudzich-return-empty">
                  {returnFilter
                    ? 'Tej kurtki nie ma na liście odbiorów - jeśli Cudzich wziął ją przed systemem, dodaj ją niżej jako „Kurtka sprzed systemu”.'
                    : (returnCandidates.length === 0 ? 'Cudzich nie ma żadnych kurtek z odbiorów w systemie.' : 'Nic nie znaleziono.')}
                </Text>
              ) : null}
              {/* Kurtki sprzed systemu dodane do tego zwrotu (cena wpisana = kredyt) - można usunąć */}
              {historicalItems.map((item) => (
                <View key={item.key} style={styles.historicalRow} testID={`cudzich-return-historical-item-${item.key}`}>
                  <Ionicons name="time-outline" size={18} color="#8B5CF6" />
                  <Text style={styles.historicalRowText} numberOfLines={1}>
                    {item.name}{item.size && item.size !== '-' ? ` ${item.size}` : ''} · sprzed systemu · {formatPln(item.price)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setHistoricalItems((prev) => prev.filter((entry) => entry.key !== item.key))}
                    accessibilityLabel="Usuń z tego zwrotu"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={20} color={tc('muted', '#94A3B8')} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            {/* Kurtka sprzed systemu - mały link w jednej linii (dawniej duża karta z opisem) */}
            <TouchableOpacity
              testID="cudzich-return-historical"
              style={styles.historicalLink}
              onPress={() => openHistoricalReturn(returnFilter)}
              accessibilityRole="button"
            >
              <Ionicons name="time-outline" size={18} color="#8B5CF6" />
              <Text style={styles.historicalLinkText} numberOfLines={1}>+ Kurtka sprzed systemu (zapłacona)</Text>
              <Ionicons name="chevron-forward" size={16} color="#8B5CF6" />
            </TouchableOpacity>

            {returnCount > 0 ? (
              <Text style={[look.modalMessage, { marginTop: 8 }]} testID="cudzich-return-summary">
                Zwracasz {returnCount} {jacketsWord(returnCount)} · kredyt dla Cudzicha {formatPln(returnCredit)}
              </Text>
            ) : null}

            {/* Przyciski jeden pod drugim, napisy w jednej linii */}
            <View style={styles.stackedButtons}>
              <TouchableOpacity
                testID="cudzich-return-confirm"
                style={[look.primaryButton, styles.stackedButton, { backgroundColor: CUDZICH_TYPES.zwrot.color }, (returnCount === 0 || loading) && look.disabled]}
                onPress={confirmReturnFromList}
                disabled={returnCount === 0 || loading}
              >
                <Text style={look.buttonText} numberOfLines={1}>
                  {loading ? 'Zapisywanie…' : (returnCount > 0 ? `Zwróć ${returnCount} ${jacketsWord(returnCount)} do MAGAZYNU` : 'Zwróć do MAGAZYNU')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[look.neutralButton, styles.stackedButton]} onPress={() => setReturnListVisible(false)}>
                <Text style={look.neutralButtonText} numberOfLines={1}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardSafeOverlay>
      </Modal>

      {/* „Z bazy” - wybór produktu z kart produktów zamiast skanu (odbiór i zwrot) */}
      <ProductBasePicker
        visible={basePickerFor !== null}
        goods={goods}
        sizes={sizes}
        title={basePickerFor === 'zwrot' ? 'Zwrot - wybierz z bazy' : 'Odbiór - wybierz z bazy'}
        onClose={() => {
          const target = basePickerFor;
          setBasePickerFor(null);
          if (target === 'zwrot' && !scannerVisible) afterModalClose(() => setReturnListVisible(true));
        }}
        onPick={(code) => {
          const target = basePickerFor;
          setBasePickerFor(null);
          if (target === 'zwrot') {
            // „Z bazy” w kamerze zwrotu: kamera się zamyka, wracamy do listy (dawniej kamera zostawała otwarta pod listą)
            setScannerVisible(false);
            setScanned(false);
            afterModalClose(() => applyReturnCode(code));
          } else {
            handleScan({ data: code });
          }
        }}
      />

      {/* Success Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={successModalVisible}
        onRequestClose={() => setSuccessModalVisible(false)}
      >
        <View style={qrStyles.successModalOverlay}>
          <View style={qrStyles.successModalContent}>
            <ModalHeader icon="checkmark-circle" color="#10B981" title="Gotowe" />
            <Text style={qrStyles.successModalMessage}>
              {successMessage}
            </Text>
            
            <TouchableOpacity
              style={[look.primaryButton, { flex: 0, alignSelf: 'stretch' }]}
              onPress={() => setSuccessModalVisible(false)}
            >
              <Text style={look.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  // nagłówek sekcji „Historia transakcji” z przyciskiem filtra (jak na ekranach admina)
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  // „Rozlicz saldo”: kto komu ile (słownie) i podpowiedź przy rozliczeniu częściowym
  settleInfo: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  settleInfoLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  settleInfoAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 2,
  },
  settleHint: {
    color: tc('muted', '#94A3B8'),
    fontSize: 13,
    marginTop: 6,
  },
  // lista zwrotu: link „Kurtka sprzed systemu” w jednej linii i przyciski jeden pod drugim
  historicalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8B5CF680',
    backgroundColor: '#8B5CF61F',
    marginBottom: 8,
  },
  historicalRowText: {
    flex: 1,
    color: tc('text', '#fff'),
    fontSize: 14,
    fontWeight: '600',
  },
  historicalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    marginTop: 4,
  },
  historicalLinkText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  stackedButtons: {
    marginTop: 12,
    gap: 10,
  },
  stackedButton: {
    flex: 0,
    alignSelf: 'stretch',
    paddingVertical: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  summaryTile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: tc('surface', '#161622'),
  },
  summaryTileLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryTileValue: {
    color: tc('text', '#fff'),
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  periodChip: {
    alignSelf: 'flex-start',
    marginTop: 0,
    marginBottom: 10,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: tc('text', 'white'),
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  
  // Header styles
  
  // Action buttons
  
  // Transactions
  
  // Modal styles
  
  // Form styles
  formField: {
    width: '100%',
    marginBottom: 15,
  },
  input: {
    width: '100%',
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: tc('text', 'white'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
  },
  notesInput: {
    width: '100%',
    height: 80,
    textAlignVertical: 'top',
  },
  
  // Product container
  
  // Product dropdown
  
  // Absolute dropdown to prevent layout shift
  
  // Modal buttons
  
  // Date picker styles
  
  // Dropdown container styles

  // Scanner styles

  // Scanner styles (adapted from QRScanner.jsx)
  productHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0D6EFD',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  scanButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
  },
  
  // Checkbox styles
  
}));

// QRScanner styles - identical to QRScanner component
const qrStyles = createThemedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc('bg', "black"), color: tc('text', "white") },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: "#0D6EFD",
    borderRadius: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('surface', '#161622'),
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    zIndex: 20,
  },
  closeButtonText: {
    color: "white",
    fontSize: 16,
    textAlign: "center",
  },
  modalContent: {
    width: "100%",
    height: "100%", 
    padding: 20,
    backgroundColor: tc('surface', "black"),
    borderRadius: 0,
    alignItems: "center",
    zIndex: 10,
    elevation: 5,
    overflow: "visible",
  },
  scrollViewContent: {
    flexGrow: 1,
    padding: 20,
  },
  inputField: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 16,
    width: "100%",
    color: tc('text', "#fff"),
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    width: "100%",
  },
  button: {
    flex: 1,
    marginHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "gray",
  },
  addButton: {
    backgroundColor: "green",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
  },
  // Modal styles for selling point selection
  currencyModalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  currencyModalContent: {
    width: "90%",
    maxHeight: "85%",
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
  },
  currencyModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: tc('text', "white"),
    marginBottom: 15,
  },
  currencyModalItem: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
  },
  currencyModalItemText: {
    color: tc('text', "white"),
    fontSize: 16,
    fontWeight: '600',
  },
  currencyModalCloseButton: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: tc('surface2', '#2a2a3e'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    alignItems: "center",
  },
  currencyModalCloseButtonText: {
    color: tc('text', "white"),
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Success Modal Styles
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModalContent: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 20,
    padding: 24,
    width: '85%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
  },
  successIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successIcon: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  successModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: tc('text', '#ffffff'),
    textAlign: 'center',
    marginBottom: 15,
  },
  successModalMessage: {
    fontSize: 15,
    color: tc('muted', '#CBD5E1'),
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  // Error Modal Styles
  errorModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorModalContent: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 20,
    padding: 24,
    width: '85%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
  },
  errorIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#dc3545',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorIcon: {
    color: tc('text', '#ffffff'),
    fontSize: 20,
    fontWeight: 'bold',
  },
  errorModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: tc('text', '#ffffff'),
    textAlign: 'center',
    marginBottom: 15,
  },
  errorModalMessage: {
    fontSize: 15,
    color: tc('muted', '#CBD5E1'),
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  // Button styles for modals
  optionButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    color: tc('text', '#ffffff'),
    fontSize: 16,
    fontWeight: 'bold',
  },
}));

export default Cudzych;
