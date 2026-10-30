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
import { CudzichBalanceCard, CudzichTransactionCard, cudzichType } from '../components/CudzichLook'; // karty jak w zakładce Cudzich
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
        (t.notes || t.note)?.toLowerCase().includes(query) ||
        cudzichType(t.type).label.toLowerCase().includes(query)
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

        {/* Karta salda - ta sama co w zakładce Cudzich punktu P */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <CudzichBalanceCard balance={balance} />
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
            filteredTransactions.map((transaction) => <CudzichTransactionCard key={transaction._id} transaction={transaction} />)
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
  modalBody: {
    marginBottom: 16,
  },
  filterGroup: {
    marginBottom: 20,
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
}));

export default CudzichList;
