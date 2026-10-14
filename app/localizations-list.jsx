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

  // Odświeżanie listy przeciągnięciem w dół - bez pełnoekranowego kręciołka
  const { refreshControl } = usePullToRefresh(() => fetchLocalizations({ silent: true }));

  const fetchLocalizations = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true); // silent: odświeżanie gestem, lista zostaje na ekranie
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
        title="Lista lokalizacji"
        icon="location-outline"
        color="#EF4444"
        onBack={() => router.back()}
        right={<IconButton icon="add" color="#EF4444" onPress={handleAddLocalization} disabled={loading} accessibilityLabel="Dodaj" />}
      />

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
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.emptyContainer, { flexGrow: 1 }]} refreshControl={refreshControl} alwaysBounceVertical>
          <Ionicons name="location-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>
            {searchTerm ? "Nie znaleziono lokalizacji" : "Brak lokalizacji"}
          </Text>
          {!searchTerm && (
            <Text style={styles.emptyHint}>
              Naciśnij "+" aby dodać nową lokalizację
            </Text>
          )}
        </ScrollView>
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
            refreshControl={refreshControl}
            alwaysBounceVertical
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
            <ModalHeader icon="create-outline" color="#EF4444" title="Edytuj lokalizację" />

            <ScrollView style={styles.modalBody}>
              {/* Kod lokalizacji */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Kod lokalizacji</Text>
                <TextInput
                  style={[look.formInput, styles.formInputDisabled]}
                  value={miejscKod}
                  editable={false}
                />
                <Text style={styles.formHint}>Kod nie może być edytowany</Text>
              </View>

              {/* Opis lokalizacji */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Opis lokalizacji *</Text>
                <TextInput
                  style={look.formInput}
                  placeholder="Wpisz opis lokalizacji"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={miejscOpis}
                  onChangeText={setMiejscOpis}
                />
                <Text style={styles.formHint}>Opis musi być unikalny</Text>
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
                onPress={handleSaveLocalization}
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
  localizationCard: {
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
    borderLeftColor: "#EF4444",
  },
  localizationHeader: {
    flex: 1,
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

export default LocalizationsList;
