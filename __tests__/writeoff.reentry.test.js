import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';

// Stan (31.10.2026, pomiar „Przejście na Stan: gotowa po 4472 ms”): dawniej KAŻDE wejście na zakładkę zasłaniało listę
// ekranem ładowania na czas zapytań do serwera. Teraz ładowanie tylko przy pierwszym wejściu; przy kolejnych lista
// zostaje na ekranie, a świeże dane dochodzą w tle.

let focusEffect = null; // ostatni efekt wejścia na zakładkę - test wywołuje go ponownie („powrót na Stan”)
jest.mock('../services/useLiveRefresh', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useFocusEffect: (effect) => {
    const React = require('react');
    focusEffect = effect;
    React.useEffect(() => effect(), []);
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../services/tokenService', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('../services/logger', () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn() }));
jest.mock('../services/appAlert', () => ({ appAlert: jest.fn() }));
jest.mock('../config/api', () => ({ getApiUrl: (endpoint) => `http://localhost:3000${endpoint}` }));

import tokenService from '../services/tokenService';
import WriteOff from '../app/(tabs)/writeoff';
import { GlobalStateContext } from '../context/GlobalState';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const user = { symbol: 'P', email: 'p@test.pl', location: 'Zakopane', sellingPoint: 'Parzygnat' };
const points = [{ _id: 'u-t', symbol: 'T', role: 'user', location: 'Zakopane', sellingPoint: 'Tata' }];
const stateData = [{ id: 'p-ada', fullName: 'Ada CZERWONY', size: 'XL', symbol: 'P', barcode: '555' }];

let releaseState = null; // zapytanie o stan punktu „wisi”, dopóki test go nie zwolni (wolny serwer)
beforeEach(() => {
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url) => {
    if (url.split('?')[0].endsWith('/state')) {
      if (releaseState === 'hold') return new Promise((resolve) => { releaseState = () => resolve(json(stateData)); });
      return json(stateData);
    }
    if (url.split('?')[0].endsWith('/transfer')) return json([]);
    if (url.split('?')[0].endsWith('/sales/get-all-sales')) return json([]);
    return json({});
  });
});

test('pierwsze wejście - ładowanie; powrót na zakładkę - lista od razu, odświeżenie w tle bez ekranu ładowania', async () => {
  const screen = render(
    <GlobalStateContext.Provider value={{
      user, stateData, users: points,
      fetchState: jest.fn(() => Promise.resolve()),
      fetchUsers: jest.fn(() => Promise.resolve()),
      getFilteredSellingPoints: () => points,
    }}>
      <WriteOff />
    </GlobalStateContext.Provider>
  );
  await waitFor(() => expect(screen.getByTestId('writeoff-item-p-ada')).toBeTruthy());
  const callsBefore = tokenService.authenticatedFetch.mock.calls.length;

  // powrót na Stan przy wolnym serwerze: lista zostaje na ekranie przez cały czas pobierania
  releaseState = 'hold';
  await act(async () => { focusEffect(); });
  await waitFor(() => expect(tokenService.authenticatedFetch.mock.calls.length).toBeGreaterThan(callsBefore));
  expect(screen.getByTestId('writeoff-item-p-ada')).toBeTruthy();
  await act(async () => { releaseState(); });
  expect(screen.getByTestId('writeoff-item-p-ada')).toBeTruthy();
  releaseState = null;
  screen.unmount();
});
