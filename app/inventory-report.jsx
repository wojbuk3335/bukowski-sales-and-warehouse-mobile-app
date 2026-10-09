import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GlobalStateContext } from '../context/GlobalState';
import { getApiUrl } from '../config/api';
import tokenService from '../services/tokenService';

const InventoryReport = () => {
  const { user } = useContext(GlobalStateContext);

  // State management
  const [inventoryDate, setInventoryDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [inventoryData, setInventoryData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSellingPoint, setSelectedSellingPoint] = useState('all'); // Domyślnie "Wszystkie punkty"
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedManufacturer, setSelectedManufacturer] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sellingPoints, setSellingPoints] = useState([]);
  const [products, setProducts] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [colors, setColors] = useState([]);
  
  // Aktywny filtr (który dropdown jest otwarty)
  const [activeFilter, setActiveFilter] = useState(null);
  
  // Search states for dropdowns
  const [filterSearch, setFilterSearch] = useState('');
  
  const [statistics, setStatistics] = useState({
    totalItems: 0,
    uniqueProducts: 0,
  });
  

  const categories = [
    'Kurtki kożuchy futra',
    'Torebki',
    'Portfele',
    'Pozostały asortyment',
    'Paski',
    'Rękawiczki',
    'Czapki'
  ];

  useEffect(() => {
    loadInitialData();
  }, []);

  // Przeładuj dane gdy zmieni się wybrany punkt sprzedaży lub data
  useEffect(() => {
    if (sellingPoints.length > 0) {
      loadInventoryData();
    }
  }, [selectedSellingPoint, inventoryDate]);

  useEffect(() => {
    if (inventoryData.length > 0) {
      applyFilters();
    }
  }, [inventoryData, searchQuery, selectedSellingPoint, selectedCategory, selectedSize, selectedManufacturer, selectedProduct]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // Load data using authenticatedFetch
      const [usersRes, goodsRes, sizesRes, manufacturersRes, colorsRes] = await Promise.all([
        tokenService.authenticatedFetch(getApiUrl('/user')),
        tokenService.authenticatedFetch(getApiUrl('/excel/goods/get-all-goods')),
        tokenService.authenticatedFetch(getApiUrl('/excel/size/get-all-sizes')),
        tokenService.authenticatedFetch(getApiUrl('/manufacturers')),
        tokenService.authenticatedFetch(getApiUrl('/excel/color/get-all-colors')),
      ]);

      const usersData = await usersRes.json();
      const goodsData = await goodsRes.json();
      const sizesData = await sizesRes.json();
      const manufacturersData = await manufacturersRes.json();
      const colorsData = await colorsRes.json();

      // API zwraca {count, users} więc bierzemy users array
      const usersArray = usersData?.users || [];
      if (Array.isArray(usersArray) && usersArray.length > 0) {
        const points = usersArray
          .filter((u) => {
            // Magazyn zawsze dodajemy
            if (u.role === 'magazyn') {
              return true;
            }
            // Dla user sprawdzamy warunki
            return u.role === 'user' && 
              u.sellingPoint && 
              u.sellingPoint.trim() !== '' &&
              u.sellingPoint !== 'Cudzich';
          })
          .map((u) => ({
            value: u._id,
            label: u.role === 'magazyn' ? 'Magazyn' : u.sellingPoint,
            symbol: u.symbol, // Store symbol (P, T) for filtering
          }));
        
        const uniquePoints = Array.from(
          new Map(points.map((p) => [p.label, p])).values()
        );
        
        // Dodaj opcję "Wszystkie punkty"
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

      if (colorsData && colorsData.colors && Array.isArray(colorsData.colors)) {
        setColors(colorsData.colors);
      }

      // Load initial inventory data
      await loadInventoryData();
    } catch (error) {
      console.error('Error loading initial data:', error);
      Alert.alert('Błąd', 'Nie udało się pobrać danych');
    } finally {
      setLoading(false);
    }
  };

  const loadInventoryData = async () => {
    setLoading(true);
    try {
      const dateString = inventoryDate.toISOString().split('T')[0];
      
      // Użyj właściwego endpointu w zależności od wybranego punktu sprzedaży
      let endpoint;
      if (!selectedSellingPoint || selectedSellingPoint === 'all') {
        // Dla wszystkich punktów używamy endpointu agregującego
        endpoint = `/state/all/inventory?date=${dateString}`;
      } else {
        // Dla konkretnego punktu używamy endpointu dla użytkownika
        endpoint = `/state/${selectedSellingPoint}/inventory?date=${dateString}`;
      }
      
      const response = await tokenService.authenticatedFetch(getApiUrl(endpoint));
      const data = await response.json();

      if (data && data.inventory && Array.isArray(data.inventory)) {
        setInventoryData(data.inventory);
      } else {
        setInventoryData([]);
        Alert.alert('Info', 'Brak danych dla wybranej daty');
      }
    } catch (error) {
      console.error('Error loading inventory:', error);
      Alert.alert('Błąd', 'Nie udało się pobrać stanów magazynowych');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...inventoryData];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          (item.product && item.product.toLowerCase().includes(query)) ||
          (item.fullName && item.fullName.toLowerCase().includes(query)) ||
          (item.barcodes && item.barcodes.toLowerCase().includes(query)) ||
          (item.barcode && item.barcode.toLowerCase().includes(query)) ||
          (item.size && item.size.toLowerCase().includes(query))
      );
    }

    // Nie filtrujemy po punkcie sprzedaży tutaj, bo API już zwraca dane dla wybranego punktu

    // Apply category filter
    if (selectedCategory) {
      filtered = filtered.filter((item) => {
        const product = products.find(
          p => p.label === item.product || p.label === item.fullName || p.barcode === (item.barcodes || item.barcode)
        );
        return product && product.category === selectedCategory;
      });
    }

    // Apply size filter
    if (selectedSize) {
      const selectedSizeLabel = sizes.find(s => s.value === selectedSize)?.label;
      filtered = filtered.filter(
        (item) => item.size === selectedSizeLabel
      );
    }

    // Apply manufacturer filter
    if (selectedManufacturer) {
      filtered = filtered.filter((item) => {
        const product = products.find(
          p => p.label === item.product || p.label === item.fullName || p.barcode === (item.barcodes || item.barcode)
        );
        return product && product.manufacturerId === selectedManufacturer;
      });
    }

    // Apply product filter
    if (selectedProduct) {
      const selectedProductLabel = products.find(p => p.value === selectedProduct)?.label;
      filtered = filtered.filter(
        (item) => item.product === selectedProductLabel || item.fullName === selectedProductLabel
      );
    }

    setFilteredData(filtered);
    calculateStatistics(filtered);
  };

  const calculateStatistics = (data) => {
    const totalItems = data.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const uniqueProducts = new Set(data.map(item => item.barcodes || item.barcode || item.product)).size;

    setStatistics({
      totalItems,
      uniqueProducts,
    });
  };

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setInventoryDate(selectedDate);
      // Reload data after date change
      setTimeout(() => loadInventoryData(), 100);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInventoryData();
    setRefreshing(false);
  };

  const clearFilters = () => {
    setSelectedSellingPoint('all');
    setSelectedCategory(null);
    setSelectedSize(null);
    setSelectedManufacturer(null);
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


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Stany magazynowe',
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
        {/* Date Picker */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Data inwentarza</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar" size={20} color="#0d6efd" />
            <Text style={styles.dateButtonText}>
              {inventoryDate.toLocaleDateString('pl-PL')}
            </Text>
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={inventoryDate}
            mode="date"
            display="default"
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}

        {/* Statistics */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Podsumowanie</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statistics.totalItems}</Text>
              <Text style={styles.statLabel}>Suma sztuk</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statistics.uniqueProducts}</Text>
              <Text style={styles.statLabel}>Unikalnych produktów</Text>
            </View>
          </View>
        </View>

        {/* Search */}
        <View style={styles.card}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#64748B" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Szukaj produktu, kodu..."
              placeholderTextColor="#64748B"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filters Button */}
        <TouchableOpacity
          style={styles.filtersButton}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="options" size={20} color="#fff" />
          <Text style={styles.filtersButtonText}>Filtry</Text>
          <Ionicons
            name={showFilters ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>

        {/* Filters */}
        {showFilters && (
          <View style={styles.card}>
            <View style={styles.filterHeader}>
              <Text style={styles.cardTitle}>Filtry</Text>
              <TouchableOpacity onPress={clearFilters}>
                <Text style={styles.clearFiltersText}>Wyczyść</Text>
              </TouchableOpacity>
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
              'Kategoria'
            )}

            {renderFilterDropdown(
              'manufacturer',
              manufacturers,
              selectedManufacturer,
              setSelectedManufacturer,
              'Producent'
            )}

            {(!selectedCategory || selectedCategory === 'Kurtki kożuchy futra') && (
              renderFilterDropdown(
                'size',
                sizes,
                selectedSize,
                setSelectedSize,
                'Rozmiar'
              )
            )}

            {renderFilterDropdown(
              'product',
              products,
              selectedProduct,
              setSelectedProduct,
              'Konkretny produkt'
            )}
          </View>
        )}

        {/* Inventory List */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Stan magazynowy ({filteredData.length})
          </Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0d6efd" />
              <Text style={styles.loadingText}>Ładowanie danych...</Text>
            </View>
          ) : filteredData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={48} color="#64748B" />
              <Text style={styles.emptyText}>Brak danych dla wybranych filtrów</Text>
            </View>
          ) : (
            filteredData.map((item, index) => (
              <View key={index} style={styles.inventoryItem}>
                <View style={styles.inventoryItemHeader}>
                  <Text style={styles.productName}>{item.product || item.fullName || 'Nieznany produkt'}</Text>
                  <View style={styles.headerActions}>
                    <View style={styles.quantityBadge}>
                      <Text style={styles.quantityText}>{item.quantity} szt.</Text>
                    </View>
                  </View>
                </View>
                
                <View style={styles.inventoryItemDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="barcode-outline" size={16} color="#64748B" />
                    <Text style={styles.detailText}>{item.barcodes || item.barcode || '-'}</Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <Ionicons name="resize-outline" size={16} color="#64748B" />
                    <Text style={styles.detailText}>{item.size || '-'}</Text>
                  </View>
                  
                  {(item.sellingPoints || item.sellingPoint) && (
                    <View style={styles.detailRow}>
                      <Ionicons name="location-outline" size={16} color="#64748B" />
                      <Text style={styles.detailText}>{item.sellingPoints || item.sellingPoint}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
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
  },
  dateButtonText: {
    color: '#0d6efd',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
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
    color: '#0d6efd',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 12,
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
  filtersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d6efd',
    padding: 14,
    borderRadius: 8,
    marginBottom: 16,
  },
  filtersButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 8,
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
  inventoryItem: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  inventoryItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  productName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginRight: 8,
  },
  quantityBadge: {
    backgroundColor: '#198754',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  quantityText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inventoryItemDetails: {
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    color: '#64748B',
    fontSize: 14,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    color: '#64748B',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#64748B',
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
  },
});

export default InventoryReport;
