import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import ScanCamera from '../../components/scanner/ScanCamera';

// Wspólny skaner (sprzedaż, zaliczka, Cudzych, Szukaj, Remanent, „Sprawdź”):
// inteligentna ramka, „Odczytaj ze zdjęcia”, „Wpisz kod”

const mockScanFromURLAsync = jest.fn();
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props) => React.createElement(View, { testID: 'camera-view', ...props }),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
    scanFromURLAsync: (...args) => mockScanFromURLAsync(...args),
  };
});

const CODE = '0040600300001'; // EAN-13 z poprawną cyfrą kontrolną

// kamera podaje kilka klatek z tym samym kodem - ramka przyjmuje kod po 3 zgodnych odczytach
const cameraFrames = async (screen, data, frames = 3) => {
  for (let frame = 0; frame < frames; frame += 1) {
    await act(async () => {
      screen.getByTestId('camera-view').props.onBarcodeScanned?.({ data, type: 'code128' });
    });
  }
};

describe('ScanCamera', () => {
  beforeEach(() => {
    mockScanFromURLAsync.mockReset();
    ImagePicker.launchImageLibraryAsync.mockReset();
  });

  test('kod przyjęty dopiero po kilku zgodnych odczytach w ramce', async () => {
    const onScanned = jest.fn();
    const screen = render(<ScanCamera onScanned={onScanned} />);

    await cameraFrames(screen, CODE, 2);
    expect(onScanned).not.toHaveBeenCalled();
    await cameraFrames(screen, CODE, 1);
    expect(onScanned).toHaveBeenCalledWith({ data: CODE, type: 'code128' });
  });

  test('EAN-13 ze złą cyfrą kontrolną jest odrzucany', async () => {
    const onScanned = jest.fn();
    const screen = render(<ScanCamera onScanned={onScanned} />);

    await cameraFrames(screen, '0040600300009', 5);
    expect(onScanned).not.toHaveBeenCalled();
  });

  test('wstrzymany skaner: bez odczytów z kamery i bez przycisków', () => {
    const screen = render(<ScanCamera onScanned={jest.fn()} enabled={false} />);

    expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined();
    expect(screen.queryByTestId('scan-from-photo')).toBeNull();
    expect(screen.queryByTestId('enter-code')).toBeNull();
  });

  test('tryb ciągły: po skanie ramka sama wraca i przyjmuje kolejną sztukę', async () => {
    jest.useFakeTimers();
    try {
      const onScanned = jest.fn();
      const screen = render(<ScanCamera onScanned={onScanned} continuous />);

      await cameraFrames(screen, CODE);
      expect(onScanned).toHaveBeenCalledTimes(1);
      await cameraFrames(screen, CODE);
      expect(onScanned).toHaveBeenCalledTimes(1); // ta sama sesja - jeszcze nie

      await act(async () => { jest.advanceTimersByTime(700); });
      await cameraFrames(screen, CODE);
      expect(onScanned).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('„Odczytaj ze zdjęcia” odczytuje kod z pliku i kończy jak skan', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///metka.jpg' }] });
    mockScanFromURLAsync.mockResolvedValueOnce([{ data: CODE, type: 'ean13' }]);
    const onScanned = jest.fn();
    const screen = render(<ScanCamera onScanned={onScanned} />);

    fireEvent.press(screen.getByTestId('scan-from-photo'));

    await waitFor(() => expect(onScanned).toHaveBeenCalledWith({ data: CODE, type: 'ean13' }));
    expect(mockScanFromURLAsync).toHaveBeenCalledWith('file:///metka.jpg', ['code128', 'ean13', 'qr']);
  });

  test('„Wpisz kod” z resolveName: kod z bazy przechodzi, spoza bazy zablokowany', async () => {
    const onScanned = jest.fn();
    const resolveName = (code) => (code === CODE ? 'Agnieszka CZARNY L' : null);
    const screen = render(<ScanCamera onScanned={onScanned} resolveName={resolveName} />);

    fireEvent.press(screen.getByTestId('enter-code'));
    fireEvent.changeText(screen.getByTestId('manual-code-input'), '9999999999999');
    await waitFor(() => expect(screen.getByTestId('manual-code-status')).toHaveTextContent('Kod niepoprawny - nie pasuje do bazy kodów'));
    expect(screen.getByTestId('manual-code-submit')).toBeDisabled();

    fireEvent.changeText(screen.getByTestId('manual-code-input'), CODE);
    await waitFor(() => expect(screen.getByTestId('manual-code-status')).toHaveTextContent('Agnieszka CZARNY L'));
    fireEvent.press(screen.getByTestId('manual-code-submit'));
    expect(onScanned).toHaveBeenCalledWith({ data: CODE, type: 'manual' });
  });

  test('własne okienko „Wpisz kod” ekranu (Remanent) i dodatkowe przyciski', () => {
    const onManualCode = jest.fn();
    const onExtra = jest.fn();
    const screen = render(
      <ScanCamera
        onScanned={jest.fn()}
        onManualCode={onManualCode}
        extraActions={[{ label: 'Wpisz ręcznie', icon: 'create-outline', onPress: onExtra, testID: 'enter-manually' }]}
      >
        <Text>nad kamerą</Text>
      </ScanCamera>
    );

    fireEvent.press(screen.getByTestId('enter-code'));
    expect(onManualCode).toHaveBeenCalled();
    expect(screen.queryByTestId('manual-code-input')).toBeNull();
    fireEvent.press(screen.getByTestId('enter-manually'));
    expect(onExtra).toHaveBeenCalled();
    expect(screen.getByText('nad kamerą')).toBeTruthy();
  });
});
