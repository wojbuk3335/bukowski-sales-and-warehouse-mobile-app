/**
 * Tryb „Czytnik Zebra (SSI)” w skanerze (12.11.2026): kody przychodzą z SDK jednym zdarzeniem (bez pola tekstowego),
 * zero na początku jak przy kamerze (EAN-13 / UPC-A), kod parowania z ekranu, adres Bluetooth telefonu gdy SDK go nie zna.
 * Tryb widoczny tylko, gdy moduł jest w buildzie.
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props) => React.createElement(View, { testID: 'camera-view', ...props }),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
    scanFromURLAsync: jest.fn(),
  };
});

const ssi = {
  available: true,
  state: { available: true, started: true, scanner: null },
  barcodeHandler: null,
  stateHandler: null,
};
jest.mock('../../services/zebraSsi', () => ({
  isSsiAvailable: () => ssi.available,
  startSsi: jest.fn(() => Promise.resolve(true)),
  onBarcode: jest.fn((handler) => { ssi.barcodeHandler = handler; return { remove: jest.fn(() => { ssi.barcodeHandler = null; }) }; }),
  onStateChange: jest.fn((handler) => { ssi.stateHandler = handler; return () => { ssi.stateHandler = null; }; }),
  getState: () => ssi.state,
  pairingBarcodePng: jest.fn(({ btAddress }) => Promise.resolve(btAddress ? 'UElORw==' : null)),
  getSavedBtAddress: jest.fn(() => Promise.resolve('')),
  saveBtAddress: jest.fn((address) => Promise.resolve(String(address).trim().toUpperCase())),
  isValidBtAddress: (address) => /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(String(address || '').trim()),
  scannerFeedback: jest.fn(() => Promise.resolve(true)),
  refreshStatus: jest.fn(() => Promise.resolve(ssi.state)),
  connectScanner: jest.fn(() => Promise.resolve(true)),
}));

import ScanCamera from '../../components/scanner/ScanCamera';
import { startSsi, pairingBarcodePng, saveBtAddress } from '../../services/zebraSsi';

const CODE = '0040600300001';

const openSsi = async (onScanned = jest.fn()) => {
  const screen = render(<ScanCamera onScanned={onScanned} active />);
  await act(async () => {});
  const toBluetooth = screen.queryByTestId('scan-mode-bluetooth');
  if (toBluetooth) fireEvent.press(toBluetooth); // z kamery albo z zapamiętanego trybu
  await act(async () => {});
  const toSsi = screen.queryByTestId('scan-mode-ssi');
  if (toSsi) fireEvent.press(toSsi);
  await waitFor(() => expect(screen.getByTestId('ssi-panel')).toBeTruthy());
  return screen;
};

beforeEach(() => {
  jest.clearAllMocks();
  ssi.available = true;
  ssi.state = { available: true, started: true, scanner: null };
  ssi.barcodeHandler = null;
  ssi.stateHandler = null;
});

test('tryb SSI: SDK startuje, kod z czytnika idzie dalej jako jedna całość (zero na początku z typu kodu)', async () => {
  const onScanned = jest.fn();
  const screen = await openSsi(onScanned);
  expect(startSsi).toHaveBeenCalled();
  expect(screen.getByTestId('ssi-status').props.children).toMatch(/niepołączony/);

  await act(async () => { ssi.stateHandler({ available: true, started: true, scanner: { id: 1, name: 'DS2278' } }); });
  expect(screen.getByTestId('ssi-status').props.children).toMatch(/Połączony: DS2278/);

  await act(async () => { ssi.barcodeHandler({ data: CODE.slice(1), type: 0x0b, scannerId: 1 }); }); // EAN-13 bez zera
  expect(onScanned).toHaveBeenCalledWith({ data: CODE, type: 'bluetooth', source: 'ssi' });
  await act(async () => { ssi.barcodeHandler({ data: 'ABC-123', type: 0x03, scannerId: 1 }); }); // inny kod bez zmian
  expect(onScanned).toHaveBeenLastCalledWith({ data: 'ABC-123', type: 'bluetooth', source: 'ssi' });
  expect(screen.getByTestId('ssi-last').props.children.join('')).toContain('ABC-123');
  expect(screen.queryByTestId('bluetooth-scan-input')).toBeNull(); // bez ukrytego pola klawiatury
});

test('parowanie: SDK nie zna adresu Bluetooth telefonu → wpisanie adresu → kod parowania na ekranie', async () => {
  const screen = await openSsi();
  fireEvent.press(screen.getByTestId('ssi-pair'));
  const input = await screen.findByTestId('ssi-bt-address');
  expect(pairingBarcodePng).toHaveBeenCalledWith({ btAddress: '', factoryDefaults: true, protocol: 'classic' });

  fireEvent.changeText(input, 'zly adres');
  fireEvent.press(screen.getByTestId('ssi-bt-address-save'));
  await waitFor(() => expect(screen.getByText(/Adres Bluetooth ma postać/)).toBeTruthy());
  expect(saveBtAddress).not.toHaveBeenCalled();

  fireEvent.changeText(input, 'aa:bb:cc:dd:ee:ff');
  fireEvent.press(screen.getByTestId('ssi-bt-address-save'));
  await waitFor(() => expect(screen.getByTestId('ssi-pairing-image')).toBeTruthy());
  expect(saveBtAddress).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF');
  expect(pairingBarcodePng).toHaveBeenLastCalledWith({ btAddress: 'AA:BB:CC:DD:EE:FF', factoryDefaults: true, protocol: 'classic' });

  // przełączenie na Bluetooth LE buduje kod od nowa tym protokołem
  fireEvent.press(screen.getByTestId('ssi-protocol-ble'));
  await waitFor(() => expect(pairingBarcodePng).toHaveBeenLastCalledWith({ btAddress: 'AA:BB:CC:DD:EE:FF', factoryDefaults: true, protocol: 'ble' }));
});

test('czytnik widoczny dla SDK, ale bez sesji: przycisk „Połącz” wywołuje connectScanner', async () => {
  const { connectScanner } = require('../../services/zebraSsi');
  const screen = await openSsi();
  await act(async () => { ssi.stateHandler({ available: true, started: true, scanner: null, error: '', availableScanners: [{ id: 7, name: 'DS2278', model: '' }] }); });
  fireEvent.press(screen.getByTestId('ssi-connect-7'));
  expect(connectScanner).toHaveBeenCalledWith(7);
  expect(screen.queryByTestId('ssi-nothing-seen')).toBeNull();
});

test('wstrzymany skaner (formularz otwarty): kod z czytnika SSI bez odbiorcy', async () => {
  const onScanned = jest.fn();
  const screen = render(<ScanCamera onScanned={onScanned} active enabled={false} />);
  await act(async () => {});
  // tryb SSI zapamiętany z poprzedniego testu (AsyncStorage) albo przełączamy ręcznie przez panel klawiatury
  if (!screen.queryByTestId('ssi-panel')) {
    const toSsi = screen.queryByTestId('scan-mode-ssi');
    if (toSsi) fireEvent.press(toSsi);
  }
  await waitFor(() => expect(screen.getByTestId('ssi-panel')).toBeTruthy());
  await act(async () => { ssi.barcodeHandler?.({ data: CODE, type: 0x0b, scannerId: 1 }); });
  expect(onScanned).not.toHaveBeenCalled();
});

test('bez modułu w buildzie trybu SSI nie ma', async () => {
  ssi.available = false;
  const screen = render(<ScanCamera onScanned={jest.fn()} active />);
  await act(async () => {});
  expect(screen.queryByTestId('scan-mode-ssi')).toBeNull();
  expect(screen.queryByTestId('ssi-panel')).toBeNull();
});
