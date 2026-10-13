import { useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from "react";
import { Animated, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl } from "../../config/api";
import { GlobalStateContext } from "../../context/GlobalState";
import tokenService from "../../services/tokenService";
import Logger from "../../services/logger"; // Import logger service
import AuthFix from "../../components/AuthFix";
import LogoutButton from "../../components/LogoutButton";
import { appAlert } from '../../services/appAlert';

import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu
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
    const [salesData, setSalesData] = useState([]); // List of sales for blocking validation
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
    const today = new Date().toISOString().split('T')[0]; // NORMAL: Real today

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
        
        // COMPLETE DAILY RESET: Filter ALL operations to show only TODAY's transfers
        // After midnight, everything resets - both UI and validation
        const allTransfers = Array.isArray(data) ? data : [];
        
        // For UI highlighting: only TODAY's transfers involving this user
        const todayUserTransfers = allTransfers.filter(
            (transfer) =>
                (transfer.transfer_from === user?.symbol || transfer.transfer_to === user?.symbol) &&
                transfer.date &&
                transfer.date.startsWith(today)
        );
        
        // FIXED: For sold items - include ALL sales from today for UI highlighting
        // We need to show all sold items to block jackets with same barcode regardless of who sold them
        const todaySoldItems = allTransfers.filter(
            transfer => transfer.transfer_to === 'SOLD' && 
                       transfer.date &&
                       transfer.date.startsWith(today)
        );
        
        // CHANGED: For validation - check ALL transfers but filter by date
        // This ensures jackets can be transferred again after midnight
        const todayUserProductTransfers = allTransfers.filter(
            (transfer) => {
                // Check if transfer is from TODAY for ANY product
                const isToday = transfer.date && transfer.date.startsWith(today);
                
                // Only include TODAY's transfers (regardless of user - this is for blocking validation)
                return isToday;
            }
        );
        
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
        
        // Filter sales from today only
        const todaySales = allSales.filter(sale => 
            sale.date && sale.date.startsWith(today)
        );
        
        setSalesData(todaySales);
    } catch (error) {
        setSalesData([]);
        throw error; // Re-throw to be caught by fetchAllRequiredData
    }
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
            const today = new Date().toISOString().split('T')[0];
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

            // Show success message
            setSuccessMessage(`Wymiana została pomyślnie zapisana!\nTransfer ID: ${transferResult._id || 'unknown'}\nData: ${today}`);
            setSuccessModalVisible(true);

            // Refresh data to update UI
            await fetchAllRequiredData(false);

            setModalVisible(false);
            setExchangeModalVisible(false);
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
            <LogoutButton position="top-right" />
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
                    <FlatList
                        testID="writeoff-flatlist"
                        ListHeaderComponent={
                            <View>
                                <Text style={styles.headerText}>
                                    Stan użytkownika: {user?.email || "Nieznany użytkownik"}
                                </Text>
                                <Text style={styles.productCountText}>
                                    Produktów: {filteredData.length}
                                </Text>
                            </View>
                        }
                        contentContainerStyle={{ paddingHorizontal: 0, paddingBottom: Math.max(120, insets.bottom + 120) }}
                        data={filteredData}
                        keyExtractor={(item) => item.id}
                        onRefresh={() => fetchAllRequiredData(true)} // true = to jest refresh action
                        refreshing={isRefreshing} // Używamy isRefreshing zamiast isLoading
                        renderItem={({ item, index }) => (
                            <View
                                style={[
                                    styles.item,
                                    { marginHorizontal: 0 }, // Remove side margins
                                ]}
                            >
                                <Text 
                                    style={[
                                        styles.itemTextLeft,
                                        {
                                            fontSize: (item.fullName?.length || 0) + (item.size?.length || 0) > 20 ? 10 : 12,
                                            fontWeight: "bold",
                                        },
                                    ]} 
                                    numberOfLines={1}
                                >
                                    {index + 1}. {item.fullName}   {item.size}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => openModal(item)}
                                    style={styles.dotsButton}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    <Text style={styles.dotsText}>⋮</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                </View>
            )}
            <Modal
                visible={modalVisible}
                transparent
                animationType="slide"
                onRequestClose={closeModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Opcje</Text>
                        {selectedItem ? (
                            <>
                                <TouchableOpacity
                                    style={styles.optionButton}
                                    onPress={() => {
                                        setModalVisible(false);
                                        setTransferModalVisible(true);
                                    }}
                                >
                                    <Text style={styles.optionText}>Przepisz do</Text>
                                </TouchableOpacity>
                                {(user?.symbol === 'most' || user?.email === 'most@wp.pl') && (
                                    <TouchableOpacity
                                        style={[styles.optionButton, { backgroundColor: '#28a745' }]}
                                        onPress={() => handlePanKazekTransfer()}
                                    >
                                        <Text style={styles.optionText}>Od Pana Kazka</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    style={[styles.optionButton, { backgroundColor: '#ff9800' }]}
                                    onPress={() => {
                                        setModalVisible(false);
                                        setExchangeModalVisible(true);
                                    }}
                                >
                                    <Text style={styles.optionText}>Wymiana</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <View style={[styles.optionButton, styles.disabledButton]}>
                                <Text style={styles.optionText}>Brak wybranego produktu</Text>
                            </View>
                        )}
                        <TouchableOpacity
                            style={[styles.optionButton, styles.closeButton]}
                            onPress={closeModal}
                        >
                            <Text style={styles.closeText}>Anuluj</Text>
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
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Wybierz użytkownika</Text>
                        {/* MAGAZYN option at the top */}
                        <TouchableOpacity
                            style={[styles.optionButton, styles.magazynButton]}
                            onPress={() => {
                                setTransferModalVisible(false);
                                setMagazynReasonModalVisible(true);
                            }}
                        >
                            <Text style={styles.optionText}>MAGAZYN</Text>
                        </TouchableOpacity>
                        {users.map((item) => (
                            <TouchableOpacity
                                key={item._id}
                                style={styles.optionButton}
                                onPress={() => {
                                    if (item.role && item.role.toLowerCase() === 'dom') {
                                        // Dla użytkownika Dom pokaż modal powodów
                                        setTransferModalVisible(false);
                                        setDomReasonModalVisible(true);
                                    } else {
                                        // Dla innych użytkowników normalne przepisywanie
                                        initiateTransfer(item.symbol);
                                    }
                                }}
                            >
                                <Text style={styles.optionText}>{item.symbol}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            style={[styles.optionButton, styles.closeButton]}
                            onPress={() => setTransferModalVisible(false)}
                        >
                            <Text style={styles.closeText}>Zamknij</Text>
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
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Błąd połączenia</Text>
                        <Text style={styles.modalMessage}>{errorMessage}</Text>
                        <TouchableOpacity
                            style={styles.optionButton}
                            onPress={handleRetry}
                        >
                            <Text style={styles.optionText}>Spróbuj ponownie</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.optionButton, styles.closeButton]}
                            onPress={handleCloseError}
                        >
                            <Text style={styles.closeText}>Zamknij</Text>
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
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { width: '85%' }]}>
                        <Text style={styles.modalTitle}>Powód przepisania do domu</Text>
                        
                        {/* Radio buttons dla powodów */}
                        <View style={styles.radioContainer}>
                            <TouchableOpacity
                                style={styles.radioOption}
                                onPress={() => setSelectedReason('skracanie rękawów')}
                            >
                                <View style={styles.radioButton}>
                                    {selectedReason === 'skracanie rękawów' && <View style={styles.radioButtonSelected} />}
                                </View>
                                <Text style={styles.radioText}>Skracanie rękawów</Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                                style={styles.radioOption}
                                onPress={() => setSelectedReason('przeróbka')}
                            >
                                <View style={styles.radioButton}>
                                    {selectedReason === 'przeróbka' && <View style={styles.radioButtonSelected} />}
                                </View>
                                <Text style={styles.radioText}>Przeróbka</Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                                style={styles.radioOption}
                                onPress={() => setSelectedReason('wysyłka')}
                            >
                                <View style={styles.radioButton}>
                                    {selectedReason === 'wysyłka' && <View style={styles.radioButtonSelected} />}
                                </View>
                                <Text style={styles.radioText}>Wysyłka</Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                                style={styles.radioOption}
                                onPress={() => {
                                    setSelectedReason('custom');
                                    setCustomReason(''); // Wyczyść poprzedni tekst
                                }}
                            >
                                <View style={styles.radioButton}>
                                    {selectedReason === 'custom' && <View style={styles.radioButtonSelected} />}
                                </View>
                                <Text style={styles.radioText}>Inny powód</Text>
                            </TouchableOpacity>
                        </View>
                        
                        {/* Pole tekstowe dla niestandardowego powodu */}
                        {selectedReason === 'custom' && (
                            <View style={styles.customReasonContainer}>
                                <TextInput
                                    style={styles.customReasonInput}
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
                        <View style={styles.advanceSection}>
                            <Text style={styles.advanceTitle}>Zaliczka (opcjonalnie)</Text>
                            <View style={styles.advanceRow}>
                                <TextInput
                                    style={styles.advanceInput}
                                    placeholder="0.00"
                                    placeholderTextColor={tc('muted', "#ccc")}
                                    value={advanceAmount}
                                    onChangeText={setAdvanceAmount}
                                    keyboardType="numeric"
                                />
                                <TouchableOpacity
                                    style={styles.currencyButton}
                                    onPress={() => setShowCurrencyModal(true)}
                                >
                                    <Text style={styles.currencyButtonText}>{selectedCurrency}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        
                        {/* Przyciski akcji */}
                        <View style={styles.actionButtons}>
                            <TouchableOpacity
                                style={[styles.optionButton, styles.submitButton, !selectedReason && styles.disabledButton]}
                                onPress={handleFinalSubmit}
                                disabled={!selectedReason}
                            >
                                <Text style={styles.optionText}>Zatwierdź</Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                                style={[styles.optionButton, styles.closeButton]}
                                onPress={() => {
                                    setDomReasonModalVisible(false);
                                    setCustomReason("");
                                    setSelectedReason("");
                                    setAdvanceAmount("");
                                    setSelectedCurrency("PLN");
                                }}
                            >
                                <Text style={styles.closeText}>Anuluj</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
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
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { width: '85%' }]}>
                        <Text style={styles.modalTitle}>Czy na pewno chcesz przepisać kurtkę do MAGAZYNy?</Text>
                        
                        {/* Radio buttons dla powodów */}
                        <View style={styles.radioContainer}>
                            <TouchableOpacity
                                style={styles.radioOption}
                                onPress={() => setSelectedReason('przeróbka')}
                            >
                                <View style={styles.radioButton}>
                                    {selectedReason === 'przeróbka' && <View style={styles.radioButtonSelected} />}
                                </View>
                                <Text style={styles.radioText}>Przeróbka</Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                                style={styles.radioOption}
                                onPress={() => setSelectedReason('wysyłka')}
                            >
                                <View style={styles.radioButton}>
                                    {selectedReason === 'wysyłka' && <View style={styles.radioButtonSelected} />}
                                </View>
                                <Text style={styles.radioText}>Wysyłka</Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                                style={styles.radioOption}
                                onPress={() => {
                                    setSelectedReason('custom');
                                    setCustomReason(''); // Wyczyść poprzedni tekst
                                }}
                            >
                                <View style={styles.radioButton}>
                                    {selectedReason === 'custom' && <View style={styles.radioButtonSelected} />}
                                </View>
                                <Text style={styles.radioText}>Inny powód</Text>
                            </TouchableOpacity>
                        </View>
                        
                        {/* Pole tekstowe dla niestandardowego powodu */}
                        {selectedReason === 'custom' && (
                            <View style={styles.customReasonContainer}>
                                <TextInput
                                    style={styles.customReasonInput}
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
                        <View style={styles.actionButtons}>
                            <TouchableOpacity
                                style={[styles.optionButton, styles.submitButton, !selectedReason && styles.disabledButton]}
                                onPress={handleMagazynFinalSubmit}
                                disabled={!selectedReason}
                            >
                                <Text style={styles.optionText}>Zatwierdź</Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                                style={[styles.optionButton, styles.closeButton]}
                                onPress={() => {
                                    setMagazynReasonModalVisible(false);
                                    setCustomReason("");
                                    setSelectedReason("");
                                }}
                            >
                                <Text style={styles.closeText}>Anuluj</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal wyboru waluty */}
            <Modal
                visible={showCurrencyModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowCurrencyModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Wybierz walutę</Text>
                        {['PLN', 'EUR', 'USD', 'CZK'].map((currency) => (
                            <TouchableOpacity
                                key={currency}
                                style={styles.optionButton}
                                onPress={() => {
                                    setSelectedCurrency(currency);
                                    setShowCurrencyModal(false);
                                }}
                            >
                                <Text style={styles.optionText}>{currency}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            style={[styles.optionButton, styles.closeButton]}
                            onPress={() => setShowCurrencyModal(false)}
                        >
                            <Text style={styles.closeText}>Anuluj</Text>
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
                            style={[styles.optionButton, { backgroundColor: '#007bff', marginTop: 20, width: '90%' }]}
                            onPress={() => setSuccessModalVisible(false)}
                        >
                            <Text style={styles.optionText}>OK</Text>
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
                        <Text style={styles.modalMessage}>
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

            {/* Exchange Modal - wybór stanowiska */}
            <Modal
                visible={exchangeModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setExchangeModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Wybierz stanowisko wymiany</Text>
                        {selectedItem && (
                            <View style={{ marginVertical: 10 }}>
                                <Text style={{ color: tc('text', '#fff'), fontSize: 14, textAlign: 'center' }}>
                                    {selectedItem.fullName} {selectedItem.size}
                                </Text>
                            </View>
                        )}
                        {exchangeUsers.map((item) => (
                            <TouchableOpacity
                                key={item._id}
                                style={styles.optionButton}
                                onPress={() => handleExchange(item.symbol)}
                            >
                                <Text style={styles.optionText}>{item.symbol}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            style={[styles.optionButton, styles.closeButton]}
                            onPress={() => setExchangeModalVisible(false)}
                        >
                            <Text style={styles.closeText}>Anuluj</Text>
                        </TouchableOpacity>
                    </View>
                </View>
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
