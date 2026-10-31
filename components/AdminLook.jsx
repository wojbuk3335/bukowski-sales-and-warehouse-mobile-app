import React from 'react';
import { comparePl } from '../utils/plSort'; // szybkie sortowanie po polsku
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { createThemedStyles, tc } from '../context/ThemeContext';

// Wspólny wygląd ekranów panelu użytkownika - taki sam jak w panelu admina:
// nagłówek z ikoną w kółku, karty z cienką ramką, kolorowe kafelki ikon, okienka z nagłówkiem.
// Kolory z motywu (biały / szary / czarny).

/**
 * Nagłówek zakładki - jeden niski wiersz (max ~10% wysokości ekranu): kafelek z ikoną, tytuł i podtytuł,
 * opcjonalnie coś po prawej (right, np. saldo) i przycisk wylogowania (kafelek). children - dodatkowy wiersz pod spodem.
 */
export const ScreenHeader = ({ icon, title, subtitle, children, right, showLogout = true }) => {
  // wczytywane leniwie: LogoutButton korzysta z kontekstu aplikacji (nie obciąża ekranów i testów bez wylogowania)
  // eslint-disable-next-line global-require
  const LogoutButton = showLogout ? require('./LogoutButton').default : null;
  return (
    <View style={look.screenHeader}>
      <View style={look.screenHeaderRow}>
        <View style={look.screenHeaderIcon}>
          <Ionicons name={icon} size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={look.screenHeaderTitle} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={look.screenHeaderSubtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>
        {right}
        {LogoutButton && <LogoutButton position="inline" compact />}
      </View>
      {children ? <View style={{ marginTop: 8 }}>{children}</View> : null}
    </View>
  );
};

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

// Kolor punktu (użytkownika) na plakietkach: stały dla danego symbolu, magazyn zawsze pomarańczowy
const POINT_COLORS = ['#0D6EFD', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4', '#14B8A6', '#6366F1', '#F43F5E', '#84CC16', '#0EA5E9', '#A855F7', '#22C55E'];
export const MAGAZYN_COLOR = '#F59E0B';
export const pointColor = (symbol) => {
  const key = String(symbol || '').trim().toLowerCase();
  if (!key) return '#94A3B8';
  if (key.includes('magazyn')) return MAGAZYN_COLOR;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return POINT_COLORS[hash % POINT_COLORS.length];
};

/**
 * Różne kolory dla wszystkich punktów z listy (bez powtórzeń do 12 punktów): kolejność alfabetyczna symboli,
 * magazyn zawsze pomarańczowy. Zwraca funkcję symbol -> kolor.
 */
export const pointColorMap = (symbols) => {
  const unique = [...new Set((symbols || []).map((sym) => String(sym || '').trim()).filter(Boolean))]
    .filter((sym) => !sym.toLowerCase().includes('magazyn'))
    .sort(comparePl);
  const map = new Map(unique.map((sym, index) => [sym, POINT_COLORS[index % POINT_COLORS.length]]));
  return (symbol) => {
    const key = String(symbol || '').trim();
    if (key.toLowerCase().includes('magazyn')) return MAGAZYN_COLOR;
    return map.get(key) || pointColor(key);
  };
};

/** Plakietka punktu: delikatne tło i ramka w kolorze punktu, kropka koloru przed symbolem. */
export const PointPill = ({ symbol, color: forcedColor }) => {
  const color = forcedColor || pointColor(symbol);
  return (
    <View style={[look.pill, { backgroundColor: `${color}26`, borderColor: `${color}80`, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={look.pillText}>{symbol}</Text>
    </View>
  );
};

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

/**
 * Nagłówek podstrony (ekrany z „Różne” i inne ekrany z powrotem): kafelek „wstecz”, ikona i tytuł,
 * opcjonalny podtytuł i przycisk po prawej (right). Bez onBack - bez kafelka wstecz (miejsce zostaje puste).
 */
export const PageHeader = ({ title, subtitle, icon, color = '#0D6EFD', onBack, right, testID }) => (
  <View style={look.pageHeader} testID={testID}>
    {onBack ? <BackButton onPress={onBack} testID="page-header-back" /> : <View style={look.pageHeaderSide} />}
    <View style={look.pageHeaderCenter}>
      <View style={look.pageHeaderTitleRow}>
        {!!icon && (
          <View style={[look.pageHeaderIcon, { backgroundColor: `${color}26` }]}>
            <Ionicons name={icon} size={18} color={color} />
          </View>
        )}
        <Text style={look.pageHeaderTitle} numberOfLines={1}>{title}</Text>
      </View>
      {!!subtitle && <Text style={look.pageHeaderSubtitle} numberOfLines={1}>{subtitle}</Text>}
    </View>
    {right ? <View style={look.pageHeaderRight}>{right}</View> : <View style={look.pageHeaderSide} />}
  </View>
);

/** Mały kafelek-przycisk z ikoną (np. „dodaj” / „odśwież” w nagłówku podstrony). */
export const IconButton = ({ icon, onPress, color = '#0D6EFD', accessibilityLabel, testID, disabled = false }) => (
  <TouchableOpacity
    testID={testID}
    accessibilityLabel={accessibilityLabel}
    disabled={disabled}
    onPress={onPress}
    style={[look.iconButton, { backgroundColor: `${color}26`, borderColor: `${color}66` }, disabled && look.disabled]}
  >
    <Ionicons name={icon} size={22} color={color} />
  </TouchableOpacity>
);

/**
 * Okienko wyboru waluty (jak reszta okienek): nagłówek z ikoną, waluty jako karty (kod, nazwa, kurs kupna),
 * zaznaczona waluta z ptaszkiem, neutralne „Zamknij”. options: [{ code, name, buyRate }].
 */
export const CurrencyPickerModal = ({
  visible, onClose, onSelect, options = [], selected, title = 'Wybierz walutę', subtitle, color = '#10B981',
  testID, optionTestID, closeTestID, closeLabel = 'Zamknij',
}) => (
  <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
    <View style={look.modalOverlay}>
      <View style={[look.modalContent, { maxHeight: '80%' }]}>
        <ModalHeader icon="cash" color={color} title={title} subtitle={subtitle} />
        <FlatList
          testID={testID}
          data={options}
          keyExtractor={(item) => item.code}
          style={{ flexGrow: 0 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const active = selected === item.code;
            const rate = item.buyRate !== null && item.buyRate !== undefined && item.buyRate !== '' ? Number(item.buyRate) : null;
            return (
              <TouchableOpacity
                testID={optionTestID ? optionTestID(item.code) : undefined}
                style={[look.optionCard, active && { borderColor: color, backgroundColor: `${color}1F` }]}
                onPress={() => onSelect(item.code)}
              >
                <View style={[look.currencyCode, { backgroundColor: `${color}26` }]}>
                  <Text style={[look.currencyCodeText, { color }]}>{item.code}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={look.optionCardLabel} numberOfLines={1}>{item.name || item.code}</Text>
                  {rate !== null && !Number.isNaN(rate) && item.code !== 'PLN' && (
                    <Text style={look.currencyRate}>Kupno: {rate.toFixed(4)} PLN</Text>
                  )}
                </View>
                {active && <Ionicons name="checkmark-circle" size={22} color={color} />}
              </TouchableOpacity>
            );
          }}
        />
        <TouchableOpacity testID={closeTestID} style={[look.neutralButton, { flex: 0, marginTop: 12 }]} onPress={onClose}>
          <Text style={look.neutralButtonText}>{closeLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

/** Okienko komunikatu (sukces / błąd) w stylu aplikacji. */
export const MessageModal = ({ visible, onClose, type = 'success', title, message }) => {
  const success = type === 'success';
  const color = success ? '#10B981' : '#DC3545';
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={look.modalOverlay}>
        <View style={look.modalContent}>
          <ModalHeader icon={success ? 'checkmark-circle' : 'alert-circle'} color={color} title={title || (success ? 'Gotowe' : 'Błąd')} />
          {!!message && <Text style={look.modalMessage}>{message}</Text>}
          <TouchableOpacity style={[look.primaryButton, { flex: 0, backgroundColor: success ? '#0D6EFD' : color }]} onPress={onClose}>
            <Text style={look.buttonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

/** Pozycja menu w okienku akcji: ikona w kolorze akcji, tytuł (opcjonalnie dopisek pod nim), strzałka. */
export const ActionItem = ({ icon, label, onPress, color = '#0D6EFD', testID, disabled = false, note = null, noteColor = null }) => (
  <TouchableOpacity testID={testID} disabled={disabled} style={[look.actionItem, disabled && { opacity: 0.5 }]} onPress={onPress}>
    <View style={[look.optionCardIcon, { backgroundColor: `${color}26` }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    {note ? (
      <View style={{ flex: 1 }}>
        <Text style={[look.optionCardLabel, { flex: 0 }]}>{label}</Text>
        <Text testID={testID ? `${testID}-note` : undefined} style={{ fontSize: 12, marginTop: 2, color: noteColor || tc('muted', '#94A3B8') }}>{note}</Text>
      </View>
    ) : (
      <Text style={look.optionCardLabel}>{label}</Text>
    )}
    <Ionicons name="chevron-forward" size={18} color={tc('muted', '#94A3B8')} />
  </TouchableOpacity>
);

export const look = createThemedStyles(() => StyleSheet.create({
  screenHeader: {
    paddingTop: 8,
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#1E293B'),
  },
  screenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  screenHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0D6EFD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenHeaderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
  },
  screenHeaderSubtitle: {
    fontSize: 12,
    color: tc('muted', '#94A3B8'),
    marginTop: 1,
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
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#1E293B'),
    backgroundColor: tc('bg', '#000000'),
  },
  pageHeaderSide: {
    width: 48,
    height: 48,
  },
  pageHeaderRight: {
    minWidth: 48,
    alignItems: 'flex-end',
  },
  pageHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  pageHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageHeaderIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageHeaderTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    flexShrink: 1,
  },
  pageHeaderSubtitle: {
    fontSize: 12,
    color: tc('muted', '#94A3B8'),
    marginTop: 2,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingVertical: 2,
    alignSelf: 'center',
    justifyContent: 'center',
  },
  dotsText: {
    color: tc('muted', '#94A3B8'),
    fontSize: 22,
    lineHeight: 24,
    textAlign: 'center',
    includeFontPadding: false, // Android: bez górnego marginesu czcionki „⋮” stoi na środku kafelka
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
  currencyCode: {
    minWidth: 48,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  currencyCodeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  currencyRate: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    marginTop: 2,
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
