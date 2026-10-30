import React, { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ModalHeader, look } from './AdminLook';
import { CUDZICH_TYPES } from './CudzichLook';
import { createThemedStyles, tc } from '../context/ThemeContext';

// Filtr historii Cudzicha (30.10.2026): zakres „Od – Do” z kalendarzem, szybkie zakresy i typy operacji.
// Zmiany w okienku są robocze - do listy trafiają dopiero po „Zastosuj”.
//
// Props: visible, value { start: Date|null, end: Date|null, types: string[] }, onApply(value), onClose

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// Szybkie zakresy liczone od dzisiejszej daty telefonu
export const quickRanges = (now = new Date()) => {
  const today = startOfDay(now);
  const weekday = (today.getDay() + 6) % 7; // poniedziałek = 0
  return [
    { key: 'today', label: 'Dziś', start: today, end: today },
    { key: 'yesterday', label: 'Wczoraj', start: addDays(today, -1), end: addDays(today, -1) },
    { key: 'week', label: 'Ten tydzień', start: addDays(today, -weekday), end: today },
    { key: 'month', label: 'Ten miesiąc', start: new Date(today.getFullYear(), today.getMonth(), 1), end: today },
    { key: 'prevMonth', label: 'Poprzedni miesiąc', start: new Date(today.getFullYear(), today.getMonth() - 1, 1), end: new Date(today.getFullYear(), today.getMonth(), 0) },
    { key: 'last30', label: 'Ostatnie 30 dni', start: addDays(today, -29), end: today },
    { key: 'year', label: 'Ten rok', start: new Date(today.getFullYear(), 0, 1), end: today },
    { key: 'all', label: 'Wszystko', start: null, end: null },
  ];
};

export const formatDay = (date) => (date ? date.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '');
const sameDay = (a, b) => (!a && !b) || (a && b && startOfDay(a).getTime() === startOfDay(b).getTime());

const TYPE_ORDER = ['odbior', 'zwrot', 'wplata', 'wyplata'];
const TYPE_LABELS = { odbior: 'Odbiory', zwrot: 'Zwroty', wplata: 'Wpłaty', wyplata: 'Wypłaty' };

// Napis aktywnego filtra na liście: „01.10.2026 – 30.10.2026 · Odbiory, Zwroty”
export const filterLabel = ({ start, end, types }) => {
  const parts = [];
  if (start || end) parts.push(`${formatDay(start) || 'od początku'} – ${formatDay(end) || 'do dziś'}`);
  if (types && types.length > 0 && types.length < TYPE_ORDER.length) parts.push(types.map((type) => TYPE_LABELS[type]).join(', '));
  return parts.join(' · ');
};

const CudzichFilterModal = ({ visible, value, onApply, onClose }) => {
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [types, setTypes] = useState([]);
  const [pickerFor, setPickerFor] = useState(null); // 'start' | 'end' | null

  // każde otwarcie zaczyna od aktualnego filtra
  useEffect(() => {
    if (!visible) return;
    setStart(value?.start || null);
    setEnd(value?.end || null);
    setTypes(Array.isArray(value?.types) ? value.types : []);
    setPickerFor(null);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const ranges = quickRanges();
  const activeRange = ranges.find((range) => sameDay(range.start, start) && sameDay(range.end, end));
  const invalid = Boolean(start && end && startOfDay(start) > startOfDay(end));

  const toggleType = (type) => setTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  const onPickDate = (event, date) => {
    const target = pickerFor;
    if (Platform.OS !== 'ios') setPickerFor(null); // Android: kalendarz to okienko systemowe, zamyka się sam
    if (event?.type === 'dismissed' || !date) return;
    if (target === 'start') setStart(startOfDay(date));
    if (target === 'end') setEnd(startOfDay(date));
  };

  const apply = () => {
    if (invalid) return;
    onApply?.({ start, end, types: types.length === TYPE_ORDER.length ? [] : types });
  };
  const clearAll = () => onApply?.({ start: null, end: null, types: [] });

  const DateField = ({ target, label, date }) => (
    <TouchableOpacity
      testID={`cudzich-filter-${target}`}
      style={[styles.dateField, pickerFor === target && styles.dateFieldActive]}
      onPress={() => setPickerFor(pickerFor === target ? null : target)}
    >
      <Text style={styles.dateFieldLabel}>{label}</Text>
      <View style={styles.dateFieldRow}>
        <Ionicons name="calendar-outline" size={16} color={tc('muted', '#94A3B8')} />
        <Text style={[styles.dateFieldValue, !date && { color: tc('muted', '#64748B') }]} numberOfLines={1}>
          {date ? formatDay(date) : (target === 'start' ? 'od początku' : 'do dziś')}
        </Text>
        {date ? (
          <TouchableOpacity
            onPress={() => (target === 'start' ? setStart(null) : setEnd(null))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Wyczyść datę"
          >
            <Ionicons name="close-circle" size={16} color={tc('muted', '#94A3B8')} />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={look.modalOverlay}>
        <View style={[look.modalContent, { maxHeight: '92%' }]} testID="cudzich-filter-modal">
          <ModalHeader icon="funnel-outline" color="#0D6EFD" title="Filtruj historię" />
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
            <Text style={look.formLabel}>Zakres dat</Text>
            <View style={styles.dateRow}>
              <DateField target="start" label="Od" date={start} />
              <DateField target="end" label="Do" date={end} />
            </View>
            {invalid ? <Text style={styles.error}>Data „Od” jest późniejsza niż „Do”.</Text> : null}
            {pickerFor ? (
              <View style={Platform.OS === 'ios' ? styles.iosPicker : null}>
                <DateTimePicker
                  testID="cudzich-filter-picker"
                  value={(pickerFor === 'start' ? start : end) || new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  maximumDate={new Date()}
                  onChange={onPickDate}
                  locale="pl-PL"
                />
                {Platform.OS === 'ios' ? (
                  <TouchableOpacity style={[look.neutralButton, styles.fullButton]} onPress={() => setPickerFor(null)}>
                    <Text style={look.neutralButtonText}>Gotowe</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            <Text style={[look.formLabel, { marginTop: 12 }]}>Szybki wybór</Text>
            <View style={styles.chips}>
              {ranges.map((range) => {
                const selected = activeRange?.key === range.key;
                return (
                  <TouchableOpacity
                    key={range.key}
                    testID={`cudzich-filter-range-${range.key}`}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => { setStart(range.start); setEnd(range.end); setPickerFor(null); }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{range.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[look.formLabel, { marginTop: 12 }]}>Rodzaj operacji</Text>
            <View style={styles.chips}>
              {TYPE_ORDER.map((type) => {
                const meta = CUDZICH_TYPES[type];
                const selected = types.includes(type);
                return (
                  <TouchableOpacity
                    key={type}
                    testID={`cudzich-filter-type-${type}`}
                    style={[styles.chip, selected && { borderColor: meta.color, backgroundColor: `${meta.color}26` }]}
                    onPress={() => toggleType(type)}
                  >
                    <Ionicons name={meta.icon} size={14} color={selected ? meta.color : tc('muted', '#94A3B8')} />
                    <Text style={[styles.chipText, selected && { color: meta.color, fontWeight: '700' }]}>{TYPE_LABELS[type]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.hint}>Bez zaznaczenia - wszystkie rodzaje.</Text>
          </ScrollView>

          <View style={styles.buttons}>
            <TouchableOpacity
              testID="cudzich-filter-apply"
              style={[look.primaryButton, styles.fullButton, invalid && look.disabled]}
              onPress={apply}
              disabled={invalid}
            >
              <Text style={look.buttonText} numberOfLines={1}>Zastosuj</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="cudzich-filter-clear" style={[look.neutralButton, styles.fullButton]} onPress={clearAll}>
              <Text style={look.neutralButtonText} numberOfLines={1}>Wyczyść filtry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateField: {
    flex: 1,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dateFieldActive: {
    borderColor: '#0D6EFD',
  },
  dateFieldLabel: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    fontWeight: '600',
  },
  dateFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  dateFieldValue: {
    flex: 1,
    color: tc('text', '#fff'),
    fontSize: 15,
    fontWeight: '600',
  },
  iosPicker: {
    marginTop: 8,
  },
  error: {
    color: '#EF4444',
    fontSize: 13,
    marginTop: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    backgroundColor: tc('surface2', '#1E1E2D'),
  },
  chipSelected: {
    borderColor: '#0D6EFD',
    backgroundColor: 'rgba(13, 110, 253, 0.15)',
  },
  chipText: {
    color: tc('text', '#fff'),
    fontSize: 14,
  },
  chipTextSelected: {
    color: '#0D6EFD',
    fontWeight: '700',
  },
  hint: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    marginTop: 6,
  },
  buttons: {
    marginTop: 14,
    gap: 10,
  },
  fullButton: {
    flex: 0,
    alignSelf: 'stretch',
    paddingVertical: 12,
  },
}));

export default CudzichFilterModal;
