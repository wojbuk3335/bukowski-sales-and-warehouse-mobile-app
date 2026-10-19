import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  FlatList,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import tokenService from "../services/tokenService";
import { getApiUrl } from "../config/api";
import usePullToRefresh from '../hooks/usePullToRefresh'; // odświeżanie przeciągnięciem palca

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, ModalHeader, look } from "../components/AdminLook"; // wspólny wygląd (styl panelu admina)
import { KeyboardSafeOverlay } from "../components/KeyboardSafe"; // klawiatura nie zasłania pola
const FILTERS_KEY = "payrollFilters";

const Payroll = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets(); // Get safe area insets
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [workHours, setWorkHours] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [payments, setPayments] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [hasRestoredFilters, setHasRestoredFilters] = useState(false);

  const [showWorkHours, setShowWorkHours] = useState(true);
  const [showAdvances, setShowAdvances] = useState(true);
  const [showPayments, setShowPayments] = useState(true);
  const [showCommissions, setShowCommissions] = useState(true);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);

  const [selectedCommissionDetails, setSelectedCommissionDetails] = useState(null);

  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const months = useMemo(
    () => [
      { value: "1", label: "Styczeń" },
      { value: "2", label: "Luty" },
      { value: "3", label: "Marzec" },
      { value: "4", label: "Kwiecień" },
      { value: "5", label: "Maj" },
      { value: "6", label: "Czerwiec" },
      { value: "7", label: "Lipiec" },
      { value: "8", label: "Sierpień" },
      { value: "9", label: "Wrzesień" },
      { value: "10", label: "Październik" },
      { value: "11", label: "Listopad" },
      { value: "12", label: "Grudzień" },
    ],
    []
  );

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const span = 15;
    return Array.from({ length: span }, (_, i) => (current - 7 + i).toString());
  }, []);

  const showError = useCallback((message) => {
    setErrorMessage(message);
    setShowErrorModal(true);
  }, []);

  const showSuccess = useCallback((message) => {
    setSuccessMessage(message);
    setShowSuccessModal(true);
  }, []);

  const persistFilters = useCallback(async (filters) => {
    try {
      await AsyncStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch {
      // Storage failure should not block UI
    }
  }, []);

  const loadFilters = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(FILTERS_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed.selectedEmployee) setSelectedEmployee(parsed.selectedEmployee);
      if (parsed.selectedMonth) setSelectedMonth(parsed.selectedMonth);
      if (parsed.selectedYear) setSelectedYear(parsed.selectedYear.toString());
      setHasRestoredFilters(true);
    } catch {
      // Ignore invalid storage data
    }
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    persistFilters({ selectedEmployee, selectedMonth, selectedYear });
  }, [selectedEmployee, selectedMonth, selectedYear, persistFilters]);

  const fetchEmployees = useCallback(async () => {
    try {
      const url = getApiUrl("/employees");
      const response = await tokenService.authenticatedFetch(url);
      if (!response.ok) {
        showError("Błąd podczas ładowania pracowników");
        return;
      }
      const data = await response.json();
      setEmployees(data.employees || []);
    } catch (error) {
      showError(error?.message || "Błąd połączenia z serwerem");
    }
  }, [showError]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const buildDateRange = useCallback(() => {
    const year = parseInt(selectedYear, 10);
    const monthIndex = parseInt(selectedMonth, 10) - 1;
    const startDate = new Date(year, monthIndex, 1).toISOString();
    // Do KOŃCA ostatniego dnia (dawniej północ na jego początku - zaliczka z 31-go w dzień wypadała z rozliczenia)
    const endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).toISOString();
    return {
      startDate: encodeURIComponent(startDate),
      endDate: encodeURIComponent(endDate),
    };
  }, [selectedYear, selectedMonth]);

  const fetchFinancialOperations = useCallback(async () => {
    if (!selectedEmployee || !selectedMonth || !selectedYear) {
      return { advances: [], payments: [], commissions: [] };
    }

    try {
      const { startDate, endDate } = buildDateRange();
      const base = `/financial-operations?employeeId=${selectedEmployee}&startDate=${startDate}&endDate=${endDate}`;

      const [advancesResponse, paymentsResponse, commissionsResponse] = await Promise.all([
        tokenService.authenticatedFetch(getApiUrl(`${base}&type=employee_advance`)),
        tokenService.authenticatedFetch(getApiUrl(`${base}&type=salary_payment`)),
        tokenService.authenticatedFetch(getApiUrl(`${base}&type=sales_commission`)),
      ]);

      const advancesData = advancesResponse.ok ? await advancesResponse.json() : [];
      const paymentsData = paymentsResponse.ok ? await paymentsResponse.json() : [];
      const commissionsData = commissionsResponse.ok ? await commissionsResponse.json() : [];

      const allAdvances = Array.isArray(advancesData) ? advancesData : [];
      const allPayments = Array.isArray(paymentsData) ? paymentsData : [];
      const allCommissions = Array.isArray(commissionsData) ? commissionsData : [];

      setAdvances(allAdvances);
      setPayments(allPayments);
      setCommissions(allCommissions);

      return { advances: allAdvances, payments: allPayments, commissions: allCommissions };
    } catch (error) {
      showError(error?.message || "Błąd podczas pobierania wypłat");
      setAdvances([]);
      setPayments([]);
      setCommissions([]);
      return { advances: [], payments: [], commissions: [] };
    }
  }, [selectedEmployee, selectedMonth, selectedYear, buildDateRange, showError]);

  const calculateSummary = useCallback((hours, advancesData = [], paymentsData = [], commissionsData = []) => {
    const totalHours = hours.reduce((sum, record) => sum + (record.totalHours || 0), 0);
    const totalPay = hours.reduce((sum, record) => sum + (record.dailyPay || 0), 0);
    const totalAdvances = advancesData.reduce((sum, advance) => sum + Math.abs(advance.amount || 0), 0);
    const totalPayments = paymentsData.reduce((sum, payment) => sum + Math.abs(payment.amount || 0), 0);
    const totalCommissions = commissionsData.reduce((sum, commission) => sum + Math.abs(commission.amount || 0), 0);
    const finalPay = totalPay + totalCommissions - totalAdvances - totalPayments;
    const workDays = hours.length;

    setSummary({
      totalHours,
      totalPay,
      totalCommissions,
      totalAdvances,
      totalPayments,
      finalPay,
      workDays,
      averageHoursPerDay: workDays > 0 ? totalHours / workDays : 0,
    });
  }, []);

  const fetchWorkHours = useCallback(async () => {
    if (!selectedEmployee || !selectedMonth || !selectedYear) {
      showError("Wybierz pracownika, miesiąc i rok");
      return;
    }

    setLoading(true);
    try {
      const url = getApiUrl(
        `/work-hours?employeeId=${selectedEmployee}&month=${selectedMonth}&year=${selectedYear}`
      );
      const response = await tokenService.authenticatedFetch(url);
      const data = await response.json();

      if (!response.ok) {
        showError(data?.message || "Błąd podczas ładowania danych");
        setWorkHours([]);
        setSummary(null);
        return;
      }

      const hours = data.workHours || [];
      setWorkHours(hours);
      const financial = await fetchFinancialOperations();
      calculateSummary(hours, financial.advances, financial.payments, financial.commissions);
    } catch (error) {
      showError(error?.message || "Błąd połączenia z serwerem");
      setWorkHours([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [selectedEmployee, selectedMonth, selectedYear, fetchFinancialOperations, calculateSummary, showError]);

  useEffect(() => {
    if (employees.length > 0 && hasRestoredFilters && selectedEmployee && selectedMonth && selectedYear) {
      fetchWorkHours();
    }
  }, [employees.length, hasRestoredFilters, selectedEmployee, selectedMonth, selectedYear, fetchWorkHours]);

  // Przeciągnięcie w dół: lista pracowników + godziny/wypłaty dla AKTUALNIE wybranego pracownika, miesiąca i roku
  const refreshAll = useCallback(
    () =>
      Promise.all([
        fetchEmployees(),
        selectedEmployee && selectedMonth && selectedYear ? fetchWorkHours() : null,
      ]),
    [fetchEmployees, fetchWorkHours, selectedEmployee, selectedMonth, selectedYear]
  );
  const { refreshControl } = usePullToRefresh(refreshAll);

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("pl-PL");
  };

  const formatAmount = (amount) => {
    const value = Number(amount || 0);
    return `${value.toFixed(3)} zł`;
  };

  const getSelectedEmployeeName = () => {
    const employee = employees.find((emp) => emp._id === selectedEmployee);
    return employee ? `${employee.firstName} ${employee.lastName}` : "";
  };

  const selectedMonthLabel = useMemo(() => {
    return months.find((month) => month.value === selectedMonth)?.label || "";
  }, [months, selectedMonth]);

  const getCombinedFinancialData = useCallback(() => {
    const combined = [];

    if (showWorkHours) {
      workHours.forEach((record) => {
        combined.push({
          type: "work_hours",
          date: record.date,
          description: `${(record.totalHours || 0).toFixed(1)}h pracy w ${record.sellingPoint || "punkt nieznany"}`,
          amount: record.dailyPay || 0,
          details: {
            startTime: record.startTime,
            endTime: record.endTime,
            notes: record.notes,
          },
        });
      });
    }

    if (showAdvances) {
      advances.forEach((advance) => {
        combined.push({
          type: "advance",
          date: advance.date,
          description: "Zaliczka pracownika",
          amount: -Math.abs(advance.amount || 0),
          details: {
            reason: advance.reason,
            currency: advance.currency,
          },
        });
      });
    }

    if (showPayments) {
      payments.forEach((payment) => {
        combined.push({
          type: "payment",
          date: payment.date,
          description: "Wypłata pensji",
          amount: -Math.abs(payment.amount || 0),
          details: {
            reason: payment.reason,
            currency: payment.currency,
          },
        });
      });
    }

    if (showCommissions) {
      commissions.forEach((commission) => {
        combined.push({
          type: "commission",
          date: commission.date,
          description: "Prowizja od sprzedaży",
          amount: commission.amount || 0,
          details: {
            reason: commission.reason,
            currency: commission.currency,
            salesAmount: commission.salesAmount,
            commissionRate: commission.commissionRate,
            commissionDetails: commission.commissionDetails,
            employeeName: commission.employeeName,
          },
        });
      });
    }

    return combined.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [workHours, advances, payments, commissions, showWorkHours, showAdvances, showPayments, showCommissions]);

  const handlePaymentClick = () => {
    if (summary && summary.finalPay > 0) {
      setPaymentAmount(Number(summary.finalPay || 0).toFixed(3));
      setShowPaymentModal(true);
    }
  };

  const handlePaymentSubmit = async () => {
    const amountValue = parseFloat(paymentAmount);
    if (!amountValue || amountValue <= 0) {
      showError("Wprowadź prawidłową kwotę wypłaty");
      return;
    }

    setPaymentLoading(true);
    try {
      const employee = employees.find((emp) => emp._id === selectedEmployee);
      const monthLabel = months.find((month) => month.value === selectedMonth)?.label;

      const paymentData = {
        userSymbol: "ADMIN",
        amount: -Math.abs(amountValue),
        currency: "PLN",
        type: "salary_payment",
        reason: `Wypłata pensji dla ${employee?.firstName || ""} ${employee?.lastName || ""} za ${monthLabel} ${selectedYear}`.trim(),
        date: new Date().toISOString(),
        employeeId: selectedEmployee,
        employeeName: `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim(),
        employeeCode: employee?.employeeId,
      };

      const response = await tokenService.authenticatedFetch(getApiUrl("/financial-operations"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentData),
      });

      const data = await response.json();
      if (!response.ok) {
        showError(`Błąd podczas rejestrowania wypłaty: ${data?.error || data?.message || ""}`.trim());
        return;
      }

      showSuccess("Wypłata została zarejestrowana pomyślnie!");
      setShowPaymentModal(false);
      setPaymentAmount("");
      await fetchWorkHours();
    } catch (error) {
      showError(error?.message || "Błąd połączenia z serwerem");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleResetFilters = async () => {
    setSelectedEmployee("");
    setSelectedMonth("");
    setSelectedYear(new Date().getFullYear().toString());
    setWorkHours([]);
    setAdvances([]);
    setPayments([]);
    setCommissions([]);
    setSummary(null);
    setHasRestoredFilters(false);
    try {
      await AsyncStorage.removeItem(FILTERS_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const combinedData = useMemo(() => getCombinedFinancialData(), [getCombinedFinancialData]);

  return (
    <SafeAreaView style={styles.container}>
      <PageHeader title="Wypłaty" icon="wallet" color="#10B981" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(120, insets.bottom + 120) }]}
        refreshControl={refreshControl}
        alwaysBounceVertical
      >
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>System wypłat pracowników</Text>
          <Text style={styles.sectionSubtitle}>
            Filtry są automatycznie zapisywane i przywracane po odświeżeniu
          </Text>

          <View style={styles.filtersRow}>
            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>Pracownik</Text>
              <TouchableOpacity
                style={styles.selectField}
                onPress={() => setShowEmployeeModal(true)}
                activeOpacity={0.8}
              >
                <Text style={selectedEmployee ? styles.selectText : styles.selectPlaceholder}>
                  {selectedEmployee
                    ? `${getSelectedEmployeeName()} (${employees.find((emp) => emp._id === selectedEmployee)?.employeeId || ""})`
                    : "Wybierz pracownika"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={tc('muted', "#94A3B8")} />
              </TouchableOpacity>
            </View>

            <View style={styles.filterBlockRow}>
              <View style={styles.filterBlockSmall}>
                <Text style={styles.filterLabel}>Miesiąc</Text>
                <TouchableOpacity
                  style={styles.selectField}
                  onPress={() => setShowMonthModal(true)}
                  activeOpacity={0.8}
                >
                  <Text style={selectedMonth ? styles.selectText : styles.selectPlaceholder}>
                    {selectedMonthLabel || "Wybierz miesiąc"}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={tc('muted', "#94A3B8")} />
                </TouchableOpacity>
              </View>

              <View style={styles.filterBlockSmall}>
                <Text style={styles.filterLabel}>Rok</Text>
                <TouchableOpacity
                  style={styles.selectField}
                  onPress={() => setShowYearModal(true)}
                  activeOpacity={0.8}
                >
                  <Text style={selectedYear ? styles.selectText : styles.selectPlaceholder}>
                    {selectedYear || "Wybierz rok"}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={tc('muted', "#94A3B8")} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.primaryButton, (!selectedEmployee || !selectedMonth || !selectedYear || loading) && styles.buttonDisabled]}
                onPress={fetchWorkHours}
                disabled={!selectedEmployee || !selectedMonth || !selectedYear || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="search" size={16} color="#fff" />
                    <Text style={styles.primaryButtonText}>Pokaż wypłaty</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.resetButton} onPress={handleResetFilters}>
                <Ionicons name="close" size={22} color={tc('muted', "#94A3B8")} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {hasRestoredFilters && selectedEmployee && selectedMonth && selectedYear && (
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={18} color="#38BDF8" />
            <Text style={styles.infoText}>
              Przywrócono zapisane filtry. Dane zostały automatycznie załadowane.
            </Text>
          </View>
        )}

        {summary && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              Podsumowanie dla {getSelectedEmployeeName()} - {months.find((m) => m.value === selectedMonth)?.label} {selectedYear}
            </Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{summary.workDays}</Text>
                <Text style={styles.summaryLabel}>Dni pracy</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{summary.totalHours.toFixed(1)}h</Text>
                <Text style={styles.summaryLabel}>Łączne godziny</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{formatAmount(summary.totalPay)}</Text>
                <Text style={styles.summaryLabel}>Wypłata brutto</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, styles.summaryPositive]}>+{formatAmount(summary.totalCommissions)}</Text>
                <Text style={styles.summaryLabel}>Prowizje</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, styles.summaryNegative]}>-{formatAmount(summary.totalAdvances)}</Text>
                <Text style={styles.summaryLabel}>Zaliczki</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, styles.summaryWarning]}>-{formatAmount(summary.totalPayments)}</Text>
                <Text style={styles.summaryLabel}>Wypłacone</Text>
              </View>
              <View style={[styles.summaryCard, styles.summaryCardWide]}>
                <Text style={styles.summaryValue}>{formatAmount(summary.finalPay)}</Text>
                <Text style={styles.summaryLabelStrong}>Do wypłaty</Text>
              </View>
            </View>

            {summary.finalPay > 0 && (
              <TouchableOpacity style={styles.payButton} onPress={handlePaymentClick}>
                <Ionicons name="card" size={18} color="#fff" />
                <Text style={styles.payButtonText}>Rozlicz wypłatę</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {(workHours.length > 0 || advances.length > 0 || payments.length > 0 || commissions.length > 0) && (
          <View style={styles.sectionCard}>
            <View>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>Historia finansowa pracownika</Text>
                  <Text style={styles.sectionSubtitle}>Godziny pracy, zaliczki, wypłaty i prowizje</Text>
                </View>
              </View>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={styles.toggleAllButton}
                  onPress={() => {
                    const allOn = showWorkHours && showAdvances && showPayments && showCommissions;
                    setShowWorkHours(!allOn);
                    setShowAdvances(!allOn);
                    setShowPayments(!allOn);
                    setShowCommissions(!allOn);
                  }}
                >
                  <Text style={styles.toggleAllText}>
                    {showWorkHours && showAdvances && showPayments && showCommissions ? "Ukryj wszystko" : "Pokaż wszystko"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.filterChips}>
              <TouchableOpacity
                style={[styles.filterChip, showWorkHours && styles.filterChipActive]}
                onPress={() => setShowWorkHours((prev) => !prev)}
              >
                <Text style={[styles.filterChipText, showWorkHours && styles.filterChipTextActive]}>Godziny pracy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, showAdvances && styles.filterChipActive]}
                onPress={() => setShowAdvances((prev) => !prev)}
              >
                <Text style={[styles.filterChipText, showAdvances && styles.filterChipTextActive]}>Zaliczki</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, showPayments && styles.filterChipActive]}
                onPress={() => setShowPayments((prev) => !prev)}
              >
                <Text style={[styles.filterChipText, showPayments && styles.filterChipTextActive]}>Wypłaty</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, showCommissions && styles.filterChipActive]}
                onPress={() => setShowCommissions((prev) => !prev)}
              >
                <Text style={[styles.filterChipText, showCommissions && styles.filterChipTextActive]}>Prowizje</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={combinedData}
              keyExtractor={(item, index) => `${item.type}-${index}`}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={[styles.historyCard, styles[`stripe_${item.type}`]]}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyDate}>{formatDate(item.date)}</Text>
                    <View style={[styles.typeBadge, styles[`badge_${item.type}`]]}>
                      <Text style={styles.typeBadgeText}>
                        {item.type === "work_hours"
                          ? "Praca"
                          : item.type === "advance"
                          ? "Zaliczka"
                          : item.type === "commission"
                          ? "Prowizja"
                          : "Wypłata"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.historyDescription}>{item.description}</Text>
                  <View style={styles.historyAmountRow}>
                    <Text style={[styles.historyAmount, item.amount >= 0 ? styles.amountPositive : styles.amountNegative]}>
                      {item.amount >= 0 ? "+" : ""}
                      {formatAmount(item.amount)}
                    </Text>
                  </View>
                  {item.type === "work_hours" && (
                    <Text style={styles.historyDetails}>
                      {item.details.startTime && item.details.endTime
                        ? `${item.details.startTime} - ${item.details.endTime}`
                        : "-"}
                      {item.details.notes ? ` | ${item.details.notes}` : ""}
                    </Text>
                  )}
                  {(item.type === "advance" || item.type === "payment") && (
                    <Text style={styles.historyDetails}>{item.details.reason || "-"}</Text>
                  )}
                  {item.type === "commission" && (
                    <TouchableOpacity
                      style={styles.detailsButton}
                      onPress={() =>
                        setSelectedCommissionDetails({
                          details:
                            item.details.commissionDetails || [
                              {
                                productName: "Pojedyncza prowizja",
                                saleAmount: item.details.salesAmount || item.amount * 100,
                                commissionAmount: item.amount,
                                description: item.details.reason,
                              },
                            ],
                          totalAmount: item.amount,
                          totalSalesAmount: item.details.salesAmount,
                          commissionRate: item.details.commissionRate,
                          employeeName: item.details.employeeName || getSelectedEmployeeName(),
                        })
                      }
                    >
                      <Text style={styles.detailsButtonText}>Szczegóły</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />

            <View style={styles.summaryRow}>
              {advances.length > 0 && (
                <View style={styles.inlineSummary}> 
                  <Text style={styles.inlineSummaryText}>
                    Suma zaliczek: -{formatAmount(advances.reduce((sum, advance) => sum + Math.abs(advance.amount || 0), 0))}
                  </Text>
                </View>
              )}
              {payments.length > 0 && (
                <View style={styles.inlineSummary}> 
                  <Text style={styles.inlineSummaryText}>
                    Suma wypłat: -{formatAmount(payments.reduce((sum, payment) => sum + Math.abs(payment.amount || 0), 0))}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {!loading && workHours.length === 0 && selectedEmployee && selectedMonth && selectedYear && (
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={18} color="#38BDF8" />
            <Text style={styles.infoText}>
              Brak danych o godzinach pracy dla wybranego okresu
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Payment Modal */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <KeyboardSafeOverlay>
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="card" color="#10B981" title="Rozlicz wypłatę" />
            <View style={styles.modalBody}>
              <Text style={styles.modalText}>Pracownik: {getSelectedEmployeeName()}</Text>
              <Text style={styles.modalText}>
                Okres: {months.find((m) => m.value === selectedMonth)?.label} {selectedYear}
              </Text>
              <Text style={styles.modalText}>
                Kwota do wypłaty: <Text style={styles.summaryPositive}>{formatAmount(summary?.finalPay || 0)}</Text>
              </Text>

              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Kwota wypłacana</Text>
                <TextInput
                  style={look.formInput}
                  keyboardType="numeric"
                  value={paymentAmount}
                  onChangeText={setPaymentAmount}
                  placeholder="Wprowadź kwotę wypłaty"
                  placeholderTextColor={tc('muted', "#64748B")}
                />
                <Text style={styles.formHint}>Możesz wypłacić całą kwotę lub część.</Text>
              </View>
            </View>
            <View style={look.buttonRow}>
              <TouchableOpacity
                style={look.neutralButton}
                onPress={() => setShowPaymentModal(false)}
                disabled={paymentLoading}
              >
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[look.primaryButton, { backgroundColor: "#10B981" }, (!paymentAmount || paymentLoading) && look.disabled]}
                onPress={handlePaymentSubmit}
                disabled={!paymentAmount || paymentLoading}
              >
                {paymentLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={look.buttonText}>Zatwierdź wypłatę</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardSafeOverlay>
      </Modal>

      {/* Employee Modal */}
      <Modal
        visible={showEmployeeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmployeeModal(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="person" color="#0D6EFD" title="Wybierz pracownika" />
            <FlatList
              style={styles.optionList}
              data={employees}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.optionRow, selectedEmployee === item._id && styles.optionRowSelected]}
                  onPress={() => {
                    setSelectedEmployee(item._id);
                    setShowEmployeeModal(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{item.firstName} {item.lastName}</Text>
                    <Text style={styles.optionSubtitle}>ID: {item.employeeId}</Text>
                  </View>
                  {selectedEmployee === item._id && <Ionicons name="checkmark-circle" size={22} color="#0D6EFD" />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>Brak pracowników</Text>
              }
            />
            <View style={look.buttonRow}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setShowEmployeeModal(false)}>
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Month Modal */}
      <Modal
        visible={showMonthModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMonthModal(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="calendar" color="#0D6EFD" title="Wybierz miesiąc" />
            <FlatList
              style={styles.optionList}
              data={months}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.optionRow, selectedMonth === item.value && styles.optionRowSelected]}
                  onPress={() => {
                    setSelectedMonth(item.value);
                    setShowMonthModal(false);
                  }}
                >
                  <Text style={styles.optionTitle}>{item.label}</Text>
                  {selectedMonth === item.value && <Ionicons name="checkmark-circle" size={22} color="#0D6EFD" />}
                </TouchableOpacity>
              )}
            />
            <View style={look.buttonRow}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setShowMonthModal(false)}>
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Year Modal */}
      <Modal
        visible={showYearModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowYearModal(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="calendar-outline" color="#0D6EFD" title="Wybierz rok" />
            <FlatList
              style={styles.optionList}
              data={years}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.optionRow, selectedYear === item && styles.optionRowSelected]}
                  onPress={() => {
                    setSelectedYear(item);
                    setShowYearModal(false);
                  }}
                >
                  <Text style={styles.optionTitle}>{item}</Text>
                  {selectedYear === item && <Ionicons name="checkmark-circle" size={22} color="#0D6EFD" />}
                </TouchableOpacity>
              )}
            />
            <View style={look.buttonRow}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setShowYearModal(false)}>
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Commission Details Modal */}
      <Modal
        visible={selectedCommissionDetails !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedCommissionDetails(null)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="trending-up" color="#06B6D4" title="Szczegóły prowizji" />
            <ScrollView style={styles.modalScroll}>
              {selectedCommissionDetails && (
                <>
                  <Text style={styles.modalText}>Pracownik: {selectedCommissionDetails.employeeName}</Text>
                  <Text style={styles.modalText}>
                    Całkowita prowizja: <Text style={styles.summaryPositive}>{formatAmount(selectedCommissionDetails.totalAmount)}</Text>
                  </Text>
                  {selectedCommissionDetails.totalSalesAmount && (
                    <Text style={styles.modalText}>
                      Całkowity obrót: {formatAmount(selectedCommissionDetails.totalSalesAmount)}
                    </Text>
                  )}

                  <Text style={styles.modalSectionTitle}>Szczegółowy breakdown</Text>
                  {selectedCommissionDetails.details.map((detail, index) => (
                    <View key={index} style={styles.detailCard}>
                      <Text style={styles.detailTitle}>{detail.productName || "Nieznany produkt"}</Text>
                      <Text style={styles.detailLine}>Kwota sprzedaży: {formatAmount(detail.saleAmount || 0)}</Text>
                      <Text style={styles.detailLine}>Prowizja: {formatAmount(detail.commissionAmount || 0)}</Text>
                      {detail.description ? <Text style={styles.detailLine}>{detail.description}</Text> : null}
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
            <View style={look.buttonRow}>
              <TouchableOpacity
                style={look.neutralButton}
                onPress={() => setSelectedCommissionDetails(null)}
              >
                <Text style={look.neutralButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="checkmark-circle" color="#10B981" title="Sukces!" />
            <Text style={look.modalMessage}>{successMessage}</Text>
            <View style={look.buttonRow}>
              <TouchableOpacity
                style={[look.primaryButton, { backgroundColor: "#10B981" }]}
                onPress={() => setShowSuccessModal(false)}
              >
                <Text style={look.buttonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Error Modal */}
      <Modal
        visible={showErrorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowErrorModal(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="close-circle" color="#DC3545" title="Błąd" />
            <Text style={look.modalMessage}>{errorMessage}</Text>
            <View style={look.buttonRow}>
              <TouchableOpacity
                style={[look.primaryButton, { backgroundColor: "#DC3545" }]}
                onPress={() => setShowErrorModal(false)}
              >
                <Text style={look.buttonText}>OK</Text>
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
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionCard: {
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    padding: 16,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  toggleRow: {
    alignItems: "flex-start",
    marginBottom: 10,
  },
  sectionTitle: {
    color: tc('text', "#fff"),
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: tc('muted', "#94A3B8"),
    fontSize: 12,
  },
  filtersRow: {
    gap: 16,
    marginTop: 16,
  },
  filterBlock: {
    gap: 6,
  },
  filterBlockRow: {
    flexDirection: "row",
    gap: 12,
  },
  filterBlockSmall: {
    flex: 1,
    gap: 6,
  },
  filterLabel: {
    color: tc('muted', "#94A3B8"),
    fontSize: 13,
    fontWeight: "600",
  },
  selectField: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    backgroundColor: tc('surface2', "#1E1E2D"),
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: {
    color: tc('text', "#fff"),
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  selectPlaceholder: {
    color: tc('muted', "#64748B"),
    fontSize: 15,
    flex: 1,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0D6EFD",
    paddingVertical: 14,
    borderRadius: 12,
    flex: 1,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  resetButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tc('surface2', "#1E1E2D"),
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: tc('surface', "#161622"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderLeftWidth: 4,
    borderLeftColor: "#38BDF8",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    color: tc('text', "#E2E8F0"),
    fontSize: 13,
    flex: 1,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
  },
  summaryCard: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    padding: 12,
    flexBasis: "47%",
    flexGrow: 1,
  },
  summaryCardWide: {
    flexBasis: "100%",
    borderLeftWidth: 4,
    borderLeftColor: "#10B981",
  },
  summaryValue: {
    color: tc('text', "#fff"),
    fontSize: 16,
    fontWeight: "700",
  },
  summaryLabel: {
    color: tc('muted', "#94A3B8"),
    fontSize: 12,
    marginTop: 4,
  },
  summaryLabelStrong: {
    color: tc('text', "#E2E8F0"),
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },
  summaryPositive: {
    color: "#10B981",
  },
  summaryNegative: {
    color: "#EF4444",
  },
  summaryWarning: {
    color: "#F59E0B",
  },
  payButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10B981",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  payButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  toggleAllButton: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  toggleAllText: {
    color: tc('text', "#fff"),
    fontSize: 13,
    fontWeight: "600",
  },
  filterChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    backgroundColor: tc('surface2', "#1E1E2D"),
  },
  filterChipActive: {
    backgroundColor: "#0D6EFD26",
    borderColor: "#0D6EFD",
  },
  filterChipText: {
    color: tc('muted', "#94A3B8"),
    fontSize: 13,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: tc('text', "#fff"),
  },
  historyCard: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 10,
  },
  // kolorowy pasek z lewej wg typu operacji
  stripe_work_hours: {
    borderLeftColor: "#2563EB",
  },
  stripe_advance: {
    borderLeftColor: "#EF4444",
  },
  stripe_payment: {
    borderLeftColor: "#F59E0B",
  },
  stripe_commission: {
    borderLeftColor: "#06B6D4",
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  historyDate: {
    color: tc('muted', "#94A3B8"),
    fontSize: 12,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  typeBadgeText: {
    color: tc('text', "#fff"),
    fontSize: 11,
    fontWeight: "700",
  },
  badge_work_hours: {
    backgroundColor: "#2563EB26",
    borderColor: "#2563EB80",
  },
  badge_advance: {
    backgroundColor: "#EF444426",
    borderColor: "#EF444480",
  },
  badge_payment: {
    backgroundColor: "#F59E0B26",
    borderColor: "#F59E0B80",
  },
  badge_commission: {
    backgroundColor: "#06B6D426",
    borderColor: "#06B6D480",
  },
  historyDescription: {
    color: tc('text', "#fff"),
    fontSize: 14,
    marginBottom: 8,
  },
  historyAmountRow: {
    marginBottom: 6,
  },
  historyAmount: {
    fontWeight: "700",
    fontSize: 15,
  },
  amountPositive: {
    color: "#10B981",
  },
  amountNegative: {
    color: "#EF4444",
  },
  historyDetails: {
    color: tc('muted', "#94A3B8"),
    fontSize: 12,
  },
  detailsButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#0D6EFD",
    borderRadius: 12,
  },
  detailsButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  summaryRow: {
    gap: 8,
    marginTop: 8,
  },
  inlineSummary: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    padding: 10,
  },
  inlineSummaryText: {
    color: tc('text', "#E2E8F0"),
    fontSize: 13,
    fontWeight: "600",
  },
  modalBody: {
    marginBottom: 8,
  },
  modalScroll: {
    flexGrow: 0,
    marginBottom: 8,
  },
  optionList: {
    flexGrow: 0,
  },
  optionRow: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionRowSelected: {
    borderColor: "#0D6EFD",
    backgroundColor: "#0D6EFD1F",
  },
  optionTitle: {
    color: tc('text', "#fff"),
    fontSize: 15,
    fontWeight: "600",
  },
  optionSubtitle: {
    color: tc('muted', "#94A3B8"),
    fontSize: 12,
    marginTop: 4,
  },
  emptyText: {
    color: tc('muted', "#94A3B8"),
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 16,
  },
  modalText: {
    color: tc('text', "#E2E8F0"),
    fontSize: 14,
    marginBottom: 6,
  },
  modalSectionTitle: {
    color: tc('text', "#fff"),
    fontSize: 14,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 8,
  },
  formGroup: {
    marginTop: 12,
  },
  formHint: {
    color: tc('muted', "#64748B"),
    fontSize: 12,
    marginTop: 6,
  },
  detailCard: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderLeftWidth: 4,
    borderLeftColor: "#06B6D4",
    padding: 12,
    marginBottom: 10,
  },
  detailTitle: {
    color: tc('text', "#fff"),
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  detailLine: {
    color: tc('muted', "#94A3B8"),
    fontSize: 12,
    marginBottom: 4,
  },
}));

export default Payroll;
