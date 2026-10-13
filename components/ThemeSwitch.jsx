import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEMES, THEME_LABELS, useAppTheme } from '../context/ThemeContext';

// Przełącznik motywu: Biały / Szary / Czarny (jak w panelu). Używany w profilu admina i użytkownika.
const ICONS = { light: 'sunny-outline', gray: 'cloudy-outline', dark: 'moon-outline' };

// compact: bez podpisu i marginesów (np. w nagłówku ekranu, jak przełącznik w panelu webowym)
export default function ThemeSwitch({ style, compact = false }) {
  const { theme, colors, setTheme } = useAppTheme();
  return (
    <View style={[compact ? null : styles.wrap, style]}>
      {!compact && <Text style={[styles.label, { color: colors.muted }]}>Motyw aplikacji</Text>}
      <View style={[styles.row, { backgroundColor: colors.surface2, borderColor: colors.border }]} accessibilityRole="radiogroup">
        {THEMES.map((value) => {
          const active = theme === value;
          return (
            <TouchableOpacity
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`Motyw ${THEME_LABELS[value].toLowerCase()}`}
              testID={`theme-${value}`}
              style={[styles.option, active && { backgroundColor: colors.primary }]}
              onPress={() => setTheme(value)}
            >
              <Ionicons name={ICONS[value]} size={18} color={active ? '#fff' : colors.muted} />
              <Text style={[styles.optionText, { color: active ? '#fff' : colors.muted }, active && styles.optionTextActive]}>
                {THEME_LABELS[value]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 16 },
  label: { fontSize: 13, marginBottom: 6, fontWeight: '600' },
  row: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  option: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 9 },
  optionText: { fontSize: 14 },
  optionTextActive: { fontWeight: '700' },
});
