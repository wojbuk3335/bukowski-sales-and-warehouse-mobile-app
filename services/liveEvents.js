// Zdarzenia na żywo z serwera (SSE) w React Native - przez XMLHttpRequest, bez dodatkowych bibliotek
// (działa przez OTA). Jedno połączenie współdzielone przez wszystkie ekrany.
// Typy: 'pricelists', 'goods' oraz 'reconnect' (po wznowieniu zerwanego połączenia ekran powinien się odświeżyć).
import { AppState } from "react-native";
import tokenService from "./tokenService";
import { getApiUrl } from "../config/api";

const listeners = new Set();
let xhr = null;
let connecting = false; // trwa pobieranie tokenu przed otwarciem połączenia
let connected = false;
let lastActivity = 0; // ostatnie dane z serwera (zdarzenie lub sygnał kontrolny co 25 s)
let reconnectTimer = null;
let retryMs = 2000;
let lostWhileSubscribed = false; // połączenie zerwało się, gdy ktoś słuchał - po wznowieniu trzeba odświeżyć ekrany
let appStateSub = null;

const emit = (type, payload) => {
  listeners.forEach((listener) => {
    try { listener(type, payload); } catch (error) { /* ignore */ }
  });
};

const scheduleReconnect = () => {
  if (listeners.size === 0 || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, retryMs);
  retryMs = Math.min(retryMs * 2, 30000);
};

// Zamknięcie celowe (ostatni słuchacz odszedł, aplikacja w tle): po nim ekrany odświeżają się same
// (wejście na ekran, powrót na pierwszy plan), więc nie ma czego nadrabiać zdarzeniem 'reconnect'
const closeConnection = () => {
  if (xhr) {
    const current = xhr;
    xhr = null;
    try { current.abort(); } catch (error) { /* ignore */ }
  }
  connected = false;
  lostWhileSubscribed = false;
};

// Połączenie zerwane nie z naszej woli (serwer, sieć, limit tekstu odpowiedzi) - zdarzenia mogły przepaść
const connectionLost = () => {
  xhr = null;
  connected = false;
  if (listeners.size > 0) lostWhileSubscribed = true;
  scheduleReconnect();
};

const connect = async () => {
  // Blokada ustawiana PRZED czekaniem na token: dwa wywołania naraz (dwie subskrypcje w jednym renderze,
  // powrót na pierwszy plan w trakcie ponawiania) otwierały dwa połączenia, z których pierwsze zostawało
  // osierocone - nigdy niezamykane, a serwer słał do niego dane do końca życia aplikacji
  if (xhr || connecting || listeners.size === 0) return;
  connecting = true;
  let token = null;
  try { token = await tokenService.getValidAccessToken(); } catch (error) { /* bez tokenu */ }
  connecting = false;
  if (xhr || listeners.size === 0) return; // w międzyczasie ktoś się połączył albo wszyscy odeszli
  if (!token) { scheduleReconnect(); return; }

  const request = new XMLHttpRequest();
  xhr = request;
  let seen = 0;
  let buffer = "";

  request.open("GET", getApiUrl("/live/events"));
  request.setRequestHeader("Accept", "text/event-stream");
  request.setRequestHeader("Cache-Control", "no-cache");
  request.setRequestHeader("Authorization", `Bearer ${token}`);

  request.onreadystatechange = () => {
    if (request !== xhr) return;
    if (request.readyState >= 3 && request.status === 200) {
      if (!connected) {
        connected = true;
        // 'reconnect' tylko po zerwanym połączeniu, nie przy każdym nowym (dawniej każde wejście na ekran
        // z odświeżaniem na żywo ładowało dane dwa razy: raz z efektu ekranu, raz z 'reconnect')
        if (lostWhileSubscribed) emit("reconnect", {});
        lostWhileSubscribed = false;
      }
      const text = request.responseText || "";
      if (text.length > seen) {
        lastActivity = Date.now();
        retryMs = 2000; // odstęp ponawiania wraca do 2 s dopiero, gdy naprawdę płyną dane
      }
      buffer += text.slice(seen);
      seen = text.length;
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const lines = block.split("\n");
        const eventLine = lines.find((line) => line.startsWith("event: "));
        const dataLine = lines.find((line) => line.startsWith("data: "));
        if (!eventLine) continue;
        let payload = {};
        try { payload = JSON.parse(dataLine ? dataLine.slice(6) : "{}"); } catch (error) { /* ignore */ }
        emit(eventLine.slice(7).trim(), payload);
      }
      // długie połączenie: zaczynamy od nowa, zanim tekst odpowiedzi urośnie
      if (seen > 512 * 1024) {
        const current = xhr;
        xhr = null;
        try { current.abort(); } catch (error) { /* ignore */ }
        connectionLost();
      }
    }
    if (request.readyState === 4 && xhr === request) connectionLost();
  };
  request.onerror = () => {
    if (xhr === request) connectionLost();
  };
  request.send();
};

const ensureAppStateListener = () => {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      if (!xhr && listeners.size > 0) { retryMs = 2000; connect(); }
    } else if (state === "background") {
      closeConnection(); // bez połączenia w tle (bateria); po powrocie ekran i tak się odświeża
    }
  });
};

export const subscribeLiveEvents = (listener) => {
  listeners.add(listener);
  ensureAppStateListener();
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      closeConnection();
      if (appStateSub) { appStateSub.remove(); appStateSub = null; }
    }
  };
};

// Połączenie uznajemy za żywe tylko, gdy w ostatniej minucie coś przyszło (np. proxy buforujące strumień)
export const isLiveConnected = () => connected && Date.now() - lastActivity < 60000;
