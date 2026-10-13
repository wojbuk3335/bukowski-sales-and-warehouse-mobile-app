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
const LocalizationsList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const [localizations, setLocalizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingLocalization, setEditingLocalization] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Form states
  const [miejscKod, setMiejscKod] = useState("");
  const [miejscOpis, setMiejscOpis] = useState("");

  useEffect(() => {
    fetchLocalizations();
  }, []);

  const fetchLocalizations = async () => {
    try {
      setLoading(true);
      const url = getApiUrl("/excel/localization/get-all-localizations");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        // Filter only valid localizations (with code)
        const validLocalizations = (data.localizations || []).filter(
          item => item.Miejsc_1_Kod_1 && item.Miejsc_1_Kod_1.toString().trim() !== ""
        );
        
        // Sort by code descending (newest first)
        const sortedLocalizations = validLocalizations.sort((a, b) => {
          const codeA = parseInt(a.Miejsc_1_Kod_1) || 0;
          const codeB = parseInt(b.Miejsc_1_Kod_1) || 0;
          return codeB - codeA;
        });
        
        setLocalizations(sortedLocalizations);
      }
    } catch (error) {
      setErrorMessage("Nie udało się pobrać listy lokalizacji");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocalization = async () => {
    try {
      setLoading(true);
      
      // Get all localizations to find next code
      const url = getApiUrl("/excel/localization/get-all-localizations");
      const response = await tokenService.authenticatedFetch(url);
      
      if (!response.ok) {
        throw new Error("Nie udało się pobrać listy lokalizacji");
      }
      
      const data = await response.json();
      const localizationList = data.localizations || [];
      
      let nextCode;
      if (localizationList.length === 0) {
        nextCode = 1;
      } else {
        const maxCode = Math.max(...localizationList.map(loc => Number(loc.Miejsc_1_Kod_1) || 0));
        nextCode = maxCode + 1;
      }
      
      // Create new localization
      const newLoc = {
        Miejsc_1_Kod_1: nextCode.toString(),
        Miejsc_1_Opis_1: ""
      };
      
      const addUrl = getApiUrl("/excel/localization/insert-many-localizations");
      const addResponse = await tokenService.authenticatedFetch(addUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([newLoc]),
      });
      
      if (addResponse.ok) {
        setSuccessMessage("Nowa lokalizacja została dodana");
        setShowSuccessModal(true);
        fetchLocalizations();
      } else {
        const errorData = await addResponse.json();
        setErrorMessage(errorData.error?.message || "Nie udało się dodać lokalizacji");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas dodawania lokalizacji");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEditLocalization = (localization) => {
    setEditingLocalization(localization);
    setMiejscKod(localization.Miejsc_1_Kod_1);
    setMiejscOpis(localization.Miejsc_1_Opis_1 || "");
    setShowModal(true);
  };

  const handleSaveLocalization = async () => {
    if (!miejscOpis.trim()) {
      setErrorMessage("Opis lokalizacji jest wymagany");
      setShowErrorModal(true);
      return;
    }

    // Check for duplicate Miejsc_1_Opis_1
    const duplicate = localizations.find(
      loc => 
        loc.Miejsc_1_Opis_1?.toLowerCase().trim() === miejscOpis.toLowerCase().trim() && 
        loc._id !== editingLocalization?._id
    );

    if (duplicate) {
      setErrorMessage(`Lokalizacja "${miejscOpis}" już istnieje w bazie danych. Proszę wybrać inną nazwę.`);
      setShowErrorModal(true);
      return;
    }

    try {
      const url = getApiUrl(`/excel/localization/update-localization/${editingLocalization._id}`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Miejsc_1_Opis_1: miejscOpis.trim(),
        }),
      });

      if (response.ok) {
        setSuccessMessage("Lokalizacja została zaktualizowana");
        setShowModal(false);
        setShowSuccessModal(true);
        fetchLocalizations();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error?.message || "Nie udało się zaktualizować lokalizacji");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas zapisywania");
      setShowErrorModal(true);
    }
  };

  const filteredLocalizations = localizations.filter((loc) =>
    loc.Miejsc_1_Opis_1?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loc.Miejsc_1_Kod_1?.toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderLocalization = ({ item, index }) => {
    return (
      <View style={styles.localizationCard}>
        <View style={styles.localizationHeader}>
          <View style={styles.localizationInfo}>
            <Text style={styles.localizationName}>
              {item.Miejsc_1_Opis_1 || "(Brak opisu)"}
            </Text>
            <Text style={styles.localizationCode}>KOD: {item.Miejsc_1_Kod_1}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditLocalization(item)}
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
        <Text style={styles.headerTitle}>Lista lokalizacji</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddLocalization}
          disabled={loading}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj lokalizacji..."
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

      {/* Localizations List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#EF4444" />
        </View>
      ) : filteredLocalizations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>
            {searchTerm ? "Nie znaleziono lokalizacji" : "Brak lokalizacji"}
          </Text>
          {!searchTerm && (
            <Text style={styles.emptyHint}>
              Naciśnij "+" aby dodać nową lokalizację
            </Text>
          )}
        </View>
      ) : (
        <>
          <View style={styles.countContainer}>
            <Text style={styles.countText}>
              Znaleziono: {filteredLocalizations.length} lokalizacji
            </Text>
          </View>
          <FlatList
            data={filteredLocalizations}
            renderItem={renderLocalization}
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
                Edytuj lokalizację
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={28} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Kod lokalizacji */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Kod lokalizacji</Text>
                <TextInput
                  style={[styles.formInput, styles.formInputDisabled]}
                  value={miejscKod}
                  editable={false}
                />
                <Text style={styles.formHint}>Kod nie może być edytowany</Text>
              </View>

              {/* Opis lokalizacji */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Opis lokalizacji *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Wpisz opis lokalizacji"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={miejscOpis}
                  onChangeText={setMiejscOpis}
                />
                <Text style={styles.formHint}>Opis musi być unikalny</Text>
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
                onPress={handleSaveLocalization}
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
    backgroundColor: "#EF4444",
    borderRadius: 20,
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
  localizationCard: {
    backgroundColor: tc('surface', "#0A0A0A"),
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  localizationHeader: {
    marginBottom: 12,
  },
  localizationInfo: {
    flex: 1,
  },
  localizationName: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  localizationCode: {
    fontSize: 13,
    color: tc('muted', "#64748B"),
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    backgroundColor: "#EF4444",
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
    backgroundColor: "#EF4444",
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

export default LocalizationsList;
