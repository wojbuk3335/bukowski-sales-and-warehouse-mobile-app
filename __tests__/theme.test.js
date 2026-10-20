/**
 * Motyw aplikacji: na stałe szary (bez przełącznika od 20.10.2026); kolory z kontekstu.
 */
/* global jest, test, expect, beforeEach */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet } from 'react-native';
import { ThemeProvider, useAppTheme, PALETTES, tc, tcl, createThemedStyles } from '../context/ThemeContext';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null })); // ikony nie są transformowane w jest

const Probe = () => {
  const { theme, colors } = useAppTheme();
  return <Text testID="probe">{`${theme}:${colors.bg}`}</Text>;
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('zawsze szary, także gdy w telefonie zapisano wcześniej inny motyw (zapis jest usuwany)', async () => {
  for (const stored of [null, 'light', 'dark', 'fioletowy']) {
    await AsyncStorage.clear();
    if (stored) await AsyncStorage.setItem('appTheme', stored);
    const { getByTestId, unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getByTestId('probe').props.children).toBe(`gray:${PALETTES.gray.bg}`);
    await waitFor(async () => expect(await AsyncStorage.getItem('appTheme')).toBeNull());
    unmount();
  }
});

test('style ekranów biorą kolory szarego motywu (tło i tekst z palety, stałe kolory bez zmian)', () => {
  const styles = createThemedStyles(() => StyleSheet.create({
    screen: { backgroundColor: tc('bg', '#000000') },
    title: { color: tc('text', '#fff') },
    note: { backgroundColor: tcl('#1a3a1a', '#e6f5e6') },
    button: { backgroundColor: '#0d6efd', color: '#fff' },
  }));
  const Screen = () => {
    useAppTheme();
    return <Text testID="s">{`${styles.screen.backgroundColor}|${styles.title.color}|${styles.note.backgroundColor}|${styles.button.color}`}</Text>;
  };
  const { getByTestId } = render(
    <ThemeProvider>
      <Screen />
    </ThemeProvider>
  );
  expect(getByTestId('s').props.children).toBe(`${PALETTES.gray.bg}|${PALETTES.gray.text}|#1a3a1a|#fff`);
});
