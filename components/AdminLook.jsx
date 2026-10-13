import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import ThemeSwitch from './ThemeSwitch';
import { createThemedStyles, tc } from '../context/ThemeContext';

// Wspólny wygląd ekranów panelu użytkownika - taki sam jak w panelu admina:
// nagłówek z ikoną w kółku, karty z cienką ramką, kolorowe kafelki ikon, okienka z nagłówkiem.
// Kolory z motywu (biały / szary / czarny).

/** Nagłówek ekranu: ikona w kółku, tytuł, podtytuł, przełącznik motywu i opcjonalna dodatkowa treść. */
// Przełącznik motywu tylko na pierwszej zakładce („Sprzedaż”) - na pozostałych ekranach domyślnie wyłączony
export const ScreenHeader = ({ icon, title, subtitle, children, showThemeSwitch = false }) => (
  <View style={look.screenHeader}>
    <View style={look.screenHeaderIcon}>
      <Ionicons name={icon} size={30} color="#fff" />
    </View>
    <Text style={look.screenHeaderTitle}>{title}</Text>
    {!!subtitle && <Text style={look.screenHeaderSubtitle}>{subtitle}</Text>}
    {showThemeSwitch && <ThemeSwitch compact style={{ marginTop: 14, alignSelf: 'stretch' }} />}
    {children}
  </View>
);

/** Nagłówek okienka: kolorowy kafelek z ikoną i tytuł. */
export const ModalHeader = ({ icon, color = '#0D6EFD', title, subtitle }) => (
  <View style={look.modalHeader}>
    <View style={[look.modalHeaderIcon, { backgroundColor: `${color}26` }]}>
      <Ionicons name={icon} size={28} color={color} />
    </View>
    <Text style={look.modalHeaderTitle}>{title}</Text>
    {!!subtitle && <Text style={look.modalHeaderSubtitle}>{subtitle}</Text>}
  </View>
);

/** Karta wyboru (zamiast małych kółek): ikona, opis, znacznik zaznaczenia. */
export const OptionCard = ({ selected, icon, label, onPress, color = '#0D6EFD', testID }) => (
  <TouchableOpacity
    testID={testID}
    accessibilityRole="radio"
    accessibilityState={{ checked: !!selected }}
    style={[look.optionCard, selected && { borderColor: color, backgroundColor: `${color}1F` }]}
    onPress={onPress}
  >
    {!!icon && (
      <View style={[look.optionCardIcon, { backgroundColor: `${color}26` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
    )}
    <Text style={look.optionCardLabel}>{label}</Text>
    <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? color : tc('muted', '#94A3B8')} />
  </TouchableOpacity>
);

/** Duża karta menu (jak w panelu admina): kafelek z ikoną, tytuł, opis, strzałka. */
export const MenuCard = ({ icon, color = '#0D6EFD', title, subtitle, onPress, testID }) => (
  <TouchableOpacity testID={testID} style={look.menuCard} onPress={onPress}>
    <View style={[look.menuCardIcon, { backgroundColor: `${color}26` }]}>
      <Ionicons name={icon} size={26} color={color} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={look.menuCardTitle}>{title}</Text>
      {!!subtitle && <Text style={look.menuCardSubtitle}>{subtitle}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={20} color={tc('muted', '#94A3B8')} />
  </TouchableOpacity>
);

/** Przycisk „wstecz” (kafelek ze strzałką) - np. obok pola wyszukiwania. */
export const BackButton = ({ onPress, testID }) => (
  <TouchableOpacity testID={testID} accessibilityLabel="Powrót" style={look.backButton} onPress={onPress}>
    <Ionicons name="chevron-back" size={24} color={tc('text', '#fff')} />
  </TouchableOpacity>
);

/** Pozycja menu w okienku akcji: ikona w kolorze akcji, tytuł, strzałka. */
export const ActionItem = ({ icon, label, onPress, color = '#0D6EFD', testID, disabled = false }) => (
  <TouchableOpacity testID={testID} disabled={disabled} style={[look.actionItem, disabled && { opacity: 0.5 }]} onPress={onPress}>
    <View style={[look.optionCardIcon, { backgroundColor: `${color}26` }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <Text style={look.optionCardLabel}>{label}</Text>
    <Ionicons name="chevron-forward" size={18} color={tc('muted', '#94A3B8')} />
  </TouchableOpacity>
);

export const look = createThemedStyles(() => StyleSheet.create({
  screenHeader: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 8,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#1E293B'),
  },
  screenHeaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0D6EFD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  screenHeaderTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    marginBottom: 4,
  },
  screenHeaderSubtitle: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    textAlign: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(13, 110, 253, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(13, 110, 253, 0.4)',
  },
  chipText: {
    color: tc('text', '#fff'),
    fontSize: 13,
    fontWeight: '600',
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tc('surface', '#161622'),
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
  },
  menuCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: tc('text', '#fff'),
    marginBottom: 3,
  },
  menuCardSubtitle: {
    fontSize: 13,
    color: tc('muted', '#94A3B8'),
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('surface', '#161622'),
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(13, 110, 253, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(13, 110, 253, 0.4)',
    marginLeft: 8,
  },
  pillText: {
    color: tc('text', '#fff'),
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    color: tc('muted', '#94A3B8'),
    fontSize: 14,
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: tc('text', '#fff'),
    marginTop: 4,
    marginBottom: 8,
  },
  // pozycja listy: karta z kolorowym paskiem z lewej
  itemCard: {
    backgroundColor: tc('surface', '#161622'),
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
    borderLeftWidth: 4,
    borderLeftColor: '#0D6EFD',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemCardText: {
    color: tc('text', '#fff'),
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  dotsButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dotsText: {
    color: tc('muted', '#94A3B8'),
    fontSize: 22,
    textAlign: 'center',
  },
  // okienka
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
  },
  modalHeader: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 18,
  },
  modalHeaderIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    textAlign: 'center',
  },
  modalHeaderSubtitle: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    textAlign: 'center',
    marginTop: 6,
  },
  modalMessage: {
    fontSize: 15,
    color: tc('muted', '#CBD5E1'),
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  optionCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionCardLabel: {
    flex: 1,
    color: tc('text', '#fff'),
    fontSize: 15,
    fontWeight: '600',
  },
  // pola
  formLabel: {
    color: tc('muted', '#94A3B8'),
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: tc('text', '#fff'),
  },
  selectField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  selectFieldText: {
    color: tc('text', '#fff'),
    fontSize: 16,
    fontWeight: '600',
  },
  // przyciski
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0D6EFD',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neutralButton: {
    flex: 1,
    backgroundColor: tc('surface2', '#2a2a3e'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  neutralButtonText: {
    color: tc('text', '#fff'),
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabled: {
    opacity: 0.5,
  },
}));
