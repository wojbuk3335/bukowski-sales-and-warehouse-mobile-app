import { useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, ActivityIndicator, TextInput, FlatList, Platform, Modal } from 'react-native';
import { KeyboardSafeScreen, KeyboardSafeOverlay } from "../../components/KeyboardSafe"; // klawiatura nie zasłania pola tekstowego (ekrany i okienka)
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';
import Logger from '../../services/logger'; // Import logger service
import { getApiUrl } from '../../config/api';
import LogoutButton from '../../components/LogoutButton';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ModalHeader, OptionCard, ScreenHeader, look } from '../../components/AdminLook';
import { saleFormStyles as sf } from '../../components/SaleFormStyles'; // rozliczenie jak płatność przy sprzedaży
import { formatMoney, plnPerUnit, plnToCurrency } from '../../utils/paymentBalance';
import { sortCurrenciesForPicker } from '../../utils/currencyOrder'; // EUR, USD, HUF, CAD na górze listy // zaliczka w kilku walutach
import { orderEmailMessage } from '../../utils/orderEmailMessage';
import { addressHint, formatSuggestion, isPostalCodeFormatValid, postalCodeHint } from '../../utils/postalCodeCheck';
import { createThemedStyles, tc, tcl, useAppTheme } from '../../context/ThemeContext';
import { appAlert } from '../../services/appAlert';
import { amountError, amountOrZero, formatAmount, parseAmount, validateOrderAmounts } from '../../utils/priceInput';
import { formatPhoneNumber, isValidPolishPhone } from '../../utils/phoneNumber';
import { isConnectionError, readJson, serverErrorMessage } from '../../utils/readJson';
import { localDateString } from '../../utils/orderCompletionMessage';
import usePullToRefresh from '../../hooks/usePullToRefresh'; // odświeżanie przeciągnięciem palca

// Ponowne wysłanie tego samego formularza jest bezpieczne (clientRequestId) - backend odsyła już zapisane zamówienie
const RETRY_SAFE_HINT = 'Zamówienie mogło zostać zapisane - naciśnij „Zatwierdź zamówienie” ponownie; nie powstanie duplikat.';

const Profile = () => {
  const insets = useSafeAreaInsets(); // Get safe area insets
  const { colors: themeColors } = useAppTheme(); // 'colors' to już słownik kolorów produktów
  const { logout, user } = useContext(GlobalStateContext); // Access logout function
  
  // States for order form
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Success modal states
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [orderNumber, setOrderNumber] = useState('');

  // Search text states
  const [productSearchText, setProductSearchText] = useState('');
  const [colorSearchText, setColorSearchText] = useState('');
  const [sizeSearchText, setSizeSearchText] = useState('');

  // Dropdown visibility states
  const [productDropdownVisible, setProductDropdownVisible] = useState(false);
  const [colorDropdownVisible, setColorDropdownVisible] = useState(false);
  const [sizeDropdownVisible, setSizeDropdownVisible] = useState(false);

  // Filtered data states
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [filteredColors, setFilteredColors] = useState([]);
  const [filteredSizes, setFilteredSizes] = useState([]);

  // Input focus states
  const [productInputFocused, setProductInputFocused] = useState(false);
  const [colorInputFocused, setColorInputFocused] = useState(false);
  const [sizeInputFocused, setSizeInputFocused] = useState(false);
  const [descriptionInputFocused, setDescriptionInputFocused] = useState(false);
  
  // Validation error states
  const [productValidationError, setProductValidationError] = useState(false);
  const [colorValidationError, setColorValidationError] = useState(false);
  const [sizeValidationError, setSizeValidationError] = useState(false);

  // Description state
  const [description, setDescription] = useState('');

  // Customer data states
  const [customerName, setCustomerName] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [citySearchText, setCitySearchText] = useState('');
  const [customerNameFocused, setCustomerNameFocused] = useState(false);
  const [postalCodeFocused, setPostalCodeFocused] = useState(false);
  // Sprawdzenie kodu w Google (przez backend): { status: idle|checking|ok|not_found|unavailable, localities }
  const [postalCheck, setPostalCheck] = useState({ status: 'idle', localities: [] });
  // Walidacja całego adresu (Google Address Validation przez backend)
  const [addressCheck, setAddressCheck] = useState({ status: 'idle', suggestion: null });
  // Podpowiedzi ulic (Google Places przez backend) - lista pod polem „Ulica”
  const [streetSuggestions, setStreetSuggestions] = useState([]);
  // Stan podpowiedzi pod polem: short | searching | results | none | unavailable | chosen
  const [streetStatus, setStreetStatus] = useState('short');
  const chosenStreetRef = useRef(''); // ulica wybrana z listy - nie pytamy o nią ponownie
  const [cityInputFocused, setCityInputFocused] = useState(false);
  
  // Street data states
  const [streetSearchText, setStreetSearchText] = useState('');
  const [streetInputFocused, setStreetInputFocused] = useState(false);
  
  // House number state
  const [houseNumber, setHouseNumber] = useState('');
  const [houseNumberFocused, setHouseNumberFocused] = useState(false);

  // Phone number state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneNumberFocused, setPhoneNumberFocused] = useState(false);
  const [phoneNumberError, setPhoneNumberError] = useState('');

  // Email state
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [emailError, setEmailError] = useState('');

  // Delivery option state
  const [deliveryOption, setDeliveryOption] = useState('pickup'); // 'shipping', 'delivery', or 'pickup'

  // Payment states
  const [totalPrice, setTotalPrice] = useState('');
  // Zaliczka jak płatność przy sprzedaży: wiersze kwota | waluta („Dodaj walutę”), każda waluta = osobna wpłata
  const [depositPairs, setDepositPairs] = useState([{ price: '', currency: 'PLN' }]);
  const [depositPairIndex, setDepositPairIndex] = useState(0); // wiersz, dla którego wybieramy walutę
  const [totalPriceFocused, setTotalPriceFocused] = useState(false);
  const [depositFocused, setDepositFocused] = useState(false);
  const [depositCurrencyModalVisible, setDepositCurrencyModalVisible] = useState(false);
  const [currencyRates, setCurrencyRates] = useState([]);
  const [loadingCurrencyRates, setLoadingCurrencyRates] = useState(false);
  const [remainingCurrency, setRemainingCurrency] = useState('PLN'); // Waluta dopłaty
  const [remainingCurrencyModalVisible, setRemainingCurrencyModalVisible] = useState(false);

  // Invoice/Receipt states
  const [documentType, setDocumentType] = useState('receipt'); // 'receipt' or 'invoice'
  const [nip, setNip] = useState('');
  const [nipFocused, setNipFocused] = useState(false);
  const [nipError, setNipError] = useState('');

  // Date picker states
  const [realizationDate, setRealizationDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Submit states
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Blokada od pierwszego tapnięcia (stan Reacta aktualizuje się z opóźnieniem - dwa szybkie tapnięcia przechodziły)
  const submittingRef = useRef(false);
  // Jednorazowy identyfikator formularza: ponowione wysłanie (np. po zerwanym internecie) nie tworzy drugiego
  // zamówienia ani drugiej zaliczki - backend odsyła już zapisane. Nowy identyfikator dopiero po udanym zapisie.
  const clientRequestIdRef = useRef(null);

  // Handle postal code change with validation only (no API)
  const handlePostalCodeChange = (text) => {
    // Auto-format postal code (add dash after 2 digits)
    let formatted = text.replace(/[^0-9]/g, '');
    if (formatted.length > 2) {
      formatted = formatted.substring(0, 2) + '-' + formatted.substring(2, 5);
    }
    
    setPostalCode(formatted);
  };

  // Po wpisaniu pełnego kodu XX-XXX pytamy backend (Google Geocoding); pusta miejscowość uzupełnia się sama
  useEffect(() => {
    if (deliveryOption !== 'shipping' || !isPostalCodeFormatValid(postalCode)) {
      setPostalCheck({ status: 'idle', localities: [] });
      return undefined;
    }
    let cancelled = false;
    setPostalCheck({ status: 'checking', localities: [] });
    const timer = setTimeout(async () => {
      try {
        const response = await tokenService.authenticatedFetch(getApiUrl(`/orders/postal-code/${postalCode}`));
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok || !data.checked) {
          setPostalCheck({ status: 'unavailable', localities: [] });
          return;
        }
        if (!data.valid) {
          setPostalCheck({ status: 'not_found', localities: [] });
          return;
        }
        setPostalCheck({ status: 'ok', localities: data.localities || [] });
        if ((data.localities || []).length === 1) {
          setCitySearchText((current) => (current.trim() ? current : data.localities[0]));
        }
      } catch (error) {
        if (!cancelled) setPostalCheck({ status: 'unavailable', localities: [] });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [postalCode, deliveryOption]);

  const postalHint = postalCodeHint(postalCheck, citySearchText);

  // Po wpisaniu miejscowości, ulicy i numeru (przy wysyłce także poprawnego kodu) sprawdzamy cały adres
  useEffect(() => {
    const needsPostal = deliveryOption === 'shipping';
    const ready = (deliveryOption === 'shipping' || deliveryOption === 'delivery')
      && citySearchText.trim() && streetSearchText.trim() && houseNumber.trim()
      && (!needsPostal || isPostalCodeFormatValid(postalCode));
    if (!ready) {
      setAddressCheck({ status: 'idle', suggestion: null });
      return undefined;
    }
    // Pytamy dopiero 900 ms po ostatnim znaku (ulica / numer / miejscowość / kod). W trakcie pisania
    // chowamy poprzedni wynik bez „Sprawdzam adres…”, żeby ostrzeżenia nie migały przy każdej cyfrze numeru.
    // Odpowiedź dla starszej wersji adresu jest ignorowana (cancelled ustawia sprzątanie efektu).
    let cancelled = false;
    setAddressCheck({ status: 'idle', suggestion: null });
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setAddressCheck({ status: 'checking', suggestion: null });
      try {
        const response = await tokenService.authenticatedFetch(getApiUrl('/orders/address-check'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            postalCode: needsPostal ? postalCode : '',
            city: citySearchText,
            street: streetSearchText,
            houseNumber,
          }),
        });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok || !data.checked) {
          setAddressCheck({ status: 'unavailable', suggestion: null });
          return;
        }
        setAddressCheck({ status: data.status, suggestion: data.suggestion || null });
      } catch (error) {
        if (!cancelled) setAddressCheck({ status: 'unavailable', suggestion: null });
      }
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deliveryOption, postalCode, citySearchText, streetSearchText, houseNumber]);

  const currentAddress = {
    postalCode: deliveryOption === 'shipping' ? postalCode : '',
    city: citySearchText,
    street: streetSearchText,
    houseNumber,
  };
  const addrHint = addressHint(addressCheck, currentAddress);

  const applyAddressSuggestion = () => {
    const suggestion = addressCheck.suggestion || {};
    if (deliveryOption === 'shipping' && suggestion.postalCode) setPostalCode(suggestion.postalCode);
    if (suggestion.city) setCitySearchText(suggestion.city);
    if (suggestion.street) setStreetSearchText(suggestion.street);
    if (suggestion.houseNumber) setHouseNumber(suggestion.houseNumber);
  };

  // Podpowiedzi ulic: od 3 liter, tylko gdy pole jest aktywne; w zapytaniu miejscowość i kod
  useEffect(() => {
    const text = streetSearchText.trim();
    if (!streetInputFocused || text.length < 3 || text === chosenStreetRef.current) {
      setStreetSuggestions([]);
      setStreetStatus(text === chosenStreetRef.current && text ? 'chosen' : 'short');
      return undefined;
    }
    let cancelled = false;
    setStreetStatus('searching');
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: text,
          city: citySearchText.trim(),
          postalCode: deliveryOption === 'shipping' && isPostalCodeFormatValid(postalCode) ? postalCode : '',
        });
        const response = await tokenService.authenticatedFetch(getApiUrl(`/orders/street-suggest?${params}`));
        const data = await response.json();
        if (cancelled) return;
        if (response.ok && data.reason === 'too_short') {
          setStreetSuggestions([]);
          setStreetStatus('short'); // np. „os. Z” - po przedrostku za mało liter
          return;
        }
        if (!response.ok || !data.checked) {
          setStreetSuggestions([]);
          setStreetStatus('unavailable');
          return;
        }
        setStreetSuggestions(data.streets || []);
        setStreetStatus((data.streets || []).length > 0 ? 'results' : 'none');
      } catch (error) {
        if (!cancelled) {
          setStreetSuggestions([]);
          setStreetStatus('unavailable');
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [streetSearchText, streetInputFocused, citySearchText, postalCode, deliveryOption]);

  const chooseStreet = (street) => {
    chosenStreetRef.current = street;
    setStreetSearchText(street);
    setStreetSuggestions([]);
    setStreetStatus('chosen');
  };

  // Lista podpowiedzi pod polem „Ulica” (wysyłka i dostawa) + informacja, co się dzieje
  const renderStreetSuggestions = () => {
    if (!streetInputFocused) return null;
    if (streetStatus === 'results' && streetSuggestions.length > 0) {
      return (
        <View style={postalHintStyles.suggestList} testID="street-suggestions">
          {streetSuggestions.map((street) => (
            <TouchableOpacity key={street} style={postalHintStyles.suggestItem} onPress={() => chooseStreet(street)}>
              <Text style={postalHintStyles.suggestText}>{street}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    const info = {
      short: citySearchText.trim()
        ? `Wpisz min. 3 litery nazwy ulicy (może być z „ul.”, „os.”) - podpowiemy ulice w: ${citySearchText.trim()}`
        : 'Wpisz najpierw miejscowość, potem min. 3 litery ulicy',
      searching: 'Szukam ulic…',
      none: `Brak ulic zaczynających się od „${streetSearchText.trim()}”${citySearchText.trim() ? ` w: ${citySearchText.trim()}` : ''}`,
      unavailable: 'Podpowiedzi ulic niedostępne - wpisz ulicę ręcznie',
    }[streetStatus];
    return info ? <Text style={postalHintStyles.muted} testID="street-status">{info}</Text> : null;
  };

  // Wynik sprawdzenia adresu - pod numerem domu (wysyłka i dostawa)
  const renderAddressHint = () => {
    if (addrHint === 'idle') return null;
    if (addrHint === 'checking') return <Text style={postalHintStyles.muted}>Sprawdzam adres…</Text>;
    if (addrHint === 'unavailable') return <Text style={postalHintStyles.muted}>Nie udało się sprawdzić adresu (można kontynuować)</Text>;
    if (addrHint === 'ok') return <Text style={postalHintStyles.ok} testID="address-hint-ok">✓ Adres potwierdzony przez Google</Text>;
    const suggestionText = formatSuggestion(addressCheck.suggestion || {});
    const message = addrHint === 'corrected'
      ? '⚠️ Google poprawił adres. Czy chodziło o:'
      : addrHint === 'number_not_found'
        ? '⚠️ Ulica istnieje, ale Google nie zna tego numeru - sprawdź z klientem.'
        : '⚠️ Google nie znalazł takiego adresu - sprawdź ulicę i miejscowość z klientem.';
    return (
      <View testID={`address-hint-${addrHint}`}>
        <Text style={postalHintStyles.warn}>{message}</Text>
        {addrHint === 'corrected' && suggestionText ? (
          <TouchableOpacity style={postalHintStyles.chip} onPress={applyAddressSuggestion} testID="address-apply">
            <Text style={postalHintStyles.chipText}>Użyj: {suggestionText}</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={postalHintStyles.muted}>Możesz zostawić adres bez zmian i złożyć zamówienie.</Text>
      </View>
    );
  };

  // Handle city text change (simple text input, no API)
  const handleCityChange = (text) => {
    setCitySearchText(text);
  };

  // Walidacja i formatowanie numeru: utils/phoneNumber (komórkowe i stacjonarne, z +48 / 0048 lub bez)
  const handlePhoneNumberChange = (text) => {
    // Allow only digits, spaces, +, and - characters
    const filteredText = text.replace(/[^\d\s\+\-]/g, '');
    
    // Format the phone number
    const formattedPhone = formatPhoneNumber(filteredText);
    setPhoneNumber(formattedPhone);
    
    // Validate and set error (sprawdzamy to, co faktycznie zostanie wysłane)
    if (filteredText.trim().length > 0) {
      const isValid = isValidPolishPhone(formattedPhone);
      if (!isValid) {
        setPhoneNumberError('Nieprawidłowy numer telefonu');
      } else {
        setPhoneNumberError('');
      }
    } else {
      setPhoneNumberError('');
    }
  };

  // Email validation
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (text) => {
    // Trim whitespace and clean email
    const cleanEmail = text.trim().replace(/\s+/g, '');
    setEmail(cleanEmail);
    
    // Validate email if not empty (since it's optional)
    if (cleanEmail.length > 0) {
      const isValid = validateEmail(cleanEmail);
      if (!isValid) {
        setEmailError('Nieprawidłowy format adresu email');
      } else {
        setEmailError('');
      }
    } else {
      setEmailError(''); // Clear error when field is empty (optional field)
    }
  };

  // Payment calculations
  // „1.200,50” = 1200,50 (dawniej 1,20); błędny/niejednoznaczny zapis = 0 i blokada w validateForm
  const parsePrice = (priceString) => amountOrZero(priceString);

  const formatPrice = (price) => {
    if (price === 0) return '';
    return price.toFixed(2) + ' zł';
  };

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
      setCurrencyRates([]);
    } finally {
      setLoadingCurrencyRates(false);
    }
  };

  const currencyOptions = (() => {
    if (!currencyRates || currencyRates.length === 0) {
      return [
        { code: 'PLN', name: 'Polski zloty', buyRate: 1 },
        { code: 'EUR', name: 'Euro', buyRate: null },
        { code: 'USD', name: 'Dolar amerykanski', buyRate: null },
      ];
    }
    const mapped = currencyRates.map(rate => ({
      code: rate.currency.code,
      name: rate.currency.name,
      buyRate: rate.buyRate
    }));
    if (!mapped.some(item => item.code === 'PLN')) {
      mapped.unshift({ code: 'PLN', name: 'Polski zloty', buyRate: 1 });
    }
    return sortCurrenciesForPicker(mapped);
  })();

  const getDepositRateInfo = (currency) => {
    if (!currency || currency === 'PLN') {
      return { rate: 1, multiplier: 1 };
    }
    const rate = currencyRates.find(item => item.currency.code === currency);
    if (!rate || !(rate.buyRate > 0)) {
      return { rate: null, multiplier: 1 }; // brak kursu - zamówienie z zaliczką w tej walucie jest blokowane
    }
    const name = rate.currency?.name || '';
    const multiplier = name.includes('(za 100)') || name.includes('za 100') ? 100 : 1;
    return { rate: rate.buyRate, multiplier };
  };

  const getDepositRateLabel = (currency) => {
    if (!currency || currency === 'PLN') {
      return null;
    }
    const { rate, multiplier } = getDepositRateInfo(currency);
    if (!rate) {
      return `Brak kursu dla ${currency}`;
    }
    return `Kurs: ${multiplier} ${currency} = ${rate.toFixed(4)} PLN`;
  };

  const renderCurrencyOption = ({ item }) => {
    const name = item.name || item.code;
    const multiplier = name.includes('(za 100)') || name.includes('za 100') ? 100 : 1;
    const rateLabel = item.code === 'PLN'
      ? '1 PLN'
      : item.buyRate
        ? `${multiplier} ${item.code} = ${item.buyRate.toFixed(4)} PLN`
        : 'Brak kursu';

    return (
      <TouchableOpacity
        style={styles.currencyOptionItem}
        onPress={() => {
          setDepositPairs((prev) => prev.map((pair, index) => (index === depositPairIndex ? { ...pair, currency: item.code } : pair)));
          setDepositCurrencyModalVisible(false);
        }}
      >
        <View style={styles.currencyOptionRow}>
          <Text style={styles.currencyOptionCode}>{item.code}</Text>
          <Text style={styles.currencyOptionName}>{name}</Text>
        </View>
        <Text style={styles.currencyOptionRate}>{rateLabel}</Text>
      </TouchableOpacity>
    );
  };

  const renderRemainingCurrencyOption = ({ item }) => {
    const name = item.name || item.code;
    const multiplier = name.includes('(za 100)') || name.includes('za 100') ? 100 : 1;
    const rateLabel = item.code === 'PLN'
      ? '1 PLN'
      : item.buyRate
        ? `${multiplier} ${item.code} = ${item.buyRate.toFixed(4)} PLN`
        : 'Brak kursu';

    return (
      <TouchableOpacity
        style={styles.currencyOptionItem}
        onPress={() => {
          setRemainingCurrency(item.code);
          setRemainingCurrencyModalVisible(false);
        }}
      >
        <View style={styles.currencyOptionRow}>
          <Text style={styles.currencyOptionCode}>{item.code}</Text>
          <Text style={styles.currencyOptionName}>{name}</Text>
        </View>
        <Text style={styles.currencyOptionRate}>{rateLabel}</Text>
      </TouchableOpacity>
    );
  };

  const getRemainingRateInfo = (currency) => {
    if (!currency || currency === 'PLN') {
      return { rate: 1, multiplier: 1 };
    }
    const rate = currencyRates.find(item => item.currency.code === currency);
    if (!rate) {
      return { rate: 1, multiplier: 1 };
    }
    const name = rate.currency?.name || '';
    const multiplier = name.includes('(za 100)') || name.includes('za 100') ? 100 : 1;
    return { rate: rate.buyRate || 1, multiplier };
  };

  const getRemainingRateLabel = (currency) => {
    if (!currency || currency === 'PLN') {
      return null;
    }
    const { rate, multiplier } = getRemainingRateInfo(currency);
    if (!rate) {
      return `Brak kursu dla ${currency}`;
    }
    return `Kurs: ${multiplier} ${currency} = ${rate.toFixed(4)} PLN`;
  };

  const calculateRemainingInSelectedCurrency = () => {
    const remainingInPln = calculateCashOnDelivery();
    if (remainingInPln <= 0) return 0;
    
    if (remainingCurrency === 'PLN') {
      return remainingInPln;
    }
    
    const { rate, multiplier } = getRemainingRateInfo(remainingCurrency);
    if (!rate || rate === 0) return 0;
    
    // Convert PLN to selected currency
    const amountInCurrency = (remainingInPln / rate) * multiplier;
    return amountInCurrency;
  };

  const formatRemainingAmount = () => {
    const amount = calculateRemainingInSelectedCurrency();
    if (amount === 0) return '0.00';
    return amount.toFixed(2);
  };

  // Wpłaty zaliczki: kwoty odczytane z pól (1 200,50 itd.) i suma w PLN po kursie z panelu; null = brak kursu którejś waluty
  const depositRows = depositPairs.map((pair) => ({ ...pair, amount: parseAmount(pair.price).value || 0 }));
  const paidDepositRows = depositRows.filter((row) => row.amount > 0);
  const depositInPln = paidDepositRows.reduce((sum, row) => {
    if (sum === null) return null;
    const unit = plnPerUnit(row.currency, currencyRates);
    return unit === null ? null : sum + row.amount * unit;
  }, 0);

  const handleDepositPairChange = (index, text) => {
    const filteredText = text.replace(/[^0-9.,zł\s]/g, '');
    setDepositPairs((prev) => prev.map((pair, i) => (i === index ? { ...pair, price: filteredText } : pair)));
  };
  const handleAddDepositPair = () => setDepositPairs((prev) => [...prev, { price: '', currency: 'PLN' }]);
  const handleRemoveDepositPair = (index) => setDepositPairs((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const calculateCashOnDelivery = () => {
    const total = parsePrice(totalPrice);
    const remaining = Math.round((total - (depositInPln || 0)) * 100) / 100;
    
    if (remaining <= 0) return 0;
    
    // Add shipping cost only for 'shipping' option, not for 'delivery' or 'pickup'
    const shippingCost = deliveryOption === 'shipping' ? 20 : 0;
    return remaining + shippingCost;
  };


  // Pod polem kwoty tylko błąd zapisu (np. niejednoznaczne „1,200”) - bez podglądu „= …”
  const renderAmountPreview = (text, label) => {
    if (!String(text || '').trim()) return null;
    const error = amountError(text, label);
    return error ? <Text style={postalHintStyles.warn}>⚠️ {error}</Text> : null;
  };

  const handleTotalPriceChange = (text) => {
    // Allow only numbers, dots, commas, and "zł" symbol
    const filteredText = text.replace(/[^0-9.,zł\s]/g, '');
    setTotalPrice(filteredText);
  };


  // NIP validation
  const validateNIP = (nip) => {
    // Remove all non-digit characters
    const cleanNip = nip.replace(/\D/g, '');
    
    // NIP must have exactly 10 digits
    if (cleanNip.length !== 10) return false;
    
    // NIP validation algorithm
    const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    let sum = 0;
    
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cleanNip[i]) * weights[i];
    }
    
    const checkDigit = sum % 11;
    const lastDigit = parseInt(cleanNip[9]);
    
    return checkDigit === lastDigit || (checkDigit === 10 && lastDigit === 0);
  };

  const handleNipChange = (text) => {
    // Format NIP with dashes (XXX-XXX-XX-XX)
    let cleaned = text.replace(/\D/g, '');
    
    // Limit to 10 digits
    if (cleaned.length > 10) {
      cleaned = cleaned.substring(0, 10);
    }
    
    // Add dashes at proper positions based on clean length
    let formatted = cleaned;
    if (cleaned.length > 8) {
      // XXX-XXX-XX-XX (full format with 9-10 digits)
      formatted = cleaned.substring(0, 3) + '-' + cleaned.substring(3, 6) + '-' + cleaned.substring(6, 8) + '-' + cleaned.substring(8);
    } else if (cleaned.length > 6) {
      // XXX-XXX-XX (7-8 digits)
      formatted = cleaned.substring(0, 3) + '-' + cleaned.substring(3, 6) + '-' + cleaned.substring(6);
    } else if (cleaned.length > 3) {
      // XXX-XXX (4-6 digits)
      formatted = cleaned.substring(0, 3) + '-' + cleaned.substring(3);
    }
    
    setNip(formatted);
    
    // Validate NIP
    if (cleaned.length > 0) {
      const isValid = validateNIP(cleaned);
      if (!isValid && cleaned.length === 10) {
        setNipError('Nieprawidłowy numer NIP');
      } else {
        setNipError('');
      }
    } else {
      setNipError('');
    }
  };

  // Generate order ID
  // Validate form
  const validateForm = () => {
    let hasErrors = false;
    
    // Validate product selection (real-time validation already handles this)
    if (!selectedProduct || productValidationError) {
      if (!productValidationError) setProductValidationError(true);
      appAlert('Błąd', 'Proszę wybrać poprawny produkt z listy');
      hasErrors = true;
    }
    
    // Validate color selection (real-time validation already handles this)
    if (!selectedColor || colorValidationError) {
      if (!colorValidationError) setColorValidationError(true);
      appAlert('Błąd', 'Proszę wybrać poprawny kolor z listy');
      hasErrors = true;
    }
    
    // Validate size selection (real-time validation already handles this)
    if (!selectedSize || sizeValidationError) {
      if (!sizeValidationError) setSizeValidationError(true);
      appAlert('Błąd', 'Proszę wybrać poprawny rozmiar z listy');
      hasErrors = true;
    }
    
    if (hasErrors) return false;
    if (!customerName.trim()) {
      appAlert('Błąd', 'Proszę podać imię i nazwisko');
      return false;
    }
    if (!phoneNumber.trim()) {
      appAlert('Błąd', 'Proszę podać numer telefonu');
      return false;
    }
    if (phoneNumberError) {
      appAlert('Błąd', 'Proszę podać prawidłowy numer telefonu');
      return false;
    }
    
    // Validate address fields based on delivery option
    // Wysyłka / dostawa: pełny adres potwierdzony przez Google (backend też to sprawdza)
    if (deliveryOption === 'shipping' || deliveryOption === 'delivery') {
      if (deliveryOption === 'shipping' && !isPostalCodeFormatValid(postalCode)) {
        appAlert('Błąd', 'Kod pocztowy musi mieć format XX-XXX (np. 34-500)');
        return false;
      }
      if (!citySearchText.trim() || !streetSearchText.trim() || !houseNumber.trim()) {
        appAlert('Błąd', 'Podaj pełny adres: miejscowość, ulicę i numer domu');
        return false;
      }
      const addressMessages = {
        checking: 'Poczekaj chwilę - sprawdzamy adres w Google.',
        corrected: 'Google proponuje poprawiony adres - kliknij „Użyj” pod numerem domu albo popraw adres ręcznie.',
        number_not_found: 'Google nie zna tego numeru domu na tej ulicy - sprawdź adres z klientem.',
        not_found: 'Google nie znalazł takiego adresu - sprawdź ulicę i miejscowość z klientem.',
        unavailable: 'Nie udało się sprawdzić adresu w Google - spróbuj ponownie za chwilę.',
        idle: 'Adres nie został jeszcze sprawdzony - poczekaj chwilę i spróbuj ponownie.',
      };
      if (addrHint !== 'ok') {
        appAlert('Adres niepotwierdzony', addressMessages[addrHint] || addressMessages.idle);
        return false;
      }
    }
    // Kwoty: poprawny zapis, cena > 0 i w limicie, zaliczka nie większa niż cena, kurs waluty zaliczki (backend sprawdza to samo)
    const amountsError = validateOrderAmounts({ totalPrice, deposits: depositPairs, depositInPln });
    if (amountsError) {
      appAlert('Błąd', amountsError);
      return false;
    }

    if (documentType === 'invoice' && !nip.trim()) {
      appAlert('Błąd', 'Dla faktury wymagany jest numer NIP');
      return false;
    }
    if (documentType === 'invoice' && nipError) {
      appAlert('Błąd', 'Proszę podać prawidłowy numer NIP');
      return false;
    }
    if (email && emailError) {
      appAlert('Błąd', 'Proszę podać prawidłowy adres email');
      return false;
    }
    return true;
  };

  // Submit order
  const handleSubmitOrder = async () => {
    if (submittingRef.current) return;
    if (!validateForm()) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }

    try {
      const orderData = {
        clientRequestId: clientRequestIdRef.current,
        product: {
          name: selectedProduct?.Tow_Opis || selectedProduct?.name,
          color: selectedColor?.Kol_Opis || selectedColor?.name,
          size: selectedSize?.Roz_Opis || selectedSize?.name,
          description
        },
        customer: {
          name: customerName,
          phone: phoneNumber,
          email: email ? email.trim() : null, // Clean email before sending
          deliveryOption,
          address: {
            postalCode: deliveryOption === 'shipping' ? postalCode : null,
            city: deliveryOption !== 'pickup' ? citySearchText : null,
            street: deliveryOption !== 'pickup' ? streetSearchText : null,
            houseNumber: deliveryOption !== 'pickup' ? houseNumber : null
          }
        },
        payment: {
          totalPrice: parsePrice(totalPrice),
          // Zaliczka w kilku walutach; deposit/depositCurrency dla zgodności (jedna waluta - jak dawniej, kilka - suma w PLN)
          deposits: paidDepositRows.map((row) => ({ amount: row.amount, currency: row.currency })),
          deposit: paidDepositRows.length > 1 ? Math.round((depositInPln || 0) * 100) / 100 : (paidDepositRows[0]?.amount || 0),
          depositCurrency: paidDepositRows.length > 1 ? 'PLN' : (paidDepositRows[0]?.currency || 'PLN'),
          cashOnDelivery: calculateCashOnDelivery(),
          documentType,
          nip: documentType === 'invoice' ? nip : null
        },
        // data kalendarzowa „RRRR-MM-DD” (toISOString w UTC potrafił cofnąć termin o dzień)
        realizationDate: localDateString(realizationDate),
        // datę złożenia, sprzedawcę i punkt ustala backend z tokenu (nie z telefonu)
      };

      // Save to database
      const response = await tokenService.authenticatedFetch(getApiUrl('/orders'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
      });

      const result = await readJson(response);
      if (response.ok && result.orderId) {
        const backendOrderId = result.orderId; // Use orderId from backend
        clientRequestIdRef.current = null; // kolejne zamówienie dostanie nowy identyfikator

        // Set success message and show modal
        setOrderNumber(backendOrderId);
        setSuccessMessage(result.duplicate
          ? 'To zamówienie było już zapisane wcześniej (ponowione wysłanie) - nie utworzono drugiego.'
          : orderEmailMessage(result.emails, result.sms)); // komunikat wg faktycznie wysłanych maili
        setSuccessModalVisible(true);
        
        // Reset form after a short delay.
        // Tylko w wersji deweloperskiej (Metro, __DEV__) formularz zostaje wypełniony - wygodne przy testach
        // wysyłek. W aplikacji na telefonach pracowników (__DEV__ = false) czyści się jak dotąd.
        if (!__DEV__) {
          setTimeout(() => {
            resetForm();
          }, 500);
        }
      } else if (response.ok || response.status >= 500) {
        // Serwer (albo pośrednik) mógł zapisać zamówienie, ale odpowiedź nie dotarła w całości.
        // clientRequestId zostaje - ponowne wysłanie zwróci już zapisane zamówienie zamiast duplikatu.
        Logger.error('❌ Backend error:', response.status, result);
        appAlert(
          'Błąd',
          `${response.ok ? 'Serwer nie potwierdził zapisu zamówienia.' : serverErrorMessage(response, result)}\n\n${RETRY_SAFE_HINT}`
        );
      } else {
        Logger.error('❌ Backend error:', result);
        throw new Error(serverErrorMessage(response, result, 'Błąd podczas zapisywania zamówienia'));
      }
    } catch (error) {
      Logger.error('❌ Submit error:', error);
      if (error?.isAuthError) {
        // sesja wygasła - aplikacja już przechodzi do ekranu logowania, drugi komunikat jest zbędny
      } else if (isConnectionError(error)) {
        // clientRequestId zostaje do udanego zapisu - ponowienie jest bezpieczne
        appAlert('Błąd', `Brak odpowiedzi serwera. ${RETRY_SAFE_HINT}`);
      } else {
        appAlert(
          'Błąd', 
          `Nie udało się złożyć zamówienia.\n\nSzczegóły: ${error.message}\n\nSpróbuj ponownie.`
        );
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setSelectedProduct(null);
    setSelectedColor(null);
    setSelectedSize(null);
    setDescription('');
    setProductSearchText('');
    setColorSearchText('');
    setSizeSearchText('');
    setCustomerName('');
    setPhoneNumber('');
    setEmail('');
    setPostalCode('');
    setCitySearchText('');
    setStreetSearchText('');
    setHouseNumber('');
    setTotalPrice('');
    setDepositPairs([{ price: '', currency: 'PLN' }]); // zaliczka: jeden pusty wiersz PLN
    setDepositPairIndex(0);
    setRemainingCurrency('PLN'); // Reset waluty dopłaty do PLN
    setDocumentType('receipt');
    setNip('');
    setRealizationDate(new Date());
  };

  // Fetch data from APIs
  // silent - odświeżanie przeciągnięciem: formularz zostaje na ekranie (bez kręciołka zamiast formularza)
  const fetchOrderData = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      // Fetch products (stock)
      const stockResponse = await tokenService.authenticatedFetch(getApiUrl('/excel/stock/get-all-stocks'));
      if (stockResponse.ok) {
        const stockData = await stockResponse.json();
        setProducts(Array.isArray(stockData) ? stockData : stockData.stocks || []);
      }

      // Fetch colors
      const colorsResponse = await tokenService.authenticatedFetch(getApiUrl('/excel/color/get-all-colors'));
      if (colorsResponse.ok) {
        const colorsData = await colorsResponse.json();
        setColors(Array.isArray(colorsData) ? colorsData : colorsData.colors || []);
      }

      // Fetch sizes
      const sizesResponse = await tokenService.authenticatedFetch(getApiUrl('/excel/size/get-all-sizes'));
      if (sizesResponse.ok) {
        const sizesData = await sizesResponse.json();
        setSizes(Array.isArray(sizesData) ? sizesData : sizesData.sizes || []);
      }
    } catch (error) {
      Logger.error('Error fetching order data:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderData();
  }, []);

  // Przeciągnięcie w dół: odświeża tylko dane słownikowe (produkty, kolory, rozmiary, kursy walut);
  // wpisane w formularz wartości zostają bez zmian
  const { refreshControl } = usePullToRefresh(() =>
    Promise.all([fetchOrderData({ silent: true }), fetchCurrencyRates()])
  );

  useEffect(() => {
    fetchCurrencyRates();
  }, []);


  useEffect(() => {
    if (depositCurrencyModalVisible) {
      fetchCurrencyRates();
    }
  }, [depositCurrencyModalVisible]);

  useEffect(() => {
    if (remainingCurrencyModalVisible) {
      fetchCurrencyRates();
    }
  }, [remainingCurrencyModalVisible]);

  // Get today's date in Polish format
  const getTodayDate = () => {
    return new Date().toLocaleDateString('pl-PL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Filter products based on search text
  useEffect(() => {
    if (productSearchText.length > 0) {
      const filtered = products.filter(product => {
        const productName = product.Tow_Opis || product.name || '';
        return productName.toLowerCase().includes(productSearchText.toLowerCase());
      }).filter(product => product.Tow_Opis && product.Tow_Opis.trim() !== ''); // Filter out empty names
      setFilteredProducts(filtered.slice(0, 10)); // Limit to 10 results
    } else {
      setFilteredProducts([]);
    }
  }, [productSearchText, products]);

  // Filter colors based on search text
  useEffect(() => {
    if (colorSearchText.length > 0) {
      const filtered = colors.filter(color => {
        const colorName = color.Kol_Opis || color.name || '';
        return colorName.toLowerCase().includes(colorSearchText.toLowerCase());
      }).filter(color => color.Kol_Opis && color.Kol_Opis.trim() !== ''); // Filter out empty names
      setFilteredColors(filtered.slice(0, 10)); // Limit to 10 results
    } else {
      setFilteredColors([]);
    }
  }, [colorSearchText, colors]);

  // Filter sizes based on search text
  useEffect(() => {
    if (sizeSearchText.length > 0) {
      const filtered = sizes.filter(size => {
        const sizeName = size.Roz_Opis || size.name || '';
        const sizeText = sizeName.toLowerCase();
        const searchText = sizeSearchText.toLowerCase().trim();
        // Exact match: size must equal search OR start with search and be followed by space
        return sizeText === searchText || 
               (sizeText.startsWith(searchText) && sizeText[searchText.length] === ' ');
      }).filter(size => size.Roz_Opis && size.Roz_Opis.trim() !== ''); // Filter out empty names
      setFilteredSizes(filtered.slice(0, 10)); // Limit to 10 results
    } else {
      setFilteredSizes([]);
    }
  }, [sizeSearchText, sizes]);

  // Selection handlers
  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    setProductSearchText(product.Tow_Opis || product.name || '');
    setProductDropdownVisible(false);
    setProductValidationError(false); // Always reset error when selecting from dropdown
  };

  const handleColorSelect = (color) => {
    setSelectedColor(color);
    setColorSearchText(color.Kol_Opis || color.name || '');
    setColorDropdownVisible(false);
    setColorValidationError(false); // Always reset error when selecting from dropdown
  };

  const handleSizeSelect = (size) => {
    setSelectedSize(size);
    setSizeSearchText(size.Roz_Opis || size.name || '');
    setSizeDropdownVisible(false);
    setSizeValidationError(false); // Always reset error when selecting from dropdown
  };

  // Clear form function
  const clearForm = () => {
    clientRequestIdRef.current = null; // nowy formularz = nowe zamówienie
    setSelectedProduct(null);
    setSelectedColor(null);
    setSelectedSize(null);
    setProductSearchText('');
    setColorSearchText('');
    setSizeSearchText('');
    setProductDropdownVisible(false);
    setColorDropdownVisible(false);
    setSizeDropdownVisible(false);
  };

  return (
    <>
      <SafeAreaView style={{ backgroundColor: themeColors.bg, flex: 1, paddingBottom: Math.max(20, insets.bottom + 20) }}>
        <KeyboardSafeScreen offset={Platform.OS === 'ios' ? 0 : 20}>
          <ScrollView 
            style={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="automatic"
            keyboardDismissMode="interactive"
            refreshControl={refreshControl}
            alwaysBounceVertical
          >
          <View style={styles.container}>
            <ScreenHeader icon="document-text" title="Zamówienia" subtitle={getTodayDate()} />

            {loading ? (
              <ActivityIndicator size="large" color="#0d6efd" style={styles.loader} />
            ) : (
              <View style={styles.formContainer}>
                {/* Product Section */}
                <View style={styles.sectionContainer}>
                  <View style={styles.sectionHeader}>
                    <View style={[look.optionCardIcon, { backgroundColor: '#0D6EFD26' }]}>
                      <Ionicons name="cube" size={20} color="#0D6EFD" />
                    </View>
                    <Text style={styles.sectionTitle}>Produkt</Text>
                  </View>
                  
                  {/* Product Selection */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Produkt:</Text>
                  <TextInput
                    style={[
                      styles.input, 
                      productInputFocused && styles.inputFocused,
                      productValidationError && styles.errorBorder
                    ]}
                    placeholder="Wyszukaj produkt..."
                    value={productSearchText}
                    onChangeText={(text) => {
                      setProductSearchText(text);
                      setProductDropdownVisible(text.length > 0);
                      
                      // Real-time validation
                      if (text.length > 0) {
                        const matchingProduct = products.find(product => 
                          (product.Tow_Opis || product.name || '').toLowerCase() === text.toLowerCase()
                        );
                        
                        if (matchingProduct) {
                          setSelectedProduct(matchingProduct);
                          setProductValidationError(false);
                        } else {
                          setSelectedProduct(null);
                          setProductValidationError(true);
                        }
                      } else {
                        setSelectedProduct(null);
                        setProductValidationError(false);
                      }
                    }}
                    onFocus={() => {
                      setProductInputFocused(true);
                      if (productSearchText.length > 0) setProductDropdownVisible(true);
                    }}
                    onBlur={() => setProductInputFocused(false)}
                    placeholderTextColor={tc('muted', "#666")}
                  />
                  {/* Product dropdown */}
                  {productDropdownVisible && (
                    <View style={styles.dropdown}>
                      <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
                        {filteredProducts.length === 0 ? (
                          <Text style={styles.noDataText}>Brak produktów pasujących do wyszukiwania</Text>
                        ) : (
                          filteredProducts.map((item) => (
                            <TouchableOpacity
                              key={item._id || item.id}
                              style={styles.dropdownItem}
                              onPress={() => handleProductSelect(item)}
                            >
                              <Text style={styles.dropdownItemText}>{item.Tow_Opis || item.name}</Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                      <TouchableOpacity
                        style={styles.closeDropdownButton}
                        onPress={() => setProductDropdownVisible(false)}
                      >
                        <Text style={styles.closeDropdownText}>Zamknij</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Color Selection */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.fieldLabel}>Kolor:</Text>
                  <TextInput
                    style={[
                      styles.input, 
                      colorInputFocused && styles.inputFocused,
                      colorValidationError && styles.errorBorder
                    ]}
                    placeholder="Wyszukaj kolor..."
                    value={colorSearchText}
                    onChangeText={(text) => {
                      setColorSearchText(text);
                      setColorDropdownVisible(text.length > 0);
                      
                      // Real-time validation
                      if (text.length > 0) {
                        const matchingColor = colors.find(color => 
                          (color.Kol_Opis || color.name || '').toLowerCase() === text.toLowerCase()
                        );
                        
                        if (matchingColor) {
                          setSelectedColor(matchingColor);
                          setColorValidationError(false);
                        } else {
                          setSelectedColor(null);
                          setColorValidationError(true);
                        }
                      } else {
                        setSelectedColor(null);
                        setColorValidationError(false);
                      }
                    }}
                    onFocus={() => {
                      setColorInputFocused(true);
                      if (colorSearchText.length > 0) setColorDropdownVisible(true);
                    }}
                    onBlur={() => setColorInputFocused(false)}
                    placeholderTextColor={tc('muted', "#666")}
                  />
                  {/* Color dropdown */}
                  {colorDropdownVisible && (
                    <View style={styles.dropdown}>
                      <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
                        {filteredColors.length === 0 ? (
                          <Text style={styles.noDataText}>Brak kolorów pasujących do wyszukiwania</Text>
                        ) : (
                          filteredColors.map((item) => (
                            <TouchableOpacity
                              key={item._id || item.id}
                              style={styles.dropdownItem}
                              onPress={() => handleColorSelect(item)}
                            >
                              <Text style={styles.dropdownItemText}>{item.Kol_Opis || item.name}</Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                      <TouchableOpacity
                        style={styles.closeDropdownButton}
                        onPress={() => setColorDropdownVisible(false)}
                      >
                        <Text style={styles.closeDropdownText}>Zamknij</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Size Selection */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.fieldLabel}>Rozmiar:</Text>
                  <TextInput
                    style={[
                      styles.input, 
                      sizeInputFocused && styles.inputFocused,
                      sizeValidationError && styles.errorBorder
                    ]}
                    placeholder="Wyszukaj rozmiar..."
                    value={sizeSearchText}
                    autoCapitalize="characters" // rozmiary zawsze wielkimi literami (2XL, nie 2xl)
                    autoCorrect={false}
                    onChangeText={(rawText) => {
                      const text = rawText.toUpperCase();
                      setSizeSearchText(text);
                      setSizeDropdownVisible(text.length > 0);
                      
                      // Real-time validation
                      if (text.length > 0) {
                        const matchingSize = sizes.find(size => 
                          (size.Roz_Opis || size.name || '').toLowerCase() === text.toLowerCase()
                        );
                        
                        if (matchingSize) {
                          setSelectedSize(matchingSize);
                          setSizeValidationError(false);
                        } else {
                          setSelectedSize(null);
                          setSizeValidationError(true);
                        }
                      } else {
                        setSelectedSize(null);
                        setSizeValidationError(false);
                      }
                    }}
                    onFocus={() => {
                      setSizeInputFocused(true);
                      if (sizeSearchText.length > 0) setSizeDropdownVisible(true);
                    }}
                    onBlur={() => setSizeInputFocused(false)}
                    placeholderTextColor={tc('muted', "#666")}
                  />
                  {/* Size dropdown */}
                  {sizeDropdownVisible && (
                    <View style={styles.dropdown}>
                      <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
                        {filteredSizes.length === 0 ? (
                          <Text style={styles.noDataText}>Brak rozmiarów pasujących do wyszukiwania</Text>
                        ) : (
                          filteredSizes.map((item) => (
                            <TouchableOpacity
                              key={item._id || item.id}
                              style={styles.dropdownItem}
                              onPress={() => handleSizeSelect(item)}
                            >
                              <Text style={styles.dropdownItemText}>{item.Roz_Opis || item.name}</Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                      <TouchableOpacity
                        style={styles.closeDropdownButton}
                        onPress={() => setSizeDropdownVisible(false)}
                      >
                        <Text style={styles.closeDropdownText}>Zamknij</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Description Field */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.fieldLabel}>Opis (max 400 znaków):</Text>
                  <TextInput
                    style={[styles.textArea, descriptionInputFocused && styles.inputFocused]}
                    placeholder="Dodaj opis zamówienia..."
                    value={description}
                    onChangeText={(text) => {
                      if (text.length <= 400) {
                        setDescription(text);
                      }
                    }}
                    onFocus={() => setDescriptionInputFocused(true)}
                    onBlur={() => setDescriptionInputFocused(false)}
                    placeholderTextColor={tc('muted', "#666")}
                    multiline={true}
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  <Text style={styles.charCounter}>{description.length}/400</Text>
                </View>
                </View>

                {/* Customer Data Section */}
                <View style={styles.sectionContainer}>
                  <View style={styles.sectionHeader}>
                    <View style={[look.optionCardIcon, { backgroundColor: '#8B5CF626' }]}>
                      <Ionicons name="person" size={20} color="#8B5CF6" />
                    </View>
                    <Text style={styles.sectionTitle}>Dane klienta</Text>
                  </View>
                  
                  {/* Customer Name Field */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Imię i Nazwisko:</Text>
                    <TextInput
                      style={[styles.input, customerNameFocused && styles.inputFocused]}
                      placeholder="Wprowadź imię i nazwisko"
                      value={customerName}
                      onChangeText={setCustomerName}
                      onFocus={() => setCustomerNameFocused(true)}
                      onBlur={() => setCustomerNameFocused(false)}
                      placeholderTextColor={tc('muted', "#666")}
                    />
                  </View>

                  {/* Delivery Options */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Sposób dostawy:</Text>
                    
                    <OptionCard
                      icon="paper-plane-outline"
                      label="Wysyłka"
                      selected={deliveryOption === 'shipping'}
                      onPress={() => setDeliveryOption('shipping')}
                    />
                    
                    <OptionCard
                      icon="car-outline"
                      label="Dostawa"
                      selected={deliveryOption === 'delivery'}
                      onPress={() => setDeliveryOption('delivery')}
                    />
                    
                    <OptionCard
                      icon="storefront-outline"
                      label="Odbiór osobisty"
                      selected={deliveryOption === 'pickup'}
                      onPress={() => setDeliveryOption('pickup')}
                    />
                  </View>

                  {/* Postal Code Field - only show when shipping is selected */}
                  {deliveryOption === 'shipping' && (
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>Kod pocztowy:</Text>
                      <TextInput
                        style={[styles.input, postalCodeFocused && styles.inputFocused]}
                        placeholder="XX-XXX"
                        value={postalCode}
                        onChangeText={handlePostalCodeChange}
                        onFocus={() => setPostalCodeFocused(true)}
                        onBlur={() => setPostalCodeFocused(false)}
                        placeholderTextColor={tc('muted', "#666")}
                        keyboardType="numeric"
                        maxLength={6}
                        testID="postal-code-input"
                      />
                      {postalHint === 'checking' && (
                        <Text style={postalHintStyles.muted}>Sprawdzam kod…</Text>
                      )}
                      {postalHint === 'ok' && (
                        <Text style={postalHintStyles.ok} testID="postal-hint-ok">✓ {postalCheck.localities.join(', ') || 'kod istnieje'}</Text>
                      )}
                      {postalHint === 'not_found' && (
                        <Text style={postalHintStyles.warn} testID="postal-hint-not-found">⚠️ Google nie zna takiego kodu - sprawdź go z klientem</Text>
                      )}
                      {postalHint === 'unavailable' && (
                        <Text style={postalHintStyles.muted}>Nie udało się sprawdzić kodu (można kontynuować)</Text>
                      )}
                    </View>
                  )}

                  {/* City Field - simple text input */}
                  {deliveryOption === 'shipping' && (
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>Miejscowość:</Text>
                      <TextInput
                        style={[styles.input, cityInputFocused && styles.inputFocused]}
                        placeholder="Wpisz miejscowość..."
                        value={citySearchText}
                        onChangeText={handleCityChange}
                        onFocus={() => setCityInputFocused(true)}
                        onBlur={() => setCityInputFocused(false)}
                        placeholderTextColor={tc('muted', "#666")}
                        testID="city-input"
                      />
                      {postalHint === 'mismatch' && (
                        <View testID="postal-hint-mismatch">
                          <Text style={postalHintStyles.warn}>
                            ⚠️ Kod {postalCode} nie pasuje do „{citySearchText.trim()}”. Wg Google to:
                          </Text>
                          <View style={postalHintStyles.chips}>
                            {postalCheck.localities.slice(0, 6).map((place) => (
                              <TouchableOpacity key={place} style={postalHintStyles.chip} onPress={() => setCitySearchText(place)}>
                                <Text style={postalHintStyles.chipText}>{place}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <Text style={postalHintStyles.muted}>Możesz zostawić swoją nazwę (np. wieś z kodem gminy).</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Street Field - simple text input */}
                  {deliveryOption === 'shipping' && (
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>Ulica (opcjonalnie):</Text>
                      <TextInput
                        style={[styles.input, streetInputFocused && styles.inputFocused]}
                        placeholder="Wpisz ulicę..."
                        value={streetSearchText}
                        onChangeText={setStreetSearchText}
                        onFocus={() => setStreetInputFocused(true)}
                        onBlur={() => setTimeout(() => setStreetInputFocused(false), 250)}
                        placeholderTextColor={tc('muted', "#666")}
                        testID="street-input"
                      />
                      {renderStreetSuggestions()}
                    </View>
                  )}

                  {/* House Number Field */}
                  {deliveryOption === 'shipping' && (
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>Numer domu/mieszkania:</Text>
                      <TextInput
                        style={[styles.input, houseNumberFocused && styles.inputFocused]}
                        placeholder="np. 12, 12A, 12/3"
                        value={houseNumber}
                        onChangeText={setHouseNumber}
                        onFocus={() => setHouseNumberFocused(true)}
                        onBlur={() => setHouseNumberFocused(false)}
                        placeholderTextColor={tc('muted', "#666")}
                        autoCapitalize="characters"
                      />
                      {renderAddressHint()}
                    </View>
                  )}

                  {/* Manual Delivery Address Fields - only show when delivery is selected */}
                  {deliveryOption === 'delivery' && (
                    <>
                      <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>Miejscowość:</Text>
                        <TextInput
                          style={[styles.input, cityInputFocused && styles.inputFocused]}
                          placeholder="Wprowadź miejscowość"
                          value={citySearchText}
                          onChangeText={setCitySearchText}
                          onFocus={() => setCityInputFocused(true)}
                          onBlur={() => setCityInputFocused(false)}
                          placeholderTextColor={tc('muted', "#666")}
                        />
                      </View>

                      <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>Ulica (opcjonalnie):</Text>
                        <TextInput
                          style={[styles.input, streetInputFocused && styles.inputFocused]}
                          placeholder="Wprowadź nazwę ulicy"
                          value={streetSearchText}
                          onChangeText={setStreetSearchText}
                          onFocus={() => setStreetInputFocused(true)}
                          onBlur={() => setTimeout(() => setStreetInputFocused(false), 250)}
                          placeholderTextColor={tc('muted', "#666")}
                        />
                        {renderStreetSuggestions()}
                      </View>

                      <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>Numer domu/mieszkania:</Text>
                        <TextInput
                          style={[styles.input, houseNumberFocused && styles.inputFocused]}
                          placeholder="np. 12, 12A, 12/3"
                          value={houseNumber}
                          onChangeText={setHouseNumber}
                          onFocus={() => setHouseNumberFocused(true)}
                          onBlur={() => setHouseNumberFocused(false)}
                          placeholderTextColor={tc('muted', "#666")}
                          autoCapitalize="characters"
                        />
                        {renderAddressHint()}
                      </View>
                    </>
                  )}

                  {/* Phone Number Field */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Numer telefonu:</Text>
                    <TextInput
                      style={[
                        styles.input, 
                        phoneNumberFocused && styles.inputFocused,
                        phoneNumberError ? styles.inputError : null
                      ]}
                      placeholder="np. 123 456 789 lub +48 123 456 789"
                      value={phoneNumber}
                      onChangeText={handlePhoneNumberChange}
                      onFocus={() => setPhoneNumberFocused(true)}
                      onBlur={() => setPhoneNumberFocused(false)}
                      placeholderTextColor={tc('muted', "#666")}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                    />
                    {phoneNumberError ? (
                      <Text style={styles.errorText}>{phoneNumberError}</Text>
                    ) : (
                      <Text style={styles.helperText}>
                        Wprowadź polski numer telefonu (9 cyfr)
                      </Text>
                    )}
                  </View>

                  {/* Email Field (Optional) */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Email (opcjonalnie):</Text>
                    <TextInput
                      style={[
                        styles.input, 
                        emailFocused && styles.inputFocused,
                        emailError ? styles.inputError : null
                      ]}
                      placeholder="np. jan.kowalski@example.com"
                      value={email}
                      onChangeText={handleEmailChange}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      placeholderTextColor={tc('muted', "#666")}
                      keyboardType="email-address"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {emailError ? (
                      <Text style={styles.errorText}>{emailError}</Text>
                    ) : (
                      <Text style={styles.helperText}>
                        Opcjonalnie - do kontaktu w sprawie zamówienia
                      </Text>
                    )}
                  </View>
                </View>

                {/* Payment Section */}
                <View style={styles.sectionContainer}>
                  <View style={styles.sectionHeader}>
                    <View style={[look.optionCardIcon, { backgroundColor: '#10B98126' }]}>
                      <Ionicons name="cash" size={20} color="#10B981" />
                    </View>
                    <Text style={styles.sectionTitle}>Rozliczenie</Text>
                  </View>
                  
                  {/* Cena i zaliczka - pola sekcji „Rozliczenie” (dodawanie walut jak płatność przy sprzedaży, każda waluta = osobna wpłata) */}
                  <>
                    <View style={sf.salePriceRow}>
                      <Text style={sf.salePriceLabel}>Cena</Text>
                      <TextInput
                        testID="order-total-price-input"
                        style={[look.formInput, { flex: 1 }, totalPriceFocused && styles.inputFocused]}
                        placeholder="np. 800 zł"
                        value={totalPrice}
                        onChangeText={handleTotalPriceChange}
                        onFocus={() => setTotalPriceFocused(true)}
                        onBlur={() => setTotalPriceFocused(false)}
                        placeholderTextColor={tc('muted', "#666")}
                        keyboardType="numeric"
                      />
                      <Text style={sf.salePriceCurrency}>PLN</Text>
                    </View>
                    {renderAmountPreview(totalPrice, 'Cena')}
                    <Text style={styles.fieldLabel}>Zaliczka:</Text>
                    {depositPairs.map((pair, index) => (
                      <View key={`deposit-${index}`} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <TextInput
                            testID={`order-deposit-amount-${index}`}
                            style={[look.formInput, { flex: 1.4 }]}
                            placeholder="Kwota zaliczki"
                            value={pair.price}
                            onChangeText={(text) => handleDepositPairChange(index, text)}
                            placeholderTextColor={tc('muted', "#666")}
                            keyboardType="numeric"
                          />
                          <TouchableOpacity
                            testID={`order-deposit-currency-${index}`}
                            style={[look.selectField, { flex: 1 }]}
                            onPress={() => {
                              setDepositPairIndex(index);
                              setDepositCurrencyModalVisible(true);
                            }}
                          >
                            <Text style={look.selectFieldText}>{pair.currency || 'PLN'}</Text>
                            <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
                          </TouchableOpacity>
                          {index > 0 && (
                            <TouchableOpacity
                              accessibilityLabel="Usuń"
                              style={sf.removeTile}
                              onPress={() => handleRemoveDepositPair(index)}
                            >
                              <Ionicons name="trash-outline" size={20} color="#EF4444" />
                            </TouchableOpacity>
                          )}
                        </View>
                        {renderAmountPreview(pair.price, 'Zaliczka')}
                        {pair.currency !== 'PLN' && getDepositRateLabel(pair.currency) ? (
                          <Text style={sf.remainingHint}>{getDepositRateLabel(pair.currency)}</Text>
                        ) : null}
                      </View>
                    ))}
                    <TouchableOpacity style={sf.addPairButton} onPress={handleAddDepositPair} testID="order-add-currency">
                      <Ionicons name="add" size={20} color="#0D6EFD" />
                      <Text style={sf.addPairButtonText}>Dodaj walutę</Text>
                    </TouchableOpacity>

                    {/* Pozostało do zapłaty: przy wysyłce kwota pobrania w PLN (+20 zł), przy dostawie i odbiorze - w wybranej walucie */}
                    <View style={sf.remainingSection} testID="order-remaining-card">
                      <View style={sf.remainingHeader}>
                        <Ionicons name="hourglass-outline" size={18} color="#EF4444" />
                        <Text style={sf.remainingTitle}>
                          {deliveryOption === 'shipping' ? 'Kwota pobrania (z przesyłką +20 zł)' : `Do dopłaty${deliveryOption === 'pickup' ? ' przy odbiorze' : ' przy dostawie'}`}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={[look.formInput, sf.remainingValue, { justifyContent: 'center' }]}>
                          <Text testID="order-remaining-amount" style={[sf.remainingValueText, { color: tc('text', '#fff') }]}>
                            {deliveryOption === 'shipping'
                              ? formatMoney(calculateCashOnDelivery())
                              : formatRemainingAmount()}
                          </Text>
                        </View>
                        {deliveryOption === 'shipping' ? (
                          <View style={[look.selectField, { flex: 1, justifyContent: 'center' }]}>
                            <Text style={look.selectFieldText}>PLN</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            testID="order-remaining-currency"
                            style={[look.selectField, { flex: 1 }]}
                            onPress={() => setRemainingCurrencyModalVisible(true)}
                          >
                            <Text style={look.selectFieldText}>{remainingCurrency}</Text>
                            <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
                          </TouchableOpacity>
                        )}
                      </View>
                      {deliveryOption !== 'shipping' && remainingCurrency !== 'PLN' && getRemainingRateLabel(remainingCurrency) ? (
                        <Text style={sf.remainingHint}>{getRemainingRateLabel(remainingCurrency)}</Text>
                      ) : null}
                      <Text style={sf.clientTotal}>
                        {depositInPln === null ? 'Zaliczka: brak kursu waluty' : `Zaliczka: ${formatMoney(depositInPln)} zł`}
                        <Text style={sf.clientTotalPrice}>{`  (cena ${formatMoney(parsePrice(totalPrice))} zł)`}</Text>
                      </Text>
                    </View>
                  </>

                  {/* Document Type Selection */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Rodzaj dokumentu:</Text>
                    <View style={styles.checkboxContainer}>
                      <TouchableOpacity
                        style={[styles.checkboxItem, documentType === 'receipt' && styles.checkboxSelected]}
                        onPress={() => setDocumentType('receipt')}
                      >
                        <Text style={[styles.checkboxText, documentType === 'receipt' && styles.checkboxTextSelected]}>
                          Paragon
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.checkboxItem, documentType === 'invoice' && styles.checkboxSelected]}
                        onPress={() => setDocumentType('invoice')}
                      >
                        <Text style={[styles.checkboxText, documentType === 'invoice' && styles.checkboxTextSelected]}>
                          Faktura
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* NIP Field (only for invoice) */}
                  {documentType === 'invoice' && (
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>NIP:</Text>
                      <TextInput
                        style={[
                          styles.input,
                          nipFocused && styles.inputFocused,
                          nipError ? styles.inputError : null
                        ]}
                        placeholder="XXX-XXX-XX-XX"
                        value={nip}
                        onChangeText={handleNipChange}
                        onFocus={() => setNipFocused(true)}
                        onBlur={() => setNipFocused(false)}
                        placeholderTextColor={tc('muted', "#666")}
                        keyboardType="numeric"
                        maxLength={13}
                      />
                      {nipError ? (
                        <Text style={styles.errorText}>{nipError}</Text>
                      ) : (
                        <Text style={styles.helperText}>
                          Wprowadź 10-cyfrowy numer NIP
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Realization Date */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Ustalona data realizacji:</Text>
                    <TouchableOpacity
                      style={styles.datePickerButton}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Text style={styles.datePickerText}>
                        {realizationDate.toLocaleDateString('pl-PL')}
                      </Text>
                      <Ionicons name="calendar-outline" size={20} color={tc('muted', '#94A3B8')} />
                    </TouchableOpacity>
                    {showDatePicker && (
                      <DateTimePicker
                        value={realizationDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, selectedDate) => {
                          setShowDatePicker(Platform.OS === 'ios');
                          if (selectedDate) {
                            setRealizationDate(selectedDate);
                          }
                        }}
                        minimumDate={new Date()}
                      />
                    )}
                  </View>
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                  style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                  onPress={handleSubmitOrder}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={tc('text', "#fff")} />
                  ) : (
                    <Text style={styles.submitButtonText}>Zatwierdź zamówienie</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
        </KeyboardSafeScreen>
      </SafeAreaView>
      
      {/* Success Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={successModalVisible}
        onRequestClose={() => setSuccessModalVisible(false)}
      >
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <ModalHeader icon="checkmark-circle" color="#10B981" title="Zamówienie przyjęte" />
            <Text style={styles.successModalSubtitle}>Numer zamówienia:</Text>
            <Text style={styles.orderNumber}>{orderNumber}</Text>
            <Text style={styles.successModalMessage}>
              {successMessage}
            </Text>
            
            <TouchableOpacity
              style={[styles.submitButton, { marginTop: 20, alignSelf: 'stretch' }]}
              onPress={() => setSuccessModalVisible(false)}
            >
              <Text style={styles.submitButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Deposit Currency Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={depositCurrencyModalVisible}
        onRequestClose={() => setDepositCurrencyModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.currencyModalOverlay}
          activeOpacity={1}
          onPress={() => setDepositCurrencyModalVisible(false)}
        >
          <View style={styles.currencyModalContent} onStartShouldSetResponder={() => true}>
            <ModalHeader icon="cash" color="#10B981" title="Wybierz walutę zaliczki" />
            {loadingCurrencyRates ? (
              <ActivityIndicator size="large" color="#0d6efd" style={{marginVertical: 40}} />
            ) : (
              <FlatList
                data={currencyOptions}
                keyExtractor={(item) => item.code}
                renderItem={renderCurrencyOption}
                style={styles.currencyList}
              />
            )}
            <TouchableOpacity
              style={styles.currencyModalCloseButton}
              onPress={() => setDepositCurrencyModalVisible(false)}
            >
              <Text style={styles.currencyModalCloseText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Remaining Currency Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={remainingCurrencyModalVisible}
        onRequestClose={() => setRemainingCurrencyModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.currencyModalOverlay}
          activeOpacity={1}
          onPress={() => setRemainingCurrencyModalVisible(false)}
        >
          <View style={styles.currencyModalContent} onStartShouldSetResponder={() => true}>
            <ModalHeader icon="cash" color="#10B981" title="Wybierz walutę dopłaty" />
            {loadingCurrencyRates ? (
              <ActivityIndicator size="large" color="#0d6efd" style={{marginVertical: 40}} />
            ) : (
              <FlatList
                data={currencyOptions}
                keyExtractor={(item) => item.code}
                renderItem={renderRemainingCurrencyOption}
                style={styles.currencyList}
              />
            )}
            <TouchableOpacity
              style={styles.currencyModalCloseButton}
              onPress={() => setRemainingCurrencyModalVisible(false)}
            >
              <Text style={styles.currencyModalCloseText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

export default Profile;

const styles = createThemedStyles(() => StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 100, // Extra padding to ensure content is not hidden behind keyboard
  },
  title: {
    color: tc('text', 'white'),
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  dateContainer: {
    backgroundColor: tc('surface', '#1a1a1a'),
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: tc('border', '#333'),
  },
  dateText: {
    color: '#0d6efd',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  loader: {
    marginTop: 50,
  },
  formContainer: {
    gap: 4,
  },
  fieldContainer: {
    marginBottom: 12,
    position: 'relative',
  },
  fieldLabel: {
    color: tc('muted', '#94A3B8'),
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    color: tc('text', 'white'),
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 15,
    height: 50,
  },
  inputFocused: {
    borderColor: '#0D6EFD',
    borderWidth: 2,
  },
  textArea: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    color: tc('text', 'white'),
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 15,
    minHeight: 100,
    maxHeight: 150,
  },
  charCounter: {
    color: tc('muted', '#666'),
    fontSize: 12,
    textAlign: 'right',
    marginTop: 5,
  },
  sectionContainer: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    color: tc('text', 'white'),
    fontSize: 18,
    fontWeight: '600',
  },
  dropdownItemSubtext: {
    color: tc('muted', '#888'),
    fontSize: 12,
    marginTop: 2,
  },
  inputError: {
    borderColor: '#dc3545',
    borderWidth: 2,
  },
  errorText: {
    color: '#dc3545',
    fontSize: 12,
    marginTop: 5,
    marginLeft: 5,
  },
  helperText: {
    color: tc('muted', '#888'),
    fontSize: 12,
    marginTop: 5,
    marginLeft: 5,
  },
  calculatedField: {
    backgroundColor: tc('surface', '#161622'),
    justifyContent: 'center',
    borderColor: tc('border', '#1E293B'),
  },
  calculatedFieldText: {
    color: '#0d6efd',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  checkboxItem: {
    flex: 1,
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    paddingVertical: 14,
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: 'rgba(13, 110, 253, 0.15)',
    borderColor: '#0D6EFD',
    borderWidth: 2,
  },
  checkboxText: {
    color: tc('text', 'white'),
    fontSize: 15,
    fontWeight: '500',
  },
  checkboxTextSelected: {
    fontWeight: 'bold',
    color: '#0D6EFD',
  },
  datePickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  datePickerText: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#0d6efd',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#666',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  dropdown: {
    position: 'absolute',
    top: 75,
    left: 0,
    right: 0,
    backgroundColor: tc('surface', '#1a1a1a'),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tc('border', '#333'),
    maxHeight: 200,
    zIndex: 1000,
  },
  dropdownScroll: {
    maxHeight: 150,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#333'),
  },
  dropdownItemText: {
    color: tc('text', 'white'),
    fontSize: 14,
  },
  noDataText: {
    color: tc('muted', '#666'),
    fontSize: 14,
    padding: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  closeDropdownButton: {
    backgroundColor: '#0d6efd',
    padding: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: tc('border', '#333'),
  },
  closeDropdownText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deliveryOptionsContainer: {
    marginTop: 8,
  },
  deliveryOptionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tc('border', '#333'),
    backgroundColor: tc('surface', '#2a2a2a'),
    alignItems: 'center',
  },
  deliveryOptionSelected: {
    backgroundColor: '#0d6efd',
    borderColor: '#0d6efd',
  },
  deliveryOptionText: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  deliveryOptionTextSelected: {
    color: 'white',
    fontWeight: 'bold',
  },
  errorBorder: {
    borderColor: '#ff4444',
    borderWidth: 2,
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
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#28a745',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successIcon: {
    fontSize: 50,
    color: '#fff',
    fontWeight: 'bold',
  },
  successModalTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    marginBottom: 10,
  },
  successModalSubtitle: {
    fontSize: 13,
    color: tc('muted', '#94A3B8'),
    marginBottom: 4,
  },
  orderNumber: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  successModalMessage: {
    fontSize: 15,
    color: tc('muted', '#CBD5E1'),
    textAlign: 'center',
    lineHeight: 22,
  },
  // Currency Selection Styles
  currencySelect: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  currencySelectText: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: 'bold',
  },
  currencyRateText: {
    color: '#0d6efd',
    fontSize: 13,
    marginTop: 5,
    marginLeft: 5,
  },
  // Currency Modal Styles
  currencyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  currencyModalContent: {
    backgroundColor: tc('surface', '#161622'),
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '75%',
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
  },
  currencyModalTitle: {
    color: tc('text', 'white'),
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  currencyList: {
    flexGrow: 0,
  },
  currencyOptionItem: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
  },
  currencyOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  currencyOptionCode: {
    color: tc('text', 'white'),
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 12,
    minWidth: 50,
  },
  currencyOptionName: {
    color: tc('muted', '#ccc'),
    fontSize: 14,
    flex: 1,
  },
  currencyOptionRate: {
    color: '#0d6efd',
    fontSize: 13,
    marginTop: 2,
  },
  currencyModalCloseButton: {
    backgroundColor: tc('surface2', '#2a2a3e'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
    alignItems: 'center',
  },
  currencyModalCloseText: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: 'bold',
  },}));

// Podpowiedzi pod kodem pocztowym / miejscowością
const postalHintStyles = createThemedStyles(() => StyleSheet.create({
  muted: { color: tc('muted', '#94A3B8'), fontSize: 13, marginTop: 6 },
  ok: { color: tcl('#22C55E', '#15803d'), fontSize: 13, marginTop: 6, fontWeight: '600' },
  warn: { color: tcl('#F59E0B', '#b45309'), fontSize: 13, marginTop: 6, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: tc('surface2', '#1E293B'), borderColor: '#F59E0B', borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: '#F59E0B', fontSize: 13, fontWeight: '600' },
  suggestList: { marginTop: 4, backgroundColor: tc('surface2', '#1E293B'), borderColor: tc('border', '#334155'), borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  suggestItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomColor: tc('border', '#334155'), borderBottomWidth: 1 },
  suggestText: { color: tc('text', '#FFFFFF'), fontSize: 15 },
}));
