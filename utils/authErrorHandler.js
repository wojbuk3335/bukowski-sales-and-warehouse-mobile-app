// Authentication Error Handler for Mobile App
import { router } from "expo-router";
import Logger from '../services/logger';

class AuthErrorHandler {
    static tokenService = null;
    static isRedirecting = false; // Prevent multiple simultaneous redirects
    static lastRedirectTime = 0;
    static REDIRECT_COOLDOWN = 1000; // 1 second cooldown between redirects
    
    // Set token service reference to avoid circular import
    static setTokenService(service) {
        this.tokenService = service;
    }
    
    // Check if error is related to authentication/token issues
    static isAuthError(error) {
        if (!error) return false;
        
        const errorMessage = error.message?.toLowerCase() || '';
        const errorString = error.toString().toLowerCase();
        
        // Common authentication error patterns
        const authErrorPatterns = [
            'no refresh token available',
            'no access token available',
            'token refresh failed',
            'unauthorized',
            'authentication failed',
            'invalid token',
            'token expired',
            'jwt',
            'refresh token',
            'access token'
        ];
        
        return authErrorPatterns.some(pattern => 
            errorMessage.includes(pattern) || errorString.includes(pattern)
        );
    }
    
    // Czy przed chwilą przekierowano do logowania (wygasła sesja)
    static redirectedRecently(windowMs = 5000) {
        return this.lastRedirectTime > 0 && (Date.now() - this.lastRedirectTime) < windowMs;
    }

    // Check if response indicates authentication error
    static isAuthResponse(response) {
        if (!response) return false;
        return response.status === 401 || response.status === 403;
    }
    
    // Handle authentication errors with automatic redirect
    static async handleAuthError(error, context = 'Unknown', silent = false) {
        // Skip if we're in the middle of logging out - it's expected
        if (this.tokenService?.isLoggingOut) {
            return;
        }
        
        // Prevent redirect spam - only redirect once per second
        const now = Date.now();
        if (this.isRedirecting || (now - this.lastRedirectTime) < this.REDIRECT_COOLDOWN) {
            return;
        }
        
        this.isRedirecting = true;
        this.lastRedirectTime = now;
        
        // Log only in development and not in silent mode
        if (__DEV__ && !silent) {
            Logger.debug(`🔄 Auth error detected in ${context}:`, error?.message || error);
        }
        
        try {
            // Clear all tokens and user data
            if (this.tokenService) {
                await this.tokenService.clearTokens();
            }
            
            // Redirect to login page
            router.replace("/(auth)/sign-in");
            
            if (__DEV__ && !silent) {
                Logger.debug('✅ User redirected to login page');
            }
        } catch (redirectError) {
            Logger.error('❌ Error during redirect:', redirectError);
            // Fallback - try to go to root
            try {
                router.replace("/");
            } catch (fallbackError) {
                Logger.error('❌ Fallback redirect failed:', fallbackError);
            }
        } finally {
            // Reset redirect flag after a short delay
            setTimeout(() => {
                this.isRedirecting = false;
            }, 500);
        }
    }
    
    // 🔒 SESSION_REVOKED: tokeny są już wyczyszczone przez tokenService, tu tylko przekierowanie
    // na logowanie z powodem (sign-in pokazuje „Zostałeś wylogowany…”). Bez sprawdzania isLoggingOut
    // ani cooldownu - tokenService.handleSessionRevoked wywołuje to raz.
    static async handleSessionRevoked() {
        this.isRedirecting = true;
        this.lastRedirectTime = Date.now();

        try {
            router.replace({ pathname: "/(auth)/sign-in", params: { reason: "SESSION_REVOKED" } });
        } catch (redirectError) {
            Logger.error('❌ Error during SESSION_REVOKED redirect:', redirectError);
            try {
                router.replace("/(auth)/sign-in");
            } catch (fallbackError) {
                Logger.error('❌ Fallback redirect failed:', fallbackError);
            }
        } finally {
            setTimeout(() => {
                this.isRedirecting = false;
            }, 500);
        }
    }

    // Wrapper for fetch operations with automatic auth error handling
    static async handleFetchError(error, context = 'API Request') {
        if (this.isAuthError(error)) {
            await this.handleAuthError(error, context);
            return true; // Indicates error was handled
        }
        return false; // Indicates error was not auth-related
    }
    
    // Wrapper for response handling with automatic auth error handling
    static async handleResponseError(response, context = 'API Response') {
        if (this.isAuthResponse(response)) {
            const error = new Error(`Authentication failed: ${response.status} ${response.statusText}`);
            await this.handleAuthError(error, context);
            return true; // Indicates error was handled
        }
        return false; // Indicates response was not auth-related error
    }
}

export default AuthErrorHandler;
