import React, { useContext, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';
import Logger from '../../services/logger'; // Import logger service
import { getApiUrl } from '../../config/api';
import LogoutButton from '../../components/LogoutButton';

const Remanent = () => {
  const insets = useSafeAreaInsets(); // Get safe area insets
  // Dolny pasek zakładek jest nałożony na ekran (position: absolute, wysokość jak w (tabs)/_layout.jsx) -
  // rezerwujemy jego pełną wysokość, żeby przyciski na dole nie chowały się pod nim.
  const tabBarSpace = Math.max(90, 70 + insets.bottom) + 8;
  const { user, sizes, colors, stocks, stateData, fetchSizes, fetchColors, fetchStock } = useContext(GlobalStateContext);
  const [remanentData, setRemanentData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // QR Scanner states
  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scannedJackets, setScannedJackets] = useState([]);
  const [facing, setFacing] = useState('back');
  
  // Price list state for remanent
  const [remanentPriceList, setRemanentPriceList] = useState(null);
  const [lastScannedCode, setLastScannedCode] = useState('');
  const [scanningEnabled, setScanningEnabled] = useState(true);
  const [recentlyScannedCodes, setRecentlyScannedCodes] = useState(new Map()); // Map z czasem ostatniego skanu
  
  // Comparison modal states
  const [comparisonModalVisible, setComparisonModalVisible] = useState(false);
  const [comparisonResults, setComparisonResults] = useState(null);
  const [sentCorrections, setSentCorrections] = useState(new Set()); // Zestaw wysłanych korekt

  // Assortment filter states
  const [assortmentFilter, setAssortmentFilter] = useState(''); // Filtr asortymentu
  const [availableAssortments, setAvailableAssortments] = useState([]); // Dostępne asortymenty
  const [filteredRemanentData, setFilteredRemanentData] = useState([]); // Przefiltrowane dane

  // Advanced filter modal states
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [openFilterSelect, setOpenFilterSelect] = useState(null); // które pole filtra ma rozwiniętą listę opcji
  const [advancedFilters, setAdvancedFilters] = useState({
    assortment: '',
    color: '',
    size: ''
  });
  const [availableColors, setAvailableColors] = useState([]);
  const [availableSizes, setAvailableSizes] = useState([]);

  // Progress tracking states
  const [scanProgress, setScanProgress] = useState({
    totalExpected: 0,
    totalScanned: 0,
    uniqueScanned: 0,
    percentage: 0
  });
  const [scanStartTime, setScanStartTime] = useState(null);

  // Extract available assortments, colors, and sizes from remanent data
  useEffect(() => {
    if (remanentData && remanentData.length > 0) {
      // Extract assortments (first word of product name)
      const assortments = [...new Set(remanentData.map(item => {
        const name = item.name || '';
        return name.split(' ')[0];
      }).filter(name => name))].sort();
      
      // Extract colors (second word of product name, if exists)
      const colors = [...new Set(remanentData.map(item => {
        const name = item.name || '';
        const parts = name.split(' ');
        return parts.length > 1 ? parts[1] : '';
      }).filter(color => color && color !== 'XS' && color !== 'S' && color !== 'M' && color !== 'L' && color !== 'XL' && color !== 'XXL'))].sort();
      
      // Extract sizes (look for size patterns)
      const sizes = [...new Set(remanentData.map(item => {
        const name = item.name || '';
        const sizeMatch = name.match(/\b(XS|S|M|L|XL|XXL|\d+)\b/);
        return sizeMatch ? sizeMatch[0] : '';
      }).filter(size => size))].sort();
      
      setAvailableAssortments(assortments);
      setAvailableColors(colors);
      setAvailableSizes(sizes);
    } else {
      // Fallback: try to get filter options from state endpoint
      fetchFilterOptionsFromState();
    }
  }, [remanentData]);

  // Fallback function to get filter options from state when no remanent data exists
  const fetchFilterOptionsFromState = async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/state'));
      if (response.ok) {
        const allStateData = await response.json();
        const currentState = allStateData.filter(item => item.symbol === user?.symbol);
        
        // Extract unique assortments, colors, and sizes from state
        const assortments = [...new Set(currentState.map(item => {
          const fullName = item.fullName || item.name || '';
          return fullName.split(' ')[0];
        }).filter(name => name && name.length > 1))].sort();
        
        const colors = [...new Set(currentState.map(item => {
          const fullName = item.fullName || item.name || '';
          const parts = fullName.split(' ');
          return parts.length > 1 ? parts[1] : '';
        }).filter(color => color && color !== 'XS' && color !== 'S' && color !== 'M' && color !== 'L' && color !== 'XL' && color !== 'XXL'))].sort();
        
        const sizes = [...new Set(currentState.map(item => {
          const fullName = item.fullName || item.name || '';
          const sizeMatch = fullName.match(/\b(XS|S|M|L|XL|XXL|\d+)\b/);
          return sizeMatch ? sizeMatch[0] : '';
        }).filter(size => size))].sort();
        
        Logger.debug('📝 Fallback options from state - assortments:', assortments, 'colors:', colors, 'sizes:', sizes);
        setAvailableAssortments(assortments);
        setAvailableColors(colors);
        setAvailableSizes(sizes);
      }
    } catch (error) {
      // Ultimate fallback - common options
      setAvailableAssortments(['ANETA', 'BARBARA', 'CLAUDIA', 'DIANA', 'ELENA']);
      setAvailableColors(['CZARNY', 'GRANATOWY', 'BRĄZOWY', 'BEŻOWY', 'CZERWONY']);
      setAvailableSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
    }
  };

  // Filter remanent data based on advanced filters
  useEffect(() => {
    if (!remanentData || remanentData.length === 0) {
      setFilteredRemanentData([]);
      return;
    }

    let filtered = remanentData;

    // Apply legacy assortment filter (for backward compatibility)
    if (assortmentFilter && assortmentFilter !== '') {
      filtered = filtered.filter(item => 
        item.name && item.name.toLowerCase().includes(assortmentFilter.toLowerCase())
      );
    }

    // Apply advanced filters
    if (advancedFilters.assortment && advancedFilters.assortment !== '') {
      filtered = filtered.filter(item => {
        const name = item.name || '';
        return name.toLowerCase().includes(advancedFilters.assortment.toLowerCase());
      });
    }

    if (advancedFilters.color && advancedFilters.color !== '') {
      filtered = filtered.filter(item => {
        const name = item.name || '';
        return name.toLowerCase().includes(advancedFilters.color.toLowerCase());
      });
    }

    if (advancedFilters.size && advancedFilters.size !== '') {
      filtered = filtered.filter(item => {
        const name = item.name || '';
        return name.toLowerCase().includes(advancedFilters.size.toLowerCase());
      });
    }

    setFilteredRemanentData(filtered);
  }, [remanentData, assortmentFilter, advancedFilters]);

  // Calculate scan progress based on current state and scanned items
  useEffect(() => {
    const calculateProgress = async () => {
      try {
        // Get current state to know what should be scanned
        const response = await tokenService.authenticatedFetch(getApiUrl('/state'));
        if (response.ok) {
          const allStateData = await response.json();
          let expectedItems = allStateData.filter(item => item.symbol === user?.symbol);
          
          // Apply filters to expected items (same as in performStateCheck)
          if (advancedFilters.assortment || advancedFilters.color || advancedFilters.size) {
            expectedItems = expectedItems.filter(item => {
              const fullName = item.fullName || item.name || '';
              let matches = true;
              
              if (advancedFilters.assortment) {
                matches = matches && fullName.toLowerCase().includes(advancedFilters.assortment.toLowerCase());
              }
              if (advancedFilters.color) {
                matches = matches && fullName.toLowerCase().includes(advancedFilters.color.toLowerCase());
              }
              if (advancedFilters.size) {
                matches = matches && fullName.toLowerCase().includes(advancedFilters.size.toLowerCase());
              }
              
              return matches;
            });
          } else if (assortmentFilter && assortmentFilter !== '') {
            expectedItems = expectedItems.filter(item => {
              const fullName = item.fullName || item.name || '';
              return fullName.toLowerCase().includes(assortmentFilter.toLowerCase());
            });
          }

          // Grupuj zeskanowane produkty według kodu i policz ilości
          const scannedByBarcode = {};
          filteredRemanentData.forEach(item => {
            const code = item.code;
            if (!scannedByBarcode[code]) {
              scannedByBarcode[code] = 0;
            }
            scannedByBarcode[code]++;
          });
          
          // Grupuj oczekiwane produkty według kodu i policz ilości
          const expectedByBarcode = {};
          expectedItems.forEach(item => {
            const code = item.barcode;
            if (!expectedByBarcode[code]) {
              expectedByBarcode[code] = 0;
            }
            expectedByBarcode[code]++;
          });
          
          // Policz ile produktów zostało w pełni zeskanowanych (min z expected i scanned dla każdego kodu)
          let fullyScannedCount = 0;
          Object.keys(expectedByBarcode).forEach(barcode => {
            const expectedCount = expectedByBarcode[barcode];
            const scannedCount = scannedByBarcode[barcode] || 0;
            fullyScannedCount += Math.min(expectedCount, scannedCount);
          });
          
          const totalExpected = expectedItems.length;
          const totalScanned = filteredRemanentData.length;
          const percentage = totalExpected > 0 ? Math.round((fullyScannedCount / totalExpected) * 100) : 0;
          
          setScanProgress({
            totalExpected,
            totalScanned,
            uniqueScanned: fullyScannedCount, // Zmieniono nazwę ale to teraz ilość w pełni zeskanowanych
            percentage
          });
        }
      } catch (error) {
        // Silent error handling
      }
    };

    if (user?.symbol) {
      calculateProgress();
    }
  }, [filteredRemanentData, advancedFilters, assortmentFilter, user?.symbol]);

  // Initialize scan start time
  useEffect(() => {
    if (filteredRemanentData.length > 0 && !scanStartTime) {
      setScanStartTime(new Date());
    } else if (filteredRemanentData.length === 0 && scanStartTime) {
      setScanStartTime(null);
    }
  }, [filteredRemanentData.length, scanStartTime]);

  // Timer for real-time updates
  useEffect(() => {
    let interval;
    if (scanStartTime) {
      interval = setInterval(() => {
        // Force re-render to update timer display
        setScanProgress(prev => ({ ...prev }));
      }, 1000);
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [scanStartTime]);

  // Format elapsed time
  const formatElapsedTime = () => {
    if (!scanStartTime) return '00:00';
    const elapsed = new Date() - scanStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Fetch remanent data
  const fetchRemanentData = async () => {
    try {
      setLoading(true);
      
      // Try to fetch real remanent data from API
      const response = await tokenService.authenticatedFetch(getApiUrl('/remanent'));
      
      if (response.ok) {
        const data = await response.json();
        
        // Backend returns remanent records with nested items
        // We need to flatten them into individual jacket items
        const flattenedItems = [];
        
        if (data.data && Array.isArray(data.data)) {
          data.data.forEach(remanentRecord => {
            if (remanentRecord.items && Array.isArray(remanentRecord.items)) {
              remanentRecord.items.forEach(item => {
                flattenedItems.push({
                  id: item._id || item.id || Date.now() + Math.random(),
                  remanentId: remanentRecord._id, // Add remanent record ID for deletion
                  name: item.name,
                  code: item.code,
                  quantity: item.quantity || 1,
                  value: item.value || '0.00',
                  location: item.location,
                  scannedAt: item.scannedAt || remanentRecord.timestamp,
                  timestamp: remanentRecord.timestamp
                });
              });
            }
          });
        }
        
        setRemanentData(flattenedItems);
      } else {
        // Start with empty list - only scanned items will be added
        setRemanentData([]);
      }
    } catch (error) {
      // Start with empty list on error
      setRemanentData([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch remanent price list
  const fetchRemanentPriceList = async () => {
    try {
      // Skip if logout in progress
      if (tokenService.isLoggingOut) {
        return;
      }
      
      const response = await tokenService.authenticatedFetch(getApiUrl('/cudzich/pricelist'));
      
      if (response.ok) {
        const data = await response.json();
        setRemanentPriceList(data);
      } else {
        Logger.error('❌ Błąd pobierania cennika remanent:', response.status);
      }
    } catch (error) {
      // Ignore logout errors
      if (!error.message?.includes('logout in progress')) {
        Logger.error('❌ Error fetching remanent price list:', error);
      }
    }
  };

  // Refresh handler
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRemanentData();
    setRefreshing(false);
  };

  // QR Scanner functions
  const openQRScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Błąd', 'Brak uprawnień do kamery');
        return;
      }
    }
    
    // Reset stanu wysłanych korekt przy rozpoczęciu nowego skanowania (bez alertu)
    await resetSentCorrections(false);
    
    setScannedJackets([]);
    setScannerVisible(true);
    setScanned(false);
    setLastScannedCode('');
    setScanningEnabled(true);
  };

  const handleScan = async ({ data, type }) => {
    // Sprawdź czy ten sam kod był skanowany w ciągu ostatnich 2 sekund
    const now = Date.now();
    const lastScanTime = recentlyScannedCodes.get(data);
    
    if (!scanningEnabled || (lastScanTime && (now - lastScanTime) < 2000)) {
      // Skanowanie wyłączone LUB ten sam kod w ciągu 2 sekund - ignoruj
      return;
    }
    
    // Zapisz czas tego skanu
    setRecentlyScannedCodes(prev => {
      const newMap = new Map(prev);
      newMap.set(data, now);
      
      // Wyczyść stare wpisy (starsze niż 5 sekund)
      for (const [code, time] of newMap.entries()) {
        if (now - time > 5000) {
          newMap.delete(code);
        }
      }
      
      return newMap;
    });

    // Disable scanning temporarily
    setScanningEnabled(false);
    setLastScannedCode(data);
    
    // Clear lastScannedCode after 2 seconds to allow scanning the same jacket again later
    setTimeout(() => {
      setLastScannedCode('');
    }, 2000);
    
    // Check if jacket already scanned in current session
    const alreadyScanned = scannedJackets.find(jacket => jacket.code === data);
    if (alreadyScanned) {
      // Quick re-enable for duplicate (no alert needed)
      setTimeout(() => {
        setScanningEnabled(true);
      }, 800);
      return;
    }

    // Get jacket name from barcode
    const jacketName = await getJacketNameFromBarcode(data);

    // Check if advanced filters are active and if jacket matches them
    const activeFilters = [];
    let shouldBlock = false;
    
    if (advancedFilters.assortment || advancedFilters.color || advancedFilters.size) {
      // Check advanced filters
      if (advancedFilters.assortment && (!jacketName || !jacketName.toLowerCase().includes(advancedFilters.assortment.toLowerCase()))) {
        activeFilters.push(`Asortyment: ${advancedFilters.assortment}`);
        shouldBlock = true;
      }
      if (advancedFilters.color && (!jacketName || !jacketName.toLowerCase().includes(advancedFilters.color.toLowerCase()))) {
        activeFilters.push(`Kolor: ${advancedFilters.color}`);
        shouldBlock = true;
      }
      if (advancedFilters.size && (!jacketName || !jacketName.toLowerCase().includes(advancedFilters.size.toLowerCase()))) {
        activeFilters.push(`Rozmiar: ${advancedFilters.size}`);
        shouldBlock = true;
      }
    } else if (assortmentFilter && assortmentFilter !== '') {
      // Fallback to legacy assortment filter
      if (!jacketName || !jacketName.toLowerCase().includes(assortmentFilter.toLowerCase())) {
        activeFilters.push(`Asortyment: ${assortmentFilter}`);
        shouldBlock = true;
      }
    }
    
    if (shouldBlock) {
      // Show warning that this jacket doesn't match selected filters
      Alert.alert(
        'Niewłaściwy produkt', 
        `Zeskanowano: ${jacketName || 'Nieznany produkt'}\n\nAktywne filtry:\n${activeFilters.join('\n')}\n\nTa kurtka nie pasuje do wybranych filtrów.`,
        [{ text: 'OK' }]
      );
      
      // Re-enable scanning
      setTimeout(() => {
        setScanningEnabled(true);
      }, 800);
      return;
    }

    // Add scanned jacket to list
    const newJacket = {
      id: Date.now(),
      code: data,
      name: jacketName,
      scannedAt: new Date().toLocaleTimeString()
    };
    
    setScannedJackets(prev => [...prev, newJacket]);
    
    // Re-enable scanning after short delay
    setTimeout(() => {
      setScanningEnabled(true);
    }, 800);
  };

  const confirmScannedJackets = async () => {
    if (scannedJackets.length === 0) {
      return; // Silently do nothing if no jackets
    }

    try {
      // Prepare data for API
      const remanentItemsForAPI = scannedJackets.map(jacket => {
        const price = getPriceFromProductName(jacket.name);
        
        return {
          name: jacket.name,
          code: jacket.code,
          quantity: 1,
          value: parseFloat(price) || 0,
          location: user?.location || user?.symbol || 'Nieznana lokalizacja',
          scannedAt: new Date().toISOString(),
          scannedBy: user?.name || user?.username || 'Nieznany użytkownik'
        };
      });

      // Save to database via API
      const response = await tokenService.authenticatedFetch(getApiUrl('/remanent'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: remanentItemsForAPI,
          timestamp: new Date().toISOString(),
          userId: user?.id
        })
      });

      if (response.ok) {
        // Add scanned jackets to local state
        const newRemanentItems = scannedJackets.map(jacket => {
          const price = getPriceFromProductName(jacket.name);
          
          return {
            id: jacket.id,
            name: jacket.name,
            code: jacket.code,
            quantity: 1,
            value: price,
            location: user?.location || user?.symbol || 'Nieznana lokalizacja',
            scannedAt: jacket.scannedAt
          };
        });

        setRemanentData(prev => [...prev, ...newRemanentItems]);
      } else {
        Logger.error('❌ Failed to save remanent items:', response.status);
        // Still add to local state even if API fails
        const newRemanentItems = scannedJackets.map(jacket => {
          const price = getPriceFromProductName(jacket.name);
          
          return {
            id: jacket.id,
            name: jacket.name,
            code: jacket.code,
            quantity: 1,
            value: price,
            location: user?.location || user?.symbol || 'Nieznana lokalizacja',
            scannedAt: jacket.scannedAt
          };
        });

        setRemanentData(prev => [...prev, ...newRemanentItems]);
      }
      
      // Clear scanned jackets but keep scanner open
      setScannedJackets([]);
      setLastScannedCode('');
      setScanningEnabled(true);
      
      // No success alert - continue scanning immediately
    } catch (error) {
      Logger.error('Error adding scanned jackets:', error);
      // Even on error, add to local state and clear the list
      const newRemanentItems = scannedJackets.map(jacket => {
        const price = getPriceFromProductName(jacket.name);
        
        return {
          id: jacket.id,
          name: jacket.name,
          code: jacket.code,
          quantity: 1,
          value: price,
          location: user?.location || user?.symbol || 'Nieznana lokalizacja',
          scannedAt: jacket.scannedAt
        };
      });

      setRemanentData(prev => [...prev, ...newRemanentItems]);
      setScannedJackets([]);
      setLastScannedCode('');
      setScanningEnabled(true);
    }
  };

  const removeScannedJacket = (jacketId) => {
    setScannedJackets(prev => prev.filter(jacket => jacket.id !== jacketId));
  };

  const removeRemanentItem = async (itemId) => {
    try {
      // Find the item to get its remanentId
      const itemToDelete = remanentData.find(item => item.id === itemId);
      
      if (!itemToDelete) {
        Logger.error('❌ Item not found in local data');
        return;
      }

      // If item was just scanned (no remanentId), only remove from local state
      if (!itemToDelete.remanentId) {
        setRemanentData(prev => prev.filter(item => item.id !== itemId));
        return;
      }

      // Call API to delete from database
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/remanent/${itemToDelete.remanentId}/items/${itemId}`),
        {
          method: 'DELETE',
        }
      );

      if (response.ok) {
        // Remove from local state only after successful API call
        setRemanentData(prev => prev.filter(item => item.id !== itemId));
      } else {
        // Still remove from local state for better UX
        setRemanentData(prev => prev.filter(item => item.id !== itemId));
      }
    } catch (error) {
      Logger.error('❌ Error deleting item:', error);
      // Still remove from local state on error
      setRemanentData(prev => prev.filter(item => item.id !== itemId));
    }
  };

  const cancelScanning = () => {
    setScannerVisible(false);
    setScannedJackets([]);
    setScanned(false);
    setLastScannedCode('');
    setScanningEnabled(true);
  };

  const checkCurrentState = async () => {
    try {
      // Pytaj użytkownika czy chce zresetować korekty przed nowym sprawdzeniem
      if (sentCorrections.size > 0) {
        Alert.alert(
          'Nowe sprawdzenie stanu',
          `Masz już ${sentCorrections.size} wysłanych korekt. Czy chcesz je zresetować i móc wysłać ponownie?`,
          [
            {
              text: 'Nie',
              onPress: () => performStateCheck(),
              style: 'cancel',
            },
            {
              text: 'Tak, resetuj',
              onPress: async () => {
                await resetSentCorrections(false); // Reset bez alertu
                performStateCheck();
              },
            },
          ],
          { cancelable: true }
        );
      } else {
        performStateCheck();
      }
    } catch (error) {
      Logger.error('❌ Error in checkCurrentState:', error);
      Alert.alert('Błąd', 'Wystąpił błąd podczas sprawdzania stanu');
    }
  };

  const performStateCheck = async () => {
    try {
      // NIE resetuj wysłanych korekt - pozostaw je zapamiętane
      
      // Pobierz stan magazynowy z endpointu /state
      const response = await tokenService.authenticatedFetch(getApiUrl('/state'));
      
      if (response.ok) {
        const allStateData = await response.json();
        
        // Filtruj produkty dla aktualnego użytkownika
        let currentState = allStateData.filter(item => item.symbol === user?.symbol);
        
        // Jeśli są aktywne zaawansowane filtry, filtruj stan według nich
        if (advancedFilters.assortment || advancedFilters.color || advancedFilters.size) {
          currentState = currentState.filter(item => {
            const fullName = item.fullName || item.name || '';
            let matches = true;
            
            if (advancedFilters.assortment) {
              matches = matches && fullName.toLowerCase().includes(advancedFilters.assortment.toLowerCase());
            }
            if (advancedFilters.color) {
              matches = matches && fullName.toLowerCase().includes(advancedFilters.color.toLowerCase());
            }
            if (advancedFilters.size) {
              matches = matches && fullName.toLowerCase().includes(advancedFilters.size.toLowerCase());
            }
            
            return matches;
          });
        }
        // Fallback na stary filtr asortymentu jeśli nie ma zaawansowanych filtrów
        else if (assortmentFilter && assortmentFilter !== '') {
          currentState = currentState.filter(item => {
            const fullName = item.fullName || item.name || '';
            return fullName.toLowerCase().includes(assortmentFilter.toLowerCase());
          });
        }
        
        // Porównaj remanent z aktualnym stanem (uwzględniając filtr asortymentu)
        const missingItems = []; // Produkty w stanie, ale nie w remanencie
        const extraItems = []; // Produkty w remanencie, ale nie w stanie
        
        // Grupuj zeskanowane produkty według kodu i policz ilości
        const remanentByBarcode = {};
        filteredRemanentData.forEach(remanentItem => {
          const code = remanentItem.code;
          if (!remanentByBarcode[code]) {
            remanentByBarcode[code] = [];
          }
          remanentByBarcode[code].push(remanentItem);
        });
        
        // Grupuj produkty ze stanu według kodu
        const stateByBarcode = {};
        currentState.forEach(stateItem => {
          const code = stateItem.barcode;
          if (!stateByBarcode[code]) {
            stateByBarcode[code] = [];
          }
          stateByBarcode[code].push(stateItem);
        });

        // Sprawdź co brakuje lub jest w nadwyżce
        Object.keys(stateByBarcode).forEach(barcode => {
          const stateItems = stateByBarcode[barcode];
          const remanentItems = remanentByBarcode[barcode] || [];
          
          const expectedCount = stateItems.length;
          const actualCount = remanentItems.length;
          
          if (actualCount === 0) {
            // Brak całkowity - jest w stanie, ale nie zeskanowany
            missingItems.push({
              name: stateItems[0].fullName,
              size: stateItems[0].size,
              code: barcode,
              price: stateItems[0].price,
              expectedCount: expectedCount,
              actualCount: 0
            });
          } else if (actualCount < expectedCount) {
            // Częściowy brak - zeskanowano mniej niż powinno być
            missingItems.push({
              name: stateItems[0].fullName,
              size: stateItems[0].size,
              code: barcode,
              price: stateItems[0].price,
              expectedCount: expectedCount,
              actualCount: actualCount,
              missingCount: expectedCount - actualCount
            });
          } else if (actualCount > expectedCount) {
            // Nadwyżka - zeskanowano więcej niż powinno być
            extraItems.push({
              name: remanentItems[0].name,
              size: remanentItems[0].size,
              code: barcode,
              price: remanentItems[0].value,
              expectedCount: expectedCount,
              actualCount: actualCount,
              excessCount: actualCount - expectedCount
            });
          }
          // Jeśli actualCount === expectedCount, to jest OK (nie dodajemy do żadnej listy)
        });
        
        // Sprawdź produkty zeskanowane, których nie ma w stanie
        Object.keys(remanentByBarcode).forEach(barcode => {
          if (!stateByBarcode[barcode]) {
            const remanentItems = remanentByBarcode[barcode];
            extraItems.push({
              name: remanentItems[0].name,
              size: remanentItems[0].size,
              code: barcode,
              price: remanentItems[0].value,
              expectedCount: 0,
              actualCount: remanentItems.length,
              excessCount: remanentItems.length
            });
          }
        });
        
        // Pokaż wyniki w modalu
        Logger.debug('🔍 Porównanie:', {
          currentStateCount: currentState.length,
          remanentCount: filteredRemanentData.length,
          missingItems: missingItems,
          extraItems: extraItems
        });
        
        setComparisonResults({
          currentStateCount: currentState.length,
          remanentCount: filteredRemanentData.length,
          missingItems: missingItems,
          extraItems: extraItems
        });
        setComparisonModalVisible(true);
        
      } else {
        Logger.error('❌ Failed to fetch current state:', response.status);
        Alert.alert('Błąd', 'Nie udało się pobrać aktualnego stanu');
      }
    } catch (error) {
      Logger.error('❌ Error checking current state:', error);
      Alert.alert('Błąd', 'Wystąpił błąd podczas sprawdzania stanu');
    }
  };

  // Funkcja do wysyłania korekty
  const sendToCorrections = async (item, errorType) => {
    try {
      // Sprawdź czy już wysłane
      const correctionKey = `${item.code}_${errorType}`;
      if (sentCorrections.has(correctionKey)) {
        // Korekta już wysłana - nie rób nic
        return;
      }

      // Określ typ operacji na podstawie błędu
      const attemptedOperation = errorType === 'MISSING_IN_STATE' ? 'REMANENT_BRAK' : 'REMANENT_NADWYŻKA';
      
      const correctionData = {
        fullName: item.name,
        size: item.size,
        barcode: item.code,
        sellingPoint: user?.sellingPoint || user?.location || user?.symbol || 'Nieznany punkt', // sellingPoint PIERWSZY - to jest nazwa punktu!
        symbol: user?.symbol || 'Nieznany',
        errorType: errorType, // 'MISSING_IN_STATE' lub 'EXTRA_IN_REMANENT'
        description: errorType === 'MISSING_IN_STATE' 
          ? `Remanent - Brak: Produkt jest w stanie, ale nie został zeskanowany podczas remanentu` 
          : `Remanent - Nadwyżka: Produkt został zeskanowany, ale nie ma go w stanie magazynowym`,
        attemptedOperation: attemptedOperation, // 'REMANENT_BRAK' lub 'REMANENT_NADWYŻKA'
        originalPrice: item.price,
        discountPrice: item.price,
        transactionId: `REMANENT_${user?.symbol || 'UNKNOWN'}_${Date.now()}`
      };

      Logger.debug('📤 Wysyłanie korekty:', correctionData);

      const response = await tokenService.authenticatedFetch(getApiUrl('/corrections'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(correctionData)
      });

      if (response.ok) {
        const result = await response.json();
        Logger.debug('✅ Korekta wysłana:', result);
        
        // Dodaj do wysłanych korekt i zapisz do localStorage
        const newSentCorrections = new Set(sentCorrections).add(correctionKey);
        setSentCorrections(newSentCorrections);
        await saveSentCorrections(newSentCorrections);
        
        // Usuń alert - tylko zmień wygląd przycisku
      } else {
        Logger.error('❌ Błąd wysyłania korekty:', response.status);
        const errorText = await response.text();
        Logger.error('❌ Error details:', errorText);
        Alert.alert('Błąd', 'Nie udało się wysłać korekty do systemu');
      }
    } catch (error) {
      Logger.error('❌ Error sending correction:', error);
      Alert.alert('Błąd', 'Wystąpił błąd podczas wysyłania korekty');
    }
  };

  // Funkcja sprawdzająca czy korekta została już wysłana
  const isCorrectionSent = (item, errorType) => {
    const correctionKey = `${item.code}_${errorType}`;
    return sentCorrections.has(correctionKey);
  };

  // Funkcje do zarządzania trwałym przechowywaniem wysłanych korekt
  const loadSentCorrections = async () => {
    try {
      const userKey = `sentCorrections_${user?.symbol || 'unknown'}`;
      const savedCorrections = await AsyncStorage.getItem(userKey);
      if (savedCorrections) {
        const parsed = JSON.parse(savedCorrections);
        setSentCorrections(new Set(parsed));
        Logger.debug('📥 Załadowano wysłane korekty:', parsed.length);
      }
    } catch (error) {
      Logger.error('❌ Błąd ładowania wysłanych korekt:', error);
    }
  };

  const saveSentCorrections = async (corrections) => {
    try {
      const userKey = `sentCorrections_${user?.symbol || 'unknown'}`;
      const correctionsArray = Array.from(corrections);
      await AsyncStorage.setItem(userKey, JSON.stringify(correctionsArray));
      Logger.debug('💾 Zapisano wysłane korekty:', correctionsArray.length);
    } catch (error) {
      Logger.error('❌ Błąd zapisywania wysłanych korekt:', error);
    }
  };

  // Funkcja resetowania wysłanych korekt (do debugowania)
  const resetSentCorrections = async (showAlert = true) => {
    try {
      const userKey = `sentCorrections_${user?.symbol || 'unknown'}`;
      await AsyncStorage.removeItem(userKey);
      setSentCorrections(new Set());
      Logger.debug('🗑️ Zresetowano wysłane korekty');
      
      // Pokaż krótkie potwierdzenie tylko jeśli showAlert = true
      if (showAlert) {
        Alert.alert(
          'Reset wykonany',
          'Wszystkie korekty mogą być teraz wysłane ponownie',
          [{ text: 'OK' }],
          { cancelable: true }
        );
      }
    } catch (error) {
      Logger.error('❌ Błąd resetowania korekt:', error);
    }
  };

  useEffect(() => {
    fetchRemanentData();
    fetchRemanentPriceList();
    
    // Załaduj wysłane korekty dla tego użytkownika
    if (user?.symbol) {
      loadSentCorrections();
    }
    
    // Ensure lookup data is loaded
    const loadLookupData = async () => {
      try {
        if (fetchSizes && (!sizes || sizes.length === 0)) {
          await fetchSizes();
        }
        if (fetchColors && (!colors || colors.length === 0)) {
          await fetchColors();
        }
        if (fetchStock && (!stocks || stocks.length === 0)) {
          await fetchStock();
        }
      } catch (error) {
        Logger.debug('Error loading lookup data:', error);
      }
    };
    
    loadLookupData();
  }, [user?.symbol]); // Dodano user?.symbol jako dependency

  // Helper function to build jacket name from barcode
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
      
      Logger.debug('Barcode pattern match:', { stockCode, colorCode, sizeCode });
      Logger.debug('Available data:', { 
        stocksCount: stocks?.length || 0, 
        colorsCount: colors?.length || 0, 
        sizesCount: sizes?.length || 0 
      });
      
      // Try to extract arrays from the objects
      const stocksArray = Array.isArray(stocks) ? stocks : (stocks?.data || stocks?.stocks || []);
      const colorsArray = Array.isArray(colors) ? colors : (colors?.data || colors?.colors || []);
      const sizesArray = Array.isArray(sizes) ? sizes : (sizes?.data || sizes?.sizes || []);
      
      // Mock data as fallback when real data is not available
      const mockStocks = [
        { Tow_Kod: "001", Tow_Opis: "Kurtka zimowa" },
        { Tow_Kod: "002", Tow_Opis: "Kurtka jesienna" },
        { Tow_Kod: "003", Tow_Opis: "Płaszcz" },
        { Tow_Kod: "037", Tow_Opis: "Kurtka sportowa" },
      ];
      
      const mockColors = [
        { Kol_Kod: "01", Kol_Opis: "CZARNY" },
        { Kol_Kod: "02", Kol_Opis: "BIAŁY" },
        { Kol_Kod: "03", Kol_Opis: "CZERWONY" },
        { Kol_Kod: "04", Kol_Opis: "NIEBIESKI" },
        { Kol_Kod: "21", Kol_Opis: "ZIELONY" },
      ];
      
      const mockSizes = [
        { Roz_Kod: "001", Roz_Opis: "XS" },
        { Roz_Kod: "002", Roz_Opis: "S" },
        { Roz_Kod: "003", Roz_Opis: "M" },
        { Roz_Kod: "004", Roz_Opis: "L" },
        { Roz_Kod: "005", Roz_Opis: "XL" },
        { Roz_Kod: "006", Roz_Opis: "2XL" },
      ];
      
      // Use real data if available, otherwise use mock data
      const finalStocks = stocksArray.length > 0 ? stocksArray : mockStocks;
      const finalColors = colorsArray.length > 0 ? colorsArray : mockColors;
      const finalSizes = sizesArray.length > 0 ? sizesArray : mockSizes;
      
      // Look up stock (Tow_Opis) from first 3 digits
      const stockItem = finalStocks.find(stock => stock.Tow_Kod === stockCode);
      const stockName = stockItem?.Tow_Opis || `Kod_${stockCode}`;
      
      // Look up color (Kol_Opis) from next 2 digits  
      const colorItem = finalColors.find(color => color.Kol_Kod === colorCode);
      const colorName = colorItem?.Kol_Opis || `Kolor_${colorCode}`;
      
      // Look up size name from next 3 digits
      const sizeItem = finalSizes.find(size => size.Roz_Kod === sizeCode);
      const sizeName = sizeItem?.Roz_Opis || `Rozmiar_${sizeCode}`;
      
      Logger.debug('Lookup results:', { stockName, colorName, sizeName });
      
      // Build the jacket name with proper fallbacks
      const jacketName = `${stockName || 'Nieznany'} ${colorName || 'Nieznany'} ${sizeName || 'Nieznany'}`;
      
      return jacketName;
    } catch (error) {
      Logger.error("Error building jacket name from barcode:", error);
      return null;
    }
  };

  // Helper function to build remaining product name from barcode
  const buildRemainingProductNameFromBarcode = async (barcodeData) => {
    try {
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
      
      // Mock colors data as fallback
      const mockColors = [
        { Kol_Kod: "01", Kol_Opis: "CZARNY" },
        { Kol_Kod: "02", Kol_Opis: "BIAŁY" },
        { Kol_Kod: "03", Kol_Opis: "CZERWONY" },
        { Kol_Kod: "04", Kol_Opis: "NIEBIESKI" },
        { Kol_Kod: "21", Kol_Opis: "ZIELONY" },
      ];
      
      // Use real data if available, otherwise use mock data
      const finalColors = colorsArray.length > 0 ? colorsArray : mockColors;
      
      // Look up color (Kol_Opis) from positions 4-5
      const colorItem = finalColors.find(color => color.Kol_Kod === colorCode);
      const colorName = colorItem?.Kol_Opis || `Kolor_${colorCode}`;
      
      // For remanent, we'll use mock remaining products data since API might not be available
      const mockRemainingProducts = [
        { Poz_Nr: "01", Poz_Kod: "Ada" },
        { Poz_Nr: "02", Poz_Kod: "Bela" },
        { Poz_Nr: "03", Poz_Kod: "Carla" },
        { Poz_Nr: "04", Poz_Kod: "Diana" },
        { Poz_Nr: "05", Poz_Kod: "Eva" },
        { Poz_Nr: "06", Poz_Kod: "Fiona" },
        { Poz_Nr: "07", Poz_Kod: "Gloria" },
        { Poz_Nr: "08", Poz_Kod: "Helena" },
        { Poz_Nr: "09", Poz_Kod: "Inez" },
      ];
      
      // Convert productCode to number for comparison
      const productCodeNumber = parseInt(productCode, 10);
      
      const productItem = mockRemainingProducts.find(product => 
        parseInt(product.Poz_Nr, 10) === productCodeNumber
      );
      
      const productName = productItem?.Poz_Kod || `Produkt_${productCode}`;
      
      // Build the remaining product name: Poz_Kod + color
      const fullRemainingProductName = `${productName} ${colorName}`;
      
      return fullRemainingProductName;
    } catch (error) {
      Logger.error("Error building remaining product name from barcode:", error);
      return null;
    }
  };

  // Function to get jacket name from barcode (tries different patterns)
  const getJacketNameFromBarcode = async (barcodeData) => {
    // Try remaining products pattern first
    const remainingProductName = await buildRemainingProductNameFromBarcode(barcodeData);
    if (remainingProductName) {
      return remainingProductName;
    }

    // Try jacket pattern
    const jacketName = buildJacketNameFromBarcode(barcodeData);
    if (jacketName) {
      return jacketName;
    }

    // Try to match with stateData as fallback
    if (stateData && Array.isArray(stateData)) {
      const matchedItem = stateData.find(item => item.barcode === barcodeData);
      if (matchedItem) {
        return `${matchedItem.fullName} ${matchedItem.size}`;
      }
    }

    // Fallback to just showing the barcode
    return `Kurtka ${barcodeData}`;
  };

  // Price functions similar to cudzych.jsx
  const getPriceFromRemanentList = (productName) => {
    if (remanentPriceList && remanentPriceList.items && Array.isArray(remanentPriceList.items)) {
      // First try exact match
      let priceItem = remanentPriceList.items.find(item => 
        item.fullName === productName
      );
      
      // If no exact match, try without size (remove last word)
      if (!priceItem && productName.includes(' ')) {
        const words = productName.split(' ');
        if (words.length > 2) {
          // Try removing last word (size)
          const nameWithoutSize = words.slice(0, -1).join(' ');
          priceItem = remanentPriceList.items.find(item => 
            item.fullName === nameWithoutSize
          );
        }
      }
      
      if (priceItem) {
        return priceItem.price.toString();
      }
    }
    return "0.00";
  };

  // Helper function to get price from product name
  const getPriceFromProductName = (productName) => {
    if (!productName) {
      return "0.00";
    }
    return getPriceFromRemanentList(productName);
  };

  // Render individual remanent item
  const renderRemanentItem = ({ item }) => (
    <View style={styles.remanentItem}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemName}>{item.name || 'Produkt'}</Text>
        <View style={styles.itemHeaderRight}>
          <Text style={styles.itemCode}>{item.code || 'N/A'}</Text>
          <TouchableOpacity
            onPress={() => removeRemanentItem(item.id)}
            style={styles.removeRemanentButton}
          >
            <Ionicons name="close" size={18} color="white" />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.itemDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Cena:</Text>
          <Text style={styles.detailValue}>{item.value || '0.00'} PLN</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Punkt sprzedaży:</Text>
          <Text style={styles.detailValue}>{user?.sellingPoint || user?.location || user?.symbol || 'Nieznany punkt'}</Text>
        </View>
      </View>
    </View>
  );

  // Handle item actions
  const handleItemAction = (item, action) => {
    switch (action) {
      case 'edit':
        Alert.alert(
          'Edycja produktu',
          `Edytuj: ${item.name}`,
          [{ text: 'OK' }]
        );
        break;
      case 'inventory':
        Alert.alert(
          'Inwentarz',
          `Przeprowadź inwentarz dla: ${item.name}`,
          [{ text: 'OK' }]
        );
        break;
      default:
        break;
    }
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={{ backgroundColor: "#000", flex: 1, paddingBottom: tabBarSpace }}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0d6efd" />
          <Text style={styles.loadingText}>Ładowanie remanentów...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ backgroundColor: "#000", flex: 1, paddingBottom: tabBarSpace }}>
      <LogoutButton position="top-right" />
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>Remanenty</Text>
            <Text style={styles.headerSubtitle}>Stan magazynowy</Text>
          </View>
        </View>
        
        {/* Przycisk filtrów na pełnej szerokości */}
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={styles.filterButton}
            onPress={() => setShowFilterModal(true)}
          >
            <Ionicons name="filter" size={16} color="white" />
            <Text style={styles.filterButtonText}>
              Filtry
              {(advancedFilters.assortment || advancedFilters.color || advancedFilters.size || assortmentFilter) 
                && ` (${[advancedFilters.assortment, advancedFilters.color, advancedFilters.size, assortmentFilter].filter(f => f).length})`
              }
            </Text>
          </TouchableOpacity>
        </View>

        {/* Pasek postępu skanowania */}
        {scanProgress.totalExpected > 0 && (
          <View style={styles.progressContainer}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Postęp skanowania</Text>
                  <Text style={styles.progressStats}>
                    {scanProgress.uniqueScanned}/{scanProgress.totalExpected} ({scanProgress.percentage}%)
                  </Text>
                </View>
                
                <View style={styles.progressBarContainer}>
                  <View 
                    style={[
                      styles.progressBarFill, 
                      { width: `${scanProgress.percentage}%` }
                    ]} 
                  />
                </View>
                
                <View style={styles.progressDetails}>
                  <Text style={styles.progressDetailText}>
                    📦 Produkty: {scanProgress.uniqueScanned}/{scanProgress.totalExpected}
                  </Text>
                  <Text style={styles.progressDetailText}>
                    🔍 Skanowania: {scanProgress.totalScanned}
                  </Text>
                  {scanStartTime && (
                    <Text style={styles.progressDetailText}>
                      ⏱️ Czas: {formatElapsedTime()}
                    </Text>
                  )}
                </View>
              </View>
            )}
      </View>

      {remanentData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="archive-outline" size={64} color="#CDCDE0" />
          <Text style={styles.emptyText}>Brak danych remanentów</Text>
          <Text style={styles.emptySubtext}>
            Skontaktuj się z administratorem aby skonfigurować remanenty
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRemanentData}
          renderItem={renderRemanentItem}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          contentContainerStyle={[styles.listContainer, { paddingBottom: 16 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#0d6efd']}
              tintColor="#0d6efd"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.addButton} onPress={openQRScanner}>
          <Ionicons name="qr-code" size={24} color="white" />
          <Text style={styles.addButtonText}>Skanuj kurtki</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.checkButton} onPress={checkCurrentState}>
          <Ionicons name="checkmark-circle" size={24} color="white" />
          <Text style={styles.checkButtonText}>Sprawdź</Text>
        </TouchableOpacity>
      </View>

      {/* QR Scanner Modal */}
      <Modal
        visible={scannerVisible}
        animationType="slide"
        onRequestClose={cancelScanning}
      >
        <SafeAreaView style={{ backgroundColor: "#000", flex: 1 }}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity onPress={cancelScanning} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Skanuj kody kurtek</Text>
            <View style={styles.placeholderButton} />
          </View>

          <View style={styles.scannerContainer}>
            {permission?.granted ? (
              <CameraView
                style={styles.camera}
                facing={facing}
                barcodeScannerSettings={{
                  barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code39", "code128"],
                }}
                onBarcodeScanned={scanningEnabled ? handleScan : undefined}
              />
            ) : (
              <View style={styles.permissionContainer}>
                <Text style={styles.permissionText}>Brak uprawnień do kamery</Text>
                <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
                  <Text style={styles.permissionButtonText}>Udziel uprawnień</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Scanner overlay */}
            <View style={styles.overlay}>
              <View style={[
                styles.scanArea, 
                { borderColor: scanningEnabled ? '#0d6efd' : '#dc3545' }
              ]} />
              {!scanningEnabled && (
                <View style={styles.scanningDisabled}>
                  <Text style={styles.scanningDisabledText}>Przetwarzanie...</Text>
                </View>
              )}
            </View>
          </View>

          {/* Scanned jackets list */}
          {scannedJackets.length > 0 && (
            <View style={styles.scannedListContainer}>
              <Text style={styles.scannedListTitle}>
                Zeskanowane kurtki ({scannedJackets.length})
              </Text>
              <FlatList
                data={scannedJackets}
                horizontal
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <View style={styles.scannedJacket}>
                    <TouchableOpacity
                      onPress={() => removeScannedJacket(item.id)}
                      style={styles.removeJacketButton}
                    >
                      <Ionicons name="close" size={16} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.jacketName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.jacketCode}>{item.code}</Text>
                    <Text style={styles.jacketTime}>{item.scannedAt}</Text>
                  </View>
                )}
                showsHorizontalScrollIndicator={false}
              />
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.scannerFooter}>
            {scannedJackets.length > 0 && (
              <TouchableOpacity 
                onPress={confirmScannedJackets}
                style={styles.confirmButton}
              >
                <Ionicons name="checkmark" size={24} color="white" />
                <Text style={styles.confirmButtonText}>
                  Zatwierdź ({scannedJackets.length})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Modal porównania remanent vs stan */}
      <Modal
        visible={comparisonModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={[styles.modalContainer]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Porównanie Remanent vs Stan
              {(advancedFilters.assortment || advancedFilters.color || advancedFilters.size) 
                && ` - ${[advancedFilters.assortment, advancedFilters.color, advancedFilters.size].filter(f => f).join(' ')}`}
              {(!advancedFilters.assortment && !advancedFilters.color && !advancedFilters.size && assortmentFilter) 
                && ` - ${assortmentFilter}`}
            </Text>
            <TouchableOpacity
              onPress={() => setComparisonModalVisible(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {comparisonResults ? (
            <ScrollView style={styles.comparisonContent} showsVerticalScrollIndicator={false}>
              {/* Statystyki */}
              <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{comparisonResults.currentStateCount || 0}</Text>
                  <Text style={styles.statLabel}>Na stanie</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{comparisonResults.remanentCount || 0}</Text>
                  <Text style={styles.statLabel}>Zeskanowane</Text>
                </View>
              </View>

              {/* Produkty brakujące */}
              {comparisonResults.missingItems && comparisonResults.missingItems.length > 0 && (
                <View style={styles.resultSection}>
                  <Text style={styles.sectionTitle}>
                    ❌ Brakuje ({comparisonResults.missingItems.length})
                  </Text>
                  <Text style={styles.sectionSubtitle}>Produkty w stanie, ale nie zeskanowane</Text>
                  {comparisonResults.missingItems.map((item, index) => (
                    <View key={index} style={styles.resultItem}>
                      <View style={styles.resultItemContent}>
                        <Text style={styles.itemName}>
                          {item.name && item.size ? `${item.name} ${item.size}` : item.name || 'Nieznany produkt'}
                        </Text>
                        {item.expectedCount !== undefined && (
                          <Text style={styles.itemQuantity}>
                            Oczekiwano: {item.expectedCount}, zeskanowano: {item.actualCount || 0}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.sendCorrectionButton, 
                          isCorrectionSent(item, 'MISSING_IN_STATE') && styles.sentButton
                        ]}
                        onPress={() => sendToCorrections(item, 'MISSING_IN_STATE')}
                        disabled={isCorrectionSent(item, 'MISSING_IN_STATE')}
                      >
                        <Ionicons 
                          name={isCorrectionSent(item, 'MISSING_IN_STATE') ? "checkmark" : "send"} 
                          size={16} 
                          color="white" 
                        />
                        <Text style={styles.sendButtonText}>
                          {isCorrectionSent(item, 'MISSING_IN_STATE') ? 'Wysłano' : 'Wyślij do korekt'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Produkty nadwyżkowe */}
              {comparisonResults.extraItems && comparisonResults.extraItems.length > 0 && (
                <View style={styles.resultSection}>
                  <Text style={styles.sectionTitle}>
                    ⚠️ Nadwyżka ({comparisonResults.extraItems.length})
                  </Text>
                  <Text style={styles.sectionSubtitle}>Produkty zeskanowane, ale nie ma ich w stanie</Text>
                  {comparisonResults.extraItems.map((item, index) => (
                    <View key={index} style={styles.resultItem}>
                      <View style={styles.resultItemContent}>
                        <Text style={styles.itemName}>{item.name || 'Nieznany produkt'}</Text>
                        {item.excessCount !== undefined && (
                          <Text style={styles.itemQuantity}>
                            {item.expectedCount === 0 
                              ? `Nie powinno być w stanie, a zeskanowano: ${item.actualCount}`
                              : `Nadwyżka: ${item.excessCount} szt. (zeskanowano ${item.actualCount}, powinno być ${item.expectedCount})`
                            }
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.sendCorrectionButton, 
                          isCorrectionSent(item, 'EXTRA_IN_REMANENT') && styles.sentButton
                        ]}
                        onPress={() => sendToCorrections(item, 'EXTRA_IN_REMANENT')}
                        disabled={isCorrectionSent(item, 'EXTRA_IN_REMANENT')}
                      >
                        <Ionicons 
                          name={isCorrectionSent(item, 'EXTRA_IN_REMANENT') ? "checkmark" : "send"} 
                          size={16} 
                          color="white" 
                        />
                        <Text style={styles.sendButtonText}>
                          {isCorrectionSent(item, 'EXTRA_IN_REMANENT') ? 'Wysłano' : 'Wyślij do korekt'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Wszystko OK */}
              {(!comparisonResults.missingItems || comparisonResults.missingItems.length === 0) && 
               (!comparisonResults.extraItems || comparisonResults.extraItems.length === 0) && (
                <View style={styles.resultSection}>
                  <Text style={styles.successTitle}>🎉 Wszystko się zgadza!</Text>
                  <Text style={styles.successSubtitle}>Remanent jest zgodny ze stanem magazynowym</Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={styles.comparisonContent}>
              <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>Ładowanie danych...</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Modal filtrów zaawansowanych - w stylu aplikacji (karta na przyciemnionym tle) */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setOpenFilterSelect(null); setShowFilterModal(false); }}
      >
        <View style={styles.filterOverlay}>
          <View style={styles.filterCard}>
            <View style={styles.filterCardHeader}>
              <Text style={styles.filterCardTitle}>Filtry remanentu</Text>
              <TouchableOpacity onPress={() => { setOpenFilterSelect(null); setShowFilterModal(false); }}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {[
                { key: "assortment", title: "Asortyment", placeholder: "Wszystkie asortymenty", options: availableAssortments, icon: "cube-outline" },
                { key: "color", title: "Kolor", placeholder: "Wszystkie kolory", options: availableColors, icon: "color-palette-outline" },
                { key: "size", title: "Rozmiar", placeholder: "Wszystkie rozmiary", options: availableSizes, icon: "resize-outline" },
              ].map((field) => {
                const value = advancedFilters[field.key];
                const isOpen = openFilterSelect === field.key;
                return (
                  <View key={field.key} style={styles.filterSection}>
                    <Text style={styles.filterSectionTitle}>{field.title}</Text>
                    <TouchableOpacity
                      style={[styles.selectField, isOpen && styles.selectFieldOpen]}
                      onPress={() => setOpenFilterSelect(isOpen ? null : field.key)}
                    >
                      <Ionicons name={field.icon} size={18} color={value ? "#0D6EFD" : "#64748B"} style={{ marginRight: 8 }} />
                      <Text style={[styles.selectFieldText, !value && styles.selectFieldPlaceholder]} numberOfLines={1}>
                        {value || field.placeholder}
                      </Text>
                      <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color="#94A3B8" />
                    </TouchableOpacity>
                    {isOpen && (
                      <ScrollView style={styles.optionList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {["", ...field.options].map((option) => {
                          const selected = option === value;
                          return (
                            <TouchableOpacity
                              key={option || "__all__"}
                              style={[styles.optionItem, selected && styles.optionItemSelected]}
                              onPress={() => {
                                setAdvancedFilters((prev) => ({ ...prev, [field.key]: option }));
                                setOpenFilterSelect(null);
                              }}
                            >
                              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                                {option || field.placeholder}
                              </Text>
                              {selected && <Ionicons name="checkmark" size={18} color="#0D6EFD" />}
                            </TouchableOpacity>
                          );
                        })}
                        {field.options.length === 0 && (
                          <Text style={[styles.optionText, { padding: 12, color: "#64748B" }]}>Brak opcji do wyboru</Text>
                        )}
                      </ScrollView>
                    )}
                  </View>
                );
              })}

              {/* Aktywne filtry */}
              {(advancedFilters.assortment || advancedFilters.color || advancedFilters.size) ? (
                <View style={styles.activeFiltersSection}>
                  <Text style={styles.filterSectionTitle}>Aktywne filtry:</Text>
                  <View style={styles.activeFiltersContainer}>
                    {[
                      { key: "assortment", icon: "📦" },
                      { key: "color", icon: "🎨" },
                      { key: "size", icon: "📏" },
                    ].filter((tag) => advancedFilters[tag.key]).map((tag) => (
                      <View key={tag.key} style={styles.activeFilterTag}>
                        <Text style={styles.activeFilterText}>{tag.icon} {advancedFilters[tag.key]}</Text>
                        <TouchableOpacity
                          onPress={() => setAdvancedFilters((prev) => ({ ...prev, [tag.key]: "" }))}
                          style={styles.removeFilterButton}
                        >
                          <Ionicons name="close-circle" size={16} color="#ff6b6b" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </ScrollView>

            {/* Przyciski akcji */}
            <View style={styles.filterCardActions}>
              <TouchableOpacity
                style={[styles.filterCardButton, styles.filterCardButtonSecondary]}
                onPress={() => {
                  setAdvancedFilters({ assortment: "", color: "", size: "" });
                  setAssortmentFilter("");
                  setOpenFilterSelect(null);
                }}
              >
                <Ionicons name="refresh" size={18} color="white" />
                <Text style={styles.filterCardButtonText}>Wyczyść</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterCardButton, styles.filterCardButtonPrimary]}
                onPress={() => { setOpenFilterSelect(null); setShowFilterModal(false); }}
              >
                <Ionicons name="checkmark" size={18} color="white" />
                <Text style={styles.filterCardButtonText}>Zastosuj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#232533',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#CDCDE0',
  },
  resetButton: {
    backgroundColor: '#6c757d',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  resetButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    marginTop: 12,
    fontSize: 16,
  },
  listContainer: {
    padding: 16,
  },
  remanentItem: {
    backgroundColor: '#1E1E2D',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#232533',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemName: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    flex: 1,
  },
  itemCode: {
    fontSize: 14,
    color: '#CDCDE0',
    backgroundColor: '#232533',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  removeRemanentButton: {
    backgroundColor: '#dc3545',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemDetails: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#CDCDE0',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: 'white',
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#232533',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#232533',
    minWidth: 100,
    justifyContent: 'center',
  },
  actionText: {
    color: 'white',
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#CDCDE0',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#232533',
    flexDirection: 'row',
    gap: 12,
  },
  addButton: {
    backgroundColor: '#0d6efd',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    flex: 1,
  },
  checkButton: {
    backgroundColor: '#28a745',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    flex: 1,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  checkButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // QR Scanner styles
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#232533',
  },
  closeButton: {
    padding: 8,
  },
  scannerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  placeholderButton: {
    width: 44,
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#161622',
  },
  permissionText: {
    color: 'white',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#0d6efd',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  overlay: {
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
    borderColor: '#0d6efd',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  scanningDisabled: {
    position: 'absolute',
    bottom: -50,
    backgroundColor: 'rgba(220, 53, 69, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  scanningDisabledText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  scannedListContainer: {
    backgroundColor: '#1E1E2D',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#232533',
    maxHeight: 120,
  },
  scannedListTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  scannedJacket: {
    backgroundColor: '#232533',
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    minWidth: 120,
    position: 'relative',
  },
  removeJacketButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#dc3545',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  jacketName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 16,
  },
  jacketCode: {
    color: '#CDCDE0',
    fontSize: 12,
    marginBottom: 4,
  },
  jacketTime: {
    color: '#CDCDE0',
    fontSize: 12,
  },
  scannerFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#232533',
  },
  confirmButton: {
    backgroundColor: '#28a745',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Styles for comparison modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#232533',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    padding: 8,
  },
  comparisonContent: {
    flex: 1,
    padding: 20,
    backgroundColor: '#000000',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    backgroundColor: '#232533',
    borderRadius: 12,
    padding: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0d6efd',
  },
  statLabel: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  resultSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  resultItem: {
    backgroundColor: '#232533',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultItemContent: {
    flex: 1,
  },
  sendCorrectionButton: {
    backgroundColor: '#dc3545',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginLeft: 12,
  },
  sentButton: {
    backgroundColor: '#28a745',
    opacity: 0.7,
  },
  sendButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  itemDetails: {
    fontSize: 14,
    color: '#888',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#28a745',
    textAlign: 'center',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  // Styles for assortment filter
  filterContainer: {
    marginTop: 12,
    backgroundColor: '#2A2A3E',
    borderRadius: 8,
    padding: 8,
  },
  filterLabel: {
    fontSize: 12,
    color: '#CDCDE0',
    marginBottom: 4,
    fontWeight: '500',
  },
  pickerContainer: {
    backgroundColor: '#1E1E2D',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444',
  },
  picker: {
    height: 35,
    color: 'white',
    fontSize: 14,
  },
  // Filter button styles
  filterButton: {
    backgroundColor: '#007bff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  filterButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  // Header buttons container
  headerButtons: {
    flexDirection: 'row',
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Filter modal styles
  filterOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  filterCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    backgroundColor: "#0A0A0A",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 20,
  },
  filterCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  filterCardTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "700",
  },
  selectField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectFieldOpen: {
    borderColor: "#0D6EFD",
  },
  selectFieldText: {
    flex: 1,
    color: "white",
    fontSize: 15,
    fontWeight: "600",
  },
  selectFieldPlaceholder: {
    color: "#94A3B8",
    fontWeight: "400",
  },
  optionList: {
    maxHeight: 220,
    marginTop: 6,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 10,
  },
  optionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  optionItemSelected: {
    backgroundColor: "rgba(13, 110, 253, 0.15)",
  },
  optionText: {
    color: "white",
    fontSize: 15,
  },
  optionTextSelected: {
    color: "#60A5FA",
    fontWeight: "700",
  },
  filterCardActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  filterCardButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  filterCardButtonPrimary: {
    backgroundColor: "#0D6EFD",
  },
  filterCardButtonSecondary: {
    backgroundColor: "#64748B",
  },
  filterCardButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
  },
  filterModalContent: {
    flex: 1,
    padding: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    marginBottom: 8,
  },
  activeFiltersSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#2A2A3E',
    borderRadius: 12,
    marginBottom: 20,
  },
  activeFiltersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  activeFilterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007bff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  activeFilterText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    marginRight: 4,
  },
  removeFilterButton: {
    marginLeft: 4,
  },
  filterActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#3C3C43',
  },
  clearFiltersButton: {
    flex: 1,
    backgroundColor: '#6c757d',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  clearFiltersText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  applyFiltersButton: {
    flex: 1,
    backgroundColor: '#28a745',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  applyFiltersText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  itemQuantity: {
    fontSize: 12,
    color: '#CDCDE0',
    marginTop: 2,
    fontStyle: 'italic',
  },
  // Progress bar styles
  progressContainer: {
    marginTop: 16,
    backgroundColor: '#2A2A3E',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3C3C43',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressTitle: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
  },
  progressStats: {
    fontSize: 14,
    color: '#007bff',
    fontWeight: 'bold',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#1E1E2D',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#28a745',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  progressDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  progressDetailText: {
    fontSize: 11,
    color: '#CDCDE0',
    marginRight: 8,
  },
});

export default Remanent;
