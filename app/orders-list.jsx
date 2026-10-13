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
import DateTimePicker from '@react-native-community/datetimepicker';
import { localDateString, orderCompletionMessage } from '../utils/orderCompletionMessage';
import { GlobalStateContext } from '../context/GlobalState';
import { getApiUrl } from '../config/api';
import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';

const OrdersList = () => {
  const { user } = useContext(GlobalStateContext);
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'pending', 'completed'
  
  // Modals
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [orderToComplete, setOrderToComplete] = useState(null);
  const [shippingDate, setShippingDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState(''); // numer przesyłki (opcjonalny) - do maila i SMS-a
  const [completing, setCompleting] = useState(false); // blokada podwójnego kliknięcia
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [revertConfirmModalVisible, setRevertConfirmModalVisible] = useState(false);
  const [orderToRevert, setOrderToRevert] = useState(null);

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, searchQuery, statusFilter]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const response = await tokenService.authenticatedFetch(
        getApiUrl('/orders')
      );
      const data = await response.json();
      
      if (data.success) {
        // Sort by urgency (closest realization date first)
        const sorted = data.data.sort((a, b) => {
          const dateA = new Date(a.realizationDate || a.createdAt);
          const dateB = new Date(b.realizationDate || b.createdAt);
          return dateA - dateB;
        });
        setOrders(sorted);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      appAlert('Błąd', 'Nie udało się pobrać zamówień');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const applyFilters = () => {
    let filtered = [...orders];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order => {
        const fullProductName = [
          order.product?.name,
          order.product?.color,
          order.product?.size
        ].filter(Boolean).join(' ').toLowerCase();
        
        return order.orderId?.toLowerCase().includes(query) ||
               order.customer?.name?.toLowerCase().includes(query) ||
               order.customer?.phone?.includes(query) ||
               order.customer?.email?.toLowerCase().includes(query) ||
               fullProductName.includes(query);
      });
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => {
        if (statusFilter === 'completed') {
          return order.status === 'zrealizowano';
        } else if (statusFilter === 'cancelled') {
          return order.status === 'anulowane';
        } else if (statusFilter === 'pending') {
          return order.status !== 'zrealizowano' && order.status !== 'anulowane';
        }
        return true;
      });
    }

    setFilteredOrders(filtered);
  };

  const resetFilters = () => {
    setStatusFilter('all');
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

  const formatPrice = (price) => {
    return price ? `${price.toFixed(2)} zł` : '0.00 zł';
  };

  const getDeliveryOptionLabel = (option) => {
    switch (option) {
      case 'shipping': return 'Wysyłka';
      case 'delivery': return 'Dostawa';
      case 'pickup': return 'Odbiór osobisty';
      default: return option;
    }
  };

  const getUrgencyStatus = (realizationDate) => {
    if (!realizationDate) return { status: 'unknown', days: null };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const realDate = new Date(realizationDate);
    realDate.setHours(0, 0, 0, 0);
    
    const diffTime = realDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { status: 'overdue', days: Math.abs(diffDays) };
    if (diffDays === 0) return { status: 'today', days: 0 };
    if (diffDays <= 3) return { status: 'urgent', days: diffDays };
    if (diffDays <= 7) return { status: 'soon', days: diffDays };
    return { status: 'normal', days: diffDays };
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency.status) {
      case 'overdue': return '#EF4444';
      case 'today': return '#F59E0B';
      case 'urgent': return '#F59E0B';
      case 'soon': return '#3B82F6';
      case 'normal': return '#64748B';
      default: return '#64748B';
    }
  };

  const getUrgencyLabel = (urgency) => {
    switch (urgency.status) {
      case 'overdue': return `🚨 Przeterminowane (${urgency.days}d temu)`;
      case 'today': return '⏰ Dziś!';
      case 'urgent': return `⚡ Pilne (${urgency.days}d)`;
      case 'soon': return `📅 ${urgency.days}d`;
      case 'normal': return `📅 ${urgency.days}d`;
      default: return 'Brak daty';
    }
  };

  const openCompleteModal = (order) => {
    setOrderToComplete(order);
    setShippingDate(new Date());
    setTrackingNumber('');
    setCompleteModalVisible(true);
  };

  const completeOrder = async () => {
    if (!shippingDate) {
      appAlert('Błąd', 'Proszę wybrać datę wysyłki');
      return;
    }
    if (completing) return;
    setCompleting(true);
    try {
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/orders/${orderToComplete._id}/complete`),
        {
          method: 'PUT',
          body: JSON.stringify({
            shippingDate: localDateString(shippingDate),
            trackingNumber: trackingNumber.trim(),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        await loadOrders();
        setCompleteModalVisible(false);
        setOrderToComplete(null);
        setShippingDate(new Date());
        setTrackingNumber('');
        setSuccessMessage(orderCompletionMessage(data.notifications));
        setSuccessModalVisible(true);
      } else {
        if (response.status === 409) await loadOrders(); // ktoś już zrealizował - pokaż aktualny stan
        appAlert('Błąd', data.message ? `Nie zrealizowano zamówienia: ${data.message}` : 'Nie udało się zrealizować zamówienia');
      }
    } catch (error) {
      console.error('Error completing order:', error);
      appAlert('Błąd', 'Nie udało się połączyć z serwerem. Spróbuj ponownie.');
    } finally {
      setCompleting(false);
    }
  };

  const revertOrder = (order) => {
    setOrderToRevert(order);
    setRevertConfirmModalVisible(true);
  };

  const confirmRevertOrder = async () => {
    try {
      setRevertConfirmModalVisible(false);
      
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/orders/${orderToRevert._id}/revert`),
        {
          method: 'PUT',
        }
      );

      const data = await response.json();

      if (data.success) {
        await loadOrders();
        setOrderToRevert(null);
        setSuccessMessage('🔄 Zamówienie zostało przywrócone!\n\nStatus zamówienia został zmieniony na aktywny.');
        setSuccessModalVisible(true);
      } else {
        appAlert('Błąd', 'Nie udało się przywrócić zamówienia');
      }
    } catch (error) {
      console.error('Error reverting order:', error);
      appAlert('Błąd', 'Nie udało się przywrócić zamówienia');
    }
  };

  const renderOrderCard = (order) => {
    const urgency = getUrgencyStatus(order.realizationDate);
    const urgencyColor = getUrgencyColor(urgency);
    const isCompleted = order.status === 'zrealizowano';
    const isCancelled = order.status === 'anulowane';
    const statusColor = isCompleted ? '#22C55E' : isCancelled ? '#94A3B8' : '#F59E0B';

    return (
      <TouchableOpacity
        key={order._id}
        style={styles.card}
        onPress={() => {
          setSelectedOrder(order);
          setDetailsModalVisible(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.orderId}>{order.orderId}</Text>
            <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
          </View>
          <View style={[
            styles.statusBadge,
            { backgroundColor: `${statusColor}20` }
          ]}>
            <Text style={[
              styles.statusText,
              { color: statusColor }
            ]}>
              {isCompleted ? 'ZREALIZOWANO' : isCancelled ? 'ANULOWANE' : 'OCZEKUJE'}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          {/* Customer */}
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={16} color="#94A3B8" />
            <Text style={styles.infoLabel}>Klient:</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {order.customer?.name}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={16} color="#94A3B8" />
            <Text style={styles.infoLabel}>Tel:</Text>
            <Text style={styles.infoValue}>{order.customer?.phone}</Text>
          </View>

          {/* Product */}
          <View style={styles.infoRow}>
            <Ionicons name="pricetag-outline" size={16} color="#94A3B8" />
            <Text style={styles.infoLabel}>Produkt:</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {[
                order.product?.name,
                order.product?.color?.toUpperCase(),
                order.product?.size?.toUpperCase()
              ].filter(Boolean).join(' ')}
            </Text>
          </View>

          {/* Delivery */}
          <View style={styles.infoRow}>
            <Ionicons name="car-outline" size={16} color="#94A3B8" />
            <Text style={styles.infoLabel}>Dostawa:</Text>
            <Text style={styles.infoValue}>
              {getDeliveryOptionLabel(order.customer?.deliveryOption)}
            </Text>
          </View>

          {/* Price */}
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={16} color="#94A3B8" />
            <Text style={styles.infoLabel}>Pobranie:</Text>
            <Text style={[styles.infoValue, styles.priceValue]}>
              {formatPrice(order.payment?.cashOnDelivery)}
            </Text>
          </View>

          {/* Realization Date */}
          <View style={styles.urgencyRow}>
            <Ionicons name="calendar-outline" size={16} color={urgencyColor} />
            <Text style={styles.realizationDate}>
              {formatDate(order.realizationDate)}
            </Text>
            <View style={[styles.urgencyBadge, { backgroundColor: `${urgencyColor}20` }]}>
              <Text style={[styles.urgencyText, { color: urgencyColor }]}>
                {getUrgencyLabel(urgency)}
              </Text>
            </View>
          </View>
        </View>

        {!isCompleted && !isCancelled && (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.completeButton]}
              onPress={(e) => {
                e.stopPropagation();
                openCompleteModal(order);
              }}
            >
              <Ionicons name="checkmark-circle" size={14} color="#fff" />
              <Text style={styles.actionButtonText}>Zrealizuj</Text>
            </TouchableOpacity>
          </View>
        )}

        {(isCompleted || isCancelled) && (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.revertButton]}
              onPress={(e) => {
                e.stopPropagation();
                revertOrder(order);
              }}
            >
              <Ionicons name="arrow-undo" size={14} color="#fff" />
              <Text style={styles.actionButtonText}>Przywróć</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
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
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Zamówienia',
          headerStyle: {
            backgroundColor: '#000000',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Stats and Search */}
      <View style={styles.topBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj zamówienia..."
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
          onPress={() => setFilterModalVisible(true)}
        >
          <Ionicons 
            name={statusFilter !== 'all' ? 'funnel' : 'funnel-outline'} 
            size={20} 
            color={statusFilter !== 'all' ? '#3B82F6' : '#fff'} 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          Znaleziono: {filteredOrders.length} z {orders.length}
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {filteredOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={64} color="#64748B" />
            <Text style={styles.emptyStateText}>
              {orders.length === 0 ? 'Brak zamówień do wyświetlenia' : 'Brak zamówień pasujących do filtrów'}
            </Text>
          </View>
        ) : (
          filteredOrders.map(renderOrderCard)
        )}
      </ScrollView>

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtry</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Status:</Text>
                <View style={styles.filterOptions}>
                  {[
                    { value: 'all', label: 'Wszystkie' },
                    { value: 'pending', label: 'Oczekujące' },
                    { value: 'completed', label: 'Zrealizowane' },
                    { value: 'cancelled', label: 'Anulowane' }
                  ].map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.filterOption,
                        statusFilter === option.value && styles.filterOptionActive
                      ]}
                      onPress={() => setStatusFilter(option.value)}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          statusFilter === option.value && styles.filterOptionTextActive
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.resetButton]}
                onPress={() => {
                  resetFilters();
                  setFilterModalVisible(false);
                }}
              >
                <Text style={styles.modalButtonText}>Resetuj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.applyButton]}
                onPress={() => setFilterModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Zastosuj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Details Modal */}
      <Modal
        visible={detailsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Szczegóły zamówienia</Text>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedOrder && (
                <View>
                  {/* Order Info */}
                  <View style={styles.detailsSection}>
                    <Text style={styles.detailsSectionTitle}>📋 Informacje o zamówieniu</Text>
                    <Text style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Numer: </Text>
                      <Text style={styles.detailsValue}>{selectedOrder.orderId}</Text>
                    </Text>
                    <Text style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Data złożenia: </Text>
                      <Text style={styles.detailsValue}>{formatDate(selectedOrder.createdAt)}</Text>
                    </Text>
                    <Text style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Data realizacji: </Text>
                      <Text style={styles.detailsValue}>{formatDate(selectedOrder.realizationDate)}</Text>
                    </Text>
                    <Text style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Status: </Text>
                      <Text style={[styles.detailsValue, { color: selectedOrder.status === 'zrealizowano' ? '#22C55E' : selectedOrder.status === 'anulowane' ? '#94A3B8' : '#F59E0B' }]}>
                        {selectedOrder.status === 'zrealizowano' ? 'ZREALIZOWANO' : selectedOrder.status === 'anulowane' ? 'ANULOWANE' : 'OCZEKUJE'}
                      </Text>
                    </Text>
                    {selectedOrder.status === 'anulowane' && selectedOrder.cancellation?.reason ? (
                      <Text style={styles.detailsRow}>
                        <Text style={styles.detailsLabel}>Powód anulowania: </Text>
                        <Text style={styles.detailsValue}>{selectedOrder.cancellation.reason}</Text>
                      </Text>
                    ) : null}
                    <Text style={{ height: 0 }}>
                    </Text>
                  </View>

                  {/* Product Info */}
                  <View style={styles.detailsSection}>
                    <Text style={styles.detailsSectionTitle}>🛍️ Produkt</Text>
                    <Text style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Nazwa: </Text>
                      <Text style={styles.detailsValue}>
                        {[
                          selectedOrder.product?.name,
                          selectedOrder.product?.color?.toUpperCase(),
                          selectedOrder.product?.size?.toUpperCase()
                        ].filter(Boolean).join(' ')}
                      </Text>
                    </Text>
                    {selectedOrder.product?.description && (
                      <Text style={styles.detailsRow}>
                        <Text style={styles.detailsLabel}>Opis: </Text>
                        <Text style={styles.detailsValue}>{selectedOrder.product.description}</Text>
                      </Text>
                    )}
                  </View>

                  {/* Customer Info */}
                  <View style={styles.detailsSection}>
                    <Text style={styles.detailsSectionTitle}>👤 Dane klienta</Text>
                    <Text style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Imię i nazwisko: </Text>
                      <Text style={styles.detailsValue}>{selectedOrder.customer?.name}</Text>
                    </Text>
                    <Text style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Telefon: </Text>
                      <Text style={styles.detailsValue}>{selectedOrder.customer?.phone}</Text>
                    </Text>
                    {selectedOrder.customer?.email && (
                      <Text style={styles.detailsRow}>
                        <Text style={styles.detailsLabel}>Email: </Text>
                        <Text style={styles.detailsValue}>{selectedOrder.customer.email}</Text>
                      </Text>
                    )}
                  </View>

                  {/* Delivery Info */}
                  <View style={styles.detailsSection}>
                    <Text style={styles.detailsSectionTitle}>🚚 Dostawa</Text>
                    <Text style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Sposób: </Text>
                      <Text style={styles.detailsValue}>
                        {getDeliveryOptionLabel(selectedOrder.customer?.deliveryOption)}
                      </Text>
                    </Text>
                    {selectedOrder.customer?.deliveryOption !== 'pickup' && (
                      <>
                        <Text style={styles.detailsRow}>
                          <Text style={styles.detailsLabel}>Adres: </Text>
                        </Text>
                        <Text style={styles.detailsValue}>
                          {selectedOrder.customer?.address?.postalCode} {selectedOrder.customer?.address?.city}
                          {'\n'}
                          {selectedOrder.customer?.address?.street} {selectedOrder.customer?.address?.houseNumber}
                        </Text>
                      </>
                    )}
                  </View>

                  {/* Payment Info */}
                  <View style={styles.detailsSection}>
                    <Text style={styles.detailsSectionTitle}>💰 Rozliczenie</Text>
                    <Text style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Cena całkowita: </Text>
                      <Text style={styles.detailsValue}>{formatPrice(selectedOrder.payment?.totalPrice)}</Text>
                    </Text>
                    <Text style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Zaliczka: </Text>
                      <Text style={styles.detailsValue}>{formatPrice(selectedOrder.payment?.deposit)}</Text>
                    </Text>
                    <Text style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Kwota pobrania: </Text>
                      <Text style={[styles.detailsValue, styles.priceValue]}>
                        {formatPrice(selectedOrder.payment?.cashOnDelivery)}
                      </Text>
                    </Text>
                    <Text style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Dokument: </Text>
                      <Text style={styles.detailsValue}>
                        {selectedOrder.payment?.documentType === 'invoice' ? 'Faktura' : 'Paragon'}
                      </Text>
                    </Text>
                    {selectedOrder.payment?.nip && (
                      <Text style={styles.detailsRow}>
                        <Text style={styles.detailsLabel}>NIP: </Text>
                        <Text style={styles.detailsValue}>{selectedOrder.payment.nip}</Text>
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooterVertical}>
              {selectedOrder && (selectedOrder.status === 'zrealizowano' || selectedOrder.status === 'anulowane') && (
                <TouchableOpacity
                  style={[styles.modalButtonFull, styles.applyButton]}
                  onPress={() => {
                    setDetailsModalVisible(false);
                    revertOrder(selectedOrder);
                  }}
                >
                  <Text style={styles.modalButtonText}>🔄 Przywróć do aktywnych</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalButtonFull, styles.resetButton]}
                onPress={() => setDetailsModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Order Modal */}
      <Modal
        visible={completeModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCompleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✅ Realizacja zamówienia</Text>
              <TouchableOpacity onPress={() => setCompleteModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {orderToComplete && (
                <View>
                  <View style={styles.completeOrderInfo}>
                    <Text style={styles.completeOrderTitle}>📋 Szczegóły zamówienia:</Text>
                    <Text style={styles.completeOrderDetail}>
                      📦 Zamówienie: <Text style={styles.completeOrderValue}>{orderToComplete.orderId}</Text>
                    </Text>
                    <Text style={styles.completeOrderDetail}>
                      👤 Klient: <Text style={styles.completeOrderValue}>{orderToComplete.customer?.name}</Text>
                    </Text>
                    <Text style={styles.completeOrderDetail}>
                      📧 Email: <Text style={styles.completeOrderValue}>{orderToComplete.customer?.email || 'brak (mail nie zostanie wysłany)'}</Text>
                    </Text>
                    <Text style={styles.completeOrderDetail}>
                      📱 Telefon: <Text style={styles.completeOrderValue}>{orderToComplete.customer?.phone}</Text>
                    </Text>
                  </View>

                  <View style={styles.datePickerGroup}>
                    <Text style={styles.datePickerLabel}>📅 Data planowanej wysyłki:</Text>
                    <TouchableOpacity
                      style={styles.dateButton}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Text style={styles.dateButtonText}>
                        {shippingDate.toLocaleDateString('pl-PL')}
                      </Text>
                      <Ionicons name="calendar" size={24} color="#fff" />
                    </TouchableOpacity>
                    {showDatePicker && (
                      <DateTimePicker
                        value={shippingDate}
                        minimumDate={new Date()}
                        mode="date"
                        display="default"
                        onChange={(event, date) => {
                          setShowDatePicker(false);
                          if (date) {
                            setShippingDate(date);
                          }
                        }}
                      />
                    )}
                    <Text style={styles.datePickerHint}>
                      💡 Klient dostanie mail i SMS o wysyłce (przy odbiorze osobistym: „gotowe do odbioru”)
                    </Text>
                  </View>

                  {orderToComplete.customer?.deliveryOption !== 'pickup' && (
                    <View style={styles.datePickerGroup}>
                      <Text style={styles.datePickerLabel}>📦 Numer przesyłki (opcjonalnie):</Text>
                      <TextInput
                        style={[styles.dateButton, styles.dateButtonText]}
                        value={trackingNumber}
                        onChangeText={setTrackingNumber}
                        placeholder="np. 6200123456789"
                        placeholderTextColor="#64748B"
                        maxLength={60}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        testID="tracking-number-input"
                      />
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooterVertical}>
              <TouchableOpacity
                style={[styles.modalButtonFull, styles.completeButtonFull]}
                onPress={completeOrder}
                disabled={!shippingDate || completing}
              >
                <Text style={styles.modalButtonText}>{completing ? 'Realizuję…' : '🚚 Potwierdź realizację'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButtonFull, styles.resetButton]}
                onPress={() => setCompleteModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>❌ Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Revert Confirmation Modal */}
      <Modal
        visible={revertConfirmModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setRevertConfirmModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <View style={styles.confirmIcon}>
              <Text style={styles.confirmIconText}>⚠️</Text>
            </View>
            <Text style={styles.confirmTitle}>Przywróć zamówienie</Text>
            
            {orderToRevert && (
              <>
                <Text style={styles.confirmText}>
                  Czy na pewno chcesz przywrócić zamówienie do statusu aktywnego?
                </Text>
                <View style={styles.confirmOrderBox}>
                  <Text style={styles.confirmOrderId}>📦 {orderToRevert.orderId}</Text>
                  <Text style={styles.confirmOrderDetail}>
                    👤 {orderToRevert.customer?.name}
                  </Text>
                  <Text style={styles.confirmOrderDetail}>
                    📧 {orderToRevert.customer?.email}
                  </Text>
                </View>
              </>
            )}

            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancelButton]}
                onPress={() => {
                  setRevertConfirmModalVisible(false);
                  setOrderToRevert(null);
                }}
              >
                <Text style={styles.confirmButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmRevertButton]}
                onPress={confirmRevertOrder}
              >
                <Text style={styles.confirmButtonText}>Przywróć</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={successModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSuccessModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModal, styles.successModal]}>
            <View style={styles.confirmIcon}>
              <Text style={styles.confirmIconText}>✅</Text>
            </View>
            <Text style={styles.confirmTitle}>Sukces!</Text>
            
            <View style={styles.successMessageBox}>
              <Text style={styles.successMessageText}>{successMessage}</Text>
            </View>

            <TouchableOpacity
              style={[styles.confirmButton, styles.successCloseButton]}
              onPress={() => setSuccessModalVisible(false)}
            >
              <Text style={styles.confirmButtonText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  backButton: {
    marginLeft: 8,
  },
  topBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 10,
  },
  filterButton: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsBar: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  statsText: {
    fontSize: 12,
    color: '#94A3B8',
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
    color: '#64748B',
    marginTop: 16,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  orderDate: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
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
    color: '#94A3B8',
  },
  infoValue: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
  },
  priceValue: {
    fontWeight: 'bold',
    color: '#22C55E',
  },
  urgencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  realizationDate: {
    fontSize: 13,
    color: '#fff',
  },
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 'auto',
  },
  urgencyText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  completeButton: {
    backgroundColor: '#22C55E',
  },
  revertButton: {
    backgroundColor: '#3B82F6',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1E293B',
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
    borderBottomColor: '#334155',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalBody: {
    padding: 20,
  },
  filterGroup: {
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
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
    backgroundColor: '#334155',
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
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  modalFooterVertical: {
    flexDirection: 'column',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonFull: {
    width: '100%',
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
  completeButtonFull: {
    backgroundColor: '#22C55E',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsSection: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#334155',
    borderRadius: 12,
  },
  detailsSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  detailsRow: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 8,
  },
  detailsLabel: {
    fontWeight: '600',
    color: '#94A3B8',
  },
  detailsValue: {
    color: '#fff',
  },
  completeOrderInfo: {
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  completeOrderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F59E0B',
    marginBottom: 12,
  },
  completeOrderDetail: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 8,
  },
  completeOrderValue: {
    fontWeight: 'bold',
    color: '#fff',
  },
  datePickerGroup: {
    marginBottom: 20,
  },
  datePickerLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  dateButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  datePickerHint: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 8,
  },
  confirmModal: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 30,
    width: '85%',
    maxWidth: 400,
  },
  successModal: {
    borderWidth: 3,
    borderColor: '#22C55E',
  },
  confirmIcon: {
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmIconText: {
    fontSize: 48,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmOrderBox: {
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  confirmOrderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  confirmOrderDetail: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 4,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmCancelButton: {
    backgroundColor: '#64748B',
  },
  confirmRevertButton: {
    backgroundColor: '#3B82F6',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  successMessageBox: {
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  successMessageText: {
    fontSize: 15,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
  },
  successCloseButton: {
    backgroundColor: '#22C55E',
    width: '100%',
    flex: 0,
  },
});

export default OrdersList;
