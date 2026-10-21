// Token Management Service for React Native Mobile App
import * as SecureStore from 'expo-secure-store';
import { getApiUrl, API_CONFIG } from '../config/api';
import AuthErrorHandler from '../utils/authErrorHandler';
import { SESSION_REVOKED_MESSAGE } from '../utils/sessionLockMessages';
import { notifyCatalogLock } from '../utils/catalogLockNotice'; // okienko „Edycja zablokowana” (409 z serwera)
import Logger from './logger';
import { Platform } from 'react-native';
import { getDeviceId, getDeviceName } from './deviceId';

// Wersja aplikacji do dziennika aktywności (expo-constants; w testach / bez modułu - pusta)
const readAppVersion = () => {
    try {
        // eslint-disable-next-line global-require
        const expoConstants = require('expo-constants');
        const Constants = expoConstants?.default || expoConstants;
        return String(Constants?.expoConfig?.version || Constants?.manifest?.version || '');
    } catch (_error) {
        return '';
    }
};
const APP_VERSION = readAppVersion();

class TokenService {
    constructor() {
        this.refreshPromise = null; // Prevent multiple refresh requests
        this.isRefreshingToken = false;
        this.autoLogoutTimer = null; // Timer for automatic logout
        this.onAutoLogout = null; // Callback for automatic logout
        this.onSessionRevoked = null; // 🔒 Callback: serwer zakończył sesję (SESSION_REVOKED)
        this.sessionRevokedHandled = false; // 🔒 Wiele równoległych zapytań dostaje 401 - wylogowujemy raz
        this.isLoggingOut = false; // Flag to indicate logout in progress
        this.isInitializing = true; // Flag for first app launch
        this.isInitialized = false; // Flag to track if init was called
    }

    // Initialize token service - should be called on app start
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            const { accessToken, refreshToken } = await this.getTokens();
            
            // If we have access token but no refresh token, clear everything
            // This can happen if user upgraded from old app version
            if (accessToken && !refreshToken) {
                await this.clearTokens();
            }
            
            // If we have both tokens, verify they're valid
            if (accessToken && refreshToken) {
                const isExpired = this.isTokenExpiring(accessToken, 0);
                if (!isExpired) {
                    this.isInitializing = false; // User is logged in
                }
            }
            
            this.isInitialized = true;
        } catch (error) {
            Logger.error('Error initializing TokenService:', error);
        }
    }

    // Get tokens from SecureStore
    async getTokens() {
        try {
            const accessToken = await SecureStore.getItemAsync('BukowskiAccessToken');
            const refreshToken = await SecureStore.getItemAsync('BukowskiRefreshToken');
            return { accessToken, refreshToken };
        } catch (error) {
            Logger.error('Error getting tokens from SecureStore:', error);
            return { accessToken: null, refreshToken: null };
        }
    }

    // Store tokens in SecureStore
    async setTokens(accessToken, refreshToken) {
        try {
            // Reset logout flag when setting new tokens (user is logging in)
            this.isLoggingOut = false;
            this.isInitializing = false;
            this.sessionRevokedHandled = false; // nowa sesja - kolejne SESSION_REVOKED ma znów wylogować
            
            if (accessToken) {
                await SecureStore.setItemAsync('BukowskiAccessToken', accessToken);
                
                // Also store expiry time for proactive refresh
                const payload = this.parseJWT(accessToken);
                if (payload && payload.exp) {
                    const expiryTime = payload.exp * 1000;
                    await SecureStore.setItemAsync('BukowskiTokenExpiry', expiryTime.toString());
                }
                
                // 🧪 AUTO-LOGOUT: Start monitoring after setting new token
                this.startAutoLogoutMonitoring();
            }
            if (refreshToken) {
                await SecureStore.setItemAsync('BukowskiRefreshToken', refreshToken);
            }
        } catch (error) {
            Logger.error('Error storing tokens:', error);
        }
    }

    // Clear all tokens
    async clearTokens() {
        try {
            await SecureStore.deleteItemAsync('BukowskiAccessToken');
            await SecureStore.deleteItemAsync('BukowskiRefreshToken');
            await SecureStore.deleteItemAsync('BukowskiTokenExpiry');
            // Note: user data stays in AsyncStorage if needed
        } catch (error) {
            Logger.error('Error clearing tokens from SecureStore:', error);
        }
    }

    // Parse JWT token to get payload
    parseJWT(token) {
        if (!token) return null;
        
        try {
            // Split token into parts
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            
            // Decode the payload (middle part)
            const payload = parts[1];
            
            // Add padding if needed for base64 decoding
            let decodedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
            while (decodedPayload.length % 4) {
                decodedPayload += '=';
            }
            
            // Use base64 decoding that works in React Native
            let decoded;
            if (typeof atob !== 'undefined') {
                // Browser environment or React Native with polyfill
                decoded = atob(decodedPayload);
            } else {
                // React Native environment - use Buffer if available
                if (typeof Buffer !== 'undefined') {
                    decoded = Buffer.from(decodedPayload, 'base64').toString('utf8');
                } else {
                    // Manual base64 decode as fallback
                    decoded = this.base64Decode(decodedPayload);
                }
            }
            
            return JSON.parse(decoded);
        } catch (error) {
            Logger.error('Error parsing JWT:', error);
            return null;
        }
    }

    // Manual base64 decode for React Native fallback
    base64Decode(str) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let result = '';
        let i = 0;
        
        str = str.replace(/[^A-Za-z0-9+/]/g, '');
        
        while (i < str.length) {
            const encoded1 = chars.indexOf(str.charAt(i++));
            const encoded2 = chars.indexOf(str.charAt(i++));
            const encoded3 = chars.indexOf(str.charAt(i++));
            const encoded4 = chars.indexOf(str.charAt(i++));
            
            const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;
            
            result += String.fromCharCode((bitmap >> 16) & 255);
            if (encoded3 !== 64) result += String.fromCharCode((bitmap >> 8) & 255);
            if (encoded4 !== 64) result += String.fromCharCode(bitmap & 255);
        }
        
        return result;
    }

    // Check if token is expired or will expire soon
    isTokenExpiring(token, bufferSeconds = 300) { // Default 5 minutes buffer for production
        const payload = this.parseJWT(token);
        if (!payload || !payload.exp) return true;
        
        const expiryTime = payload.exp * 1000; // Convert to ms
        const bufferTime = bufferSeconds * 1000; // Buffer in ms
        const now = Date.now();
        
        return now >= (expiryTime - bufferTime);
    }

    // Refresh access token using refresh token
    async refreshAccessToken() {
        // Prevent multiple refresh requests
        if (this.isRefreshingToken) {
            return this.refreshPromise;
        }

        this.isRefreshingToken = true;
        
        const { refreshToken } = await this.getTokens();
        
        if (!refreshToken) {
            await this.clearTokens();
            this.isRefreshingToken = false;
            // During logout, silently skip refresh attempts
            if (this.isLoggingOut) {
                return null;
            }
            const error = new Error('No refresh token available');
            // Only handle auth error if we're not on initial app load (silent fail for first launch)
            if (!this.isLoggingOut && !this.isInitializing) {
                await AuthErrorHandler.handleAuthError(error, 'Token Refresh', false);
            }
            throw error;
        }

        this.refreshPromise = this.performRefresh(refreshToken);
        
        try {
            const result = await this.refreshPromise;
            this.isRefreshingToken = false;
            return result;
        } catch (error) {
            this.isRefreshingToken = false;
            await this.clearTokens();
            // Only handle auth error if not initializing or logging out
            if (!this.isLoggingOut && !this.isInitializing) {
                await AuthErrorHandler.handleAuthError(error, 'Token Refresh');
            }
            throw error;
        }
    }

    // Perform the actual refresh request
    async performRefresh(refreshToken) {
        try {
            const response = await fetch(getApiUrl('/user/refresh-token'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refreshToken })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                // 🔒 Sesja zakończona przez serwer - refresh token też jest nieważny, nie ma co odświeżać
                if (response.status === 401 && errorData?.code === 'SESSION_REVOKED') {
                    await this.handleSessionRevoked();
                    const revokedError = new Error(errorData.message || SESSION_REVOKED_MESSAGE);
                    revokedError.code = 'SESSION_REVOKED';
                    revokedError.isAuthError = true;
                    throw revokedError;
                }
                throw new Error(errorData.message || 'Token refresh failed');
            }

            const data = await response.json();
            
            // Store new access token (keep existing refresh token)
            await this.setTokens(data.accessToken, refreshToken);
            
            return data.accessToken;
        } catch (error) {
            Logger.error('Token refresh error:', error);
            throw error;
        }
    }

    // Get valid access token (refresh if needed)
    async getValidAccessToken() {
        const { accessToken } = await this.getTokens();
        
        if (!accessToken) {
            const error = new Error('No access token available');
            // Don't handle auth error during logout process OR on first app launch
            if (!this.isLoggingOut && !this.isInitializing) {
                await AuthErrorHandler.handleAuthError(error, 'Get Access Token');
            }
            throw error;
        }

        // Check if token is expiring soon (use 5 minutes buffer for production)
        const isExpiring = this.isTokenExpiring(accessToken, 300); // 5 minutes in seconds
        
        if (isExpiring) {
            try {
                const newToken = await this.refreshAccessToken();
                return newToken;
            } catch (error) {
                // Refresh failed, clear tokens
                await this.clearTokens();
                // Only handle auth error if not initializing or logging out
                if (!this.isLoggingOut && !this.isInitializing) {
                    await AuthErrorHandler.handleAuthError(error, 'Token Validation');
                }
                throw error;
            }
        }

        return accessToken;
    }

    // Który telefon pyta: dziennik aktywności w panelu rozpoznaje po tym telefon (i jego nazwę z rejestru)
    async getDeviceHeaders() {
        try {
            const deviceId = await getDeviceId();
            return {
                'X-Device-Id': deviceId,
                'X-Device-Name': getDeviceName(),
                'X-Platform': Platform.OS,
                ...(APP_VERSION ? { 'X-App-Version': APP_VERSION } : {})
            };
        } catch (_error) {
            return {};
        }
    }

    // Create authenticated headers for API requests
    async getAuthHeaders() {
        const deviceHeaders = await this.getDeviceHeaders();
        try {
            const token = await this.getValidAccessToken();
            return {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...deviceHeaders
            };
        } catch (error) {
            // Only log errors if:
            // 1. Not in test environment
            // 2. Not during logout process
            // 3. Error is not about missing tokens (first app launch)
            const isMissingTokenError = error.message === 'No access token available' || 
                                       error.message === 'No refresh token available';
            
            if (typeof jest === 'undefined' && !this.isLoggingOut && !isMissingTokenError) {
                Logger.error('getAuthHeaders error:', error);
            }
            
            // Return headers without authorization if token is not available
            return {
                'Content-Type': 'application/json',
                ...deviceHeaders
            };
        }
    }

    // Enhanced fetch function with automatic token handling  
    async authenticatedFetch(url, options = {}) {
        try {
            // Skip fetch during logout to avoid unnecessary errors
            if (this.isLoggingOut) {
                throw new Error('Authentication failed: logout in progress');
            }
            
            // Get auth headers
            const authHeaders = await this.getAuthHeaders();
            
            // Merge headers
            const headers = {
                ...authHeaders,
                ...options.headers
            };

            // Setup timeout with AbortController
            const controller = new AbortController();
            const timeoutMs = (API_CONFIG?.TIMEOUT ?? 10000);
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            // Make the request with timeout
            let response;
            try {
                response = await fetch(url, {
                    ...options,
                    headers,
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeoutId);
            }

            // 409 blokady produktów / tabel (nieprzetworzone Dobieranie) - komunikat serwera dla każdego ekranu edycji
            if (response.status === 409 && typeof response.clone === 'function') {
                response.clone().json().then(data => notifyCatalogLock(response.status, data)).catch(() => {});
            }

            // 🔒 401 {code:'SESSION_REVOKED'}: admin wylogował z panelu albo ten telefon zalogował się
            // ponownie. NIE odświeżamy tokenu - wylogowanie lokalne i ekran logowania z powodem.
            if (response.status === 401 && await this.isSessionRevokedResponse(response)) {
                await this.handleSessionRevoked();
                const revokedError = new Error(SESSION_REVOKED_MESSAGE);
                revokedError.code = 'SESSION_REVOKED';
                revokedError.isAuthError = true;
                throw revokedError;
            }

            // If we get 401, try to refresh token and retry once
            if (response.status === 401 && !options._retry && !this.isLoggingOut) {
                // Don't handle error yet - first try to refresh token
                try {
                    const newToken = await this.refreshAccessToken();
                    if (newToken) {
                        // Retry the request with new token
                        const newHeaders = {
                            ...headers,
                            'Authorization': `Bearer ${newToken}`
                        };
                        // Retry with fresh timeout controller
                        const retryController = new AbortController();
                        const retryTimeoutId = setTimeout(() => retryController.abort(), timeoutMs);
                        try {
                            return await fetch(url, {
                                ...options,
                                headers: newHeaders,
                                signal: retryController.signal,
                                _retry: true // Prevent infinite retry loop
                            });
                        } finally {
                            clearTimeout(retryTimeoutId);
                        }
                    }
                } catch (refreshError) {
                    if (__DEV__) {
                        Logger.error('❌ Token refresh failed:', refreshError);
                    }
                    
                    // Refresh failed, NOW handle auth error and clear tokens
                    if (!this.isLoggingOut) {
                        await this.clearTokens();
                        await AuthErrorHandler.handleAuthError(refreshError, 'Token Refresh Failed');
                    }
                    refreshError.isAuthError = true; // Mark as auth error
                    throw refreshError;
                }
                
                // If we got here, refresh didn't work but didn't throw
                // Handle as auth error now
                const error = new Error(`Authentication failed: ${response.status}`);
                await AuthErrorHandler.handleAuthError(error, 'Authentication Failed');
                error.isAuthError = true;
                throw error;
            }
            
            // If 401 during logout, throw silent auth error
            if (response.status === 401 && this.isLoggingOut) {
                const error = new Error(`Authentication failed: ${response.status}`);
                error.isAuthError = true; // Mark as auth error
                error.isDuringLogout = true; // Mark as logout error
                throw error;
            }

            return response;
        } catch (error) {
            // Convert abort errors to a friendly message
            if (error?.name === 'AbortError') {
                error.message = 'Żądanie przekroczyło limit czasu połączenia';
            }
            // Handle auth errors with automatic redirect (but not during logout).
            // SESSION_REVOKED jest już obsłużone (tokeny wyczyszczone, przekierowanie z powodem)
            const wasHandled = (error?.code === 'SESSION_REVOKED' || this.isLoggingOut)
                ? true
                : await AuthErrorHandler.handleFetchError(error, 'Authenticated Fetch');
            // Błąd sesji (przekierowanie do logowania już trwa) - ekrany nie pokazują wtedy własnego komunikatu
            if (wasHandled && error && typeof error === 'object' && AuthErrorHandler.isAuthError(error)) {
                error.isAuthError = true;
            }

            // Suppress all errors during logout - they're just noise
            if (!this.isLoggingOut && typeof jest === 'undefined' && !wasHandled) {
                Logger.error('authenticatedFetch error:', error);
            }
            throw error;
        }
    }

    // Helper method to check if user is authenticated
    async isAuthenticated() {
        try {
            const { accessToken } = await this.getTokens();
            return !!accessToken && !this.isTokenExpiring(accessToken, 0);
        } catch (error) {
            return false;
        }
    }

    // Manual logout
    async logout(options = {}) {
        this.isLoggingOut = true; // Set logout flag
        const suppressFlagReset = options.suppressFlagReset === true;

        const { accessToken, refreshToken } = await this.getTokens();

        // Inform server about logout (best effort). Wygasły token odpadłby na /user/logout (401) -
        // wtedy koniec sesji punktu zgłaszamy przez /user/session/end (przyjmuje wygasły token)
        if (accessToken && this.isTokenExpiring(accessToken, 0)) {
            await this.endSessionOnServer(accessToken, refreshToken);
        } else if (accessToken || refreshToken) {
            try {
                await fetch(getApiUrl('/user/logout'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
                    },
                    body: JSON.stringify({ refreshToken })
                });
            } catch (error) {
                // Server logout failed, continuing with local logout
                Logger.warn('Server logout failed:', error);
            }
        }

        await this.clearTokens();
        this.clearAutoLogoutTimer(); // Clear timer on manual logout
        if (!suppressFlagReset) {
            this.isLoggingOut = false; // Clear logout flag
        }
    }

    // 🔒 Koniec sesji punktu („jedna osoba na punkcie”) zgłaszany serwerowi, gdy token dostępu już wygasł.
    // Bez tego punkt zostawał zablokowany („Zalogowany … ostatnio 13 godz. temu”), bo serwer nie wiedział
    // o wylogowaniu. Serwer sprawdza podpis tokenu (bez daty ważności) i kasuje tylko własną sesję.
    async endSessionOnServer(accessToken, refreshToken) {
        if (!accessToken && !refreshToken) return;
        try {
            await fetch(getApiUrl('/user/session/end'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
                },
                body: JSON.stringify({ refreshToken })
            });
        } catch (error) {
            Logger.warn('Zamknięcie sesji na serwerze nie powiodło się:', error);
        }
    }

    // 🧪 AUTO-LOGOUT: Set callback for automatic logout
    setAutoLogoutCallback(callback) {
        this.onAutoLogout = callback;
    }

    // 🔒 SESSION_REVOKED: callback czyszczący lokalny stan użytkownika (GlobalState)
    setSessionRevokedCallback(callback) {
        this.onSessionRevoked = callback;
    }

    // 🔒 Czy odpowiedź 401 ma body { code: 'SESSION_REVOKED' } (sesja zakończona po stronie serwera)
    async isSessionRevokedResponse(response) {
        if (!response || response.status !== 401) return false;
        try {
            // clone - body czytamy tylko do sprawdzenia kodu, odpowiedź może być jeszcze potrzebna
            const source = typeof response.clone === 'function' ? response.clone() : response;
            const data = await source.json();
            return data?.code === 'SESSION_REVOKED';
        } catch (_error) {
            return false; // brak body / nie-JSON - zwykłe 401
        }
    }

    // 🔒 Sesja zakończona przez serwer: wylogowanie lokalne (bez /user/logout - serwer już ją zamknął)
    // i ekran logowania z powodem. Wiele równoległych zapytań dostaje 401 - wykonujemy to raz.
    async handleSessionRevoked() {
        if (this.sessionRevokedHandled) return;
        this.sessionRevokedHandled = true;
        this.isLoggingOut = true; // pozostałe zapytania w locie kończą się cicho

        try {
            await this.clearTokens();
            this.clearAutoLogoutTimer();

            if (this.onSessionRevoked) {
                await this.onSessionRevoked();
            }

            await AuthErrorHandler.handleSessionRevoked();
        } catch (error) {
            Logger.error('SESSION_REVOKED: błąd podczas wylogowania:', error);
        } finally {
            // Jak w GlobalState.logout - chwila, żeby zapytania w locie zakończyły się bez komunikatów
            setTimeout(() => { this.isLoggingOut = false; }, 500);
        }
    }

    // 🧪 AUTO-LOGOUT: Start monitoring token expiration
    startAutoLogoutMonitoring() {
        this.clearAutoLogoutTimer(); // Clear any existing timer
        
        const checkTokenExpiration = async () => {
            try {
                const { accessToken } = await this.getTokens();
                
                if (!accessToken) {
                    return;
                }

                const payload = this.parseJWT(accessToken);
                if (!payload || !payload.exp) {
                    await this.performAutoLogout();
                    return;
                }

                const expiryTime = payload.exp * 1000; // Convert to ms
                const now = Date.now();
                const timeLeft = expiryTime - now;

                if (timeLeft <= 0) {
                    await this.performAutoLogout();
                    return;
                }

                // Smart check intervals based on time left
                let nextCheckIn;
                if (timeLeft > 3600000) { // More than 1 hour - check every 10 minutes
                    nextCheckIn = 600000;
                } else if (timeLeft > 300000) { // More than 5 minutes - check every minute
                    nextCheckIn = 60000;
                } else if (timeLeft > 30000) { // More than 30 seconds - check every 10 seconds
                    nextCheckIn = 10000;
                } else { // Last 30 seconds - check every second
                    nextCheckIn = 1000;
                }
                
                this.autoLogoutTimer = setTimeout(checkTokenExpiration, nextCheckIn);

            } catch (error) {
                Logger.error('AUTO-LOGOUT: Error checking token:', error);
                // On error, check again in 5 seconds
                this.autoLogoutTimer = setTimeout(checkTokenExpiration, 5000);
            }
        };

        // Start monitoring
        checkTokenExpiration();
    }

    // 🧪 AUTO-LOGOUT: Perform automatic logout
    async performAutoLogout() {
        try {
            this.isLoggingOut = true; // Set logout flag
            // Najpierw serwer: po clearTokens() nie byłoby już czym zgłosić końca sesji punktu
            const { accessToken, refreshToken } = await this.getTokens();
            await this.endSessionOnServer(accessToken, refreshToken);
            await this.clearTokens();
            this.clearAutoLogoutTimer();
            
            // Call the callback if set
            if (this.onAutoLogout) {
                this.onAutoLogout();
            }
        } catch (error) {
            Logger.error('AUTO-LOGOUT: Error during automatic logout:', error);
        } finally {
            this.isLoggingOut = false; // Clear logout flag
        }
    }

    // 🧪 AUTO-LOGOUT: Clear the auto logout timer
    clearAutoLogoutTimer() {
        if (this.autoLogoutTimer) {
            clearTimeout(this.autoLogoutTimer);
            this.autoLogoutTimer = null;
        }
    }

    // 🧪 AUTO-LOGOUT: Stop monitoring (call when app goes to background)
    stopAutoLogoutMonitoring() {
        this.clearAutoLogoutTimer();
    }
}

// Create singleton instance
const tokenService = new TokenService();

// Set up the reference to avoid circular dependency
AuthErrorHandler.setTokenService(tokenService);

export default tokenService;