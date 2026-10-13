import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import React, { useEffect } from 'react';
import "react-native-url-polyfill/auto";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import axios from 'axios';
import { API_CONFIG } from '../config/api';
import { GlobalStateProvider } from "../context/GlobalState"; // Import global state provider
import { AuthProvider } from '../context/AuthContext'; // Import auth provider
import { ThemeProvider } from '../context/ThemeContext'; // motyw: biały / szary / czarny
import AppDialogHost from '../components/AppDialogHost'; // wspólne okienka zamiast Alert.alert

// Configure axios baseURL globally
axios.defaults.baseURL = API_CONFIG.BASE_URL;

SplashScreen.preventAutoHideAsync();

const RootLayout = () => {
  const [fontsLoaded, error] = useFonts({
    "Poppins-Black": require("../assets/fonts/Poppins-Black.ttf"),
    "Poppins-Bold": require("../assets/fonts/Poppins-Bold.ttf"),
    "Poppins-ExtraBold": require("../assets/fonts/Poppins-ExtraBold.ttf"),
    "Poppins-ExtraLight": require("../assets/fonts/Poppins-ExtraLight.ttf"),
    "Poppins-Light": require("../assets/fonts/Poppins-Light.ttf"),
    "Poppins-Medium": require("../assets/fonts/Poppins-Medium.ttf"),
    "Poppins-Regular": require("../assets/fonts/Poppins-Regular.ttf"),
    "Poppins-SemiBold": require("../assets/fonts/Poppins-SemiBold.ttf"),
    "Poppins-Thin": require("../assets/fonts/Poppins-Thin.ttf"),
  });

  useEffect(() => {
    if (error) throw error;

    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, error]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const applyNavigationBar = async () => {
      try {
        await NavigationBar.setPositionAsync('absolute');
        await NavigationBar.setVisibilityAsync('hidden');
        await NavigationBar.setBehaviorAsync('inset-swipe');
        await NavigationBar.setBackgroundColorAsync('transparent');
        await NavigationBar.setButtonStyleAsync('light');
      } catch (navError) {
        console.warn('Navigation bar config failed:', navError);
      }
    };

    applyNavigationBar();
  }, []);

  // Patch global fetch to provide safer JSON parsing with better diagnostics
  useEffect(() => {
    const originalFetch = global.fetch;
    global.fetch = async (...args) => {
      const response = await originalFetch(...args);
      // Clone response so we can inspect raw body if JSON parsing fails
      const clone = response.clone?.() ?? response;
      const originalJson = response.json.bind(response);
      response.json = async () => {
        try {
          return await originalJson();
        } catch (e) {
          try {
            const text = await clone.text();
            // Log a short preview to help locate the issue
            console.warn("JSON parse failed. Preview:", text.slice(0, 200));
            // Minimal auto-fix: escape lone backslashes not part of valid JSON escapes
            const fixed = text.replace(/\\(?!["\\\/bfnrtu])/g, "\\\\");
            return JSON.parse(fixed);
          } catch {
            // Re-throw original error if we cannot recover
            throw e;
          }
        }
      };
      return response;
    };
    return () => {
      global.fetch = originalFetch;
    };
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  if (!fontsLoaded && !error) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
      <AuthProvider>
        <GlobalStateProvider>
          <Stack options={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(admin-tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="products-list" options={{ headerShown: false }} />
            <Stack.Screen name="warehouse-mobile" options={{ headerShown: false }} />
            <Stack.Screen name="states-list" options={{ headerShown: false }} />
            <Stack.Screen name="cenniki" options={{ headerShown: false }} />
            <Stack.Screen name="sales-view" options={{ headerShown: false }} />
            <Stack.Screen name="stock-list" options={{ headerShown: false }} />
            <Stack.Screen name="colors-list" options={{ headerShown: false }} />
            <Stack.Screen name="sizes-list" options={{ headerShown: false }} />
            <Stack.Screen name="localizations-list" options={{ headerShown: false }} />
            <Stack.Screen name="bags-list" options={{ headerShown: false }} />
            <Stack.Screen name="wallets-list" options={{ headerShown: false }} />
            <Stack.Screen name="remaining-products-list" options={{ headerShown: false }} />
            <Stack.Screen name="employees-list" options={{ headerShown: false }} />
            <Stack.Screen name="manufacturers-list" options={{ headerShown: false }} />
            <Stack.Screen name="payroll" options={{ headerShown: false }} />
            <Stack.Screen name="pan-kazek" options={{ headerShown: false }} />
            <Stack.Screen name="print-labels" options={{ headerShown: false }} />
          </Stack>
          <AppDialogHost />
        </GlobalStateProvider>
      </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

export default RootLayout;