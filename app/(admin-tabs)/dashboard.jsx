import React, { useContext, useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useCameraPermissions } from "expo-camera";
import { GlobalStateContext } from "../../context/GlobalState";
import tokenService from "../../services/tokenService";
import { getApiUrl } from "../../config/api";
import { ScreenHeader } from '../../components/AdminLook';
import { appAlert } from '../../services/appAlert';
import BarcodeScannerModal from '../../components/scanner/BarcodeScannerModal';
import ScanCompareResultModal from '../../components/scanner/ScanCompareResultModal';
import useProductCatalog from '../../hooks/useProductCatalog';
import { compareScans } from '../../utils/compareScans';
import { isUnknownProductName } from '../../utils/productName';

import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu

// „Sprawdź”: weryfikacja kurtek dobranych w systemie przez punkt w danym dniu.
// Admin skanuje kurtki tym samym skanerem co w Remanencie; skany są trzymane TYLKO w pamięci ekranu
// (nic nie jest zapisywane na serwerze), a „Sprawdź zgodność” porównuje je z listą dobranych.

// Data w czasie lokalnym (toISOString dawał UTC - między 0:00 a 2:00 wychodził poprzedni dzień)
const localDateString = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

// Nazwa dobranej kurtki: nazwa + rozmiar (rozmiar „-” pomijamy)
const expectedNameOf = (jacket) => {
  const name = jacket?.fullName || jacket?.barcode || "Nieznany produkt";
  const size = jacket?.size && jacket.size !== "-" ? ` ${jacket.size}` : "";
  return `${name}${size}`;
};

const COMPARE_LABELS = {
  expected: "Dobrane",
  missingSubtitle: "Kurtki dobrane w systemie, ale nie zeskanowane",
  extraSubtitle: "Kurtki zeskanowane, ale nie ma ich w dobranych",
  missingLine: (item) => `Dobrane: ${item.expectedCount || 0}, zeskanowano: ${item.actualCount || 0}`,
  extraLine: (item) => (item.expectedCount === 0
    ? `Nie było w dobieranych, zeskanowano: ${item.actualCount}`
    : `Dobrane: ${item.expectedCount}, zeskanowano: ${item.actualCount}`),
  successTitle: "🎉 Wszystko się zgadza!",
  successSubtitle: "Zeskanowane kurtki są zgodne z dobranymi w systemie",
};

const Dashboard = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const { users = [], fetchUsers } = useContext(GlobalStateContext);
  const insets = useSafeAreaInsets(); // Get safe area insets
  const catalog = useProductCatalog();

  // Selection states
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

  // Data states
  const [expectedJackets, setExpectedJackets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [totalExpected, setTotalExpected] = useState(0);
  const [verificationStarted, setVerificationStarted] = useState(false);

  // Skaner (wspólny z Remanentem) i zeskanowane sztuki - tylko w pamięci ekranu
  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedItems, setScannedItems] = useState([]); // [{ id, code, name, manual }] - jedna pozycja = jedna sztuka

  // Wynik porównania
  const [comparisonModalVisible, setComparisonModalVisible] = useState(false);
  const [comparisonResults, setComparisonResults] = useState(null);

  // Info modal state
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [infoModalMessage, setInfoModalMessage] = useState("");

  // Confirm clear modal state
  const [confirmClearModalVisible, setConfirmClearModalVisible] = useState(false);

  useEffect(() => {
    if (users.length === 0 && fetchUsers) {
      fetchUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zmiana punktu albo daty: weryfikacja od nowa
  const resetVerification = () => {
    setVerificationStarted(false);
    setExpectedJackets([]);
    setTotalExpected(0);
    setScannedItems([]);
    setComparisonResults(null);
    setComparisonModalVisible(false);
  };

  // keepScans: odświeżenie listy dobranych bez gubienia zeskanowanych (przeciągnięcie w dół)
  const startVerification = async ({ keepScans = false } = {}) => {
    if (!selectedUserId || !selectedDate) {
      appAlert("Uwaga", "Wybierz najpierw użytkownika i datę");
      return;
    }

    try {
      setLoading(true);
      const url = getApiUrl(`/verification/jackets/${selectedUserId}/${localDateString(selectedDate)}`);

      const response = await tokenService.authenticatedFetch(url);

      if (response.ok) {
        const data = await response.json();
        const jackets = Array.isArray(data?.data?.jackets) ? data.data.jackets : [];
        const total = data?.data?.totalJackets ?? jackets.length;

        setExpectedJackets(jackets);
        setTotalExpected(total || 0);
        setVerificationStarted(true);
        if (!keepScans) {
          setScannedItems([]);
          setComparisonResults(null);
        }

        if (!total) {
          setInfoModalMessage("Brak kurtek do weryfikacji dla wybranego użytkownika i daty");
          setInfoModalVisible(true);
        }
      } else {
        appAlert("Błąd", "Nie udało się pobrać danych");
        if (!keepScans) {
          setExpectedJackets([]);
          setTotalExpected(0);
        }
      }
    } catch (error) {
      appAlert("Błąd", "Wystąpił błąd podczas pobierania danych");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (fetchUsers) await fetchUsers();
      if (verificationStarted && selectedUserId && selectedDate) {
        await startVerification({ keepScans: true });
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Dobrane kurtki pogrupowane po kodzie
  const expectedGroups = useMemo(() => {
    const groups = new Map();
    expectedJackets.forEach((jacket) => {
      const code = jacket.barcode;
      const group = groups.get(code) || { code, name: expectedNameOf(jacket), count: 0 };
      group.count += 1;
      groups.set(code, group);
    });
    return [...groups.values()];
  }, [expectedJackets]);
  const expectedByCode = useMemo(
    () => Object.fromEntries(expectedGroups.map((group) => [group.code, group])),
    [expectedGroups]
  );

  // Zeskanowane pogrupowane po kodzie (ostatnio skanowane na początku)
  const scannedGroups = useMemo(() => {
    const groups = new Map();
    scannedItems.forEach((item) => {
      const group = groups.get(item.code) || { code: item.code, name: item.name, count: 0, manual: 0 };
      group.count += 1;
      if (item.manual) group.manual += 1;
      groups.set(item.code, group);
    });
    return [...groups.values()].reverse();
  }, [scannedItems]);
  const scannedCountByCode = useMemo(
    () => Object.fromEntries(scannedGroups.map((group) => [group.code, group.count])),
    [scannedGroups]
  );

  // Postęp: sztuki zgodne z dobranymi (dla każdego kodu min(dobrane, zeskanowane))
  const progress = useMemo(() => {
    let matched = 0;
    expectedGroups.forEach((group) => {
      matched += Math.min(group.count, scannedCountByCode[group.code] || 0);
    });
    const total = expectedJackets.length;
    return {
      total,
      matched,
      scanned: scannedItems.length,
      excess: scannedItems.length - matched,
      percentage: total > 0 ? Math.round((matched / total) * 100) : 0,
    };
  }, [expectedGroups, expectedJackets.length, scannedCountByCode, scannedItems.length]);

  // Nazwa po kodzie: z listy dobranych, a gdy jej tam nie ma - z kart produktów i słowników
  const nameForCode = (code) => expectedByCode[code]?.name || catalog.getProductNameFromBarcode(code);

  // Nazwa z serwera dla kodu spoza kart produktów (stan albo historia)
  const fetchServerName = async (code) => {
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl(`/verification/barcode/${encodeURIComponent(code)}`));
      if (response.status === 404) return { found: false };
      if (!response.ok) return { error: true };
      const data = await response.json();
      const fullName = data?.data?.fullName;
      if (!fullName) return { found: false };
      const size = data?.data?.size && data.data.size !== "-" ? ` ${data.data.size}` : "";
      return { found: true, name: `${fullName}${size}` };
    } catch (error) {
      return { error: true };
    }
  };

  // Decyzja „Sprawdź” dla kodu ze skanera:
  //  - kod z dobranych (i nie przekroczono liczby sztuk) -> zgodna (zielony komunikat)
  //  - kod spoza dobranych albo więcej sztuk niż dobrano -> przyjęty jako nadwyżka (bursztynowy komunikat)
  //  - obcy kod (nie EAN-13 / nie ma go w bazie) -> odrzucony jak w Remanencie
  const validateCode = async (code, { name, alreadyCounted }) => {
    const expected = expectedByCode[code];
    if (expected) {
      if (alreadyCounted < expected.count) {
        return {
          ok: true,
          tone: "success",
          name: expected.name,
          message: `Zgodna: ${expected.name}${expected.count > 1 ? ` (${alreadyCounted + 1}/${expected.count})` : ""}`,
        };
      }
      return {
        ok: true,
        tone: "warn",
        name: expected.name,
        message: `Nie było w dobieranych: ${expected.name}\nDobrano ${expected.count} szt. - to ${alreadyCounted + 1}. sztuka (nadwyżka).`,
      };
    }

    if (!/^\d{13}$/.test(String(code || "").trim())) {
      return { ok: false, tone: "warn", message: `Nieznany kod: ${code}\nTo nie jest metka z bazy produktów - pominięto.` };
    }

    let productName = name;
    if (isUnknownProductName(productName)) {
      const server = await fetchServerName(code);
      if (server.found) {
        productName = server.name;
      } else if (server.error && !catalog.catalogLoaded) {
        productName = productName || code; // nie da się sprawdzić - przyjmujemy jak w Remanencie
      } else {
        return { ok: false, tone: "warn", message: `Nieznany kod: ${code}\nTo nie jest metka z bazy produktów - pominięto.` };
      }
    }

    return { ok: true, tone: "warn", name: productName, message: `Nie było w dobieranych: ${productName}` };
  };

  const openQRScanner = async () => {
    if (!verificationStarted) {
      appAlert("Uwaga", "Najpierw kliknij „Rozpocznij weryfikację”");
      return;
    }

    if (totalExpected === 0) {
      appAlert("Uwaga", "Brak kurtek do zweryfikowania dla wybranego użytkownika i daty");
      return;
    }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result?.granted) {
        appAlert("Błąd", "Brak dostępu do kamery. Włącz go w ustawieniach telefonu dla tej aplikacji.");
        return;
      }
    }

    setScannerVisible(true);
  };

  // „Zatwierdź (N)” w skanerze: skany trafiają na listę ekranu (bez zapisu na serwerze)
  const confirmScans = async (pieces, { showToast }) => {
    setScannedItems((prev) => [
      ...prev,
      ...pieces.map((piece) => ({ id: piece.id, code: piece.code, name: piece.name, manual: Boolean(piece.manual) })),
    ]);
    showToast(`Dodano do listy: ${pieces.length} szt.`);
    return true;
  };

  // −1 / +1 na liście zeskanowanych
  const removeOnePiece = (code) => {
    setScannedItems((prev) => {
      const index = prev.map((item) => item.code).lastIndexOf(code);
      return index === -1 ? prev : [...prev.slice(0, index), ...prev.slice(index + 1)];
    });
  };
  const addOnePiece = (code) => {
    setScannedItems((prev) => {
      const template = prev.find((item) => item.code === code);
      if (!template) return prev;
      return [...prev, { ...template, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }];
    });
  };

  // „Sprawdź zgodność”: dobrane vs zeskanowane
  const checkVerification = () => {
    try {
      const result = compareScans(expectedJackets, scannedItems, {
        describeExpected: (first) => ({ name: first.fullName || first.barcode, size: first.size && first.size !== "-" ? first.size : undefined }),
        describeScanned: (first) => ({ name: first.name || first.code }),
      });
      setComparisonResults({
        currentStateCount: expectedJackets.length,
        remanentCount: scannedItems.length,
        missingCount: result.missingCount,
        excessCount: result.excessCount,
        missingItems: result.missingItems,
        extraItems: result.extraItems,
      });
      setComparisonModalVisible(true);
    } catch (error) {
      appAlert("Błąd", "Wystąpił błąd podczas sprawdzania");
    }
  };

  const filteredUsers = users.filter((u) =>
    u.role !== "admin" &&
    u.role !== "magazyn" &&
    u.username !== "Cudzich" &&
    u.email !== "admin2@bukowski.com" &&
    u.email !== "cudzich@wp.pl"
  );
  const selectedUser = filteredUsers.find((u) => u._id === selectedUserId);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{
      flex: 1,
      backgroundColor: tc('bg', "#000000"),
    }}>
      <ScrollView alwaysBounceVertical
        style={styles.scrollView}
        // Pasek zakładek leży na treści (position: absolute, wysokość jak w _layout) - zapas, żeby ostatni przycisk nie chował się pod nim
        contentContainerStyle={{ paddingBottom: Math.max(90, 70 + insets.bottom) + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={{ paddingHorizontal: 12 }}>
          <ScreenHeader icon="checkmark-done-circle" title="Sprawdź kurtki" subtitle="Weryfikacja kurtek dobranych w systemie" />
        </View>

        {/* Wybór punktu i daty */}
        <View style={styles.section}>
          <Text style={styles.label}>Wybierz użytkownika:</Text>
          <TouchableOpacity
            style={styles.userSelectButton}
            onPress={() => setShowUserModal(true)}
          >
            <Text style={styles.userSelectButtonText}>
              {selectedUserId
                ? selectedUser?.username || selectedUser?.email || "Użytkownik"
                : "Wybierz użytkownika..."}
            </Text>
            <Ionicons name="people" size={24} color={tc('text', "#fff")} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Wybierz datę:</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>
              {selectedDate.toLocaleDateString("pl-PL")}
            </Text>
            <Ionicons name="calendar" size={24} color={tc('text', "#fff")} />
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowDatePicker(false);
                if (date) {
                  setSelectedDate(date);
                  resetVerification(); // zmiana daty = weryfikacja od nowa
                }
              }}
            />
          )}
        </View>

        {!verificationStarted ? (
          <TouchableOpacity
            style={[styles.startButton, (!selectedUserId || loading) && { opacity: 0.6 }]}
            onPress={() => startVerification()}
            disabled={!selectedUserId || !selectedDate || loading}
            testID="start-verification"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="play-circle" size={32} color="#fff" />
                <Text style={styles.startButtonText}>Rozpocznij weryfikację</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.verificationBody}>
            {/* Postęp (jak w Remanencie) */}
            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressTitle}>Do sprawdzenia: {totalExpected} szt.</Text>
                <Text style={styles.progressStats} testID="verification-progress">
                  {progress.matched}/{progress.total} ({progress.percentage}%)
                </Text>
              </View>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarFill, { width: `${progress.percentage}%` }]} />
              </View>
              <View style={styles.progressDetails}>
                <Text style={styles.progressDetailText}>
                  <Ionicons name="checkmark-circle-outline" size={12} color={tc('muted', '#94A3B8')} /> Zgodne: {progress.matched}/{progress.total}
                </Text>
                <Text style={styles.progressDetailText}>
                  <Ionicons name="scan-outline" size={12} color={tc('muted', '#94A3B8')} /> Skanowania: {progress.scanned}
                </Text>
                <Text style={[styles.progressDetailText, progress.excess > 0 && { color: '#F59E0B' }]}>
                  <Ionicons name="alert-circle-outline" size={12} color={progress.excess > 0 ? '#F59E0B' : tc('muted', '#94A3B8')} /> Nadwyżki: {progress.excess}
                </Text>
              </View>
            </View>

            {/* Akcje (jak stopka Remanentu) */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.addButton, totalExpected === 0 && { opacity: 0.5 }]}
                onPress={openQRScanner}
                disabled={totalExpected === 0}
                testID="open-scanner"
              >
                <Ionicons name="qr-code" size={20} color="white" />
                <Text style={styles.actionButtonText}>Skanuj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.checkButton, totalExpected === 0 && scannedItems.length === 0 && { opacity: 0.5 }]}
                onPress={checkVerification}
                disabled={totalExpected === 0 && scannedItems.length === 0}
                testID="check-verification"
              >
                <Ionicons name="checkmark-circle" size={20} color="white" />
                <Text style={styles.actionButtonText}>Sprawdź</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.clearAllButton, scannedItems.length === 0 && { opacity: 0.5 }]}
                onPress={() => setConfirmClearModalVisible(true)}
                disabled={scannedItems.length === 0}
                testID="clear-scans"
              >
                <Ionicons name="trash" size={20} color="white" />
                <Text style={styles.actionButtonText}>Wyczyść</Text>
              </TouchableOpacity>
            </View>

            {/* Dobrane w systemie */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Dobrane w systemie ({totalExpected})</Text>
              {expectedGroups.length === 0 ? (
                <Text style={styles.emptyHint}>Brak kurtek dobranych w tym dniu.</Text>
              ) : (
                expectedGroups.map((group) => {
                  const scanned = scannedCountByCode[group.code] || 0;
                  const done = scanned >= group.count;
                  return (
                    <View key={`expected-${group.code}`} style={[styles.listItem, done && styles.listItemDone]}>
                      <Ionicons
                        name={done ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={done ? "#10B981" : tc('muted', "#94A3B8")}
                      />
                      <View style={styles.listItemContent}>
                        <Text style={styles.itemName}>{group.name}</Text>
                        <Text style={styles.itemCode}>{group.code}</Text>
                      </View>
                      <Text style={[styles.itemCounter, done && { color: "#10B981" }]}>
                        {Math.min(scanned, group.count)}/{group.count}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            {/* Zeskanowane (tylko w pamięci ekranu) */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Zeskanowane ({scannedItems.length})</Text>
              {scannedGroups.length === 0 ? (
                <Text style={styles.emptyHint}>Kliknij „Skanuj” i zeskanuj kurtki. Każdy skan to jedna sztuka.</Text>
              ) : (
                scannedGroups.map((group) => {
                  const expected = expectedByCode[group.code];
                  const status = !expected
                    ? { text: "Nie było w dobieranych", color: "#F59E0B" }
                    : group.count > expected.count
                      ? { text: `Nadwyżka: dobrano ${expected.count} szt.`, color: "#F59E0B" }
                      : { text: group.count < expected.count ? `Zgodna (${group.count}/${expected.count})` : "Zgodna", color: "#10B981" };
                  return (
                    <View key={`scanned-${group.code}`} style={styles.listItem}>
                      <View style={styles.listItemContent}>
                        <Text style={styles.itemName}>{group.name || group.code}</Text>
                        <Text style={styles.itemCode}>{group.code}</Text>
                        <Text style={[styles.itemStatus, { color: status.color }]}>{status.text}</Text>
                        {group.manual > 0 ? <Text style={styles.manualBadge}>wpisane ręcznie: {group.manual} szt.</Text> : null}
                      </View>
                      <View style={styles.pieceCounterRow}>
                        <TouchableOpacity onPress={() => removeOnePiece(group.code)} style={[styles.pieceButton, styles.pieceButtonMinus]}>
                          <Ionicons name={group.count === 1 ? "close" : "remove"} size={18} color="white" />
                        </TouchableOpacity>
                        <Text style={styles.pieceCount}>×{group.count}</Text>
                        <TouchableOpacity onPress={() => addOnePiece(group.code)} style={[styles.pieceButton, styles.pieceButtonPlus]}>
                          <Ionicons name="add" size={18} color="white" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Skaner (ten sam co w Remanencie) */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        title="Skanuj kody kurtek"
        permission={permission}
        requestPermission={requestPermission}
        resolveName={nameForCode}
        previewName={nameForCode}
        validateCode={validateCode}
        countSaved={(code) => scannedCountByCode[code] || 0}
        onConfirm={confirmScans}
        goods={catalog.goodsList}
        pickerSizes={catalog.pickerSizes}
      />

      {/* Wynik porównania (jak w Remanencie) */}
      <ScanCompareResultModal
        visible={comparisonModalVisible}
        onClose={() => setComparisonModalVisible(false)}
        title="Dobrane vs zeskanowane"
        subtitle={`${selectedUser?.symbol || selectedUser?.username || selectedUser?.email || ""}${selectedUser ? " · " : ""}${selectedDate.toLocaleDateString("pl-PL")}`}
        results={comparisonResults}
        labels={COMPARE_LABELS}
        showCloseButton
      />

      {/* User Selection Modal */}
      <Modal visible={showUserModal} animationType="slide" transparent onRequestClose={() => setShowUserModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.userModal}>
            <View style={styles.userModalHeader}>
              <Text style={styles.userModalTitle}>Wybierz użytkownika</Text>
              <TouchableOpacity onPress={() => setShowUserModal(false)}>
                <Ionicons name="close" size={28} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.userList}>
              {filteredUsers.map((u) => (
                <TouchableOpacity
                  key={u._id}
                  style={[
                    styles.userItem,
                    selectedUserId === u._id && styles.userItemSelected
                  ]}
                  onPress={() => {
                    setSelectedUserId(u._id);
                    setShowUserModal(false);
                    resetVerification(); // zmiana punktu = weryfikacja od nowa
                  }}
                >
                  <View style={styles.userItemContent}>
                    <Ionicons
                      name="person-circle"
                      size={40}
                      color={selectedUserId === u._id ? "#0d6efd" : "#6c757d"}
                    />
                    <View style={styles.userItemText}>
                      <Text style={styles.userItemName}>
                        {u.username || u.email}
                      </Text>
                      <Text style={styles.userItemDetails}>
                        {u.symbol || u.sellingPoint}
                      </Text>
                    </View>
                  </View>
                  {selectedUserId === u._id && (
                    <Ionicons name="checkmark-circle" size={24} color="#0d6efd" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Info Modal */}
      <Modal visible={infoModalVisible} animationType="fade" transparent onRequestClose={() => setInfoModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.infoModal}>
            <View style={styles.infoModalHeader}>
              <Ionicons name="information-circle" size={48} color="#ffc107" />
            </View>
            <View style={styles.infoModalContent}>
              <Text style={styles.infoModalTitle}>Informacja</Text>
              <Text style={styles.infoModalMessage}>{infoModalMessage}</Text>
            </View>
            <TouchableOpacity
              style={styles.infoModalButton}
              onPress={() => setInfoModalVisible(false)}
            >
              <Text style={styles.infoModalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Potwierdzenie „Wyczyść” */}
      <Modal visible={confirmClearModalVisible} animationType="fade" transparent onRequestClose={() => setConfirmClearModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <View style={styles.confirmModalHeader}>
              <Ionicons name="warning" size={48} color="#ff4444" />
            </View>
            <View style={styles.confirmModalContent}>
              <Text style={styles.confirmModalTitle}>Wyczyść listę</Text>
              <Text style={styles.confirmModalMessage}>
                Czy na pewno chcesz usunąć wszystkie zeskanowane kurtki ({scannedItems.length} szt.)?
              </Text>
            </View>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={styles.confirmModalCancelButton}
                onPress={() => setConfirmClearModalVisible(false)}
              >
                <Text style={styles.confirmModalCancelButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmModalConfirmButton}
                onPress={() => {
                  setScannedItems([]);
                  setComparisonResults(null);
                  setConfirmClearModalVisible(false);
                }}
              >
                <Text style={styles.confirmModalConfirmButtonText}>Wyczyść</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 20,
    paddingBottom: 0,
  },
  label: {
    fontSize: 16,
    color: tc('text', "#fff"),
    marginBottom: 12,
    fontWeight: "600",
  },
  userSelectButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: tc('surface', "#1E1E2D"),
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
  },
  userSelectButtonText: {
    color: tc('text', "#fff"),
    fontSize: 16,
  },
  dateButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: tc('surface', "#1E1E2D"),
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
  },
  dateButtonText: {
    color: tc('text', "#fff"),
    fontSize: 16,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D6EFD",
    padding: 20,
    margin: 20,
    borderRadius: 12,
    gap: 12,
  },
  startButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  verificationBody: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  // Pasek postępu (jak w Remanencie)
  progressContainer: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressTitle: {
    fontSize: 14,
    color: tc('text', 'white'),
    fontWeight: '600',
  },
  progressStats: {
    fontSize: 14,
    color: '#0D6EFD',
    fontWeight: 'bold',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  progressDetailText: {
    fontSize: 12,
    color: tc('muted', '#94A3B8'),
    marginRight: 8,
  },
  // Przyciski (jak stopka Remanentu)
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addButton: {
    backgroundColor: '#0D6EFD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    flex: 1,
  },
  checkButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    flex: 1,
  },
  clearAllButton: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    flex: 1,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  // Karty list
  card: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
  },
  cardTitle: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  emptyHint: {
    color: tc('muted', '#CDCDE0'),
    fontSize: 14,
    lineHeight: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
  },
  listItemDone: {
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  listItemContent: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: tc('text', 'white'),
    marginBottom: 2,
  },
  itemCode: {
    fontSize: 12,
    color: tc('muted', '#CDCDE0'),
  },
  itemCounter: {
    fontSize: 16,
    fontWeight: '700',
    color: tc('muted', '#CDCDE0'),
  },
  itemStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  manualBadge: {
    color: '#F59E0B',
    fontSize: 12,
    marginTop: 2,
  },
  pieceCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pieceButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pieceButtonMinus: {
    backgroundColor: '#DC2626',
  },
  pieceButtonPlus: {
    backgroundColor: '#16A34A',
  },
  pieceCount: {
    color: tc('text', 'white'),
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 10,
  },
  // Okienka
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  userModal: {
    backgroundColor: tc('surface', "#161622"),
    width: "90%",
    maxHeight: "70%",
    borderRadius: 16,
    overflow: "hidden",
  },
  userModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: tc('surface', "#1E1E2D"),
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#232533"),
  },
  userModalTitle: {
    color: tc('text', "#fff"),
    fontSize: 20,
    fontWeight: "bold",
  },
  infoModal: {
    backgroundColor: tc('surface', "#161622"),
    width: "85%",
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    paddingBottom: 20,
  },
  infoModalHeader: {
    backgroundColor: tc('surface', "#1E1E2D"),
    width: "100%",
    paddingVertical: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  infoModalContent: {
    padding: 24,
    alignItems: "center",
  },
  infoModalTitle: {
    color: tc('text', "#fff"),
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  infoModalMessage: {
    color: tc('muted', "#aaa"),
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  infoModalButton: {
    backgroundColor: "#0d6efd",
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 120,
    alignItems: "center",
  },
  infoModalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmModal: {
    backgroundColor: tc('surface', "#161622"),
    width: "85%",
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    paddingBottom: 20,
  },
  confirmModalHeader: {
    backgroundColor: tc('surface', "#1E1E2D"),
    width: "100%",
    paddingVertical: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmModalContent: {
    padding: 24,
    alignItems: "center",
  },
  confirmModalTitle: {
    color: tc('text', "#fff"),
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  confirmModalMessage: {
    color: tc('muted', "#aaa"),
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  confirmModalButtons: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
  },
  confirmModalCancelButton: {
    backgroundColor: tc('surface', "#2a2a3e"),
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 12,
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: tc('border', "#444"),
  },
  confirmModalCancelButtonText: {
    color: tc('text', "#fff"),
    fontSize: 16,
    fontWeight: "600",
  },
  confirmModalConfirmButton: {
    backgroundColor: "#ff4444",
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 12,
    flex: 1,
    alignItems: "center",
  },
  confirmModalConfirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  userList: {
    maxHeight: 400,
  },
  userItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#232533"),
  },
  userItemSelected: {
    backgroundColor: tc('surface', "#1E1E2D"),
  },
  userItemContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  userItemText: {
    marginLeft: 12,
    flex: 1,
  },
  userItemName: {
    color: tc('text', "#fff"),
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  userItemDetails: {
    color: tc('muted', "#CDCDE0"),
    fontSize: 14,
  },
}));

export default Dashboard;
