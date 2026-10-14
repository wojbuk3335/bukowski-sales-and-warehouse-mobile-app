import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import DateTimePicker from '@react-native-community/datetimepicker';
import tokenService from "../services/tokenService";
import { getApiUrl } from "../config/api";
import usePullToRefresh from '../hooks/usePullToRefresh'; // odświeżanie przeciągnięciem palca

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, ModalHeader, look } from "../components/AdminLook"; // wspólny wygląd (styl panelu admina)
const SalesView = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const [sales, setSales] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchSales();
    }
  }, [selectedDate, selectedUser]);

  const fetchUsers = async () => {
    try {
      const url = getApiUrl("/user/");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        // Filter out admin, magazyn roles, Cudzich users, and LIMITED_ADMIN
        const filteredUsers = data.users.filter(
          user => 
            user.role !== 'admin' && 
            user.role !== 'magazyn' &&
            user.role !== 'LIMITED_ADMIN' &&
            !user.symbol?.toLowerCase().includes('cudzich')
        );
        setUsers(filteredUsers);
        
        // Auto-select first user if available
        if (filteredUsers.length > 0 && !selectedUser) {
          setSelectedUser(filteredUsers[0]);
        }
      }
    } catch (error) {
      // Error fetching users
    }
  };

  // silent - odświeżanie przeciągnięciem: lista zostaje widoczna zamiast kręciołka na cały ekran
  const fetchSales = async ({ silent = false } = {}) => {
    if (!selectedUser) return;

    if (!silent) setLoading(true);
    try {
      // Format date as YYYY-MM-DD
      const formattedDate = selectedDate.toISOString().split('T')[0];
      const url = getApiUrl(`/sales/filter-by-date-and-point?date=${formattedDate}&sellingPoint=${selectedUser.sellingPoint}`);
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        // Sort by timestamp from earliest to latest
        const sortedData = data.sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return timeA - timeB; // Ascending order (earliest first)
        });
        setSales(sortedData);
      } else {
        setSales([]);
      }
    } catch (error) {
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  // Przeciągnięcie listy w dół: punkty + sprzedaż dla AKTUALNIE wybranego punktu i dnia
  const { refreshControl } = usePullToRefresh(() =>
    Promise.all([fetchUsers(), fetchSales({ silent: true })])
  );

  const formatDate = (date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const calculateTotal = () => {
    let totalCash = 0;
    let totalCard = 0;

    sales.forEach(sale => {
      if (sale.cash && sale.cash.length > 0) {
        sale.cash.forEach(c => {
          if (c.currency === 'PLN') {
            totalCash += c.price || 0;
          }
        });
      }
      if (sale.card && sale.card.length > 0) {
        sale.card.forEach(c => {
          if (c.currency === 'PLN') {
            totalCard += c.price || 0;
          }
        });
      }
    });

    return { totalCash, totalCard, total: totalCash + totalCard };
  };

  const onDateChange = (event, date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
    }
  };

  const renderSaleItem = ({ item }) => {
    const cashAmount = item.cash?.find(c => c.currency === 'PLN')?.price || 0;
    const cardAmount = item.card?.find(c => c.currency === 'PLN')?.price || 0;
    const total = cashAmount + cardAmount;

    return (
      <TouchableOpacity
        // kolorowy pasek z lewej: zielony - gotówka, niebieski - tylko karta
        style={[styles.saleCard, { borderLeftColor: cashAmount === 0 && cardAmount > 0 ? "#0D6EFD" : "#10B981" }]}
        onPress={() => {
          setSelectedSale(item);
          setShowDetailsModal(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.saleHeader}>
          <View style={styles.saleMainInfo}>
            <Text style={styles.saleProduct}>{item.fullName}</Text>
            <Text style={styles.saleBarcode}>KOD: {item.barcode}</Text>
          </View>
          <Text style={styles.saleTime}>{formatTime(item.timestamp)}</Text>
        </View>

        <View style={styles.saleDetails}>
          <View style={styles.saleDetailRow}>
            <View style={styles.saleDetailItem}>
              <Ionicons name="resize" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.saleDetailText}>Rozmiar: {item.size}</Text>
            </View>
            <View style={styles.saleDetailItem}>
              <Ionicons name="location" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.saleDetailText}>{item.from}</Text>
            </View>
          </View>

          <View style={styles.salePriceContainer}>
            {cashAmount > 0 && (
              <View style={styles.paymentBadge}>
                <Ionicons name="cash" size={14} color="#10B981" />
                <Text style={styles.paymentText}>{cashAmount.toFixed(2)} zł</Text>
              </View>
            )}
            {cardAmount > 0 && (
              <View style={styles.paymentBadge}>
                <Ionicons name="card" size={14} color="#0D6EFD" />
                <Text style={styles.paymentText}>{cardAmount.toFixed(2)} zł</Text>
              </View>
            )}
            <Text style={styles.totalPrice}>{total.toFixed(2)} zł</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const totals = calculateTotal();

  return (
    <SafeAreaView style={styles.container}>
      {/* Nagłówek */}
      <PageHeader title="Podgląd sprzedaży" icon="receipt-outline" color="#10B981" onBack={() => router.back()} />

      {/* Filters */}
      <View style={styles.filtersContainer}>
        {/* Date Picker */}
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowDatePicker(true)}
        >
          <View style={[styles.filterIcon, { backgroundColor: "#0D6EFD26" }]}>
            <Ionicons name="calendar" size={18} color="#0D6EFD" />
          </View>
          <Text style={styles.filterButtonText}>{formatDate(selectedDate)}</Text>
          <Ionicons name="chevron-down" size={18} color={tc('muted', "#94A3B8")} />
        </TouchableOpacity>

        {/* User Picker */}
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowUserPicker(true)}
        >
          <View style={[styles.filterIcon, { backgroundColor: "#10B98126" }]}>
            <Ionicons name="person" size={18} color="#10B981" />
          </View>
          <Text style={styles.filterButtonText} numberOfLines={1}>
            {selectedUser ? selectedUser.symbol : "Wybierz użytkownika"}
          </Text>
          <Ionicons name="chevron-down" size={18} color={tc('muted', "#94A3B8")} />
        </TouchableOpacity>
      </View>

      {/* Summary */}
      {sales.length > 0 && (
        <View style={styles.summaryContainer}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Gotówka</Text>
              <Text style={styles.summaryCash}>{totals.totalCash.toFixed(2)} zł</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Karta</Text>
              <Text style={styles.summaryCard}>{totals.totalCard.toFixed(2)} zł</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Razem</Text>
              <Text style={styles.summaryTotal}>{totals.total.toFixed(2)} zł</Text>
            </View>
          </View>
          <View style={styles.summaryFooter}>
            <Ionicons name="receipt" size={16} color={tc('muted', "#64748B")} />
            <Text style={styles.summaryCount}>Liczba sprzedaży: {sales.length}</Text>
          </View>
        </View>
      )}

      {/* Sales List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D6EFD" />
        </View>
      ) : !selectedUser ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="person-outline" size={64} color={tc('muted', "#475569")} />
          <Text style={styles.emptyText}>Wybierz użytkownika</Text>
        </View>
      ) : sales.length === 0 ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.emptyContainer, { flexGrow: 1 }]} refreshControl={refreshControl} alwaysBounceVertical>
          <Ionicons name="receipt-outline" size={64} color={tc('muted', "#475569")} />
          <Text style={styles.emptyText}>Brak sprzedaży w tym dniu</Text>
        </ScrollView>
      ) : (
        <FlatList
          data={sales}
          renderItem={renderSaleItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(120, insets.bottom + 120) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          alwaysBounceVertical
        />
      )}

      {/* Date Picker Modal (Android/iOS) */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      {/* User Picker Modal */}
      <Modal
        visible={showUserPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUserPicker(false)}
      >
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, styles.pickerModalContent]}>
            <ModalHeader icon="person" color="#10B981" title="Wybierz użytkownika" />
            <FlatList
              style={styles.pickerList}
              data={users}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedUser?._id === item._id && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setSelectedUser(item);
                    setShowUserPicker(false);
                  }}
                >
                  <View style={styles.userPickerInfo}>
                    <Text style={[
                      styles.pickerItemText,
                      selectedUser?._id === item._id && styles.pickerItemTextSelected
                    ]}>
                      {item.symbol}
                    </Text>
                    <Text style={styles.userPickerDetail}>
                      {item.sellingPoint} • {item.location}
                    </Text>
                  </View>
                  <Ionicons
                    name={selectedUser?._id === item._id ? "checkmark-circle" : "ellipse-outline"}
                    size={22}
                    color={selectedUser?._id === item._id ? "#0D6EFD" : tc('muted', "#94A3B8")}
                  />
                </TouchableOpacity>
              )}
            />
            <View style={look.buttonRow}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setShowUserPicker(false)}>
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sale Details Modal */}
      <Modal
        visible={showDetailsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="receipt" color="#10B981" title="Szczegóły sprzedaży" />

            {selectedSale && (
              <ScrollView style={styles.detailsScrollView}>
                <View style={styles.detailsSection}>
                  <Text style={styles.detailsSectionTitle}>Produkt</Text>
                  <Text style={styles.detailsProductName}>{selectedSale.fullName}</Text>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>Kod kreskowy:</Text>
                    <Text style={styles.detailsValue}>{selectedSale.barcode}</Text>
                  </View>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>Rozmiar:</Text>
                    <Text style={styles.detailsValue}>{selectedSale.size}</Text>
                  </View>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>Symbol:</Text>
                    <Text style={styles.detailsValue}>{selectedSale.symbol}</Text>
                  </View>
                </View>

                <View style={styles.detailsSection}>
                  <Text style={styles.detailsSectionTitle}>Lokalizacja</Text>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>Punkt sprzedaży:</Text>
                    <Text style={styles.detailsValue}>{selectedSale.sellingPoint}</Text>
                  </View>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>Skąd:</Text>
                    <Text style={styles.detailsValue}>{selectedSale.from}</Text>
                  </View>
                </View>

                <View style={styles.detailsSection}>
                  <Text style={styles.detailsSectionTitle}>Czas i data</Text>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>Data:</Text>
                    <Text style={styles.detailsValue}>
                      {formatDate(new Date(selectedSale.date))}
                    </Text>
                  </View>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>Godzina:</Text>
                    <Text style={styles.detailsValue}>
                      {formatTime(selectedSale.timestamp)}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailsSection}>
                  <Text style={styles.detailsSectionTitle}>Płatność</Text>
                  {selectedSale.cash && selectedSale.cash.length > 0 && (
                    <View style={styles.paymentSection}>
                      <Text style={styles.paymentTypeTitle}>Gotówka:</Text>
                      {selectedSale.cash.map((payment, idx) => (
                        <View key={idx} style={styles.detailsRow}>
                          <Text style={styles.detailsLabel}>{payment.currency}:</Text>
                          <Text style={[styles.detailsValue, styles.priceGreen]}>
                            {payment.price.toFixed(2)} {payment.currency}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {selectedSale.card && selectedSale.card.length > 0 && (
                    <View style={styles.paymentSection}>
                      <Text style={styles.paymentTypeTitle}>Karta:</Text>
                      {selectedSale.card.map((payment, idx) => (
                        <View key={idx} style={styles.detailsRow}>
                          <Text style={styles.detailsLabel}>{payment.currency}:</Text>
                          <Text style={[styles.detailsValue, styles.priceBlue]}>
                            {payment.price.toFixed(2)} {payment.currency}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </ScrollView>
            )}

            <View style={look.buttonRow}>
              <TouchableOpacity
                style={look.neutralButton}
                onPress={() => setShowDetailsModal(false)}
              >
                <Text style={look.neutralButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc('bg', "#000000"),
  },
  filtersContainer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  filterButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#161622"),
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    gap: 8,
  },
  filterIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  filterButtonText: {
    flex: 1,
    fontSize: 14,
    color: tc('text', "#fff"),
    fontWeight: "500",
  },
  summaryContainer: {
    backgroundColor: tc('surface', "#161622"),
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    padding: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 12,
    color: tc('muted', "#94A3B8"),
    marginBottom: 4,
  },
  summaryCash: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#10B981",
  },
  summaryCard: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0D6EFD",
  },
  summaryTotal: {
    fontSize: 16,
    fontWeight: "bold",
    color: tc('text', "#fff"),
  },
  summaryDivider: {
    width: 1,
    backgroundColor: tc('border', "#1E293B"),
  },
  summaryFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tc('border', "#1E293B"),
    gap: 8,
  },
  summaryCount: {
    fontSize: 13,
    color: tc('muted', "#64748B"),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    color: tc('muted', "#64748B"),
    marginTop: 16,
    textAlign: "center",
  },
  listContainer: {
    padding: 20,
    paddingTop: 0,
  },
  saleCard: {
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderLeftWidth: 4,
  },
  saleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  saleMainInfo: {
    flex: 1,
  },
  saleProduct: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  saleBarcode: {
    fontSize: 12,
    color: tc('muted', "#64748B"),
  },
  saleTime: {
    fontSize: 14,
    color: tc('muted', "#94A3B8"),
    fontWeight: "500",
  },
  saleDetails: {
    gap: 12,
  },
  saleDetailRow: {
    flexDirection: "row",
    gap: 16,
  },
  saleDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  saleDetailText: {
    fontSize: 13,
    color: tc('muted', "#94A3B8"),
  },
  salePriceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tc('border', "#1E293B"),
  },
  paymentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: tc('surface2', "#1E293B"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  paymentText: {
    fontSize: 12,
    color: tc('text', "#fff"),
    fontWeight: "500",
  },
  totalPrice: {
    marginLeft: "auto",
    fontSize: 18,
    fontWeight: "bold",
    color: tc('text', "#fff"),
  },
  pickerModalContent: {
    maxHeight: "80%",
  },
  pickerList: {
    flexGrow: 0,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  pickerItemSelected: {
    borderColor: "#0D6EFD",
    backgroundColor: "#0D6EFD1F",
  },
  pickerItemText: {
    fontSize: 16,
    color: tc('text', "#fff"),
  },
  pickerItemTextSelected: {
    color: "#0D6EFD",
    fontWeight: "600",
  },
  userPickerInfo: {
    flex: 1,
  },
  userPickerDetail: {
    fontSize: 13,
    color: tc('muted', "#64748B"),
    marginTop: 2,
  },
  detailsScrollView: {
    flexGrow: 0,
  },
  detailsSection: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  detailsSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: tc('muted', "#94A3B8"),
    textTransform: "uppercase",
    marginBottom: 10,
  },
  detailsProductName: {
    fontSize: 18,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 12,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  detailsLabel: {
    fontSize: 14,
    color: tc('muted', "#94A3B8"),
  },
  detailsValue: {
    fontSize: 14,
    color: tc('text', "#fff"),
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 12,
  },
  paymentSection: {
    marginBottom: 8,
  },
  paymentTypeTitle: {
    fontSize: 14,
    color: tc('text', "#fff"),
    fontWeight: "600",
    marginBottom: 6,
  },
  priceGreen: {
    color: "#10B981",
  },
  priceBlue: {
    color: "#0D6EFD",
  },
}));

export default SalesView;
