import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import Remanent from '../../app/(tabs)/remanent';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';

// Remanent po wydzieleniu wspólnego skanera (components/scanner): te same komunikaty, ten sam zapis skanów
// do sesji punktu i to samo porównanie ze stanem

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props) => React.createElement(View, { testID: 'camera-view', ...props }),
    useCameraPermissions: () => [{ granted: true }, jest.fn(() => Promise.resolve({ granted: true }))],
  };
});

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  ImpactFeedbackStyle: { Heavy: 'heavy' },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, style }) => React.createElement(View, { style }, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('../../components/LogoutButton', () => () => null);

jest.mock('../../config/api', () => ({
  getApiUrl: (endpoint) => `http://mock.api${endpoint}`,
}));

const CODE_44 = '1234504400007'; // Amanda CZARNY 44
const CODE_46 = '1234504600001'; // Amanda CZARNY 46

const response = (data, ok = true, status = 200) => Promise.resolve({
  ok,
  status,
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

const contextValue = {
  user: { email: 'p01@test.com', symbol: 'P01', sellingPoint: 'P01' },
  sizes: [{ Roz_Kod: '044', Roz_Opis: '44' }, { Roz_Kod: '046', Roz_Opis: '46' }],
  colors: [{ Kol_Kod: '45', Kol_Opis: 'CZARNY' }],
  stocks: [{ Tow_Kod: '123', Tow_Opis: 'Amanda' }],
  stateData: [],
  fetchSizes: jest.fn(),
  fetchColors: jest.fn(),
  fetchStock: jest.fn(),
};

const session = { _id: 's1', startedAt: new Date().toISOString(), items: [] };
const pointState = [
  { barcode: CODE_44, fullName: 'Amanda CZARNY', size: '44', price: 1000 },
  { barcode: CODE_46, fullName: 'Amanda CZARNY', size: '46', price: 1000 },
];

const scanCode = async (screen, data) => {
  await waitFor(() => expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeDefined(), { timeout: 3000 });
  await act(async () => {
    await screen.getByTestId('camera-view').props.onBarcodeScanned({ data });
  });
};

describe('Remanent - wspólny skaner i wynik porównania', () => {
  beforeEach(() => {
    tokenService.authenticatedFetch.mockReset();
    tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
      if (url.endsWith('/remanent/current-state')) return response({ data: pointState });
      if (url.endsWith('/remanent/session/current')) return response({ session });
      if (url.includes('/excel/goods/get-all-goods')) return response({ goods: [] });
      if (url.endsWith('/remanent/session/s1/items') && options.method === 'POST') {
        const body = JSON.parse(options.body);
        return response({ added: body.items.map((item, index) => ({ ...item, _id: `i${index}` })) });
      }
      return response({});
    });
  });

  test('skan, odrzucenie obcego kodu, zapis do sesji i „Remanent vs stan”', async () => {
    const screen = render(
      <GlobalStateContext.Provider value={contextValue}>
        <Remanent />
      </GlobalStateContext.Provider>
    );
    await waitFor(() => expect(screen.getByText('Remanent rozpoczęty')).toBeTruthy());

    fireEvent.press(screen.getByText('Skanuj'));
    await waitFor(() => expect(screen.getByText('Skanuj kody kurtek')).toBeTruthy());

    await scanCode(screen, CODE_44);
    await waitFor(() => expect(screen.getByText('Dodano: Amanda CZARNY 44')).toBeTruthy());

    await scanCode(screen, 'QR-XYZ');
    await waitFor(() => expect(screen.getByText('Nieznany kod: QR-XYZ\nTo nie jest metka z bazy produktów - pominięto.')).toBeTruthy());

    fireEvent.press(screen.getByText('Zatwierdź (1)'));
    await waitFor(() => expect(screen.getByText('Zapisano 1 szt.')).toBeTruthy());
    const post = tokenService.authenticatedFetch.mock.calls.find(([url, options]) => url.endsWith('/remanent/session/s1/items') && options?.method === 'POST');
    expect(JSON.parse(post[1].body).items).toEqual([
      expect.objectContaining({ name: 'Amanda CZARNY 44', code: CODE_44, quantity: 1, manual: false }),
    ]);

    fireEvent.press(screen.getByTestId('scanner-close'));
    await waitFor(() => expect(screen.getByText('Amanda CZARNY 44')).toBeTruthy());

    fireEvent.press(screen.getByText('Sprawdź'));
    await waitFor(() => expect(screen.getByText('Remanent vs stan')).toBeTruthy());
    expect(screen.getByText('Na stanie')).toBeTruthy();
    expect(screen.getByTestId('stat-expected').props.children).toBe(2);
    expect(screen.getByTestId('stat-scanned').props.children).toBe(1);
    expect(screen.getByTestId('stat-missing').props.children).toBe(1);
    expect(screen.getByTestId('stat-excess').props.children).toBe(0);
    expect(screen.getByText('Amanda CZARNY 46')).toBeTruthy();
    expect(screen.getByText('Zakończ remanent i zapisz wynik')).toBeTruthy();
    screen.unmount();
  }, 20000);
});
