import React, { useContext, useState, useEffect } from 'react';
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
import { IconButton, MenuCard, ModalHeader, ScreenHeader, look } from '../../components/AdminLook';
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
    bags,
    wallets,
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
  const [isHistoricalSale, setIsHistoricalSale] = useState(false);
  
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
  const [filteredTransactions, setFilteredTransactions] = useState([]);

  
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

  // Fetch transactions
  const fetchTransactions = React.useCallback(async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/cudzich/transactions?userSymbol=P&recipientId=cudzich'));
      
      if (response.ok) {
        const data = await response.json();
        setTransactions(data || []);
      }
    } catch (error) {
      Logger.error('Error fetching transactions:', error);
    }
  }, []);

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
        fetchTransactions(),
        fetchCudzichPriceList(),
        // Słowniki i stan tylko gdy nieświeże - wcześniej 8 pełnych pobrań przy każdym wejściu na zakładkę
        ensureData(['goods', 'sizes', 'stocks', 'colors', 'bags', 'wallets', 'state', 'users']),
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

  // Filter transactions by date
  useEffect(() => {
    if (!transactions || transactions.length === 0) {
      setFilteredTransactions([]);
      return;
    }

    let filtered = Array.isArray(transactions) ? transactions : [];

    if (filterStartDate || filterEndDate) {
      filtered = filtered.filter(transaction => {
        const transactionDate = new Date(transaction.date);
        const startDate = filterStartDate ? new Date(filterStartDate.setHours(0, 0, 0, 0)) : null;
        const endDate = filterEndDate ? new Date(filterEndDate.setHours(23, 59, 59, 999)) : null;

        if (startDate && endDate) {
          return transactionDate >= startDate && transactionDate <= endDate;
        } else if (startDate) {
          return transactionDate >= startDate;
        } else if (endDate) {
          return transactionDate <= endDate;
        }
        return true;
      });
    }

    setFilteredTransactions(filtered);
    // Filtered transactions updated
  }, [transactions, filterStartDate, filterEndDate]);

  // Auto-fetch price when product is selected (bez czekania na rozmiar)
  useEffect(() => {
    if (selectedProduct && cudzichPriceList) {
      const fetchedPrice = getPriceFromProduct(selectedProduct);
      setPrice(fetchedPrice.toString());
    }
  }, [selectedProduct, cudzichPriceList]);

  // Handle product selection
  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    setProductSearchText(product.fullName); // Set search text to selected product name
    setProductDropdownVisible(false);
    
    // Auto-fetch price
    const fetchedPrice = getPriceFromProduct(product);
    setPrice(fetchedPrice.toString());
  };

  // Handle size change (cena jest już ustawiona po wyborze produktu)


  // Create transaction
  const createTransaction = async (type) => {
    // Validate that a product is selected and text matches
    if (!selectedProduct) {
      appAlert('Błąd', 'Proszę wybrać produkt z listy');
      return;
    }

    // Validate that the search text matches the selected product
    if (productSearchText !== selectedProduct.fullName) {
      appAlert('Błąd', 'Proszę wybrać produkt z listy wyszukiwania');
      return;
    }

    // Validate that a size is selected from the list
    if (!selectedSize || !size) {
      appAlert('Błąd', 'Proszę wybrać rozmiar z listy');
      return;
    }

    if (!price) {
      appAlert('Błąd', 'Proszę wypełnić wszystkie wymagane pola');
      return;
    }

    if (parseFloat(price) <= 0) {
      appAlert('Błąd', 'Cena musi być większa od 0');
      return;
    }

    // User validation

    try {
      setLoading(true);
      
      const response = await tokenService.authenticatedFetch(getApiUrl('/cudzich/transactions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: type,
          productId: selectedProduct._id,
          productName: selectedProduct.fullName,
          size: size,
          price: parseFloat(price),
          userSymbol: 'P',
          recipientId: 'cudzich',
          notes: notes
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Handle historical sale creation or return marking if it's 'zwrot' type
        if (type === 'zwrot') {
          if (isHistoricalSale) {
            // Create historical sale first, then mark it as returned
            try {
              const historicalSaleResponse = await tokenService.authenticatedFetch(getApiUrl('/sales/create-historical-sale'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  fullName: selectedProduct.fullName,
                  size: size,
                  price: parseFloat(price),
                  sellingPoint: user?.sellingPoint || 'Unknown',
                  symbol: 'P',
                  source: 'Cudzich',
                  notes: 'Sprzedaż historyczna - dodana przy zwrocie',
                  historicalDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days ago as default
                })
              });
              
              if (historicalSaleResponse.ok) {
                
                // Now mark it as returned
                const returnResponse = await tokenService.authenticatedFetch(getApiUrl('/sales/mark-as-returned'), {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    fullName: selectedProduct.fullName,
                    size: size,
                    source: 'Cudzich',
                    returnReason: 'Zwrot produktu sprzedanego przed systemem',
                    returnDate: new Date().toISOString()
                  })
                });
                
                if (!returnResponse.ok) {
                  const returnError = await returnResponse.json();
                  Logger.warn('Warning: Could not mark historical sale as returned:', returnError.error);
                }
              } else {
                const historicalError = await historicalSaleResponse.json();
                Logger.warn('Warning: Could not create historical sale:', historicalError.error);
              }
            } catch (historicalError) {
              Logger.warn('Warning: Could not create historical sale:', historicalError);
            }
          } else {
            // Normal return - just mark existing sales as returned
            try {
              const returnResponse = await tokenService.authenticatedFetch(getApiUrl('/sales/mark-as-returned'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  fullName: selectedProduct.fullName,
                  size: size,
                  source: 'Cudzich',
                  returnReason: 'Zwrot przez Cudzich (formularz)',
                  returnDate: new Date().toISOString()
                })
              });
              
              if (!returnResponse.ok) {
                const returnError = await returnResponse.json();
                Logger.warn('Warning: Could not mark sales as returned (manual):', returnError.error);
              }
            } catch (returnError) {
              Logger.warn('Warning: Could not mark sales as returned (manual):', returnError);
            }
          }
        }
        
        setSuccessMessage(
          `${type === 'odbior' ? 'Odbiór' : 'Zwrot'} został zapisany\nNowe saldo: ${data.newBalance}zł`
        );
        setSuccessModalVisible(true);
        
        // Refresh data
        await Promise.all([fetchBalance(), fetchTransactions()]);
        
        // Reset form and close modal
        resetForm();
        setOdbiorModalVisible(false);
        setZwrotModalVisible(false);
      } else {
        const errorData = await response.json();
        appAlert('Błąd', errorData.error || 'Nie udało się zapisać transakcji');
      }
    } catch (error) {
      Logger.error('Error creating transaction:', error);
      appAlert('Błąd', 'Nie udało się połączyć z serwerem');
    } finally {
      setLoading(false);
    }
  };

  // Save scanned product transaction
  const saveTransaction = async (type, productName, productSize, productPrice, productNotes, scannedBarcode = '') => {
    try {
      setLoading(true);
      
      // Try to find productId based on productName from goods
      let productId = null;
      
      if (goods && Array.isArray(goods)) {
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
        return;
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
        
        // Mark related sales as returned if it's 'zwrot' type
        if (type === 'zwrot') {
          try {
            Logger.debug('DEBUG: Marking related sales as returned...');
            
            const returnResponse = await tokenService.authenticatedFetch(getApiUrl('/sales/mark-as-returned'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fullName: productName,
                size: productSize,
                source: 'Cudzich', // Only mark Cudzich sales as returned
                returnReason: 'Zwrot przez Cudzich',
                returnDate: new Date().toISOString()
              })
            });
            
            if (returnResponse.ok) {
              const returnData = await returnResponse.json();
              Logger.debug('DEBUG: Sales marked as returned:', returnData.modifiedCount);
            } else {
              const returnError = await returnResponse.json();
              Logger.warn('Warning: Could not mark sales as returned:', returnError.error);
            }
          } catch (returnError) {
            Logger.warn('Warning: Could not mark sales as returned:', returnError);
          }
        }
        
        setSuccessMessage(
          `${type === 'odbior' ? 'Odbiór' : 'Zwrot'} został zapisany\nProdukt: ${productName} ${productSize}\nCena: ${productPrice}zł\nNowe saldo: ${data.newBalance}zł`
        );
        setSuccessModalVisible(true);
        
        // Refresh data
        await Promise.all([fetchBalance(), fetchTransactions()]);
        
      } else {
        const errorData = await response.json();
        appAlert('Błąd', errorData.error || 'Nie udało się zapisać transakcji');
      }
    } catch (error) {
      Logger.error('Error saving scanned transaction:', error);
      appAlert('Błąd', 'Nie udało się połączyć z serwerem');
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
        await Promise.all([fetchBalance(), fetchTransactions()]);
        
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
    setIsHistoricalSale(false);
    setProductDropdownVisible(false);
    setSizeDropdownVisible(false);
  };

  // Reset payment form
  const resetPaymentForm = () => {
    setPaymentAmount('');
    setPaymentNotes('');
  };

  // QR Scanner functions (adapted from QRScanner.jsx)
  
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
      
      // Build the jacket name without size (for price lookup)
      const jacketNameWithoutSize = `${stockName || 'Nieznany'} ${colorName || 'Nieznany'}`;
      // Build the full jacket name with size (for display if needed)
      const jacketNameWithSize = `${stockName || 'Nieznany'} ${colorName || 'Nieznany'} ${sizeName || 'Nieznany'}`;
      
      return { 
        fullName: jacketNameWithoutSize, // Name without size for price lookup
        fullNameWithSize: jacketNameWithSize, // Full name with size
        sizeName: sizeName,
        sizeObj: sizeItem
      };
    } catch (error) {
      Logger.error("Error building jacket name from barcode:", error);
      return null;
    }
  };

  // Helper function to build bag name from barcode segments
  const buildBagNameFromBarcode = (barcodeData) => {
    try {
      if (barcodeData.length < 13) {
        return null;
      }

      const first3 = barcodeData.substring(0, 3);
      const colorCode = barcodeData.substring(3, 5);
      const rowNumber = barcodeData.substring(5, 9);
      const position6 = barcodeData.substring(5, 6);
      
      if (first3 !== "000" || position6 === "0") {
        return null;
      }

      const rowNumberInt = parseInt(rowNumber, 10);
      
      if (rowNumberInt === 0 || isNaN(rowNumberInt)) {
        return null;
      }

      const colorsArray = Array.isArray(colors) ? colors : (colors?.data || colors?.colors || []);
      const bagsArray = Array.isArray(bags) ? bags : (bags?.data || bags?.bags || []);
      
      if (!Array.isArray(colorsArray) || !Array.isArray(bagsArray)) {
        return null;
      }
      
      const colorItem = colorsArray.find(color => color.Kol_Kod === colorCode);
      const colorName = colorItem?.Kol_Opis || `Kolor_${colorCode}`;
      
      const bagItem = bagsArray.find(bag => parseInt(bag.Torebki_Nr, 10) === rowNumberInt);
      const bagName = bagItem?.Torebki_Kod || `Torebka_${rowNumberInt}`;
      
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
      if (barcodeData.length !== 13) {
        return null;
      }

      const first3 = barcodeData.substring(0, 3);
      const colorCode = barcodeData.substring(3, 5);
      const position6 = barcodeData.substring(5, 6);
      const position7 = barcodeData.substring(6, 7);
      const walletNumber = barcodeData.substring(6, 9);
      
      if (first3 !== "000" || position6 !== "0" || position7 === "0") {
        return null;
      }

      const walletNumberInt = parseInt(walletNumber, 10);
      
      if (walletNumberInt === 0 || isNaN(walletNumberInt)) {
        return null;
      }

      const colorsArray = Array.isArray(colors) ? colors : (colors?.data || colors?.colors || []);
      const walletsArray = Array.isArray(wallets) ? wallets : (wallets?.data || wallets?.wallets || []);
      
      if (!Array.isArray(colorsArray) || !Array.isArray(walletsArray)) {
        return null;
      }
      
      const colorItem = colorsArray.find(color => color.Kol_Kod === colorCode);
      const colorName = colorItem?.Kol_Opis || `Kolor_${colorCode}`;
      
      const walletItem = walletsArray.find(wallet => parseInt(wallet.Portfele_Nr, 10) === walletNumberInt);
      const walletName = walletItem?.Portfele_Kod || `Portfel_${walletNumberInt}`;
      
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
      if (barcodeData.length < 9) {
        return null;
      }

      const first3 = barcodeData.substring(0, 3);
      const colorCode = barcodeData.substring(3, 5);
      const positions6and7 = barcodeData.substring(5, 7);
      const productCode = barcodeData.substring(7, 9);
      
      if (first3 !== "000" || positions6and7 !== "00") {
        return null;
      }

      const colorsArray = Array.isArray(colors) ? colors : (colors?.data || colors?.colors || []);
      
      if (!Array.isArray(colorsArray)) {
        return null;
      }
      
      const colorItem = colorsArray.find(color => color.Kol_Kod === colorCode);
      const colorName = colorItem?.Kol_Opis || `Kolor_${colorCode}`;
      
      try {
        const response = await tokenService.authenticatedFetch(getApiUrl("/excel/remaining-products/get-all-remaining-products"));
        const responseData = await response.json();
        
        const remainingProducts = responseData.remainingProducts;
        const productCodeNumber = parseInt(productCode, 10);
        
        const productItem = remainingProducts.find(product => 
          product.Poz_Nr && parseInt(product.Poz_Nr, 10) === productCodeNumber
        );
        
        const productName = productItem?.Poz_Kod || `Produkt_${productCode}`;
        const fullRemainingProductName = `${productName} ${colorName}`;
        
        return fullRemainingProductName;
      } catch (error) {
        Logger.error("Error fetching remaining products:", error);
        return `Produkt_${productCode} ${colorName}`;
      }
    } catch (error) {
      Logger.error("Error building remaining product name from barcode:", error);
      return null;
    }
  };

  // Helper function to get price from Cudzich price list
  const getPriceFromCudzichList = (productName) => {
    if (cudzichPriceList && cudzichPriceList.items && Array.isArray(cudzichPriceList.items)) {
      const priceItem = cudzichPriceList.items.find(item => 
        item.fullName === productName
      );
      
      if (priceItem) {
        return priceItem.price.toString();
      }
    }
    return "Brak ceny";
  };

  // Helper function to get price from product object (wrapper for getPriceFromCudzichList)
  const getPriceFromProduct = (product) => {
    if (!product || !product.fullName) {
      return "0";
    }
    return getPriceFromCudzichList(product.fullName);
  };

  // Handle barcode scan - identical to QRScanner logic
  const handleScan = async ({ data, type }) => {
    if (!scanned) {
      setScanned(true);
      setBarcode(data); // Set the scanned barcode

      let productName = "";
      let productSize = "-";

      // First, try to build remaining products name from barcode pattern (000 + XX + 00 + XX)
      const builtRemainingProductName = await buildRemainingProductNameFromBarcode(data);
      
      if (builtRemainingProductName) {
        productName = builtRemainingProductName;
        productSize = "-";
      } else {
        // Second, try to build bag name from barcode pattern (000 + non-zero at position 6)
        const builtBagName = buildBagNameFromBarcode(data);
        
        if (builtBagName) {
          productName = builtBagName;
          productSize = "-";
        } else {
          // Third, try to build wallet name from barcode pattern (000 + 0 at position 6 + non-zero at position 7)
          const builtWalletName = buildWalletNameFromBarcode(data);
          
          if (builtWalletName) {
            productName = builtWalletName;
            productSize = "-";
          } else {
            // Fourth, try to build jacket name from barcode pattern (four zeros before last digit)
            const builtJacketData = buildJacketNameFromBarcode(data);
            
            if (builtJacketData) {
              productName = builtJacketData.fullName; // This is now without size for price lookup
              productSize = builtJacketData.sizeName || "-";
            } else {
              // Fall back to original logic - match the scanned barcode with the stateData
              const matchedItem = stateData?.find(item => item.barcode === data);

              if (matchedItem) {
                productName = `${matchedItem.fullName} ${matchedItem.size}`;
                productSize = matchedItem.size;
              } else {
                productName = "Nie znaleziono produktu";
                productSize = "-";
              }
            }
          }
        }
      }

      // Get price from Cudzich price list
      const productPrice = getPriceFromCudzichList(productName);

      // Set all product data including price
      setScannedProductData({
        name: productName,
        size: productSize,
        barcode: data,
        price: productPrice
      });

      // Set default selling point (copied from QRScanner logic)
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

      setScannerVisible(false);
      setScannedProductModalVisible(true); // Show product modal instead of closing
    }
  };

  // Nazwa produktu dla „Wpisz kod” w skanerze - te same źródła co handleScan; null = kod spoza bazy
  const resolveScannedName = async (code) => {
    const remaining = await buildRemainingProductNameFromBarcode(code);
    if (remaining) return remaining;
    const bagOrWallet = buildBagNameFromBarcode(code) || buildWalletNameFromBarcode(code);
    if (bagOrWallet) return bagOrWallet;
    const jacket = buildJacketNameFromBarcode(code);
    if (jacket) return [jacket.fullName, jacket.sizeName].filter(Boolean).join(' ');
    const matchedItem = stateData?.find((item) => item.barcode === code);
    return matchedItem ? `${matchedItem.fullName} ${matchedItem.size}` : null;
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
  const visibleTransactions = dateFilterActive ? filteredTransactions : transactions;

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
      <ScrollView alwaysBounceVertical 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Wygląd jak w panelu admina (30.10.2026): nagłówek zakładki, karta salda, karty menu, karty transakcji */}
        <View style={{ paddingHorizontal: 12 }}>
          <ScreenHeader icon="people" title="Cudzich" subtitle="Odbiory, zwroty i rozliczenia" />

          <CudzichBalanceCard balance={balance} />

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
            subtitle="Cudzich oddaje kurtkę - skanuj metkę"
            onPress={() => {
              setScannerType('zwrot');
              setScannerVisible(true);
            }}
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

          {/* Historia transakcji: nagłówek sekcji z przyciskiem filtra jak w ekranach admina */}
          <View style={styles.historyHeader}>
            <Text style={[look.sectionLabel, { flex: 1, marginBottom: 0 }]}>Historia transakcji</Text>
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

          {/* Z filtrem dat - tylko wynik filtra (dawniej pusty wynik pokazywał całą historię) */}
          {visibleTransactions.length > 0 ? (
            visibleTransactions.map((item) => <CudzichTransactionCard key={item._id} transaction={item} />)
          ) : (
            <View style={look.emptyState}>
              <Ionicons name="swap-horizontal-outline" size={48} color={tc('muted', '#64748B')} />
              <Text style={look.emptyStateText}>
                {(filterStartDate || filterEndDate) ? 'Brak transakcji w wybranym okresie' : 'Brak transakcji'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

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
              <Text style={look.formLabel}>Cena (zł):</Text>
              <TextInput
                style={[styles.input, styles.readonlyInput]}
                placeholder="Cena z cennika"
                value={price}
                editable={false}
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

            {/* Historical sale checkbox - only for zwrot */}
            {zwrotModalVisible && (
              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={styles.checkbox}
                  onPress={() => setIsHistoricalSale(!isHistoricalSale)}
                >
                  <View style={[styles.checkboxInner, isHistoricalSale && styles.checkboxChecked]}>
                    {isHistoricalSale && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    Sprzedaż historyczna (sprzed systemu)
                  </Text>
                </TouchableOpacity>
                {isHistoricalSale && (
                  <Text style={styles.checkboxHelp}>
                    System automatycznie utworzy wpis sprzedażowy z datą wsteczną
                  </Text>
                )}
              </View>
            )}

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
        <View style={qrStyles.container}>
          {/* Skaner jak w całej aplikacji (components/scanner/ScanCamera): ramka, „Odczytaj ze zdjęcia”, „Wpisz kod” */}
          <ScanCamera
            enabled={!scanned}
            onScanned={handleScan}
            resolveName={resolveScannedName}
            facing={facing}
            extraActions={[{
              label: "Wpisz ręcznie",
              icon: "create-outline",
              testID: "enter-manually",
              onPress: () => {
                setScannerVisible(false);
                setScanned(false);
                if (scannerType === 'odbior') {
                  setOdbiorModalVisible(true);
                } else {
                  setZwrotModalVisible(true);
                }
              },
            }]}
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
              <Text style={look.formLabel}>Sprzedano produkt</Text>
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
              
              <Text style={look.formLabel}>Cena (PLN)</Text>
              <TextInput
                style={qrStyles.inputField}
                value={scannedProductData.price}
                editable={false}
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
                  onPress={async () => {
                    // Use price from scannedProductData
                    Logger.debug('DEBUG: Scanned product data:', scannedProductData);
                    
                    if (scannedProductData.price && scannedProductData.price !== "Brak ceny") {
                      Logger.debug('DEBUG: Using price:', scannedProductData.price);
                      await saveTransaction('odbior', scannedProductData.name, scannedProductData.size, scannedProductData.price, '', scannedProductData.barcode);
                      setScannedProductModalVisible(false);
                      setScanned(false);
                    } else {
                      Logger.debug('DEBUG: No price available for product:', scannedProductData.name);
                      appAlert("Błąd", `Brak ceny dla produktu ${scannedProductData.name} w cenniku Cudzich`);
                    }
                  }}
                >
                  <Text style={look.buttonText}>Potwierdź</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
        </KeyboardSafeScreen>
      )}

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
  scrollView: {
    flex: 1,
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
  readonlyInput: {
    backgroundColor: tc('surface', '#161622'),
    borderColor: tc('border', '#1E293B'),
    color: tc('muted', '#94A3B8'),
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
  checkboxContainer: {
    marginTop: 15,
    marginBottom: 10,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  checkboxInner: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: tc('border', '#475569'),
    borderRadius: 6,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#0D6EFD',
    borderColor: '#0D6EFD',
  },
  checkboxLabel: {
    color: tc('text', 'white'),
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  checkboxHelp: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 32,
  },
  
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
