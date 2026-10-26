import { useFocusEffect } from '@react-navigation/native'; // Import useFocusEffect
import React, { useContext, useEffect, useState, useRef } from 'react';
import { FlatList, Keyboard, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'; // Import SafeAreaView for safe area handling
import AsyncStorage from '@react-native-async-storage/async-storage'; // Import AsyncStorage
import { getApiUrl, API_CONFIG } from "../../config/api"; // Import API configuration
import { GlobalStateContext } from "../../context/GlobalState"; // Import global state context
import tokenService from '../../services/tokenService';
import CurrencyService from '../../services/currencyService';
import Logger from '../../services/logger'; // Import currency service
import LogoutButton from '../../components/LogoutButton';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CurrencyPickerModal, MessageModal, ModalHeader as SaleModalHeader, ScreenHeader, look } from '../../components/AdminLook'; // SaleModalHeader = nagłówek jak w „Nowa sprzedaż”
import { saleFormStyles as sf } from '../../components/SaleFormStyles'; // edycja sprzedaży wygląda jak modal „Nowa sprzedaż”
import { applyChangeToCash, computePaymentBalance, formatMoney, inferPaymentMode, plnPerUnit, plnToCurrency, roundDownMoney } from '../../utils/paymentBalance'; // „Do dopłaty” / reszta jak przy sprzedaży
import { sanitizeAmountInput } from '../../utils/amountInput';
import { pointDisplayName, pointNameBySymbol } from '../../utils/pointName'; // pełna nazwa punktu zamiast symbolu
import { isExchangeReturn } from '../../utils/exchangeReturn'; // zwrot od klienta przy wymianie
import { warsawToday } from '../../utils/warsawDay'; // dzień polski, nie UTC (S16)
import { sortCurrenciesForPicker } from '../../utils/currencyOrder'; // EUR, USD, HUF, CAD na górze listy // przecinek = kropka w polach kwot
import { useSubmitGuard } from '../../utils/useSubmitGuard'; // blokada podwójnego kliknięcia przy zapisie
import { formatOrderDeposit, isOrderProductMismatch, orderDepositPln, orderMatchScore, orderMismatchMessage, orderProductName, sortPickupOrders } from '../../utils/pickupOrders'; // „Odbiór” w edycji = wybór zamówienia
import { minimumPriceError, regularOrPromoRule, salePriceListForBarcode, salePriceRule, salePriceRuleForGood, stateItemStoredMinimum } from '../../utils/defaultSalePrice'; // domyślna cena i blokada rabatu jak przy sprzedaży
import { KeyboardSafeScreen, KeyboardSafeOverlay, useRevealInput } from "../../components/KeyboardSafe"; // klawiatura nie zasłania pola tekstowego (ekrany i okienka)
import { useCameraPermissions } from "expo-camera"; // Import camera for QR scanning
import ScanCamera from "../../components/scanner/ScanCamera"; // skaner jak w całej aplikacji: ramka, zdjęcie, „Wpisz kod”
import { appAlert } from '../../services/appAlert';

import { router } from 'expo-router'; // „Dopisz kwotę” → zaliczka przez zamówienie (zakładka „Zamów”)
import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu
const Home = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const { user, logout } = React.useContext(GlobalStateContext); // Access global state and logout function
  const insets = useSafeAreaInsets(); // Get safe area insets
  const { stateData, users, fetchUsers, goods, fetchGoods, fetchState, sizes, colors, stocks, fetchSizes, fetchColors, fetchStock, filteredData: contextFilteredData, transferredItems: contextTransferredItems, deductionsData: contextDeductionsData } = useContext(GlobalStateContext); // Access state data, users, goods, sizes, colors, stocks and their fetch functions from global context
  const [salesData, setSalesData] = useState([]); // State to store API data
  const [filteredData, setFilteredData] = useState([]); // State to store filtered data
  const [totals, setTotals] = useState({ cash: {}, card: {} }); // State to store aggregated totals
  const [modalVisible, setModalVisible] = useState(false); // State for modal visibility
  const [selectedItem, setSelectedItem] = useState(null); // State for selected item
  const [refreshing, setRefreshing] = useState(false); // State for refresh control
  const [editModalVisible, setEditModalVisible] = useState(false); // State for edit modal visibility
  const [editData, setEditData] = useState(null); // State to store data for editing
  // Blokada podwójnego kliknięcia (słaby zasięg): edycja sprzedaży, „Odpisz kwotę”, „Dopisz kwotę”
  const [savingEdit, runEditOnce] = useSubmitGuard();
  const [savingDeduction, runDeductionOnce] = useSubmitGuard();
  const [savingAddition, runAdditionOnce] = useSubmitGuard();
  // „Odbiór” w edycji: lista zamówień oczekujących w punkcie (zwykła sprzedaż staje się odbiorem tylko z zamówieniem)
  const [editPickupOrders, setEditPickupOrders] = useState([]);
  const [editPickupOrdersVisible, setEditPickupOrdersVisible] = useState(false);
  const [editPickupOrdersLoading, setEditPickupOrdersLoading] = useState(false);
  const [editPaymentMode, setEditPaymentMode] = useState('cash');
  const [editMinPrice, setEditMinPrice] = useState(null); // blokada rabatu (cennik punktu / karta produktu), null = bez blokady
  const [editListPrice, setEditListPrice] = useState(null); // pełna cena z cennika - minimum przy płatności kartą
  const [otherAccountsData, setOtherAccountsData] = useState([]); // State for sales on other accounts
  const [transferredItems, setTransferredItems] = useState([]); // State for transferred items
  const [receivedItems, setReceivedItems] = useState([]); // State for items transferred to this account
  const [symbolSelectionVisible, setSymbolSelectionVisible] = useState(false); // State for symbol selection visibility
  const [selectedSymbol, setSelectedSymbol] = useState(""); // State for selected symbol
  const [cashPriceCurrencyPairs, setCashPriceCurrencyPairs] = useState([{ price: "", currency: "PLN" }]); // State for cash payment
  const [cardPriceCurrencyPairs, setCardPriceCurrencyPairs] = useState([{ price: "", currency: "PLN" }]); // State for card payment
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false); // State for currency modal
  const [currentCurrencyPairIndex, setCurrentCurrencyPairIndex] = useState(null); // Track the index of the pair being edited
  const [currentCurrencyType, setCurrentCurrencyType] = useState(""); // "cash" or "card"
  const [advancesData, setAdvancesData] = useState([]); // State for advances/zaliczki
  const [deductionsData, setDeductionsData] = useState([]); // State for deductions/odpisane kwoty
  const [deductionModalVisible, setDeductionModalVisible] = useState(false); // State for deduction modal
  const [deductionEmployeeModalVisible, setDeductionEmployeeModalVisible] = useState(false); // State for deduction employee selection modal
  const [deductionAmount, setDeductionAmount] = useState(""); // State for deduction amount
  const [deductionCurrency, setDeductionCurrency] = useState("PLN"); // State for deduction currency
  const [deductionCurrencyModalVisible, setDeductionCurrencyModalVisible] = useState(false); // State for deduction currency selection modal
  const [deductionCurrencyRate, setDeductionCurrencyRate] = useState(""); // Rate input for deduction currency
  const [showDeductionRateInput, setShowDeductionRateInput] = useState(false); // Show rate input for deduction currency
  const [deductionReason, setDeductionReason] = useState(""); // State for deduction reason
  const [deductionType, setDeductionType] = useState("other"); // "other" lub "employee_advance"
  const [selectedEmployeeForAdvance, setSelectedEmployeeForAdvance] = useState(null); // Wybrany pracownik dla zaliczki
  const [cancelDeductionModalVisible, setCancelDeductionModalVisible] = useState(false); // State for cancel deduction modal
  const [selectedDeductionItem, setSelectedDeductionItem] = useState(null); // Selected deduction item to cancel
  const [operationOptionsVisible, setOperationOptionsVisible] = useState(false); // State for operation options modal
  const [selectedOperationItem, setSelectedOperationItem] = useState(null); // Selected operation item for options
  const [transferOptionsVisible, setTransferOptionsVisible] = useState(false); // State for transfer options modal
  const [selectedTransferredItem, setSelectedTransferredItem] = useState(null); // Selected transfer item for cancel action
  
  // Currency rates modal state
  const [currencyRatesModalVisible, setCurrencyRatesModalVisible] = useState(false); // State for currency rates modal
  const [currencyRates, setCurrencyRates] = useState([]); // State for currency rates data
  const [loadingCurrencyRates, setLoadingCurrencyRates] = useState(false); // Loading state for currency rates
  
  // Currency calculator modal state
  const [calculatorModalVisible, setCalculatorModalVisible] = useState(false); // State for currency calculator modal
  const [calculatorAmount, setCalculatorAmount] = useState(""); // Amount to convert
  const [calculatorFromCurrency, setCalculatorFromCurrency] = useState("PLN"); // Source currency
  const [calculatorToCurrency, setCalculatorToCurrency] = useState("HUF"); // Target currency
  const [calculatorResult, setCalculatorResult] = useState(null); // Conversion result
  const [fromCurrencyModalVisible, setFromCurrencyModalVisible] = useState(false); // Modal for selecting FROM currency
  const [toCurrencyModalVisible, setToCurrencyModalVisible] = useState(false); // Modal for selecting TO currency
  
  // States for "Dopisz kwotę" (Add Amount) - identical functionality
  const [addAmountModalVisible, setAddAmountModalVisible] = useState(false); // State for add amount modal
  const [addAmountAmount, setAddAmountAmount] = useState(""); // State for add amount amount
  const [addAmountCurrency, setAddAmountCurrency] = useState("PLN"); // State for add amount currency
  const [addAmountCurrencyModalVisible, setAddAmountCurrencyModalVisible] = useState(false); // State for add amount currency selection modal
  const [addAmountReason, setAddAmountReason] = useState(""); // State for add amount reason
  const [addAmountIncludeCommission, setAddAmountIncludeCommission] = useState(false);
  const [isEditingAddAmount, setIsEditingAddAmount] = useState(false); // Edit mode for add amount
  const [editingOperationId, setEditingOperationId] = useState(null); // Operation id being edited
  const [editingOperationDate, setEditingOperationDate] = useState(null); // Preserve original date for edits
  
  // New states for reason selection
  const [reasonType, setReasonType] = useState(""); // "product" or "other"
  const [productType, setProductType] = useState("standard"); // "standard" only in add amount flow
  const [customProductName, setCustomProductName] = useState(""); // Custom product name for non-standard products
  
  // Custom product selection states (for non-standard products)
  const [selectedStock, setSelectedStock] = useState(""); // Selected stock/assortment
  const [selectedColor, setSelectedColor] = useState(""); // Selected color
  const [selectedSize, setSelectedSize] = useState(""); // Selected size
  
  // Search queries for custom product dropdowns
  const [stockSearchQuery, setStockSearchQuery] = useState(""); // Search query for stock
  const [colorSearchQuery, setColorSearchQuery] = useState(""); // Search query for color
  const [sizeSearchQuery, setSizeSearchQuery] = useState(""); // Search query for size
  
  // Filtered lists for custom product dropdowns
  const [filteredStocks, setFilteredStocks] = useState([]); // Filtered stocks based on search
  const [filteredColors, setFilteredColors] = useState([]); // Filtered colors based on search
  const [filteredSizes, setFilteredSizes] = useState([]); // Filtered sizes based on search
  
  // Dropdown visibility for custom product selections
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [showColorDropdown, setShowColorDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  
  const [selectedProduct, setSelectedProduct] = useState(""); // Selected product ID
  const [products, setProducts] = useState([]); // Available products from state
  const [productSearchQuery, setProductSearchQuery] = useState(""); // Search query for products
  const [filteredProducts, setFilteredProducts] = useState([]); // Filtered products based on search
  const [showProductDropdown, setShowProductDropdown] = useState(false); // Control dropdown visibility
  // Pola z podpowiedziami w „Dopisz kwotę”: po kliknięciu miejsce nad klawiaturą na pole i listę
  const addAmountReveal = useRevealInput();
  const addAmountProductInputRef = useRef(null);
  const addAmountSizeInputRef = useRef(null);
  const [productScanned, setProductScanned] = useState(false); // Track if product was scanned (with size already included)
  const [productFinalPrice, setProductFinalPrice] = useState(""); // Final agreed price for product
  // „Dopisz kwotę” jak płatność przy sprzedaży: wiersze kwota | waluta („Dodaj walutę”), każda waluta = osobna operacja
  const [addAmountPairs, setAddAmountPairs] = useState([{ price: "", currency: "PLN" }]);
  const [addAmountChangeOverride, setAddAmountChangeOverride] = useState(null);
  const [addAmountPairIndex, setAddAmountPairIndex] = useState(0); // wiersz, dla którego wybieramy walutę
  const [editingGroupOps, setEditingGroupOps] = useState([]); // edycja: operacje zaliczki (wszystkie waluty)
  const [myPriceList, setMyPriceList] = useState(null); // cennik punktu (null = brak, karta produktu)
  const [addAmountMinPrice, setAddAmountMinPrice] = useState(null); // blokada rabatu ceny finalnej zaliczki
  const lastAutoPriceKeyRef = useRef(""); // produkt+rozmiar, dla którego cena finalna już się podpowiedziała
  const [availableFunds, setAvailableFunds] = useState({}); // State for available funds to ensure re-rendering
  
  // QR Scanner states for product selection
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  
  // States for salesperson management
  const [salespersonModalVisible, setSalespersonModalVisible] = useState(false); // State for salesperson modal
  const [successModalVisible, setSuccessModalVisible] = useState(false); // State for success modal
  const [successMessage, setSuccessMessage] = useState(""); // Message for success modal
  const [errorModalVisible, setErrorModalVisible] = useState(false); // State for error modal
  const [errorMessage, setErrorMessage] = useState(""); // Message for error modal
  const [confirmDeleteModalVisible, setConfirmDeleteModalVisible] = useState(false); // State for delete confirmation modal
  const [deleteConfirmMessage, setDeleteConfirmMessage] = useState(""); // Message for delete confirmation modal
  const [employees, setEmployees] = useState([]); // State for employees list
  const [selectedSalespeople, setSelectedSalespeople] = useState([]); // State for selected salespeople (multiple)
  const [assignedSalespeople, setAssignedSalespeople] = useState([]); // State for currently assigned salespeople (multiple)
  
  // States for work hours management
  const [workHoursModalVisible, setWorkHoursModalVisible] = useState(false); // State for work hours modal
  const [selectedEmployeeForHours, setSelectedEmployeeForHours] = useState(null); // Selected employee for setting hours
  
  // States for employee removal modal
  const [removeEmployeeModalVisible, setRemoveEmployeeModalVisible] = useState(false); // State for employee removal modal
  const [employeeToRemove, setEmployeeToRemove] = useState(null); // Employee selected for removal
  const [workStartTime, setWorkStartTime] = useState("08:00"); // Start time for work
  const [workEndTime, setWorkEndTime] = useState("16:00"); // End time for work
  const [showStartTimePicker, setShowStartTimePicker] = useState(false); // Show start time picker
  const [showEndTimePicker, setShowEndTimePicker] = useState(false); // Show end time picker
  const [tempHour, setTempHour] = useState(8);
  const [tempMinute, setTempMinute] = useState(0);
  const [workNotes, setWorkNotes] = useState(""); // Notes for work hours
  const [todaysWorkHours, setTodaysWorkHours] = useState([]); // Today's recorded work hours
  
  // States for product currency system
  const [productSaleCurrency, setProductSaleCurrency] = useState("PLN"); // Currency selected for product sale
  const [productCurrencyModalVisible, setProductCurrencyModalVisible] = useState(false); // Modal for selecting product currency
  const [exchangeRates, setExchangeRates] = useState({}); // Exchange rates cache
  const [productPriceInCurrency, setProductPriceInCurrency] = useState(""); // Product price converted to selected currency
  const [showCurrencyConversion, setShowCurrencyConversion] = useState(false); // Show conversion info
  
  // States for manual currency rates
  const [editingCurrencyRate, setEditingCurrencyRate] = useState(null); // Which currency rate is being edited
  const [tempCurrencyRate, setTempCurrencyRate] = useState(""); // Temporary rate input value
  const [currencyRateModalVisible, setCurrencyRateModalVisible] = useState(false); // Modal for editing currency rate
  const [panKazekModalVisible, setPanKazekModalVisible] = useState(false); // Modal for Pan Kazek confirmation
  const [panKazekItems, setPanKazekItems] = useState([]); // Items added to Pan Kazek list
  
  // States for add amount currency rate input
  const [addAmountCurrencyRate, setAddAmountCurrencyRate] = useState(""); // Rate input for add amount currency
  const [showAddAmountRateInput, setShowAddAmountRateInput] = useState(false); // Show rate input for add amount

  // States for product currency rate input
  const [productSaleCurrencyRate, setProductSaleCurrencyRate] = useState(""); // Rate for product currency
  const [showProductRateInput, setShowProductRateInput] = useState(false); // Show rate input for product currency
  
  // Get available currencies from currencyRates (dynamic from database)
  const availableCurrencies = (() => {
    if (!currencyRates || currencyRates.length === 0) {
      return ["PLN", "EUR", "USD", "HUF", "CAN", "GBP", "ILS"].map(code => ({ 
        code, 
        name: code, 
        buyRate: code === "PLN" ? 1 : '-' 
      }));
    }
    
    const currencies = currencyRates.map(rate => ({ 
      code: rate.currency.code, 
      name: rate.currency.name, 
      buyRate: rate.buyRate 
    }));
    
    // Add PLN at the beginning if not already present
    if (!currencies.some(c => c.code === 'PLN')) {
      currencies.unshift({ code: 'PLN', name: 'Polski złoty', buyRate: 1 });
    }
    
    return sortCurrenciesForPicker(currencies);
  })();

  const currencyOptions = (() => {
    if (!currencyRates || currencyRates.length === 0) {
      return ["PLN", "EUR", "USD", "HUF", "CAN", "GBP", "ILS"].map(code => ({
        code,
        name: code,
        buyRate: code === "PLN" ? 1 : null
      }));
    }

    const mapped = currencyRates.map(rate => ({
      code: rate.currency.code,
      name: rate.currency.name,
      buyRate: rate.buyRate
    }));

    if (!mapped.some(item => item.code === "PLN")) {
      mapped.unshift({ code: "PLN", name: "Polski zloty", buyRate: 1 });
    }

    return sortCurrenciesForPicker(mapped);
  })();

  // Helper function to check if currency uses "per 100" multiplier (HUF, JPY)
  const getMultiplier = (currencyCode) => {
    if (!currencyCode) return 1;
    // Find currency in currencyRates to check its name
    const currencyData = currencyRates.find(rate => rate.currency.code === currencyCode);
    if (currencyData) {
      const name = currencyData.currency?.name || '';
      if (name.includes('(za 100)') || name.includes('za 100')) {
        return 100;
      }
    }
    return 1;
  };

  // Funkcja identyczna z QRScanner - filtruje użytkowników z tej samej lokalizacji
  // Stan edytowanej kurtki w punkcie (po kodzie) - jak saleStockAt w „Nowa sprzedaż”
  const editStockAt = (symbol) => (stateData || []).filter((row) => row.symbol === symbol && row.barcode === editData?.barcode).length;

  const getMatchingSymbols = () => {
    if (!users || !user) {
      return [];
    }

    // Filtruj użytkowników z tej samej lokalizacji co zalogowany użytkownik
    // Pokaż WSZYSTKICH użytkowników z tej samej lokalizacji (niezależnie od stanu magazynowego)
    const sameLocationUsers = users.filter(u => 
      u.location && user.location && 
      u.location.trim() === user.location.trim() && // Porównanie lokalizacji z trim()
      u.role !== 'admin' && 
      u.role !== 'magazyn' &&
      u.sellingPoint && 
      u.sellingPoint.trim() !== ''
    );
    
    // Zwróć wszystkich użytkowników z tej samej lokalizacji
    return sameLocationUsers;
  };

  // Numer ostatniego pobrania: wolniejsza, starsza odpowiedź nie nadpisuje nowszych danych (np. po edycji)
  const salesRequestRef = useRef(0);
  const operationsRequestRef = useRef(0);

  // Dzień, o który pytamy serwer - ten sam co w filtrach „dzisiaj” poniżej (toISOString)
  const todayParam = () => new Date().toISOString().split('T')[0];

  const fetchSalesData = async () => {
    const requestId = ++salesRequestRef.current;
    try {
      // Tylko dzisiejsze sprzedaże własnego punktu (dawniej całe archiwum wszystkich punktów przy każdym wejściu)
      const response = await tokenService.authenticatedFetch(getApiUrl(`/sales/get-all-sales?day=${todayParam()}`));
      
      if (!response || !response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data = await response.json();
      
      // Ensure data is an array
      if (requestId !== salesRequestRef.current) return; // w międzyczasie poszło nowsze pobranie
      const salesArray = Array.isArray(data) ? data : (data?.sales || data?.data || []);
      setSalesData(salesArray); // Update state with API data

      // Filter data based on user's sellingPoint and current date
      // FOR TESTING: Uncomment line below to simulate tomorrow
      // const today = '2025-08-11'; // TEST: Simulate tomorrow (dzień później)
      const today = new Date().toISOString().split('T')[0]; // NORMAL: Real today
      const filtered = salesArray.filter(
        item => item.sellingPoint === user?.sellingPoint && item.date?.startsWith(today)
      );
      setFilteredData(filtered); // Update state with filtered data

      const otherAccounts = salesArray.filter(
        item => item.sellingPoint !== user?.sellingPoint && item.from === user?.symbol && item.date?.startsWith(today)
      );
      setOtherAccountsData(otherAccounts); // Update state with other accounts data

      // Calculate totals grouped by currency
      const currencyTotals = { cash: {}, card: {} };
      filtered.forEach((item) => {
        item.cash?.forEach(({ price, currency }) => {
          currencyTotals.cash[currency] = (currencyTotals.cash[currency] || 0) + price;
        });
        item.card?.forEach(({ price, currency }) => {
          currencyTotals.card[currency] = (currencyTotals.card[currency] || 0) + price;
        });
      });
      setTotals(currencyTotals); // Update totals state
    } catch (error) {
      // Silent error handling
    }
  };

  // Function to fetch currency rates
  const fetchCurrencyRates = async () => {
    try {
      setLoadingCurrencyRates(true);
      const response = await tokenService.authenticatedFetch(getApiUrl('/currency-rates'));
      
      if (!response || !response.ok) {
        throw new Error('Failed to fetch currency rates');
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        setCurrencyRates(data.data);
      } else {
        setCurrencyRates([]);
      }
    } catch (error) {
      Logger.error('Error fetching currency rates:', error);
      appAlert('Błąd', 'Nie udało się pobrać kursów walut');
      setCurrencyRates([]);
    } finally {
      setLoadingCurrencyRates(false);
    }
  };

  const convertCurrency = () => {
    const amount = parseFloat(calculatorAmount);
    
    if (isNaN(amount) || amount <= 0) {
      appAlert('Błąd', 'Wprowadź prawidłową kwotę');
      return;
    }

    if (currencyRates.length === 0) {
      appAlert('Błąd', 'Brak dostępnych kursów walut');
      return;
    }

    // Helper function to check if currency uses "per 100" multiplier
    const getMultiplier = (rate) => {
      if (!rate) return 1;
      // Check if currency name contains "(za 100)" or similar pattern
      const name = rate.currency?.name || '';
      if (name.includes('(za 100)') || name.includes('za 100')) {
        return 100;
      }
      return 1;
    }

    // If converting from PLN
    if (calculatorFromCurrency === 'PLN') {
      const toRate = currencyRates.find(rate => rate.currency.code === calculatorToCurrency);
      if (!toRate) {
        appAlert('Błąd', 'Nie znaleziono kursu dla wybranej waluty');
        return;
      }
      const multiplier = getMultiplier(toRate);
      // Use BUY rate - klient płaci walutą, później sprzedajesz ją kantorowi po kursie KUPNA
      // If rate is per 100 units, multiply result by 100
      const result = (amount / toRate.buyRate) * multiplier;
      setCalculatorResult(result.toFixed(2));
    }
    // If converting to PLN
    else if (calculatorToCurrency === 'PLN') {
      const fromRate = currencyRates.find(rate => rate.currency.code === calculatorFromCurrency);
      if (!fromRate) {
        appAlert('Błąd', 'Nie znaleziono kursu dla wybranej waluty');
        return;
      }
      const multiplier = getMultiplier(fromRate);
      // Use BUY rate - ile dostaniesz PLN za walutę obcą w kantorze (kantor KUPUJE od Ciebie)
      // If rate is per 100 units, divide amount by 100 first
      const result = (amount / multiplier) * fromRate.buyRate;
      setCalculatorResult(result.toFixed(2));
    }
    // If converting between two foreign currencies
    else {
      const fromRate = currencyRates.find(rate => rate.currency.code === calculatorFromCurrency);
      const toRate = currencyRates.find(rate => rate.currency.code === calculatorToCurrency);
      
      if (!fromRate || !toRate) {
        appAlert('Błąd', 'Nie znaleziono kursu dla wybranych walut');
        return;
      }
      
      const fromMultiplier = getMultiplier(fromRate);
      const toMultiplier = getMultiplier(toRate);
      
      // Obie operacje po kursie KUPNA - sprzedajesz walutę źródłową, ustalasz cenę w walucje docelowej
      const plnAmount = (amount / fromMultiplier) * fromRate.buyRate;
      const result = (plnAmount / toRate.buyRate) * toMultiplier;
      setCalculatorResult(result.toFixed(2));
    }
  };

  const swapCurrencies = () => {
    // Zamień waluty miejscami
    const temp = calculatorFromCurrency;
    setCalculatorFromCurrency(calculatorToCurrency);
    setCalculatorToCurrency(temp);
    // Wyczyść wynik po zamianie
    setCalculatorResult(null);
  };

  // Cennik punktu zalogowanego sprzedawcy (null = punkt bez cennika - ceny z kart produktów)
  const loadMyPriceList = async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/pricelists/my"));
      const data = response.ok ? await response.json() : null;
      const priceList = Array.isArray(data?.priceList) ? data.priceList : null;
      setMyPriceList(priceList);
      return priceList;
    } catch (error) {
      Logger.error("Error fetching own price list:", error);
      return null;
    }
  };

  // „Odbiór” w edycji: zaznaczenie otwiera listę zamówień; bez wybranego zamówienia odbiór się nie zaznacza
  const loadEditPickupOrders = async () => {
    setEditPickupOrdersLoading(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/orders/for-pickup"));
      const data = response.ok ? await response.json() : null;
      setEditPickupOrders(Array.isArray(data?.data) ? data.data : []);
    } catch (error) {
      Logger.error("Error fetching pickup orders (edit):", error);
      setEditPickupOrders([]);
    } finally {
      setEditPickupOrdersLoading(false);
    }
  };

  const toggleEditPickup = async () => {
    if (editData?.isPickup) {
      // Odznaczenie: zwykła sprzedaż (zamówienie powiązane wcześniej wróci do oczekujących po zapisie)
      setEditData((prev) => ({ ...prev, isPickup: false, pickupOrder: null }));
      return;
    }
    setEditPickupOrdersVisible(true);
    await loadEditPickupOrders();
  };

  const selectEditPickupOrder = (order, confirmed = false) => {
    const saleName = `${editData?.fullName || ''} ${editData?.size || ''}`;
    // Inny model niż sprzedawana kurtka: pytamy (wymiana jest możliwa, pomyłka nie przejdzie niezauważona)
    if (!confirmed && isOrderProductMismatch(order, saleName)) {
      setEditPickupOrdersVisible(false);
      appAlert("Inna kurtka niż w zamówieniu", orderMismatchMessage(order, saleName), [
        { text: "Wróć do listy", style: "cancel", onPress: () => setEditPickupOrdersVisible(true) },
        { text: "Tak, wymiana", onPress: () => selectEditPickupOrder(order, true) },
      ]);
      return;
    }
    setEditData((prev) => ({ ...prev, isPickup: true, pickupOrder: order }));
    setEditPickupOrdersVisible(false);
  };

  const fetchItemData = async (id) => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl(`/sales/${id}`));
      if (!response.ok) {
        throw new Error("Failed to fetch item data.");
      }
      const data = await response.json();
      setEditData(data); // Set the fetched data for editing
      const paymentMode = inferPaymentMode(data);
      setEditPaymentMode(paymentMode);

      // Wpłaty do edycji; brak wpłat (np. sprzedaż tylko gotówką: card = []) = jedno puste pole, żeby dało się dopisać kwotę
      const toEditPairs = (payments) => (Array.isArray(payments) && payments.length > 0
        ? payments.map(({ price, currency }) => ({ price: price ? price.toString() : "", currency: currency || "PLN" }))
        : [{ price: "", currency: "PLN" }]);
      setCashPriceCurrencyPairs(toEditPairs(data.cash));
      setCardPriceCurrencyPairs(toEditPairs(data.card));


      // Blokada rabatu jak przy sprzedaży: minimum z cennika punktu (bez cennika - z karty produktu)
      const priceList = await loadMyPriceList();
      setEditMinPrice(salePriceRule({ barcode: data.barcode, goods, sizes, priceList })?.minPrice ?? null);
      const listPrice = salePriceListForBarcode({ barcode: data.barcode, goods, sizes, priceList });
      setEditListPrice(listPrice);
      if (paymentMode === 'card' && listPrice !== null && listPrice !== undefined) {
        setCardPriceCurrencyPairs([{ price: String(listPrice), currency: 'PLN' }]);
      }

      setEditModalVisible(true); // Show the edit modal
    } catch (error) {
      // Silent error handling
    }
  };

  // „Do dopłaty” / „Reszta do wydania” w edycji - te same wyliczenia co w „Nowa sprzedaż” (QRScanner)
  const editPriceRuleSale = !editData?.isPickup && editListPrice !== null && editListPrice !== undefined;
  const editCardNoDiscount = editPriceRuleSale && editPaymentMode !== 'cash';
  const showEditCashPayment = !editPriceRuleSale || editPaymentMode !== 'card';
  const showEditCardPayment = !editPriceRuleSale || editPaymentMode !== 'cash';
  // Edycja = poprawka zapisanych wpłat (po fakcie nie ma ceny proponowanej, dopłaty ani reszty): liczy się suma wpłat w PLN
  const editPaymentBalance = computePaymentBalance({ price: 0, payments: [...cashPriceCurrencyPairs, ...cardPriceCurrencyPairs], currencyRates });

  const effectiveEditMinPrice = editCardNoDiscount ? editListPrice : editMinPrice;
  // Odbiór z wymianą na inny model (zamówienie wybrane w edycji): minimum dopłaty = minimum kurtki - zaliczka zamówienia
  const editExchangeOrder = editData?.isPickup && editData?.pickupOrder && isOrderProductMismatch(editData.pickupOrder, `${editData?.fullName || ''} ${editData?.size || ''}`)
    ? editData.pickupOrder
    : null;
  const editExchangeDeposit = editExchangeOrder ? orderDepositPln(editExchangeOrder) : 0;
  const editExchangeMinTopUp = editExchangeOrder && editMinPrice ? Math.max(0, Number(editMinPrice) - editExchangeDeposit) : null;
  const editExchangeMissing = editExchangeMinTopUp === null ? 0 : Math.max(0, editExchangeMinTopUp - editPaymentBalance.paidPln);

  // Blokada minimum jak przy sprzedaży (0.0001 tylko na błąd zmiennoprzecinkowy)
  const editBelowMinimum = !editData?.isPickup && Boolean(effectiveEditMinPrice) && editPaymentBalance.paidPln > 0.005 && editPaymentBalance.paidPln < Number(effectiveEditMinPrice) - 0.0001;

  const selectEditPaymentMode = (mode) => {
    if (mode === editPaymentMode) return;
    setEditPaymentMode(mode);
    if (mode === 'card') {
      setCashPriceCurrencyPairs([{ price: '', currency: 'PLN' }]); // nie '0' - zapisywała się wpłata gotówkowa 0 zł (audyt Sprzedaż)
      setCardPriceCurrencyPairs([{ price: String(editListPrice), currency: 'PLN' }]);
      return;
    }
    setCashPriceCurrencyPairs([{ price: '', currency: 'PLN' }]);
    setCardPriceCurrencyPairs([{ price: '', currency: 'PLN' }]);
  };

  const updateItem = async () => {
    try {
      if (editData?._id) {
        // Zapisujemy wpłaty tak, jak wpisano (puste i zerowe pomijamy - wpłata 0 zł to nie wpłata)
        const hasAmount = (pair) => pair.price && String(pair.price).trim() !== "" && parseFloat(String(pair.price).replace(',', '.')) > 0;
        const validCashPrices = cashPriceCurrencyPairs
          .filter(hasAmount)
          .map((pair) => ({ price: pair.price, currency: pair.currency }));
        const validCardPrices = cardPriceCurrencyPairs
          .filter(hasAmount)
          .map((pair) => ({ price: pair.price, currency: editPriceRuleSale ? 'PLN' : pair.currency }));

        // Validate that at least one price (cash or card) is provided
        const hasPrice = [...validCashPrices, ...validCardPrices].some(({ price }) => {
          const numPrice = parseFloat(price);
          return !isNaN(numPrice) && numPrice > 0;
        });
        
        if (!hasPrice) {
          setErrorMessage("Musisz podać przynajmniej jedną cenę (gotówka lub karta). Nie można zapisać produktu bez ceny.");
          setErrorModalVisible(true);
          return;
        }

        // Waluta bez kursu (własny z panelu, a gdy go nie ma - kantor): zmian nie zapisujemy
        const missingRatesAtSave = computePaymentBalance({ price: 0, payments: [...validCashPrices, ...validCardPrices], currencyRates }).missingRates;
        if (missingRatesAtSave.length > 0 && (currencyRates || []).length > 0) { // kursy niewczytane - decyduje serwer
          setErrorMessage(`Brak kursu ${missingRatesAtSave.join(', ')} w Tabeli walut (ani własnego, ani z kantoru). Poproś o uzupełnienie kursu w panelu albo przyjmij płatność w innej walucie.`);
          setErrorModalVisible(true);
          return;
        }

        // Wymiana na inny model przy odbiorze: dopłata nie niżej niż minimum kurtki minus zaliczka
        if (editExchangeMinTopUp !== null && editExchangeMissing > 0.005) {
          setErrorMessage(`Wymiana na inną kurtkę: minimalna dopłata to ${formatMoney(editExchangeMinTopUp)} zł (minimum kurtki ${editMinPrice} zł − zaliczka ${formatMoney(editExchangeDeposit)} zł). Brakuje ${formatMoney(editExchangeMissing)} zł.`);
          setErrorModalVisible(true);
          return;
        }

        // Blokada rabatu: „Klient zapłaci” nie niżej niż minimum z cennika; odbiór bez blokady
        if (!editData.isPickup) {
          const { paidPln } = computePaymentBalance({ price: 0, payments: [...validCashPrices, ...validCardPrices], currencyRates });
          const minimumError = minimumPriceError(paidPln, effectiveEditMinPrice);
          if (minimumError) {
            setErrorMessage(minimumError);
            setErrorModalVisible(true);
            return;
          }
        }

        const updatedData = {
          ...editData,
          cash: validCashPrices.map(({ price, currency }) => ({ price: parseFloat(price) || 0, currency })),
          card: validCardPrices.map(({ price, currency }) => ({ price: parseFloat(price) || 0, currency })),
          isPickup: editData.isPickup || false, // Dodaj pole isPickup
          // „Odbiór” zaznaczony w edycji: zamówienie, które klient odbiera (backend oznaczy je jako wydane)
          ...(editData.pickupOrder?._id && { orderMongoId: editData.pickupOrder._id }),
        };
        delete updatedData.pickupOrder;

        const response = await tokenService.authenticatedFetch(
          getApiUrl(`/sales/update-sales/${editData._id}`),
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updatedData), // Send updated data
          }
        );

        if (!response.ok) {
          // Komunikat z backendu (np. walidacja) zamiast cichego błędu - okno edycji zostaje otwarte
          const errorBody = await response.json().catch(() => ({}));
          const details = Array.isArray(errorBody?.errors)
            ? errorBody.errors.map((item) => item.msg || item.message).filter(Boolean).join("\n")
            : (errorBody?.message || errorBody?.error || "");
          // Sprzedaż przetworzona w Dobieraniu: sam komunikat serwera, bez technicznego „HTTP 409”
          if (errorBody?.code === 'SALE_ALREADY_PROCESSED') throw new Error(`Nie udało się zapisać zmian. ${errorBody.message}`);
          throw new Error(`Nie udało się zapisać zmian (HTTP ${response.status}).${details ? `\n${details}` : ""}`);
        }

        const updatedItem = await response.json(); // Fetch the updated item from the server

        setFilteredData((prev) =>
          prev.map((item) => (item._id === updatedItem._id ? updatedItem : item))
        ); // Update the item in the list
        setEditModalVisible(false); // Close the edit modal
        await refreshAfterSaleChange(); // sumy, obrót, zaliczki i prowizje z serwera
      } else {
        Logger.error("No valid ID found for the item to update.");
      }
    } catch (error) {
      Logger.error("Error updating item:", error.message);
      setErrorMessage(error.message?.startsWith("Nie udało się") ? error.message : "Nie udało się zapisać zmian. Sprawdź połączenie i spróbuj ponownie.");
      setErrorModalVisible(true);
    }
  };

  // Recalculate totals dynamically whenever filteredData changes
  useEffect(() => {
    const newTotals = { cash: {}, card: {} };
    filteredData.forEach((item) => {
      item.cash?.forEach(({ price, currency }) => {
        newTotals.cash[currency] = (newTotals.cash[currency] || 0) + price;
      });
      item.card?.forEach(({ price, currency }) => {
        newTotals.card[currency] = (newTotals.card[currency] || 0) + price;
      });
    });
    setTotals(newTotals); // Update totals state
  }, [filteredData]);

  // Use mock data from context in test environment if not explicitly testing API calls
  useEffect(() => {
    if (process.env.NODE_ENV === 'test' && !window.__TESTING_API_CALLS__) {
      if (contextFilteredData && contextFilteredData.length > 0) {
        setFilteredData(contextFilteredData);
      }
      if (contextTransferredItems && contextTransferredItems.length > 0) {
        setTransferredItems(contextTransferredItems);
      }
      if (contextDeductionsData && contextDeductionsData.length > 0) {
        setDeductionsData(contextDeductionsData);
      }
    }
  }, [contextFilteredData, contextTransferredItems, contextDeductionsData]);

  // Set products from goods when goods are loaded (use goods for product selection in advances)
  useEffect(() => {
    if (goods && Array.isArray(goods) && goods.length > 0) {
      setProducts(goods);
      setFilteredProducts(goods); // Initialize filtered products from goods
    }
  }, [goods]);

  // Update available funds when relevant data changes
  useEffect(() => {
    const newAvailableFunds = calculateAvailableFunds();
    setAvailableFunds(newAvailableFunds);
  }, [filteredData, transferredItems, deductionsData]);

  // Fetch employees on component mount
  useEffect(() => {
    fetchEmployees();
    fetchTodaysWorkHours();
  }, []);

  // Filter products based on search query
  useEffect(() => {
    if (!productSearchQuery) {
      setFilteredProducts(products);
    } else {
      const filtered = products.filter(product => 
        (product.fullName && product.fullName.toLowerCase().includes(productSearchQuery.toLowerCase())) ||
        (product.Tow_Opis && product.Tow_Opis.toLowerCase().includes(productSearchQuery.toLowerCase())) ||
        (product.code && product.code.toLowerCase().includes(productSearchQuery.toLowerCase())) ||
        (product.Tow_Kod && product.Tow_Kod.toLowerCase().includes(productSearchQuery.toLowerCase())) ||
        (product.name && product.name.toLowerCase().includes(productSearchQuery.toLowerCase()))
      );
      setFilteredProducts(filtered);
    }
  }, [productSearchQuery, products]);

  // Filter stocks based on search query
  useEffect(() => {
    if (!stockSearchQuery) {
      setFilteredStocks(stocks || []);
    } else {
      const filtered = (stocks || []).filter(stock => 
        (stock.Tow_Opis && stock.Tow_Opis.toLowerCase().includes(stockSearchQuery.toLowerCase())) ||
        (stock.Tow_Kod && stock.Tow_Kod.toLowerCase().includes(stockSearchQuery.toLowerCase()))
      );
      setFilteredStocks(filtered);
    }
  }, [stockSearchQuery, stocks]);

  // Filter colors based on search query
  useEffect(() => {
    if (!colorSearchQuery) {
      setFilteredColors(colors || []);
    } else {
      const filtered = (colors || []).filter(color => 
        (color.Kol_Opis && color.Kol_Opis.toLowerCase().includes(colorSearchQuery.toLowerCase())) ||
        (color.Kol_Kod && color.Kol_Kod.toLowerCase().includes(colorSearchQuery.toLowerCase()))
      );
      setFilteredColors(filtered);
    }
  }, [colorSearchQuery, colors]);

  // Filter sizes based on search query
  useEffect(() => {
    if (!sizeSearchQuery) {
      setFilteredSizes(sizes || []);
    } else {
      const query = sizeSearchQuery.toLowerCase().trim();
      const filtered = (sizes || []).filter(size => {
        const opis = (size.Roz_Opis || '').toLowerCase();
        const kod = (size.Roz_Kod || '').toLowerCase();
        
        // Exact match or starts with query
        return opis === query || kod === query || 
               opis.startsWith(query + ' ') || kod.startsWith(query + ' ') ||
               opis.startsWith(query) || kod.startsWith(query);
      });
      setFilteredSizes(filtered);
    }
  }, [sizeSearchQuery, sizes]);

  // Load assigned salespeople on component mount
  useEffect(() => {
    fetchAssignedSalespeople();
  }, []);

  // Load currency rates on component mount for PLN turnover
  useEffect(() => {
    if (currencyRates.length === 0) {
      fetchCurrencyRates();
    }
  }, []);

  // Fetch currency rates when modal opens
  useEffect(() => {
    if (currencyRatesModalVisible) {
      fetchCurrencyRates();
    }
  }, [currencyRatesModalVisible]);

  // Fetch currency rates when calculator modal opens
  useEffect(() => {
    if (calculatorModalVisible && currencyRates.length === 0) {
      fetchCurrencyRates();
    }
  }, [calculatorModalVisible]);

  // Przesunięcia z dzisiaj: JEDNO zapytanie dla trzech list (dawniej trzy pobrania całego archiwum przesunięć).
  // Równoległe wywołania (np. przy wejściu na zakładkę) korzystają z tego samego zapytania.
  const transfersRequestRef = useRef(null);
  const loadTodayTransfers = () => {
    if (!transfersRequestRef.current) {
      transfersRequestRef.current = (async () => {
        const response = await tokenService.authenticatedFetch(getApiUrl(`/transfer?day=${todayParam()}`));
        if (!response || !response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        return Array.isArray(data) ? data : (data?.transfers || data?.data || []);
      })().finally(() => {
        setTimeout(() => { transfersRequestRef.current = null; }, 0);
      });
    }
    return transfersRequestRef.current;
  };

  const fetchTransferredItems = async () => {
    try {
      const transferArray = await loadTodayTransfers();
      setTransferredItems(transferArray.filter((item) => item.transfer_from === user.symbol)); // Filter items by transfer_from
    } catch (error) {
      setTransferredItems([]); // Fallback to empty array
    }
  };

  const fetchReceivedItems = async () => {
    try {
      const transferArray = await loadTodayTransfers();
      setReceivedItems(transferArray.filter((item) => item.transfer_to === user.symbol)); // Filter items by transfer_to
    } catch (error) {
      setReceivedItems([]); // Fallback to empty array
    }
  };

  const fetchAdvances = async () => {
    try {
      const transferArray = await loadTodayTransfers();
      // Tylko przesunięcia od obecnego użytkownika z zaliczką
      setAdvancesData(transferArray.filter((item) =>
        item.transfer_from === user.symbol &&
        item.advancePayment &&
        item.advancePayment > 0
      ));
    } catch (error) {
      setAdvancesData([]); // Fallback to empty array
    }
  };

  const fetchFinancialOperations = async () => {
    const requestId = ++operationsRequestRef.current;
    try {
      // Tylko dzisiejsze operacje własnego konta
      const response = await tokenService.authenticatedFetch(getApiUrl(`/financial-operations?day=${todayParam()}`));
      
      if (!response || !response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data = await response.json();
      
      // Ensure data is an array
      if (requestId !== operationsRequestRef.current) return; // w międzyczasie poszło nowsze pobranie
      const operationsArray = Array.isArray(data) ? data : (data?.operations || data?.data || []);
      
      // Filtruj operacje finansowe dla obecnego użytkownika
      const operationsFiltered = operationsArray.filter((item) => 
        item.userSymbol === user.symbol
      );
      
      setDeductionsData(operationsFiltered); // Keep same state variable for now to avoid breaking changes
    } catch (error) {
      // Fallback to old deductions endpoint if new one doesn't exist yet
      try {
        const response = await tokenService.authenticatedFetch(getApiUrl("/deductions"));
        
        if (!response || !response.ok) {
          throw new Error('Network response was not ok');
        }
        
        const data = await response.json();
        const deductionsArray = Array.isArray(data) ? data : (data?.deductions || data?.data || []);
        const deductionsFiltered = deductionsArray.filter((item) => 
          item.userSymbol === user.symbol
        );
        setDeductionsData(deductionsFiltered);
      } catch (fallbackError) {
        setDeductionsData([]);
      }
    }
  };

  // Po edycji / usunięciu sprzedaży serwer zmienia też inne dane (cena w zaliczce zamówienia przy wymianie, prowizje,
  // zamówienie wraca do oczekujących) - przeładowujemy sprzedaże i operacje, żeby sumy i obrót były aktualne od razu
  const refreshAfterSaleChange = async () => {
    try {
      await Promise.all([
        fetchSalesData(),
        user?.symbol ? fetchFinancialOperations() : Promise.resolve(),
      ]);
    } catch (error) {
      // pobieranie ma własną obsługę błędów; lista zostaje z poprawką lokalną
    }
  };

  // Function to calculate available funds by currency
  const calculateAvailableFunds = () => {
    // FOR TESTING: Uncomment line below to simulate tomorrow
    // const today = '2025-08-11'; // TEST: Simulate tomorrow (dzień później)
    const today = new Date().toISOString().split('T')[0]; // NORMAL: Real today
    

    
    // Calculate total sales by currency
    const salesTotals = {};
    filteredData.forEach(item => {
      (item.cash || [])
        .filter(({ price }) => price !== undefined && price !== null && price !== "" && price !== 0)
        .forEach(({ price, currency }) => {
          salesTotals[currency] = (salesTotals[currency] || 0) + parseFloat(price);
        });
    });
    
    // Calculate total advances by currency
    const advancesTotals = {};
    transferredItems
      .filter(item => item.date && item.date.startsWith(today) && item.advancePayment > 0)
      .forEach(item => {
        const currency = item.advancePaymentCurrency;
        advancesTotals[currency] = (advancesTotals[currency] || 0) + item.advancePayment;
      });
    
    // Calculate total financial operations by currency (positive amounts add, negative amounts subtract)
    const operationsTotals = {};
    deductionsData
      .filter(item => item.date && item.date.startsWith(today))
      .forEach(item => {
        const currency = item.currency;
        // Use actual amount (positive or negative) directly
        operationsTotals[currency] = (operationsTotals[currency] || 0) + item.amount;
      });
    
    // Calculate available funds by currency
    const allCurrencies = new Set([
      ...Object.keys(salesTotals),
      ...Object.keys(advancesTotals),
      ...Object.keys(operationsTotals)
    ]);
    
    const availableFunds = {};
    allCurrencies.forEach(currency => {
      const sales = salesTotals[currency] || 0;
      const advances = advancesTotals[currency] || 0;
      const operations = operationsTotals[currency] || 0;
      availableFunds[currency] = sales + advances + operations; // Add operations (can be positive or negative)
    });
    
    return availableFunds;
  };

  // Employee/Salesperson management functions
  const fetchEmployees = async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/employees'));
      if (response.ok) {
        const data = await response.json();
        const employeesArray = Array.isArray(data) ? data : (data?.employees || data?.data || []);
        
        // Filtruj pracowników według lokalizacji zalogowanego użytkownika
        const filteredEmployees = user?.location 
          ? employeesArray.filter(employee => 
              employee.workLocation && user.location &&
              employee.workLocation.trim() === user.location.trim()
            )
          : employeesArray;
          
        setEmployees(filteredEmployees);
        // Logger.debug(`Loaded ${filteredEmployees.length} employees for location: ${user?.location}`);
      }
    } catch (error) {
      setEmployees([]);
    }
  };

  // Fetch assigned salespeople from database
  const fetchAssignedSalespeople = async () => {
    try {
      const { accessToken } = await tokenService.getTokens();
      const userData = await AsyncStorage.getItem('user');
      
      // Logger.debug('Fetch assigned - Token:', accessToken ? 'present' : 'missing');
      // Logger.debug('Fetch assigned - UserData:', userData ? 'present' : 'missing');
      
      if (!accessToken || !userData) {
        if (process.env.NODE_ENV !== 'test') {
          Logger.debug('No token or user data available');
        }
        return;
      }

      const user = JSON.parse(userData);
      const sellingPoint = user.sellingPoint || user.symbol;

      if (!sellingPoint) {
        Logger.debug('No selling point available');
        return;
      }

      const response = await fetch(getApiUrl(`/sales-assignments?sellingPoint=${encodeURIComponent(sellingPoint)}`), {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const assignments = data.assignments || [];
        
        // Extract employee data from assignments - filter out null values
        const assignedEmployees = assignments
          .map(assignment => assignment.employeeId)
          .filter(emp => emp !== null && emp !== undefined);
        setAssignedSalespeople(assignedEmployees);
        // Logger.debug('Loaded assigned salespeople:', assignedEmployees.length);
      }
    } catch (error) {
      // Silent error handling
    }
  };

  const assignSalesperson = async (employee) => {
    if (!assignedSalespeople.find(person => person._id === employee._id)) {
      try {
        // Pobierz dane użytkownika z localStorage
        const { accessToken } = await tokenService.getTokens();
        const userData = await AsyncStorage.getItem('user');
        
        Logger.debug('Assign salesperson - Token:', accessToken ? 'present' : 'missing');
        Logger.debug('Assign salesperson - UserData:', userData ? 'present' : 'missing');
        
        if (!accessToken || !userData) {
          setErrorMessage("Brak danych autoryzacji. Zaloguj się ponownie.");
          setErrorModalVisible(true);
          return;
        }

        const user = JSON.parse(userData);
        const sellingPoint = user.sellingPoint || user.symbol;

        if (!sellingPoint) {
          setErrorMessage("Nie można określić punktu sprzedaży.");
          setErrorModalVisible(true);
          return;
        }

        // Wyślij zapytanie do API
        const response = await fetch(getApiUrl('/sales-assignments'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            employeeId: employee._id,
            sellingPoint: sellingPoint,
            notes: `Przypisano przez ${user.email || user.symbol}`
          })
        });

        const data = await response.json();

        if (response.ok) {
          // Dodaj do lokalnego stanu
          const updatedSalespeople = [...assignedSalespeople, employee];
          setAssignedSalespeople(updatedSalespeople);
          
          // 🔄 Odśwież godziny pracy żeby pracownik był na szaro (bez godzin)
          await fetchTodaysWorkHours();
          
          setSuccessMessage(
            `Sprzedawca ${employee.firstName} ${employee.lastName} został dodany do zespołu i zapisany w bazie danych.`
          );
          setSuccessModalVisible(true);
        } else {
          setErrorMessage(data.message || "Nie udało się dodać sprzedawcy do bazy danych");
          setErrorModalVisible(true);
        }
      } catch (error) {
        Logger.error('Error assigning salesperson:', error);
        setErrorMessage("Błąd połączenia z serwerem. Spróbuj ponownie.");
        setErrorModalVisible(true);
      }
    } else {
      setSuccessMessage(
        `Sprzedawca ${employee.firstName} ${employee.lastName} jest już przypisany.`
      );
      setSuccessModalVisible(true);
    }
  };

  const removeSalesperson = async (employeeId) => {
    const employee = assignedSalespeople.find(person => person._id === employeeId);
    setEmployeeToRemove(employee);
    setRemoveEmployeeModalVisible(true);
  };

  const handleRemoveEmployee = (deleteWorkHours) => {
    if (employeeToRemove) {
      setRemoveEmployeeModalVisible(false);
      performRemoval(employeeToRemove._id, deleteWorkHours);
    }
  };

  const cancelRemoveEmployee = () => {
    setEmployeeToRemove(null);
    setRemoveEmployeeModalVisible(false);
  };

  const performRemoval = async (employeeId, deleteWorkHours) => {
    try {
      // Pobierz dane użytkownika z localStorage
      const { accessToken } = await tokenService.getTokens();
      const userData = await AsyncStorage.getItem('user');
      
      if (!accessToken || !userData) {
        setSuccessMessage("Brak danych autoryzacji. Zaloguj się ponownie.");
        setSuccessModalVisible(true);
        return;
      }

      const user = JSON.parse(userData);
      const sellingPoint = user.sellingPoint || user.symbol;

      if (!sellingPoint) {
        setSuccessMessage("Nie można określić punktu sprzedaży.");
        setSuccessModalVisible(true);
        return;
      }

      const url = getApiUrl(`/sales-assignments/employee/${employeeId}?sellingPoint=${encodeURIComponent(sellingPoint)}&deleteWorkHours=${deleteWorkHours}`);

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();

      if (response.ok) {
        // Usuń z lokalnego stanu
        const updatedSalespeople = assignedSalespeople.filter(person => person._id !== employeeId);
        setAssignedSalespeople(updatedSalespeople);
        
        // 🔄 Odśwież godziny pracy żeby stan był aktualny
        await fetchTodaysWorkHours();
        
        const message = deleteWorkHours 
          ? "Sprzedawca został usunięty z zespołu wraz z godzinami pracy." 
          : "Sprzedawca został usunięty z zespołu. Godziny pracy zostały zachowane.";
        setSuccessMessage(message);
        setSuccessModalVisible(true);
      } else if (response.status === 404) {
        // Przypisanie nie istnieje w bazie - usuń tylko lokalnie
        const updatedSalespeople = assignedSalespeople.filter(person => person._id !== employeeId);
        setAssignedSalespeople(updatedSalespeople);
        
        // 🔄 Odświeżam godziny pracy żeby stan był aktualny  
        await fetchTodaysWorkHours();
        
        setSuccessMessage("Sprzedawca został usunięty z zespołu (nie był zapisany w bazie danych).");
        setSuccessModalVisible(true);
      } else {
        setSuccessMessage(data.message || "Nie udało się usunąć sprzedawcy z bazy danych");
        setSuccessModalVisible(true);
      }
    } catch (error) {
      setSuccessMessage("Błąd połączenia z serwerem. Spróbuj ponownie.");
      setSuccessModalVisible(true);
    }
  };

  const toggleSalespersonSelection = (employee) => {
    if (!employee || !employee._id) return;
    
    setSelectedSalespeople(prevSelected => {
      const isSelected = prevSelected.find(person => person._id === employee._id);
      
      if (isSelected) {
        // Remove from selection
        return prevSelected.filter(person => person._id !== employee._id);
      } else {
        // Add to selection
        return [...prevSelected, employee];
      }
    });
  };

  const assignSelectedSalespeople = async () => {
    if (selectedSalespeople.length === 0) {
      setErrorMessage("Proszę wybrać co najmniej jednego sprzedawcę.");
      setErrorModalVisible(true);
      return;
    }

    let addedCount = 0;
    let alreadyAssignedNames = [];
    let errorCount = 0;

    // Pobierz dane autoryzacji
    const { accessToken } = await tokenService.getTokens();
    const userData = await AsyncStorage.getItem('user');
    
    if (!accessToken || !userData) {
      setErrorMessage("Brak danych autoryzacji. Zaloguj się ponownie.");
      setErrorModalVisible(true);
      return;
    }

    const user = JSON.parse(userData);
    const sellingPoint = user.sellingPoint || user.symbol;

    if (!sellingPoint) {
      setErrorMessage("Nie można określić punktu sprzedaży.");
      setErrorModalVisible(true);
      return;
    }

    // Dodaj każdego sprzedawcę przez API
    for (const employee of selectedSalespeople) {
      if (!assignedSalespeople.find(person => person._id === employee._id)) {
        try {
          const requestBody = {
            employeeId: employee._id,
            sellingPoint: sellingPoint,
            notes: `Przypisano przez ${user.email || user.symbol}`
          };
          
          const response = await fetch(getApiUrl('/sales-assignments'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(requestBody)
          });
          const data = await response.json();

          if (response.ok) {
            addedCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
        }
      } else {
        alreadyAssignedNames.push(`${employee.firstName} ${employee.lastName}`);
      }
    }

    // Odśwież listę przypisanych sprzedawców z bazy danych
    await fetchAssignedSalespeople();
    
    // 🔧 FIX: Odśwież też godziny pracy, żeby pokazać aktualny stan
    await fetchTodaysWorkHours();

    setSalespersonModalVisible(false);
    setSelectedSalespeople([]);

    // Pokaż komunikat o wynikach
    let message = "";
    if (addedCount > 0) {
      message += `Dodano ${addedCount} sprzedawc${addedCount === 1 ? 'a' : 'ów'} do zespołu.`;
    }
    if (errorCount > 0) {
      message += `\nBłąd przy dodawaniu ${errorCount} sprzedawc${errorCount === 1 ? 'a' : 'ów'}.`;
    }
    if (alreadyAssignedNames.length > 0) {
      message += `\nJuż przypisani: ${alreadyAssignedNames.join(', ')}`;
    }

    setSuccessMessage(message || "Nie dodano żadnych nowych sprzedawców.");
    setSuccessModalVisible(true);
  };

  // Commission recalculation function
  const recalculateCommissions = async () => {
    try {
      const apiBase = API_CONFIG.BASE_URL;
      const endpoint = '/sales-assignments/recalculate-commissions';
      const fullUrl = `${apiBase}${endpoint}`;
      
      const requestBody = {
        sellingPoint: user?.sellingPoint,
        date: new Date().toISOString().split('T')[0] // Today's date
      };
      
      
      const response = await tokenService.authenticatedFetch(
        getApiUrl('/sales-assignments/recalculate-commissions'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        setSuccessMessage("Sukces! Prowizje zostały przeliczone.");
        setSuccessModalVisible(true);
      } else {
        const errorText = await response.text();
        
        let errorMessage = "Nie udało się przeliczyć prowizji.";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          // Use text response if JSON parsing fails
          errorMessage = errorText || errorMessage;
        }
        
        setErrorMessage(`Błąd przeliczania prowizji (${response.status}): ${errorMessage}`);
        setErrorModalVisible(true);
      }
    } catch (error) {
      setErrorMessage(`Błąd połączenia z serwerem prowizji: ${error.message}`);
      setErrorModalVisible(true);
    }
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    setConfirmDeleteModalVisible(false);
    try {
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/sales/delete-sale/${selectedItem._id}`),
        { method: "DELETE" }
      );
      
      if (!response.ok) {
        // np. sprzedaż odpisana już w Dobieraniu - pokaż powód z serwera
        const data = await response.json().catch(() => ({}));
        const serverError = new Error(data?.message || "Nie udało się usunąć sprzedaży. Spróbuj ponownie.");
        serverError.fromServer = true;
        throw serverError;
      }
      setFilteredData((prev) =>
        prev.filter((item) => item._id !== selectedItem._id)
      ); // Remove the item from the list
      setModalVisible(false); // Close the options modal
      await refreshAfterSaleChange(); // sumy, obrót, zaliczki i prowizje z serwera
      
      // Backend już automatycznie przeliczył prowizje po usunięciu
      
      setSuccessMessage("Sprzedaż została pomyślnie usunięta!");
      setSuccessModalVisible(true);
    } catch (error) {
      setErrorMessage(error.fromServer ? error.message : "Nie udało się usunąć sprzedaży. Spróbuj ponownie.");
      setErrorModalVisible(true);
    }
  };

  // Handle Pan Kazek transfer
  const handlePanKazekTransfer = () => {
    setPanKazekModalVisible(true);
  };

  const confirmPanKazekTransfer = async () => {
    if (!selectedItem) {
      appAlert("Error", "No item selected for transfer.");
      return;
    }

    if (!user || !user.symbol) {
      appAlert("Błąd", "Brak danych zalogowanego użytkownika");
      return;
    }

    // Debug: sprawdźmy strukturę selectedItem
    Logger.debug('Selected item for Pan Kazek:', selectedItem);

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Poprawne pobieranie ceny - używamy tej samej logiki co w wyświetlaniu listy
    let itemPrice = "0";
    
    const payments = [...(selectedItem.cash || []), ...(selectedItem.card || [])]
      .filter(({ price }) => price !== undefined && price !== null && price !== "" && price !== 0);
    
    if (payments.length > 0) {
      itemPrice = payments.map(({ price, currency }) => `${price} ${currency}`).join(' + ');
    } else if (selectedItem.totalPrice) {
      itemPrice = selectedItem.totalPrice.toString();
    } else if (selectedItem.price) {
      itemPrice = selectedItem.price.toString();
    }

    // Use sales item ID as productId (this is what Pan Kazek tracks)
    const panKazekData = {
      productId: selectedItem._id, // Use sales ID directly
      fullName: selectedItem.fullName || selectedItem.name || "Nieznana nazwa",
      size: selectedItem.size || "Nieznany rozmiar",
      price: itemPrice,
      barcode: selectedItem.barcode || "",
      date: new Date().toISOString(),
      dateString: today,
      addedBy: user.symbol,
      symbol: user.symbol
    };

    Logger.debug('Pan Kazek data to send:', panKazekData);

    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/pan-kazek'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(panKazekData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        appAlert("Błąd", errorData.message || "Nie udało się dodać produktu do Pana Kazka");
        return;
      }

      // Show success message
      setSuccessMessage("Produkt został dodany do listy Pana Kazka!");
      setSuccessModalVisible(true);

      // Add item to local Pan Kazek list for immediate UI update
      setPanKazekItems(prevItems => [...prevItems, { productId: selectedItem._id, ...panKazekData }]);

      // No need to refresh state data anymore since we're tracking sales directly

      setModalVisible(false);
      setPanKazekModalVisible(false);
    } catch (error) {
      appAlert("Error", "Wystąpił nieoczekiwany błąd podczas dodawania produktu do Pana Kazka.");
    }
  };

  // Handle removing item from Pan Kazek list
  const handleRemoveFromPanKazek = async () => {
    if (!selectedItem) {
      appAlert("Error", "No item selected.");
      return;
    }

    try {
      const response = await tokenService.authenticatedFetch(getApiUrl(`/pan-kazek/${selectedItem._id}`), {
        method: "DELETE"
      });

      if (!response.ok) {
        const errorData = await response.json();
        appAlert("Błąd", errorData.message || "Nie udało się usunąć produktu z listy Pana Kazka");
        return;
      }

      // Remove item from local Pan Kazek list for immediate UI update
      setPanKazekItems(prevItems => prevItems.filter(item => item.productId !== selectedItem._id));

      // Show success message
      setSuccessMessage("Produkt został usunięty z listy Pana Kazka!");
      setSuccessModalVisible(true);

      setModalVisible(false);
    } catch (error) {
      appAlert("Error", "Wystąpił nieoczekiwany błąd podczas usuwania produktu z listy Pana Kazka.");
    }
  };

  // Work hours management functions
  const fetchTodaysWorkHours = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/work-hours?date=${today}&sellingPoint=${user?.sellingPoint}`)
      );
      
      if (response.ok) {
        const data = await response.json();
        setTodaysWorkHours(data.workHours || []);
      }
    } catch (error) {
      // Silent error handling
    }
  };

  const openWorkHoursModal = async (employee) => {
    setSelectedEmployeeForHours(employee);
    setWorkNotes("");
    
    try {
      // Logger.debug(`🔍 Sprawdzam istniejące godziny pracy dla ${employee.firstName} ${employee.lastName}`);
      
      // Pobierz punkt sprzedaży z danych użytkownika
      const currentSellingPoint = user?.sellingPoint || user?.symbol;
      if (!currentSellingPoint) {
        Logger.debug(`❌ Brak punktu sprzedaży - używam domyślnych godzin`);
        setWorkStartTime("08:00");
        setWorkEndTime("16:00");
        setWorkHoursModalVisible(true);
        return;
      }
      
      // Sprawdź czy istnieją już godziny pracy dla tego pracownika na dzisiaj
      const today = new Date().toISOString().split('T')[0]; // "2025-11-12"
      
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/work-hours?employeeId=${employee._id}&startDate=${today}&endDate=${today}&sellingPoint=${encodeURIComponent(currentSellingPoint)}`)
      );
      
      if (response.ok) {
        const result = await response.json();
        if (result.workHours && result.workHours.length > 0) {
          const workHours = result.workHours[0]; // Pierwszy (i jedyny) wynik
          // Logger.debug(`✅ Znaleziono godziny pracy: ${workHours.startTime} - ${workHours.endTime}`);
          setWorkStartTime(workHours.startTime);
          setWorkEndTime(workHours.endTime);
          if (workHours.notes) setWorkNotes(workHours.notes);
        } else {
          setWorkStartTime("08:00");
          setWorkEndTime("16:00");
        }
      } else {
        Logger.debug(`📝 Nie można pobrać godzin pracy - używam domyślnych`);
        setWorkStartTime("08:00");
        setWorkEndTime("16:00");
      }
    } catch (error) {
      Logger.error("Błąd podczas pobierania godzin pracy:", error);
      setWorkStartTime("08:00");
      setWorkEndTime("16:00");
    }
    
    setWorkHoursModalVisible(true);
  };

  const saveWorkHours = async () => {
    if (!selectedEmployeeForHours) {
      setErrorMessage("Nie wybrano pracownika.");
      setErrorModalVisible(true);
      return;
    }

    // Validate time format
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(workStartTime)) {
      setErrorMessage("Nieprawidłowy format godziny rozpoczęcia. Użyj HH:MM (np. 08:00)");
      setErrorModalVisible(true);
      return;
    }
    
    if (!timeRegex.test(workEndTime)) {
      setErrorMessage("Nieprawidłowy format godziny zakończenia. Użyj HH:MM (np. 16:00)");
      setErrorModalVisible(true);
      return;
    }

    // Validate time logic
    const startParts = workStartTime.split(':');
    const endParts = workEndTime.split(':');
    const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
    const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

    if (startMinutes >= endMinutes) {
      setErrorMessage("Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia.");
      setErrorModalVisible(true);
      return;
    }

    const totalHours = (endMinutes - startMinutes) / 60;
    if (totalHours > 16) {
      setSuccessMessage("Czas pracy przekracza 16 godzin. Godziny zostały zapisane, ale sprawdź czy to jest prawidłowe.");
      setSuccessModalVisible(true);
      submitWorkHours(); // Zapisz mimo ostrzeżenia
    } else {
      submitWorkHours();
    }
  };

  const submitWorkHours = async () => {
    try {
      const workHoursData = {
        employeeId: selectedEmployeeForHours._id,
        date: new Date().toISOString().split('T')[0],
        startTime: workStartTime,
        endTime: workEndTime,
        sellingPoint: user?.sellingPoint || '',
        location: user?.location || '',
        notes: workNotes.trim()
      };

      // Użyj endpoint upsert - automatycznie update lub create
      const response = await tokenService.authenticatedFetch(getApiUrl('/work-hours/upsert'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(workHoursData)
      });

      if (response.ok) {
        const result = await response.json();
        const actionText = result.isUpdate ? 'zaktualizowane' : 'zapisane';
        
        setSuccessMessage(
          `Godziny pracy dla ${selectedEmployeeForHours.firstName} ${selectedEmployeeForHours.lastName} zostały ${actionText}.\n\nGodziny: ${workStartTime} - ${workEndTime}`
        );
        setSuccessModalVisible(true);
        closeWorkHoursModal(); // Użyj funkcji pomocniczej do zamknięcia
        fetchTodaysWorkHours(); // Refresh today's work hours
        // Prowizje przelicza serwer przy zapisie godzin - drugie przeliczenie z telefonu było zbędne
      } else {
        const errorData = await response.json();
        setErrorMessage(
          errorData.message || "Nie udało się zapisać godzin pracy."
        );
        setErrorModalVisible(true);
      }
    } catch (error) {
      setSuccessMessage(
        `Wystąpił błąd podczas zapisywania godzin pracy.\n\nSzczegóły: ${error.message}`
      );
      setSuccessModalVisible(true);
    }
  };

  const closeWorkHoursModal = () => {
    setWorkHoursModalVisible(false);
    // Reset stanu do domyślnego - będzie ponownie wczytany przy następnym otwarciu
    setSelectedEmployeeForHours(null);
    setWorkStartTime("08:00");
    setWorkEndTime("16:00");
    setWorkNotes("");
  };

  const formatTime = (timeString) => {
    return timeString;
  };

  const generateTimeOptions = () => {
    const times = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        times.push(timeString);
      }
    }
    return times;
  };

  const submitDeduction = async () => {
    if (!deductionAmount || parseFloat(deductionAmount) <= 0) {
      setErrorMessage("Proszę wprowadzić prawidłową kwotę.");
      setErrorModalVisible(true);
      return;
    }
    
    // Validate currency rate for non-PLN currencies
    if (deductionCurrency !== 'PLN' && showDeductionRateInput) {
      if (!deductionCurrencyRate || parseFloat(deductionCurrencyRate) <= 0) {
        setErrorMessage(`Proszę wprowadzić prawidłowy kurs dla ${deductionCurrency} (większy od 0).`);
        setErrorModalVisible(true);
        return;
      }
    }
    
    if (deductionType === "employee_advance") {
      if (!selectedEmployeeForAdvance) {
        setErrorMessage("Proszę wybrać pracownika dla zaliczki.");
        setErrorModalVisible(true);
        return;
      }
    } else {
      if (!deductionReason.trim()) {
        setErrorMessage("Proszę wprowadzić powód odpisania.");
        setErrorModalVisible(true);
        return;
      }
    }
    
    // Check if there are sufficient funds
    const requestedAmount = parseFloat(deductionAmount);
    const currentAvailable = availableFunds[deductionCurrency] || 0;
    
    if (requestedAmount > currentAvailable) {
      setErrorMessage(
        `Niewystarczające środki\n\nNie można odpisać ${requestedAmount} ${deductionCurrency}.\n\nDostępne środki w ${deductionCurrency}: ${currentAvailable.toFixed(2)}\n\nSprawdź "Zamknięcie dnia" na dole ekranu, aby zobaczyć wszystkie dostępne środki.`
      );
      setErrorModalVisible(true);
      return;
    }
    
    try {
      let operationData = {
        userSymbol: user.symbol,
        amount: -parseFloat(deductionAmount), // Negative for deduction
        currency: deductionCurrency,
        type: deductionType === "employee_advance" ? "employee_advance" : "deduction",
        reason: deductionType === "employee_advance" 
          ? `Zaliczka dla ${selectedEmployeeForAdvance.firstName} ${selectedEmployeeForAdvance.lastName}${deductionReason.trim() ? ` - ${deductionReason.trim()}` : ''}`
          : deductionReason.trim(),
        date: new Date().toISOString(),
      };

      // Add currency rate if it's not PLN and user provided a rate
      if (deductionCurrency !== 'PLN' && deductionCurrencyRate && parseFloat(deductionCurrencyRate) > 0) {
        operationData.currencyRate = parseFloat(deductionCurrencyRate);
        // Update currency rate in storage
        await CurrencyService.updateCurrencyRate(deductionCurrency, parseFloat(deductionCurrencyRate));
      }

      // Dodaj dane pracownika dla zaliczek
      if (deductionType === "employee_advance") {
        operationData.employeeId = selectedEmployeeForAdvance._id;
        operationData.employeeName = `${selectedEmployeeForAdvance.firstName} ${selectedEmployeeForAdvance.lastName}`;
        operationData.employeeCode = selectedEmployeeForAdvance.employeeId;
      }
      
      const response = await tokenService.authenticatedFetch(getApiUrl("/financial-operations"), {
        method: "POST",
        body: JSON.stringify(operationData),
      });
      
      if (!response.ok) {
        throw new Error("Failed to submit deduction");
      }
      
      // Reset form and refresh data
      setDeductionAmount("");
      setDeductionCurrency("PLN");
      setDeductionCurrencyRate("");
      setShowDeductionRateInput(false);
      setDeductionReason("");
      setDeductionType("other");
      setSelectedEmployeeForAdvance(null);
      setDeductionModalVisible(false);
      await fetchFinancialOperations();
      
      setSuccessMessage("Kwota została odpisana.");
      setSuccessModalVisible(true);
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        Logger.error("Error submitting deduction:", error);
      }
      setErrorMessage("Nie udało się odpisać kwoty. Spróbuj ponownie.");
      setErrorModalVisible(true);
    }
  };

  // ---- „Dopisz kwotę” → „Zaliczka na produkt”: cena finalna i wpłaty jak przy sprzedaży ----
  // Cennik punktu przy każdym otwarciu formularza (zmiany cen z panelu od razu widoczne)
  useEffect(() => {
    if (addAmountModalVisible) loadMyPriceList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAmountModalVisible]);

  // Reguła ceny dla wybranego produktu: zeskanowana sztuka (kod z metki) albo karta produktu z listy + rozmiar
  const addAmountRule = (() => {
    if (reasonType !== 'product' || !selectedProduct) return null;
    const stateItem = stateData?.find((item) => (item.id || item._id) === selectedProduct);
    if (stateItem?.barcode) {
      return salePriceRule({ barcode: stateItem.barcode, goods, sizes, priceList: myPriceList })
        || regularOrPromoRule(stateItem.price, stateItem.discount_price, stateItem.category, stateItemStoredMinimum(stateItem, goods));
    }
    const good = (goods || []).find((item) => (item._id || item.id) === selectedProduct);
    const sizeList = Array.isArray(sizes) ? sizes : [];
    const size = sizeList.find((item) => (item._id || item.id) === selectedSize)
      || sizeList.find((item) => item.Roz_Opis && item.Roz_Opis === String(sizeSearchQuery || '').trim())
      || null;
    return salePriceRuleForGood({ good, size, priceList: myPriceList });
  })();

  // Domyślna cena finalna (zasady jak przy sprzedaży) - raz na produkt/rozmiar, potem można ją poprawić; w edycji bez zmian
  useEffect(() => {
    setAddAmountMinPrice(addAmountRule?.minPrice ?? null);
    if (isEditingAddAmount || !addAmountRule || addAmountRule.defaultPrice === null) return;
    const key = `${selectedProduct}|${sizeSearchQuery}|${myPriceList ? myPriceList.length : 'brak'}`;
    if (lastAutoPriceKeyRef.current === key) return;
    lastAutoPriceKeyRef.current = key;
    setProductFinalPrice(String(addAmountRule.defaultPrice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAmountRule?.defaultPrice, addAmountRule?.minPrice, selectedProduct, sizeSearchQuery, myPriceList, isEditingAddAmount]);

  // Wpłaty zaliczki w PLN i „Do dopłaty” w walucie, w której klient dopłaci (te same wyliczenia co przy sprzedaży)
  const addAmountBalance = computePaymentBalance({ price: productFinalPrice, payments: addAmountPairs, currencyRates });
  const addAmountRemainingInCurrency = plnToCurrency(Math.max(0, addAmountBalance.remainingPln), productSaleCurrency, currencyRates);
  // Klient wpłacił więcej niż cena: reszta (w walucie „Do dopłaty”) odejmowana od wpłat przy zapisie
  const addAmountIsOverpaid = addAmountBalance.remainingPln < -0.005;
  const addAmountOverpaidInCurrency = plnToCurrency(Math.abs(addAmountBalance.remainingPln), productSaleCurrency, currencyRates);
  const addAmountChangeSuggested = addAmountOverpaidInCurrency === null ? "" : roundDownMoney(addAmountOverpaidInCurrency); // reszta w dół
  const addAmountChangeKey = `${addAmountChangeSuggested}|${productSaleCurrency}`;
  const addAmountChangeInput = addAmountChangeOverride && addAmountChangeOverride.key === addAmountChangeKey
    ? addAmountChangeOverride.value
    : addAmountChangeSuggested;

  const handleAddAmountPairChange = (index, value) => {
    setAddAmountPairs((prev) => prev.map((pair, i) => (i === index ? { ...pair, price: value } : pair)));
  };
  const handleAddAmountAddPair = () => setAddAmountPairs((prev) => [...prev, { price: "", currency: "PLN" }]);
  const handleAddAmountRemovePair = (index) => setAddAmountPairs((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const resetAddAmountForm = () => {
    setAddAmountModalVisible(false);
    setAddAmountPairs([{ price: "", currency: "PLN" }]);
    setAddAmountChangeOverride(null);
    setAddAmountPairIndex(0);
    setEditingGroupOps([]);
    setAddAmountMinPrice(null);
    lastAutoPriceKeyRef.current = "";
    setAddAmountAmount("");
    setAddAmountCurrency("PLN");
    setAddAmountReason("");
    setAddAmountIncludeCommission(false);
    setReasonType("");
    setProductType("standard");
    setCustomProductName("");
    setSelectedStock("");
    setSelectedColor("");
    setSelectedSize("");
    setSelectedProduct("");
    setProductSearchQuery("");
    setShowProductDropdown(false);
    setProductFinalPrice("");
    setStockSearchQuery("");
    setColorSearchQuery("");
    setSizeSearchQuery("");
    setShowStockDropdown(false);
    setShowColorDropdown(false);
    setShowSizeDropdown(false);
    setShowAddAmountRateInput(false);
    setAddAmountCurrencyRate("");
    setProductSaleCurrency("PLN");
    setProductPriceInCurrency("");
    setShowProductRateInput(false);
    setProductSaleCurrencyRate("");
    setIsEditingAddAmount(false);
    setEditingOperationId(null);
    setEditingOperationDate(null);
  };

  const fetchFinancialOperationById = async (operationId) => {
    const response = await tokenService.authenticatedFetch(getApiUrl(`/financial-operations/${operationId}`));
    if (!response.ok) {
      throw new Error("Failed to fetch financial operation");
    }
    return response.json();
  };

  const openOperationOptionsModal = (item) => {
    setSelectedOperationItem(item);
    setOperationOptionsVisible(true);
  };

  const openEditAddAmountModal = async (item) => {
    try {
      const fetched = item?._id ? await fetchFinancialOperationById(item._id) : item;
      if (!fetched) {
        throw new Error("No operation data");
      }

      // Zaliczka w kilku walutach: edytujemy wszystkie jej waluty naraz; dane produktu i cena z pierwszej operacji
      const groupOps = fetched.advanceGroupId
        ? [fetched, ...deductionsData.filter((op) => op.advanceGroupId === fetched.advanceGroupId && op._id !== fetched._id)]
        : [fetched];
      const operation = groupOps.find((op) => Number(op.finalPrice) > 0) || fetched;
      const orderedOps = [operation, ...groupOps.filter((op) => op._id !== operation._id)];
      setEditingGroupOps(orderedOps);
      setAddAmountPairs(orderedOps.map((op) => ({ price: String(Math.abs(op.amount || 0)), currency: op.currency || "PLN", _id: op._id })));
      setAddAmountPairIndex(0);

      setIsEditingAddAmount(true);
      setEditingOperationId(operation._id || null);
      setEditingOperationDate(operation.date || null);

      const amountValue = Math.abs(operation.amount || 0).toString();
      const currencyValue = operation.currency || "PLN";
      const hasProduct = Boolean(operation.productId || operation.productName);

      setAddAmountAmount(amountValue);
      setAddAmountCurrency(currencyValue);
      if (currencyValue !== "PLN") {
        setShowAddAmountRateInput(true);
        try {
          const tableRate = currencyRates.find(rate => rate.currency.code === currencyValue);
          if (tableRate && tableRate.buyRate) {
            setAddAmountCurrencyRate(tableRate.buyRate.toString());
          } else {
            const currentRate = await CurrencyService.getCurrencyRate(currencyValue);
            setAddAmountCurrencyRate(currentRate.toString());
          }
        } catch (error) {
          Logger.error('Error loading currency rate:', error);
          setAddAmountCurrencyRate("1.0");
        }
      } else {
        setShowAddAmountRateInput(false);
        setAddAmountCurrencyRate("");
      }

      setReasonType(hasProduct ? "product" : "other");
      setAddAmountReason(hasProduct ? "" : (operation.reason || ""));
      setAddAmountIncludeCommission(!hasProduct && Boolean(operation.includeInCommission));
      setProductType("standard");

      if (hasProduct) {
        setSelectedProduct(operation.productId || "");
        setProductSearchQuery(operation.productName || "");
        setSelectedSize(operation.productSize || "");
        setSizeSearchQuery(operation.productSize || "");
        setProductFinalPrice(operation.finalPrice ? operation.finalPrice.toString() : "");

        const displayCurrency = operation.productDisplayCurrency || "PLN";
        setProductSaleCurrency(displayCurrency);
        if (displayCurrency !== "PLN") {
          setShowProductRateInput(true);
          try {
            const tableRate = currencyRates.find(rate => rate.currency.code === displayCurrency);
            if (tableRate && tableRate.buyRate) {
              setProductSaleCurrencyRate(tableRate.buyRate.toString());
            } else {
              const currentRate = await CurrencyService.getCurrencyRate(displayCurrency);
              setProductSaleCurrencyRate(currentRate.toString());
            }
          } catch (error) {
            Logger.error('Error loading currency rate:', error);
            setProductSaleCurrencyRate("1.0");
          }
        } else {
          setShowProductRateInput(false);
          setProductSaleCurrencyRate("");
        }

        if (operation.finalPriceInDisplayCurrency) {
          setProductPriceInCurrency(operation.finalPriceInDisplayCurrency.toString());
        } else if (operation.finalPrice && displayCurrency !== "PLN") {
          await convertProductPrice(parseFloat(operation.finalPrice), displayCurrency);
        } else if (operation.finalPrice && displayCurrency === "PLN") {
          setProductPriceInCurrency("");
        }
      } else {
        setSelectedProduct("");
        setProductSearchQuery("");
        setSelectedSize("");
        setSizeSearchQuery("");
        setProductFinalPrice("");
        setProductSaleCurrency("PLN");
        setProductPriceInCurrency("");
        setShowProductRateInput(false);
        setProductSaleCurrencyRate("");
      }

      setOperationOptionsVisible(false);
      setAddAmountModalVisible(true);
    } catch (error) {
      Logger.error("Error opening edit modal:", error);
      setErrorMessage("Nie udało się pobrać danych do edycji. Spróbuj ponownie.");
      setErrorModalVisible(true);
    }
  };

  const submitAddAmount = async () => {
    // Wpłaty jak przy sprzedaży: puste wiersze pomijamy; każda waluta = osobna operacja
    let rows = addAmountPairs
      .map((pair) => ({ ...pair, amount: parseFloat(String(pair.price).replace(",", ".")) }))
      .filter((pair) => Number.isFinite(pair.amount) && pair.amount > 0);

    if (rows.length === 0) {
      setErrorMessage("Proszę wprowadzić prawidłową kwotę.");
      setErrorModalVisible(true);
      return;
    }
    
    // Validate reason selection
    if (!reasonType) {
      setErrorMessage("Proszę wybrać powód dopisania.");
      setErrorModalVisible(true);
      return;
    }

    // Wpłata większa niż cena: wydana reszta odejmowana od wpłat (jak przy sprzedaży), zaliczka nie może przekroczyć ceny
    const priceNumber = parseFloat(productFinalPrice);
    let changeGiven = "";
    if (reasonType === 'product' && priceNumber > 0 && computePaymentBalance({ price: priceNumber, payments: rows, currencyRates }).remainingPln < -0.005) {
      const changeNumber = parseFloat(String(addAmountChangeInput).replace(",", "."));
      if (!(changeNumber > 0)) {
        setErrorMessage("Klient wpłacił więcej niż cena. Wpisz wydaną resztę.");
        setErrorModalVisible(true);
        return;
      }
      rows = applyChangeToCash(rows, changeNumber, productSaleCurrency, currencyRates)
        .map((row) => ({ ...row, amount: parseFloat(String(row.price).replace(",", ".")) }));
      if (rows.length === 0) {
        setErrorMessage("Reszta nie może być równa całej wpłacie.");
        setErrorModalVisible(true);
        return;
      }
      if (computePaymentBalance({ price: priceNumber, payments: rows, currencyRates }).remainingPln < -0.005) {
        setErrorMessage("Reszta jest za mała - po jej odjęciu zaliczka nadal przekracza cenę finalną.");
        setErrorModalVisible(true);
        return;
      }
      changeGiven = `${formatMoney(changeNumber)} ${productSaleCurrency}`;
    }

    const missingRates = [...new Set(rows.filter((row) => plnPerUnit(row.currency, currencyRates) === null).map((row) => row.currency))];
    if (missingRates.length > 0) {
      setErrorMessage(`Brak kursu dla: ${missingRates.join(", ")}. Uzupełnij kurs w tabeli walut.`);
      setErrorModalVisible(true);
      return;
    }
    const paidPln = rows.reduce((sum, row) => sum + row.amount * plnPerUnit(row.currency, currencyRates), 0);
    const finalPricePLN = parseFloat(productFinalPrice);
    
    if (reasonType === 'product') {
      // Validate standard product selection
      if (!selectedProduct) {
        setErrorMessage("Proszę wybrać produkt z listy.");
        setErrorModalVisible(true);
        return;
      }
      
      if (!finalPricePLN || finalPricePLN <= 0) {
        setErrorMessage("Proszę podać cenę finalną produktu (zaliczka + dopłata).");
        setErrorModalVisible(true);
        return;
      }

      // Blokada rabatu jak przy sprzedaży (promocja bez blokady)
      if (addAmountMinPrice && finalPricePLN < addAmountMinPrice - 0.005) {
        setErrorMessage(`Minimalna cena tego produktu to ${addAmountMinPrice} zł. Zwiększ cenę finalną.`);
        setErrorModalVisible(true);
        return;
      }
      
      if (finalPricePLN < paidPln - 0.005) {
        setErrorMessage("Cena finalna nie może być mniejsza niż zaliczka.");
        setErrorModalVisible(true);
        return;
      }
    }
    
    if (reasonType === 'other' && !addAmountReason.trim()) {
      setErrorMessage("Proszę wprowadzić powód dopisania.");
      setErrorModalVisible(true);
      return;
    }
    
    try {
      // Produkt: nazwa z rozmiarem (stateData używa 'id', karty produktów '_id')
      let productName = '';
      if (reasonType === 'product') {
        const selectedProductObj = products.find(p => (p.id || p._id) === selectedProduct) ||
                                    stateData?.find(p => (p.id || p._id) === selectedProduct);
        productName = selectedProductObj?.fullName || selectedProductObj?.Tow_Opis || selectedProductObj?.code || selectedProductObj?.Tow_Kod || productSearchQuery || 'Nieznany produkt';
        if (sizeSearchQuery && !productName.endsWith(` ${sizeSearchQuery}`)) {
          productName += ` ${sizeSearchQuery}`;
        }
      }

      const remainingPLN = reasonType === 'product' ? finalPricePLN - paidPln : 0;
      const remainingInCurrency = plnToCurrency(remainingPLN, productSaleCurrency, currencyRates);
      const paidText = rows
        .map((row) => (row.currency === 'PLN'
          ? `${formatMoney(row.amount)} PLN`
          : `${formatMoney(row.amount)} ${row.currency} (≈ ${formatMoney(row.amount * plnPerUnit(row.currency, currencyRates))} PLN)`))
        .join(' + ');
      const productReason = reasonType === 'product'
        ? `Zaliczka na produkt: ${productName}. Cena: ${formatMoney(finalPricePLN)} PLN. Zaliczka: ${paidText}. ` +
          (changeGiven ? `Reszta wydana: ${changeGiven}. ` : "") +
          `Pozostało: ${formatMoney(remainingInCurrency ?? remainingPLN)} ${remainingInCurrency === null ? 'PLN' : productSaleCurrency}`
        : addAmountReason.trim();

      // Kilka walut = grupa operacji (wspólny identyfikator); jedna waluta jak dotąd - bez grupy
      const existingGroupId = editingGroupOps.find((op) => op.advanceGroupId)?.advanceGroupId;
      const advanceGroupId = existingGroupId || (rows.length > 1 ? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}` : undefined);
      const operationDate = isEditingAddAmount && editingOperationDate ? editingOperationDate : new Date().toISOString();
      const sellingPointValue = user.sellingPoint || user.symbol;

      const buildOperation = (row, isPrimary) => {
        const unit = plnPerUnit(row.currency, currencyRates);
        const operationData = {
          userSymbol: user.symbol,
          amount: row.amount, // Positive amount for addition
          currency: row.currency,
          type: "addition",
          reason: isPrimary || reasonType !== 'product'
            ? productReason
            : `Zaliczka na produkt: ${productName} (część zaliczki w ${row.currency})`,
          date: operationDate,
          sellingPoint: sellingPointValue, // 🔧 Dodane dla prowizji wszystkich pracowników
          ...(reasonType === 'other' && { includeInCommission: addAmountIncludeCommission }),
          ...(advanceGroupId && { advanceGroupId }),
          ...(row.currency !== 'PLN' && {
            currencyConversion: {
              originalAmount: row.amount,
              originalCurrency: row.currency,
              convertedAmount: row.amount * unit,
              exchangeRate: unit,
              conversionDate: new Date().toISOString()
            }
          })
        };

        if (reasonType === 'product') {
          operationData.productId = selectedProduct;
          operationData.productName = productName;
          operationData.productSize = sizeSearchQuery || null; // Store size separately
          if (isPrimary) {
            // Cena finalna (obrót i prowizja, zawsze PLN) tylko w pierwszej operacji - inaczej liczyłaby się kilka razy
            operationData.finalPrice = finalPricePLN;
            operationData.finalPricePLN = finalPricePLN;
            operationData.remainingAmount = remainingPLN;
            operationData.productDisplayCurrency = productSaleCurrency;
            if (productSaleCurrency !== 'PLN' && remainingInCurrency !== null) {
              operationData.finalPriceInDisplayCurrency = plnToCurrency(finalPricePLN, productSaleCurrency, currencyRates);
            }
          } else {
            operationData.finalPrice = 0;
            operationData.remainingAmount = null;
          }
        } else if (isEditingAddAmount) {
          // Zmiana „Zaliczka na produkt” → „Inny powód”: wyczyść pola produktu, inaczej w bazie zostaje cena finalna
          // i dalej liczy się do obrotu dnia i prowizji
          operationData.productId = null;
          operationData.productName = null;
          operationData.productSize = null;
          operationData.finalPrice = 0;
          operationData.remainingAmount = null;
        }
        return operationData;
      };

      const send = async (url, method, body) => {
        const response = await tokenService.authenticatedFetch(url, { method, ...(body && { body: JSON.stringify(body) }) });
        if (!response.ok) {
          throw new Error(`Failed to ${method} financial operation`);
        }
        return response;
      };

      // Edycja: istniejące waluty aktualizujemy, nowe dopisujemy, usunięte wiersze kasujemy
      const createdOperations = [];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const operationData = buildOperation(row, index === 0);
        if (isEditingAddAmount && row._id) {
          await send(getApiUrl(`/financial-operations/${row._id}`), "PUT", operationData);
        } else {
          await send(getApiUrl("/financial-operations"), "POST", operationData);
          createdOperations.push(operationData);
        }
      }
      if (isEditingAddAmount) {
        const keptIds = rows.map((row) => row._id).filter(Boolean);
        for (const op of editingGroupOps.filter((item) => item._id && !keptIds.includes(item._id))) {
          await send(getApiUrl(`/financial-operations/${op._id}`), "DELETE");
        }
      }
      
      // Reset form and refresh data
      const wasEditing = isEditingAddAmount;
      resetAddAmountForm();
      
      // In test environment, add operation directly to state
      if (process.env.NODE_ENV === 'test') {
        setDeductionsData(prev => [...prev, ...createdOperations.map((operationData, index) => ({
          _id: `${Date.now()}-${index}`,
          userSymbol: operationData.userSymbol,
          amount: operationData.amount,
          currency: operationData.currency,
          type: operationData.type,
          reason: operationData.reason,
          date: new Date().toISOString().split('T')[0] // Just date part for filtering
        }))]);
      } else {
        await fetchFinancialOperations();
      }
      
      setSuccessMessage(wasEditing ? "Zaliczka została zaktualizowana." : "Kwota została dopisana.");
      setSuccessModalVisible(true);
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        Logger.error("Error submitting addition:", error);
      }
      setErrorMessage("Nie udało się dopisać kwoty. Spróbuj ponownie.");
      setErrorModalVisible(true);
    }
  };

  const cancelDeduction = async () => {
    if (!selectedDeductionItem) {
      setErrorMessage("Nie wybrano pozycji do anulowania.");
      setErrorModalVisible(true);
      return;
    }
    
    try {
      // Zaliczka w kilku walutach: anulowanie usuwa wszystkie jej waluty
      const groupQuery = selectedDeductionItem.advanceGroupId ? '?group=1' : '';
      const response = await tokenService.authenticatedFetch(getApiUrl(`/financial-operations/${selectedDeductionItem._id}${groupQuery}`), {
        method: "DELETE"
      });
      
      if (!response.ok) {
        throw new Error("Failed to cancel deduction");
      }
      
      // Close modal and refresh data
      setCancelDeductionModalVisible(false);
      setSelectedDeductionItem(null);
      await fetchFinancialOperations();
      
      setSuccessMessage("Operacja została anulowana.");
      setSuccessModalVisible(true);
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        Logger.error("Error canceling deduction:", error);
      }
      setErrorMessage("Nie udało się anulować odpisanej kwoty. Spróbuj ponownie.");
      setErrorModalVisible(true);
    }
  };

  const openCancelDeductionModal = (item) => {
    setSelectedDeductionItem(item);
    setCancelDeductionModalVisible(true);
  };



  // Handle barcode scan for product selection in Add Amount
  const handleBarcodeScanned = ({ data }) => {
    if (scanned) return;
    
    setScanned(true);
    
    // Find product by barcode in state data (same logic as QRScanner)
    const product = stateData?.find(item => item.barcode === data);
    
    if (product) {
      // Use 'id' field from stateData (not '_id')
      setSelectedProduct(product.id || product._id);
      // Show full product name with size (same format as QRScanner)
      const displayName = `${product.fullName} ${product.size}`;
      setProductSearchQuery(displayName); // Show full name with size in text field
      setSizeSearchQuery(product.size || ''); // Store size separately for later use
      setShowProductDropdown(false);
      setProductScanned(true); // Mark product as scanned (size already included)
      setQrScannerVisible(false);
      setScanned(false);
    } else {
      setErrorMessage(`Nie znaleziono produktu z tym kodem kreskowym: ${data}`);
      setErrorModalVisible(true);
      setQrScannerVisible(false);
      setScanned(false);
    }
  };

  // Check if sales item is in Pan Kazek list
  const isItemInPanKazek = (salesItem) => {
    if (!salesItem) return false;
    // Handle both object and ID string
    const itemId = typeof salesItem === 'string' ? salesItem : salesItem._id;
    // Check if this specific sales item (_id) is in Pan Kazek
    return panKazekItems.some(panKazekItem => panKazekItem.productId === itemId);
  };

  // Fetch Pan Kazek items
  const fetchPanKazekItems = async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/pan-kazek'));
      if (response.ok) {
        const data = await response.json();
        setPanKazekItems(data.data || []);
      }
    } catch (error) {
      // Silent error handling
    }
  };





  useFocusEffect(
    React.useCallback(() => {
      // Skip API fetching in test environment unless explicitly testing API calls
      if (process.env.NODE_ENV === 'test' && !window.__TESTING_API_CALLS__) {
        return;
      }
      
      fetchSalesData(); // Fetch sales data when the tab is focused
      fetchUsers(); // Fetch users data for symbol selection
      fetchState(); // Fetch state data for product selection with barcodes
      fetchGoods(); // Fetch all goods for standard product selection
      fetchSizes(); // Fetch sizes for custom products
      fetchColors(); // Fetch colors for custom products
      fetchStock(); // Fetch stock/assortment for custom products
      fetchPanKazekItems(); // Fetch Pan Kazek items
      if (user?.symbol) { // Ensure user exists before fetching items
        fetchTransferredItems(); // Fetch transferred items when the tab is focused
        fetchReceivedItems(); // Fetch received items when the tab is focused
        fetchAdvances(); // Fetch advances when the tab is focused
        fetchFinancialOperations(); // Fetch financial operations when the tab is focused
      }
    }, [user?.symbol]) // Refetch when the user's symbol changes
  );

  const onRefresh = async () => {
    setRefreshing(true);
    
    // Skip API calls in test environment unless explicitly testing API calls
    if (process.env.NODE_ENV === 'test' && !window.__TESTING_API_CALLS__) {
      setRefreshing(false);
      return;
    }
    
    await fetchSalesData(); // Fetch data on pull-to-refresh
    await fetchUsers(); // Fetch users data for symbol selection
    await fetchState(); // Fetch state data for product selection with barcodes
    await fetchPanKazekItems(); // Fetch Pan Kazek items
    if (user?.symbol) {
      await fetchTransferredItems();
      await fetchReceivedItems();
      await fetchAdvances();
      await fetchFinancialOperations();
    }
    setRefreshing(false);
  };

  const handleAddCashPair = () => {
    setCashPriceCurrencyPairs([...cashPriceCurrencyPairs, { price: "", currency: "PLN" }]);
  };

  const handleRemoveCashPair = (index) => {
    if (cashPriceCurrencyPairs.length > 1) {
      const updatedPairs = cashPriceCurrencyPairs.filter((_, i) => i !== index);
      setCashPriceCurrencyPairs(updatedPairs);
    }
  };

  const handleCashPairChange = (index, field, value) => {
    const updatedPairs = [...cashPriceCurrencyPairs];
    updatedPairs[index][field] = value;
    setCashPriceCurrencyPairs(updatedPairs);
  };

  const handleAddCardPair = () => {
    setCardPriceCurrencyPairs([...cardPriceCurrencyPairs, { price: "", currency: "PLN" }]);
  };

  const handleRemoveCardPair = (index) => {
    if (cardPriceCurrencyPairs.length > 1) {
      const updatedPairs = cardPriceCurrencyPairs.filter((_, i) => i !== index);
      setCardPriceCurrencyPairs(updatedPairs);
    }
  };

  const handleCardPairChange = (index, field, value) => {
    const updatedPairs = [...cardPriceCurrencyPairs];
    updatedPairs[index][field] = value;
    setCardPriceCurrencyPairs(updatedPairs);
  };

  const openCurrencyModal = (index, type) => {
    Keyboard.dismiss(); // po zamknięciu okna fokus nie wraca do pola - klawiatura nie wyskakuje
    setCurrentCurrencyPairIndex(index);
    setCurrentCurrencyType(type);
    setCurrencyModalVisible(true);
  };

  const selectCurrencyFromModal = (currency) => {
    if (currentCurrencyType === "cash") {
      handleCashPairChange(currentCurrencyPairIndex, "currency", currency);
    } else if (currentCurrencyType === "card") {
      handleCardPairChange(currentCurrencyPairIndex, "currency", currency);
    }
    setCurrencyModalVisible(false);
  };

  // Function to handle currency selection for "Dopisz kwotę" (Add Amount)
  const selectCurrencyForAddAmount = async (currency) => {
    setAddAmountPairs((prev) => prev.map((pair, index) => (index === addAmountPairIndex ? { ...pair, currency } : pair)));
    setAddAmountCurrency(currency);
    setAddAmountCurrencyModalVisible(false);
    
    if (currency === 'PLN') {
      setShowAddAmountRateInput(false);
      setAddAmountCurrencyRate("");
    } else {
      // Show rate input for non-PLN currencies
      setShowAddAmountRateInput(true);
      // Load current rate from currency table as default
      try {
        const tableRate = currencyRates.find(rate => rate.currency.code === currency);
        if (tableRate && tableRate.buyRate) {
          setAddAmountCurrencyRate(tableRate.buyRate.toString());
        } else {
          const currentRate = await CurrencyService.getCurrencyRate(currency);
          setAddAmountCurrencyRate(currentRate.toString());
        }
      } catch (error) {
        Logger.error('Error loading currency rate:', error);
        setAddAmountCurrencyRate("1.0");
      }
    }
  };

  // Function to handle deduction currency selection
  const selectCurrencyForDeduction = async (currency) => {
    setDeductionCurrency(currency);
    setDeductionCurrencyModalVisible(false);
    
    if (currency === 'PLN') {
      setShowDeductionRateInput(false);
      setDeductionCurrencyRate("");
    } else {
      // Show rate input for non-PLN currencies
      setShowDeductionRateInput(true);
      // Load current rate from storage as default
      try {
        const currentRate = await CurrencyService.getCurrencyRate(currency);
        setDeductionCurrencyRate(currentRate.toString());
      } catch (error) {
        Logger.error('Error loading currency rate:', error);
        setDeductionCurrencyRate("1.0");
      }
    }
  };

  // Function to handle product currency selection
  const selectProductCurrency = async (currency) => {
    setProductSaleCurrency(currency);
    setProductCurrencyModalVisible(false);
    
    if (currency === 'PLN') {
      setShowProductRateInput(false);
      setProductSaleCurrencyRate("");
    } else {
      // Show rate text for non-PLN currencies
      setShowProductRateInput(true);
      // Load current rate from storage as default
      try {
        const tableRate = currencyRates.find(rate => rate.currency.code === currency);
        // Kurs zapamiętany poza blokiem if (26.10.2026): dawniej `currentRate` był widoczny tylko w else,
        // a niżej użyty - przy walucie bez własnego kursu kończyło się błędem
        let chosenRate;
        if (tableRate && tableRate.buyRate) {
          chosenRate = tableRate.buyRate;
        } else {
          chosenRate = await CurrencyService.getCurrencyRate(currency);
        }
        setProductSaleCurrencyRate(chosenRate.toString());

        // Update local exchangeRates state immediately
        setExchangeRates(prev => ({
          ...prev,
          [currency]: chosenRate
        }));
        
      } catch (error) {
        Logger.error('Error loading currency rate:', error);
        setProductSaleCurrencyRate("1.0");
        
        // Set default rate in exchangeRates as well
        setExchangeRates(prev => ({
          ...prev,
          [currency]: 1.0
        }));
      }
    }
    
    // Convert product price to selected currency if product is selected and price is set
    if (selectedProduct && productFinalPrice) {
      convertProductPrice(parseFloat(productFinalPrice), currency);
    }
  };

  // Function to convert price to different currencies
  const convertPriceToMultipleCurrencies = async (pricePLN, targetCurrencies) => {
    const results = { PLN: pricePLN.toFixed(2) };
    
    for (const currency of targetCurrencies) {
      if (currency === 'PLN') {
        continue;
      }
      
      try {
        // Get rate from table (cached in state)
        let rate = null;
        
        if (currency === productSaleCurrency && productSaleCurrencyRate && parseFloat(productSaleCurrencyRate) > 0) {
          rate = parseFloat(productSaleCurrencyRate);
        } else if (currency === addAmountCurrency && addAmountCurrencyRate && parseFloat(addAmountCurrencyRate) > 0) {
          rate = parseFloat(addAmountCurrencyRate);
        } else {
          rate = exchangeRates[currency];
        }
        
        if (rate && rate > 0) {
          const multiplier = getMultiplier(currency);
          results[currency] = ((pricePLN / rate) * multiplier).toFixed(2);
        }
      } catch (error) {
        Logger.error(`Error converting to ${currency}:`, error);
      }
    }
    
    return results;
  };

  // Function to load exchange rates
  const loadExchangeRates = async () => {
    try {
      const rates = await CurrencyService.getAllExchangeRates();
      setExchangeRates(rates);
      return rates;
    } catch (error) {
      Logger.error('Error loading exchange rates:', error);
      // Use default rates
      const defaultRates = CurrencyService.getDefaultRates();
      setExchangeRates(defaultRates);
      return defaultRates;
    }
  };

  // Function to handle currency rate editing
  const startEditingRate = (currency, currentRate) => {
    if (currency === 'PLN') return; // PLN rate can't be changed
    
    setEditingCurrencyRate(currency);
    setTempCurrencyRate(currentRate.toString());
    setCurrencyRateModalVisible(true);
  };

  // Function to save edited currency rate
  const saveCurrencyRate = async () => {
    if (!editingCurrencyRate || !tempCurrencyRate) return;
    
    const newRate = parseFloat(tempCurrencyRate);
    if (isNaN(newRate) || newRate <= 0) {
      setSuccessMessage("Proszę wprowadzić prawidłową wartość kursu (większą od 0).");
      setSuccessModalVisible(true);
      return;
    }
    
    try {
      const success = await CurrencyService.updateCurrencyRate(editingCurrencyRate, newRate);
      if (success) {
        await loadExchangeRates(); // Reload rates
        
        // Recalculate product price if needed
        if (selectedProduct && productFinalPrice && productSaleCurrency === editingCurrencyRate) {
          await convertProductPrice(parseFloat(productFinalPrice), productSaleCurrency);
        }
        
        setSuccessMessage(`Kurs ${editingCurrencyRate} został zaktualizowany do ${newRate} PLN`);
        setSuccessModalVisible(true);
      } else {
        setErrorMessage("Błąd podczas zapisywania kursu. Spróbuj ponownie.");
        setErrorModalVisible(true);
      }
    } catch (error) {
      Logger.error('Error saving currency rate:', error);
      setErrorMessage("Błąd podczas zapisywania kursu. Spróbuj ponownie.");
      setErrorModalVisible(true);
    }
    
    setCurrencyRateModalVisible(false);
    setEditingCurrencyRate(null);
    setTempCurrencyRate("");
  };

  // Function to cancel currency rate editing
  const cancelEditingRate = () => {
    setCurrencyRateModalVisible(false);
    setEditingCurrencyRate(null);
    setTempCurrencyRate("");
  };

  // Function to convert product price from PLN to selected currency
  const convertProductPrice = async (pricePLN, targetCurrency) => {
    try {
      if (targetCurrency === 'PLN') {
        setProductPriceInCurrency(pricePLN.toFixed(2));
        setShowCurrencyConversion(false);
        return;
      }

      // Use rate from table (cached in state)
      let rate = null;
      if (productSaleCurrencyRate && parseFloat(productSaleCurrencyRate) > 0) {
        rate = parseFloat(productSaleCurrencyRate);
      } else {
        // Fallback to stored rates
        let rates = exchangeRates;
        if (!rates[targetCurrency]) {
          rates = await loadExchangeRates();
        }
        rate = rates[targetCurrency];
      }

      if (rate) {
        const multiplier = getMultiplier(targetCurrency);
        const convertedPrice = (pricePLN / rate) * multiplier;
        setProductPriceInCurrency(convertedPrice.toFixed(2));
        setShowCurrencyConversion(true);
      }
    } catch (error) {
      Logger.error('Error converting price:', error);
      setProductPriceInCurrency(pricePLN.toFixed(2));
      setShowCurrencyConversion(false);
    }
  };

  // Load exchange rates on component mount
  useEffect(() => {
    loadExchangeRates();
  }, []);

  // Convert product price when currency or price changes
  useEffect(() => {
    if (productFinalPrice && parseFloat(productFinalPrice) > 0) {
      convertProductPrice(parseFloat(productFinalPrice), productSaleCurrency);
    }
  }, [productFinalPrice, productSaleCurrency]);

  return (
    <>
      <SafeAreaView style={{ backgroundColor: tc('bg', "#000"), flex: 1, paddingBottom: Math.max(20, insets.bottom + 20) }}>
        <FlatList alwaysBounceVertical
          testID="home-flatlist"
          data={filteredData}
          keyExtractor={(item, index) => item?._id?.toString() || index.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item, index }) => (
            <View style={[styles.item, item.processed && { opacity: 0.6 }]}>
              <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.itemTextLeft,
                  {
                    fontSize: (item.fullName?.length || 0) + (item.size?.length || 0) > 20 ? 10 : 12,
                    fontWeight: "bold",
                  },
                ]}
              >
                {index + 1}. {item.fullName || 'Unknown'} {item.size || ''} ({item.from || ''}){item.source === 'Cudzich' ? '(Cudzich)' : ''}{" "}
                {(() => {
                  const filteredCash = (item.cash || []).filter(({ price }) => price !== undefined && price !== null && price !== "" && price !== 0);
                  const filteredCard = (item.card || []).filter(({ price }) => price !== undefined && price !== null && price !== "" && price !== 0);
                  const allPayments = [...filteredCash, ...filteredCard];
                  const cashCount = filteredCash.length;
                  
                  return allPayments.map(({ price, currency }, idx) => (
                    <Text
                      key={`payment-${idx}`}
                      style={{
                        color: idx < cashCount ? tc('text', "white") : "red",
                        marginRight: idx === allPayments.length - 1 ? 8 : 0,
                      }}
                    >
                      {price} {currency}
                      {idx < allPayments.length - 1 ? "  " : ""}
                    </Text>
                  ));
                })()}
                {item.isPickup && (
                  <Text style={{ color: 'red', fontSize: 12, fontWeight: 'bold', marginLeft: 10 }}>(ODBIÓR)</Text>
                )}
                {isItemInPanKazek(item) && (
                  <Text style={{ color: '#28a745', fontSize: 16, marginLeft: 5 }}>●</Text>
                )}
              </Text>
              {/* Sprzedaż odpisana już w Dobieraniu - nie da się jej usunąć ani zmienić punktu */}
              {item.processed && (
                <Text testID={`sale-processed-${item._id}`} style={styles.processedLabel}>Przetworzone</Text>
              )}
              </View>
              <TouchableOpacity onPress={() => { setSelectedItem(item); setModalVisible(true); }} style={styles.dotsButton}>
                <Text style={styles.dotsText}>⋮</Text>
              </TouchableOpacity>
            </View>
          )}
          ListHeaderComponent={() => {
            return (
              <View style={{ marginTop: 4, marginBottom: 16, paddingHorizontal: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <View style={{ width: '100%' }}>
                    <ScreenHeader
                      icon="cart"
                      title="Sprzedaż"
                      subtitle={`${user?.email || ''} · ${new Date().toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' })}`}
                    />
                    {/* „Dodaj sprzedawców” na samej górze, lista sprzedawców pod spodem */}
                    <View style={{ 
                      flexDirection: "column", 
                      marginTop: 12,
                      marginBottom: 4,
                    }}>
                      <TouchableOpacity
                        testID="add-salesperson-button"
                        style={styles.menuCard}
                        onPress={() => setSalespersonModalVisible(true)}
                      >
                        <View style={[styles.menuCardIcon, { backgroundColor: '#0D6EFD26' }]}>
                          <Ionicons name="person-add" size={26} color="#0D6EFD" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.menuCardTitle}>Dodaj sprzedawców</Text>
                          <Text style={styles.menuCardSubtitle}>Kto dziś pracuje na tym stanowisku</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={tc('muted', '#94A3B8')} />
                      </TouchableOpacity>
                    </View>
                
                    {assignedSalespeople.length > 0 && (
                      <>
                        {assignedSalespeople.map((salesperson, index) => {
                          // Check if work hours are already recorded for this employee today
                          const todaysRecord = todaysWorkHours.find(record => 
                            record.employeeId?._id === salesperson._id || 
                            record.employeeId === salesperson._id
                          );
                          
                          return (
                            <View 
                              key={salesperson._id} 
                              style={[styles.salespersonCard, todaysRecord && styles.salespersonCardActive]}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 15, fontWeight: '600', color: tc('text', "#ffffff") }}>
                                  {index + 1}. {salesperson.firstName} {salesperson.lastName}
                                  {salesperson.employeeId && (
                                    <Text style={{ color: tc('muted', '#9ca3af'), fontSize: 11 }}> (ID: {salesperson.employeeId})</Text>
                                  )}
                                </Text>
                                {todaysRecord && (
                                  <Text style={{ color: tc('muted', '#94A3B8'), fontSize: 12, marginTop: 2 }}>
                                    ⏰ {todaysRecord.startTime} - {todaysRecord.endTime} ({(todaysRecord.totalHours || 0).toFixed(1)}h)
                                  </Text>
                                )}
                              </View>
                              
                              <TouchableOpacity 
                                onPress={() => openWorkHoursModal(salesperson)}
                                accessibilityLabel="Godziny pracy"
                                style={[styles.iconTile, { backgroundColor: todaysRecord ? '#0d948826' : '#0EA5E926' }]}
                              >
                                <Ionicons name={todaysRecord ? 'time' : 'time-outline'} size={20} color={todaysRecord ? '#14B8A6' : '#0EA5E9'} />
                              </TouchableOpacity>
                              
                              <TouchableOpacity 
                                onPress={() => removeSalesperson(salesperson._id)}
                                accessibilityLabel="Usuń sprzedawcę"
                                style={[styles.iconTile, { backgroundColor: '#DC354526' }]}
                              >
                                <Ionicons name="close" size={20} color="#EF4444" />
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </>
                    )}
                  </View>
                </View>
                
                <Text style={styles.sectionLabel}>Sprzedaż dzisiaj</Text>
              </View>
            );
          }}
          ListFooterComponent={() => {
            // Only show transfers with a valid date matching today
            // FOR TESTING: Uncomment line below to simulate tomorrow
            // const today = '2025-08-11'; // TEST: Simulate tomorrow (dzień później)
            const today = warsawToday(); // dzień polski, nie UTC (S16)
            // Kurtka oddana przez klienta przy wymianie (26.10.2026): osobna sekcja „Zwrot od klienta” - serwer od razu
            // oznacza ją jako odpisaną z punktu, ale „Przetworzone” dopiero po dopisaniu w MAGAZYNIE (yellowProcessed)
            const transferredToday = transferredItems.filter(
              item => item.date && item.date.startsWith(today) && item.transfer_to !== 'SOLD' && !isExchangeReturn(item)
            );
            const returnsToday = transferredItems.filter(
              item => item.date && item.date.startsWith(today) && isExchangeReturn(item)
            );
            const receivedToday = receivedItems.filter(
              item => item.date && item.date.startsWith(today)
            );
            return (
              <View style={{ marginTop: 24 }}>
                {/* Sumy gotówki / karty są w Zamknięciu dnia na dole ekranu */}
                {/* Section for sales on other accounts */}
                {otherAccountsData.length > 0 && (
                  <View style={{ marginTop: 24 }}>
                    <Text style={{ fontSize: 13, color: tc('muted', "#d1d5db"), fontWeight: "bold", marginBottom: 8 }}>Sprzedano na innych kontach:</Text>
                    {otherAccountsData.map((item, index) => (
                      <View key={item._id || index} style={styles.item}>
                        <Text
                          style={[
                            styles.itemTextLeft,
                            {
                              fontSize: (item.fullName?.length || 0) + (item.size?.length || 0) > 20 ? 10 : 12,
                              fontWeight: "bold",
                            },
                          ]}
                        >
                          {index + 1}. {item.fullName || 'Unknown'} {item.size || ''} - {item.sellingPoint || "Brak informacji o miejscu sprzedaży"}
                        </Text>
                        <TouchableOpacity
                          style={styles.dotsButton}
                          onPress={() => {
                            setSelectedTransferredItem(item);
                            setTransferOptionsVisible(true);
                          }}
                        >
                          <Text style={styles.dotsText}>⋮</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                {/* Section for transferred items */}
                {transferredToday.length > 0 && (
                  <View style={{ marginTop: 24 }}>
                    <Text style={{ fontSize: 13, color: tc('muted', "#d1d5db"), fontWeight: "bold", marginBottom: 8 }}>Odpisać ze stanu:</Text>
                    {transferredToday.map((item, index) => (
                      <View
                        key={item._id || `${item.productId || 'transfer'}-${index}`}
                        style={[styles.item, item.blueProcessed && { opacity: 0.6 }]}
                      >
                        <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.itemTextLeft,
                            {
                              fontSize: (item.fullName?.length || 0) + (item.size?.length || 0) > 20 ? 10 : 12,
                              fontWeight: "bold",
                            },
                          ]}
                        >
                          {index + 1}. {item.fullName} {item.size} - {
                            item.transfer_to === 'Wymiana' 
                              ? (item.reason?.startsWith('Wymiana - ') 
                                  ? `Wymiana w punkcie ${pointNameBySymbol(users, item.reason.replace('Wymiana - ', '').trim())}` 
                                  : `Wymiana${item.reason ? ` w punkcie ${item.reason}` : ''}`)
                              : `Przepisano do: ${pointNameBySymbol(users, item.transfer_to)}`
                          }
                          {item.reason && (item.transfer_to?.toLowerCase() === 'dom' || item.transfer_to?.toLowerCase() === 'd') && (
                            <Text style={{ fontSize: 11, color: "#fbbf24" }}>
                              {' '}({item.reason.length > 15 ? item.reason.substring(0, 15) + '...' : item.reason})
                            </Text>
                          )}
                        </Text>
                        {/* odpisane już w Dobieraniu - nie da się anulować */}
                        {item.blueProcessed && (
                          <Text testID={`transfer-processed-${item._id}`} style={styles.processedLabel}>Przetworzone</Text>
                        )}
                        </View>
                        <TouchableOpacity
                          style={styles.dotsButton}
                          onPress={() => {
                            setSelectedTransferredItem(item);
                            setTransferOptionsVisible(true);
                          }}
                        >
                          <Text style={styles.dotsText}>⋮</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                {/* Zwrot od klienta przy wymianie - kurtka jedzie do MAGAZYNU; „Przetworzone” po dopisaniu w MAGAZYNIE */}
                {returnsToday.length > 0 && (
                  <View style={{ marginTop: 24 }} testID="exchange-returns-section">
                    <Text style={{ fontSize: 13, color: tc('muted', "#d1d5db"), fontWeight: "bold", marginBottom: 8 }}>Zwrot od klienta:</Text>
                    {returnsToday.map((item, index) => (
                      <View
                        key={item._id || `return-${index}`}
                        testID={`exchange-return-${item._id}`}
                        style={[styles.item, item.yellowProcessed && { opacity: 0.6 }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.itemTextLeft,
                              {
                                fontSize: (item.fullName?.length || 0) + (item.size?.length || 0) > 20 ? 10 : 12,
                                fontWeight: "bold",
                              },
                            ]}
                          >
                            {index + 1}. {item.fullName} {item.size} - do MAGAZYNU
                          </Text>
                          {item.yellowProcessed ? (
                            <Text testID={`exchange-return-processed-${item._id}`} style={styles.processedLabel}>Przetworzone</Text>
                          ) : (
                            <Text testID={`exchange-return-waiting-${item._id}`} style={styles.processedLabel}>Czeka na dopisanie</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                {/* Section for received items */}
                {receivedToday.length > 0 && (
                  <View style={{ marginTop: 24 }}>
                    <Text style={{ fontSize: 13, color: tc('muted', "#d1d5db"), fontWeight: "bold", marginBottom: 8 }}>Dopisać na to konto:</Text>
                    {receivedToday.map((item, index) => (
                      <View
                        key={item._id || `${item.productId || 'received'}-${index}`}
                        style={[styles.receivedItem, item.yellowProcessed && { opacity: 0.6 }]}
                      >
                        <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.receivedItemTextLeft,
                            {
                              fontSize: (item.fullName?.length || 0) + (item.size?.length || 0) > 20 ? 10 : 12,
                              fontWeight: "bold",
                            },
                          ]}
                        >
                          {index + 1}. {item.fullName} {item.size} - Przesłano z: {item.transfer_from}
                        </Text>
                        {/* dopisane już w Dobieraniu do stanu tego punktu */}
                        {item.yellowProcessed && (
                          <Text testID={`received-processed-${item._id}`} style={styles.processedLabel}>Przetworzone</Text>
                        )}
                        </View>
                        <TouchableOpacity style={styles.dotsButton}>
                          <Text style={styles.dotsText}>⋮</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                {/* Section for advances/zaliczki */}
                {(() => {
                  // FOR TESTING: Uncomment line below to simulate tomorrow
                  // const today = '2025-08-11'; // TEST: Simulate tomorrow (dzień później)
                  const today = new Date().toISOString().split('T')[0]; // NORMAL: Real today
                  const advancesToday = advancesData.filter(
                    item => item.date && item.date.startsWith(today)
                  );
                  
                  return advancesToday.length > 0 && (
                    <View style={{ marginTop: 24 }}>
                      <Text style={{ fontSize: 13, color: tc('muted', "#d1d5db"), fontWeight: "bold", marginBottom: 8 }}>Zaliczki wzięte dzisiaj:</Text>
                      {advancesToday.map((item, index) => (
                        <View
                          key={item._id || `${item.productId || 'advance'}-${index}`}
                          style={styles.advanceItem}
                        >
                          <Text style={styles.advanceItemTextLeft}>
                            {index + 1}. {item.fullName} {item.size}
                          </Text>
                          <Text style={styles.advanceItemTextRight}>
                            Zaliczka: {item.advancePayment} {item.advancePaymentCurrency}
                            {item.reason && (
                              <Text style={{ fontSize: 11, color: "#fbbf24" }}>
                                {' '}({item.reason.length > 15 ? item.reason.substring(0, 15) + '...' : item.reason})
                              </Text>
                            )}
                          </Text>
                        </View>
                      ))}
                      {/* Suma zaliczek pogrupowana według walut */}
                      <View style={{ marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: tc('border', "#374151") }}>
                        <Text style={{ fontSize: 12, color: tc('muted', "#9ca3af"), fontWeight: "bold", textAlign: "right" }}>
                          Suma zaliczek: {' '}
                          {(() => {
                            const advanceTotals = {};
                            advancesToday.forEach(item => {
                              const currency = item.advancePaymentCurrency;
                              advanceTotals[currency] = (advanceTotals[currency] || 0) + item.advancePayment;
                            });
                            return Object.entries(advanceTotals)
                              .map(([currency, total]) => `${total} ${currency}`)
                              .join(', ');
                          })()}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
                
                {/* Section for deductions/odpisane kwoty */}
                {(() => {
                  // FOR TESTING: Uncomment line below to simulate tomorrow
                  // const today = '2025-08-11'; // TEST: Simulate tomorrow (dzień później)
                  const today = new Date().toISOString().split('T')[0]; // NORMAL: Real today
                  const deductionsToday = deductionsData.filter(
                    item => item.date && item.date.startsWith(today)
                  );
                  
                  return deductionsToday.length > 0 && (
                    <View style={{ marginTop: 24 }}>
                      <Text style={{ fontSize: 13, color: tc('muted', "#d1d5db"), fontWeight: "bold", marginBottom: 8 }}>Operacje dzisiaj:</Text>
                      {deductionsToday.map((item, index) => (
                        <View
                          key={item._id || index}
                          style={[
                            styles.deductionItem,
                            (item.type === 'addition' || item.amount > 0) 
                              ? { borderLeftColor: '#0D6EFD' } // dopisanie - niebieski pasek
                              : { borderLeftColor: '#DC2626' } // odpisanie - czerwony pasek
                          ]}
                        >
                          <Text style={styles.deductionItemTextLeft}>
                            {index + 1}. {item.productName ? `Zaliczka na produkt ${item.productName}` : item.reason}
                            {item.exchangedFor ? (
                              <Text style={{ color: '#F59E0B', fontWeight: '600' }}>{`\n↔ wymieniono na: ${item.exchangedFor}`}</Text>
                            ) : null}
                          </Text>
                          <Text style={styles.deductionItemTextRight}>
                            {(item.type === 'addition' || item.amount > 0)
                              ? `+${Math.abs(item.amount)} ${item.currency}`
                              : `-${Math.abs(item.amount)} ${item.currency}`
                            }
                          </Text>
                          <TouchableOpacity
                            onPress={() => openOperationOptionsModal(item)}
                            style={{
                              paddingLeft: 8,
                              paddingVertical: 4,
                            }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Text style={{ color: tc('text', "white"), fontSize: 16 }}>⋮</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                      {/* Suma odpisanych kwot pogrupowana według walut */}
                      <View style={{ marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: tc('border', "#374151") }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, color: tc('muted', "#9ca3af"), fontWeight: "bold" }}>
                            Bilans operacji: {' '}
                          </Text>
                          {(() => {
                            const operationTotals = {};
                            deductionsToday.forEach(item => {
                              const currency = item.currency;
                              // Use the amount directly (positive for additions, negative for deductions)
                              operationTotals[currency] = (operationTotals[currency] || 0) + item.amount;
                            });
                            return Object.entries(operationTotals)
                              .map(([currency, total], index) => {
                                const sign = total >= 0 ? '+' : '-';
                                const color = total >= 0 ? '#10b981' : '#ef4444'; // Green for positive, red for negative
                                return (
                                  <Text key={currency} style={{ fontSize: 12, color, fontWeight: "bold", marginLeft: index > 0 ? 8 : 0 }}>
                                    {sign}{Math.abs(total)} {currency}
                                  </Text>
                                );
                              });
                          })()}
                        </View>
                      </View>
                    </View>
                  );
                })()}
                

                
                {/* Kasa i waluty - karty jak w panelu admina */}
                <View style={{
                  flexDirection: "column",
                  marginTop: 24,
                  marginBottom: 20,
                }}>
                  <Text style={[styles.sectionLabel, { marginBottom: 12 }]}>Kasa i waluty</Text>
                  <TouchableOpacity
                    testID="deduct-amount-button"
                    style={styles.menuCard}
                    onPress={() => setDeductionModalVisible(true)}
                  >
                    <View style={[styles.menuCardIcon, { backgroundColor: '#DC354526' }]}>
                      <Ionicons name="remove-circle" size={26} color="#DC3545" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuCardTitle}>Odpisz kwotę</Text>
                      <Text style={styles.menuCardSubtitle}>Wypłata z kasy, zaliczka pracownika, inne wydatki</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={tc('muted', '#94A3B8')} />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    testID="add-amount-button"
                    style={styles.menuCard}
                    onPress={() => {
                      resetAddAmountForm();
                      setAddAmountModalVisible(true);
                    }}
                  >
                    <View style={[styles.menuCardIcon, { backgroundColor: '#10B98126' }]}>
                      <Ionicons name="add-circle" size={26} color="#10B981" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuCardTitle}>Dopisz kwotę</Text>
                      <Text style={styles.menuCardSubtitle}>Wpłata do kasy (zaliczkę klienta przyjmij w „Zamów”)</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={tc('muted', '#94A3B8')} />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    testID="currency-rates-button"
                    style={styles.menuCard}
                    onPress={() => setCurrencyRatesModalVisible(true)}
                  >
                    <View style={[styles.menuCardIcon, { backgroundColor: '#0EA5E926' }]}>
                      <Ionicons name="trending-up" size={26} color="#0EA5E9" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuCardTitle}>Aktualne kursy walut</Text>
                      <Text style={styles.menuCardSubtitle}>Kupno i sprzedaż walut w PLN</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={tc('muted', '#94A3B8')} />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    testID="currency-calculator-button"
                    style={styles.menuCard}
                    onPress={() => setCalculatorModalVisible(true)}
                  >
                    <View style={[styles.menuCardIcon, { backgroundColor: '#8B5CF626' }]}>
                      <Ionicons name="calculator" size={26} color="#8B5CF6" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuCardTitle}>Kalkulator walut</Text>
                      <Text style={styles.menuCardSubtitle}>Przelicz kwotę między walutami</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={tc('muted', '#94A3B8')} />
                  </TouchableOpacity>
                </View>
                {/* Zamknięcie dnia - na samym dole ekranu */}
                {(() => {
                  // FOR TESTING: Uncomment line below to simulate tomorrow
                  // const today = '2025-08-11'; // TEST: Simulate tomorrow (dzień później)
                  const today = new Date().toISOString().split('T')[0]; // NORMAL: Real today
                  
                  // Calculate total CASH sales by currency (gotówka)
                  const cashTotals = {};
                  filteredData.forEach(item => {
                    (item.cash || [])
                      .filter(({ price }) => price !== undefined && price !== null && price !== "" && price !== 0)
                      .forEach(({ price, currency }) => {
                        cashTotals[currency] = (cashTotals[currency] || 0) + parseFloat(price);
                      });
                  });
                  
                  // Calculate total CARD sales by currency (karta)
                  const cardTotals = {};
                  filteredData.forEach(item => {
                    (item.card || [])
                      .filter(({ price }) => price !== undefined && price !== null && price !== "" && price !== 0)
                      .forEach(({ price, currency }) => {
                        cardTotals[currency] = (cardTotals[currency] || 0) + parseFloat(price);
                      });
                  });
                  
                  // Calculate total advances by currency
                  const advancesTotals = {};
                  transferredItems
                    .filter(item => item.date && item.date.startsWith(today) && item.advancePayment > 0)
                    .forEach(item => {
                      const currency = item.advancePaymentCurrency;
                      advancesTotals[currency] = (advancesTotals[currency] || 0) + item.advancePayment;
                    });
                  
                  // Calculate total financial operations by currency
                  const operationsTotals = {};
                  deductionsData
                    .filter(item => item.date && item.date.startsWith(today))
                    .forEach(item => {
                      const currency = item.currency;
                      operationsTotals[currency] = (operationsTotals[currency] || 0) + item.amount;
                    });

                  // Calculate total additions in PLN (use agreed final price for turnover)
                  const additionsTotals = {};
                  deductionsData
                    .filter(item => item.date && item.date.startsWith(today) && item.type === 'addition')
                    .forEach(item => {
                      const agreedPln = item.finalPricePLN || item.finalPrice;
                      if (agreedPln && !Number.isNaN(parseFloat(agreedPln))) {
                        // Zaliczka na produkt: do obrotu cała uzgodniona cena (PLN)
                        additionsTotals.PLN = (additionsTotals.PLN || 0) + parseFloat(agreedPln);
                        return;
                      }
                      if (item.includeInCommission) {
                        // „Inny powód” wliczany do prowizji = też do obrotu (kwota wpłaty w jej walucie)
                        const amount = Math.abs(parseFloat(item.amount) || 0);
                        const currency = item.currency || 'PLN';
                        if (amount > 0) additionsTotals[currency] = (additionsTotals[currency] || 0) + amount;
                      }
                    });
                  
                  // Calculate final totals by currency (CASH + advances + operations)
                  const allCurrencies = new Set([
                    ...Object.keys(cashTotals),
                    ...Object.keys(cardTotals),
                    ...Object.keys(advancesTotals),
                    ...Object.keys(operationsTotals)
                  ]);
                  
                  const finalCashTotals = {};
                  const finalCardTotals = {};
                  allCurrencies.forEach(currency => {
                    const cash = cashTotals[currency] || 0;
                    const card = cardTotals[currency] || 0;
                    const advances = advancesTotals[currency] || 0;
                    const operations = operationsTotals[currency] || 0;
                    
                    // Gotówka w kasie = płatności gotówką + zaliczki + operacje finansowe
                    finalCashTotals[currency] = cash + advances + operations;
                    
                    // Płatności kartą = tylko płatności kartą (zamknięcie terminala)
                    finalCardTotals[currency] = card;
                  });

                  // Kurs jak przy sprzedaży (plnPerUnit): waluty „za 100” (HUF) dzielone przez 100, kurs własny z panelu.
                  // Waluta bez kursu NIE jest liczona jak złotówki 1:1 - pomijamy ją i pokazujemy „brak kursu”.
                  const turnoverMissingRates = new Set();
                  const sumInPln = (totals) => Object.entries(totals).reduce((sum, [currency, total]) => {
                    const unit = plnPerUnit(currency || 'PLN', currencyRates);
                    if (unit === null) {
                      if (total) turnoverMissingRates.add(currency);
                      return sum;
                    }
                    return sum + total * unit;
                  }, 0);

                  // Odbiór zamówienia (dopłata) nie wchodzi do obrotu - obrót za tę kurtkę jest w zaliczce zamówienia
                  // (przy wymianie serwer ustawia tam cenę wydanej kurtki). Dopłata zostaje w „Gotówce w kasie”.
                  const turnoverPaymentTotals = (kind) => {
                    const totals = {};
                    filteredData.filter((item) => !item.isPickup).forEach((item) => {
                      (item[kind] || []).forEach(({ price, currency }) => {
                        const amount = parseFloat(price);
                        if (amount > 0) totals[currency] = (totals[currency] || 0) + amount;
                      });
                    });
                    return totals;
                  };
                  const totalTurnoverPln = sumInPln(turnoverPaymentTotals('cash')) + sumInPln(turnoverPaymentTotals('card')) + sumInPln(additionsTotals);
                  
                  return allCurrencies.size > 0 && (
                    <View style={styles.dayCloseCard} testID="day-close-summary">
                      <View style={styles.dayCloseHeader}>
                        <View style={[styles.iconTileLarge, { backgroundColor: '#F59E0B26' }]}>
                          <Ionicons name="lock-closed" size={24} color="#F59E0B" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.menuCardTitle}>Zamknięcie dnia</Text>
                          <Text style={styles.menuCardSubtitle}>
                            {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </Text>
                        </View>
                      </View>

                      {Object.keys(advancesTotals).length > 0 && (
                        <DaySummaryRow icon="pricetag-outline" color="#0EA5E9" label="Zaliczki od klientów" totals={advancesTotals} />
                      )}

                      <DayTotalTile
                        icon="wallet"
                        color="#10B981"
                        label="Gotówka w kasie"
                        caption="Tyle gotówki powinno być w kasie"
                        totals={finalCashTotals}
                        signed
                      />
                      <DayTotalTile
                        icon="card"
                        color="#3B82F6"
                        label="Zamknięcie terminala"
                        caption="Płatności kartą na koniec dnia"
                        totals={Object.fromEntries(Object.entries(finalCardTotals).filter(([, total]) => total !== 0))}
                      />
                      <DayTotalTile
                        icon="stats-chart"
                        color="#F59E0B"
                        label="Obrót dnia"
                        caption={turnoverMissingRates.size > 0
                          ? `Suma sprzedaży liczona do obrotu. Brak kursu: ${[...turnoverMissingRates].join(', ')} - nie wliczone`
                          : "Suma sprzedaży liczona do obrotu"}
                        totals={{ PLN: totalTurnoverPln }}
                      />
                    </View>
                  );
                })()}
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: Math.max(120, insets.bottom + 120) }}
        />
        {/* Edit Modal - ten sam wygląd i wyliczenia co „Nowa sprzedaż” (QRScanner) */}
        <Modal
          transparent={false}
          visible={editModalVisible}
          animationType="slide"
          onRequestClose={() => setEditModalVisible(false)}
        >
          {/* Tło okna w kolorze motywu - bez niego pod zawartością zmniejszoną przez klawiaturę prześwituje białe tło Modala */}
          <View style={{ flex: 1, backgroundColor: tc('bg', "black") }}>
          <KeyboardSafeScreen
            style={{ flex: 1, backgroundColor: tc('bg', "black"), width: "100%", height: "100%", justifyContent: "flex-start", alignItems: "stretch", zIndex: 5 }}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <ScrollView style={{ width: '100%' }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ flexGrow: 1, paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(120, insets.bottom + 120) }}>
                <View style={{ flex: 1, backgroundColor: tc('bg', "black"), alignSelf: 'stretch', paddingHorizontal: 20, paddingBottom: 24, justifyContent: "flex-start", alignItems: "stretch" }}>
                  <Pressable style={sf.closeButton} onPress={() => setEditModalVisible(false)}>
                    <Ionicons name="close" size={24} color={tc('text', '#fff')} />
                  </Pressable>
                  <SaleModalHeader icon="create" color="#10B981" title="Edycja sprzedaży" />
                  <Text style={look.formLabel}>Kod kreskowy</Text>
                  <TextInput
                    style={sf.inputField}
                    value={editData?.barcode || ""}
                    editable={false}
                    placeholder="Kod kreskowy"
                    placeholderTextColor={tc('muted', '#888')}
                  />
                  <Text style={look.formLabel}>Sprzedano produkt</Text>
                  <TextInput
                    style={sf.inputField}
                    value={[editData?.fullName, editData?.size && editData.size !== '-' ? editData.size : null].filter(Boolean).join(' ')}
                    editable={false}
                  />
                  <Text style={look.formLabel}>Gdzie</Text>
                  <TextInput
                    style={sf.inputField}
                    value={editData?.sellingPoint || user?.sellingPoint || "Unknown"}
                    editable={false}
                    placeholder="Selling Point"
                  />
                  {/* „Sprzedano od” jak w „Nowa sprzedaż” (QRScanner): ramka z podpisem, lista ze stanem kurtki w punkcie, czerwony napis przy braku */}
                  <View style={styles.sellerFrame}>
                    <Text style={styles.sellerFrameCaption}>Sprzedano od - bardzo ważne, wybierz uważnie</Text>
                    <TouchableOpacity
                      style={[look.selectField, sf.importantSelect]}
                      onPress={() => {
                        if (getMatchingSymbols().length > 0) {
                          setSymbolSelectionVisible(true);
                        } else {
                          setErrorMessage("Nie znaleziono punktów sprzedaży w Twojej lokalizacji.");
                          setErrorModalVisible(true);
                        }
                      }}
                    >
                      <Text style={[look.selectFieldText, !editData?.from && { color: tc('muted', '#94A3B8') }]}>
                        {editData?.from ? pointNameBySymbol(users, editData.from) : "Wybierz punkt sprzedaży"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#F59E0B" />
                    </TouchableOpacity>
                    {editData?.barcode && editData?.from && editStockAt(editData.from) === 0 ? (
                      <Text testID="edit-point-missing-warning" style={[styles.salePointNote, styles.salePointNoteMissing, { textAlign: 'center', marginTop: 6 }]}>
                        {`W punkcie ${editData.from} nie ma tej kurtki na stanie - po przetworzeniu powstanie korekta.`}
                      </Text>
                    ) : null}
                  </View>

                  {/* Checkbox Odbiór */}
                  <TouchableOpacity
                    style={[look.optionCard, { marginBottom: 16 }, editData?.isPickup && { borderColor: '#0D6EFD', backgroundColor: 'rgba(13, 110, 253, 0.12)' }]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !!editData?.isPickup }}
                    testID="edit-pickup-checkbox"
                    onPress={toggleEditPickup}
                  >
                    <View style={[look.optionCardIcon, { backgroundColor: 'rgba(13, 110, 253, 0.15)' }]}>
                      <Ionicons name="bag-check-outline" size={20} color="#0D6EFD" />
                    </View>
                    <Text style={look.optionCardLabel}>
                      Odbiór (dopłata do zaliczki)
                    </Text>
                    <Ionicons name={editData?.isPickup ? 'checkbox' : 'square-outline'} size={24} color={editData?.isPickup ? '#0D6EFD' : tc('muted', '#94A3B8')} />
                  </TouchableOpacity>

                  {/* Zamówienie odbierane tą sprzedażą (wybrane teraz albo zapisane wcześniej) */}
                  {editData?.isPickup && (editData?.pickupOrder || editData?.orderId) && (
                    <View testID="edit-selected-pickup-order" style={[sf.paymentCard || {}, { borderWidth: 1, borderColor: '#0D6EFD', borderRadius: 12, padding: 12, marginBottom: 12 }]}>
                      <Text style={{ color: tc('text', '#fff'), fontWeight: '700' }}>{`Zamówienie ${editData.pickupOrder?.orderId || editData.orderId}`}</Text>
                      {editData.pickupOrder && (
                        <>
                          <Text style={{ color: tc('text', '#fff'), fontSize: 14, marginTop: 4 }}>{orderProductName(editData.pickupOrder)}</Text>
                          <Text style={{ color: tc('muted', '#94A3B8'), fontSize: 13, marginTop: 2 }}>{`${editData.pickupOrder.customer?.name || ''} · zaliczka: ${formatOrderDeposit(editData.pickupOrder.payment)}`}</Text>
                          {isOrderProductMismatch(editData.pickupOrder, `${editData?.fullName || ''} ${editData?.size || ''}`) && (
                      <View testID="edit-pickup-exchange-info" style={{ marginTop: 8, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.12)' }}>
                        <Text style={{ color: '#F59E0B', fontWeight: '700' }}>Wymiana na inny model</Text>
                        <Text style={{ color: tc('text', '#fff'), fontSize: 13, marginTop: 2 }}>{`Zamówiono: ${orderProductName(editData.pickupOrder)}`}</Text>
                        <Text style={{ color: tc('text', '#fff'), fontSize: 13 }}>{`Wydajesz: ${String(`${editData?.fullName || ''} ${editData?.size || ''}` || '').trim()}`}</Text>
                        {editExchangeMinTopUp !== null ? (
                          <>
                            <Text style={{ color: tc('text', '#fff'), fontSize: 13, marginTop: 4 }}>
                              {`Minimalna cena wydawanej kurtki: ${editMinPrice} zł − zaliczka ${formatMoney(editExchangeDeposit)} zł = minimalna dopłata ${formatMoney(editExchangeMinTopUp)} zł`}
                            </Text>
                            <Text testID="edit-exchange-minimum" style={{ color: '#10B981', fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                              {editExchangeMissing > 0.005 ? `Dopłać jeszcze ${formatMoney(editExchangeMissing)} zł, aby osiągnąć minimum.` : 'Minimalna cena osiągnięta.'}
                            </Text>
                          </>
                        ) : (
                          <Text style={{ color: tc('muted', '#94A3B8'), fontSize: 12, marginTop: 2 }}>Zaliczka + dopłata muszą dać co najmniej cenę minimalną wydawanej kurtki.</Text>
                        )}
                      </View>
                    )}
                        </>
                      )}
                    </View>
                  )}

                  <Modal
                    transparent={true}
                    animationType="slide"
                    visible={editPickupOrdersVisible}
                    onRequestClose={() => setEditPickupOrdersVisible(false)}
                  >
                    <View style={styles.currencyModalContainer}>
                      <View style={styles.currencyModalContent}>
                        <SaleModalHeader icon="bag-check" color="#0D6EFD" title="Które zamówienie klient odbiera?" subtitle="Odbiór tylko z zamówieniem z zaliczką - bez niego zostaje zwykła sprzedaż" />
                        <Text testID="edit-pickup-orders-sold-item" style={{ color: tc('text', '#fff'), fontWeight: '700', marginBottom: 8, width: '100%' }}>
                          {`Wydajesz: ${`${editData?.fullName || ''} ${editData?.size || ''}`.trim()}`}
                        </Text>
                        <ScrollView style={{ maxHeight: 420, width: '100%', marginBottom: 8 }}>
                          {editPickupOrdersLoading && editPickupOrders.length === 0 ? (
                            <Text style={{ color: tc('muted', '#94A3B8'), textAlign: 'center', padding: 20 }}>Wczytuję zamówienia…</Text>
                          ) : editPickupOrders.length === 0 ? (
                            <Text style={{ color: tc('muted', '#94A3B8'), textAlign: 'center', padding: 20 }}>Brak oczekujących zamówień w tym punkcie - to nie jest odbiór.</Text>
                          ) : (
                            sortPickupOrders(editPickupOrders, editData?.fullName).map((order) => {
                              const matches = orderMatchScore(order, `${editData?.fullName || ''} ${editData?.size || ''}`) >= 3;
                              return (
                                <TouchableOpacity
                                  key={order._id}
                                  testID={`edit-pickup-order-${order.orderId}`}
                                  style={[styles.currencyModalItem, matches && { borderColor: '#10B981', borderWidth: 1 }]}
                                  onPress={() => selectEditPickupOrder(order)}
                                >
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={[styles.currencyModalItemText, { flex: 1 }]} numberOfLines={1}>{orderProductName(order)}</Text>
                                    {matches && <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '700' }}>pasuje</Text>}
                                    {!matches && isOrderProductMismatch(order, `${editData?.fullName || ''} ${editData?.size || ''}`) && <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '700' }}>inny model</Text>}
                                  </View>
                                  {!matches && isOrderProductMismatch(order, `${editData?.fullName || ''} ${editData?.size || ''}`) && (
                                    <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '600', marginTop: 2 }}>
                                      {`Wymiana na inny model: ${`${editData?.fullName || ''} ${editData?.size || ''}`.trim()}`}
                                    </Text>
                                  )}
                                  <Text style={{ color: tc('muted', '#94A3B8'), fontSize: 13, marginTop: 2 }}>
                                    {`${order.orderId} · ${order.customer?.name || 'Klient'} · zaliczka: ${formatOrderDeposit(order.payment)}`}
                                  </Text>
                                  <Text style={{ color: Number(order.remainingPln) > 0 ? '#EF4444' : '#10B981', fontSize: 14, fontWeight: '700', marginTop: 2 }}>
                                    {`Do dopłaty: ${formatMoney(Number(order.remainingPln) || 0)} zł`}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </ScrollView>
                        <TouchableOpacity style={styles.currencyModalCloseButton} onPress={() => setEditPickupOrdersVisible(false)}>
                          <Text style={styles.currencyModalCloseButtonText}>Zamknij</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Modal>

                  {editPriceRuleSale && (
                    <View testID="edit-payment-mode" style={{ gap: 8, marginBottom: 12 }}>
                      {[
                        { key: 'cash', label: 'Płatność gotówką', color: '#10B981' },
                        { key: 'card', label: 'Płatność kartą', color: '#3B82F6' },
                        { key: 'mixed', label: 'Gotówka i karta', color: '#8B5CF6' },
                      ].map((option) => {
                        const checked = editPaymentMode === option.key;
                        return (
                          <Pressable
                            key={option.key}
                            testID={`edit-payment-mode-${option.key}`}
                            accessibilityRole="radio"
                            accessibilityState={{ checked }}
                            style={[look.optionCard, checked && { borderColor: option.color, backgroundColor: `${option.color}1F` }]}
                            onPress={() => selectEditPaymentMode(option.key)}
                          >
                            <Ionicons name={checked ? 'radio-button-on' : 'radio-button-off'} size={20} color={option.color} />
                            <Text style={look.optionCardLabel}>{option.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {showEditCashPayment && (
                  <View testID="edit-cash-payment-section" style={sf.paymentCard}>
                    <View style={sf.paymentHeader}>
                      <View style={[look.optionCardIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                        <Ionicons name="cash-outline" size={20} color="#10B981" />
                      </View>
                      <Text style={sf.paymentTitle}>{editData?.isPickup ? 'Dopłata' : 'Płatność gotówką'}</Text>
                    </View>
                    <Text style={sf.fieldCaption}>{editPaymentMode === 'mixed' ? 'Klient wpłacił gotówką' : 'Klient wpłacił'}</Text>
                    {cashPriceCurrencyPairs.map((pair, index) => (
                      <View
                        key={`cash-${index}`}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}
                      >
                        <TextInput
                          style={[look.formInput, { flex: 1.4 }]}
                          placeholderTextColor={tc('muted', '#888')}
                          value={pair.price}
                          onChangeText={(value) => {
                            const numericValue = sanitizeAmountInput(value);
                            handleCashPairChange(index, "price", numericValue);
                          }}
                          placeholder="Wpisz kwotę"
                          keyboardType="numeric"
                        />
                        <TouchableOpacity
                          style={[look.selectField, { flex: 1 }]}
                          onPress={() => openCurrencyModal(index, "cash")}
                        >
                          <Text style={look.selectFieldText}>{pair.currency || "PLN"}</Text>
                          <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
                        </TouchableOpacity>
                        {index > 0 && (
                          <TouchableOpacity
                            accessibilityLabel="Usuń"
                            style={sf.removeTile}
                            onPress={() => handleRemoveCashPair(index)}
                          >
                            <Ionicons name="trash-outline" size={20} color="#EF4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                    <Pressable style={sf.addPairButton} onPress={handleAddCashPair}>
                      <Ionicons name="add" size={20} color="#0D6EFD" />
                      <Text style={sf.addPairButtonText}>Dodaj walutę</Text>
                    </Pressable>
                  </View>
                  )}
                  {showEditCardPayment && (
                  <View testID="edit-card-payment-section" style={sf.paymentCard}>
                    <View style={sf.paymentHeader}>
                      <View style={[look.optionCardIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                        <Ionicons name="card-outline" size={20} color="#3B82F6" />
                      </View>
                      <Text style={sf.paymentTitle}>{editData?.isPickup ? "Dopłata kartą" : "Płatność kartą"}</Text>
                    </View>
                    {editPaymentMode === 'mixed' && <Text style={sf.fieldCaption}>Klient zapłacił kartą</Text>}
                    {cardPriceCurrencyPairs.map((pair, index) => (
                      <View
                        key={`card-${index}`}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}
                      >
                        <TextInput
                          testID={`edit-card-payment-amount-${index}`}
                          style={[look.formInput, { flex: 1.4 }, editPaymentMode === 'card' && editPriceRuleSale && { opacity: 0.45 }]}
                          placeholderTextColor={tc('muted', '#888')}
                          value={pair.price}
                          editable={!editCardNoDiscount || editPaymentMode !== 'card'}
                          onChangeText={(value) => {
                            const numericValue = sanitizeAmountInput(value);
                            handleCardPairChange(index, "price", numericValue);
                          }}
                          placeholder="Wpisz kwotę"
                          keyboardType="numeric"
                        />
                        {editPriceRuleSale ? (
                          <TouchableOpacity
                            testID={`edit-card-payment-currency-${index}`}
                            style={[look.selectField, { flex: 1 }, editPaymentMode === 'card' && { opacity: 0.45 }]}
                            disabled
                            accessibilityState={{ disabled: true }}
                          >
                            <Text style={look.selectFieldText}>PLN</Text>
                            <Ionicons name="lock-closed-outline" size={16} color={tc('muted', '#94A3B8')} />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[look.selectField, { flex: 1 }]}
                            onPress={() => openCurrencyModal(index, "card")}
                          >
                            <Text style={look.selectFieldText}>{pair.currency}</Text>
                            <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                  )}
                  {editPaymentBalance.missingRates.length > 0 && (
                    <Text style={sf.remainingHint}>{`Brak kursu: ${editPaymentBalance.missingRates.join(", ")} - te wpłaty nie są liczone`}</Text>
                  )}
                  {editPaymentBalance.paidPln > 0.005 && (
                    <Text testID="edit-final-price" style={sf.finalPriceText}>{`Finalna cena: ${roundDownMoney(editPaymentBalance.paidPln)} zł`}</Text>
                  )}
                  {editBelowMinimum && (
                    <Text testID="edit-minimum-price" style={sf.minimumPriceText}>{`Minimalna cena: ${formatMoney(effectiveEditMinPrice)} zł`}</Text>
                  )}
                  <View style={sf.modalButtons}>
                    <Pressable
                      style={[sf.button, sf.cancelButton]}
                      onPress={() => setEditModalVisible(false)}
                    >
                      <Text style={look.neutralButtonText}>Anuluj</Text>
                    </Pressable>
                    <Pressable
                      style={[sf.button, sf.addButton, savingEdit && { opacity: 0.6 }]}
                      onPress={() => runEditOnce(updateItem)}
                      disabled={savingEdit}
                      testID="edit-save-button"
                    >
                      <Text style={look.buttonText}>{savingEdit ? 'Zapisuję…' : 'Zapisz'}</Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </TouchableWithoutFeedback>
          </KeyboardSafeScreen>
          </View>
        </Modal>
        {/* Symbol Selection Modal - Identyczny z QRScanner */}
        <Modal
          transparent={true}
          visible={symbolSelectionVisible}
          animationType="slide"
          onRequestClose={() => setSymbolSelectionVisible(false)}
        >
          <View style={styles.currencyModalContainer}>
            <View style={styles.currencyModalContent}>
              <SaleModalHeader icon="storefront" color="#F59E0B" title="Wybierz punkt sprzedaży" subtitle="Skąd pochodzi sprzedany produkt" />
              <ScrollView style={{ maxHeight: 400, width: '100%', marginBottom: 8 }}>
                {getMatchingSymbols().length > 0 ? (
                  getMatchingSymbols().map((item) => (
                    <TouchableOpacity
                      key={item._id || item.symbol}
                      testID={`edit-point-${item.symbol}`}
                      style={[styles.currencyModalItem, styles.pointItemCentered]}
                      onPress={() => {
                        setEditData((prev) => ({ ...prev, from: item.symbol })); // Update 'from' field
                        setSymbolSelectionVisible(false); // Close modal
                      }}
                    >
                      <Text style={[styles.currencyModalItemText, { textAlign: 'center' }]}>
                        {pointDisplayName(item)}
                      </Text>
                      {editData?.barcode ? (
                        <Text
                          testID={`edit-point-${item.symbol}-note`}
                          style={[styles.salePointNote, { textAlign: 'center' }, editStockAt(item.symbol) === 0 && styles.salePointNoteMissing]}
                        >
                          {editStockAt(item.symbol) > 0
                            ? `Na stanie: ${editStockAt(item.symbol)} szt.`
                            : 'Brak na stanie - po przetworzeniu powstanie korekta'}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={{ padding: 20 }}>
                    <Text style={{ color: tc('text', 'white'), textAlign: 'center', fontSize: 16 }}>
                      {`Brak punktów sprzedaży w lokalizacji "${user?.location || 'nieznana'}"`}
                    </Text>
                  </View>
                )}
              </ScrollView>
              <Pressable
                style={styles.currencyModalCloseButton}
                onPress={() => setSymbolSelectionVisible(false)}
              >
                <Text style={styles.currencyModalCloseButtonText}>Zamknij</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        {/* Options Modal */}
        <Modal
          transparent
          visible={modalVisible}
          animationType="slide"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Opcje</Text>
              <TouchableOpacity
                onPress={() => {
                  if (selectedItem?._id) {
                    fetchItemData(selectedItem._id); // Fetch data and open edit modal
                    setModalVisible(false); // Close options modal
                  }
                }}
                style={styles.optionButton}
              >
                <Text style={styles.optionText}>Edytuj</Text>
              </TouchableOpacity>
              {(user?.symbol === 'most' || user?.email === 'most@wp.pl') && (
                <>
                  {isItemInPanKazek(selectedItem) ? (
                    <TouchableOpacity
                      onPress={() => {
                        handleRemoveFromPanKazek();
                      }}
                      style={[styles.optionButton, { backgroundColor: '#dc3545' }]}
                    >
                      <Text style={styles.optionText}>Usuń z listy Pan Kazek</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        handlePanKazekTransfer();
                      }}
                      style={[styles.optionButton, { backgroundColor: '#28a745' }]}
                    >
                      <Text style={styles.optionText}>Od Pana Kazka</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              <TouchableOpacity
                onPress={() => {
                  if (selectedItem?._id) {
                    setDeleteConfirmMessage("Czy na pewno chcesz usunąć tę sprzedaż?");
                    setConfirmDeleteModalVisible(true);
                  } else {
                    Logger.error("No valid ID found for the selected item.");
                  }
                }}
                style={[styles.optionButton, styles.deleteButton]}
              >
                <Text style={styles.optionText}>Usuń</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={[styles.optionButton, styles.closeButton]}
              >
                <Text style={styles.closeText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        <Modal
          transparent
          visible={transferOptionsVisible}
          animationType="slide"
          onRequestClose={() => setTransferOptionsVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Opcje transferu</Text>
              <Text testID="transfer-cancel-hint" style={[styles.modalText, { textAlign: 'center', marginBottom: 12 }]}>
                {selectedTransferredItem?.transfer_to === 'Wymiana'
                  ? 'Anulowanie wymiany odbywa się w zakładce Stan.'
                  : 'Anulowanie przepisania odbywa się w zakładce Stan.'}
              </Text>
              <TouchableOpacity
                onPress={() => setTransferOptionsVisible(false)}
                style={[styles.optionButton, styles.closeButton]}
              >
                <Text style={styles.closeText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        {/* Currency Modal */}
        {currencyModalVisible && (
          <CurrencyPickerModal
            visible={currencyModalVisible}
            onClose={() => setCurrencyModalVisible(false)}
            onSelect={selectCurrencyFromModal}
            options={availableCurrencies}
            title="Wybierz walutę"
            subtitle="Waluta płatności"
            color="#0D6EFD"
          />
        )}
        
        {/* Deduction Modal */}
        <Modal
          transparent={true}
          visible={deductionModalVisible}
          animationType="fade"
          onRequestClose={() => setDeductionModalVisible(false)}
        >
          <KeyboardSafeOverlay>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '90%', alignItems: 'stretch' }]}>
              <ModalHeader icon="remove-circle" color="#DC3545" title="Odpisz kwotę" />
              
              <ScrollView 
                style={{ width: '100%' }}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
              
              {/* Available funds display */}
              {(() => {
                const currentAvailable = availableFunds[deductionCurrency] || 0;
                return (
                  <View style={[styles.fundsCard, { marginTop: 0, marginBottom: 15 }]}>
                    <View style={[styles.iconTileLarge, { backgroundColor: '#10B98126' }]}>
                      <Ionicons name="wallet" size={24} color="#10B981" />
                    </View>
                    <View style={{ flex: 1 }}>
                    <Text style={{ color: tc('muted', '#94A3B8'), fontSize: 13 }}>Dostępne środki</Text>
                    <Text style={{
                      color: '#10b981',
                      fontSize: 20,
                      fontWeight: 'bold'
                    }}>
                      {currentAvailable.toFixed(2)} {deductionCurrency}
                    </Text>
                    {Object.keys(availableFunds).length > 1 && (
                      <Text style={{
                        color: tc('muted', '#9ca3af'),
                        fontSize: 12,
                        marginTop: 4
                      }}>
                        Inne waluty: {Object.entries(availableFunds)
                          .filter(([currency]) => currency !== deductionCurrency)
                          .map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`)
                          .join(', ')}
                      </Text>
                    )}
                    </View>
                  </View>
                );
              })()}
              
              {/* Amount input */}
              <View style={{ width: '100%', marginBottom: 15 }}>
                <Text style={styles.formLabel}>Kwota:</Text>
                <TextInput
                  style={[styles.formInput, { textAlign: 'center' }]}
                  placeholder="0.00"
                  placeholderTextColor={tc('muted', "#ccc")}
                  value={deductionAmount}
                  onChangeText={(value) => setDeductionAmount(sanitizeAmountInput(value))}
                  keyboardType="numeric"
                />
              </View>
              
              {/* Currency selection */}
              <View style={{ width: '100%', marginBottom: 15 }}>
                <Text style={styles.formLabel}>Waluta:</Text>
                <TouchableOpacity
                  style={styles.selectField}
                  onPress={() => setDeductionCurrencyModalVisible(true)}
                >
                  <Text style={styles.selectFieldText}>
                    {deductionCurrency}
                  </Text>
                    <Ionicons name="chevron-down" size={20} color={tc('muted', '#94A3B8')} />
                  </TouchableOpacity>
              </View>
              
              {/* Currency rate input - show only for non-PLN currencies */}
              {showDeductionRateInput && deductionCurrency !== 'PLN' && (
                <View style={{ width: '100%', marginBottom: 20 }}>
                  <Text style={styles.formLabel}>
                    Kurs {deductionCurrency} (1 {deductionCurrency} = ? PLN):
                  </Text>
                  <TextInput
                    style={[styles.formInput, { textAlign: 'center', borderColor: '#f39c12', borderWidth: 2 }]}
                    placeholder="0.00"
                    placeholderTextColor={tc('muted', "#666")}
                    value={deductionCurrencyRate}
                    onChangeText={(value) => {
                      setDeductionCurrencyRate(value);
                      // Save rate to storage when user types
                      if (value && parseFloat(value) > 0) {
                        CurrencyService.updateCurrencyRate(deductionCurrency, parseFloat(value)).catch(Logger.error);
                      }
                    }}
                    keyboardType="decimal-pad"
                  />
                  {deductionCurrencyRate && parseFloat(deductionCurrencyRate) > 0 && (
                    <Text style={{
                      color: '#4ecdc4',
                      fontSize: 12,
                      textAlign: 'center',
                      marginTop: 5
                    }}>
                      1 {deductionCurrency} = {parseFloat(deductionCurrencyRate).toFixed(2)} PLN
                    </Text>
                  )}
                </View>
              )}
              
              {/* Typ odpisania */}
              <View style={{ width: '100%', marginBottom: 15 }}>
                <Text style={styles.formLabel}>Typ odpisania:</Text>
                
                <OptionCard
                  selected={deductionType === "other"}
                  icon="receipt-outline"
                  label="Inne odpisanie"
                  color="#DC3545"
                  onPress={() => setDeductionType("other")}
                />
                <OptionCard
                  selected={deductionType === "employee_advance"}
                  icon="person-outline"
                  label="Zaliczka pracownika"
                  color="#DC3545"
                  onPress={() => setDeductionType("employee_advance")}
                />
              </View>
              
              {/* Wybór pracownika dla zaliczki */}
              {deductionType === "employee_advance" && (
                <View style={{ width: '100%', marginBottom: 15 }}>
                  <Text style={styles.formLabel}>Wybierz pracownika:</Text>
                  <TouchableOpacity
                    style={styles.selectField}
                    onPress={() => setDeductionEmployeeModalVisible(true)}
                  >
                    <Text style={styles.selectFieldText}>
                      {selectedEmployeeForAdvance 
                        ? `${selectedEmployeeForAdvance.firstName} ${selectedEmployeeForAdvance.lastName}${selectedEmployeeForAdvance.employeeId ? ` (ID: ${selectedEmployeeForAdvance.employeeId})` : ''}`
                        : 'Wybierz pracownika'
                      }
                    </Text>
                    <Ionicons name="chevron-down" size={20} color={tc('muted', '#94A3B8')} />
                  </TouchableOpacity>
                </View>
              )}
              
              {/* Reason input */}
              <View style={{ width: '100%', marginBottom: 20 }}>
                <Text style={styles.formLabel}>
                  {deductionType === "employee_advance" ? "Dodatkowe uwagi (opcjonalne):" : "Powód odpisania:"}
                </Text>
                <TextInput
                  scrollEnabled={false}
                  style={[styles.formInput, { minHeight: 80, textAlignVertical: 'top' }]}
                  placeholder={deductionType === "employee_advance" ? "Dodatkowe uwagi do zaliczki (opcjonalne)..." : "Wpisz powód odpisania kwoty..."}
                  placeholderTextColor={tc('muted', "#ccc")}
                  value={deductionReason}
                  onChangeText={setDeductionReason}
                  multiline={true}
                  numberOfLines={3}
                />
              </View>
              
              {/* Action buttons */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#DC3545',
                    flex: 1,
                    paddingVertical: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                  }}
                  onPress={() => runDeductionOnce(submitDeduction)}
                  disabled={savingDeduction}
                  testID="submit-deduction-button"
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', opacity: savingDeduction ? 0.6 : 1 }}>
                    {savingDeduction ? 'Zapisuję…' : 'Odpisz kwotę'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{
                    backgroundColor: tc('surface2', '#2a2a3e'),
                    borderWidth: 1,
                    borderColor: tc('border', '#334155'),
                    flex: 1,
                    paddingVertical: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                  }}
                  onPress={() => {
                    setDeductionModalVisible(false);
                    setDeductionAmount("");
                    setDeductionCurrency("PLN");
                    setDeductionCurrencyRate("");
                    setShowDeductionRateInput(false);
                    setDeductionReason("");
                    setDeductionType("other");
                    setSelectedEmployeeForAdvance(null);
                  }}
                >
                  <Text style={{ color: tc('text', '#fff'), fontSize: 16, fontWeight: 'bold' }}>
                    Anuluj
                  </Text>
                </TouchableOpacity>
              </View>
              </ScrollView>
            </View>
          </View>
          </KeyboardSafeOverlay>
        </Modal>
        
        {/* Operation Options Modal */}
        <Modal
          transparent={true}
          visible={operationOptionsVisible}
          animationType="fade"
          onRequestClose={() => setOperationOptionsVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { width: '80%' }]}>
              <Text style={styles.modalTitle}>Opcje operacji</Text>

              {/* Zaliczka zamówienia: zmiany tylko przez zamówienie (anulowanie zamówienia w panelu zdejmuje zaliczkę) -
                  edycja/anulowanie tutaj rozjechałyby zamówienie z rozliczeniami */}
              {selectedOperationItem && (selectedOperationItem.orderId || selectedOperationItem.orderMongoId) ? (
                <Text testID="order-deposit-locked" style={{ color: tc('text', '#fff'), fontSize: 14, textAlign: 'center', marginBottom: 14, lineHeight: 20 }}>
                  {`To zaliczka zamówienia ${selectedOperationItem.orderId || ''}. Zmieniaj ją przez zamówienie - anulowanie zamówienia w panelu zdejmuje zaliczkę z rozliczeń.`}
                </Text>
              ) : (
                <>
                  {selectedOperationItem && (selectedOperationItem.type === 'addition' || selectedOperationItem.amount > 0) && (
                    <TouchableOpacity
                      style={[styles.optionButton, { backgroundColor: '#0d6efd', marginBottom: 10 }]}
                      onPress={() => openEditAddAmountModal(selectedOperationItem)}
                    >
                      <Text style={styles.optionText}>{(selectedOperationItem.productId || selectedOperationItem.productName) ? 'Edytuj zaliczkę' : 'Edytuj'}</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.optionButton, { backgroundColor: '#ef4444', marginBottom: 10 }]}
                    onPress={() => {
                      if (selectedOperationItem) {
                        setSelectedDeductionItem(selectedOperationItem);
                        setOperationOptionsVisible(false);
                        setCancelDeductionModalVisible(true);
                      }
                    }}
                  >
                    <Text style={styles.optionText}>Anuluj operację</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={[styles.optionButton, styles.closeButton]}
                onPress={() => setOperationOptionsVisible(false)}
              >
                <Text style={styles.closeText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Cancel Deduction Modal */}
        <Modal
          transparent={true}
          visible={cancelDeductionModalVisible}
          animationType="fade"
          onRequestClose={() => setCancelDeductionModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { width: '80%' }]}>
              <Text style={styles.modalTitle}>Anuluj operację</Text>
              
              {selectedDeductionItem && (
                <View style={{ width: '100%', marginBottom: 20 }}>
                  <Text style={{ color: tc('text', '#fff'), fontSize: 14, textAlign: 'center', marginBottom: 8 }}>
                    Czy na pewno chcesz anulować tę operację?
                  </Text>
                  <View style={{ 
                    backgroundColor: tc('surface2', '#374151'), 
                    padding: 12, 
                    borderRadius: 8, 
                    marginBottom: 15 
                  }}>
                    <Text style={{ color: '#fbbf24', fontSize: 16, fontWeight: 'bold', textAlign: 'center' }}>
                      {selectedDeductionItem.reason}
                    </Text>
                    <Text style={{ 
                      color: (selectedDeductionItem.type === 'addition' || selectedDeductionItem.amount > 0) ? '#10b981' : '#ef4444', 
                      fontSize: 18, 
                      fontWeight: 'bold', 
                      textAlign: 'center', 
                      marginTop: 4 
                    }}>
                      {(selectedDeductionItem.type === 'addition' || selectedDeductionItem.amount > 0)
                        ? `+${Math.abs(selectedDeductionItem.amount)} ${selectedDeductionItem.currency}`
                        : `-${Math.abs(selectedDeductionItem.amount)} ${selectedDeductionItem.currency}`
                      }
                    </Text>
                  </View>
                </View>
              )}
              
              <TouchableOpacity
                style={[styles.optionButton, { backgroundColor: '#ef4444', marginBottom: 10 }]}
                onPress={cancelDeduction}
              >
                <Text style={styles.optionText}>Tak, anuluj operację</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.optionButton, styles.closeButton]}
                onPress={() => {
                  setCancelDeductionModalVisible(false);
                  setSelectedDeductionItem(null);
                }}
              >
                <Text style={styles.closeText}>Nie, zostaw</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Add Amount Modal */}
        <Modal
          transparent={true}
          visible={addAmountModalVisible}
          animationType="fade"
          onRequestClose={() => {
            resetAddAmountForm();
          }}
        >
          <KeyboardSafeOverlay>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '90%', alignItems: 'stretch' }]}>
              <ModalHeader icon="add-circle" color="#10B981" title={isEditingAddAmount ? (reasonType === 'other' ? 'Edytuj' : 'Edytuj zaliczkę') : 'Dopisz kwotę'} />
              
              <ScrollView 
                ref={addAmountReveal.scrollRef}
                style={{ width: '100%' }}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
              
              {/* Reason selection */}
              <View style={{ width: '100%', marginBottom: 20 }}>
                <Text style={styles.formLabel}>Powód dopisania:</Text>
                
                {/* Radio buttons */}
                <View style={{ marginBottom: 15 }}>
                  {/* Nowa zaliczka klienta tylko przez zamówienie: tam jest odbiór, wymiana i jedna prowizja.
                      „Zaliczka na produkt” zostaje wyłącznie do edycji zaliczek przyjętych tu wcześniej. */}
                  {!(isEditingAddAmount && reasonType === 'product') && (
                    <View testID="advance-via-orders" style={{ borderWidth: 1, borderColor: '#0D6EFD', borderRadius: 12, padding: 12, marginBottom: 10, backgroundColor: 'rgba(13, 110, 253, 0.10)' }}>
                      <Text style={{ color: tc('text', '#fff'), fontWeight: '700' }}>Zaliczka od klienta na kurtkę?</Text>
                      <Text style={{ color: tc('muted', '#94A3B8'), fontSize: 13, marginTop: 2 }}>
                        Przyjmij ją przez zamówienie - przy odbiorze wybierzesz je w „Odbiór”, a prowizja policzy się raz.
                      </Text>
                      <TouchableOpacity
                        testID="advance-open-orders"
                        style={{ marginTop: 10, backgroundColor: '#0D6EFD', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                        onPress={() => {
                          setAddAmountModalVisible(false);
                          resetAddAmountForm();
                          router.push('/(tabs)/profile');
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Przyjmij zaliczkę w „Zamów”</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {isEditingAddAmount && reasonType === 'product' && (
                  <OptionCard
                    selected={reasonType === 'product'}
                    icon="pricetag-outline"
                    label="Zaliczka na produkt"
                    color="#10B981"
                    onPress={() => {
                      Logger.debug('Selected product radio');
                      setReasonType('product');
                      setProductType('standard');
                      setAddAmountReason('');
                      setShowProductDropdown(false);
                    }}
                  />
                  )}
                  <OptionCard
                    selected={reasonType === 'other'}
                    icon="create-outline"
                    label={isEditingAddAmount && reasonType === 'product' ? "Inny powód dopisania" : "Wpłata do kasy (inny powód)"}
                    color="#10B981"
                    onPress={() => {
                      setReasonType('other');
                      setSelectedProduct('');
                      setProductFinalPrice('');
                    }}
                  />
                </View>

                {/* Conditional product search */}
                {reasonType === 'product' && (
                  <View style={{ marginBottom: 15 }}>
                    {/* Standard Product Selection */}
                    <View>
                      <Text style={styles.formLabel}>Produkt standardowy:</Text>
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#0d6efd',
                          paddingVertical: 14,
                          paddingHorizontal: 12,
                          borderRadius: 12,
                          alignItems: 'center',
                          marginBottom: 10,
                        }}
                        onPress={() => {
                          setProductType('standard');
                          setQrScannerVisible(true);
                          setScanned(false);
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                          Skanuj produkt
                        </Text>
                      </TouchableOpacity>

                      <Text style={styles.formLabel}>Wybierz produkt:</Text>
                      <TextInput
                        style={[styles.formInput, { marginBottom: 10, borderColor: '#0d6efd', borderWidth: 2 }]}
                        placeholder="Wpisz nazwę lub kod produktu..."
                        placeholderTextColor={tc('muted', "#ccc")}
                        value={productSearchQuery}
                        onChangeText={(text) => {
                          setProductSearchQuery(text);
                          setShowProductDropdown(true);
                          setProductScanned(false);
                        }}
                        ref={addAmountProductInputRef}
                        onFocus={() => {
                          addAmountReveal.revealWithSpace(addAmountProductInputRef, 220); // miejsce na listę podpowiedzi
                          if (productSearchQuery && !selectedProduct) {
                            setShowProductDropdown(true);
                          }
                        }}
                      />

                      {showProductDropdown && productSearchQuery && (
                        <View style={{
                          maxHeight: 200,
                          backgroundColor: tc('surface', 'black'),
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#0d6efd',
                          marginBottom: 15,
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
                            onPress={() => setShowProductDropdown(false)}
                          >
                            <Text style={{ color: tc('text', '#fff'), fontSize: 16, fontWeight: 'bold' }}>×</Text>
                          </TouchableOpacity>
                          <ScrollView nestedScrollEnabled={true}>
                            {filteredProducts.length > 0 ? (
                              filteredProducts.slice(0, 10).map(product => (
                                <TouchableOpacity
                                  key={product.id || product._id}
                                  style={{
                                    padding: 12,
                                    borderBottomWidth: 1,
                                    borderBottomColor: tc('border', '#333'),
                                    backgroundColor: selectedProduct === (product.id || product._id) ? '#0d6efd' : 'transparent',
                                  }}
                                  onPress={() => {
                                    setSelectedProduct(product.id || product._id);
                                    setProductSearchQuery(product.fullName || product.Tow_Opis || product.code || product.Tow_Kod || product.name || 'Produkt');
                                    setShowProductDropdown(false);
                                  }}
                                >
                                  <Text style={{ color: tc('text', '#fff'), fontSize: 13 }}>
                                    {product.fullName || product.Tow_Opis || product.code || product.Tow_Kod || product.name || 'Nieznany produkt'}
                                  </Text>
                                  {(product.code || product.Tow_Kod) && (product.fullName || product.Tow_Opis) && (
                                    <Text style={{ color: tc('muted', '#ccc'), fontSize: 11 }}>
                                      Kod: {product.code || product.Tow_Kod}
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              ))
                            ) : (
                              <View style={{ padding: 12 }}>
                                <Text style={{ color: tc('muted', '#ccc'), fontSize: 13, textAlign: 'center' }}>
                                  Brak produktów pasujących do wyszukiwania
                                </Text>
                              </View>
                            )}
                          </ScrollView>
                        </View>
                      )}

                      {!productScanned && (
                        <>
                          <Text style={[styles.formLabel, { marginTop: 10 }]}>Wybierz rozmiar:</Text>
                          <TextInput
                            style={[styles.formInput, { marginBottom: 10, borderColor: '#0d6efd', borderWidth: 2 }]}
                            placeholder="Wpisz rozmiar..."
                            autoCapitalize="characters" // rozmiar wielkimi literami
                            placeholderTextColor={tc('muted', "#ccc")}
                            value={sizeSearchQuery}
                            onChangeText={(text) => {
                              setSizeSearchQuery(text);
                              setShowSizeDropdown(true);
                            }}
                            ref={addAmountSizeInputRef}
                            onFocus={() => {
                              addAmountReveal.revealWithSpace(addAmountSizeInputRef, 170); // miejsce na listę rozmiarów
                              setShowSizeDropdown(true);
                            }}
                          />

                          {showSizeDropdown && sizeSearchQuery && (
                            <View style={{
                              maxHeight: 150,
                              backgroundColor: tc('surface', 'black'),
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: '#0d6efd',
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
                                onPress={() => setShowSizeDropdown(false)}
                              >
                                <Text style={{ color: tc('text', '#fff'), fontSize: 12 }}>×</Text>
                              </TouchableOpacity>
                              <ScrollView>
                                {filteredSizes.length > 0 ? (
                                  filteredSizes.slice(0, 10).map((size) => (
                                    <TouchableOpacity
                                      key={size._id || size.id}
                                      style={{
                                        padding: 12,
                                        borderBottomWidth: 1,
                                        borderBottomColor: tc('border', '#333'),
                                        backgroundColor: selectedSize === (size._id || size.id) ? '#0d6efd' : 'transparent',
                                      }}
                                      onPress={() => {
                                        setSelectedSize(size._id || size.id);
                                        setSizeSearchQuery(size.Roz_Opis || size.name || '');
                                        setShowSizeDropdown(false);
                                      }}
                                    >
                                      <Text style={{ color: tc('text', '#fff'), fontSize: 13 }}>
                                        {size.Roz_Opis || size.name || 'Nieznany rozmiar'}
                                      </Text>
                                    </TouchableOpacity>
                                  ))
                                ) : (
                                  <Text style={{ color: tc('muted', '#ccc'), fontSize: 13, padding: 12, textAlign: 'center' }}>
                                    Brak rozmiarów pasujących do "{sizeSearchQuery}"
                                  </Text>
                                )}
                              </ScrollView>
                            </View>
                          )}
                        </>
                      )}
                    </View>
                    
                  </View>
                )}

                {/* Conditional text input */}
                {reasonType === 'other' && (
                  <TextInput
                  scrollEnabled={false}
                    style={[styles.formInput, { minHeight: 80, textAlignVertical: 'top', borderColor: '#10b981', borderWidth: 2 }]}
                    placeholder="Wpisz powód dopisania kwoty..."
                    placeholderTextColor={tc('muted', "#ccc")}
                    value={addAmountReason}
                    onChangeText={setAddAmountReason}
                    multiline={true}
                    numberOfLines={3}
                  />
                )}

                {reasonType === 'other' && (
                  <View style={{ marginTop: 15 }}>
                    <Text style={styles.formLabel}>Prowizja:</Text>
                    <OptionCard
                      selected={!addAmountIncludeCommission}
                      icon="close-circle-outline"
                      label="Nie wliczaj do prowizji"
                      color="#10B981"
                      onPress={() => setAddAmountIncludeCommission(false)}
                    />
                    <OptionCard
                      selected={addAmountIncludeCommission}
                      icon="trending-up-outline"
                      label="Wliczaj do prowizji"
                      color="#10B981"
                      onPress={() => setAddAmountIncludeCommission(true)}
                    />
                  </View>
                )}
              </View>
              {/* Wpłata klienta - układ i dodawanie walut jak przy sprzedaży (bez „Odbioru”); każda waluta = osobna operacja */}
              {!!reasonType && (
                <View style={sf.paymentCard}>
                  {reasonType === 'product' && (
                    <View style={sf.paymentHeader}>
                      <View style={[look.optionCardIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                        <Ionicons name="pricetag-outline" size={20} color="#3B82F6" />
                      </View>
                      <Text style={sf.paymentTitle}>Cena z cennika</Text>
                    </View>
                  )}
                  {reasonType === 'product' && (
                    <View style={sf.salePriceRow}>
                      <Text style={sf.salePriceLabel}>Cena</Text>
                      <TextInput
                        testID="advance-final-price-input"
                        style={[look.formInput, { flex: 1 }]}
                        placeholderTextColor={tc('muted', '#888')}
                        value={productFinalPrice}
                        onChangeText={(value) => setProductFinalPrice(sanitizeAmountInput(value))}
                        placeholder="Cena finalna w zł"
                        keyboardType="numeric"
                      />
                      <Text style={sf.salePriceCurrency}>PLN</Text>
                    </View>
                  )}
                  {reasonType === 'product' && addAmountMinPrice ? (
                    <Text style={[sf.remainingHint, Number(productFinalPrice) > 0 && Number(productFinalPrice) < addAmountMinPrice - 0.005 && { color: '#EF4444', fontWeight: '600' }, { marginTop: -6, marginBottom: 10 }]}>
                      {Number(productFinalPrice) > 0 && Number(productFinalPrice) < addAmountMinPrice - 0.005 ? `Cena jest za niska. Najniższa dopuszczalna: ${addAmountMinPrice} zł` : `Najniższa cena: ${addAmountMinPrice} zł`}
                    </Text>
                  ) : null}
                  <View style={sf.paymentHeader}>
                    <View style={[look.optionCardIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                      <Ionicons name="cash-outline" size={20} color="#10B981" />
                    </View>
                    <Text style={sf.paymentTitle}>{reasonType === 'other' ? "Kwota" : "Kwota jaką klient wpłaca"}</Text>
                  </View>
                  {addAmountPairs.map((pair, index) => (
                    <View
                      key={`advance-${index}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}
                    >
                      <TextInput
                        testID={`advance-amount-${index}`}
                        style={[look.formInput, { flex: 1.4 }]}
                        placeholderTextColor={tc('muted', '#888')}
                        value={pair.price}
                        onChangeText={(value) => handleAddAmountPairChange(index, sanitizeAmountInput(value))}
                        placeholder="Wpisz kwotę"
                        keyboardType="numeric"
                      />
                      <TouchableOpacity
                        testID={`advance-currency-${index}`}
                        style={[look.selectField, { flex: 1 }]}
                        onPress={() => {
                          setAddAmountPairIndex(index);
                          setAddAmountCurrencyModalVisible(true);
                        }}
                      >
                        <Text style={look.selectFieldText}>{pair.currency || "PLN"}</Text>
                        <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
                      </TouchableOpacity>
                      {index > 0 && (
                        <TouchableOpacity
                          accessibilityLabel="Usuń"
                          style={sf.removeTile}
                          onPress={() => handleAddAmountRemovePair(index)}
                        >
                          <Ionicons name="trash-outline" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <Pressable style={sf.addPairButton} onPress={handleAddAmountAddPair} testID="advance-add-currency">
                    <Ionicons name="add" size={20} color="#0D6EFD" />
                    <Text style={sf.addPairButtonText}>Dodaj walutę</Text>
                  </Pressable>
                  {reasonType === 'product' && Number(productFinalPrice) > 0 && (
                    <Text style={sf.clientTotal}>
                      {`Kwota jaką klient wpłaca łącznie: ${formatMoney(addAmountBalance.paidPln)} zł`}
                    </Text>
                  )}
                  {reasonType === 'product' && Number(productFinalPrice) > 0 && addAmountIsOverpaid && (
                    <View style={sf.remainingSection} testID="advance-change-card">
                      <View style={sf.remainingHeader}>
                        <Ionicons name="return-down-back-outline" size={18} color="#F59E0B" />
                        <Text style={sf.remainingTitle}>{`Reszta do wydania: ${addAmountChangeSuggested || "?"} ${productSaleCurrency}`}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <TextInput
                          testID="advance-change-amount"
                          style={[look.formInput, sf.remainingValue, sf.remainingValueText, { color: '#F59E0B' }]}
                          value={addAmountChangeInput}
                          onChangeText={(value) => setAddAmountChangeOverride({ key: addAmountChangeKey, value: sanitizeAmountInput(value) })}
                          placeholder={addAmountChangeSuggested || "0.00"}
                          placeholderTextColor={tc('muted', '#888')}
                          keyboardType="numeric"
                        />
                        <TouchableOpacity
                          testID="product-currency-select-button"
                          style={[look.selectField, { flex: 1 }]}
                          onPress={() => setProductCurrencyModalVisible(true)}
                        >
                          <Text style={look.selectFieldText}>{productSaleCurrency}</Text>
                          <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
                        </TouchableOpacity>
                      </View>
                      <Text style={sf.remainingHint}>Klient wpłacił więcej niż cena. Wpisz wydaną resztę - zostanie odjęta od wpłat.</Text>
                    </View>
                  )}
                  {reasonType === 'product' && Number(productFinalPrice) > 0 && !addAmountIsOverpaid && (
                    <View style={sf.remainingSection} testID="advance-remaining-card">
                      <View style={sf.remainingHeader}>
                        <Ionicons name="hourglass-outline" size={18} color="#EF4444" />
                        <Text style={sf.remainingTitle}>Do dopłaty przy odbiorze</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={[look.formInput, sf.remainingValue, { justifyContent: 'center' }]}>
                          <Text
                            testID="advance-remaining-amount"
                            style={[sf.remainingValueText, { color: addAmountRemainingInCurrency !== null && addAmountRemainingInCurrency <= 0.005 ? '#10B981' : tc('text', '#fff') }]}
                          >
                            {addAmountRemainingInCurrency === null ? "brak kursu" : formatMoney(addAmountRemainingInCurrency)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          testID="product-currency-select-button"
                          style={[look.selectField, { flex: 1 }]}
                          onPress={() => setProductCurrencyModalVisible(true)}
                        >
                          <Text style={look.selectFieldText}>{productSaleCurrency}</Text>
                          <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
                        </TouchableOpacity>
                      </View>
                      {addAmountBalance.missingRates.length > 0 && (
                        <Text style={sf.remainingHint}>{`Brak kursu: ${addAmountBalance.missingRates.join(", ")} - te wpłaty nie są liczone`}</Text>
                      )}
                    </View>
                  )}
                </View>
              )}
              
              {/* Action buttons */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#10B981',
                    flex: 1,
                    paddingVertical: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                  }}
                  onPress={() => runAdditionOnce(submitAddAmount)}
                  disabled={savingAddition}
                  testID="submit-addition-button"
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', opacity: savingAddition ? 0.6 : 1 }}>
                    {savingAddition ? 'Zapisuję…' : (isEditingAddAmount ? (reasonType === 'other' ? 'Aktualizuj' : 'Aktualizuj kwotę') : 'Dopisz kwotę')}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{
                    backgroundColor: tc('surface2', '#2a2a3e'),
                    borderWidth: 1,
                    borderColor: tc('border', '#334155'),
                    flex: 1,
                    paddingVertical: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                  }}
                  onPress={() => {
                    resetAddAmountForm();
                  }}
                >
                  <Text style={{ color: tc('text', '#fff'), fontSize: 16, fontWeight: 'bold' }}>
                    Anuluj
                  </Text>
                </TouchableOpacity>
              </View>
              </ScrollView>
            </View>
          </View>
          </KeyboardSafeOverlay>
        </Modal>

        {/* Salesperson selection modal */}
        <Modal
          key="salesperson-modal"
          animationType="slide"
          transparent={true}
          visible={salespersonModalVisible}
          onRequestClose={() => setSalespersonModalVisible(false)}
        >
          <View style={styles.salespersonModalOverlay}>
            <View style={styles.salespersonModalContent}>
              <Text style={styles.salespersonModalTitle}>Wybierz sprzedawców</Text>
              <Text style={{ color: tc('muted', '#a1a1aa'), textAlign: 'center', fontSize: 14, marginBottom: 15 }}>
                Możesz wybrać wielu sprzedawców dla tego stanowiska
              </Text>
              
              <ScrollView style={{ maxHeight: 400, width: '100%', marginVertical: 15 }}>
                {employees.length > 0 ? (
                  employees.map((employee) => {
                    const isSelected = selectedSalespeople.find(person => person._id === employee._id);
                    const isAlreadyAssigned = assignedSalespeople?.find(person => person?._id === employee._id);
                    
                    return (
                      <TouchableOpacity
                        key={employee._id}
                        style={[
                          styles.salespersonOptionButton,
                          isSelected && { borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.15)' },
                          isAlreadyAssigned && { opacity: 0.5 },
                        ]}
                        onPress={() => {
                          if (!isAlreadyAssigned) {
                            toggleSalespersonSelection(employee);
                          }
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.salespersonOptionText}>
                              {employee.firstName} {employee.lastName}
                            </Text>
                            {employee.employeeId && (
                              <Text style={[styles.salespersonOptionText, { fontSize: 12, opacity: 0.8 }]}>
                                ID: {employee.employeeId}
                              </Text>
                            )}
                          </View>
                          
                          <View style={{
                            width: 26,
                            height: 26,
                            borderRadius: 13,
                            borderWidth: 2,
                            borderColor: isSelected ? '#10B981' : tc('border', '#475569'),
                            backgroundColor: isSelected ? '#10B981' : 'transparent',
                            justifyContent: 'center',
                            alignItems: 'center'
                          }}>
                            {isSelected && <Ionicons name="checkmark" size={18} color="#fff" />}
                          </View>
                          
                          {isAlreadyAssigned && (
                            <Text style={{
                              color: tc('muted', '#94A3B8'),
                              fontSize: 12,
                              fontWeight: 'bold',
                              marginLeft: 8,
                              backgroundColor: tc('surface3', 'rgba(255,255,255,0.08)'),
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 10
                            }}>
                              Przypisany
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={{ padding: 20 }}>
                    <Text style={{ color: tc('text', 'white'), textAlign: 'center', fontSize: 16 }}>
                      Brak dostępnych pracowników
                    </Text>
                    <Text style={{ color: tc('muted', '#a1a1aa'), textAlign: 'center', fontSize: 14, marginTop: 5 }}>
                      Dodaj pracowników w panelu administracyjnym
                    </Text>
                  </View>
                )}
              </ScrollView>

              <View style={[styles.salespersonModalButtonContainer, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#10b981',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    flex: 1,
                    marginRight: 8,
                    alignItems: 'center'
                  }}
                  onPress={() => {
                    if (selectedSalespeople.length > 0) {
                      assignSelectedSalespeople();
                    }
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                    Dodaj ({selectedSalespeople.length})
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{
                    backgroundColor: tc('surface2', '#2a2a3e'),
                    borderWidth: 1,
                    borderColor: tc('border', '#334155'),
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    flex: 1,
                    marginLeft: 8,
                    alignItems: 'center'
                  }}
                  onPress={() => {
                    setSalespersonModalVisible(false);
                    setSelectedSalespeople([]);
                  }}
                >
                  <Text style={{ color: tc('text', '#fff'), fontSize: 16, fontWeight: 'bold' }}>Anuluj</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Work Hours Modal */}
        <Modal
          key="work-hours-modal"
          animationType="slide"
          transparent={true}
          visible={workHoursModalVisible}
          onRequestClose={() => closeWorkHoursModal()}
        >
          <KeyboardSafeOverlay>
          <View style={styles.workHoursModalOverlay}>
            <View style={styles.workHoursModalContent}>
              <ModalHeader icon="time" color="#0EA5E9" title="Ustaw godziny pracy" />
              <View style={styles.workHoursPersonCard}>
                <Ionicons name="person-circle" size={36} color="#0EA5E9" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  {selectedEmployeeForHours && (
                    <Text style={styles.workHoursEmployeeName}>
                      {selectedEmployeeForHours.firstName} {selectedEmployeeForHours.lastName}
                    </Text>
                  )}
                  <Text style={styles.workHoursDateText}>
                    {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                </View>
              </View>

              <View style={styles.workHoursTimeContainer}>
                <View style={styles.workHoursTimeSection}>
                  <Text style={styles.formLabel}>Rozpoczęcie</Text>
                  <TouchableOpacity
                    style={styles.timeField}
                    onPress={() => {
                      const [h, m] = workStartTime.split(':');
                      setTempHour(parseInt(h));
                      setTempMinute(parseInt(m));
                      setShowStartTimePicker(true);
                    }}
                  >
                    <Ionicons name="time-outline" size={20} color={tc('muted', '#94A3B8')} />
                    <Text style={styles.timeFieldText}>
                      {workStartTime}
                    </Text>
                  </TouchableOpacity>
                  {showStartTimePicker && (
                    <Modal transparent visible={showStartTimePicker} animationType="fade">
                      <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { width: 320, alignItems: 'stretch' }]}>
                          <ModalHeader icon="time-outline" color="#0EA5E9" title="Wybierz godzinę rozpoczęcia" />
                          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                            <View style={{ alignItems: 'center' }}>
                              <TouchableOpacity onPress={() => setTempHour((tempHour + 1) % 24)} style={styles.timeStepButton}>
                                <Ionicons name="chevron-up" size={26} color={tc('text', '#fff')} />
                              </TouchableOpacity>
                              <Text style={{ color: tc('text', 'white'), fontSize: 32, fontWeight: 'bold', minWidth: 60, textAlign: 'center' }}>
                                {tempHour.toString().padStart(2, '0')}
                              </Text>
                              <TouchableOpacity onPress={() => setTempHour((tempHour - 1 + 24) % 24)} style={styles.timeStepButton}>
                                <Ionicons name="chevron-down" size={26} color={tc('text', '#fff')} />
                              </TouchableOpacity>
                            </View>
                            <Text style={{ color: tc('text', 'white'), fontSize: 32, fontWeight: 'bold', marginHorizontal: 10 }}>:</Text>
                            <View style={{ alignItems: 'center' }}>
                              <TouchableOpacity onPress={() => setTempMinute((tempMinute + 1) % 60)} style={styles.timeStepButton}>
                                <Ionicons name="chevron-up" size={26} color={tc('text', '#fff')} />
                              </TouchableOpacity>
                              <Text style={{ color: tc('text', 'white'), fontSize: 32, fontWeight: 'bold', minWidth: 60, textAlign: 'center' }}>
                                {tempMinute.toString().padStart(2, '0')}
                              </Text>
                              <TouchableOpacity onPress={() => setTempMinute((tempMinute - 1 + 60) % 60)} style={styles.timeStepButton}>
                                <Ionicons name="chevron-down" size={26} color={tc('text', '#fff')} />
                              </TouchableOpacity>
                            </View>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <TouchableOpacity
                              onPress={() => setShowStartTimePicker(false)}
                              style={{ backgroundColor: tc('surface2', '#2a2a3e'), borderWidth: 1, borderColor: tc('border', '#334155'), padding: 14, borderRadius: 12, flex: 1, marginRight: 8 }}
                            >
                              <Text style={{ color: tc('text', '#fff'), textAlign: 'center', fontWeight: 'bold', fontSize: 16 }}>Anuluj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                setWorkStartTime(`${tempHour.toString().padStart(2, '0')}:${tempMinute.toString().padStart(2, '0')}`);
                                setShowStartTimePicker(false);
                              }}
                              style={{ backgroundColor: '#0D6EFD', padding: 14, borderRadius: 12, flex: 1, marginLeft: 8 }}
                            >
                              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: 'bold', fontSize: 16 }}>OK</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </Modal>
                  )}
                </View>

                <View style={styles.workHoursTimeSection}>
                  <Text style={styles.formLabel}>Zakończenie</Text>
                  <TouchableOpacity
                    style={styles.timeField}
                    onPress={() => {
                      const [h, m] = workEndTime.split(':');
                      setTempHour(parseInt(h));
                      setTempMinute(parseInt(m));
                      setShowEndTimePicker(true);
                    }}
                  >
                    <Ionicons name="time-outline" size={20} color={tc('muted', '#94A3B8')} />
                    <Text style={styles.timeFieldText}>
                      {workEndTime}
                    </Text>
                  </TouchableOpacity>
                  {showEndTimePicker && (
                    <Modal transparent visible={showEndTimePicker} animationType="fade">
                      <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { width: 320, alignItems: 'stretch' }]}>
                          <ModalHeader icon="time-outline" color="#0EA5E9" title="Wybierz godzinę zakończenia" />
                          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                            <View style={{ alignItems: 'center' }}>
                              <TouchableOpacity onPress={() => setTempHour((tempHour + 1) % 24)} style={styles.timeStepButton}>
                                <Ionicons name="chevron-up" size={26} color={tc('text', '#fff')} />
                              </TouchableOpacity>
                              <Text style={{ color: tc('text', 'white'), fontSize: 32, fontWeight: 'bold', minWidth: 60, textAlign: 'center' }}>
                                {tempHour.toString().padStart(2, '0')}
                              </Text>
                              <TouchableOpacity onPress={() => setTempHour((tempHour - 1 + 24) % 24)} style={styles.timeStepButton}>
                                <Ionicons name="chevron-down" size={26} color={tc('text', '#fff')} />
                              </TouchableOpacity>
                            </View>
                            <Text style={{ color: tc('text', 'white'), fontSize: 32, fontWeight: 'bold', marginHorizontal: 10 }}>:</Text>
                            <View style={{ alignItems: 'center' }}>
                              <TouchableOpacity onPress={() => setTempMinute((tempMinute + 1) % 60)} style={styles.timeStepButton}>
                                <Ionicons name="chevron-up" size={26} color={tc('text', '#fff')} />
                              </TouchableOpacity>
                              <Text style={{ color: tc('text', 'white'), fontSize: 32, fontWeight: 'bold', minWidth: 60, textAlign: 'center' }}>
                                {tempMinute.toString().padStart(2, '0')}
                              </Text>
                              <TouchableOpacity onPress={() => setTempMinute((tempMinute - 1 + 60) % 60)} style={styles.timeStepButton}>
                                <Ionicons name="chevron-down" size={26} color={tc('text', '#fff')} />
                              </TouchableOpacity>
                            </View>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <TouchableOpacity
                              onPress={() => setShowEndTimePicker(false)}
                              style={{ backgroundColor: tc('surface2', '#2a2a3e'), borderWidth: 1, borderColor: tc('border', '#334155'), padding: 14, borderRadius: 12, flex: 1, marginRight: 8 }}
                            >
                              <Text style={{ color: tc('text', '#fff'), textAlign: 'center', fontWeight: 'bold', fontSize: 16 }}>Anuluj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                setWorkEndTime(`${tempHour.toString().padStart(2, '0')}:${tempMinute.toString().padStart(2, '0')}`);
                                setShowEndTimePicker(false);
                              }}
                              style={{ backgroundColor: '#0D6EFD', padding: 14, borderRadius: 12, flex: 1, marginLeft: 8 }}
                            >
                              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: 'bold', fontSize: 16 }}>OK</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </Modal>
                  )}
                </View>
              </View>

              {/* Work hours calculation preview */}
              {(() => {
                const start = workStartTime.split(':');
                const end = workEndTime.split(':');
                const startMinutes = parseInt(start[0]) * 60 + parseInt(start[1]);
                const endMinutes = parseInt(end[0]) * 60 + parseInt(end[1]);
                const totalMinutes = endMinutes > startMinutes ? endMinutes - startMinutes : 0;
                const totalHours = totalMinutes / 60;

                return (
                  <View style={styles.workHoursPreview}>
                    <DaySummaryRow icon="hourglass-outline" color="#0EA5E9" label="Łączny czas pracy" totals={{ 'godz.': totalHours }} last />
                  </View>
                );
              })()}

              <View style={styles.workHoursNotesContainer}>
                <Text style={styles.formLabel}>Notatki (opcjonalne)</Text>
                <TextInput
                  scrollEnabled={false}
                  style={[styles.formInput, { minHeight: 70, textAlignVertical: 'top' }]}
                  value={workNotes}
                  onChangeText={setWorkNotes}
                  placeholder="Dodaj notatki dotyczące pracy..."
                  placeholderTextColor={tc('muted', "#9ca3af")}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.workHoursModalButtonContainer}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: '#0D6EFD',
                    paddingVertical: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                  }}
                  onPress={saveWorkHours}
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                    Zapisz
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: tc('surface2', '#2a2a3e'),
                    borderWidth: 1,
                    borderColor: tc('border', '#334155'),
                    paddingVertical: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                  }}
                  onPress={() => {
                    closeWorkHoursModal();
                  }}
                >
                  <Text style={{ color: tc('text', '#fff'), fontSize: 16, fontWeight: 'bold' }}>
                    Anuluj
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          </KeyboardSafeOverlay>
        </Modal>

        {/* Success Modal */}
        <MessageModal
          visible={successModalVisible}
          onClose={() => setSuccessModalVisible(false)}
          type="success"
          title="Gotowe"
          message={successMessage}
        />

        {/* Error Modal */}
        <MessageModal
          visible={errorModalVisible}
          onClose={() => setErrorModalVisible(false)}
          type="error"
          title="Błąd"
          message={errorMessage}
        />

        {/* Delete Confirmation Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={confirmDeleteModalVisible}
          onRequestClose={() => setConfirmDeleteModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { width: '80%' }]}>
              <Text style={styles.modalTitle}>Potwierdzenie usunięcia</Text>
              <Text style={[styles.modalSubtitle, { marginBottom: 25, textAlign: 'center', lineHeight: 22 }]}>
                {deleteConfirmMessage}
              </Text>
              
              <View style={{ width: '100%', alignItems: 'center', gap: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: tc('surface2', '#2a2a3e'),
                    borderWidth: 1,
                    borderColor: tc('border', '#334155'),
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    flex: 1,
                    marginRight: 8,
                    alignItems: 'center'
                  }}
                  onPress={() => setConfirmDeleteModalVisible(false)}
                >
                  <Text style={{ color: tc('text', '#fff'), fontSize: 16, fontWeight: 'bold' }}>Anuluj</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{
                    backgroundColor: '#dc3545',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    flex: 1,
                    marginLeft: 8,
                    alignItems: 'center'
                  }}
                  onPress={handleDeleteConfirm}
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>✓ Usuń</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Remove Employee Modal */}
        <Modal
          transparent={true}
          visible={removeEmployeeModalVisible}
          animationType="fade"
          onRequestClose={cancelRemoveEmployee}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { width: '80%' }]}>
              <Text style={styles.modalTitle}>Usunąć sprzedawcę z zespołu?</Text>

              {(() => {
                // Dzisiejsze godziny tego sprzedawcy w punkcie (od nich zależą dniówka i prowizja)
                const removeId = employeeToRemove?._id;
                const hours = (todaysWorkHours || []).filter((wh) => String(wh.employeeId?._id || wh.employeeId) === String(removeId));
                const hasHours = hours.length > 0;
                const buttonBase = { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, width: '100%', alignItems: 'center' };
                return (
                  <>
                    <Text style={[styles.modalSubtitle, { marginBottom: 18, textAlign: 'center', lineHeight: 22 }]}>
                      <Text style={{ fontWeight: 'bold', color: '#0D6EFD' }}>
                        {employeeToRemove?.firstName} {employeeToRemove?.lastName}
                      </Text>
                      {hasHours
                        ? `\nma dziś wpisane godziny ${hours.map((wh) => `${wh.startTime}–${wh.endTime}`).join(', ')}.\nCo zrobić z jego dniówką i prowizją?`
                        : '\nnie ma dziś wpisanych godzin pracy.'}
                    </Text>

                    <View style={{ width: '100%', gap: 10 }}>
                      <TouchableOpacity
                        testID="remove-employee-keep-hours"
                        style={[buttonBase, { backgroundColor: '#0D6EFD' }]}
                        onPress={() => handleRemoveEmployee(false)}
                      >
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                          {hasHours ? 'Usuń z listy, zachowaj godziny' : 'Usuń z listy'}
                        </Text>
                        {hasHours && (
                          <Text style={{ color: '#fff', fontSize: 12, marginTop: 2, opacity: 0.85 }}>dniówka i prowizja zostają w wypłacie</Text>
                        )}
                      </TouchableOpacity>

                      {hasHours && (
                        <TouchableOpacity
                          testID="remove-employee-delete-hours"
                          style={[buttonBase, { backgroundColor: '#dc3545' }]}
                          onPress={() => handleRemoveEmployee(true)}
                        >
                          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Usuń razem z godzinami</Text>
                          <Text style={{ color: '#fff', fontSize: 12, marginTop: 2, opacity: 0.85 }}>dziś nie pracował - dniówka i prowizja z dziś znikną</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={[buttonBase, { backgroundColor: tc('surface2', '#2a2a3e'), borderWidth: 1, borderColor: tc('border', '#334155') }]}
                        onPress={cancelRemoveEmployee}
                      >
                        <Text style={{ color: tc('text', '#fff'), fontSize: 16, fontWeight: 'bold' }}>Anuluj</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>

        {/* Add Amount Currency Selection Modal */}
        <CurrencyPickerModal
          visible={addAmountCurrencyModalVisible}
          onClose={() => setAddAmountCurrencyModalVisible(false)}
          onSelect={selectCurrencyForAddAmount}
          options={currencyOptions}
          selected={addAmountCurrency}
          title="Wybierz walutę"
          subtitle="Waluta dopisanej kwoty"
          color="#10B981"
        />

        {/* Deduction Currency Selection Modal */}
        <CurrencyPickerModal
          visible={deductionCurrencyModalVisible}
          onClose={() => setDeductionCurrencyModalVisible(false)}
          onSelect={selectCurrencyForDeduction}
          options={availableCurrencies}
          selected={deductionCurrency}
          title="Wybierz walutę"
          subtitle="Waluta odpisanej kwoty"
          color="#DC3545"
        />

        {/* Product Currency Selection Modal */}
        <CurrencyPickerModal
          visible={productCurrencyModalVisible}
          onClose={() => setProductCurrencyModalVisible(false)}
          onSelect={selectProductCurrency}
          options={currencyOptions}
          selected={productSaleCurrency}
          title="Wybierz walutę dla klienta"
          color="#10B981"
          testID="product-currency-flatlist"
          optionTestID={(code) => `product-currency-option-${code}`}
          closeTestID="product-currency-close-button"
        />

        {/* Currency Rate Edit Modal */}
        <Modal
          transparent={true}
          animationType="slide"
          visible={currencyRateModalVisible}
          onRequestClose={cancelEditingRate}
        >
          <KeyboardSafeOverlay>
          <TouchableWithoutFeedback onPress={cancelEditingRate}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.modalContent, { width: '85%' }]}>
                  <Text style={styles.modalTitle}>
                    Edytuj kurs {editingCurrencyRate}
                  </Text>
                  
                  <Text style={{
                    color: tc('muted', '#ccc'),
                    fontSize: 13,
                    textAlign: 'center',
                    marginBottom: 20,
                    lineHeight: 18
                  }}>
                    Wprowadź kurs {editingCurrencyRate} w złotych.{'\n'}
                    Przykład: 1 {editingCurrencyRate} = X PLN
                  </Text>
                  
                  <View style={{
                    width: '100%',
                    marginBottom: 20
                  }}>
                    <Text style={{
                      color: tc('text', '#fff'),
                      fontSize: 14,
                      marginBottom: 8,
                      textAlign: 'center'
                    }}>
                      Kurs 1 {editingCurrencyRate} =
                    </Text>
                    
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10
                    }}>
                      <TextInput
                        style={{
                          backgroundColor: tc('surface', '#1a1a1a'),
                          borderRadius: 8,
                          padding: 12,
                          fontSize: 16,
                          color: tc('text', 'white'),
                          borderWidth: 2,
                          borderColor: '#f39c12',
                          textAlign: 'center',
                          minWidth: 120,
                          maxWidth: 150
                        }}
                        placeholder="0.00"
                        placeholderTextColor={tc('muted', "#666")}
                        value={tempCurrencyRate}
                        onChangeText={setTempCurrencyRate}
                        keyboardType="decimal-pad"
                        selectTextOnFocus={true}
                        autoFocus={true}
                      />
                      <Text style={{
                        color: tc('text', '#fff'),
                        fontSize: 16,
                        fontWeight: 'bold'
                      }}>
                        PLN
                      </Text>
                    </View>
                  </View>
                  
                  {/* Current rate info */}
                  {exchangeRates[editingCurrencyRate] && (
                    <View style={{
                      backgroundColor: tc('surface2', '#333'),
                      padding: 10,
                      borderRadius: 10,
                      marginBottom: 20,
                      width: '100%'
                    }}>
                      <Text style={{
                        color: tc('muted', '#ccc'),
                        fontSize: 12,
                        textAlign: 'center'
                      }}>
                        Aktualny kurs: {exchangeRates[editingCurrencyRate].toFixed(2)} PLN
                      </Text>
                    </View>
                  )}
                  
                  {/* Action buttons */}
                  <View style={{
                    flexDirection: 'row',
                    gap: 15,
                    width: '100%',
                    justifyContent: 'center'
                  }}>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#28a745',
                        paddingVertical: 12,
                        paddingHorizontal: 25,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: 'transparent',
                        minWidth: 100
                      }}
                      onPress={saveCurrencyRate}
                    >
                      <Text style={{
                        color: tc('text', 'white'),
                        fontSize: 14,
                        fontWeight: 'bold',
                        textAlign: 'center'
                      }}>
                        Zapisz
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#6c757d',
                        paddingVertical: 12,
                        paddingHorizontal: 25,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: 'transparent',
                        minWidth: 100
                      }}
                      onPress={cancelEditingRate}
                    >
                      <Text style={{
                        color: tc('text', 'white'),
                        fontSize: 14,
                        fontWeight: 'bold',
                        textAlign: 'center'
                      }}>
                        Anuluj
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
          </KeyboardSafeOverlay>
        </Modal>

        {/* Employee Selection Modal for Deduction */}
        <Modal
          key="deduction-employee-modal"
          animationType="fade"
          transparent={true}
          visible={deductionEmployeeModalVisible}
          onRequestClose={() => setDeductionEmployeeModalVisible(false)}
        >
          <View style={look.modalOverlay}>
            <View style={[look.modalContent, { maxHeight: '80%' }]}>
              <ModalHeader icon="person" color="#DC3545" title="Wybierz pracownika" subtitle="Pracownik, który bierze zaliczkę" />
              <ScrollView style={{ flexGrow: 0 }}>
                {employees.length > 0 ? (
                  employees.map((employee) => (
                    <OptionCard
                      key={employee._id}
                      icon="person-outline"
                      color="#DC3545"
                      label={`${employee.firstName} ${employee.lastName}${employee.employeeId ? ` (ID: ${employee.employeeId})` : ''}`}
                      selected={selectedEmployeeForAdvance?._id === employee._id}
                      onPress={() => {
                        setSelectedEmployeeForAdvance(employee);
                        setDeductionEmployeeModalVisible(false);
                      }}
                    />
                  ))
                ) : (
                  <Text style={look.modalMessage}>Brak dostępnych pracowników</Text>
                )}
              </ScrollView>
              <TouchableOpacity style={[look.neutralButton, { flex: 0, marginTop: 12 }]} onPress={() => setDeductionEmployeeModalVisible(false)}>
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Pan Kazek Confirmation Modal */}
        <Modal
          visible={panKazekModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setPanKazekModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Potwierdzenie</Text>
              <Text style={styles.modalText}>
                Czy chcesz dodać ten produkt do listy "Od Pana Kazka"?
              </Text>
              {selectedItem && (
                <View style={{ marginVertical: 15 }}>
                  <Text style={{ color: tc('text', '#fff'), fontSize: 16, textAlign: 'center' }}>
                    {selectedItem.fullName || selectedItem.name || "Nieznana nazwa"}
                  </Text>
                  <Text style={{ color: tc('text', '#fff'), fontSize: 14, textAlign: 'center', marginTop: 5 }}>
                    Rozmiar: {selectedItem.size || "Nieznany"}
                  </Text>
                  <Text style={{ color: tc('text', '#fff'), fontSize: 14, textAlign: 'center', marginTop: 5 }}>
                    Cena: {(() => {
                      // Use the same logic as in the sales list
                      const payments = [...(selectedItem.cash || []), ...(selectedItem.card || [])]
                        .filter(({ price }) => price !== undefined && price !== null && price !== "" && price !== 0);
                      
                      if (payments.length > 0) {
                        return payments.map(({ price, currency }) => `${price} ${currency}`).join(' + ');
                      }
                      
                      // Fallback logic
                      if (selectedItem.totalPrice) return selectedItem.totalPrice;
                      if (selectedItem.price) return selectedItem.price;
                      return "0";
                    })()} PLN
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.optionButton, { backgroundColor: '#28a745' }]}
                onPress={confirmPanKazekTransfer}
              >
                <Text style={styles.optionText}>Tak, dodaj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionButton, styles.closeButton]}
                onPress={() => setPanKazekModalVisible(false)}
              >
                <Text style={styles.closeText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* QR Scanner Modal for Product Selection */}
        <Modal
          transparent={true}
          visible={qrScannerVisible}
          animationType="slide"
          onRequestClose={() => {
            setQrScannerVisible(false);
            setScanned(false);
          }}
        >
          <View style={{ flex: 1, backgroundColor: tc('bg', 'black') }}>
            {/* Skaner jak w całej aplikacji (components/scanner/ScanCamera): ramka, „Odczytaj ze zdjęcia”, „Wpisz kod” */}
            <ScanCamera
              enabled={qrScannerVisible && !scanned}
              onScanned={handleBarcodeScanned}
              resolveName={(code) => {
                const product = stateData?.find((item) => item.barcode === code);
                return product ? `${product.fullName} ${product.size}` : null;
              }}
            >
              <TouchableOpacity
                style={[look.neutralButton, { position: 'absolute', top: Math.max(16, insets.top + 8), right: 16, flex: 0, width: 44, height: 44, paddingVertical: 0, paddingHorizontal: 0, borderRadius: 12 }]}
                accessibilityLabel="Zamknij skaner"
                onPress={() => {
                  setQrScannerVisible(false);
                  setScanned(false);
                  setProductScanned(false); // Reset when user cancels scanning
                  // Ensure goods are loaded for product selection after canceling scanner
                  if (!goods || goods.length === 0) {
                    fetchGoods();
                  }
                }}
              >
                <Ionicons name="close" size={24} color={tc('text', '#fff')} />
              </TouchableOpacity>
            </ScanCamera>
          </View>
        </Modal>

        {/* Currency Rates Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={currencyRatesModalVisible}
          onRequestClose={() => setCurrencyRatesModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { alignItems: 'stretch' }]}>
              <ModalHeader icon="trending-up" color="#0EA5E9" title="Aktualne kursy walut" />

              {loadingCurrencyRates ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: tc('text', 'white') }}>Ładowanie...</Text>
                </View>
              ) : currencyRates.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: tc('text', 'white'), marginBottom: 15 }}>Brak dostępnych kursów walut</Text>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#0D6EFD',
                      paddingVertical: 14,
                      paddingHorizontal: 20,
                      borderRadius: 12,
                    }}
                    onPress={fetchCurrencyRates}
                  >
                    <Text style={{ color: 'white', fontWeight: 'bold' }}>Pobierz kursy</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 400 }}>
                  <View style={{
                    flexDirection: 'row',
                    backgroundColor: tc('surface2', '#374151'),
                    borderWidth: 1,
                    borderColor: tc('border', '#334155'),
                    padding: 10,
                    borderRadius: 12,
                    marginBottom: 5,
                  }}>
                    <Text style={{ color: tc('text', 'white'), fontWeight: 'bold', flex: 1 }}>Waluta</Text>
                    <Text style={{ color: tc('text', 'white'), fontWeight: 'bold', flex: 1, textAlign: 'right' }}>Kantor</Text>
                    <Text style={{ color: tc('text', 'white'), fontWeight: 'bold', flex: 1, textAlign: 'right' }}>Własny</Text>
                  </View>
                  {currencyRates.map((rate, index) => (
                    <View
                      key={index}
                      style={{
                        flexDirection: 'row',
                        padding: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: tc('border', '#374151'),
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: tc('text', 'white'), fontWeight: 'bold' }}>
                          {rate.currency.code}
                        </Text>
                        <Text style={{ color: tc('muted', '#9ca3af'), fontSize: 12 }}>
                          {rate.currency.name}
                        </Text>
                      </View>
                      <Text style={{ color: tc('text', 'white'), flex: 1, textAlign: 'right' }}>
                        {(rate.kantorBuyRate ?? rate.buyRate).toFixed(4)} PLN
                      </Text>
                      <Text style={{ color: tc('text', 'white'), flex: 1, textAlign: 'right' }}>
                        {/* buyRate z API = kurs do przeliczeń: własny z panelu admina (Tabela walut), brak = kurs kantoru */}
                        {rate.buyRate.toFixed(4)} PLN
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}

              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 20,
                gap: 10,
              }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: '#0D6EFD',
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                  onPress={fetchCurrencyRates}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Odśwież</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: tc('surface2', '#2a2a3e'),
                    borderWidth: 1,
                    borderColor: tc('border', '#334155'),
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                  onPress={() => setCurrencyRatesModalVisible(false)}
                >
                  <Text style={{ color: tc('text', '#fff'), fontWeight: 'bold', fontSize: 16 }}>Zamknij</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Currency Calculator Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={calculatorModalVisible}
          onRequestClose={() => setCalculatorModalVisible(false)}
        >
          <KeyboardSafeOverlay>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { alignItems: 'stretch' }]}>
              <ModalHeader icon="calculator" color="#8B5CF6" title="Kalkulator walut" />

              {loadingCurrencyRates ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: tc('text', 'white') }}>Ładowanie kursów...</Text>
                </View>
              ) : (
                <>
                  {/* Amount Input */}
                  <View style={{ marginBottom: 15 }}>
                    <Text style={styles.formLabel}>
                      Kwota:
                    </Text>
                    <TextInput
                      style={[styles.formInput]}
                      placeholder="Wprowadź kwotę"
                      placeholderTextColor={tc('muted', "#9ca3af")}
                      keyboardType="decimal-pad"
                      value={calculatorAmount}
                      onChangeText={(value) => setCalculatorAmount(sanitizeAmountInput(value))}
                    />
                  </View>

                  {/* From Currency Picker */}
                  <View style={{ marginBottom: 15 }}>
                    <Text style={styles.formLabel}>
                      Z waluty:
                    </Text>
                    <TouchableOpacity
                      style={styles.selectField}
                      onPress={() => setFromCurrencyModalVisible(true)}
                    >
                      <Text style={styles.selectFieldText}>
                        {calculatorFromCurrency === 'PLN' 
                          ? 'PLN - Polski złoty'
                          : `${calculatorFromCurrency} - ${currencyRates.find(r => r.currency.code === calculatorFromCurrency)?.currency.name || calculatorFromCurrency}`
                        }
                      </Text>
                      <Ionicons name="chevron-down" size={20} color={tc('muted', '#94A3B8')} />
                    </TouchableOpacity>
                  </View>

                  {/* Swap Button */}
                  <View style={{ alignItems: 'center', marginBottom: 15 }}>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#0D6EFD',
                        width: 50,
                        height: 50,
                        borderRadius: 25,
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderWidth: 2,
                        borderColor: 'transparent',
                      }}
                      onPress={swapCurrencies}
                    >
                      <Ionicons name="swap-vertical" size={26} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  {/* To Currency Picker */}
                  <View style={{ marginBottom: 15 }}>
                    <Text style={styles.formLabel}>
                      Na walutę:
                    </Text>
                    <TouchableOpacity
                      style={styles.selectField}
                      onPress={() => setToCurrencyModalVisible(true)}
                    >
                      <Text style={styles.selectFieldText}>
                        {calculatorToCurrency === 'PLN' 
                          ? 'PLN - Polski złoty'
                          : `${calculatorToCurrency} - ${currencyRates.find(r => r.currency.code === calculatorToCurrency)?.currency.name || calculatorToCurrency}`
                        }
                      </Text>
                      <Ionicons name="chevron-down" size={20} color={tc('muted', '#94A3B8')} />
                    </TouchableOpacity>
                  </View>

                  {/* Convert Button */}
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#0D6EFD',
                      paddingVertical: 14,
                      borderRadius: 12,
                      alignItems: 'center',
                      marginBottom: 15,
                    }}
                    onPress={convertCurrency}
                  >
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                      Przelicz
                    </Text>
                  </TouchableOpacity>

                  {/* Result Display */}
                  {calculatorResult !== null && (
                    <View style={{
                      backgroundColor: tc('surface2', '#374151'),
                      borderWidth: 1,
                      borderColor: tc('border', '#334155'),
                      padding: 15,
                      borderRadius: 12,
                      marginBottom: 15,
                      alignItems: 'center',
                    }}>
                      <Text style={{ color: tc('muted', '#9ca3af'), fontSize: 14, marginBottom: 5 }}>
                        Wynik:
                      </Text>
                      <Text style={{ color: tc('text', 'white'), fontSize: 24, fontWeight: 'bold' }}>
                        {calculatorResult} {calculatorToCurrency}
                      </Text>
                    </View>
                  )}
                </>
              )}

              {/* Close Button */}
              <TouchableOpacity
                style={{
                  backgroundColor: tc('surface2', '#2a2a3e'),
                    borderWidth: 1,
                    borderColor: tc('border', '#334155'),
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                }}
                onPress={() => {
                  setCalculatorModalVisible(false);
                  setCalculatorAmount("");
                  setCalculatorResult(null);
                }}
              >
                <Text style={{ color: tc('text', '#fff'), fontWeight: 'bold', fontSize: 16 }}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
          </KeyboardSafeOverlay>
        </Modal>

        {/* From Currency Selection Modal */}
        <CurrencyPickerModal
          visible={fromCurrencyModalVisible}
          onClose={() => setFromCurrencyModalVisible(false)}
          onSelect={(code) => {
            setCalculatorFromCurrency(code);
            setFromCurrencyModalVisible(false);
            setCalculatorResult(null);
          }}
          options={[{ code: 'PLN', name: 'Polski złoty' }, ...currencyRates.map((rate) => ({ code: rate.currency.code, name: rate.currency.name, buyRate: rate.buyRate }))]}
          selected={calculatorFromCurrency}
          title="Wybierz walutę źródłową"
          color="#8B5CF6"
          closeLabel="Anuluj"
        />

        {/* To Currency Selection Modal */}
        <CurrencyPickerModal
          visible={toCurrencyModalVisible}
          onClose={() => setToCurrencyModalVisible(false)}
          onSelect={(code) => {
            setCalculatorToCurrency(code);
            setToCurrencyModalVisible(false);
            setCalculatorResult(null);
          }}
          options={[{ code: 'PLN', name: 'Polski złoty' }, ...currencyRates.map((rate) => ({ code: rate.currency.code, name: rate.currency.name, buyRate: rate.buyRate }))]}
          selected={calculatorToCurrency}
          title="Wybierz walutę docelową"
          color="#8B5CF6"
          closeLabel="Anuluj"
        />

      </SafeAreaView>
    </>
  );
};

// Zamknięcie dnia: wiersz z sumami w walutach
const formatTotal = (total, signed) => `${signed && total > 0 ? '+' : ''}${Number(total || 0).toFixed(2)}`;
const DaySummaryRow = ({ icon, color, label, totals, signed = false, emptyText = '-', last = false }) => {
  const entries = Object.entries(totals || {});
  return (
    <View style={last ? styles.daySummaryRowLast : styles.daySummaryRow}>
      <View style={[styles.daySummaryIcon, { backgroundColor: `${color}26` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.daySummaryLabel}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        {entries.length === 0 ? (
          <Text style={styles.daySummaryEmpty}>{emptyText}</Text>
        ) : entries.map(([currency, total]) => (
          <Text key={currency} style={[styles.daySummaryValue, total < 0 && { color: '#EF4444' }]}>
            {formatTotal(total, signed)} {currency}
          </Text>
        ))}
      </View>
    </View>
  );
};

// Zamknięcie dnia: wyróżniona suma (gotówka w kasie, terminal, obrót)
const DayTotalTile = ({ icon, color, label, caption, totals, signed = false }) => {
  const entries = Object.entries(totals || {});
  return (
    <View style={[styles.dayTotalTile, { borderColor: `${color}66`, backgroundColor: `${color}14` }]}>
      <View style={[styles.daySummaryIcon, { backgroundColor: `${color}26` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.dayTotalLabel}>{label}</Text>
        <Text style={styles.dayTotalCaption}>{caption}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {(entries.length === 0 ? [['PLN', 0]] : entries).map(([currency, total]) => (
          <Text key={currency} style={[styles.dayTotalValue, { color: total < 0 ? '#EF4444' : color }]}>
            {formatTotal(total, signed)} {currency}
          </Text>
        ))}
      </View>
    </View>
  );
};

// Karta wyboru w okienkach (zamiast małych kółek): ikona, opis, znacznik zaznaczenia
const OptionCard = ({ selected, icon, label, onPress, color = '#0D6EFD', testID }) => (
  <TouchableOpacity
    testID={testID}
    accessibilityRole="radio"
    accessibilityState={{ checked: !!selected }}
    style={[styles.optionCard, selected && { borderColor: color, backgroundColor: `${color}1F` }]}
    onPress={onPress}
  >
    <View style={[styles.optionCardIcon, { backgroundColor: `${color}26` }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <Text style={styles.optionCardLabel}>{label}</Text>
    <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? color : tc('muted', '#94A3B8')} />
  </TouchableOpacity>
);

// Nagłówek okienka jak w panelu admina: kolorowy kafelek z ikoną i tytuł
const ModalHeader = ({ icon, color = '#0D6EFD', title }) => (
  <View style={styles.modalHeader}>
    <View style={[styles.modalHeaderIcon, { backgroundColor: `${color}26` }]}>
      <Ionicons name={icon} size={28} color={color} />
    </View>
    <Text style={styles.modalHeaderTitle}>{title}</Text>
  </View>
);

const styles = createThemedStyles(() => StyleSheet.create({
  // ---- wygląd jak w panelu admina ----
  workHoursPersonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  timeField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingVertical: 14,
  },
  timeFieldText: {
    color: tc('text', '#fff'),
    fontSize: 22,
    fontWeight: 'bold',
  },
  timeStepButton: {
    width: 52,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    marginVertical: 6,
  },
  daySummaryRowLast: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  dayCloseCard: {
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    padding: 16,
    marginTop: 12,
    marginBottom: 20,
  },
  dayCloseHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  daySummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  daySummaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  daySummaryLabel: {
    flex: 1,
    color: tc('text', "#fff"),
    fontSize: 15,
  },
  daySummaryValue: {
    color: tc('text', "#fff"),
    fontSize: 15,
    fontWeight: "600",
  },
  daySummaryEmpty: {
    color: tc('muted', "#94A3B8"),
    fontSize: 13,
    fontStyle: "italic",
  },
  dayTotalTile: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  dayTotalLabel: {
    color: tc('text', "#fff"),
    fontSize: 15,
    fontWeight: "700",
  },
  dayTotalCaption: {
    color: tc('muted', "#94A3B8"),
    fontSize: 12,
    marginTop: 2,
  },
  dayTotalValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  optionCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  optionCardLabel: {
    flex: 1,
    color: tc('text', "#fff"),
    fontSize: 15,
    fontWeight: "600",
  },
  menuCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#161622"),
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  menuCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  menuCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 3,
  },
  menuCardSubtitle: {
    fontSize: 13,
    color: tc('muted', "#94A3B8"),
  },
  modalHeader: {
    alignItems: "center",
    width: '100%',
    marginBottom: 18,
  },
  modalHeaderIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  modalHeaderTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: tc('text', "#fff"),
    textAlign: "center",
  },
  formLabel: {
    color: tc('muted', "#94A3B8"),
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: tc('text', "#fff"),
  },
  selectField: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  selectFieldText: {
    color: tc('text', "#fff"),
    fontSize: 16,
    fontWeight: "600",
    flexShrink: 1,
  },
  screenHeader: {
    alignItems: "center",
    paddingBottom: 16,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  screenHeaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#0D6EFD",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  screenHeaderTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  screenHeaderSubtitle: {
    fontSize: 14,
    color: tc('muted', "#94A3B8"),
    textAlign: "center",
  },
  salespersonCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#161622"),
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    width: '100%',
  },
  salespersonCardActive: {
    borderColor: "#0D6EFD",
    borderLeftWidth: 4,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  iconTileLarge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#0D6EFD",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  fundsCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#161622"),
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    marginVertical: 12,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginTop: 4,
  },
  item: {
    backgroundColor: tc('surface', "#161622"),
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: "100%",
    marginVertical: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderLeftColor: "#0D6EFD", // sprzedaż - niebieski pasek
  },
  itemText: {
    color: tc('text', "white"),
    fontSize: 14, // Standardized font size
    fontWeight: "bold", // Standardized font weight
    textAlign: "left",
    flex: 1,
  },
  transferredItem: {
    backgroundColor: "#0d6efd", // Blue background for transferred items
    padding: 3, // Reduced to match writeoff.jsx
    borderRadius: 5,
    width: "100%",
    marginVertical: 3, // Reduced to match writeoff.jsx
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  receivedItem: {
    backgroundColor: tc('surface', "#161622"),
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: "100%",
    marginVertical: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderLeftColor: "#FACC15", // dopisać na konto - żółty pasek
  },
  itemTextLeft: {
    color: tc('text', "#fff"),
    fontSize: 13,
    fontWeight: "600",
    textAlign: "left",
  },
  processedLabel: { // „Przetworzone” pod pozycją odpisaną w Dobieraniu
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  itemTextRight: {
    color: tc('text', "white"),
    fontSize: 14, // Standardized font size
    fontWeight: "bold", // Standardized font weight
    textAlign: "right",
    flex: 1,
  },
  dotsButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dotsText: {
    color: tc('muted', "#94A3B8"),
    fontSize: 22,
    textAlign: "center",
  },
  receivedItemText: {
    color: tc('text', "#fff"),
    fontSize: 13,
    fontWeight: "600",
    textAlign: "left",
    flex: 1,
  },
  receivedItemTextLeft: {
    color: tc('text', "#fff"),
    fontSize: 13,
    fontWeight: "600",
    textAlign: "left",
    flex: 1,
  },
  receivedItemTextRight: {
    color: tc('text', "#fff"),
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  text: {
    color: tc('text', "white"), // White text for items
    fontSize: 14, // Adjust font size for items
  },
  transferredItemTextLeft: {
    color: tc('text', "white"), // White text for left-aligned content
    fontSize: 13, // Match font size from writeoff.jsx
    fontWeight: "bold", // Bold text for emphasis
    flex: 1, // Allow text to take available space
    textAlign: "left", // Align text to the left
  },
  transferredItemTextRight: {
    color: tc('text', "white"), // White text for right-aligned content
    fontSize: 13, // Match font size from writeoff.jsx
    fontWeight: "bold", // Bold text for emphasis
    textAlign: "right", // Align text to the right
  },
  // Unified modal styles to match writeoff.jsx
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: tc('text', '#ffffff'),
    textAlign: 'center',
    width: '100%',
  },
  modalSubtitle: {
    fontSize: 14,
    color: tc('text', '#e5e7eb'),
    textAlign: 'center',
    marginBottom: 12,
  },
  modalText: {
    fontSize: 16,
    color: tc('text', '#ffffff'),
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  optionButton: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: tc('border', '#2f3340'),
    alignItems: 'center',
    width: '100%',
  },
  optionText: {
    fontSize: 16,
    color: tc('text', '#ffffff'),
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: 'rgba(220, 53, 69, 0.15)',
    borderColor: '#DC3545',
  },
  closeButton: {
    backgroundColor: '#DC3545',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginVertical: 6,
    alignItems: 'center',
    width: '100%',
    marginTop: 16,
  },
  closeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  advanceItem: {
    backgroundColor: tc('surface', "#161622"),
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: "100%",
    marginVertical: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderLeftColor: "#10B981", // zaliczka - zielony pasek
  },
  advanceItemTextLeft: {
    color: tc('text', "#fff"),
    fontSize: 13,
    fontWeight: "600",
    textAlign: "left",
    flex: 1,
  },
  advanceItemTextRight: {
    color: tc('text', "#fff"),
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  deductionItem: {
    backgroundColor: tc('surface', "#161622"),
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: "100%",
    marginVertical: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderLeftColor: "#0D6EFD",
  },
  deductionItemTextLeft: {
    color: tc('text', "#fff"),
    fontSize: 13,
    fontWeight: "600",
    textAlign: "left",
    flex: 1,
  },
  deductionItemTextRight: {
    color: tc('text', "#fff"),
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  // Style identyczne z QRScanner dla modal wyboru symboli
  // Okienko wyboru (punkt, waluta) - te same style co w „Nowa sprzedaż” (QRScanner)
  currencyModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  currencyModalContent: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
  },
  salePointNote: { // „Sprzedano od”: stan kurtki w punkcie
    fontSize: 12,
    marginTop: 2,
    color: tc('muted', '#94A3B8'),
  },
  salePointNoteMissing: {
    color: '#EF4444',
  },
  pointItemCentered: { // lista punktów: nazwa i stan wyśrodkowane
    alignItems: 'center',
  },
  sellerFrame: { // „Sprzedano od”: ramka z podpisem nad listą rozwijaną
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.6)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
  },
  sellerFrameCaption: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  currencyModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: tc('text', '#ffffff'),
    textAlign: 'center',
    marginBottom: 20,
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
    color: tc('text', '#ffffff'),
    fontSize: 16,
    fontWeight: '600',
  },
  currencyModalCloseButton: {
    backgroundColor: tc('surface2', '#2a2a3e'),
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    alignItems: 'center',
  },
  currencyModalCloseButtonText: {
    color: tc('text', '#fff'), // przycisk ma tło motywu (jak w QRScanner), więc i tekst z motywu
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Salesperson modal styles
  salespersonModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  salespersonModalContent: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
  },
  salespersonModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: tc('text', '#ffffff'),
    textAlign: 'center',
    marginBottom: 5,
  },
  salespersonOptionButton: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: tc('border', '#2f3340'),
    alignItems: 'center',
    width: '100%',
  },
  salespersonOptionText: {
    color: tc('text', '#ffffff'),
    fontSize: 16,
    fontWeight: '600',
  },
  salespersonModalButtonContainer: {
    flexDirection: 'row', // Z powrotem poziomo
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    width: '100%',
  },
  salespersonModalButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  salespersonAssignButton: {
    backgroundColor: '#10b981', // Zielony jak w reszcie aplikacji
  },
  salespersonCancelButton: {
    backgroundColor: '#ef4444', // Czerwony dopasowany do aplikacji
  },
  salespersonModalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Work Hours Modal Styles
  workHoursModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  workHoursModalContent: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 20,
    padding: 18,
    width: '90%',
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
  },
  workHoursModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    textAlign: 'center',
    marginBottom: 16,
  },
  workHoursEmployeeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
  },
  workHoursDateText: {
    fontSize: 13,
    color: tc('muted', '#94A3B8'),
    marginTop: 2,
  },
  workHoursTimeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  workHoursTimeSection: {
    flex: 1,
  },
  workHoursTimeLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    marginBottom: 6,
  },
  workHoursTimePickerContainer: {
    backgroundColor: tc('surface', 'black'),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'white',
  },
  workHoursTimeInput: {
    padding: 12,
    fontSize: 16,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    textAlign: 'center',
  },
  workHoursTimePicker: {
    backgroundColor: tc('surface', 'black'),
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'white',
    alignItems: 'center',
  },
  workHoursTimeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
  },
  workHoursPreview: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  workHoursPreviewText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    marginBottom: 4,
  },
  workHoursPreviewTextSmall: {
    fontSize: 12,
    color: tc('text', '#e5e7eb'),
    fontStyle: 'italic',
  },
  workHoursNotesContainer: {
    marginBottom: 16,
  },
  workHoursNotesLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    marginBottom: 6,
  },
  workHoursNotesInput: {
    backgroundColor: tc('surface', 'black'),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'white',
    padding: 12,
    color: tc('text', '#fff'),
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  workHoursModalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  workHoursModalButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'white',
  },
  workHoursSaveButton: {
    backgroundColor: '#007bff',
  },
  workHoursCancelButton: {
    backgroundColor: '#dc3545',
  },
  workHoursModalButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Success Modal Styles
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
    fontSize: 16,
    color: '#e5e7eb',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 10,
  },
  // Error Modal Styles
  errorModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
    color: '#ffffff',
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
    fontSize: 16,
    color: '#e5e7eb',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 10,
  },
  // Confirmation Modal Styles
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModalContent: {
    backgroundColor: tc('bg', '#000000'),
    borderRadius: 15,
    padding: 30,
    width: '85%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffc107',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  warningIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ffc107',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  warningIcon: {
    color: '#000000',
    fontSize: 20,
    fontWeight: 'bold',
  },
  confirmModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: tc('text', '#ffffff'),
    textAlign: 'center',
    marginBottom: 15,
  },
  confirmModalMessage: {
    fontSize: 16,
    color: '#e5e7eb',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 25,
  },
  confirmButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 15,
  },
}));
export default Home; // Export the Home component



