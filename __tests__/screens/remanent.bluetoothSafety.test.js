import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import Remanent from '../../app/(tabs)/remanent';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';
import { playScanAlarm } from '../../services/scanAlarm';
import { ean13Checksum, jacketCodeForSize } from '../../utils/productName';

// Remanent z czytnikiem Bluetooth - zabezpieczenia po remanencie 11.11.2026 (10 „kurtek, których nie ma” i 10 braków,
// potem 8 kurtek „na stanie 1, zeskanowano 2” i „Teresa NIEBIESKI 48” ze złą cyfrą kontrolną zamiast czarnej Teresy):
//  - zniekształcony kod (zła cyfra kontrolna) jest odrzucany z alarmem, nie dopisywany jako nadwyżka
//  - telefon w kieszeni: przy czytniku żadnych pytań, każdy poprawny kod liczy się od razu (alarm = „nie policzono”)
//  - stary tekst pola oddany jeszcze raz przed wyczyszczeniem nie liczy kodu drugi raz (kurtki „×2”)

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
jest.mock('../../services/scanAlarm', () => ({ playScanAlarm: jest.fn(() => true), preloadScanAlarm: jest.fn() }));
jest.mock('../../components/LogoutButton', () => () => null);
jest.mock('../../services/useLiveRefresh', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../config/api', () => ({ getApiUrl: (endpoint) => `http://mock.api${endpoint}` }));

const CODE_44 = jacketCodeForSize('12345', '044'); // 1 sztuka na stanie
const CODE_46 = jacketCodeForSize('12345', '046'); // 2 identyczne sztuki na stanie
const CODE_50 = jacketCodeForSize('12345', '050'); // prawdziwy kod, ale tej sztuki nie ma na stanie
// Zniekształcony odczyt CODE_44: ten sam model i kolor (wygląda jak prawdziwa kurtka), zła cyfra kontrolna
const MISREAD_44 = `${CODE_44.slice(0, 12)}${(Number(ean13Checksum(CODE_44.slice(0, 12))) + 1) % 10}`;

const response = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
const contextValue = {
  user: { email: 'p01@test.com', symbol: 'P01', sellingPoint: 'P01' },
  sizes: [{ Roz_Kod: '044', Roz_Opis: '44' }, { Roz_Kod: '046', Roz_Opis: '46' }, { Roz_Kod: '050', Roz_Opis: '50' }],
  colors: [{ Kol_Kod: '45', Kol_Opis: 'CZARNY' }],
  stocks: [{ Tow_Kod: '123', Tow_Opis: 'Amanda' }],
  stateData: [],
  fetchSizes: jest.fn(), fetchColors: jest.fn(), fetchStock: jest.fn(),
};
const session = { _id: 's1', startedAt: new Date().toISOString(), items: [] };
const pointState = [
  { barcode: CODE_44, fullName: 'Amanda CZARNY', size: '44', price: 1000 },
  { barcode: CODE_46, fullName: 'Amanda CZARNY', size: '46', price: 1000 },
  { barcode: CODE_46, fullName: 'Amanda CZARNY', size: '46', price: 1000 },
];

const renderRemanent = () => render(
  <GlobalStateContext.Provider value={contextValue}>
    <Remanent />
  </GlobalStateContext.Provider>
);
const openReader = async (screen) => {
  await waitFor(() => expect(screen.getByText('Remanent rozpoczęty')).toBeTruthy());
  fireEvent.press(screen.getByText('Skanuj'));
  await waitFor(() => expect(screen.getByText('Skanuj kody kurtek')).toBeTruthy());
  const toReader = screen.queryByTestId('scan-mode-bluetooth');
  if (toReader) fireEvent.press(toReader);
  return screen.findByTestId('bluetooth-scan-input');
};
const scan = async (screen, code) => {
  // jak w telefonie: po kodzie pole jest czyszczone, kolejny kod zaczyna się od pustego pola
  const input = screen.getByTestId('bluetooth-scan-input');
  await act(async () => { fireEvent.changeText(input, ''); });
  await act(async () => { fireEvent.changeText(input, code); });
  await act(async () => { fireEvent(input, 'submitEditing'); });
};

beforeEach(async () => {
  const storage = require('@react-native-async-storage/async-storage');
  await (storage.default || storage).clear();
  playScanAlarm.mockClear();
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
    if (url.endsWith('/remanent/current-state')) return response({ data: pointState });
    if (url.endsWith('/remanent/session/current')) return response({ session });
    if (url.includes('/excel/goods/get-all-goods')) return response({ goods: [] });
    if (url.endsWith('/remanent/session/s1/items') && options.method === 'POST') {
      const body = JSON.parse(options.body);
      return response({ added: body.items.map((item, index) => ({ ...item, _id: `i${Date.now()}${index}` })) });
    }
    return response({});
  });
});

test('zniekształcony kod z czytnika (zła cyfra kontrolna) - odrzucony z alarmem i czerwonym ekranem, nic nie dopisane', async () => {
  const screen = renderRemanent();
  await openReader(screen);

  await scan(screen, MISREAD_44);
  // komunikat nad skanerem i na czerwonym ekranie alarmu
  await waitFor(() => expect(screen.getAllByText(`Błędny odczyt: ${MISREAD_44}\nTaki kod nie istnieje (zła cyfra kontrolna) - zeskanuj metkę jeszcze raz.`)).toHaveLength(2));
  expect(playScanAlarm).toHaveBeenCalled();
  expect(screen.getByTestId('scan-alarm-flash')).toBeTruthy();
  expect(screen.queryByText(/Zatwierdź \(/)).toBeNull();

  // ponowny skan tej samej metki (dobry odczyt) przechodzi normalnie, bez alarmu
  playScanAlarm.mockClear();
  await scan(screen, CODE_44);
  await waitFor(() => expect(screen.getByText('Zatwierdź (1)')).toBeTruthy());
  expect(playScanAlarm).not.toHaveBeenCalled();
  screen.unmount();
}, 20000);

test('telefon w kieszeni: przy czytniku żadnych pytań - sztuki ponad stan i spoza stanu liczą się od razu, bez alarmu', async () => {
  const screen = renderRemanent();
  await openReader(screen);

  await scan(screen, CODE_46);
  await scan(screen, CODE_46);
  await scan(screen, CODE_46); // trzecia sztuka przy stanie 2
  await scan(screen, CODE_50); // prawdziwy kod spoza stanu
  await waitFor(() => expect(screen.getByText('Zatwierdź (4)')).toBeTruthy());
  expect(screen.queryByTestId('duplicate-prompt-title')).toBeNull();
  expect(playScanAlarm).not.toHaveBeenCalled(); // alarm = tylko „nie policzono, zeskanuj jeszcze raz”
  screen.unmount();
}, 20000);

test('kurtki „×2”: stary tekst pola, który telefon odda jeszcze raz przed wyczyszczeniem, nie liczy kodu drugi raz', async () => {
  const screen = renderRemanent();
  await openReader(screen);
  const input = screen.getByTestId('bluetooth-scan-input');

  await act(async () => { fireEvent.changeText(input, CODE_44); });
  await act(async () => { fireEvent(input, 'submitEditing'); });
  await waitFor(() => expect(screen.getByText('Zatwierdź (1)')).toBeTruthy());

  // pole nie zdążyło się wyczyścić: telefon oddaje stary kod + drugi znak Entera, a potem + następny kod
  await act(async () => { fireEvent.changeText(input, `${CODE_44}\n`); });
  await act(async () => { fireEvent.changeText(input, `${CODE_44}\n${CODE_46}\n`); });
  await waitFor(() => expect(screen.getByText('Zatwierdź (2)')).toBeTruthy());
  await new Promise((resolve) => setTimeout(resolve, 400)); // nic więcej nie dochodzi (także po przerwie)
  expect(screen.getByText('Zatwierdź (2)')).toBeTruthy();
  expect(screen.getByText('Zeskanowano: 2 szt. (2 produktów)')).toBeTruthy();
  screen.unmount();
}, 20000);
