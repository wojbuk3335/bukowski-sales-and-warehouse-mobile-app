import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';

// Odświeżanie na żywo (29.10.2026) działa tylko, gdy ekran jest na wierzchu: zakładki i ekrany stosu
// nie odmontowują się, więc bez tego każdy odwiedzony ekran odświeżał się dalej w tle (np. pod Historią).
// Poza nawigatorem (testy) - jak dotąd, zawsze włączone.

const subscribers = [];
jest.mock('../../services/liveEvents', () => ({
  subscribeLiveEvents: jest.fn((listener) => {
    subscribers.push(listener);
    return () => { const i = subscribers.indexOf(listener); if (i >= 0) subscribers.splice(i, 1); };
  }),
  isLiveConnected: () => true,
}));

import useLiveRefresh from '../../services/useLiveRefresh';

const Host = ({ onRefresh, enabled }) => {
  useLiveRefresh(['goods'], onRefresh, { enabled });
  return <Text>host</Text>;
};

// Atrapa obiektu nawigacji: focus/blur sterowane z testu
const makeNavigation = (focusedAtStart) => {
  const handlers = { focus: [], blur: [] };
  let focused = focusedAtStart;
  return {
    isFocused: () => focused,
    addListener: (event, handler) => { handlers[event].push(handler); return () => { handlers[event] = handlers[event].filter((h) => h !== handler); }; },
    focus: () => { focused = true; handlers.focus.forEach((h) => h()); },
    blur: () => { focused = false; handlers.blur.forEach((h) => h()); },
  };
};

const emit = (type) => subscribers.forEach((listener) => listener(type, {}));

beforeEach(() => {
  jest.useFakeTimers();
  subscribers.length = 0;
});
afterEach(() => jest.useRealTimers());

test('ekran pod spodem (blur) nie subskrybuje; po powrocie na wierzch subskrybuje i odświeża; po zejściu przestaje', async () => {
  const onRefresh = jest.fn();
  const navigation = makeNavigation(false);
  render(
    <NavigationContext.Provider value={navigation}>
      <Host onRefresh={onRefresh} enabled />
    </NavigationContext.Provider>
  );
  expect(subscribers).toHaveLength(0);

  await act(async () => { navigation.focus(); });
  expect(subscribers).toHaveLength(1);
  await act(async () => { emit('goods'); await jest.advanceTimersByTimeAsync(300); });
  expect(onRefresh).toHaveBeenCalledTimes(1);

  await act(async () => { navigation.blur(); });
  expect(subscribers).toHaveLength(0);
  await act(async () => { emit('goods'); await jest.advanceTimersByTimeAsync(300); });
  expect(onRefresh).toHaveBeenCalledTimes(1); // pod spodem nic się nie dzieje
});

test('enabled: false wyłącza nawet na wierzchu; poza nawigatorem działa jak dotąd', async () => {
  const navigation = makeNavigation(true);
  const { rerender } = render(
    <NavigationContext.Provider value={navigation}>
      <Host onRefresh={jest.fn()} enabled={false} />
    </NavigationContext.Provider>
  );
  expect(subscribers).toHaveLength(0);
  rerender(
    <NavigationContext.Provider value={navigation}>
      <Host onRefresh={jest.fn()} enabled />
    </NavigationContext.Provider>
  );
  expect(subscribers).toHaveLength(1);

  const onRefresh = jest.fn();
  render(<Host onRefresh={onRefresh} enabled />); // bez nawigatora
  expect(subscribers).toHaveLength(2);
  await act(async () => { emit('goods'); await jest.advanceTimersByTimeAsync(300); });
  expect(onRefresh).toHaveBeenCalledTimes(1);
});
