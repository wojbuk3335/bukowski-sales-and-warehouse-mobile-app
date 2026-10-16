import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import Dashboard from '../../app/(admin-tabs)/dashboard';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';

// Zakładka „Sprawdź” (panel admina): lista dobranych, skaner wspólny z Remanentem, porównanie bez zapisu na serwerze

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

jest.mock('@react-native-community/datetimepicker', () => () => null);

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

const CODE_44 = '1234504400007'; // Amanda CZARNY 44 (dobrane 2 szt.)
const CODE_46 = '1234504600001'; // Amanda CZARNY 46 (dobrane 1 szt.)
const CODE_OUTSIDE = '9876504000003'; // Kasia BRĄZ 40 - nie było w dobieranych

const jackets = [
  { _id: 'h1', barcode: CODE_44, fullName: 'Amanda CZARNY', size: '44' },
  { _id: 'h2', barcode: CODE_44, fullName: 'Amanda CZARNY', size: '44' },
  { _id: 'h3', barcode: CODE_46, fullName: 'Amanda CZARNY', size: '46' },
];

const response = (data, ok = true, status = 200) => Promise.resolve({
  ok,
  status,
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

const contextValue = {
  user: { email: 'admin@test.com', role: 'admin' },
  users: [{ _id: 'u1', username: 'Punkt A', symbol: 'P01', role: 'user' }],
  fetchUsers: jest.fn(() => Promise.resolve([])),
  sizes: [{ Roz_Kod: '040', Roz_Opis: '40' }, { Roz_Kod: '044', Roz_Opis: '44' }, { Roz_Kod: '046', Roz_Opis: '46' }],
  colors: [{ Kol_Kod: '50', Kol_Opis: 'CZARNY' }],
  stocks: [{ Tow_Kod: '123', Tow_Opis: 'Amanda' }],
  stateData: [],
  fetchSizes: jest.fn(),
  fetchColors: jest.fn(),
  fetchStock: jest.fn(),
};

const renderScreen = () => render(
  <GlobalStateContext.Provider value={contextValue}>
    <Dashboard />
  </GlobalStateContext.Provider>
);

const startVerification = async (screen) => {
  fireEvent.press(screen.getByText('Wybierz użytkownika...'));
  fireEvent.press(screen.getByText('Punkt A'));
  fireEvent.press(screen.getByTestId('start-verification'));
  await waitFor(() => expect(screen.getByText('Dobrane w systemie (3)')).toBeTruthy());
};

// Skan kamerą: skaner przyjmuje kolejny kod dopiero po wznowieniu (kamera ma wtedy znów onBarcodeScanned)
const scanCode = async (screen, data) => {
  await waitFor(() => expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeDefined(), { timeout: 3000 });
  await act(async () => {
    await screen.getByTestId('camera-view').props.onBarcodeScanned({ data });
  });
};

describe('Sprawdź - weryfikacja kurtek dobranych w systemie', () => {
  beforeEach(() => {
    tokenService.authenticatedFetch.mockReset();
    tokenService.authenticatedFetch.mockImplementation((url) => {
      if (url.includes('/verification/jackets/u1/')) {
        return response({ success: true, data: { jackets, totalJackets: jackets.length } });
      }
      if (url.includes('/excel/goods/get-all-goods')) {
        return response({ goods: [{ _id: 'g1', code: '9876500000000', fullName: 'Kasia BRĄZ', category: 'Kurtki kożuchy futra' }] });
      }
      if (url.includes('/verification/barcode/')) {
        return response({ success: false }, false, 404);
      }
      return response({});
    });
  });

  test('„Rozpocznij weryfikację” pobiera listę dobranych dla punktu i daty (data lokalna)', async () => {
    const screen = renderScreen();
    await startVerification(screen);

    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(tokenService.authenticatedFetch).toHaveBeenCalledWith(`http://mock.api/verification/jackets/u1/${localDate}`);
    expect(screen.getByText('Amanda CZARNY 44')).toBeTruthy();
    expect(screen.getByText('Amanda CZARNY 46')).toBeTruthy();
    expect(screen.getByText('0/2')).toBeTruthy();
    expect(screen.getByTestId('verification-progress').props.children.join('')).toBe('0/3 (0%)');
    expect(screen.getByText('Zeskanowane (0)')).toBeTruthy();
    screen.unmount();
  });

  test('skan: zgodna, nadwyżka spoza dobranych, obcy kod odrzucony; wynik bez zapisu na serwerze', async () => {
    const screen = renderScreen();
    await startVerification(screen);

    fireEvent.press(screen.getByTestId('open-scanner'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());

    await scanCode(screen, CODE_44);
    await waitFor(() => expect(screen.getByText('Zgodna: Amanda CZARNY 44 (1/2)')).toBeTruthy());

    await scanCode(screen, CODE_OUTSIDE);
    await waitFor(() => expect(screen.getByText('Nie było w dobieranych: Kasia BRĄZ 40')).toBeTruthy());

    await scanCode(screen, 'QR-XYZ');
    await waitFor(() => expect(screen.getByText(/Nieznany kod: QR-XYZ/)).toBeTruthy());

    // Zatwierdź: 2 sztuki trafiają na listę ekranu
    fireEvent.press(screen.getByText('Zatwierdź (2)'));
    await waitFor(() => expect(screen.getByText('Dodano do listy: 2 szt.')).toBeTruthy());
    fireEvent.press(screen.getByTestId('scanner-close'));

    await waitFor(() => expect(screen.getByText('Zeskanowane (2)')).toBeTruthy());
    expect(screen.getByText('Nie było w dobieranych')).toBeTruthy();
    expect(screen.getByText('Zgodna (1/2)')).toBeTruthy();

    // Porównanie: braki 1x44 + 1x46, nadwyżka 1x Kasia
    fireEvent.press(screen.getByTestId('check-verification'));
    await waitFor(() => expect(screen.getByText('Dobrane vs zeskanowane')).toBeTruthy());
    expect(screen.getByText('Dobrane')).toBeTruthy();
    expect(screen.getByTestId('stat-expected').props.children).toBe(3);
    expect(screen.getByTestId('stat-scanned').props.children).toBe(2);
    expect(screen.getByTestId('stat-missing').props.children).toBe(2);
    expect(screen.getByTestId('stat-excess').props.children).toBe(1);
    expect(screen.getByText('Dobrane: 2, zeskanowano: 1')).toBeTruthy();
    expect(screen.getByText('Nie było w dobieranych, zeskanowano: 1')).toBeTruthy();
    expect(screen.getByText('Zamknij')).toBeTruthy();

    // Nic nie jest zapisywane: żadnych zapytań POST/PUT/DELETE
    const writes = tokenService.authenticatedFetch.mock.calls.filter(([, options]) => options && options.method && options.method !== 'GET');
    expect(writes).toEqual([]);
    screen.unmount();
  }, 20000);
});
