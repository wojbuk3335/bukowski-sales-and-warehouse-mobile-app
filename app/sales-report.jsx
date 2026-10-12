import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
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
import { appAlert } from '../services/appAlert';

const SalesReport = () => {
  const { user } = useContext(GlobalStateContext);

  // State management
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [salesData, setSalesData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSellingPoint, setSelectedSellingPoint] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sellingPoints, setSellingPoints] = useState([]);
  const [products, setProducts] = useState([]);
  const [sizes, setSizes] = useState([]);
  
  // Aktywny filtr (który dropdown jest otwarty)
  const [activeFilter, setActiveFilter] = useState(null); // null, 'sellingPoint', 'category', 'size', 'product'
  
  // Search states for dropdowns
  const [filterSearch, setFilterSearch] = useState('');
  
  const [statistics, setStatistics] = useState({
    totalSales: 0,
    totalRevenue: 0,
    cashRevenue: 0,
    cardRevenue: 0,
    topProducts: [],
  });

  // Quick date filters
  const quickFilters = [
    { label: 'Dzisiaj', days: 0 },
    { label: 'Wczoraj', days: 1 },
    { label: 'Ostatnie 7 dni', days: 7 },
    { label: 'Ostatnie 30 dni', days: 30 },
    { label: 'Ten miesiąc', type: 'month' },
  ];

  // Load sales data
  const loadSalesData = async () => {
    setLoading(true);
    try {
      const [salesRes, usersRes, goodsRes, sizesRes] = await Promise.all([
        tokenService.authenticatedFetch(getApiUrl('/sales')),
        tokenService.authenticatedFetch(getApiUrl('/user')),
        tokenService.authenticatedFetch(getApiUrl('/excel/goods/get-all-goods')),
        tokenService.authenticatedFetch(getApiUrl('/excel/size/get-all-sizes')),
      ]);

      // Parse JSON responses
      const salesResponse = await salesRes.json();
      const usersResponse = await usersRes.json();
      const goodsResponse = await goodsRes.json();
      const sizesResponse = await sizesRes.json();

      if (salesResponse && Array.isArray(salesResponse)) {
        setSalesData(salesResponse);
        filterDataByDateRange(salesResponse, startDate, endDate);
      }

      // API zwraca {count, users} więc bierzemy users array
      const usersArray = usersResponse?.users || [];
      if (Array.isArray(usersArray) && usersArray.length > 0) {
        const points = usersArray
          .filter((u) => 
            u.role === 'user' && 
            u.sellingPoint && 
            u.sellingPoint.trim() !== '' &&
            u.sellingPoint !== 'Cudzich' // Wykluczamy Cudzich
          )
          .map((u) => ({
            value: u.sellingPoint,
            label: u.sellingPoint, // Użyj nazwy punktu sprzedaży (np. "Parzygnat", "Tata")
          }));
        
        // Remove duplicates based on sellingPoint
        const uniquePoints = Array.from(
          new Map(points.map((p) => [p.value, p])).values()
        );
        
        setSellingPoints(uniquePoints);
      }

      if (goodsResponse && goodsResponse.goods && Array.isArray(goodsResponse.goods)) {
        // Przechowuj pełne dane produktów do filtrowania
        const productsData = goodsResponse.goods.map(g => ({
          value: g._id,
          label: g.fullName,
          category: g.category,
          barcode: g.barcode
        }));
        setProducts(productsData);
      }

      if (sizesResponse && sizesResponse.sizes && Array.isArray(sizesResponse.sizes)) {
        setSizes(sizesResponse.sizes.map(s => ({
          value: s._id,
          label: s.Roz_Opis
        })));
      }
    } catch (error) {
      console.error('Error loading sales:', error);
      appAlert('Błąd', 'Nie udało się pobrać danych sprzedaży');
    } finally {
      setLoading(false);
    }
  };

  // Pull to refresh handler
  const onRefresh = async () => {
    setRefreshing(true);
    await loadSalesData();
    setRefreshing(false);
  };

  // Filter data by date range
  const filterDataByDateRange = (data, start, end) => {
    const startOfDay = new Date(start);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);

    let filtered = data.filter((sale) => {
      if (!sale.date) return false;
      const saleDate = new Date(sale.date);
      return saleDate >= startOfDay && saleDate <= endOfDay;
    });

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (sale) =>
          (sale.fullName && sale.fullName.toLowerCase().includes(query)) ||
          (sale.barcode && sale.barcode.toLowerCase().includes(query)) ||
          (sale.sellingPoint && sale.sellingPoint.toLowerCase().includes(query))
      );
    }

    // Apply selling point filter
    if (selectedSellingPoint) {
      filtered = filtered.filter(
        (sale) => sale.sellingPoint === selectedSellingPoint
      );
    }

    // Apply category filter
    if (selectedCategory) {
      filtered = filtered.filter((sale) => {
        // Znajdź produkt po nazwie lub kodzie kreskowym
        const product = products.find(
          p => p.label === sale.fullName || p.barcode === sale.barcode
        );
        return product && product.category === selectedCategory;
      });
    }

    // Apply size filter
    if (selectedSize) {
      filtered = filtered.filter(
        (sale) => sale.size === selectedSize
      );
    }

    // Apply product filter
    if (selectedProduct) {
      filtered = filtered.filter(
        (sale) => sale.fullName === selectedProduct
      );
    }

    setFilteredData(filtered);
    calculateStatistics(filtered);
  };

  // Calculate statistics
  const calculateStatistics = (data) => {
    let totalRevenue = 0;
    let cashRevenue = 0;
    let cardRevenue = 0;
    const productCounts = {};

    data.forEach((sale) => {
      // Calculate cash payments
      if (sale.cash && Array.isArray(sale.cash)) {
        sale.cash.forEach((payment) => {
          if (payment.price && payment.currency === 'PLN') {
            cashRevenue += parseFloat(payment.price);
            totalRevenue += parseFloat(payment.price);
          }
        });
      }

      // Calculate card payments
      if (sale.card && Array.isArray(sale.card)) {
        sale.card.forEach((payment) => {
          if (payment.price && payment.currency === 'PLN') {
            cardRevenue += parseFloat(payment.price);
            totalRevenue += parseFloat(payment.price);
          }
        });
      }

      // Count products
      const productName = sale.fullName || 'Nieznany';
      productCounts[productName] = (productCounts[productName] || 0) + 1;
    });

    // Get top 5 products
    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    setStatistics({
      totalSales: data.length,
      totalRevenue: totalRevenue.toFixed(2),
      cashRevenue: cashRevenue.toFixed(2),
      cardRevenue: cardRevenue.toFixed(2),
      topProducts,
    });
  };

  // Handle quick filter
  const handleQuickFilter = (filter) => {
    const today = new Date();
    let newStartDate = new Date();
    let newEndDate = new Date();

    if (filter.type === 'month') {
      newStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
      newEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (filter.days === 0) {
      newStartDate = today;
      newEndDate = today;
    } else if (filter.days === 1) {
      newStartDate = new Date(today);
      newStartDate.setDate(today.getDate() - 1);
      newEndDate = new Date(today);
      newEndDate.setDate(today.getDate() - 1);
    } else {
      newStartDate = new Date(today);
      newStartDate.setDate(today.getDate() - filter.days);
      newEndDate = today;
    }

    setStartDate(newStartDate);
    setEndDate(newEndDate);
    filterDataByDateRange(salesData, newStartDate, newEndDate);
  };

  // Load data on mount
  useEffect(() => {
    loadSalesData();
  }, []);

  // Update filtered data when dates change
  useEffect(() => {
    if (salesData.length > 0) {
      filterDataByDateRange(salesData, startDate, endDate);
    }
  }, [startDate, endDate, searchQuery, selectedSellingPoint, selectedCategory, selectedSize, selectedProduct]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Raport Sprzedaży</Text>
          <View style={styles.headerRightSpace} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
        {/* Quick Filters */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Szybkie filtry</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.quickFiltersRow}>
              {quickFilters.map((filter, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.quickFilterButton}
                  onPress={() => handleQuickFilter(filter)}
                >
                  <Text style={styles.quickFilterText}>{filter.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Search and Filters */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wyszukiwanie i filtry</Text>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#64748B" />
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
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilters(true)}
          >
            <Ionicons name="filter" size={20} color="#fff" />
            <Text style={styles.filterButtonText}>
              Dodatkowe filtry
              {(selectedSellingPoint || selectedCategory || selectedSize || selectedProduct) 
                ? ` (${[selectedSellingPoint, selectedCategory, selectedSize, selectedProduct].filter(Boolean).length})`
                : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date Range Picker */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Zakres dat</Text>
          <View style={styles.dateRangeContainer}>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowStartPicker(true)}
            >
              <Ionicons name="calendar" size={20} color="#0d6efd" />
              <View style={styles.dateTextContainer}>
                <Text style={styles.dateLabel}>Od</Text>
                <Text style={styles.dateValue}>
                  {startDate.toLocaleDateString('pl-PL')}
                </Text>
              </View>
            </TouchableOpacity>

            <Ionicons name="arrow-forward" size={20} color="#64748B" />

            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowEndPicker(true)}
            >
              <Ionicons name="calendar" size={20} color="#0d6efd" />
              <View style={styles.dateTextContainer}>
                <Text style={styles.dateLabel}>Do</Text>
                <Text style={styles.dateValue}>
                  {endDate.toLocaleDateString('pl-PL')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Statistics Cards */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0d6efd" />
            <Text style={styles.loadingText}>Ładowanie danych...</Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Statystyki</Text>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, { borderLeftColor: '#0d6efd' }]}>
                  <Ionicons name="cart-outline" size={24} color="#0d6efd" />
                  <Text style={styles.statValue}>{statistics.totalSales}</Text>
                  <Text style={styles.statLabel}>Sprzedaży</Text>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#198754' }]}>
                  <Ionicons name="cash-outline" size={24} color="#198754" />
                  <Text style={styles.statValue}>{statistics.totalRevenue} PLN</Text>
                  <Text style={styles.statLabel}>Łączny przychód</Text>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#ffc107' }]}>
                  <Ionicons name="wallet-outline" size={24} color="#ffc107" />
                  <Text style={styles.statValue}>{statistics.cashRevenue} PLN</Text>
                  <Text style={styles.statLabel}>Gotówka</Text>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#6f42c1' }]}>
                  <Ionicons name="card-outline" size={24} color="#6f42c1" />
                  <Text style={styles.statValue}>{statistics.cardRevenue} PLN</Text>
                  <Text style={styles.statLabel}>Karta</Text>
                </View>
              </View>
            </View>

            {/* Top Products */}
            {statistics.topProducts.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Top 5 produktów</Text>
                {statistics.topProducts.map((product, index) => (
                  <View key={index} style={styles.topProductItem}>
                    <View style={styles.topProductRank}>
                      <Text style={styles.topProductRankText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.topProductName} numberOfLines={1}>
                      {product.name}
                    </Text>
                    <View style={styles.topProductCount}>
                      <Text style={styles.topProductCountText}>{product.count}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Sales List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Lista sprzedaży ({filteredData.length})
              </Text>
              {filteredData.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="cart-outline" size={48} color="#64748B" />
                  <Text style={styles.emptyStateText}>
                    Brak sprzedaży w wybranym okresie
                  </Text>
                </View>
              ) : (
                filteredData.map((sale, index) => (
                  <View key={index} style={styles.saleCard}>
                    <View style={styles.saleHeader}>
                      <Text style={styles.saleProduct}>{sale.fullName || 'Nieznany'}</Text>
                      <Text style={styles.saleSize}>{sale.size || '-'}</Text>
                    </View>
                    <View style={styles.saleDetails}>
                      <View style={styles.saleDetailRow}>
                        <Ionicons name="location" size={14} color="#64748B" />
                        <Text style={styles.saleDetailText}>
                          {sale.sellingPoint || 'Brak'}
                        </Text>
                      </View>
                      <View style={styles.saleDetailRow}>
                        <Ionicons name="calendar" size={14} color="#64748B" />
                        <Text style={styles.saleDetailText}>
                          {sale.date
                            ? new Date(sale.date).toLocaleDateString('pl-PL')
                            : '-'}
                        </Text>
                      </View>
                      <View style={styles.saleDetailRow}>
                        <Ionicons name="barcode" size={14} color="#64748B" />
                        <Text style={styles.saleDetailText}>
                          {sale.barcode || 'Brak'}
                        </Text>
                      </View>
                    </View>
                    {/* Payment info */}
                    <View style={styles.salePayments}>
                      {sale.cash && sale.cash.length > 0 && (
                        <View style={styles.paymentBadge}>
                          <Ionicons name="cash" size={12} color="#198754" />
                          <Text style={styles.paymentText}>
                            {sale.cash[0].price} {sale.cash[0].currency}
                          </Text>
                        </View>
                      )}
                      {sale.card && sale.card.length > 0 && (
                        <View style={styles.paymentBadge}>
                          <Ionicons name="card" size={12} color="#6f42c1" />
                          <Text style={styles.paymentText}>
                            {sale.card[0].price} {sale.card[0].currency}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {/* Refresh Button */}
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={loadSalesData}
          disabled={loading}
        >
          <Ionicons name="refresh" size={20} color="#fff" />
          <Text style={styles.refreshButtonText}>Odśwież dane</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Date Pickers */}
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

      {/* Filters Modal */}
      <Modal
        visible={showFilters}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowFilters(false);
          setActiveFilter(null);
          setFilterSearch('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeFilter ? 'Wybierz opcję' : 'Wybierz filtr'}
              </Text>
              <TouchableOpacity onPress={() => {
                if (activeFilter) {
                  setActiveFilter(null);
                  setFilterSearch('');
                } else {
                  setShowFilters(false);
                }
              }}>
                <Ionicons name={activeFilter ? "arrow-back" : "close"} size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {!activeFilter ? (
                // Lista wyboru filtrów
                <>
                  <TouchableOpacity
                    style={styles.filterSelectButton}
                    onPress={() => setActiveFilter('sellingPoint')}
                  >
                    <View style={styles.filterSelectLeft}>
                      <Ionicons name="location-outline" size={24} color="#0d6efd" />
                      <View style={styles.filterSelectTextContainer}>
                        <Text style={styles.filterSelectTitle}>Punkt sprzedaży</Text>
                        {selectedSellingPoint && (
                          <Text style={styles.filterSelectValue} numberOfLines={1}>
                            {sellingPoints.find(p => p.value === selectedSellingPoint)?.label || selectedSellingPoint}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#64748B" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.filterSelectButton}
                    onPress={() => setActiveFilter('category')}
                  >
                    <View style={styles.filterSelectLeft}>
                      <Ionicons name="pricetag-outline" size={24} color="#0d6efd" />
                      <View style={styles.filterSelectTextContainer}>
                        <Text style={styles.filterSelectTitle}>Kategoria</Text>
                        {selectedCategory && (
                          <Text style={styles.filterSelectValue} numberOfLines={1}>
                            {selectedCategory}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#64748B" />
                  </TouchableOpacity>

                  {/* Rozmiar tylko dla kategorii "Kurtki kożuchy futra" */}
                  {(!selectedCategory || selectedCategory === 'Kurtki kożuchy futra') && (
                    <TouchableOpacity
                      style={styles.filterSelectButton}
                      onPress={() => setActiveFilter('size')}
                    >
                      <View style={styles.filterSelectLeft}>
                        <Ionicons name="resize-outline" size={24} color="#0d6efd" />
                        <View style={styles.filterSelectTextContainer}>
                          <Text style={styles.filterSelectTitle}>Rozmiar</Text>
                          {selectedSize && (
                            <Text style={styles.filterSelectValue} numberOfLines={1}>
                              {selectedSize}
                            </Text>
                          )}
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={24} color="#64748B" />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.filterSelectButton}
                    onPress={() => setActiveFilter('product')}
                  >
                    <View style={styles.filterSelectLeft}>
                      <Ionicons name="cube-outline" size={24} color="#0d6efd" />
                      <View style={styles.filterSelectTextContainer}>
                        <Text style={styles.filterSelectTitle}>Konkretny produkt</Text>
                        {selectedProduct && (
                          <Text style={styles.filterSelectValue} numberOfLines={1}>
                            {selectedProduct}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#64748B" />
                  </TouchableOpacity>
                </>
              ) : (
                // Dropdown z opcjami dla wybranego filtra
                <>
                  <View style={styles.searchContainer}>
                    <Ionicons name="search" size={18} color="#64748B" />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Szukaj..."
                      placeholderTextColor="#64748B"
                      value={filterSearch}
                      onChangeText={setFilterSearch}
                      autoFocus
                    />
                    {filterSearch !== '' && (
                      <TouchableOpacity onPress={() => setFilterSearch('')}>
                        <Ionicons name="close-circle" size={18} color="#64748B" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.filterOptionsContainer}>
                    {/* Zawsze opcja "Wszystkie" */}
                    <TouchableOpacity
                      style={[
                        styles.filterOption,
                        (activeFilter === 'sellingPoint' && selectedSellingPoint === null) ||
                        (activeFilter === 'category' && selectedCategory === null) ||
                        (activeFilter === 'size' && selectedSize === null) ||
                        (activeFilter === 'product' && selectedProduct === null)
                          ? styles.filterOptionActive
                          : null,
                      ]}
                      onPress={() => {
                        if (activeFilter === 'sellingPoint') setSelectedSellingPoint(null);
                        if (activeFilter === 'category') setSelectedCategory(null);
                        if (activeFilter === 'size') setSelectedSize(null);
                        if (activeFilter === 'product') setSelectedProduct(null);
                        setFilterSearch('');
                        setActiveFilter(null);
                      }}
                    >
                      <Text style={[
                        styles.filterOptionText,
                        ((activeFilter === 'sellingPoint' && selectedSellingPoint === null) ||
                         (activeFilter === 'category' && selectedCategory === null) ||
                         (activeFilter === 'size' && selectedSize === null) ||
                         (activeFilter === 'product' && selectedProduct === null))
                          ? styles.filterOptionTextActive
                          : null,
                      ]}>
                        Wszystkie
                      </Text>
                      {((activeFilter === 'sellingPoint' && selectedSellingPoint === null) ||
                        (activeFilter === 'category' && selectedCategory === null) ||
                        (activeFilter === 'size' && selectedSize === null) ||
                        (activeFilter === 'product' && selectedProduct === null)) && (
                        <Ionicons name="checkmark" size={20} color="#0d6efd" />
                      )}
                    </TouchableOpacity>

                    {/* Opcje w zależności od wybranego filtra */}
                    {activeFilter === 'sellingPoint' &&
                      sellingPoints
                        .filter(point =>
                          filterSearch === '' ||
                          point.label.toLowerCase().includes(filterSearch.toLowerCase())
                        )
                        .map((point) => (
                          <TouchableOpacity
                            key={point.value}
                            style={[
                              styles.filterOption,
                              selectedSellingPoint === point.value && styles.filterOptionActive,
                            ]}
                            onPress={() => {
                              setSelectedSellingPoint(point.value);
                              setFilterSearch('');
                              setActiveFilter(null);
                            }}
                          >
                            <Text
                              style={[
                                styles.filterOptionText,
                                selectedSellingPoint === point.value && styles.filterOptionTextActive,
                              ]}
                            >
                              {point.label}
                            </Text>
                            {selectedSellingPoint === point.value && (
                              <Ionicons name="checkmark" size={20} color="#0d6efd" />
                            )}
                          </TouchableOpacity>
                        ))}

                    {activeFilter === 'category' &&
                      ['Kurtki kożuchy futra', 'Torebki', 'Portfele', 'Pozostały asortyment', 'Paski', 'Rękawiczki']
                        .filter(cat =>
                          filterSearch === '' ||
                          cat.toLowerCase().includes(filterSearch.toLowerCase())
                        )
                        .map((cat) => (
                          <TouchableOpacity
                            key={cat}
                            style={[
                              styles.filterOption,
                              selectedCategory === cat && styles.filterOptionActive,
                            ]}
                            onPress={() => {
                              setSelectedCategory(cat);
                              setFilterSearch('');
                              setActiveFilter(null);
                            }}
                          >
                            <Text
                              style={[
                                styles.filterOptionText,
                                selectedCategory === cat && styles.filterOptionTextActive,
                              ]}
                            >
                              {cat}
                            </Text>
                            {selectedCategory === cat && (
                              <Ionicons name="checkmark" size={20} color="#0d6efd" />
                            )}
                          </TouchableOpacity>
                        ))}

                    {activeFilter === 'size' &&
                      sizes
                        .filter(size =>
                          filterSearch === '' ||
                          size.label.toLowerCase().includes(filterSearch.toLowerCase())
                        )
                        .map((size) => (
                          <TouchableOpacity
                            key={size.value}
                            style={[
                              styles.filterOption,
                              selectedSize === size.label && styles.filterOptionActive,
                            ]}
                            onPress={() => {
                              setSelectedSize(size.label);
                              setFilterSearch('');
                              setActiveFilter(null);
                            }}
                          >
                            <Text
                              style={[
                                styles.filterOptionText,
                                selectedSize === size.label && styles.filterOptionTextActive,
                              ]}
                            >
                              {size.label}
                            </Text>
                            {selectedSize === size.label && (
                              <Ionicons name="checkmark" size={20} color="#0d6efd" />
                            )}
                          </TouchableOpacity>
                        ))}

                    {activeFilter === 'product' &&
                      products
                        .filter(prod =>
                          filterSearch === '' ||
                          prod.label.toLowerCase().includes(filterSearch.toLowerCase())
                        )
                        .map((prod) => (
                          <TouchableOpacity
                            key={prod.value}
                            style={[
                              styles.filterOption,
                              selectedProduct === prod.label && styles.filterOptionActive,
                            ]}
                            onPress={() => {
                              setSelectedProduct(prod.label);
                              setFilterSearch('');
                              setActiveFilter(null);
                            }}
                          >
                            <Text
                              style={[
                                styles.filterOptionText,
                                selectedProduct === prod.label && styles.filterOptionTextActive,
                              ]}
                              numberOfLines={2}
                            >
                              {prod.label}
                            </Text>
                            {selectedProduct === prod.label && (
                              <Ionicons name="checkmark" size={20} color="#0d6efd" />
                            )}
                          </TouchableOpacity>
                        ))}
                  </View>
                </>
              )}
            </ScrollView>

            {!activeFilter && (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.clearFiltersButton}
                  onPress={() => {
                    setSelectedSellingPoint(null);
                    setSelectedCategory(null);
                    setSelectedSize(null);
                    setSelectedProduct(null);
                    setFilterSearch('');
                    setShowFilters(false);
                  }}
                >
                  <Text style={styles.clearFiltersButtonText}>Wyczyść filtry</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.applyFiltersButton}
                  onPress={() => {
                    setFilterSearch('');
                    setShowFilters(false);
                  }}
                >
                  <Text style={styles.applyFiltersButtonText}>Zastosuj</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  headerRightSpace: {
    width: 40,
    height: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  quickFiltersRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickFilterButton: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickFilterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d6efd',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  filterButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dateRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  dateTextContainer: {
    flex: 1,
  },
  dateLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  dateValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statsGrid: {
    gap: 12,
  },
  statCard: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  topProductItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  topProductRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0d6efd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  topProductRankText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  topProductName: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  topProductCount: {
    backgroundColor: '#334155',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  topProductCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  saleCard: {
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  saleProduct: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  saleSize: {
    color: '#0d6efd',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: '#0d6efd20',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  saleDetails: {
    gap: 6,
    marginBottom: 8,
  },
  saleDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saleDetailText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  salePayments: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#334155',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
  },
  paymentText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d6efd',
    padding: 16,
    borderRadius: 8,
    gap: 8,
    marginBottom: 20,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#1E293B',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalBody: {
    padding: 20,
  },
  filterSection: {
    marginBottom: 16,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  filterHeaderTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  filterHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterBadge: {
    backgroundColor: '#0d6efd',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  filterDropdown: {
    marginTop: 8,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
    maxHeight: 300,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    padding: 0,
  },
  dropdownList: {
    maxHeight: 240,
  },
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  filterOptionActive: {
    backgroundColor: '#0d6efd15',
  },
  filterOptionText: {
    color: '#E2E8F0',
    fontSize: 15,
    flex: 1,
  },
  filterOptionTextActive: {
    color: '#0d6efd',
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#000000',
  },
  clearFiltersButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc3545',
    alignItems: 'center',
  },
  clearFiltersButtonText: {
    color: '#dc3545',
    fontSize: 16,
    fontWeight: '600',
  },
  applyFiltersButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#0d6efd',
    alignItems: 'center',
  },
  applyFiltersButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  filterSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 8,
    marginBottom: 12,
  },
  filterSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  filterSelectTextContainer: {
    flex: 1,
  },
  filterSelectTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  filterSelectValue: {
    fontSize: 13,
    color: '#64748B',
  },
  filterOptionsContainer: {
    maxHeight: 400,
  },
});

export default SalesReport;
