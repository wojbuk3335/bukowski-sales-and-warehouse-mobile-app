import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Motyw aplikacji: 'dark' (czarny, dotychczasowy), 'gray' (szary), 'light' (biały).
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

const ThemeContext = createContext({ theme: 'dark', colors: PALETTES.dark, setTheme: () => {} });

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState('dark');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => { if (!cancelled && THEMES.includes(stored)) setThemeState(stored); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const setTheme = (value) => {
    const next = THEMES.includes(value) ? value : 'dark';
    setThemeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const contextValue = useMemo(() => ({ theme, colors: PALETTES[theme], setTheme }), [theme]);
  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = () => useContext(ThemeContext);

export default ThemeContext;
