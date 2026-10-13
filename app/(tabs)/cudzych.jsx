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
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from "@react-navigation/native";
import { GlobalStateContext } from '../../context/GlobalState';

import { getApiUrl } from '../../config/api';
import tokenService from '../../services/tokenService';
import Logger from '../../services/logger'; // Import logger service
import LogoutButton from '../../components/LogoutButton';
import { appAlert } from '../../services/appAlert';

import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu
const Cudzych = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets(); // Get safe area insets
  const { 
    user, 
    goods, 
    fetchGoods, 
    sizes, 
    fetchSizes, 
    stocks, 
    fetchStock,
    colors, 
    fetchColors,
    bags, 
    fetchBags,
    wallets, 
    fetchWallets,
    stateData,
    fetchState,
    users,
    fetchUsers
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
        fetchGoods(),
        fetchSizes(),
        fetchStock(),
        fetchColors(),
        fetchBags(),
        fetchWallets(),
        fetchState(),
        fetchUsers()
      ]);
    } catch (error) {
      Logger.error('Error loading initial data:', error);
      appAlert('Błąd', 'Nie udało się załadować danych');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data when component mounts and every time tab is focused
  useEffect(() => {
    loadInitialData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pobierz dane przy każdym wejściu w zakładkę
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

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL') + ' ' + date.toLocaleTimeString('pl-PL', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Render transaction item
  const renderTransaction = ({ item }) => (
    <View style={styles.transactionItem}>
      <View style={styles.transactionHeader}>
        <Text style={[
          styles.transactionType, 
          { color: 
            item.type === 'odbior' ? '#dc3545' : 
            item.type === 'zwrot' ? '#28a745' :
            item.type === 'wplata' ? '#ffc107' : '#17a2b8'
          }
        ]}>
          {item.type === 'odbior' ? 'ODBIÓR' : 
           item.type === 'zwrot' ? 'ZWROT' :
           item.type === 'wplata' ? 'WPŁATA' : 'WYPŁATA'}
        </Text>
        <Text style={styles.transactionPrice}>
          {(item.type === 'odbior' || item.type === 'wyplata') ? '+' : '-'}{item.price}zł
        </Text>
      </View>
      {item.productName && <Text style={styles.transactionProduct}>{item.productName}</Text>}
      {item.size && <Text style={styles.transactionSize}>Rozmiar: {item.size}</Text>}
      <Text style={styles.transactionDate}>{formatDate(item.date)}</Text>
      {item.notes && <Text style={styles.transactionNotes}>Uwagi: {item.notes}</Text>}
    </View>
  );

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
      <LogoutButton position="top-right" />
      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header with balance */}
        <View style={styles.header}>
          <Text style={styles.title}>Tomasz Cudzich</Text>
          <View style={styles.balanceContainer}>
            <Text style={styles.balanceLabel}>Saldo do zapłaty:</Text>
            <Text style={[
              styles.balanceAmount,
              { color: balance >= 0 ? '#ff6b6b' : '#51cf66' }
            ]}>
              {balance}zł
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.smallButton, { backgroundColor: '#dc3545' }]}
            onPress={() => {
              setScannerType('odbior');
              setScannerVisible(true);
            }}
          >
            <Text style={styles.smallButtonText}>Odbiór</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.smallButton, { backgroundColor: '#28a745' }]}
            onPress={() => {
              setScannerType('zwrot');
              setScannerVisible(true);
            }}
          >
            <Text style={styles.smallButtonText}>Zwrot</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.smallButton, { backgroundColor: '#ffc107' }]}
            onPress={() => setWplataModalVisible(true)}
          >
            <Text style={styles.smallButtonText}>Wpłata</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.smallButton, { backgroundColor: '#17a2b8' }]}
            onPress={() => setWyplataModalVisible(true)}
          >
            <Text style={styles.smallButtonText}>Wypłata</Text>
          </TouchableOpacity>
        </View>

        {/* Transactions list */}
        <View style={styles.transactionsContainer}>
          <View style={styles.transactionHeader}>
            <Text style={styles.sectionTitle}>Historia transakcji</Text>
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setDateFilterVisible(true)}
            >
              <Text style={styles.filterButtonText}>📅 Filtruj</Text>
            </TouchableOpacity>
          </View>

          {/* Date filter display */}
          {(filterStartDate || filterEndDate) && (
            <View style={styles.dateFilterDisplay}>
              <Text style={styles.dateFilterText}>
                Okres: {formatDateForDisplay(filterStartDate) || 'Od początku'} - {formatDateForDisplay(filterEndDate) || 'Do teraz'}
              </Text>
              <TouchableOpacity onPress={clearDateFilters} style={styles.clearFilterButton}>
                <Text style={styles.clearFilterText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {(filteredTransactions.length > 0 || transactions.length > 0) ? (
            <FlatList
              data={filteredTransactions.length > 0 ? filteredTransactions : transactions}
              keyExtractor={(item) => item._id}
              renderItem={renderTransaction}
              scrollEnabled={false}
            />
          ) : (
            <Text style={styles.noTransactions}>
              {(filterStartDate || filterEndDate) ? 'Brak transakcji w wybranym okresie' : 'Brak transakcji'}
            </Text>
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
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '85%', maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>
              {odbiorModalVisible ? 'ODBIÓR KURTKI' : 'ZWROT KURTKI'}
            </Text>

            <ScrollView 
              style={{ width: '100%' }}
              contentContainerStyle={{ paddingBottom: Math.max(120, insets.bottom + 120) }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >

            {/* Product search */}
            <View style={styles.formField}>
              <View style={styles.productHeaderContainer}>
                <Text style={styles.fieldLabel}>Wybierz produkt:</Text>
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
                    <Text style={styles.scanButtonText}>📱 Skanuj kod</Text>
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
                  maxHeight: 120,
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
                            backgroundColor: selectedProduct?._id === item._id ? '#0d6efd' : 'transparent',
                          }}
                          onPress={() => {
                            handleProductSelect(item);
                            setProductDropdownVisible(false);
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 13 }}>
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
              <Text style={styles.fieldLabel}>Rozmiar:</Text>
              <TextInput
                style={styles.input}
                placeholder="Wpisz rozmiar..."
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
                  maxHeight: 120,
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
                              backgroundColor: selectedSize?._id === item._id ? '#0d6efd' : 'transparent',
                            }}
                            onPress={() => {
                              setSelectedSize(item);
                              setSize(sizeText);
                              setSizeDropdownVisible(false);
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 13 }}>
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
              <Text style={styles.fieldLabel}>Cena (zł):</Text>
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
              <Text style={styles.fieldLabel}>Uwagi (opcjonalne):</Text>
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
                    {isHistoricalSale && <Text style={styles.checkmark}>✓</Text>}
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
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setOdbiorModalVisible(false);
                  setZwrotModalVisible(false);
                  resetForm();
                }}
              >
                <Text style={styles.cancelButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { backgroundColor: odbiorModalVisible ? '#ff6b6b' : '#51cf66' }
                ]}
                onPress={() => createTransaction(odbiorModalVisible ? 'odbior' : 'zwrot')}
                disabled={loading}
              >
                <Text style={styles.saveButtonText}>
                  {odbiorModalVisible ? 'Zapisz Odbiór' : 'Zapisz Zwrot'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '85%', maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>
              {wplataModalVisible ? 'WPŁATA OD TOMKA' : 'WYPŁATA DLA TOMKA'}
            </Text>

            <ScrollView 
              style={{ width: '100%' }}
              contentContainerStyle={{ paddingBottom: Math.max(120, insets.bottom + 120) }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >

            {/* Amount input */}
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Kwota (zł):</Text>
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
              <Text style={styles.fieldLabel}>Uwagi (opcjonalne):</Text>
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
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  resetPaymentForm();
                  setWplataModalVisible(false);
                  setWyplataModalVisible(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { backgroundColor: wplataModalVisible ? '#339af0' : '#fd7e14' }
                ]}
                onPress={() => createPaymentTransaction(wplataModalVisible ? 'wplata' : 'wyplata')}
                disabled={loading}
              >
                <Text style={styles.saveButtonText}>
                  {wplataModalVisible ? 'Zapisz Wpłatę' : 'Zapisz Wypłatę'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Filter Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={dateFilterVisible}
        onRequestClose={() => setDateFilterVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '90%', maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Filtruj po dacie</Text>
            <Text style={{ color: tc('muted', '#a1a1aa'), textAlign: 'center', fontSize: 14, marginBottom: 15 }}>
              Wybierz przedział czasowy dla transakcji
            </Text>

            {/* Display selected date range */}
            {(filterStartDate || filterEndDate) && (
              <View style={{ 
                backgroundColor: '#10b981', 
                padding: 12, 
                borderRadius: 8, 
                marginBottom: 15,
                borderWidth: 1,
                borderColor: '#ffffff'
              }}>
                <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: 'bold', textAlign: 'center' }}>
                  ✓ Wybrany okres:
                </Text>
                <Text style={{ color: tc('text', '#ffffff'), fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                  {formatDateForDisplay(filterStartDate) || 'Od początku'} - {formatDateForDisplay(filterEndDate) || 'Do teraz'}
                </Text>
              </View>
            )}

            {/* Quick filters */}
            <Text style={styles.fieldLabel}>Szybki wybór:</Text>
            <View style={styles.quickFilters}>
              <TouchableOpacity 
                style={{
                  backgroundColor: '#0d6efd',
                  paddingVertical: 15,
                  paddingHorizontal: 20,
                  borderRadius: 10,
                  marginVertical: 8,
                  borderWidth: 1,
                  borderColor: '#ffffff',
                  alignItems: 'center',
                  flex: 1,
                  marginHorizontal: 4
                }}
                onPress={() => {
                  const today = new Date();
                  setFilterStartDate(today);
                  setFilterEndDate(today);
                }}
              >
                <Text style={{ color: tc('text', 'white'), fontSize: 14, fontWeight: 'bold' }}>Dziś</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{
                  backgroundColor: '#0d6efd',
                  paddingVertical: 15,
                  paddingHorizontal: 20,
                  borderRadius: 10,
                  marginVertical: 8,
                  borderWidth: 1,
                  borderColor: '#ffffff',
                  alignItems: 'center',
                  flex: 1,
                  marginHorizontal: 4
                }}
                onPress={() => {
                  const today = new Date();
                  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                  setFilterStartDate(weekAgo);
                  setFilterEndDate(today);
                }}
              >
                <Text style={{ color: tc('text', 'white'), fontSize: 14, fontWeight: 'bold' }}>7 dni</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{
                  backgroundColor: '#0d6efd',
                  paddingVertical: 15,
                  paddingHorizontal: 20,
                  borderRadius: 10,
                  marginVertical: 8,
                  borderWidth: 1,
                  borderColor: '#ffffff',
                  alignItems: 'center',
                  flex: 1,
                  marginHorizontal: 4
                }}
                onPress={() => {
                  const today = new Date();
                  const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
                  setFilterStartDate(monthAgo);
                  setFilterEndDate(today);
                }}
              >
                <Text style={{ color: tc('text', 'white'), fontSize: 14, fontWeight: 'bold' }}>30 dni</Text>
              </TouchableOpacity>
            </View>

            {/* Modal buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, width: '100%' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#ef4444',
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: 'white',
                  flex: 1,
                  marginRight: 8,
                  alignItems: 'center'
                }}
                onPress={() => {
                  clearDateFilters();
                  setDateFilterVisible(false);
                }}
              >
                <Text style={{ color: tc('text', 'white'), fontSize: 14, fontWeight: 'bold' }}>✕ Wyczyść</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: '#10b981',
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: 'white',
                  flex: 1,
                  marginLeft: 8,
                  alignItems: 'center'
                }}
                onPress={() => setDateFilterVisible(false)}
              >
                <Text style={{ color: tc('text', 'white'), fontSize: 14, fontWeight: 'bold' }}>✓ Zastosuj</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* QR Scanner Modal - identical to QRScanner component */}
      {scannerVisible && (
        <View style={qrStyles.container}>
          <View style={{ flex: 1 }}>
            <CameraView
              style={qrStyles.camera}
              facing={facing}
              barcodeScannerSettings={{
                barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code39", "code128"],
              }}
              onBarcodeScanned={handleScan}
            />
            {/* Overlay using absolute positioning */}
            <View style={[qrStyles.overlay, { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }]}>
              <View style={qrStyles.scanArea} />
            </View>
            
            {/* Close button in top right corner */}
            <TouchableOpacity
              style={qrStyles.closeButton}
              onPress={() => {
                setScannerVisible(false);
                setScanned(false);
              }}
            >
              <Text style={qrStyles.closeButtonText}>X</Text>
            </TouchableOpacity>
            
            {/* Przycisk do resetowania skanowania - pokazuje się tylko gdy scanned=true */}
            {scanned && (
              <View style={{ position: "absolute", bottom: 100, left: 0, right: 0, alignItems: "center" }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: "#0d6efd",
                    paddingVertical: 12,
                    paddingHorizontal: 24,
                    borderRadius: 8,
                    opacity: 0.9
                  }}
                  onPress={() => {
                    setScanned(false);
                  }}
                >
                  <Text style={{ color: tc('text', "#fff"), fontWeight: "bold", fontSize: 16 }}>Skanuj ponownie</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Przycisk do ręcznego wprowadzenia */}
            <View style={{ position: "absolute", bottom: 30, left: 0, right: 0, alignItems: "center" }}>
              <TouchableOpacity
                style={{
                  backgroundColor: "#6c757d",
                  paddingVertical: 12,
                  paddingHorizontal: 24,
                  borderRadius: 8,
                  opacity: 0.9
                }}
                onPress={() => {
                  setScannerVisible(false);
                  setScanned(false);
                  if (scannerType === 'odbior') {
                    setOdbiorModalVisible(true);
                  } else {
                    setZwrotModalVisible(true);
                  }
                }}
              >
                <Text style={{ color: tc('text', "#fff"), fontWeight: "bold", fontSize: 16 }}>✏️ Wpisz ręcznie</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Scanned Product Modal - identical to QRScanner */}
      {scannedProductModalVisible && (
        <View style={{ flex: 1, backgroundColor: tc('bg', "black"), width: "100%", height: "100%", justifyContent: "flex-start", alignItems: "center", zIndex: 5 }}>
          <ScrollView contentContainerStyle={[qrStyles.scrollViewContent, { paddingBottom: Math.max(120, insets.bottom + 120) }]}>
            <View style={[qrStyles.modalContent, { flex: 1, backgroundColor: tc('bg', "black"), width: "100%", height: "100%", justifyContent: "flex-start", alignItems: "center", zIndex: 5 }]}>
              <TouchableOpacity
                style={qrStyles.closeButton}
                onPress={() => {
                  setScannedProductModalVisible(false);
                  setScanned(false);
                }}
              >
                <Text style={qrStyles.closeButtonText}>X</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 16, color: tc('text', "white"), marginBottom: 8 }}>Sprzedano produkt:</Text>
              <TextInput
                style={qrStyles.inputField}
                value={scannedProductData.name}
                editable={false}
              />
              <Text style={{ fontSize: 16, color: tc('text', "white"), marginBottom: 8 }}>Gdzie</Text>
              <TextInput
                style={qrStyles.inputField}
                value={user?.sellingPoint || "Unknown"}
                editable={false}
                placeholder="Selling Point"
              />
              <Text style={{ fontSize: 16, color: tc('text', "white"), marginBottom: 8 }}>Kod kreskowy</Text>
              <TextInput
                style={qrStyles.inputField}
                value={scannedProductData.barcode}
                editable={false}
                placeholder="Barcode"
              />
              <Text style={{ fontSize: 16, color: tc('text', "white"), marginBottom: 8 }}>Sprzedano od:</Text>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: "white",
                  borderRadius: 5,
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
                    borderRadius: 5,
                  }}
                  onPress={openSellingPointModal}
                >
                  <Text style={{ color: tc('text', "white") }}>
                    {selectedOption || "Wybierz punkt sprzedaży"}
                  </Text>
                </TouchableOpacity>
              </View>
              
              <Text style={{ fontSize: 16, color: tc('text', "white"), marginBottom: 8 }}>Cena (PLN):</Text>
              <TextInput
                style={qrStyles.inputField}
                value={scannedProductData.price}
                editable={false}
              />
              
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.smallButton, { backgroundColor: 'gray' }]}
                  onPress={() => {
                    setScannedProductModalVisible(false);
                    setScanned(false);
                  }}
                >
                  <Text style={styles.smallButtonText}>Anuluj</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallButton, { backgroundColor: '#28a745' }]}
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
                  <Text style={styles.smallButtonText}>Potwierdź</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
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
              <Text style={qrStyles.currencyModalTitle}>Wybierz punkt sprzedaży</Text>
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
            <View style={qrStyles.successIconContainer}>
              <Text style={qrStyles.successIcon}>✓</Text>
            </View>
            <Text style={qrStyles.successModalTitle}>Sukces!</Text>
            <Text style={qrStyles.successModalMessage}>
              {successMessage}
            </Text>
            
            <TouchableOpacity
              style={[qrStyles.optionButton, { backgroundColor: '#007bff', marginTop: 20, width: '90%' }]}
              onPress={() => setSuccessModalVisible(false)}
            >
              <Text style={qrStyles.optionText}>OK</Text>
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
            <View style={qrStyles.errorIconContainer}>
              <Text style={qrStyles.errorIcon}>⚠</Text>
            </View>
            <Text style={qrStyles.errorModalTitle}>Błąd!</Text>
            <Text style={qrStyles.errorModalMessage}>
              {errorMessage}
            </Text>
            
            <TouchableOpacity
              style={[qrStyles.optionButton, { backgroundColor: '#dc3545', marginTop: 20, width: '90%' }]}
              onPress={() => setErrorModalVisible(false)}
            >
              <Text style={qrStyles.optionText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc('bg', 'black'),
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
  header: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#333'),
  },
  title: {
    color: tc('text', 'white'),
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  balanceContainer: {
    alignItems: 'center',
  },
  balanceLabel: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: tc('text', 'white'),
  },
  
  // Action buttons
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    gap: 8,
  },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'white',
    flex: 1,
  },
  smallButtonText: {
    color: tc('text', 'white'),
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  cancelButton: {
    backgroundColor: 'gray',
  },
  confirmButton: {
    backgroundColor: 'green',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 20,
    width: '100%',
    paddingHorizontal: 20,
    gap: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Transactions
  transactionsContainer: {
    padding: 20,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: 'bold',
  },
  filterButton: {
    backgroundColor: '#0d6efd',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  filterButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  dateFilterDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0d6efd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
  },
  dateFilterText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  clearFilterButton: {
    backgroundColor: 'red',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearFilterText: {
    color: tc('text', 'white'),
    fontSize: 14,
    fontWeight: 'bold',
  },
  transactionItem: {
    backgroundColor: tc('surface', 'black'),
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'white',
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  transactionType: {
    fontSize: 14,
    fontWeight: 'bold',
    color: tc('text', 'white'),
  },
  transactionPrice: {
    color: tc('text', 'white'),
    fontSize: 14,
    fontWeight: 'bold',
  },
  transactionProduct: {
    color: tc('text', 'white'),
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  transactionSize: {
    color: tc('text', 'white'),
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  transactionDate: {
    color: tc('text', 'white'),
    fontSize: 13,
    fontWeight: 'bold',
  },
  transactionNotes: {
    color: tc('muted', '#bbb'),
    fontSize: 14,
    marginTop: 8,
    fontStyle: 'italic',
  },
  noTransactions: {
    color: tc('muted', '#666'),
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: tc('bg', '#000000'),
    borderRadius: 15,
    padding: 25,
    width: '90%',
    maxHeight: '80%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0d6efd',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: tc('surface', 'black'),
    borderRadius: 10,
    padding: 16,
    width: '70%',
    borderWidth: 1,
    borderColor: 'white',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: tc('text', '#ffffff'),
    textAlign: 'center',
  },
  
  // Form styles
  formField: {
    width: '100%',
    marginBottom: 15,
  },
  fieldLabel: {
    color: tc('text', '#fff'),
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    width: '100%',
    backgroundColor: tc('surface', 'black'),
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: tc('text', 'white'),
    borderWidth: 1,
    borderColor: '#0d6efd',
  },
  inputText: {
    color: tc('text', 'white'),
    fontSize: 16,
  },
  selectButton: {
    width: '100%',
    backgroundColor: '#0d6efd',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'white',
  },
  selectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  notesInput: {
    width: '100%',
    height: 80,
    textAlignVertical: 'top',
    backgroundColor: tc('surface', 'black'),
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: tc('text', 'white'),
    borderWidth: 1,
    borderColor: '#0d6efd',
  },
  readonlyInput: {
    backgroundColor: tc('surface', '#1a1a1a'),
    borderColor: tc('border', '#666'),
    color: tc('muted', '#ccc'),
  },
  
  // Product container
  productContainer: {
    position: 'relative',
    zIndex: 1,
  },
  
  // Product dropdown
  dropdown: {
    backgroundColor: tc('surface', 'black'),
    borderRadius: 8,
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#0d6efd',
    maxHeight: 250,
  },
  
  // Absolute dropdown to prevent layout shift
  dropdownAbsolute: {
    position: 'absolute',
    top: 70, // Adjust based on label + input height
    left: 0,
    right: 0,
    backgroundColor: tc('surface', 'black'),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0d6efd',
    maxHeight: 250,
    zIndex: 1000,
    elevation: 1000, // For Android
  },
  dropdownItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#0d6efd',
  },
  dropdownItemText: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeDropdownButton: {
    backgroundColor: '#0d6efd',
    padding: 12,
    alignItems: 'center',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  closeDropdownText: {
    color: tc('text', 'white'),
    fontSize: 14,
    fontWeight: 'bold',
  },
  noDataText: {
    color: tc('text', 'white'),
    fontSize: 14,
    padding: 15,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  
  // Modal buttons
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 25,
    gap: 15,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'red',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: tc('text', 'white'),
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#0d6efd',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  
  // Date picker styles
  dateButton: {
    backgroundColor: '#0d6efd',
    borderRadius: 8,
    padding: 8,
    marginBottom: 15,
    alignItems: 'center',
  },
  dateButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  quickFilters: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  quickFilterButton: {
    backgroundColor: '#0d6efd',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  quickFilterText: {
    color: tc('text', 'white'),
    fontSize: 14,
    fontWeight: 'bold',
  },
  
  // Dropdown container styles
  dropdownContainer: {
    position: 'relative',
  },
  relativeDropdown: {
    backgroundColor: tc('surface2', '#333'),
    borderRadius: 8,
    maxHeight: 200,
    marginTop: 5, // Mały odstęp od inputa
    zIndex: 1000, // Wysoki zIndex
    elevation: 5, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },

  // Scanner styles
  productHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scanButton: {
    backgroundColor: '#0d6efd',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'white',
  },
  scanButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Scanner styles (adapted from QRScanner.jsx)
  productHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scanButton: {
    backgroundColor: '#0d6efd',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'white',
  },
  scanButtonText: {
    color: 'white',
    fontSize: 12,
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
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 3,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#0d6efd',
  },
  checkmark: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    color: tc('text', 'white'),
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  checkboxHelp: {
    color: '#ccc',
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 30,
  },
  
  scannerContainer: {
    flex: 1,
    backgroundColor: tc('bg', 'black'),
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
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
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 10,
  },
  scannerControls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  scannerButton: {
    backgroundColor: '#0d6efd',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'white',
  },
  scannerButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('bg', 'black'),
    padding: 20,
  },
  permissionText: {
    color: tc('text', 'white'),
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#0d6efd',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'white',
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
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
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 10,
  },
  closeButton: {
    top: 10,
    right: 10,
    backgroundColor: "red",
    borderRadius: 100,
    position: "absolute",
    width: 30,
    height: 30,
    justifyContent: "center",
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
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    marginBottom: 20,
    width: "100%",
    paddingHorizontal: 10,
    color: tc('text', "white"),
    backgroundColor: tc('bg', "black"),
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
    backgroundColor: "rgba(0, 0, 0, 0.5)", // Semi-transparent background
  },
  currencyModalContent: {
    width: "80%",
    backgroundColor: tc('surface', "black"),
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
  },
  currencyModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: tc('text', "white"),
    marginBottom: 15,
  },
  currencyModalItem: {
    paddingVertical: 5, // Reduce vertical padding for shorter height
    paddingHorizontal: 30, // Increase horizontal padding for wider items
    marginVertical: 5, // Add vertical margin between items
    borderBottomWidth: 1,
    borderBottomColor: "gray",
    width: 100, // Set the width to 100px
    alignItems: "center",
    backgroundColor: "rgb(13, 110, 253)", // Set background color to blue
  },
  currencyModalItemText: {
    color: tc('text', "white"),
    fontSize: 16,
  },
  currencyModalCloseButton: {
    marginTop: 15,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "red",
    borderRadius: 5,
    alignItems: "center",
  },
  currencyModalCloseButtonText: {
    color: "white",
    fontSize: 16,
  },
  // Success Modal Styles
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModalContent: {
    backgroundColor: tc('bg', '#000000'),
    borderRadius: 15,
    padding: 30,
    width: '85%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#007bff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
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
    backgroundColor: tc('bg', '#000000'),
    borderRadius: 15,
    padding: 30,
    width: '85%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#dc3545',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
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
    fontSize: 16,
    color: tc('text', '#e5e7eb'),
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 10,
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
