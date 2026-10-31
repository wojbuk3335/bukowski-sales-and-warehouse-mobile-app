/**
 * Aktualizacje OTA (31.10.2026): jedno sprawdzanie naraz dla całej aplikacji (ekran logowania, blokada aplikacji,
 * otwarcie i powrót z tła), pobranie w tle bez wgrywania, wgranie od razu, gdy wersja jest już pobrana.
 * Dawniej sprawdzał tylko ekran logowania - kto odblokowywał aplikację blokadą, zostawał na starej wersji.
 */
import React from 'react';
import { AppState } from 'react-native';
import { render, act, waitFor } from '@testing-library/react-native';
import {
  checkAndApplyUpdate, prefetchUpdate, isUpdateDownloaded, __resetUpdatesForTests, __setUpdatesModuleForTests,
} from '../services/appUpdates';
import AppUpdater, { UPDATE_AFTER_BACKGROUND_MS } from '../components/AppUpdater';

const makeUpdates = ({ available = true } = {}) => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(() => Promise.resolve({ isAvailable: available })),
  fetchUpdateAsync: jest.fn(() => Promise.resolve({ isNew: true })),
  reloadAsync: jest.fn(() => Promise.resolve()),
});

let updates;
const realDev = global.__DEV__;
beforeEach(() => {
  global.__DEV__ = false; // w testach __DEV__ = true - aktualizacje byłyby pomijane
  __resetUpdatesForTests();
  updates = makeUpdates();
  __setUpdatesModuleForTests(updates);
});
afterAll(() => {
  global.__DEV__ = realDev;
});

test('kilka miejsc naraz (logowanie, blokada, otwarcie): jedno sprawdzenie, jedno pobranie, jedno przeładowanie', async () => {
  const results = await Promise.all([checkAndApplyUpdate(), checkAndApplyUpdate(), checkAndApplyUpdate()]);
  expect(results.map((r) => r.status)).toEqual(['reloading', 'reloading', 'reloading']);
  expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
  expect(updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
});

test('pobranie w tle bez wgrywania; następne sprawdzenie wgrywa od razu (bez ponownego sprawdzania)', async () => {
  expect(await prefetchUpdate()).toBe('downloaded');
  expect(updates.reloadAsync).not.toHaveBeenCalled();
  expect(isUpdateDownloaded()).toBe(true);
  const onApplying = jest.fn();
  expect((await checkAndApplyUpdate({ onApplying })).status).toBe('reloading');
  expect(onApplying).toHaveBeenCalled();
  expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
});

test('brak nowej wersji - bez pobierania; wolna sieć - „timeout”, a pobranie dokańcza się w tle', async () => {
  __resetUpdatesForTests();
  updates = makeUpdates({ available: false });
  __setUpdatesModuleForTests(updates);
  expect((await checkAndApplyUpdate()).status).toBe('up-to-date');
  expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();

  __resetUpdatesForTests();
  let answer;
  updates = makeUpdates();
  updates.checkForUpdateAsync = jest.fn(() => new Promise((resolve) => { answer = resolve; }));
  __setUpdatesModuleForTests(updates);
  expect((await checkAndApplyUpdate({ timeoutMs: 20 })).status).toBe('timeout');
  await act(async () => { answer({ isAvailable: true }); });
  await waitFor(() => expect(isUpdateDownloaded()).toBe(true)); // gotowa na następną bezpieczną chwilę
  expect(updates.reloadAsync).not.toHaveBeenCalled();
});

test('AppUpdater: otwarcie - sprawdzenie i wgranie; powrót po 5 min - wgranie; krótki powrót - tylko pobranie', async () => {
  let listener;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => { listener = fn; return { remove: jest.fn() }; });
  updates = makeUpdates({ available: false });
  __setUpdatesModuleForTests(updates);
  const screen = render(<AppUpdater />);
  await waitFor(() => expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)); // otwarcie aplikacji

  // krótki powrót z tła: nowa wersja tylko się pobiera
  updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
  const now = Date.now();
  const spyNow = jest.spyOn(Date, 'now');
  spyNow.mockReturnValue(now);
  act(() => listener('background'));
  spyNow.mockReturnValue(now + 60 * 1000);
  await act(async () => { listener('active'); });
  await waitFor(() => expect(updates.fetchUpdateAsync).toHaveBeenCalledTimes(1));
  expect(updates.reloadAsync).not.toHaveBeenCalled();

  // powrót po 5 min: wgranie pobranej wersji
  act(() => listener('background'));
  spyNow.mockReturnValue(now + 60 * 1000 + UPDATE_AFTER_BACKGROUND_MS);
  await act(async () => { listener('active'); });
  await waitFor(() => expect(updates.reloadAsync).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId('app-updater')).toBeTruthy(); // nakładka „Trwa aktualizacja…” na czas wgrywania
  spyNow.mockRestore();
  screen.unmount();
});
