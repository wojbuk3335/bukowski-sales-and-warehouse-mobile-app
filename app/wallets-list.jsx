import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import tokenService from "../services/tokenService";
import { getApiUrl } from "../config/api";
import usePullToRefresh from '../hooks/usePullToRefresh';

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, IconButton, ModalHeader, look } from '../components/AdminLook'; // wspólny wygląd (styl panelu admina)
import { KeyboardSafeScreen, KeyboardSafeOverlay } from "../components/KeyboardSafe"; // klawiatura nie zasłania pól tekstowych
const WalletsList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingWallet, setEditingWallet] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Form states
  const [portfeleNr, setPortfeleNr] = useState("");
  const [portfeleKod, setPortfeleKod] = useState("");
  const [startingNumber, setStartingNumber] = useState(100);

  useEffect(() => {
    fetchWallets();
  }, []);

  // Odświeżanie listy przeciągnięciem w dół - bez pełnoekranowego kręciołka
  const { refreshControl } = usePullToRefresh(() => fetchWallets({ silent: true }));

  const fetchWallets = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true); // silent: odświeżanie gestem, lista zostaje na ekranie
      const url = getApiUrl("/excel/wallets/get-all-wallets");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        // Sort by number descending (newest first)
        const sortedWallets = (data.wallets || []).sort((a, b) => {
          return Number(b.Portfele_Nr) - Number(a.Portfele_Nr);
        });
        
        setWallets(sortedWallets);
      }
    } catch (error) {
      setErrorMessage("Nie udało się pobrać listy portfeli");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWallet = async () => {
    try {
      setLoading(true);
      
      // Get all wallets to find next number
      const url = getApiUrl("/excel/wallets/get-all-wallets");
      const response = await tokenService.authenticatedFetch(url);
      
      if (!response.ok) {
        throw new Error("Nie udało się pobrać listy portfeli");
      }
      
      const data = await response.json();
      const walletList = data.wallets || [];
      
      let nextPortfeleNr;
      if (walletList.length === 0) {
        // First row - use starting number, validate range
        if (startingNumber < 100 || startingNumber > 999) {
          setErrorMessage("Numer początkowy musi być w zakresie 100-999.");
          setShowErrorModal(true);
          setLoading(false);
          return;
        }
        nextPortfeleNr = startingNumber;
      } else {
        const maxPortfeleNr = Math.max(...walletList.map(wallet => Number(wallet.Portfele_Nr) || 0));
        nextPortfeleNr = maxPortfeleNr + 1;
      }
      
      // Check if we reached the limit (max 999)
      if (nextPortfeleNr > 999) {
        setErrorMessage("Osiągnięto maksymalną liczbę portfeli (999). Nie można dodać więcej.");
        setShowErrorModal(true);
        setLoading(false);
        return;
      }
      
      // Create new wallet
      const newWallet = {
        Portfele_Nr: nextPortfeleNr,
        Portfele_Kod: ""
      };
      
      const addUrl = getApiUrl("/excel/wallets/insert-wallets");
      const addResponse = await tokenService.authenticatedFetch(addUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([newWallet]),
      });
      
      if (addResponse.ok) {
        setSuccessMessage("Nowy portfel został dodany");
        setShowSuccessModal(true);
        fetchWallets();
      } else {
        const errorData = await addResponse.json();
        setErrorMessage(errorData.error?.message || "Nie udało się dodać portfela");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas dodawania portfela");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEditWallet = (wallet) => {
    setEditingWallet(wallet);
    setPortfeleNr(wallet.Portfele_Nr.toString());
    setPortfeleKod(wallet.Portfele_Kod || "");
    setShowModal(true);
  };

  const validatePortfeleKod = (value) => {
    // Allow empty string
    if (value === '') return value;
    
    // Check if value contains a decimal point
    if (value.includes('.')) {
      const parts = value.split('.');
      // If there's more than one decimal point, return the current value
      if (parts.length > 2) return portfeleKod;
      
      // Limit decimal places to maximum 3 digits
      if (parts[1] && parts[1].length > 3) {
        return parts[0] + '.' + parts[1].slice(0, 3);
      }
    }
    
    return value;
  };

  const handleSaveWallet = async () => {
    const validatedKod = validatePortfeleKod(portfeleKod);
    
    // Check for duplicate Portfele_Kod (only if not empty)
    if (validatedKod !== "") {
      const duplicate = wallets.find(
        wallet => 
          wallet.Portfele_Kod === validatedKod && 
          wallet._id !== editingWallet?._id
      );

      if (duplicate) {
        setErrorMessage(`Kod "${validatedKod}" już istnieje w bazie danych. Proszę wybrać inną wartość.`);
        setShowErrorModal(true);
        return;
      }
    }

    try {
      const url = getApiUrl(`/excel/wallets/update-wallets/${editingWallet._id}`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Portfele_Kod: validatedKod,
        }),
      });

      if (response.ok) {
        setSuccessMessage("Portfel został zaktualizowany");
        setShowModal(false);
        setShowSuccessModal(true);
        fetchWallets();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error?.message || "Nie udało się zaktualizować portfela");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas zapisywania");
      setShowErrorModal(true);
    }
  };

  const filteredWallets = wallets.filter((wallet) =>
    wallet.Portfele_Kod?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    wallet.Portfele_Nr?.toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderWallet = ({ item, index }) => {
    return (
      <View style={styles.walletCard}>
        <View style={styles.walletHeader}>
          <View style={styles.walletInfo}>
            <Text style={styles.walletNumber}>Nr: {item.Portfele_Nr}</Text>
            <Text style={styles.walletCode}>
              Kod: {item.Portfele_Kod || "(Brak kodu)"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditWallet(item)}
          accessibilityLabel="Edytuj"
        >
          <Ionicons name="pencil" size={18} color="#0D6EFD" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Klawiatura nie zasłania pola: ekran kurczy się nad klawiaturą i przewija do klikniętego pola */}
      <KeyboardSafeScreen>
        {/* Nagłówek */}
        <PageHeader
          title="Tabela portfeli"
          icon="wallet-outline"
          color="#A855F7"
          onBack={() => router.back()}
          right={<IconButton icon="add" color="#A855F7" onPress={handleAddWallet} disabled={loading} accessibilityLabel="Dodaj" />}
        />

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color="#A855F7" />
          <Text style={styles.infoText}>
            Zakres: 100-999 (max 900 pozycji)
          </Text>
        </View>

        {/* Starting Number Input - only visible when list is empty */}
        {wallets.length === 0 && !loading && (
          <View style={styles.startingNumberContainer}>
            <Text style={styles.startingNumberLabel}>Numer początkowy:</Text>
            <TextInput
              style={styles.startingNumberInput}
              value={startingNumber.toString()}
              onChangeText={(text) => {
                const num = parseInt(text) || 100;
                if (num < 100) {
                  setStartingNumber(100);
                } else if (num > 999) {
                  setStartingNumber(999);
                } else {
                  setStartingNumber(num);
                }
              }}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor={tc('muted', "#64748B")}
            />
            <Text style={styles.startingNumberHint}>(zakres: 100-999)</Text>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj portfela..."
            placeholderTextColor={tc('muted', "#64748B")}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity onPress={() => setSearchTerm("")}>
              <Ionicons name="close-circle" size={20} color={tc('muted', "#94A3B8")} />
            </TouchableOpacity>
          )}
        </View>

        {/* Wallets List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#A855F7" />
          </View>
        ) : filteredWallets.length === 0 ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.emptyContainer, { flexGrow: 1 }]} refreshControl={refreshControl} alwaysBounceVertical keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            <Ionicons name="wallet-outline" size={64} color="#475569" />
            <Text style={styles.emptyText}>
              {searchTerm ? "Nie znaleziono portfeli" : "Brak portfeli"}
            </Text>
            {!searchTerm && (
              <Text style={styles.emptyHint}>
                Naciśnij "+" aby dodać nowy portfel
              </Text>
            )}
          </ScrollView>
        ) : (
          <>
            <View style={styles.countContainer}>
              <Text style={styles.countText}>
                Znaleziono: {filteredWallets.length} / {wallets.length} portfeli
              </Text>
            </View>
            <FlatList
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
              data={filteredWallets}
              renderItem={renderWallet}
              keyExtractor={(item) => item._id}
              contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(120, insets.bottom + 120) }]}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
              alwaysBounceVertical
            />
          </>
        )}
      </KeyboardSafeScreen>

      {/* Edit Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        {/* Klawiatura nie zasłania pól: tło okienka kurczy się nad klawiaturą */}
        <KeyboardSafeOverlay>
          <View style={look.modalOverlay}>
            <View style={look.modalContent}>
              <ModalHeader icon="create-outline" color="#A855F7" title="Edytuj portfel" />

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                {/* Numer portfela */}
                <View style={styles.formGroup}>
                  <Text style={look.formLabel}>Numer portfela</Text>
                  <TextInput
                    style={[look.formInput, styles.formInputDisabled]}
                    value={portfeleNr}
                    editable={false}
                  />
                  <Text style={styles.formHint}>Numer nie może być edytowany</Text>
                </View>

                {/* Kod portfela */}
                <View style={styles.formGroup}>
                  <Text style={look.formLabel}>Kod portfela</Text>
                  <TextInput
                    style={look.formInput}
                    placeholder="Wpisz kod (opcjonalnie, max 3 miejsca po przecinku)"
                    placeholderTextColor={tc('muted', "#64748B")}
                    value={portfeleKod}
                    onChangeText={(text) => setPortfeleKod(validatePortfeleKod(text))}
                    keyboardType="numeric"
                  />
                  <Text style={styles.formHint}>
                    Kod musi być unikalny (jeśli podany)
                  </Text>
                </View>
              </ScrollView>

              <View style={[look.buttonRow, styles.modalActions]}>
                <TouchableOpacity
                  style={look.neutralButton}
                  onPress={() => setShowModal(false)}
                >
                  <Text style={look.neutralButtonText}>Anuluj</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[look.primaryButton, { backgroundColor: '#10B981' }]}
                  onPress={handleSaveWallet}
                >
                  <Text style={look.buttonText}>Zapisz</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardSafeOverlay>
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
                style={[look.primaryButton, { backgroundColor: '#10B981' }]}
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
            <ModalHeader icon="close-circle" color="#DC2626" title="Błąd" />
            <Text style={look.modalMessage}>{errorMessage}</Text>
            <View style={look.buttonRow}>
              <TouchableOpacity
                style={[look.primaryButton, { backgroundColor: '#DC2626' }]}
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
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#A855F71A",
    borderWidth: 1,
    borderColor: "#A855F766",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: tc('text', "#fff"),
  },
  startingNumberContainer: {
    backgroundColor: tc('surface', "#161622"),
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#A855F7",
  },
  startingNumberLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: tc('muted', "#94A3B8"),
    marginBottom: 6,
  },
  startingNumberInput: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: tc('text', "#fff"),
    marginBottom: 6,
  },
  startingNumberHint: {
    fontSize: 12,
    color: tc('muted', "#64748B"),
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#161622"),
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: tc('text', "#fff"),
  },
  countContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  countText: {
    fontSize: 13,
    fontWeight: "600",
    color: tc('muted', "#94A3B8"),
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
    fontWeight: "600",
    color: tc('muted', "#94A3B8"),
    marginTop: 16,
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 14,
    color: tc('muted', "#64748B"),
    marginTop: 8,
    textAlign: "center",
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  walletCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderLeftWidth: 4,
    borderLeftColor: "#A855F7",
  },
  walletHeader: {
    flex: 1,
  },
  walletInfo: {
    flex: 1,
  },
  walletNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#A855F7",
    marginBottom: 4,
  },
  walletCode: {
    fontSize: 14,
    color: tc('muted', "#94A3B8"),
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0D6EFD26",
    borderWidth: 1,
    borderColor: "#0D6EFD66",
  },
  modalBody: {
    flexGrow: 0,
  },
  formGroup: {
    marginBottom: 16,
  },
  formInput: {
    backgroundColor: tc('surface', "#000000"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: tc('text', "#fff"),
  },
  formInputDisabled: {
    opacity: 0.6,
    color: tc('muted', "#94A3B8"),
  },
  formHint: {
    fontSize: 12,
    color: tc('muted', "#64748B"),
    marginTop: 6,
  },
  modalActions: {
    marginTop: 4,
  },
}));

export default WalletsList;
