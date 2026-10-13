import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { registerAppAlertHost } from '../services/appAlert';

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
// Jeden wspólny dialog dla całej aplikacji (zamontowany raz w app/_layout.jsx).
// Wygląd jak okienka w remanencie: ciemna karta, ikona, tytuł, treść, przyciski jeden pod drugim.

const iconFor = (title = '', message = '') => {
  const text = `${title} ${message}`.toLowerCase();
  if (/błąd|blad|error|nie udało|nie udalo|niepowodzenie|odrzucon/.test(text) && !/na pewno/.test(title.toLowerCase())) {
    return { name: 'close-circle', color: '#EF4444' };
  }
  if (/sukces|gotowe|zapisano|wysłano|wyslano|udało się|powodzenie|zaktualizowano|usunięto|dodano/.test(title.toLowerCase())) {
    return { name: 'checkmark-circle', color: '#10B981' };
  }
  if (/uwaga|potwierd|na pewno|usun|usuń|ostrze|reset|wyczyść|wyczysc|anulow/.test(text)) {
    return { name: 'warning', color: '#F59E0B' };
  }
  return { name: 'information-circle', color: '#60A5FA' };
};

const buttonStyleFor = (button) => {
  if (button.style === 'destructive') return styles.buttonDanger;
  if (button.style === 'cancel') return styles.buttonSecondary;
  return styles.buttonPrimary;
};

export default function AppDialogHost() {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const [queue, setQueue] = useState([]);

  useEffect(() => registerAppAlertHost((request) => {
    setQueue((prev) => [...prev, request]);
  }), []);

  const current = queue[0];
  if (!current) return null;

  const buttons = Array.isArray(current.buttons) && current.buttons.length > 0
    ? current.buttons
    : [{ text: 'OK' }];
  // przycisk „anuluj” na dole, reszta w podanej kolejności
  const ordered = [...buttons.filter((button) => button.style !== 'cancel'), ...buttons.filter((button) => button.style === 'cancel')];
  const cancelable = !current.options || current.options.cancelable !== false;
  const icon = iconFor(current.title, current.message);

  const close = () => setQueue((prev) => prev.slice(1));
  const press = (button) => {
    close();
    if (typeof button.onPress === 'function') {
      setTimeout(() => button.onPress(), 0);
    }
  };
  const dismiss = () => {
    if (!cancelable) return;
    const cancelButton = buttons.find((button) => button.style === 'cancel');
    close();
    if (cancelButton && typeof cancelButton.onPress === 'function') setTimeout(() => cancelButton.onPress(), 0);
    if (current.options && typeof current.options.onDismiss === 'function') setTimeout(() => current.options.onDismiss(), 0);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name={icon.name} size={52} color={icon.color} />
          </View>
          {current.title ? <Text style={styles.title}>{String(current.title)}</Text> : null}
          {current.message ? <Text style={styles.message}>{String(current.message)}</Text> : null}
          <View style={styles.buttons}>
            {ordered.map((button, index) => (
              <TouchableOpacity
                key={`${button.text || 'btn'}-${index}`}
                style={[styles.button, buttonStyleFor(button)]}
                onPress={() => press(button)}
                testID={`app-dialog-button-${index}`}
              >
                <Text style={styles.buttonText}>{button.text || 'OK'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = createThemedStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: tc('surface', '#0A0A0A'),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    padding: 20,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    color: tc('text', 'white'),
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    color: tc('muted', '#CBD5E1'),
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 16,
  },
  buttons: {
    gap: 10,
  },
  button: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonPrimary: {
    backgroundColor: '#0D6EFD',
  },
  buttonSecondary: {
    backgroundColor: '#64748B',
  },
  buttonDanger: {
    backgroundColor: '#DC3545',
  },
  buttonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
}));
