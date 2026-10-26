import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import Remanent from '../../app/(tabs)/remanent';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';

// Audyt Remanentu 26.10.2026 - utrata skanów:
//  - X / wstecz przy niezatwierdzonych skanach pyta (wróć / odrzuć), nie kasuje po cichu,
//  - niezatwierdzone skany wracają po zabiciu aplikacji (pamięć telefonu),
//  - skany zrobione w trakcie zapisu zostają; ponowna próba tego samego zestawu ma ten sam klucz zatwierdzenia,
//  - odmowa zapisu (409) nie zamyka skanera (dawniej spinner odmontowywał skaner i skany ginęły).

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
jest.mock('../../config/api', () => ({ getApiUrl: (endpoint) => `http://mock.api${endpoint}` }));

const CODE_44 = '1234504400007';
const CODE_46 = '1234504600001';
const response = (data, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
const contextValue = {
  user: { email: 'p01@test.com', symbol: 'P01', sellingPoint: 'P01' },
  sizes: [{ Roz_Kod: '044', Roz_Opis: '44' }, { Roz_Kod: '046', Roz_Opis: '46' }],
  colors: [{ Kol_Kod: '45', Kol_Opis: 'CZARNY' }],
  stocks: [{ Tow_Kod: '123', Tow_Opis: 'Amanda' }],
  stateData: [],
  fetchSizes: jest.fn(), fetchColors: jest.fn(), fetchStock: jest.fn(),
};
const session = { _id: 's1', startedAt: new Date().toISOString(), items: [] };
const pointState = [
  { barcode: CODE_44, fullName: 'Amanda CZARNY', size: '44', price: 1000 },
  { barcode: CODE_46, fullName: 'Amanda CZARNY', size: '46', price: 1000 },
];

let postHandler;
let slowSessionFetch = false; // odświeżenie sesji trwa (jak prawdziwa sieć) - spinner zdążyłby zastąpić ekran
const posts = () => tokenService.authenticatedFetch.mock.calls.filter(([url, o]) => url.endsWith('/remanent/session/s1/items') && o?.method === 'POST');
const setupFetch = () => {
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
    if (url.endsWith('/remanent/current-state')) return response({ data: pointState });
    if (url.endsWith('/remanent/session/current')) {
      if (slowSessionFetch) return new Promise((resolve) => setTimeout(() => resolve(response({ session })), 250));
      return response({ session });
    }
    if (url.includes('/excel/goods/get-all-goods')) return response({ goods: [] });
    if (url.endsWith('/remanent/session/s1/items') && options.method === 'POST') return postHandler(options);
    return response({});
  });
};
const okPost = (options) => {
  const body = JSON.parse(options.body);
  return response({ added: body.items.map((item, index) => ({ ...item, _id: `i${Date.now()}${index}` })) });
};

const renderRemanent = () => render(
  <GlobalStateContext.Provider value={contextValue}>
    <Remanent />
  </GlobalStateContext.Provider>
);
const openScanner = async (screen) => {
  await waitFor(() => expect(screen.getByText('Remanent rozpoczęty')).toBeTruthy());
  fireEvent.press(screen.getByText('Skanuj'));
  await waitFor(() => expect(screen.getByText('Skanuj kody kurtek')).toBeTruthy());
};
const scanCode = async (screen, data) => {
  await waitFor(() => expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeDefined(), { timeout: 3000 });
  for (let frame = 0; frame < 3; frame += 1) {
    await act(async () => { await screen.getByTestId('camera-view').props.onBarcodeScanned?.({ data }); });
  }
};

beforeEach(async () => {
  const storage = require('@react-native-async-storage/async-storage');
  await (storage.default || storage).clear();
  postHandler = okPost;
  slowSessionFetch = false;
  setupFetch();
});

describe('Remanent - niezatwierdzone skany nie giną', () => {
  test('X przy niezatwierdzonych skanach pyta; „Wróć” zostawia skany, „Odrzuć” zamyka i czyści', async () => {
    const screen = renderRemanent();
    await openScanner(screen);
    await scanCode(screen, CODE_44);
    await waitFor(() => expect(screen.getByText('Zatwierdź (1)')).toBeTruthy());

    fireEvent.press(screen.getByTestId('scanner-close'));
    await waitFor(() => expect(screen.getByTestId('scanner-close-prompt')).toBeTruthy());
    fireEvent.press(screen.getByTestId('scanner-close-back'));
    await waitFor(() => expect(screen.queryByTestId('scanner-close-prompt')).toBeNull());
    expect(screen.getByText('Zatwierdź (1)')).toBeTruthy(); // skan został

    fireEvent.press(screen.getByTestId('scanner-close'));
    await waitFor(() => expect(screen.getByTestId('scanner-close-prompt')).toBeTruthy());
    fireEvent.press(screen.getByTestId('scanner-close-discard'));
    await waitFor(() => expect(screen.queryByText('Skanuj kody kurtek')).toBeNull());
    expect(posts()).toHaveLength(0);

    // po odrzuceniu nic nie wraca
    fireEvent.press(screen.getByText('Skanuj'));
    await waitFor(() => expect(screen.getByText('Skanuj kody kurtek')).toBeTruthy());
    expect(screen.queryByText(/Przywrócono/)).toBeNull();
    screen.unmount();
  }, 20000);

  test('zabicie aplikacji: niezatwierdzone skany wracają z pamięci telefonu po ponownym otwarciu skanera', async () => {
    const first = renderRemanent();
    await openScanner(first);
    await scanCode(first, CODE_44);
    await waitFor(() => expect(first.getByText('Zatwierdź (1)')).toBeTruthy());
    const storage = require('@react-native-async-storage/async-storage');
    await waitFor(async () => expect(await (storage.default || storage).getItem('scanner-draft:remanent-P01')).toContain(CODE_44));
    first.unmount(); // jak zabicie aplikacji bez „Zatwierdź”

    const second = renderRemanent();
    await openScanner(second);
    await waitFor(() => expect(second.getByText('Przywrócono 1 niezatwierdzonych skanów - zatwierdź je.')).toBeTruthy());
    expect(second.getByText('Zatwierdź (1)')).toBeTruthy();
    fireEvent.press(second.getByText('Zatwierdź (1)'));
    await waitFor(() => expect(second.getByText('Zapisano 1 szt.')).toBeTruthy());
    expect(JSON.parse(posts()[0][1].body).items[0].code).toBe(CODE_44);
    await waitFor(async () => expect(await (storage.default || storage).getItem('scanner-draft:remanent-P01')).toBeNull());
    second.unmount();
  }, 20000);

  test('skan w trakcie zapisu zostaje; ponowna próba tego samego zestawu ma ten sam klucz zatwierdzenia', async () => {
    let release;
    postHandler = () => new Promise((resolve) => { release = () => resolve(response({ added: [{ code: CODE_44, name: 'Amanda CZARNY 44', _id: 'i1' }] })); });
    const screen = renderRemanent();
    await openScanner(screen);
    await scanCode(screen, CODE_44);
    await waitFor(() => expect(screen.getByText('Zatwierdź (1)')).toBeTruthy());
    fireEvent.press(screen.getByText('Zatwierdź (1)'));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await scanCode(screen, CODE_46); // zeskanowana, gdy zapis jeszcze trwa
    await waitFor(() => expect(screen.getByText('Zatwierdź (2)')).toBeTruthy());
    await act(async () => { release(); });
    await waitFor(() => expect(screen.getByText('Zapisano 1 szt.')).toBeTruthy());
    expect(screen.getByText('Zatwierdź (1)')).toBeTruthy(); // 46 została na liście
    const firstBatch = JSON.parse(posts()[0][1].body).batchId;
    expect(firstBatch).toBeTruthy();

    // druga sztuka: pierwsza próba pada (brak odpowiedzi), druga próba tego samego zestawu = ten sam klucz
    postHandler = () => response({ message: 'Błąd' }, false, 500);
    fireEvent.press(screen.getByText('Zatwierdź (1)'));
    await waitFor(() => expect(posts()).toHaveLength(2));
    postHandler = okPost;
    fireEvent.press(screen.getByText('Zatwierdź (1)'));
    await waitFor(() => expect(posts()).toHaveLength(3));
    const second = JSON.parse(posts()[1][1].body).batchId;
    const third = JSON.parse(posts()[2][1].body).batchId;
    expect(second).toBe(third);
    expect(second).not.toBe(firstBatch);
    screen.unmount();
  }, 20000);

  test('odmowa zapisu (409: remanent zamknięty na innym telefonie) nie zamyka skanera i nie kasuje skanów', async () => {
    postHandler = () => response({ message: 'Remanent nie jest otwarty. Odśwież ekran.' }, false, 409);
    const screen = renderRemanent();
    await openScanner(screen);
    await scanCode(screen, CODE_44);
    await waitFor(() => expect(screen.getByText('Zatwierdź (1)')).toBeTruthy());
    slowSessionFetch = true;
    fireEvent.press(screen.getByText('Zatwierdź (1)'));
    await waitFor(() => expect(screen.getByText('Remanent nie jest otwarty. Odśwież ekran.')).toBeTruthy());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); }); // odświeżenie w toku
    expect(screen.queryByText('Ładowanie remanentów...')).toBeNull(); // bez pełnoekranowego spinnera
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(screen.getByText('Skanuj kody kurtek')).toBeTruthy(); // skaner nadal otwarty
    expect(screen.getByText('Zatwierdź (1)')).toBeTruthy(); // skan nadal na liście
    expect(screen.queryByText('Ładowanie remanentów...')).toBeNull();
    screen.unmount();
  }, 20000);
});
