import { useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardSafeScreen, KeyboardSafeOverlay } from "../../components/KeyboardSafe"; // klawiatura nie zasłania pola tekstowego (ekrany i okienka)
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl } from "../../config/api";
import { GlobalStateContext } from "../../context/GlobalState";
import tokenService from "../../services/tokenService";
import Logger from "../../services/logger"; // Import logger service
import AuthFix from "../../components/AuthFix";
import LogoutButton from "../../components/LogoutButton";
import { appAlert } from '../../services/appAlert';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActionItem, ModalHeader, OptionCard, ScreenHeader, look } from '../../components/AdminLook';
import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu
// Skaner (components/scanner/ScanCamera, kamera) wczytywany dopiero po otwarciu „Skanuj metkę” - ekran przepisywania
// nie ładuje kamery, dopóki nikt jej nie użyje
const loadScanCamera = () => require('../../components/scanner/ScanCamera').default;
import useProductCatalog from '../../hooks/useProductCatalog'; // baza produktów i nazwy po kodzie z metki (Wymiana: oddana kurtka)
import { isValidEan13, jacketCodeForSize } from '../../utils/productName';
import { warsawDay, warsawToday } from '../../utils/warsawDay'; // S16: „dziś” i dzień pozycji po czasie polskim
import { pointDisplayName } from '../../utils/pointName'; // pełna nazwa punktu zamiast symbolu
const WriteOff = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
    const insets = useSafeAreaInsets(); // Get safe area insets
    const { 
        user, 
        stateData, 
        users: globalUsers, // Dodaj globalną tablicę użytkowników
        fetchState,
        fetchUsers: fetchUsersFromContext,
        getFilteredSellingPoints
    } = React.useContext(GlobalStateContext);
    
    const [modalVisible, setModalVisible] = useState(false);
    const [transferModalVisible, setTransferModalVisible] = useState(false);
    const [domReasonModalVisible, setDomReasonModalVisible] = useState(false);
    const [magazynReasonModalVisible, setMagazynReasonModalVisible] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [users, setUsers] = useState([]); // List of users for transfer
    const [exchangeUsers, setExchangeUsers] = useState([]); // List of users for exchange (includes current user)
    const [transfers, setTransfers] = useState([]); // List of current transfers
    const [allTransfers, setAllTransfers] = useState([]); // List of ALL transfers for validation
    const [salesData, setSalesData] = useState([]); // Sprzedaże z tego punktu czekające na Dobieranie (wyszarzają sprzedane sztuki)
    const [isLoading, setIsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false); // Dodano nowy stan dla pull-to-refresh
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [customReason, setCustomReason] = useState(""); // Stan dla niestandardowego powodu
    const [selectedReason, setSelectedReason] = useState(""); // Stan dla wybranego radio button powodu
    const [advanceAmount, setAdvanceAmount] = useState(""); // Stan dla kwoty zaliczki
    const [selectedCurrency, setSelectedCurrency] = useState("PLN"); // Stan dla waluty zaliczki
    const [showCurrencyModal, setShowCurrencyModal] = useState(false); // Modal wyboru waluty
    const [successModalVisible, setSuccessModalVisible] = useState(false); // State for success modal
    const [successMessage, setSuccessMessage] = useState(""); // Message for success modal
    const [panKazekModalVisible, setPanKazekModalVisible] = useState(false); // Modal for Pan Kazek confirmation
    const [exchangeModalVisible, setExchangeModalVisible] = useState(false); // Modal for exchange location selection
    // Wymiana, krok 2: kurtka oddana przez klienta (jedzie do MAGAZYNU)
    const [returnPrompt, setReturnPrompt] = useState(null); // { exchangeTransferId, givenLabel }
    const [returnCandidates, setReturnCandidates] = useState([]);
    const [returnLoading, setReturnLoading] = useState(false);
    const [returnSaving, setReturnSaving] = useState(false);
    const [returnCode, setReturnCode] = useState('');
    const [returnView, setReturnView] = useState('main'); // 'main' | 'scan' | 'picker'
    const [returnCodeFocused, setReturnCodeFocused] = useState(false); // wpisywanie kodu: lista sprzedaży schowana
    const [returnPickerSearch, setReturnPickerSearch] = useState('');
    const [returnPickerGood, setReturnPickerGood] = useState(null); // kurtka wybrana z bazy - czeka na rozmiar
    const { goodsList, pickerSizes, getProductNameFromBarcode, isKnownProductCode } = useProductCatalog();
    
    // Animacje dla kropek ładowania
    const dot1Anim = useRef(new Animated.Value(0)).current;
    const dot2Anim = useRef(new Animated.Value(0)).current;
    const dot3Anim = useRef(new Animated.Value(0)).current;
    const spinnerAnim = useRef(new Animated.Value(0)).current;

    // Ensure stateData and user are not null
    const filteredData = stateData?.filter(item => item.symbol === user?.symbol) || []; // Fallback to empty array    
    
    // Get today's date in YYYY-MM-DD format
    // FOR TESTING: Uncomment line below to simulate tomorrow
    // const today = '2025-08-11'; // TEST: Simulate tomorrow (dzień później)
    const today = warsawToday(); // dzień polski, nie UTC (S16: po północy UTC ma jeszcze wczoraj)

    // Animacja kropek
    useEffect(() => {
        if (isLoading) {
            const animateDots = () => {
                const createDotAnimation = (animValue, delay) => {
                    return Animated.loop(
                        Animated.sequence([
                            Animated.delay(delay),
                            Animated.timing(animValue, {
                                toValue: 1,
                                duration: 400,
                                useNativeDriver: true,
                            }),
                            Animated.timing(animValue, {
                                toValue: 0,
                                duration: 400,
                                useNativeDriver: true,
                            }),
                        ])
                    );
                };

                Animated.parallel([
                    createDotAnimation(dot1Anim, 0),
                    createDotAnimation(dot2Anim, 200),
                    createDotAnimation(dot3Anim, 400),
                ]).start();
            };

            // Animacja spinnera
            const animateSpinner = () => {
                Animated.loop(
                    Animated.timing(spinnerAnim, {
                        toValue: 1,
                        duration: 2000,
                        useNativeDriver: true,
                    })
                ).start();
            };

            animateDots();
            animateSpinner();
        } else {
            // Reset animacji gdy loading się skończy
            dot1Anim.setValue(0);
            dot2Anim.setValue(0);
            dot3Anim.setValue(0);
            spinnerAnim.setValue(0);
        }
    }, [isLoading]);

    // Automatyczne filtrowanie użytkowników gdy globalUsers się zaktualizuje
    useEffect(() => {
        if (globalUsers && globalUsers.length > 0) {
            fetchUsersData();
        }
    }, [globalUsers]);

    const fetchAllRequiredData = async (isRefreshAction = false) => {
        // Ustawienie odpowiedniego stanu ładowania
        if (isRefreshAction) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        
        setErrorMessage("");
        setShowErrorModal(false);
        
        // Add a small delay to ensure the loading state renders before starting API calls
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Set up a 10-second timeout for the entire operation
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Timeout - backend nie odpowiada po 10 sekundach'));
            }, 10000);
        });
        
        try {
            // Race between data fetching and timeout
            const dataPromise = Promise.all([
                fetchState(),
                fetchUsersFromContext(), // Użyj funkcji z Global State zamiast lokalnej
                fetchTransfers(),
                fetchSales(), // Add sales data fetching
                fetchExchangeUsers() // Fetch users for exchange modal
            ]);
            
            await Promise.race([
                dataPromise,
                timeoutPromise
            ]);
            
            // fetchUsersData() będzie wywoływane automatycznie przez useEffect gdy globalUsers się zaktualizuje
            
        } catch (error) {
            if (error.message.includes('Timeout') || error.message.includes('timeout')) {
                setErrorMessage("Backend nie odpowiada. Upłynął limit czasu 10 sekund. Sprawdź połączenie internetowe i spróbuj ponownie.");
            } else {
                setErrorMessage("Nie można pobrać danych z backendu. Sprawdź połączenie internetowe i spróbuj ponownie.");
            }
            
            setShowErrorModal(true);
        } finally {
            if (isRefreshAction) {
                setIsRefreshing(false);
            } else {
                setIsLoading(false);
            }
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            fetchAllRequiredData(false); // false = nie jest to refresh action
            
            return () => {
                // Cleanup when tab unfocused
            };
        }, [])
    );

const fetchTransfers = async () => {
    if (!user?.symbol) {
        return;
    }
    
    try {
        const response = await tokenService.authenticatedFetch(getApiUrl('/transfer'));
        
        if (!response.ok) {
            throw new Error(`Failed to fetch transfers: ${response.status}`);
        }

        const data = await response.json();
        
        const allTransfers = Array.isArray(data) ? data : [];
        // Dzień przepisania po czasie polskim (dawniej prefiks daty UTC - po północy do 2:00 dzisiejsze wyglądało na wczorajsze)
        const isToday = (transfer) => !!transfer.date && warsawDay(transfer.date) === today;

        // Na liście: dzisiejsze przepisania tego punktu ORAZ nieprzetworzone z wcześniejszych dni (26.10.2026):
        // kurtka przepisana wczoraj, a jeszcze nieodpisana w Dobieraniu, dalej jest wyszarzona - serwer i tak
        // nie pozwoli jej przepisać drugi raz, a sprzedawca ma widzieć dlaczego (jak przy sprzedanej)
        const todayUserTransfers = allTransfers.filter(
            (transfer) =>
                (transfer.transfer_from === user?.symbol || transfer.transfer_to === user?.symbol) &&
                (isToday(transfer) || (transfer.transfer_from === user?.symbol && transfer.blueProcessed !== true))
        );

        // FIXED: For sold items - include ALL sales from today for UI highlighting
        // We need to show all sold items to block jackets with same barcode regardless of who sold them
        const todaySoldItems = allTransfers.filter(
            transfer => transfer.transfer_to === 'SOLD' && isToday(transfer)
        );

        // For validation - today's transfers (any product, any user); the server guard is the real protection
        const todayUserProductTransfers = allTransfers.filter(isToday);

        // Combine today's transfers for UI
        const todayTransfers = [...todayUserTransfers, ...todaySoldItems];
        const uniqueTodayTransfers = todayTransfers.filter((transfer, index, self) => 
            index === self.findIndex(t => t.productId === transfer.productId)
        );
        
        // Store TODAY's transfers for UI highlighting (includes ALL sold items)
        setTransfers(uniqueTodayTransfers);
        // CHANGED: Store ONLY TODAY's transfers for validation (complete daily reset)
        // This blocks transfers ONLY if the same product was transferred TODAY
        setAllTransfers(todayUserProductTransfers);
        
    } catch (error) {
        setTransfers([]);
        setAllTransfers([]);
        throw error; // Re-throw to be caught by fetchAllRequiredData
    }
};

const fetchSales = async () => {
    try {
        const response = await tokenService.authenticatedFetch(getApiUrl('/sales/get-all-sales'));
        
        if (!response.ok) {
            throw new Error(`Failed to fetch sales: ${response.status}`);
        }

        const data = await response.json();
        const allSales = Array.isArray(data) ? data : [];
        
        // Sprzedane, a jeszcze nieodpisane w Dobieraniu (z dowolnego dnia) - te sztuki nadal są na stanie,
        // ale nie wolno ich przepisać (serwer i tak odrzuci: ITEM_ALREADY_SOLD)
        const pendingSales = allSales.filter(sale =>
            sale.from === user?.symbol && sale.barcode && sale.processed !== true && sale.returned !== true
        );

        setSalesData(pendingSales);
    } catch (error) {
        setSalesData([]);
        throw error; // Re-throw to be caught by fetchAllRequiredData
    }
};

    // Dzisiejsze przepisanie/wymiana tej sztuki z tego punktu (sprzedaż liczy się po kodzie kreskowym)
    const todayTransferOf = (item) => transfers.find(
        (transfer) => transfer.transfer_from === user?.symbol
            && (transfer.productId === item.id || (transfer.transfer_to === 'SOLD' && item.barcode && transfer.barcode === item.barcode))
    ) || null;

    // Sztuki sprzedane, a jeszcze nieodpisane: przy N sprzedażach danego kodu wyszarzamy N wolnych sztuk z tym kodem
    // (jak serwer - przy dwóch identycznych kurtkach i jednej sprzedaży drugą nadal można przepisać)
    const soldItemIds = useMemo(() => {
        const soldPerBarcode = {};
        salesData.forEach((sale) => { soldPerBarcode[sale.barcode] = (soldPerBarcode[sale.barcode] || 0) + 1; });
        const ids = new Set();
        filteredData.forEach((item) => {
            if (!item.barcode || !soldPerBarcode[item.barcode] || todayTransferOf(item)) return;
            soldPerBarcode[item.barcode] -= 1;
            ids.add(item.id);
        });
        return ids;
    }, [salesData, filteredData, transfers]);

    // Dzisiejsze przepisania / wymiany z tego punktu już odpisane w Dobieraniu: sztuki nie ma już na stanie,
    // ale zostaje na liście wyszarzona z napisem „Przetworzone” (bez akcji)
    const processedTodayRows = useMemo(() => transfers
        .filter((transfer) => transfer.transfer_from === user?.symbol && transfer.blueProcessed && transfer.transfer_to !== 'SOLD'
            && !filteredData.some((item) => item.id === transfer.productId))
        .map((transfer) => ({
            id: `processed-${transfer._id}`,
            fullName: transfer.fullName,
            size: transfer.size,
            barcode: transfer.barcode,
            processedTransfer: transfer,
        })), [transfers, filteredData, user]);

    // Przepisanie z dzisiaj (dzień polski) - tylko takie można anulować z telefonu
    const isTodayTransfer = (transfer) => !!transfer?.date && warsawDay(transfer.date) === today;
    const transferDayLabel = (transfer) => {
        if (!transfer?.date || isTodayTransfer(transfer)) return '';
        const [y, m, d] = String(warsawDay(transfer.date)).split('-');
        return ` (${d}.${m}.${y})`;
    };
    const transferLabel = (transfer) => {
        if (!transfer) return '';
        if (transfer.transfer_to === 'SOLD') return 'Sprzedano';
        if (transfer.transfer_to === 'Wymiana') return `Wymiana${transfer.reason?.startsWith('Wymiana - ') ? ` - ${transfer.reason.replace('Wymiana - ', '')}` : ''}${transferDayLabel(transfer)}`;
        return `Przepisano do: ${transfer.transfer_to}${transferDayLabel(transfer)}`;
    };

    const cancelTransfer = async (transfer) => {
        try {
            const response = await tokenService.authenticatedFetch(getApiUrl(`/transfer/${transfer._id}/cancel`), { method: 'PATCH' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                appAlert('Błąd', data.message || 'Nie udało się anulować przepisania.');
                return;
            }
            closeModal();
            setSuccessMessage(transfer.transfer_to === 'Wymiana' ? 'Wymiana została anulowana.' : 'Przepisanie zostało anulowane.');
            setSuccessModalVisible(true);
            fetchAllRequiredData(false);
        } catch (error) {
            appAlert('Błąd', 'Nie udało się anulować przepisania.');
        }
    };

    // Ile sztuk tej samej kurtki (ten sam kod; bez kodu - nazwa i rozmiar) leży już w punkcie docelowym.
    // Telefon ma stan wszystkich punktów (GET /state), więc liczymy bez dodatkowego zapytania.
    const stockAtPoint = (symbol, item = selectedItem) => {
        if (!item || !symbol || !Array.isArray(stateData)) return 0;
        return stateData.filter((row) => row.symbol === symbol && (item.barcode
            ? row.barcode === item.barcode
            : row.fullName === item.fullName && row.size === item.size)).length;
    };
    const stockNote = (symbol) => {
        const count = stockAtPoint(symbol);
        return count > 0 ? `Na stanie: ${count} szt.` : 'Brak tego produktu na stanie';
    };
    const stockNoteColor = (symbol) => (stockAtPoint(symbol) > 0 ? null : '#EF4444');

    // Przepisanie do punktu bez tej kurtki - można, ale najpierw pytanie (zgłoszenie 25.10.2026)
    const confirmIfMissingAtTarget = (symbol, proceed) => {
        if (stockAtPoint(symbol) > 0) {
            proceed();
            return;
        }
        const name = `${selectedItem?.fullName || ''} ${selectedItem?.size || ''}`.trim();
        appAlert(
            `Brak na stanie w punkcie ${symbol}`,
            `W punkcie ${symbol} nie ma tej kurtki (${name}) na stanie. Czy na pewno przepisać?`,
            [
                { text: 'Anuluj', style: 'cancel' },
                { text: 'Przepisz', onPress: proceed },
            ]
        );
    };

    const openModal = (item) => {
        setSelectedItem(item);
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
        setSelectedItem(null); // Reset selectedItem
    };

    const fetchUsersData = async () => {
        try {
            // Nie pobieramy danych z API - używamy danych z Global State
            // które zostały już zaktualizowane przez fetchUsersFromContext()
            
            if (!globalUsers || globalUsers.length === 0) {
                // Fallback do funkcji z Global State
                const filteredUsers = getFilteredSellingPoints();
                const finalFilteredUsers = filteredUsers.filter(u => u.symbol !== user?.symbol);
                setUsers(finalFilteredUsers);
                return;
            }
            
            // Zastosuj logikę filtrowania
            const filteredUsers = globalUsers.filter(u => {
                // Zawsze uwzględniaj użytkowników z rolą "dom"
                if (u.role && u.role.toLowerCase() === 'dom') {
                    return true;
                }
                
                // Dla pozostałych użytkowników stosuj standardowe filtrowanie
                const userLocation = u.location || u.sellingPoint || null;
                const currentUserLocation = user?.location || user?.sellingPoint || null;
                
                const shouldInclude = userLocation && currentUserLocation &&
                    userLocation.trim().toLowerCase() === currentUserLocation.trim().toLowerCase() && 
                    u.role !== 'admin' && 
                    u.role !== 'magazyn' &&
                    u.sellingPoint && 
                    u.sellingPoint.trim() !== '';
                    
                return shouldInclude;
            });
            
            // Dodatkowo wykluczamy zalogowanego użytkownika
            const finalFilteredUsers = filteredUsers.filter(u => u.symbol !== user?.symbol);
            
            setUsers(finalFilteredUsers);
        } catch (error) {
            throw error; // Re-throw to be caught by fetchAllRequiredData
        }
    };

    // Fetch exchange items from API
    const fetchExchangeItems = async () => {
        if (!user?.symbol) {
            return;
        }
        
        try {
            const response = await tokenService.authenticatedFetch(getApiUrl('/exchange'));
            
            if (!response.ok) {
                throw new Error(`Failed to fetch exchanges: ${response.status}`);
            }

            const data = await response.json();
            const allExchanges = Array.isArray(data.data) ? data.data : [];
            
            // Filter exchanges for current user's symbol (today only)
            const today = warsawToday();
            const todayExchanges = allExchanges.filter(
                (exchange) => exchange.symbol === user?.symbol && exchange.dateString === today
            );
            
            setExchangeItems(todayExchanges);
        } catch (error) {
            Logger.error('Error fetching exchange items:', error);
        }
    };

    // Fetch users for exchange modal (includes current user)
    const fetchExchangeUsers = async () => {
        try {
            if (!globalUsers || globalUsers.length === 0) {
                const filteredUsers = getFilteredSellingPoints();
                setExchangeUsers(filteredUsers); // Include all, even current user
                return;
            }
            
            // Filter users from same location (including current user)
            const filteredUsers = globalUsers.filter(u => {
                // Always include users with "dom" role
                if (u.role && u.role.toLowerCase() === 'dom') {
                    return true;
                }
                
                // For other users, apply standard filtering
                const userLocation = u.location || u.sellingPoint || null;
                const currentUserLocation = user?.location || user?.sellingPoint || null;
                
                const shouldInclude = userLocation && currentUserLocation &&
                    userLocation.trim().toLowerCase() === currentUserLocation.trim().toLowerCase() && 
                    u.role !== 'admin' && 
                    u.role !== 'magazyn' &&
                    u.sellingPoint && 
                    u.sellingPoint.trim() !== '';
                    
                return shouldInclude;
            });
            
            // Do NOT exclude current user for exchange modal
            setExchangeUsers(filteredUsers);
        } catch (error) {
            Logger.error('Error fetching exchange users:', error);
        }
    };

    const initiateTransfer = async (toSymbol, reason = null, advance = null) => {
        if (!selectedItem) {
            appAlert("Error", "No item selected for transfer.");
            return;
        }

        if (!user || !user.symbol) {
            appAlert("Błąd", "Brak danych zalogowanego użytkownika");
            return;
        }

        // Sprawdź czy transfer jest do "Dom" i czy nie ma powodu
        if (toSymbol.toLowerCase() === 'dom' || toSymbol.toLowerCase() === 'd') {
            if (!reason) {
                // Pokaż modal wyboru powodu dla transferu do domu
                setTransferModalVisible(false);
                setDomReasonModalVisible(true);
                return;
            }
        }

        const transferModel = {
            fullName: selectedItem.fullName,
            size: selectedItem.size,
            date: today + 'T' + new Date().toISOString().split('T')[1], // Use consistent date with today variable
            dateString: today, // Add dateString field required by new schema
            transfer_from: user.symbol,
            transfer_to: toSymbol,
            productId: selectedItem.id,
            barcode: selectedItem.barcode || null, // Add barcode field
            reason: reason || null,
            // Dostosuj format zaliczki do backendu
            advancePayment: advance ? advance.amount : 0,
            advancePaymentCurrency: advance ? advance.currency : 'PLN',
        };

        // Walidacja danych przed wysłaniem
        if (!transferModel.transfer_from) {
            appAlert("Błąd", "Brak danych użytkownika (transfer_from)");
            return;
        }
        if (!transferModel.transfer_to) {
            appAlert("Błąd", "Brak docelowego użytkownika (transfer_to)");
            return;
        }
        if (!transferModel.productId) {
            appAlert("Błąd", "Brak ID produktu");
            return;
        }

        try {
            const response = await tokenService.authenticatedFetch(getApiUrl('/transfer'), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(transferModel),
            });

            const responseData = await response.json();
            
            if (!response.ok) {
                // Sprawdź czy to błąd duplikatu
                if (response.status === 400 && responseData.error && responseData.error.includes("E11000 duplicate key")) {
                    appAlert(
                        "Kurtka już przeniesiona", 
                        "Ta kurtka została już wcześniej przeniesiona dzisiaj. Spróbuj jutro."
                    );
                    // Automatycznie odśwież dane
                    fetchAllRequiredData(false);
                    return;
                }
                
                // Wyświetl szczegółowy błąd z backendu
                const errorMessage = responseData.message || responseData.error || `HTTP ${response.status}: Failed to create transfer`;
                if (response.status === 409) {
                    appAlert("Nie można przepisać", errorMessage);
                    fetchAllRequiredData(false);
                    return;
                }
                appAlert("Błąd transferu", errorMessage);
                return;
            }

            // Show success message
            setSuccessMessage("Transfer został pomyślnie utworzony!");
            setSuccessModalVisible(true);

            fetchAllRequiredData(false);
            setTransferModalVisible(false);
            setDomReasonModalVisible(false);
            setMagazynReasonModalVisible(false);
            setCustomReason("");
            setSelectedReason("");
            setAdvanceAmount("");
            setSelectedCurrency("PLN");
        } catch (error) {
            appAlert("Error", "An unexpected error occurred while creating the transfer.");
        }
    };

    const handleDomReasonSelect = (reason) => {
        if (reason === 'custom') {
            // Nie zamykaj modalu, pozwól użytkownikowi wpisać powód
            return;
        }
        
        setSelectedReason(reason);
    };

    const handleCustomReasonSubmit = () => {
        if (!customReason.trim()) {
            appAlert("Error", "Proszę podać powód.");
            return;
        }
        
        setSelectedReason(customReason.trim());
    };

    const handleFinalSubmit = () => {
        if (!selectedReason) {
            appAlert("Error", "Proszę wybrać powód.");
            return;
        }

        // Sprawdź czy to custom reason i czy tekst został podany
        if (selectedReason === 'custom' && !customReason.trim()) {
            appAlert("Error", "Proszę podać powód.");
            return;
        }

        // Przygotuj dane zaliczki jeśli została wprowadzona
        let advanceData = null;
        if (advanceAmount && parseFloat(advanceAmount) > 0) {
            advanceData = {
                amount: parseFloat(advanceAmount),
                currency: selectedCurrency,
                date: today + 'T' + new Date().toISOString().split('T')[1] // Use consistent date with today variable
            };
        }

        // Użyj odpowiedniego powodu
        const finalReason = selectedReason === 'custom' ? customReason.trim() : selectedReason;

        // Znajdź użytkownika Dom
        const domUser = users.find(u => u.role && u.role.toLowerCase() === 'dom');
        if (domUser) {
            initiateTransfer(domUser.symbol, finalReason, advanceData);
        } else {
            appAlert("Error", "Nie znaleziono użytkownika Dom.");
        }
    };

    const handleMagazynFinalSubmit = () => {
        if (!selectedReason) {
            appAlert("Error", "Proszę wybrać powód.");
            return;
        }

        // Sprawdź czy to custom reason i czy tekst został podany
        if (selectedReason === 'custom' && !customReason.trim()) {
            appAlert("Error", "Proszę podać powód.");
            return;
        }

        // Użyj odpowiedniego powodu
        const finalReason = selectedReason === 'custom' ? customReason.trim() : selectedReason;

        // Przepisz do MAGAZYN
        initiateTransfer('MAGAZYN', finalReason, null);
    };

    const handlePanKazekTransfer = () => {
        setPanKazekModalVisible(true);
    };

    // Wymiana, krok 2 (25.10.2026): kurtka oddana przez klienta. Lista sprzedaży z tego punktu z 14 dni albo kod z metki;
    // serwer zapisuje ją jako przepisanie do MAGAZYNU (tylko żółta noga) - po Dobieraniu MAGAZYNU jest na jego stanie.
    // „Pomiń” = jak dawniej: oddaną kurtkę admin dopisuje do magazynu ręcznie.
    const openReturnPrompt = async (exchangeTransferId, givenLabel) => {
        setReturnCode('');
        setReturnView('main');
        setReturnPickerSearch('');
        setReturnPickerGood(null);
        setReturnCandidates([]);
        setReturnPrompt({ exchangeTransferId, givenLabel });
        setReturnLoading(true);
        try {
            const response = await tokenService.authenticatedFetch(getApiUrl('/transfer/exchange-return/candidates'));
            const data = response.ok ? await response.json() : null;
            setReturnCandidates(Array.isArray(data?.sales) ? data.sales : []);
        } catch (error) {
            Logger.error('Exchange return candidates failed:', error);
            setReturnCandidates([]);
        } finally {
            setReturnLoading(false);
        }
    };

    const finishExchange = (returnedLabel) => {
        setReturnPrompt(null);
        setSuccessMessage(returnedLabel
            ? `Wymiana została zapisana.\nOddana kurtka ${returnedLabel} pojedzie do MAGAZYNU - pojawi się w Dobieraniu dla MAGAZYNU.`
            : 'Wymiana została zapisana.\nOddanej kurtki nie wskazano - trzeba ją dopisać do magazynu ręcznie.');
        setSuccessModalVisible(true);
    };

    const saveReturnedItem = async (payload, label) => {
        if (!returnPrompt || returnSaving) return;
        setReturnSaving(true);
        try {
            const response = await tokenService.authenticatedFetch(getApiUrl('/transfer/exchange-return'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exchangeTransferId: returnPrompt.exchangeTransferId, ...payload }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                appAlert('Nie zapisano oddanej kurtki', data?.message || 'Spróbuj ponownie albo pomiń.');
                return;
            }
            finishExchange(label || `${data.fullName} ${data.size}`);
        } catch (error) {
            Logger.error('Exchange return save failed:', error);
            appAlert('Nie zapisano oddanej kurtki', 'Brak połączenia z serwerem. Spróbuj ponownie albo pomiń.');
        } finally {
            setReturnSaving(false);
        }
    };

    // Kod z metki oddanej kurtki musi być zawsze poprawny: 13 cyfr, zgodna cyfra kontrolna EAN-13 i produkt z naszej bazy
    const checkReturnCode = (rawCode) => {
        const code = String(rawCode || '').trim();
        if (!code) return { state: 'idle' };
        if (!/^\d+$/.test(code)) return { state: 'invalid', message: 'Kod z metki ma same cyfry.' };
        if (code.length !== 13) return { state: 'invalid', message: `Kod z metki ma 13 cyfr (jest ${code.length}).` };
        if (!isValidEan13(code)) return { state: 'invalid', message: 'Błędna cyfra kontrolna - sprawdź, czy kod jest dobrze przepisany.' };
        const name = getProductNameFromBarcode(code);
        if (!isKnownProductCode(code, name)) return { state: 'invalid', message: 'Nie ma takiego produktu w bazie.' };
        return { state: 'ok', code, name: String(name || '').startsWith('Nieznany kod') ? '' : name };
    };
    const typedCodeCheck = checkReturnCode(returnCode);

    const submitReturnCode = () => {
        if (typedCodeCheck.state !== 'ok') return;
        saveReturnedItem({ barcode: typedCodeCheck.code }, typedCodeCheck.name || null);
    };

    // Skan metki: ten sam warunek co przy wpisaniu; błędny kod - komunikat i skanujemy dalej
    const handleReturnScan = ({ data }) => {
        const check = checkReturnCode(data);
        if (check.state !== 'ok') {
            appAlert('Nieprawidłowa metka', check.message || 'Nie udało się odczytać kodu.');
            return;
        }
        setReturnView('main');
        saveReturnedItem({ barcode: check.code }, check.name || null);
    };

    // Wybór z bazy produktów: cała baza (nie tylko sprzedaże); kurtka wymaga rozmiaru, kod = model + kolor + rozmiar
    const returnPickerResults = useMemo(() => {
        const words = returnPickerSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return (goodsList || [])
            .filter((good) => good?.fullName && good?.code)
            .filter((good) => words.every((word) => `${good.fullName} ${good.category || ''}`.toLowerCase().includes(word)))
            .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), 'pl'))
            .slice(0, 60);
    }, [goodsList, returnPickerSearch]);
    const chooseReturnPickerGood = (good) => {
        if (good.category === 'Kurtki kożuchy futra') {
            setReturnPickerGood(good);
            return;
        }
        saveReturnedItem({ barcode: String(good.code) }, good.fullName);
    };

    const formatSaleDay = (value) => {
        const date = value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime())
            ? date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
            : '';
    };

    const handleExchange = async (toSymbol) => {
        if (!selectedItem) {
            appAlert("Error", "No item selected for exchange.");
            return;
        }

        if (!user || !user.symbol) {
            appAlert("Błąd", "Brak danych zalogowanego użytkownika");
            return;
        }

        const exchangeData = {
            productId: selectedItem.id,
            fullName: selectedItem.fullName,
            size: selectedItem.size,
            price: selectedItem.price,
            barcode: selectedItem.barcode,
            date: today + 'T' + new Date().toISOString().split('T')[1],
            dateString: today,
            from: user.symbol,
            to: toSymbol,
            symbol: user.symbol
        };

        // Również zapisz jako transfer (aby pojawił się w aplikacji webowej jako niebieski element)
        const transferData = {
            fullName: selectedItem.fullName,
            size: selectedItem.size,
            date: today + 'T' + new Date().toISOString().split('T')[1],
            dateString: today,
            transfer_from: user.symbol,
            transfer_to: 'Wymiana',
            productId: selectedItem.id,
            barcode: selectedItem.barcode || null, // Add barcode field
            reason: `Wymiana - ${toSymbol}`, // Zapisz punkt wymiany w reason
            advancePayment: 0,
            advancePaymentCurrency: 'PLN',
        };

        try {
            // Zapisz wymianę
            const exchangeResponse = await tokenService.authenticatedFetch(getApiUrl('/exchange'), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(exchangeData),
            });

            if (!exchangeResponse.ok) {
                const errorData = await exchangeResponse.json();
                Logger.error('Exchange creation failed:', errorData);
                appAlert("Błąd", errorData.message || "Nie udało się zapisać wymiany");
                return;
            }

            const exchangeResult = await exchangeResponse.json();

            // Zapisz jako transfer (dla aplikacji webowej)
            const transferResponse = await tokenService.authenticatedFetch(getApiUrl('/transfer'), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(transferData),
            });

            if (!transferResponse.ok) {
                const transferError = await transferResponse.json();
                Logger.error('Transfer creation failed:', transferError);
                // Jeśli transfer się nie powiedzie, usuń wymianę
                if (exchangeResult.data && exchangeResult.data._id) {
                    await tokenService.authenticatedFetch(getApiUrl(`/exchange/${exchangeResult.data._id}`), {
                        method: "DELETE",
                    });
                }
                appAlert("Błąd", transferError.message || "Nie udało się zapisać transferu");
                return;
            }

            const transferResult = await transferResponse.json();

            setModalVisible(false);
            setExchangeModalVisible(false);

            // Krok 2: którą kurtkę klient oddaje - pojedzie do MAGAZYNU (sukces pokazujemy po tym kroku)
            openReturnPrompt(transferResult._id, `${selectedItem.fullName} ${selectedItem.size}`);

            // Refresh data to update UI
            await fetchAllRequiredData(false);
        } catch (error) {
            Logger.error('Unexpected error during exchange:', error);
            appAlert("Error", "Wystąpił nieoczekiwany błąd podczas zapisywania wymiany.");
        }
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

        const panKazekData = {
            productId: selectedItem.id,
            fullName: selectedItem.fullName,
            size: selectedItem.size,
            price: selectedItem.price,
            barcode: selectedItem.barcode,
            date: today + 'T' + new Date().toISOString().split('T')[1],
            dateString: today,
            addedBy: user.symbol,
            symbol: user.symbol
        };

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

            fetchAllRequiredData(false);
            setModalVisible(false);
            setPanKazekModalVisible(false);
        } catch (error) {
            appAlert("Error", "Wystąpił nieoczekiwany błąd podczas dodawania produktu do Pana Kazka.");
        }
    };

    const handleRetry = () => {
        setShowErrorModal(false);
        fetchAllRequiredData(false); // false = nie jest to refresh action
    };

    const handleCloseError = () => {
        setShowErrorModal(false);
    };

    // Show AuthFix for debugging
    if (false) { // Set to false to hide
        return <AuthFix />;
    }

    return (
        <>
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <View style={styles.spinnerContainer}>
                        <Animated.View
                            style={[
                                styles.customSpinner,
                                {
                                    transform: [{
                                        rotate: spinnerAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ['0deg', '360deg'],
                                        }),
                                    }],
                                },
                            ]}
                        />
                    </View>
                    <Text style={styles.loadingText}>Pobieranie danych z backendu...</Text>
                    <View style={styles.loadingDots}>
                        <Animated.View 
                            style={[
                                styles.dot, 
                                {
                                    opacity: dot1Anim,
                                    transform: [{ 
                                        scale: dot1Anim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0.8, 1.2],
                                        }) 
                                    }],
                                }
                            ]} 
                        />
                        <Animated.View 
                            style={[
                                styles.dot, 
                                {
                                    opacity: dot2Anim,
                                    transform: [{ 
                                        scale: dot2Anim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0.8, 1.2],
                                        }) 
                                    }],
                                }
                            ]} 
                        />
                        <Animated.View 
                            style={[
                                styles.dot, 
                                {
                                    opacity: dot3Anim,
                                    transform: [{ 
                                        scale: dot3Anim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0.8, 1.2],
                                        }) 
                                    }],
                                }
                            ]} 
                        />
                    </View>
                </View>
            ) : (
                <View style={styles.container}>
                    <FlatList alwaysBounceVertical
                        testID="writeoff-flatlist"
                        ListHeaderComponent={
                            <ScreenHeader
                                icon="layers"
                                title="Stan"
                                subtitle={`Produktów: ${filteredData.length} · ${user?.email || "Nieznany użytkownik"}`}
                            />
                        }
                        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: Math.max(120, insets.bottom + 120) }}
                        data={[...filteredData, ...processedTodayRows]}
                        keyExtractor={(item) => item.id}
                        onRefresh={() => fetchAllRequiredData(true)} // true = to jest refresh action
                        refreshing={isRefreshing} // Używamy isRefreshing zamiast isLoading
                        renderItem={({ item, index }) => {
                            if (item.processedTransfer) {
                                return (
                                    <View testID={`writeoff-processed-${item.processedTransfer._id}`} style={[look.itemCard, { opacity: 0.45 }]}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={look.itemCardText} numberOfLines={1}>
                                                {index + 1}. {item.fullName}  {item.size}
                                            </Text>
                                            <Text style={styles.transferStatusText} numberOfLines={1}>{transferLabel(item.processedTransfer)}</Text>
                                            <Text style={styles.processedLabel} numberOfLines={1}>Przetworzone</Text>
                                        </View>
                                    </View>
                                );
                            }
                            const transfer = todayTransferOf(item);
                            const sold = !transfer && soldItemIds.has(item.id);
                            return (
                                <View
                                    testID={`writeoff-item-${item.id}`}
                                    style={[look.itemCard, (transfer || sold) && { opacity: 0.45 }]}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={look.itemCardText} numberOfLines={1}>
                                            {index + 1}. {item.fullName}  {item.size}
                                        </Text>
                                        {transfer && (
                                            <Text style={styles.transferStatusText} numberOfLines={1}>{transferLabel(transfer)}</Text>
                                        )}
                                        {sold && (
                                            <Text testID={`writeoff-sold-${item.id}`} style={styles.transferStatusText} numberOfLines={1}>Sprzedana - czeka na Dobieranie</Text>
                                        )}
                                    </View>
                                    <TouchableOpacity
                                        testID={`writeoff-dots-${item.id}`}
                                        onPress={() => openModal(item)}
                                        style={look.dotsButton}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <Text style={look.dotsText}>⋮</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        }}
                    />
                </View>
            )}
            <Modal
                visible={modalVisible}
                transparent
                animationType="slide"
                onRequestClose={closeModal}
            >
                <View style={look.modalOverlay}>
                    <View style={look.modalContent}>
                        <ModalHeader icon="ellipsis-horizontal-circle" color="#0D6EFD" title="Opcje" />
                        {selectedItem && todayTransferOf(selectedItem) ? (
                            todayTransferOf(selectedItem).transfer_to === 'SOLD' ? (
                                <Text style={look.modalMessage}>Ten produkt został dziś sprzedany. Anulowanie sprzedaży odbywa się w zakładce Sprzedaż.</Text>
                            ) : (
                                <>
                                    <Text style={look.modalMessage}>{transferLabel(todayTransferOf(selectedItem))}</Text>
                                    {isTodayTransfer(todayTransferOf(selectedItem)) ? (
                                        <ActionItem
                                            testID="cancel-transfer"
                                            icon="arrow-undo"
                                            color="#EF4444"
                                            label={todayTransferOf(selectedItem).transfer_to === 'Wymiana' ? 'Anuluj wymianę' : 'Anuluj przepisanie'}
                                            onPress={() => cancelTransfer(todayTransferOf(selectedItem))}
                                        />
                                    ) : (
                                        // z wcześniejszego dnia anulować może tylko administrator w panelu (serwer: tylko tego samego dnia)
                                        <Text testID="transfer-previous-day" style={look.modalMessage}>Przepisanie z wcześniejszego dnia czeka na Dobieranie - anulować może tylko administrator w panelu.</Text>
                                    )}
                                </>
                            )
                        ) : selectedItem && soldItemIds.has(selectedItem.id) ? (
                            <Text testID="writeoff-sold-message" style={look.modalMessage}>Ta kurtka została już sprzedana - czeka na odpisanie w Dobieraniu. Nie można jej przepisać.</Text>
                        ) : selectedItem ? (
                            <>
                                <ActionItem
                                    icon="swap-horizontal"
                                    label="Przepisz do"
                                    onPress={() => {
                                        setModalVisible(false);
                                        setTransferModalVisible(true);
                                    }}
                                />
                                {(user?.symbol === 'most' || user?.email === 'most@wp.pl') && (
                                    <ActionItem
                                        icon="person"
                                        color="#10B981"
                                        label="Od Pana Kazka"
                                        onPress={() => handlePanKazekTransfer()}
                                    />
                                )}
                                <ActionItem
                                    icon="repeat"
                                    color="#FF9800"
                                    label="Wymiana"
                                    onPress={() => {
                                        setModalVisible(false);
                                        setExchangeModalVisible(true);
                                    }}
                                />
                            </>
                        ) : (
                            <Text style={look.modalMessage}>Brak wybranego produktu</Text>
                        )}
                        <TouchableOpacity
                            style={[look.neutralButton, { flex: 0, marginTop: 8 }]}
                            onPress={closeModal}
                        >
                            <Text style={look.neutralButtonText}>Anuluj</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
            <Modal
                visible={transferModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setTransferModalVisible(false)}
            >
                <View style={look.modalOverlay}>
                    <View style={look.modalContent}>
                        <ModalHeader icon="swap-horizontal" color="#0D6EFD" title="Wybierz użytkownika" />
                        {/* MAGAZYN option at the top */}
                        <ActionItem
                            testID="transfer-target-MAGAZYN"
                            icon="archive"
                            color="#F59E0B"
                            label="MAGAZYN"
                            note={stockNote('MAGAZYN')}
                            noteColor={stockNoteColor('MAGAZYN')}
                            onPress={() => confirmIfMissingAtTarget('MAGAZYN', () => {
                                setTransferModalVisible(false);
                                setMagazynReasonModalVisible(true);
                            })}
                        />
                        {users.map((item) => (
                            <ActionItem
                                key={item._id}
                                testID={`transfer-target-${item.symbol}`}
                                icon={item.role && item.role.toLowerCase() === 'dom' ? 'home-outline' : 'storefront-outline'}
                                label={pointDisplayName(item)}
                                note={stockNote(item.symbol)}
                                noteColor={stockNoteColor(item.symbol)}
                                onPress={() => confirmIfMissingAtTarget(item.symbol, () => {
                                    if (item.role && item.role.toLowerCase() === 'dom') {
                                        // Dla użytkownika Dom pokaż modal powodów
                                        setTransferModalVisible(false);
                                        setDomReasonModalVisible(true);
                                    } else {
                                        // Dla innych użytkowników normalne przepisywanie
                                        initiateTransfer(item.symbol);
                                    }
                                })}
                            />
                        ))}
                        <TouchableOpacity
                            style={[look.neutralButton, { flex: 0, marginTop: 8 }]}
                            onPress={() => setTransferModalVisible(false)}
                        >
                            <Text style={look.neutralButtonText}>Zamknij</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modal błędu */}
            <Modal
                visible={showErrorModal}
                transparent
                animationType="slide"
                onRequestClose={handleCloseError}
            >
                <View style={look.modalOverlay}>
                    <View style={look.modalContent}>
                        <ModalHeader icon="cloud-offline" color="#DC3545" title="Błąd połączenia" />
                        <Text style={look.modalMessage}>{errorMessage}</Text>
                        <TouchableOpacity
                            style={[look.primaryButton, { flex: 0 }]}
                            onPress={handleRetry}
                        >
                            <Text style={look.buttonText}>Spróbuj ponownie</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[look.neutralButton, { flex: 0, marginTop: 8 }]}
                            onPress={handleCloseError}
                        >
                            <Text style={look.neutralButtonText}>Zamknij</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modal powodów przepisania do domu */}
            <Modal
                visible={domReasonModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => {
                    setDomReasonModalVisible(false);
                    setCustomReason("");
                    setSelectedReason("");
                    setAdvanceAmount("");
                    setSelectedCurrency("PLN");
                }}
            >
                <KeyboardSafeOverlay>
                <View style={look.modalOverlay}>
                    <View style={look.modalContent}>
                        <ModalHeader icon="home" color="#0D6EFD" title="Powód przepisania do domu" />
                        
                        {/* Radio buttons dla powodów */}
                        <View style={{ marginBottom: 8 }}>
                            <OptionCard
                                icon="cut-outline"
                                label="Skracanie rękawów"
                                selected={selectedReason === 'skracanie rękawów'}
                                onPress={() => setSelectedReason('skracanie rękawów')}
                            />
                            
                            <OptionCard
                                icon="construct-outline"
                                label="Przeróbka"
                                selected={selectedReason === 'przeróbka'}
                                onPress={() => setSelectedReason('przeróbka')}
                            />
                            
                            <OptionCard
                                icon="paper-plane-outline"
                                label="Wysyłka"
                                selected={selectedReason === 'wysyłka'}
                                onPress={() => setSelectedReason('wysyłka')}
                            />
                            
                            <OptionCard
                                icon="create-outline"
                                label="Inny powód"
                                selected={selectedReason === 'custom'}
                                onPress={() => {
                                    setSelectedReason('custom');
                                    setCustomReason(''); // Wyczyść poprzedni tekst
                                }}
                            />
                        </View>
                        
                        {/* Pole tekstowe dla niestandardowego powodu */}
                        {selectedReason === 'custom' && (
                            <View style={{ marginBottom: 8 }}>
                                <TextInput
                                    style={look.formInput}
                                    placeholder="Wpisz powód (max 12 znaków)..."
                                    placeholderTextColor={tc('muted', "#999")}
                                    value={customReason}
                                    onChangeText={(text) => {
                                        // Ograniczenie do 12 znaków
                                        if (text.length <= 12) {
                                            setCustomReason(text);
                                        }
                                    }}
                                    maxLength={12}
                                    multiline={false}
                                    numberOfLines={1}
                                />
                                <Text style={styles.characterCount}>
                                    {customReason.length}/12
                                </Text>
                            </View>
                        )}
                        
                        {/* Sekcja zaliczki */}
                        <View style={{ marginTop: 8, marginBottom: 12 }}>
                            <Text style={look.formLabel}>Zaliczka (opcjonalnie)</Text>
                            <View style={styles.advanceRow}>
                                <TextInput
                                    style={[look.formInput, { flex: 1, marginRight: 10 }]}
                                    placeholder="0.00"
                                    placeholderTextColor={tc('muted', "#ccc")}
                                    value={advanceAmount}
                                    onChangeText={setAdvanceAmount}
                                    keyboardType="numeric"
                                />
                                <TouchableOpacity
                                    style={[look.selectField, { minWidth: 100 }]}
                                    onPress={() => setShowCurrencyModal(true)}
                                >
                                    <Text style={look.selectFieldText}>{selectedCurrency}</Text>
                                    <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
                                </TouchableOpacity>
                            </View>
                        </View>
                        
                        {/* Przyciski akcji */}
                        <View style={look.buttonRow}>
                            <TouchableOpacity
                                style={[look.primaryButton, { backgroundColor: '#10B981' }, !selectedReason && look.disabled]}
                                onPress={handleFinalSubmit}
                                disabled={!selectedReason}
                            >
                                <Text style={look.buttonText}>Zatwierdź</Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                                style={look.neutralButton}
                                onPress={() => {
                                    setDomReasonModalVisible(false);
                                    setCustomReason("");
                                    setSelectedReason("");
                                    setAdvanceAmount("");
                                    setSelectedCurrency("PLN");
                                }}
                            >
                                <Text style={look.neutralButtonText}>Anuluj</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
                </KeyboardSafeOverlay>
            </Modal>

            {/* Modal powodów przepisania do MAGAZYN */}
            <Modal
                visible={magazynReasonModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => {
                    setMagazynReasonModalVisible(false);
                    setCustomReason("");
                    setSelectedReason("");
                }}
            >
                <KeyboardSafeOverlay>
                <View style={look.modalOverlay}>
                    <View style={look.modalContent}>
                        <ModalHeader icon="archive" color="#F59E0B" title="Przepisać kurtkę do magazynu?" />
                        
                        {/* Radio buttons dla powodów */}
                        <View style={{ marginBottom: 8 }}>
                            <OptionCard
                                icon="construct-outline"
                                label="Przeróbka"
                                selected={selectedReason === 'przeróbka'}
                                onPress={() => setSelectedReason('przeróbka')}
                            />
                            
                            <OptionCard
                                icon="paper-plane-outline"
                                label="Wysyłka"
                                selected={selectedReason === 'wysyłka'}
                                onPress={() => setSelectedReason('wysyłka')}
                            />
                            
                            <OptionCard
                                icon="create-outline"
                                label="Inny powód"
                                selected={selectedReason === 'custom'}
                                onPress={() => {
                                    setSelectedReason('custom');
                                    setCustomReason(''); // Wyczyść poprzedni tekst
                                }}
                            />
                        </View>
                        
                        {/* Pole tekstowe dla niestandardowego powodu */}
                        {selectedReason === 'custom' && (
                            <View style={{ marginBottom: 8 }}>
                                <TextInput
                                    style={look.formInput}
                                    placeholder="Wpisz powód (max 12 znaków)..."
                                    placeholderTextColor={tc('muted', "#999")}
                                    value={customReason}
                                    onChangeText={(text) => {
                                        // Ograniczenie do 12 znaków
                                        if (text.length <= 12) {
                                            setCustomReason(text);
                                        }
                                    }}
                                    maxLength={12}
                                    multiline={false}
                                    numberOfLines={1}
                                />
                                <Text style={styles.characterCount}>
                                    {customReason.length}/12
                                </Text>
                            </View>
                        )}
                        
                        {/* Przyciski akcji */}
                        <View style={look.buttonRow}>
                            <TouchableOpacity
                                style={[look.primaryButton, { backgroundColor: '#10B981' }, !selectedReason && look.disabled]}
                                onPress={handleMagazynFinalSubmit}
                                disabled={!selectedReason}
                            >
                                <Text style={look.buttonText}>Zatwierdź</Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                                style={look.neutralButton}
                                onPress={() => {
                                    setMagazynReasonModalVisible(false);
                                    setCustomReason("");
                                    setSelectedReason("");
                                }}
                            >
                                <Text style={look.neutralButtonText}>Anuluj</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
                </KeyboardSafeOverlay>
            </Modal>

            {/* Modal wyboru waluty */}
            <Modal
                visible={showCurrencyModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowCurrencyModal(false)}
            >
                <View style={look.modalOverlay}>
                    <View style={look.modalContent}>
                        <ModalHeader icon="cash" color="#10B981" title="Wybierz walutę" />
                        {['PLN', 'EUR', 'USD', 'CZK'].map((currency) => (
                            <OptionCard
                                key={currency}
                                icon="cash-outline"
                                color="#10B981"
                                label={currency}
                                selected={selectedCurrency === currency}
                                onPress={() => {
                                    setSelectedCurrency(currency);
                                    setShowCurrencyModal(false);
                                }}
                            />
                        ))}
                        <TouchableOpacity
                            style={[look.neutralButton, { flex: 0, marginTop: 8 }]}
                            onPress={() => setShowCurrencyModal(false)}
                        >
                            <Text style={look.neutralButtonText}>Anuluj</Text>
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
                <View style={look.modalOverlay}>
                    <View style={look.modalContent}>
                        <ModalHeader icon="checkmark-circle" color="#10B981" title="Gotowe" />
                        <Text style={look.modalMessage}>
                            {successMessage}
                        </Text>
                        <TouchableOpacity
                            style={[look.primaryButton, { flex: 0 }]}
                            onPress={() => setSuccessModalVisible(false)}
                        >
                            <Text style={look.buttonText}>OK</Text>
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
                <View style={look.modalOverlay}>
                    <View style={look.modalContent}>
                        <ModalHeader icon="help-circle" color="#10B981" title="Potwierdzenie" />
                        <Text style={look.modalMessage}>
                            Czy chcesz dodać tę kurtkę do listy "Od Pana Kazka"?
                        </Text>
                        {selectedItem && (
                            <View style={{ marginVertical: 15 }}>
                                <Text style={{ color: tc('text', '#fff'), fontSize: 16, textAlign: 'center' }}>
                                    {selectedItem.fullName} {selectedItem.size}
                                </Text>
                                <Text style={{ color: tc('text', '#fff'), fontSize: 14, textAlign: 'center', marginTop: 5 }}>
                                    Cena: {selectedItem.price} PLN
                                </Text>
                            </View>
                        )}
                        <TouchableOpacity
                            style={[look.primaryButton, { flex: 0, backgroundColor: '#10B981' }]}
                            onPress={confirmPanKazekTransfer}
                        >
                            <Text style={look.buttonText}>Tak, dodaj</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[look.neutralButton, { flex: 0, marginTop: 8 }]}
                            onPress={() => setPanKazekModalVisible(false)}
                        >
                            <Text style={look.neutralButtonText}>Anuluj</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Exchange Modal - wybór stanowiska */}
            <Modal
                visible={exchangeModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setExchangeModalVisible(false)}
            >
                <View style={look.modalOverlay}>
                    <View style={look.modalContent}>
                        <ModalHeader icon="repeat" color="#FF9800" title="Wybierz stanowisko wymiany" />
                        {selectedItem && (
                            <View style={{ marginVertical: 10 }}>
                                <Text style={{ color: tc('text', '#fff'), fontSize: 14, textAlign: 'center' }}>
                                    {selectedItem.fullName} {selectedItem.size}
                                </Text>
                            </View>
                        )}
                        {exchangeUsers.map((item) => (
                            <ActionItem
                                key={item._id}
                                icon="storefront-outline"
                                color="#FF9800"
                                label={item.symbol}
                                onPress={() => handleExchange(item.symbol)}
                            />
                        ))}
                        <TouchableOpacity
                            style={[look.neutralButton, { flex: 0, marginTop: 8 }]}
                            onPress={() => setExchangeModalVisible(false)}
                        >
                            <Text style={look.neutralButtonText}>Anuluj</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Wymiana, krok 2: którą kurtkę klient oddaje (jedzie do MAGAZYNU).
                Trzy drogi: sprzedaż z listy, kod z metki (wpisany - sprawdzany na bieżąco - albo zeskanowany), wybór z bazy produktów */}
            <Modal
                visible={!!returnPrompt}
                transparent={returnView !== 'scan'}
                animationType="slide"
                onRequestClose={() => (returnView === 'main' ? finishExchange(null) : setReturnView('main'))}
            >
                {returnView === 'scan' ? (() => { const ScanCamera = loadScanCamera(); return (
                    <View style={styles.returnScanContainer}>
                        <ScanCamera
                            enabled={!returnSaving}
                            onScanned={handleReturnScan}
                            resolveName={(code) => (checkReturnCode(code).state === 'ok' ? checkReturnCode(code).name : null)}
                            hint="Zeskanuj metkę oddanej kurtki"
                        >
                            <TouchableOpacity testID="return-scan-close" style={styles.returnScanClose} onPress={() => setReturnView('main')}>
                                <Ionicons name="close" size={26} color="#fff" />
                            </TouchableOpacity>
                        </ScanCamera>
                    </View>
                ); })() : (
                <KeyboardSafeOverlay>
                <View style={look.modalOverlay}>
                    <View style={look.modalContent}>
                        {returnView === 'picker' ? (
                            <>
                                <ModalHeader icon="search" color="#FF9800" title={returnPickerGood ? 'Rozmiar oddanej kurtki' : 'Wybierz z bazy produktów'} />
                                {returnPickerGood ? (
                                    <>
                                        <Text style={styles.returnGiven}>{returnPickerGood.fullName}</Text>
                                        <FlatList
                                            data={pickerSizes}
                                            keyExtractor={(size) => String(size._id || size.Roz_Kod)}
                                            style={{ maxHeight: 320, width: '100%' }}
                                            renderItem={({ item: size }) => (
                                                <ActionItem
                                                    testID={`return-size-${size.Roz_Opis}`}
                                                    icon="resize-outline"
                                                    color="#FF9800"
                                                    label={size.Roz_Opis}
                                                    disabled={returnSaving}
                                                    onPress={() => saveReturnedItem(
                                                        { barcode: jacketCodeForSize(returnPickerGood.code, size.Roz_Kod) },
                                                        `${returnPickerGood.fullName} ${size.Roz_Opis}`
                                                    )}
                                                />
                                            )}
                                        />
                                        <TouchableOpacity style={[look.neutralButton, { flex: 0, marginTop: 10 }]} onPress={() => setReturnPickerGood(null)}>
                                            <Text style={look.neutralButtonText}>Wróć do listy produktów</Text>
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <>
                                        <TextInput
                                            testID="return-picker-search"
                                            style={[styles.customReasonInput, styles.returnSearchInput]}
                                            value={returnPickerSearch}
                                            onChangeText={setReturnPickerSearch}
                                            placeholder="Szukaj: nazwa, kolor, kategoria"
                                            placeholderTextColor={tc('muted', '#94A3B8')}
                                            autoFocus
                                        />
                                        <FlatList
                                            data={returnPickerResults}
                                            keyExtractor={(good) => String(good._id || good.code)}
                                            style={{ maxHeight: 320, width: '100%' }}
                                            keyboardShouldPersistTaps="handled"
                                            ListEmptyComponent={(
                                                <Text style={styles.returnHint}>
                                                    {goodsList.length === 0 ? 'Wczytuję bazę produktów…' : 'Nic nie pasuje - zmień wyszukiwanie.'}
                                                </Text>
                                            )}
                                            renderItem={({ item: good }) => (
                                                <ActionItem
                                                    testID={`return-good-${good.code}`}
                                                    icon="pricetag-outline"
                                                    color="#FF9800"
                                                    label={good.fullName}
                                                    note={good.category || null}
                                                    disabled={returnSaving}
                                                    onPress={() => chooseReturnPickerGood(good)}
                                                />
                                            )}
                                        />
                                    </>
                                )}
                                <TouchableOpacity
                                    testID="return-picker-back"
                                    style={[look.neutralButton, { flex: 0, marginTop: 8 }]}
                                    onPress={() => { setReturnPickerGood(null); setReturnView('main'); }}
                                >
                                    <Text style={look.neutralButtonText}>Anuluj</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <ModalHeader icon="repeat" color="#FF9800" title="Którą kurtkę klient oddaje?" />
                                <Text style={styles.returnGiven}>Wydajesz: {returnPrompt?.givenLabel}</Text>
                                <Text style={styles.returnHint}>Oddana kurtka pojedzie do MAGAZYNU.</Text>

                                {/* Przy wpisywaniu kodu lista i przyciski się chowają - okienko jest niższe i mieści się nad klawiaturą */}
                                {!returnCodeFocused && (<>
                                <Text style={styles.returnSectionTitle}>Sprzedaże w tym punkcie z 14 dni:</Text>
                                <View style={styles.returnList}>
                                    {returnLoading ? (
                                        <Text style={styles.returnHint}>Wczytuję sprzedaże…</Text>
                                    ) : returnCandidates.length === 0 ? (
                                        <Text style={styles.returnHint}>Brak sprzedaży z ostatnich 14 dni - zeskanuj metkę, wpisz kod albo wybierz z bazy.</Text>
                                    ) : (
                                        <FlatList
                                            data={returnCandidates}
                                            keyExtractor={(sale) => String(sale._id)}
                                            style={{ maxHeight: 200 }}
                                            renderItem={({ item: sale }) => (
                                                <ActionItem
                                                    testID={`return-sale-${sale._id}`}
                                                    icon="return-down-back-outline"
                                                    color="#FF9800"
                                                    label={`${sale.fullName} ${sale.size}`}
                                                    note={[formatSaleDay(sale.timestamp), sale.priceLabel, sale.from ? `od ${sale.from}` : ''].filter(Boolean).join(' · ')}
                                                    disabled={returnSaving}
                                                    onPress={() => saveReturnedItem({ saleId: sale._id }, `${sale.fullName} ${sale.size}`)}
                                                />
                                            )}
                                        />
                                    )}
                                </View>

                                <View style={styles.returnActionsRow}>
                                    <TouchableOpacity testID="return-open-scan" style={[look.primaryButton, styles.returnActionButton]} onPress={() => setReturnView('scan')}>
                                        <Ionicons name="scan-outline" size={18} color="#fff" />
                                        <Text style={look.buttonText}>Skanuj metkę</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity testID="return-open-picker" style={[look.primaryButton, styles.returnActionButton, { backgroundColor: '#FF9800' }]} onPress={() => setReturnView('picker')}>
                                        <Ionicons name="search-outline" size={18} color="#fff" />
                                        <Text style={look.buttonText}>Z bazy</Text>
                                    </TouchableOpacity>
                                </View>
                                </>)}

                                <Text style={styles.returnSectionTitle}>albo wpisz kod z metki:</Text>
                                {/* Wynik sprawdzenia NAD polem - pod polem przykrywała go klawiatura */}
                                {typedCodeCheck.state !== 'idle' && (
                                    <Text
                                        testID="return-code-check"
                                        style={[styles.returnCodeCheck, { color: typedCodeCheck.state === 'ok' ? '#16A34A' : '#EF4444' }]}
                                    >
                                        {typedCodeCheck.state === 'ok' ? `✓ ${typedCodeCheck.name || 'Kod poprawny'}` : typedCodeCheck.message}
                                    </Text>
                                )}
                                <View style={styles.returnCodeRow}>
                                    <TextInput
                                        testID="return-code-input"
                                        style={[styles.customReasonInput, styles.returnCodeInput]}
                                        value={returnCode}
                                        onChangeText={(text) => setReturnCode(text.replace(/\s/g, ''))}
                                        placeholder="13 cyfr z metki"
                                        placeholderTextColor={tc('muted', '#94A3B8')}
                                        keyboardType="number-pad"
                                        maxLength={13}
                                        returnKeyType="done"
                                        onSubmitEditing={submitReturnCode}
                                        onFocus={() => setReturnCodeFocused(true)}
                                        onBlur={() => setReturnCodeFocused(false)}
                                    />
                                    <TouchableOpacity
                                        testID="return-code-save"
                                        style={[look.primaryButton, styles.returnCodeButton, (typedCodeCheck.state !== 'ok' || returnSaving) && look.disabled]}
                                        disabled={typedCodeCheck.state !== 'ok' || returnSaving}
                                        onPress={submitReturnCode}
                                    >
                                        <Text style={look.buttonText}>Zapisz</Text>
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity
                                    testID="return-skip"
                                    style={[look.neutralButton, { flex: 0, marginTop: 10 }]}
                                    onPress={() => finishExchange(null)}
                                >
                                    <Text style={look.neutralButtonText}>Pomiń - dopiszę ręcznie</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
                </KeyboardSafeOverlay>
                )}
            </Modal>
        </>
    );
};

const styles = createThemedStyles(() => StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: tc('bg', 'black'), // Ciemne tło
    },
    spinnerContainer: {
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        width: 80,
        height: 80,
    },
    customSpinner: {
        position: 'absolute',
        width: 60,
        height: 60,
        borderWidth: 3,
        borderColor: 'transparent',
        borderTopColor: '#0066cc',
        borderRightColor: '#0066cc',
        borderRadius: 30,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 18,
        color: tc('text', '#ffffff'), // Biały tekst na ciemnym tle
        textAlign: 'center',
        fontWeight: '500',
    },
    loadingDots: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: 'rgb(13, 110, 253)',
        marginHorizontal: 6,
    },
    // Updated modal styles to match salesperson modal from home.jsx
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: tc('bg', '#000000'), // True black like main app background
        borderRadius: 15,
        padding: 25,
        width: '90%',
        maxHeight: '80%',
        borderWidth: 2,
        borderColor: '#0d6efd', // Main app color
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: tc('text', '#ffffff'),
        textAlign: 'center',
        marginBottom: 20,
    },
    modalMessage: {
        fontSize: 14,
        color: tc('text', '#fff'),
        textAlign: 'center',
        marginBottom: 16,
        paddingHorizontal: 8,
    },
    optionButton: {
        backgroundColor: '#0d6efd', // Main app color
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 10,
        marginVertical: 8,
        borderWidth: 1,
        borderColor: '#ffffff',
        alignItems: 'center',
        width: '100%',
    },
    optionText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    transferStatusText: {
        color: '#F59E0B',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
    },
    processedLabel: { // „Przetworzone” pod sztuką odpisaną w Dobieraniu
        color: '#EF4444',
        fontSize: 11,
        fontWeight: '600',
        marginTop: 2,
    },
    deleteButton: {
        backgroundColor: '#007bff', // Blue color to distinguish from close button
    },
    magazynButton: {
        backgroundColor: '#ffc107', // Yellow background for MAGAZYN
        borderWidth: 2,
        borderColor: '#fff',
    },
    closeButton: {
        backgroundColor: '#dc3545', // Red color for cancel/close
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 10,
        marginVertical: 8,
        borderWidth: 1,
        borderColor: '#ffffff',
        alignItems: 'center',
        width: '100%',
        marginTop: 20,
    },
    closeText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    container: {
        flex: 1,
        backgroundColor: tc('bg', "black"),
        paddingHorizontal: 0,
    },
    text: {
        color: tc('text', "white"),
        fontSize: 18,
        fontWeight: "bold",
        marginBottom: 10,
        textAlign: "center",
    },
    productCountText: {
        color: "white",
        fontSize: 13,
        fontWeight: "bold",
        marginBottom: 5,
        textAlign: "center",
        marginTop: 10,
        backgroundColor: "#0d6efd",
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 8,
        alignSelf: "center",
    },
    headerText: {
        color: tc('text', "white"),
        fontSize: 13,
        fontWeight: "bold",
        marginBottom: 10,
        textAlign: "center",
        marginTop: 20,
    },
    item: {
        backgroundColor: "#0d6efd",
        padding: 3, // Zmniejszono z 5 na 3
        borderRadius: 5,
        width: "100%",
        marginVertical: 3, // Zmniejszono z 5 na 3
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    itemTextLeft: {
        color: "white",
        fontSize: 12, // Delikatnie zwiększono z 11 na 12
        fontWeight: "bold", // Standardized font weight
        textAlign: "left",
        flex: 1,
    },
    dotsButton: {
        padding: 5,
    },
    dotsText: {
        color: tc('text', "white"),
        fontSize: 20, // Increased font size for the three dots
    },
    customReasonContainer: {
        width: '90%',
        marginVertical: 10,
    },
    // Wymiana, krok 2: okienko oddanej kurtki
    returnGiven: {
        color: tc('text', '#fff'),
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
        marginTop: 6,
    },
    returnHint: {
        color: tc('muted', '#94A3B8'),
        fontSize: 13,
        textAlign: 'center',
        marginVertical: 4,
    },
    returnSectionTitle: {
        color: tc('text', '#fff'),
        fontSize: 13,
        fontWeight: '600',
        marginTop: 12,
        marginBottom: 6,
    },
    returnList: {
        width: '100%',
    },
    returnCodeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: '100%',
    },
    returnCodeInput: {
        flex: 1,
        marginBottom: 0,
        borderColor: tc('border', '#334155'),
    },
    returnCodeButton: {
        flex: 0,
        paddingHorizontal: 16,
    },
    returnCodeCheck: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 6,
        alignSelf: 'flex-start',
    },
    returnActionsRow: {
        flexDirection: 'row',
        gap: 8,
        width: '100%',
        marginTop: 12,
    },
    returnActionButton: {
        flex: 1,
        flexDirection: 'row',
        gap: 6,
    },
    returnSearchInput: {
        width: '100%',
        borderColor: tc('border', '#334155'),
        marginBottom: 8,
    },
    returnScanContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    returnScanClose: {
        position: 'absolute',
        top: 48,
        right: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    customReasonInput: {
        backgroundColor: tc('surface', 'black'),
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        color: tc('text', 'white'),
        textAlignVertical: 'top',
        marginBottom: 5,
        minHeight: 45,
        borderWidth: 1,
        borderColor: 'white',
    },
    characterCount: {
        color: tc('muted', '#999'),
        fontSize: 12,
        textAlign: 'right',
        marginBottom: 10,
    },
    submitButton: {
        backgroundColor: '#28a745',
    },
    disabledButton: {
        backgroundColor: '#6c757d',
        opacity: 0.6,
    },
    radioContainer: {
        width: '100%',
        marginVertical: 15,
    },
    radioOption: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 8,
        paddingHorizontal: 10,
    },
    radioButton: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#0d6efd',
        marginRight: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioButtonSelected: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#0d6efd',
    },
    radioText: {
        color: tc('text', '#fff'),
        fontSize: 16,
        flex: 1,
    },
    advanceSection: {
        width: '100%',
        marginVertical: 15,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: tc('border', '#333'),
    },
    advanceTitle: {
        color: tc('text', '#fff'),
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center',
        backgroundColor: tc('bg', 'black'),
    },
    advanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
    },
    advanceInput: {
        flex: 1,
        backgroundColor: tc('surface', 'black'),
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: tc('text', 'white'),
        marginRight: 10,
        borderWidth: 1,
        borderColor: 'white',
        textAlign: 'center',
    },
    currencyButton: {
        backgroundColor: '#0d6efd',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        minWidth: 80,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'white',
    },
    currencyButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    actionButtons: {
        width: '100%',
        marginTop: 10,
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
}));

export default WriteOff;
