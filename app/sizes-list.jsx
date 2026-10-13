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
const SizesList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const [sizes, setSizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingSize, setEditingSize] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Form states
  const [rozKod, setRozKod] = useState("");
  const [rozOpis, setRozOpis] = useState("");

  useEffect(() => {
    fetchSizes();
  }, []);

  const fetchSizes = async () => {
    try {
      setLoading(true);
      const url = getApiUrl("/excel/size/get-all-sizes");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const sortedSizes = (data.sizes || []).sort((a, b) => {
          const aKod = a.Roz_Kod || '';
          const bKod = b.Roz_Kod || '';
          return aKod.localeCompare(bKod);
        });
        setSizes(sortedSizes);
      }
    } catch (error) {
      setErrorMessage("Nie udało się pobrać listy rozmiarów");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSize = (size) => {
    setEditingSize(size);
    setRozKod(size.Roz_Kod);
    setRozOpis(size.Roz_Opis);
    setShowModal(true);
  };

  const handleSaveSize = async () => {
    if (!rozKod.trim()) {
      setErrorMessage("Kod rozmiaru jest wymagany");
      setShowErrorModal(true);
      return;
    }

    if (!rozOpis.trim()) {
      setErrorMessage("Nazwa rozmiaru jest wymagana");
      setShowErrorModal(true);
      return;
    }

    // Check for duplicate Roz_Opis
    const duplicate = sizes.find(
      size => 
        size.Roz_Opis.toLowerCase().trim() === rozOpis.toLowerCase().trim() && 
        size._id !== editingSize?._id
    );

    if (duplicate) {
      setErrorMessage(`Rozmiar "${rozOpis}" już istnieje w bazie danych. Proszę wybrać inną nazwę.`);
      setShowErrorModal(true);
      return;
    }

    try {
      // Update existing size
      const url = getApiUrl(`/excel/size/update-size/${editingSize._id}`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Roz_Opis: rozOpis.trim(),
        }),
      });

      if (response.ok) {
        setSuccessMessage("Rozmiar został zaktualizowany");
        setShowModal(false);
        setShowSuccessModal(true);
        fetchSizes();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error?.message || "Nie udało się zaktualizować rozmiaru");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas zapisywania");
      setShowErrorModal(true);
    }
  };



  const filteredSizes = sizes.filter((size) =>
    size.Roz_Opis?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    size.Roz_Kod?.toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderSize = ({ item, index }) => {
    return (
      <View style={styles.sizeCard}>
        <View style={styles.sizeHeader}>
          <View style={styles.sizeInfo}>
            <Text style={styles.sizeName}>{item.Roz_Opis}</Text>
            <Text style={styles.sizeCode}>KOD: {item.Roz_Kod}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditSize(item)}
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
        title="Lista rozmiarów"
        icon="resize-outline"
        color="#06B6D4"
        onBack={() => router.back()}
      />

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj rozmiaru..."
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

      {/* Sizes List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#06B6D4" />
        </View>
      ) : filteredSizes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="resize-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>
            {searchTerm ? "Nie znaleziono rozmiarów" : "Brak rozmiarów"}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.countContainer}>
            <Text style={styles.countText}>
              Znaleziono: {filteredSizes.length} rozmiarów
            </Text>
          </View>
          <FlatList
            data={filteredSizes}
            renderItem={renderSize}
            keyExtractor={(item) => item._id}
            contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(120, insets.bottom + 120) }]}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="create-outline" color="#06B6D4" title="Edytuj rozmiar" />

            <ScrollView style={styles.modalBody}>
              {/* Kod rozmiaru */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Kod rozmiaru *</Text>
                <TextInput
                  style={[look.formInput, editingSize && styles.formInputDisabled]}
                  placeholder="Wpisz kod (np. XL)"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={rozKod}
                  onChangeText={setRozKod}
                  editable={!editingSize}
                />
                {editingSize && (
                  <Text style={styles.formHint}>Kod nie może być edytowany</Text>
                )}
              </View>

              {/* Nazwa rozmiaru */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Nazwa rozmiaru *</Text>
                <TextInput
                  style={look.formInput}
                  placeholder="Wpisz nazwę (np. Extra Large)"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={rozOpis}
                  onChangeText={setRozOpis}
                />
                <Text style={styles.formHint}>Nazwa musi być unikalna</Text>
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
                onPress={handleSaveSize}
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
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  sizeCard: {
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
    borderLeftColor: "#06B6D4",
  },
  sizeHeader: {
    flex: 1,
  },
  sizeInfo: {
    flex: 1,
  },
  sizeName: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  sizeCode: {
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

export default SizesList;
