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
import { isConnectionError, readJson, serverErrorMessage } from '../utils/readJson';

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, ModalHeader, look } from '../components/AdminLook'; // wspólny wygląd panelu admina
import { KeyboardSafeScreen, KeyboardSafeOverlay } from "../components/KeyboardSafe"; // klawiatura nie zasłania pola
const OrdersList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
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
  const [revertDate, setRevertDate] = useState(new Date()); // nowy termin realizacji (wymagany dla anulowanych)
  const [showRevertDatePicker, setShowRevertDatePicker] = useState(false);
  const [reverting, setReverting] = useState(false);
  // Zmiana terminu realizacji (oczekujące): nowa data, powód, opcjonalne powiadomienie klienta
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(new Date());
  const [showRescheduleDatePicker, setShowRescheduleDatePicker] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleChannel, setRescheduleChannel] = useState('none'); // none | sms | email
  const [rescheduling, setRescheduling] = useState(false);

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
      const data = await readJson(response);

      if (response.ok && data.success && Array.isArray(data.data)) {
        // Sort by urgency (closest realization date first)
        const sorted = data.data.sort((a, b) => {
          const dateA = new Date(a.realizationDate || a.createdAt);
          const dateB = new Date(b.realizationDate || b.createdAt);
          return dateA - dateB;
        });
        setOrders(sorted);
      } else {
        appAlert('Błąd', `Nie udało się pobrać zamówień. ${serverErrorMessage(response, data, '')}`.trim());
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      if (!error?.isAuthError) appAlert('Błąd', 'Nie udało się pobrać zamówień');
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

  // Kwota może przyjść jako liczba, tekst albo w ogóle - nie wywracamy listy na .toFixed
  const formatPrice = (price) => `${(Number(price) || 0).toFixed(2)} zł`;

  const getDeliveryOptionLabel = (option) => {
    switch (option) {
      case 'shipping': return 'Wysyłka';
      case 'delivery': return 'Dostawa';
      case 'pickup': return 'Odbiór osobisty';
      default: return option;
    }
  };

  const getUrgencyStatus = (realizationDate, orderStatus) => {
    // Zrealizowane i anulowane nie są „przeterminowane” - termin dotyczy tylko oczekujących
    if (orderStatus === 'zrealizowano' || orderStatus === 'anulowane') return { status: 'closed', days: null };
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

  // Błąd połączenia przy akcjach: przy wygasłej sesji aplikacja już przechodzi do logowania - bez komunikatu
  const showActionError = (error) => {
    if (error?.isAuthError) return;
    appAlert('Błąd', isConnectionError(error)
      ? 'Brak odpowiedzi serwera. Odśwież listę i sprawdź, czy zmiana się zapisała, zanim spróbujesz ponownie.'
      : 'Nie udało się połączyć z serwerem. Spróbuj ponownie.');
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

      const data = await readJson(response);

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
        appAlert('Błąd', data.message ? `Nie zrealizowano zamówienia: ${data.message}` : serverErrorMessage(response, data, 'Nie udało się zrealizować zamówienia'));
      }
    } catch (error) {
      console.error('Error completing order:', error);
      showActionError(error);
    } finally {
      setCompleting(false);
    }
  };

  const rescheduleMessage = (order, date, reason) => (
    `Dzien dobry, termin realizacji Twojego zamowienia ${order.orderId} zmienil sie na ${date.toLocaleDateString('pl-PL')}${reason.trim() ? ` (${reason.trim()})` : ''}. Przepraszamy za niedogodnosci. Bukowski`
  );

  const openRescheduleModal = (order) => {
    setRescheduleTarget(order);
    setRescheduleDate(new Date());
    setRescheduleReason('');
    setRescheduleChannel('none');
  };

  const confirmReschedule = async () => {
    if (rescheduling || !rescheduleTarget) return;
    setRescheduling(true);
    try {
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/orders/${rescheduleTarget._id}/reschedule`),
        {
          method: 'PUT',
          body: JSON.stringify({
            realizationDate: localDateString(rescheduleDate),
            reason: rescheduleReason.trim(),
            notify: {
              channel: rescheduleChannel,
              text: rescheduleChannel === 'none' ? '' : rescheduleMessage(rescheduleTarget, rescheduleDate, rescheduleReason),
            },
          }),
        }
      );
      const data = await readJson(response);
      if (response.ok && data.success) {
        setRescheduleTarget(null);
        await loadOrders();
        const what = rescheduleChannel === 'sms' ? 'SMS' : 'E-mail';
        let message = `📅 Termin realizacji zmieniony na ${rescheduleDate.toLocaleDateString('pl-PL')}.`;
        if (data.notification === 'sent') message += `\n\n${what} do klienta: wysłany.`;
        if (data.notification === 'test') message += `\n\n${what} do klienta: sprawdzony w trybie testowym (nie wysłano).`;
        if (data.notification === 'failed' || data.notification === 'invalid_phone') message += `\n\n⚠️ ${what} do klienta: nie udało się wysłać.`;
        setSuccessMessage(message);
        setSuccessModalVisible(true);
      } else {
        appAlert('Błąd', data.message ? `Nie zmieniono terminu: ${data.message}` : serverErrorMessage(response, data, 'Nie udało się zmienić terminu'));
      }
    } catch (error) {
      console.error('Error rescheduling order:', error);
      showActionError(error);
    } finally {
      setRescheduling(false);
    }
  };

  const revertOrder = (order) => {
    setOrderToRevert(order);
    setRevertDate(new Date());
    setRevertConfirmModalVisible(true);
  };

  const confirmRevertOrder = async () => {
    if (reverting) return;
    const wasCancelled = orderToRevert?.status === 'anulowane';
    setReverting(true);
    try {
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/orders/${orderToRevert._id}/revert`),
        {
          method: 'PUT',
          body: JSON.stringify(wasCancelled ? { realizationDate: localDateString(revertDate) } : {}),
        }
      );

      const data = await readJson(response);

      if (response.ok && data.success) {
        setRevertConfirmModalVisible(false);
        await loadOrders();
        setOrderToRevert(null);
        setSuccessMessage(
          '🔄 Zamówienie zostało przywrócone!\n\nStatus zamówienia został zmieniony na aktywny.'
          + (wasCancelled ? `\n\nNowy termin realizacji: ${revertDate.toLocaleDateString('pl-PL')}.` : '')
          + (data.depositRestored ? '\n\nZaliczka wróciła do rozliczeń, prowizje przeliczone.' : '')
        );
        setSuccessModalVisible(true);
      } else {
        appAlert('Błąd', data.message ? `Nie przywrócono zamówienia: ${data.message}` : serverErrorMessage(response, data, 'Nie udało się przywrócić zamówienia'));
      }
    } catch (error) {
      console.error('Error reverting order:', error);
      showActionError(error);
    } finally {
      setReverting(false);
    }
  };

  const renderOrderCard = (order) => {
    const urgency = getUrgencyStatus(order.realizationDate, order.status);
    const urgencyColor = getUrgencyColor(urgency);
    const isCompleted = order.status === 'zrealizowano';
    const isCancelled = order.status === 'anulowane';
    const statusColor = isCompleted ? '#22C55E' : isCancelled ? '#94A3B8' : '#F59E0B';

    return (
      <TouchableOpacity
        key={order._id}
        style={[styles.card, { borderLeftColor: statusColor }]}
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
            { backgroundColor: `${statusColor}26`, borderColor: `${statusColor}80` }
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
            <Ionicons name="person-outline" size={16} color={tc('muted', "#94A3B8")} />
            <Text style={styles.infoLabel}>Klient:</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {order.customer?.name}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={16} color={tc('muted', "#94A3B8")} />
            <Text style={styles.infoLabel}>Tel:</Text>
            <Text style={styles.infoValue}>{order.customer?.phone}</Text>
          </View>

          {/* Product */}
          <View style={styles.infoRow}>
            <Ionicons name="pricetag-outline" size={16} color={tc('muted', "#94A3B8")} />
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
            <Ionicons name="car-outline" size={16} color={tc('muted', "#94A3B8")} />
            <Text style={styles.infoLabel}>Dostawa:</Text>
            <Text style={styles.infoValue}>
              {getDeliveryOptionLabel(order.customer?.deliveryOption)}
            </Text>
          </View>

          {/* Price */}
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={16} color={tc('muted', "#94A3B8")} />
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
            {urgency.status !== 'closed' && (
              <View style={[styles.urgencyBadge, { backgroundColor: `${urgencyColor}26`, borderColor: `${urgencyColor}80` }]}>
                <Text style={[styles.urgencyText, { color: urgencyColor }]}>
                  {getUrgencyLabel(urgency)}
                </Text>
              </View>
            )}
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
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={styles.actionButtonText}>Zrealizuj</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.rescheduleButton]}
              onPress={(e) => {
                e.stopPropagation();
                openRescheduleModal(order);
              }}
              testID={`reschedule-${order._id}`}
            >
              <Ionicons name="calendar" size={16} color="#fff" />
              <Text style={styles.actionButtonText}>Termin</Text>
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
              <Ionicons name="arrow-undo" size={16} color="#fff" />
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
      <KeyboardSafeScreen>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Nagłówek podstrony */}
      <PageHeader
        title="Zamówienia"
        icon="cart-outline"
        onBack={() => router.back()}
      />

      {/* Stats and Search */}
      <View style={styles.topBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj zamówienia..."
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
            name={statusFilter !== 'all' ? 'funnel' : 'funnel-outline'} 
            size={20} 
            color={statusFilter !== 'all' ? '#0D6EFD' : tc('text', '#fff')} 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          Znaleziono: {filteredOrders.length} z {orders.length}
        </Text>
      </View>

      <ScrollView alwaysBounceVertical
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {filteredOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={64} color={tc('muted', "#64748B")} />
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
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="funnel-outline" title="Filtry" />

            <ScrollView style={styles.modalBody}>
              <View style={styles.filterGroup}>
                <Text style={look.formLabel}>Status:</Text>
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
      </Modal>

      {/* Details Modal */}
      <Modal
        visible={detailsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="document-text-outline" title="Szczegóły zamówienia" />

            <ScrollView style={styles.modalBody}>
              {selectedOrder && (
                <View>
                  {/* Order Info */}
                  <View style={styles.detailsSection}>
                    <View style={styles.detailsSectionHeader}>
                      <Ionicons name="clipboard-outline" size={18} color="#0D6EFD" />
                      <Text style={styles.detailsSectionTitle}>Informacje o zamówieniu</Text>
                    </View>
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
                    <View style={styles.detailsSectionHeader}>
                      <Ionicons name="pricetag-outline" size={18} color="#8B5CF6" />
                      <Text style={styles.detailsSectionTitle}>Produkt</Text>
                    </View>
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
                    <View style={styles.detailsSectionHeader}>
                      <Ionicons name="person-outline" size={18} color="#06B6D4" />
                      <Text style={styles.detailsSectionTitle}>Dane klienta</Text>
                    </View>
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
                    <View style={styles.detailsSectionHeader}>
                      <Ionicons name="car-outline" size={18} color="#F59E0B" />
                      <Text style={styles.detailsSectionTitle}>Dostawa</Text>
                    </View>
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
                    <View style={styles.detailsSectionHeader}>
                      <Ionicons name="cash-outline" size={18} color="#10B981" />
                      <Text style={styles.detailsSectionTitle}>Rozliczenie</Text>
                    </View>
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
                  style={[look.primaryButton, styles.modalButtonFull]}
                  onPress={() => {
                    setDetailsModalVisible(false);
                    revertOrder(selectedOrder);
                  }}
                >
                  <Ionicons name="arrow-undo" size={18} color="#fff" />
                  <Text style={look.buttonText}>Przywróć do aktywnych</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[look.neutralButton, styles.modalButtonFull]}
                onPress={() => setDetailsModalVisible(false)}
              >
                <Text style={look.neutralButtonText}>Zamknij</Text>
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
        <KeyboardSafeOverlay>
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="checkmark-circle-outline" color="#10B981" title="Realizacja zamówienia" />

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              {orderToComplete && (
                <View>
                  <View style={styles.completeOrderInfo}>
                    <Text style={styles.completeOrderTitle}>Szczegóły zamówienia:</Text>
                    <Text style={styles.completeOrderDetail}>
                      Zamówienie: <Text style={styles.completeOrderValue}>{orderToComplete.orderId}</Text>
                    </Text>
                    <Text style={styles.completeOrderDetail}>
                      Klient: <Text style={styles.completeOrderValue}>{orderToComplete.customer?.name}</Text>
                    </Text>
                    <Text style={styles.completeOrderDetail}>
                      Email: <Text style={styles.completeOrderValue}>{orderToComplete.customer?.email || 'brak (mail nie zostanie wysłany)'}</Text>
                    </Text>
                    <Text style={styles.completeOrderDetail}>
                      Telefon: <Text style={styles.completeOrderValue}>{orderToComplete.customer?.phone}</Text>
                    </Text>
                  </View>

                  <View style={styles.datePickerGroup}>
                    <Text style={look.formLabel}>Data planowanej wysyłki:</Text>
                    <TouchableOpacity
                      style={look.selectField}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Text style={look.selectFieldText}>
                        {shippingDate.toLocaleDateString('pl-PL')}
                      </Text>
                      <Ionicons name="calendar-outline" size={22} color={tc('muted', '#94A3B8')} />
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
                      Klient dostanie mail i SMS o wysyłce (przy odbiorze osobistym: „gotowe do odbioru”)
                    </Text>
                  </View>

                  {orderToComplete.customer?.deliveryOption !== 'pickup' && (
                    <View style={styles.datePickerGroup}>
                      <Text style={look.formLabel}>Numer przesyłki (opcjonalnie):</Text>
                      <TextInput
                        style={look.formInput}
                        value={trackingNumber}
                        onChangeText={setTrackingNumber}
                        placeholder="np. 6200123456789"
                        placeholderTextColor={tc('muted', '#64748B')}
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
                style={[look.primaryButton, styles.modalButtonFull, styles.completeButtonFull, (!shippingDate || completing) && look.disabled]}
                onPress={completeOrder}
                disabled={!shippingDate || completing}
              >
                {!completing && <Ionicons name="checkmark-circle" size={18} color="#fff" />}
                <Text style={look.buttonText}>{completing ? 'Realizuję…' : 'Potwierdź realizację'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[look.neutralButton, styles.modalButtonFull]}
                onPress={() => setCompleteModalVisible(false)}
              >
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardSafeOverlay>
      </Modal>

      {/* Zmiana terminu realizacji */}
      <Modal
        visible={!!rescheduleTarget}
        animationType="slide"
        transparent={true}
        onRequestClose={() => !rescheduling && setRescheduleTarget(null)}
      >
        <KeyboardSafeOverlay>
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="calendar-outline" color="#F59E0B" title="Zmień termin realizacji" />
            <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
              {rescheduleTarget && (
                <View>
                  <View style={styles.completeOrderInfo}>
                    <Text style={styles.completeOrderDetail}>
                      Zamówienie: <Text style={styles.completeOrderValue}>{rescheduleTarget.orderId}</Text>
                    </Text>
                    <Text style={styles.completeOrderDetail}>
                      Klient: <Text style={styles.completeOrderValue}>{rescheduleTarget.customer?.name}</Text>
                    </Text>
                    <Text style={styles.completeOrderDetail}>
                      Obecny termin: <Text style={styles.completeOrderValue}>{formatDate(rescheduleTarget.realizationDate)}</Text>
                    </Text>
                  </View>

                  <View style={styles.datePickerGroup}>
                    <Text style={look.formLabel}>Nowy termin realizacji:</Text>
                    <TouchableOpacity style={look.selectField} onPress={() => setShowRescheduleDatePicker(true)} testID="reschedule-date-button">
                      <Text style={look.selectFieldText}>{rescheduleDate.toLocaleDateString('pl-PL')}</Text>
                      <Ionicons name="calendar-outline" size={22} color={tc('muted', '#94A3B8')} />
                    </TouchableOpacity>
                    {showRescheduleDatePicker && (
                      <DateTimePicker
                        value={rescheduleDate}
                        minimumDate={new Date()}
                        mode="date"
                        display="default"
                        onChange={(event, date) => {
                          setShowRescheduleDatePicker(false);
                          if (date) setRescheduleDate(date);
                        }}
                      />
                    )}
                  </View>

                  <View style={styles.datePickerGroup}>
                    <Text style={look.formLabel}>Powód (opcjonalnie, trafia do wiadomości):</Text>
                    <TextInput
                      style={look.formInput}
                      value={rescheduleReason}
                      onChangeText={setRescheduleReason}
                      placeholder="np. przesunięta dostawa skór"
                      placeholderTextColor={tc('muted', '#64748B')}
                      maxLength={500}
                      testID="reschedule-reason-input"
                    />
                  </View>

                  <View style={styles.datePickerGroup}>
                    <Text style={look.formLabel}>Powiadomić klienta?</Text>
                    <View style={styles.filterOptions}>
                      {[
                        { value: 'none', label: 'Nie' },
                        { value: 'sms', label: 'SMS' },
                        { value: 'email', label: 'E-mail', disabled: !rescheduleTarget.customer?.email },
                      ].map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          style={[styles.filterOption, rescheduleChannel === option.value && styles.filterOptionActive, option.disabled && { opacity: 0.4 }]}
                          disabled={option.disabled}
                          onPress={() => setRescheduleChannel(option.value)}
                        >
                          <Text style={[styles.filterOptionText, rescheduleChannel === option.value && styles.filterOptionTextActive]}>{option.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {rescheduleChannel !== 'none' && (
                      <Text style={styles.datePickerHint}>
                        Treść: „{rescheduleMessage(rescheduleTarget, rescheduleDate, rescheduleReason)}”
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooterVertical}>
              <TouchableOpacity
                style={[look.primaryButton, styles.modalButtonFull, styles.completeButtonFull, rescheduling && look.disabled]}
                onPress={confirmReschedule}
                disabled={rescheduling}
              >
                {!rescheduling && <Ionicons name="calendar" size={18} color="#fff" />}
                <Text style={look.buttonText}>{rescheduling ? 'Zapisuję…' : (rescheduleChannel === 'none' ? 'Zmień termin' : 'Zmień termin i wyślij')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[look.neutralButton, styles.modalButtonFull]}
                onPress={() => setRescheduleTarget(null)}
                disabled={rescheduling}
              >
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardSafeOverlay>
      </Modal>

      {/* Revert Confirmation Modal */}
      <Modal
        visible={revertConfirmModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setRevertConfirmModalVisible(false)}
      >
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, styles.confirmModal]}>
            <ModalHeader icon="arrow-undo-outline" color="#F59E0B" title="Przywróć zamówienie" />
            
            {orderToRevert && (
              <>
                <Text style={styles.confirmText}>
                  Czy na pewno chcesz przywrócić zamówienie do statusu aktywnego?
                </Text>
                <View style={styles.confirmOrderBox}>
                  <Text style={styles.confirmOrderId}>{orderToRevert.orderId}</Text>
                  <View style={styles.confirmOrderRow}>
                    <Ionicons name="person-outline" size={15} color={tc('muted', '#94A3B8')} />
                    <Text style={styles.confirmOrderDetail}>{orderToRevert.customer?.name}</Text>
                  </View>
                  <View style={styles.confirmOrderRow}>
                    <Ionicons name="mail-outline" size={15} color={tc('muted', '#94A3B8')} />
                    <Text style={styles.confirmOrderDetail}>{orderToRevert.customer?.email}</Text>
                  </View>
                </View>
                {orderToRevert.status === 'anulowane' && (
                  <View style={{ width: '100%', marginBottom: 16 }}>
                    <Text style={look.formLabel}>Nowy termin realizacji (stary jest nieaktualny):</Text>
                    <TouchableOpacity style={look.selectField} onPress={() => setShowRevertDatePicker(true)} testID="revert-date-button">
                      <Text style={look.selectFieldText}>{revertDate.toLocaleDateString('pl-PL')}</Text>
                      <Ionicons name="calendar-outline" size={22} color={tc('muted', '#94A3B8')} />
                    </TouchableOpacity>
                    {showRevertDatePicker && (
                      <DateTimePicker
                        value={revertDate}
                        minimumDate={new Date()}
                        mode="date"
                        display="default"
                        onChange={(event, date) => {
                          setShowRevertDatePicker(false);
                          if (date) setRevertDate(date);
                        }}
                      />
                    )}
                    <Text style={styles.datePickerHint}>Zaliczka wróci do rozliczeń, prowizje zostaną przeliczone.</Text>
                  </View>
                )}
              </>
            )}

            <View style={look.buttonRow}>
              <TouchableOpacity
                style={look.neutralButton}
                onPress={() => {
                  setRevertConfirmModalVisible(false);
                  setOrderToRevert(null);
                }}
              >
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[look.primaryButton, reverting && look.disabled]}
                onPress={confirmRevertOrder}
                disabled={reverting}
              >
                <Text style={look.buttonText}>{reverting ? 'Przywracam…' : 'Przywróć'}</Text>
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
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, styles.confirmModal]}>
            <ModalHeader icon="checkmark-circle-outline" color="#10B981" title="Sukces!" />
            
            <View style={styles.successMessageBox}>
              <Text style={styles.successMessageText}>{successMessage}</Text>
            </View>

            <TouchableOpacity
              style={[look.primaryButton, styles.successCloseButton]}
              onPress={() => setSuccessModalVisible(false)}
            >
              <Text style={look.buttonText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </KeyboardSafeScreen>
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
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#1E293B'),
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
  },
  orderDate: {
    fontSize: 12,
    color: tc('muted', '#94A3B8'),
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
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
    color: tc('muted', '#94A3B8'),
  },
  infoValue: {
    fontSize: 14,
    color: tc('text', '#fff'),
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
    color: tc('text', '#fff'),
  },
  urgencyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
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
    borderTopColor: tc('border', '#1E293B'),
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  completeButton: {
    backgroundColor: '#22C55E',
  },
  revertButton: {
    backgroundColor: '#0D6EFD',
  },
  rescheduleButton: {
    backgroundColor: '#F59E0B',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
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
    borderBottomColor: tc('border', '#334155'),
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
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#334155'),
  },
  modalFooterVertical: {
    flexDirection: 'column',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonFull: {
    flex: 0,
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  resetButton: {
    backgroundColor: '#64748B',
  },
  applyButton: {
    backgroundColor: '#3B82F6',
  },
  completeButtonFull: {
    backgroundColor: '#10B981',
  },
  modalButtonText: {
    color: tc('text', '#fff'),
    fontSize: 14,
    fontWeight: '600',
  },
  detailsSection: {
    marginBottom: 12,
    padding: 14,
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
  },
  detailsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  detailsSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
  },
  detailsRow: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    marginBottom: 8,
  },
  detailsLabel: {
    fontWeight: '600',
    color: tc('muted', '#94A3B8'),
  },
  detailsValue: {
    color: tc('text', '#fff'),
  },
  completeOrderInfo: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  completeOrderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    marginBottom: 12,
  },
  completeOrderDetail: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    marginBottom: 8,
  },
  completeOrderValue: {
    fontWeight: 'bold',
    color: tc('text', '#fff'),
  },
  datePickerGroup: {
    marginBottom: 16,
  },
  datePickerLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    marginBottom: 12,
  },
  dateButton: {
    backgroundColor: tc('surface', '#1E293B'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateButtonText: {
    color: tc('text', '#fff'),
    fontSize: 16,
  },
  datePickerHint: {
    fontSize: 13,
    color: tc('muted', '#94A3B8'),
    marginTop: 8,
  },
  confirmModal: {
    maxWidth: 420,
  },
  confirmText: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmOrderBox: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  confirmOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confirmOrderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    marginBottom: 8,
  },
  confirmOrderDetail: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    marginBottom: 4,
  },
  successMessageBox: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  successMessageText: {
    fontSize: 15,
    color: tc('text', '#fff'),
    textAlign: 'center',
    lineHeight: 24,
  },
  successCloseButton: {
    width: '100%',
    flex: 0,
  },
}));

export default OrdersList;
