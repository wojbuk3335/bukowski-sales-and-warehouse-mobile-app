// Zakładka Szukaj (31.10.2026, wydajność): pomiar z Dziennika aktywności - „Przerysowanie: Szukaj 4394 ms”. Ekran przy
// KAŻDYM przerysowaniu (także samego menu) przeszukiwał i sortował localeCompare('pl') cały stan wszystkich punktów.
// Teraz: menu nie dotyka stanu, sortowanie raz na zmianę stanu, filtrowanie tylko w otwartej wyszukiwarce.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useFocusEffect: (effect) => {
    const React = require('react');
    React.useEffect(() => effect(), []);
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../components/LogoutButton', () => () => null);
jest.mock('../../app/QRScannerSearch', () => () => null);
jest.mock('../../utils/plSort', () => {
  const actual = jest.requireActual('../../utils/plSort');
  return { ...actual, comparePlBase: jest.fn(actual.comparePlBase) };
});

import { comparePlBase } from '../../utils/plSort';
import SearchScreen from '../../app/(tabs)/search';
import { GlobalStateContext } from '../../context/GlobalState';

const stateData = [
  { id: '1', fullName: 'Żaneta CZARNY', size: 'M', symbol: 'P', barcode: '0001' },
  { id: '2', fullName: 'Ada CZERWONY', size: 'XL', symbol: 'T', barcode: '0002' },
  { id: '3', fullName: 'Łucja ZIELONY', size: 'L', symbol: 'P', barcode: '0003' },
  { id: '4', fullName: 'Ada CZERWONY', size: 'M', symbol: 'MAGAZYN', barcode: '0004' },
];
const renderSearch = (data = stateData) => render(
  <GlobalStateContext.Provider value={{ stateData: data, user: { symbol: 'P' }, sizes: [], colors: [], goods: [], fetchState: jest.fn() }}>
    <SearchScreen />
  </GlobalStateContext.Provider>
);

beforeEach(() => comparePlBase.mockClear());

test('menu Szukaj: stan sortowany raz (nie przy każdym przerysowaniu), wyszukiwarka - po polsku i filtr po wpisie', () => {
  const screen = renderSearch();
  const sortsAtStart = comparePlBase.mock.calls.length;
  fireEvent.press(screen.getByTestId('search-by-text'));
  fireEvent.changeText(screen.getByPlaceholderText('Nazwa, kolor, rozmiar, kod, punkt...'), 'a');
  fireEvent.changeText(screen.getByPlaceholderText('Nazwa, kolor, rozmiar, kod, punkt...'), '');
  expect(comparePlBase.mock.calls.length).toBe(sortsAtStart); // otwarcie i pisanie nie sortują od nowa

  const names = screen.getAllByText(/\d+\. /).map((node) => [].concat(node.props.children).join(''));
  expect(names.map((name) => name.split('  ')[0])).toEqual(['1. Ada CZERWONY', '2. Ada CZERWONY', '3. Łucja ZIELONY', '4. Żaneta CZARNY']);

  fireEvent.changeText(screen.getByPlaceholderText('Nazwa, kolor, rozmiar, kod, punkt...'), 'lucja');
  expect(screen.getByText('Wyników: 1')).toBeTruthy();
});
