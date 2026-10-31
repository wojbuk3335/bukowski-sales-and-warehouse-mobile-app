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
import { PageHeader, ModalHeader, OptionCard, look } from '../components/AdminLook'; // wspólny wygląd panelu admina
import { KeyboardSafeOverlay } from "../components/KeyboardSafe"; // klawiatura nie zasłania pól tekstowych
import { sanitizeAmountInput } from "../utils/amountInput"; // przecinek = kropka

// Statusy (30.10.2026): zwrot przed rozliczeniem - nie płacimy; po rozliczeniu - do odliczenia przy następnym
export const PAN_KAZEK_STATUS = {
  pending: { label: "Do rozliczenia", color: "#F97316" },
  paid: { label: "Rozliczone", color: "#10B981" },
  cancelled: { label: "Zwrot - nie płacimy", color: "#94A3B8" },
  deduct: { label: "Zwrot - do odliczenia", color: "#EF4444" },
  deducted: { label: "Zwrot - odliczone", color: "#64748B" },
};
const formatPln = (value) => `${(Number(value) || 0).toFixed(2)} zł`;
// Podgląd rozliczenia: stawka × wszystkie oczekujące − odliczenia
export const settlementTotal = (rate, toSettle) => {
  const r = Number(String(rate || "").replace(",", "."));
  if (!(r > 0) || !toSettle) return null;
  const gross = Math.round(r * toSettle.pendingCount * 100) / 100;
  return { gross, total: Math.round((gross - (Number(toSettle.deductAmount) || 0)) * 100) / 100 };
};
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

  const [ratePerItem, setRatePerItem] = useState(""); // stawka za kurtkę - decyduje admin
  const [toSettle, setToSettle] = useState(null); // wszystkie oczekujące + odliczenia (niezależnie od filtra)
  const [settlements, setSettlements] = useState([]); // historia rozliczeń (ostatnie z „Cofnij” przy pomyłce)
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
      setToSettle(data.toSettle || null);
      const history = await tokenService.authenticatedFetch(getApiUrl("/pan-kazek/settlements")).catch(() => null);
      if (history?.ok) setSettlements(((await history.json()).data || []).slice(0, 5));
    } catch (error) {
      appAlert("Błąd", "Nie udało się pobrać listy Pana Kazka");
    } finally {
      setLoading(false);
    }
  };

  // Cofnięcie ostatniego rozliczenia (pomyłka przy stawce) - tylko w dniu rozliczenia, warunki pilnuje serwer
  const handleUndo = (settlement) => {
    appAlert(
      "Cofnij rozliczenie",
      `${settlement.itemsCount} kurtek × ${formatPln(settlement.ratePerItem)} = ${formatPln(settlement.totalAmount)}\nKurtki wrócą do „Do rozliczenia”.`,
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Cofnij",
          style: "destructive",
          onPress: async () => {
            try {
              const response = await tokenService.authenticatedFetch(getApiUrl(`/pan-kazek/settlements/${settlement._id}/undo`), { method: "POST" });
              const data = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(data?.message || "Nie udało się cofnąć rozliczenia");
              appAlert("Cofnięto", data.message || "Rozliczenie cofnięte");
              await loadProducts();
            } catch (error) {
              appAlert("Błąd", error.message || "Nie udało się cofnąć rozliczenia");
            }
          },
        },
      ]
    );
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
              const data = await response.json().catch(() => ({}));
              throw new Error(data?.message || "Nie udało się usunąć produktu");
            }
            await loadProducts();
          } catch (error) {
            appAlert("Błąd", error.message || "Nie udało się usunąć produktu");
          }
        },
      },
    ]);
  };

  const preview = settlementTotal(ratePerItem, toSettle);
  const handlePayAll = async () => {
    if (!preview) {
      appAlert("Błąd", "Podaj stawkę za kurtkę większą od 0");
      return;
    }
    if (preview.total < 0) {
      appAlert("Błąd", "Odliczenia są większe niż wypłata - podnieś stawkę albo poczekaj na więcej kurtek");
      return;
    }
    if (processing) return;

    try {
      setProcessing(true);
      const response = await tokenService.authenticatedFetch(getApiUrl("/pan-kazek/pay-all"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratePerItem: Number(String(ratePerItem).replace(",", ".")) }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Błąd rozliczania");
      }

      setShowPayModal(false);
      setRatePerItem("");
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
    const status = PAN_KAZEK_STATUS[item.status] || PAN_KAZEK_STATUS.pending;
    const statusColor = status.color;
    const removable = ["pending", "cancelled"].includes(item.status); // rozliczonej kurtki nie usuwa się z listy
    return (
      <View key={item._id} style={[styles.card, { borderLeftColor: statusColor }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.fullName}</Text>
          <View style={[styles.badge, { backgroundColor: `${statusColor}26`, borderColor: `${statusColor}80` }]}>
            <Text style={[styles.badgeText, { color: statusColor }]} testID={`pan-kazek-status-${item.productId}`}>{status.label}</Text>
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

        {item.returnedAt ? (
          <View style={styles.row}>
            <Text style={styles.label}>Zwrot:</Text>
            <Text style={styles.value}>{item.returnReason || "Zwrot"} · {formatDate(item.returnedAt)}</Text>
          </View>
        ) : null}
        {item.paidAt ? (
          <View style={styles.row}>
            <Text style={styles.label}>Rozliczono:</Text>
            <Text style={styles.value}>{formatDate(item.paidAt)}{item.paidRate != null ? ` · ${formatPln(item.paidRate)}` : ""}</Text>
          </View>
        ) : null}

        {removable ? (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item.productId)}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color="#DC3545" />
            <Text style={styles.deleteText}>Usuń</Text>
          </TouchableOpacity>
        ) : null}
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
      {/* Nagłówek podstrony */}
      <PageHeader
        title="Pan Kazek"
        subtitle="System rozliczania produktów"
        icon="cash-outline"
        color="#10B981"
        onBack={() => router.back()}
      />

      <ScrollView alwaysBounceVertical
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={styles.statsGrid}>
          <View style={[styles.statsCard, { borderTopColor: "#0D6EFD" }]}>
            <Text style={styles.statsLabel}>Wszystkie</Text>
            <Text style={[styles.statsValue, { color: "#0D6EFD" }]}>{stats.allTimeStats.total}</Text>
          </View>
          <View style={[styles.statsCard, { borderTopColor: "#F97316" }]}>
            <Text style={styles.statsLabel}>Do rozliczenia</Text>
            <Text style={[styles.statsValue, { color: "#F97316" }]}>{stats.allTimeStats.pending}</Text>
          </View>
          <View style={[styles.statsCard, { borderTopColor: "#10B981" }]}>
            <Text style={styles.statsLabel}>Rozliczone</Text>
            <Text style={[styles.statsValue, { color: "#10B981" }]}>{stats.allTimeStats.paid}</Text>
          </View>
        </View>

        <View style={styles.filterCard}>
          <Text style={styles.sectionTitle}>Filtry</Text>
          <View style={styles.filterRow}>
            {[
              { id: "all", label: "Wszystkie" },
              ...Object.entries(PAN_KAZEK_STATUS).map(([id, meta]) => ({ id, label: meta.label })),
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
              <View style={{ flex: 1 }}>
                <Text style={styles.selectLabel}>Rok</Text>
                <Text style={styles.selectValue}>
                  {selectedYear === "all" ? "Wszystkie" : selectedYear}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={18} color={tc('muted', "#94A3B8")} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectBox, selectedYear === "all" && styles.selectBoxDisabled]}
              onPress={() => {
                if (selectedYear !== "all") {
                  setShowMonthModal(true);
                }
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.selectLabel}>Miesiąc</Text>
                <Text style={styles.selectValue}>
                  {selectedMonth === "all" ? "Wszystkie" : monthNames[Number(selectedMonth)]}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={18} color={tc('muted', "#94A3B8")} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Rozliczenie obejmuje WSZYSTKIE oczekujące (niezależnie od filtra) - tak też liczy przycisk */}
        {toSettle && toSettle.pendingCount > 0 && (
          <TouchableOpacity style={styles.payAllButton} onPress={() => setShowPayModal(true)} testID="pan-kazek-settle">
            <Ionicons name="cash-outline" size={20} color="#fff" />
            <Text style={styles.payAllText}>
              Rozlicz wszystkie oczekujące ({toSettle.pendingCount})
            </Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#10B981" />
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

        {/* Ostatnie rozliczenia: stawka, kurtki, odliczenia, kwota; „Cofnij” tylko przy ostatnim z dzisiaj */}
        {settlements.length > 0 && (
          <View style={styles.filterCard} testID="pan-kazek-settlements">
            <Text style={styles.sectionTitle}>Ostatnie rozliczenia</Text>
            {settlements.map((item) => (
              <View key={item._id} style={[styles.settlementRow, item.undoneAt && { opacity: 0.5 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.value}>
                    {`${formatDate(item.createdAt)} · ${item.itemsCount} × ${formatPln(item.ratePerItem)}${item.deductCount > 0 ? ` − ${formatPln(item.deductAmount)}` : ""}`}
                  </Text>
                  <Text style={styles.label}>
                    {item.undoneAt ? `Cofnięte ${formatDate(item.undoneAt)}` : `Wypłacono ${formatPln(item.totalAmount)} · ${item.paidBy}`}
                  </Text>
                </View>
                {item.canUndo && !item.undoneAt ? (
                  <TouchableOpacity style={styles.undoButton} onPress={() => handleUndo(item)} testID="pan-kazek-undo">
                    <Ionicons name="arrow-undo" size={16} color="#EF4444" />
                    <Text style={styles.undoText}>Cofnij</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showYearModal} transparent animationType="fade">
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="calendar-outline" color="#10B981" title="Wybierz rok" />
            <ScrollView style={{ maxHeight: 320 }}>
              <OptionCard
                color="#10B981"
                selected={selectedYear === "all"}
                label="Wszystkie lata"
                onPress={() => {
                  setSelectedYear("all");
                  setShowYearModal(false);
                }}
              />
              {years.map((year) => (
                <OptionCard
                  key={year}
                  color="#10B981"
                  selected={selectedYear === String(year)}
                  label={String(year)}
                  onPress={() => {
                    setSelectedYear(String(year));
                    setShowYearModal(false);
                  }}
                />
              ))}
            </ScrollView>
            <View style={look.buttonRow}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setShowYearModal(false)}>
                <Text style={look.neutralButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showMonthModal} transparent animationType="fade">
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="calendar-number-outline" color="#10B981" title="Wybierz miesiąc" />
            <ScrollView style={{ maxHeight: 320 }}>
              <OptionCard
                color="#10B981"
                selected={selectedMonth === "all"}
                label="Wszystkie miesiące"
                onPress={() => {
                  setSelectedMonth("all");
                  setShowMonthModal(false);
                }}
              />
              {monthsForYear.map((month) => (
                <OptionCard
                  key={`${month.year}-${month.month}`}
                  color="#10B981"
                  selected={selectedMonth === String(month.month)}
                  label={`${monthNames[month.month]} (${month.count})`}
                  onPress={() => {
                    setSelectedMonth(String(month.month));
                    setShowMonthModal(false);
                  }}
                />
              ))}
            </ScrollView>
            <View style={look.buttonRow}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setShowMonthModal(false)}>
                <Text style={look.neutralButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPayModal} transparent animationType="fade">
        {/* Klawiatura nie zasłania pól: tło okienka kurczy się nad klawiaturą */}
        <KeyboardSafeOverlay>
          <View style={look.modalOverlay}>
            <View style={look.modalContent}>
              <ModalHeader icon="cash-outline" color="#10B981" title="Rozlicz wszystkie" subtitle={`Do rozliczenia: ${toSettle?.pendingCount || 0} kurtek`} />
              {toSettle?.deductCount > 0 ? (
                <Text style={look.modalMessage}>Do odliczenia: {toSettle.deductCount} zwr. · −{formatPln(toSettle.deductAmount)}</Text>
              ) : null}

              <Text style={look.formLabel}>Stawka za kurtkę (zł)</Text>
              <TextInput
                testID="pan-kazek-rate"
                style={[look.formInput, styles.input]}
                placeholder="np. 15"
                placeholderTextColor={tc('muted', "#64748B")}
                value={ratePerItem}
                keyboardType="decimal-pad"
                onChangeText={(value) => setRatePerItem(sanitizeAmountInput(value))}
              />
              {preview ? (
                <Text style={[look.modalMessage, preview.total < 0 && { color: "#EF4444" }]} testID="pan-kazek-preview">
                  {`${toSettle.pendingCount} × ${formatPln(ratePerItem)} = ${formatPln(preview.gross)}${toSettle.deductAmount > 0 ? ` − ${formatPln(toSettle.deductAmount)}` : ""}\nDo wypłaty: ${formatPln(preview.total)}`}
                </Text>
              ) : null}

              <View style={look.buttonRow}>
                <TouchableOpacity style={look.neutralButton} onPress={() => setShowPayModal(false)}>
                  <Text style={look.neutralButtonText}>Anuluj</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[look.primaryButton, styles.payConfirmButton, processing && styles.payConfirmButtonDisabled]}
                  onPress={handlePayAll}
                  disabled={processing}
                  testID="pan-kazek-confirm"
                >
                  <Text style={look.buttonText}>
                    {processing ? "Rozliczam..." : "Potwierdź"}
                  </Text>
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
    backgroundColor: tc('surface', "#161622"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderTopWidth: 3,
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
    fontSize: 20,
    fontWeight: "700",
    color: tc('text', "#fff"),
    marginTop: 6,
  },
  filterCard: {
    backgroundColor: tc('surface', "#161622"),
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
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    backgroundColor: tc('surface2', "#1E1E2D"),
  },
  filterButtonActive: {
    borderColor: "#10B981",
    backgroundColor: "#10B981",
  },
  filterButtonText: {
    color: tc('text', "#fff"),
    fontSize: 13,
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
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    backgroundColor: tc('surface2', "#1E1E2D"),
  },
  selectBoxDisabled: {
    opacity: 0.6,
  },
  selectLabel: {
    fontSize: 12,
    color: tc('muted', "#94A3B8"),
  },
  selectValue: {
    color: tc('text', "#fff"),
    marginTop: 2,
    fontSize: 15,
    fontWeight: "600",
  },
  payAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#10B981",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
    justifyContent: "center",
  },
  settlementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: tc('border', "#1E293B"),
  },
  undoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.5)",
  },
  undoText: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "700",
  },
  payAllText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
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
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderLeftWidth: 4,
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
    borderWidth: 1,
  },
  badgePending: {
    backgroundColor: "#F97316",
  },
  badgePaid: {
    backgroundColor: "#16A34A",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: {
    color: tc('muted', "#94A3B8"),
    fontSize: 13,
  },
  value: {
    color: tc('text', "#fff"),
    fontSize: 13,
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 8,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DC354566",
    backgroundColor: "#DC354526",
  },
  deleteText: {
    color: "#DC3545",
    fontSize: 15,
    fontWeight: "700",
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
    marginBottom: 14,
  },
  payConfirmButton: {
    backgroundColor: "#10B981",
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
