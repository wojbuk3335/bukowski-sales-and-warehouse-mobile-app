import React, { useEffect, useRef, useState } from "react";
import { Image, Modal, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CameraView, scanFromURLAsync, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker"; // „Odczytaj ze zdjęcia” - kod kreskowy z galerii
import { SmartScanOverlay, useSmartBarcodeScan } from "./SmartScanOverlay"; // kod tylko z ramki, potwierdzony kilkoma odczytami
import { KeyboardSafeScreen } from "../KeyboardSafe";
import { ModalHeader, look } from "../AdminLook";
import { tc } from "../../context/ThemeContext";
import { appAlert } from "../../services/appAlert";
import Logger from "../../services/logger";
import { getInputMode, setInputMode, getKeepAwake, setKeepAwake, splitScannerInput, cleanScannerCode } from "./scannerInputMode"; // czytnik Bluetooth

// Podtrzymanie ekranu w trybie czytnika (expo-keep-awake jest w Expo; gdy modułu brak - bez podtrzymania)
const keepAwakeModule = () => {
  try {
    return require("expo-keep-awake");
  } catch (error) {
    return null;
  }
};
const KEEP_AWAKE_TAG = "scanner-bluetooth";

/**
 * Skaner kodów kreskowych - ten sam w każdym miejscu aplikacji (wzór: „Nowa sprzedaż”):
 * kamera z inteligentną ramką (kod tylko z jej wnętrza, po kilku zgodnych odczytach, wibracja),
 * pod napisem „Odczytaj ze zdjęcia” i „Wpisz kod”. Zdjęcie i wpisany kod kończą się tak samo jak skan (onScanned).
 *
 * Props:
 *   onScanned({ data, type })  - odczytany kod (type: typ kodu z kamery/zdjęcia, "manual" albo "bluetooth" - z czytnika)
 *
 * Tryb czytnika Bluetooth (26.10.2026): przycisk „Czytnik” pod ramką przełącza na czytnik sparowany z telefonem jako
 * klawiatura (np. Zebra DS2278). Kamera jest wyłączona, ukryte pole odbiera kody „wpisywane” przez czytnik (Enter = kod),
 * każdy kod idzie do onScanned jak skan. Wybór trybu i „nie gaś ekranu” zapamiętane (scannerInputMode.js).
 *   enabled                    - false = skaner wstrzymany (np. otwarty formularz); po ponownym true ramka wraca na środek
 *   continuous                 - tryb ciągły (Remanent, „Sprawdź”): po skanie ramka sama wraca do szukania,
 *                                zdjęcie nie zostaje na ekranie
 *   resolveName(code)          - nazwa produktu dla „Wpisz kod” (może być async; null = kod spoza bazy, „Dalej” zablokowane).
 *                                Bez resolveName każdy wpisany kod jest przyjmowany.
 *   onManualCode               - własne okienko „Wpisz kod” ekranu (zamiast wbudowanego)
 *   extraActions               - dodatkowe przyciski pod napisem: [{ label, icon, onPress, testID }]
 *   hint                       - własny napis w ramce
 *   facing                     - "back" (domyślnie) / "front"
 *   style                      - styl kontenera (domyślnie flex: 1)
 *   children                   - elementy nad kamerą (np. przycisk zamknięcia)
 */

// Tylko formaty, które drukujemy (metki Code 128) - inne (UPC-A, Code 39, EAN-8) dawały błędne odczyty
export const SCAN_BARCODE_TYPES = ["code128", "ean13", "qr"];
// Zdjęcie bywa odczytane jako inny typ niż na żywo - drugie podejście ze wszystkimi formatami
const PHOTO_FALLBACK_TYPES = ["code128", "ean13", "ean8", "upc_a", "upc_e", "code39", "code93", "codabar", "itf14", "qr", "pdf417", "aztec", "datamatrix"];
const CONTINUOUS_REARM_MS = 600;

const ScanCamera = ({
  onScanned,
  enabled = true,
  continuous = false,
  resolveName,
  onManualCode,
  extraActions = [],
  hint = null,
  facing = "back",
  style,
  children,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const onScannedRef = useRef(onScanned);
  onScannedRef.current = onScanned;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Czytnik Bluetooth: tryb zapamiętany w telefonie, ukryte pole na kody, „nie gaś ekranu”
  const [inputMode, setInputModeState] = useState("camera");
  const [btBuffer, setBtBuffer] = useState("");
  const [btLastCode, setBtLastCode] = useState("");
  const [keepAwakeOn, setKeepAwakeOn] = useState(false);
  const btInputRef = useRef(null);
  useEffect(() => {
    let active = true;
    getInputMode().then((mode) => { if (active) setInputModeState(mode); });
    getKeepAwake().then((on) => { if (active) setKeepAwakeOn(on); });
    return () => { active = false; };
  }, []);
  const switchInputMode = (mode) => {
    setInputModeState(mode);
    setBtBuffer("");
    setInputMode(mode);
  };
  const toggleKeepAwake = (on) => {
    setKeepAwakeOn(on);
    setKeepAwake(on);
  };
  // Pole czytnika musi mieć fokus, gdy skaner jest aktywny (po zamknięciu formularza fokus wraca sam)
  useEffect(() => {
    if (inputMode !== "bluetooth" || !enabled) return undefined;
    const timer = setTimeout(() => btInputRef.current?.focus?.(), 50);
    return () => clearTimeout(timer);
  }, [inputMode, enabled]);
  // Ekran nie gaśnie, dopóki działa tryb czytnika z włączonym „nie gaś ekranu”
  useEffect(() => {
    const keepAwake = keepAwakeModule();
    if (!keepAwake) return undefined;
    const shouldHold = inputMode === "bluetooth" && keepAwakeOn;
    if (shouldHold) {
      Promise.resolve(keepAwake.activateKeepAwakeAsync?.(KEEP_AWAKE_TAG)).catch(() => {});
    }
    return () => {
      Promise.resolve(keepAwake.deactivateKeepAwake?.(KEEP_AWAKE_TAG)).catch(() => {});
    };
  }, [inputMode, keepAwakeOn]);

  // Tryb ciągły: po potwierdzonym skanie ramka sama wraca do szukania (ekran sam pilnuje powtórek tej samej metki)
  const [rearmKey, setRearmKey] = useState(0);
  const rearmTimer = useRef(null);
  useEffect(() => () => clearTimeout(rearmTimer.current), []);
  const deliver = (result) => {
    onScannedRef.current?.(result);
    if (continuous) {
      clearTimeout(rearmTimer.current);
      rearmTimer.current = setTimeout(() => setRearmKey((key) => key + 1), CONTINUOUS_REARM_MS);
    }
  };

  const smartScan = useSmartBarcodeScan({ enabled, onConfirmed: deliver, rearmKey });

  // Kody z czytnika: Enter (onSubmitEditing) kończy kod; znak nowej linii w tekście też (kilka kodów naraz z pamięci czytnika)
  const deliverBluetoothCode = (raw) => {
    const code = cleanScannerCode(raw);
    if (!code) return;
    setBtLastCode(code);
    if (!enabledRef.current) return; // formularz otwarty - kod bez odbiorcy (jak zasłonięta kamera)
    onScannedRef.current?.({ data: code, type: "bluetooth" });
  };
  const handleBluetoothText = (text) => {
    if (/[\r\n]/.test(text)) {
      const { codes, rest } = splitScannerInput(text);
      codes.forEach(deliverBluetoothCode);
      setBtBuffer(rest);
      return;
    }
    setBtBuffer(text);
  };
  const handleBluetoothSubmit = () => {
    deliverBluetoothCode(btBuffer);
    setBtBuffer("");
    setTimeout(() => btInputRef.current?.focus?.(), 0);
  };

  // „Odczytaj ze zdjęcia”: zdjęcie z galerii pokazywane zamiast kamery, kod odczytany z pliku
  const [photoUri, setPhotoUri] = useState(null);
  const [photoScanning, setPhotoScanning] = useState(false);
  // Po wznowieniu skanera (zamknięty formularz) wracamy do kamery
  useEffect(() => {
    if (enabled) setPhotoUri(null);
  }, [enabled]);

  const pickPhotoAndScan = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        appAlert("Brak dostępu", "Zezwól aplikacji na dostęp do zdjęć, aby odczytać kod ze zdjęcia.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      if (result.canceled || !result.assets?.length) return;
      const uri = result.assets[0].uri;
      if (!continuous) setPhotoUri(uri);
      setPhotoScanning(true);
      let found = await scanFromURLAsync(uri, SCAN_BARCODE_TYPES);
      if (!(found || []).some((item) => item?.data)) {
        found = await scanFromURLAsync(uri, PHOTO_FALLBACK_TYPES);
      }
      setPhotoScanning(false);
      const first = (found || []).find((item) => item?.data);
      if (!first) {
        setPhotoUri(null);
        const size = await new Promise((resolve) => Image.getSize(uri, (w, h) => resolve(`${w}×${h}`), () => resolve("?")));
        appAlert("Nie znaleziono kodu", `Na tym zdjęciu nie udało się odczytać kodu kreskowego. Spróbuj zdjęcia z bliska, ostrego, z kodem poziomo.

(zdjęcie ${size}, wykryto: 0 kodów)`);
        return;
      }
      Logger.debug("Scan from photo:", first.type, first.data);
      deliver({ data: String(first.data), type: first.type });
    } catch (error) {
      setPhotoScanning(false);
      setPhotoUri(null);
      Logger.error("Scan from photo failed:", error);
      appAlert("Błąd", "Nie udało się odczytać kodu ze zdjęcia.");
    }
  };

  // „Wpisz kod”: ręczne wpisanie kodu kreskowego - dalej dokładnie jak po zeskanowaniu
  const [manualCodeVisible, setManualCodeVisible] = useState(false);
  const [manualCode, setManualCode] = useState("");
  // Walidacja na bieżąco: ok (kod w bazie, nazwa produktu) / invalid (nie pasuje) / checking / idle
  const [manualCodeCheck, setManualCodeCheck] = useState({ state: "idle", name: "" });
  const resolveNameRef = useRef(resolveName);
  resolveNameRef.current = resolveName;
  useEffect(() => {
    const code = manualCode.trim();
    if (!code) {
      setManualCodeCheck({ state: "idle", name: "" });
      return undefined;
    }
    if (!resolveNameRef.current) {
      setManualCodeCheck({ state: "ok", name: "" });
      return undefined;
    }
    let active = true;
    setManualCodeCheck((prev) => ({ ...prev, state: "checking" }));
    const timer = setTimeout(async () => {
      let name = null;
      try {
        name = await resolveNameRef.current(code);
      } catch (error) {
        name = null;
      }
      if (active) setManualCodeCheck(name ? { state: "ok", name } : { state: "invalid", name: "" });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [manualCode]);

  const closeManualCode = () => {
    setManualCodeVisible(false);
    setManualCode("");
  };

  const submitManualCode = () => {
    const code = manualCode.trim();
    if (!code || manualCodeCheck.state !== "ok") return; // tylko kod z bazy kodów
    closeManualCode();
    deliver({ data: code, type: "manual" });
  };

  if (!permission) return <View style={[styles.container, style]} />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permission, style]}>
        <Text style={styles.permissionText}>Potrzebujemy Twojej zgody na dostęp do kamery</Text>
        <TouchableOpacity style={[look.primaryButton, { flex: 0, paddingHorizontal: 24 }]} onPress={requestPermission}>
          <Text style={look.buttonText}>Włącz skaner kodów kreskowych</Text>
        </TouchableOpacity>
        {children}
      </View>
    );
  }

  const manualAction = { label: "Wpisz kod", icon: "keypad-outline", onPress: onManualCode || (() => setManualCodeVisible(true)), testID: "enter-code" };
  const actions = enabled ? [
    { label: "Odczytaj ze zdjęcia", icon: "images-outline", onPress: pickPhotoAndScan, disabled: photoScanning, testID: "scan-from-photo" },
    manualAction,
    ...extraActions,
    { label: "Czytnik", icon: "bluetooth", onPress: () => switchInputMode("bluetooth"), testID: "scan-mode-bluetooth" },
  ] : [];

  if (inputMode === "bluetooth") {
    // Czytnik Bluetooth: kamera wyłączona, ukryte pole odbiera kody; dotknięcie panelu przywraca fokus
    const bt = btStyles();
    return (
      <View style={[styles.container, style]}>
        <TouchableOpacity activeOpacity={0.95} style={bt.panel} onPress={() => btInputRef.current?.focus?.()} testID="bluetooth-panel">
          <TextInput
            ref={btInputRef}
            style={styles.btHiddenInput}
            value={btBuffer}
            onChangeText={handleBluetoothText}
            onSubmitEditing={handleBluetoothSubmit}
            blurOnSubmit={false}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            showSoftInputOnFocus={false}
            caretHidden
            editable={enabled}
            testID="bluetooth-scan-input"
          />
          <Ionicons name="bluetooth" size={56} color={bt.icon} />
          <Text style={bt.title}>Czytnik Bluetooth</Text>
          <Text style={bt.hint}>
            {enabled
              ? `${hint || "Naciśnij spust czytnika na metce."}\nDotknij tutaj, jeśli czytnik nie reaguje.`
              : "Czytnik wstrzymany - zamknij formularz, żeby skanować dalej."}
          </Text>
          {!!btLastCode && (
            <Text style={bt.last} testID="bluetooth-last">Ostatni odczyt: {btLastCode}</Text>
          )}
          <View style={styles.btActionsRow}>
            <TouchableOpacity style={bt.action} onPress={() => switchInputMode("camera")} testID="scan-mode-camera" accessibilityRole="button">
              <Ionicons name="camera-outline" size={18} color={bt.actionText.color} />
              <Text style={bt.actionText}>Kamera</Text>
            </TouchableOpacity>
            {enabled && [manualAction, ...extraActions].map((action) => (
              <TouchableOpacity key={action.label} style={bt.action} onPress={action.onPress} disabled={action.disabled} testID={action.testID} accessibilityRole="button">
                {!!action.icon && <Ionicons name={action.icon} size={18} color={bt.actionText.color} />}
                <Text style={bt.actionText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.btKeepAwakeRow}>
            <Text style={bt.keepAwakeText}>Nie gaś ekranu w trybie czytnika</Text>
            <Switch value={keepAwakeOn} onValueChange={toggleKeepAwake} trackColor={{ true: bt.icon }} testID="scanner-keep-awake" />
          </View>
          {children}
        </TouchableOpacity>

        {/* Ręczne wpisanie kodu - to samo okienko co przy kamerze */}
        <Modal visible={manualCodeVisible} transparent animationType="fade" onRequestClose={closeManualCode}>
          <KeyboardSafeScreen>
            <View style={look.modalOverlay}>
              <View style={look.modalContent}>
                <ModalHeader icon="keypad" color="#0D6EFD" title="Wpisz kod kreskowy" subtitle="Kod z metki, np. 0040408300005" />
                <TextInput
                  testID="manual-code-input"
                  style={look.formInput}
                  value={manualCode}
                  onChangeText={(text) => setManualCode(text.replace(/\s+/g, ""))}
                  placeholder="Kod kreskowy"
                  placeholderTextColor={tc('muted', "#64748B")}
                  keyboardType="number-pad"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={submitManualCode}
                />
                <View style={look.buttonRow}>
                  <TouchableOpacity style={look.neutralButton} onPress={closeManualCode}>
                    <Text style={look.neutralButtonText}>Anuluj</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID="manual-code-submit" style={[look.primaryButton, manualCodeCheck.state !== "ok" && { opacity: 0.5 }]} onPress={submitManualCode} disabled={manualCodeCheck.state !== "ok"}>
                    <Text style={look.buttonText}>Dalej</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardSafeScreen>
        </Modal>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {photoUri ? (
        // zdjęcie z galerii zamiast podglądu kamery
        <Image source={{ uri: photoUri }} style={styles.camera} resizeMode="contain" testID="scan-photo" />
      ) : (
        <CameraView
          style={styles.camera}
          facing={facing}
          barcodeScannerSettings={{ barcodeTypes: SCAN_BARCODE_TYPES }}
          onBarcodeScanned={enabled ? smartScan.onBarcodeScanned : undefined}
        />
      )}
      {/* Ramka: kod przyjmowany tylko z jej wnętrza; obrys „leci” do znalezionego kodu.
          Pod napisem: odczyt kodu ze zdjęcia z galerii i ręczne wpisanie kodu */}
      <SmartScanOverlay
        {...smartScan.overlayProps}
        hint={photoScanning ? "Odczytuję kod ze zdjęcia…" : hint}
        actions={actions}
      />
      {children}

      {/* Ręczne wpisanie kodu kreskowego */}
      <Modal visible={manualCodeVisible} transparent animationType="fade" onRequestClose={closeManualCode}>
        <KeyboardSafeScreen>
          <View style={look.modalOverlay}>
            <View style={look.modalContent}>
              <ModalHeader icon="keypad" color="#0D6EFD" title="Wpisz kod kreskowy" subtitle="Kod z metki, np. 0040408300005" />
              <TextInput
                testID="manual-code-input"
                style={look.formInput}
                value={manualCode}
                onChangeText={(text) => setManualCode(text.replace(/\s+/g, ""))}
                placeholder="Kod kreskowy"
                placeholderTextColor={tc('muted', "#64748B")}
                keyboardType="number-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={submitManualCode}
              />
              {manualCodeCheck.state !== "idle" && !!resolveName && (
                <View testID="manual-code-status" style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <Ionicons
                    name={manualCodeCheck.state === "ok" ? "checkmark-circle" : manualCodeCheck.state === "invalid" ? "close-circle" : "time-outline"}
                    size={18}
                    color={manualCodeCheck.state === "ok" ? "#10B981" : manualCodeCheck.state === "invalid" ? "#EF4444" : tc('muted', "#94A3B8")}
                  />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: manualCodeCheck.state === "ok" ? "#10B981" : manualCodeCheck.state === "invalid" ? "#EF4444" : tc('muted', "#94A3B8") }}>
                    {manualCodeCheck.state === "ok"
                      ? manualCodeCheck.name
                      : manualCodeCheck.state === "invalid"
                        ? "Kod niepoprawny - nie pasuje do bazy kodów"
                        : "Sprawdzam kod…"}
                  </Text>
                </View>
              )}
              <View style={look.buttonRow}>
                <TouchableOpacity style={look.neutralButton} onPress={closeManualCode}>
                  <Text style={look.neutralButtonText}>Anuluj</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="manual-code-submit"
                  style={[look.primaryButton, manualCodeCheck.state !== "ok" && { opacity: 0.5 }]}
                  onPress={submitManualCode}
                  disabled={manualCodeCheck.state !== "ok"}
                >
                  <Text style={look.buttonText}>Dalej</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardSafeScreen>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  camera: { flex: 1 },
  permission: { justifyContent: "center", alignItems: "center", padding: 20 },
  permissionText: { color: "#fff", fontSize: 16, textAlign: "center", marginBottom: 20 },
  btHiddenInput: { position: "absolute", opacity: 0, height: 1, width: 1, top: 0, left: 0 },
  btActionsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 12, paddingHorizontal: 12 },
  btKeepAwakeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
});

// Panel czytnika w kolorach motywu aplikacji (szary: tło, karta, tekst), liczone przy każdym renderze
const btStyles = () => ({
  panel: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10, backgroundColor: tc('bg', '#000') },
  title: { color: tc('text', '#fff'), fontSize: 20, fontWeight: "700" },
  hint: { color: tc('muted', '#CBD5E1'), fontSize: 14, textAlign: "center", lineHeight: 20 },
  last: { color: "#10B981", fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: 4 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: tc('border', '#232533'), backgroundColor: tc('surface2', '#232533') },
  actionText: { color: tc('text', '#fff'), fontSize: 14, fontWeight: "600" },
  keepAwakeText: { color: tc('muted', '#CBD5E1'), fontSize: 13 },
  icon: tc('primary', '#0d6efd'),
});

export default ScanCamera;
