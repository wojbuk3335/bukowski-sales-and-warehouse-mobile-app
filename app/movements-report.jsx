import React, { useState, useEffect } from 'react';
import { REMAINING_CATEGORY_LABELS } from "../config/remainingProductTypes";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import tokenService from '../services/tokenService';
import { getApiUrl } from '../config/api';

const MovementsReport = () => {
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  
  // Filters
  const [selectedSellingPoint, setSelectedSellingPoint] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedManufacturer, setSelectedManufacturer] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // Filter dropdown state
  const [activeFilter, setActiveFilter] = useState(null);
  const [filterSearch, setFilterSearch] = useState('');
  
  // Filter options
  const [sellingPoints, setSellingPoints] = useState([]);
  const [products, setProducts] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  
  const categories = [
    'Kurtki kożuchy futra',
    'Torebki',
    'Portfele',
    'Pozostały asortyment',
    ...REMAINING_CATEGORY_LABELS,
  ];

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (reportData && reportData.movements) {
      applyFilters();
    }
  }, [reportData, searchQuery]);
  
  // Przeładuj dane z backendu gdy zmienią się filtry które backend obsługuje
  useEffect(() => {
    if (reportData) {
      // Jeśli była wybrana kategoria inna niż kurtki, wyczyść rozmiar
      if (selectedCategory && selectedCategory !== 'Kurtki kożuchy futra' && selectedSize) {
        setSelectedSize(null);
      }
      // Jeśli były już załadowane dane, przeładuj je z nowymi filtrami
      loadMovementsData();
    }
  }, [selectedCategory, selectedSize, selectedManufacturer, selectedProduct, selectedSellingPoint]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [usersRes, goodsRes, sizesRes, manufacturersRes] = await Promise.all([
        tokenService.authenticatedFetch(getApiUrl('/user')),
        tokenService.authenticatedFetch(getApiUrl('/excel/goods/get-all-goods')),
        tokenService.authenticatedFetch(getApiUrl('/excel/size/get-all-sizes')),
        tokenService.authenticatedFetch(getApiUrl('/manufacturers')),
      ]);

      const usersData = await usersRes.json();
      const goodsData = await goodsRes.json();
      const sizesData = await sizesRes.json();
      const manufacturersData = await manufacturersRes.json();

      const usersArray = usersData?.users || [];
      if (Array.isArray(usersArray) && usersArray.length > 0) {
        const points = usersArray
          .filter((u) => 
            u.role === 'user' && 
            u.sellingPoint && 
            u.sellingPoint.trim() !== '' &&
            u.sellingPoint !== 'Cudzich'
          )
          .map((u) => ({
            value: u._id,
            label: u.sellingPoint,
            symbol: u.symbol,
          }));
        
        const uniquePoints = Array.from(
          new Map(points.map((p) => [p.label, p])).values()
        );
        
        setSellingPoints([
          { value: 'all', label: 'Wszystkie punkty' },
          ...uniquePoints
        ]);
      }

      if (goodsData && goodsData.goods && Array.isArray(goodsData.goods)) {
        const productsData = goodsData.goods.map(g => ({
          value: g._id,
          label: g.fullName,
          category: g.category,
          barcode: g.barcode,
          manufacturerId: g.manufacturerId
        }));
        setProducts(productsData);
      }

      if (sizesData && sizesData.sizes && Array.isArray(sizesData.sizes)) {
        setSizes(sizesData.sizes.map(s => ({
          value: s._id,
          label: s.Roz_Opis
        })));
      }

      if (manufacturersData && manufacturersData.manufacturers && Array.isArray(manufacturersData.manufacturers)) {
        setManufacturers(manufacturersData.manufacturers.map(m => ({
          value: m._id,
          label: m.Prod_Opis || m.name
        })));
      }
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się pobrać danych');
    } finally {
      setLoading(false);
    }
  };

  const loadMovementsData = async () => {
    if (!reportData && filteredData.length === 0) {
      // Pierwsze ładowanie - pokaż loader
      setLoading(true);
    }
    
    try {
      const startDateString = startDate.toISOString().split('T')[0];
      const endDateString = endDate.toISOString().split('T')[0];
      
      let endpoint;
      if (!selectedSellingPoint || selectedSellingPoint === 'all') {
        endpoint = `/state/all/report?startDate=${startDateString}&endDate=${endDateString}`;
      } else {
        endpoint = `/state/${selectedSellingPoint}/report?startDate=${startDateString}&endDate=${endDateString}`;
      }
      
      // Dodaj parametry filtrów do URL
      if (selectedProduct) {
        endpoint += `&productFilter=specific&productId=${selectedProduct}`;
      } else if (selectedCategory) {
        endpoint += `&productFilter=category&category=${encodeURIComponent(selectedCategory)}`;
      } else {
        endpoint += `&productFilter=all`;
      }
      
      if (selectedManufacturer) {
        endpoint += `&manufacturerId=${selectedManufacturer}`;
      }
      
      // Rozmiar tylko dla kategorii "Kurtki kożuchy futra"
      if (selectedSize && (!selectedCategory || selectedCategory === 'Kurtki kożuchy futra')) {
        endpoint += `&sizeId=${selectedSize}`;
      }
      
      const response = await tokenService.authenticatedFetch(getApiUrl(endpoint));
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();

      setReportData(data);
      
      // Natychmiast zastosuj filtry po otrzymaniu danych
      if (data && data.movements) {
        setFilteredData(data.movements);
      } else {
        setFilteredData([]);
        Alert.alert('Info', 'Brak danych dla wybranego okresu');
      }
    } catch (error) {
      Alert.alert('Błąd', `Nie udało się pobrać przepływów: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMovementsData();
    setRefreshing(false);
  };

  const applyFilters = () => {
    if (!reportData || !reportData.movements) {
      return;
    }
    
    let filtered = [...reportData.movements];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          (item.product && item.product.toLowerCase().includes(query)) ||
          (item.size && item.size.toLowerCase().includes(query)) ||
          (item.operation && item.operation.toLowerCase().includes(query)) ||
          (item.type && item.type.toLowerCase().includes(query)) ||
          (item.source && item.source.toLowerCase().includes(query)) ||
          (item.from && item.from.toLowerCase().includes(query)) ||
          (item.destination && item.destination.toLowerCase().includes(query)) ||
          (item.to && item.to.toLowerCase().includes(query))
      );
    }

    if (selectedCategory) {
      filtered = filtered.filter((item) => {
        const product = products.find(
          p => p.label === item.product
        );
        return product && product.category === selectedCategory;
      });
    }

    if (selectedSize) {
      const selectedSizeLabel = sizes.find(s => s.value === selectedSize)?.label;
      filtered = filtered.filter(
        (item) => item.size === selectedSizeLabel
      );
    }

    if (selectedManufacturer) {
      filtered = filtered.filter((item) => {
        const product = products.find(
          p => p.label === item.product
        );
        return product && product.manufacturerId === selectedManufacturer;
      });
    }

    if (selectedProduct) {
      const selectedProductLabel = products.find(p => p.value === selectedProduct)?.label;
      filtered = filtered.filter(
        (item) => item.product === selectedProductLabel
      );
    }

    setFilteredData(filtered);
  };

  const clearFilters = () => {
    setSelectedSellingPoint('all');
    setSelectedCategory(null);
    setSelectedManufacturer(null);
    setSelectedSize(null);
    setSelectedProduct(null);
    setSearchQuery('');
  };

  const toggleFilter = (filterName) => {
    if (activeFilter === filterName) {
      setActiveFilter(null);
    } else {
      setActiveFilter(filterName);
      setFilterSearch('');
    }
  };

  const getFilteredOptions = (options, searchTerm) => {
    if (!searchTerm.trim()) return options;
    const query = searchTerm.toLowerCase();
    return options.filter(opt => 
      opt.label.toLowerCase().includes(query)
    );
  };

  const renderFilterDropdown = (filterName, options, selectedValue, onSelect, placeholder) => {
    const isActive = activeFilter === filterName;
    
    // Check if options are strings or objects
    const isStringArray = typeof options[0] === 'string';
    
    const selectedLabel = isStringArray 
      ? selectedValue 
      : options.find(opt => opt.value === selectedValue)?.label;
    
    const filteredOptions = isStringArray
      ? options.filter(opt => 
          filterSearch === '' || 
          opt.toLowerCase().includes(filterSearch.toLowerCase())
        )
      : getFilteredOptions(options, filterSearch);

    return (
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            selectedValue && styles.filterButtonActive,
            isActive && styles.filterButtonOpen
          ]}
          onPress={() => toggleFilter(filterName)}
        >
          <Text style={[
            styles.filterButtonText,
            selectedValue && styles.filterButtonTextActive
          ]}>
            {selectedLabel || placeholder}
          </Text>
          <Ionicons
            name={isActive ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={selectedValue ? '#fff' : '#64748B'}
          />
        </TouchableOpacity>

        {isActive && (
          <View style={styles.dropdownContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={20} color="#64748B" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Szukaj..."
                placeholderTextColor="#64748B"
                value={filterSearch}
                onChangeText={setFilterSearch}
              />
              {filterSearch.length > 0 && (
                <TouchableOpacity onPress={() => setFilterSearch('')}>
                  <Ionicons name="close-circle" size={20} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
              {filterName !== 'sellingPoint' && (
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    onSelect(null);
                    setActiveFilter(null);
                  }}
                >
                  <Text style={styles.dropdownItemText}>Wszystkie</Text>
                </TouchableOpacity>
              )}

              {isStringArray ? (
                // Render string options (for categories)
                filteredOptions.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.dropdownItem,
                      selectedValue === option && styles.dropdownItemSelected
                    ]}
                    onPress={() => {
                      onSelect(option);
                      setActiveFilter(null);
                      setFilterSearch('');
                    }}
                  >
                    <Text style={[
                      styles.dropdownItemText,
                      selectedValue === option && styles.dropdownItemTextSelected
                    ]}>
                      {option}
                    </Text>
                    {selectedValue === option && (
                      <Ionicons name="checkmark" size={20} color="#0d6efd" />
                    )}
                  </TouchableOpacity>
                ))
              ) : (
                // Render object options
                filteredOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.dropdownItem,
                      selectedValue === option.value && styles.dropdownItemSelected
                    ]}
                    onPress={() => {
                      onSelect(option.value);
                      setActiveFilter(null);
                      setFilterSearch('');
                    }}
                  >
                    <Text style={[
                      styles.dropdownItemText,
                      selectedValue === option.value && styles.dropdownItemTextSelected
                    ]}>
                      {option.label}
                    </Text>
                    {selectedValue === option.value && (
                      <Ionicons name="checkmark" size={20} color="#0d6efd" />
                    )}
                  </TouchableOpacity>
                ))
              )}

              {filteredOptions.length === 0 && (
                <View style={styles.dropdownItem}>
                  <Text style={styles.dropdownItemText}>Brak wyników</Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const calculateStatistics = () => {
    if (!filteredData || filteredData.length === 0) {
      return { 
        totalIn: 0, 
        totalOut: 0, 
        netChange: 0,
        initialState: reportData?.initialState?.quantity || 0,
        finalState: reportData?.initialState?.quantity || 0
      };
    }

    let totalIn = 0;
    let totalOut = 0;

    filteredData.forEach(item => {
      totalIn += item.add || 0;
      totalOut += item.subtract || 0;
    });

    const initialState = reportData?.initialState?.quantity || 0;
    const netChange = totalIn - totalOut;
    const finalState = initialState + netChange;

    return {
      totalIn,
      totalOut,
      netChange,
      initialState,
      finalState
    };
  };

  const stats = calculateStatistics();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Raport Przepływów',
          headerStyle: { backgroundColor: '#000000' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginLeft: 10 }}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Date Selection */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Zakres dat</Text>
          
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowStartPicker(true)}
          >
            <Ionicons name="calendar" size={20} color="#0d6efd" />
            <Text style={styles.dateButtonText}>
              Data początkowa: {startDate.toLocaleDateString('pl-PL')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowEndPicker(true)}
          >
            <Ionicons name="calendar" size={20} color="#0d6efd" />
            <Text style={styles.dateButtonText}>
              Data końcowa: {endDate.toLocaleDateString('pl-PL')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.generateButton}
            onPress={loadMovementsData}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="bar-chart-outline" size={20} color="#fff" />
                <Text style={styles.generateButtonText}>Generuj raport</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {showStartPicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowStartPicker(false);
              if (selectedDate) {
                setStartDate(selectedDate);
              }
            }}
          />
        )}

        {showEndPicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowEndPicker(false);
              if (selectedDate) {
                setEndDate(selectedDate);
              }
            }}
          />
        )}

        {reportData && (
          <>
            {/* Statistics */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Podsumowanie</Text>
              
              {/* Stan początkowy */}
              <View style={styles.initialStateRow}>
                <Text style={styles.initialStateLabel}>Stan początkowy:</Text>
                <Text style={styles.initialStateValue}>
                  {stats.initialState}
                </Text>
              </View>
              
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, styles.statIn]}>+{stats.totalIn}</Text>
                  <Text style={styles.statLabel}>Przyjęcia</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, styles.statOut]}>-{stats.totalOut}</Text>
                  <Text style={styles.statLabel}>Wydania</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, stats.netChange >= 0 ? styles.statIn : styles.statOut]}>
                    {stats.netChange >= 0 ? '+' : ''}{stats.netChange}
                  </Text>
                  <Text style={styles.statLabel}>Bilans</Text>
                </View>
              </View>
              
              {/* Stan końcowy */}
              <View style={styles.finalStateRow}>
                <Text style={styles.finalStateLabel}>Stan końcowy:</Text>
                <Text style={styles.finalStateValue}>
                  {stats.finalState}
                </Text>
              </View>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#64748B" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Szukaj..."
                placeholderTextColor="#64748B"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery !== '' && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            {/* Filters */}
            <View style={styles.card}>
              <View style={styles.filterHeader}>
                <Text style={styles.cardTitle}>Filtry</Text>
                {(selectedCategory || selectedManufacturer || selectedSize || selectedProduct) && (
                  <TouchableOpacity onPress={clearFilters}>
                    <Text style={styles.clearFiltersText}>Wyczyść</Text>
                  </TouchableOpacity>
                )}
              </View>

              {renderFilterDropdown(
                'sellingPoint',
                sellingPoints,
                selectedSellingPoint,
                setSelectedSellingPoint,
                'Wybierz punkt sprzedaży'
              )}

              {renderFilterDropdown(
                'category',
                categories,
                selectedCategory,
                setSelectedCategory,
                'Wybierz kategorię'
              )}

              {renderFilterDropdown(
                'manufacturer',
                manufacturers,
                selectedManufacturer,
                setSelectedManufacturer,
                'Wybierz producenta'
              )}

              {(!selectedCategory || selectedCategory === 'Kurtki kożuchy futra') &&
                renderFilterDropdown(
                  'size',
                  sizes,
                  selectedSize,
                  setSelectedSize,
                  'Wybierz rozmiar'
                )}

              {renderFilterDropdown(
                'product',
                products,
                selectedProduct,
                setSelectedProduct,
                'Wybierz produkt'
              )}
            </View>

            {/* Movements List */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Przepływy ({filteredData.length})
              </Text>
              
              {filteredData.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="document-outline" size={48} color="#64748B" />
                  <Text style={styles.emptyText}>Brak przepływów</Text>
                </View>
              ) : (
                filteredData.map((item, index) => (
                  <View key={index} style={styles.movementCard}>
                    <View style={styles.movementRow}>
                      <Text style={styles.movementLabel}>Data:</Text>
                      <Text style={styles.movementValue}>
                        {item.date ? new Date(item.date).toLocaleDateString('pl-PL') : '-'}
                      </Text>
                    </View>
                    <View style={styles.movementRow}>
                      <Text style={styles.movementLabel}>Nazwa produktu:</Text>
                      <Text style={[styles.movementValue, styles.productName]}>{item.product || '-'}</Text>
                    </View>
                    <View style={styles.movementRow}>
                      <Text style={styles.movementLabel}>Rozmiar:</Text>
                      <Text style={styles.movementValue}>{item.size || '-'}</Text>
                    </View>
                    <View style={styles.movementRow}>
                      <Text style={styles.movementLabel}>Rodzaj:</Text>
                      <Text style={[styles.movementValue, styles.typeText]}>{item.operation || item.type || '-'}</Text>
                    </View>
                    <View style={styles.movementRow}>
                      <Text style={styles.movementLabel}>Skąd:</Text>
                      <Text style={styles.movementValue}>{item.source || item.from || '-'}</Text>
                    </View>
                    <View style={styles.movementRow}>
                      <Text style={styles.movementLabel}>Dokąd:</Text>
                      <Text style={styles.movementValue}>{item.destination || item.to || '-'}</Text>
                    </View>
                    <View style={styles.movementFooter}>
                      <View style={styles.quantityBadge}>
                        <Text style={styles.quantityLabel}>Odj.:</Text>
                        <Text style={[styles.quantityValue, styles.subtractValue]}>
                          {item.subtract || 0}
                        </Text>
                      </View>
                      <View style={styles.quantityBadge}>
                        <Text style={styles.quantityLabel}>Dod.:</Text>
                        <Text style={[styles.quantityValue, styles.addValue]}>
                          {item.add || 0}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d6efd20',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0d6efd',
    marginBottom: 12,
  },
  dateButtonText: {
    color: '#0d6efd',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d6efd',
    padding: 14,
    borderRadius: 8,
    gap: 8,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  initialStateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginBottom: 16,
  },
  initialStateLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
  },
  initialStateValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0d6efd',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  statIn: {
    color: '#22C55E',
  },
  statOut: {
    color: '#EF4444',
  },
  finalStateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#0d6efd',
  },
  finalStateLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
  },
  finalStateValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0d6efd',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 12,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearFiltersText: {
    color: '#0d6efd',
    fontSize: 14,
    fontWeight: '600',
  },
  filterContainer: {
    marginBottom: 12,
    zIndex: 1,
  },
  filterButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  filterButtonActive: {
    backgroundColor: '#0d6efd20',
    borderColor: '#0d6efd',
  },
  filterButtonOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  filterButtonText: {
    color: '#64748B',
    fontSize: 16,
  },
  filterButtonTextActive: {
    color: '#0d6efd',
    fontWeight: '600',
  },
  dropdownContainer: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#0d6efd',
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    maxHeight: 250,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  dropdownItemSelected: {
    backgroundColor: '#0d6efd10',
  },
  dropdownItemText: {
    color: '#fff',
    fontSize: 16,
  },
  dropdownItemTextSelected: {
    color: '#0d6efd',
    fontWeight: '600',
  },
  movementCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  movementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  movementLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    flex: 0.4,
  },
  movementValue: {
    fontSize: 14,
    color: '#fff',
    flex: 0.6,
    textAlign: 'right',
  },
  productName: {
    fontWeight: '600',
  },
  typeText: {
    color: '#0d6efd',
    fontWeight: '600',
  },
  movementFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  quantityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quantityLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  addValue: {
    color: '#22C55E',
  },
  subtractValue: {
    color: '#EF4444',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 12,
  },
});

export default MovementsReport;
