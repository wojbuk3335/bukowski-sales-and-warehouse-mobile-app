// Dziennik aktywności (admin): kto, na którym telefonie, na którym punkcie, co i kiedy zrobił.
// Dane z serwera (GET /activity): zmiany danych, odmowy, logowania, ekrany, próby zrzutu, aplikacja w tle.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, TextInput, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getApiUrl } from '../config/api';
import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';
import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext';
import { PageHeader, ModalHeader, look } from '../components/AdminLook';

const PRIMARY = '#0D6EFD'; // kolor akcentu jak w pozostałych ekranach admina
const DANGER = '#DC3545'; // czerwony przycisków usuwania jak w pozostałych ekranach
import useLiveRefresh from '../services/useLiveRefresh'; // nowe wpisy na żywo (sygnał z serwera po każdym zapisie)

const PAGE_SIZE = 60;

// Rodzaje zdarzeń: filtr i kolor plakietki
export const KINDS = [
  { key: '', label: 'Wszystko', icon: 'list-outline', color: '#0D6EFD' },
  { key: 'request,denied', label: 'Zmiany', icon: 'create-outline', color: '#22C55E' },
  { key: 'auth', label: 'Logowania', icon: 'key-outline', color: '#A855F7' },
  { key: 'screen', label: 'Ekrany', icon: 'phone-portrait-outline', color: '#38BDF8' },
  { key: 'screenshot', label: 'Zrzuty', icon: 'camera-outline', color: '#EF4444' },
  { key: 'app', label: 'Tło', icon: 'moon-outline', color: '#94A3B8' },
];
export const KIND_STYLE = {
  request: { color: '#22C55E', icon: 'create-outline', label: 'Zmiana' },
  denied: { color: '#F97316', icon: 'ban-outline', label: 'Odmowa' },
  auth: { color: '#A855F7', icon: 'key-outline', label: 'Logowanie' },
  screen: { color: '#38BDF8', icon: 'phone-portrait-outline', label: 'Ekran' },
  screenshot: { color: '#EF4444', icon: 'camera-outline', label: 'Zrzut' },
  app: { color: '#94A3B8', icon: 'moon-outline', label: 'Aplikacja' },
};

// Dni: dziś / wczoraj / 7 dni (daty lokalne RRRR-MM-DD)
const localDay = (offsetDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export const DAY_RANGES = [
  { key: 'today', label: 'Dziś', range: () => ({ from: localDay(0), to: localDay(0) }) },
  { key: 'yesterday', label: 'Wczoraj', range: () => ({ from: localDay(-1), to: localDay(-1) }) },
  { key: 'week', label: '7 dni', range: () => ({ from: localDay(-6), to: localDay(0) }) },
  { key: 'all', label: '3 mies.', range: () => ({ from: '', to: '' }) },
];

export const formatTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// Wpis z dziennika -> parametry zapytania
export const buildQuery = ({ day, kind, deviceId, sellingPoint, q, page }) => {
  const params = new URLSearchParams();
  const range = (DAY_RANGES.find((item) => item.key === day) || DAY_RANGES[0]).range();
  if (range.from) params.append('from', range.from);
  if (range.to) params.append('to', range.to);
  if (kind) params.append('kind', kind);
  if (deviceId) params.append('deviceId', deviceId);
  if (sellingPoint) params.append('sellingPoint', sellingPoint);
  if (q && q.trim()) params.append('q', q.trim());
  params.append('page', String(page || 1));
  params.append('limit', String(PAGE_SIZE));
  return params.toString();
};

const ActivityLogScreen = () => {
  useAppTheme();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [day, setDay] = useState('today');
  const [kind, setKind] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [sellingPoint, setSellingPoint] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ devices: [], points: [], employees: [] });
  const [tab, setTab] = useState('log'); // 'log' | 'devices'
  const [employeeTarget, setEmployeeTarget] = useState(null); // urządzenie, któremu wybieramy pracownika
  const [nameTarget, setNameTarget] = useState(null); // urządzenie, któremu zmieniamy nazwę
  const [nameDraft, setNameDraft] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [clearWord, setClearWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(null); // 'device' | 'point'
  const [expanded, setExpanded] = useState(null);

  const fetchPage = useCallback(async (nextPage, { append = false, silent = false } = {}) => {
    if (!silent && !append) setLoading(true);
    if (append) setLoadingMore(true);
    try {
      const query = buildQuery({ day, kind, deviceId, sellingPoint, q: search, page: nextPage });
      const response = await tokenService.authenticatedFetch(getApiUrl(`/activity?${query}`));
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Błąd serwera');
      setItems((current) => (append ? [...current, ...(data.items || [])] : (data.items || [])));
      setTotal(data.total || 0);
      setPage(nextPage);
    } catch (error) {
      if (!silent) appAlert('Błąd', `Nie udało się pobrać dziennika: ${error.message}`);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [day, kind, deviceId, sellingPoint, search]);

  const loadFilters = useCallback(async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/activity/filters'));
      const data = await response.json();
      if (response.ok) setFilters({ devices: data.devices || [], points: data.points || [], employees: data.employees || [] });
    } catch (_error) {
      // filtry opcjonalne - lista działa bez nich
    }
  }, []);
  useEffect(() => { loadFilters(); }, [loadFilters]);

  // ---- Urządzenia: nazwa, pracownik, usuwanie ----
  const updateDevice = async (device, body) => {
    setBusy(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl(`/activity/devices/${device.deviceId}`), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Błąd serwera');
      setFilters((current) => ({ ...current, devices: current.devices.map((entry) => (entry.deviceId === device.deviceId ? data.device : entry)) }));
      return true;
    } catch (error) {
      appAlert('Błąd', `Nie zapisano: ${error.message}`);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const saveName = async () => {
    if (!nameTarget) return;
    if (await updateDevice(nameTarget, { name: nameDraft.trim() })) setNameTarget(null);
  };
  const removeDevice = (device) => {
    const name = [device.name, device.model].filter(Boolean).join(' · ') || 'to urządzenie';
    appAlert('Usunąć urządzenie?', `${name}\n\nWpisy w dzienniku zostaną. Jeśli urządzenie znów się połączy, pojawi się ponownie - bez nazwy i pracownika.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive', onPress: async () => {
          try {
            const response = await tokenService.authenticatedFetch(getApiUrl(`/activity/devices/${device.deviceId}`), { method: 'DELETE' });
            if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.message || 'Błąd serwera');
            setFilters((current) => ({ ...current, devices: current.devices.filter((entry) => entry.deviceId !== device.deviceId) }));
            if (deviceId === device.deviceId) setDeviceId('');
          } catch (error) {
            appAlert('Błąd', `Nie usunięto: ${error.message}`);
          }
        },
      },
    ]);
  };

  // ---- Wyczyść dziennik: słowo WYCZYŚĆ (serwer sprawdza to samo) ----
  const clearWordOk = clearWord.trim().toLocaleUpperCase('pl-PL') === 'WYCZYŚĆ';
  const clearLog = async () => {
    if (!clearWordOk) return;
    setBusy(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/activity'), {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'WYCZYŚĆ' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Błąd serwera');
      setClearOpen(false);
      setClearWord('');
      fetchPage(1, { silent: true });
      appAlert('Dziennik wyczyszczony', data.message || '');
    } catch (error) {
      appAlert('Błąd', `Nie wyczyszczono: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  // Szukanie dopiero po chwili od ostatniej litery
  useEffect(() => {
    const timer = setTimeout(() => fetchPage(1), search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchPage, search]);

  // Ktoś coś robi na telefonie / w panelu - lista odświeża się sama (pierwsza strona, bez migania)
  useLiveRefresh(['activity'], () => fetchPage(1, { silent: true }));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPage(1, { silent: true });
    setRefreshing(false);
  };

  const loadMore = () => {
    if (loadingMore || loading || items.length >= total) return;
    fetchPage(page + 1, { append: true });
  };

  const deviceName = useMemo(() => filters.devices.find((device) => device.deviceId === deviceId)?.label || '', [filters, deviceId]);

  const renderItem = ({ item }) => {
    const style = KIND_STYLE[item.kind] || KIND_STYLE.app;
    const failed = item.kind === 'request' && item.status >= 400;
    const color = failed ? '#F97316' : style.color;
    const isOpen = expanded === item._id;
    const who = [item.employeeName, item.symbol || item.email, item.sellingPoint].filter(Boolean).join(' · ');
    return (
      <TouchableOpacity style={[styles.card, { borderLeftColor: color }]} onPress={() => setExpanded(isOpen ? null : item._id)} activeOpacity={0.8} testID={`activity-${item._id}`}>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, { backgroundColor: `${color}26`, borderColor: `${color}80` }]}>
            <Ionicons name={style.icon} size={14} color={color} />
            <Text style={[styles.badgeText, { color }]}>{failed ? 'Nieudane' : style.label}</Text>
          </View>
          <Text style={styles.time}>{formatTime(item.at)}</Text>
        </View>
        <Text style={styles.label} numberOfLines={isOpen ? undefined : 2}>{item.label}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="person-outline" size={14} color={tc('muted', '#94A3B8')} />
          <Text style={styles.meta} numberOfLines={1}>{who || '-'}</Text>
          <Ionicons name={item.source === 'web' ? 'desktop-outline' : 'phone-portrait-outline'} size={14} color={tc('muted', '#94A3B8')} style={{ marginLeft: 10 }} />
          <Text style={styles.meta} numberOfLines={1}>{item.source === 'web' ? 'Panel www' : (item.deviceLabel || item.deviceName || 'telefon')}</Text>
        </View>
        {isOpen && (
          <View style={styles.detailsBox} testID={`details-${item._id}`}>
            {Array.isArray(item.details?.changes) && item.details.changes.length > 0 && (
              <>
                <Text style={styles.detailsSection}>ZMIANY</Text>
                {item.details.changes.map((change) => <Text key={change} style={styles.detailsChange}>• {change}</Text>)}
              </>
            )}
            {Array.isArray(item.details?.fields) && item.details.fields.length > 0 && (
              <>
                <Text style={styles.detailsSection}>DANE</Text>
                {item.details.fields.map((field, index) => (
                  <View key={`${field.label}-${index}`} style={styles.detailsRow}>
                    <Text style={styles.detailsKey}>{field.label}</Text>
                    <Text style={styles.detailsValue}>{field.value}</Text>
                  </View>
                ))}
              </>
            )}
            <Text style={styles.detailsSection}>KTO / SKĄD</Text>
            {[
              ['pracownik', item.employeeName],
              ['konto', [item.symbol, item.email].filter(Boolean).join(' · ')],
              ['punkt', item.sellingPoint],
              ['źródło', item.source === 'web' ? 'panel www' : (item.deviceLabel || item.deviceName || 'telefon')],
              ['model', item.source !== 'web' ? item.deviceName : ''],
              ['wersja aplikacji', item.appVersion],
              ['adres IP', item.ip],
            ].filter(([, value]) => value).map(([label, value]) => (
              <View key={label} style={styles.detailsRow}><Text style={styles.detailsKey}>{label}</Text><Text style={styles.detailsValue}>{value}</Text></View>
            ))}
            <Text style={styles.detailsSection}>TECHNICZNIE</Text>
            {[
              ['czas', formatTime(item.at)],
              ['rodzaj', item.action],
              ['zapytanie', item.path ? `${item.method} ${item.path}` : ''],
              ['wynik', item.status ? `${item.status} ${item.status >= 400 ? '(błąd)' : '(ok)'}${item.durationMs != null ? ` · ${item.durationMs} ms` : ''}` : ''],
            ].filter(([, value]) => value).map(([label, value]) => (
              <View key={label} style={styles.detailsRow}><Text style={styles.detailsKey}>{label}</Text><Text style={styles.detailsValue}>{value}</Text></View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Jedna lista wyboru dla wszystkich filtrów
  const PICKERS = {
    day: { title: 'Okres', icon: 'calendar-outline', value: day, set: setDay, items: DAY_RANGES.map((range) => ({ key: range.key, label: range.label })) },
    kind: { title: 'Rodzaj zdarzenia', icon: 'list-outline', value: kind, set: setKind, items: KINDS.map((entry) => ({ key: entry.key, label: entry.label, icon: entry.icon, color: entry.color })) },
    device: {
      title: 'Urządzenie', icon: 'phone-portrait-outline', value: deviceId, set: setDeviceId,
      items: [{ key: '', label: 'Wszystkie urządzenia' }, ...filters.devices.map((device) => ({ key: device.deviceId, label: device.label, sub: [device.employeeName, device.model !== device.label ? device.model : '', device.sellingPoint].filter(Boolean).join(' · ') }))],
    },
    point: { title: 'Punkt sprzedaży', icon: 'storefront-outline', value: sellingPoint, set: setSellingPoint, items: [{ key: '', label: 'Wszystkie punkty' }, ...filters.points.map((point) => ({ key: point, label: point }))] },
    employee: {
      title: 'Pracownik urządzenia', icon: 'person-outline', value: employeeTarget?.employeeId || '',
      set: (employeeId) => { if (employeeTarget) updateDevice(employeeTarget, { employeeId }); setEmployeeTarget(null); },
      items: [{ key: '', label: '— nie przypisano —' }, ...(filters.employees || []).map((employee) => ({ key: employee.employeeId, label: employee.name, sub: employee.workLocation }))],
    },
  };
  const picker = pickerOpen ? PICKERS[pickerOpen] : null;
  const pickerItems = picker ? picker.items : [];

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <PageHeader title="Dziennik aktywności" subtitle={tab === 'log' ? `${total} zdarzeń` : `${filters.devices.length} urządzeń`} icon="pulse-outline" onBack={() => router.back()} />

      <View style={styles.tabs}>
        {[['log', 'Dziennik', 'list-outline'], ['devices', `Urządzenia (${filters.devices.length})`, 'phone-portrait-outline']].map(([key, label, icon]) => (
          <TouchableOpacity key={key} style={[styles.tab, tab === key && styles.tabActive]} onPress={() => { setTab(key); if (key === 'devices') loadFilters(); }} testID={`tab-${key}`}>
            <Ionicons name={icon} size={16} color={tab === key ? '#fff' : tc('muted', '#94A3B8')} />
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'log' ? (
      <>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={tc('muted', '#94A3B8')} />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj: produkt, osoba, telefon…"
          placeholderTextColor={tc('muted', '#64748B')}
          value={search}
          onChangeText={setSearch}
          testID="activity-search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={tc('muted', '#94A3B8')} /></TouchableOpacity>
        ) : null}
      </View>

      {/* Filtry: 4 pola wyboru w siatce 2x2 (dotknięcie otwiera listę) - zamiast przewijanych pigułek */}
      <View style={styles.filtersGrid}>
        {[
          { key: 'day', label: 'Okres', icon: 'calendar-outline', value: (DAY_RANGES.find((range) => range.key === day) || DAY_RANGES[0]).label, active: day !== 'today' },
          { key: 'kind', label: 'Rodzaj', icon: (KINDS.find((entry) => entry.key === kind) || KINDS[0]).icon, value: (KINDS.find((entry) => entry.key === kind) || KINDS[0]).label, active: !!kind },
          { key: 'device', label: 'Urządzenie', icon: 'phone-portrait-outline', value: deviceName || 'Wszystkie', active: !!deviceId },
          { key: 'point', label: 'Punkt', icon: 'storefront-outline', value: sellingPoint || 'Wszystkie', active: !!sellingPoint },
        ].map((field) => (
          <TouchableOpacity key={field.key} style={[styles.filterField, field.active && styles.filterFieldActive]} onPress={() => setPickerOpen(field.key)} testID={`pick-${field.key}`} activeOpacity={0.8}>
            <Ionicons name={field.icon} size={18} color={field.active ? PRIMARY : tc('muted', '#94A3B8')} />
            <View style={{ flex: 1 }}>
              <Text style={styles.filterLabel}>{field.label}</Text>
              <Text style={styles.filterValue} numberOfLines={1}>{field.value}</Text>
            </View>
            <Ionicons name="chevron-down" size={16} color={tc('muted', '#94A3B8')} />
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.clearButton} onPress={() => { setClearWord(''); setClearOpen(true); }} testID="clear-log">
          <Ionicons name="trash-outline" size={15} color="#fff" />
          <Text style={styles.clearButtonText}>Wyczyść dziennik</Text>
        </TouchableOpacity>
        {(day !== 'today' || kind || deviceId || sellingPoint) ? (
          <TouchableOpacity style={styles.resetFilters} onPress={() => { setDay('today'); setKind(''); setDeviceId(''); setSellingPoint(''); }} testID="reset-filters">
            <Ionicons name="close-circle-outline" size={15} color={PRIMARY} />
            <Text style={styles.resetFiltersText}>Wyczyść filtry</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<View style={styles.center}><Ionicons name="pulse-outline" size={40} color={tc('muted', '#64748B')} /><Text style={styles.empty}>Brak zdarzeń dla wybranych filtrów</Text></View>}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={PRIMARY} /> : (items.length < total ? <Text style={styles.footer}>Przewiń, żeby wczytać więcej ({items.length} z {total})</Text> : null)}
        />
      )}
      </>
      ) : (
        <FlatList
          data={filters.devices}
          keyExtractor={(device) => device.deviceId}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={loadFilters} tintColor={PRIMARY} />}
          ListHeaderComponent={<Text style={styles.devicesHint}>Nazwa to nazwa urządzenia (np. „Telefon 1 - Parzygnat”). Pracownik to osoba, która go używa - jego imię i nazwisko pojawi się przy każdym wpisie.</Text>}
          ListEmptyComponent={<View style={styles.center}><Ionicons name="phone-portrait-outline" size={40} color={tc('muted', '#64748B')} /><Text style={styles.empty}>Żadne urządzenie jeszcze się nie zgłosiło</Text></View>}
          renderItem={({ item: device }) => (
            <View style={styles.deviceCard} testID={`device-${device.deviceId}`}>
              <View style={styles.deviceHeader}>
                <View style={[look.optionCardIcon, { backgroundColor: 'rgba(13, 110, 253, 0.15)' }]}>
                  <Ionicons name={device.platform === 'web' ? 'desktop-outline' : 'phone-portrait-outline'} size={20} color={PRIMARY} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName} numberOfLines={1}>{device.name || device.model || 'Urządzenie bez nazwy'}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{[device.name ? device.model : '', device.appVersion ? `aplikacja ${device.appVersion}` : ''].filter(Boolean).join(' · ') || ' '}</Text>
                </View>
              </View>
              <View style={styles.detailsRow}><Text style={styles.detailsKey}>pracownik</Text><Text style={styles.detailsValue}>{device.employeeName || '— nie przypisano —'}</Text></View>
              <View style={styles.detailsRow}><Text style={styles.detailsKey}>ostatnio</Text><Text style={styles.detailsValue}>{[device.lastSymbol, device.sellingPoint].filter(Boolean).join(' · ') || '-'}{device.lastSeenAt ? ` · ${formatTime(device.lastSeenAt)}` : ''}</Text></View>
              <View style={styles.deviceActions}>
                <TouchableOpacity style={styles.deviceAction} onPress={() => { setNameDraft(device.name || ''); setNameTarget(device); }} testID={`rename-${device.deviceId}`}>
                  <Ionicons name="create-outline" size={16} color={PRIMARY} /><Text style={styles.deviceActionText}>Nazwa</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deviceAction} onPress={() => { setEmployeeTarget(device); setPickerOpen('employee'); }} testID={`assign-${device.deviceId}`}>
                  <Ionicons name="person-outline" size={16} color={PRIMARY} /><Text style={styles.deviceActionText}>Pracownik</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.deviceAction, styles.deviceActionDanger]} onPress={() => removeDevice(device)} testID={`delete-${device.deviceId}`}>
                  <Ionicons name="trash-outline" size={15} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Nazwa urządzenia */}
      <Modal visible={!!nameTarget} transparent animationType="fade" onRequestClose={() => setNameTarget(null)}>
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="create-outline" title="Nazwa urządzenia" subtitle={nameTarget?.model || ''} />
            <TextInput style={[look.formInput, { width: '100%', marginTop: 8 }]} value={nameDraft} onChangeText={setNameDraft} placeholder="np. Telefon 1 - Parzygnat" placeholderTextColor={tc('muted', '#64748B')} maxLength={60} autoFocus testID="device-name-input" />
            <View style={[look.buttonRow, { width: '100%', marginTop: 16 }]}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setNameTarget(null)}><Text style={look.neutralButtonText}>Anuluj</Text></TouchableOpacity>
              <TouchableOpacity style={[look.primaryButton, busy && look.disabled]} onPress={saveName} disabled={busy} testID="device-name-save"><Text style={look.buttonText}>{busy ? 'Zapisuję…' : 'Zapisz'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Wyczyść dziennik: ostrzeżenie + słowo WYCZYŚĆ */}
      <Modal visible={clearOpen} transparent animationType="fade" onRequestClose={() => setClearOpen(false)}>
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="warning-outline" color={DANGER} title="Wyczyścić cały dziennik?" />
            <Text style={look.modalMessage}>Trwale usuniesz wszystkie wpisy (zmiany, logowania, ekrany, zrzuty) ze wszystkich telefonów i komputerów. Tej operacji nie da się cofnąć. Zostanie jeden wpis, że dziennik wyczyściłeś.</Text>
            <Text style={[look.formLabel, { alignSelf: 'flex-start' }]}>Aby potwierdzić, wpisz: WYCZYŚĆ</Text>
            <TextInput style={[look.formInput, { width: '100%', marginTop: 8 }]} value={clearWord} onChangeText={setClearWord} placeholder="WYCZYŚĆ" placeholderTextColor={tc('muted', '#64748B')} autoCapitalize="characters" testID="clear-word" />
            <View style={[look.buttonRow, { width: '100%', marginTop: 16 }]}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setClearOpen(false)}><Text style={look.neutralButtonText}>Anuluj</Text></TouchableOpacity>
              <TouchableOpacity style={[look.primaryButton, { backgroundColor: DANGER }, (!clearWordOk || busy) && look.disabled]} onPress={clearLog} disabled={!clearWordOk || busy} testID="clear-confirm"><Text style={look.buttonText}>{busy ? 'Czyszczę…' : 'Wyczyść'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(null)}>
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon={picker?.icon || 'list-outline'} title={picker?.title || ''} />
            <ScrollView style={{ maxHeight: 420, width: '100%' }}>
              {pickerItems.map((entry) => {
                const active = picker.value === entry.key;
                const color = entry.color || PRIMARY;
                return (
                  <TouchableOpacity
                    key={entry.key || 'all'}
                    style={[look.optionCard, { marginBottom: 8 }, active && { borderColor: color, backgroundColor: `${color}1F` }]}
                    onPress={() => { picker.set(entry.key); setPickerOpen(null); }}
                    testID={`option-${entry.key || 'all'}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                  >
                    {entry.icon ? (
                      <View style={[look.optionCardIcon, { backgroundColor: `${color}26` }]}><Ionicons name={entry.icon} size={20} color={color} /></View>
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Text style={look.optionCardLabel}>{entry.label}</Text>
                      {entry.sub ? <Text style={styles.pickerSub}>{entry.sub}</Text> : null}
                    </View>
                    <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={active ? color : tc('muted', '#94A3B8')} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={[look.neutralButton, { flex: 0, marginTop: 8, width: '100%' }]} onPress={() => setPickerOpen(null)}><Text style={look.neutralButtonText}>Zamknij</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc('bg', '#000000') },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  empty: { color: tc('muted', '#94A3B8'), marginTop: 10, fontSize: 14 },
  footer: { color: tc('muted', '#94A3B8'), textAlign: 'center', marginVertical: 14, fontSize: 12 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 4,
    backgroundColor: tc('surface2', '#1E1E2D'), borderWidth: 1, borderColor: tc('border', '#334155'), borderRadius: 12, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: tc('text', '#fff'), fontSize: 15, paddingVertical: 10 },
  filtersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 10 },
  filterField: {
    width: '48.5%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: tc('surface2', '#1E1E2D'), borderWidth: 1, borderColor: tc('border', '#334155'), borderRadius: 12, minHeight: 52,
  },
  filterFieldActive: { borderColor: PRIMARY, backgroundColor: 'rgba(13, 110, 253, 0.12)' },
  filterLabel: { color: tc('muted', '#94A3B8'), fontSize: 11 },
  filterValue: { color: tc('text', '#fff'), fontSize: 14, fontWeight: '600', marginTop: 1 },
  resetFilters: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 8 },
  clearButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DANGER, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  clearButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 12, marginBottom: 10 }, // odstęp od nagłówka
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: tc('border', '#334155'), backgroundColor: tc('surface2', '#1E1E2D') },
  tabActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  tabText: { color: tc('muted', '#94A3B8'), fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  devicesHint: { color: tc('muted', '#94A3B8'), fontSize: 12, marginBottom: 10 },
  deviceCard: { backgroundColor: tc('surface', '#161622'), borderRadius: 12, borderWidth: 1, borderColor: tc('border', '#1E293B'), padding: 12, marginBottom: 10 },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  deviceName: { color: tc('text', '#fff'), fontSize: 15, fontWeight: '700' },
  deviceActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  deviceAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(13, 110, 253, 0.15)', borderWidth: 1, borderColor: 'rgba(13, 110, 253, 0.4)' },
  deviceActionDanger: { flex: 0, paddingHorizontal: 14, backgroundColor: DANGER, borderColor: DANGER },
  deviceActionText: { color: tc('text', '#fff'), fontSize: 13, fontWeight: '600' },
  resetFiltersText: { color: PRIMARY, fontSize: 13, fontWeight: '600' },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: tc('surface', '#161622'), borderRadius: 12, borderWidth: 1, borderColor: tc('border', '#1E293B'),
    borderLeftWidth: 4, padding: 12, marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  time: { color: tc('muted', '#94A3B8'), fontSize: 12 },
  label: { color: tc('text', '#fff'), fontSize: 15, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  meta: { color: tc('muted', '#94A3B8'), fontSize: 12, flexShrink: 1 },
  detailsBox: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: tc('border', '#1E293B'), gap: 3 },
  detailsSection: { color: tc('muted', '#94A3B8'), fontSize: 10, letterSpacing: 1, marginTop: 8, marginBottom: 2 },
  detailsChange: { color: tc('text', '#fff'), fontSize: 13 },
  detailsRow: { flexDirection: 'row', gap: 8, paddingVertical: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tc('border', '#1E293B') },
  detailsKey: { color: tc('muted', '#94A3B8'), fontSize: 12, width: 120 },
  detailsValue: { color: tc('text', '#fff'), fontSize: 12, flex: 1 },
  pickerSub: { color: tc('muted', '#94A3B8'), fontSize: 12, marginTop: 2 },
}));

export default ActivityLogScreen;
