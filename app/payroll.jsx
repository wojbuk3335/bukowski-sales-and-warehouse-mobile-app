import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { WebView } from "react-native-webview";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import tokenService from "../services/tokenService";
import { getApiUrl } from "../config/api";
import usePullToRefresh from "../hooks/usePullToRefresh"; // odświeżanie przeciągnięciem palca
import useLiveRefresh from "../services/useLiveRefresh"; // prowizje, zaliczki, wypłaty i godziny pracy na żywo
import buildPayrollSheetHtml from "../utils/payrollSheetHtml"; // wydruk miesięczny (ten sam szablon co w panelu)

import { tc, createThemedStyles, useAppTheme } from "../context/ThemeContext"; // kolory zależne od motywu
import { PageHeader, ModalHeader, IconButton, MessageModal, look } from "../components/AdminLook"; // wspólny wygląd admina
import { KeyboardSafeOverlay } from "../components/KeyboardSafe"; // klawiatura nie zasłania pola

// Ekran Wypłaty (admin) - 3.11.2026 przepisany na wygląd reszty ekranów admina, z pełnym zestawem funkcji panelu:
// dane ładują się same po wyborze pracownika i miesiąca (bez „Pokaż wypłaty”), odświeżają na żywo, rachunek
// miesiąca jak pasek wypłaty, rozliczenie z zaokrągleniem (dopłata), cofnięcie, wydruk miesięczny (podgląd).

const FILTERS_KEY = "payrollFilters";
const GREEN = "#10B981";
const RED = "#EF4444";
const AMBER = "#F59E0B";
const BLUE = "#2563EB";
const CYAN = "#06B6D4";

const MONTHS = [
  { value: "1", label: "Styczeń" }, { value: "2", label: "Luty" }, { value: "3", label: "Marzec" },
  { value: "4", label: "Kwiecień" }, { value: "5", label: "Maj" }, { value: "6", label: "Czerwiec" },
  { value: "7", label: "Lipiec" }, { value: "8", label: "Sierpień" }, { value: "9", label: "Wrzesień" },
  { value: "10", label: "Październik" }, { value: "11", label: "Listopad" }, { value: "12", label: "Grudzień" },
];
const TYPE_META = {
  work_hours: { label: "Praca", color: BLUE, icon: "time" },
  commission: { label: "Prowizja", color: CYAN, icon: "trending-up" },
  advance: { label: "Zaliczka", color: RED, icon: "cash" },
  payment: { label: "Wypłata", color: AMBER, icon: "card" },
};

// Kwoty po polsku bez Intl (Hermes na starszych buildach nie ma pl-PL): 1 234,50 zł
const zl = (value) => {
  const number = Number(value || 0);
  const [int, dec] = Math.abs(number).toFixed(2).split(".");
  return `${number < 0 ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${dec} zł`;
};
const pad2 = (n) => String(n).padStart(2, "0");
const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const hoursText = (value) => String(Math.round(Number(value || 0) * 10) / 10).replace(".", ",");

// Zaliczka pracownika w PLN: w PLN - kwota; w walucie - wartość po kursie dnia zapisana przez serwer (plnAmount);
// bez kursu - null (nie odejmujemy po cichu 100 EUR jak 100 zł). Patrz backend services/dailyRates.js.
const advanceCurrency = (advance) => String(advance?.currency || "PLN").toUpperCase();
const advancePln = (advance) => {
  if (advanceCurrency(advance) === "PLN") return Math.abs(Number(advance.amount) || 0);
  return typeof advance.plnAmount === "number" ? advance.plnAmount : null;
};

const Payroll = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();

  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [workHours, setWorkHours] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [payments, setPayments] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false); // dane dla bieżących filtrów są wczytane
  const [summary, setSummary] = useState(null);
  const requestCounter = useRef(0); // numer ostatniego zapytania - odpowiedź starszego (po zmianie filtra) jest pomijana

  const [visibleTypes, setVisibleTypes] = useState({ work_hours: true, commission: true, advance: true, payment: true });

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [undoPayment, setUndoPayment] = useState(null); // wypłata do cofnięcia (okienko potwierdzenia)
  const [undoLoading, setUndoLoading] = useState(false);

  const [picker, setPicker] = useState(null); // 'employee' | 'month' | 'year'
  const [commissionDetails, setCommissionDetails] = useState(null);
  const [sheetHtml, setSheetHtml] = useState(null); // podgląd wydruku
  const [sheetLoading, setSheetLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type, title, text }

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => String(current - 3 + i)); // 3 lata wstecz, rok w przód (jak panel)
  }, []);

  const showError = useCallback((text) => setMessage({ type: "error", text }), []);
  const showSuccess = useCallback((text) => setMessage({ type: "success", text }), []);

  // ---------- filtry (zapamiętywane) ----------
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(FILTERS_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (parsed.selectedEmployee) setSelectedEmployee(parsed.selectedEmployee);
        if (parsed.selectedMonth) setSelectedMonth(String(parsed.selectedMonth));
        if (parsed.selectedYear) setSelectedYear(String(parsed.selectedYear));
      } catch {
        // zapis filtrów nie jest krytyczny
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(FILTERS_KEY, JSON.stringify({ selectedEmployee, selectedMonth, selectedYear })).catch(() => {});
  }, [selectedEmployee, selectedMonth, selectedYear]);

  // ---------- dane ----------
  const fetchEmployees = useCallback(async () => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/employees"));
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
    // do KOŃCA ostatniego dnia (wypłata pensji ma datę 23:59:59 ostatniego dnia miesiąca)
    const endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).toISOString();
    return { startDate: encodeURIComponent(startDate), endDate: encodeURIComponent(endDate) };
  }, [selectedYear, selectedMonth]);

  const fetchFinancialOperations = useCallback(async () => {
    const { startDate, endDate } = buildDateRange();
    const base = `/financial-operations?employeeId=${selectedEmployee}&startDate=${startDate}&endDate=${endDate}`;
    const [advancesResponse, paymentsResponse, commissionsResponse] = await Promise.all([
      tokenService.authenticatedFetch(getApiUrl(`${base}&type=employee_advance`)),
      tokenService.authenticatedFetch(getApiUrl(`${base}&type=salary_payment`)),
      tokenService.authenticatedFetch(getApiUrl(`${base}&type=sales_commission`)),
    ]);
    const asList = async (response) => {
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    };
    return { advances: await asList(advancesResponse), payments: await asList(paymentsResponse), commissions: await asList(commissionsResponse) };
  }, [selectedEmployee, buildDateRange]);

  const calculateSummary = useCallback((hours, advancesData, paymentsData, commissionsData) => {
    const totalHours = hours.reduce((sum, record) => sum + (record.totalHours || 0), 0);
    const totalPay = hours.reduce((sum, record) => sum + (record.dailyPay || 0), 0);
    const totalAdvances = advancesData.reduce((sum, advance) => sum + (advancePln(advance) ?? 0), 0);
    const unconvertedAdvances = advancesData.filter((advance) => advancePln(advance) === null).length; // waluta bez kursu
    const totalPayments = paymentsData.reduce((sum, payment) => sum + Math.abs(payment.amount || 0), 0);
    const totalCommissions = commissionsData.reduce((sum, commission) => sum + Math.abs(commission.amount || 0), 0);
    // Dopłaty (zaokrąglenie wypłaty w górę) liczą się jak zarobek - po wypłacie miesiąc wychodzi na 0, nie na „nadpłatę”
    const totalBonus = paymentsData.reduce((sum, payment) => sum + Math.max(0, Number(payment.bonusAmount) || 0), 0);
    const earned = totalPay + totalCommissions + totalBonus - totalAdvances;
    const finalPay = earned - totalPayments;
    setSummary({
      totalHours, totalPay, totalCommissions, totalBonus, totalAdvances, unconvertedAdvances, totalPayments, earned, finalPay,
      workDays: hours.length,
    });
  }, []);

  // silent: odświeżenie na żywo bez kółka ładowania i bez komunikatów
  const fetchWorkHours = useCallback(async ({ silent = false } = {}) => {
    if (!selectedEmployee || !selectedMonth || !selectedYear) return;
    const requestId = ++requestCounter.current;
    if (!silent) setLoading(true);
    try {
      // limit: domyślne 50 ucinało najstarsze dni przy dwóch stoiskach dziennie
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/work-hours?employeeId=${selectedEmployee}&month=${selectedMonth}&year=${selectedYear}&limit=500`)
      );
      const data = await response.json();
      if (!response.ok) {
        if (requestId !== requestCounter.current) return;
        if (!silent) showError(data?.message || "Błąd podczas ładowania danych");
        return;
      }
      const hours = data.workHours || [];
      const financial = await fetchFinancialOperations();
      if (requestId !== requestCounter.current) return; // w międzyczasie zmieniono filtry - to już nieaktualne
      setWorkHours(hours);
      setAdvances(financial.advances);
      setPayments(financial.payments);
      setCommissions(financial.commissions);
      calculateSummary(hours, financial.advances, financial.payments, financial.commissions);
      setLoaded(true);
    } catch (error) {
      if (requestId !== requestCounter.current) return;
      if (!silent) showError(error?.message || "Błąd połączenia z serwerem");
    } finally {
      if (requestId === requestCounter.current) setLoading(false);
    }
  }, [selectedEmployee, selectedMonth, selectedYear, fetchFinancialOperations, calculateSummary, showError]);

  const filtersComplete = Boolean(selectedEmployee && selectedMonth && selectedYear);

  // Bez przycisku „Pokaż wypłaty”: każda zmiana pracownika / miesiąca / roku (i wejście z zapisanymi filtrami)
  // od razu ładuje dane; niepełne filtry czyszczą ekran
  useEffect(() => {
    if (filtersComplete) {
      fetchWorkHours();
    } else {
      requestCounter.current += 1;
      setWorkHours([]);
      setAdvances([]);
      setPayments([]);
      setCommissions([]);
      setSummary(null);
      setLoaded(false);
    }
  }, [filtersComplete, fetchWorkHours]);

  // Na żywo: nowa prowizja (przeliczenie po sprzedaży), zaliczka, wypłata lub zmiana godzin pracy odświeża ekran sama
  useLiveRefresh(["financialOperations", "workHours", "sales"], () => fetchWorkHours({ silent: true }), { enabled: filtersComplete });

  const refreshAll = useCallback(() => Promise.all([fetchEmployees(), filtersComplete ? fetchWorkHours() : null]), [fetchEmployees, fetchWorkHours, filtersComplete]);
  const { refreshControl } = usePullToRefresh(refreshAll);

  // ---------- pochodne ----------
  const employee = employees.find((emp) => emp._id === selectedEmployee);
  const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : "";
  const monthLabel = MONTHS.find((m) => m.value === selectedMonth)?.label || "";
  const endOfSelectedMonth = () => new Date(Number(selectedYear), Number(selectedMonth), 0, 23, 59, 59, 999);
  const startOfNextMonth = () => new Date(Number(selectedYear), Number(selectedMonth), 1);

  // Stan rozliczenia miesiąca: do wypłaty / rozliczony (0 po wypłacie) / nadpłata
  const finalPayNumber = Number(summary?.finalPay || 0);
  const settlement = !summary ? null
    : finalPayNumber > 0.004 ? "due"
    : finalPayNumber < -0.004 ? "overpaid"
    : Number(summary.totalPayments) > 0 ? "settled" : null;
  const latestPayment = payments.length
    ? [...payments].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))[0]
    : null;

  // Kwota wypłacana ponad „do wypłaty” to dopłata (zaokrąglenie w górę, np. 5670 → 5700 zł); mniejsza - reszta zostaje
  const paymentNumber = Number(String(paymentAmount).replace(",", ".") || 0);
  const paymentExtra = Math.round((paymentNumber - finalPayNumber) * 100) / 100;
  const roundUpTo = (step) => setPaymentAmount(String(Math.ceil((finalPayNumber - 0.0001) / step) * step));

  const history = useMemo(() => {
    const rows = [];
    if (visibleTypes.work_hours) {
      workHours.forEach((record) => rows.push({
        type: "work_hours", date: record.date,
        title: `${hoursText(record.totalHours)} h · ${record.sellingPoint || "punkt nieznany"}`,
        amount: record.dailyPay || 0,
        detail: [record.startTime && record.endTime ? `${record.startTime} - ${record.endTime}` : null, record.notes].filter(Boolean).join(" | "),
      }));
    }
    if (visibleTypes.advance) {
      advances.forEach((advance) => {
        const currency = advanceCurrency(advance);
        const pln = advancePln(advance);
        rows.push({
          type: "advance", date: advance.date,
          title: currency === "PLN" ? "Zaliczka" : `Zaliczka ${Math.abs(Number(advance.amount)).toFixed(2)} ${currency}`,
          amount: -(pln ?? 0),
          detail: advance.reason,
          warn: currency !== "PLN" && pln === null ? "bez przeliczenia - brak kursu, nie odjęte od wypłaty" : null,
          note: currency !== "PLN" && pln !== null ? `po kursie dnia ${Number(advance.plnRate || 0).toFixed(4)} = ${zl(pln)}` : null,
        });
      });
    }
    if (visibleTypes.payment) {
      payments.forEach((payment) => rows.push({
        type: "payment", date: payment.date,
        title: Number(payment.bonusAmount) > 0 ? `Wypłata (w tym dopłata ${zl(payment.bonusAmount)})` : "Wypłata",
        amount: -Math.abs(payment.amount || 0),
        detail: payment.reason,
        note: payment.createdByEmail ? `wypłacił: ${payment.createdByEmail}` : null,
      }));
    }
    if (visibleTypes.commission) {
      commissions.forEach((commission) => rows.push({
        type: "commission", date: commission.date,
        title: "Prowizja od sprzedaży",
        amount: commission.amount || 0,
        detail: commission.salesAmount ? `obrót ${zl(commission.salesAmount)}${commission.commissionRate ? ` · ${commission.commissionRate}%` : ""}` : "",
        commission,
      }));
    }
    return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [workHours, advances, payments, commissions, visibleTypes]);
  const historyEmpty = workHours.length === 0 && advances.length === 0 && payments.length === 0 && commissions.length === 0;

  // ---------- akcje ----------
  const openPayment = () => {
    if (!summary || finalPayNumber <= 0) return;
    setPaymentAmount(finalPayNumber.toFixed(2));
    setShowPaymentModal(true);
  };

  const submitPayment = async () => {
    if (!paymentNumber || paymentNumber <= 0) {
      showError("Wprowadź prawidłową kwotę wypłaty");
      return;
    }
    setPaymentLoading(true);
    try {
      const bonus = paymentExtra > 0 ? paymentExtra : 0; // dopłata = to, co ponad „do wypłaty”
      // Wypłata pensji należy do rozliczanego miesiąca: data = koniec jego ostatniego dnia (serwer pilnuje tego samego)
      const paymentData = {
        // bez userSymbol: serwer zapisuje wypłatę na konto zalogowanego administratora (kto wypłacił)
        amount: -Math.abs(paymentNumber),
        currency: "PLN",
        type: "salary_payment",
        reason: `Wypłata pensji dla ${employeeName} za ${monthLabel} ${selectedYear}${bonus > 0 ? ` (w tym dopłata ${bonus.toFixed(2)} zł)` : ""}`.trim(),
        date: endOfSelectedMonth().toISOString(),
        bonusAmount: bonus,
        employeeId: selectedEmployee,
        employeeName,
        employeeCode: employee?.employeeId,
      };
      const response = await tokenService.authenticatedFetch(getApiUrl("/financial-operations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentData),
      });
      const data = await response.json();
      if (!response.ok) {
        showError(`Błąd podczas rejestrowania wypłaty: ${data?.error || data?.message || ""}`.trim());
        return;
      }
      setShowPaymentModal(false);
      setPaymentAmount("");
      showSuccess(`Wypłata ${zl(paymentNumber)} za ${monthLabel.toLowerCase()} ${selectedYear} zapisana`);
      await fetchWorkHours({ silent: true });
    } catch (error) {
      showError(error?.message || "Błąd połączenia z serwerem");
    } finally {
      setPaymentLoading(false);
    }
  };

  // Cofnięcie wypłaty (pomyłka): usunięcie operacji - kwota (z dopłatą) wraca do „Do wypłaty”
  const confirmUndoPayment = async () => {
    if (!undoPayment?._id) return;
    setUndoLoading(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl(`/financial-operations/${undoPayment._id}`), { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showError(`Nie udało się cofnąć wypłaty: ${data?.message || data?.error || response.status}`);
        return;
      }
      setUndoPayment(null);
      showSuccess("Wypłata cofnięta - kwota wróciła do „Do wypłaty”");
      await fetchWorkHours({ silent: true });
    } catch (error) {
      showError(error?.message || "Błąd połączenia z serwerem");
    } finally {
      setUndoLoading(false);
    }
  };

  // Wydruk miesięczny: serwer liczy arkusz (zmiany, sztuki kurtek, prowizje, zaliczki), telefon pokazuje podgląd
  const openSheet = async () => {
    if (!filtersComplete) return;
    setSheetLoading(true);
    try {
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/work-hours/payroll-sheet?employeeId=${selectedEmployee}&month=${selectedMonth}&year=${selectedYear}`)
      );
      const data = await response.json();
      if (!response.ok) {
        showError(`Nie udało się przygotować wydruku: ${data?.message || data?.error || response.status}`);
        return;
      }
      setSheetHtml(buildPayrollSheetHtml(data));
    } catch (error) {
      showError(error?.message || "Błąd połączenia z serwerem");
    } finally {
      setSheetLoading(false);
    }
  };

  const resetFilters = async () => {
    setSelectedEmployee("");
    setSelectedMonth("");
    setSelectedYear(String(new Date().getFullYear()));
    try { await AsyncStorage.removeItem(FILTERS_KEY); } catch { /* bez znaczenia */ }
  };

  const toggleType = (type) => setVisibleTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  const allVisible = Object.values(visibleTypes).every(Boolean);

  // ---------- widok ----------
  const renderStatementRow = (label, value, { color, bold, big, sub } = {}) => (
    <View style={[styles.statementRow, bold && styles.statementRowTotal, big && styles.statementRowFinal]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.statementLabel, bold && styles.statementLabelBold, big && styles.statementLabelBig]}>{label}</Text>
        {!!sub && <Text style={styles.statementSub}>{sub}</Text>}
      </View>
      <Text style={[styles.statementValue, color && { color }, bold && styles.statementLabelBold, big && styles.statementValueBig]}>{value}</Text>
    </View>
  );

  const pickerItems = picker === "employee"
    ? employees.map((emp) => ({ key: emp._id, label: `${emp.firstName} ${emp.lastName}`, sub: emp.position || emp.employeeId, selected: emp._id === selectedEmployee, onPick: () => setSelectedEmployee(emp._id) }))
    : picker === "month"
      ? MONTHS.map((m) => ({ key: m.value, label: m.label, selected: m.value === selectedMonth, onPick: () => setSelectedMonth(m.value) }))
      : years.map((y) => ({ key: y, label: y, selected: y === selectedYear, onPick: () => setSelectedYear(y) }));
  const pickerTitle = picker === "employee" ? "Wybierz pracownika" : picker === "month" ? "Wybierz miesiąc" : "Wybierz rok";
  const pickerIcon = picker === "employee" ? "person" : "calendar";

  return (
    <SafeAreaView style={styles.container}>
      <PageHeader
        title="Wypłaty"
        subtitle={filtersComplete ? `${employeeName} · ${monthLabel} ${selectedYear}` : "wybierz pracownika i miesiąc"}
        icon="wallet"
        color={GREEN}
        onBack={() => router.back()}
        right={<IconButton icon="print" color={GREEN} onPress={openSheet} disabled={!filtersComplete || sheetLoading} accessibilityLabel="Wydruk miesięczny" />}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(40, insets.bottom + 40) }]}
        refreshControl={refreshControl}
        alwaysBounceVertical
        keyboardShouldPersistTaps="handled"
      >
        {/* Filtry */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={look.sectionLabel}>Pracownik i miesiąc</Text>
            {loading ? <ActivityIndicator color={GREEN} /> : (
              (selectedEmployee || selectedMonth) ? (
                <TouchableOpacity onPress={resetFilters} style={styles.clearLink}>
                  <Ionicons name="close-circle" size={16} color={tc("muted", "#94A3B8")} />
                  <Text style={styles.clearLinkText}>Wyczyść</Text>
                </TouchableOpacity>
              ) : null
            )}
          </View>
          <TouchableOpacity style={[look.selectField, styles.field]} onPress={() => setPicker("employee")} activeOpacity={0.8}>
            <View style={styles.fieldInner}>
              <Ionicons name="person" size={18} color={selectedEmployee ? GREEN : tc("muted", "#94A3B8")} />
              <Text style={selectedEmployee ? look.selectFieldText : styles.placeholder}>{employeeName || "Pracownik"}</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={tc("muted", "#94A3B8")} />
          </TouchableOpacity>
          <View style={styles.fieldRow}>
            <TouchableOpacity style={[look.selectField, styles.field, { flex: 1.4 }]} onPress={() => setPicker("month")} activeOpacity={0.8}>
              <View style={styles.fieldInner}>
                <Ionicons name="calendar" size={18} color={selectedMonth ? GREEN : tc("muted", "#94A3B8")} />
                <Text style={selectedMonth ? look.selectFieldText : styles.placeholder}>{monthLabel || "Miesiąc"}</Text>
              </View>
              <Ionicons name="chevron-down" size={18} color={tc("muted", "#94A3B8")} />
            </TouchableOpacity>
            <TouchableOpacity style={[look.selectField, styles.field, { flex: 1 }]} onPress={() => setPicker("year")} activeOpacity={0.8}>
              <Text style={look.selectFieldText}>{selectedYear}</Text>
              <Ionicons name="chevron-down" size={18} color={tc("muted", "#94A3B8")} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Dane ładują się same i odświeżają na żywo. Ikona drukarki u góry: wydruk miesięczny.</Text>
        </View>

        {/* Rachunek miesiąca */}
        {summary && (
          <View style={styles.card}>
            <Text style={look.sectionLabel}>Rachunek: {monthLabel} {selectedYear}</Text>
            {renderStatementRow("Za godziny", zl(summary.totalPay), { sub: `${hoursText(summary.totalHours)} h, ${summary.workDays} ${summary.workDays === 1 ? "dzień" : "dni"}` })}
            {renderStatementRow("Prowizje", `+ ${zl(summary.totalCommissions)}`, { color: GREEN })}
            {summary.totalBonus > 0 && renderStatementRow("Dopłata (zaokrąglenie)", `+ ${zl(summary.totalBonus)}`, { color: GREEN })}
            {renderStatementRow("Zaliczki", `− ${zl(summary.totalAdvances)}`, { color: RED })}
            {renderStatementRow("Razem za miesiąc", zl(summary.earned), { bold: true })}
            {renderStatementRow("Wypłacono", `− ${zl(summary.totalPayments)}`, { color: AMBER })}
            {renderStatementRow("Do wypłaty", zl(summary.finalPay), { big: true, color: settlement === "overpaid" ? RED : settlement === "settled" ? GREEN : undefined })}

            {summary.unconvertedAdvances > 0 && (
              <View style={styles.warnBanner}>
                <Ionicons name="alert-circle" size={18} color={RED} />
                <Text style={styles.warnText}>
                  {summary.unconvertedAdvances === 1 ? "Zaliczka w obcej walucie bez kursu" : `${summary.unconvertedAdvances} zaliczki w obcej walucie bez kursu`} - nie odjęte od wypłaty. Ustaw kurs w Tabeli walut i zapisz zaliczkę ponownie.
                </Text>
              </View>
            )}

            {settlement === "due" && (
              <TouchableOpacity style={styles.payButton} onPress={openPayment} activeOpacity={0.85}>
                <View style={styles.payButtonIcon}><Ionicons name="card" size={22} color="#fff" /></View>
                <View style={styles.payButtonTextBlock}>
                  <Text style={styles.payButtonText}>Rozlicz {monthLabel.toLowerCase()} {selectedYear}</Text>
                  <Text style={styles.payButtonHint}>do wypłaty {zl(summary.finalPay)}</Text>
                </View>
              </TouchableOpacity>
            )}
            {settlement === "settled" && (
              <View style={styles.statusBanner}>
                <Ionicons name="checkmark-circle" size={20} color={GREEN} />
                <Text style={[styles.statusText, { color: GREEN }]}>{monthLabel} {selectedYear} rozliczony</Text>
              </View>
            )}
            {settlement === "overpaid" && (
              <View style={[styles.statusBanner, styles.statusBannerRed]}>
                <Ionicons name="alert-circle" size={20} color={RED} />
                <Text style={[styles.statusText, { color: RED }]}>Nadpłata {zl(Math.abs(finalPayNumber))}</Text>
              </View>
            )}
            {/* Cofanie tylko tu (nie w wierszach historii): rozliczenie, a przy wypłacie częściowej - ostatnia wypłata */}
            {latestPayment && (
              <TouchableOpacity style={styles.undoButton} onPress={() => setUndoPayment(latestPayment)} activeOpacity={0.85}>
                <View style={styles.undoButtonIcon}><Ionicons name="arrow-undo" size={18} color="#3b0a0a" /></View>
                <View style={styles.payButtonTextBlock}>
                  <Text style={styles.undoButtonText}>{settlement === "settled" ? "Cofnij rozliczenie" : "Cofnij ostatnią wypłatę"}</Text>
                  <Text style={styles.undoButtonHint}>usuwa wypłatę {zl(Math.abs(Number(latestPayment.amount)))} z {formatDate(latestPayment.date)}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Historia */}
        {loaded && filtersComplete && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={look.sectionLabel}>Historia miesiąca</Text>
              <TouchableOpacity onPress={() => setVisibleTypes({ work_hours: !allVisible, commission: !allVisible, advance: !allVisible, payment: !allVisible })}>
                <Text style={styles.clearLinkText}>{allVisible ? "Ukryj wszystko" : "Pokaż wszystko"}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.chipsRow}>
              {Object.entries(TYPE_META).map(([type, meta]) => {
                const on = visibleTypes[type];
                return (
                  <TouchableOpacity key={type} onPress={() => toggleType(type)} style={[styles.chip, on && { backgroundColor: `${meta.color}26`, borderColor: `${meta.color}99` }]}>
                    <Ionicons name={meta.icon} size={14} color={on ? meta.color : tc("muted", "#94A3B8")} />
                    <Text style={[styles.chipText, on && { color: tc("text", "#fff") }]}>{meta.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {historyEmpty ? (
              <View style={look.emptyState}>
                <Ionicons name="file-tray-outline" size={32} color={tc("muted", "#94A3B8")} />
                <Text style={look.emptyStateText}>Brak godzin pracy, zaliczek, wypłat i prowizji</Text>
              </View>
            ) : history.length === 0 ? (
              <View style={look.emptyState}>
                <Text style={look.emptyStateText}>Wszystkie typy ukryte</Text>
              </View>
            ) : (
              history.map((row, index) => {
                const meta = TYPE_META[row.type];
                return (
                  <View key={`${row.type}-${index}`} style={[look.itemCard, styles.historyCard, { borderLeftColor: meta.color }]}>
                    <View style={[styles.historyIcon, { backgroundColor: `${meta.color}26` }]}>
                      <Ionicons name={meta.icon} size={18} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.historyTop}>
                        <Text style={styles.historyDate}>{formatDate(row.date)}</Text>
                        <Text style={[styles.historyAmount, { color: row.amount >= 0 ? GREEN : RED }]}>
                          {row.amount >= 0 ? "+" : "−"} {zl(Math.abs(row.amount))}
                        </Text>
                      </View>
                      <Text style={styles.historyTitle}>{row.title}</Text>
                      {!!row.detail && <Text style={styles.historyDetail} numberOfLines={2}>{row.detail}</Text>}
                      {!!row.note && <Text style={styles.historyDetail}>{row.note}</Text>}
                      {!!row.warn && <Text style={[styles.historyDetail, { color: RED }]}>{row.warn}</Text>}
                      {row.type === "commission" && (
                        <TouchableOpacity style={styles.detailsLink} onPress={() => setCommissionDetails(row.commission)}>
                          <Text style={styles.detailsLinkText}>Szczegóły prowizji</Text>
                          <Ionicons name="chevron-forward" size={14} color={CYAN} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Wybór pracownika / miesiąca / roku */}
      <Modal visible={Boolean(picker)} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon={pickerIcon} color={GREEN} title={pickerTitle} />
            <FlatList
              style={styles.optionList}
              data={pickerItems}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[look.optionCard, item.selected && { borderColor: GREEN, backgroundColor: `${GREEN}1F` }]}
                  onPress={() => { item.onPick(); setPicker(null); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={look.optionCardLabel}>{item.label}</Text>
                    {!!item.sub && <Text style={styles.optionSub}>{item.sub}</Text>}
                  </View>
                  <Ionicons name={item.selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={item.selected ? GREEN : tc("muted", "#94A3B8")} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={look.emptyStateText}>Brak pozycji</Text>}
            />
            <View style={look.buttonRow}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setPicker(null)}>
                <Text style={look.neutralButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rozliczenie wypłaty */}
      <Modal visible={showPaymentModal} transparent animationType="slide" onRequestClose={() => setShowPaymentModal(false)}>
        <KeyboardSafeOverlay>
          <View style={look.modalOverlay}>
            <View style={look.modalContent}>
              <ModalHeader icon="card" color={GREEN} title="Rozlicz wypłatę" subtitle={`${employeeName} · ${monthLabel.toUpperCase()} ${selectedYear}`} />
              <Text style={styles.modalLine}>Do wypłaty: <Text style={{ color: GREEN, fontWeight: "700" }}>{zl(summary?.finalPay)}</Text></Text>
              <Text style={[look.formLabel, { marginTop: 12 }]}>Kwota wypłacana</Text>
              <TextInput
                style={look.formInput}
                keyboardType="numeric"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                placeholder="Kwota"
                placeholderTextColor={tc("muted", "#64748B")}
              />
              <View style={styles.roundRow}>
                <Text style={styles.roundLabel}>Zaokrąglij w górę:</Text>
                {[10, 50, 100].map((step) => (
                  <TouchableOpacity key={step} style={styles.roundButton} onPress={() => roundUpTo(step)}>
                    <Text style={styles.roundButtonText}>do {step} zł</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {paymentExtra > 0.004 && (
                <Text style={[styles.modalNote, { color: GREEN, fontWeight: "700" }]}>Dopłata (zaokrąglenie): + {zl(paymentExtra)} - zapisze się razem z wypłatą i będzie na wydruku</Text>
              )}
              {paymentExtra < -0.004 && (
                <Text style={[styles.modalNote, { color: AMBER }]}>Wypłata częściowa - zostanie do wypłaty {zl(Math.abs(paymentExtra))}</Text>
              )}
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle" size={18} color="#38BDF8" />
                <Text style={styles.infoText}>
                  Wypłata zapisze się z datą {formatDate(endOfSelectedMonth())} i odliczy od miesiąca {monthLabel.toLowerCase()} {selectedYear}. Zaliczki wydane od {formatDate(startOfNextMonth())} należą już do następnego miesiąca.
                </Text>
              </View>
              <View style={look.buttonRow}>
                <TouchableOpacity style={look.neutralButton} onPress={() => setShowPaymentModal(false)} disabled={paymentLoading}>
                  <Text style={look.neutralButtonText}>Anuluj</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[look.primaryButton, { backgroundColor: GREEN }, (!paymentNumber || paymentLoading) && look.disabled]}
                  onPress={submitPayment}
                  disabled={!paymentNumber || paymentLoading}
                >
                  {paymentLoading ? <ActivityIndicator color="#fff" /> : <Text style={look.buttonText}>Zatwierdź</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardSafeOverlay>
      </Modal>

      {/* Cofnięcie wypłaty */}
      <Modal visible={Boolean(undoPayment)} transparent animationType="fade" onRequestClose={() => setUndoPayment(null)}>
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="arrow-undo" color={RED} title="Cofnąć wypłatę?" />
            <Text style={look.modalMessage}>
              Wypłata {zl(Math.abs(Number(undoPayment?.amount || 0)))} z {formatDate(undoPayment?.date)} dla {employeeName}
              {Number(undoPayment?.bonusAmount) > 0 ? ` (w tym dopłata ${zl(undoPayment.bonusAmount)})` : ""} zostanie usunięta, a kwota wróci do „Do wypłaty”.
            </Text>
            <View style={look.buttonRow}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setUndoPayment(null)} disabled={undoLoading}>
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[look.primaryButton, { backgroundColor: "#DC2626" }, undoLoading && look.disabled]} onPress={confirmUndoPayment} disabled={undoLoading}>
                {undoLoading ? <ActivityIndicator color="#fff" /> : <Text style={look.buttonText}>Cofnij wypłatę</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Szczegóły prowizji */}
      <Modal visible={Boolean(commissionDetails)} transparent animationType="slide" onRequestClose={() => setCommissionDetails(null)}>
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="trending-up" color={CYAN} title="Szczegóły prowizji" subtitle={commissionDetails ? `${formatDate(commissionDetails.date)} · ${zl(commissionDetails.amount)}` : ""} />
            {commissionDetails?.salesAmount ? (
              <Text style={styles.modalLine}>Obrót: <Text style={{ fontWeight: "700" }}>{zl(commissionDetails.salesAmount)}</Text>{commissionDetails.commissionRate ? ` · ${commissionDetails.commissionRate}%` : ""}</Text>
            ) : null}
            <FlatList
              style={styles.optionList}
              data={commissionDetails?.commissionDetails?.length ? commissionDetails.commissionDetails : [{ productName: "Prowizja", saleAmount: commissionDetails?.salesAmount, commissionAmount: commissionDetails?.amount, description: commissionDetails?.reason }]}
              keyExtractor={(_, index) => String(index)}
              renderItem={({ item }) => (
                <View style={[look.itemCard, { borderLeftColor: CYAN, alignItems: "flex-start" }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={look.itemCardText}>{item.productName || "Nieznany produkt"}</Text>
                    {!!item.description && <Text style={styles.historyDetail} numberOfLines={3}>{item.description}</Text>}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.historyAmount, { color: GREEN }]}>+ {zl(item.commissionAmount)}</Text>
                    {item.saleAmount ? <Text style={styles.historyDetail}>z {zl(item.saleAmount)}</Text> : null}
                  </View>
                </View>
              )}
            />
            <View style={look.buttonRow}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setCommissionDetails(null)}>
                <Text style={look.neutralButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Podgląd wydruku miesięcznego */}
      <Modal visible={Boolean(sheetHtml)} animationType="slide" onRequestClose={() => setSheetHtml(null)}>
        <SafeAreaView style={styles.container}>
          <PageHeader title="Wydruk miesięczny" subtitle={`${employeeName} · ${monthLabel} ${selectedYear}`} icon="print" color={GREEN} onBack={() => setSheetHtml(null)} />
          <Text style={styles.sheetHint}>Podgląd arkusza A4 (powiększ palcami). Drukowanie z telefonu dojdzie z następnym buildem; z panelu drukuje się od razu.</Text>
          {sheetHtml && (
            <WebView
              originWhitelist={["*"]}
              source={{ html: sheetHtml }}
              style={{ flex: 1, backgroundColor: "#fff" }}
              scalesPageToFit
              setBuiltInZoomControls
              setDisplayZoomControls={false}
            />
          )}
        </SafeAreaView>
      </Modal>

      <MessageModal
        visible={Boolean(message)}
        type={message?.type === "error" ? "error" : "success"}
        title={message?.type === "error" ? "Błąd" : "Gotowe"}
        message={message?.text}
        onClose={() => setMessage(null)}
      />
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc("bg", "#0F0F1A") },
  content: { padding: 16, paddingTop: 8 },
  card: {
    backgroundColor: tc("surface", "#161622"),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc("border", "#1E293B"),
    padding: 14,
    marginBottom: 14,
  },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  clearLink: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  clearLinkText: { color: tc("muted", "#94A3B8"), fontSize: 13, fontWeight: "600" },
  field: { marginBottom: 10 },
  fieldRow: { flexDirection: "row", gap: 10 },
  fieldInner: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  placeholder: { color: tc("muted", "#94A3B8"), fontSize: 16 },
  hint: { color: tc("muted", "#94A3B8"), fontSize: 12, marginTop: 2 },
  // rachunek
  statementRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: tc("border", "#1E293B") },
  statementRowTotal: { borderTopWidth: 2, borderTopColor: tc("text", "#fff"), marginTop: 2 },
  statementRowFinal: { borderTopWidth: 3, borderTopColor: tc("text", "#fff"), borderBottomWidth: 0, marginTop: 2, paddingVertical: 12 },
  statementLabel: { color: tc("text", "#fff"), fontSize: 15 },
  statementLabelBold: { fontWeight: "700" },
  statementLabelBig: { fontSize: 18, fontWeight: "800" },
  statementSub: { color: tc("muted", "#94A3B8"), fontSize: 12, marginTop: 1 },
  statementValue: { color: tc("text", "#fff"), fontSize: 15, fontVariant: ["tabular-nums"] },
  statementValueBig: { fontSize: 24, fontWeight: "800" },
  warnBanner: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: `${RED}1A`, borderWidth: 1, borderColor: `${RED}66` },
  warnText: { flex: 1, color: tc("text", "#fff"), fontSize: 13 },
  payButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 14, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#198754" },
  payButtonIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  payButtonTextBlock: { alignItems: "center" },
  payButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  payButtonHint: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  statusBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: `${GREEN}1F`, borderWidth: 1, borderColor: `${GREEN}80` },
  statusBannerRed: { backgroundColor: `${RED}1F`, borderColor: `${RED}80` },
  statusText: { fontSize: 16, fontWeight: "700" },
  undoButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 10, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: "rgba(248,113,113,0.55)", backgroundColor: "rgba(248,113,113,0.1)" },
  undoButtonIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#f87171", alignItems: "center", justifyContent: "center" },
  undoButtonText: { color: tc("text", "#fff"), fontSize: 14, fontWeight: "700" },
  undoButtonHint: { color: tc("muted", "#94A3B8"), fontSize: 11, marginTop: 2 },
  // historia
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: tc("border", "#334155"), backgroundColor: tc("surface2", "#1E1E2D") },
  chipText: { color: tc("muted", "#94A3B8"), fontSize: 12, fontWeight: "600" },
  historyCard: { alignItems: "flex-start", gap: 10 },
  historyIcon: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", marginTop: 2 },
  historyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historyDate: { color: tc("muted", "#94A3B8"), fontSize: 12, fontWeight: "600" },
  historyAmount: { fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  historyTitle: { color: tc("text", "#fff"), fontSize: 14, fontWeight: "600", marginTop: 2 },
  historyDetail: { color: tc("muted", "#94A3B8"), fontSize: 12, marginTop: 2 },
  detailsLink: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 6, alignSelf: "flex-start" },
  detailsLinkText: { color: CYAN, fontSize: 13, fontWeight: "600" },
  // okienka
  optionList: { maxHeight: 380, marginBottom: 8 },
  optionSub: { color: tc("muted", "#94A3B8"), fontSize: 12, marginTop: 2 },
  modalLine: { color: tc("text", "#fff"), fontSize: 15, marginTop: 4 },
  modalNote: { fontSize: 13, marginTop: 8 },
  roundRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 },
  roundLabel: { color: tc("muted", "#94A3B8"), fontSize: 12 },
  roundButton: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: tc("border", "#334155"), backgroundColor: tc("surface2", "#1E293B") },
  roundButtonText: { color: tc("text", "#E2E8F0"), fontSize: 12, fontWeight: "600" },
  infoBanner: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 12, marginBottom: 4, padding: 10, borderRadius: 10, backgroundColor: "rgba(56,189,248,0.12)", borderWidth: 1, borderColor: "rgba(56,189,248,0.4)" },
  infoText: { flex: 1, color: tc("text", "#fff"), fontSize: 12 },
  sheetHint: { color: tc("muted", "#94A3B8"), fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
}));

export default Payroll;
