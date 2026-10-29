import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import tokenService from '../services/tokenService';
import { getApiUrl } from '../config/api';
import { appAlert } from '../services/appAlert';
import { readJson, serverErrorMessage } from '../utils/readJson';

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, IconButton, ModalHeader, look } from '../components/AdminLook'; // wspólny wygląd (styl panelu admina)
import { KeyboardSafeScreen } from "../components/KeyboardSafe"; // klawiatura nie zasłania pola

// Historia ma dziesiątki tysięcy wpisów - pobieramy ją stronami z serwera (wyszukiwanie i filtry też liczy serwer),
// a lista jest wirtualizowana. Wcześniej cała kolekcja szła na telefon i każdy wpis był montowany naraz,
// co zawieszało ekran i zamykało aplikację z braku pamięci.
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;

const EMPTY_FILTERS = { collectionName: '', operation: '', from: '', to: '', user: '' };
const EMPTY_OPTIONS = { collections: [], operations: [], from: [], to: [], users: [] };

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getOperationColor = (operation) => {
  if (!operation) return '#64748B';
  const op = operation.toLowerCase();
  if (op.includes('create') || op.includes('add')) return '#22C55E';
  if (op.includes('update') || op.includes('modify')) return '#F59E0B';
  if (op.includes('delete') || op.includes('remove')) return '#EF4444';
  return '#3B82F6';
};

// Kto wykonał operację: symbol punktu, a gdy go brak - e-mail (backend zwraca email, nie username)
const userLabel = (user) => {
  if (!user) return '';
  if (typeof user === 'string') return '';
  return user.symbol || user.email || '';
};

// Parametry zapytania do serwera dla bieżącej strony, wyszukiwania i filtrów
const buildHistoryUrl = (page, query, filters) => {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(PAGE_SIZE));
  if (query) params.set('q', query);
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return getApiUrl(`/history?${params.toString()}`);
};

// Jeden wpis historii - zmemoizowany, żeby wpisanie litery w wyszukiwarce nie przerysowywało całej listy
const HistoryRow = React.memo(({ item, onPress }) => {
  const operationColor = getOperationColor(item.operation);
  const who = userLabel(item.userloggedinId);

  return (
    <TouchableOpacity
      style={[styles.historyCard, { borderLeftColor: operationColor }]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.operationBadge, { backgroundColor: `${operationColor}26`, borderColor: `${operationColor}80` }]}>
          <Text style={[styles.operationText, { color: operationColor }]}>
            {item.operation || 'N/A'}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Ionicons name="cube-outline" size={16} color={tc('muted', "#94A3B8")} />
          <Text style={styles.infoLabel}>Kolekcja:</Text>
          <Text style={styles.infoValue}>{item.collectionName || '-'}</Text>
        </View>

        {item.product ? (
          <View style={styles.infoRow}>
            <Ionicons name="pricetag-outline" size={16} color={tc('muted', "#94A3B8")} />
            <Text style={styles.infoLabel}>Produkt:</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {item.product}
            </Text>
          </View>
        ) : null}

        {(item.from || item.to) ? (
          <View style={styles.infoRow}>
            <Ionicons name="swap-horizontal-outline" size={16} color={tc('muted', "#94A3B8")} />
            <Text style={styles.infoLabel}>Transfer:</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {item.from || '-'} → {item.to || '-'}
            </Text>
          </View>
        ) : null}

        {who ? (
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={16} color={tc('muted', "#94A3B8")} />
            <Text style={styles.infoLabel}>Użytkownik:</Text>
            <Text style={styles.infoValue}>{who}</Text>
          </View>
        ) : null}

        <View style={styles.timestampRow}>
          <Ionicons name="time-outline" size={14} color={tc('muted', "#64748B")} />
          <Text style={styles.timestampText}>{formatDate(item.timestamp)}</Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <Ionicons name="chevron-forward" size={20} color={tc('muted', "#64748B")} />
      </View>
    </TouchableOpacity>
  );
});
HistoryRow.displayName = 'HistoryRow';

// Jedna grupa w okienku filtrów: „Wszystkie” + lista wartości
const FilterGroup = ({ label, allLabel = 'Wszystkie', options, value, onChange }) => (
  <View style={styles.filterGroup}>
    <Text style={styles.filterLabel}>{label}</Text>
    <ScrollView style={styles.optionsContainer} nestedScrollEnabled>
      <TouchableOpacity
        style={[styles.optionItem, !value && styles.optionItemSelected]}
        onPress={() => onChange('')}
      >
        <Text style={[styles.optionText, !value && styles.optionTextSelected]}>{allLabel}</Text>
      </TouchableOpacity>
      {options.map((option) => (
        <TouchableOpacity
          key={option.value}
          style={[styles.optionItem, value === option.value && styles.optionItemSelected]}
          onPress={() => onChange(option.value)}
        >
          <Text style={[styles.optionText, value === option.value && styles.optionTextSelected]}>
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  </View>
);

const History = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filterOptions, setFilterOptions] = useState(EMPTY_OPTIONS);

  // Numer ostatniego żądania - odpowiedź starszego żądania (np. po szybkim wpisaniu kilku liter) jest ignorowana
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const hasActiveFilters = Boolean(
    filters.collectionName || filters.operation || filters.from || filters.to || filters.user
  );

  // Wyszukiwanie dopiero po chwili od ostatniej litery - inaczej każdy znak to osobne zapytanie do serwera
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchPage = useCallback(async (pageToLoad, { replace = false, silent = false } = {}) => {
    const requestId = ++requestIdRef.current;
    if (replace && !silent) setLoading(true);
    try {
      const response = await tokenService.authenticatedFetch(
        buildHistoryUrl(pageToLoad, debouncedQuery, filters)
      );
      const data = await readJson(response);
      if (requestId !== requestIdRef.current) return; // w międzyczasie poszło nowsze zapytanie
      if (!response.ok) {
        throw new Error(serverErrorMessage(response, data, 'Nie udało się pobrać historii'));
      }
      const rows = Array.isArray(data.history) ? data.history : [];
      setItems((prev) => (replace ? rows : [...prev, ...rows]));
      setTotal(Number(data.total) || 0);
      setPage(pageToLoad);
      setHasMore(Boolean(data.hasMore));
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error('Error loading history:', error);
      appAlert('Błąd', error?.message || 'Nie udało się pobrać historii');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [debouncedQuery, filters]);

  // Pierwsza strona od nowa przy każdej zmianie wyszukiwania lub filtrów
  useEffect(() => {
    fetchPage(1, { replace: true });
  }, [fetchPage]);

  // Wartości do list filtrów - raz, osobnym lekkim zapytaniem (bez pobierania całej historii)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await tokenService.authenticatedFetch(getApiUrl('/history/filters'));
        const data = await readJson(response);
        if (cancelled || !response.ok) return;
        setFilterOptions({
          collections: Array.isArray(data.collections) ? data.collections : [],
          operations: Array.isArray(data.operations) ? data.operations : [],
          from: Array.isArray(data.from) ? data.from : [],
          to: Array.isArray(data.to) ? data.to : [],
          users: Array.isArray(data.users) ? data.users : [],
        });
      } catch (error) {
        console.error('Error loading history filters:', error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPage(1, { replace: true, silent: true });
    setRefreshing(false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await fetchPage(page + 1);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, loading, page, fetchPage]);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSearchQuery('');
  }, []);

  const openDetailsModal = useCallback((item) => {
    setSelectedItem(item);
    setShowDetailsModal(true);
  }, []);

  const setFilter = (key) => (value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const toOptions = (values) => values.map((value) => ({ value, label: value }));
  const userOptions = useMemo(
    () => filterOptions.users.map((user) => ({
      value: String(user._id),
      label: user.symbol ? `${user.symbol} (${user.email})` : user.email,
    })),
    [filterOptions.users]
  );

  const renderItem = useCallback(
    ({ item }) => <HistoryRow item={item} onPress={openDetailsModal} />,
    [openDetailsModal]
  );
  const keyExtractor = useCallback((item, index) => item._id || String(index), []);

  const listFooter = loadingMore ? (
    <View style={styles.footerLoader}>
      <ActivityIndicator size="small" color="#0D6EFD" />
    </View>
  ) : null;

  const listEmpty = (
    <View style={styles.emptyContainer}>
      <Ionicons name="document-outline" size={64} color={tc('muted', "#64748B")} />
      <Text style={styles.emptyText}>Brak wyników</Text>
      <Text style={styles.emptySubtext}>
        {!debouncedQuery && !hasActiveFilters
          ? 'Historia jest pusta'
          : 'Zmień kryteria wyszukiwania'}
      </Text>
      {(debouncedQuery || hasActiveFilters) ? (
        <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
          <Text style={styles.clearButtonText}>Wyczyść filtry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardSafeScreen>
      <Stack.Screen options={{ headerShown: false }} />
      <PageHeader
        title="Historia"
        icon="time"
        onBack={() => router.back()}
        right={
          <IconButton
            icon={hasActiveFilters ? 'funnel' : 'funnel-outline'}
            color={hasActiveFilters ? '#0D6EFD' : tc('muted', '#94A3B8')}
            onPress={() => setFilterModalVisible(true)}
            accessibilityLabel="Filtry"
          />
        }
      />

      <View style={styles.statsBar}>
        <Text style={styles.subtitle}>
          {total} {total === 1 ? 'rekord' : 'rekordów'}
          {items.length < total ? ` (pokazano ${items.length})` : ''}
        </Text>
        <TouchableOpacity
          onPress={() => setFilterModalVisible(true)}
          style={styles.filterTextButton}
        >
          <Ionicons
            name={hasActiveFilters ? 'funnel' : 'funnel-outline'}
            size={16}
            color={hasActiveFilters ? '#0D6EFD' : tc('muted', '#94A3B8')}
          />
          <Text style={styles.filterActiveText}>
            {hasActiveFilters ? 'Filtry aktywne' : 'Filtry'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={tc('muted', "#64748B")} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj w historii..."
          placeholderTextColor={tc('muted', "#64748B")}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery !== '' && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={tc('muted', "#64748B")} />
          </TouchableOpacity>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D6EFD" />
          <Text style={styles.loadingText}>Ładowanie historii...</Text>
        </View>
      ) : (
        <FlatList
          testID="history-list"
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          style={styles.content}
          contentContainerStyle={items.length === 0 ? styles.emptyList : null}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListFooterComponent={listFooter}
          ListEmptyComponent={listEmpty}
          initialNumToRender={12}
          maxToRenderPerBatch={16}
          windowSize={7}
          removeClippedSubviews
        />
      )}

      {/* Details Modal */}
      <Modal
        visible={showDetailsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader
              icon="document-text"
              color={getOperationColor(selectedItem?.operation)}
              title="Szczegóły operacji"
            />

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedItem && (
                <>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Operacja:</Text>
                    <Text style={styles.detailValue}>{selectedItem.operation || '-'}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Kolekcja:</Text>
                    <Text style={styles.detailValue}>{selectedItem.collectionName || '-'}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Czas:</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedItem.timestamp)}</Text>
                  </View>

                  {userLabel(selectedItem.userloggedinId) ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Użytkownik:</Text>
                      <Text style={styles.detailValue}>{userLabel(selectedItem.userloggedinId)}</Text>
                    </View>
                  ) : null}

                  {selectedItem.product ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Produkt:</Text>
                      <Text style={styles.detailValue}>{selectedItem.product}</Text>
                    </View>
                  ) : null}

                  {selectedItem.size ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Rozmiar:</Text>
                      <Text style={styles.detailValue}>{selectedItem.size}</Text>
                    </View>
                  ) : null}

                  {selectedItem.from ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Skąd:</Text>
                      <Text style={styles.detailValue}>{selectedItem.from}</Text>
                    </View>
                  ) : null}

                  {selectedItem.to ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Dokąd:</Text>
                      <Text style={styles.detailValue}>{selectedItem.to}</Text>
                    </View>
                  ) : null}

                  {selectedItem.details ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Szczegóły:</Text>
                      <Text style={styles.detailValue}>{selectedItem.details}</Text>
                    </View>
                  ) : null}

                  {selectedItem.transactionId ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>ID transakcji:</Text>
                      <Text style={[styles.detailValue, styles.monospace]}>
                        {selectedItem.transactionId}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}
            </ScrollView>
            <View style={look.buttonRow}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setShowDetailsModal(false)}>
                <Text style={look.neutralButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Filter Modal - okienko montowane tylko gdy otwarte */}
      {filterModalVisible && (
        <Modal
          visible
          animationType="slide"
          transparent={true}
          onRequestClose={() => setFilterModalVisible(false)}
        >
          <View style={look.modalOverlay}>
            <View style={look.modalContent}>
              <ModalHeader icon="funnel" color="#0D6EFD" title="Filtry" />

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <FilterGroup
                  label="Kolekcja:"
                  options={toOptions(filterOptions.collections)}
                  value={filters.collectionName}
                  onChange={setFilter('collectionName')}
                />
                <FilterGroup
                  label="Operacja:"
                  options={toOptions(filterOptions.operations)}
                  value={filters.operation}
                  onChange={setFilter('operation')}
                />
                <FilterGroup
                  label="Skąd:"
                  options={toOptions(filterOptions.from)}
                  value={filters.from}
                  onChange={setFilter('from')}
                />
                <FilterGroup
                  label="Dokąd:"
                  options={toOptions(filterOptions.to)}
                  value={filters.to}
                  onChange={setFilter('to')}
                />
                <FilterGroup
                  label="Użytkownik:"
                  allLabel="Wszyscy"
                  options={userOptions}
                  value={filters.user}
                  onChange={setFilter('user')}
                />
              </ScrollView>

              <TouchableOpacity
                style={[look.neutralButton, styles.clearFiltersButton]}
                onPress={() => {
                  clearFilters();
                  setFilterModalVisible(false);
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#DC3545" />
                <Text style={styles.clearFiltersButtonText}>Wyczyść wszystkie filtry</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[look.primaryButton, styles.applyFiltersButton]}
                onPress={() => setFilterModalVisible(false)}
              >
                <Text style={look.buttonText}>Zastosuj filtry</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc('bg', '#000000'),
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tc('bg', '#000000'),
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#1E293B'),
  },
  subtitle: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
  },
  filterTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  filterActiveText: {
    fontSize: 12,
    color: '#0D6EFD',
    marginLeft: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tc('surface', '#161622'),
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    marginHorizontal: 16,
    marginVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    height: 50,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: tc('text', '#fff'),
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: tc('muted', '#94A3B8'),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: tc('text', '#fff'),
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: tc('muted', '#64748B'),
    marginTop: 8,
    textAlign: 'center',
  },
  clearButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#0D6EFD',
    borderRadius: 12,
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyCard: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    borderLeftWidth: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  operationBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  operationText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardBody: {
    gap: 8,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  timestampText: {
    fontSize: 12,
    color: tc('muted', '#64748B'),
    fontStyle: 'italic',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    width: 80,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: tc('text', '#fff'),
  },
  cardFooter: {
    alignItems: 'flex-end',
    marginTop: 8,
  },
  modalBody: {
    flexGrow: 0,
    marginBottom: 8,
  },
  detailRow: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: tc('muted', '#94A3B8'),
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: tc('text', '#fff'),
  },
  monospace: {
    fontFamily: 'monospace',
  },
  filterGroup: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: tc('muted', '#94A3B8'),
    marginBottom: 6,
  },
  optionsContainer: {
    maxHeight: 150,
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    padding: 4,
  },
  optionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    marginVertical: 1,
  },
  optionItemSelected: {
    backgroundColor: '#0D6EFD26',
    borderColor: '#0D6EFD',
  },
  optionText: {
    color: tc('text', '#fff'),
    fontSize: 15,
  },
  optionTextSelected: {
    fontWeight: '700',
  },
  // przyciski okienka filtrów: na całą szerokość, jeden pod drugim
  clearFiltersButton: {
    flex: 0,
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  clearFiltersButtonText: {
    color: '#DC3545',
    fontSize: 16,
    fontWeight: 'bold',
  },
  applyFiltersButton: {
    flex: 0,
  },
}));

export default History;
