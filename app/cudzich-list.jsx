import React, { useState, useEffect, useContext } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlobalStateContext } from '../context/GlobalState';
import { getApiUrl } from '../config/api';
import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, ModalHeader, look } from '../components/AdminLook'; // wspólny wygląd panelu admina
import { KeyboardSafeScreen, KeyboardSafeOverlay } from "../components/KeyboardSafe"; // klawiatura nie zasłania pól tekstowych
const CudzichList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const { user } = useContext(GlobalStateContext);
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filters
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedType, setSelectedType] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedSize, setSelectedSize] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [transactions, searchQuery, selectedType, selectedProduct, selectedSize]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch transactions
      const transactionsResponse = await tokenService.authenticatedFetch(
        getApiUrl('/cudzich/transactions')
      );
      const transactionsData = await transactionsResponse.json();
      
      // Fetch balance
      const balanceResponse = await tokenService.authenticatedFetch(
        getApiUrl('/cudzich/balance')
      );
      const balanceData = await balanceResponse.json();
      
      setTransactions(Array.isArray(transactionsData) ? transactionsData : []);
      setBalance(balanceData.balance || 0);
    } catch (error) {
      console.error('Error loading data:', error);
      appAlert('Błąd', 'Nie udało się pobrać danych');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const applyFilters = () => {
    let filtered = [...transactions];

    // Type filter
    if (selectedType !== 'all') {
      filtered = filtered.filter(t => t.type === selectedType);
    }

    // Product filter
    if (selectedProduct.trim()) {
      filtered = filtered.filter(t => 
        t.productName?.toLowerCase().includes(selectedProduct.toLowerCase())
      );
    }

    // Size filter
    if (selectedSize.trim()) {
      filtered = filtered.filter(t => 
        t.size?.toLowerCase().includes(selectedSize.toLowerCase())
      );
    }

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.productName?.toLowerCase().includes(query) ||
        t.size?.toLowerCase().includes(query) ||
        t.type?.toLowerCase().includes(query) ||
        t.note?.toLowerCase().includes(query)
      );
    }

    setFilteredTransactions(filtered);
  };

  const resetFilters = () => {
    setSelectedType('all');
    setSelectedProduct('');
    setSelectedSize('');
    setSearchQuery('');
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

  const getTypeLabel = (type) => {
    const labels = {
      'odbior': 'Odbiór',
      'zwrot': 'Zwrot',
      'wplata': 'Wpłata',
      'wyplata': 'Wypłata'
    };
    return labels[type] || type;
  };

  const getTypeColor = (type) => {
    const colors = {
      'odbior': '#22C55E',
      'zwrot': '#EF4444',
      'wplata': '#3B82F6',
      'wyplata': '#F59E0B'
    };
    return colors[type] || '#64748B';
  };

  const getTypeIcon = (type) => {
    const icons = {
      'odbior': 'arrow-down-circle',
      'zwrot': 'arrow-up-circle',
      'wplata': 'wallet',
      'wyplata': 'cash'
    };
    return icons[type] || 'swap-horizontal';
  };

  const renderTransactionCard = (transaction) => {
    const typeColor = getTypeColor(transaction.type);
    
    return (
      <View key={transaction._id} style={[styles.card, { borderLeftColor: typeColor }]}>
        <View style={styles.cardHeader}>
          <View style={styles.typeSection}>
            <View style={[styles.typeIcon, { backgroundColor: `${typeColor}26` }]}>
              <Ionicons name={getTypeIcon(transaction.type)} size={20} color={typeColor} />
            </View>
            <View style={[styles.typeBadge, { backgroundColor: `${typeColor}26`, borderColor: `${typeColor}80` }]}>
              <Text style={[styles.typeText, { color: typeColor }]}>
                {getTypeLabel(transaction.type)}
              </Text>
            </View>
          </View>
          <Text style={styles.dateText}>{formatDate(transaction.date)}</Text>
        </View>

        <View style={styles.cardBody}>
          {transaction.productName && (
            <View style={styles.infoRow}>
              <Ionicons name="pricetag-outline" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Produkt:</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {transaction.productName}
              </Text>
            </View>
          )}

          {transaction.size && (
            <View style={styles.infoRow}>
              <Ionicons name="resize-outline" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Rozmiar:</Text>
              <Text style={styles.infoValue}>{transaction.size}</Text>
            </View>
          )}

          {transaction.amount && (
            <View style={styles.infoRow}>
              <Ionicons name="cash-outline" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Kwota:</Text>
              <Text style={[styles.infoValue, styles.amountValue]}>
                {transaction.amount} {transaction.currency || 'PLN'}
              </Text>
            </View>
          )}

          {transaction.note && (
            <View style={styles.infoRow}>
              <Ionicons name="document-text-outline" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Notatka:</Text>
              <Text style={styles.infoValue} numberOfLines={2}>
                {transaction.note}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0d6efd" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Klawiatura nie zasłania pola: ekran kurczy się nad klawiaturą i przewija do klikniętego pola */}
      <KeyboardSafeScreen>
        <Stack.Screen options={{ headerShown: false }} />
        {/* Nagłówek podstrony */}
        <PageHeader
          title="Cudzich"
          icon="people-outline"
          onBack={() => router.back()}
        />

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <View style={styles.balanceIcon}>
              <Ionicons name="wallet-outline" size={24} color="#10B981" />
            </View>
            <Text style={styles.balanceLabel}>Saldo aktualnie</Text>
          </View>
          <Text style={styles.balanceAmount}>{balance.toFixed(2)} PLN</Text>
        </View>

        {/* Search and Filter Bar */}
        <View style={styles.topBar}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
            <TextInput
              style={styles.searchInput}
              placeholder="Szukaj transakcji..."
              placeholderTextColor={tc('muted', "#64748B")}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={tc('muted', "#64748B")} />
              </TouchableOpacity>
            )}
          </View>
        
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setFilterModalVisible(true)}
          >
            <Ionicons 
              name={
                selectedType !== 'all' || selectedProduct || selectedSize
                  ? 'funnel'
                  : 'funnel-outline'
              } 
              size={20} 
              color={
                selectedType !== 'all' || selectedProduct || selectedSize
                  ? '#0D6EFD'
                  : tc('text', '#fff')
              } 
            />
          </TouchableOpacity>
        </View>

        <View style={styles.statsBar}>
          <Text style={styles.statsText}>
            Znaleziono: {filteredTransactions.length} z {transactions.length}
          </Text>
        </View>

        <ScrollView alwaysBounceVertical
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          style={styles.scrollView}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {filteredTransactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="swap-horizontal-outline" size={64} color={tc('muted', "#64748B")} />
              <Text style={styles.emptyStateText}>
                {transactions.length === 0 ? 'Brak transakcji do wyświetlenia' : 'Brak transakcji pasujących do filtrów'}
              </Text>
            </View>
          ) : (
            filteredTransactions.map(renderTransactionCard)
          )}
        </ScrollView>
      </KeyboardSafeScreen>

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        {/* Klawiatura nie zasłania pól: tło okienka kurczy się nad klawiaturą */}
        <KeyboardSafeOverlay>
          <View style={look.modalOverlay}>
            <View style={look.modalContent}>
              <ModalHeader icon="funnel-outline" title="Filtry" />

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                {/* Type Filter */}
                <View style={styles.filterGroup}>
                  <Text style={look.formLabel}>Typ transakcji:</Text>
                  <View style={styles.filterOptions}>
                    {[
                      { value: 'all', label: 'Wszystkie' },
                      { value: 'odbior', label: 'Odbiór' },
                      { value: 'zwrot', label: 'Zwrot' },
                      { value: 'wplata', label: 'Wpłata' },
                      { value: 'wyplata', label: 'Wypłata' }
                    ].map(option => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.filterOption,
                          selectedType === option.value && styles.filterOptionActive
                        ]}
                        onPress={() => setSelectedType(option.value)}
                      >
                        <Text
                          style={[
                            styles.filterOptionText,
                            selectedType === option.value && styles.filterOptionTextActive
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Product Filter */}
                <View style={styles.filterGroup}>
                  <Text style={look.formLabel}>Produkt:</Text>
                  <TextInput
                    style={look.formInput}
                    value={selectedProduct}
                    onChangeText={setSelectedProduct}
                    placeholder="Wpisz nazwę produktu..."
                    placeholderTextColor={tc('muted', "#64748B")}
                  />
                </View>

                {/* Size Filter */}
                <View style={styles.filterGroup}>
                  <Text style={look.formLabel}>Rozmiar:</Text>
                  <TextInput
                    style={look.formInput}
                    value={selectedSize}
                    onChangeText={setSelectedSize}
                    placeholder="Wpisz rozmiar..."
                    autoCapitalize="characters" // rozmiar wielkimi literami
                    placeholderTextColor={tc('muted', "#64748B")}
                  />
                </View>
              </ScrollView>

              <View style={look.buttonRow}>
                <TouchableOpacity
                  style={look.neutralButton}
                  onPress={() => {
                    resetFilters();
                    setFilterModalVisible(false);
                  }}
                >
                  <Text style={look.neutralButtonText}>Resetuj</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={look.primaryButton}
                  onPress={() => setFilterModalVisible(false)}
                >
                  <Text style={look.buttonText}>Zastosuj</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardSafeOverlay>
      </Modal>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc('bg', '#000000'),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('bg', '#000000'),
  },
  backButton: {
    marginLeft: 8,
  },
  balanceCard: {
    backgroundColor: tc('surface', '#161622'),
    marginHorizontal: 20,
    marginVertical: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  balanceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#10B98126',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  balanceLabel: {
    fontSize: 16,
    color: tc('muted', '#94A3B8'),
    fontWeight: '600',
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#10B981',
    textAlign: 'center',
  },
  topBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#1E293B'),
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: tc('text', '#fff'),
    fontSize: 15,
    paddingVertical: 12,
  },
  filterButton: {
    backgroundColor: tc('surface', '#161622'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsBar: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#1E293B'),
  },
  statsText: {
    fontSize: 12,
    color: tc('muted', '#94A3B8'),
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    color: tc('muted', '#64748B'),
    marginTop: 16,
  },
  card: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    borderLeftWidth: 4,
    borderLeftColor: tc('border', '#1E293B'),
  },
  cardHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#1E293B'),
  },
  typeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 12,
    color: tc('muted', '#64748B'),
  },
  cardBody: {
    padding: 12,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
  },
  infoValue: {
    fontSize: 14,
    color: tc('text', '#fff'),
    flex: 1,
  },
  amountValue: {
    fontWeight: 'bold',
    color: '#22C55E',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: tc('surface', '#1E293B'),
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#1E293B'),
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
  },
  modalBody: {
    marginBottom: 16,
  },
  filterGroup: {
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tc('text', '#fff'),
    marginBottom: 8,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterOption: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
  },
  filterOptionActive: {
    backgroundColor: '#0D6EFD',
    borderColor: '#0D6EFD',
  },
  filterOptionText: {
    fontSize: 13,
    color: tc('text', '#fff'),
  },
  filterOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  filterInput: {
    backgroundColor: tc('surface2', '#334155'),
    borderRadius: 8,
    padding: 12,
    color: tc('text', '#fff'),
    fontSize: 14,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#334155'),
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: '#64748B',
  },
  applyButton: {
    backgroundColor: '#3B82F6',
  },
  modalButtonText: {
    color: tc('text', '#fff'),
    fontSize: 14,
    fontWeight: '600',
  },
}));

export default CudzichList;
