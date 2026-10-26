// Tryb skanera (26.10.2026): 'camera' (aparat telefonu) albo 'bluetooth' (czytnik, np. Zebra DS2278, sparowany
// z telefonem jako klawiatura - „wpisuje” kod i Enter). Wybór i „nie gaś ekranu” zapamiętane w telefonie,
// wspólne dla wszystkich miejsc ze skanerem (Nowa sprzedaż, Szukaj, Dopisz kwotę, Cudzych, Stan, Remanent, Sprawdź).
import AsyncStorage from '@react-native-async-storage/async-storage';

export const INPUT_MODE_KEY = 'scanner-input-mode';
export const KEEP_AWAKE_KEY = 'scanner-keep-awake';
export const INPUT_MODES = ['camera', 'bluetooth'];

export const getInputMode = async () => {
  try {
    const mode = await AsyncStorage.getItem(INPUT_MODE_KEY);
    return INPUT_MODES.includes(mode) ? mode : 'camera';
  } catch (error) {
    return 'camera';
  }
};

export const setInputMode = async (mode) => {
  try {
    await AsyncStorage.setItem(INPUT_MODE_KEY, INPUT_MODES.includes(mode) ? mode : 'camera');
  } catch (error) {
    // bez pamięci - tryb zostaje do zamknięcia ekranu
  }
};

export const getKeepAwake = async () => {
  try {
    return (await AsyncStorage.getItem(KEEP_AWAKE_KEY)) === '1';
  } catch (error) {
    return false;
  }
};

export const setKeepAwake = async (on) => {
  try {
    await AsyncStorage.setItem(KEEP_AWAKE_KEY, on ? '1' : '0');
  } catch (error) {
    // bez pamięci
  }
};

// Kody z czytnika: Enter kończy kod; część czytników wstawia znak nowej linii do tekstu, a z pamięci czytnika
// przychodzi kilka kodów naraz. Zwraca { codes: gotowe kody, rest: niedokończony fragment }.
export const splitScannerInput = (text) => {
  const parts = String(text || '').split(/[\r\n]+/);
  const rest = parts.pop() || '';
  const codes = parts.map(cleanScannerCode).filter(Boolean);
  return { codes, rest };
};

// Czytnik może dołożyć spacje albo znaki sterujące - kod to cyfry/litery/myślnik
export const cleanScannerCode = (raw) => String(raw || '').replace(/[^0-9A-Za-z-]/g, '').trim();
