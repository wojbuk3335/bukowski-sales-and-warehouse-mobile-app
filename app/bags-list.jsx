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
import { PageHeader, IconButton, ModalHeader, look } from '../components/AdminLook'; // wspólny wygląd (styl panelu admina)
const BagsList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const [bags, setBags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingBag, setEditingBag] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Form states
  const [torebkiNr, setTorebkiNr] = useState("");
  const [torebkiKod, setTorebkiKod] = useState("");
  const [startingNumber, setStartingNumber] = useState(1000);

  useEffect(() => {
    fetchBags();
  }, []);

  const fetchBags = async () => {
    try {
      setLoading(true);
      const url = getApiUrl("/excel/bags/get-all-bags");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        // Sort by number descending (newest first)
        const sortedBags = (data.bags || []).sort((a, b) => {
          return Number(b.Torebki_Nr) - Number(a.Torebki_Nr);
        });
        
        setBags(sortedBags);
      }
    } catch (error) {
      setErrorMessage("Nie udało się pobrać listy torebek");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBag = async () => {
    try {
      setLoading(true);
      
      // Get all bags to find next number
      const url = getApiUrl("/excel/bags/get-all-bags");
      const response = await tokenService.authenticatedFetch(url);
      
      if (!response.ok) {
        throw new Error("Nie udało się pobrać listy torebek");
      }
      
      const data = await response.json();
      const bagList = data.bags || [];
      
      let nextTorebkiNr;
      if (bagList.length === 0) {
        // First row - use starting number, validate range
        if (startingNumber < 1000 || startingNumber > 9999) {
          setErrorMessage("Numer początkowy musi być w zakresie 1000-9999.");
          setShowErrorModal(true);
          setLoading(false);
          return;
        }
        nextTorebkiNr = startingNumber;
      } else {
        const maxTorebkiNr = Math.max(...bagList.map(bag => Number(bag.Torebki_Nr) || 0));
        nextTorebkiNr = maxTorebkiNr + 1;
      }
      
      // Check if we reached the limit (max 9999)
      if (nextTorebkiNr > 9999) {
        setErrorMessage("Osiągnięto maksymalną liczbę torebek (9999). Nie można dodać więcej.");
        setShowErrorModal(true);
        setLoading(false);
        return;
      }
      
      // Create new bag
      const newBag = {
        Torebki_Nr: nextTorebkiNr,
        Torebki_Kod: ""
      };
      
      const addUrl = getApiUrl("/excel/bags/insert-bags");
      const addResponse = await tokenService.authenticatedFetch(addUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([newBag]),
      });
      
      if (addResponse.ok) {
        setSuccessMessage("Nowa torebka została dodana");
        setShowSuccessModal(true);
        fetchBags();
      } else {
        const errorData = await addResponse.json();
        setErrorMessage(errorData.error?.message || "Nie udało się dodać torebki");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas dodawania torebki");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEditBag = (bag) => {
    setEditingBag(bag);
    setTorebkiNr(bag.Torebki_Nr.toString());
    setTorebkiKod(bag.Torebki_Kod || "");
    setShowModal(true);
  };

  const validateTorebkiKod = (value) => {
    // Allow empty string
    if (value === '') return value;
    
    // Check if value contains a decimal point
    if (value.includes('.')) {
      const parts = value.split('.');
      // If there's more than one decimal point, return the current value
      if (parts.length > 2) return torebkiKod;
      
      // Limit decimal places to maximum 3 digits
      if (parts[1] && parts[1].length > 3) {
        return parts[0] + '.' + parts[1].slice(0, 3);
      }
    }
    
    return value;
  };

  const handleSaveBag = async () => {
    const validatedKod = validateTorebkiKod(torebkiKod);
    
    // Check for duplicate Torebki_Kod (only if not empty)
    if (validatedKod !== "") {
      const duplicate = bags.find(
        bag => 
          bag.Torebki_Kod === validatedKod && 
          bag._id !== editingBag?._id
      );

      if (duplicate) {
        setErrorMessage(`Kod "${validatedKod}" już istnieje w bazie danych. Proszę wybrać inną wartość.`);
        setShowErrorModal(true);
        return;
      }
    }

    try {
      const url = getApiUrl(`/excel/bags/update-bags/${editingBag._id}`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Torebki_Kod: validatedKod,
        }),
      });

      if (response.ok) {
        setSuccessMessage("Torebka została zaktualizowana");
        setShowModal(false);
        setShowSuccessModal(true);
        fetchBags();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error?.message || "Nie udało się zaktualizować torebki");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas zapisywania");
      setShowErrorModal(true);
    }
  };

  const filteredBags = bags.filter((bag) =>
    bag.Torebki_Kod?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bag.Torebki_Nr?.toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderBag = ({ item, index }) => {
    return (
      <View style={styles.bagCard}>
        <View style={styles.bagHeader}>
          <View style={styles.bagInfo}>
            <Text style={styles.bagNumber}>Nr: {item.Torebki_Nr}</Text>
            <Text style={styles.bagCode}>
              Kod: {item.Torebki_Kod || "(Brak kodu)"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditBag(item)}
          accessibilityLabel="Edytuj"
        >
          <Ionicons name="pencil" size={18} color="#0D6EFD" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Nagłówek */}
      <PageHeader
        title="Tabela torebek"
        icon="bag-handle-outline"
        color="#EC4899"
        onBack={() => router.back()}
        right={<IconButton icon="add" color="#EC4899" onPress={handleAddBag} disabled={loading} accessibilityLabel="Dodaj" />}
      />

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color="#EC4899" />
        <Text style={styles.infoText}>
          Zakres: 1000-9999 (max 9000 pozycji)
        </Text>
      </View>

      {/* Starting Number Input - only visible when list is empty */}
      {bags.length === 0 && !loading && (
        <View style={styles.startingNumberContainer}>
          <Text style={styles.startingNumberLabel}>Numer początkowy:</Text>
          <TextInput
            style={styles.startingNumberInput}
            value={startingNumber.toString()}
            onChangeText={(text) => {
              const num = parseInt(text) || 1000;
              if (num < 1000) {
                setStartingNumber(1000);
              } else if (num > 9999) {
                setStartingNumber(9999);
              } else {
                setStartingNumber(num);
              }
            }}
            keyboardType="numeric"
            placeholder="1000"
            placeholderTextColor={tc('muted', "#64748B")}
          />
          <Text style={styles.startingNumberHint}>(zakres: 1000-9999)</Text>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj torebki..."
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

      {/* Bags List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#EC4899" />
        </View>
      ) : filteredBags.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="bag-handle-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>
            {searchTerm ? "Nie znaleziono torebek" : "Brak torebek"}
          </Text>
          {!searchTerm && (
            <Text style={styles.emptyHint}>
              Naciśnij "+" aby dodać nową torebkę
            </Text>
          )}
        </View>
      ) : (
        <>
          <View style={styles.countContainer}>
            <Text style={styles.countText}>
              Znaleziono: {filteredBags.length} / {bags.length} torebek
            </Text>
          </View>
          <FlatList
            data={filteredBags}
            renderItem={renderBag}
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
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="create-outline" color="#EC4899" title="Edytuj torebkę" />

            <ScrollView style={styles.modalBody}>
              {/* Numer torebki */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Numer torebki</Text>
                <TextInput
                  style={[look.formInput, styles.formInputDisabled]}
                  value={torebkiNr}
                  editable={false}
                />
                <Text style={styles.formHint}>Numer nie może być edytowany</Text>
              </View>

              {/* Kod torebki */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Kod torebki</Text>
                <TextInput
                  style={look.formInput}
                  placeholder="Wpisz kod (opcjonalnie, max 3 miejsca po przecinku)"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={torebkiKod}
                  onChangeText={(text) => setTorebkiKod(validateTorebkiKod(text))}
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
                onPress={handleSaveBag}
              >
                <Text style={look.buttonText}>Zapisz</Text>
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
    backgroundColor: "#EC48991A",
    borderWidth: 1,
    borderColor: "#EC489966",
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
    borderColor: "#EC4899",
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
  bagCard: {
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
    borderLeftColor: "#EC4899",
  },
  bagHeader: {
    flex: 1,
  },
  bagInfo: {
    flex: 1,
  },
  bagNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#EC4899",
    marginBottom: 4,
  },
  bagCode: {
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

export default BagsList;
