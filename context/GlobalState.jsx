import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router"; // Import router
import React, { createContext, useState, useContext, useCallback, useMemo, useRef } from "react";
import { getApiUrl, API_CONFIG } from "../config/api"; // Import API config
import tokenService from "../services/tokenService"; // Import token service
import { getDeviceId, getDeviceName } from "../services/deviceId"; // Identyfikator telefonu do blokady „jedna osoba na punkcie”
import { flush as flushActivity, reset as resetActivity } from "../services/activityLog"; // dziennik aktywności
import quickLogin from "../services/quickLogin"; // szybkie logowanie wzorem / PIN-em
import AuthErrorHandler from "../utils/authErrorHandler"; // Import auth error handler
import { AuthContext } from './AuthContext'; // Import auth context

export const GlobalStateContext = createContext();

// Każda zmiana w tym kontekście przerysowuje WSZYSTKIE zamontowane ekrany (zakładki nie odmontowują się),
// a przy wejściu na zakładkę słowniki (stan, towary, rozmiary, kolory, użytkownicy) zwykle przychodzą z serwera
// identyczne. Nową listę zapisujemy więc tylko, gdy naprawdę różni się od poprzedniej - inaczej zostaje stara
// referencja i React nie przerysowuje nikogo. Porównanie: długość, potem JSON (natywne, szybkie, nic nie zostaje w pamięci).
const sameList = (prev, next) =>
    Array.isArray(prev) && Array.isArray(next) && prev.length === next.length
    && (prev.length === 0 || JSON.stringify(prev) === JSON.stringify(next));
const keepIfSame = (next) => (prev) => (sameList(prev, next) ? prev : next);

// Jak długo pobrane dane uznajemy za świeże w ensureData(): katalogi (rozmiary, kolory, towary, asortyment,
// użytkownicy, torebki, portfele) zmieniają się rzadko - z panelu admina; stan punktów częściej (sprzedaże,
// przesunięcia), więc krócej. Pobranie „na siłę” to nadal zwykłe fetchX() (pull-to-refresh, po zapisie).
export const DICTIONARY_MAX_AGE_MS = 5 * 60 * 1000;
export const STATE_MAX_AGE_MS = 30 * 1000;
const defaultMaxAge = (key) => (key === 'state' ? STATE_MAX_AGE_MS : DICTIONARY_MAX_AGE_MS);

export const GlobalStateProvider = ({ children }) => {
    const authContext = useContext(AuthContext);
    
    const [user, setUser] = useState(null); // Global state for user
    const [isLoggedIn, setIsLoggedIn] = useState(false); // State to track login status
    const [isLoading, setIsLoading] = useState(false); // State to track loading status
    const [stateData, setStateData] = useState([]); // Global state for fetched data
    const [sizes, setSizes] = useState([]); // Global state for sizes
    const [colors, setColors] = useState([]); // Global state for colors
    const [goods, setGoods] = useState([]); // Global state for goods
    const [stocks, setStocks] = useState([]); // Global state for stocks
    const [users, setUsers] = useState([]); // Global state for all users
    const [bags, setBags] = useState([]); // Global state for bags
    const [wallets, setWallets] = useState([]); // Global state for wallets
    const [matchedItems, setMatchedItems] = useState([]); // Lista dopasowanych elementów
    const [transferredJackets, setTransferredJackets] = useState([]); // Initialize transferred jackets

    // Kiedy ostatnio UDAŁO SIĘ pobrać dany zbiór (ref - bez przerysowań) i które pobrania właśnie trwają.
    // Zakładki przy wejściu wołają ensureData([...]) zamiast salwy fetchX(): świeże dane nie są pobierane ponownie,
    // a równoległe prośby o ten sam zbiór (np. dwie zakładki naraz) dzielą jedno zapytanie.
    const fetchedAtRef = useRef({});
    const inFlightRef = useRef({});
    const markFetched = (key) => { fetchedAtRef.current[key] = Date.now(); };
    const markStale = (key) => { fetchedAtRef.current[key] = 0; };

    // Funkcje kontekstu mają stałą tożsamość (useCallback), a wartość kontekstu jest zapamiętana (useMemo):
    // bez tego każdy render dostawcy tworzył nowy obiekt i nowe funkcje, więc wszyscy konsumenci przerysowywali się
    // nawet bez zmiany danych, a efekty zależne od fetchX uruchamiały się w kółko.

    // Helper function for fetch with timeout and authentication
    const fetchWithTimeout = useCallback(async (url, timeout = 10000) => {
        // Skip fetch during logout
        if (tokenService.isLoggingOut) {
            throw new Error('Request cancelled: logout in progress');
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            // Use tokenService for authenticated requests
            const response = await tokenService.authenticatedFetch(url, {
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            
            // Check if response indicates auth error
            if (response && (response.status === 401 || response.status === 403)) {
                if (!tokenService.isLoggingOut) {
                    await AuthErrorHandler.handleResponseError(response, 'Global State Fetch');
                }
                throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
            }
            
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout - no response from server after 10 seconds');
            }
            
            // Handle auth errors with automatic redirect (but not during logout)
            if (!tokenService.isLoggingOut) {
                const wasHandled = await AuthErrorHandler.handleFetchError(error, 'Global State Fetch');
                if (wasHandled) {
                    // Auth error was handled, still throw to let caller know request failed
                    throw new Error('Authentication error - redirected to login');
                }
            }
            
            throw error;
        }
    }, []);

    const addMatchedItem = useCallback((barcode) => {
        if (stateData) {
            const matchedItem = stateData.find(item => item.barcode === barcode);
            if (matchedItem) {
                setMatchedItems(prev => [...prev, matchedItem]);
            }
        }
    }, [stateData]);

    const updateUser = useCallback((userData) => {
        setUser(userData);
        setIsLoggedIn(!!userData); // Update login status
    }, []);

    const fetchState = useCallback(async () => {
        try {
            const response = await fetchWithTimeout(getApiUrl("/state"));
            
            if (!response || !response.ok) {
                markStale('state');
                setStateData([]); // Set fallback immediately
                return []; // Return empty array instead of throwing
            }
            const data = await response.json();
            
            // Handle both cases: direct array or object with state_data property
            let stateArray;
            if (Array.isArray(data)) {
                // API returns direct array
                stateArray = data;
            } else if (data?.state_data && Array.isArray(data.state_data)) {
                // API returns object with state_data array
                stateArray = data.state_data;
            } else {
                // Fallback to empty array
                stateArray = [];
            }
            
            setStateData(keepIfSame(stateArray)); // Set the array into state
            markFetched('state');
            return stateArray; // Return fetched state as array
        } catch (error) {
            markStale('state');
            setStateData([]); // Fallback to an empty array in case of error
            return []; // Return empty array instead of throwing
        }
    }, [fetchWithTimeout]);

    const fetchSizes = useCallback(async () => {
        try {
            const response = await fetchWithTimeout(getApiUrl("/excel/size/get-all-sizes"));
            
            if (!response || !response.ok) {
                markStale('sizes');
                setSizes([]); // Set fallback immediately
                return []; // Return empty array instead of throwing
            }
            const data = await response.json();

            // Extract sizes array from the response object
            const sizesArray = Array.isArray(data?.sizes) ? data.sizes : [];
            setSizes(keepIfSame(sizesArray)); // Set the fetched sizes into state
            markFetched('sizes');
            return sizesArray; // Return fetched sizes as array
        } catch (error) {
            markStale('sizes');
            setSizes([]); // Fallback to an empty array in case of error
            return []; // Return empty array instead of throwing
        }
    }, [fetchWithTimeout]);

    const fetchColors = useCallback(async () => {
        try {
            const response = await fetchWithTimeout(getApiUrl("/excel/color/get-all-colors"));
            
            if (!response || !response.ok) {
                markStale('colors');
                setColors([]); // Set fallback immediately
                return []; // Return empty array instead of throwing
            }
            const data = await response.json();

            // Extract colors array from the response object
            const colorsArray = Array.isArray(data?.colors) ? data.colors : [];
            setColors(keepIfSame(colorsArray)); // Set the fetched colors into state
            markFetched('colors');
            return colorsArray; // Return fetched colors as array
        } catch (error) {
            markStale('colors');
            setColors([]); // Fallback to an empty array in case of error
            return []; // Return empty array instead of throwing
        }
    }, [fetchWithTimeout]);

    const fetchGoods = useCallback(async () => {
        try {
            const response = await fetchWithTimeout(getApiUrl("/excel/goods/get-all-goods"));
            
            if (!response || !response.ok) {
                markStale('goods');
                setGoods([]); // Set fallback immediately
                return []; // Return empty array instead of throwing
            }
            const data = await response.json();

            // Extract goods array from the response object
            const goodsArray = Array.isArray(data?.goods) ? data.goods : [];
            setGoods(keepIfSame(goodsArray)); // Set the fetched goods into state
            markFetched('goods');
            return goodsArray; // Return fetched goods as array
        } catch (error) {
            markStale('goods');
            setGoods([]); // Fallback to an empty array in case of error
            return []; // Return empty array instead of throwing
        }
    }, [fetchWithTimeout]);

    const fetchUsers = useCallback(async () => {
        try {
            const response = await fetchWithTimeout(getApiUrl("/user"));
            
            if (!response || !response.ok) {
                markStale('users');
                setUsers([]); // Set fallback immediately
                return []; // Return empty array instead of throwing
            }
            const data = await response.json();
            
            // Extract users array from the response object
            // API może zwracać { users: [...] } lub bezpośrednio [...]
            let usersArray;
            if (Array.isArray(data)) {
                usersArray = data; // API zwraca bezpośrednio tablicę
            } else if (Array.isArray(data?.users)) {
                usersArray = data.users; // API zwraca { users: [...] }
            } else {
                usersArray = []; // Fallback do pustej tablicy
            }
            
            setUsers(keepIfSame(usersArray)); // Set the fetched users into state
            markFetched('users');
            return usersArray; // Return fetched users as array
        } catch (error) {
            markStale('users');
            setUsers([]); // Fallback to an empty array in case of error
            return []; // Return empty array instead of throwing
        }
    }, [fetchWithTimeout]);

    const fetchBags = useCallback(async () => {
        try {
            const response = await fetchWithTimeout(getApiUrl("/excel/bags/get-all-bags"));
            
            if (!response || !response.ok) {
                markStale('bags');
                setBags([]); // Set fallback immediately
                return []; // Return empty array instead of throwing
            }
            const data = await response.json();

            // Extract bags array from the response object
            const bagsArray = Array.isArray(data?.bags) ? data.bags : [];
            setBags(keepIfSame(bagsArray)); // Set the fetched bags into state
            markFetched('bags');
            return bagsArray; // Return fetched bags as array
        } catch (error) {
            markStale('bags');
            setBags([]); // Fallback to an empty array in case of error
            return []; // Return empty array instead of throwing
        }
    }, [fetchWithTimeout]);

    const fetchWallets = useCallback(async () => {
        try {
            const response = await fetchWithTimeout(getApiUrl("/excel/wallets/get-all-wallets"));
            
            if (!response || !response.ok) {
                markStale('wallets');
                setWallets([]); // Set fallback immediately
                return []; // Return empty array instead of throwing
            }
            const data = await response.json();

            // Extract wallets array from the response object
            const walletsArray = Array.isArray(data?.wallets) ? data.wallets : [];
            setWallets(keepIfSame(walletsArray)); // Set the fetched wallets into state
            markFetched('wallets');
            return walletsArray; // Return fetched wallets as array
        } catch (error) {
            markStale('wallets');
            setWallets([]); // Fallback to an empty array in case of error
            return []; // Return empty array instead of throwing
        }
    }, [fetchWithTimeout]);

    // Zapis sesji po udanym logowaniu (hasłem albo szybkim logowaniem): tokeny, użytkownik, AuthContext
    const completeLogin = useCallback(async (data) => {
        if (data.token || data.accessToken) {
            await tokenService.setTokens(data.accessToken || data.token, data.refreshToken);
        }
        // Wait a bit to ensure AsyncStorage write is completed
        await new Promise(resolve => setTimeout(resolve, 100));
        setUser(data); // Update user state
        setIsLoggedIn(true); // Set login status to true
        await AsyncStorage.setItem("user", JSON.stringify(data)); // Save user data locally
        if (authContext?.login) {
            authContext.login(data);
        }
        return data;
    }, [authContext]);

    // Szybkie logowanie na zaufanym telefonie (wzór / PIN / odcisk) - błędy z kodem jak w services/quickLogin
    // userId - które z zapamiętanych kont (np. admin albo konto punktu); bez - ostatnio używane
    const quick_login = useCallback(async (userId) => {
        setIsLoading(true);
        try {
            const data = await quickLogin.login(userId);
            return await completeLogin(data);
        } finally {
            setIsLoading(false);
        }
    }, [completeLogin]);

    const bukowski_login = useCallback(async (email, password, navigation, isAdminPanel = false) => {
        setIsLoading(true); // Set loading to true
        const loginAttemptId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        try {
            // Use different endpoint based on panel selection
            const endpoint = isAdminPanel ? "/user/admin-login" : "/user/login";
            const url = getApiUrl(endpoint);
            
            console.log(`🔐 [LOGIN][${loginAttemptId}] Panel: ${isAdminPanel ? 'Admin' : 'User'}`);
            console.log(`🔐 [LOGIN][${loginAttemptId}] Email: ${email}`);
            console.log(`🔐 [LOGIN][${loginAttemptId}] URL: ${url}`);

            // Blokada „jedna osoba na punkcie”: backend rozpoznaje telefon po deviceId,
            // a deviceName pokazuje drugiej osobie, kto zajmuje punkt (dla admina nieszkodliwe)
            const deviceId = await getDeviceId();
            const deviceName = getDeviceName();

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, password, deviceId, deviceName }),
            });

            console.log(`🔐 [LOGIN][${loginAttemptId}] Response Status: ${response.status}`);

            if (!response.ok) {
                let errorData = null;
                try {
                    errorData = await response.json();
                } catch (_parseError) {
                    // Ignoruj błąd parsowania i użyj fallback message poniżej
                }

                // Expected auth failures (401/403) should not look like app crashes in Metro logs.
                const backendMessage = String(errorData?.message || '').toLowerCase();
                const looksLikeInvalidCredentials =
                    backendMessage.includes('błędny login') ||
                    backendMessage.includes('bledny login') ||
                    backendMessage.includes('invalid login') ||
                    backendMessage.includes('invalid credentials') ||
                    backendMessage.includes('nieprawidłowy') ||
                    backendMessage.includes('nieprawidlowy') ||
                    backendMessage.includes('hasło') ||
                    backendMessage.includes('haslo');

                if (response.status === 401 || (response.status === 400 && looksLikeInvalidCredentials)) {
                    const invalidCredentialsError = new Error('Nieprawidłowy email lub hasło.');
                    invalidCredentialsError.code = 'INVALID_CREDENTIALS';
                    invalidCredentialsError.status = response.status;
                    throw invalidCredentialsError;
                }

                if (response.status === 403 && errorData?.error !== 'SESSION_ACTIVE') {
                    const forbiddenError = new Error('Brak uprawnień do logowania w tym panelu.');
                    forbiddenError.code = 'FORBIDDEN';
                    forbiddenError.status = 403;
                    throw forbiddenError;
                }

                console.warn(`⚠️ [LOGIN][${loginAttemptId}] Error Data:`, errorData);
                console.warn(`⚠️ [LOGIN][${loginAttemptId}] Error Response: ${response.status} ${response.statusText}`);
                console.warn(`⚠️ [LOGIN][${loginAttemptId}] Context: panel=${isAdminPanel ? 'Admin' : 'User'} endpoint=${endpoint}`);

                // 🔒 SESSION BLOCKING ERROR
                if (response.status === 403 && errorData?.error === 'SESSION_ACTIVE') {
                    const error = new Error(errorData.message);
                    error.code = 'SESSION_ACTIVE';
                    error.status = 403;
                    // { startedAt, lastSeenAt, deviceName } - ekran logowania pokazuje, kto i od kiedy zajmuje punkt
                    error.session = errorData.session || null;
                    error.sessions = Array.isArray(errorData.sessions) ? errorData.sessions : null; // wszystkie telefony (limit 2)
                    throw error;
                }

                throw new Error(
                    errorData?.message || `Login failed with status ${response.status}: ${response.statusText}`
                );
            }

            const data = await response.json();

            console.log(`✅ [LOGIN][${loginAttemptId}] Login successful for: ${email}`);
            
            if (data?.requiresVerification) {
                console.log(`🔐 [LOGIN][${loginAttemptId}] 2FA Required`);
                return data;
            }
            
            await completeLogin(data);
            console.log(`✅ [LOGIN][${loginAttemptId}] Tokens stored`);
            return data; // Return user data
        } catch (error) {
            const expectedErrorCodes = ['INVALID_CREDENTIALS', 'FORBIDDEN', 'SESSION_ACTIVE'];
            const expectedByMessage = String(error?.message || '').toLowerCase().includes('błędny login') ||
                String(error?.message || '').toLowerCase().includes('bledny login') ||
                String(error?.message || '').toLowerCase().includes('nieprawidłowy') ||
                String(error?.message || '').toLowerCase().includes('nieprawidlowy') ||
                String(error?.message || '').toLowerCase().includes('hasło') ||
                String(error?.message || '').toLowerCase().includes('haslo');

            if (expectedErrorCodes.includes(error?.code) || expectedByMessage) {
                console.warn(`⚠️ [LOGIN][${loginAttemptId}] Handled auth error:`, error.message);
            } else {
                console.error(`❌ [LOGIN][${loginAttemptId}] Catch Error:`, error.message);
            }
            throw error;
        } finally {
            setIsLoading(false); // Set loading to false
        }
    }, [completeLogin]);

    const fetchStock = useCallback(async () => {
        try {
            const response = await fetchWithTimeout(getApiUrl("/excel/stock/get-all-stocks"));
            
            if (!response || !response.ok) {
                markStale('stocks');
                setStocks([]); // Set fallback immediately
                return []; // Return empty array instead of throwing
            }
            const data = await response.json();

            // Extract stocks array from the response object
            const stocksArray = Array.isArray(data?.stocks) ? data.stocks : [];
            setStocks(keepIfSame(stocksArray)); // Update stocks state
            markFetched('stocks');
            return stocksArray; // Return fetched stocks as array
        } catch (error) {
            markStale('stocks');
            setStocks([]); // Fallback to an empty array in case of error
            return []; // Return empty array instead of throwing
        }
    }, [fetchWithTimeout]);

    // Pobieranie „na żądanie” zbiorów z kontekstu: klucze 'state' | 'sizes' | 'colors' | 'goods' | 'stocks' |
    // 'users' | 'bags' | 'wallets'. Pobiera tylko te, które nie były jeszcze pobrane albo są starsze niż limit
    // (maxAgeMs, domyślnie wg defaultMaxAge); trwające pobranie tego samego zbioru jest współdzielone.
    // Zwraca listę kluczy, które faktycznie poszły do serwera.
    const fetchers = useMemo(() => ({
        state: fetchState, sizes: fetchSizes, colors: fetchColors, goods: fetchGoods,
        stocks: fetchStock, users: fetchUsers, bags: fetchBags, wallets: fetchWallets,
    }), [fetchState, fetchSizes, fetchColors, fetchGoods, fetchStock, fetchUsers, fetchBags, fetchWallets]);

    const isDataFresh = useCallback((keys, maxAgeMs) => keys.every((key) => {
        const fetchedAt = fetchedAtRef.current[key] || 0;
        return fetchedAt > 0 && Date.now() - fetchedAt < (maxAgeMs ?? defaultMaxAge(key));
    }), []);

    const ensureData = useCallback(async (keys, { maxAgeMs } = {}) => {
        const requested = [];
        await Promise.all(keys.map(async (key) => {
            const fetcher = fetchers[key];
            if (!fetcher || isDataFresh([key], maxAgeMs)) return;
            if (!inFlightRef.current[key]) {
                inFlightRef.current[key] = fetcher().finally(() => { delete inFlightRef.current[key]; });
            }
            requested.push(key);
            await inFlightRef.current[key];
        }));
        return requested;
    }, [fetchers, isDataFresh]);

    const logout = useCallback(async () => {
        try { await flushActivity(); } catch (_error) { /* dziennik nie blokuje wylogowania */ }
        resetActivity();
        try {
            tokenService.isLoggingOut = true;
            // Stop auto-logout monitoring first
            tokenService.stopAutoLogoutMonitoring();
            
            // Clear tokens using tokenService
            await tokenService.logout({ suppressFlagReset: true });
            
            fetchedAtRef.current = {}; // po ponownym logowaniu wszystko pobrać od nowa
            setUser(null); // Clear user state
            setIsLoggedIn(false); // Set login status to false
            setStateData(null); // Clear state data
            setSizes([]); // Clear sizes
            setColors([]); // Clear colors
            setGoods([]); // Clear goods
            setStocks([]); // Clear stocks
            setUsers([]); // Clear users
            
            // Clear AuthContext
            if (authContext?.logout) {
                authContext.logout();
            }
            setBags([]); // Clear bags
            setWallets([]); // Clear wallets
            setMatchedItems([]); // Clear matched items
            setTransferredJackets([]); // Clear transferred jackets
            
            // Small delay to let pending requests fail quietly
            await new Promise(resolve => setTimeout(resolve, 200));
            
            await AsyncStorage.clear(); // Clear all AsyncStorage data
            router.replace("/"); // Redirect to the root route
        } catch (error) {
            // Silently handle logout errors
        } finally {
            setTimeout(() => { tokenService.isLoggingOut = false; }, 500);
        }
    }, [authContext]);

    // Funkcja do filtrowania punktów sprzedaży na podstawie lokalizacji zalogowanego użytkownika
    const getFilteredSellingPoints = useCallback(() => {
        if (!user || !user.location || !users || users.length === 0) {
            return [];
        }

        // Filtruj użytkowników tylko z tej samej lokalizacji co zalogowany użytkownik
        // Wykluczamy admin i magazyn (role: admin, magazyn)
        // Dodajemy rolę "dom" do listy dostępnych użytkowników (niezależnie od lokalizacji)
        const filteredUsers = users.filter(u => {
            // Zawsze uwzględniaj użytkowników z rolą "dom"
            if (u.role && u.role.toLowerCase() === 'dom') {
                return true;
            }
            
            // Dla pozostałych użytkowników stosuj standardowe filtrowanie
            return u.location && user.location &&
                u.location.trim().toLowerCase() === user.location.trim().toLowerCase() && 
                u.role !== 'admin' && 
                u.role !== 'magazyn' &&
                u.sellingPoint && 
                u.sellingPoint.trim() !== '';
        });

        return filteredUsers;
    }, [user, users]);

    // 🧪 AUTO-LOGOUT: Setup automatic logout callback
    React.useEffect(() => {
        // Set up auto-logout callback
        const handleAutoLogout = async () => {
            // Silent logout without alert
            await logout();
        };

        // Register the callback with tokenService
        tokenService.setAutoLogoutCallback(handleAutoLogout);

        // 🔒 SESSION_REVOKED: serwer zakończył sesję (admin wylogował z panelu albo ten telefon
        // zalogował się ponownie). Tokeny czyści tokenService, tu tylko lokalny stan użytkownika -
        // bez wywołania /user/logout i bez router.replace("/"), bo przekierowanie na logowanie
        // z powodem robi AuthErrorHandler.
        const handleSessionRevoked = async () => {
            fetchedAtRef.current = {};
            setUser(null);
            setIsLoggedIn(false);
            setStateData(null);
            setSizes([]);
            setColors([]);
            setGoods([]);
            setStocks([]);
            setUsers([]);
            setBags([]);
            setWallets([]);
            setMatchedItems([]);
            setTransferredJackets([]);
            if (authContext?.logout) {
                authContext.logout();
            }
            try {
                await AsyncStorage.removeItem("user");
            } catch (_error) {
                // Brak danych użytkownika w AsyncStorage nie blokuje wylogowania
            }
        };
        tokenService.setSessionRevokedCallback?.(handleSessionRevoked);

        // Start monitoring if user is already logged in
        if (isLoggedIn && user) {
            tokenService.startAutoLogoutMonitoring();
        }

        // Cleanup
        return () => {
            tokenService.clearAutoLogoutTimer();
        };
    }, [isLoggedIn, user]);

    React.useEffect(() => {
        // Initialize token service on app start
        const initializeApp = async () => {
            await tokenService.initialize();
        };
        
        initializeApp();
        
        // Nie pobieramy danych przy inicjalizacji - będą pobierane w zakładce Create
        // gdy użytkownik faktycznie ich potrzebuje
    }, []);

    // Wartość kontekstu zmienia tożsamość tylko, gdy zmieni się któryś z jej elementów
    const contextValue = useMemo(() => ({
        user,
        isLoggedIn,
        setIsLoggedIn, // Provide setIsLoggedIn
        isLoading,
        stateData,
        sizes, // Provide sizes in the global state
        colors, // Provide colors in the global state
        goods, // Provide goods in the global state
        stocks, // Provide stocks in the global state
        users, // Provide users in the global state
        bags, // Provide bags in the global state
        wallets, // Provide wallets in the global state
        matchedItems, // Provide matched items in the global state
        transferredJackets, // Provide transferred jackets in the global state
        setUser: updateUser,
        bukowski_login,
        logout, // Ensure logout is included in the context value
        quick_login, // szybkie logowanie na zaufanym telefonie
        completeLogin, // zapis sesji po logowaniu (np. po 2FA)
        addMatchedItem, // Provide function to add matched items
        setTransferredJackets, // Provide function to update transferred jackets
        fetchState, // Provide function to fetch state data
        fetchStock, // Provide function to fetch stocks
        fetchColors, // Provide function to fetch colors
        fetchSizes, // Provide function to fetch sizes
        fetchGoods, // Provide function to fetch goods
        fetchUsers, // Provide function to fetch users
        fetchBags, // Provide function to fetch bags
        fetchWallets, // Provide function to fetch wallets
        ensureData, // pobierz tylko to, co nieświeże (wejście na zakładkę)
        isDataFresh, // czy zbiory są już pobrane i świeże (np. czy pokazywać pełnoekranowe „Ładowanie”)
        getFilteredSellingPoints, // Provide function to get filtered selling points
    }), [
        user, isLoggedIn, isLoading, stateData, sizes, colors, goods, stocks, users, bags, wallets,
        matchedItems, transferredJackets,
        updateUser, bukowski_login, logout, quick_login, completeLogin, addMatchedItem,
        fetchState, fetchStock, fetchColors, fetchSizes, fetchGoods, fetchUsers, fetchBags, fetchWallets,
        ensureData, isDataFresh, getFilteredSellingPoints,
    ]);

    return (
        <GlobalStateContext.Provider value={contextValue}>
            {children}
        </GlobalStateContext.Provider>
    );
};
