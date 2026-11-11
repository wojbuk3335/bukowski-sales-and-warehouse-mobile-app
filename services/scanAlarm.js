// Alarm dźwiękowy skanera (11.11.2026): przy czytniku Bluetooth telefon nie jest w ręce, więc wibracja nie wystarcza -
// zły odczyt / nadmiar sztuk / nieznany kod = głośny, dwutonowy alarm z telefonu (inny niż pisk czytnika Zebra,
// który piszczy przy każdym odczycie, także błędnym). Gra także przy wyciszonym telefonie (iPhone: przełącznik).
// expo-audio to moduł natywny - w starszej wersji aplikacji (bez modułu) alarm po cichu nic nie robi, aplikacja działa.

let player = null;
let ready = false;

const audioModule = () => {
  try {
    return require('expo-audio');
  } catch (error) {
    return null;
  }
};

const prepare = () => {
  if (ready) return player;
  ready = true;
  const audio = audioModule();
  if (!audio?.createAudioPlayer) return null;
  try {
    Promise.resolve(audio.setAudioModeAsync?.({ playsInSilentMode: true, interruptionMode: 'duckOthers' })).catch(() => {});
    player = audio.createAudioPlayer(require('../assets/sounds/scan-alarm.wav'));
    if (player) player.volume = 1;
  } catch (error) {
    player = null;
  }
  return player;
};

// Przygotowanie przy otwarciu skanera - pierwszy alarm gra bez opóźnienia
export const preloadScanAlarm = () => {
  prepare();
};

export const playScanAlarm = () => {
  const current = prepare();
  if (!current) return false;
  try {
    Promise.resolve(current.seekTo?.(0)).catch(() => {});
    current.play();
    return true;
  } catch (error) {
    return false;
  }
};

// tylko do testów
export const __resetScanAlarm = () => {
  player = null;
  ready = false;
};
