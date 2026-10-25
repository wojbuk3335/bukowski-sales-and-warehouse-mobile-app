import axios from "axios"; // Import axios for HTTP requests
import { useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { FlatList, Image, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { KeyboardSafeScreen } from "../components/KeyboardSafe"; // klawiatura nie zaslania pola tekstowego
import ScanCamera from "../components/scanner/ScanCamera"; // skaner jak w całej aplikacji: ramka, zdjęcie, „Wpisz kod”
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiUrl, API_CONFIG } from "../config/api";
import tokenService from "../services/tokenService"; // Import tokenService
import Logger from "../services/logger"; // Import logger service
import { appAlert } from '../services/appAlert';
import { warsawToday } from '../utils/warsawDay';
import { applyChangeToCash, computePaymentBalance, formatMoney, formatMoneyExact, plnPerUnit, plnToCurrency, roundDownMoney, roundUpMoney } from "../utils/paymentBalance";
import { sanitizeAmountInput } from "../utils/amountInput";
import { sortCurrenciesForPicker } from "../utils/currencyOrder"; // EUR, USD, HUF, CAD na górze listy // przecinek = kropka w polach kwot
import { useSubmitGuard } from "../utils/useSubmitGuard"; // blokada podwójnego kliknięcia przy zapisie // sprzedaż w kilku walutach: ile do dopłaty
import { formatOrderDeposit, isOrderProductMismatch, orderDepositPln, orderMatchScore, orderMismatchMessage, orderProductName, sortPickupOrders } from "../utils/pickupOrders"; // zamówienia do wydania (odbiór/dostawa)
import { listPriceOf, minimumPriceError, regularOrPromoRule, salePriceListForBarcode, salePriceRule, stateItemStoredMinimum } from "../utils/defaultSalePrice"; // domyślna cena i blokada rabatu: cennik punktu / karta produktu
import Ionicons from '@expo/vector-icons/Ionicons';
import { ModalHeader, look } from '../components/AdminLook';
import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
const QRScanner = ({ stateData, user, sizes, colors, goods, stocks, users, bags, wallets, currencyRates, getFilteredSellingPoints, isActive }) => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets(); // Get safe area insets
  const [facing, setFacing] = useState("back");
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [selectedOption, setSelectedOption] = useState(""); // State for Picker selection
  const [barcode, setBarcode] = useState(""); // State for barcode input
  const [cashPriceCurrencyPairs, setCashPriceCurrencyPairs] = useState([{ price: "", currency: "PLN" }]); // State for cash payment
  const [cardPriceCurrencyPairs, setCardPriceCurrencyPairs] = useState([{ price: "", currency: "PLN" }]); // State for carrd payment
  // Sprzedaż w kilku walutach: cena w PLN (z cennika punktu, do poprawienia) i waluta, w której pokazujemy „Do dopłaty”
  const [salePrice, setSalePrice] = useState("");
  const [salePriceMin, setSalePriceMin] = useState(null); // blokada rabatu: najniższa kwota „Klient zapłaci” (null = bez blokady)
  const [salePriceList, setSalePriceList] = useState(null); // pełna cena z cennika - minimum przy płatności kartą
  // Odbiór z wymianą na inny model: { minPrice (wydawanej kurtki), deposit (zaliczka zamówienia w zł) } albo null
  const [pickupExchange, setPickupExchange] = useState(null);
  // Blokada podwójnego kliknięcia „Dodaj” (słaby zasięg = dwie sprzedaże)
  const [savingSale, runSaleOnce] = useSubmitGuard();
  // Jednorazowy numer bieżącej sprzedaży (audyt S12): nadany przy pierwszym „Dodaj”, ten sam przy ponowieniu
  // po zerwanym połączeniu - serwer nie zapisze sprzedaży drugi raz. Nowa sprzedaż / zamknięcie okna = nowy numer.
  const pendingSaleIdRef = useRef(null);
  const [myPriceList, setMyPriceList] = useState(null); // cennik punktu zalogowanego sprzedawcy (null = brak, karta produktu)
  const [remainingCurrency, setRemainingCurrency] = useState("PLN");
  // Ręcznie poprawiona kwota „Do dopłaty” (np. wyliczone 50 EUR, mówimy klientowi 60 EUR).
  // Ważna tylko dla wyliczenia, przy którym ją wpisano (key) - po zmianie wpłat/waluty wraca podpowiedź.
  const [remainingOverride, setRemainingOverride] = useState(null);
  // Reszta, gdy klient dopłaca więcej niż trzeba (np. 200 EUR przy 195,24 EUR): wiersze kwota + waluta, bo resztę
  // można wydać w kilku walutach (część w zł, część w euro). currency "" = jak waluta dopłaty.
  const [changeRows, setChangeRows] = useState([{ price: "", currency: "" }]);
  const [changeDismissed, setChangeDismissed] = useState(false); // krzyżyk: reszty nie wydajemy (sekcja schowana)
  const [mixedCardOverride, setMixedCardOverride] = useState(null); // gotówka i karta: ręcznie wpisana kwota karty
  const [currencyMenuVisible, setCurrencyMenuVisible] = useState(false);
  const [currentCurrencyIndex, setCurrentCurrencyIndex] = useState(null);
  const [currentCurrencyType, setCurrentCurrencyType] = useState(""); // "cash" or "card"
  
  // State dla funkcjonalności odbioru
  const [isPickup, setIsPickup] = useState(false); // Checkbox "Odbiór"
  const [advanceAmount, setAdvanceAmount] = useState(""); // Kwota zaliczki
  const [selectedAdvance, setSelectedAdvance] = useState(null); // Wybrana zaliczka
  const [availableAdvances, setAvailableAdvances] = useState([]); // Lista dostępnych zaliczek
  // Wydanie zamówienia z tego punktu (odbiór/dostawa): lista po zeskanowaniu, wybrane zamówienie = dopłata do zaliczki
  const [pickupOrders, setPickupOrders] = useState([]);
  const [pickupOrdersVisible, setPickupOrdersVisible] = useState(false);
  const [pickupOrdersLoading, setPickupOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [currentProductName, setCurrentProductName] = useState(""); // Nazwa aktualnego produktu
  const [currentProductSize, setCurrentProductSize] = useState(""); // Rozmiar aktualnego produktu
  
  const [sellingPointMenuVisible, setSellingPointMenuVisible] = useState(false); // State for "Sprzedano od" popup
  // Get available currencies from currencyRates
  const availableCurrencies = (() => {
    if (!currencyRates || currencyRates.length === 0) {
      return ["PLN", "EUR", "USD", "HUF", "CAN", "GBP", "ILS"].map(code => ({ code, name: code, buyRate: '-' }));
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
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false); // State for currency modal
  const [currentCurrencyPairIndex, setCurrentCurrencyPairIndex] = useState(null); // Track the index of the pair being edited
  const [cameraActive, setCameraActive] = useState(true); // Zarządzanie aktywnością kamery - rozpoczynamy z aktywną kamerą
  const [cameraVisible, setCameraVisible] = useState(true); // Widoczność kamery
  const [successModalVisible, setSuccessModalVisible] = useState(false); // State for success modal
  const [successMessage, setSuccessMessage] = useState(""); // Message for success modal
  const [errorModalVisible, setErrorModalVisible] = useState(false); // State for error modal
  const [errorMessage, setErrorMessage] = useState(""); // Message for error modal

  const openSellingPointMenu = () => {
    setSellingPointMenuVisible(true);
  };

  const selectSellingPoint = (point) => {
    setSelectedOption(point);
    setSellingPointMenuVisible(false);
  };

  const openSellingPointModal = () => {
    setSellingPointMenuVisible(true);
  };

  const selectSellingPointFromModal = (symbol) => {
    // Punkt bez tej kurtki na stanie: można wybrać, ale najpierw pytanie - w Dobieraniu powstanie korekta (25.10.2026)
    if (barcode && saleStockAt(symbol) === 0) {
      appAlert(
        `Brak na stanie w punkcie ${symbol}`,
        `W punkcie ${symbol} nie ma tej kurtki na stanie. Jeśli sprzedaż zostanie zapisana z tego punktu, po przetworzeniu w Dobieraniu powstanie korekta (brak). Wybrać mimo to?`,
        [
          { text: "Anuluj", style: "cancel" },
          { text: "Wybierz", onPress: () => { setSelectedOption(symbol); setSellingPointMenuVisible(false); } },
        ]
      );
      return;
    }
    setSelectedOption(symbol);
    setSellingPointMenuVisible(false);
  };

  // Ile sztuk z tym kodem leży w danym punkcie (telefon ma stan wszystkich punktów)
  const saleStockAt = (symbol) => (stateData || []).filter((row) => row.symbol === symbol && row.barcode === barcode).length;

  const getMatchingSymbols = (currentBarcode = barcode) => {
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

  // Helper function to build jacket name from barcode segments
  const buildJacketNameFromBarcode = (barcodeData) => {
    try {
      // Check if barcode has four zeros before the last digit (e.g., 0020600100009)
      // But exclude bag patterns (starting with 000)
      const regex = /^(\d{3})(\d{2})(\d{3})0000(\d)$/;
      const match = barcodeData.match(regex);
      
      if (!match) {
        return null; // Not the expected pattern
      }

      const [, stockCode, colorCode, sizeCode] = match;
      
      // Exclude bag patterns (stockCode starting with 000)
      if (stockCode === "000") {
        return null; // This is a bag, not a jacket
      }
      
      // Try to extract arrays from the objects
      const stocksArray = Array.isArray(stocks) ? stocks : (stocks?.data || stocks?.stocks || []);
      const colorsArray = Array.isArray(colors) ? colors : (colors?.data || colors?.colors || []);
      const sizesArray = Array.isArray(sizes) ? sizes : (sizes?.data || sizes?.sizes || []);
      
      // Ensure we have arrays before proceeding
      if (!Array.isArray(stocksArray) || !Array.isArray(colorsArray) || !Array.isArray(sizesArray)) {
        return null;
      }
      
      // Look up stock (Tow_Opis) from first 3 digits
      const stockItem = stocksArray.find(stock => stock.Tow_Kod === stockCode);
      const stockName = stockItem?.Tow_Opis || `Kod_${stockCode}`;
      
      // Look up color (Kol_Opis) from next 2 digits  
      const colorItem = colorsArray.find(color => color.Kol_Kod === colorCode);
      const colorName = colorItem?.Kol_Opis || `Kolor_${colorCode}`;
      
      // Look up size name from next 3 digits
      const sizeItem = sizesArray.find(size => size.Roz_Kod === sizeCode);
      const sizeName = sizeItem?.Roz_Opis || `Rozmiar_${sizeCode}`;
      
      // Build the jacket name with proper fallbacks
      const jacketName = `${stockName || 'Nieznany'} ${colorName || 'Nieznany'} ${sizeName || 'Nieznany'}`;
      
      return jacketName;
    } catch (error) {
      Logger.error("Error building jacket name from barcode:", error);
      return null;
    }
  };

  // Helper function to build bag name from barcode segments
  const buildBagNameFromBarcode = (barcodeData) => {
    try {
      // New format for bags: 000 + kolor + wiersz + wartość_po_kropce + suma kontrolna
      // Pozycje 1-3: 000 (stałe)
      // Pozycje 4-5: Kod koloru  
      // Pozycje 6-9: Numer wiersza (Torebki_Nr)
      // Pozycje 10-12: Wartość po kropce z Torebki_Kod
      // Pozycja 13: Suma kontrolna
      if (barcodeData.length < 13) {
        return null; // Not long enough
      }

      const first3 = barcodeData.substring(0, 3);
      const colorCode = barcodeData.substring(3, 5);
      const rowNumber = barcodeData.substring(5, 9); // Positions 6-9 (4 digits)
      const position6 = barcodeData.substring(5, 6); // Position 6 only
      
      // Check if it starts with 000 and position 6 is not zero
      if (first3 !== "000" || position6 === "0") {
        return null; // Not a bag pattern
      }

      // Convert row number to integer for search
      const rowNumberInt = parseInt(rowNumber, 10);
      
      // Check if row number is valid (greater than 0)
      if (rowNumberInt === 0 || isNaN(rowNumberInt)) {
        return null; // Invalid row number
      }

      // Try to extract arrays from the objects
      const colorsArray = Array.isArray(colors) ? colors : (colors?.data || colors?.colors || []);
      const bagsArray = Array.isArray(bags) ? bags : (bags?.data || bags?.bags || []);
      
      // Ensure we have arrays before proceeding
      if (!Array.isArray(colorsArray) || !Array.isArray(bagsArray)) {
        return null;
      }
      
      // Look up color (Kol_Opis) from positions 4-5
      const colorItem = colorsArray.find(color => color.Kol_Kod === colorCode);
      const colorName = colorItem?.Kol_Opis || `Kolor_${colorCode}`;
      
      // Look up bag name from row number (compare with Torebki_Nr)
      const bagItem = bagsArray.find(bag => parseInt(bag.Torebki_Nr, 10) === rowNumberInt);
      const bagName = bagItem?.Torebki_Kod || `Torebka_${rowNumberInt}`;
      
      // Build the bag name with color
      const fullBagName = `${bagName} ${colorName}`;
      
      return fullBagName;
    } catch (error) {
      Logger.error("Error building bag name from barcode:", error);
      return null;
    }
  };

  // Helper function to build wallet name from barcode segments
  const buildWalletNameFromBarcode = (barcodeData) => {
    try {
      // Wallet format: 13-digit barcode
      // Pozycje 1-3: 000 (stałe)
      // Pozycja 6: 0 (stała)
      // Pozycja 7: ≠0 (nie zero)
      // Pozycje 4-5: Kod koloru
      // Pozycje 7-9: Numer portfela (Portfele_Nr)
      if (barcodeData.length !== 13) {
        return null; // Must be exactly 13 digits
      }

      const first3 = barcodeData.substring(0, 3);
      const colorCode = barcodeData.substring(3, 5);
      const position6 = barcodeData.substring(5, 6); // Position 6
      const position7 = barcodeData.substring(6, 7); // Position 7
      const walletNumber = barcodeData.substring(6, 9); // Positions 7-9 (3 digits)
      
      // Check wallet pattern: 000 + color + 0 + non-zero
      if (first3 !== "000" || position6 !== "0" || position7 === "0") {
        return null; // Not a wallet pattern
      }

      // Convert wallet number to integer for search
      const walletNumberInt = parseInt(walletNumber, 10);
      
      // Check if wallet number is valid (greater than 0)
      if (walletNumberInt === 0 || isNaN(walletNumberInt)) {
        return null; // Invalid wallet number
      }

      // Try to extract arrays from the objects
      const colorsArray = Array.isArray(colors) ? colors : (colors?.data || colors?.colors || []);
      const walletsArray = Array.isArray(wallets) ? wallets : (wallets?.data || wallets?.wallets || []);
      
      // Ensure we have arrays before proceeding
      if (!Array.isArray(colorsArray) || !Array.isArray(walletsArray)) {
        return null;
      }
      
      // Look up color (Kol_Opis) from positions 4-5
      const colorItem = colorsArray.find(color => color.Kol_Kod === colorCode);
      const colorName = colorItem?.Kol_Opis || `Kolor_${colorCode}`;
      
      // Look up wallet name from wallet number (compare with Portfele_Nr)
      const walletItem = walletsArray.find(wallet => parseInt(wallet.Portfele_Nr, 10) === walletNumberInt);
      const walletName = walletItem?.Portfele_Kod || `Portfel_${walletNumberInt}`;
      
      // Build the wallet name with color
      const fullWalletName = `${walletName} ${colorName}`;
      
      return fullWalletName;
    } catch (error) {
      Logger.error("Error building wallet name from barcode:", error);
      return null;
    }
  };

  // Helper function to build remaining products name from barcode segments
  const buildRemainingProductNameFromBarcode = async (barcodeData) => {
    try {
      // Remaining products format: kod ma na pierwszych 3 miejscach zera 000 
      // potem na 6 i 7 dwa zera 00 to znaczy się że jest to kod towaru dla pozostałego asortymentu
      // kolor jest na miejscu 4 i 5, nazwa jest na miejscu 8 i 9
      if (barcodeData.length < 9) {
        return null; // Not long enough
      }

      const first3 = barcodeData.substring(0, 3); // Positions 1-3
      const colorCode = barcodeData.substring(3, 5); // Positions 4-5
      const positions6and7 = barcodeData.substring(5, 7); // Positions 6-7
      const productCode = barcodeData.substring(7, 9); // Positions 8-9
      
      // Check remaining products pattern: 000 + color + 00 + product
      if (first3 !== "000" || positions6and7 !== "00") {
        return null; // Not a remaining products pattern
      }

      // Try to extract arrays from the objects
      const colorsArray = Array.isArray(colors) ? colors : (colors?.data || colors?.colors || []);
      
      // Ensure we have colors array before proceeding
      if (!Array.isArray(colorsArray)) {
        return null;
      }
      
      // Look up color (Kol_Opis) from positions 4-5
      const colorItem = colorsArray.find(color => color.Kol_Kod === colorCode);
      const colorName = colorItem?.Kol_Opis || `Kolor_${colorCode}`;
      
      // Fetch product name from remaining products API using productCode
      try {
        const fullUrl = getApiUrl("/excel/remaining-products/get-all-remaining-products");
        const response = await tokenService.authenticatedFetch(fullUrl);
        const responseData = await response.json();
        
        const remainingProducts = responseData.remainingProducts; // Access the remainingProducts array
        
        // Find product by Poz_Nr matching the productCode (positions 8-9)
        // Convert productCode to number for comparison
        const productCodeNumber = parseInt(productCode, 10);
        
        const productItem = remainingProducts.find(product => 
          product.Poz_Nr && parseInt(product.Poz_Nr, 10) === productCodeNumber
        );
        
        const productName = productItem?.Poz_Kod || `Produkt_${productCode}`;
        
        // Build the remaining product name: Poz_Kod + color
        const fullRemainingProductName = `${productName} ${colorName}`;
        
        return fullRemainingProductName;
      } catch (error) {
        Logger.error("Error fetching remaining products:", error);
        // Fallback if API call fails
        return `Produkt_${productCode} ${colorName}`;
      }
    } catch (error) {
      Logger.error("Error building remaining product name from barcode:", error);
      return null;
    }
  };

  const openCurrencyModal = (index, type) => {
    Keyboard.dismiss(); // po zamknięciu okna fokus nie wraca do pola - klawiatura nie wyskakuje
    setCurrentCurrencyIndex(index);
    setCurrentCurrencyType(type);
    setCurrencyModalVisible(true);
  };

  const selectCurrencyFromModal = (currency) => {
    if (currentCurrencyType === "remaining") {
      setRemainingCurrency(currency);
    } else if (currentCurrencyType === "change") {
      updateChangeRow(currentCurrencyIndex, "currency", currency);
    } else if (currentCurrencyType === "cash") {
      handleCashPairChange(currentCurrencyIndex, "currency", currency);
    } else if (currentCurrencyType === "card") {
      handleCardPairChange(currentCurrencyIndex, "currency", currency);
    }
    setCurrencyModalVisible(false);
  };

  useEffect(() => {
    if (isActive) {
      setCameraActive(true); // Aktywuj kamerę, gdy zakładka jest aktywna
      setCameraVisible(true); // Pokaż kamerę
    } else {
      setCameraActive(false); // Dezaktywuj kamerę, gdy zakładka jest nieaktywna
      setCameraVisible(false); // Ukryj kamerę
    }
  }, [isActive]);

  const handleUnmountCamera = () => {
    setCameraVisible(false); // Ukryj kamerę
    setCameraActive(false); // Dezaktywuj kamerę
  };

  // Cennik punktu zalogowanego sprzedawcy (null = punkt nie ma cennika, cena z karty produktu).
  // Odświeżany przy każdym wejściu na zakładkę, żeby zmiany cen z panelu były od razu widoczne.
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await tokenService.authenticatedFetch(getApiUrl("/pricelists/my"));
        const data = response.ok ? await response.json() : null;
        if (!cancelled) setMyPriceList(Array.isArray(data?.priceList) ? data.priceList : null);
      } catch (error) {
        Logger.error("Error fetching own price list:", error);
        if (!cancelled) setMyPriceList(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isActive]);

  // Domyślna cena (podpowiedź, sprzedawca może ją poprawić): cennik zalogowanego punktu, bez cennika karta produktu.
  // Regularna jest od razu opuszczona o końcówkę (utils/defaultSalePrice), promocyjna wpisuje się bez zmian.
  // Hook musi być PRZED wczesnymi return poniżej (kolejność hooków)
  useEffect(() => {
    const exchangeOrder = selectedOrder && isOrderProductMismatch(selectedOrder, modalMessage) ? selectedOrder : null;
    if (selectedOrder && !exchangeOrder) {
      // Wydanie zamówienia: cena = dopłata do zaliczki, bez blokady rabatu (prowizja była od zaliczki)
      setPickupExchange(null);
      setSalePrice(String(Math.max(0, Number(selectedOrder.remainingPln) || 0)));
      setSalePriceMin(null);
      setSalePriceList(null);
      return;
    }
    if (!exchangeOrder) setPickupExchange(null);
    if (!barcode) {
      setSalePrice("");
      setSalePriceMin(null);
      setSalePriceList(null);
      return;
    }
    let rule = salePriceRule({ barcode, goods, sizes, priceList: myPriceList });
    let listPrice = salePriceListForBarcode({ barcode, goods, sizes, priceList: myPriceList });
    if (!rule) {
      // Kod spoza kart produktów - cena zapisana na stanie punktu „Sprzedano od”
      const matches = (stateData || []).filter((item) => item.barcode === barcode);
      const item = matches.find((entry) => entry.symbol === selectedOption) || matches[0];
      rule = regularOrPromoRule(item?.price, item?.discount_price, item?.category, stateItemStoredMinimum(item, goods));
      listPrice = listPriceOf(item?.price, item?.discount_price);
    }
    if (exchangeOrder) {
      // Wymiana na inny model: cena i minimum wydawanej kurtki pomniejszone o zaliczkę z zamówienia (= dopłata)
      const deposit = orderDepositPln(exchangeOrder);
      setPickupExchange({ minPrice: rule.minPrice, deposit });
      setSalePrice(rule.defaultPrice !== null ? String(Math.max(0, rule.defaultPrice - deposit)) : "");
      setSalePriceMin(rule.minPrice !== null && rule.minPrice !== undefined ? Math.max(0, rule.minPrice - deposit) : null);
      setSalePriceList(null);
      return;
    }
    setSalePrice(rule.defaultPrice !== null ? String(rule.defaultPrice) : "");
    setSalePriceMin(rule.minPrice);
    setSalePriceList(listPrice);
  }, [barcode, selectedOption, stateData, goods, sizes, myPriceList, selectedOrder, modalMessage]);

  // Tryb płatności zapisany w pozycji karty (paymentMode); brak = gotówka
  const priceRuleSale = !isPickup && salePriceList !== null;
  const paymentMode = priceRuleSale ? (cardPriceCurrencyPairs.find((pair) => pair.paymentMode)?.paymentMode ?? "cash") : "cash";
  const cardLocked = priceRuleSale && paymentMode === "cash";
  const cashLocked = priceRuleSale && paymentMode === "card";
  const showCashPayment = !priceRuleSale || paymentMode !== "card";
  const showCardPayment = !priceRuleSale || paymentMode !== "cash";
  // Każda płatność kartą (sama lub z gotówką): bez rabatu, cena i minimum to cena z cennika
  const cardNoDiscount = priceRuleSale && paymentMode !== "cash";
  const effectiveSalePrice = cardNoDiscount ? String(salePriceList) : salePrice;
  const effectiveSaleMin = cardNoDiscount ? salePriceList : salePriceMin;
  // Gotówka i karta: bez rabatu - karta dopłaca to, czego brakuje po gotówce (podpowiedź w górę do grosza).
  // Kwotę można podnieść ręcznie (np. 849.45 → 850 - nadwyżka zostaje u nas, karta nie wydaje reszty),
  // obniżyć poniżej ceny nie - to byłby rabat (blokada minimum).
  const cashOnlyBalance = computePaymentBalance({ price: effectiveSalePrice, payments: cashPriceCurrencyPairs, currencyRates });
  const mixedCardSuggested = paymentMode === "mixed" ? roundUpMoney(Math.max(0, cashOnlyBalance.remainingPln)) : null;
  const mixedCardAmount = mixedCardSuggested === null
    ? null
    : (mixedCardOverride && mixedCardOverride.key === mixedCardSuggested ? mixedCardOverride.value : mixedCardSuggested);
  const effectiveCardPriceCurrencyPairs = cardPriceCurrencyPairs.map((pair, index) => ({
    ...pair,
    currency: "PLN",
    ...(mixedCardAmount !== null && index === 0 && { price: mixedCardAmount }),
  }));
  // Ręczna dopłata i wiersze reszty należą do jednej sprzedaży - czyścimy je przy zmianie sposobu płatności
  // i po zamknięciu okna (Anuluj / zapis), inaczej wracałyby przy następnej kurtce w tej samej cenie
  const resetPaymentExtras = () => {
    setRemainingOverride(null);
    setChangeRows([{ price: "", currency: "" }]);
    setChangeDismissed(false);
    setMixedCardOverride(null);
  };
  useEffect(() => {
    if (!modalVisible) resetPaymentExtras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalVisible]);
  const selectPaymentMode = (mode) => {
    if (mode === paymentMode) return;
    resetPaymentExtras();
    if (mode === "card") {
      setCashPriceCurrencyPairs([{ price: "0", currency: "PLN" }]);
      setCardPriceCurrencyPairs([{ price: String(salePriceList), currency: "PLN", paymentMode: "card" }]);
      return;
    }
    setCashPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
    setCardPriceCurrencyPairs([{ price: "", currency: "PLN", ...(mode === "mixed" && { paymentMode: "mixed" }) }]);
  };

  // Płatność gotówką przy zwykłej sprzedaży: bez domyślnego wiersza wpłaty - kwotę podpowiada „Dopłata”,
  // wiersze walut dodaje się przyciskiem „Dodaj walutę”. W pozostałych trybach zostaje jeden wiersz.
  const cashRowsOptional = priceRuleSale && paymentMode !== "card";
  useEffect(() => {
    // tylko domyślny pusty wiersz - wiersz dodany przyciskiem („added”) zostaje
    const blankOnly = cashPriceCurrencyPairs.length === 1 && !cashPriceCurrencyPairs[0].added && !String(cashPriceCurrencyPairs[0].price || "").trim();
    if (cashRowsOptional && blankOnly) setCashPriceCurrencyPairs([]);
    if (!cashRowsOptional && cashPriceCurrencyPairs.length === 0) setCashPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
  }, [cashRowsOptional, cashPriceCurrencyPairs]);

  // Płatność kartą: kwota zawsze równa cenie z cennika (bez edycji)
  useEffect(() => {
    if (paymentMode === "card") {
      setCashPriceCurrencyPairs([{ price: "0", currency: "PLN" }]);
      setCardPriceCurrencyPairs([{ price: String(salePriceList), currency: "PLN", paymentMode: "card" }]);
    }
  }, [paymentMode, salePriceList]);

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={[styles.message, { marginBottom: 20 }]}>Potrzebujemy Twojej zgody na dostęp do kamery</Text>
        <TouchableOpacity
          style={{
            backgroundColor: "#0d6efd",
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 8,
          }}
          onPress={requestPermission}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>Włącz skanner kodów kreskowych</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!cameraActive || !cameraVisible) {
    // Renderuj widok zastępczy, gdy kamera jest odłączona
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.message}></Text>
        <TouchableOpacity
          style={{
            backgroundColor: "#0d6efd",
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 8,
          }}
          onPress={() => {
            setCameraVisible(true);
            setCameraActive(true);
          }}
        >
          <Text style={{ color: tc('text', "#fff"), fontWeight: "bold", fontSize: 16 }}>Włącz czytnik kodów kreskowych</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Nazwa produktu ze stanu z rozmiarem; backend zwraca "-" dla torebek, portfeli i pozostałego asortymentu
  const formatStateItemName = (item) => {
    const size = String(item?.size || "").trim();
    const hasSize = size && size !== "-" && size !== "Nieznany rozmiar";
    return hasSize ? `${item.fullName} ${size}` : item.fullName;
  };

  // Dynamicznie aktualizuj pole "Sprzedano produkt" podczas wpisywania kodu kreskowego
  // Nazwa produktu dla kodu (stan punktu albo karty produktów); null = kod nie pasuje do bazy kodów.
  // Ta sama logika po zeskanowaniu, w polu kodu formularza i przy ręcznym wpisaniu („Wpisz kod”).
  const resolveProductNameFromBarcode = async (code) => {
    const matchedItems = stateData?.filter(item => item.barcode === code);
    if (matchedItems && matchedItems.length > 0) {
      return formatStateItemName(matchedItems[0]);
    }
    return buildJacketNameFromBarcode(code)
      || buildBagNameFromBarcode(code)
      || buildWalletNameFromBarcode(code)
      || (await buildRemainingProductNameFromBarcode(code))
      || null;
  };

  const handleBarcodeChange = async (newBarcode) => {
    setBarcode(newBarcode);
    
    // Jeśli pole puste - pokaż pusty produkt
    if (!newBarcode || newBarcode.trim() === "") {
      setModalMessage("");
      return;
    }

    const productName = await resolveProductNameFromBarcode(newBarcode);
    setModalMessage(productName || "❌ Nie znaleziono produktu");
  };

  const handleScan = async ({ data, type }) => {
    if (!scanned) {
      setScanned(true);
      
      // Użyj handleBarcodeChange aby dynamicznie aktualizć produkt
      await handleBarcodeChange(data);

      // Ustaw domyślny punkt sprzedaży na zalogowanego użytkownika
      const availableOptions = getMatchingSymbols(data);
      if (availableOptions.length > 0) {
        // Sprawdź czy zalogowany użytkownik jest w tej lokalizacji
        const currentUserInLocation = availableOptions.find(option => option.symbol === user?.symbol);
        if (currentUserInLocation) {
          setSelectedOption(user.symbol); // Zalogowany użytkownik jest w lokalizacji - ustaw jako domyślny
        } else {
          setSelectedOption(availableOptions[0].symbol); // Fallback - pierwszy z listy
        }
      } else {
        setSelectedOption(""); // Brak dostępnych opcji
      }
      
      // Otwórz formularz na cały ekran: kamera się chowa (poniżej), klawiatura zamknięta -
      // wcześniej kamera i klawiatura zajmowały po pół ekranu i formularza nie było widać (iPhone)
      Keyboard.dismiss();
      pendingSaleIdRef.current = null; // nowa sprzedaż - nowy numer przy „Dodaj”
      setModalVisible(true);
    }
  };

  const toggleCameraFacing = () => {
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  };

  const handleAddCashPair = () => {
    setCashPriceCurrencyPairs([...cashPriceCurrencyPairs, { price: "", currency: "PLN", added: true }]);
  };

  const handleRemoveCashPair = (index) => {
    if (cashPriceCurrencyPairs.length > 1 || cashRowsOptional) {
      const updatedPairs = cashPriceCurrencyPairs.filter((_, i) => i !== index);
      setCashPriceCurrencyPairs(updatedPairs);
    }
  };

  // Reszta ceny z cennika po wpłatach (w walucie pozycji), null = brak kursu
  const remainderPrice = (payments, currency) => {
    const { remainingPln, missingRates } = computePaymentBalance({ price: salePriceList, payments, currencyRates });
    const amount = plnToCurrency(Math.max(0, remainingPln), currency || "PLN", currencyRates);
    return missingRates.length > 0 || amount === null ? null : formatMoney(amount);
  };

  const handleCashPairChange = (index, field, value) => {
    const updatedPairs = [...cashPriceCurrencyPairs];
    updatedPairs[index][field] = value;
    setCashPriceCurrencyPairs(updatedPairs);
  };

  // Ile klient zapłacił (gotówka + karta, po kursie do przeliczeń) i ile jeszcze ma dopłacić w wybranej walucie
  const paymentBalance = computePaymentBalance({
    price: effectiveSalePrice,
    payments: [...cashPriceCurrencyPairs, ...effectiveCardPriceCurrencyPairs],
    currencyRates,
  });
  // Nadpłata liczy się z sumy wpłat (gotówka i karta razem); resztę wydaje się z gotówki w kasie
  const overpayBalance = paymentBalance;
  const remainingInCurrency = plnToCurrency(Math.abs(overpayBalance.remainingPln), remainingCurrency, currencyRates);
  // Reszta istnieje tylko, gdy po zaokrągleniu w dół jest co wydać (min. 0.01 w walucie) - nie „Reszta: 0.00”
  const overpaidChange = overpayBalance.remainingPln < 0 && remainingInCurrency !== null ? roundDownMoney(remainingInCurrency) : "0.00";
  const isOverpaid = Number(overpaidChange) >= 0.01;
  // Podpowiedź na korzyść sprzedawcy: dopłata w górę, reszta w dół; nadpłata poniżej grosza = nic do dopłaty
  const remainingSuggested = remainingInCurrency === null
    ? ""
    : (isOverpaid ? overpaidChange : (paymentBalance.remainingPln > 0 ? roundUpMoney(remainingInCurrency) : "0.00"));
  const remainingKey = `${remainingSuggested}|${remainingCurrency}|${isOverpaid}`;
  // Do dopłaty: pole z podpowiedzią (do poprawienia). Reszta: pole puste = reszty nie wydano (do obrotu cała kwota)
  const remainingInput = remainingOverride && remainingOverride.key === remainingKey
    ? remainingOverride.value
    : (isOverpaid ? "" : remainingSuggested);
  const remainingInputNumber = parseFloat(String(remainingInput).replace(",", "."));
  // Ile klient zapłaci łącznie: już wpłacone + kwota z pola „Do dopłaty” (przy reszcie: minus reszta), w zł
  const remainingUnit = plnPerUnit(remainingCurrency, currencyRates);
  // Pole „Klient dopłaca” jest tylko w płatności gotówką - w mieszanej i kartą jego podpowiedź nie może się wliczać
  const remainingInputPln = paymentMode === "cash" && remainingUnit !== null && remainingInputNumber > 0 ? remainingInputNumber * remainingUnit : 0;
  // Dopłata większa niż ta, o którą poprosiliśmy (podpowiedź zaokrąglona w górę): różnica to reszta do wydania.
  // Liczona względem podpowiedzi, nie surowej ceny - ułamek grosza z zaokrąglenia zostaje u sprzedawcy, bez „reszty”.
  const suggestedTopUpPln = !isOverpaid && remainingUnit !== null && remainingSuggested
    ? Number(remainingSuggested) * remainingUnit
    : Math.max(0, paymentBalance.remainingPln);
  const extraPaidPln = !isOverpaid && remainingInputPln > suggestedTopUpPln + 0.005
    ? remainingInputPln - suggestedTopUpPln
    : 0;
  // Reszta do wydania: nadpłata z wierszy „Klient wpłaca” albo dopłata większa niż prośba - jedna sekcja dla obu
  const changeDuePln = isOverpaid ? Math.abs(overpayBalance.remainingPln) : extraPaidPln;
  // Gotówka i karta: reszta tylko z gotówki od klienta (z karty nie ma, ujemnej wpłaty gotówką też nie) -
  // podpowiedź nie przekracza tej gotówki, większa reszta blokuje zapis
  const changeCashCapPln = paymentMode === "mixed" ? cashOnlyBalance.paidPln : Infinity;
  // Sekcja reszty tylko, gdy po zaokrągleniu w dół naprawdę jest co wydać (min. 0.01 w walucie dopłaty)
  const extraInCurrency = plnToCurrency(changeDuePln, remainingCurrency, currencyRates);
  const extraChangeAvailable = changeDuePln > 0 && Number(roundDownMoney(extraInCurrency === null ? changeDuePln : extraInCurrency)) >= 0.01;
  const extraChangeVisible = extraChangeAvailable && !changeDismissed; // schowana = reszty nie wydano, nic nie odejmujemy
  // Wiersze reszty: puste pola (podpowiedź tylko jako blady placeholder) - puste = reszty nie wydano
  const changeRowCurrency = (row) => row.currency || remainingCurrency;
  const changeRowPln = (row) => {
    const unit = plnPerUnit(changeRowCurrency(row), currencyRates);
    const amount = parseFloat(String(row.price || "").replace(",", ".")) || 0;
    return unit !== null && amount > 0 ? amount * unit : 0;
  };
  const changePln = extraChangeVisible ? changeRows.reduce((sum, row) => sum + changeRowPln(row), 0) : 0;
  // Podpowiedzi wierszy sumują się do całej reszty: wpisane kwoty się odejmują, a to, co zostało, podpowiada
  // pierwszy pusty wiersz (kolejne puste: 0.00). Każda w walucie swojego wiersza, po kursie do przeliczeń.
  const typedChangePln = changeRows.reduce((sum, row) => sum + changeRowPln(row), 0);
  const firstEmptyChangeRow = changeRows.findIndex((row) => !(parseFloat(String(row.price || "").replace(",", ".")) > 0));
  const changeRowHint = (index) => {
    const leftPln = index === firstEmptyChangeRow ? Math.max(0, Math.min(changeDuePln, changeCashCapPln) - typedChangePln) : 0;
    const amount = plnToCurrency(leftPln, changeRowCurrency(changeRows[index]), currencyRates);
    return amount === null ? "brak kursu" : roundDownMoney(amount); // reszta w dół
  };
  const updateChangeRow = (index, field, value) => {
    setChangeRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };
  const clientTotalPln = paymentBalance.paidPln + (isOverpaid ? 0 : remainingInputPln) - changePln;
  // Poniżej minimum przez za dużą resztę (klient zapłacił dość, sprzedawca wydał za dużo): maksymalna reszta = wpłaty - minimum
  const paidBeforeChangePln = paymentBalance.paidPln + (isOverpaid ? 0 : remainingInputPln);
  const maxChangePln = Math.max(0, paidBeforeChangePln - (Number(effectiveSaleMin) || 0));
  const changeTooMuch = extraChangeVisible && changePln > maxChangePln + 0.0001 && paidBeforeChangePln >= (Number(effectiveSaleMin) || 0) - 0.0001;
  const changeOverCash = extraChangeVisible && changePln > changeCashCapPln + 0.0001;
  // Kwota, którą sprawdza blokada przy zapisie (gotówka i nadpłata liczą dopłatę, płatność kartą/mieszana nie)
  const amountCheckedPln = paymentMode === "card" ? paymentBalance.paidPln : clientTotalPln;
  const minimumChecked = !isPickup || Boolean(pickupExchange); // zwykła sprzedaż albo wymiana przy odbiorze
  // 0.0001 tylko na błąd zmiennoprzecinkowy - ułamek grosza poniżej minimum też blokuje
  const belowMinimum = minimumChecked && Boolean(effectiveSaleMin) && amountCheckedPln > 0.005 && amountCheckedPln < effectiveSaleMin - 0.0001;
  const minimumTopUpPln = Math.max(0, Number(effectiveSaleMin) - amountCheckedPln);
  // Minimum w walucie płatności: karta - waluta pozycji karty, gotówka/mieszana - waluta dopłaty (cena minus wpłacone)
  const minimumTargetCurrency = paymentMode === "card" ? (cardPriceCurrencyPairs[0]?.currency || "PLN") : remainingCurrency;
  const minimumTargetPln = paymentMode === "card" ? Number(effectiveSaleMin) || 0 : Math.max(0, Number(effectiveSaleMin) - paymentBalance.paidPln);
  const minimumApplies = !isPickup && minimumTargetCurrency !== "PLN" && minimumTargetPln > 0.005 && (paymentMode === "card" || !isOverpaid);
  const minimumInTarget = minimumApplies ? plnToCurrency(minimumTargetPln, minimumTargetCurrency, currencyRates) : null;
  const minimumLabel = paymentMode === "card" ? "Minimalna kwota" : "Minimalna dopłata";
  const minimumTargetText = minimumInTarget === null ? "" : `${minimumLabel}: ${roundUpMoney(minimumInTarget)} ${minimumTargetCurrency}`;
  const minimumNotice = belowMinimum ? (
    <Text testID="minimum-warning" style={{ color: '#EF4444', fontWeight: '600', marginTop: -4, marginBottom: 6 }}>
      {pickupExchange
        ? `Wymiana: minimalna dopłata ${formatMoney(effectiveSaleMin)} zł (minimum kurtki ${pickupExchange.minPrice} zł − zaliczka ${formatMoney(pickupExchange.deposit)} zł), klient dopłaca ${formatMoney(amountCheckedPln)} zł.`
        : `Minimalna cena: ${effectiveSaleMin} zł (klient zapłaci ${formatMoney(amountCheckedPln)} zł).${minimumTargetText ? ` ${minimumTargetText}.` : ""}`}
      <Text testID="minimum-top-up" style={{ color: '#10B981', fontWeight: '700' }}>
        {` Dopłać jeszcze ${roundUpMoney(minimumTopUpPln)} zł, aby osiągnąć minimum.`}
      </Text>
    </Text>
  ) : null; // kwota wystarcza - bez podpowiedzi „Minimalna dopłata” (w walucie widać ją tylko w ostrzeżeniu)
  // Płatność kartą: bez bloku dopłaty i reszty, zostaje tylko ostrzeżenie o minimum
  const remainingVisible = (paymentMode === "cash" || (paymentMode === "mixed" && isOverpaid)) && Number(effectiveSalePrice) > 0;
  const remainingBlock = (!isPickup || selectedOrder) && remainingVisible ? (
    <View style={styles.remainingSection} testID="remaining-card">
      {/* Nadpłata z wierszy „Klient wpłaca”: bez pola dopłaty - od razu sekcja „Reszta do wydania” */}
      {!isOverpaid && (
      <>
      <Text style={styles.salePriceLabel}>Klient dopłaca</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TextInput
          testID="remaining-amount"
          style={[look.formInput, styles.remainingValue, styles.remainingValueText, { color: isOverpaid ? '#F59E0B' : remainingInCurrency !== null && remainingInCurrency <= 0.005 ? '#10B981' : tc('text', '#fff') }]}
          editable={paymentMode === "cash" || (paymentMode === "mixed" && isOverpaid)}
          value={remainingInput}
          onChangeText={(value) => setRemainingOverride({ key: remainingKey, value: sanitizeAmountInput(value) })}
          placeholder={remainingInCurrency === null ? "brak kursu" : "0.00"}
          placeholderTextColor={tc('muted', '#888')}
          keyboardType="numeric"
        />
        <TouchableOpacity
          testID="remaining-currency"
          style={[look.selectField, { flex: 1 }]}
          onPress={() => openCurrencyModal(0, "remaining")}
        >
          <Text style={look.selectFieldText}>{remainingCurrency}</Text>
          <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
        </TouchableOpacity>
      </View>
      </>
      )}
      {extraChangeVisible && (
        <View testID="extra-change" style={styles.changeSection}>
          <View style={[styles.remainingHeader, { justifyContent: "space-between" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="return-down-back-outline" size={18} color="#F59E0B" />
              <Text style={styles.remainingTitle}>Reszta do wydania</Text>
            </View>
            <TouchableOpacity testID="change-dismiss" accessibilityLabel="Nie wydaję reszty" style={{ padding: 4 }} onPress={() => setChangeDismissed(true)}>
              <Ionicons name="close" size={22} color={tc('muted', '#94A3B8')} />
            </TouchableOpacity>
          </View>
          {changeRows.map((row, index) => (
            <View key={`change-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <TextInput
                testID={`change-amount-${index}`}
                style={[look.formInput, styles.remainingValue, styles.remainingValueText, { color: '#F59E0B' }]}
                value={row.price}
                onChangeText={(value) => updateChangeRow(index, "price", sanitizeAmountInput(value))}
                placeholder={changeRowHint(index)}
                placeholderTextColor="rgba(148, 163, 184, 0.35)"
                keyboardType="numeric"
              />
              <TouchableOpacity
                testID={`change-currency-${index}`}
                style={[look.selectField, { flex: 1 }]}
                onPress={() => openCurrencyModal(index, "change")}
              >
                <Text style={look.selectFieldText}>{changeRowCurrency(row)}</Text>
                <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
              </TouchableOpacity>
              {index > 0 && (
                <TouchableOpacity
                  accessibilityLabel="Usuń walutę reszty"
                  style={styles.removeTile}
                  onPress={() => setChangeRows((rows) => rows.filter((_, i) => i !== index))}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <Pressable testID="change-add-currency" style={styles.addPairButton} onPress={() => setChangeRows((rows) => [...rows, { price: "", currency: "PLN" }])}>
            <Ionicons name="add" size={20} color="#0D6EFD" />
            <Text style={styles.addPairButtonText}>Dodaj walutę</Text>
          </Pressable>
        </View>
      )}
      {changeOverCash && (
        <Text testID="change-over-cash" style={styles.minimumPriceText}>
          {`Reszta (${roundUpMoney(changePln)} zł) większa niż gotówka od klienta (${roundDownMoney(changeCashCapPln)} zł) - resztę wydaje się z gotówki, zmniejsz kwotę kartą`}
        </Text>
      )}
      {extraChangeAvailable && changeDismissed && (
        <TouchableOpacity testID="change-reopen" style={{ marginTop: 10, alignSelf: "center" }} onPress={() => setChangeDismissed(false)}>
          <Text style={styles.addPairButtonText}>↩ Reszta nie wydana - wydaj resztę</Text>
        </TouchableOpacity>
      )}
      {paymentBalance.missingRates.length > 0 && (
        <Text style={styles.remainingHint}>{`Brak kursu: ${paymentBalance.missingRates.join(", ")} - te wpłaty nie są liczone`}</Text>
      )}
    </View>
  ) : null;

  // Podsumowanie na dole: Finalna cena, a poniżej minimum - Minimalna cena i co zrobić (gotówka: w sekcji gotówki,
  // gotówka i karta: pod sekcją karty)
  const saleSummary = pickupExchange ? minimumNotice : (
                    <>
                      {(remainingVisible || paymentMode === "mixed") && clientTotalPln > 0.005 && (
                        <Text testID="final-price" style={styles.finalPriceText}>{`Finalna cena: ${roundDownMoney(clientTotalPln)} zł`}</Text>
                      )}
                      {belowMinimum && (
                        <Text testID="minimum-price" style={styles.minimumPriceText}>{`Minimalna cena: ${formatMoney(effectiveSaleMin)} zł`}</Text>
                      )}
                      {belowMinimum && changeTooMuch && (() => {
                        // klient dał dość - za dużo wydanej reszty; maksimum także w walucie pierwszego wiersza reszty
                        const firstCurrency = changeRowCurrency(changeRows[0] || {});
                        const maxInCurrency = firstCurrency !== "PLN" ? plnToCurrency(maxChangePln, firstCurrency, currencyRates) : null;
                        return (
                          <Text testID="change-too-much" style={styles.minimumPriceText}>
                            {`Reszta za duża o ${roundUpMoney(changePln - maxChangePln)} zł - maksymalna reszta: ${roundDownMoney(maxChangePln)} zł${maxInCurrency === null ? "" : ` (${roundDownMoney(maxInCurrency)} ${firstCurrency})`}`}
                          </Text>
                        );
                      })()}
                      {belowMinimum && !changeTooMuch && (() => {
                        // kwota do pola „Klient dopłaca”, żeby osiągnąć minimum: minimum minus „Klient wpłaca”
                        // (zmienia się razem z wpłatami), w walucie dopłaty
                        if (paymentMode === "mixed") {
                          // ile jeszcze brakuje kartą (po gotówce i już wpisanej kwocie kartą) - bez rabatu
                          const cardTyped = Number(mixedCardAmount) > 0 ? Number(mixedCardAmount) : 0;
                          const cardMissing = roundUpMoney(Math.max(0, Number(effectiveSaleMin) - cashOnlyBalance.paidPln - cardTyped));
                          const cardMin = roundUpMoney(Math.max(0, Number(effectiveSaleMin) - cashOnlyBalance.paidPln));
                          return (
                            <Text testID="minimum-top-up-cash" style={styles.minimumTopUpText}>
                              {cardTyped > 0 ? `Kartą trzeba dopłacić jeszcze: ${cardMissing} zł` : `Kartą trzeba dopłacić co najmniej: ${cardMin} zł`}
                            </Text>
                          );
                        }
                        const topUp = plnToCurrency(Math.max(0, Number(effectiveSaleMin) - paymentBalance.paidPln), remainingCurrency, currencyRates);
                        return topUp === null ? null : (
                          <Text testID="minimum-top-up-cash" style={styles.minimumTopUpText}>{`Klient musi dopłacić: ${roundUpMoney(topUp)} ${remainingCurrency}`}</Text>
                        );
                      })()}
                    </>
  );

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
    if (field === "currency" && paymentMode === "card") {
      // Kwota z cennika w wybranej walucie; terminal i tak wymaga wpisania kwoty z terminala
      updatedPairs[index].price = remainderPrice([], value) ?? "";
    }
    setCardPriceCurrencyPairs(updatedPairs);
  };

  const openCurrencyMenu = (index, type) => {
    setCurrentCurrencyIndex(index);
    setCurrentCurrencyType(type);
    setCurrencyMenuVisible(true);
  };

  const selectCurrency = (currency) => {
    if (currentCurrencyType === "cash") {
      handleCashPairChange(currentCurrencyIndex, "currency", currency);
    } else if (currentCurrencyType === "card") {
      handleCardPairChange(currentCurrencyIndex, "currency", currency);
    }
    setCurrencyMenuVisible(false);
  };

  // Funkcja do wyszukiwania zaliczek na podstawie nazwy produktu i rozmiaru
  const searchAdvances = async (productName, size) => {
    try {
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/financial-operations/search/advances?productName=${encodeURIComponent(productName)}&size=${encodeURIComponent(size)}`),
        {
          method: 'GET'
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const advances = await response.json();
      
      setAvailableAdvances(advances);
      
      // Jeśli jest tylko jedna zaliczka, automatycznie ją wybierz
      if (advances.length === 1) {
        setSelectedAdvance(advances[0]);
        setAdvanceAmount(advances[0].amount.toString());
      }
      
      return advances;
    } catch (error) {
      Logger.error('❌ Błąd wyszukiwania zaliczek:', error);
      appAlert('Błąd', 'Nie udało się wyszukać zaliczek');
      return [];
    }
  };

  // Obsługa zmiany checkbox odbioru
  // Zamówienia do wydania w punkcie zalogowanego sprzedawcy (odbiór osobisty i dostawa)
  const loadPickupOrders = async () => {
    setPickupOrdersLoading(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/orders/for-pickup"));
      const data = response.ok ? await response.json() : null;
      const list = Array.isArray(data?.data) ? data.data : [];
      setPickupOrders(list);
      return list;
    } catch (error) {
      Logger.error("Error fetching pickup orders:", error);
      setPickupOrders([]);
      return [];
    } finally {
      setPickupOrdersLoading(false);
    }
  };

  // Zamknięcie listy (✕ / wstecz) bez wybranego zamówienia - odbiór odznaczony (sprzedaż zwykła)
  const closePickupOrders = () => {
    setPickupOrdersVisible(false);
    if (!selectedOrder) setIsPickup(false);
  };

  const selectPickupOrder = (order, confirmed = false) => {
    // Inny model niż sprzedawana kurtka: pytamy (wymiana jest możliwa, pomyłka nie przejdzie niezauważona)
    if (!confirmed && isOrderProductMismatch(order, modalMessage)) {
      setPickupOrdersVisible(false);
      appAlert("Inna kurtka niż w zamówieniu", orderMismatchMessage(order, modalMessage), [
        { text: "Wróć do listy", style: "cancel", onPress: () => setPickupOrdersVisible(true) },
        { text: "Tak, wymiana", onPress: () => selectPickupOrder(order, true) },
      ]);
      return;
    }
    setSelectedOrder(order);
    setIsPickup(true);
    setPickupOrdersVisible(false);
  };

  const handlePickupChange = async (newPickupValue, currentFullName, currentSize) => {
    setIsPickup(newPickupValue);
    
    if (newPickupValue) {
      // Zaznaczony odbiór: lista zamówień punktu do wybrania (zaliczka i dopłata)
      setPickupOrdersVisible(true);
      await loadPickupOrders();
    } else {
      setSelectedOrder(null);
      // Jeśli odznaczono odbiór, wyczyść dane zaliczek
      setAvailableAdvances([]);
      setSelectedAdvance(null);
      setAdvanceAmount("");
    }
  };

  // Auto-recalculate commissions after sale
  const recalculateCommissions = async () => {
    try {
      const requestBody = {
        sellingPoint: user?.sellingPoint,
        date: warsawToday() // dzień polski, nie UTC - po 00:00 prowizja liczyła się do wczoraj (S16)
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
      } else {
        const errorText = await response.text();
        Logger.error('Nie udalo sie przeliczyc prowizji:', errorText);
      }
    } catch (error) {
      Logger.error('Blad podczas przeliczania prowizji:', error);
    }
  };

  const handleSubmit = async () => {
    // WALIDACJA: Sprawdź czy kod kreskowy nie jest pusty
    if (!barcode || barcode.trim() === "") {
      setErrorMessage("Proszę wpisać lub zeskanować kod kreskowy.");
      setErrorModalVisible(true);
      return;
    }

    const matchedItems = stateData?.filter(item => item.barcode === barcode);
    
    let fullName, size, symbol;

    // Check if this is a remaining products barcode (000 + XX + 00 + XX)
    const builtRemainingProductName = await buildRemainingProductNameFromBarcode(barcode);
    const isRemainingProduct = builtRemainingProductName !== null;
    
    // Check if this is a bag barcode (000 + non-zero at position 6)
    const isBag = buildBagNameFromBarcode(barcode) !== null;
    
    // Check if this is a wallet barcode (000 + 0 at position 6 + non-zero at position 7)
    const isWallet = buildWalletNameFromBarcode(barcode) !== null;

    // Sprawdź czy mamy dane z stateData czy z buildJacketNameFromBarcode
    if (matchedItems && matchedItems.length > 0) {
      // Dane z stateData
      fullName = matchedItems[0].fullName;
      size = (isBag || isWallet || isRemainingProduct) ? "-" : matchedItems[0].size; // For bags, wallets and remaining products, send "-" instead of empty
      symbol = selectedOption || matchedItems[0].symbol || "Unknown";
    } else {
      // Check for built names (jacket, bag, wallet, or remaining product)
      const builtJacketName = buildJacketNameFromBarcode(barcode);
      const builtBagName = buildBagNameFromBarcode(barcode);
      const builtWalletName = buildWalletNameFromBarcode(barcode);
      
      if (builtJacketName || builtBagName || builtWalletName || builtRemainingProductName) {
        if (isBag || isWallet || isRemainingProduct) {
          // For bags, wallets and remaining products, use the full modalMessage as name (includes color)
          fullName = modalMessage;
          size = "-"; // No size for bags, wallets and remaining products
        } else {
          // For jackets, try to extract name and size from modalMessage
          const parts = modalMessage.split(' ');
          const sizePart = parts[parts.length - 1]; // Ostatnia część to rozmiar
          const namePart = parts.slice(0, -1).join(' '); // Reszta to nazwa
          
          fullName = namePart || modalMessage;
          size = sizePart || "Unknown";
        }
        symbol = selectedOption || "Generated";
      } else {
        // ❌ WALIDACJA: Produkt nie został znaleziony
        setErrorMessage(`Nie znaleziono produktu o kodzie kreskowym: ${barcode}. Sprawdź kod i spróbuj ponownie.`);
        setErrorModalVisible(true);
        return;
      }
    }

    const sellingPoint = user?.sellingPoint || "Unknown";

    // Filtruj tylko ceny które nie są puste
    let validCashPrices = cashPriceCurrencyPairs
      .filter(pair => pair.price && pair.price.trim() !== "")
      .map(pair => ({ price: pair.price, currency: pair.currency }));

    // Sprzedaż w kilku walutach: do obrotu idzie końcowa kwota („Klient zapłaci”)
    // Płatność mieszana: brakującej kwoty nie dopisujemy po cichu - blokada minimum pokaże, czego brakuje
    if ((!isPickup || selectedOrder) && Number(effectiveSalePrice) > 0 && (paymentMode === "cash" || (paymentMode === "mixed" && isOverpaid))) {
      // dopłata z pola „Klient dopłaca” liczy się sama jako wpłata gotówką
      if (!isOverpaid && remainingInputNumber > 0) {
        validCashPrices = [...validCashPrices, { price: formatMoneyExact(remainingInputNumber), currency: remainingCurrency }];
      }
      // wydana reszta (sekcja „Reszta do wydania”, także w kilku walutach) zmniejsza wpłaty gotówką; schowana ✕ = nie wydano
      if (extraChangeVisible) {
        changeRows.forEach((row) => {
          const amount = parseFloat(String(row.price || "").replace(",", ".")) || 0;
          if (amount > 0) validCashPrices = applyChangeToCash(validCashPrices, amount, changeRowCurrency(row), currencyRates);
        });
      }
    }
    
    const validCardPrices = effectiveCardPriceCurrencyPairs
      .filter(pair => pair.price && pair.price.trim() !== "" && Number(pair.price) > 0)
      .map(pair => ({ price: pair.price, currency: pair.currency }));

    // WALIDACJA: Sprawdź czy jest przynajmniej jedna płatność większa od zera
    const totalCash = validCashPrices.reduce((sum, pair) => sum + parseFloat(pair.price || 0), 0);
    const totalCard = validCardPrices.reduce((sum, pair) => sum + parseFloat(pair.price || 0), 0);
    const totalPayment = totalCash + totalCard;

    // Gotówka i karta: reszty nie da się wydać ponad gotówkę od klienta (z karty nie ma, ujemnej wpłaty nie ma)
    if (changeOverCash) {
      setErrorMessage(`Reszta ${roundUpMoney(changePln)} zł jest większa niż gotówka od klienta (${roundDownMoney(changeCashCapPln)} zł). Resztę wydaje się z gotówki - zmniejsz kwotę kartą.`);
      setErrorModalVisible(true);
      return;
    }

    // Waluta bez kursu (własny z panelu, a gdy go nie ma - kantor): sprzedaży nie zapisujemy
    const missingRatesAtSave = computePaymentBalance({ price: 0, payments: [...validCashPrices, ...validCardPrices], currencyRates }).missingRates;
    if (missingRatesAtSave.length > 0 && (currencyRates || []).length > 0) { // kursy niewczytane - decyduje serwer
      setErrorMessage(`Brak kursu ${missingRatesAtSave.join(', ')} w Tabeli walut (ani własnego, ani z kantoru). Poproś o uzupełnienie kursu w panelu albo przyjmij płatność w innej walucie.`);
      setErrorModalVisible(true);
      return;
    }

    // Zamówienie w całości opłacone zaliczką - wydanie bez dopłaty
    const fullyPaidOrder = selectedOrder && !(Number(selectedOrder.remainingPln) > 0);
    if (totalPayment <= 0 && !fullyPaidOrder) {
      setErrorMessage("Proszę wprowadzić kwotę płatności (gotówka lub karta).");
      setErrorModalVisible(true);
      return;
    }

    // Blokada rabatu: „Klient zapłaci” (wszystkie wpłaty w PLN) nie niżej niż minimum z cennika; odbiór bez blokady,
    // chyba że to wymiana na inny model (wtedy minimum dopłaty = minimum kurtki - zaliczka)
    if (!isPickup || pickupExchange) {
      const { paidPln } = computePaymentBalance({ price: 0, payments: [...validCashPrices, ...validCardPrices], currencyRates });
      const minimumError = minimumPriceError(paidPln, effectiveSaleMin);
      if (minimumError) {
        // płatność kartą: bez rabatu, więc kwota musi być pełną ceną z cennika
        setErrorMessage(cardNoDiscount ? `Przy płatności kartą nie ma rabatu. ${minimumError}` : minimumError);
        setErrorModalVisible(true);
        return;
      }
    }

    const payload = {
      fullName,
      timestamp: new Date().toISOString(), // Use ISO format for consistent date parsing
      barcode,
      size,
      sellingPoint,
      from: selectedOption || symbol, // Use the selected symbol, not the default sellingPoint
      cash: validCashPrices,
      card: validCardPrices,
      symbol, // Add symbol field
      isPickup: isPickup || Boolean(selectedOrder), // Add pickup information
      ...(selectedOrder && { orderMongoId: selectedOrder._id }), // wydanie zamówienia - backend oznaczy je jako zrealizowane
      advanceAmount: isPickup ? parseFloat(advanceAmount) || 0 : 0, // Add advance amount for pickups
      advanceOperationId: isPickup && selectedAdvance?._id ? selectedAdvance._id : null, // Add related advance ID (matches backend field name)
      employeeId: user?.employeeId || null, // Use Employee ObjectId for WorkHours matching
      employeeName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : null // Add employee name
    };

    // Walidacja wymaganych pól
    if (!payload.fullName || !payload.size || !payload.from) {
      Logger.error('❌ Brakuje wymaganych pól:', {
        fullName: payload.fullName,
        size: payload.size,
        from: payload.from
      });
      appAlert("Błąd", "Brakuje wymaganych informacji o produkcie");
      return;
    }

    if (!pendingSaleIdRef.current) {
      pendingSaleIdRef.current = `sale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
    payload.clientRequestId = pendingSaleIdRef.current;

    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/sales/save-sales"), {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        Logger.error('❌ Response error:', errorData);
        const httpError = new Error(errorData.message || `HTTP ${response.status}`);
        httpError.isHttp = true; // serwer odpowiedział i odrzucił - sprzedaż NIE jest zapisana
        throw httpError;
      }
      
      const responseData = await response.json();
      
      // Backend już automatycznie przeliczył prowizje po dodaniu sprzedaży
      
      pendingSaleIdRef.current = null;
      // Show success modal instead of alert
      setSuccessMessage(responseData?.duplicate
        ? "Ta sprzedaż była już zapisana (poprzednia próba doszła do serwera) - nie zapisano jej drugi raz."
        : "Dane zostały zapisane pomyślnie!");
      setSuccessModalVisible(true);

      // Reset modal state
      setCashPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
      setCardPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
      setBarcode("");
      setSelectedOption("");
      setModalMessage("");
    } catch (error) {
      Logger.error("Error saving data:", error);
      // Brak odpowiedzi serwera (zasięg, limit czasu): sprzedaż mogła się zapisać. Formularz zostaje,
      // a „Spróbuj ponownie” wysyła ten sam numer - serwer zwróci zapisaną sprzedaż zamiast tworzyć drugą.
      const isNoResponse = !error?.isHttp && !error?.isAuthError && error?.code !== 'SESSION_REVOKED'
        && !String(error?.message || '').includes('401');
      if (isNoResponse) {
        appAlert(
          "Brak odpowiedzi serwera",
          "Sprzedaż mogła się zapisać. Kliknij „Spróbuj ponownie” - jeśli już jest zapisana, nie zapisze się drugi raz. Formularz został zachowany.",
          [
            { text: "Zamknij", style: "cancel" },
            { text: "Spróbuj ponownie", onPress: () => runSaleOnce(handleSubmit) },
          ]
        );
        return;
      }
      pendingSaleIdRef.current = null; // serwer odrzucił - sprzedaż niezapisana, następna próba to nowa sprzedaż
      
      let errorMessage = "Failed to save data.";
      if (error.message.includes('401')) {
        errorMessage = "Nie jesteś zalogowany. Zaloguj się ponownie.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      appAlert("Błąd", errorMessage);
    }

    setModalVisible(false);
    setScanned(false); // Reset stanu skanowania po submit
    
    // Reset all form state
    setBarcode("");
    setModalMessage("");
    setSelectedOption("");
    setCashPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
    setCardPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
    setIsPickup(false);
    setSelectedOrder(null);
    setAdvanceAmount("");
    setSelectedAdvance(null);
    setAvailableAdvances([]);
    setCurrentProductName("");
    setCurrentProductSize("");
  };

  // Usuńmy to sprawdzenie - komponent powinien się renderować zawsze
  // if (!isActive) return null; // Render nothing if the tab is not active

  return (
    <View style={styles.container}>
      {/* Kamera tylko gdy formularz sprzedaży jest zamknięty - po zamknięciu formularza wraca do skanowania */}
      {!modalVisible && (
      <View style={{ flex: 1 }}>
        {/* Skaner jak w całej aplikacji (components/scanner/ScanCamera): ramka, „Odczytaj ze zdjęcia”, „Wpisz kod” */}
        <ScanCamera
          enabled={!scanned}
          onScanned={handleScan}
          resolveName={resolveProductNameFromBarcode}
          facing={facing}
        />
        
        {/* Przycisk do resetowania skanowania - pokazuje się tylko gdy scanned=true */}
        {scanned && (
          <View style={{ position: "absolute", bottom: 100, left: 0, right: 0, alignItems: "center" }}>
            <TouchableOpacity
              style={[look.primaryButton, { flex: 0, flexDirection: 'row', gap: 8, paddingHorizontal: 24 }]}
              onPress={() => {
                setScanned(false);
                setBarcode("");
                setModalMessage("");
                setSelectedOption("");
                setCashPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
                setCardPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
                setIsPickup(false);
                setSelectedOrder(null);
                setAdvanceAmount("");
                setSelectedAdvance(null);
                setCurrentProductName("");
                setCurrentProductSize("");
              }}
            >
              <Ionicons name="scan" size={20} color="#fff" />
              <Text style={look.buttonText}>Skanuj ponownie</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      )}

      {modalVisible && (
        <KeyboardSafeScreen
          style={{ flex: 1, backgroundColor: tc('bg', "black"), width: "100%", height: "100%", justifyContent: "flex-start", alignItems: "stretch", zIndex: 5 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView style={{ width: '100%' }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.scrollViewContent, { padding: 0, paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(120, insets.bottom + 120) }]}>
              <View style={[styles.modalContent, { flex: 1, backgroundColor: tc('bg', "black"), width: undefined, height: undefined, alignSelf: 'stretch', padding: 0, paddingHorizontal: 20, paddingBottom: 24, justifyContent: "flex-start", alignItems: "stretch", zIndex: 5 }]}>
                <Pressable
                  style={styles.closeButton}
                  onPress={() => {
                    setModalVisible(false);
                    setScanned(false); // Reset stanu skanowania gdy zamykamy modal
                    setBarcode("");
                    setModalMessage("");
                    setSelectedOption("");
                    setCashPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
                    setCardPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
                    setIsPickup(false);
                    setSelectedOrder(null);
                    setAdvanceAmount("");
                    setSelectedAdvance(null);
                    setCurrentProductName("");
                    setCurrentProductSize("");
                  }}
                >
                  <Ionicons name="close" size={24} color={tc('text', '#fff')} />
                </Pressable>
                <ModalHeader icon="cart" color="#10B981" title="Nowa sprzedaż" />
                <Text style={look.formLabel}>Kod kreskowy</Text>
                <TextInput
                  style={styles.inputField}
                  value={barcode}
                  onChangeText={handleBarcodeChange}
                  editable={true}
                  placeholder="Wpisz lub zeskanuj kod kreskowy"
                />
                <Text style={look.formLabel}>Sprzedano produkt</Text>
                <TextInput
                  style={styles.inputField}
                  value={modalMessage}
                  editable={false}
                />
                {/* „Sprzedano od” w ramce: mały wyśrodkowany podpis nad listą rozwijaną (zamiast dużego ostrzeżenia) */}
                <View style={styles.sellerFrame}>
                  <Text style={styles.sellerFrameCaption}>Sprzedano od - bardzo ważne, wybierz uważnie</Text>
                  <TouchableOpacity
                    style={[look.selectField, styles.importantSelect]}
                    onPress={openSellingPointModal}
                  >
                    <Text style={[look.selectFieldText, !selectedOption && { color: tc('muted', '#94A3B8') }]}>
                      {selectedOption || "Wybierz punkt sprzedaży"}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#F59E0B" />
                  </TouchableOpacity>
                  {barcode && selectedOption && saleStockAt(selectedOption) === 0 ? (
                    <Text testID="sale-point-missing-warning" style={[styles.salePointNote, styles.salePointNoteMissing, { textAlign: 'center', marginTop: 6 }]}>
                      {`W punkcie ${selectedOption} nie ma tej kurtki na stanie - po przetworzeniu powstanie korekta.`}
                    </Text>
                  ) : null}
                </View>
                {sellingPointMenuVisible && (
                  <Modal
                    transparent={true}
                    animationType="slide"
                    visible={sellingPointMenuVisible}
                    onRequestClose={() => setSellingPointMenuVisible(false)}
                  >
                    <View style={styles.currencyModalContainer}>
                      <View style={styles.currencyModalContent}>
                        <ModalHeader icon="storefront" color="#F59E0B" title="Wybierz punkt sprzedaży" subtitle="Skąd pochodzi sprzedany produkt" />
                        
                        <ScrollView style={{ maxHeight: 400, width: '100%', marginBottom: 8 }}>
                          {getMatchingSymbols().length > 0 ? (
                            getMatchingSymbols().map((item) => (
                              <TouchableOpacity
                                key={item._id}
                                testID={`sale-point-${item.symbol}`}
                                style={styles.currencyModalItem}
                                onPress={() => selectSellingPointFromModal(item.symbol)}
                              >
                                <Text style={styles.currencyModalItemText}>
                                  {item.symbol}
                                </Text>
                                {barcode ? (
                                  <Text
                                    testID={`sale-point-${item.symbol}-note`}
                                    style={[styles.salePointNote, saleStockAt(item.symbol) === 0 && styles.salePointNoteMissing]}
                                  >
                                    {saleStockAt(item.symbol) > 0
                                      ? `Na stanie: ${saleStockAt(item.symbol)} szt.`
                                      : 'Brak na stanie - po przetworzeniu powstanie korekta'}
                                  </Text>
                                ) : null}
                              </TouchableOpacity>
                            ))
                          ) : (
                            <View style={{ padding: 20 }}>
                              <Text style={{ color: tc('text', 'white'), textAlign: 'center', fontSize: 16 }}>
                                {barcode ? 
                                  `Brak tego produktu w punktach sprzedaży w lokalizacji "${user?.location || 'nieznana'}"` :
                                  'Zeskanuj kod kreskowy aby zobaczyć dostępne punkty sprzedaży'
                                }
                              </Text>
                            </View>
                          )}
                        </ScrollView>
                        
                        <TouchableOpacity
                          style={styles.currencyModalCloseButton}
                          onPress={() => setSellingPointMenuVisible(false)}
                        >
                          <Text style={styles.currencyModalCloseButtonText}>Zamknij</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Modal>
                )}

                {/* Zamówienia do wydania w tym punkcie (odbiór / dostawa) - pasujące do zeskanowanej kurtki na górze */}
                <Modal
                  transparent={true}
                  animationType="slide"
                  visible={pickupOrdersVisible}
                  onRequestClose={closePickupOrders}
                >
                  <View style={styles.currencyModalContainer}>
                    <View style={styles.currencyModalContent}>
                      <Pressable
                        testID="pickup-orders-close"
                        accessibilityLabel="Zamknij"
                        style={[styles.closeButton, { position: 'absolute', top: 12, right: 12, zIndex: 2 }]}
                        onPress={closePickupOrders}
                      >
                        <Ionicons name="close" size={24} color={tc('text', '#fff')} />
                      </Pressable>
                      <ModalHeader icon="bag-check" color="#0D6EFD" title="Zamówienia do odbioru" subtitle="Złożone w tym punkcie - wybierz, jeśli klient odbiera zamówienie" />
                      <Text testID="pickup-orders-sold-item" style={{ color: tc('text', '#fff'), fontWeight: '700', marginBottom: 8, width: '100%' }}>
                        {`Wydajesz: ${String(modalMessage || '').trim()}`}
                      </Text>
                      <ScrollView style={{ maxHeight: 420, width: '100%', marginBottom: 8 }}>
                        {pickupOrdersLoading && pickupOrders.length === 0 ? (
                          <Text style={{ color: tc('muted', '#94A3B8'), textAlign: 'center', padding: 20 }}>Wczytuję zamówienia…</Text>
                        ) : pickupOrders.length === 0 ? (
                          <Text style={{ color: tc('muted', '#94A3B8'), textAlign: 'center', padding: 20 }}>Brak oczekujących zamówień w tym punkcie.</Text>
                        ) : (
                          sortPickupOrders(pickupOrders, modalMessage).map((order) => {
                            const matches = orderMatchScore(order, modalMessage) >= 3;
                            return (
                              <TouchableOpacity
                                key={order._id}
                                testID={`pickup-order-${order.orderId}`}
                                style={[styles.currencyModalItem, matches && { borderColor: '#10B981', borderWidth: 1 }]}
                                onPress={() => selectPickupOrder(order)}
                              >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text style={[styles.currencyModalItemText, { flex: 1 }]} numberOfLines={1}>{orderProductName(order)}</Text>
                                  {matches && <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '700' }}>pasuje</Text>}
                                  {!matches && isOrderProductMismatch(order, modalMessage) && <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '700' }}>inny model</Text>}
                                </View>
                                <Text style={{ color: tc('muted', '#94A3B8'), fontSize: 13, marginTop: 2 }}>
                                  {`${order.customer?.name || 'Klient'} · ${order.customer?.deliveryOption === 'delivery' ? 'dostawa' : 'odbiór'} · ${order.realizationDate ? new Date(order.realizationDate).toLocaleDateString('pl-PL') : ''}`}
                                </Text>
                                {!matches && isOrderProductMismatch(order, modalMessage) && (
                                  <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '600', marginTop: 2 }}>
                                    {`Wymiana na inny model: ${String(modalMessage || '').trim()}`}
                                  </Text>
                                )}
                                <Text style={{ color: tc('text', '#fff'), fontSize: 13, marginTop: 4 }}>
                                  {`Zaliczka: ${formatOrderDeposit(order.payment)}`}
                                </Text>
                                <Text style={{ color: Number(order.remainingPln) > 0 ? '#EF4444' : '#10B981', fontSize: 14, fontWeight: '700', marginTop: 2 }}>
                                  {`Do dopłaty: ${formatMoney(Number(order.remainingPln) || 0)} zł`}
                                </Text>
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </ScrollView>
                    </View>
                  </View>
                </Modal>

                {/* Checkbox Odbiór */}
                <TouchableOpacity
                  style={[look.optionCard, { marginBottom: 16 }, isPickup && { borderColor: '#0D6EFD', backgroundColor: 'rgba(13, 110, 253, 0.12)' }]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isPickup }}
                  onPress={async () => {
                    const newPickupValue = !isPickup;
                    await handlePickupChange(newPickupValue, currentProductName, currentProductSize);
                  }}
                >
                  <View style={[look.optionCardIcon, { backgroundColor: 'rgba(13, 110, 253, 0.15)' }]}>
                    <Ionicons name="bag-check-outline" size={20} color="#0D6EFD" />
                  </View>
                  <Text style={look.optionCardLabel}>
                    Odbiór (dopłata do zaliczki)
                  </Text>
                  <Ionicons name={isPickup ? 'checkbox' : 'square-outline'} size={24} color={isPickup ? '#0D6EFD' : tc('muted', '#94A3B8')} />
                </TouchableOpacity>

                {/* Wybrane zamówienie: zaliczka i dopłata (Cena poniżej = dopłata) */}
                {selectedOrder && (
                  <View testID="selected-pickup-order" style={[styles.paymentCard, { borderColor: '#0D6EFD' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.paymentTitle}>{`Zamówienie ${selectedOrder.orderId}`}</Text>
                      <TouchableOpacity accessibilityLabel="Zmień zamówienie" onPress={() => setPickupOrdersVisible(true)}>
                        <Ionicons name="swap-horizontal" size={22} color="#0D6EFD" />
                      </TouchableOpacity>
                    </View>
                    <Text style={{ color: tc('text', '#fff'), fontSize: 14, marginTop: 6 }}>{orderProductName(selectedOrder)}</Text>
                    <Text style={{ color: tc('muted', '#94A3B8'), fontSize: 13, marginTop: 2 }}>{selectedOrder.customer?.name || ''}</Text>
                    {isOrderProductMismatch(selectedOrder, modalMessage) && (
                      <View testID="pickup-exchange-info" style={{ marginTop: 8, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.12)' }}>
                        <Text style={{ color: '#F59E0B', fontWeight: '700' }}>Wymiana na inny model</Text>
                        <Text style={{ color: tc('text', '#fff'), fontSize: 13, marginTop: 2 }}>{`Zamówiono: ${orderProductName(selectedOrder)}`}</Text>
                        <Text style={{ color: tc('text', '#fff'), fontSize: 13 }}>{`Wydajesz: ${String(modalMessage || '').trim()}`}</Text>
                        {pickupExchange && pickupExchange.minPrice ? (
                          <Text testID="pickup-exchange-minimum" style={{ color: '#10B981', fontSize: 13, fontWeight: '700', marginTop: 4 }}>
                            {`Minimalna cena wydawanej kurtki: ${pickupExchange.minPrice} zł − zaliczka ${formatMoney(pickupExchange.deposit)} zł = minimalna dopłata ${formatMoney(Math.max(0, pickupExchange.minPrice - pickupExchange.deposit))} zł`}
                          </Text>
                        ) : (
                          <Text style={{ color: tc('muted', '#94A3B8'), fontSize: 12, marginTop: 2 }}>Zaliczka + dopłata muszą dać co najmniej cenę minimalną wydawanej kurtki.</Text>
                        )}
                      </View>
                    )}
                    <Text style={{ color: tc('text', '#fff'), fontSize: 14, marginTop: 6 }}>{`Zaliczka: ${formatOrderDeposit(selectedOrder.payment)}`}</Text>
                    {!pickupExchange && (
                      <Text style={{ color: Number(selectedOrder.remainingPln) > 0 ? '#EF4444' : '#10B981', fontSize: 15, fontWeight: '700', marginTop: 2 }}>
                        {`Do dopłaty: ${formatMoney(Number(selectedOrder.remainingPln) || 0)} zł`}
                      </Text>
                    )}
                  </View>
                )}

                {priceRuleSale && (
                  <View testID="payment-mode" style={{ gap: 8, marginBottom: 12 }}>
                    {[
                      { key: "cash", label: "Płatność gotówką", color: "#10B981" },
                      { key: "card", label: "Płatność kartą", color: "#3B82F6" },
                      { key: "mixed", label: "Gotówka i karta", color: "#8B5CF6" },
                    ].map((option) => {
                      const checked = paymentMode === option.key;
                      return (
                        <Pressable
                          key={option.key}
                          testID={`payment-mode-${option.key}`}
                          accessibilityRole="radio"
                          accessibilityState={{ checked }}
                          style={[look.optionCard, checked && { borderColor: option.color, backgroundColor: `${option.color}1F` }]}
                          onPress={() => selectPaymentMode(option.key)}
                        >
                          <Ionicons name={checked ? "radio-button-on" : "radio-button-off"} size={20} color={option.color} />
                          <Text style={look.optionCardLabel}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                {showCashPayment && (
                <View testID="cash-payment-section" style={[styles.paymentCard, cashLocked && { opacity: 0.45 }]}>
                  <View style={styles.paymentHeader}>
                    <View style={[look.optionCardIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                      <Ionicons name="cash-outline" size={20} color="#10B981" />
                    </View>
                    <Text style={styles.paymentTitle}>{isPickup ? 'Dopłata' : 'Płatność gotówką'}</Text>
                  </View>
                  {(!isPickup || selectedOrder) && (
                    <Text style={[styles.salePriceLabel, cardNoDiscount && { opacity: 0.45 }]}>{cardNoDiscount ? "W tej formie płatności nie ma rabatu" : "Cena proponowana klientowi"}</Text>
                  )}
                  {(!isPickup || selectedOrder) && (
                    <View style={[styles.salePriceRow, cardNoDiscount && { opacity: 0.45 }]}>
                      <TextInput
                        testID="sale-price-input"
                        style={[look.formInput, { flex: 1 }]}
                        placeholderTextColor={tc('muted', '#888')}
                        editable={!cardNoDiscount}
                        value={effectiveSalePrice}
                        onChangeText={(value) => setSalePrice(sanitizeAmountInput(value))}
                        placeholder="Cena w zł"
                        keyboardType="numeric"
                      />
                      <Text style={styles.salePriceCurrency}>PLN</Text>
                    </View>
                  )}
                  {/* Bez stałej podpowiedzi „Najniższa cena” - tylko ostrzeżenie o za niskiej cenie i informacja przy karcie */}
                  {!isPickup && !cardNoDiscount && effectiveSaleMin && Number(effectiveSalePrice) > 0 && Number(effectiveSalePrice) < effectiveSaleMin - 0.005 ? (
                    <Text style={[styles.remainingHint, { color: '#EF4444', fontWeight: '600' }, { marginTop: -6, marginBottom: 10 }]}>
                      {`Cena jest za niska. Najniższa dopuszczalna: ${effectiveSaleMin} zł`}
                    </Text>
                  ) : null}
                  <Text style={[styles.salePriceLabel, { marginTop: 10 }, cashLocked && { opacity: 0.45 }]}>{paymentMode === "mixed" ? "Klient wpłaca gotówką" : "Klient wpłaca"}</Text>
                  {cashPriceCurrencyPairs.map((pair, index) => (
                    <View
                      key={`cash-${index}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}
                    >
                      <TextInput
                        testID={`cash-payment-amount-${index}`}
                        style={[look.formInput, { flex: 1.4 }]}
                        placeholderTextColor={tc('muted', '#888')}
                        editable={!cashLocked}
                        value={pair.price}
                        onChangeText={(value) => {
                          const numericValue = sanitizeAmountInput(value);
                          handleCashPairChange(index, "price", numericValue);
                        }}
                        placeholder="Wpisz kwotę"
                        keyboardType="numeric"
                      />
                      <TouchableOpacity
                        testID={`cash-payment-currency-${index}`}
                        style={[look.selectField, { flex: 1 }]}
                        disabled={cashLocked}
                        onPress={() => openCurrencyModal(index, "cash")}
                      >
                        <Text style={look.selectFieldText}>{pair.currency || "PLN"}</Text>
                        <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
                      </TouchableOpacity>
                      {(index > 0 || cashRowsOptional) && (
                        <TouchableOpacity
                          accessibilityLabel="Usuń"
                          style={styles.removeTile}
                          onPress={() => handleRemoveCashPair(index)}
                        >
                          <Ionicons name="trash-outline" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  {!cashLocked && (
                    <Pressable style={styles.addPairButton} onPress={handleAddCashPair}>
                      <Ionicons name="add" size={20} color="#0D6EFD" />
                      <Text style={styles.addPairButtonText}>Dodaj walutę</Text>
                    </Pressable>
                  )}
                  {paymentMode !== "card" && remainingBlock}
                  {/* Płatność gotówką: krótko na dole - finalna cena, a poniżej minimum także minimalna cena */}
                  {paymentMode === "cash" && saleSummary}
                </View>
                )}
                {currencyModalVisible && (
                  <Modal
                    transparent={true}
                    animationType="slide"
                    visible={currencyModalVisible}
                    onRequestClose={() => setCurrencyModalVisible(false)}
                  >
                    <View style={styles.currencyModalContainer}>
                      <View style={styles.currencyModalContent}>
                        <ModalHeader icon="cash" color="#10B981" title="Wybierz walutę" />
                        
                        <ScrollView style={{ maxHeight: 400, width: '100%', marginBottom: 8 }}>
                          {availableCurrencies.map((item) => (
                            <TouchableOpacity
                              key={item.code}
                              style={styles.currencyModalItem}
                              onPress={() => selectCurrencyFromModal(item.code)}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={[styles.currencyModalItemText, { width: 60 }]}>{item.code}</Text>
                                <Text style={{ color: tc('muted', '#a1a1aa'), fontSize: 12, flex: 1, marginLeft: 10 }}>{item.name}</Text>
                                <Text style={{ color: '#3B82F6', fontSize: 12, fontWeight: '600', marginLeft: 10 }}>{item.buyRate}</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        
                        <TouchableOpacity
                          style={styles.currencyModalCloseButton}
                          onPress={() => setCurrencyModalVisible(false)}
                        >
                          <Text style={styles.currencyModalCloseButtonText}>Zamknij</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Modal>
                )}
                {showCardPayment && (
                <View testID="card-payment-section" style={[styles.paymentCard, cardLocked && { opacity: 0.45 }]}>
                  <View style={styles.paymentHeader}>
                    <View style={[look.optionCardIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                      <Ionicons name="card-outline" size={20} color="#3B82F6" />
                    </View>
                    <Text style={styles.paymentTitle}>{isPickup || paymentMode === "mixed" ? "Dopłata kartą" : "Płatność kartą"}</Text>
                  </View>
                  {paymentMode === "mixed" && <Text style={styles.salePriceLabel}>Klient dopłaca kartą</Text>}
                  {paymentMode === "card" && <Text style={styles.salePriceLabel}>W tej formie płatności nie ma rabatu</Text>}
                  {effectiveCardPriceCurrencyPairs.map((pair, index) => (
                    <View
                      key={`card-${index}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}
                    >
                      <TextInput
                        testID={`card-payment-amount-${index}`}
                        style={[look.formInput, { flex: 1.4 }, paymentMode === "card" && { opacity: 0.45 }]}
                        placeholderTextColor={tc('muted', '#888')}
                        editable={!cardLocked && paymentMode !== "card"}
                        value={pair.price}
                        onChangeText={(value) => {
                          const numericValue = sanitizeAmountInput(value);
                          if (paymentMode === "mixed") {
                            setMixedCardOverride({ key: mixedCardSuggested, value: numericValue }); // podniesiona ręcznie kwota karty
                          } else {
                            handleCardPairChange(index, "price", numericValue);
                          }
                        }}
                        placeholder="Wpisz kwotę"
                        keyboardType="numeric"
                      />
                      <TouchableOpacity
                        testID={`card-payment-currency-${index}`}
                        style={[look.selectField, { flex: 1, opacity: 0.45 }]}
                        accessibilityState={{ disabled: true }}
                        disabled
                        onPress={() => openCurrencyModal(index, "card")}
                      >
                        <Text style={look.selectFieldText}>PLN</Text>
                        <Ionicons name="lock-closed-outline" size={18} color={tc('muted', '#94A3B8')} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {paymentMode === "card" && remainingBlock}
                  {paymentMode === "card" && minimumNotice}
                  {paymentMode === "mixed" && saleSummary}
                </View>
                )}
                <View style={styles.modalButtons}>
                  <Pressable
                    style={[styles.button, styles.cancelButton]}
                    onPress={() => {
                      setModalVisible(false);
                      setScanned(false); // Reset stanu skanowania
                      setBarcode("");
                      setModalMessage("");
                      setSelectedOption("");
                      setCashPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
                      setCardPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
                      setIsPickup(false);
                      setSelectedOrder(null);
                      setAdvanceAmount("");
                      setSelectedAdvance(null);
                      setCurrentProductName("");
                      setCurrentProductSize("");
                    }}
                  >
                    <Text style={look.neutralButtonText}>Anuluj</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, styles.addButton, savingSale && { opacity: 0.6 }]}
                    onPress={() => runSaleOnce(handleSubmit)}
                    disabled={savingSale}
                    testID="sale-submit-button"
                  >
                    <Text style={look.buttonText}>{savingSale ? 'Zapisuję…' : 'Dodaj'}</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardSafeScreen>
      )}
      
      {/* Error Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={errorModalVisible}
        onRequestClose={() => setErrorModalVisible(false)}
      >
        <View style={styles.currencyModalContainer}>
          <View style={styles.successModalContent}>
            <ModalHeader icon="alert-circle" color="#DC3545" title="Uwaga" />
            <Text style={styles.successModalMessage}>
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
      
      {/* Success Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={successModalVisible}
        onRequestClose={() => setSuccessModalVisible(false)}
      >
        <View style={styles.currencyModalContainer}>
          <View style={styles.successModalContent}>
            <ModalHeader icon="checkmark-circle" color="#10B981" title="Gotowe" />
            <Text style={styles.successModalMessage}>
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
    </View>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc('bg', "black"),color: tc('text', "white") },
  message: { textAlign: "center", marginTop: 20, color: tc('text', "white") },
  camera: { flex: 1 },
  buttonContainer: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    width: "100%",
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: tc('surface2', '#2a2a3e'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
  },
  addButton: {
    backgroundColor: "#10B981",
  },
  buttonText: {
    color: tc('text', "white"),
    fontSize: 16,
  },
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
  picker: {
    height: 55, // Ensure enough height for text
    width: "100%",
    marginBottom: 20,
    borderColor: "gray",
    borderWidth: 1,
    backgroundColor: "white", // Ensure Picker is visible
    zIndex: 100, // Ensure Picker is above other elements
    elevation: 10, // Add elevation for Android
    justifyContent: "center", // Center text vertically
    overflow: "visible", // Allow dropdown to render outside boundaries
  },
  currencyPicker: {
    flex: 1,
    height: 55,
    borderColor: "gray",
    borderWidth: 1,
    backgroundColor: "white", // Ensure Picker is visible
    zIndex: 100, // Ensure Picker is above other elements
    elevation: 10, // Add elevation for Android
    overflow: "visible", // Allow dropdown to render outside boundaries
  },
  modalContainer: {
    flex: 1,
    justifyContent: "flex-start", // Align content to the top
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 5, // Ensure modal container is below modal content
  },
  modalContent: {
    width: "100%", // Full width
    height: "100%", // Full height
    padding: 20,
    backgroundColor: tc('surface', "black"), // Set background color to black
    borderRadius: 0, // Remove border radius for full-screen effect
    alignItems: "center",
    zIndex: 10, // Ensure modal content is above other elements
    elevation: 5, // Add elevation for Android
    overflow: "visible", // Allow content to render outside boundaries
  },
  modalScrollView: {
    width: "100%",
    flexGrow: 1,
  },
  modalText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: "center",
    color: tc('text', "white"), // Set text color to white
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('surface', '#161622'),
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    marginBottom: 4,
  },
  closeButtonText: {
    color: "white", // Set close button text color to white
    fontSize: 16,
    textAlign: "center", // Center the text
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
  pairContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1, // Add border width
    borderColor: "white", // Add border color
  },
  priceInput: {
    flex: 1,
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    marginRight: 10,
    paddingHorizontal: 10,
  },
  addPairButton: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#0D6EFD',
    flexDirection: 'row',
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  salePointNote: { // „Sprzedano od”: stan kurtki w punkcie
    fontSize: 12,
    marginTop: 2,
    color: tc('muted', '#94A3B8'),
  },
  salePointNoteMissing: {
    color: '#EF4444',
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
  salePriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  salePriceLabel: { // „Cena proponowana klientowi” - małe, wyśrodkowane nad polem ceny
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 6,
  },
  salePriceCurrency: {
    color: tc('muted', '#94A3B8'),
    fontSize: 14,
    fontWeight: "600",
  },
  finalPriceText: {
    color: tc('text', '#fff'),
    fontSize: 14,
    fontWeight: "700",
    textAlign: 'center',
    marginTop: 12,
  },
  minimumPriceText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: "600",
    textAlign: 'center',
    marginTop: 4,
  },
  minimumTopUpText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: "700",
    textAlign: 'center',
    marginTop: 4,
  },
  changeSection: { // „Reszta do wydania” - sekcja w sekcji, pokazuje się, gdy klient dopłaca za dużo
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  remainingSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#334155'),
  },
  remainingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  remainingTitle: {
    color: tc('text', '#fff'),
    fontSize: 15,
    fontWeight: "700",
  },
  remainingValue: {
    flex: 1.4,
  },
  remainingValueText: {
    fontSize: 17,
    fontWeight: "700",
  },
  remainingHint: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    marginTop: 2,
  },
  addPairButtonText: {
    color: "#0D6EFD",
    fontSize: 15,
    fontWeight: "600",
  },
  removePairButton: {
    marginLeft: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "red",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  removePairButtonText: {
    color: "white",
    fontSize: 14,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: "white",
    paddingTop: 20,
  },
  scrollViewContent: {
    flexGrow: 1,
    padding: 20,
  },
  currencyButton: {
    flex: 1,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: tc('surface', "black"),
    borderColor: "white",
    borderWidth: 1,
    borderRadius: 5,
    marginLeft: 10,
  },
  currencyButtonText: {
    color: "white",
    fontSize: 16,
  },
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
    color: tc('text', '#fff'),
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Success Modal Styles
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.5)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  warningText: {
    flex: 1,
    color: tc('text', '#fff'),
    fontSize: 13,
    lineHeight: 18,
  },
  importantSelect: {
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  paymentCard: {
    width: '100%',
    backgroundColor: tc('surface', '#161622'),
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  paymentTitle: {
    color: tc('text', '#fff'),
    fontSize: 16,
    fontWeight: '600',
  },
  removeTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
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
}));

export default QRScanner;
