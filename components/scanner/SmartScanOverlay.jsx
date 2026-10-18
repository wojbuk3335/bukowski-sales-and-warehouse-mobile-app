import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {
  codeRectFromScan,
  createConfirmCounter,
  isPlausibleCode,
  isRectCenterInsideFrame,
} from "./smartScanLogic";

/**
 * „Inteligentny” skaner kodów: skanuje tylko kod wewnątrz ramki, przyjmuje go dopiero po kilku
 * zgodnych odczytach pod rząd, a ramka płynnie „leci” do znalezionego kodu i obrysowuje go.
 *
 *   const smart = useSmartBarcodeScan({ onConfirmed: ({ data, type }) => …, enabled: !scanned });
 *   <View style={{ flex: 1 }}>
 *     <CameraView … onBarcodeScanned={smart.onBarcodeScanned} />
 *     <SmartScanOverlay {...smart.overlayProps} />
 *   </View>
 *
 * Nakładka musi leżeć dokładnie na kamerze (ten sam rozmiar) - wtedy współrzędne kodu z kamery
 * i ramki są w tym samym układzie.
 */

const FRAME_W = 280;
const FRAME_H = 200;
const IDLE_RESET_MS = 450; // po tym czasie bez kodu ramka wraca na środek

// rearmKey: zmiana wartości = nowa sesja skanowania bez wyłączania (tryb ciągły - kolejne sztuki)
export const useSmartBarcodeScan = ({ onConfirmed, enabled = true, requiredHits = 3, windowMs = 600, rearmKey = 0 } = {}) => {
  const counter = useRef(createConfirmCounter({ requiredHits, windowMs })).current;
  const frameRef = useRef(null); // ramka w układzie kamery {x, y, width, height}
  const idleTimer = useRef(null);
  const doneRef = useRef(false);
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;

  // animowany obrys: położenie i rozmiar
  const box = useRef({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    w: new Animated.Value(FRAME_W),
    h: new Animated.Value(FRAME_H),
  }).current;
  const [status, setStatus] = useState("searching"); // searching | locking | locked
  const [progress, setProgress] = useState(0);

  const animateTo = useCallback((rect, duration = 140) => {
    Animated.parallel([
      Animated.timing(box.x, { toValue: rect.x, duration, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(box.y, { toValue: rect.y, duration, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(box.w, { toValue: rect.width, duration, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(box.h, { toValue: rect.height, duration, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start();
  }, [box]);

  const backToFrame = useCallback(() => {
    counter.reset();
    setStatus("searching");
    setProgress(0);
    if (frameRef.current) animateTo(frameRef.current, 220);
  }, [animateTo, counter]);

  // nowa sesja skanowania (np. po zamknięciu formularza) - ramka na środek, liczniki od zera
  useEffect(() => {
    if (enabled) {
      doneRef.current = false;
      backToFrame();
    }
    return () => clearTimeout(idleTimer.current);
  }, [enabled, rearmKey, backToFrame]);

  const onFrameLayout = useCallback((event) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    frameRef.current = { x, y, width, height };
    if (status === "searching") {
      box.x.setValue(x);
      box.y.setValue(y);
      box.w.setValue(width);
      box.h.setValue(height);
    }
  }, [box, status]);

  const onBarcodeScanned = useCallback((scan) => {
    if (!enabled || doneRef.current) return;
    const { data, type } = scan || {};
    if (!isPlausibleCode(data, type)) return; // zła cyfra kontrolna / pusty odczyt

    const rect = codeRectFromScan(scan);
    if (!isRectCenterInsideFrame(rect, frameRef.current)) return; // kod poza ramką - ignorujemy

    // ramka „leci” do kodu (z małym marginesem)
    if (rect) {
      const pad = 10;
      animateTo({ x: rect.x - pad, y: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 });
    }

    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(backToFrame, IDLE_RESET_MS);

    const hits = counter.push(String(data));
    setProgress(Math.min(1, hits / counter.requiredHits));
    if (!counter.isConfirmed(hits)) {
      setStatus("locking");
      return;
    }

    doneRef.current = true;
    clearTimeout(idleTimer.current);
    setStatus("locked");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onConfirmedRef.current?.({ data: String(data), type });
  }, [enabled, animateTo, backToFrame, counter]);

  const overlayProps = useMemo(() => ({ box, status, progress, onFrameLayout }), [box, status, progress, onFrameLayout]);

  return { onBarcodeScanned, overlayProps, reset: backToFrame };
};

const COLORS = {
  searching: "#FFFFFF",
  locking: "#F59E0B",
  locked: "#10B981",
};

const HINTS = {
  searching: "Umieść kod kreskowy w ramce",
  locking: "Trzymaj nieruchomo…",
  locked: "Zeskanowano",
};

// `actions`: przyciski pod napisem (np. „Odczytaj ze zdjęcia”, „Wpisz kod”) w tym samym stylu co napis;
// `hint`: własny napis zamiast domyślnego (np. „Odczytuję kod ze zdjęcia…”)
export const SmartScanOverlay = ({ box, status, progress, onFrameLayout, actions = [], hint = null }) => {
  const color = COLORS[status] || COLORS.searching;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* stała ramka - obszar, w którym kod jest przyjmowany */}
      <View style={styles.center} pointerEvents="none">
        <View style={styles.frame} onLayout={onFrameLayout} />
      </View>

      {/* animowany obrys: na środku, a po znalezieniu kodu - na kodzie */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.box,
          { left: box.x, top: box.y, width: box.w, height: box.h, borderColor: color },
        ]}
      >
        <View style={[styles.corner, styles.tl, { borderColor: color }]} />
        <View style={[styles.corner, styles.tr, { borderColor: color }]} />
        <View style={[styles.corner, styles.bl, { borderColor: color }]} />
        <View style={[styles.corner, styles.br, { borderColor: color }]} />
      </Animated.View>

      <View style={styles.hintWrap} pointerEvents="box-none">
        <View style={[styles.hint, { borderColor: color }]} pointerEvents="none">
          <Text style={styles.hintText}>{hint || HINTS[status]}</Text>
          {status === "locking" && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: color }]} />
            </View>
          )}
        </View>
        {actions.length > 0 && (
          <View style={styles.actionsRow}>
            {actions.map((action) => (
              <TouchableOpacity
                key={action.label}
                testID={action.testID}
                style={[styles.hint, styles.actionButton, { borderColor: color }]}
                onPress={action.onPress}
                disabled={action.disabled}
                accessibilityRole="button"
              >
                {!!action.icon && <Ionicons name={action.icon} size={18} color="#fff" />}
                <Text style={styles.hintText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const CORNER = 26;

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  frame: {
    width: FRAME_W,
    height: FRAME_H,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderStyle: "dashed",
  },
  box: {
    position: "absolute",
    borderRadius: 14,
    borderWidth: 0,
  },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
  },
  tl: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 14 },
  tr: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 14 },
  bl: { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 14 },
  br: { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 14 },
  hintWrap: {
    // zawsze tuż pod ramką (pełny ekran sprzedaży i niższa kamera w Remanencie)
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    marginTop: FRAME_H / 2 + 16,
    alignItems: "center",
  },
  hint: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    minWidth: 220,
  },
  hintText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap", // trzy przyciski i więcej - w dwóch rzędach na wąskim ekranie
    justifyContent: "center",
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    paddingHorizontal: 14,
  },
  progressTrack: {
    marginTop: 6,
    height: 4,
    width: 180,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
  },
});

export default SmartScanOverlay;
