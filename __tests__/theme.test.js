/**
 * Motyw aplikacji (biały / szary / czarny): przełącznik w profilu, zapis w telefonie, kolory z kontekstu.
 */
/* global jest, test, expect, beforeEach */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useAppTheme, PALETTES } from '../context/ThemeContext';
import ThemeSwitch from '../components/ThemeSwitch';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null })); // ikony nie są transformowane w jest

const Probe = () => {
  const { theme, colors } = useAppTheme();
  return <Text testID="probe">{`${theme}:${colors.bg}`}</Text>;
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('domyślnie czarny; wybór zapisuje się w telefonie i zmienia kolory', async () => {
  const { getByTestId } = render(
    <ThemeProvider>
      <ThemeSwitch />
      <Probe />
    </ThemeProvider>
  );
  expect(getByTestId('probe').props.children).toBe(`dark:${PALETTES.dark.bg}`);

  fireEvent.press(getByTestId('theme-light'));
  expect(getByTestId('probe').props.children).toBe(`light:${PALETTES.light.bg}`);
  await waitFor(async () => expect(await AsyncStorage.getItem('appTheme')).toBe('light'));

  fireEvent.press(getByTestId('theme-gray'));
  expect(getByTestId('probe').props.children).toBe(`gray:${PALETTES.gray.bg}`);
  await waitFor(async () => expect(await AsyncStorage.getItem('appTheme')).toBe('gray'));
});

test('zapisany motyw jest przywracany po ponownym uruchomieniu', async () => {
  await AsyncStorage.setItem('appTheme', 'light');
  const { getByTestId } = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );
  await waitFor(() => expect(getByTestId('probe').props.children).toBe(`light:${PALETTES.light.bg}`));
});

test('nieznana wartość w pamięci nie psuje aplikacji (zostaje czarny)', async () => {
  await AsyncStorage.setItem('appTheme', 'fioletowy');
  const { getByTestId } = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(getByTestId('probe').props.children).toBe(`dark:${PALETTES.dark.bg}`);
});
