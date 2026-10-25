import React, { useContext, useState, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
  RefreshControl,
  AppState,
  Image,
  Pressable,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { GlobalStateContext } from "../../context/GlobalState";
import tokenService from "../../services/tokenService";
import { getApiUrl } from "../../config/api";
import LogoutButton from "../../components/LogoutButton";
import { ScreenHeader } from '../../components/AdminLook';
import { KeyboardSafeScreen, useRevealInput } from '../../components/KeyboardSafe'; // klawiatura nie zasłania pola
import { appAlert } from '../../services/appAlert';
import { itemPictureVariantUrl } from '../../utils/productPicture'; // miniatura zdjęcia kurtki na karcie przetwarzania
import { pickDefaultOrangeDate, formatDayLabel } from '../../utils/orangeDateChoice'; // okienko „Potwierdzenie daty przetwarzania”

import { createThemedStyles, tc, tcl, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu
const Users = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const { users, fetchUsers } = useContext(GlobalStateContext);
  
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Data from API
  const [blueItems, setBlueItems] = useState([]);
  const [warehouseItems, setWarehouseItems] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [matchedPairs, setMatchedPairs] = useState([]);
  const [allStates, setAllStates] = useState([]);
  
  // Processing state
  const [processing, setProcessing] = useState(false);
  const [showControlModal, setShowControlModal] = useState(false);
  const [controlModalData, setControlModalData] = useState(null);
  const [lastTransaction, setLastTransaction] = useState(null);
  const [showUndoConfirmModal, setShowUndoConfirmModal] = useState(false);
  
  // Search
  const [warehouseSearch, setWarehouseSearch] = useState("");
  // „Szukaj w magazynie”: po kliknięciu pole podjeżdża do góry, a lista wyników mieści się nad klawiaturą
  const warehouseReveal = useRevealInput();
  const warehouseSearchRef = useRef(null);
  const [greyedWarehouseItems, setGreyedWarehouseItems] = useState(new Set());
  const [unprocessedCount, setUnprocessedCount] = useState(0);
  
  // Yellow transfers (incoming transfers)
  const [yellowTransfers, setYellowTransfers] = useState([]);
  
  // All products cache (for prices)
  const [allProducts, setAllProducts] = useState([]);
  const [previewPicture, setPreviewPicture] = useState(null); // powiększone zdjęcie kurtki { url, name }
  
  // Corrections modal
  const [showCorrectionsModal, setShowCorrectionsModal] = useState(false);
  const [correctionsData, setCorrectionsData] = useState(null);
  
  // Print confirmation modal
  const [showPrintConfirmModal, setShowPrintConfirmModal] = useState(false);
  const [pendingProcessData, setPendingProcessData] = useState(null);
  const [pendingProcessingDate, setPendingProcessingDate] = useState(null);
  
  // Print error modal
  const [showPrintErrorModal, setShowPrintErrorModal] = useState(false);
  const [printErrorMessage, setPrintErrorMessage] = useState('');
  const [showPendingPrintModal, setShowPendingPrintModal] = useState(false);
  const [pendingPrintData, setPendingPrintData] = useState(null);
  const [showOnlyOrangeModal, setShowOnlyOrangeModal] = useState(false);
  const [onlyOrangeData, setOnlyOrangeData] = useState(null);
  const [processingStatusMessage, setProcessingStatusMessage] = useState("");
  const [allProcessed, setAllProcessed] = useState(false);
  const [currentUnprocessedUsers, setCurrentUnprocessedUsers] = useState([]);
  const [hasPreviousUnprocessed, setHasPreviousUnprocessed] = useState(false);
  const [previousUnprocessedCount, setPreviousUnprocessedCount] = useState(0);
  const [previousUnprocessedByDate, setPreviousUnprocessedByDate] = useState([]);
  
  // Batch error modal
  const [showBatchErrorModal, setShowBatchErrorModal] = useState(false);
  const [batchErrorMessage, setBatchErrorMessage] = useState('');
  const [priceList, setPriceList] = useState(null);
  const [priceListLoading, setPriceListLoading] = useState(false);
  const [priceListCount, setPriceListCount] = useState(0);
  const [hasPriceList, setHasPriceList] = useState(false);

  const filteredUsers = users.filter((u) => !u.isAdmin);

  const formatDateLocal = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const buildTodayDate = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  const getOperationTimestamp = (item) => {
    const rawValue = item?.timestamp || item?.date || item?.createdAt;
    const timestamp = rawValue ? new Date(rawValue).getTime() : 0;
    return Number.isNaN(timestamp) ? 0 : timestamp;
  };

  const parseDateFromYmd = (ymd) => {
    if (!ymd || typeof ymd !== 'string') {
      return null;
    }
    const [year, month, day] = ymd.split('-').map(Number);
    if (!year || !month || !day) {
      return null;
    }
    return new Date(year, month - 1, day);
  };

  const formatDateValueLocal = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return formatDateLocal(date);
  };

  const jumpToPreviousUnprocessedDay = (dateString) => {
    if (!dateString) return;

    const [year, month, day] = String(dateString).split('-').map(Number);
    if (!year || !month || !day) return;

    setSelectedDate(new Date(year, month - 1, day));
  };

  const jumpToCurrentUnprocessedUser = (symbol) => {
    if (!symbol) return;

    const userForSymbol = filteredUsers.find((user) => String(user?.symbol || '').trim() === String(symbol).trim());
    if (!userForSymbol?._id) {
      return;
    }

    setSelectedUserId(userForSymbol._id);
  };

  // Check processing status for ALL users for selected date
  const checkProcessingStatus = async (dateOverride = selectedDate) => {
    try {
      const dateStr = formatDateLocal(dateOverride || new Date());
      const url = getApiUrl(`/state/processing-status?date=${dateStr}`);
      
      const { accessToken } = await tokenService.getTokens();
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUnprocessedCount(data.unprocessedCount || 0);
        setAllProcessed(data.allProcessed || false);
        setCurrentUnprocessedUsers(Array.isArray(data.currentUnprocessedUsers) ? data.currentUnprocessedUsers : []);
        setProcessingStatusMessage(data.message || "");
        setHasPreviousUnprocessed(Boolean(data.hasPreviousUnprocessed));
        setPreviousUnprocessedCount(data.previousUnprocessedCount || 0);
        setPreviousUnprocessedByDate(Array.isArray(data.previousUnprocessedByDate) ? data.previousUnprocessedByDate : []);
      }
    } catch (error) {
      console.error("Error checking processing status:", error);
    }
  };

  const fetchPendingPrintStatus = async ({ dateStr, location }) => {
    try {
      const { accessToken } = await tokenService.getTokens();
      const url = getApiUrl(`/prints/pending?date=${dateStr}&location=${encodeURIComponent(location || 'Zakopane')}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching pending print status:', error);
      return null;
    }
  };

  const fetchLastPrintedDateForLocation = async (location) => {
    if (!location) {
      return null;
    }

    try {
      const { accessToken } = await tokenService.getTokens();
      const url = getApiUrl(`/prints/list?location=${encodeURIComponent(location)}`);
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      const prints = Array.isArray(payload?.prints) ? payload.prints : [];
      return prints[0]?.date || null;
    } catch (error) {
      console.error('Error fetching last printed date:', error);
      return null;
    }
  };

  useEffect(() => {
    if (users.length === 0) {
      fetchUsers();
    }
    fetchAllProducts(); // Fetch products for price cache
  }, []);

  useEffect(() => {
    setSelectedDate(buildTodayDate());

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setSelectedDate(buildTodayDate());
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, []);

  const fetchAllProducts = async () => {
    try {
      const { accessToken } = await tokenService.getTokens();
      const url = getApiUrl('/excel/goods/get-all-goods');
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        const products = data.goods || [];
        setAllProducts(products);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchColors = async () => {
    try {
      const { accessToken } = await tokenService.getTokens();
      const url = getApiUrl('/excel/color/get-all-colors');
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        const colorsData = data.colors || [];
        
        // Filter by Kol_Kod instead of Kol_Opis (many colors have empty Kol_Opis)
        const validColors = colorsData.filter(
          color => color && color.Kol_Kod && color.Kol_Kod.trim() !== ""
        );
        setColors(validColors);
      }
    } catch (error) {
      console.error('Error fetching colors:', error);
    }
  };

  const fetchPriceListInfo = async (userId) => {
    if (!userId) return;

    try {
      setPriceListLoading(true);
      const { accessToken } = await tokenService.getTokens();
      const url = getApiUrl(`/pricelists/${userId}`);
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const list = data.priceList || [];
        setPriceList({ items: list });
        setHasPriceList(list.length > 0);
        setPriceListCount(list.length);
      } else if (response.status === 404) {
        setPriceList(null);
        setHasPriceList(false);
        setPriceListCount(0);
      } else {
        setPriceList(null);
        setHasPriceList(false);
        setPriceListCount(0);
      }
    } catch (error) {
      setPriceList(null);
      setHasPriceList(false);
      setPriceListCount(0);
    } finally {
      setPriceListLoading(false);
    }
  };

  const getPriceFromPriceList = (item, itemSize) => {
    if (!priceList || !priceList.items) {
      return null;
    }

    const itemBarcode = item.barcode || item.productId;
    const normalizedBarcode = itemBarcode !== undefined && itemBarcode !== null
      ? itemBarcode.toString().trim()
      : null;
    const itemFullName = typeof item.fullName === 'object'
      ? item.fullName?.fullName
      : item.fullName;
    const normalizedFullName = itemFullName ? itemFullName.trim() : null;

    const priceListItem = priceList.items.find(priceItem => {
      const priceItemCode = priceItem.code !== undefined && priceItem.code !== null
        ? priceItem.code.toString().trim()
        : null;
      const priceItemFullName = priceItem.fullName ? priceItem.fullName.trim() : null;

      if (normalizedBarcode && priceItemCode && priceItemCode === normalizedBarcode) {
        return true;
      }

      if (priceItemFullName && normalizedFullName && priceItemFullName === normalizedFullName) {
        return true;
      }

      return priceItemFullName && normalizedFullName &&
        priceItemFullName === normalizedFullName &&
        priceItem.category === item.category;
    });

    if (!priceListItem) {
      return null;
    }

    const result = {
      regularPrice: priceListItem.price || 0,
      discountPrice: priceListItem.discountPrice || 0,
      sizeExceptionPrice: null,
      hasDiscount: priceListItem.discountPrice && priceListItem.discountPrice > 0
    };

    if (itemSize && priceListItem.priceExceptions && priceListItem.priceExceptions.length > 0) {
      const sizeException = priceListItem.priceExceptions.find(exception => {
        const exceptionSizeName = exception.size?.Roz_Opis || exception.size;
        return exceptionSizeName === itemSize;
      });

      if (sizeException) {
        result.sizeExceptionPrice = sizeException.value;
      }
    }

    return result;
  };

  // Calculate availability indicators for blue items (like web app)
  const blueItemIndicators = useMemo(() => {
    if (!Array.isArray(blueItems) || !Array.isArray(allStates) || !selectedUserId) {
      return {};
    }

    const selectedUserData = users.find(user => user._id === selectedUserId);
    if (!selectedUserData) return {};

    // Group blue items by product (fullName, size - without barcode!)
    const groupedByProduct = {};
    blueItems.forEach(item => {
      const fullName = item.fullName;
      const size = item.size;
      
      // Grouping key: only name + size (barcode can differ!)
      const key = `${fullName}_${size}`;
      
      if (!groupedByProduct[key]) {
        groupedByProduct[key] = {
          fullName,
          size,
          items: []
        };
      }
      groupedByProduct[key].items.push(item);
    });

    // For each product group, check availability in state
    const indicators = {};
    
    Object.values(groupedByProduct).forEach(group => {
      // Find all products of this type in selected user's state
      const availableInState = allStates.filter(stateItem => {
        const stateFullName = stateItem.fullName?.fullName || stateItem.fullName;
        const stateSize = stateItem.size?.Roz_Opis || stateItem.size;
        const stateSymbol = stateItem.symbol;

        // Must be from same selling point
        if (stateSymbol !== selectedUserData.symbol) return false;

        // Match by name and size
        const nameMatch = group.fullName === stateFullName;
        const sizeMatch = group.size === stateSize;

        // If name and size match - it's the same product
        return nameMatch && sizeMatch;
      });

      // Calculate indicators for each item in group
      let availableCount = availableInState.length;
      
      group.items.forEach((item) => {
        const itemId = item.sourceId || item._id;
        if (availableCount > 0) {
          indicators[itemId] = 'OK';
          availableCount--;
        } else {
          indicators[itemId] = 'WARNING';
        }
      });
    });

    return indicators;
  }, [blueItems, allStates, selectedUserId, users]);

  // Podsumowanie +/- dla sekcji przetwarzania (jak w web app)
  const balanceStats = useMemo(() => {
    if (!selectedUserId) {
      return { removed: 0, added: 0, balance: 0, warehouse: 0, corrections: 0 };
    }

    let removed = 0;      // -1 (niebieskie OK)
    let added = 0;        // +1 (żółte + pomarańczowe)
    let warehouse = 0;    // wszystkie pomarańczowe (z magazynu)
    let corrections = 0;  // niebieskie WARNING

    if (Array.isArray(blueItems)) {
      blueItems.forEach(item => {
        const itemId = item.sourceId || item._id;
        const indicator = blueItemIndicators[itemId];
        if (indicator === 'OK') {
          removed++;
        } else if (indicator === 'WARNING') {
          corrections++;
        }
      });
    }

    const transferWarehouseCount = Array.isArray(transfers) ? transfers.length : 0;

    const matchedWarehouseCount = Array.isArray(matchedPairs)
      ? matchedPairs.filter(pair => {
          const warehouseItem = pair?.warehouseProduct;
          if (!warehouseItem) return false;
          const alreadyInTransfers = transfers.some(t => t._id === warehouseItem._id && t.fromWarehouse);
          return !alreadyInTransfers;
        }).length
      : 0;

    warehouse = transferWarehouseCount + matchedWarehouseCount;

    const yellowCount = Array.isArray(yellowTransfers) ? yellowTransfers.length : 0;
    added = warehouse + yellowCount;

    return {
      removed,
      added,
      balance: added - removed,
      warehouse,
      corrections
    };
  }, [blueItems, blueItemIndicators, transfers, matchedPairs, yellowTransfers, selectedUserId]);

  useEffect(() => {
    if (users.length > 0 && !selectedUserId) {
      const parzygniatUser = users.find(u => 
        u.email?.toLowerCase() === 'parzygnat@wp.pl'
      );
      if (parzygniatUser) {
        setSelectedUserId(parzygniatUser._id);
      }
    }
  }, [users]);

  useEffect(() => {
    if (selectedUserId && selectedDate) {
      fetchItemsToPick();
      fetchAllStates();
    }
  }, [selectedUserId, selectedDate]);

  useEffect(() => {
    if (selectedUserId) {
      fetchPriceListInfo(selectedUserId);
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (selectedDate) {
      checkProcessingStatus();
    }
  }, [selectedDate]);

  // Grey out all warehouse items when MAGAZYN is selected (like web app)
  useEffect(() => {
    const selectedUserData = users.find(user => user._id === selectedUserId);
    const isWarehouseUser = selectedUserData && 
      (selectedUserData.symbol === 'MAGAZYN' || selectedUserData.symbol === 'Magazyn');
    
    if (selectedUserId && isWarehouseUser && warehouseItems.length > 0) {
      // When MAGAZYN is selected, grey out ALL warehouse items
      const allWarehouseIds = new Set(warehouseItems.map(item => item._id));
      setGreyedWarehouseItems(allWarehouseIds);
    } else if (selectedUserId && !isWarehouseUser) {
      // When non-warehouse user is selected, clear greying
      setGreyedWarehouseItems(new Set());
    }
  }, [selectedUserId, users, warehouseItems]);

  // Auto-refresh last transaction every 5 seconds (for cross-app sync)
  useEffect(() => {
    // Initial check
    checkLastTransaction();
    
    // Set up interval for periodic checks
    const interval = setInterval(() => {
      checkLastTransaction();
    }, 5000); // Check every 5 seconds
    
    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [selectedUserId, selectedDate]);

  const checkLastTransaction = async () => {
    try {
      const { accessToken } = await tokenService.getTokens();
      if (!accessToken) {
        console.log('No access token available for checkLastTransaction');
        return;
      }
      
      const url = getApiUrl('/transfer/last-transaction');
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setLastTransaction(data.canUndo ? data : null);
      } else if (response.status === 404) {
        setLastTransaction(null);
      } else {
        setLastTransaction(null);
      }
    } catch (error) {
      console.error('Error checking last transaction:', error);
      setLastTransaction(null);
    }
  };

  const fetchItemsToPick = async (dateOverride = selectedDate) => {
    if (!selectedUserId) return;

    try {
      setLoading(true);
      const effectiveDate = dateOverride || selectedDate || new Date();
      const dateStr = formatDateLocal(effectiveDate);
      const { accessToken } = await tokenService.getTokens();
      
      // Get selected user data
      const selectedUserData = users.find(u => u._id === selectedUserId);
      if (!selectedUserData) {
        setLoading(false);
        return;
      }
      
      // 1. Fetch ALL transfers from /api/transfer (like web app)
      const transfersUrl = getApiUrl('/transfer');
      const transfersResponse = await fetch(transfersUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      let allTransfers = [];
      if (transfersResponse.ok) {
        allTransfers = await transfersResponse.json();
      }
      
      // 2. Filter BLUE transfers (outgoing from this user, not processed, correct date)
      const blueTransfers = allTransfers.filter(transfer => {
        const transferDate = new Date(transfer.date).toISOString().split('T')[0];
        const isCorrectDate = transferDate === dateStr;
        const isOutgoing = transfer.transfer_from === selectedUserData.symbol && !transfer.fromWarehouse;
        const notProcessed = !transfer.blueProcessed;
        
        return isCorrectDate && isOutgoing && notProcessed;
      });
      
      // 3. Filter YELLOW transfers (incoming to this user, not processed, correct date)
      const yellowTransfers = allTransfers.filter(transfer => {
        const transferDate = new Date(transfer.date).toISOString().split('T')[0];
        const isCorrectDate = transferDate === dateStr;
        const isIncoming = transfer.transfer_to === selectedUserData.symbol && transfer.transfer_from !== 'MAGAZYN';
        const notProcessed = !transfer.yellowProcessed;
        
        return isCorrectDate && isIncoming && notProcessed;
      });
      
      // 4. Fetch sales for this user (like web app)
      const salesUrl = getApiUrl('/sales/get-all-sales');
      const salesResponse = await fetch(salesUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      let salesItems = [];
      if (salesResponse.ok) {
        const allSales = await salesResponse.json();
        // Filter unprocessed sales for this date and user
        salesItems = allSales.filter(sale => {
          const saleDate = new Date(sale.timestamp).toISOString().split('T')[0];
          const isCorrectDate = saleDate === dateStr;
          const isFromUser = sale.from === selectedUserData.symbol;
          const notProcessed = !sale.processed;
          return isCorrectDate && isFromUser && notProcessed;
        });
      }
      
      // 5. Prepare blue items array (transfers + sales, like web app)
      const blueItemsArray = [
        ...blueTransfers.map(transfer => ({
          ...transfer, // Include ALL fields from backend (productId, transfer_from, transfer_to, etc.)
          type: 'transfer',
          fullName: typeof transfer.fullName === 'object' ? transfer.fullName.fullName : transfer.fullName,
          size: typeof transfer.size === 'object' ? transfer.size.Roz_Opis : transfer.size,
          barcode: transfer.barcode || '',
          sourceId: transfer._id,
          _id: transfer._id
        })),
        ...salesItems.map(sale => ({
          ...sale, // Include ALL fields from backend
          type: 'sale',
          fullName: sale.fullName,
          size: sale.size,
          barcode: sale.barcode,
          sourceId: sale._id,
          _id: sale._id,
          isFromSale: true
        }))
      ];

      const orderedBlueItems = [...blueItemsArray].sort((a, b) => {
        const timeDiff = getOperationTimestamp(a) - getOperationTimestamp(b);
        if (timeDiff !== 0) {
          return timeDiff;
        }

        const aId = String(a?.sourceId || a?._id || '');
        const bId = String(b?.sourceId || b?._id || '');
        return aId.localeCompare(bId);
      });
      
      // 6. Fetch warehouse items
      const warehouseUrl = getApiUrl('/state/warehouse');
      const warehouseResponse = await fetch(warehouseUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      let warehouseItemsArray = [];
      if (warehouseResponse.ok) {
        const warehouseData = await warehouseResponse.json();
        warehouseItemsArray = warehouseData.map(state => ({
          _id: state._id,
          barcode: state.barcode,
          fullName: typeof state.fullName === 'object' ? state.fullName.fullName : state.fullName,
          size: typeof state.size === 'object' ? state.size.Roz_Opis : state.size,
          price: state.fullName && state.fullName.price ? state.fullName.price : 0,
          discount_price: state.fullName && state.fullName.discount_price ? state.fullName.discount_price : 0,
          date: state.date
        }));
      }
      
      // 7. Auto-match blue and warehouse items (like backend does)
      const matchedPairsArray = [];
      const pairedBlueIndexes = new Set();
      const pairedWarehouseIndexes = new Set();
      
      for (let b = 0; b < blueItemsArray.length; b++) {
        if (pairedBlueIndexes.has(b)) continue;
        
        const blueItem = blueItemsArray[b];
        
        for (let w = 0; w < warehouseItemsArray.length; w++) {
          if (pairedWarehouseIndexes.has(w)) continue;
          
          const warehouseItem = warehouseItemsArray[w];
          
          // Matching logic (same as backend)
          const barcodeMatch = blueItem.barcode === warehouseItem.barcode;
          const nameMatch = blueItem.fullName === warehouseItem.fullName;
          const sizeMatch = blueItem.size === warehouseItem.size;
          
          const isTransferWithoutBarcode = blueItem.type === 'transfer' && 
                                          blueItem.barcode !== warehouseItem.barcode;
          
          const isMatched = isTransferWithoutBarcode 
            ? (nameMatch && sizeMatch) 
            : (barcodeMatch && nameMatch && sizeMatch);
          
          if (isMatched) {
            matchedPairsArray.push({
              blueProduct: {
                type: blueItem.type,
                fullName: blueItem.fullName,
                size: blueItem.size,
                barcode: blueItem.barcode
              },
              warehouseProduct: {
                ...warehouseItem,
                date: blueItem.date || blueItem.timestamp || warehouseItem.date,
                transfer_to: blueItem.type === 'transfer' ? blueItem.transfer_to : undefined,
                sellingPoint: blueItem.type === 'sale' ? (blueItem.sellingPoint || blueItem.from) : undefined
              }
            });
            
            pairedBlueIndexes.add(b);
            pairedWarehouseIndexes.add(w);
            break;
          }
        }
      }
      
      // Set all data
      setBlueItems(orderedBlueItems);
      setWarehouseItems(warehouseItemsArray);
      setYellowTransfers(yellowTransfers);
      setMatchedPairs(matchedPairsArray);
      setTransfers([]); // Empty array (manual transfers are created by user)
      
      // Clear greyed items on fresh load
      setGreyedWarehouseItems(new Set());
      
      // Auto-synchronize on load - grey matched items
      if (matchedPairsArray.length > 0) {
        handleAutoSync(matchedPairsArray, warehouseItemsArray);
      }
      
      // Check processing status for ALL users for this date
      await checkProcessingStatus(effectiveDate);
      
    } catch (error) {
      console.error("Error fetching items to pick:", error);
      appAlert("Błąd", "Nie udało się pobrać danych");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const today = buildTodayDate();
    setSelectedDate(today);

    // Reload all data: items, price list, products cache, and all states
    await Promise.all([
      fetchItemsToPick(today),
      fetchAllStates(),
      selectedUserId ? fetchPriceListInfo(selectedUserId) : Promise.resolve(),
      fetchAllProducts(),
      checkProcessingStatus(today)
    ]);
    setRefreshing(false);
  };

  // Fetch all states from API
  const fetchAllStates = async () => {
    try {
      const { accessToken } = await tokenService.getTokens();
      const url = getApiUrl('/state');
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAllStates(data || []);
      }
    } catch (error) {
      console.error('Error fetching all states:', error);
      setAllStates([]);
    }
  };

  const checkForMissingItems = async (itemsToCheck, userSymbol, transactionId = null) => {
    try {
      const { accessToken } = await tokenService.getTokens();
      
      // Fetch all states
      const allStatesUrl = getApiUrl('/state');
      const allStatesResponse = await fetch(allStatesUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      let currentState = await allStatesResponse.json();
      
      const missingItems = [];
      const availableItems = [];
      
      // Check items ONE BY ONE and simulate removal
      itemsToCheck.forEach((item, index) => {
        let sourceSymbol = userSymbol;
        
        // For transfers, check the source point (transfer_from)
        if (item.transfer_from && item.type !== 'sale') {
          sourceSymbol = item.transfer_from;
        }
        
        // Filter state by proper symbol
        const userStateItems = currentState.filter(stateItem => stateItem.symbol === sourceSymbol);
        
        const itemBarcode = item.barcode || item.productId;
        const itemFullName = item.fullName?.fullName || item.fullName;
        const itemSize = item.size?.Roz_Opis || item.size;
        
        // Find matching product in state
        const matchingStateItemIndex = userStateItems.findIndex(stateItem => {
          const stateFullName = stateItem.fullName?.fullName || stateItem.fullName;
          const stateSize = stateItem.size?.Roz_Opis || stateItem.size;
          
          return (stateItem.barcode === itemBarcode || stateItem.id === itemBarcode) &&
                 stateFullName === itemFullName &&
                 stateSize === itemSize;
        });
        
        const foundInState = matchingStateItemIndex !== -1;
        
        if (foundInState) {
          availableItems.push(item);
          
          // SIMULATE REMOVAL: Remove item from state (for next checks)
          const matchingStateItem = userStateItems[matchingStateItemIndex];
          const globalIndex = currentState.findIndex(stateItem => stateItem === matchingStateItem);
          if (globalIndex !== -1) {
            currentState.splice(globalIndex, 1);
          }
        } else {
          const operationType = item.type === 'sale' ? 'SPRZEDAŻY' : 'TRANSFERU';
          const operationDetails = item.type === 'sale'
            ? `sprzedaży za ${item.price || 'N/A'} PLN`
            : `transferu z punktu ${sourceSymbol}`;
          
          const detailedDescription = 
            `🚨 BRAK W STANIE: Element #${index + 1} - Próba odpisania "${itemFullName}" (${itemSize}) ` +
            `z punktu "${sourceSymbol}" w ramach ${operationDetails}. ` +
            `Produkt o kodzie ${itemBarcode} nie został znaleziony w aktualnym stanie punktu. ` +
            `Data wykrycia: ${new Date().toLocaleString('pl-PL')}.`;
          
          missingItems.push({
            fullName: itemFullName,
            size: itemSize,
            barcode: itemBarcode,
            sellingPoint: userSymbol,
            symbol: userSymbol,
            errorType: 'MISSING_IN_STATE',
            attemptedOperation: item.type === 'sale' ? 'SALE' : 'TRANSFER',
            description: detailedDescription,
            originalPrice: item.price,
            discountPrice: item.discount_price,
            transactionId: transactionId,
            elementIndex: index,
            originalData: {
              _id: item.sourceId || item._id,
              fullName: itemFullName,
              size: itemSize,
              barcode: itemBarcode,
              isFromSale: item.type === 'sale',
              price: item.price,
              transfer_from: item.transfer_from,
              transfer_to: item.transfer_to,
              timestamp: item.timestamp,
              date: item.date
            }
          });
        }
      });
      
      // IMPORTANT: pre-check must be read-only.
      // All writes (flags, corrections, history, state) are persisted only by /transfer/process-batch.
      return { missingItems, availableItems };
    } catch (error) {
      console.error('Error checking for missing items:', error);
      return { missingItems: [], availableItems: itemsToCheck };
    }
  };

  const handleAutoSync = (pairs, allWarehouseItems) => {
    // Only grey out matched warehouse items (like web app)
    // Do NOT create separate transfer items
    const idsToGrey = [];
    
    pairs.forEach(pair => {
      const warehouseItem = pair.warehouseProduct;
      if (warehouseItem) {
        idsToGrey.push(warehouseItem._id);
      }
    });
    
    // Grey out matched items (don't remove them, don't create transfers)
    if (idsToGrey.length > 0) {
      setGreyedWarehouseItems(prev => new Set([...prev, ...idsToGrey]));
    }
  };

  const handleMoveFromWarehouse = (item) => {
    // Get selected user data
    const selectedUserData = users.find(u => u._id === selectedUserId);
    if (!selectedUserData) {
      appAlert("Błąd", "Nie można znaleźć danych użytkownika");
      return;
    }

    // Create new transfer item (orange/pomarańczowy)
    const newTransferItem = {
      _id: item._id,
      id: item._id,
      fullName: item.fullName,
      size: item.size,
      barcode: item.barcode,
      fromWarehouse: true,
      transfer_from: 'MAGAZYN',
      transfer_to: selectedUserData.symbol,
      price: item.price || 0,
      discount_price: item.discount_price || 0,
      movedAt: new Date().toISOString()
    };

    // Add to transfers list (will show as orange)
    setTransfers(prev => [...prev, newTransferItem]);
    
    // Remove from warehouse items (like web app does)
    setWarehouseItems(prev => prev.filter(w => w._id !== item._id));
  };

  const handleReturnToWarehouse = (item) => {
    // Remove from transfers
    setTransfers(prev => prev.filter(t => t._id !== item._id || !t.fromWarehouse));
    // Add back to warehouse items
    setWarehouseItems(prev => [...prev, item]);
  };

  const handleUnpairMatchedItem = (warehouseItem) => {
    // Find the pair that contains this warehouse item
    const matchedPair = matchedPairs.find(pair => 
      pair && pair.warehouseProduct && pair.warehouseProduct._id === warehouseItem._id
    );
    
    if (!matchedPair) {
      appAlert("Błąd", "Nie znaleziono pary dla tego elementu");
      return;
    }
    
    // Remove from greyedWarehouseItems
    setGreyedWarehouseItems(prev => {
      const newSet = new Set(prev);
      newSet.delete(warehouseItem._id); // Remove orange element
      
      // If paired with blue item, remove blue from greyed too
      if (matchedPair.blueProduct) {
        newSet.delete(matchedPair.blueProduct.sourceId);
      }
      
      return newSet;
    });
    
    // Remove from matchedPairs
    setMatchedPairs(prev => prev.filter(pair => 
      pair && pair.warehouseProduct && pair.warehouseProduct._id !== warehouseItem._id
    ));
    
    // Add warehouse item back to warehouseItems list
    setWarehouseItems(prev => {
      const exists = prev.some(item => item._id === warehouseItem._id);
      if (exists) {
        return prev;
      }
      return [...prev, warehouseItem];
    });
  };

  const handleProcessItems = async (options = {}) => {
    const {
      skipOnlyOrangeGate = false,
      processingDateOverride = null
    } = options;
    const effectiveDate = processingDateOverride || selectedDate;

    if (transfers.length === 0 && blueItems.length === 0 && yellowTransfers.length === 0) {
      appAlert("Informacja", "Brak elementów do przetworzenia");
      return;
    }

    const selectedUserData = users.find(u => u._id === selectedUserId);
    const dateStr = formatDateLocal(effectiveDate);
    const pendingStatus = await fetchPendingPrintStatus({
      dateStr,
      location: selectedUserData?.location || 'Zakopane'
    });

    if (pendingStatus?.hasBlockingPending) {
      const blockingDays = Array.isArray(pendingStatus.blockingPendingDays)
        ? pendingStatus.blockingPendingDays
        : [];

      setPendingPrintData({
        blockingPendingCount: pendingStatus.blockingPendingCount || 0,
        blockingDays,
        nextDay: blockingDays[0]?.date || null
      });
      setShowPendingPrintModal(true);
      return;
    }

    // Step 1: Print labels in strict order:
    // 1) yellow, 2) orange auto-matched (in matchedPairs order), 3) orange manual
    const manualOrangeTransfers = transfers.filter(t => t.fromWarehouse);
    const manualOrangeIds = new Set(manualOrangeTransfers.map(item => item?._id).filter(Boolean));
    const autoMatchedOrange = matchedPairs
      .map(pair => pair?.warehouseProduct)
      .filter(Boolean)
      .filter(item => !manualOrangeIds.has(item._id));

    const onlyOrangeItemsCount = manualOrangeTransfers.length + autoMatchedOrange.length;
    const isOnlyOrangeFlow = blueItems.length === 0 && yellowTransfers.length === 0 && onlyOrangeItemsCount > 0;

    if (isOnlyOrangeFlow && !skipOnlyOrangeGate) {
      const lastPrintedDateRaw = await fetchLastPrintedDateForLocation(selectedUserData?.location || 'Zakopane');
      const lastPrintedDate = lastPrintedDateRaw ? String(lastPrintedDateRaw).slice(0, 10) : null;

      if (lastPrintedDate && lastPrintedDate !== dateStr) {
        setOnlyOrangeData({
          count: onlyOrangeItemsCount,
          date: dateStr, // data z kalendarza
          lastPrintedDate,
          // domyślnie kalendarz; wyjątek: kalendarz = dzisiaj i ostatni wydruk = wczoraj → ostatni wydruk
          defaultChoice: pickDefaultOrangeDate({
            calendarDate: dateStr,
            lastPrintedDate,
            today: formatDateLocal(new Date())
          }),
          alternativeDate: dateStr,
          awaitingAlternativeDate: false
        });
        setShowOnlyOrangeModal(true);
        return;
      }
    }

    setPendingProcessingDate(effectiveDate);

    const enrichForPrint = (item) => {
      let enrichedItem = { ...item };
      const itemFullName = typeof item.fullName === 'string' ? item.fullName : item.fullName?.fullName;

      if (!enrichedItem.price) {
        const matchingWarehouse = warehouseItems.find(w =>
          w.barcode === item.barcode || w.fullName === itemFullName
        );
        if (matchingWarehouse) {
          enrichedItem.price = matchingWarehouse.price;
        }
      }

      if (!enrichedItem.color && itemFullName && allProducts.length > 0) {
        const productByName = allProducts.find(p => p.fullName === itemFullName);
        if (productByName) {
          if (!enrichedItem.price) {
            enrichedItem.price = productByName.price;
          }
          enrichedItem.color = productByName.color;
        }
      }

      if (!enrichedItem.price) {
        enrichedItem.price = 0;
      }

      return enrichedItem;
    };

    const itemsToPrint = [
      ...yellowTransfers.map(item => {
        // Enrich transfer items with price AND color
        return enrichForPrint(item);
      }), // Yellow incoming transfers
      ...autoMatchedOrange.map(item => {
        // Orange auto-matched
        return enrichForPrint(item);
      }),
      ...manualOrangeTransfers.map(item => {
        // Orange manual (from warehouse)
        return enrichForPrint(item);
      })
    ];

    if (itemsToPrint.length > 0) {
      try {
        setProcessing(true);

        const zplResults = await Promise.all(itemsToPrint.map(async (item) => {
          try {
            return await fetchLabelZplCodes(item);
          } catch (error) {
            return null;
          }
        }));

        const printableBatches = zplResults.filter(Array.isArray);
        const allZplCodes = printableBatches.flat();
        const totalLabelsToPrint = allZplCodes.length;
        let batchPrinted = false;

        if (totalLabelsToPrint > 0) {
          batchPrinted = await sendZplChunksToPrinter(allZplCodes);
        }

        const successCount = batchPrinted ? totalLabelsToPrint : 0;
        const errorCount = totalLabelsToPrint - successCount;
        
        setProcessing(false);
        
        // Show print confirmation modal
        setPendingProcessData({
          successCount,
          errorCount,
          totalCount: totalLabelsToPrint
        });
        setShowPrintConfirmModal(true);
      } catch (error) {
        console.error('Error printing labels:', error);
        setProcessing(false);
        setPrintErrorMessage('Wystąpił błąd podczas drukowania etykiet. Sprawdź połączenie z drukarką.');
        setShowPrintErrorModal(true);
      }
    } else {
      // No items to print, proceed directly
      executeProcessItems(effectiveDate);
    }
  };

  // Okienko „Potwierdzenie daty przetwarzania”: zamknij i przetwórz partię pomarańczowych
  // pod wskazaną datą ('calendar' = data z kalendarza, 'lastPrinted' = ostatni wydruk).
  const assignOnlyOrangeBatch = (choice) => {
    const ymd = choice === 'lastPrinted' ? onlyOrangeData?.lastPrintedDate : onlyOrangeData?.date;
    setShowOnlyOrangeModal(false);
    handleProcessItems({
      skipOnlyOrangeGate: true,
      processingDateOverride: parseDateFromYmd(ymd) || selectedDate
    });
  };

  // Przyciski A (kalendarz) i B (ostatni wydruk) - domyślny pierwszy i w stylu głównego przycisku
  const renderOnlyOrangeDateChoices = () => {
    const calendarYmd = onlyOrangeData?.date || formatDateLocal(selectedDate);
    const lastPrintedYmd = onlyOrangeData?.lastPrintedDate || calendarYmd;
    const defaultChoice = onlyOrangeData?.defaultChoice || 'calendar';

    const choices = [
      { key: 'calendar', icon: 'calendar', label: `Przypisz do ${formatDayLabel(calendarYmd)} — data z kalendarza` },
      { key: 'lastPrinted', icon: 'print', label: `Przypisz do ${formatDayLabel(lastPrintedYmd)} — ostatni wydruk` },
    ];
    if (defaultChoice === 'lastPrinted') {
      choices.reverse();
    }

    return choices.map((choice) => {
      const isDefault = choice.key === defaultChoice;
      return (
        <TouchableOpacity
          key={choice.key}
          style={isDefault ? styles.printConfirmButton : styles.printCancelButton}
          onPress={() => assignOnlyOrangeBatch(choice.key)}
        >
          <Ionicons name={choice.icon} size={22} color={isDefault ? '#ffffff' : tc('muted', '#94A3B8')} />
          <Text style={[isDefault ? styles.printConfirmButtonText : styles.printCancelButtonText, styles.onlyOrangeChoiceText]}>
            {choice.label}
          </Text>
        </TouchableOpacity>
      );
    });
  };

  const executeProcessItems = async (processingDateOverride = null) => {
    setProcessing(true);
    
    try {
      const selectedUserData = users.find(u => u._id === selectedUserId);
      const processingDate = processingDateOverride || selectedDate;
      const dateStr = formatDateLocal(processingDate);
      const sharedTransactionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const userSymbol = selectedUserData?.symbol || selectedUserData?.sellingPoint;
      
      // Get current user state count BEFORE processing (like web app)
      // Fetch ALL states and filter by symbol
      const allStatesUrl = getApiUrl('/state');
      const { accessToken: accessTokenBefore } = await tokenService.getTokens();
      const allStatesResponse = await fetch(allStatesUrl, {
        headers: {
          'Authorization': `Bearer ${accessTokenBefore}`
        }
      });
      const allStatesData = await allStatesResponse.json();
      
      // Filter by user symbol (like web app does)
      const currentUserStateCountBefore = allStatesData.filter(item => 
        item.symbol === userSymbol || 
        (item.sellingPoint && item.sellingPoint.symbol === userSymbol)
      ).length;
      
      // Get warehouse state count BEFORE processing (like web app)
      // Web uses /state/warehouse endpoint which returns ALL warehouse items
      const warehouseUrl = getApiUrl('/state/warehouse');
      const warehouseResponse = await fetch(warehouseUrl, {
        headers: {
          'Authorization': `Bearer ${accessTokenBefore}`
        }
      });
      const warehouseData = await warehouseResponse.json();
      const warehouseBeforeCount = warehouseData.length;
      
      let processedCount = 0;
      let allBlueCount = 0;
      let yellowCount = 0;
      let orangeCount = 0;
      let greenMatchedCount = 0;
      let correctionsCount = 0;
      
      // Store initial counts BEFORE processing
      const initialBlueCount = blueItems.length;
      const initialTransfersCount = transfers.length;

      // Step 1: Check for missing items BEFORE processing (like web app)
      const checkResult = await checkForMissingItems(blueItems, userSymbol, sharedTransactionId);
      const availableBlueItems = checkResult.availableItems;
      const missingBlueCount = checkResult.missingItems.length;
      const missingItems = checkResult.missingItems || [];

      // Step 2: Prepare all items for BATCH processing
      // Separate sales from transfers
      const salesItemsToProcess = availableBlueItems
        .filter(blue => blue.type === 'sale')
        .map(blue => ({
          _id: blue.sourceId,
          barcode: blue.barcode,
          fullName: blue.fullName,
          size: blue.size,
          from: userSymbol
        }));

      const transfersToProcess = availableBlueItems
        .filter(blue => blue.type !== 'sale');

      // Warehouse items (Orange) - manual selections
      const warehouseItemsToProcess = transfers
        .filter(t => t.fromWarehouse)
        .map(item => ({
          ...item,
          transfer_to: selectedUserData?.symbol || selectedUserData?.sellingPoint
        }));

      // Matched warehouse items (Green) - auto-matched pairs
      const matchedWarehouseItems = (matchedPairs || [])
        .filter(pair => {
          const warehouseItem = pair.warehouseProduct;
          // Don't process if already manually moved
          return !transfers.some(t => t._id === warehouseItem._id && t.fromWarehouse);
        })
        .map(pair => ({
          ...pair.warehouseProduct,
          transfer_to: selectedUserData?.symbol || selectedUserData?.sellingPoint
        }));

      // Combine all warehouse items (Orange + Green)
      const allWarehouseItems = [...warehouseItemsToProcess, ...matchedWarehouseItems];

      // Yellow transfers (incoming from other selling points)
      const yellowItems = (yellowTransfers || []).map(transfer => ({
        ...transfer,
        transfer_to: selectedUserData?.symbol || selectedUserData?.sellingPoint
      }));

      // Step 3: Execute SINGLE BATCH request with ALL items
      try {
        const url = getApiUrl('/transfer/process-batch');
        const { accessToken } = await tokenService.getTokens();

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            salesItems: salesItemsToProcess,
            transfers: transfersToProcess,
            warehouseItems: allWarehouseItems,
            yellowItems: yellowItems,
            correctionsToCreate: missingItems,
            selectedDate: dateStr,
            selectedUser: selectedUserId,
            transactionId: sharedTransactionId
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Batch processing failed:', errorText);
          
          setBatchErrorMessage(`Nie udało się przetworzyć transakcji. ${errorText}`);
          setShowBatchErrorModal(true);
          return;
        }

        const batchResult = await response.json();
        const savedCorrectionsCount = Number(batchResult?.savedCorrections || 0);
        correctionsCount = savedCorrectionsCount > 0 ? savedCorrectionsCount : missingItems.length;
        
        // Update counters from batch result
        allBlueCount = availableBlueItems.length;
        orangeCount = warehouseItemsToProcess.length;
        greenMatchedCount = matchedWarehouseItems.length;
        yellowCount = yellowItems.length;
        processedCount = allBlueCount + orangeCount + greenMatchedCount + yellowCount;

      } catch (error) {
        console.error('Error in batch processing:', error);
        setBatchErrorMessage('Nie udało się połączyć z serwerem. Sprawdź połączenie internetowe.');
        setShowBatchErrorModal(true);
        return;
      }

      // Calculate expected result BEFORE refresh
      // Separate yellow (incoming transfers from other points) from orange (warehouse items)
      const totalOrangeFromWarehouse = orangeCount + greenMatchedCount; // Only items from warehouse
      const totalAdded = yellowCount + totalOrangeFromWarehouse; // Total added to user state
      const expectedAfterCount = currentUserStateCountBefore - allBlueCount + totalAdded;

      setLastTransaction({
        transactionId: sharedTransactionId,
        date: dateStr,
        userId: selectedUserId
      });

      // Clear matched pairs and refresh data FIRST (like web app)
      setMatchedPairs([]);
      
      // Wait for database to fully update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refresh data from server (this will clear the lists automatically)
      await Promise.all([fetchItemsToPick(), fetchAllStates()]);
      
      // Wait a bit for React state to update
      await new Promise(resolve => setTimeout(resolve, 200));

      // Get ACTUAL user state count AFTER processing (like web app)
      const allStatesUrlAfter = getApiUrl('/state');
      const { accessToken: accessTokenAfter } = await tokenService.getTokens();
      const allStatesResponseAfter = await fetch(allStatesUrlAfter, {
        headers: {
          'Authorization': `Bearer ${accessTokenAfter}`
        }
      });
      const allStatesDataAfter = await allStatesResponseAfter.json();
      
      // Filter by user symbol (like web app does)
      const actualStateCountAfter = allStatesDataAfter.filter(item => 
        item.symbol === userSymbol || 
        (item.sellingPoint && item.sellingPoint.symbol === userSymbol)
      ).length;

      // Calculate how many items were TO BE processed (before processing)
      const totalItemsToProcess = initialBlueCount + initialTransfersCount;
      
      // Fetch items again to check what remains
      const checkUrl = getApiUrl(`/state/items-to-pick?userId=${selectedUserId}&date=${dateStr}`);
      const checkResponse = await fetch(checkUrl, {
        headers: {
          'Authorization': `Bearer ${accessTokenAfter}`
        }
      });
      const checkData = await checkResponse.json();
      const remainingItems = (checkData.blueItems?.length || 0) + (checkData.transfers?.length || 0);

      // Calculate warehouse state (like web app)
      // Only orange items from warehouse affect warehouse count (NOT yellow transfers!)
      const warehouseAfterCount = warehouseBeforeCount - totalOrangeFromWarehouse;
      const warehouseProcessedCount = totalOrangeFromWarehouse;

      // Check if user is warehouse (support both 'MAGAZYN' and 'Magazyn')
      const isWarehouse = userSymbol === 'MAGAZYN' || userSymbol === 'Magazyn';

      // Show control modal with actual vs expected
      setControlModalData({
        userSymbol: selectedUserData?.symbol || selectedUserData?.username,
        beforeCount: currentUserStateCountBefore,
        allBlueCount,
        correctionsCount,
        yellowCount, // Incoming transfers from other points (NOT from warehouse)
        warehouseCount: orangeCount, // Manually moved from warehouse
        allOrangeCount: totalOrangeFromWarehouse, // Total from warehouse (manual + auto-matched)
        greenMatchedCount,
        expectedAfterCount,
        actualAfterCount: actualStateCountAfter,
        remainingItems,
        totalItemsToProcess,
        calculation: `${currentUserStateCountBefore} - ${allBlueCount} (niebieskie) + ${yellowCount} (żółte) + ${totalOrangeFromWarehouse} (pomarańczowe) = ${expectedAfterCount}`,
        transactionId: sharedTransactionId,
        processedDate: dateStr,
        warehouseBeforeCount,
        warehouseAfterCount,
        warehouseProcessedCount,
        isWarehouse
      });
      
      // Clear greyed items after processing - BUT NOT for MAGAZYN user (persist grey state)
      if (!selectedUserData || 
          (selectedUserData.symbol !== 'MAGAZYN' && selectedUserData.symbol !== 'Magazyn')) {
        setGreyedWarehouseItems(new Set());
      }
      setMatchedPairs([]);
      
      // Refresh processing status for all users
      await checkProcessingStatus();
      
      // Refresh last transaction data
      await checkLastTransaction();

      // Show corrections summary first (same UX intent as web), then control modal.
      if (correctionsCount > 0) {
        setCorrectionsData({
          success: true,
          count: correctionsCount,
          items: missingItems
        });
        setShowCorrectionsModal(true);
      } else {
        setShowControlModal(true);
      }
    } catch (error) {
      console.error('Error processing items:', error);
      appAlert("Błąd", "Wystąpił błąd podczas przetwarzania");
    } finally {
      setProcessing(false);
    }
  };

  const handleUndoTransaction = async () => {
    if (!lastTransaction) return;

    try {
      setProcessing(true);
      
      const { accessToken } = await tokenService.getTokens();
      
      // FIXED: Use userSymbol from lastTransaction (not from dropdown selectedUserId)
      // Dropdown może pokazywać innego usera niż ten który wykonał transakcję
      const userSymbol = lastTransaction?.userSymbol;
      
      // Get warehouse state BEFORE undo
      const warehouseUrlBefore = getApiUrl('/state/warehouse');
      const warehouseResponseBefore = await fetch(warehouseUrlBefore, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      const warehouseDataBefore = await warehouseResponseBefore.json();
      const warehouseBeforeCount = warehouseDataBefore.length;
      
      // Get user state count BEFORE undo
      const allStatesUrlBefore = getApiUrl('/state');
      const allStatesResponseBefore = await fetch(allStatesUrlBefore, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      const allStatesDataBefore = await allStatesResponseBefore.json();
      const userStateBefore = allStatesDataBefore.filter(item => 
        item.symbol === userSymbol || 
        (item.sellingPoint && item.sellingPoint.symbol === userSymbol)
      ).length;
      
      // Now call undo endpoint
      // Cofamy dokładnie ten zapis, który pokazuje przycisk (audyt W6) - serwer odmówi, jeśli nie jest już ostatni
      const url = getApiUrl('/transfer/undo-last');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ transactionId: lastTransaction.transactionId })
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Get warehouse state AFTER undo
        const warehouseUrl = getApiUrl('/state/warehouse');
        const warehouseResponse = await fetch(warehouseUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        const warehouseData = await warehouseResponse.json();
        const warehouseAfterCount = warehouseData.length;
        
        // Get user state count AFTER undo
        const allStatesUrl = getApiUrl('/state');
        const allStatesResponse = await fetch(allStatesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        const allStatesData = await allStatesResponse.json();
        const userStateAfter = allStatesData.filter(item => 
          item.symbol === userSymbol || 
          (item.sellingPoint && item.sellingPoint.symbol === userSymbol)
        ).length;
        
        // Calculate changes
        const warehouseReturned = result.restoredOrangeCount || 0; // 🟠 Bezpośrednio z backendu
        const stateChange = userStateAfter - userStateBefore;
        const isWarehouse = userSymbol === 'MAGAZYN' || userSymbol === 'Magazyn';

        // Określ typ transakcji dla poprawnego tekstu w modalu
        const isWarehouseTransaction = lastTransaction?.transactionType === 'warehouse';
        const isIncomingTransfer = lastTransaction?.transactionType === 'incoming_transfer';

        // 🆕 Szczegółowe liczniki ze backendu
        const restoredBlueCount = result.restoredBlueCount || 0;        // 🔵 Niebieskie
        const restoredYellowCount = result.restoredYellowCount || 0;    // 🟡 Żółte
        const restoredOrangeCount = result.restoredOrangeCount || 0;    // 🟠 Pomarańczowe
        
        // Oblicz obliczenie na podstawie liczników
        let calculation;
        if (restoredBlueCount > 0 || restoredYellowCount > 0 || restoredOrangeCount > 0) {
          const parts = [];
          if (restoredBlueCount > 0) parts.push(`+${restoredBlueCount} (niebieskie)`);
          if (restoredYellowCount > 0) parts.push(`-${restoredYellowCount} (żółte)`);
          if (restoredOrangeCount > 0) parts.push(`-${restoredOrangeCount} (pomarańczowe)`);
          calculation = `Stan: ${userStateBefore} = ${parts.join(' ')} = ${userStateAfter}`;
        } else {
          calculation = `Stan przed transakcją: ${userStateBefore}`;
        }
        
        setControlModalData({
          userSymbol: userSymbol,
          beforeCount: userStateBefore,
          restoredBlueCount: restoredBlueCount,        // 🔵 Niebieskie
          restoredYellowCount: restoredYellowCount,    // 🟡 Żółte
          restoredOrangeCount: restoredOrangeCount,    // 🟠 Pomarańczowe
          warehouseReturnedCount: warehouseReturned,
          expectedAfterCount: userStateAfter,
          actualAfterCount: userStateAfter,
          calculation: calculation,
          warehouseBeforeCount: warehouseBeforeCount,
          warehouseAfterCount: warehouseAfterCount,
          warehouseProcessedCount: 0,
          isWarehouse,
          isUndo: true,
          isWarehouseTransaction, // DODANE: typ transakcji dla poprawnego tekstu
          isIncomingTransfer      // DODANE: czy to incoming transfer
        });
        
        // Refresh data
        await Promise.all([fetchItemsToPick(), fetchAllStates()]);
        
        // Restore grey state for MAGAZYN after undo (like web app)
        if (isWarehouse) {
          // Wait a bit for state update to complete
          await new Promise(resolve => setTimeout(resolve, 200));
          // useEffect will re-apply greying based on updated warehouseItems
        }
        
        // Refresh processing status for all users
        await checkProcessingStatus();
        
        // Hide undo button (only one undo allowed like in web app)
        setLastTransaction(null);
        
        // Wait a bit then show modal
        await new Promise(resolve => setTimeout(resolve, 100));
        setShowControlModal(true);
      } else {
        const errorText = await response.text();
        console.error('Undo error:', errorText);
        // Powód z serwera po polsku (np. w międzyczasie zapisano inną transakcję, albo kurtki nie dało się przywrócić - W6)
        let serverMessage = '';
        try { serverMessage = JSON.parse(errorText)?.message || ''; } catch (_e) { serverMessage = ''; }
        appAlert("Nie cofnięto", serverMessage || "Nie udało się cofnąć transakcji");
        if (serverMessage) checkLastTransaction(); // przycisk pokaże aktualny ostatni zapis
      }
    } catch (error) {
      console.error('Error undoing transaction:', error);
      appAlert("Błąd", "Wystąpił błąd podczas cofania transakcji");
    } finally {
      setProcessing(false);
    }
  };

  const filteredWarehouse = warehouseItems.filter(item => {
    if (!warehouseSearch) return true;
    const search = warehouseSearch.toLowerCase();
    const fullName = (item.fullName?.fullName || item.fullName || '').toLowerCase();
    const size = (item.size?.Roz_Opis || item.size || '').toLowerCase();
    const barcode = (item.barcode || '').toLowerCase();
    return fullName.includes(search) || size.includes(search) || barcode.includes(search);
  });

  // Podsumowanie magazynu (auto sparowane + ręcznie przeniesione)
  const warehouseSummary = useMemo(() => {
    const manualMovedCount = Array.isArray(transfers)
      ? transfers.filter(item => item.fromWarehouse === true).length
      : 0;
    const baseCount = Array.isArray(warehouseItems)
      ? warehouseItems.length + manualMovedCount
      : manualMovedCount;
    const matchedWarehouseIds = new Set(
      Array.isArray(matchedPairs)
        ? matchedPairs
            .map(pair => pair?.warehouseProduct?._id)
            .filter(Boolean)
        : []
    );
    const autoMatchedCount = matchedWarehouseIds.size;
    const availableCount = Math.max(0, baseCount - autoMatchedCount - manualMovedCount);

    return {
      baseCount,
      autoMatchedCount,
      manualMovedCount,
      availableCount
    };
  }, [warehouseItems, transfers, matchedPairs]);

  const isWarehouseItemMatched = (itemId) => {
    // Check if item is in matched pairs (for graying out)
    // OR if manually moved to transfers list
    const inMatchedPairs = matchedPairs.some(pair => pair.warehouseProduct?._id === itemId);
    const inTransfers = transfers.some(transfer => transfer._id === itemId && transfer.fromWarehouse);
    return inMatchedPairs || inTransfers;
  };

  const isBlueItemMatched = (itemId) => {
    return matchedPairs.some(pair => pair.blueProduct?.id === itemId);
  };

  // Karta pozycji w kolorze typu (niebieska - usunąć, żółta - z transferów, pomarańczowa - z magazynu, zielona - sparowana):
  // delikatne tło i ramka w kolorze, wyraźny pasek z lewej; napisy w kolorze motywu
  const tintCard = (color) => ({ backgroundColor: `${color}1F`, borderColor: `${color}66`, borderLeftColor: color });

  // Po prawej stronie karty tylko miniatura zdjęcia kurtki (i drukarka); dotknięcie = pełny ekran
  const renderPictureThumb = (item) => {
    const url = itemPictureVariantUrl(allProducts, item, 'thumb'); // 160 px na kartę, nie pełne zdjęcie z aparatu
    const previewUrl = itemPictureVariantUrl(allProducts, item, 'preview');
    const name = typeof item?.fullName === 'object' ? item?.fullName?.fullName : item?.fullName;
    if (!url) {
      return (
        <View style={[styles.pictureThumb, styles.pictureThumbEmpty]} testID="dobieranie-picture-empty">
          <Ionicons name="image-outline" size={20} color={tc('muted', '#94A3B8')} />
        </View>
      );
    }
    return (
      <TouchableOpacity
        testID="dobieranie-picture-thumb"
        accessibilityLabel={`Powiększ zdjęcie: ${name || 'kurtka'}`}
        onPress={() => setPreviewPicture({ url: previewUrl, name })}
      >
        <Image source={{ uri: url }} style={styles.pictureThumb} resizeMode="cover" />
      </TouchableOpacity>
    );
  };

  const renderBlueItem = ({ item, index }) => {
    const isMatched = isBlueItemMatched(item.sourceId);
    const backgroundColor = isMatched ? '#10B981' : '#007bff';
    const displaySize = (item.size === '!NIEOKREŚLONY' || item.size === 'NIEOKREŚLONY') ? '-' : (item.size || 'N/A');
    const displayDate = formatDateValueLocal(item.date || item.timestamp || item.createdAt);
    const displayFrom = item.type === 'sale' ? (item.from || item.transfer_from || 'N/A') : (item.transfer_from || 'N/A');
    const displayTo = item.type === 'sale'
      ? (item.sellingPoint || item.transfer_to || 'N/A')
      : (item.transfer_to || item.sellingPoint || 'N/A');
    
    // Get availability indicator
    const itemId = item.sourceId || item._id;
    const indicator = blueItemIndicators[itemId];
    
    
    return (
      <View style={[styles.transferCard, tintCard(backgroundColor)]}>
        <View style={styles.transferContent}>
          <View style={styles.transferInfo}>
            <Text style={styles.transferName} numberOfLines={1}>
              {item.fullName || 'N/A'}
            </Text>
            <Text style={styles.transferSize}>
              {displaySize} • {item.type === 'sale' ? 'Sprzedaż' : 'Transfer'}
            </Text>
            <Text style={styles.transferSize}>
              {displayDate || 'N/A'} • {displayFrom} {'->'} {displayTo}
            </Text>
            <Text style={styles.transferBarcode}>
              {item.barcode || 'N/A'}
            </Text>
            {indicator && (
              <Text style={styles.transferIndicator}>
                {indicator === 'OK' ? '✓ Dostępny' : '⚠ Do korekt'}
              </Text>
            )}
          </View>
          
          <View style={styles.transferBadges}>
            {renderPictureThumb(item)}
          </View>
        </View>
      </View>
    );
  };

  const renderWarehouseItem = ({ item, index }) => {
    const isMatched = isWarehouseItemMatched(item._id);
    const isGreyed = isMatched || greyedWarehouseItems.has(item._id);
    
    return (
      <View style={[styles.warehouseCard, isGreyed && styles.warehouseCardMatched]}>
        <View style={styles.warehouseContent}>
          <View style={styles.warehouseInfo}>
            <Text style={[styles.warehouseName, isGreyed && styles.matchedText]} numberOfLines={1}>
              {item.fullName?.fullName || item.fullName}
            </Text>
            <Text style={[styles.warehouseSize, isGreyed && styles.matchedText]}>
              {item.size?.Roz_Opis || item.size}
            </Text>
            <Text style={[styles.warehouseBarcode, isGreyed && styles.matchedText]}>
              {item.barcode}
            </Text>
          </View>
          
          <TouchableOpacity
            style={[
              styles.warehouseButton, 
              isGreyed && styles.warehouseButtonDisabled
            ]}
            onPress={() => !isGreyed && handleMoveFromWarehouse(item)}
            disabled={isGreyed}
          >
            <Text style={styles.warehouseButtonText}>
              {isGreyed ? '🔒 Sparowany' : 'Przenieś'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderMatchedWarehouseItem = ({ item, index }) => {
    const isGreyed = greyedWarehouseItems.has(item._id);
    const displaySize = (item.size?.Roz_Opis || item.size || 'N/A');
    const displayDate = formatDateValueLocal(item.date || item.timestamp || item.createdAt);
    const displayFrom = item.transfer_from || 'MAGAZYN';
    const displayTo = item.transfer_to || item.sellingPoint || 'N/A';
    
    return (
      <View style={[styles.transferCard, tintCard('#ff8c00'), { opacity: isGreyed ? 0.7 : 1.0 }]}>
        <View style={styles.transferContent}>
          <View style={styles.transferInfo}>
            <Text style={styles.transferName} numberOfLines={1}>
              {isGreyed && '✓ '}{item.fullName?.fullName || item.fullName}
            </Text>
            <Text style={styles.transferSize}>
              {displaySize}
            </Text>
            <Text style={styles.transferSize}>
              {displayDate || 'N/A'} • {displayFrom} {'->'} {displayTo}
            </Text>
            <Text style={styles.transferBarcode}>
              {item.barcode}
            </Text>
          </View>
          
          <View style={styles.transferBadges}>
            {renderPictureThumb(item)}
            <View style={styles.transferActions}>
            <TouchableOpacity
              style={styles.printButton}
              onPress={() => {
                // 🔧 Enrich item with price AND color before printing
                const enrichedItem = { ...item };
                const itemFullName = typeof item.fullName === 'string' ? item.fullName : item.fullName?.fullName;
                
                // Try warehouse first (match by barcode OR fullName)
                if (!enrichedItem.price) {
                  const matchingWarehouse = warehouseItems.find(w => 
                    w.barcode === enrichedItem.barcode || 
                    w.fullName === itemFullName
                  );
                  if (matchingWarehouse) {
                    enrichedItem.price = matchingWarehouse.price;
                  }
                }
                
                // Try allProducts cache (match by fullName) - get price AND color
                if (itemFullName && allProducts.length > 0) {
                  const productByName = allProducts.find(p => p.fullName === itemFullName);
                  if (productByName) {
                    if (!enrichedItem.price) {
                      enrichedItem.price = productByName.price;
                    }
                    if (!enrichedItem.color) {
                      enrichedItem.color = productByName.color;
                    }
                  } else if (!enrichedItem.price) {
                    enrichedItem.price = 0; // Fallback if product deleted
                  }
                }
                
                handlePrintLabel(enrichedItem);
              }}
            >
              <Ionicons name="print" size={28} color={tc('text', "#fff")} />
            </TouchableOpacity>

            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderTransferItem = ({ item, index }) => {
    const fromWarehouse = item.fromWarehouse;
    const backgroundColor = fromWarehouse ? '#ff8c00' : '#ffc107';
    const displaySize = (item.size?.Roz_Opis || item.size || 'N/A');
    const displayDate = formatDateValueLocal(item.date || item.timestamp || item.createdAt);
    const displayFrom = fromWarehouse ? (item.transfer_from || 'MAGAZYN') : (item.transfer_from || 'N/A');
    const displayTo = item.transfer_to || item.sellingPoint || 'N/A';
    
    return (
      <View style={[styles.transferCard, tintCard(backgroundColor)]}>
        <View style={styles.transferContent}>
          <View style={styles.transferInfo}>
            <Text style={styles.transferName} numberOfLines={1}>
              {item.fullName?.fullName || item.fullName}
            </Text>
            <Text style={styles.transferSize}>
              {displaySize}
            </Text>
            <Text style={styles.transferSize}>
              {displayDate || 'N/A'} • {displayFrom} {'->'} {displayTo}
            </Text>
            <Text style={styles.transferBarcode}>
              {item.barcode}
            </Text>
          </View>
          
          <View style={styles.transferBadges}>
            {renderPictureThumb(item)}
            <View style={styles.transferActions}>
            <TouchableOpacity
              style={styles.printButton}
              onPress={() => {
                // 🔧 Enrich item with price AND color before printing
                const enrichedItem = { ...item };
                const itemFullName = typeof item.fullName === 'string' ? item.fullName : item.fullName?.fullName;
                
                // Try warehouse first (match by barcode OR fullName)
                if (!enrichedItem.price) {
                  const matchingWarehouse = warehouseItems.find(w => 
                    w.barcode === enrichedItem.barcode || 
                    w.fullName === itemFullName
                  );
                  if (matchingWarehouse) {
                    enrichedItem.price = matchingWarehouse.price;
                  }
                }
                
                // Try allProducts cache (match by fullName) - get price AND color
                if (itemFullName && allProducts.length > 0) {
                  const productByName = allProducts.find(p => p.fullName === itemFullName);
                  if (productByName) {
                    if (!enrichedItem.price) {
                      enrichedItem.price = productByName.price;
                    }
                    if (!enrichedItem.color) {
                      enrichedItem.color = productByName.color;
                    }
                  } else if (!enrichedItem.price) {
                    enrichedItem.price = 0; // Fallback if product deleted
                  }
                }
                
                handlePrintLabel(enrichedItem);
              }}
            >
              <Ionicons name="print" size={28} color={tc('text', "#fff")} />
            </TouchableOpacity>

            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderYellowTransferItem = ({ item, index }) => {
    const fullName = item.fullName?.fullName || item.fullName;
    const size = (item.size?.Roz_Opis || item.size || 'N/A');
    const transferFrom = item.transfer_from || 'N/A';
    const transferTo = item.transfer_to || item.sellingPoint || 'N/A';
    const displayDate = formatDateValueLocal(item.date || item.timestamp || item.createdAt);
    
    return (
      <View style={[styles.transferCard, tintCard('#ffc107')]}>
        <View style={styles.transferContent}>
          <View style={styles.transferInfo}>
            <Text style={styles.transferName} numberOfLines={1}>
              {fullName}
            </Text>
            <Text style={styles.transferSize}>
              {size}
            </Text>
            <Text style={styles.transferSize}>
              {displayDate || 'N/A'} • {transferFrom} {'->'} {transferTo}
            </Text>
            <Text style={styles.transferBarcode}>
              {item.barcode}
            </Text>
          </View>
          
          <View style={styles.transferBadges}>
            {renderPictureThumb(item)}
            <View style={styles.transferActions}>
            <TouchableOpacity
              style={styles.printButton}
              onPress={() => {
                // 🔧 Enrich item with price AND color before printing
                const enrichedItem = { ...item };
                const itemFullName = typeof item.fullName === 'string' ? item.fullName : item.fullName?.fullName;
                
                // Try warehouse first (match by barcode OR fullName)
                if (!enrichedItem.price) {
                  const matchingWarehouse = warehouseItems.find(w => 
                    w.barcode === enrichedItem.barcode || 
                    w.fullName === itemFullName
                  );
                  if (matchingWarehouse) {
                    enrichedItem.price = matchingWarehouse.price;
                  }
                }
                
                // Try allProducts cache (match by fullName) - get BOTH price AND color
                if (itemFullName && allProducts.length > 0) {
                  const productByName = allProducts.find(p => p.fullName === itemFullName);
                  if (productByName) {
                    if (!enrichedItem.price) {
                      enrichedItem.price = productByName.price;
                    }
                    if (!enrichedItem.color) {
                      enrichedItem.color = productByName.color;
                    }
                  } else if (!enrichedItem.price) {
                    enrichedItem.price = 0; // Fallback if product deleted
                  }
                }
                
                handlePrintLabel(enrichedItem);
              }}
            >
              <Ionicons name="print" size={28} color={tc('text', "#fff")} />
            </TouchableOpacity>

            </View>
          </View>
        </View>
      </View>
    );
  };

  const resolveSellingPointIdForLabel = (item) => {
    if (selectedUserId) {
      return selectedUserId.toString();
    }

    const directIdCandidates = [
      item?.sellingPoint?._id,
      item?.sellingPointId,
      item?.userId,
      item?.user?._id,
      item?.ownerId,
    ];

    const directId = directIdCandidates.find((candidate) =>
      typeof candidate === 'string' && candidate.trim().length > 0
    );
    if (directId) {
      return directId.toString();
    }

    const symbolCandidates = [
      item?.transfer_to,
      item?.symbol,
      item?.sellingPoint?.symbol,
      item?.sellingPoint,
      item?.from,
    ];
    const symbolOrPoint = symbolCandidates.find((candidate) =>
      typeof candidate === 'string' && candidate.trim().length > 0
    );

    if (!symbolOrPoint) {
      return null;
    }

    const matchedUser = users.find((user) => {
      const userSymbol = user.symbol || '';
      const sellingPoint = user.sellingPoint || '';
      return (
        userSymbol === symbolOrPoint ||
        sellingPoint === symbolOrPoint ||
        (user.role === 'magazyn' && symbolOrPoint === 'MAGAZYN')
      );
    });

    return matchedUser?._id ? matchedUser._id.toString() : null;
  };
  const PRINTER_REQUEST_TIMEOUT_MS = 1500;
  const PRINTER_CHUNK_RETRY_COUNT = 1;

  const sendZplToPrinter = async (zplCode) => {
    const printerIP = '192.168.1.25';
    const printerPort = 9100;
    const printerUrl = `http://${printerIP}:${printerPort}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PRINTER_REQUEST_TIMEOUT_MS);

    try {
      await fetch(printerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: zplCode,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return true;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        return true;
      }

      return false;
    }
  };

  const sendZplChunksToPrinter = async (zplCodes) => {
    if (!Array.isArray(zplCodes) || zplCodes.length === 0) {
      return true;
    }

    // Join all ZPL codes into one job — drukarka drukuje ciągiem bez pauz
    const combined = zplCodes.join('');
    for (let attempt = 0; attempt <= PRINTER_CHUNK_RETRY_COUNT; attempt++) {
      const result = await sendZplToPrinter(combined);
      if (result) return true;
    }
    return false;
  };

  const fetchLabelZplCodes = async (item) => {
    const itemSize = item.isFromSale
      ? item.size
      : (typeof item.size === 'object' ? item.size?.Roz_Opis : item.size);

    const sellingPointId = resolveSellingPointIdForLabel(item);
    if (!sellingPointId) {
      console.error('❌ Brak sellingPointId dla produktu:', item.fullName || item.product || item.barcode);
      return null;
    }

    const priceInfo = getPriceFromPriceList(item, itemSize);

    let fallbackPriceInfo = null;
    if (!priceInfo && allProducts.length > 0) {
      const product = allProducts.find(p =>
        (item.barcode && p.code === item.barcode) ||
        (item.productId && p._id === item.productId) ||
        (typeof item.fullName === 'object' && item.fullName?.fullName && p.fullName === item.fullName.fullName) ||
        (typeof item.fullName === 'string' && p.fullName === item.fullName)
      );

      if (product) {
        fallbackPriceInfo = {
          regularPrice: product.price || 0,
          discountPrice: product.discount_price || 0,
          sizeExceptionPrice: null,
          hasDiscount: product.discount_price && product.discount_price > 0
        };

        if (itemSize && product.priceExceptions && product.priceExceptions.length > 0) {
          const sizeException = product.priceExceptions.find(exception => {
            const exceptionSizeName = exception.size?.Roz_Opis || exception.size;
            return exceptionSizeName === itemSize;
          });

          if (sizeException) {
            fallbackPriceInfo.sizeExceptionPrice = sizeException.value;
          }
        }
      }
    }

    const finalPriceInfo = priceInfo || fallbackPriceInfo;
    const shouldPrintTwoLabels = finalPriceInfo && finalPriceInfo.hasDiscount && !finalPriceInfo.sizeExceptionPrice;

    const itemBarcode = item.barcode || item.barcodes;
    const normalizedItemFullName =
      typeof item.fullName === 'object' ? item.fullName?.fullName : item.fullName;

    const response = await tokenService.authenticatedFetch(getApiUrl('/print/generate-zpl'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellingPointId,
        itemId: item.productId?.toString() || item._id?.toString(),
        itemBarcode: itemBarcode?.toString(),
        itemFullName: normalizedItemFullName,
        itemSize,
        colorId: item.color?._id?.toString() || item.colorId?.toString() || (typeof item.color === 'string' ? item.color : undefined),
        forceDoubleLabel: shouldPrintTwoLabels,
      }),
    });

    if (!response.ok) {
      console.error('❌ Backend ZPL error:', response.status);
      return null;
    }

    const { zplCodes } = await response.json();
    if (!Array.isArray(zplCodes) || zplCodes.length === 0) {
      return null;
    }

    return zplCodes;
  };

  const handlePrintLabel = async (item) => {
    try {
      const zplCodes = await fetchLabelZplCodes(item);
      if (!zplCodes) {
        return false;
      }

      return await sendZplChunksToPrinter(zplCodes);
    } catch (error) {
      console.error('❌ Error in handlePrintLabel:', error);
      return false;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      
      <View style={{ paddingHorizontal: 12 }}>
        <ScreenHeader icon="shirt" title="Dobierz" subtitle="Dobieranie produktów z magazynu" />
      </View>

      {/* Powiększone zdjęcie kurtki na cały ekran - dotknięcie zamyka */}
      <Modal visible={Boolean(previewPicture)} transparent animationType="fade" onRequestClose={() => setPreviewPicture(null)}>
        <Pressable style={styles.picturePreviewBackdrop} onPress={() => setPreviewPicture(null)} testID="dobieranie-picture-preview">
          {previewPicture ? (
            <>
              <Image source={{ uri: previewPicture.url }} style={styles.picturePreviewImage} resizeMode="contain" />
              {previewPicture.name ? <Text style={styles.picturePreviewName}>{previewPicture.name}</Text> : null}
            </>
          ) : null}
        </Pressable>
      </Modal>

      <KeyboardSafeScreen>
      <ScrollView alwaysBounceVertical 
        ref={warehouseReveal.scrollRef}
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="rgb(0, 123, 255)"
            colors={["rgb(0, 123, 255)"]}
          />
        }
      >
        {/* PROCESSING STATUS - ALWAYS VISIBLE AT TOP */}
        {processingStatusMessage && (
          <View style={styles.topWarningContainer}>
            <View style={(allProcessed && !hasPreviousUnprocessed) ? styles.topSuccess : styles.topWarning}>
              <View style={styles.topWarningHeader}>
                <View style={[styles.topWarningIcon, { backgroundColor: (allProcessed && !hasPreviousUnprocessed) ? 'rgba(16, 185, 129, 0.18)' : 'rgba(245, 158, 11, 0.18)' }]}>
                  <Ionicons
                    name={(allProcessed && !hasPreviousUnprocessed) ? "checkmark-circle" : "alert-circle"}
                    size={24}
                    color={(allProcessed && !hasPreviousUnprocessed) ? "#10B981" : "#F59E0B"}
                  />
                </View>
                <Text style={styles.topWarningTitle}>
                  {/* treść z serwera bez krzykliwego „UWAGA!” - kolor i ikona i tak ostrzegają */}
                  {String(processingStatusMessage).replace(/^UWAGA!?\s*/i, '')}
                </Text>
              </View>
              <View style={styles.topWarningContent}>
                {!allProcessed && unprocessedCount > 0 && (
                  <>
                    <Text style={styles.topWarningCountLabel}>
                      Nieprzetworzonych pozycji: <Text style={styles.topWarningCount}>{unprocessedCount}</Text>
                    </Text>
                    {currentUnprocessedUsers.length > 0 && (
                      <View style={styles.topWarningDaysContainer}>
                        <Text style={styles.topWarningDaysLabel}>Punkty do domknięcia (tapnij, aby przełączyć):</Text>
                        <View style={styles.topWarningDayChipsRow}>
                          {currentUnprocessedUsers.map((entry, index) => (
                            <TouchableOpacity
                              key={`${entry.symbol}-${index}`}
                              style={styles.topWarningDayChip}
                              onPress={() => jumpToCurrentUnprocessedUser(entry.symbol)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.topWarningDayChipText}>{entry.label || entry.symbol} ({entry.count || 0})</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                )}
                {hasPreviousUnprocessed && previousUnprocessedCount > 0 && (
                  <>
                    <Text style={styles.topWarningCountLabel}>
                      Zaległe z wcześniejszych dni: <Text style={styles.topWarningCount}>{previousUnprocessedCount}</Text>
                    </Text>
                    {previousUnprocessedByDate.length > 0 && (
                      <View style={styles.topWarningDaysContainer}>
                        <Text style={styles.topWarningDaysLabel}>Dni (tapnij, aby przejść):</Text>
                        <View style={styles.topWarningDayChipsRow}>
                          {previousUnprocessedByDate.map((entry, index) => (
                            <TouchableOpacity
                              key={`${entry.date}-${index}`}
                              style={styles.topWarningDayChip}
                              onPress={() => jumpToPreviousUnprocessedDay(entry.date)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.topWarningDayChipText}>{entry.date} ({entry.count})</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          </View>
        )}

        {/* User and Date Selection */}
        <View style={styles.section}>
          {/* Informacja o cenniku wybranego użytkownika - sam tekst nad wyborem */}
          {selectedUserId && (
            <Text style={[styles.priceListInfoLine, { color: priceListLoading ? tc('muted', '#94A3B8') : hasPriceList ? '#10B981' : '#F59E0B' }]}>
              {priceListLoading
                ? 'Ładowanie cennika...'
                : hasPriceList
                  ? `Cennik: ${priceListCount} produktów - ceny z dedykowanego cennika`
                  : 'Brak dedykowanego cennika - ceny z kart produktów'}
            </Text>
          )}
          <Text style={styles.label}>Użytkownik:</Text>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowUserModal(true)}
          >
            <Text style={styles.selectButtonText}>
              {selectedUserId 
                ? filteredUsers.find(u => u._id === selectedUserId)?.sellingPoint || 
                  filteredUsers.find(u => u._id === selectedUserId)?.username || 
                  filteredUsers.find(u => u._id === selectedUserId)?.email
                : "Wybierz użytkownika..."}
            </Text>
            <Ionicons name="people" size={24} color={tc('text', "#fff")} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Data:</Text>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.selectButtonText}>
              {selectedDate.toLocaleDateString("pl-PL")}
            </Text>
            <Ionicons name="calendar" size={24} color={tc('text', "#fff")} />
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowDatePicker(false);
                if (onlyOrangeData?.awaitingAlternativeDate) {
                  if (!date) {
                    setOnlyOrangeData((prev) => prev ? { ...prev, awaitingAlternativeDate: false } : prev);
                    return;
                  }

                  const alternativeDate = formatDateLocal(date);
                  setOnlyOrangeData((prev) => prev ? {
                    ...prev,
                    alternativeDate,
                    awaitingAlternativeDate: false
                  } : prev);

                  handleProcessItems({
                    skipOnlyOrangeGate: true,
                    processingDateOverride: date
                  });
                  return;
                }

                if (date) setSelectedDate(date);
              }}
            />
          )}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="rgb(0, 123, 255)" />
            <Text style={styles.loadingText}>Ładowanie danych...</Text>
          </View>
        ) : selectedUserId ? (
          <>
            {/* Warehouse Items Section - Always Visible on Top */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionTitleIcon, { backgroundColor: '#ff8c0026' }]}>
                  <Ionicons name="archive" size={20} color="#ff8c00" />
                </View>
                <Text style={styles.sectionTitle}>
                  Magazyn ({warehouseItems.length})
                </Text>
              </View>
              <Text style={styles.sectionSubtitle}>Dostępne produkty w magazynie</Text>

              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
                <TextInput
                  style={styles.searchInput}
                  ref={warehouseSearchRef}
                  placeholder="Szukaj w magazynie..."
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={warehouseSearch}
                  onChangeText={setWarehouseSearch}
                  onFocus={() => warehouseReveal.revealWithSpace(warehouseSearchRef, 320)} // miejsce na kilka wyników
                />
                {warehouseSearch !== '' && (
                  <TouchableOpacity onPress={() => setWarehouseSearch('')}>
                    <Ionicons name="close-circle" size={20} color={tc('muted', "#94A3B8")} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.warehouseFoundText}>
                Znaleziono: {filteredWarehouse.length} produktów
              </Text>
              <Text style={styles.warehouseSummaryText}>
                Stan magazynu: {warehouseSummary.baseCount}
                {warehouseSummary.autoMatchedCount > 0 ? ` - ${warehouseSummary.autoMatchedCount} (sparowane)` : ''}
                {warehouseSummary.manualMovedCount > 0 ? ` - ${warehouseSummary.manualMovedCount} (przeniesione)` : ''}
                {' '}= {warehouseSummary.availableCount}
              </Text>

              <ScrollView
                style={[
                  styles.warehouseList,
                  filteredWarehouse.length === 0 && styles.warehouseListEmpty,
                  filteredWarehouse.length > 0 && filteredWarehouse.length <= 5 && styles.warehouseListSmall
                ]}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
                scrollEnabled={filteredWarehouse.length > 5}
              >
                {filteredWarehouse.length > 0 ? (
                  filteredWarehouse.map((item, index) => (
                    <View key={`warehouse-${item._id}`}>
                      {renderWarehouseItem({ item, index })}
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyWarehouse}>
                    <Text style={styles.emptyWarehouseText}>
                      {warehouseSearch ? 'Brak wyników wyszukiwania' : 'Brak produktów w magazynie'}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>

            {/* Combined Blue and Transfer Items Section */}
            {(blueItems.length > 0 || transfers.length > 0 || matchedPairs.length > 0 || yellowTransfers.length > 0) && (
              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionTitleIcon, { backgroundColor: 'rgba(13, 110, 253, 0.15)' }]}>
                    <Ionicons name="list" size={20} color="#0D6EFD" />
                  </View>
                  <Text style={styles.sectionTitle}>
                    Do przetworzenia ({blueItems.length + transfers.length + matchedPairs.length + yellowTransfers.length})
                  </Text>
                </View>
                <Text style={styles.sectionSubtitle}>
                  Niebieskie (usunąć): {blueItems.length} | Żółte (dodać z transferów): {yellowTransfers.length} | Pomarańczowe (dodać z magazynu): {transfers.length + matchedPairs.length}
                </Text>
                
                {/* Blue Items */}
                {blueItems.map((item, index) => (
                  <View key={`blue-${item.sourceId}-${index}`}>
                    {renderBlueItem({ item, index })}
                  </View>
                ))}
                
                {/* Yellow Transfer Items (incoming from other users) */}
                {yellowTransfers.map((item, index) => (
                  <View key={`yellow-${item._id}-${index}`}>
                    {renderYellowTransferItem({ item, index })}
                  </View>
                ))}

                {/* Matched Warehouse Items (orange auto-matched) */}
                {matchedPairs.map((pair, pairIndex) => {
                  const warehouseItem = pair.warehouseProduct;
                  // Check if this warehouse item is already in transfers (manually moved)
                  const alreadyInTransfers = transfers.some(t => t._id === warehouseItem._id && t.fromWarehouse);

                  if (!alreadyInTransfers) {
                    return (
                      <View key={`matched-warehouse-${warehouseItem._id}-${pairIndex}`}>
                        {renderMatchedWarehouseItem({ item: warehouseItem, index: pairIndex })}
                      </View>
                    );
                  }
                  return null;
                })}
                
                {/* Transfer Items (manually moved from warehouse) */}
                {transfers.map((item, index) => (
                  <View key={`transfer-${item._id}-${index}`}>
                    {renderTransferItem({ item, index })}
                  </View>
                ))}

                {/* Podsumowanie +/- */}
                {(blueItems.length + transfers.length + matchedPairs.length + yellowTransfers.length) > 0 && (
                  <View style={styles.processingSummaryBox}>
                    {balanceStats.balance !== 0 && (
                      <Text
                        style={[
                          styles.summaryLine,
                          balanceStats.balance > 0 ? styles.summaryPositive : styles.summaryNegative
                        ]}
                      >
                        {balanceStats.balance > 0
                          ? `Zostanie dopisane do stanu: +${balanceStats.balance}`
                          : `Zostanie odpisane ze stanu: ${balanceStats.balance}`}
                      </Text>
                    )}
                    <Text
                      style={[
                        styles.summaryLine,
                        balanceStats.warehouse === 0 ? styles.summaryMuted : styles.summaryWarehouse
                      ]}
                    >
                      Zostanie odpisane z magazynu: {balanceStats.warehouse === 0 ? '0' : `-${balanceStats.warehouse}`}
                    </Text>
                    <Text style={[styles.summaryLine, styles.summaryMuted]}>
                      Zostanie przepisane do korekt: {balanceStats.corrections}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Process Button */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[
                  styles.processButton,
                  (processing || (blueItems.length === 0 && transfers.length === 0 && yellowTransfers.length === 0)) && styles.processButtonDisabled
                ]}
                onPress={handleProcessItems}
                disabled={processing || (blueItems.length === 0 && transfers.length === 0 && yellowTransfers.length === 0)}
              >
                {processing ? (
                  <ActivityIndicator color={tc('text', "#fff")} />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={24} color={tc('text', "#fff")} />
                    <Text style={styles.processButtonText}>Przetwórz</Text>
                  </>
                )}
              </TouchableOpacity>

              {lastTransaction && 
               lastTransaction.userSymbol === filteredUsers.find(u => u._id === selectedUserId)?.symbol && (
                <TouchableOpacity
                  style={[styles.undoButton, processing && styles.undoButtonDisabled]}
                  onPress={() => setShowUndoConfirmModal(true)}
                  disabled={processing}
                >
                  <Ionicons name="arrow-undo" size={24} color={tc('text', "#fff")} />
                  <Text style={styles.undoButtonText}>
                    {`Cofnij zapis dla ${lastTransaction.userSymbol} z ${new Date(lastTransaction.timestamp).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="person-add" size={64} color="#475569" />
            <Text style={styles.emptyText}>
              Wybierz użytkownika aby rozpocząć
            </Text>
          </View>
        )}
      </ScrollView>
      </KeyboardSafeScreen>

      {/* User Selection Modal */}
      <Modal
        visible={showUserModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUserModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wybierz użytkownika</Text>
              <TouchableOpacity onPress={() => setShowUserModal(false)}>
                <Ionicons name="close" size={28} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.userItem,
                    selectedUserId === item._id && styles.userItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedUserId(item._id);
                    setShowUserModal(false);
                  }}
                >
                  <View style={styles.userItemContent}>
                    <Ionicons 
                      name="person-circle" 
                      size={32} 
                      color={selectedUserId === item._id ? "rgb(0, 123, 255)" : "#64748B"} 
                    />
                    <View style={styles.userItemText}>
                      <Text style={styles.userItemName}>
                        {item.sellingPoint || item.username || item.email}
                      </Text>
                      {item.symbol && (
                        <Text style={styles.userItemSymbol}>{item.symbol}</Text>
                      )}
                    </View>
                  </View>
                  {selectedUserId === item._id && (
                    <Ionicons name="checkmark-circle" size={24} color="rgb(0, 123, 255)" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Control Modal */}
      <Modal
        visible={showControlModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowControlModal(false)}
      >
        <View style={styles.controlModalOverlay}>
          <View style={styles.controlModalGradient}>
            <View style={styles.controlModalContent}>
              <View style={styles.controlModalHeader}>
                <Text style={styles.controlModalEmoji}>{controlModalData?.isUndo ? '↩️' : '✅'}</Text>
                <Text style={styles.controlModalTitle}>
                  {controlModalData?.isUndo ? 'Transakcja cofnięta' : 'Przetwarzanie zakończone'}
                </Text>
              </View>

              {controlModalData && (
                <ScrollView style={styles.controlModalBody} showsVerticalScrollIndicator={false}>
                  <View style={styles.userSection}>
                    <Text style={styles.userLabel}>Użytkownik</Text>
                    <Text style={styles.userValue}>{controlModalData.userSymbol}</Text>
                  </View>

                  {controlModalData.isUndo ? (
                    // Undo mode - show restoration info
                    <>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Stan przed cofnięciem</Text>
                        <View style={styles.statValueBlue}>
                          <Text style={styles.statValueTextBlue}>{controlModalData.beforeCount}</Text>
                        </View>
                      </View>

                      {/* For warehouse: show items removed */}
                      {controlModalData.isWarehouse ? (
                        <>
                          {controlModalData.restoredCount !== undefined && controlModalData.restoredCount < 0 && (
                            <View style={styles.warehouseRemovalBox}>
                              <Text style={styles.warehouseRemovalLabel}>Usunięcie z magazynu</Text>
                              <Text style={styles.warehouseRemovalValue}>{controlModalData.restoredCount}</Text>
                            </View>
                          )}
                        </>
                      ) : (
                        <>
                          {/* For selling points: show restored products and removed items */}
                          {controlModalData.restoredBlueCount !== undefined && (
                            <>
                              {controlModalData.restoredBlueCount > 0 && (
                                <View style={styles.statRowGreen}>
                                  <Text style={styles.statLabelGreen}>🔵 Przywrócone (niebieskie)</Text>
                                  <Text style={styles.statValueTextGreen}>+{controlModalData.restoredBlueCount}</Text>
                                </View>
                              )}

                              {controlModalData.restoredYellowCount > 0 && (
                                <View style={styles.statRowYellow}>
                                  <Text style={styles.statLabelYellow}>🟡 Usunięte (żółte)</Text>
                                  <Text style={styles.statValueTextYellow}>-{controlModalData.restoredYellowCount}</Text>
                                </View>
                              )}
                            </>
                          )}
                          
                          {/* Fallback dla starego podejścia */}
                          {controlModalData.restoredCount !== undefined && controlModalData.restoredBlueCount === undefined && (
                            <>
                              {controlModalData.restoredCount > 0 && (
                                <View style={styles.statRowGreen}>
                                  <Text style={styles.statLabelGreen}>↩️ Przywrócone produkty</Text>
                                  <Text style={styles.statValueTextGreen}>+{controlModalData.restoredCount}</Text>
                                </View>
                              )}
                            </>
                          )}

                          {controlModalData.warehouseReturnedCount > 0 && (
                            <View style={styles.statRowOrange}>
                              <Text style={styles.statLabelOrange}>📦 Usunięte ze stanu (wrócone do magazynu)</Text>
                              <Text style={styles.statValueTextOrange}>-{controlModalData.warehouseReturnedCount}</Text>
                            </View>
                          )}
                        </>
                      )}

                      <View style={styles.calculationBox}>
                        <Text style={styles.calculationLabel}>OBLICZENIE</Text>
                        <Text style={styles.calculationText}>{controlModalData.calculation}</Text>
                      </View>

                      <View style={styles.resultRow}>
                        <Text style={styles.resultLabel}>
                          {controlModalData.isWarehouse ? 'Oczekiwany stan końcowy magazynu' : 'Oczekiwany stan końcowy'}
                        </Text>
                        <View style={styles.resultValue}>
                          <Text style={styles.resultValueText}>{controlModalData.expectedAfterCount}</Text>
                        </View>
                      </View>

                      {/* Warehouse state display (only for selling points, not for warehouse itself) */}
                      {!controlModalData.isWarehouse && (
                        <View style={styles.warehouseStateBox}>
                          <Text style={styles.warehouseStateTitle}>📦 MAGAZYN</Text>
                          <View style={styles.warehouseStateRow}>
                            <Text style={styles.warehouseStateLabel}>Stan przed:</Text>
                            <Text style={styles.warehouseStateValue}>{controlModalData.warehouseBeforeCount}</Text>
                          </View>
                          <View style={styles.warehouseStateRow}>
                            <Text style={styles.warehouseStateLabel}>Zwrócono:</Text>
                            <Text style={styles.warehouseStateValue}>+{controlModalData.warehouseReturnedCount || 0}</Text>
                          </View>
                          <View style={styles.warehouseStateRow}>
                            <Text style={styles.warehouseStateLabel}>Stan po:</Text>
                            <Text style={styles.warehouseStateValue}>{controlModalData.warehouseAfterCount}</Text>
                          </View>
                        </View>
                      )}

                      {/* Bottom spacing for scrollable content */}
                      <View style={{ height: 30 }} />
                    </>
                  ) : (
                    // Processing mode - show calculation
                    <>
                      {controlModalData.remainingItems > 0 && (
                        <View style={styles.warningBox}>
                          <Text style={styles.warningEmoji}>⚠️</Text>
                          <View style={styles.warningContent}>
                            <Text style={styles.warningTitle}>UWAGA! Nie wszystkie produkty z dnia zostały przetworzone</Text>
                            <Text style={styles.warningText}>Nieprzetworzonych pozycji: {controlModalData.remainingItems}</Text>
                          </View>
                        </View>
                      )}

                        {controlModalData.correctionsCount > 0 && (
                          <View style={styles.statRowYellow}>
                            <Text style={styles.statLabelYellow}>⚠️ Przeniesione do korekt</Text>
                            <Text style={styles.statValueTextYellow}>+{controlModalData.correctionsCount}</Text>
                          </View>
                        )}

                        {/* For MAGAZYN - show state before, yellow transfers, calculation, and expected state */}
                        {controlModalData.isWarehouse ? (
                          <>
                            <View style={styles.statRow}>
                              <Text style={styles.statLabel}>Stan magazynu przed</Text>
                              <View style={styles.statValueBlue}>
                                <Text style={styles.statValueTextBlue}>{controlModalData.beforeCount}</Text>
                              </View>
                            </View>

                            {controlModalData.yellowCount > 0 && (
                              <View style={styles.statRowYellow}>
                                <Text style={styles.statLabelYellow}>🟡 Przyjęcia do magazynu</Text>
                                <Text style={styles.statValueTextYellow}>+{controlModalData.yellowCount}</Text>
                              </View>
                            )}

                            <View style={styles.calculationBox}>
                              <Text style={styles.calculationLabel}>OBLICZENIE</Text>
                              <Text style={styles.calculationText}>{controlModalData.beforeCount} + {controlModalData.yellowCount} (przyjęcia do magazynu) = {controlModalData.expectedAfterCount}</Text>
                            </View>

                            <View style={styles.resultRow}>
                              <Text style={styles.resultLabel}>Oczekiwany stan końcowy magazynu</Text>
                              <View style={styles.resultValue}>
                                <Text style={styles.resultValueText}>{controlModalData.expectedAfterCount}</Text>
                              </View>
                            </View>
                          </>
                        ) : (
                          <>
                            {/* For selling points - show full breakdown */}
                            <View style={styles.statRow}>
                              <Text style={styles.statLabel}>Stan początkowy</Text>
                              <View style={styles.statValueBlue}>
                                <Text style={styles.statValueTextBlue}>{controlModalData.beforeCount}</Text>
                              </View>
                            </View>

                            {controlModalData.allBlueCount > 0 && (
                              <View style={styles.statRowRed}>
                                <Text style={styles.statLabelRed}>🔵 Niebieskie (odpis)</Text>
                                <Text style={styles.statValueTextRed}>-{controlModalData.allBlueCount}</Text>
                              </View>
                            )}

                            {controlModalData.yellowCount > 0 && (
                              <View style={styles.statRowYellow}>
                                <Text style={styles.statLabelYellow}>🟡 Żółte transfery (dopis)</Text>
                                <Text style={styles.statValueTextYellow}>+{controlModalData.yellowCount}</Text>
                              </View>
                            )}

                            {controlModalData.allOrangeCount > 0 && (
                              <View style={styles.statRowOrange}>
                                <Text style={styles.statLabelOrange}>🟠 Pomarańczowe (z magazynu)</Text>
                                <Text style={styles.statValueTextOrange}>+{controlModalData.allOrangeCount}</Text>
                              </View>
                            )}

                            <View style={styles.calculationBox}>
                              <Text style={styles.calculationLabel}>OBLICZENIE</Text>
                              <Text style={styles.calculationText}>{controlModalData.calculation}</Text>
                            </View>

                            <View style={styles.resultRow}>
                              <Text style={styles.resultLabel}>Rzeczywisty stan końcowy</Text>
                              <View style={styles.resultValue}>
                                <Text style={styles.resultValueText}>{controlModalData.actualAfterCount || controlModalData.expectedAfterCount}</Text>
                              </View>
                            </View>

                            {/* Warehouse state display (only for selling points, not for warehouse itself) */}
                            {!controlModalData.isWarehouse && (
                              <View style={styles.warehouseStateBox}>
                                <Text style={styles.warehouseStateTitle}>📦 MAGAZYN</Text>
                                <View style={styles.warehouseStateRow}>
                                  <Text style={styles.warehouseStateLabel}>Stan przed:</Text>
                                  <Text style={styles.warehouseStateValue}>{controlModalData.warehouseBeforeCount}</Text>
                                </View>
                                <View style={styles.warehouseStateRow}>
                                  <Text style={styles.warehouseStateLabel}>Przetworzone:</Text>
                                  <Text style={styles.warehouseStateValue}>-{controlModalData.warehouseProcessedCount}</Text>
                                </View>
                                <View style={styles.warehouseStateRow}>
                                  <Text style={styles.warehouseStateLabel}>Stan po:</Text>
                                  <Text style={styles.warehouseStateValue}>{controlModalData.warehouseAfterCount}</Text>
                                </View>
                              </View>
                            )}

                            {controlModalData.actualAfterCount !== controlModalData.expectedAfterCount && (
                              <View style={styles.discrepancyBox}>
                                <Text style={styles.discrepancyText}>
                                  Różnica: {(controlModalData.actualAfterCount || 0) - (controlModalData.expectedAfterCount || 0)}
                                </Text>
                                <Text style={styles.discrepancySubtext}>
                                  (Oczekiwano: {controlModalData.expectedAfterCount})
                                </Text>
                              </View>
                            )}
                          </>
                        )}
                      </>
                    )}
                </ScrollView>
              )}

              <TouchableOpacity
                style={styles.controlModalButton}
                onPress={() => {
                  setShowControlModal(false);
                }}
              >
                <Text style={styles.controlModalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Undo Confirmation Modal */}
      <Modal
        visible={showUndoConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUndoConfirmModal(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={styles.confirmModalHeader}>
              <Ionicons name="arrow-undo-circle" size={64} color="rgb(0, 123, 255)" />
              <Text style={styles.confirmModalTitle}>Cofnij transakcję</Text>
              <Text style={styles.confirmModalMessage}>
                Czy na pewno chcesz cofnąć ostatnią transakcję?
              </Text>
            </View>
            
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={styles.confirmModalCancelButton}
                onPress={() => setShowUndoConfirmModal(false)}
              >
                <Text style={styles.confirmModalCancelText}>Anuluj</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.confirmModalConfirmButton}
                onPress={() => {
                  setShowUndoConfirmModal(false);
                  handleUndoTransaction();
                }}
              >
                <Text style={styles.confirmModalConfirmText}>Tak, cofnij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Corrections Modal */}
      <Modal
        visible={showCorrectionsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowCorrectionsModal(false);
          if (controlModalData && !showControlModal) {
            setShowControlModal(true);
          }
        }}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={[styles.confirmModalContent, { maxHeight: '85%', width: '90%' }]}>
            <View style={styles.confirmModalHeader}>
              <View style={styles.correctionIconContainer}>
                <Ionicons 
                  name="warning" 
                  size={48} 
                  color="#f59e0b" 
                />
              </View>
              <Text style={styles.confirmModalTitle}>
                Braki w stanie
              </Text>
              <Text style={styles.confirmModalMessage}>
                Do korekt przeniesiono: {correctionsData?.count || correctionsData?.items?.length || 0}
              </Text>
              <Text style={[styles.confirmModalMessage, { marginTop: 8 }]}> 
                Następujące produkty nie zostały znalezione w stanie i zostały automatycznie przeniesione do korekt:
              </Text>
            </View>
            
            <ScrollView style={styles.correctionsScrollView}>
              {correctionsData?.items?.map((item, index) => (
                <View key={index} style={styles.correctionItem}>
                  <View style={styles.correctionItemHeader}>
                    <Text style={styles.correctionItemNumber}>{index + 1}</Text>
                    <View style={styles.correctionItemInfo}>
                      <Text style={styles.correctionItemText}>
                        {item.fullName}
                      </Text>
                      <Text style={styles.correctionItemSize}>
                        Rozmiar: {item.size}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.correctionItemBarcode}>
                    {item.barcode}
                  </Text>
                </View>
              ))}
            </ScrollView>
            
            <View style={styles.correctionsFooter}>
              <Ionicons 
                name={correctionsData?.success ? "checkmark-circle" : "close-circle"} 
                size={20} 
                color={correctionsData?.success ? "#10b981" : "#ef4444"} 
              />
              <Text style={[styles.correctionsFooterText, correctionsData?.success ? styles.successText : styles.errorText]}>
                {correctionsData?.success 
                  ? 'Wszystkie braki zostały zapisane w tabeli Korekty'
                  : 'Błąd zapisu - skontaktuj się z administratorem'}
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.correctionConfirmButton}
              onPress={() => {
                setShowCorrectionsModal(false);
                if (controlModalData && !showControlModal) {
                  setShowControlModal(true);
                }
              }}
            >
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.correctionConfirmText}>Rozumiem</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Print Confirmation Modal */}
      <Modal
        visible={showPrintConfirmModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {}}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={styles.confirmModalHeader}>
              <View style={styles.printIconContainer}>
                <Ionicons name="print" size={40} color="#fff" />
              </View>
              <Text style={styles.confirmModalTitle}>Potwierdzenie drukowania</Text>
              {pendingProcessData && (
                <View style={styles.printStatsContainer}>
                  <Text style={styles.printStatsText}>
                    Wydrukowano {pendingProcessData.successCount} z {pendingProcessData.totalCount} etykiet
                  </Text>
                  {pendingProcessData.errorCount > 0 && (
                    <Text style={styles.printErrorText}>
                      Błędów: {pendingProcessData.errorCount}
                    </Text>
                  )}
                </View>
              )}
              <Text style={styles.confirmModalMessage}>
                Czy wszystkie metki zostały poprawnie wydrukowane?
              </Text>
              <Text style={styles.confirmModalSubtext}>
                Po potwierdzeniu produkty zostaną przetworzone.
              </Text>
            </View>
            
            <View style={styles.printModalButtons}>
              <TouchableOpacity
                style={styles.printConfirmButton}
                onPress={() => {
                  setShowPrintConfirmModal(false);
                  setPendingProcessData(null);
                  executeProcessItems(pendingProcessingDate || selectedDate);
                  setPendingProcessingDate(null);
                }}
              >
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.printConfirmButtonText}>Tak - Przetwórz</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.printCancelButton}
                onPress={() => {
                  setShowPrintConfirmModal(false);
                  setPendingProcessData(null);
                  setPendingProcessingDate(null);
                }}
              >
                <Ionicons name="close-circle" size={24} color={tc('muted', "#94A3B8")} />
                <Text style={styles.printCancelButtonText}>Nie - Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal potwierdzenia daty przetwarzania */}
      <Modal
        visible={showOnlyOrangeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOnlyOrangeModal(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={styles.confirmModalHeader}>
              <Ionicons name="alert-circle" size={64} color="#ff9900" />
              <Text style={styles.confirmModalTitle}>Potwierdzenie daty przetwarzania</Text>
              <Text style={styles.confirmModalMessage}>
                Nie wykryto sprzedaży ani transferów dla tego dnia.
              </Text>
              <Text style={styles.confirmModalSubtext}>
                Do którego dnia przypisać dobrane kurtki?
              </Text>
            </View>

            <View style={styles.printModalButtons}>
              {/* A (kalendarz) / B (ostatni wydruk) - domyślny pierwszy i wyróżniony */}
              {renderOnlyOrangeDateChoices()}

              {/* C - inna data: otwiera DateTimePicker, po wyborze od razu przetwarza */}
              <TouchableOpacity
                style={styles.printCancelButton}
                onPress={() => {
                  setShowOnlyOrangeModal(false);
                  setOnlyOrangeData((prev) => prev ? { ...prev, awaitingAlternativeDate: true } : prev);
                  setShowDatePicker(true);
                }}
              >
                <Ionicons name="calendar-outline" size={22} color={tc('muted', "#94A3B8")} />
                <Text style={styles.printCancelButtonText}>Inna data…</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.printCancelButton}
                onPress={() => setShowOnlyOrangeModal(false)}
              >
                <Ionicons name="close-circle" size={22} color={tc('muted', "#94A3B8")} />
                <Text style={styles.printCancelButtonText}>Anuluj</Text>
              </TouchableOpacity>

              <Text style={styles.confirmModalSubtext}>
                Przypisanie do dnia, który był już wydrukowany, wymusi wydruk korekcyjny za ten dzień.
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pending Print Block Modal (WebApp only flow) */}
      <Modal
        visible={showPendingPrintModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPendingPrintModal(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={styles.confirmModalHeader}>
              <Ionicons name="warning" size={64} color="#ff9900" />
              <Text style={styles.confirmModalTitle}>Zaległe wydruki do wygenerowania</Text>
              <Text style={styles.confirmModalMessage}>
                Masz {pendingPrintData?.blockingPendingCount || 0} niewydrukowanych rekordów z wcześniejszych dni.
              </Text>
              <Text style={styles.confirmModalSubtext}>
                W mobile nie drukujemy „Wykruk z dnia”. Najpierw wygeneruj wydruk w panelu web,
                a potem wróć tutaj i ponów przetwarzanie.
              </Text>
            </View>

            {(pendingPrintData?.blockingDays || []).length > 0 && (
              <View style={styles.pendingDaysBox}>
                <Text style={styles.pendingDaysTitle}>Dni do domknięcia:</Text>
                {(pendingPrintData?.blockingDays || []).slice(0, 6).map((entry, idx) => (
                  <Text key={`${entry.date}-${idx}`} style={styles.pendingDaysItem}>
                    {entry.date}: {entry.pendingCount} rek. ({(entry.points || []).join(', ') || 'brak punktów'})
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.printModalButtons}>
              <TouchableOpacity
                style={styles.printConfirmButton}
                onPress={() => setShowPendingPrintModal(false)}
              >
                <Ionicons name="checkmark-circle" size={22} color="#fff" />
                <Text style={styles.printConfirmButtonText}>Rozumiem</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Print Error Modal */}
      <Modal
        visible={showPrintErrorModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPrintErrorModal(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={styles.confirmModalHeader}>
              <Ionicons name="alert-circle" size={64} color="#ef4444" />
              <Text style={styles.confirmModalTitle}>Błąd drukowania</Text>
              <Text style={styles.confirmModalMessage}>
                {printErrorMessage}
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.printErrorButton}
              onPress={() => setShowPrintErrorModal(false)}
            >
              <Text style={styles.printErrorButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Batch Error Modal */}
      <Modal
        visible={showBatchErrorModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBatchErrorModal(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={styles.confirmModalHeader}>
              <Ionicons name="alert-circle" size={64} color="#ef4444" />
              <Text style={styles.confirmModalTitle}>Błąd przetwarzania</Text>
              <Text style={styles.confirmModalMessage}>
                {batchErrorMessage}
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.printErrorButton}
              onPress={() => setShowBatchErrorModal(false)}
            >
              <Text style={styles.printErrorButtonText}>OK</Text>
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
    backgroundColor: tc('bg', "#000000"),
  },
  header: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgb(0, 123, 255)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: tc('muted', "#94A3B8"),
    marginBottom: 6,
  },
  selectButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: tc('surface', "#161622"),
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  selectButtonText: {
    fontSize: 16,
    color: tc('text', "#fff"),
    flex: 1,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionTitleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: tc('text', "#fff"),
  },
  sectionSubtitle: {
    fontSize: 13,
    color: tc('muted', "#94A3B8"),
    marginTop: 6,
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#161622"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: tc('text', "#fff"),
  },
  warehouseList: {
    maxHeight: 400,
    marginBottom: 12,
  },
  warehouseListEmpty: {
    height: 0,
  },
  warehouseListSmall: {
    maxHeight: 'auto',
  },
  warehouseCard: {
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderLeftWidth: 4,
    borderLeftColor: "#ff8c00",
  },
  warehouseCardMatched: {
    backgroundColor: tc('surface2', "#374151"),
    opacity: 0.6,
  },
  warehouseContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  warehouseInfo: {
    flex: 1,
    marginRight: 12,
  },
  warehouseName: {
    fontSize: 14,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  warehouseSize: {
    fontSize: 13,
    color: tc('muted', "#94A3B8"),
    marginBottom: 2,
  },
  warehouseBarcode: {
    fontSize: 12,
    color: tc('muted', "#64748B"),
  },
  matchedText: {
    color: tc('muted', "#9CA3AF"),
  },
  warehouseButton: {
    backgroundColor: "#0D6EFD",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  warehouseButtonDisabled: {
    backgroundColor: "#6B7280",
  },
  warehouseButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  transferCard: {
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderLeftWidth: 5,
  },
  transferContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  transferInfo: {
    flex: 1,
  },
  transferName: {
    fontSize: 15,
    fontWeight: "700",
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  transferSize: {
    fontSize: 13,
    color: tc('text', "#fff"),
    marginBottom: 2,
  },
  transferBarcode: {
    fontSize: 12,
    color: tc('muted', "#94A3B8"),
  },
  transferIndicator: {
    fontSize: 12,
    fontWeight: "700",
    color: tc('text', "#fff"),
    marginTop: 4,
  },
  transferActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  printButton: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    padding: 12,
    borderRadius: 10,
  },
  returnButton: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    padding: 8,
    borderRadius: 8,
  },
  buttonContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 12,
  },
  processButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#10B981",
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  processButtonDisabled: {
    backgroundColor: tc('surface2', "#374151"),
  },
  processButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  undoButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#dc3545",
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  undoButtonDisabled: {
    backgroundColor: tc('surface2', "#374151"),
  },
  undoButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: tc('muted', "#94A3B8"),
    marginTop: 12,
  },
  emptyContainer: {
    padding: 60,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: tc('muted', "#64748B"),
    textAlign: "center",
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: tc('surface', "#1E293B"),
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#334155"),
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: tc('text', "#fff"),
  },
  userItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#334155"),
  },
  userItemSelected: {
    backgroundColor: "rgba(0, 123, 255, 0.2)",
  },
  userItemContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  userItemText: {
    flex: 1,
  },
  userItemName: {
    fontSize: 16,
    fontWeight: "500",
    color: tc('text', "#fff"),
  },
  userItemSymbol: {
    fontSize: 14,
    color: tc('muted', "#94A3B8"),
    marginTop: 2,
  },
  controlModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  controlModalGradient: {
    borderRadius: 20,
    padding: 2,
    backgroundColor: "rgb(0, 123, 255)",
    width: "100%",
    maxWidth: 450,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 15,
  },
  controlModalContent: {
    backgroundColor: tc('surface', "#1a1a1a"),
    borderRadius: 18,
    padding: 20,
    maxHeight: "100%",
  },
  controlModalHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  controlModalEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  controlModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: tc('text', "#ffffff"),
    textAlign: "center",
  },
  controlModalBody: {
    backgroundColor: tc('surface', "#0f0f0f"),
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    maxHeight: 400,
  },
  userSection: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#2a2a2a"),
  },
  userLabel: {
    fontSize: 11,
    color: tc('muted', "#888888"),
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
    marginBottom: 6,
  },
  userValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "rgb(0, 123, 255)",
  },
  warningBox: {
    backgroundColor: tcl("#3a2a1a", '#fff2e6'),
    padding: 14,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#ff9900",
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  warningEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffcc66",
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: "#ffddaa",
    fontWeight: "600",
  },
  statRow: {
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    backgroundColor: tc('surface', "#242424"),
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#bbbbbb",
    marginBottom: 8,
    textAlign: 'center',
    width: '100%',
  },
  statValueBlue: {
    backgroundColor: "#1a3a52",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    width: '100%',
    alignItems: 'center',
  },
  statValueTextBlue: {
    fontSize: 20,
    fontWeight: "700",
    color: "rgb(0, 123, 255)",
    textAlign: 'center',
  },
  statRowRed: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: tcl("#3a1a1a", '#ffe6e6'),
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#ff4444",
    marginBottom: 10,
  },
  statLabelRed: {
    fontSize: 13,
    color: "#ffaaaa",
    flex: 1,
  },
  statValueTextRed: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ff6666",
  },
  statRowYellow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: tcl("#3a3a1a", '#ffffe6'),
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#ffcc00",
    marginBottom: 10,
  },
  statLabelYellow: {
    fontSize: 13,
    color: "#ffffaa",
    flex: 1,
  },
  statValueTextYellow: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffdd44",
  },
  statRowGreen: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: tcl("#1a3a1a", '#e6ffe6'),
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#22ff55",
    marginBottom: 10,
  },
  statLabelGreen: {
    fontSize: 13,
    color: "#aaffaa",
    flex: 1,
  },
  statValueTextGreen: {
    fontSize: 17,
    fontWeight: "700",
    color: "#44ff66",
  },
  statRowGray: {
    backgroundColor: tc('surface', "#222222"),
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tc('border', "#333333"),
    marginBottom: 10,
  },
  statLabelGray: {
    fontSize: 12,
    color: tc('muted', "#999999"),
    textAlign: "center",
  },
  statRowOrange: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: tcl("#3a2a1a", '#fff2e6'),
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#ff9900",
    marginBottom: 10,
  },
  statLabelOrange: {
    fontSize: 13,
    color: "#ffbb88",
    flex: 1,
  },
  statValueTextOrange: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffaa44",
  },
  warehouseRemovalBox: {
    backgroundColor: "#fee2e2",
    padding: 16,
    borderRadius: 12,
    marginVertical: 14,
    borderLeftWidth: 6,
    borderLeftColor: "#dc2626",
    justifyContent: "center",
    alignItems: "center",
  },
  warehouseRemovalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#7f1d1d",
    marginBottom: 8,
  },
  warehouseRemovalValue: {
    fontSize: 32,
    fontWeight: "800",
    color: "#dc2626",
  },
  calculationBox: {
    backgroundColor: tc('surface', "#1a1a1a"),
    padding: 14,
    borderRadius: 8,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: tc('border', "#333333"),
  },
  calculationLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: tc('muted', "#888888"),
    letterSpacing: 1,
    marginBottom: 6,
  },
  calculationText: {
    fontSize: 13,
    color: tc('muted', "#cccccc"),
    lineHeight: 20,
  },
  resultRow: {
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    backgroundColor: tc('surface', "#242424"),
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#bbbbbb",
    marginBottom: 8,
  },
  resultValue: {
    backgroundColor: "#1a3a52",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    width: '100%',
    alignItems: 'center',
  },
  resultValueText: {
    fontSize: 20,
    fontWeight: "700",
    color: "rgb(0, 123, 255)",
    textAlign: 'center',
  },
  discrepancyBox: {
    backgroundColor: tcl("#3a1a1a", '#ffe6e6'),
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#ff4444",
    marginTop: 10,
  },
  discrepancyText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ff6666",
    marginBottom: 4,
  },
  discrepancySubtext: {
    fontSize: 12,
    color: "#ffaaaa",
  },
  controlModalButton: {
    backgroundColor: "rgb(0, 123, 255)",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  controlModalButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  warehouseStateBox: {
    backgroundColor: tcl("#3a2a1a", '#fff2e6'),
    padding: 14,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#ff7700",
    marginTop: 14,
  },
  warehouseStateTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffaa66",
    marginBottom: 10,
    textAlign: "center",
  },
  warehouseStateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  warehouseStateLabel: {
    fontSize: 13,
    color: "#ffcc88",
    fontWeight: "600",
  },
  warehouseStateValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffdd99",
  },
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  confirmModalContent: {
    backgroundColor: tc('surface', "#1E293B"),
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 2,
    borderColor: "rgb(0, 123, 255)",
  },
  confirmModalHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  confirmModalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: tc('text', "#ffffff"),
    marginTop: 12,
    marginBottom: 8,
  },
  confirmModalMessage: {
    fontSize: 16,
    color: tc('muted', "#cbd5e1"),
    textAlign: "center",
    lineHeight: 24,
  },
  confirmModalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  confirmModalCancelButton: {
    flex: 1,
    backgroundColor: tc('surface2', "#374151"),
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  confirmModalCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#e5e7eb"),
  },
  confirmModalConfirmButton: {
    flex: 1,
    backgroundColor: "rgb(0, 123, 255)",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  confirmModalConfirmText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  confirmModalSubtext: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  printIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgb(0, 123, 255)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "rgb(0, 123, 255)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  printStatsContainer: {
    marginTop: 12,
    marginBottom: 12,
    padding: 12,
    backgroundColor: tc('surface', '#1E293B'),
    borderRadius: 8,
    width: '100%',
  },
  printStatsText: {
    fontSize: 16,
    color: tc('muted', '#cbd5e1'),
    textAlign: 'center',
    fontWeight: '600',
  },
  printErrorText: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 4,
  },
  printModalButtons: {
    gap: 12,
    width: '100%',
  },
  printConfirmButton: {
    backgroundColor: "rgb(0, 123, 255)",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    shadowColor: "rgb(0, 123, 255)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  printConfirmButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  printCancelButton: {
    backgroundColor: tc('surface', "#1E293B"),
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
  },
  printCancelButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: tc('muted', "#94A3B8"),
  },
  // Długie etykiety dat w okienku „Potwierdzenie daty przetwarzania” - mniejsza czcionka, łamanie w 2 linie
  onlyOrangeChoiceText: {
    fontSize: 15,
    flexShrink: 1,
    textAlign: 'center',
  },
  printErrorButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
    marginTop: 8,
  },
  printErrorButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
  },
  pendingDaysBox: {
    width: '100%',
    backgroundColor: tc('surface', '#111827'),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#374151'),
    padding: 12,
    marginBottom: 12,
  },
  pendingDaysTitle: {
    color: '#FBBF24',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  pendingDaysItem: {
    color: tc('text', '#E5E7EB'),
    fontSize: 13,
    marginBottom: 4,
  },
  topWarningContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  topWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    borderRadius: 12,
    padding: 14,
  },
  topSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    borderRadius: 12,
    padding: 14,
  },
  topWarningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topWarningIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  topWarningCountLabel: {
    fontSize: 14,
    color: tc('muted', "#CBD5E1"),
    marginTop: 8,
  },
  topWarningContent: {
    marginTop: 4,
  },
  topWarningTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: tc('text', "#fff"),
    lineHeight: 20,
  },
  topSuccessTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: tc('text', "#fff"),
    lineHeight: 20,
  },
  topWarningCount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#F59E0B",
  },
  topWarningDaysContainer: {
    marginTop: 10,
  },
  topWarningDaysLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: tc('muted', "#94A3B8"),
    marginBottom: 6,
  },
  topWarningDayChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  topWarningDayChip: {
    backgroundColor: tc('surface', "#161622"),
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.6)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  topWarningDayChipText: {
    color: tc('text', "#fff"),
    fontSize: 13,
    fontWeight: "600",
  },
  priceListInfoLine: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 10,
  },
  priceListInfoContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  priceListInfoLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: tc('surface', "#0f172a"),
    borderWidth: 1,
    borderColor: tc('border', "#1e293b"),
  },
  priceListInfoSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: tcl("#13261a", '#e8fff1'),
    borderLeftWidth: 5,
    borderLeftColor: "#22c55e",
  },
  priceListInfoWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: tcl("#2d2415", '#fff6e7'),
    borderLeftWidth: 5,
    borderLeftColor: "#f59e0b",
  },
  priceListInfoText: {
    flex: 1,
  },
  priceListInfoTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: tc('text', "#e2e8f0"),
    marginBottom: 4,
  },
  priceListInfoSubtitle: {
    fontSize: 12,
    color: tc('muted', "#cbd5e1"),
  },
  warehouseFoundText: {
    fontSize: 12,
    color: tc('text', "#e2e8f0"),
    marginTop: 6,
    marginBottom: 2,
  },
  warehouseSummaryText: {
    fontSize: 12,
    color: tc('muted', "#cbd5e1"),
    marginBottom: 10,
  },
  processingSummaryBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
  },
  summaryLine: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  summaryPositive: {
    color: '#22c55e',
  },
  summaryNegative: {
    color: '#ef4444',
  },
  summaryWarehouse: {
    color: '#fb923c',
  },
  summaryMuted: {
    color: tc('muted', '#94a3b8'),
  },
  correctionIconContainer: {
    backgroundColor: '#FEF3C7',
    borderRadius: 60,
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  correctionsScrollView: {
    maxHeight: 350,
    width: '100%',
    paddingHorizontal: 20,
    marginVertical: 16,
  },
  correctionItem: {
    backgroundColor: tc('surface', '#1E293B'),
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  correctionItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  correctionItemNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f59e0b',
    marginRight: 12,
    minWidth: 24,
  },
  correctionItemInfo: {
    flex: 1,
  },
  correctionItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: tc('text', '#ffffff'),
    marginBottom: 4,
  },
  correctionItemSize: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    fontWeight: '500',
  },
  correctionItemBarcode: {
    fontSize: 13,
    color: tc('muted', '#64748b'),
    fontFamily: 'monospace',
    marginTop: 4,
    paddingLeft: 36,
  },
  correctionsFooter: {
    backgroundColor: tc('surface', '#1E293B'),
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  correctionsFooterText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  successText: {
    color: '#10b981',
  },
  errorText: {
    color: '#ef4444',
  },
  correctionConfirmButton: {
    backgroundColor: '#007bff',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#007bff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  correctionConfirmText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  transferBadges: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  pictureThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  pictureThumbEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.4)',
  },
  picturePreviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  picturePreviewImage: {
    width: '100%',
    height: '85%',
  },
  picturePreviewName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  balanceBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceBadgeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  balanceSummary: {
    marginTop: 16,
    padding: 16,
    backgroundColor: tc('surface', '#1E293B'),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
  },
  balanceSummaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tc('text', '#fff'),
    marginBottom: 12,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '700',
  },
}));

export default Users;
