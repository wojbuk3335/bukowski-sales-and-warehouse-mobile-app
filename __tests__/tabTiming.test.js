// Pomiar przejść między zakładkami (31.10.2026): od dotknięcia ikony do pokazania i gotowości zakładki -
// wpis „perf.tab” w Dzienniku aktywności (tylko pomiar, bez wpływu na działanie)
jest.mock('../services/activityLog', () => ({ logEvent: jest.fn() }));

import { InteractionManager } from 'react-native';
import { logEvent } from '../services/activityLog';
import { markTabFocus, markTabPress } from '../services/tabTiming';

beforeEach(() => {
  jest.useFakeTimers();
  logEvent.mockClear();
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((fn) => { fn(); return { cancel: jest.fn() }; });
  global.requestAnimationFrame = (fn) => setTimeout(fn, 16);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('dotknięcie ikony → zakładka na wierzchu: wpis z czasem pokazania i gotowości', () => {
  const now = jest.spyOn(Date, 'now');
  now.mockReturnValue(1000);
  markTabFocus('home'); // start aplikacji - bez dotknięcia, bez wpisu
  markTabPress('writeoff');
  now.mockReturnValue(4850);
  markTabFocus('writeoff');
  now.mockReturnValue(5100);
  jest.runAllTimers();
  expect(logEvent).toHaveBeenCalledTimes(1);
  const [kind, action, label, details] = logEvent.mock.calls[0];
  expect(kind).toBe('app');
  expect(action).toBe('perf.tab');
  expect(label).toBe('Przejście na Stan: pokazana po 3850 ms, gotowa po 4100 ms');
  expect(details).toMatchObject({ to: 'writeoff', from: 'home', shownMs: 3850, readyMs: 4100 });
});

test('wejście bez dotknięcia ikony (np. przejście z kodu) - bez wpisu', () => {
  markTabFocus('search');
  jest.runAllTimers();
  expect(logEvent).not.toHaveBeenCalled();
});
