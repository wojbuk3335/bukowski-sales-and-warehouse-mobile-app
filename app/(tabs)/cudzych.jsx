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
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useCameraPermissions } from "expo-camera";
import ScanCamera from "../../components/scanner/ScanCamera"; // skaner jak w całej aplikacji: ramka, zdjęcie, „Wpisz kod”
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafeScreen, KeyboardSafeOverlay } from "../../components/KeyboardSafe"; // klawiatura nie zasłania pola tekstowego (ekrany i okienka)
import { useFocusEffect } from "@react-navigation/native";
import { GlobalStateContext } from '../../context/GlobalState';

import { getApiUrl } from '../../config/api';
import tokenService from '../../services/tokenService';
import Logger from '../../services/logger'; // Import logger service
import LogoutButton from '../../components/LogoutButton';
import { appAlert } from '../../services/appAlert';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActionItem, IconButton, MenuCard, ModalHeader, OptionCard, ScreenHeader, look } from '../../components/AdminLook';
import { findGoodForBarcode, findSizeForBarcode, listPriceOf, resolveSalePrice } from '../../utils/defaultSalePrice'; // cena: cennik Cudzich, bez niego karta produktu
import { jacketCodeForSize, productNameFromBarcode } from '../../utils/productName'; // nazwa z kodu jak w całej aplikacji; kod metki z karty + rozmiaru
import { sanitizeAmountInput } from '../../utils/amountInput'; // przecinek = kropka w polu kwoty
import { searchWords, filterBySearch } from '../../utils/searchText'; // wyszukiwarka na liście kurtek u Cudzicha
import { CUDZICH_TYPES, CudzichBalanceCard, CudzichTransactionCard } from '../../components/CudzichLook'; // karty jak na ekranie admina
import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu
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
  const [refreshing, setRefreshing] = useState(false);
  
  // QR Scanner states
  const [facing, setFacing] = useState("back");
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannerType, setScannerType] = useState('odbior'); // 'odbior' lub 'zwrot'
  const [barcode, setBarcode] = useState(""); // State for barcode input
  const [scannedProductModalVisible, setScannedProductModalVisible] = useState(false);
  const [scannedProductData, setScannedProductData] = useState({ name: "", size: "", barcode: "", price: "" });
  const [selectedOption, setSelectedOption] = useState(""); // State for selling point selection
  const [sellingPointMenuVisible, setSellingPointMenuVisible] = useState(false); // State for "Sprzedano od" popup
  
  // Modal states
  const [odbiorModalVisible, setOdbiorModalVisible] = useState(false);
  const [zwrotModalVisible, setZwrotModalVisible] = useState(false);
  const [wplataModalVisible, setWplataModalVisible] = useState(false);
  const [wyplataModalVisible, setWyplataModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Form states
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productSearchText, setProductSearchText] = useState('');
  const [selectedSize, setSelectedSize] = useState(null);
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  // Zwrot (30.10.2026): wskazanie odbioru, którego dotyczy (cena z odbioru), albo „Kurtka sprzed systemu” (zapłacona)
  const [returnCandidates, setReturnCandidates] = useState([]);
  const [returnChoice, setReturnChoice] = useState(null); // _id sprzedaży z odbioru albo 'historical'
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
  // Historia porcjami (30.10.2026), jak Historia i Stan: 30 wpisów, kolejne przy przewijaniu; filtr dat liczy serwer
  const [transactionsTotal, setTransactionsTotal] = useState(0);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsHasMore, setTransactionsHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const transactionsRequestRef = useRef(0);
  const loadingMoreRef = useRef(false);
  // „Wpisz ręcznie” (bez metki): wybór Odbiór / Zwrot - kamera jest taka sama jak w „Dodaj”, bez dodatkowych przycisków
  const [manualChooserVisible, setManualChooserVisible] = useState(false);

  
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
  const filterDatesRef = useRef({ start: null, end: null });
  filterDatesRef.current = { start: filterStartDate, end: filterEndDate };
  const fetchTransactions = React.useCallback(async (page = 1) => {
    const requestId = ++transactionsRequestRef.current;
    try {
      const params = new URLSearchParams({ userSymbol: 'P', recipientId: 'cudzich', page: String(page), limit: String(TRANSACTIONS_PAGE_SIZE) });
      const { start, end } = filterDatesRef.current;
      if (start) params.set('startDate', dayParam(start));
      if (end) params.set('endDate', dayParam(end));
      const response = await tokenService.authenticatedFetch(getApiUrl(`/cudzich/transactions?${params.toString()}`));
      if (requestId !== transactionsRequestRef.current) return;
      if (response.ok) {
        const data = await response.json();
        const rows = Array.isArray(data?.transactions) ? data.transactions : (Array.isArray(data) ? data : []);
        setTransactions((prev) => (page === 1 ? rows : [...prev, ...rows]));
        setTransactionsTotal(Number(data?.total) || rows.length);
        setTransactionsPage(page);
        setTransactionsHasMore(Boolean(data?.hasMore));
      }
    } catch (error) {
      Logger.error('Error fetching transactions:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMoreTransactions = async () => {
    if (!transactionsHasMore || loadingMoreRef.current) return;
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

  // Debug goods changes
  useEffect(() => {
    // Goods are ready for use
  }, [goods]);

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
  }, [filterStartDate, filterEndDate, fetchTransactions]);

  // Auto-fetch price when product is selected (bez czekania na rozmiar)
  useEffect(() => {
    if (selectedProduct) {
      setPrice(getPriceFromProduct(selectedProduct, selectedSize));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct, selectedSize, cudzichPriceList]);

  // Handle product selection
  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    setProductSearchText(product.fullName); // Set search text to selected product name
    setProductDropdownVisible(false);
    
    // Cena od razu w polu: cennik Cudzich, a gdy go nie ma (albo nie ma w nim produktu) - karta produktu
    setPrice(getPriceFromProduct(product, selectedSize));
  };

  // Handle size change (cena jest już ustawiona po wyborze produktu)


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
    if (!selectedSize || !size) {
      appAlert('Błąd', 'Proszę wybrać rozmiar z listy');
      return;
    }

    if (type === 'zwrot') {
      const saved = await saveReturn({ choice: 'historical', productId: selectedProduct._id, size, barcode: manualBarcode(), price, notes });
      if (saved) {
        resetForm();
        setZwrotModalVisible(false);
      }
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

  // Kod metki dla produktu z formularza ręcznego: kurtki - karta + rozmiar, reszta - kod karty
  const manualBarcode = () => {
    const code = String(selectedProduct?.code || '').trim();
    if (!code) return '';
    return /^\d{13}$/.test(code) && code.slice(0, 3) !== '000' && selectedSize?.Roz_Kod
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

  const chosenCandidate = returnCandidates.find((candidate) => String(candidate.saleId) === returnChoice) || null;

  // Lista zwrotu: po skanie tylko ta kurtka (produkt + rozmiar), do tego wyszukiwarka (nazwa, rozmiar, kod)
  const matchesFilter = (candidate) => !returnFilter || (
    (String(candidate.goodsId || '') === String(returnFilter.productId || '') || candidate.fullName === returnFilter.name)
    && (!returnFilter.size || returnFilter.size === '-' || candidate.size === returnFilter.size)
  );
  const visibleCandidates = filterBySearch(
    returnCandidates.filter(matchesFilter),
    (candidate) => [candidate.fullName, candidate.size, candidate.barcode],
    searchWords(returnSearch)
  );

  const openReturnList = () => {
    setReturnFilter(null);
    setReturnSearch('');
    setReturnChoice(null);
    fetchOpenOdbiory();
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
    setReturnChoice('historical');
    setScannerType('zwrot');
    setTimeout(() => setZwrotModalVisible(true), 250); // drugie okienko po zamknięciu pierwszego (iOS)
  };

  // Zapis zwrotu: wskazany odbiór (cena z odbioru) albo kurtka sprzed systemu (cena wpisana = kredyt)
  const saveReturn = async ({ choice = returnChoice, productId, size: sizeLabel, barcode: code, price: enteredPrice, notes: returnNotes }) => {
    if (!choice) {
      appAlert('Zwrot', 'Wybierz kurtkę z listy albo „Kurtka sprzed systemu”.');
      return false;
    }
    const historical = choice === 'historical';
    const amount = Number(String(enteredPrice || '').replace(',', '.'));
    if (historical && !(amount > 0)) {
      appAlert('Brak ceny', 'Wpisz cenę, za którą kurtka była rozliczona przed systemem.');
      return false;
    }
    if (historical && !productId) {
      appAlert('Zwrot', 'Wybierz produkt.');
      return false;
    }
    try {
      setLoading(true);
      const response = await tokenService.authenticatedFetch(getApiUrl('/cudzich/returns'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(historical
          ? { historical: true, productId, size: sizeLabel || '-', barcode: code || '', price: amount, notes: returnNotes || '' }
          : { saleId: choice, notes: returnNotes || '' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        appAlert('Błąd', data.error || 'Nie udało się zapisać zwrotu');
        return false;
      }
      setSuccessMessage(`Zwrot zapisany\nKurtka czeka na przyjęcie w MAGAZYNIE (Dobieranie)\nKredyt: ${data.transaction?.price} zł\nNowe saldo: ${data.newBalance} zł`);
      setSuccessModalVisible(true);
      await Promise.all([fetchBalance(), fetchTransactions(1), fetchOpenOdbiory()]);
      return true;
    } catch (error) {
      Logger.error('Error saving Cudzich return:', error);
      appAlert('Błąd', 'Nie udało się połączyć z serwerem');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const confirmReturnFromList = async () => {
    const saved = await saveReturn({ choice: returnChoice });
    if (saved) setReturnListVisible(false);
  };

  const formatCandidateDate = (value) => new Date(value).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });

  // Save scanned product transaction
  const saveTransaction = async (type, productName, productSize, productPrice, productNotes, scannedBarcode = '', knownProductId = null) => {
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
      
      const response = await tokenService.authenticatedFetch(getApiUrl('/cudzich/transactions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: type,
          productId: productId, // Now we include found productId
          productName: productName,
          size: productSize,
          price: parseFloat(productPrice),
          userSymbol: 'P',
          recipientId: 'cudzich',
          notes: productNotes || ''
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Also save as regular sale (sprzedaż) if it's 'odbior' type
        if (type === 'odbior') {
          try {
            Logger.debug('DEBUG: Saving as regular sale...');
            
            // Get current date and time for timestamp - use ISO format for consistent parsing
            const now = new Date();
            const formattedTimestamp = now.toISOString(); // Use ISO format instead of locale-dependent format
            
            const salesResponse = await tokenService.authenticatedFetch(getApiUrl('/sales/save-sales'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fullName: `${productName}`, // Just product name
                timestamp: formattedTimestamp,
                barcode: scannedBarcode || '', // Use actual scanned barcode
                size: productSize,
                sellingPoint: user?.sellingPoint || 'Unknown', 
                from: selectedOption || 'P', // Keep clean - just selling point symbol
                cash: [{ price: parseFloat(productPrice), currency: 'PLN' }], // Price as cash payment
                card: [], // Empty card array
                symbol: selectedOption || 'P', // Use selected selling point symbol
                source: 'Cudzich', // NEW FIELD: Add source information for Cudzich transactions
                notes: 'Transakcja z systemu Cudzich', // Additional notes for identification
                employeeId: user?.employeeId || null, // Use Employee ObjectId for WorkHours matching
                employeeName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : null // Add employee name
              })
            });
            
            if (salesResponse.ok) {
              Logger.debug('DEBUG: Sale saved successfully');
            } else {
              const salesError = await salesResponse.json();
              Logger.warn('Warning: Could not save as regular sale:', salesError.error);
            }
          } catch (salesError) {
            Logger.warn('Warning: Could not save as regular sale:', salesError);
          }
        }
        
        setSuccessMessage(
          `${type === 'odbior' ? 'Odbiór' : 'Zwrot'} został zapisany\nProdukt: ${productName} ${productSize}\nCena: ${productPrice}zł\nNowe saldo: ${data.newBalance}zł`
        );
        setSuccessModalVisible(true);
        
        // Refresh data
        await Promise.all([fetchBalance(), fetchTransactions(1)]);
        return true;
      }
      const errorData = await response.json().catch(() => ({}));
      appAlert('Błąd', errorData.error || 'Nie udało się zapisać transakcji');
      return false;
    } catch (error) {
      Logger.error('Error saving scanned transaction:', error);
      appAlert('Błąd', 'Nie udało się połączyć z serwerem');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Create payment transaction (wpłata lub wypłata)
  const createPaymentTransaction = async (type) => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      appAlert('Błąd', 'Proszę wpisać prawidłową kwotę');
      return;
    }

    // Creating payment transaction

    try {
      setLoading(true);
      
      const response = await tokenService.authenticatedFetch(getApiUrl('/cudzich/transactions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: type,
          price: parseFloat(paymentAmount),
          userSymbol: 'P',
          recipientId: 'cudzich',
          notes: paymentNotes
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSuccessMessage(
          `${type === 'wplata' ? 'Wpłata' : 'Wypłata'} została zapisana\nNowe saldo: ${data.newBalance}zł`
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
      setLoading(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setSelectedProduct(null);
    setProductSearchText('');
    setSelectedSize(null);
    setSize('');
    setPrice('');
    setNotes('');
    setReturnCandidates([]);
    setReturnChoice(null);
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
      const filter = { productId: info.productId, name: info.name, size: info.size, barcode: data, price: info.price };
      const matching = returnCandidates.filter((candidate) => (
        (String(candidate.goodsId || '') === String(info.productId || '') || candidate.fullName === info.name)
        && (!info.size || info.size === '-' || candidate.size === info.size)
      ));
      setReturnFilter(filter);
      setReturnSearch('');
      setReturnChoice(matching.length === 1 ? String(matching[0].saleId) : null);
      setScannerVisible(false);
      setScanned(false);
      setReturnListVisible(true);
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

  // Toggle camera facing
  const toggleCameraFacing = () => {
    setFacing((prev) => (prev === "back" ? "front" : "back"));
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

  // Open selling point modal
  const openSellingPointModal = () => {
    setSellingPointMenuVisible(true);
  };

  // Select selling point from modal
  const selectSellingPointFromModal = (symbol) => {
    setSelectedOption(symbol);
    setSellingPointMenuVisible(false);
  };



  // Date filter functions
  const clearDateFilters = () => {
    setFilterStartDate(null);
    setFilterEndDate(null);
  };

  const formatDateForDisplay = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };



  // Pull to refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  };

  // Lista transakcji: z filtrem dat - tylko wynik filtra (także pusty), bez filtra - cała historia
  const dateFilterActive = Boolean(filterStartDate || filterEndDate);

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
            testID="cudzich-action-wplata"
            icon={CUDZICH_TYPES.wplata.icon}
            color={CUDZICH_TYPES.wplata.color}
            title="Wpłata"
            subtitle="Cudzich płaci - zmniejsza saldo"
            onPress={() => setWplataModalVisible(true)}
          />
          <MenuCard
            testID="cudzich-action-wyplata"
            icon={CUDZICH_TYPES.wyplata.icon}
            color={CUDZICH_TYPES.wyplata.color}
            title="Wypłata"
            subtitle="Płacimy Cudzichowi - zwiększa saldo"
            onPress={() => setWyplataModalVisible(true)}
          />
          <MenuCard
            testID="cudzich-action-manual"
            icon="create-outline"
            color="#8B5CF6"
            title="Wpisz ręcznie"
            subtitle="Odbiór lub zwrot bez metki (także sprzedaż sprzed systemu)"
            onPress={() => setManualChooserVisible(true)}
          />

          {/* Historia transakcji: nagłówek sekcji z przyciskiem filtra jak w ekranach admina */}
          <View style={styles.historyHeader}>
            <Text style={[look.sectionLabel, { flex: 1, marginBottom: 0 }]}>
              Historia transakcji{transactionsTotal > 0 ? ` (${transactionsTotal})` : ''}
            </Text>
            <IconButton
              icon={(filterStartDate || filterEndDate) ? 'calendar' : 'calendar-outline'}
              color={(filterStartDate || filterEndDate) ? '#0D6EFD' : tc('muted', '#94A3B8')}
              onPress={() => setDateFilterVisible(true)}
              accessibilityLabel="Filtruj po dacie"
              testID="cudzich-date-filter"
            />
          </View>

          {(filterStartDate || filterEndDate) && (
            <View style={[look.chip, styles.periodChip]}>
              <Ionicons name="calendar-outline" size={14} color="#0D6EFD" />
              <Text style={look.chipText}>
                {formatDateForDisplay(filterStartDate) || 'Od początku'} - {formatDateForDisplay(filterEndDate) || 'Do teraz'}
              </Text>
              <TouchableOpacity onPress={clearDateFilters} accessibilityLabel="Wyczyść filtr dat" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={tc('muted', '#94A3B8')} />
              </TouchableOpacity>
            </View>
          )}
        </View>
            </View>
          )}
          ListEmptyComponent={(
            <View style={look.emptyState}>
              <Ionicons name="swap-horizontal-outline" size={48} color={tc('muted', '#64748B')} />
              <Text style={look.emptyStateText}>
                {dateFilterActive ? 'Brak transakcji w wybranym okresie' : 'Brak transakcji'}
              </Text>
            </View>
          )}
          ListFooterComponent={loadingMore ? (
            <View style={{ paddingVertical: 16 }}><ActivityIndicator color="#0D6EFD" /></View>
          ) : null}
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
          setOdbiorModalVisible(false);
          setZwrotModalVisible(false);
          resetForm();
        }}
      >
        <KeyboardSafeOverlay>
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, { maxHeight: '90%' }]}>
            <ModalHeader
              icon={odbiorModalVisible ? 'arrow-down-circle' : 'return-up-back'}
              color={odbiorModalVisible ? '#EF4444' : '#10B981'}
              title={odbiorModalVisible ? 'Odbiór kurtki' : 'Zwrot kurtki'}
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
                onChangeText={(value) => setPrice(sanitizeAmountInput(value))}
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
                  setOdbiorModalVisible(false);
                  setZwrotModalVisible(false);
                  resetForm();
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
                  {odbiorModalVisible ? 'Zapisz Odbiór' : 'Zapisz Zwrot'}
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
              icon={wplataModalVisible ? 'wallet' : 'cash'}
              color={wplataModalVisible ? '#F59E0B' : '#06B6D4'}
              title={wplataModalVisible ? 'Wpłata od Tomka' : 'Wypłata dla Tomka'}
            />

            <ScrollView 
              style={{ width: '100%' }}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >

            {/* Amount input */}
            <View style={styles.formField}>
              <Text style={look.formLabel}>Kwota (zł):</Text>
              <TextInput
                style={styles.input}
                placeholder="Wpisz kwotę..."
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="numeric"
                placeholderTextColor={tc('muted', "#666")}
              />
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
            <View style={look.buttonRow}>
              <TouchableOpacity
                style={look.neutralButton}
                onPress={() => {
                  resetPaymentForm();
                  setWplataModalVisible(false);
                  setWyplataModalVisible(false);
                }}
              >
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  look.primaryButton,
                  { backgroundColor: wplataModalVisible ? '#339af0' : '#fd7e14' }
                ]}
                onPress={() => createPaymentTransaction(wplataModalVisible ? 'wplata' : 'wyplata')}
                disabled={loading}
              >
                <Text style={look.buttonText}>
                  {wplataModalVisible ? 'Zapisz Wpłatę' : 'Zapisz Wypłatę'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardSafeOverlay>
      </Modal>

      {/* Date Filter Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={dateFilterVisible}
        onRequestClose={() => setDateFilterVisible(false)}
      >
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, { width: '90%', maxHeight: '80%' }]}>
            <ModalHeader icon="calendar" color="#0D6EFD" title="Filtruj po dacie" subtitle="Wybierz przedział czasowy dla transakcji" />

            {/* Display selected date range */}
            {(filterStartDate || filterEndDate) && (
              <View style={{
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                padding: 12,
                borderRadius: 12,
                marginBottom: 15,
                borderWidth: 1,
                borderColor: 'rgba(16, 185, 129, 0.5)'
              }}>
                <Text style={{ color: '#10B981', fontSize: 14, fontWeight: 'bold', textAlign: 'center' }}>
                  Wybrany okres
                </Text>
                <Text style={{ color: tc('text', '#ffffff'), fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                  {formatDateForDisplay(filterStartDate) || 'Od początku'} - {formatDateForDisplay(filterEndDate) || 'Do teraz'}
                </Text>
              </View>
            )}

            {/* Quick filters */}
            <Text style={look.formLabel}>Szybki wybór:</Text>
            <View style={styles.quickFilters}>
              <TouchableOpacity 
                style={styles.quickChip}
                onPress={() => {
                  const today = new Date();
                  setFilterStartDate(today);
                  setFilterEndDate(today);
                }}
              >
                <Text style={styles.quickChipText}>Dziś</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.quickChip}
                onPress={() => {
                  const today = new Date();
                  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                  setFilterStartDate(weekAgo);
                  setFilterEndDate(today);
                }}
              >
                <Text style={styles.quickChipText}>7 dni</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.quickChip}
                onPress={() => {
                  const today = new Date();
                  const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
                  setFilterStartDate(monthAgo);
                  setFilterEndDate(today);
                }}
              >
                <Text style={styles.quickChipText}>30 dni</Text>
              </TouchableOpacity>
            </View>

            {/* Modal buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, width: '100%' }}>
              <TouchableOpacity
                style={[look.neutralButton, { marginRight: 6 }]}
                onPress={() => {
                  clearDateFilters();
                  setDateFilterVisible(false);
                }}
              >
                <Text style={look.neutralButtonText}>Wyczyść</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[look.primaryButton, { marginLeft: 6, backgroundColor: '#10B981' }]}
                onPress={() => setDateFilterVisible(false)}
              >
                <Text style={look.buttonText}>Zastosuj</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* QR Scanner Modal - identical to QRScanner component */}
      {scannerVisible && (
        <View style={qrStyles.container} testID="cudzich-scanner">
          {/* Ta sama kamera co w zakładce „Dodaj” (QRScanner): ramka, „Odczytaj ze zdjęcia”, „Wpisz kod”, czytnik;
              na cały ekran zakładki. Produkt bez metki: karta „Wpisz ręcznie” na ekranie Cudzicha. */}
          <ScanCamera
            enabled={!scanned}
            onScanned={handleScan}
            resolveName={resolveScannedName}
            facing={facing}
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
              {scannerType === 'odbior' && (<>
              <Text style={look.formLabel}>Sprzedano od</Text>
              <TouchableOpacity
                style={[look.selectField, { marginBottom: 16, borderWidth: 2, borderColor: '#F59E0B' }]}
                onPress={openSellingPointModal}
              >
                <Text style={[look.selectFieldText, !selectedOption && { color: tc('muted', '#94A3B8') }]}>
                  {selectedOption || "Wybierz punkt sprzedaży"}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#F59E0B" />
              </TouchableOpacity>
              </>)}
              

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
                  style={[look.primaryButton, { backgroundColor: '#10B981' }]}
                  testID="cudzich-scanned-confirm"
                  onPress={confirmScannedProduct}
                >
                  <Text style={look.buttonText}>Potwierdź</Text>
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
              title="Zwrot - wybierz kurtkę"
              subtitle={`U Cudzicha: ${returnCandidates.length} ${returnCandidates.length === 1 ? 'kurtka' : 'kurtek'}`}
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
            </View>
            {returnFilter ? (
              <View style={[look.chip, { alignSelf: 'flex-start', marginTop: 0, marginBottom: 8 }]}>
                <Ionicons name="scan-outline" size={14} color="#0D6EFD" />
                <Text style={look.chipText}>{displayName(returnFilter)}</Text>
                <TouchableOpacity onPress={() => { setReturnFilter(null); setReturnChoice(null); }} accessibilityLabel="Pokaż wszystkie kurtki" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
                  selected={returnChoice === String(candidate.saleId)}
                  icon={CUDZICH_TYPES.odbior.icon}
                  color={CUDZICH_TYPES.zwrot.color}
                  label={`${candidate.fullName} ${candidate.size && candidate.size !== '-' ? candidate.size : ''}\nodbiór ${formatCandidateDate(candidate.date)} · ${candidate.price} zł`}
                  onPress={() => setReturnChoice(String(candidate.saleId))}
                />
              ))}
              {!candidatesLoading && visibleCandidates.length === 0 ? (
                <Text style={[look.emptyStateText, { textAlign: 'center', marginVertical: 12 }]} testID="cudzich-return-empty">
                  {returnFilter
                    ? 'Tej kurtki nie ma na liście odbiorów - jeśli Cudzich wziął ją przed systemem, wybierz niżej „Kurtka sprzed systemu”.'
                    : (returnCandidates.length === 0 ? 'Cudzich nie ma żadnych kurtek z odbiorów w systemie.' : 'Nic nie znaleziono.')}
                </Text>
              ) : null}
            </ScrollView>

            <ActionItem
              testID="cudzich-return-historical"
              icon="time-outline"
              color="#8B5CF6"
              label="Kurtka sprzed systemu (już zapłacona)"
              note="Cenę rozliczenia wpiszesz w następnym kroku"
              onPress={() => openHistoricalReturn(returnFilter)}
            />

            {chosenCandidate ? (
              <Text style={[look.modalMessage, { marginTop: 8 }]} testID="cudzich-return-summary">
                Kredyt dla Cudzicha: {chosenCandidate.price} zł (cena z odbioru). Kurtka trafi do przyjęcia w MAGAZYNIE (Dobieranie).
              </Text>
            ) : null}

            <View style={[look.buttonRow, { marginTop: 12 }]}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setReturnListVisible(false)}>
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="cudzich-return-confirm"
                style={[look.primaryButton, { backgroundColor: CUDZICH_TYPES.zwrot.color }, (!chosenCandidate || loading) && look.disabled]}
                onPress={confirmReturnFromList}
                disabled={!chosenCandidate || loading}
              >
                <Text style={look.buttonText}>Zwróć do MAGAZYNU</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardSafeOverlay>
      </Modal>

      {/* „Wpisz ręcznie” - produkt bez metki: wybór odbioru albo zwrotu (formularz z wyszukiwaniem produktu) */}
      <Modal
        transparent
        animationType="fade"
        visible={manualChooserVisible}
        onRequestClose={() => setManualChooserVisible(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="create-outline" color="#8B5CF6" title="Wpisz ręcznie" subtitle="Produkt bez metki" />
            <ActionItem
              testID="cudzich-manual-odbior"
              icon={CUDZICH_TYPES.odbior.icon}
              color={CUDZICH_TYPES.odbior.color}
              label="Odbiór - Cudzich bierze kurtkę"
              onPress={() => {
                setManualChooserVisible(false);
                setScannerType('odbior');
                setTimeout(() => setOdbiorModalVisible(true), 250); // drugie okienko po zamknięciu pierwszego (iOS)
              }}
            />
            <ActionItem
              testID="cudzich-manual-zwrot"
              icon={CUDZICH_TYPES.zwrot.icon}
              color={CUDZICH_TYPES.zwrot.color}
              label="Zwrot kurtki sprzed systemu (już zapłaconej)"
              onPress={() => {
                setManualChooserVisible(false);
                openHistoricalReturn();
              }}
            />
            <TouchableOpacity style={[look.neutralButton, { flex: 0, marginTop: 12 }]} onPress={() => setManualChooserVisible(false)}>
              <Text style={look.neutralButtonText}>Anuluj</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Selling Point Selection Modal (copied from QRScanner) */}
      {sellingPointMenuVisible && (
        <Modal
          transparent={true}
          animationType="slide"
          visible={sellingPointMenuVisible}
          onRequestClose={() => setSellingPointMenuVisible(false)}
        >
          <View style={qrStyles.currencyModalContainer}>
            <View style={qrStyles.currencyModalContent}>
              <ModalHeader icon="storefront" color="#F59E0B" title="Wybierz punkt sprzedaży" />
              {getMatchingSymbols().length > 0 ? (
                <FlatList
                  data={getMatchingSymbols()}
                  keyExtractor={(item) => item._id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={qrStyles.currencyModalItem}
                      onPress={() => selectSellingPointFromModal(item.symbol)}
                    >
                      <Text style={qrStyles.currencyModalItemText}>
                        {item.symbol}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              ) : (
                <Text style={qrStyles.currencyModalItemText}>
                  Brak dostępnych punktów sprzedaży dla tego produktu
                </Text>
              )}
              <TouchableOpacity
                style={qrStyles.currencyModalCloseButton}
                onPress={() => setSellingPointMenuVisible(false)}
              >
                <Text style={qrStyles.currencyModalCloseButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

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

      {/* Error Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={errorModalVisible}
        onRequestClose={() => setErrorModalVisible(false)}
      >
        <View style={qrStyles.errorModalOverlay}>
          <View style={qrStyles.errorModalContent}>
            <ModalHeader icon="alert-circle" color="#DC3545" title="Błąd" />
            <Text style={qrStyles.errorModalMessage}>
              {errorMessage}
            </Text>
            
            <TouchableOpacity
              style={[look.primaryButton, { flex: 0, alignSelf: 'stretch' }]}
              onPress={() => setErrorModalVisible(false)}
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
  quickChip: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(13, 110, 253, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(13, 110, 253, 0.4)',
  },
  quickChipText: {
    color: tc('text', '#fff'),
    fontSize: 14,
    fontWeight: '600',
  },
  
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
  quickFilters: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  
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
