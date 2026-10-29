// Zdarzenia na żywo (29.10.2026): jedno połączenie nawet przy dwóch subskrypcjach naraz (blokada przed czekaniem
// na token), 'reconnect' tylko po zerwanym połączeniu (nie przy każdym nowym), zdarzenia trafiają do słuchaczy.

class FakeXHR {
  constructor() {
    FakeXHR.instances.push(this);
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.headers = {};
    this.aborted = false;
  }
  open(method, url) { this.url = url; }
  setRequestHeader(key, value) { this.headers[key] = value; }
  send() { this.sent = true; }
  abort() { this.aborted = true; }
  // serwer
  serverOpen() { this.readyState = 3; this.status = 200; this.onreadystatechange(); }
  serverEvent(type, data) { this.responseText += `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`; this.onreadystatechange(); }
  serverDrop() { this.readyState = 4; this.onreadystatechange(); }
}
FakeXHR.instances = [];

const flush = async () => { await jest.advanceTimersByTimeAsync(0); };

let subscribeLiveEvents;
let isLiveConnected;

beforeEach(() => {
  jest.useFakeTimers();
  FakeXHR.instances = [];
  global.XMLHttpRequest = FakeXHR;
  jest.isolateModules(() => {
    ({ subscribeLiveEvents, isLiveConnected } = require('../../services/liveEvents'));
  });
});

afterEach(() => {
  jest.useRealTimers();
});

test('dwie subskrypcje w tym samym momencie otwierają JEDNO połączenie', async () => {
  const unsubA = subscribeLiveEvents(() => {});
  const unsubB = subscribeLiveEvents(() => {});
  await flush();

  expect(FakeXHR.instances).toHaveLength(1);
  expect(FakeXHR.instances[0].headers.Authorization).toBe('Bearer mock-token');
  expect(FakeXHR.instances[0].url).toContain('/live/events');
  unsubA(); unsubB();
});

test('pierwsze połączenie bez „reconnect”; po zerwaniu i wznowieniu dokładnie jeden „reconnect”; zdarzenia docierają', async () => {
  const events = [];
  const unsub = subscribeLiveEvents((type, payload) => events.push([type, payload]));
  await flush();
  const first = FakeXHR.instances[0];
  first.serverOpen();
  expect(events).toEqual([]); // nowe połączenie to nie „reconnect”

  first.serverEvent('goods', { id: 1 });
  expect(events).toEqual([['goods', { id: 1 }]]);
  expect(isLiveConnected()).toBe(true);

  first.serverDrop(); // serwer / sieć zerwały połączenie
  expect(isLiveConnected()).toBe(false);
  await jest.advanceTimersByTimeAsync(2000); // ponowienie po 2 s
  await flush();
  expect(FakeXHR.instances).toHaveLength(2);
  FakeXHR.instances[1].serverOpen();
  expect(events.filter(([type]) => type === 'reconnect')).toHaveLength(1);

  FakeXHR.instances[1].serverDrop();
  await jest.advanceTimersByTimeAsync(4000); // odstęp rośnie: 2 s → 4 s
  await flush();
  expect(FakeXHR.instances).toHaveLength(3);
  FakeXHR.instances[2].serverOpen();
  expect(events.filter(([type]) => type === 'reconnect')).toHaveLength(2);
  unsub();
});

test('ostatni słuchacz odchodzi (połączenie zamknięte celowo) i wraca: nowe połączenie, ale bez „reconnect”', async () => {
  const events = [];
  const unsub = subscribeLiveEvents((type) => events.push(type));
  await flush();
  FakeXHR.instances[0].serverOpen();
  unsub();
  expect(FakeXHR.instances[0].aborted).toBe(true);

  const unsub2 = subscribeLiveEvents((type) => events.push(type));
  await flush();
  expect(FakeXHR.instances).toHaveLength(2);
  FakeXHR.instances[1].serverOpen();
  expect(events).toEqual([]);
  unsub2();
});

test('ponowne połączenie w trakcie czekania na token nie otwiera drugiego', async () => {
  const unsub = subscribeLiveEvents(() => {});
  // drugie wywołanie connect() zanim pierwsze dostało token (np. powrót aplikacji na pierwszy plan)
  const unsub2 = subscribeLiveEvents(() => {});
  await flush();
  const first = FakeXHR.instances[0];
  first.serverOpen();
  first.serverDrop();
  const unsub3 = subscribeLiveEvents(() => {}); // subskrypcja w czasie odliczania do ponowienia
  await jest.advanceTimersByTimeAsync(2000);
  await flush();
  expect(FakeXHR.instances).toHaveLength(2);
  unsub(); unsub2(); unsub3();
});
