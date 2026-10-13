import { useFocusEffect } from '@react-navigation/native'; // Import useFocusEffect
import React, { useContext, useEffect, useState } from 'react';
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
import { CameraView, useCameraPermissions } from "expo-camera"; // Import camera for QR scanning
import { appAlert } from '../../services/appAlert';

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
  const [otherAccountsData, setOtherAccountsData] = useState([]); // State for sales on other accounts
  const [transferredItems, setTransferredItems] = useState([]); // State for transferred items
  const [receivedItems, setReceivedItems] = useState([]); // State for items transferred to this account
  const [editFromModalVisible, setEditFromModalVisible] = useState(false); // State for new modal visibility
  const [newFromValue, setNewFromValue] = useState(""); // State for the new 'from' value
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
  const [productScanned, setProductScanned] = useState(false); // Track if product was scanned (with size already included)
  const [productFinalPrice, setProductFinalPrice] = useState(""); // Final agreed price for product
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
      return ["PLN", "HUF", "GBP", "ILS", "USD", "EUR", "CAN"].map(code => ({ 
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
    
    return currencies;
  })();

  const currencyOptions = (() => {
    if (!currencyRates || currencyRates.length === 0) {
      return ["PLN", "HUF", "GBP", "ILS", "USD", "EUR", "CAN"].map(code => ({
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

    return mapped;
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

  const fetchSalesData = async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/sales/get-all-sales'));
      
      if (!response || !response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data = await response.json();
      
      // Ensure data is an array
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

  const fetchItemData = async (id) => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl(`/sales/${id}`));
      if (!response.ok) {
        throw new Error("Failed to fetch item data.");
      }
      const data = await response.json();
      setEditData(data); // Set the fetched data for editing

      // Map cash and card fields to ensure proper structure and handle null/undefined prices
      setCashPriceCurrencyPairs(
        data.cash?.map(({ price, currency }) => ({ price: price ? price.toString() : "", currency })) || [{ price: "", currency: "PLN" }]
      );
      setCardPriceCurrencyPairs(
        data.card?.map(({ price, currency }) => ({ price: price ? price.toString() : "", currency })) || [{ price: "", currency: "PLN" }]
      );

      setEditModalVisible(true); // Show the edit modal
    } catch (error) {
      // Silent error handling
    }
  };

  const updateItem = async () => {
    try {
      if (editData?._id) {
        // Validate that at least one price (cash or card) is provided
        const hasCashPrice = cashPriceCurrencyPairs.some(({ price }) => {
          const numPrice = parseFloat(price);
          return !isNaN(numPrice) && numPrice > 0;
        });
        
        const hasCardPrice = cardPriceCurrencyPairs.some(({ price }) => {
          const numPrice = parseFloat(price);
          return !isNaN(numPrice) && numPrice > 0;
        });
        
        if (!hasCashPrice && !hasCardPrice) {
          setErrorMessage("Musisz podać przynajmniej jedną cenę (gotówka lub karta). Nie można zapisać produktu bez ceny.");
          setErrorModalVisible(true);
          return;
        }

        const updatedData = {
          ...editData,
          cash: cashPriceCurrencyPairs.map(({ price, currency }) => ({ price: parseFloat(price) || 0, currency })),
          card: cardPriceCurrencyPairs.map(({ price, currency }) => ({ price: parseFloat(price) || 0, currency })),
          isPickup: editData.isPickup || false, // Dodaj pole isPickup
        };

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
          throw new Error("Failed to update the item.");
        }

        const updatedItem = await response.json(); // Fetch the updated item from the server

        setFilteredData((prev) =>
          prev.map((item) => (item._id === updatedItem._id ? updatedItem : item))
        ); // Update the item in the list
        setEditModalVisible(false); // Close the edit modal
      } else {
        Logger.error("No valid ID found for the item to update.");
      }
    } catch (error) {
      Logger.error("Error updating item:", error.message);
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

  const fetchTransferredItems = async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/transfer"));
      
      if (!response || !response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data = await response.json();
      
      // Ensure data is an array
      const transferArray = Array.isArray(data) ? data : (data?.transfers || data?.data || []);
      const filteredData = transferArray.filter((item) => item.transfer_from === user.symbol);
      
      setTransferredItems(filteredData); // Filter items by transfer_from
    } catch (error) {
      setTransferredItems([]); // Fallback to empty array
    }
  };

  const fetchReceivedItems = async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/transfer"));
      
      if (!response || !response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data = await response.json();
      
      // Ensure data is an array
      const transferArray = Array.isArray(data) ? data : (data?.transfers || data?.data || []);
      setReceivedItems(transferArray.filter((item) => item.transfer_to === user.symbol)); // Filter items by transfer_to
    } catch (error) {
      setReceivedItems([]); // Fallback to empty array
    }
  };

  const fetchAdvances = async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/transfer"));
      
      if (!response || !response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data = await response.json();
      
      // Ensure data is an array
      const transferArray = Array.isArray(data) ? data : (data?.transfers || data?.data || []);
      
      // Filtruj tylko te transfery które mają zaliczki i są od obecnego użytkownika
      const advancesFiltered = transferArray.filter((item) => 
        item.transfer_from === user.symbol && 
        item.advancePayment && 
        item.advancePayment > 0
      );
      
      setAdvancesData(advancesFiltered);
    } catch (error) {
      setAdvancesData([]); // Fallback to empty array
    }
  };

  const fetchFinancialOperations = async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/financial-operations"));
      
      if (!response || !response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data = await response.json();
      
      // Ensure data is an array
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

  // Function to calculate available funds by currency
  const calculateAvailableFunds = () => {
    // FOR TESTING: Uncomment line below to simulate tomorrow
    // const today = '2025-08-11'; // TEST: Simulate tomorrow (dzień później)
    const today = new Date().toISOString().split('T')[0]; // NORMAL: Real today
    

    
    // Calculate total sales by currency
    const salesTotals = {};
    filteredData.forEach(item => {
      [...(item.cash || []), ...(item.card || [])]
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
        throw new Error("Failed to delete the sale.");
      }
      setFilteredData((prev) =>
        prev.filter((item) => item._id !== selectedItem._id)
      ); // Remove the item from the list
      setModalVisible(false); // Close the options modal
      
      // Backend już automatycznie przeliczył prowizje po usunięciu
      
      setSuccessMessage("Sprzedaż została pomyślnie usunięta!");
      setSuccessModalVisible(true);
    } catch (error) {
      setErrorMessage("Nie udało się usunąć sprzedaży. Spróbuj ponownie.");
      setErrorModalVisible(true);
    }
  };

  const handleCancelTransferredItem = async () => {
    if (!selectedTransferredItem?._id) {
      setErrorMessage('Nie znaleziono transferu do anulowania.');
      setErrorModalVisible(true);
      setTransferOptionsVisible(false);
      return;
    }

    try {
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/transfer/by-id/${selectedTransferredItem._id}`),
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete transfer');
      }

      setTransferOptionsVisible(false);
      setSelectedTransferredItem(null);
      await fetchTransferredItems();
      await fetchReceivedItems();

      setSuccessMessage('Transfer został anulowany.');
      setSuccessModalVisible(true);
    } catch (error) {
      setTransferOptionsVisible(false);
      setErrorMessage('Nie udało się anulować transferu. Spróbuj ponownie.');
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
          `Godziny pracy dla ${selectedEmployeeForHours.firstName} ${selectedEmployeeForHours.lastName} zostały ${actionText}.\n\nGodziny: ${workStartTime} - ${workEndTime}\nWypłata: ${result.workHours.dailyPay.toFixed(2)} PLN`
        );
        setSuccessModalVisible(true);
        closeWorkHoursModal(); // Użyj funkcji pomocniczej do zamknięcia
        fetchTodaysWorkHours(); // Refresh today's work hours
        
        // 🔄 AUTOMATICALLY RECALCULATE COMMISSIONS after work hours update
        await recalculateCommissions();
      } else {
        const errorData = await response.json();
        setSuccessMessage(
          errorData.message || "Nie udało się zapisać godzin pracy."
        );
        setSuccessModalVisible(true);
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

  const resetAddAmountForm = () => {
    setAddAmountModalVisible(false);
    setAddAmountAmount("");
    setAddAmountCurrency("PLN");
    setAddAmountReason("");
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
      const operation = item?._id ? await fetchFinancialOperationById(item._id) : item;
      if (!operation) {
        throw new Error("No operation data");
      }

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
    if (!addAmountAmount || parseFloat(addAmountAmount) <= 0) {
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
    
    if (reasonType === 'product') {
      // Validate standard product selection
      if (!selectedProduct) {
        setErrorMessage("Proszę wybrać produkt z listy.");
        setErrorModalVisible(true);
        return;
      }
      
      if (!productFinalPrice || parseFloat(productFinalPrice) <= 0) {
        setErrorMessage("Proszę podać cenę finalną produktu (zaliczka + dopłata).");
        setErrorModalVisible(true);
        return;
      }
      
      if (parseFloat(productFinalPrice) < parseFloat(addAmountAmount)) {
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
    
    // Validate currency rate for non-PLN currencies
    if (addAmountCurrency !== 'PLN' && showAddAmountRateInput) {
      if (!addAmountCurrencyRate || parseFloat(addAmountCurrencyRate) <= 0) {
        setErrorMessage(`Proszę wprowadzić prawidłowy kurs dla ${addAmountCurrency} (większy od 0).`);
        setErrorModalVisible(true);
        return;
      }
    }
    
    try {
      // Prepare reason based on selection with currency conversion
      let finalReason = '';
      let conversionInfo = null;
      let productName = ''; // Define productName at function scope
      
      if (reasonType === 'product') {
        // Standard product name (search by 'id' field; stateData uses 'id', not '_id')
        const selectedProductObj = products.find(p => (p.id || p._id) === selectedProduct) ||
                                    stateData?.find(p => (p.id || p._id) === selectedProduct);
        productName = selectedProductObj?.fullName || selectedProductObj?.Tow_Opis || selectedProductObj?.code || selectedProductObj?.Tow_Kod || 'Nieznany produkt';
        
        // Add size to product name if selected
        if (sizeSearchQuery) {
          productName += ` ${sizeSearchQuery}`;
        }
        
        if (productFinalPrice) {
          const finalPricePLN = parseFloat(productFinalPrice); // Always store original PLN price
          const advanceAmount = parseFloat(addAmountAmount);
          
          // If advance is in different currency, calculate conversion info
          if (addAmountCurrency !== 'PLN') {
            try {
              // Use manual rate if provided, otherwise use stored rate
              let rateToUse = null;
              if (addAmountCurrencyRate && parseFloat(addAmountCurrencyRate) > 0) {
                rateToUse = parseFloat(addAmountCurrencyRate);
                // Also update stored rate for future use
                await CurrencyService.updateCurrencyRate(addAmountCurrency, rateToUse);
              }
              
              conversionInfo = await calculateAdvanceWithConversion(
                advanceAmount, 
                addAmountCurrency, 
                finalPricePLN,
                rateToUse // Pass custom rate
              );
              
              if (conversionInfo) {
                const remainingPLN = finalPricePLN - conversionInfo.advanceInPLN;
                const remainingInCurrency = productSaleCurrency === 'PLN' 
                  ? remainingPLN 
                  : await CurrencyService.convertCurrency(remainingPLN, 'PLN', productSaleCurrency);
                
                finalReason = `Zaliczka na produkt: ${productName}. ` +
                  `Cena: ${finalPricePLN.toFixed(2)} PLN` + 
                  (productSaleCurrency !== 'PLN' ? ` (${productPriceInCurrency} ${productSaleCurrency})` : '') +
                  `. Zaliczka: ${advanceAmount} ${addAmountCurrency} = ${conversionInfo.advanceInPLN.toFixed(2)} PLN` +
                  `. Pozostało: ${remainingInCurrency.toFixed(2)} ${productSaleCurrency}`;
              }
            } catch (error) {
              Logger.error('Currency conversion error:', error);
              // Fallback to simple calculation
              const remaining = finalPricePLN - advanceAmount;
              finalReason = `Zaliczka na produkt: ${productName}. Cena finalna: ${finalPricePLN.toFixed(2)} PLN, Dopłata: ${remaining.toFixed(2)} PLN`;
            }
          } else {
            // Both in PLN - simple calculation
            const remaining = finalPricePLN - advanceAmount;
            const remainingInDisplayCurrency = productSaleCurrency === 'PLN' 
              ? remaining 
              : parseFloat(productPriceInCurrency) - advanceAmount;
              
            finalReason = `Zaliczka na produkt: ${productName}. ` +
              `Cena: ${finalPricePLN.toFixed(2)} PLN` + 
              (productSaleCurrency !== 'PLN' ? ` (${productPriceInCurrency} ${productSaleCurrency})` : '') +
              `. Pozostało: ${remainingInDisplayCurrency.toFixed(2)} ${productSaleCurrency}`;
          }
        } else {
          finalReason = `Zaliczka na produkt: ${productName}`;
        }
      } else {
        finalReason = addAmountReason.trim();
      }
      
      const sellingPointValue = user.sellingPoint || user.symbol;
      
      const operationData = {
        userSymbol: user.symbol,
        amount: parseFloat(addAmountAmount), // Positive amount for addition
        currency: addAmountCurrency,
        type: "addition",
        reason: finalReason,
        date: new Date().toISOString(),
        sellingPoint: sellingPointValue, // 🔧 Dodane dla prowizji wszystkich pracowników
        // Add currency conversion info
        ...(conversionInfo && {
          currencyConversion: {
            originalAmount: conversionInfo.advanceAmount,
            originalCurrency: conversionInfo.advanceCurrency,
            convertedAmount: conversionInfo.advanceInPLN,
            exchangeRate: conversionInfo.exchangeRate,
            conversionDate: conversionInfo.conversionDate
          }
        })
      };

      // Add product-related data if it's a product transaction
      if (reasonType === 'product') {
        if (selectedProduct) {
          let productFullName;
          
          // Find the selected product object
          const selectedProductObj = products.find(p => (p.id || p._id) === selectedProduct) || 
                                      stateData?.find(p => (p.id || p._id) === selectedProduct);
          
          if (selectedProductObj) {
            productFullName = selectedProductObj.fullName || selectedProductObj.Tow_Opis || selectedProductObj.code || selectedProductObj.Tow_Kod || 'Nieznany produkt';
            
            // Add size to product name if selected
            if (sizeSearchQuery) {
              productFullName += ` ${sizeSearchQuery}`;
            }
            
          } else {
            productFullName = 'Nieznany produkt';
          }
          
          operationData.productId = selectedProduct;
          operationData.productName = productFullName;
          operationData.productSize = sizeSearchQuery || null; // Store size separately
        } else {
          operationData.productName = 'Produkt do wyboru';
        }
        
        // Always include final price for product advances - ALWAYS IN PLN for turnover calculation
        if (productFinalPrice) {
          const finalPricePLN = parseFloat(productFinalPrice); // Input is always in PLN
          
          operationData.finalPrice = finalPricePLN; // Always PLN for turnover and web display
          operationData.finalPricePLN = finalPricePLN; // Explicit PLN price
          operationData.remainingAmount = finalPricePLN - (conversionInfo?.advanceInPLN || parseFloat(addAmountAmount));
          
          // Add display currency info for mobile app only
          operationData.productDisplayCurrency = productSaleCurrency;
          if (productSaleCurrency !== 'PLN' && productPriceInCurrency) {
            operationData.finalPriceInDisplayCurrency = parseFloat(productPriceInCurrency);
          }
        }
      }
      
      if (isEditingAddAmount && editingOperationDate) {
        operationData.date = editingOperationDate;
      }

      const requestUrl = isEditingAddAmount && editingOperationId
        ? getApiUrl(`/financial-operations/${editingOperationId}`)
        : getApiUrl("/financial-operations");

      const requestMethod = isEditingAddAmount && editingOperationId ? "PUT" : "POST";

      const response = await tokenService.authenticatedFetch(requestUrl, {
        method: requestMethod,
        body: JSON.stringify(operationData),
      });
      
      if (!response.ok) {
        throw new Error("Failed to submit addition");
      }
      
      // Reset form and refresh data
      const wasEditing = isEditingAddAmount;
      resetAddAmountForm();
      
      // In test environment, add operation directly to state
      if (process.env.NODE_ENV === 'test') {
        const newOperation = {
          _id: Date.now().toString(),
          userSymbol: operationData.userSymbol,
          amount: operationData.amount,
          currency: operationData.currency,
          type: operationData.type,
          reason: operationData.reason,
          date: new Date().toISOString().split('T')[0] // Just date part for filtering
        };
        setDeductionsData(prev => [...prev, newOperation]);
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
      const response = await tokenService.authenticatedFetch(getApiUrl(`/financial-operations/${selectedDeductionItem._id}`), {
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

  const updateFromField = async () => {
    try {
      if (selectedItem?._id) {
        const updatedItem = { ...selectedItem, from: newFromValue }; // Update the 'from' field
        const response = await tokenService.authenticatedFetch(
          getApiUrl(`/sales/update-sales/${selectedItem._id}`),
          {
            method: "PATCH",
            body: JSON.stringify(updatedItem),
          }
        );
        if (!response.ok) {
          throw new Error("Failed to update the 'from' field.");
        }
        setFilteredData((prev) =>
          prev.map((item) => (item._id === selectedItem._id ? updatedItem : item))
        ); // Update the item in the list
        setEditFromModalVisible(false); // Close the modal
      } else {
        Logger.error("No valid ID found for the selected item.");
      }
    } catch (error) {
      Logger.error("Error updating 'from' field:", error.message);
    }
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
        if (tableRate && tableRate.buyRate) {
          setProductSaleCurrencyRate(tableRate.buyRate.toString());
        } else {
          const currentRate = await CurrencyService.getCurrencyRate(currency);
          setProductSaleCurrencyRate(currentRate.toString());
        }
        
        // Update local exchangeRates state immediately
        setExchangeRates(prev => ({
          ...prev,
          [currency]: tableRate && tableRate.buyRate ? tableRate.buyRate : currentRate
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

  // Function to calculate advance percentage with currency conversion
  const calculateAdvanceWithConversion = async (advanceAmount, advanceCurrency, productPricePLN, customRate = null) => {
    try {
      // If custom rate provided, use it temporarily
      if (customRate && customRate > 0) {
        // Manual conversion with custom rate
        const multiplier = getMultiplier(advanceCurrency);
        const advanceInPLN = (advanceAmount / multiplier) * customRate;
        const percentage = (advanceInPLN / productPricePLN) * 100;
        
        return {
          advanceAmount,
          advanceCurrency,
          advanceInPLN: Math.round(advanceInPLN * 100) / 100,
          productPrice: productPricePLN,
          percentage: Math.round(percentage * 100) / 100,
          exchangeRate: customRate,
          conversionDate: new Date().toISOString()
        };
      } else {
        // Use stored rate via service
        const calculation = await CurrencyService.calculateAdvancePercentage(
          advanceAmount, 
          advanceCurrency, 
          productPricePLN
        );
        return calculation;
      }
    } catch (error) {
      Logger.error('Error calculating advance percentage:', error);
      return null;
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
        <LogoutButton position="top-right" />
        <FlatList
          testID="home-flatlist"
          data={filteredData}
          keyExtractor={(item, index) => item?._id?.toString() || index.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item, index }) => (
            <View style={styles.item}>
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
              <TouchableOpacity onPress={() => { setSelectedItem(item); setModalVisible(true); }} style={styles.dotsButton}>
                <Text style={styles.dotsText}>⋮</Text>
              </TouchableOpacity>
            </View>
          )}
          ListHeaderComponent={() => {
            return (
              <View style={{ marginVertical: 24, paddingHorizontal: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <View style={{ width: '100%' }}>
                    <View style={styles.screenHeader}>
                      <View style={styles.screenHeaderIcon}>
                        <Ionicons name="cart" size={30} color="#fff" />
                      </View>
                      <Text style={styles.screenHeaderTitle}>Sprzedaż</Text>
                      <Text style={styles.screenHeaderSubtitle}>
                        {user?.email} · {new Date().toLocaleDateString('pl-PL', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </Text>
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
                
                {/* Button for adding salespersons - kept at top for quick access */}
                <View style={{ 
                  flexDirection: "column", 
                  marginBottom: 10,
                }}>
                  <TouchableOpacity
                    testID="add-salesperson-button"
                    style={styles.primaryButton}
                    onPress={() => setSalespersonModalVisible(true)}
                  >
                    <Ionicons name="person-add" size={20} color="#fff" />
                    <Text style={styles.primaryButtonText}>
                      Dodaj sprzedawców
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {/* Available funds display */}
                {(() => {
                  const userSymbol = user?.symbol || 'PLN';
                  const mainCurrency = userSymbol === 'P' ? 'PLN' : userSymbol;
                  const mainAmount = availableFunds[mainCurrency] || 0;
                  
                  return (
                    <View style={styles.fundsCard}>
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
                        {`${mainAmount.toFixed(2)} ${mainCurrency}`}
                      </Text>
                      {/* Show other currencies if available */}
                      {Object.entries(availableFunds).filter(([currency]) => currency !== mainCurrency).map(([currency, amount]) => (
                        <Text key={currency} style={{
                          color: tc('muted', '#9ca3af'),
                          fontSize: 12,
                          marginTop: 2
                        }}>
                          {currency}: {amount.toFixed(2)}
                        </Text>
                      ))}
                      </View>
                    </View>
                  );
                })()}
                
                <Text style={styles.sectionLabel}>Sprzedaż dzisiaj</Text>
              </View>
            );
          }}
          ListFooterComponent={() => {
            // Only show transfers with a valid date matching today
            // FOR TESTING: Uncomment line below to simulate tomorrow
            // const today = '2025-08-11'; // TEST: Simulate tomorrow (dzień później)
            const today = new Date().toISOString().split('T')[0]; // NORMAL: Real today
            const transferredToday = transferredItems.filter(
              item => item.date && item.date.startsWith(today) && item.transfer_to !== 'SOLD'
            );
            const receivedToday = receivedItems.filter(
              item => item.date && item.date.startsWith(today)
            );
            return (
              <View style={{ marginTop: 24 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, color: tc('muted', "#d1d5db"), fontWeight: "bold" }}>Suma:</Text>
                  <View style={{ flexDirection: "row" }}>
                    <Text style={{ fontSize: 13, color: tc('muted', "#d1d5db"), marginRight: 16 }}>Gotówki:</Text>
                    {Object.entries(totals.cash || {}).map(([currency, total]) => (
                      <Text key={`cash-${currency}`} style={{ fontSize: 10, color: tc('text', "#fff"), marginRight: 8 }}>
                        {total} {currency}
                      </Text>
                    ))}
                  </View>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                  <Text style={{ fontSize: 13, color: tc('muted', "#d1d5db"), marginRight: 16 }}>Na kartę:</Text>
                  {Object.entries(totals.card || {}).map(([currency, total]) => (
                    <Text key={`card-${currency}`} style={{ fontSize: 10, color: tc('text', "#fff"), marginRight: 8 }}>
                      {total} {currency}
                    </Text>
                  ))}
                </View>
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
                        style={styles.item}
                      >
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
                                  ? `Wymiana w punkcie ${item.reason.replace('Wymiana - ', '')}` 
                                  : `Wymiana${item.reason ? ` w punkcie ${item.reason}` : ''}`)
                              : `Przepisano do: ${item.transfer_to}`
                          }
                          {item.reason && (item.transfer_to?.toLowerCase() === 'dom' || item.transfer_to?.toLowerCase() === 'd') && (
                            <Text style={{ fontSize: 11, color: "#fbbf24" }}>
                              {' '}({item.reason.length > 15 ? item.reason.substring(0, 15) + '...' : item.reason})
                            </Text>
                          )}
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
                {/* Section for received items */}
                {receivedToday.length > 0 && (
                  <View style={{ marginTop: 24 }}>
                    <Text style={{ fontSize: 13, color: tc('muted', "#d1d5db"), fontWeight: "bold", marginBottom: 8 }}>Dopisać na to konto:</Text>
                    {receivedToday.map((item, index) => (
                      <View
                        key={item._id || `${item.productId || 'received'}-${index}`}
                        style={styles.receivedItem}
                      >
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
                

                {/* Financial Summary Section - Zamknięcie Dnia */}
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
                      if (!agreedPln || Number.isNaN(parseFloat(agreedPln))) {
                        return;
                      }
                      const amountPln = parseFloat(agreedPln);
                      additionsTotals.PLN = (additionsTotals.PLN || 0) + amountPln;
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

                  const getRateToPln = (currency) => {
                    if (!currency || currency === 'PLN') {
                      return 1;
                    }
                    const rate = currencyRates.find(item => item.currency.code === currency);
                    return rate && rate.buyRate ? rate.buyRate : 1;
                  };

                  const totalTurnoverPln = Object.entries(cashTotals).reduce(
                    (sum, [currency, total]) => sum + total * getRateToPln(currency),
                    0
                  ) + Object.entries(cardTotals).reduce(
                    (sum, [currency, total]) => sum + total * getRateToPln(currency),
                    0
                  ) + Object.entries(additionsTotals).reduce(
                    (sum, [currency, total]) => sum + total * getRateToPln(currency),
                    0
                  );
                  
                  return allCurrencies.size > 0 && (
                    <View style={{ 
                      marginTop: 32, 
                      paddingTop: 20, 
                      borderTopWidth: 2, 
                      borderTopColor: "#fbbf24", // Golden border
                      backgroundColor: tc('surface', "#1f2937"), // Dark gray background
                      padding: 16,
                      borderRadius: 8,
                      marginHorizontal: 8
                    }}>
                      <Text style={{ 
                        fontSize: 16, 
                        color: "#fbbf24", // Golden text
                        fontWeight: "bold", 
                        marginBottom: 16, 
                        textAlign: "center" 
                      }}>
                        🏦 ZAMKNIĘCIE DNIA
                      </Text>
                      
                      {/* Cash Sales */}
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 14, color: "#10b981", fontWeight: "bold", marginBottom: 4 }}>
                          💵 SPRZEDAŻ GOTÓWKĄ:
                        </Text>
                        {Object.entries(cashTotals).length > 0 ? (
                          Object.entries(cashTotals).map(([currency, total]) => (
                            <Text key={`cash-${currency}`} style={{ fontSize: 13, color: "#d1fae5", marginLeft: 16 }}>
                              +{total.toFixed(2)} {currency}
                            </Text>
                          ))
                        ) : (
                          <Text style={{ fontSize: 13, color: tc('muted', "#9ca3af"), marginLeft: 16, fontStyle: "italic" }}>
                            Brak płatności gotówką
                          </Text>
                        )}
                      </View>
                      
                      {/* Card Sales */}
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 14, color: "#3b82f6", fontWeight: "bold", marginBottom: 4 }}>
                          💳 SPRZEDAŻ KARTĄ:
                        </Text>
                        {Object.entries(cardTotals).length > 0 ? (
                          Object.entries(cardTotals).map(([currency, total]) => (
                            <Text key={`card-${currency}`} style={{ fontSize: 13, color: "#dbeafe", marginLeft: 16 }}>
                              +{total.toFixed(2)} {currency}
                            </Text>
                          ))
                        ) : (
                          <Text style={{ fontSize: 13, color: tc('muted', "#9ca3af"), marginLeft: 16, fontStyle: "italic" }}>
                            Brak płatności kartą
                          </Text>
                        )}
                      </View>
                      
                      {/* Advances */}
                      {Object.keys(advancesTotals).length > 0 && (
                        <View style={{ marginBottom: 12 }}>
                          <Text style={{ fontSize: 14, color: "#3b82f6", fontWeight: "bold", marginBottom: 4 }}>
                            💰 ZALICZKI (od klientów):
                          </Text>
                          {Object.entries(advancesTotals).map(([currency, total]) => (
                            <Text key={`advances-${currency}`} style={{ fontSize: 13, color: "#dbeafe", marginLeft: 16 }}>
                              +{total.toFixed(2)} {currency}
                            </Text>
                          ))}
                        </View>
                      )}
                      
                      {/* Financial Operations */}
                      {Object.keys(operationsTotals).length > 0 && (
                        <View style={{ marginBottom: 12 }}>
                          <Text style={{ fontSize: 14, color: "#fbbf24", fontWeight: "bold", marginBottom: 4 }}>
                            OPERACJE FINANSOWE (BILANS):
                          </Text>
                          {Object.entries(operationsTotals).map(([currency, total]) => (
                            <Text key={`operations-${currency}`} style={{ 
                              fontSize: 13, 
                              color: total >= 0 ? "#10b981" : "#fecaca", 
                              marginLeft: 16 
                            }}>
                              {total >= 0 ? '+' : ''}{total.toFixed(2)} {currency}
                            </Text>
                          ))}
                        </View>
                      )}
                      
                      {/* Final Cash Total */}
                      <View style={{ 
                        marginTop: 16, 
                        paddingTop: 12, 
                        borderTopWidth: 1, 
                        borderTopColor: "#10b981" 
                      }}>
                        <Text style={{ 
                          fontSize: 15, 
                          color: "#10b981", 
                          fontWeight: "bold", 
                          marginBottom: 8,
                          textAlign: "center" 
                        }}>
                          💵 GOTÓWKA W KASIE:
                        </Text>
                        {Object.entries(finalCashTotals).length > 0 ? (
                          Object.entries(finalCashTotals).map(([currency, total]) => (
                            <Text 
                              key={`final-cash-${currency}`} 
                              style={{ 
                                fontSize: 16, 
                                color: total >= 0 ? "#10b981" : "#ef4444", 
                                fontWeight: "bold",
                                textAlign: "center",
                                marginBottom: 2
                              }}
                            >
                              {total >= 0 ? '+' : ''}{total.toFixed(2)} {currency}
                            </Text>
                          ))
                        ) : (
                          <Text style={{ fontSize: 13, color: tc('muted', "#9ca3af"), textAlign: "center", fontStyle: "italic" }}>
                            0.00 PLN
                          </Text>
                        )}
                        <Text style={{ 
                          fontSize: 11, 
                          color: tc('muted', "#9ca3af"), 
                          textAlign: "center",
                          marginTop: 8,
                          fontStyle: "italic" 
                        }}>
                          Kwota gotówki którą powinieneś mieć w kasie
                        </Text>
                      </View>
                      
                      {/* Final Card Total */}
                      <View style={{ 
                        marginTop: 16, 
                        paddingTop: 12, 
                        borderTopWidth: 1, 
                        borderTopColor: "#3b82f6" 
                      }}>
                        <Text style={{ 
                          fontSize: 15, 
                          color: "#3b82f6", 
                          fontWeight: "bold", 
                          marginBottom: 8,
                          textAlign: "center" 
                        }}>
                          💳 ZAMKNIĘCIE TERMINALA:
                        </Text>
                        {(() => {
                          const nonZeroCardTotals = Object.entries(finalCardTotals).filter(([currency, total]) => total !== 0);
                          
                          if (nonZeroCardTotals.length === 0) {
                            return (
                              <Text style={{ fontSize: 16, color: "#3b82f6", textAlign: "center", fontWeight: "bold" }}>
                                0.00 PLN
                              </Text>
                            );
                          }
                          
                          return nonZeroCardTotals.map(([currency, total]) => (
                            <Text 
                              key={`final-card-${currency}`} 
                              style={{ 
                                fontSize: 16, 
                                color: total >= 0 ? "#3b82f6" : "#ef4444", 
                                fontWeight: "bold",
                                textAlign: "center",
                                marginBottom: 2
                              }}
                            >
                              {total >= 0 ? '+' : ''}{total.toFixed(2)} {currency}
                            </Text>
                          ));
                        })()}
                        <Text style={{ 
                          fontSize: 11, 
                          color: tc('muted', "#9ca3af"), 
                          textAlign: "center",
                          marginTop: 8,
                          fontStyle: "italic" 
                        }}>
                          Kwota płatności kartą (terminal na koniec dnia)
                        </Text>
                      </View>

                      {/* Total Turnover in PLN */}
                      <View style={{
                        marginTop: 16,
                        paddingTop: 12,
                        borderTopWidth: 1,
                        borderTopColor: "#fbbf24"
                      }}>
                        <Text style={{
                          fontSize: 15,
                          color: "#fbbf24",
                          fontWeight: "bold",
                          marginBottom: 6,
                          textAlign: "center"
                        }}>
                          📊 OBRÓT DNIA (PLN):
                        </Text>
                        <Text style={{
                          fontSize: 16,
                          color: "#fbbf24",
                          fontWeight: "bold",
                          textAlign: "center"
                        }}>
                          {totalTurnoverPln.toFixed(2)} PLN
                        </Text>
                        <Text style={{
                          fontSize: 11,
                          color: tc('muted', "#9ca3af"),
                          textAlign: "center",
                          marginTop: 8,
                          fontStyle: "italic"
                        }}>
                          Suma sprzedaży liczona do obrotu
                        </Text>
                      </View>
                    </View>
                  );
                })()}
                
                {/* Utility buttons moved to bottom of page */}
                <View style={{ 
                  flexDirection: "column", 
                  marginTop: 24,
                  marginBottom: 20,
                  paddingHorizontal: 16,
                }}>
                  <TouchableOpacity
                    testID="deduct-amount-button"
                    style={{
                      backgroundColor: '#0D6EFD',
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'transparent',
                      width: '100%',
                      marginBottom: 8,
                      alignItems: 'center',
                    }}
                    onPress={() => setDeductionModalVisible(true)}
                  >
                    <Text style={{ color: tc('text', 'white'), fontSize: 14, fontWeight: 'bold' }}>
                      Odpisz kwotę
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    testID="add-amount-button"
                    style={{
                      backgroundColor: '#0D6EFD',
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'transparent',
                      width: '100%',
                      marginBottom: 8,
                      alignItems: 'center',
                    }}
                    onPress={() => setAddAmountModalVisible(true)}
                  >
                    <Text style={{ color: tc('text', 'white'), fontSize: 14, fontWeight: 'bold' }}>
                      Dopisz kwotę
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    testID="currency-rates-button"
                    style={{
                      backgroundColor: '#0D6EFD',
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'transparent',
                      width: '100%',
                      marginBottom: 8,
                      alignItems: 'center',
                    }}
                    onPress={() => setCurrencyRatesModalVisible(true)}
                  >
                    <Text style={{ color: tc('text', 'white'), fontSize: 14, fontWeight: 'bold' }}>
                      Aktualne kursy walut
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    testID="currency-calculator-button"
                    style={{
                      backgroundColor: '#0D6EFD',
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'transparent',
                      width: '100%',
                      alignItems: 'center',
                    }}
                    onPress={() => setCalculatorModalVisible(true)}
                  >
                    <Text style={{ color: tc('text', 'white'), fontSize: 14, fontWeight: 'bold' }}>
                      Kalkulator walut
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: Math.max(120, insets.bottom + 120) }}
        />
        {/* Edit Modal - Identyczny z QRScanner */}
        <Modal
          transparent={false}
          visible={editModalVisible}
          animationType="slide"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: tc('bg', "black"), width: "100%", height: "100%", justifyContent: "flex-start", alignItems: "center", zIndex: 5 }}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: Math.max(120, insets.bottom + 120) }}>
                <View style={[{ flex: 1, backgroundColor: tc('bg', "black"), width: "100%", height: "100%", justifyContent: "flex-start", alignItems: "center", zIndex: 5 }]}>
                  <Pressable
                    style={{
                      position: "absolute",
                      top: 40,
                      right: 20,
                      width: 40,
                      height: 40,
                      backgroundColor: "red",
                      borderRadius: 20,
                      justifyContent: "center",
                      alignItems: "center",
                      zIndex: 10
                    }}
                    onPress={() => setEditModalVisible(false)}
                  >
                    <Text style={{ color: tc('text', "white"), fontSize: 18, fontWeight: "bold" }}>X</Text>
                  </Pressable>
                  
                  <Text style={{ fontSize: 16, color: tc('text', "white"), marginBottom: 8, marginTop: 80 }}>Edytuj Produkt:</Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: tc('border', '#475569'),
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      color: tc('text', "white"),
                      backgroundColor: tc('surface', "black"),
                      marginBottom: 20,
                      width: "100%"
                    }}
                    value={editData?.fullName || ""}
                    editable={false}
                    placeholder="Nazwa produktu"
                    placeholderTextColor="gray"
                  />
                  
                  <Text style={{ fontSize: 16, color: tc('text', "white"), marginBottom: 8 }}>Rozmiar</Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: tc('border', '#475569'),
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      color: tc('text', "white"),
                      backgroundColor: tc('surface', "black"),
                      marginBottom: 20,
                      width: "100%"
                    }}
                    value={editData?.size || ""}
                    editable={false}
                    placeholder="Rozmiar"
                    placeholderTextColor="gray"
                  />
                  
                  <Text style={{ fontSize: 16, color: tc('text', "white"), marginBottom: 8 }}>Sprzedano od:</Text>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: tc('border', '#475569'),
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      marginBottom: 20,
                      width: "100%",
                    }}
                  >
                    <TouchableOpacity
                      style={{
                        height: 40,
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: tc('surface', "black"),
                        borderRadius: 10,
                      }}
                      onPress={() => {
                        const matchingSymbols = getMatchingSymbols();
                        
                        if (matchingSymbols.length > 0) {
                          setSymbolSelectionVisible(true);
                        } else {
                          setErrorMessage("Nie znaleziono punktów sprzedaży w Twojej lokalizacji.");
                          setErrorModalVisible(true);
                        }
                      }}
                    >
                      <Text style={{ color: tc('text', "white") }}>
                        {editData?.from || "Wybierz punkt sprzedaży"}
                      </Text>
                    </TouchableOpacity>
                  </View>

                {/* Cash Payment Section */}
                <Text style={{ fontSize: 16, marginBottom: 10, textAlign: "center", color: tc('text', "white") }}>Płatność gotówką</Text>
                <View style={{ width: "100%", borderWidth: 1, borderColor: tc('border', '#475569'), padding: 20 }}>
                  {cashPriceCurrencyPairs.map((pair, index) => (
                    <View key={`cash-${index}`} style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
                      <TextInput
                        style={{
                          flex: 1,
                          height: 40,
                          borderColor: tc('border', '#475569'),
                          borderWidth: 1,
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          color: tc('text', "white"),
                          backgroundColor: tc('surface', "black"),
                          marginRight: 10,
                        }}
                        value={pair.price}
                        onChangeText={(value) => {
                          const numericValue = value.replace(/[^0-9.]/g, "");
                          handleCashPairChange(index, "price", numericValue);
                        }}
                        placeholder="Wpisz kwotę"
                        keyboardType="numeric"
                      />
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          height: 40,
                          justifyContent: "center",
                          alignItems: "center",
                          backgroundColor: tc('surface', "black"),
                          borderColor: tc('border', '#475569'),
                          borderWidth: 1,
                          borderRadius: 10,
                        }}
                        onPress={() => openCurrencyModal(index, "cash")}
                      >
                        <Text style={{ color: tc('text', "white") }}>{pair.currency}</Text>
                      </TouchableOpacity>
                      {index > 0 && (
                        <TouchableOpacity
                          style={{
                            marginLeft: 10,
                            paddingVertical: 5,
                            paddingHorizontal: 10,
                            backgroundColor: "red",
                            borderRadius: 10,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                          onPress={() => handleRemoveCashPair(index)}
                        >
                          <Text style={{ color: tc('text', "white") }}>Usuń</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <Pressable style={{ marginTop: 10, padding: 10, backgroundColor: "rgb(13, 110, 253)", borderRadius: 10, alignItems: "center" }} onPress={handleAddCashPair}>
                    <Text style={{ color: tc('text', "white"), fontSize: 16 }}>Dodaj parę</Text>
                  </Pressable>
                </View>

                {/* Card Payment Section */}
                <Text style={{ fontSize: 16, marginBottom: 10, marginTop: 20, textAlign: "center", color: tc('text', "white") }}>Płatność kartą</Text>
                <View style={{ width: "100%", borderWidth: 1, borderColor: tc('border', '#475569'), padding: 20 }}>
                  {cardPriceCurrencyPairs.map((pair, index) => (
                    <View key={`card-${index}`} style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
                      <TextInput
                        style={{
                          flex: 1,
                          height: 40,
                          borderColor: tc('border', '#475569'),
                          borderWidth: 1,
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          color: tc('text', "white"),
                          backgroundColor: tc('surface', "black"),
                          marginRight: 10,
                        }}
                        value={pair.price}
                        onChangeText={(value) => {
                          const numericValue = value.replace(/[^0-9.]/g, "");
                          handleCardPairChange(index, "price", numericValue);
                        }}
                        placeholder="Wpisz kwotę"
                        keyboardType="numeric"
                      />
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          height: 40,
                          justifyContent: "center",
                          alignItems: "center",
                          backgroundColor: tc('surface', "black"),
                          borderColor: tc('border', '#475569'),
                          borderWidth: 1,
                          borderRadius: 10,
                        }}
                        onPress={() => openCurrencyModal(index, "card")}
                      >
                        <Text style={{ color: tc('text', "white") }}>{pair.currency}</Text>
                      </TouchableOpacity>
                      {index > 0 && (
                        <TouchableOpacity
                          style={{
                            marginLeft: 10,
                            paddingVertical: 5,
                            paddingHorizontal: 10,
                            backgroundColor: "red",
                            borderRadius: 10,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                          onPress={() => handleRemoveCardPair(index)}
                        >
                          <Text style={{ color: tc('text', "white") }}>Usuń</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <Pressable style={{ marginTop: 10, padding: 10, backgroundColor: "rgb(13, 110, 253)", borderRadius: 10, alignItems: "center" }} onPress={handleAddCardPair}>
                    <Text style={{ color: tc('text', "white"), fontSize: 16 }}>Dodaj parę</Text>
                  </Pressable>
                </View>

                {/* Checkbox Odbiór */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: 20,
                    marginBottom: 10,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: 'transparent',
                    borderRadius: 10,
                    backgroundColor: editData?.isPickup ? 'rgb(13, 110, 253)' : 'transparent',
                  }}
                  onPress={() => {
                    setEditData((prev) => ({ ...prev, isPickup: !prev?.isPickup }));
                  }}
                >
                  <View style={{
                    width: 24,
                    height: 24,
                    borderWidth: 2,
                    borderColor: tc('border', '#475569'),
                    borderRadius: 6,
                    marginRight: 10,
                    backgroundColor: editData?.isPickup ? 'rgb(13, 110, 253)' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {editData?.isPickup && <Text style={{ color: tc('text', 'white'), fontSize: 16 }}>✓</Text>}
                  </View>
                  <Text style={{ color: tc('text', 'white'), fontSize: 16 }}>Odbiór (dopłata do zaliczki)</Text>
                </TouchableOpacity>

                {/* Przyciski identyczne z QRScanner */}
                <View style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 20,
                  width: "100%",
                }}>
                  <Pressable
                    style={{
                      flex: 1,
                      marginHorizontal: 10,
                      paddingVertical: 14,
                      borderRadius: 12,
                      alignItems: "center",
                      backgroundColor: "#6B7280",
                    }}
                    onPress={() => setEditModalVisible(false)}
                  >
                    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>Anuluj</Text>
                  </Pressable>
                  <Pressable
                    style={{
                      flex: 1,
                      marginHorizontal: 10,
                      paddingVertical: 14,
                      borderRadius: 12,
                      alignItems: "center",
                      backgroundColor: "#10B981",
                    }}
                    onPress={updateItem}
                  >
                    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>Zapisz</Text>
                  </Pressable>
                </View>
                </View>
              </ScrollView>
            </TouchableWithoutFeedback>
          </View>
        </Modal>
        {/* Edit From Modal */}
        <Modal
          transparent={true}
          visible={editFromModalVisible}
          animationType="fade"
          onRequestClose={() => setEditFromModalVisible(false)}
        >
          <View className="flex-1 justify-center items-center bg-black bg-opacity-50">
            <View
              className="w-3/4 rounded-lg shadow-lg"
              style={{
                backgroundColor: tc('bg', "black"),
                borderWidth: 1,
                borderColor: tc('border', '#475569'),
              }}
            >
              <View
                className="p-4 rounded-t-lg"
                style={{
                  backgroundColor: tc('bg', "black"),
                }}
              >
                <Text className="text-lg font-bold text-white text-center">Edytuj Miejsce</Text>
              </View>
              <View className="p-6">
                <TextInput
                  style={{
                    backgroundColor: "white",
                    color: "black",
                    padding: 10,
                    borderRadius: 10,
                    marginBottom: 10,
                  }}
                  value={newFromValue}
                  onChangeText={(text) => setNewFromValue(text)} // Update the new 'from' value
                  placeholder="Wprowadź nowe miejsce"
                />
                <Pressable
                  onPress={updateFromField}
                  style={{
                    backgroundColor: "#0d6efd",
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderRadius: 12,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "bold", textAlign: "center" }}>Zapisz</Text>
                </Pressable>
                <Pressable
                  onPress={() => setEditFromModalVisible(false)}
                  style={{
                    backgroundColor: "#6c757d",
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderRadius: 12,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "bold", textAlign: "center" }}>Anuluj</Text>
                </Pressable>
              </View>
            </View>
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
              <Text style={styles.currencyModalTitle}>Wybierz punkt sprzedaży</Text>
              {getMatchingSymbols().length > 0 ? (
                <FlatList
                  data={getMatchingSymbols()}
                  keyExtractor={(item) => item._id || item.symbol}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.currencyModalItem}
                      onPress={() => {
                        setEditData((prev) => ({ ...prev, from: item.symbol })); // Update 'from' field
                        setSymbolSelectionVisible(false); // Close modal
                      }}
                    >
                      <Text style={styles.currencyModalItemText}>
                        {item.symbol}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              ) : (
                <Text style={styles.currencyModalItemText}>
                  {`Brak punktów sprzedaży w lokalizacji "${user?.location || 'nieznana'}"`}
                </Text>
              )}
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
              <TouchableOpacity
                onPress={handleCancelTransferredItem}
                style={[styles.optionButton, styles.deleteButton]}
              >
                <Text style={styles.optionText}>Anuluj odpisanie</Text>
              </TouchableOpacity>
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
          <Modal
            transparent
            animationType="slide"
            visible={currencyModalVisible}
            onRequestClose={() => setCurrencyModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Wybierz walutę</Text>
                <Text style={{ color: tc('muted', '#a1a1aa'), textAlign: 'center', fontSize: 14, marginBottom: 15 }}>
                  Wybierz walutę dla płatności
                </Text>
                
                <ScrollView style={{ maxHeight: 400, width: '100%', marginVertical: 15 }}>
                  {availableCurrencies.map((item) => (
                    <TouchableOpacity
                      key={item.code}
                      style={styles.optionButton}
                      onPress={() => selectCurrencyFromModal(item.code)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.optionText, { width: 60 }]}>{item.code}</Text>
                        <Text style={{ color: '#a1a1aa', fontSize: 12, flex: 1, marginLeft: 10 }}>{item.name}</Text>
                        <Text style={{ color: '#60a5fa', fontSize: 12, fontWeight: '500', marginLeft: 10 }}>{item.buyRate}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                
                <TouchableOpacity
                  style={[styles.optionButton, styles.closeButton]}
                  onPress={() => setCurrencyModalVisible(false)}
                >
                  <Text style={styles.closeText}>Zamknij</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
        
        {/* Deduction Modal */}
        <Modal
          transparent={true}
          visible={deductionModalVisible}
          animationType="fade"
          onRequestClose={() => setDeductionModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { width: '85%', maxHeight: '90%' }]}>
              <Text style={styles.modalTitle}>Odpisz kwotę</Text>
              
              <ScrollView 
                style={{ width: '100%' }}
                contentContainerStyle={{ paddingBottom: Math.max(120, insets.bottom + 120) }}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
              
              {/* Available funds display */}
              {(() => {
                const currentAvailable = availableFunds[deductionCurrency] || 0;
                return (
                  <View style={{ 
                    width: '100%', 
                    marginBottom: 15, 
                    backgroundColor: tc('surface2', '#374151'), 
                    padding: 10, 
                    borderRadius: 10 
                  }}>
                    <Text style={{ 
                      color: '#10b981', 
                      fontSize: 13, 
                      textAlign: 'center', 
                      fontWeight: 'bold' 
                    }}>
                      💰 Dostępne środki w {deductionCurrency}: {currentAvailable.toFixed(2)}
                    </Text>
                    {Object.keys(availableFunds).length > 1 && (
                      <Text style={{ 
                        color: tc('muted', '#9ca3af'), 
                        fontSize: 11, 
                        textAlign: 'center', 
                        marginTop: 4 
                      }}>
                        Inne waluty: {Object.entries(availableFunds)
                          .filter(([currency]) => currency !== deductionCurrency)
                          .map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`)
                          .join(', ')}
                      </Text>
                    )}
                  </View>
                );
              })()}
              
              {/* Amount input */}
              <View style={{ width: '100%', marginBottom: 15 }}>
                <Text style={{ color: tc('text', '#fff'), fontSize: 14, marginBottom: 8 }}>Kwota:</Text>
                <TextInput
                  style={{
                    backgroundColor: tc('surface', 'black'),
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 16,
                    color: tc('text', 'white'),
                    borderWidth: 1,
                    borderColor: tc('border', '#475569'),
                    textAlign: 'center',
                  }}
                  placeholder="0.00"
                  placeholderTextColor={tc('muted', "#ccc")}
                  value={deductionAmount}
                  onChangeText={setDeductionAmount}
                  keyboardType="numeric"
                />
              </View>
              
              {/* Currency selection */}
              <View style={{ width: '100%', marginBottom: 15 }}>
                <Text style={{ color: tc('text', '#fff'), fontSize: 14, marginBottom: 8 }}>Waluta:</Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#dc3545', // Red for deduction
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 8,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'transparent',
                  }}
                  onPress={() => setDeductionCurrencyModalVisible(true)}
                >
                  <Text style={{ color: tc('text', '#fff'), fontSize: 16, fontWeight: 'bold' }}>
                    {deductionCurrency}
                  </Text>
                </TouchableOpacity>
              </View>
              
              {/* Currency rate input - show only for non-PLN currencies */}
              {showDeductionRateInput && deductionCurrency !== 'PLN' && (
                <View style={{ width: '100%', marginBottom: 20 }}>
                  <Text style={{ color: tc('text', '#fff'), fontSize: 14, marginBottom: 8 }}>
                    Kurs {deductionCurrency} (1 {deductionCurrency} = ? PLN):
                  </Text>
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
                    }}
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
                <Text style={{ color: tc('text', '#fff'), fontSize: 14, marginBottom: 8 }}>Typ odpisania:</Text>
                
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 8,
                    paddingVertical: 8,
                  }}
                  onPress={() => setDeductionType("other")}
                >
                  <View style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: tc('border', '#475569'),
                    marginRight: 10,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    {deductionType === "other" && (
                      <View style={{
                        width: 10,
                        height: 10,
                        borderRadius: 10,
                        backgroundColor: '#0d6efd',
                      }} />
                    )}
                  </View>
                  <Text style={{ color: '#fff', fontSize: 14 }}>Inne odpisanie</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 8,
                    paddingVertical: 8,
                  }}
                  onPress={() => setDeductionType("employee_advance")}
                >
                  <View style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: tc('border', '#475569'),
                    marginRight: 10,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    {deductionType === "employee_advance" && (
                      <View style={{
                        width: 10,
                        height: 10,
                        borderRadius: 10,
                        backgroundColor: '#0d6efd',
                      }} />
                    )}
                  </View>
                  <Text style={{ color: '#fff', fontSize: 14 }}>Zaliczka pracownika</Text>
                </TouchableOpacity>
              </View>
              
              {/* Wybór pracownika dla zaliczki */}
              {deductionType === "employee_advance" && (
                <View style={{ width: '100%', marginBottom: 15 }}>
                  <Text style={{ color: tc('text', '#fff'), fontSize: 14, marginBottom: 8 }}>Wybierz pracownika:</Text>
                  <TouchableOpacity
                    style={{
                      backgroundColor: selectedEmployeeForAdvance ? '#10b981' : '#0d6efd',
                      borderWidth: 1,
                      borderColor: 'transparent',
                      borderRadius: 8,
                      padding: 12,
                      alignItems: 'center',
                    }}
                    onPress={() => setDeductionEmployeeModalVisible(true)}
                  >
                    <Text style={{ color: tc('text', '#fff'), fontSize: 14, fontWeight: 'bold' }}>
                      {selectedEmployeeForAdvance 
                        ? `${selectedEmployeeForAdvance.firstName} ${selectedEmployeeForAdvance.lastName}${selectedEmployeeForAdvance.employeeId ? ` (ID: ${selectedEmployeeForAdvance.employeeId})` : ''}`
                        : 'Wybierz pracownika'
                      }
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              
              {/* Reason input */}
              <View style={{ width: '100%', marginBottom: 20 }}>
                <Text style={{ color: tc('text', '#fff'), fontSize: 14, marginBottom: 8 }}>
                  {deductionType === "employee_advance" ? "Dodatkowe uwagi (opcjonalne):" : "Powód odpisania:"}
                </Text>
                <TextInput
                  style={{
                    backgroundColor: tc('surface', 'black'),
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 14,
                    color: tc('text', 'white'),
                    borderWidth: 1,
                    borderColor: tc('border', '#475569'),
                    minHeight: 80,
                    textAlignVertical: 'top',
                  }}
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
                    backgroundColor: '#28a745',
                    paddingVertical: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                  }}
                  onPress={submitDeduction}
                  testID="submit-deduction-button"
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                    Odpisz kwotę
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{
                    backgroundColor: '#dc3545',
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
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                    Anuluj
                  </Text>
                </TouchableOpacity>
              </View>
              </ScrollView>
            </View>
          </View>
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

              {selectedOperationItem && (selectedOperationItem.type === 'addition' || selectedOperationItem.amount > 0) && (
                <TouchableOpacity
                  style={[styles.optionButton, { backgroundColor: '#0d6efd', marginBottom: 10 }]}
                  onPress={() => openEditAddAmountModal(selectedOperationItem)}
                >
                  <Text style={styles.optionText}>Edytuj zaliczkę</Text>
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
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { width: '85%', maxHeight: '90%' }]}>
              <Text style={styles.modalTitle}>
                {isEditingAddAmount ? 'Edytuj zaliczkę' : 'Dopisz kwotę'}
              </Text>
              
              <ScrollView 
                style={{ width: '100%' }}
                contentContainerStyle={{ paddingBottom: Math.max(120, insets.bottom + 120) }}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
              
              {/* Amount input */}
              <View style={{ width: '100%', marginBottom: 15 }}>
                <Text style={{ color: tc('text', '#fff'), fontSize: 14, marginBottom: 8 }}>Kwota jaką klient wpłaca:</Text>
                <TextInput
                  style={{
                    backgroundColor: tc('surface', 'black'),
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 16,
                    color: tc('text', 'white'),
                    borderWidth: 1,
                    borderColor: '#0d6efd', // Blue border for addition
                    textAlign: 'center',
                  }}
                  placeholder="0.00"
                  placeholderTextColor={tc('muted', "#ccc")}
                  value={addAmountAmount}
                  onChangeText={setAddAmountAmount}
                  keyboardType="numeric"
                />
              </View>
              
              {/* Currency selection */}
              <View style={{ width: '100%', marginBottom: 15 }}>
                <Text style={{ color: tc('text', '#fff'), fontSize: 14, marginBottom: 8 }}>Waluta zaliczki:</Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#0d6efd', // Blue for addition
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 8,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'transparent',
                  }}
                  onPress={() => setAddAmountCurrencyModalVisible(true)}
                >
                  <Text style={{ color: tc('text', '#fff'), fontSize: 16, fontWeight: 'bold' }}>
                    {addAmountCurrency}
                  </Text>
                </TouchableOpacity>
              </View>
              
              {/* Currency rate input - show only for non-PLN currencies */}
              {showAddAmountRateInput && addAmountCurrency !== 'PLN' && (
                <View style={{ width: '100%', marginBottom: 20 }}>
                  <Text style={{
                    color: '#4ecdc4',
                    fontSize: 14,
                    textAlign: 'center',
                    fontWeight: 'bold'
                  }}>
                    1 {addAmountCurrency} = {addAmountCurrencyRate ? parseFloat(addAmountCurrencyRate).toFixed(2) : '?'} PLN
                  </Text>
                </View>
              )}
              
              {/* Reason selection */}
              <View style={{ width: '100%', marginBottom: 20 }}>
                <Text style={{ color: tc('text', '#fff'), fontSize: 14, marginBottom: 8 }}>Powód dopisania:</Text>
                
                {/* Radio buttons */}
                <View style={{ marginBottom: 15 }}>
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                    onPress={() => {
                      Logger.debug('Selected product radio');
                      setReasonType('product');
                      setProductType('standard');
                      setAddAmountReason('');
                      setShowProductDropdown(false);
                    }}
                  >
                    <View style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: '#0d6efd',
                      backgroundColor: reasonType === 'product' ? '#0d6efd' : 'transparent',
                      marginRight: 10,
                    }} />
                    <Text style={{ color: '#fff', fontSize: 14 }}>Zaliczka na produkt</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      setReasonType('other');
                      setSelectedProduct('');
                      setProductFinalPrice('');
                    }}
                  >
                    <View style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: '#0d6efd',
                      backgroundColor: reasonType === 'other' ? '#0d6efd' : 'transparent',
                      marginRight: 10,
                    }} />
                    <Text style={{ color: '#fff', fontSize: 14 }}>Inny powód dopisania</Text>
                  </TouchableOpacity>
                </View>

                {/* Conditional product search */}
                {reasonType === 'product' && (
                  <View style={{ marginBottom: 15 }}>
                    {/* Standard Product Selection */}
                    <View>
                      <Text style={{ color: tc('text', '#fff'), fontSize: 12, marginBottom: 5 }}>Produkt standardowy:</Text>
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#0d6efd',
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: 'transparent',
                          marginBottom: 10,
                        }}
                        onPress={() => {
                          setProductType('standard');
                          setQrScannerVisible(true);
                          setScanned(false);
                        }}
                      >
                        <Text style={{ color: tc('text', 'white'), fontSize: 14, fontWeight: 'bold' }}>
                          Skanuj produkt
                        </Text>
                      </TouchableOpacity>

                      <Text style={{ color: tc('text', '#fff'), fontSize: 12, marginBottom: 5 }}>Wybierz produkt:</Text>
                      <TextInput
                        style={{
                          backgroundColor: tc('surface', 'black'),
                          borderRadius: 8,
                          padding: 12,
                          fontSize: 14,
                          color: tc('text', 'white'),
                          borderWidth: 1,
                          borderColor: '#0d6efd',
                          marginBottom: 10,
                        }}
                        placeholder="Wpisz nazwę lub kod produktu..."
                        placeholderTextColor={tc('muted', "#ccc")}
                        value={productSearchQuery}
                        onChangeText={(text) => {
                          setProductSearchQuery(text);
                          setShowProductDropdown(true);
                          setProductScanned(false);
                        }}
                        onFocus={() => {
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
                                  <Text style={{ color: '#fff', fontSize: 13 }}>
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
                          <Text style={{ color: tc('text', '#fff'), fontSize: 12, marginBottom: 5, marginTop: 10 }}>Wybierz rozmiar:</Text>
                          <TextInput
                            style={{
                              backgroundColor: tc('surface', 'black'),
                              borderRadius: 8,
                              padding: 12,
                              fontSize: 14,
                              color: tc('text', 'white'),
                              borderWidth: 1,
                              borderColor: '#0d6efd',
                              marginBottom: 10,
                            }}
                            placeholder="Wpisz rozmiar..."
                            placeholderTextColor={tc('muted', "#ccc")}
                            value={sizeSearchQuery}
                            onChangeText={(text) => {
                              setSizeSearchQuery(text);
                              setShowSizeDropdown(true);
                            }}
                            onFocus={() => setShowSizeDropdown(true)}
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
                                      <Text style={{ color: '#fff', fontSize: 13 }}>
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
                    
                    {/* Product final price input - when product advance is selected */}
                    {reasonType === 'product' && (
                      <View style={{ marginTop: 15 }}>
                        <Text style={{ color: tc('text', '#fff'), fontSize: 12, marginBottom: 5 }}>
                          Uzgodniona cena finalna produktu (w PLN - dla obrotu):
                        </Text>
                        <TextInput
                          style={{
                            backgroundColor: tc('surface', 'black'),
                            borderRadius: 8,
                            padding: 12,
                            fontSize: 14,
                            color: tc('text', 'white'),
                            borderWidth: 1,
                            borderColor: '#0d6efd',
                            textAlign: 'center',
                          }}
                          placeholder="0.00 PLN"
                          placeholderTextColor={tc('muted', "#ccc")}
                          value={productFinalPrice}
                          onChangeText={(value) => {
                            setProductFinalPrice(value);
                            // Convert price to selected currency when user types
                            if (value && parseFloat(value) > 0) {
                              convertProductPrice(parseFloat(value), productSaleCurrency);
                            }
                          }}
                          keyboardType="numeric"
                        />

                        {/* Product Currency Selection */}
                        <View style={{ marginTop: 15 }}>
                          <Text style={{ color: tc('text', '#fff'), fontSize: 12, marginBottom: 5 }}>
                            Waluta w której klient dopłaci:
                          </Text>
                          <TouchableOpacity
                            testID="product-currency-select-button"
                            style={{
                              backgroundColor: '#0d6efd',
                              borderRadius: 8,
                              padding: 12,
                              borderWidth: 1,
                              borderColor: 'transparent',
                              alignItems: 'center',
                            }}
                            onPress={() => setProductCurrencyModalVisible(true)}
                          >
                            <Text style={{ color: tc('text', 'white'), fontSize: 14, fontWeight: 'bold' }}>
                              {productSaleCurrency}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {/* Currency rate for product - show only for non-PLN currencies */}
                        {showProductRateInput && productSaleCurrency !== 'PLN' && (
                          <View style={{ width: '100%', marginTop: 15 }}>
                            <Text style={{
                              color: '#4ecdc4',
                              fontSize: 14,
                              textAlign: 'center',
                              fontWeight: 'bold'
                            }}>
                              1 {productSaleCurrency} = {productSaleCurrencyRate ? parseFloat(productSaleCurrencyRate).toFixed(2) : '?'} PLN
                            </Text>
                          </View>
                        )}

                        {/* Show converted price if product is selected and has price */}
                        {productFinalPrice && (
                          <View style={{
                            marginTop: 10,
                            padding: 10,
                            backgroundColor: tc('surface', '#1a1a2e'),
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: '#4ecdc4',
                          }}>
                            <Text style={{ color: '#4ecdc4', fontSize: 12, textAlign: 'center', fontWeight: 'bold', marginBottom: 8 }}>
                              Cena dla klienta:
                            </Text>
                            
                            {/* Price in PLN (always) */}
                            <Text style={{ color: tc('text', '#fff'), fontSize: 14, textAlign: 'center', marginBottom: 3 }}>
                              PLN: {parseFloat(productFinalPrice).toFixed(2)}
                            </Text>
                            
                            {/* Price in deposit currency if different from PLN */}
                            {addAmountCurrency && addAmountCurrency !== 'PLN' && (
                              <Text style={{ color: '#0d6efd', fontSize: 14, textAlign: 'center', marginBottom: 3 }}>
                                {addAmountCurrency}: {(() => {
                                  const rate = addAmountCurrencyRate && parseFloat(addAmountCurrencyRate) > 0 
                                    ? parseFloat(addAmountCurrencyRate) 
                                    : exchangeRates[addAmountCurrency] || 1;
                                  const multiplier = getMultiplier(addAmountCurrency);
                                  return ((parseFloat(productFinalPrice) / rate) * multiplier).toFixed(2);
                                })()}
                              </Text>
                            )}
                            
                            {/* Price in payment currency if different from PLN and deposit currency */}
                            {productSaleCurrency && productSaleCurrency !== 'PLN' && productSaleCurrency !== addAmountCurrency && (
                              <Text style={{ color: '#f39c12', fontSize: 14, textAlign: 'center', marginBottom: 3 }}>
                                {productSaleCurrency}: {(() => {
                                  const rate = productSaleCurrencyRate && parseFloat(productSaleCurrencyRate) > 0 
                                    ? parseFloat(productSaleCurrencyRate) 
                                    : exchangeRates[productSaleCurrency] || 1;
                                  const multiplier = getMultiplier(productSaleCurrency);
                                  return ((parseFloat(productFinalPrice) / rate) * multiplier).toFixed(2);
                                })()}
                              </Text>
                            )}
                          </View>
                        )}
                        
                        {/* Show calculation when both amounts are filled */}
                        {productFinalPrice && addAmountAmount && (
                          <View style={{
                            marginTop: 10,
                            padding: 10,
                            backgroundColor: tc('surface2', '#333'),
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: '#0d6efd',
                          }}>
                            {/* Advance Amount */}
                            <Text style={{ color: tc('text', '#fff'), fontSize: 13, textAlign: 'center' }}>
                              <Text style={{ fontWeight: 'bold' }}>Zaliczka:</Text> {parseFloat(addAmountAmount || 0).toFixed(2)} {addAmountCurrency}
                              {addAmountCurrency !== 'PLN' && (
                                <Text style={{ color: tc('muted', '#ccc'), fontSize: 11 }}>
                                  {' '}(≈ {(() => {
                                      // Use rate from table (cached in state)
                                      const rate = addAmountCurrencyRate && parseFloat(addAmountCurrencyRate) > 0
                                        ? parseFloat(addAmountCurrencyRate)
                                        : exchangeRates[addAmountCurrency] || 1;
                                    return (parseFloat(addAmountAmount || 0) * rate).toFixed(2);
                                  })()} PLN)
                                </Text>
                              )}
                            </Text>
                            
                            {/* Product Price */}
                            <Text style={{ color: tc('text', '#fff'), fontSize: 13, textAlign: 'center', marginTop: 3 }}>
                              <Text style={{ fontWeight: 'bold' }}>Cena dla obrotu:</Text> {parseFloat(productFinalPrice || 0).toFixed(2)} PLN
                            </Text>
                            
                            {/* Remaining Amount Calculation */}
                            <View style={{
                              marginTop: 8,
                              padding: 8,
                              backgroundColor: tc('surface', '#1a1a2e'),
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: '#4ecdc4',
                            }}>
                              <Text style={{ 
                                color: '#4ecdc4', 
                                fontSize: 12, 
                                textAlign: 'center',
                                fontWeight: 'bold'
                              }}>
                                POZOSTAŁO DO DOPŁATY:
                              </Text>
                              
                              {(() => {
                                const pricePLN = parseFloat(productFinalPrice || 0);
                                const advanceAmountNum = parseFloat(addAmountAmount || 0);
                                
                                // Convert advance to PLN if needed - use manual rate if provided
                                const advanceRate = addAmountCurrency === 'PLN' 
                                  ? 1 
                                  : (addAmountCurrencyRate && parseFloat(addAmountCurrencyRate) > 0 
                                    ? parseFloat(addAmountCurrencyRate) 
                                    : exchangeRates[addAmountCurrency] || 1);
                                
                                const advanceMultiplier = getMultiplier(addAmountCurrency);
                                const advanceInPLN = (advanceAmountNum / advanceMultiplier) * advanceRate;
                                const remainingPLN = pricePLN - advanceInPLN;
                                
                                // Convert remaining to display currency
                                const displayRate = productSaleCurrency === 'PLN'
                                  ? 1
                                  : (productSaleCurrencyRate && parseFloat(productSaleCurrencyRate) > 0
                                    ? parseFloat(productSaleCurrencyRate)
                                    : exchangeRates[productSaleCurrency] || 1);
                                const displayMultiplier = getMultiplier(productSaleCurrency);
                                const remainingInDisplayCurrency = productSaleCurrency === 'PLN'
                                  ? remainingPLN
                                  : (remainingPLN / displayRate) * displayMultiplier;
                                
                                return (
                                  <>
                                    <Text style={{ 
                                      color: remainingInDisplayCurrency > 0 ? '#ff6b6b' : '#0d6efd', 
                                      fontSize: 16, 
                                      textAlign: 'center', 
                                      marginTop: 5,
                                      fontWeight: 'bold'
                                    }}>
                                      {remainingInDisplayCurrency.toFixed(2)} {productSaleCurrency}
                                    </Text>
                                    
                                    {/* Show PLN equivalent if display currency is different */}
                                    {productSaleCurrency !== 'PLN' && (
                                      <Text style={{ 
                                        color: tc('muted', '#ccc'), 
                                        fontSize: 11, 
                                        textAlign: 'center', 
                                        marginTop: 2
                                      }}>
                                        (≈ {remainingPLN.toFixed(2)} PLN)
                                      </Text>
                                    )}
                                  </>
                                );
                              })()}
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {/* Conditional text input */}
                {reasonType === 'other' && (
                  <TextInput
                    style={{
                      backgroundColor: tc('surface', 'black'),
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 14,
                      color: tc('text', 'white'),
                      borderWidth: 1,
                      borderColor: '#10b981',
                      minHeight: 80,
                      textAlignVertical: 'top',
                    }}
                    placeholder="Wpisz powód dopisania kwoty..."
                    placeholderTextColor={tc('muted', "#ccc")}
                    value={addAmountReason}
                    onChangeText={setAddAmountReason}
                    multiline={true}
                    numberOfLines={3}
                  />
                )}
              </View>
              
              {/* Action buttons */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#0d6efd',
                    paddingVertical: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                  }}
                  onPress={submitAddAmount}
                  testID="submit-addition-button"
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                    {isEditingAddAmount ? 'Aktualizuj kwotę' : 'Dopisz kwotę'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{
                    backgroundColor: '#dc3545',
                    paddingVertical: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                  }}
                  onPress={() => {
                    setAddAmountModalVisible(false);
                    setAddAmountAmount("");
                    setAddAmountCurrency("PLN");
                    setAddAmountReason("");
                    setReasonType("");
                    setProductType("custom");
                    setCustomProductName("");
                    setSelectedStock("");
                    setSelectedColor("");
                    setSelectedSize("");
                    setSelectedProduct("");
                    setProductSearchQuery("");
                    setShowProductDropdown(false);
                    setProductFinalPrice("");
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                    Anuluj
                  </Text>
                </TouchableOpacity>
              </View>
              </ScrollView>
            </View>
          </View>
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
                    backgroundColor: '#ef4444',
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
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Anuluj</Text>
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
          <View style={styles.workHoursModalOverlay}>
            <View style={styles.workHoursModalContent}>
              <Text style={styles.workHoursModalTitle}>
                Ustaw godziny pracy
              </Text>
              
              {selectedEmployeeForHours && (
                <Text style={styles.workHoursEmployeeName}>
                  {selectedEmployeeForHours.firstName} {selectedEmployeeForHours.lastName}
                </Text>
              )}
              
              <Text style={styles.workHoursDateText}>
                Data: {new Date().toLocaleDateString('pl-PL')}
              </Text>

              <View style={styles.workHoursTimeContainer}>
                <View style={styles.workHoursTimeSection}>
                  <Text style={styles.workHoursTimeLabel}>Godzina rozpoczęcia:</Text>
                  <TouchableOpacity
                    style={{
                      backgroundColor: tc('surface', '#000000'),
                      borderWidth: 1,
                      borderColor: tc('border', '#6b7280'),
                      borderRadius: 8,
                      padding: 12,
                      alignItems: 'center'
                    }}
                    onPress={() => {
                      const [h, m] = workStartTime.split(':');
                      setTempHour(parseInt(h));
                      setTempMinute(parseInt(m));
                      setShowStartTimePicker(true);
                    }}
                  >
                    <Text style={{ color: tc('text', 'white'), fontSize: 16, fontWeight: 'bold' }}>
                      {workStartTime}
                    </Text>
                  </TouchableOpacity>
                  {showStartTimePicker && (
                    <Modal transparent visible={showStartTimePicker} animationType="fade">
                      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
                        <View style={{ backgroundColor: tc('surface', '#000000'), borderRadius: 12, padding: 20, width: 300, borderWidth: 1, borderColor: tc('border', '#6b7280') }}>
                          <Text style={{ color: tc('text', 'white'), fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>
                            Wybierz godzinę rozpoczęcia
                          </Text>
                          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                            <View style={{ alignItems: 'center' }}>
                              <TouchableOpacity onPress={() => setTempHour((tempHour + 1) % 24)} style={{ padding: 10 }}>
                                <Text style={{ color: tc('text', 'white'), fontSize: 24 }}>▲</Text>
                              </TouchableOpacity>
                              <Text style={{ color: tc('text', 'white'), fontSize: 32, fontWeight: 'bold', minWidth: 60, textAlign: 'center' }}>
                                {tempHour.toString().padStart(2, '0')}
                              </Text>
                              <TouchableOpacity onPress={() => setTempHour((tempHour - 1 + 24) % 24)} style={{ padding: 10 }}>
                                <Text style={{ color: tc('text', 'white'), fontSize: 24 }}>▼</Text>
                              </TouchableOpacity>
                            </View>
                            <Text style={{ color: tc('text', 'white'), fontSize: 32, fontWeight: 'bold', marginHorizontal: 10 }}>:</Text>
                            <View style={{ alignItems: 'center' }}>
                              <TouchableOpacity onPress={() => setTempMinute((tempMinute + 1) % 60)} style={{ padding: 10 }}>
                                <Text style={{ color: tc('text', 'white'), fontSize: 24 }}>▲</Text>
                              </TouchableOpacity>
                              <Text style={{ color: tc('text', 'white'), fontSize: 32, fontWeight: 'bold', minWidth: 60, textAlign: 'center' }}>
                                {tempMinute.toString().padStart(2, '0')}
                              </Text>
                              <TouchableOpacity onPress={() => setTempMinute((tempMinute - 1 + 60) % 60)} style={{ padding: 10 }}>
                                <Text style={{ color: tc('text', 'white'), fontSize: 24 }}>▼</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <TouchableOpacity
                              onPress={() => setShowStartTimePicker(false)}
                              style={{ backgroundColor: '#6b7280', padding: 14, borderRadius: 12, flex: 1, marginRight: 8 }}
                            >
                              <Text style={{ color: tc('text', 'white'), textAlign: 'center', fontWeight: 'bold' }}>Anuluj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                setWorkStartTime(`${tempHour.toString().padStart(2, '0')}:${tempMinute.toString().padStart(2, '0')}`);
                                setShowStartTimePicker(false);
                              }}
                              style={{ backgroundColor: '#3b82f6', padding: 14, borderRadius: 12, flex: 1, marginLeft: 8 }}
                            >
                              <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>OK</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </Modal>
                  )}
                </View>

                <View style={styles.workHoursTimeSection}>
                  <Text style={styles.workHoursTimeLabel}>Godzina zakończenia:</Text>
                  <TouchableOpacity
                    style={{
                      backgroundColor: tc('surface', '#000000'),
                      borderWidth: 1,
                      borderColor: tc('border', '#6b7280'),
                      borderRadius: 8,
                      padding: 12,
                      alignItems: 'center'
                    }}
                    onPress={() => {
                      const [h, m] = workEndTime.split(':');
                      setTempHour(parseInt(h));
                      setTempMinute(parseInt(m));
                      setShowEndTimePicker(true);
                    }}
                  >
                    <Text style={{ color: tc('text', 'white'), fontSize: 16, fontWeight: 'bold' }}>
                      {workEndTime}
                    </Text>
                  </TouchableOpacity>
                  {showEndTimePicker && (
                    <Modal transparent visible={showEndTimePicker} animationType="fade">
                      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
                        <View style={{ backgroundColor: tc('surface', '#000000'), borderRadius: 12, padding: 20, width: 300, borderWidth: 1, borderColor: tc('border', '#6b7280') }}>
                          <Text style={{ color: tc('text', 'white'), fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>
                            Wybierz godzinę zakończenia
                          </Text>
                          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                            <View style={{ alignItems: 'center' }}>
                              <TouchableOpacity onPress={() => setTempHour((tempHour + 1) % 24)} style={{ padding: 10 }}>
                                <Text style={{ color: tc('text', 'white'), fontSize: 24 }}>▲</Text>
                              </TouchableOpacity>
                              <Text style={{ color: tc('text', 'white'), fontSize: 32, fontWeight: 'bold', minWidth: 60, textAlign: 'center' }}>
                                {tempHour.toString().padStart(2, '0')}
                              </Text>
                              <TouchableOpacity onPress={() => setTempHour((tempHour - 1 + 24) % 24)} style={{ padding: 10 }}>
                                <Text style={{ color: tc('text', 'white'), fontSize: 24 }}>▼</Text>
                              </TouchableOpacity>
                            </View>
                            <Text style={{ color: tc('text', 'white'), fontSize: 32, fontWeight: 'bold', marginHorizontal: 10 }}>:</Text>
                            <View style={{ alignItems: 'center' }}>
                              <TouchableOpacity onPress={() => setTempMinute((tempMinute + 1) % 60)} style={{ padding: 10 }}>
                                <Text style={{ color: tc('text', 'white'), fontSize: 24 }}>▲</Text>
                              </TouchableOpacity>
                              <Text style={{ color: tc('text', 'white'), fontSize: 32, fontWeight: 'bold', minWidth: 60, textAlign: 'center' }}>
                                {tempMinute.toString().padStart(2, '0')}
                              </Text>
                              <TouchableOpacity onPress={() => setTempMinute((tempMinute - 1 + 60) % 60)} style={{ padding: 10 }}>
                                <Text style={{ color: tc('text', 'white'), fontSize: 24 }}>▼</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <TouchableOpacity
                              onPress={() => setShowEndTimePicker(false)}
                              style={{ backgroundColor: '#6b7280', padding: 14, borderRadius: 12, flex: 1, marginRight: 8 }}
                            >
                              <Text style={{ color: tc('text', 'white'), textAlign: 'center', fontWeight: 'bold' }}>Anuluj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                setWorkEndTime(`${tempHour.toString().padStart(2, '0')}:${tempMinute.toString().padStart(2, '0')}`);
                                setShowEndTimePicker(false);
                              }}
                              style={{ backgroundColor: '#3b82f6', padding: 14, borderRadius: 12, flex: 1, marginLeft: 8 }}
                            >
                              <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>OK</Text>
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
                const hourlyRate = selectedEmployeeForHours?.hourlyRate || 0;
                const dailyPay = totalHours * hourlyRate;

                return (
                  <View style={styles.workHoursPreview}>
                    <Text style={styles.workHoursPreviewText}>
                      ⏱️ Łączny czas pracy: {totalHours.toFixed(1)} godz.
                    </Text>
                    <Text style={styles.workHoursPreviewText}>
                      💰 Dzienna wypłata: {dailyPay.toFixed(2)} PLN
                    </Text>
                  </View>
                );
              })()}

              <View style={styles.workHoursNotesContainer}>
                <Text style={styles.workHoursNotesLabel}>Notatki (opcjonalne):</Text>
                <TextInput
                  style={styles.workHoursNotesInput}
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
                    backgroundColor: '#dc3545',
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
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                    ✕ Anuluj
                  </Text>
                </TouchableOpacity>
              </View>
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
          <View style={styles.successModalOverlay}>
            <View style={styles.successModalContent}>
              <View style={styles.successIconContainer}>
                <Text style={styles.successIcon}>✓</Text>
              </View>
              <Text style={styles.successModalTitle}>Sukces!</Text>
              <Text style={styles.successModalMessage}>
                {successMessage}
              </Text>
              
              <TouchableOpacity
                style={[styles.optionButton, { backgroundColor: '#0D6EFD', marginTop: 20, width: '90%' }]}
                onPress={() => setSuccessModalVisible(false)}
              >
                <Text style={styles.optionText}>OK</Text>
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
          <View style={styles.errorModalOverlay}>
            <View style={styles.errorModalContent}>
              <View style={styles.errorIconContainer}>
                <Text style={styles.errorIcon}>⚠</Text>
              </View>
              <Text style={styles.errorModalTitle}>Błąd!</Text>
              <Text style={styles.errorModalMessage}>
                {errorMessage}
              </Text>
              
              <TouchableOpacity
                style={[styles.optionButton, { backgroundColor: '#dc3545', marginTop: 20, width: '90%' }]}
                onPress={() => setErrorModalVisible(false)}
              >
                <Text style={styles.optionText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

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
                    backgroundColor: '#ef4444',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    flex: 1,
                    marginRight: 8,
                    alignItems: 'center'
                  }}
                  onPress={() => setConfirmDeleteModalVisible(false)}
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Anuluj</Text>
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
              <Text style={styles.modalTitle}>Potwierdź usunięcie</Text>
              
              <Text style={[styles.modalSubtitle, { marginBottom: 25, textAlign: 'center', lineHeight: 22 }]}>
                Czy na pewno chcesz usunąć sprzedawcę{'\n'}
                <Text style={{ fontWeight: 'bold', color: '#0D6EFD' }}>
                  {employeeToRemove?.firstName} {employeeToRemove?.lastName}
                </Text>
                {'\n'}z zespołu?
              </Text>

              <View style={{ width: '100%', alignItems: 'center', gap: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#dc3545',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    flex: 1,
                    marginRight: 8,
                    alignItems: 'center'
                  }}
                  onPress={() => handleRemoveEmployee(true)}
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                    ✓ Usuń
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    backgroundColor: '#ef4444',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    flex: 1,
                    marginLeft: 8,
                    alignItems: 'center'
                  }}
                  onPress={cancelRemoveEmployee}
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                    ✕ Anuluj
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Add Amount Currency Selection Modal */}
        <Modal
          transparent={true}
          animationType="slide"
          visible={addAmountCurrencyModalVisible}
          onRequestClose={() => setAddAmountCurrencyModalVisible(false)}
        >
          <View style={styles.currencyModalContainer}>
            <View style={styles.currencyModalContent}>
              <Text style={styles.currencyModalTitle}>Wybierz walutę</Text>
              <Text style={{ color: tc('muted', '#a1a1aa'), textAlign: 'center', fontSize: 14, marginBottom: 15 }}>
                Wybierz walutę dla płatności
              </Text>
              
              <FlatList
                data={currencyOptions}
                keyExtractor={(item) => item.code}
                style={{ width: '100%', marginVertical: 15 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.currencyModalItem}
                    onPress={() => selectCurrencyForAddAmount(item.code)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.currencyModalItemText, { width: 60 }]}>
                        {item.code}
                      </Text>
                      <Text style={{ color: '#a1a1aa', fontSize: 12, flex: 1, marginLeft: 10 }}>
                        {item.name}
                      </Text>
                      <Text style={{ color: '#60a5fa', fontSize: 12, fontWeight: '500', marginLeft: 10 }}>
                        {item.buyRate !== null && item.buyRate !== undefined ? item.buyRate : '-'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
              
              <TouchableOpacity
                style={styles.currencyModalCloseButton}
                onPress={() => setAddAmountCurrencyModalVisible(false)}
              >
                <Text style={styles.currencyModalCloseButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Deduction Currency Selection Modal */}
        <Modal
          transparent={true}
          animationType="slide"
          visible={deductionCurrencyModalVisible}
          onRequestClose={() => setDeductionCurrencyModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { width: '80%', maxHeight: '70%' }]}>
              <Text style={styles.modalTitle}>Wybierz walutę</Text>
              <Text style={{ color: tc('muted', '#a1a1aa'), textAlign: 'center', fontSize: 14, marginBottom: 15 }}>
                Wybierz walutę dla odpisanej kwoty
              </Text>
              
              <FlatList
                data={availableCurrencies}
                keyExtractor={(item) => item.code}
                style={{ width: '100%', marginVertical: 20 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{
                      backgroundColor: deductionCurrency === item.code ? '#dc3545' : 'transparent',
                      padding: 15,
                      borderRadius: 8,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: deductionCurrency === item.code ? 'white' : tc('border', '#444'),
                    }}
                    onPress={() => selectCurrencyForDeduction(item.code)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ 
                        color: deductionCurrency === item.code ? tc('text', 'white') : tc('muted', '#ccc'), 
                        fontSize: 16, 
                        fontWeight: deductionCurrency === item.code ? 'bold' : 'normal',
                        width: 60
                      }}>
                        {item.code}
                      </Text>
                      <Text style={{ color: tc('muted', '#a1a1aa'), fontSize: 12, flex: 1, marginLeft: 10 }}>{item.name}</Text>
                      <Text style={{ color: '#60a5fa', fontSize: 12, fontWeight: '500', marginLeft: 10 }}>{item.buyRate}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
              
              <TouchableOpacity
                style={[styles.optionButton, { backgroundColor: '#6c757d', marginTop: 10, width: '90%' }]}
                onPress={() => setDeductionCurrencyModalVisible(false)}
              >
                <Text style={styles.optionText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Product Currency Selection Modal */}
        <Modal
          transparent={true}
          animationType="slide"
          visible={productCurrencyModalVisible}
          onRequestClose={() => setProductCurrencyModalVisible(false)}
        >
          <View style={styles.currencyModalContainer}>
            <View style={styles.currencyModalContent}>
              <Text style={styles.currencyModalTitle}>Wybierz walutę dla klienta</Text>
              
              <FlatList
                testID="product-currency-flatlist"
                data={currencyOptions}
                keyExtractor={(item) => item.code}
                style={{ width: '100%', marginVertical: 15 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    testID={`product-currency-option-${item.code}`}
                    style={styles.currencyModalItem}
                    onPress={() => selectProductCurrency(item.code)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.currencyModalItemText, { width: 60 }]}>
                        {item.code}
                      </Text>
                      <Text style={{ color: '#a1a1aa', fontSize: 12, flex: 1, marginLeft: 10 }}>
                        {item.name}
                      </Text>
                      <Text style={{ color: '#60a5fa', fontSize: 12, fontWeight: '500', marginLeft: 10 }}>
                        {item.buyRate !== null && item.buyRate !== undefined ? item.buyRate : '-'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
              
              <TouchableOpacity
                testID="product-currency-close-button"
                style={styles.currencyModalCloseButton}
                onPress={() => setProductCurrencyModalVisible(false)}
              >
                <Text style={styles.currencyModalCloseButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Currency Rate Edit Modal */}
        <Modal
          transparent={true}
          animationType="slide"
          visible={currencyRateModalVisible}
          onRequestClose={cancelEditingRate}
        >
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
        </Modal>

        {/* Employee Selection Modal for Deduction */}
        <Modal
          key="deduction-employee-modal"
          animationType="slide"
          transparent={true}
          visible={deductionEmployeeModalVisible}
          onRequestClose={() => setDeductionEmployeeModalVisible(false)}
        >
          <View style={styles.salespersonModalOverlay}>
            <View style={styles.salespersonModalContent}>
              <Text style={styles.salespersonModalTitle}>Wybierz pracownika</Text>
              <Text style={{ color: tc('muted', '#a1a1aa'), textAlign: 'center', fontSize: 14, marginBottom: 15 }}>
                Wybierz pracownika dla zaliczki
              </Text>
              
              <ScrollView style={{ maxHeight: 400, width: '100%', marginVertical: 15 }}>
                {employees.length > 0 ? (
                  employees.map((employee) => {
                    const isSelected = selectedEmployeeForAdvance?._id === employee._id;
                    
                    return (
                      <TouchableOpacity
                        key={employee._id}
                        style={[styles.salespersonOptionButton, {
                          backgroundColor: isSelected ? '#10b981' : '#0d6efd'
                        }]}
                        onPress={() => {
                          setSelectedEmployeeForAdvance(employee);
                          setDeductionEmployeeModalVisible(false);
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
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            backgroundColor: isSelected ? '#ffffff' : 'transparent',
                            borderWidth: 2,
                            borderColor: tc('border', '#475569'),
                            justifyContent: 'center',
                            alignItems: 'center'
                          }}>
                            {isSelected && (
                              <Text style={{ color: '#10b981', fontSize: 14, fontWeight: 'bold' }}>✓</Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <Text style={{ color: tc('text', '#ffffff'), textAlign: 'center', fontSize: 16, marginVertical: 20 }}>
                    Brak dostępnych pracowników
                  </Text>
                )}
              </ScrollView>
              
              <View style={styles.salespersonModalButtonsContainer}>
                <TouchableOpacity
                  style={styles.salespersonModalCancelButton}
                  onPress={() => setDeductionEmployeeModalVisible(false)}
                >
                  <Text style={styles.salespersonModalButtonText}>Anuluj</Text>
                </TouchableOpacity>
              </View>
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
            {permission?.granted ? (
              <>
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                  barcodeScannerSettings={{
                    barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39"],
                  }}
                />
                <View style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: 20,
                  backgroundColor: 'rgba(0,0,0,0.7)',
                }}>
                  <Text style={{ color: tc('text', 'white'), fontSize: 16, textAlign: 'center', marginBottom: 15 }}>
                    Zeskanuj kod kreskowy produktu
                  </Text>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#dc3545',
                      padding: 15,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
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
                    <Text style={{ color: tc('text', 'white'), fontSize: 16, fontWeight: 'bold' }}>Anuluj</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <Text style={{ color: tc('text', 'white'), fontSize: 18, textAlign: 'center', marginBottom: 20 }}>
                  Brak uprawnień do kamery
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#0d6efd',
                    padding: 15,
                    borderRadius: 8,
                    marginBottom: 10,
                  }}
                  onPress={requestPermission}
                >
                  <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>Udziel uprawnień</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#dc3545',
                    padding: 15,
                    borderRadius: 8,
                  }}
                  onPress={() => {
                    setQrScannerVisible(false);
                    setScanned(false);
                    setProductScanned(false); // Reset when user closes scanner
                  }}
                >
                  <Text style={{ color: tc('text', 'white'), fontSize: 16, fontWeight: 'bold' }}>Zamknij</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Modal>

        {/* Currency Rates Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={currencyRatesModalVisible}
          onRequestClose={() => setCurrencyRatesModalVisible(false)}
        >
          <View style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}>
            <View style={{
              backgroundColor: tc('surface', '#1f2937'),
              borderRadius: 10,
              padding: 20,
              width: '90%',
              maxHeight: '80%',
            }}>
              <Text style={{
                fontSize: 20,
                fontWeight: 'bold',
                color: tc('text', 'white'),
                marginBottom: 15,
                textAlign: 'center',
              }}>
                Aktualne kursy walut
              </Text>

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
                      paddingVertical: 10,
                      paddingHorizontal: 20,
                      borderRadius: 10,
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
                    padding: 10,
                    borderRadius: 10,
                    marginBottom: 5,
                  }}>
                    <Text style={{ color: tc('text', 'white'), fontWeight: 'bold', flex: 1 }}>Waluta</Text>
                    <Text style={{ color: tc('text', 'white'), fontWeight: 'bold', flex: 1, textAlign: 'right' }}>Kupno</Text>
                    <Text style={{ color: tc('text', 'white'), fontWeight: 'bold', flex: 1, textAlign: 'right' }}>Sprzedaż</Text>
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
                        {rate.buyRate.toFixed(4)} PLN
                      </Text>
                      <Text style={{ color: tc('text', 'white'), flex: 1, textAlign: 'right' }}>
                        {rate.sellRate.toFixed(4)} PLN
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
                    paddingVertical: 12,
                    borderRadius: 10,
                    alignItems: 'center',
                  }}
                  onPress={fetchCurrencyRates}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold' }}>Odśwież</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: '#6c757d',
                    paddingVertical: 12,
                    borderRadius: 10,
                    alignItems: 'center',
                  }}
                  onPress={() => setCurrencyRatesModalVisible(false)}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold' }}>Zamknij</Text>
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
          <View style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}>
            <View style={{
              backgroundColor: tc('surface', '#1f2937'),
              borderRadius: 10,
              padding: 20,
              width: '90%',
            }}>
              <Text style={{
                fontSize: 20,
                fontWeight: 'bold',
                color: tc('text', 'white'),
                marginBottom: 20,
                textAlign: 'center',
              }}>
                Kalkulator walut
              </Text>

              {loadingCurrencyRates ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: tc('text', 'white') }}>Ładowanie kursów...</Text>
                </View>
              ) : (
                <>
                  {/* Amount Input */}
                  <View style={{ marginBottom: 15 }}>
                    <Text style={{ color: tc('text', 'white'), marginBottom: 5, fontWeight: 'bold' }}>
                      Kwota:
                    </Text>
                    <TextInput
                      style={{
                        backgroundColor: tc('surface2', '#374151'),
                        color: tc('text', 'white'),
                        padding: 12,
                        borderRadius: 10,
                        fontSize: 16,
                      }}
                      placeholder="Wprowadź kwotę"
                      placeholderTextColor={tc('muted', "#9ca3af")}
                      keyboardType="decimal-pad"
                      value={calculatorAmount}
                      onChangeText={setCalculatorAmount}
                    />
                  </View>

                  {/* From Currency Picker */}
                  <View style={{ marginBottom: 15 }}>
                    <Text style={{ color: tc('text', 'white'), marginBottom: 5, fontWeight: 'bold' }}>
                      Z waluty:
                    </Text>
                    <TouchableOpacity
                      style={{
                        backgroundColor: tc('surface2', '#374151'),
                        borderRadius: 10,
                        padding: 15,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                      onPress={() => setFromCurrencyModalVisible(true)}
                    >
                      <Text style={{ color: tc('text', 'white'), fontSize: 16 }}>
                        {calculatorFromCurrency === 'PLN' 
                          ? 'PLN - Polski złoty'
                          : `${calculatorFromCurrency} - ${currencyRates.find(r => r.currency.code === calculatorFromCurrency)?.currency.name || calculatorFromCurrency}`
                        }
                      </Text>
                      <Text style={{ color: tc('text', 'white'), fontSize: 18 }}>▼</Text>
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
                      <Text style={{ color: tc('text', 'white'), fontSize: 24, fontWeight: 'bold' }}>
                        ⇅
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* To Currency Picker */}
                  <View style={{ marginBottom: 15 }}>
                    <Text style={{ color: tc('text', 'white'), marginBottom: 5, fontWeight: 'bold' }}>
                      Na walutę:
                    </Text>
                    <TouchableOpacity
                      style={{
                        backgroundColor: tc('surface2', '#374151'),
                        borderRadius: 10,
                        padding: 15,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                      onPress={() => setToCurrencyModalVisible(true)}
                    >
                      <Text style={{ color: tc('text', 'white'), fontSize: 16 }}>
                        {calculatorToCurrency === 'PLN' 
                          ? 'PLN - Polski złoty'
                          : `${calculatorToCurrency} - ${currencyRates.find(r => r.currency.code === calculatorToCurrency)?.currency.name || calculatorToCurrency}`
                        }
                      </Text>
                      <Text style={{ color: tc('text', 'white'), fontSize: 18 }}>▼</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Convert Button */}
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#0D6EFD',
                      paddingVertical: 12,
                      borderRadius: 10,
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
                      padding: 15,
                      borderRadius: 10,
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
                  backgroundColor: '#6c757d',
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: 'center',
                }}
                onPress={() => {
                  setCalculatorModalVisible(false);
                  setCalculatorAmount("");
                  setCalculatorResult(null);
                }}
              >
                <Text style={{ color: tc('text', 'white'), fontWeight: 'bold' }}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* From Currency Selection Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={fromCurrencyModalVisible}
          onRequestClose={() => setFromCurrencyModalVisible(false)}
        >
          <View style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}>
            <View style={{
              backgroundColor: tc('surface', '#1f2937'),
              borderRadius: 10,
              padding: 20,
              width: '90%',
              maxHeight: '70%',
            }}>
              <Text style={{
                fontSize: 18,
                fontWeight: 'bold',
                color: tc('text', 'white'),
                marginBottom: 15,
                textAlign: 'center',
              }}>
                Wybierz walutę źródłową
              </Text>

              <ScrollView style={{ maxHeight: 400 }}>
                {/* PLN Option */}
                <TouchableOpacity
                  style={{
                    backgroundColor: calculatorFromCurrency === 'PLN' ? '#0D6EFD' : tc('surface2', '#374151'),
                    padding: 15,
                    borderRadius: 10,
                    marginBottom: 8,
                  }}
                  onPress={() => {
                    setCalculatorFromCurrency('PLN');
                    setFromCurrencyModalVisible(false);
                    setCalculatorResult(null);
                  }}
                >
                  <Text style={{ color: tc('text', 'white'), fontSize: 16, fontWeight: 'bold' }}>
                    PLN
                  </Text>
                  <Text style={{ color: tc('muted', '#9ca3af'), fontSize: 14 }}>
                    Polski złoty
                  </Text>
                </TouchableOpacity>

                {/* Foreign Currencies */}
                {currencyRates.map((rate) => (
                  <TouchableOpacity
                    key={rate.currency.code}
                    style={{
                      backgroundColor: calculatorFromCurrency === rate.currency.code ? '#0D6EFD' : tc('surface2', '#374151'),
                      padding: 15,
                      borderRadius: 10,
                      marginBottom: 8,
                    }}
                    onPress={() => {
                      setCalculatorFromCurrency(rate.currency.code);
                      setFromCurrencyModalVisible(false);
                      setCalculatorResult(null);
                    }}
                  >
                    <Text style={{ color: tc('text', 'white'), fontSize: 16, fontWeight: 'bold' }}>
                      {rate.currency.code}
                    </Text>
                    <Text style={{ color: tc('muted', '#9ca3af'), fontSize: 14 }}>
                      {rate.currency.name}
                    </Text>
                    <Text style={{ color: '#60a5fa', fontSize: 12, marginTop: 4 }}>
                      Kupno: {rate.buyRate.toFixed(4)} PLN
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={{
                  backgroundColor: '#6c757d',
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: 'center',
                  marginTop: 15,
                }}
                onPress={() => setFromCurrencyModalVisible(false)}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* To Currency Selection Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={toCurrencyModalVisible}
          onRequestClose={() => setToCurrencyModalVisible(false)}
        >
          <View style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}>
            <View style={{
              backgroundColor: tc('surface', '#1f2937'),
              borderRadius: 10,
              padding: 20,
              width: '90%',
              maxHeight: '70%',
            }}>
              <Text style={{
                fontSize: 18,
                fontWeight: 'bold',
                color: tc('text', 'white'),
                marginBottom: 15,
                textAlign: 'center',
              }}>
                Wybierz walutę docelową
              </Text>

              <ScrollView style={{ maxHeight: 400 }}>
                {/* PLN Option */}
                <TouchableOpacity
                  style={{
                    backgroundColor: calculatorToCurrency === 'PLN' ? '#0D6EFD' : tc('surface2', '#374151'),
                    padding: 15,
                    borderRadius: 10,
                    marginBottom: 8,
                  }}
                  onPress={() => {
                    setCalculatorToCurrency('PLN');
                    setToCurrencyModalVisible(false);
                    setCalculatorResult(null);
                  }}
                >
                  <Text style={{ color: tc('text', 'white'), fontSize: 16, fontWeight: 'bold' }}>
                    PLN
                  </Text>
                  <Text style={{ color: tc('muted', '#9ca3af'), fontSize: 14 }}>
                    Polski złoty
                  </Text>
                </TouchableOpacity>

                {/* Foreign Currencies */}
                {currencyRates.map((rate) => (
                  <TouchableOpacity
                    key={rate.currency.code}
                    style={{
                      backgroundColor: calculatorToCurrency === rate.currency.code ? '#0D6EFD' : tc('surface2', '#374151'),
                      padding: 15,
                      borderRadius: 10,
                      marginBottom: 8,
                    }}
                    onPress={() => {
                      setCalculatorToCurrency(rate.currency.code);
                      setToCurrencyModalVisible(false);
                      setCalculatorResult(null);
                    }}
                  >
                    <Text style={{ color: tc('text', 'white'), fontSize: 16, fontWeight: 'bold' }}>
                      {rate.currency.code}
                    </Text>
                    <Text style={{ color: tc('muted', '#9ca3af'), fontSize: 14 }}>
                      {rate.currency.name}
                    </Text>
                    <Text style={{ color: '#60a5fa', fontSize: 12, marginTop: 4 }}>
                      Kupno: {rate.buyRate.toFixed(4)} PLN
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={{
                  backgroundColor: '#6c757d',
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: 'center',
                  marginTop: 15,
                }}
                onPress={() => setToCurrencyModalVisible(false)}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  // ---- wygląd jak w panelu admina ----
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
    flex: 1,
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
  currencyModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  currencyModalContent: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
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
    backgroundColor: '#0d6efd',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#ffffff',
    alignItems: 'center',
    width: '100%',
    alignSelf: 'center',
  },
  currencyModalItemText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  currencyModalCloseButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#ffffff',
    alignItems: 'center',
    width: '100%',
    marginTop: 20,
    alignSelf: 'center',
  },
  currencyModalCloseButtonText: {
    color: "white",
    fontSize: 16,
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
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
    color: '#007bff',
    textAlign: 'center',
    marginBottom: 5,
  },
  workHoursDateText: {
    fontSize: 14,
    color: tc('text', '#e5e7eb'),
    textAlign: 'center',
    marginBottom: 16,
  },
  workHoursTimeContainer: {
    marginBottom: 16,
  },
  workHoursTimeSection: {
    marginBottom: 12,
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
    backgroundColor: tc('surface', 'black'),
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#007bff',
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



