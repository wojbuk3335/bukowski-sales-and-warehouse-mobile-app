// Aktualizacja OTA w całej aplikacji (31.10.2026): dawniej tylko ekran logowania sprawdzał nową wersję, więc kto tylko
// odblokowywał aplikację (blokada wzorem / PIN-em) albo wracał do niej z tła, zostawał na starej wersji.
//  - otwarcie aplikacji: sprawdzenie i od razu wgranie nowej wersji (nikt jeszcze nie pracuje),
//  - powrót po 5 min w tle (tak jak blokada aplikacji): to samo - praca sprzed przerwy i tak jest zamknięta blokadą,
//  - krótszy powrót z tła: pobranie po cichu, wgra się przy następnym otwarciu albo powrocie po przerwie.
// W trakcie pobierania / wgrywania - nakładka na cały ekran (nad blokadą aplikacji), żeby nikt nie zaczął pracy.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, StyleSheet, Text, View } from 'react-native';
import { checkAndApplyUpdate, getUpdateStage, prefetchUpdate, subscribeUpdateStage } from '../services/appUpdates';

export const UPDATE_AFTER_BACKGROUND_MS = 5 * 60 * 1000; // jak blokada aplikacji (AppLock.LOCK_AFTER_MS)

const AppUpdater = () => {
  const [stage, setStage] = useState(getUpdateStage());
  const backgroundAt = useRef(null);

  useEffect(() => subscribeUpdateStage(setStage), []);

  useEffect(() => {
    checkAndApplyUpdate(); // otwarcie aplikacji
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundAt.current = Date.now();
      } else if (state === 'active') {
        const away = backgroundAt.current ? Date.now() - backgroundAt.current : 0;
        backgroundAt.current = null;
        if (away >= UPDATE_AFTER_BACKGROUND_MS) checkAndApplyUpdate();
        else if (away > 0) prefetchUpdate();
      }
    });
    return () => subscription?.remove?.();
  }, []);

  const visible = stage === 'downloading' || stage === 'reloading';
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.overlay} testID="app-updater">
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.text}>Trwa aktualizacja... nie wyłączaj telefonu ani nie zamykaj aplikacji...</Text>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  text: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 20, lineHeight: 24 },
});

export default AppUpdater;
