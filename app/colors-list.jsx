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
const ColorsList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const [colors, setColors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingColor, setEditingColor] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Form states
  const [kolKod, setKolKod] = useState("");
  const [kolOpis, setKolOpis] = useState("");

  useEffect(() => {
    fetchColors();
  }, []);

  // Odświeżanie listy przeciągnięciem w dół - bez pełnoekranowego kręciołka
  const { refreshControl } = usePullToRefresh(() => fetchColors({ silent: true }));

  const fetchColors = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true); // silent: odświeżanie gestem, lista zostaje na ekranie
      const url = getApiUrl("/excel/color/get-all-colors");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const sortedColors = (data.colors || []).sort((a, b) => {
          const aKod = a.Kol_Kod || '';
          const bKod = b.Kol_Kod || '';
          return aKod.localeCompare(bKod);
        });
        setColors(sortedColors);
      }
    } catch (error) {
      setErrorMessage("Nie udało się pobrać listy kolorów");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEditColor = (color) => {
    setEditingColor(color);
    setKolKod(color.Kol_Kod);
    setKolOpis(color.Kol_Opis);
    setShowModal(true);
  };

  const handleSaveColor = async () => {
    if (!kolKod.trim()) {
      setErrorMessage("Kod koloru jest wymagany");
      setShowErrorModal(true);
      return;
    }

    if (!kolOpis.trim()) {
      setErrorMessage("Nazwa koloru jest wymagana");
      setShowErrorModal(true);
      return;
    }

    // Convert to uppercase for validation
    const upperCaseKolOpis = kolOpis.trim().toUpperCase();

    // Check for duplicate Kol_Opis (uppercase comparison)
    const duplicate = colors.find(
      color => 
        color.Kol_Opis.toUpperCase() === upperCaseKolOpis && 
        color._id !== editingColor?._id
    );

    if (duplicate) {
      setErrorMessage(`Kolor "${upperCaseKolOpis}" już istnieje w bazie danych. Proszę wybrać inną nazwę.`);
      setShowErrorModal(true);
      return;
    }

    try {
      // Update existing color
      const url = getApiUrl(`/excel/color/update-color/${editingColor._id}`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Kol_Opis: upperCaseKolOpis, // Send uppercase to backend
        }),
      });

      if (response.ok) {
        setSuccessMessage("Kolor został zaktualizowany");
        setShowModal(false);
        setShowSuccessModal(true);
        fetchColors();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error?.message || "Nie udało się zaktualizować koloru");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas zapisywania");
      setShowErrorModal(true);
    }
  };



  const filteredColors = colors.filter((color) =>
    color.Kol_Opis?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    color.Kol_Kod?.toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderColor = ({ item, index }) => {
    return (
      <View style={styles.colorCard}>
        <View style={styles.colorHeader}>
          <View style={styles.colorInfo}>
            <Text style={styles.colorName}>{item.Kol_Opis}</Text>
            <Text style={styles.colorCode}>KOD: {item.Kol_Kod}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditColor(item)}
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
          title="Lista kolorów"
          icon="color-palette-outline"
          color="#8B5CF6"
          onBack={() => router.back()}
        />

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj koloru..."
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

        {/* Colors List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#8B5CF6" />
          </View>
        ) : filteredColors.length === 0 ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.emptyContainer, { flexGrow: 1 }]} refreshControl={refreshControl} alwaysBounceVertical keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            <Ionicons name="color-palette-outline" size={64} color="#475569" />
            <Text style={styles.emptyText}>
              {searchTerm ? "Nie znaleziono kolorów" : "Brak kolorów"}
            </Text>
          </ScrollView>
        ) : (
          <>
            <View style={styles.countContainer}>
              <Text style={styles.countText}>
                Znaleziono: {filteredColors.length} kolorów
              </Text>
            </View>
            <FlatList
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
              data={filteredColors}
              renderItem={renderColor}
              keyExtractor={(item) => item._id}
              contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(120, insets.bottom + 120) }]}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
              alwaysBounceVertical
            />
          </>
        )}
      </KeyboardSafeScreen>

      {/* Add/Edit Modal */}
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
              <ModalHeader icon="create-outline" color="#8B5CF6" title="Edytuj kolor" />

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                {/* Kod koloru */}
                <View style={styles.formGroup}>
                  <Text style={look.formLabel}>Kod koloru *</Text>
                  <TextInput
                    style={[look.formInput, editingColor && styles.formInputDisabled]}
                    placeholder="Wpisz kod (np. 01)"
                    placeholderTextColor={tc('muted', "#64748B")}
                    value={kolKod}
                    onChangeText={setKolKod}
                    editable={!editingColor}
                  />
                  {editingColor && (
                    <Text style={styles.formHint}>Kod nie może być edytowany</Text>
                  )}
                </View>

                {/* Nazwa koloru */}
                <View style={styles.formGroup}>
                  <Text style={look.formLabel}>Nazwa koloru *</Text>
                  <TextInput
                    style={look.formInput}
                    placeholder="Wpisz nazwę (np. CZERWONY)"
                    placeholderTextColor={tc('muted', "#64748B")}
                    value={kolOpis}
                    onChangeText={setKolOpis}
                    autoCapitalize="characters"
                  />
                  <Text style={styles.formHint}>Nazwa będzie zapisana dużymi literami</Text>
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
                  onPress={handleSaveColor}
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
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  colorCard: {
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
    borderLeftColor: "#8B5CF6",
  },
  colorHeader: {
    flex: 1,
  },
  colorInfo: {
    flex: 1,
  },
  colorName: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  colorCode: {
    fontSize: 13,
    color: tc('muted', "#64748B"),
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

export default ColorsList;
