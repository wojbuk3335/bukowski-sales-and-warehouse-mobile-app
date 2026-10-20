import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

// Motyw aplikacji: 'dark' (czarny), 'gray' (szary - domyślny), 'light' (biały).
// Zapamiętywany w telefonie (AsyncStorage). Ekrany biorą kolory z useAppTheme().colors.

export const THEMES = ['light', 'gray', 'dark'];
export const THEME_LABELS = { light: 'Biały', gray: 'Szary', dark: 'Czarny' };
const STORAGE_KEY = 'appTheme';

export const PALETTES = {
  dark: {
    bg: '#000000', surface: '#161622', surface2: '#232533', surface3: '#2f3340',
    text: '#ffffff', muted: '#CDCDE0', border: '#232533', tabBar: '#000000', statusBar: 'light', primary: '#0d6efd',
  },
  gray: {
    bg: '#2b2f36', surface: '#363b44', surface2: '#414751', surface3: '#4f5661',
    text: '#f3f4f6', muted: '#cbd5e1', border: '#5b6470', tabBar: '#23272e', statusBar: 'light', primary: '#0d6efd',
  },
  light: {
    bg: '#f3f4f6', surface: '#ffffff', surface2: '#eef0f3', surface3: '#dfe3e8',
    text: '#111827', muted: '#4b5563', border: '#d1d5db', tabBar: '#ffffff', statusBar: 'dark', primary: '#0d6efd',
  },
};

// Bieżący motyw dostępny poza Reactem (style w StyleSheet są tworzone poza komponentami).
// Ustawiany przez ThemeProvider przed wyrenderowaniem ekranów.
export const DEFAULT_THEME = 'gray';
let currentTheme = DEFAULT_THEME;
export const getCurrentTheme = () => currentTheme;

// Kolor zależny od motywu: w czarnym zostaje dokładnie dotychczasowy kolor (darkValue),
// w szarym/białym brany jest kolor z palety dla danej roli (bg, surface, surface2, surface3, text, muted, border).
export const tc = (role, darkValue) => (currentTheme === 'dark' ? darkValue : PALETTES[currentTheme][role]);
// Ciemne kolorowe tła komunikatów (zielone/czerwone/żółte ramki): w białym motywie jasny odpowiednik, w szarym/czarnym bez zmian.
export const tcl = (darkValue, lightValue) => (currentTheme === 'light' ? lightValue : darkValue);
export const statusBarStyle = () => PALETTES[currentTheme].statusBar; // 'light' | 'dark' (expo-status-bar)
export const statusBarContent = () => (PALETTES[currentTheme].statusBar === 'light' ? 'light-content' : 'dark-content'); // react-native StatusBar

// Style zależne od motywu: factory wywołuje tc(...) i StyleSheet.create; wynik jest liczony osobno dla każdego motywu.
// Zwracany obiekt zachowuje się jak zwykłe `styles` (styles.container itd.). Ekran musi wywołać useAppTheme(),
// żeby przerysować się po zmianie motywu.
export const createThemedStyles = (factory) => {
  const cache = {};
  const sheet = () => {
    if (!cache[currentTheme]) cache[currentTheme] = factory();
    return cache[currentTheme];
  };
  return new Proxy({}, {
    get: (_, key) => sheet()[key],
    has: (_, key) => key in sheet(),
    ownKeys: () => Reflect.ownKeys(sheet()),
    getOwnPropertyDescriptor: (_, key) => {
      const value = sheet()[key];
      return value === undefined ? undefined : { value, enumerable: true, configurable: true, writable: false };
    },
  });
};

const ThemeContext = createContext({ theme: DEFAULT_THEME, colors: PALETTES[DEFAULT_THEME], setTheme: () => {} });

export const ThemeProvider = ({ children }) => {
  // Motyw na stałe szary (decyzja 20.10.2026 - bez przełącznika). Zapisany wcześniej wybór (biały / czarny)
  // jest ignorowany i usuwany z telefonu. Palety zostają - tc() i style ekranów działają bez zmian.
  const theme = DEFAULT_THEME;

  useEffect(() => {
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const setTheme = () => {}; // przełączanie motywu wyłączone

  currentTheme = theme; // przed renderem dzieci - style i tc() widzą już nowy motyw
  const contextValue = useMemo(() => ({ theme, colors: PALETTES[theme], setTheme }), [theme]);
  return (
    <ThemeContext.Provider value={contextValue}>
      {/* tło w kolorze motywu pod ekranami - po starcie od razu szare (domyślny motyw), bez białego mignięcia */}
      <View style={{ flex: 1, backgroundColor: PALETTES[theme].bg }}>{children}</View>
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(ThemeContext);

export default ThemeContext;
