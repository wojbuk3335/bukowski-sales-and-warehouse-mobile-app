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

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
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

  const fetchWallets = async () => {
    try {
      setLoading(true);
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
        >
          <Ionicons name="pencil" size={18} color="#fff" />
          <Text style={styles.editButtonText}>Edytuj</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={tc('text', "#fff")} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tabela portfeli</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddWallet}
          disabled={loading}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

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
        <View style={styles.emptyContainer}>
          <Ionicons name="wallet-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>
            {searchTerm ? "Nie znaleziono portfeli" : "Brak portfeli"}
          </Text>
          {!searchTerm && (
            <Text style={styles.emptyHint}>
              Naciśnij "+" aby dodać nowy portfel
            </Text>
          )}
        </View>
      ) : (
        <>
          <View style={styles.countContainer}>
            <Text style={styles.countText}>
              Znaleziono: {filteredWallets.length} / {wallets.length} portfeli
            </Text>
          </View>
          <FlatList
            data={filteredWallets}
            renderItem={renderWallet}
            keyExtractor={(item) => item._id}
            contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(120, insets.bottom + 120) }]}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      {/* Edit Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Edytuj portfel
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={28} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Numer portfela */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Numer portfela</Text>
                <TextInput
                  style={[styles.formInput, styles.formInputDisabled]}
                  value={portfeleNr}
                  editable={false}
                />
                <Text style={styles.formHint}>Numer nie może być edytowany</Text>
              </View>

              {/* Kod portfela */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Kod portfela</Text>
                <TextInput
                  style={styles.formInput}
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

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.cancelButtonText}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveWallet}
              >
                <Text style={styles.saveButtonText}>Zapisz</Text>
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
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={64} color="#10B981" />
            </View>
            <Text style={styles.successTitle}>Sukces!</Text>
            <Text style={styles.successMessage}>{successMessage}</Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={styles.successButtonText}>OK</Text>
            </TouchableOpacity>
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
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="close-circle" size={64} color="#DC2626" />
            </View>
            <Text style={styles.successTitle}>Błąd</Text>
            <Text style={styles.successMessage}>{errorMessage}</Text>
            <TouchableOpacity
              style={[styles.successButton, { backgroundColor: '#DC2626' }]}
              onPress={() => setShowErrorModal(false)}
            >
              <Text style={styles.successButtonText}>OK</Text>
            </TouchableOpacity>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: tc('bg', "#000000"),
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: tc('text', "#fff"),
  },
  addButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#A855F7",
    borderRadius: 20,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#1E293B"),
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: tc('muted', "#94A3B8"),
  },
  startingNumberContainer: {
    backgroundColor: tc('surface', "#0A0A0A"),
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#A855F7",
  },
  startingNumberLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 8,
  },
  startingNumberInput: {
    backgroundColor: tc('surface', "#000000"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  startingNumberHint: {
    fontSize: 12,
    color: tc('muted', "#64748B"),
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#0A0A0A"),
    marginHorizontal: 20,
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: tc('text', "#fff"),
  },
  countContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  countText: {
    fontSize: 14,
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
  emptyHint: {
    fontSize: 14,
    color: "#475569",
    marginTop: 8,
    textAlign: "center",
  },
  listContainer: {
    padding: 20,
    paddingTop: 0,
  },
  walletCard: {
    backgroundColor: tc('surface', "#0A0A0A"),
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  walletHeader: {
    marginBottom: 12,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    backgroundColor: "#A855F7",
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: tc('bg', "#0A0A0A"),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: tc('text', "#fff"),
  },
  modalBody: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 8,
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
    backgroundColor: tc('bg', "#0A0A0A"),
    color: tc('muted', "#64748B"),
  },
  formHint: {
    fontSize: 12,
    color: tc('muted', "#64748B"),
    marginTop: 4,
  },
  modalActions: {
    flexDirection: "row",
    padding: 20,
    paddingTop: 0,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: tc('surface', "#1E293B"),
  },
  saveButton: {
    backgroundColor: "#A855F7",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  successModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  successModalContent: {
    backgroundColor: tc('surface', "#0A0A0A"),
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    width: "80%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  successIconContainer: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: tc('text', "#fff"),
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 16,
    color: tc('muted', "#94A3B8"),
    textAlign: "center",
    marginBottom: 24,
  },
  successButton: {
    backgroundColor: "#10B981",
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
  },
  successButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
}));

export default WalletsList;
