// Zdarzenia na żywo z serwera (SSE) w React Native - przez XMLHttpRequest, bez dodatkowych bibliotek
// (działa przez OTA). Jedno połączenie współdzielone przez wszystkie ekrany.
// Typy: 'pricelists', 'goods' oraz 'reconnect' (po wznowieniu połączenia ekran powinien się odświeżyć).
import { AppState } from "react-native";
import tokenService from "./tokenService";
import { getApiUrl } from "../config/api";

const listeners = new Set();
let xhr = null;
let connected = false;
let lastActivity = 0; // ostatnie dane z serwera (zdarzenie lub sygnał kontrolny co 25 s)
let reconnectTimer = null;
let retryMs = 2000;
let hadConnection = false;
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

const closeConnection = () => {
  if (xhr) {
    const current = xhr;
    xhr = null;
    try { current.abort(); } catch (error) { /* ignore */ }
  }
  connected = false;
};

const connect = async () => {
  if (xhr || listeners.size === 0) return;
  let token = null;
  try { token = await tokenService.getValidAccessToken(); } catch (error) { /* bez tokenu */ }
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
        retryMs = 2000;
        if (hadConnection) emit("reconnect", {});
        hadConnection = true;
      }
      lastActivity = Date.now();
      const text = request.responseText || "";
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
        closeConnection();
        scheduleReconnect();
      }
    }
    if (request.readyState === 4) {
      if (xhr === request) {
        xhr = null;
        connected = false;
        scheduleReconnect();
      }
    }
  };
  request.onerror = () => {
    if (xhr === request) {
      xhr = null;
      connected = false;
      scheduleReconnect();
    }
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
