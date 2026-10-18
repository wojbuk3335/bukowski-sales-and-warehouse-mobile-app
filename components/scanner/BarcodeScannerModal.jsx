import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScanCamera from './ScanCamera'; // kamera jak w całej aplikacji: ramka, zdjęcie, „Wpisz kod”
import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext';
import { isValidEan13, jacketCodeForSize } from '../../utils/productName';
import { KeyboardSafeOverlay } from '../KeyboardSafe'; // klawiatura nie zasłania pola w nakładce

// Skaner kodów kreskowych w trybie ciągłym - ten sam w Remanencie (panel użytkownika) i w zakładce „Sprawdź” (panel admina).
// Kamera, potwierdzenie skanu nad kamerą (toast) z wibracją, okienko „ta sama metka / kolejna sztuka”,
// lista pogrupowana po kodzie (−1 / ×N / +1, wpisanie ilości), „Wpisz kod”, „Odczytaj ze zdjęcia”, „Z bazy” i „Zatwierdź (N)”.
// O tym, czy kod przyjąć i jaki pokazać komunikat, decyduje ekran (validateCode); co zrobić ze skanami - onConfirm.
//
// Props:
//   visible, onClose                - widoczność; zamknięcie (X / wstecz) odrzuca niezatwierdzone skany
//   title                           - tytuł nad kamerą
//   permission, requestPermission   - z useCameraPermissions() ekranu (jedno źródło stanu uprawnień)
//   resolveName(code)               - nazwa produktu po kodzie (może być async)
//   previewName(code)               - nazwa do podglądu w „Wpisz kod” (synchronicznie)
//   validateCode(code, ctx)         - ctx: { name, manual, alreadyCounted }; zwraca (lub Promise)
//                                     { ok, tone: 'success'|'warn'|'error', message?, name? }.
//                                     ok=false: kod odrzucony (message w toaście); ok=true bez message:
//                                     domyślny komunikat „Dodano: …”.
//   countSaved(code)                - ile sztuk tego kodu jest już policzonych poza skanerem (do pytania o powtórkę)
//   onConfirm(pieces, { groups, showToast }) - async; true = przyjęte (lista skanera się czyści), false = skany zostają
//   goods, pickerSizes              - karty produktów i rozmiary dla „Z bazy”

// Ochrona przed wielokrotnym odczytem JEDNEJ metki przez kamerę (kilka odczytów na sekundę).
// Identyczne sztuki mają ten sam kod, więc kolejne skany tego kodu po przerwie to kolejne sztuki.
const SAME_LABEL_PAUSE_MS = 1500;
const RESUME_AFTER_MS = 800;

const toastKindOf = (tone) => (tone === 'warn' ? 'warn' : tone === 'error' ? 'error' : 'ok');

const BarcodeScannerModal = ({
  visible,
  onClose,
  title = 'Skanuj kody kurtek',
  permission,
  requestPermission,
  resolveName,
  previewName,
  validateCode,
  countSaved,
  onConfirm,
  goods = [],
  pickerSizes = [],
}) => {
  useAppTheme(); // przerysowanie po zmianie motywu
  const [scannedJackets, setScannedJackets] = useState([]);
  const [scanningEnabled, setScanningEnabled] = useState(true);
  const lastScanRef = useRef({ code: '', time: 0 });
  const scanBusyRef = useRef(false);
  // Ponowny skan kodu, który jest już policzony: pytamy, czy to ta sama metka, czy kolejna sztuka
  const [duplicatePrompt, setDuplicatePrompt] = useState(null); // { code, name, count, manual, verdict }
  const lastAcceptedCodeRef = useRef(''); // kod ostatnio dodanej sztuki (pytamy tylko przy skanie POD RZĄD)
  // Ręczne dodawanie, gdy kamera nie odczyta metki (deszcz, mróz, zniszczona metka)
  const [manualCodeOpen, setManualCodeOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerGood, setPickerGood] = useState(null); // kurtka czekająca na wybór rozmiaru
  // Wpisanie ilości jedną liczbą (czapki, paski: skan jednej sztuki + ilość z wieszaka)
  const [quantityEdit, setQuantityEdit] = useState(null); // { code, name, value }
  const [scanToast, setScanToast] = useState(null); // { text, kind: 'ok' | 'warn' | 'error' }
  const scanToastTimer = useRef(null);
  const savingScansRef = useRef(false);

  // Toast nie może zostać z odliczaniem po zamknięciu ekranu
  useEffect(() => () => clearTimeout(scanToastTimer.current), []);

  // Otwarcie skanera: zawsze pusta lista i włączone skanowanie (skan dokończony już po zamknięciu nie przechodzi dalej)
  useEffect(() => {
    if (visible) {
      setScannedJackets([]);
      setScanningEnabled(true);
    }
  }, [visible]);

  const showScanToast = (text, kind = 'ok') => {
    setScanToast({ text, kind });
    clearTimeout(scanToastTimer.current);
    scanToastTimer.current = setTimeout(() => setScanToast(null), kind === 'warn' || kind === 'error' ? 4000 : 1800);
  };

  // Wibracja: krótka przy dodanej sztuce, inna (ostrzegawcza) przy powtórce metki albo odrzuconym kodzie,
  // żeby dało się skanować bez patrzenia w ekran
  const scanFeedback = (kind = 'ok') => {
    try {
      const Haptics = require('expo-haptics');
      if (kind === 'warn' || kind === 'error') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 180);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      // bez wibracji (np. Expo Go bez modułu)
    }
  };

  const resumeScanning = () => {
    setTimeout(() => {
      setScanningEnabled(true);
      scanBusyRef.current = false;
    }, RESUME_AFTER_MS);
  };

  const handleScan = async ({ data }) => {
    // Ta sama metka odczytana ponownie w krótkim czasie = ten sam odczyt kamery, ignorujemy.
    // Po przerwie ten sam kod to KOLEJNA SZTUKA (identyczne kurtki mają identyczny kod).
    const now = Date.now();
    if (scanBusyRef.current) return;
    if (lastScanRef.current.code === data && now - lastScanRef.current.time < SAME_LABEL_PAUSE_MS) {
      return;
    }
    if (!scanningEnabled) {
      return;
    }
    scanBusyRef.current = true;
    lastScanRef.current = { code: data, time: now };

    setScanningEnabled(false);
    await processCode(data, false);
  };

  // Dodaje jedną sztukę do listy skanera
  const addScannedPiece = (code, name, alreadyCounted = 0, manual = false, verdict = null) => {
    lastAcceptedCodeRef.current = code;
    setScannedJackets((prev) => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      code,
      name,
      manual,
      scannedAt: new Date().toLocaleTimeString(),
    }]);
    if (verdict?.message) {
      showScanToast(verdict.message, toastKindOf(verdict.tone));
      return;
    }
    const pieceNumber = alreadyCounted + 1;
    showScanToast(`${manual ? 'Dodano ręcznie' : 'Dodano'}: ${name || code}${pieceNumber > 1 ? ` (${pieceNumber}. sztuka)` : ''}`);
  };

  // Wspólna ścieżka dla skanu i kodu dodanego ręcznie: nazwa, decyzja ekranu, powtórka pod rząd, dodanie.
  // Wywołujący ustawia scanBusyRef = true; ta funkcja zwalnia blokadę po zakończeniu.
  const processCode = async (data, manual) => {
    // Nazwa produktu (błąd nie może zablokować skanera na stałe)
    let productName = '';
    try {
      productName = await resolveName(data);
    } catch (error) {
      productName = data;
    }

    const alreadyCounted =
      scannedJackets.filter((jacket) => jacket.code === data).length +
      (countSaved ? Number(countSaved(data)) || 0 : 0);

    let verdict;
    try {
      verdict = (await validateCode(data, { name: productName, manual, alreadyCounted })) || { ok: true };
    } catch (error) {
      verdict = { ok: false, tone: 'warn', message: `Nie udało się sprawdzić kodu: ${data}\nSpróbuj ponownie.` };
    }

    if (!verdict.ok) {
      // Kod odrzucony (obcy kod, spoza filtrów itp.): komunikat nad kamerą bez blokującego okienka
      const kind = toastKindOf(verdict.tone || 'warn');
      scanFeedback(kind);
      showScanToast(verdict.message || `Pominięto kod: ${data}`, kind);
      resumeScanning();
      return;
    }

    const name = verdict.name || productName;

    // Ten sam kod co POPRZEDNI skan (pod rząd): pytamy, czy to ta sama metka.
    // Ten sam kod po innych skanach przechodzi normalnie jako kolejna sztuka.
    if (alreadyCounted > 0 && lastAcceptedCodeRef.current === data) {
      scanFeedback('warn');
      setDuplicatePrompt({ code: data, name: name || data, count: alreadyCounted, manual, verdict });
      return; // skanowanie wznawia się po wyborze w okienku
    }

    addScannedPiece(data, name, alreadyCounted, manual, verdict);
    scanFeedback(toastKindOf(verdict.tone));
    resumeScanning();
  };

  // Ręczne dodanie (wpisany kod / wybór z bazy) - ta sama ścieżka co skan
  const processManualCode = async (code) => {
    scanBusyRef.current = true;
    setScanningEnabled(false);
    lastScanRef.current = { code, time: Date.now() };
    await processCode(code, true);
  };

  // „Wpisz kod”: 13 cyfr z metki wpisane z klawiatury, sprawdzane cyfrą kontrolną
  const manualCodeValid = isValidEan13(manualCode);
  const submitManualCode = async () => {
    if (!manualCodeValid || scanBusyRef.current) return;
    const code = manualCode;
    setManualCodeOpen(false);
    setManualCode('');
    await processManualCode(code);
  };

  // „Z bazy”: produkt z kart produktów (cała baza, nie tylko stan punktu); kurtka wymaga wyboru rozmiaru
  const pickerResults = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase();
    const words = query.split(/\s+/).filter(Boolean);
    return (goods || [])
      .filter((good) => good?.fullName && good?.code)
      .filter((good) => words.every((word) => `${good.fullName} ${good.category || ''}`.toLowerCase().includes(word)))
      .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), 'pl'))
      .slice(0, 60);
  }, [goods, pickerSearch]);
  const addFromPicker = async (code) => {
    if (scanBusyRef.current) return;
    setPickerOpen(false);
    setPickerGood(null);
    setPickerSearch('');
    await processManualCode(code);
  };
  const choosePickerGood = (good) => {
    if (good.category === 'Kurtki kożuchy futra') {
      setPickerGood(good); // kod kurtki = model+kolor z karty + rozmiar + 0000 + cyfra kontrolna
      return;
    }
    addFromPicker(String(good.code));
  };
  const choosePickerSize = (size) => {
    addFromPicker(jacketCodeForSize(pickerGood.code, size.Roz_Kod));
  };

  // Wybór w okienku powtórnego skanu
  const resolveDuplicate = (addAnother) => {
    const prompt = duplicatePrompt;
    setDuplicatePrompt(null);
    if (prompt && addAnother) {
      addScannedPiece(prompt.code, prompt.name, prompt.count, Boolean(prompt.manual), prompt.verdict);
    } else if (prompt) {
      showScanToast(`Pominięto - ta metka jest już policzona (${prompt.count} szt.)`, 'warn');
    }
    // ten sam kod jeszcze przez chwilę ignorujemy (kamera wciąż widzi metkę)
    lastScanRef.current = { code: prompt?.code || '', time: Date.now() };
    resumeScanning();
  };

  // Ustawia łączną liczbę sztuk danego kodu w skanerze (np. 12 czapek z wieszaka)
  const applyQuantity = () => {
    const edit = quantityEdit;
    setQuantityEdit(null);
    if (!edit) return;
    const target = Math.max(0, Math.min(999, parseInt(String(edit.value).replace(/[^0-9]/g, ''), 10) || 0));
    setScannedJackets((prev) => {
      const same = prev.filter((jacket) => jacket.code === edit.code);
      if (same.length === target) return prev;
      if (target < same.length) {
        const keepIds = new Set(same.slice(0, target).map((jacket) => jacket.id));
        return prev.filter((jacket) => jacket.code !== edit.code || keepIds.has(jacket.id));
      }
      const template = same[0] || { code: edit.code, name: edit.name };
      const extra = Array.from({ length: target - same.length }, (_, index) => ({
        ...template,
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        scannedAt: new Date().toLocaleTimeString(),
      }));
      return [...prev, ...extra];
    });
  };

  // Identyczne sztuki (ten sam kod) pokazywane jako jedna pozycja z licznikiem
  const scannedGroups = useMemo(() => {
    const groups = new Map();
    scannedJackets.forEach((jacket) => {
      const group = groups.get(jacket.code) || { code: jacket.code, name: jacket.name, ids: [] };
      group.ids.push(jacket.id);
      groups.set(jacket.code, group);
    });
    return [...groups.values()].reverse(); // ostatnio skanowane na początku
  }, [scannedJackets]);

  // −1: cofnięcie ostatniego skanu tego kodu
  const removeOnePiece = (code) => {
    setScannedJackets((prev) => {
      const index = prev.map((jacket) => jacket.code).lastIndexOf(code);
      return index === -1 ? prev : [...prev.slice(0, index), ...prev.slice(index + 1)];
    });
  };

  // +1: dodanie sztuki bez skanowania (np. metka nieczytelna, a produkt ten sam)
  const addOnePiece = (code) => {
    setScannedJackets((prev) => {
      const template = prev.find((jacket) => jacket.code === code);
      if (!template) return prev;
      return [...prev, { ...template, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, scannedAt: new Date().toLocaleTimeString() }];
    });
  };

  // „Zatwierdź (N)”: skany przekazuje ekranowi; przy błędzie zostają na liście skanera
  const confirmScannedJackets = async () => {
    if (scannedJackets.length === 0 || savingScansRef.current) {
      return; // nic do zatwierdzenia albo zapis już trwa (podwójne kliknięcie)
    }
    savingScansRef.current = true;
    try {
      const accepted = await onConfirm(scannedJackets, { groups: scannedGroups, showToast: showScanToast });
      if (accepted) {
        setScannedJackets([]);
        setScanningEnabled(true);
      }
    } catch (error) {
      showScanToast('Nie zapisano skanów - sprawdź połączenie i zatwierdź ponownie.', 'warn');
    } finally {
      savingScansRef.current = false;
    }
  };

  // Zamknięcie (X / wstecz): niezatwierdzone skany są odrzucane
  const cancelScanning = () => {
    setDuplicatePrompt(null);
    setQuantityEdit(null);
    setManualCodeOpen(false);
    setPickerOpen(false);
    setPickerGood(null);
    scanBusyRef.current = false;
    setScannedJackets([]);
    setScanningEnabled(true);
    if (onClose) onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={cancelScanning}
    >
      <SafeAreaView style={{ backgroundColor: tc('bg', '#000'), flex: 1 }}>
        <View style={styles.scannerHeader}>
          <TouchableOpacity onPress={cancelScanning} style={styles.closeButton} testID="scanner-close">
            <Ionicons name="close" size={28} color={tc('text', 'white')} />
          </TouchableOpacity>
          <Text style={styles.scannerTitle}>{title}</Text>
          <View style={styles.placeholderButton} />
        </View>

        <View style={styles.scannerContainer}>
          {/* Kamera jak w całej aplikacji (components/scanner/ScanCamera): ramka, „Odczytaj ze zdjęcia”, „Wpisz kod”.
              Tryb ciągły - kolejne sztuki; co zrobić z kodem decyduje handleScan (bez zmian) */}
          <ScanCamera
            continuous
            enabled={visible && scanningEnabled && !manualCodeOpen && !pickerOpen && !duplicatePrompt && !quantityEdit}
            onScanned={handleScan}
            onManualCode={() => { setManualCode(''); setManualCodeOpen(true); }}
            hint={scanningEnabled ? null : 'Przetwarzanie...'}
          >
          {scanToast && (
            <View
              style={[styles.scanToast, scanToast.kind === 'warn' && styles.scanToastWarn, scanToast.kind === 'error' && styles.scanToastError]}
              pointerEvents="none"
              testID="scan-toast"
            >
              <Ionicons name={scanToast.kind === 'ok' ? 'checkmark-circle' : 'alert-circle'} size={20} color="white" />
              <Text style={styles.scanToastText} numberOfLines={6}>{scanToast.text}</Text>
            </View>
          )}
          </ScanCamera>
        </View>

        {/* Lista zeskanowanych (pogrupowana po kodzie) */}
        {scannedJackets.length > 0 && (
          <View style={styles.scannedListContainer}>
            <Text style={styles.scannedListTitle}>
              Zeskanowano: {scannedJackets.length} szt. ({scannedGroups.length} {scannedGroups.length === 1 ? 'produkt' : 'produktów'})
            </Text>
            <FlatList
              data={scannedGroups}
              horizontal
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <View style={styles.scannedJacket}>
                  <Text style={styles.jacketName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.jacketCode}>{item.code}</Text>
                  <View style={styles.pieceCounterRow}>
                    <TouchableOpacity onPress={() => removeOnePiece(item.code)} style={[styles.pieceButton, styles.pieceButtonMinus]}>
                      <Ionicons name="remove" size={18} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setQuantityEdit({ code: item.code, name: item.name, value: String(item.ids.length) })}>
                      <Text style={[styles.pieceCount, styles.pieceCountEditable]}>×{item.ids.length}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => addOnePiece(item.code)} style={[styles.pieceButton, styles.pieceButtonPlus]}>
                      <Ionicons name="add" size={18} color="white" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

        {duplicatePrompt && (
          <View style={[StyleSheet.absoluteFill, styles.filterOverlay]}>
            <View style={styles.filterCard}>
              <View style={{ alignItems: 'center', marginBottom: 10 }}>
                <Ionicons name="copy-outline" size={48} color="#F59E0B" />
              </View>
              <Text style={[styles.filterCardTitle, { textAlign: 'center', marginBottom: 6 }]}>Ten kod jest już policzony</Text>
              <Text style={{ color: tc('text', 'white'), fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{duplicatePrompt.name}</Text>
              <Text style={{ color: tc('muted', '#CBD5E1'), fontSize: 15, textAlign: 'center', marginTop: 6, marginBottom: 14 }}>
                Policzono już {duplicatePrompt.count} szt. Czy to ta sama metka, czy kolejna, identyczna sztuka?
              </Text>
              <View style={{ gap: 10 }}>
                <TouchableOpacity style={[styles.dialogStackButton, styles.filterCardButtonSecondary]} onPress={() => resolveDuplicate(false)}>
                  <Ionicons name="close" size={18} color={tc('text', 'white')} />
                  <Text style={styles.filterCardButtonText}>Ta sama metka - pomiń</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dialogStackButton, styles.filterCardButtonPrimary]} onPress={() => resolveDuplicate(true)}>
                  <Ionicons name="add" size={18} color="white" />
                  <Text style={styles.filterCardButtonText}>Kolejna sztuka - dodaj</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {quantityEdit && (
          <View style={StyleSheet.absoluteFill}>
          <KeyboardSafeOverlay>
          <View style={styles.filterOverlay}>
            <View style={styles.filterCard}>
              <Text style={[styles.filterCardTitle, { textAlign: 'center', marginBottom: 6 }]}>Ile sztuk łącznie?</Text>
              <Text style={{ color: tc('muted', '#CBD5E1'), fontSize: 15, textAlign: 'center', marginBottom: 12 }}>{quantityEdit.name}</Text>
              <TextInput
                style={styles.quantityInput}
                value={quantityEdit.value}
                onChangeText={(text) => setQuantityEdit((prev) => ({ ...prev, value: text.replace(/[^0-9]/g, '').slice(0, 3) }))}
                keyboardType="number-pad"
                autoFocus
                selectTextOnFocus
                onSubmitEditing={applyQuantity}
              />
              <View style={{ gap: 10, marginTop: 14 }}>
                <TouchableOpacity style={[styles.dialogStackButton, styles.filterCardButtonPrimary]} onPress={applyQuantity}>
                  <Ionicons name="checkmark" size={18} color="white" />
                  <Text style={styles.filterCardButtonText}>Ustaw ilość</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dialogStackButton, styles.filterCardButtonSecondary]} onPress={() => setQuantityEdit(null)}>
                  <Text style={styles.filterCardButtonText}>Anuluj</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          </KeyboardSafeOverlay>
          </View>
        )}

        {manualCodeOpen && (
          <View style={StyleSheet.absoluteFill}>
          <KeyboardSafeOverlay>
          <View style={styles.filterOverlay}>
            <View style={styles.filterCard}>
              <Text style={[styles.filterCardTitle, { textAlign: 'center', marginBottom: 6 }]}>Wpisz kod z metki</Text>
              <Text style={{ color: tc('muted', '#CBD5E1'), fontSize: 14, textAlign: 'center', marginBottom: 12 }}>13 cyfr spod kodu kreskowego</Text>
              <TextInput
                style={[styles.quantityInput, { fontSize: 22, letterSpacing: 2 }]}
                value={manualCode}
                onChangeText={(text) => setManualCode(text.replace(/[^0-9]/g, '').slice(0, 13))}
                keyboardType="number-pad"
                autoFocus
                maxLength={13}
                onSubmitEditing={submitManualCode}
                testID="manual-code-input"
              />
              <Text style={{ color: manualCodeValid ? '#10B981' : tc('muted', '#94A3B8'), fontSize: 14, textAlign: 'center', marginTop: 10, minHeight: 20 }}>
                {manualCode.length < 13
                  ? `${manualCode.length}/13 cyfr`
                  : manualCodeValid
                    ? (previewName ? previewName(manualCode) : manualCode)
                    : 'Błędna cyfra kontrolna - sprawdź wpisane cyfry'}
              </Text>
              <View style={{ gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={[styles.dialogStackButton, styles.filterCardButtonPrimary, !manualCodeValid && { opacity: 0.5 }]}
                  onPress={submitManualCode}
                  disabled={!manualCodeValid}
                >
                  <Ionicons name="add" size={18} color="white" />
                  <Text style={styles.filterCardButtonText}>Dodaj sztukę</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dialogStackButton, styles.filterCardButtonSecondary]} onPress={() => { setManualCodeOpen(false); setManualCode(''); }}>
                  <Text style={styles.filterCardButtonText}>Anuluj</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          </KeyboardSafeOverlay>
          </View>
        )}

        {pickerOpen && (
          <View style={StyleSheet.absoluteFill}>
          <KeyboardSafeOverlay>
          <View style={styles.filterOverlay}>
            <View style={[styles.filterCard, { maxHeight: '85%' }]}>
              <View style={styles.filterCardHeader}>
                <Text style={styles.filterCardTitle}>{pickerGood ? 'Wybierz rozmiar' : 'Wybierz z bazy produktów'}</Text>
                <TouchableOpacity onPress={() => (pickerGood ? setPickerGood(null) : setPickerOpen(false))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={pickerGood ? 'arrow-back' : 'close'} size={24} color={tc('text', 'white')} />
                </TouchableOpacity>
              </View>
              {pickerGood ? (
                <>
                  <Text style={{ color: tc('muted', '#CBD5E1'), fontSize: 15, marginBottom: 10 }}>{pickerGood.fullName}</Text>
                  <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                    <View style={styles.pickerSizeGrid}>
                      {pickerSizes.map((size) => (
                        <TouchableOpacity key={size.Roz_Kod} style={styles.pickerSizeChip} onPress={() => choosePickerSize(size)}>
                          <Text style={styles.pickerSizeText}>{size.Roz_Opis}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </>
              ) : (
                <>
                  <View style={[styles.selectSearchBox, { marginBottom: 8 }]}>
                    <Ionicons name="search" size={16} color={tc('muted', '#94A3B8')} />
                    <TextInput
                      style={styles.selectSearchInput}
                      placeholder="Szukaj: np. amanda czarny, aps 056"
                      placeholderTextColor={tc('muted', '#64748B')}
                      value={pickerSearch}
                      onChangeText={setPickerSearch}
                      autoFocus
                      autoCorrect={false}
                    />
                    {pickerSearch ? (
                      <TouchableOpacity onPress={() => setPickerSearch('')}>
                        <Ionicons name="close-circle" size={16} color={tc('muted', '#94A3B8')} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <FlatList
                    data={pickerResults}
                    keyExtractor={(good) => String(good._id || good.code)}
                    keyboardShouldPersistTaps="handled"
                    style={{ maxHeight: 380 }}
                    ListEmptyComponent={<Text style={{ color: tc('muted', '#94A3B8'), textAlign: 'center', padding: 16 }}>{(goods || []).length === 0 ? 'Karty produktów jeszcze się wczytują…' : 'Brak produktów dla tego wyszukiwania'}</Text>}
                    renderItem={({ item: good }) => (
                      <TouchableOpacity style={styles.pickerRow} onPress={() => choosePickerGood(good)}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pickerRowTitle}>{good.fullName}</Text>
                          <Text style={styles.pickerRowSub}>{good.category || ''}{good.category === 'Kurtki kożuchy futra' ? ' · wybierz rozmiar' : ''}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={tc('muted', '#94A3B8')} />
                      </TouchableOpacity>
                    )}
                  />
                </>
              )}
            </View>
          </View>
          </KeyboardSafeOverlay>
          </View>
        )}

        {/* Przyciski */}
        <View style={styles.scannerFooter}>
          <View style={styles.manualRow}>
            <TouchableOpacity style={styles.manualButton} onPress={() => { setPickerSearch(''); setPickerGood(null); setPickerOpen(true); }}>
              <Ionicons name="list-outline" size={18} color="white" />
              <Text style={styles.manualButtonText}>Z bazy</Text>
            </TouchableOpacity>
          </View>
          {scannedJackets.length > 0 && (
            <TouchableOpacity
              onPress={confirmScannedJackets}
              style={styles.confirmButton}
            >
              <Ionicons name="checkmark" size={24} color="white" />
              <Text style={styles.confirmButtonText}>
                Zatwierdź ({scannedJackets.length})
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#232533'),
  },
  scannerTitle: {
    color: tc('text', 'white'),
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
  },
  placeholderButton: {
    width: 44,
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('surface', '#161622'),
  },
  permissionText: {
    color: tc('text', 'white'),
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#0D6EFD',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: '#0D6EFD',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  scanningDisabled: {
    position: 'absolute',
    bottom: -50,
    backgroundColor: 'rgba(220, 53, 69, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  scanningDisabledText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  scanToast: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(22, 163, 74, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  scanToastWarn: {
    backgroundColor: 'rgba(217, 119, 6, 0.95)',
  },
  scanToastError: {
    backgroundColor: 'rgba(220, 38, 38, 0.95)',
  },
  scanToastText: {
    flex: 1,
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  scannedListContainer: {
    backgroundColor: tc('surface', '#1E1E2D'),
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#232533'),
    maxHeight: 170,
  },
  scannedListTitle: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  scannedJacket: {
    backgroundColor: tc('surface', '#232533'),
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    minWidth: 120,
    position: 'relative',
  },
  jacketName: {
    color: tc('text', 'white'),
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 16,
  },
  jacketCode: {
    color: tc('muted', '#CDCDE0'),
    fontSize: 12,
    marginBottom: 4,
  },
  pieceCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  pieceButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pieceButtonMinus: {
    backgroundColor: '#DC2626',
  },
  pieceButtonPlus: {
    backgroundColor: '#16A34A',
  },
  pieceCount: {
    color: tc('text', 'white'),
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 10,
  },
  pieceCountEditable: {
    textDecorationLine: 'underline',
  },
  quantityInput: {
    color: tc('text', 'white'),
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    backgroundColor: tc('surface', '#0F172A'),
    paddingVertical: 10,
  },
  scannerFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#232533'),
    gap: 10,
  },
  manualRow: {
    flexDirection: 'row',
    gap: 10,
  },
  manualButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: tc('surface2', '#343a40'),
    paddingVertical: 12,
    borderRadius: 10,
  },
  manualButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#1E293B'),
  },
  pickerRowTitle: {
    color: tc('text', 'white'),
    fontSize: 15,
    fontWeight: '600',
  },
  pickerRowSub: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    marginTop: 2,
  },
  pickerSizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerSizeChip: {
    minWidth: 64,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: tc('surface', '#1E293B'),
  },
  pickerSizeText: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: '700',
  },
  selectSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    backgroundColor: tc('surface', '#0F172A'),
  },
  selectSearchInput: {
    flex: 1,
    color: tc('text', 'white'),
    fontSize: 15,
    paddingVertical: 8,
  },
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  filterCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
    padding: 20,
  },
  filterCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  filterCardTitle: {
    color: tc('text', 'white'),
    fontSize: 20,
    fontWeight: '700',
  },
  // Przycisk na całą szerokość w oknach z przyciskami jeden pod drugim (bez flex: 1, który w kolumnie zeruje wysokość)
  dialogStackButton: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  filterCardButtonPrimary: {
    backgroundColor: '#0D6EFD',
  },
  filterCardButtonSecondary: {
    backgroundColor: '#64748B',
  },
  filterCardButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}));

export default BarcodeScannerModal;
