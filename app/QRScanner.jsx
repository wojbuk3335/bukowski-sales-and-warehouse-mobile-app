import axios from "axios"; // Import axios for HTTP requests
import { CameraView, scanFromURLAsync, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker"; // „Odczytaj ze zdjęcia” - kod kreskowy z galerii
import { useEffect, useRef, useState } from "react";
import { FlatList, Image, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { KeyboardSafeScreen } from "../components/KeyboardSafe"; // klawiatura nie zaslania pola tekstowego
import { SmartScanOverlay, useSmartBarcodeScan } from "../components/scanner/SmartScanOverlay"; // kod tylko z ramki, potwierdzony kilkoma odczytami
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiUrl, API_CONFIG } from "../config/api";
import tokenService from "../services/tokenService"; // Import tokenService
import Logger from "../services/logger"; // Import logger service
import { appAlert } from '../services/appAlert';
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
  const [currencyMenuVisible, setCurrencyMenuVisible] = useState(false);
  const [currentCurrencyIndex, setCurrentCurrencyIndex] = useState(null);
  const [currentCurrencyType, setCurrentCurrencyType] = useState(""); // "cash" or "card"
  
  // State dla funkcjonalności odbioru
  const [isPickup, setIsPickup] = useState(false); // Checkbox "Odbiór"
  const [advanceAmount, setAdvanceAmount] = useState(""); // Kwota zaliczki
  const [selectedAdvance, setSelectedAdvance] = useState(null); // Wybrana zaliczka
  const [availableAdvances, setAvailableAdvances] = useState([]); // Lista dostępnych zaliczek
  const [currentProductName, setCurrentProductName] = useState(""); // Nazwa aktualnego produktu
  const [currentProductSize, setCurrentProductSize] = useState(""); // Rozmiar aktualnego produktu
  
  const [sellingPointMenuVisible, setSellingPointMenuVisible] = useState(false); // State for "Sprzedano od" popup
  // Get available currencies from currencyRates
  const availableCurrencies = (() => {
    if (!currencyRates || currencyRates.length === 0) {
      return ["PLN", "HUF", "GBP", "ILS", "USD", "EUR", "CAN"].map(code => ({ code, name: code, buyRate: '-' }));
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
    
    return currencies;
  })();
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false); // State for currency modal
  const [currentCurrencyPairIndex, setCurrentCurrencyPairIndex] = useState(null); // Track the index of the pair being edited
  const [cameraActive, setCameraActive] = useState(true); // Zarządzanie aktywnością kamery - rozpoczynamy z aktywną kamerą
  // Skaner: przyjmuje tylko kod w ramce, po kilku zgodnych odczytach pod rząd (bez błędnych pojedynczych klatek);
  // ramka „leci” do znalezionego kodu. handleScan jest zdefiniowany niżej - wołamy go przez ref.
  const handleScanRef = useRef(null);
  const smartScan = useSmartBarcodeScan({
    enabled: !scanned && !modalVisible,
    onConfirmed: (result) => handleScanRef.current?.(result),
  });
  // „Odczytaj ze zdjęcia”: zdjęcie z galerii pokazywane zamiast kamery, kod odczytany z pliku
  const [photoUri, setPhotoUri] = useState(null);
  const [photoScanning, setPhotoScanning] = useState(false);
  // „Wpisz kod”: ręczne wpisanie kodu kreskowego - dalej dokładnie jak po zeskanowaniu
  const [manualCodeVisible, setManualCodeVisible] = useState(false);
  const [manualCode, setManualCode] = useState("");
  // Walidacja na bieżąco: ok (kod w bazie, nazwa produktu) / invalid (nie pasuje) / checking / idle
  const [manualCodeCheck, setManualCodeCheck] = useState({ state: "idle", name: "" });
  useEffect(() => {
    const code = manualCode.trim();
    if (!code) {
      setManualCodeCheck({ state: "idle", name: "" });
      return undefined;
    }
    let active = true;
    setManualCodeCheck((prev) => ({ ...prev, state: "checking" }));
    const timer = setTimeout(async () => {
      const name = await resolveProductNameFromBarcode(code);
      if (active) setManualCodeCheck(name ? { state: "ok", name } : { state: "invalid", name: "" });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualCode, stateData, goods]);

  // Po zamknięciu formularza sprzedaży wracamy do kamery (zdjęcie znika)
  useEffect(() => {
    if (!modalVisible) setPhotoUri(null);
  }, [modalVisible]);

  const pickPhotoAndScan = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        appAlert("Brak dostępu", "Zezwól aplikacji na dostęp do zdjęć, aby odczytać kod ze zdjęcia.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      if (result.canceled || !result.assets?.length) return;
      const uri = result.assets[0].uri;
      setPhotoUri(uri);
      setPhotoScanning(true);
      // 1. nasze formaty; 2. gdy nic - wszystkie formaty (zdjęcie bywa odczytane jako inny typ niż na żywo)
      let found = await scanFromURLAsync(uri, ["code128", "ean13", "qr"]);
      if (!(found || []).some((item) => item?.data)) {
        found = await scanFromURLAsync(uri, ["code128", "ean13", "ean8", "upc_a", "upc_e", "code39", "code93", "codabar", "itf14", "qr", "pdf417", "aztec", "datamatrix"]);
      }
      setPhotoScanning(false);
      const first = (found || []).find((item) => item?.data);
      if (!first) {
        setPhotoUri(null);
        const size = await new Promise((resolve) => Image.getSize(uri, (w, h) => resolve(`${w}×${h}`), () => resolve("?")));
        appAlert("Nie znaleziono kodu", `Na tym zdjęciu nie udało się odczytać kodu kreskowego. Spróbuj zdjęcia z bliska, ostrego, z kodem poziomo.

(zdjęcie ${size}, wykryto: 0 kodów)`);
        return;
      }
      Logger.debug("Scan from photo:", first.type, first.data);
      handleScanRef.current?.({ data: String(first.data), type: first.type });
    } catch (error) {
      setPhotoScanning(false);
      setPhotoUri(null);
      Logger.error("Scan from photo failed:", error);
      appAlert("Błąd", "Nie udało się odczytać kodu ze zdjęcia.");
    }
  };

  const submitManualCode = () => {
    const code = manualCode.trim();
    if (!code || manualCodeCheck.state !== "ok") return; // tylko kod z bazy kodów
    setManualCodeVisible(false);
    setManualCode("");
    handleScanRef.current?.({ data: code, type: "manual" });
  };
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
    setSelectedOption(symbol);
    setSellingPointMenuVisible(false);
  };

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
    setCurrentCurrencyIndex(index);
    setCurrentCurrencyType(type);
    setCurrencyModalVisible(true);
  };

  const selectCurrencyFromModal = (currency) => {
    if (currentCurrencyType === "cash") {
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
      setModalVisible(true);
    }
  };
  handleScanRef.current = handleScan;

  const toggleCameraFacing = () => {
    setFacing((prev) => (prev === "back" ? "front" : "back"));
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
  const handlePickupChange = async (newPickupValue, currentFullName, currentSize) => {
    setIsPickup(newPickupValue);
    
    if (newPickupValue && currentFullName && currentSize) {
      // Jeśli zaznaczono odbiór, wyszukaj dostępne zaliczki
      await searchAdvances(currentFullName, currentSize);
    } else {
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
        date: new Date().toISOString().split('T')[0]
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
    const validCashPrices = cashPriceCurrencyPairs
      .filter(pair => pair.price && pair.price.trim() !== "")
      .map(pair => ({ price: pair.price, currency: pair.currency }));
    
    const validCardPrices = cardPriceCurrencyPairs
      .filter(pair => pair.price && pair.price.trim() !== "")
      .map(pair => ({ price: pair.price, currency: pair.currency }));

    // WALIDACJA: Sprawdź czy jest przynajmniej jedna płatność większa od zera
    const totalCash = validCashPrices.reduce((sum, pair) => sum + parseFloat(pair.price || 0), 0);
    const totalCard = validCardPrices.reduce((sum, pair) => sum + parseFloat(pair.price || 0), 0);
    const totalPayment = totalCash + totalCard;

    if (totalPayment <= 0) {
      setErrorMessage("Proszę wprowadzić kwotę płatności (gotówka lub karta).");
      setErrorModalVisible(true);
      return;
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
      isPickup: isPickup, // Add pickup information
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

    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/sales/save-sales"), {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        Logger.error('❌ Response error:', errorData);
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      const responseData = await response.json();
      
      // Backend już automatycznie przeliczył prowizje po dodaniu sprzedaży
      
      // Show success modal instead of alert
      setSuccessMessage("Dane zostały zapisane pomyślnie!");
      setSuccessModalVisible(true);

      // Reset modal state
      setCashPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
      setCardPriceCurrencyPairs([{ price: "", currency: "PLN" }]);
      setBarcode("");
      setSelectedOption("");
      setModalMessage("");
    } catch (error) {
      Logger.error("Error saving data:", error);
      
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
        {photoUri ? (
          // zdjęcie z galerii zamiast podglądu kamery
          <Image source={{ uri: photoUri }} style={styles.camera} resizeMode="contain" testID="scan-photo" />
        ) : (
        <CameraView
          style={styles.camera}
          facing={facing}
          barcodeScannerSettings={{
            barcodeTypes: ["code128", "ean13", "qr"] /* tylko formaty, które drukujemy - inne dawały błędne odczyty (np. UPC-A obcina zero) */,
          }}
          onBarcodeScanned={scanned ? undefined : smartScan.onBarcodeScanned}
        />
        )}
        {/* Ramka: kod przyjmowany tylko z jej wnętrza; obrys „leci” do znalezionego kodu.
            Pod napisem: odczyt kodu ze zdjęcia z galerii i ręczne wpisanie kodu */}
        <SmartScanOverlay
          {...smartScan.overlayProps}
          hint={photoScanning ? "Odczytuję kod ze zdjęcia…" : null}
          actions={scanned ? [] : [
            { label: "Odczytaj ze zdjęcia", icon: "images-outline", onPress: pickPhotoAndScan, disabled: photoScanning, testID: "scan-from-photo" },
            { label: "Wpisz kod", icon: "keypad-outline", onPress: () => setManualCodeVisible(true), testID: "enter-code" },
          ]}
        />

        {/* Ręczne wpisanie kodu kreskowego */}
        <Modal visible={manualCodeVisible} transparent animationType="fade" onRequestClose={() => setManualCodeVisible(false)}>
          <KeyboardSafeScreen>
            <View style={look.modalOverlay}>
              <View style={look.modalContent}>
                <ModalHeader icon="keypad" color="#0D6EFD" title="Wpisz kod kreskowy" subtitle="Kod z metki, np. 0040408300005" />
                <TextInput
                  testID="manual-code-input"
                  style={look.formInput}
                  value={manualCode}
                  onChangeText={(text) => setManualCode(text.replace(/\s+/g, ""))}
                  placeholder="Kod kreskowy"
                  placeholderTextColor={tc('muted', "#64748B")}
                  keyboardType="number-pad"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={submitManualCode}
                />
                {manualCodeCheck.state !== "idle" && (
                  <View testID="manual-code-status" style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <Ionicons
                      name={manualCodeCheck.state === "ok" ? "checkmark-circle" : manualCodeCheck.state === "invalid" ? "close-circle" : "time-outline"}
                      size={18}
                      color={manualCodeCheck.state === "ok" ? "#10B981" : manualCodeCheck.state === "invalid" ? "#EF4444" : tc('muted', "#94A3B8")}
                    />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: manualCodeCheck.state === "ok" ? "#10B981" : manualCodeCheck.state === "invalid" ? "#EF4444" : tc('muted', "#94A3B8") }}>
                      {manualCodeCheck.state === "ok"
                        ? manualCodeCheck.name
                        : manualCodeCheck.state === "invalid"
                          ? "Kod niepoprawny - nie pasuje do bazy kodów"
                          : "Sprawdzam kod…"}
                    </Text>
                  </View>
                )}
                <View style={look.buttonRow}>
                  <TouchableOpacity style={look.neutralButton} onPress={() => { setManualCodeVisible(false); setManualCode(""); }}>
                    <Text style={look.neutralButtonText}>Anuluj</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="manual-code-submit"
                    style={[look.primaryButton, manualCodeCheck.state !== "ok" && { opacity: 0.5 }]}
                    onPress={submitManualCode}
                    disabled={manualCodeCheck.state !== "ok"}
                  >
                    <Text style={look.buttonText}>Dalej</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardSafeScreen>
        </Modal>
        
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
                <Text style={look.formLabel}>Gdzie</Text>
                <TextInput
                  style={styles.inputField}
                  value={user?.sellingPoint || "Unknown"}
                  editable={false}
                  placeholder="Selling Point"
                />
                <Text style={look.formLabel}>Sprzedano od</Text>
                <View style={styles.warningCard}>
                  <Ionicons name="warning" size={22} color="#F59E0B" />
                  <Text style={styles.warningText}>
                    To jest bardzo ważne pole. Proszę o przemyślany wybór!
                  </Text>
                </View>
                <TouchableOpacity
                  style={[look.selectField, styles.importantSelect, { marginBottom: 16 }]}
                  onPress={openSellingPointModal}
                >
                  <Text style={[look.selectFieldText, !selectedOption && { color: tc('muted', '#94A3B8') }]}>
                    {selectedOption || "Wybierz punkt sprzedaży"}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#F59E0B" />
                </TouchableOpacity>
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
                                style={styles.currencyModalItem}
                                onPress={() => selectSellingPointFromModal(item.symbol)}
                              >
                                <Text style={styles.currencyModalItemText}>
                                  {item.symbol}
                                </Text>
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

                <View style={styles.paymentCard}>
                  <View style={styles.paymentHeader}>
                    <View style={[look.optionCardIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                      <Ionicons name="cash-outline" size={20} color="#10B981" />
                    </View>
                    <Text style={styles.paymentTitle}>{isPickup ? 'Dopłata' : 'Płatność gotówką'}</Text>
                  </View>
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
                          const numericValue = value.replace(/[^0-9.]/g, "");
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
                          style={styles.removeTile}
                          onPress={() => handleRemoveCashPair(index)}
                        >
                          <Ionicons name="trash-outline" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <Pressable style={styles.addPairButton} onPress={handleAddCashPair}>
                    <Ionicons name="add" size={20} color="#0D6EFD" />
                    <Text style={styles.addPairButtonText}>Dodaj parę</Text>
                  </Pressable>
                </View>
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
                <View style={styles.paymentCard}>
                  <View style={styles.paymentHeader}>
                    <View style={[look.optionCardIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                      <Ionicons name="card-outline" size={20} color="#3B82F6" />
                    </View>
                    <Text style={styles.paymentTitle}>{isPickup ? "Dopłata kartą" : "Płatność kartą"}</Text>
                  </View>
                  {cardPriceCurrencyPairs.map((pair, index) => (
                    <View
                      key={`card-${index}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}
                    >
                      <TextInput
                        style={[look.formInput, { flex: 1.4 }]}
                        placeholderTextColor={tc('muted', '#888')}
                        value={pair.price}
                        onChangeText={(value) => {
                          const numericValue = value.replace(/[^0-9.]/g, "");
                          handleCardPairChange(index, "price", numericValue);
                        }}
                        placeholder="Wpisz kwotę"
                        keyboardType="numeric"
                      />
                      <TouchableOpacity
                        style={[look.selectField, { flex: 1 }]}
                        onPress={() => openCurrencyModal(index, "card")}
                      >
                        <Text style={look.selectFieldText}>{pair.currency}</Text>
                        <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
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
                      setAdvanceAmount("");
                      setSelectedAdvance(null);
                      setCurrentProductName("");
                      setCurrentProductSize("");
                    }}
                  >
                    <Text style={look.neutralButtonText}>Anuluj</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, styles.addButton]}
                    onPress={handleSubmit}
                  >
                    <Text style={look.buttonText}>Dodaj</Text>
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
