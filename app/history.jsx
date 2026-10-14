import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, IconButton, ModalHeader, look } from '../components/AdminLook'; // wspólny wygląd (styl panelu admina)
const History = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const [historyData, setHistoryData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    collectionName: '',
    operation: '',
    from: '',
    to: '',
    user: '',
  });

  // Available filter options
  const [availableCollections, setAvailableCollections] = useState([]);
  const [availableOperations, setAvailableOperations] = useState([]);
  const [availableFromLocations, setAvailableFromLocations] = useState([]);
  const [availableToLocations, setAvailableToLocations] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [historyData, searchQuery, filters]);

  useEffect(() => {
    // Extract unique values for filters
    if (historyData.length > 0) {
      const collections = [...new Set(historyData.map(item => item.collectionName).filter(Boolean))];
      const operations = [...new Set(historyData.map(item => item.operation).filter(Boolean))];
      const fromLocs = [...new Set(historyData.map(item => item.from).filter(Boolean))];
      const toLocs = [...new Set(historyData.map(item => item.to).filter(Boolean))];
      const users = [...new Set(historyData.map(item => item.userloggedinId?.username).filter(Boolean))];
      
      setAvailableCollections(collections.sort());
      setAvailableOperations(operations.sort());
      setAvailableFromLocations(fromLocs.sort());
      setAvailableToLocations(toLocs.sort());
      setAvailableUsers(users.sort());
    }
  }, [historyData]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const response = await tokenService.authenticatedFetch(
        getApiUrl('/history')
      );
      const data = await response.json();
      const historyArray = data.history || data || [];
      setHistoryData(historyArray);
    } catch (error) {
      console.error('Error loading history:', error);
      appAlert('Błąd', 'Nie udało się pobrać historii');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const applyFilters = () => {
    let filtered = [...historyData];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          (item.collectionName && item.collectionName.toLowerCase().includes(query)) ||
          (item.operation && item.operation.toLowerCase().includes(query)) ||
          (item.product && item.product.toLowerCase().includes(query)) ||
          (item.details && item.details.toLowerCase().includes(query)) ||
          (item.from && item.from.toLowerCase().includes(query)) ||
          (item.to && item.to.toLowerCase().includes(query))
      );
    }

    // Collection filter
    if (filters.collectionName) {
      filtered = filtered.filter(
        (item) => item.collectionName === filters.collectionName
      );
    }

    // Operation filter
    if (filters.operation) {
      filtered = filtered.filter(
        (item) => item.operation === filters.operation
      );
    }

    // From filter
    if (filters.from) {
      filtered = filtered.filter(
        (item) => item.from === filters.from
      );
    }

    // To filter
    if (filters.to) {
      filtered = filtered.filter(
        (item) => item.to === filters.to
      );
    }

    // User filter
    if (filters.user) {
      filtered = filtered.filter(
        (item) => item.userloggedinId?.username === filters.user
      );
    }

    setFilteredData(filtered);
  };

  const clearFilters = () => {
    setFilters({
      collectionName: '',
      operation: '',
      from: '',
      to: '',
      user: '',
    });
    setSearchQuery('');
  };

  const openDetailsModal = (item) => {
    setSelectedItem(item);
    setShowDetailsModal(true);
  };

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

  const renderHistoryItem = (item, index) => {
    const operationColor = getOperationColor(item.operation);
    
    return (
      <TouchableOpacity
        key={item._id || index}
        style={[styles.historyCard, { borderLeftColor: operationColor }]}
        onPress={() => openDetailsModal(item)}
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

          {item.product && (
            <View style={styles.infoRow}>
              <Ionicons name="pricetag-outline" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Produkt:</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {item.product}
              </Text>
            </View>
          )}

          {(item.from || item.to) && (
            <View style={styles.infoRow}>
              <Ionicons name="swap-horizontal-outline" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Transfer:</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {item.from || '-'} → {item.to || '-'}
              </Text>
            </View>
          )}

          {item.userloggedinId?.username && (
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Użytkownik:</Text>
              <Text style={styles.infoValue}>{item.userloggedinId.username}</Text>
            </View>
          )}
          
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
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <PageHeader
        title="Historia"
        icon="time"
        onBack={() => router.back()}
        right={
          <IconButton
            icon={
              filters.collectionName || filters.operation || filters.from || filters.to || filters.user
                ? 'funnel'
                : 'funnel-outline'
            }
            color={
              filters.collectionName || filters.operation || filters.from || filters.to || filters.user
                ? '#0D6EFD'
                : tc('muted', '#94A3B8')
            }
            onPress={() => setFilterModalVisible(true)}
            accessibilityLabel="Filtry"
          />
        }
      />

      <View style={styles.statsBar}>
        <Text style={styles.subtitle}>
          {filteredData.length} {filteredData.length === 1 ? 'rekord' : 'rekordów'}
        </Text>
        <TouchableOpacity
          onPress={() => setFilterModalVisible(true)}
          style={styles.filterTextButton}
        >
          <Ionicons
            name={
              filters.collectionName || filters.operation || filters.from || filters.to || filters.user
                ? 'funnel'
                : 'funnel-outline'
            }
            size={16}
            color={
              filters.collectionName || filters.operation || filters.from || filters.to || filters.user
                ? '#0D6EFD'
                : tc('muted', '#94A3B8')
            }
          />
          <Text style={styles.filterActiveText}>
            Filtry aktywne
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
        <ScrollView alwaysBounceVertical
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {filteredData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-outline" size={64} color={tc('muted', "#64748B")} />
              <Text style={styles.emptyText}>Brak wyników</Text>
              <Text style={styles.emptySubtext}>
                {historyData.length === 0
                  ? 'Historia jest pusta'
                  : 'Zmień kryteria wyszukiwania'}
              </Text>
              {(searchQuery || filters.collectionName || filters.operation || filters.user) && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={clearFilters}
                >
                  <Text style={styles.clearButtonText}>Wyczyść filtry</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredData.map((item, index) => renderHistoryItem(item, index))
          )}
        </ScrollView>
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

                  {selectedItem.userloggedinId?.username && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Użytkownik:</Text>
                      <Text style={styles.detailValue}>
                        {selectedItem.userloggedinId.username}
                      </Text>
                    </View>
                  )}

                  {selectedItem.product && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Produkt:</Text>
                      <Text style={styles.detailValue}>{selectedItem.product}</Text>
                    </View>
                  )}

                  {selectedItem.size && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Rozmiar:</Text>
                      <Text style={styles.detailValue}>{selectedItem.size}</Text>
                    </View>
                  )}

                  {selectedItem.from && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Skąd:</Text>
                      <Text style={styles.detailValue}>{selectedItem.from}</Text>
                    </View>
                  )}

                  {selectedItem.to && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Dokąd:</Text>
                      <Text style={styles.detailValue}>{selectedItem.to}</Text>
                    </View>
                  )}

                  {selectedItem.details && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Szczegóły:</Text>
                      <Text style={styles.detailValue}>{selectedItem.details}</Text>
                    </View>
                  )}

                  {selectedItem.transactionId && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>ID transakcji:</Text>
                      <Text style={[styles.detailValue, styles.monospace]}>
                        {selectedItem.transactionId}
                      </Text>
                    </View>
                  )}
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

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="funnel" color="#0D6EFD" title="Filtry" />

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Kolekcja:</Text>
                <ScrollView style={styles.optionsContainer} nestedScrollEnabled>
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      !filters.collectionName && styles.optionItemSelected,
                    ]}
                    onPress={() => setFilters({ ...filters, collectionName: '' })}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        !filters.collectionName && styles.optionTextSelected,
                      ]}
                    >
                      Wszystkie
                    </Text>
                  </TouchableOpacity>
                  {availableCollections.map((collection) => (
                    <TouchableOpacity
                      key={collection}
                      style={[
                        styles.optionItem,
                        filters.collectionName === collection && styles.optionItemSelected,
                      ]}
                      onPress={() => setFilters({ ...filters, collectionName: collection })}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          filters.collectionName === collection && styles.optionTextSelected,
                        ]}
                      >
                        {collection}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Operacja:</Text>
                <ScrollView style={styles.optionsContainer} nestedScrollEnabled>
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      !filters.operation && styles.optionItemSelected,
                    ]}
                    onPress={() => setFilters({ ...filters, operation: '' })}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        !filters.operation && styles.optionTextSelected,
                      ]}
                    >
                      Wszystkie
                    </Text>
                  </TouchableOpacity>
                  {availableOperations.map((operation) => (
                    <TouchableOpacity
                      key={operation}
                      style={[
                        styles.optionItem,
                        filters.operation === operation && styles.optionItemSelected,
                      ]}
                      onPress={() => setFilters({ ...filters, operation: operation })}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          filters.operation === operation && styles.optionTextSelected,
                        ]}
                      >
                        {operation}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Skąd:</Text>
                <ScrollView style={styles.optionsContainer} nestedScrollEnabled>
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      !filters.from && styles.optionItemSelected,
                    ]}
                    onPress={() => setFilters({ ...filters, from: '' })}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        !filters.from && styles.optionTextSelected,
                      ]}
                    >
                      Wszystkie
                    </Text>
                  </TouchableOpacity>
                  {availableFromLocations.map((location) => (
                    <TouchableOpacity
                      key={location}
                      style={[
                        styles.optionItem,
                        filters.from === location && styles.optionItemSelected,
                      ]}
                      onPress={() => setFilters({ ...filters, from: location })}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          filters.from === location && styles.optionTextSelected,
                        ]}
                      >
                        {location}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Dokąd:</Text>
                <ScrollView style={styles.optionsContainer} nestedScrollEnabled>
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      !filters.to && styles.optionItemSelected,
                    ]}
                    onPress={() => setFilters({ ...filters, to: '' })}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        !filters.to && styles.optionTextSelected,
                      ]}
                    >
                      Wszystkie
                    </Text>
                  </TouchableOpacity>
                  {availableToLocations.map((location) => (
                    <TouchableOpacity
                      key={location}
                      style={[
                        styles.optionItem,
                        filters.to === location && styles.optionItemSelected,
                      ]}
                      onPress={() => setFilters({ ...filters, to: location })}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          filters.to === location && styles.optionTextSelected,
                        ]}
                      >
                        {location}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Użytkownik:</Text>
                <ScrollView style={styles.optionsContainer} nestedScrollEnabled>
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      !filters.user && styles.optionItemSelected,
                    ]}
                    onPress={() => setFilters({ ...filters, user: '' })}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        !filters.user && styles.optionTextSelected,
                      ]}
                    >
                      Wszyscy
                    </Text>
                  </TouchableOpacity>
                  {availableUsers.map((user) => (
                    <TouchableOpacity
                      key={user}
                      style={[
                        styles.optionItem,
                        filters.user === user && styles.optionItemSelected,
                      ]}
                      onPress={() => setFilters({ ...filters, user: user })}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          filters.user === user && styles.optionTextSelected,
                        ]}
                      >
                        {user}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

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
  filterInput: {
    backgroundColor: tc('surface2', '#334155'),
    color: tc('text', '#fff'),
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
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
