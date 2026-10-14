import React, { useContext, useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { GlobalStateContext } from "../../context/GlobalState";
import tokenService from "../../services/tokenService";
import { getApiUrl } from "../../config/api";
import Logger from "../../services/logger";
import LogoutButton from "../../components/LogoutButton";
import { ScreenHeader } from '../../components/AdminLook';
import { appAlert } from '../../services/appAlert';

import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu
const Dashboard = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const { user, users, fetchUsers } = useContext(GlobalStateContext);
  const insets = useSafeAreaInsets(); // Get safe area insets
  
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
  
  // Scanner states
  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedJackets, setScannedJackets] = useState([]);
  const [scanningEnabled, setScanningEnabled] = useState(true);
  const [recentlyScannedCodes, setRecentlyScannedCodes] = useState(new Map());
  const [lastScannedCode, setLastScannedCode] = useState("");
  const [facing, setFacing] = useState("back");
  const [pendingScan, setPendingScan] = useState(null);
  const [showPendingUI, setShowPendingUI] = useState(false);
  const isProcessingRef = useRef(false);
  
  // Progress states
  const [scanProgress, setScanProgress] = useState({
    totalExpected: 0,
    totalScanned: 0,
    percentage: 0,
  });
  
  // Comparison modal states
  const [comparisonModalVisible, setComparisonModalVisible] = useState(false);
  const [comparisonResults, setComparisonResults] = useState(null);
  
  // Info modal state
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [infoModalMessage, setInfoModalMessage] = useState("");
  
  // Confirm clear modal state
  const [confirmClearModalVisible, setConfirmClearModalVisible] = useState(false);

  useEffect(() => {
    if (users.length === 0) {
      fetchUsers();
    }
  }, []);

  useEffect(() => {
    if (expectedJackets.length > 0) {
      calculateProgress();
    }
  }, [scannedJackets, expectedJackets]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUsers();
    if (verificationStarted && selectedUserId && selectedDate) {
      await startVerification();
    }
    setRefreshing(false);
  };

  const startVerification = async () => {
    if (!selectedUserId || !selectedDate) {
      appAlert("Uwaga", "Wybierz najpierw użytkownika i datę");
      return;
    }

    try {
      setLoading(true);
      const dateStr = selectedDate.toISOString().split("T")[0];
      const url = getApiUrl(`/verification/jackets/${selectedUserId}/${dateStr}`);
      
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        setExpectedJackets(data.data.jackets || []);
        setTotalExpected(data.data.totalJackets || 0);
        setVerificationStarted(true);
        setScannedJackets([]);
        
        if (data.data.totalJackets === 0) {
          setInfoModalMessage("Brak kurtek do weryfikacji dla wybranego użytkownika i daty");
          setInfoModalVisible(true);
        }
      } else {
        const errorText = await response.text();
        appAlert("Błąd", "Nie udało się pobrać danych");
        setExpectedJackets([]);
        setTotalExpected(0);
      }
    } catch (error) {
      appAlert("Błąd", "Wystąpił błąd podczas pobierania danych");
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = () => {
    const scannedBarcodes = {};
    scannedJackets.forEach((jacket) => {
      const code = jacket.barcode || jacket.code;
      if (!scannedBarcodes[code]) {
        scannedBarcodes[code] = 0;
      }
      scannedBarcodes[code]++;
    });

    const expectedBarcodes = {};
    expectedJackets.forEach((jacket) => {
      const code = jacket.barcode;
      if (!expectedBarcodes[code]) {
        expectedBarcodes[code] = 0;
      }
      expectedBarcodes[code]++;
    });

    let matchedCount = 0;
    Object.keys(expectedBarcodes).forEach((barcode) => {
      const expected = expectedBarcodes[barcode];
      const scanned = scannedBarcodes[barcode] || 0;
      matchedCount += Math.min(expected, scanned);
    });

    const percentage =
      totalExpected > 0 ? Math.round((matchedCount / totalExpected) * 100) : 0;

    setScanProgress({
      totalExpected,
      totalScanned: scannedJackets.length,
      percentage,
    });
  };

  const openQRScanner = async () => {
    if (!selectedUserId || !selectedDate) {
      appAlert("Uwaga", "Wybierz najpierw użytkownika i datę");
      return;
    }

    if (totalExpected === 0) {
      appAlert("Uwaga", "Brak kurtek do zweryfikowania dla wybranego użytkownika i daty");
      return;
    }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        appAlert("Błąd", "Brak uprawnień do kamery");
        return;
      }
    }

    setScannerVisible(true);
    setScanningEnabled(true);
    setLastScannedCode("");
    setRecentlyScannedCodes(new Map());
    setPendingScan(null); // Reset pending scan when opening scanner
  };

  const handleScan = ({ data }) => {
    // Jeśli jest już oczekujący skan, nie pozwalaj na kolejny
    if (isProcessingRef.current) {
      return;
    }
    
    // WAŻNE: Jeśli nie ma listy oczekiwanych kurtek, nie skanuj
    if (!expectedJackets || expectedJackets.length === 0) {
      appAlert(
        "Brak listy weryfikacji", 
        "Najpierw pobierz listę kurtek do weryfikacji, klikając 'Rozpocznij weryfikację'"
      );
      closeScanner();
      return;
    }

    const now = Date.now();
    const lastScanTime = recentlyScannedCodes.get(data);

    // Blokada na 5 sekund dla tego samego kodu
    if (!scanningEnabled || (lastScanTime && now - lastScanTime < 5000)) {
      return;
    }
    setLastScannedCode(data);
    setRecentlyScannedCodes((prev) => new Map(prev).set(data, now));

    // Wyłącz skanowanie dopóki nie zostanie zatwierdzony skan
    setScanningEnabled(false);
    isProcessingRef.current = true;
    
    const jacket = expectedJackets.find((j) => j.barcode === data);

    if (jacket) {
      // Pokaż do weryfikacji - NIE dodawaj jeszcze do listy
      setPendingScan({
        ...jacket,
        scannedAt: new Date().toISOString(),
        status: "correct",
      });
      setShowPendingUI(true);
    } else {
      // Product not in expected list - check what it actually is
      fetchProductByBarcode(data);
    }
  };
  
  const fetchProductByBarcode = async (barcode) => {
    try {
      const url = getApiUrl(`/verification/barcode/${barcode}`);
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        // Nadmiarowy produkt - pokaż do weryfikacji
        setPendingScan({
          barcode: barcode,
          code: barcode,
          fullName: data.data.fullName,
          size: data.data.size,
          scannedAt: new Date().toISOString(),
          status: "unexpected",
          sellingPoint: data.data.sellingPoint,
        });
        setShowPendingUI(true);
      } else {
        // Kompletnie nieznany produkt
        setPendingScan({
          barcode: barcode,
          code: barcode,
          fullName: "Nieznany produkt",
          scannedAt: new Date().toISOString(),
          status: "unexpected",
        });
        setShowPendingUI(true);
      }
    } catch (error) {
      // W przypadku błędu
      setPendingScan({
        barcode: barcode,
        code: barcode,
        fullName: "Nieznany produkt",
        scannedAt: new Date().toISOString(),
        status: "unexpected",
      });
      setShowPendingUI(true);
    }
  };

  const closeScanner = () => {
    setScannerVisible(false);
    setLastScannedCode("");
    setPendingScan(null); // Reset pending scan
    setShowPendingUI(false);
    setScanningEnabled(true); // Re-enable scanning
    isProcessingRef.current = false;
  };

  const checkVerification = () => {
    try {
      const missingItems = [];
      const extraItems = [];

      // Grupuj oczekiwane kurtki według kodu
      const expectedByBarcode = {};
      expectedJackets.forEach((jacket) => {
        const code = jacket.barcode;
        if (!expectedByBarcode[code]) {
          expectedByBarcode[code] = [];
        }
        expectedByBarcode[code].push(jacket);
      });

      // Grupuj zeskanowane kurtki według kodu
      const scannedByBarcode = {};
      scannedJackets.forEach((jacket) => {
        const code = jacket.barcode || jacket.code;
        if (!scannedByBarcode[code]) {
          scannedByBarcode[code] = [];
        }
        scannedByBarcode[code].push(jacket);
      });

      // Sprawdź czego brakuje
      Object.keys(expectedByBarcode).forEach((barcode) => {
        const expectedItems = expectedByBarcode[barcode];
        const scannedItems = scannedByBarcode[barcode] || [];

        const expectedCount = expectedItems.length;
        const actualCount = scannedItems.length;

        if (actualCount === 0) {
          missingItems.push({
            name: expectedItems[0].fullName || expectedItems[0].barcode,
            size: expectedItems[0].size,
            code: barcode,
            expectedCount: expectedCount,
            actualCount: 0,
          });
        } else if (actualCount < expectedCount) {
          missingItems.push({
            name: expectedItems[0].fullName || expectedItems[0].barcode,
            size: expectedItems[0].size,
            code: barcode,
            expectedCount: expectedCount,
            actualCount: actualCount,
            missingCount: expectedCount - actualCount,
          });
        } else if (actualCount > expectedCount) {
          extraItems.push({
            name: scannedItems[0].fullName || scannedItems[0].barcode,
            size: scannedItems[0].size,
            code: barcode,
            expectedCount: expectedCount,
            actualCount: actualCount,
            excessCount: actualCount - expectedCount,
          });
        }
      });

      // Sprawdź nadwyżki (zeskanowane ale nie oczekiwane)
      Object.keys(scannedByBarcode).forEach((barcode) => {
        if (!expectedByBarcode[barcode]) {
          const scannedItems = scannedByBarcode[barcode];
          extraItems.push({
            name: scannedItems[0].fullName || scannedItems[0].barcode,
            size: scannedItems[0].size,
            code: barcode,
            expectedCount: 0,
            actualCount: scannedItems.length,
            excessCount: scannedItems.length,
          });
        }
      });

      setComparisonResults({
        currentStateCount: totalExpected,
        remanentCount: scannedJackets.length,
        missingItems: missingItems,
        extraItems: extraItems,
      });
      setComparisonModalVisible(true);
    } catch (error) {
      appAlert("Błąd", "Wystąpił błąd podczas sprawdzania");
    }
  };

  const clearScannedJackets = () => {
    setConfirmClearModalVisible(true);
  };

  const renderScannedJacket = ({ item }) => (
    <View
      style={[
        styles.jacketItem,
        item.status === "unexpected" && styles.jacketItemError,
      ]}
    >
      <View style={styles.jacketInfo}>
        <Text style={styles.jacketName}>{item.fullName || item.barcode}</Text>
        <Text style={styles.jacketCode}>
          {item.barcode || item.code} | {item.size || "-"}
        </Text>
      </View>
      {item.status === "unexpected" && (
        <Ionicons name="alert-circle" size={24} color="#dc3545" />
      )}
      {item.status === "correct" && (
        <Ionicons name="checkmark-circle" size={24} color="#0D6EFD" />
      )}
    </View>
  );

  const filteredUsers = users.filter((u) => 
    u.role !== "admin" && 
    u.role !== "magazyn" && 
    u.username !== "Cudzich" &&
    u.email !== "admin2@bukowski.com" &&
    u.email !== "cudzich@wp.pl"
  );

  return (
    <SafeAreaView style={{
      flex: 1,
      backgroundColor: tc('bg', "#000000"),
      paddingBottom: Math.max(20, insets.bottom + 20)
    }}>
      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={{ paddingHorizontal: 12 }}>
          <ScreenHeader icon="checkmark-done-circle" title="Sprawdź kurtki" subtitle="Weryfikacja kurtek dobranych w systemie" />
        </View>

        {/* User Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>Wybierz użytkownika:</Text>
          <TouchableOpacity
            style={styles.userSelectButton}
            onPress={() => setShowUserModal(true)}
          >
            <Text style={styles.userSelectButtonText}>
              {selectedUserId 
                ? filteredUsers.find(u => u._id === selectedUserId)?.username || 
                  filteredUsers.find(u => u._id === selectedUserId)?.email || 
                  "Użytkownik"
                : "Wybierz użytkownika..."}
            </Text>
            <Ionicons name="people" size={24} color={tc('text', "#fff")} />
          </TouchableOpacity>
        </View>

        {/* Date Selection */}
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
                  // Reset weryfikacji przy zmianie daty
                  setVerificationStarted(false);
                  setExpectedJackets([]);
                  setTotalExpected(0);
                  setScannedJackets([]);
                  setComparisonResults(null);
                }
              }}
            />
          )}
        </View>

        {/* Expected Count */}
        {!verificationStarted ? (
          <TouchableOpacity
            style={styles.startButton}
            onPress={startVerification}
            disabled={!selectedUserId || !selectedDate || loading}
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
          <>
            <View style={styles.countSection}>
              <Text style={styles.countLabel}>Liczba kurtek do sprawdzenia:</Text>
              <Text style={styles.countValue}>{totalExpected}</Text>
            </View>

            {/* Expected Jackets List */}
            {expectedJackets.length > 0 && (
              <View style={styles.expectedSection}>
                <Text style={styles.expectedTitle}>Oczekiwane kurtki ({totalExpected})</Text>
                <ScrollView style={styles.expectedList} nestedScrollEnabled>
                  {expectedJackets.map((jacket, index) => (
                    <View key={`expected-${index}`} style={styles.expectedItem}>
                      <Text style={styles.expectedName}>
                        {jacket.fullName || jacket.barcode} {jacket.size}
                      </Text>
                      <Text style={styles.expectedCode}>{jacket.barcode}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Progress */}
            {totalExpected > 0 && (
              <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Postęp skanowania</Text>
                  <Text style={styles.progressPercentage}>{scanProgress.percentage}%</Text>
                </View>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${scanProgress.percentage}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  Zeskanowano: {scanProgress.totalScanned} / {scanProgress.totalExpected}
                </Text>
              </View>
            )}

            {/* Scanner Button */}
            {totalExpected > 0 && (
              <TouchableOpacity style={styles.scanButton} onPress={openQRScanner}>
                <Ionicons name="qr-code-outline" size={32} color="#fff" />
                <Text style={styles.scanButtonText}>Skanuj Kurtki</Text>
              </TouchableOpacity>
            )}

            {/* Check Button */}
            {scannedJackets.length > 0 && (
              <TouchableOpacity style={styles.checkButton} onPress={checkVerification}>
                <Ionicons name="checkmark-done-circle" size={32} color="#fff" />
                <Text style={styles.checkButtonText}>Sprawdź zgodność</Text>
              </TouchableOpacity>
            )}

            {/* Scanned Jackets List */}
            {scannedJackets.length > 0 && (
              <View style={styles.scannedSection}>
                <View style={styles.scannedHeader}>
                  <Text style={styles.scannedTitle}>
                    Zeskanowane ({scannedJackets.length})
                  </Text>
                  <TouchableOpacity onPress={clearScannedJackets}>
                    <Text style={styles.clearButton}>Wyczyść</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={scannedJackets}
                  renderItem={renderScannedJacket}
                  keyExtractor={(item, index) => `${item.barcode || item.code}-${index}`}
                  scrollEnabled={false}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* QR Scanner Modal */}
      <Modal visible={scannerVisible} animationType="slide" onRequestClose={closeScanner}>
        <SafeAreaView style={{ backgroundColor: tc('bg', "#000"), flex: 1 }}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity onPress={closeScanner} style={styles.closeButton}>
              <Ionicons name="close" size={28} color={tc('text', "white")} />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Skanuj kody kurtek</Text>
            <TouchableOpacity
              onPress={() => setFacing(facing === "back" ? "front" : "back")}
              style={styles.cameraFlipButton}
            >
              <Ionicons name="camera-reverse" size={24} color={tc('text', "white")} />
            </TouchableOpacity>
          </View>

          <View style={styles.scannerCameraContainer}>
            <CameraView
              style={styles.camera}
              facing={facing}
              barcodeScannerSettings={{
                barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code39", "code128"],
              }}
              onBarcodeScanned={scanningEnabled ? handleScan : undefined}
            >
              {/* Scanner overlay */}
              <View style={styles.overlay}>
                <View
                  style={[
                    styles.scanArea,
                    { borderColor: scanningEnabled ? "#0D6EFD" : "#6c757d" },
                  ]}
                />
                {showPendingUI && pendingScan && (
                  <View style={styles.pendingScanOverlay}>
                    <Text style={styles.pendingScanText}>
                      Zeskanowano: {pendingScan.fullName || pendingScan.barcode} {pendingScan.size}
                    </Text>
                    <Text style={styles.pendingScanSubtext}>
                      Zatwierdź skan, aby kontynuować
                    </Text>
                  </View>
                )}
              </View>
            </CameraView>
          </View>

          {/* Scanned jackets list */}
          {scannedJackets.length > 0 && (
            <View style={styles.scannedListContainer}>
              <View style={styles.scannedListHeader}>
                <Text style={styles.scannedListTitle}>
                  Zeskanowane kurtki ({scannedJackets.length} / {totalExpected})
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setConfirmClearModalVisible(true);
                  }}
                  style={styles.clearListButtonSmall}
                >
                  <Ionicons name="trash-outline" size={18} color="#ff4444" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={scannedJackets}
                horizontal
                keyExtractor={(item, index) => `${item.barcode || item.code}-${index}`}
                renderItem={({ item, index }) => (
                  <View style={styles.scannedJacket}>
                    <TouchableOpacity
                      onPress={() => {
                        setScannedJackets(prev => prev.filter((_, i) => i !== index));
                      }}
                      style={styles.removeJacketButton}
                    >
                      <Ionicons name="close" size={16} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.jacketName} numberOfLines={2}>
                      {item.fullName || item.name || "Nieznany"} {item.size}
                    </Text>
                    <Text style={styles.jacketCode}>{item.barcode || item.code}</Text>
                    <Text style={styles.jacketTime}>
                      {new Date(item.scannedAt).toLocaleTimeString()}
                    </Text>
                  </View>
                )}
                showsHorizontalScrollIndicator={false}
              />
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.scannerFooter}>
            <View style={styles.actionButtonsRow}>
              {showPendingUI && pendingScan && (
                <TouchableOpacity
                  onPress={() => {
                    // Dodaj do listy po zatwierdzeniu
                    setScannedJackets((prev) => [pendingScan, ...prev]);
                    
                    // Natychmiast ukryj UI i odblokuj przetwarzanie
                    setShowPendingUI(false);
                    setPendingScan(null);
                    isProcessingRef.current = false;
                    
                    // Wyczyść lastScannedCode (NIE czyścimy mapy - zachowujemy blokadę 5s)
                    setLastScannedCode("");
                    
                    // Włącz skanowanie ponownie
                    setTimeout(() => {
                      setScanningEnabled(true);
                    }, 100);
                  }}
                  style={styles.confirmScanButton}
                >
                  <Ionicons name="checkmark-circle" size={24} color="white" />
                  <Text style={styles.confirmScanButtonText}>
                    Zatwierdź skan
                  </Text>
                </TouchableOpacity>
              )}
              
              {(pendingScan || scannedJackets.length > 0) && (
                <TouchableOpacity
                  onPress={() => {
                    closeScanner();
                    setTimeout(() => checkVerification(), 100);
                  }}
                  style={styles.confirmButton}
                >
                  <Ionicons name="document-text" size={24} color="white" />
                  <Text style={styles.confirmButtonText}>
                    Sprawdź zgodność
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Comparison Modal */}
      <Modal visible={comparisonModalVisible} animationType="slide" transparent>
        <View style={styles.comparisonModalContainer}>
          <View style={styles.comparisonModal}>
            <View style={styles.comparisonHeader}>
              <Text style={styles.comparisonTitle}>Wynik weryfikacji</Text>
              <TouchableOpacity onPress={() => setComparisonModalVisible(false)}>
                <Ionicons name="close" size={32} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.comparisonContent}>
              <View style={styles.comparisonSummary}>
                <Text style={styles.summaryText}>
                  Oczekiwano: {comparisonResults?.currentStateCount || 0}
                </Text>
                <Text style={styles.summaryText}>
                  Zeskanowano: {comparisonResults?.remanentCount || 0}
                </Text>
              </View>

              {comparisonResults?.missingItems?.length > 0 && (
                <View style={styles.comparisonSection}>
                  <Text style={styles.comparisonSectionTitle}>
                    ❌ Brakujące ({comparisonResults.missingItems.length})
                  </Text>
                  {comparisonResults.missingItems.map((item, index) => (
                    <View key={`missing-${index}`} style={styles.comparisonItem}>
                      <View style={styles.comparisonItemInfo}>
                        <Text style={styles.comparisonItemName}>{item.name}</Text>
                        <Text style={styles.comparisonItemDetails}>
                          {item.code} | {item.size}
                        </Text>
                        <Text style={styles.comparisonItemCount}>
                          Oczekiwano: {item.expectedCount}, Zeskanowano: {item.actualCount}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {comparisonResults?.extraItems?.length > 0 && (
                <View style={styles.comparisonSection}>
                  <Text style={styles.comparisonSectionTitle}>
                    ➕ Nadwyżki ({comparisonResults.extraItems.length})
                  </Text>
                  {comparisonResults.extraItems.map((item, index) => (
                    <View key={`extra-${index}`} style={styles.comparisonItem}>
                      <View style={styles.comparisonItemInfo}>
                        <Text style={styles.comparisonItemName}>{item.name}</Text>
                        <Text style={styles.comparisonItemDetails}>
                          {item.code} | {item.size}
                        </Text>
                        <Text style={styles.comparisonItemCount}>
                          Oczekiwano: {item.expectedCount}, Zeskanowano: {item.actualCount}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {comparisonResults?.missingItems?.length === 0 &&
                comparisonResults?.extraItems?.length === 0 && (
                  <View style={styles.successContainer}>
                    <Ionicons name="checkmark-circle" size={64} color="#0D6EFD" />
                    <Text style={styles.successText}>
                      Weryfikacja zakończona pomyślnie!
                    </Text>
                    <Text style={styles.successSubtext}>
                      Wszystkie kurtki się zgadzają
                    </Text>
                  </View>
                )}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => setComparisonModalVisible(false)}
            >
              <Text style={styles.closeModalButtonText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* User Selection Modal */}
      <Modal visible={showUserModal} animationType="slide" transparent>
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
                    // Reset weryfikacji przy zmianie użytkownika
                    setVerificationStarted(false);
                    setExpectedJackets([]);
                    setTotalExpected(0);
                    setScannedJackets([]);
                    setComparisonResults(null);
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
      <Modal visible={infoModalVisible} animationType="fade" transparent>
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

      {/* Confirm Clear Modal */}
      <Modal visible={confirmClearModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <View style={styles.confirmModalHeader}>
              <Ionicons name="warning" size={48} color="#ff4444" />
            </View>
            <View style={styles.confirmModalContent}>
              <Text style={styles.confirmModalTitle}>Wyczyść listę</Text>
              <Text style={styles.confirmModalMessage}>
                Czy na pewno chcesz usunąć wszystkie zeskanowane kurtki?
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
                  setScannedJackets([]);
                  setPendingScan(null);
                  setScanningEnabled(true);
                  setLastScannedCode("");
                  setRecentlyScannedCodes(new Map());
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
  container: {
    flex: 1,
    backgroundColor: tc('bg', "#000000"),
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#232533"),
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: tc('text', "#fff"),
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: tc('muted', "#CDCDE0"),
  },
  section: {
    padding: 20,
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
  expectedSection: {
    padding: 20,
    maxHeight: 300,
  },
  expectedTitle: {
    color: tc('text', "#fff"),
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  expectedList: {
    maxHeight: 250,
  },
  expectedItem: {
    backgroundColor: tc('surface', "#1E1E2D"),
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
  },
  expectedName: {
    color: tc('text', "#fff"),
    fontSize: 14,
    marginBottom: 4,
  },
  expectedCode: {
    color: tc('muted', "#CDCDE0"),
    fontSize: 12,
  },
  countSection: {
    alignItems: "center",
    padding: 20,
    backgroundColor: tc('surface', "#1E1E2D"),
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
  },
  countLabel: {
    color: tc('muted', "#CDCDE0"),
    fontSize: 14,
    marginBottom: 8,
  },
  countValue: {
    color: "#dc3545",
    fontSize: 48,
    fontWeight: "bold",
  },
  progressSection: {
    padding: 20,
    marginHorizontal: 20,
    backgroundColor: tc('surface', "#1E1E2D"),
    borderRadius: 12,
    marginTop: 16,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  progressTitle: {
    color: tc('text', "#fff"),
    fontSize: 16,
    fontWeight: "600",
  },
  progressPercentage: {
    color: "#dc3545",
    fontSize: 18,
    fontWeight: "bold",
  },
  progressBar: {
    height: 12,
    backgroundColor: tc('surface', "#232533"),
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#dc3545",
    borderRadius: 6,
  },
  progressText: {
    color: "#CDCDE0",
    fontSize: 14,
    textAlign: "center",
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D6EFD",
    padding: 20,
    margin: 20,
    borderRadius: 12,
    gap: 12,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  checkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D6EFD",
    padding: 20,
    margin: 20,
    marginTop: 0,
    borderRadius: 12,
    gap: 12,
  },
  checkButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  scannedSection: {
    padding: 20,
  },
  scannedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  scannedTitle: {
    color: tc('text', "#fff"),
    fontSize: 18,
    fontWeight: "600",
  },
  clearButton: {
    color: "#dc3545",
    fontSize: 14,
    fontWeight: "600",
  },
  jacketItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: tc('surface', "#1E1E2D"),
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
  },
  jacketItemError: {
    borderColor: "#dc3545",
    borderWidth: 2,
  },
  jacketInfo: {
    flex: 1,
  },
  jacketName: {
    color: tc('text', "#fff"),
    fontSize: 16,
    marginBottom: 4,
  },
  jacketCode: {
    color: tc('muted', "#CDCDE0"),
    fontSize: 14,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: tc('bg', "#000"),
  },
  scannerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: tc('bg', "#000"),
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraFlipButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerCameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#dc3545',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  pendingScanOverlay: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(13, 110, 253, 0.95)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    transform: [{ translateY: -50 }],
  },
  pendingScanText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  pendingScanSubtext: {
    color: 'white',
    fontSize: 13,
    fontWeight: '500',
  },
  scannedListContainer: {
    backgroundColor: tc('surface', '#1E1E2D'),
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#232533'),
    maxHeight: 140,
  },
  scannedListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  scannedListTitle: {
    color: tc('text', 'white'),
    fontSize: 16,
    fontWeight: '600',
  },
  clearListButtonSmall: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  scannedJacket: {
    backgroundColor: tc('surface', '#232533'),
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    minWidth: 120,
    position: 'relative',
  },
  removeJacketButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#dc3545',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  jacketTime: {
    color: '#CDCDE0',
    fontSize: 12,
  },
  scannerFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#232533'),
    backgroundColor: tc('bg', '#000'),
  },
  scannerProgressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  scannerInfo: {
    color: tc('text', '#fff'),
    fontSize: 16,
    fontWeight: '600',
  },
  scannerProgress: {
    color: '#dc3545',
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  confirmScanButton: {
    backgroundColor: '#0d6efd',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
    flex: 1,
    minWidth: 140,
  },
  confirmScanButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 0,
  },
  confirmButton: {
    backgroundColor: '#28a745',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
    flex: 1,
    minWidth: 140,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 0,
  },
  scannerTitle: {
    color: tc('text', "#fff"),
    fontSize: 18,
    fontWeight: "600",
  },
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
    color: "#fff",
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
  comparisonModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  comparisonModal: {
    backgroundColor: tc('surface', "#161622"),
    width: "90%",
    maxHeight: "80%",
    borderRadius: 16,
    overflow: "hidden",
  },
  comparisonHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: tc('surface', "#1E1E2D"),
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#232533"),
  },
  comparisonTitle: {
    color: tc('text', "#fff"),
    fontSize: 20,
    fontWeight: "bold",
  },
  comparisonContent: {
    padding: 20,
  },
  comparisonSummary: {
    backgroundColor: tc('surface', "#1E1E2D"),
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  summaryText: {
    color: tc('text', "#fff"),
    fontSize: 16,
    marginBottom: 8,
  },
  comparisonSection: {
    marginBottom: 20,
  },
  comparisonSectionTitle: {
    color: tc('text', "#fff"),
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  comparisonItem: {
    backgroundColor: tc('surface', "#1E1E2D"),
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
  },
  comparisonItemInfo: {
    flex: 1,
  },
  comparisonItemName: {
    color: tc('text', "#fff"),
    fontSize: 16,
    marginBottom: 4,
  },
  comparisonItemDetails: {
    color: tc('muted', "#CDCDE0"),
    fontSize: 14,
    marginBottom: 4,
  },
  comparisonItemCount: {
    color: "#ffc107",
    fontSize: 12,
  },
  successContainer: {
    alignItems: "center",
    padding: 40,
  },
  successText: {
    color: "#198754",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 16,
  },
  successSubtext: {
    color: "#CDCDE0",
    fontSize: 14,
    marginTop: 8,
  },
  closeModalButton: {
    backgroundColor: "#dc3545",
    padding: 16,
    alignItems: "center",
    margin: 20,
    borderRadius: 12,
  },
  closeModalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  scannerFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
    backgroundColor: tc('bg', "#000"),
  },
  scannerInfo: {
    color: tc('text', "#fff"),
    fontSize: 16,
  },
  scannerProgress: {
    color: "#dc3545",
    fontSize: 18,
    fontWeight: "bold",
  },
}));

export default Dashboard;
