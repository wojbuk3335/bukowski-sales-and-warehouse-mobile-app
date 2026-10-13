import React, { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, router } from "expo-router";
import tokenService from "../services/tokenService";
import { getApiUrl } from "../config/api";
import { appAlert } from '../services/appAlert';

import { tc, createThemedStyles, useAppTheme, statusBarStyle } from '../context/ThemeContext'; // kolory zależne od motywu
const monthNames = [
  "",
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

const PanKazek = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({
    allTimeStats: { total: 0, pending: 0, paid: 0 },
    filteredStats: { total: 0, pending: 0, paid: 0 },
  });
  const [availableMonths, setAvailableMonths] = useState([]);

  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("all");

  const [showYearModal, setShowYearModal] = useState(false);
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);

  const [paidBy, setPaidBy] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [processing, setProcessing] = useState(false);

  const years = useMemo(() => {
    const uniqueYears = [...new Set(availableMonths.map((m) => m.year))];
    return uniqueYears.sort((a, b) => b - a);
  }, [availableMonths]);

  const monthsForYear = useMemo(() => {
    if (selectedYear === "all") return [];
    return availableMonths.filter((m) => m.year === Number(selectedYear));
  }, [availableMonths, selectedYear]);

  useEffect(() => {
    if (selectedYear !== "all") {
      setSelectedMonth("all");
    }
  }, [selectedYear]);

  useEffect(() => {
    loadProducts();
    loadMonths();
  }, [statusFilter, selectedYear, selectedMonth]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (selectedYear !== "all" && selectedMonth !== "all") {
        params.append("year", selectedYear);
        params.append("month", selectedMonth);
      } else if (selectedYear !== "all") {
        params.append("year", selectedYear);
      }

      const url = getApiUrl(`/pan-kazek${params.toString() ? `?${params}` : ""}`);
      const response = await tokenService.authenticatedFetch(url);
      if (!response.ok) {
        throw new Error("Błąd pobierania danych");
      }

      const data = await response.json();
      setItems(data.data || []);
      setStats({
        allTimeStats: data.allTimeStats || { total: 0, pending: 0, paid: 0 },
        filteredStats: data.filteredStats || { total: 0, pending: 0, paid: 0 },
      });
    } catch (error) {
      appAlert("Błąd", "Nie udało się pobrać listy Pana Kazka");
    } finally {
      setLoading(false);
    }
  };

  const loadMonths = async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/pan-kazek/months"));
      if (!response.ok) return;
      const data = await response.json();
      setAvailableMonths(data.data || []);
    } catch (error) {
      // silent
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProducts();
    setRefreshing(false);
  };

  const handleDelete = (productId) => {
    appAlert("Usuń produkt", "Czy na pewno chcesz usunąć ten produkt?", [
      { text: "Anuluj", style: "cancel" },
      {
        text: "Usuń",
        style: "destructive",
        onPress: async () => {
          try {
            const response = await tokenService.authenticatedFetch(
              getApiUrl(`/pan-kazek/${productId}`),
              { method: "DELETE" }
            );
            if (!response.ok) {
              throw new Error("delete failed");
            }
            await loadProducts();
          } catch (error) {
            appAlert("Błąd", "Nie udało się usunąć produktu");
          }
        },
      },
    ]);
  };

  const handlePayAll = async () => {
    if (!paidBy.trim()) {
      appAlert("Błąd", "Podaj kto rozlicza");
      return;
    }
    const amount = parseFloat(paidAmount);
    if (!amount || amount <= 0) {
      appAlert("Błąd", "Podaj poprawną kwotę");
      return;
    }

    try {
      setProcessing(true);
      const response = await tokenService.authenticatedFetch(getApiUrl("/pan-kazek/pay-all"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidBy: paidBy.trim(), paidAmount: amount }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Błąd rozliczania");
      }

      setShowPayModal(false);
      setPaidBy("");
      setPaidAmount("");
      appAlert("Sukces", data.message || "Rozliczono");
      await loadProducts();
    } catch (error) {
      appAlert("Błąd", error.message || "Nie udało się rozliczyć");
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("pl-PL");
  };

  const formatPrice = (value) => {
    if (value === null || value === undefined) return "0 PLN";
    const numberValue = Number(value);
    if (Number.isNaN(numberValue)) return `${String(value).replace("PLN", "").trim()} PLN`;
    return `${numberValue.toFixed(2)} PLN`;
  };

  const renderItem = (item) => {
    const isPaid = item.status === "paid";
    return (
      <View key={item._id} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.fullName}</Text>
          <View style={[styles.badge, isPaid ? styles.badgePaid : styles.badgePending]}>
            <Text style={styles.badgeText}>{isPaid ? "Rozliczone" : "Do rozliczenia"}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Rozmiar:</Text>
          <Text style={styles.value}>{item.size || "-"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Cena:</Text>
          <Text style={styles.value}>{formatPrice(item.price)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Kod:</Text>
          <Text style={styles.value}>{item.barcode || "-"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Dodano:</Text>
          <Text style={styles.value}>{formatDate(item.createdAt || item.date)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Dodane przez:</Text>
          <Text style={styles.value}>{item.addedBy || item.symbol || "-"}</Text>
        </View>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item.productId)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={18} color="#FCA5A5" />
          <Text style={styles.deleteText}>Usuń</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: tc('bg', "#000000"),
        paddingBottom: Math.max(20, insets.bottom + 20),
      }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar backgroundColor={tc('bg', "black")} style={statusBarStyle()} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={tc('text', "#fff")} />
        </TouchableOpacity>
        <View style={styles.headerIcon}>
          <Ionicons name="cash-outline" size={28} color="#fff" />
        </View>
        <Text style={styles.title}>Pan Kazek</Text>
        <Text style={styles.subtitle}>System rozliczania produktów</Text>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={styles.statsGrid}>
          <View style={styles.statsCard}>
            <Text style={styles.statsLabel}>Wszystkie</Text>
            <Text style={styles.statsValue}>{stats.allTimeStats.total}</Text>
          </View>
          <View style={styles.statsCard}>
            <Text style={styles.statsLabel}>Do rozliczenia</Text>
            <Text style={styles.statsValue}>{stats.allTimeStats.pending}</Text>
          </View>
          <View style={styles.statsCard}>
            <Text style={styles.statsLabel}>Rozliczone</Text>
            <Text style={styles.statsValue}>{stats.allTimeStats.paid}</Text>
          </View>
        </View>

        <View style={styles.filterCard}>
          <Text style={styles.sectionTitle}>Filtry</Text>
          <View style={styles.filterRow}>
            {[
              { id: "all", label: "Wszystkie" },
              { id: "pending", label: "Do rozliczenia" },
              { id: "paid", label: "Rozliczone" },
            ].map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.filterButton,
                  statusFilter === option.id && styles.filterButtonActive,
                ]}
                onPress={() => setStatusFilter(option.id)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    statusFilter === option.id && styles.filterButtonTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.selectRow}>
            <TouchableOpacity
              style={styles.selectBox}
              onPress={() => setShowYearModal(true)}
            >
              <Text style={styles.selectLabel}>Rok</Text>
              <Text style={styles.selectValue}>
                {selectedYear === "all" ? "Wszystkie" : selectedYear}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectBox, selectedYear === "all" && styles.selectBoxDisabled]}
              onPress={() => {
                if (selectedYear !== "all") {
                  setShowMonthModal(true);
                }
              }}
            >
              <Text style={styles.selectLabel}>Miesiąc</Text>
              <Text style={styles.selectValue}>
                {selectedMonth === "all" ? "Wszystkie" : monthNames[Number(selectedMonth)]}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {stats.filteredStats.pending > 0 && (
          <TouchableOpacity style={styles.payAllButton} onPress={() => setShowPayModal(true)}>
            <Ionicons name="cash-outline" size={20} color="#fff" />
            <Text style={styles.payAllText}>
              Rozlicz wszystkie ({stats.filteredStats.pending})
            </Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#22C55E" />
            <Text style={styles.loadingText}>Ładowanie danych...</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="information-circle-outline" size={32} color={tc('muted', "#64748B")} />
            <Text style={styles.emptyText}>Brak pozycji do wyświetlenia</Text>
          </View>
        ) : (
          items.map(renderItem)
        )}
      </ScrollView>

      <Modal visible={showYearModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Wybierz rok</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  setSelectedYear("all");
                  setShowYearModal(false);
                }}
              >
                <Text style={styles.modalOptionText}>Wszystkie lata</Text>
              </TouchableOpacity>
              {years.map((year) => (
                <TouchableOpacity
                  key={year}
                  style={styles.modalOption}
                  onPress={() => {
                    setSelectedYear(String(year));
                    setShowYearModal(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{year}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowYearModal(false)}>
              <Text style={styles.modalCloseText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showMonthModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Wybierz miesiąc</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  setSelectedMonth("all");
                  setShowMonthModal(false);
                }}
              >
                <Text style={styles.modalOptionText}>Wszystkie miesiące</Text>
              </TouchableOpacity>
              {monthsForYear.map((month) => (
                <TouchableOpacity
                  key={`${month.year}-${month.month}`}
                  style={styles.modalOption}
                  onPress={() => {
                    setSelectedMonth(String(month.month));
                    setShowMonthModal(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>
                    {monthNames[month.month]} ({month.count})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowMonthModal(false)}>
              <Text style={styles.modalCloseText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showPayModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rozlicz wszystkie</Text>
            <Text style={styles.modalHint}>Podaj dane rozliczenia</Text>

            <TextInput
              style={styles.input}
              placeholder="Kto rozlicza"
              placeholderTextColor={tc('muted', "#64748B")}
              value={paidBy}
              onChangeText={setPaidBy}
            />
            <TextInput
              style={styles.input}
              placeholder="Kwota (PLN)"
              placeholderTextColor={tc('muted', "#64748B")}
              value={paidAmount}
              keyboardType="numeric"
              onChangeText={setPaidAmount}
            />

            <TouchableOpacity
              style={[styles.payConfirmButton, processing && styles.payConfirmButtonDisabled]}
              onPress={handlePayAll}
              disabled={processing}
            >
              <Text style={styles.payConfirmText}>
                {processing ? "Rozliczam..." : "Potwierdź"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalClose} onPress={() => setShowPayModal(false)}>
              <Text style={styles.modalCloseText}>Anuluj</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  header: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: tc('bg', "#000000"),
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  backButton: {
    position: "absolute",
    left: 20,
    top: 24,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: tc('text', "#fff"),
  },
  subtitle: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  statsCard: {
    flex: 1,
    backgroundColor: tc('surface', "#000000"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginHorizontal: 4,
    alignItems: "center",
  },
  statsLabel: {
    fontSize: 12,
    color: tc('muted', "#94A3B8"),
  },
  statsValue: {
    fontSize: 18,
    fontWeight: "700",
    color: tc('text', "#fff"),
    marginTop: 6,
  },
  filterCard: {
    backgroundColor: tc('surface', "#000000"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    backgroundColor: tc('surface', "#0B1220"),
  },
  filterButtonActive: {
    borderColor: "#16A34A",
    backgroundColor: "#16A34A",
  },
  filterButtonText: {
    color: "#CBD5F5",
    fontSize: 12,
    fontWeight: "600",
  },
  filterButtonTextActive: {
    color: "#fff",
  },
  selectRow: {
    flexDirection: "row",
    gap: 10,
  },
  selectBox: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    backgroundColor: tc('surface', "#0B1220"),
  },
  selectBoxDisabled: {
    opacity: 0.6,
  },
  selectLabel: {
    fontSize: 11,
    color: "#94A3B8",
  },
  selectValue: {
    color: tc('text', "#fff"),
    marginTop: 4,
    fontSize: 14,
  },
  payAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#16A34A",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    justifyContent: "center",
  },
  payAllText: {
    color: "#fff",
    fontWeight: "600",
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 24,
  },
  loadingText: {
    color: tc('muted', "#94A3B8"),
    marginTop: 12,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  emptyText: {
    color: tc('muted', "#94A3B8"),
    marginTop: 12,
  },
  card: {
    backgroundColor: tc('surface', "#000000"),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: {
    flex: 1,
    color: tc('text', "#fff"),
    fontSize: 15,
    fontWeight: "600",
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgePending: {
    backgroundColor: "#F97316",
  },
  badgePaid: {
    backgroundColor: "#16A34A",
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: {
    color: "#94A3B8",
    fontSize: 12,
  },
  value: {
    color: tc('text', "#fff"),
    fontSize: 12,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
  },
  deleteText: {
    color: "#FCA5A5",
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: tc('surface', "#000000"),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    padding: 20,
  },
  modalTitle: {
    color: tc('text', "#fff"),
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  modalHint: {
    color: tc('muted', "#94A3B8"),
    textAlign: "center",
    marginBottom: 16,
  },
  modalOption: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  modalOptionText: {
    color: tc('text', "#fff"),
    textAlign: "center",
  },
  modalClose: {
    marginTop: 16,
    alignItems: "center",
  },
  modalCloseText: {
    color: tc('muted', "#94A3B8"),
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderRadius: 12,
    padding: 12,
    color: "#fff",
    marginBottom: 12,
    backgroundColor: tc('surface', "#0B1220"),
  },
  payConfirmButton: {
    backgroundColor: "#16A34A",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  payConfirmButtonDisabled: {
    opacity: 0.7,
  },
  payConfirmText: {
    color: "#fff",
    fontWeight: "600",
  },
}));

export default PanKazek;
