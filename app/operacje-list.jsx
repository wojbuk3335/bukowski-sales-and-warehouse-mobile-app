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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GlobalStateContext } from '../context/GlobalState';
import { getApiUrl } from '../config/api';
import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, ModalHeader, look } from '../components/AdminLook'; // wspólny wygląd panelu admina
const OperacjeList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const { user } = useContext(GlobalStateContext);
  const [operations, setOperations] = useState([]);
  const [filteredOperations, setFilteredOperations] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filters
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedOperation, setSelectedOperation] = useState('all');
  const [selectedUser, setSelectedUser] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [operations, searchQuery, selectedDate, selectedOperation, selectedUser]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch users
      const usersResponse = await tokenService.authenticatedFetch(
        getApiUrl('/user')
      );
      const usersData = await usersResponse.json();
      
      // Filter out admin and dom users
      const usersArray = Array.isArray(usersData) ? usersData : [];
      const filteredUsers = usersArray.filter(u => 
        u.symbol !== 'admin' && 
        u.symbol !== 'dom' && 
        u.role !== 'superadmin' && 
        u.role !== 'admin' && 
        u.role !== 'admin2'
      );
      setUsers(filteredUsers);

      // Fetch operations
      await fetchOperations();
    } catch (error) {
      console.error('Error loading data:', error);
      appAlert('Błąd', 'Nie udało się pobrać danych');
    } finally {
      setLoading(false);
    }
  };

  const fetchOperations = async () => {
    try {
      const params = new URLSearchParams();
      
      if (selectedDate) {
        params.append('date', selectedDate.toISOString().split('T')[0]);
      }
      if (selectedOperation !== 'all') {
        params.append('operation', selectedOperation);
      }
      if (selectedUser) {
        params.append('user', selectedUser);
      }

      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/financial-operations?${params.toString()}`)
      );
      const data = await response.json();
      
      setOperations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching operations:', error);
      appAlert('Błąd', 'Nie udało się pobrać operacji');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOperations();
    setRefreshing(false);
  };

  const applyFilters = () => {
    let filtered = [...operations];

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(op => 
        op.userSymbol?.toLowerCase().includes(query) ||
        op.reason?.toLowerCase().includes(query) ||
        op.productName?.toLowerCase().includes(query) ||
        op.currency?.toLowerCase().includes(query) ||
        op.amount?.toString().includes(query)
      );
    }

    setFilteredOperations(filtered);
  };

  const resetFilters = () => {
    setSelectedDate(new Date());
    setSelectedOperation('all');
    setSelectedUser('');
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

  const formatCurrency = (amount, currency = 'PLN') => {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + ` ${currency}`;
  };

  const getOperationLabel = (type) => {
    return type === 'addition' ? 'Dopisz kwotę' : 'Odpisz kwotę';
  };

  const getOperationColor = (type) => {
    return type === 'addition' ? '#22C55E' : '#EF4444';
  };

  const getOperationIcon = (type) => {
    return type === 'addition' ? 'add-circle' : 'remove-circle';
  };

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setSelectedDate(selectedDate);
    }
  };

  const renderOperationCard = (operation) => {
    const typeColor = getOperationColor(operation.type);
    const amountColor = operation.amount >= 0 ? '#22C55E' : '#EF4444';
    const remainingColor = operation.remainingAmount > 0 ? '#EF4444' : '#22C55E';
    
    return (
      <View key={operation._id} style={[styles.card, { borderLeftColor: typeColor }]}>
        <View style={styles.cardHeader}>
          <View style={styles.typeSection}>
            <View style={[styles.typeIcon, { backgroundColor: `${typeColor}26` }]}>
              <Ionicons name={getOperationIcon(operation.type)} size={20} color={typeColor} />
            </View>
            <View style={[styles.typeBadge, { backgroundColor: `${typeColor}26`, borderColor: `${typeColor}80` }]}>
              <Text style={[styles.typeText, { color: typeColor }]}>
                {getOperationLabel(operation.type)}
              </Text>
            </View>
          </View>
          <Text style={styles.dateText}>{formatDate(operation.createdAt)}</Text>
        </View>

        <View style={styles.cardBody}>
          {/* User */}
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={16} color={tc('muted', "#94A3B8")} />
            <Text style={styles.infoLabel}>Użytkownik:</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {operation.userSymbol || '-'}
            </Text>
          </View>

          {/* Amount */}
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={16} color={tc('muted', "#94A3B8")} />
            <Text style={styles.infoLabel}>Kwota:</Text>
            <Text style={[styles.infoValue, styles.amountValue, { color: amountColor }]}>
              {formatCurrency(operation.amount, operation.currency)}
            </Text>
          </View>

          {/* Currency */}
          {operation.currency && (
            <View style={styles.infoRow}>
              <Ionicons name="logo-euro" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Waluta:</Text>
              <Text style={styles.infoValue}>{operation.currency}</Text>
            </View>
          )}

          {/* Reason */}
          {operation.reason && (
            <View style={styles.infoRow}>
              <Ionicons name="document-text-outline" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Powód:</Text>
              <Text style={styles.infoValue} numberOfLines={2}>
                {operation.reason}
              </Text>
            </View>
          )}

          {/* Product */}
          {operation.productName && (
            <View style={styles.infoRow}>
              <Ionicons name="pricetag-outline" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Produkt:</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoValue} numberOfLines={1}>
                  {operation.productName}
                </Text>
                {operation.productId && (
                  <Text style={styles.productIdText}>ID: {operation.productId}</Text>
                )}
              </View>
            </View>
          )}

          {/* Final Price */}
          {operation.finalPrice && (
            <View style={styles.infoRow}>
              <Ionicons name="wallet-outline" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Cena finalna:</Text>
              <Text style={styles.infoValue}>
                {formatCurrency(operation.finalPrice, operation.currency)}
              </Text>
            </View>
          )}

          {/* Remaining Amount */}
          {operation.remainingAmount !== undefined && (
            <View style={styles.infoRow}>
              <Ionicons name="warning-outline" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Do dopłaty:</Text>
              <Text style={[styles.infoValue, styles.amountValue, { color: remainingColor }]}>
                {formatCurrency(operation.remainingAmount, operation.currency)}
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

  const additionCount = filteredOperations.filter(op => op.type === 'addition').length;
  const deductionCount = filteredOperations.filter(op => op.type === 'deduction').length;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Nagłówek podstrony */}
      <PageHeader
        title="Operacje"
        icon="swap-vertical-outline"
        onBack={() => router.back()}
      />

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={[styles.summaryCard, { borderTopColor: '#22C55E' }]}>
          <View style={[styles.summaryIcon, { backgroundColor: '#22C55E26' }]}>
            <Ionicons name="add-circle-outline" size={22} color="#22C55E" />
          </View>
          <Text style={styles.summaryLabel}>Dodania</Text>
          <Text style={[styles.summaryValue, { color: '#22C55E' }]}>{additionCount}</Text>
        </View>
        <View style={[styles.summaryCard, { borderTopColor: '#EF4444' }]}>
          <View style={[styles.summaryIcon, { backgroundColor: '#EF444426' }]}>
            <Ionicons name="remove-circle-outline" size={22} color="#EF4444" />
          </View>
          <Text style={styles.summaryLabel}>Odpisania</Text>
          <Text style={[styles.summaryValue, { color: '#EF4444' }]}>{deductionCount}</Text>
        </View>
      </View>

      {/* Search and Filter Bar */}
      <View style={styles.topBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj operacji..."
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
              selectedOperation !== 'all' || selectedUser
                ? 'funnel'
                : 'funnel-outline'
            } 
            size={20} 
            color={
              selectedOperation !== 'all' || selectedUser
                ? '#0D6EFD'
                : tc('text', '#fff')
            } 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          Znaleziono: {filteredOperations.length} z {operations.length}
        </Text>
      </View>

      <ScrollView alwaysBounceVertical
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {filteredOperations.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cash-outline" size={64} color={tc('muted', "#64748B")} />
            <Text style={styles.emptyStateText}>
              {operations.length === 0 ? 'Brak operacji do wyświetlenia' : 'Brak operacji pasujących do filtrów'}
            </Text>
          </View>
        ) : (
          filteredOperations.map(renderOperationCard)
        )}
      </ScrollView>

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="funnel-outline" title="Filtry" />

            <ScrollView style={styles.modalBody}>
              {/* Date Filter */}
              <View style={styles.filterGroup}>
                <Text style={look.formLabel}>Data:</Text>
                <TouchableOpacity
                  style={look.selectField}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={look.selectFieldText}>
                    {selectedDate.toLocaleDateString('pl-PL')}
                  </Text>
                  <Ionicons name="calendar-outline" size={22} color={tc('muted', '#94A3B8')} />
                </TouchableOpacity>
              </View>

              {/* Operation Type Filter */}
              <View style={styles.filterGroup}>
                <Text style={look.formLabel}>Typ operacji:</Text>
                <View style={styles.filterOptions}>
                  {[
                    { value: 'all', label: 'Wszystkie' },
                    { value: 'addition', label: 'Dodanie' },
                    { value: 'deduction', label: 'Odpisanie' }
                  ].map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.filterOption,
                        selectedOperation === option.value && styles.filterOptionActive
                      ]}
                      onPress={() => setSelectedOperation(option.value)}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          selectedOperation === option.value && styles.filterOptionTextActive
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* User Filter */}
              <View style={styles.filterGroup}>
                <Text style={look.formLabel}>Użytkownik:</Text>
                <View style={styles.userPickerContainer}>
                  <TouchableOpacity
                    style={[
                      styles.filterOption,
                      !selectedUser && styles.filterOptionActive
                    ]}
                    onPress={() => setSelectedUser('')}
                  >
                    <Text
                      style={[
                        styles.filterOptionText,
                        !selectedUser && styles.filterOptionTextActive
                      ]}
                    >
                      Wszyscy
                    </Text>
                  </TouchableOpacity>
                  <ScrollView style={styles.usersList} contentContainerStyle={{ gap: 8 }}>
                    {users.map(u => (
                      <TouchableOpacity
                        key={u._id}
                        style={[
                          styles.filterOption,
                          selectedUser === u._id && styles.filterOptionActive
                        ]}
                        onPress={() => setSelectedUser(u._id)}
                      >
                        <Text
                          style={[
                            styles.filterOptionText,
                            selectedUser === u._id && styles.filterOptionTextActive
                          ]}
                        >
                          {u.symbol}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
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
                onPress={() => {
                  fetchOperations();
                  setFilterModalVisible(false);
                }}
              >
                <Text style={look.buttonText}>Zastosuj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}
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
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: tc('surface', '#161622'),
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    borderTopWidth: 3,
    alignItems: 'center',
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: tc('muted', '#94A3B8'),
    marginTop: 8,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
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
  },
  productIdText: {
    fontSize: 11,
    color: tc('muted', '#64748B'),
    marginTop: 2,
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
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tc('surface2', '#334155'),
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  dateButtonText: {
    fontSize: 14,
    color: tc('text', '#fff'),
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: tc('surface2', '#334155'),
    marginBottom: 8,
  },
  filterOptionActive: {
    backgroundColor: '#3B82F6',
  },
  filterOptionText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  filterOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  userPickerContainer: {
    maxHeight: 200,
  },
  usersList: {
    maxHeight: 160,
    marginTop: 8,
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

export default OperacjeList;
