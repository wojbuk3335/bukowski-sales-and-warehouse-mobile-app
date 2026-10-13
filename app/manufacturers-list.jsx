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
const ManufacturersList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const [manufacturers, setManufacturers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingManufacturer, setEditingManufacturer] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Form states
  const [prodKod, setProdKod] = useState("");
  const [prodOpis, setProdOpis] = useState("");

  useEffect(() => {
    fetchManufacturers();
  }, []);

  const fetchManufacturers = async () => {
    try {
      setLoading(true);
      const url = getApiUrl("/excel/manufacturers");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        // Sort by Prod_Kod descending (newest first)
        const sortedManufacturers = (data.manufacturers || []).sort((a, b) => {
          const codeA = parseInt(a.Prod_Kod) || 0;
          const codeB = parseInt(b.Prod_Kod) || 0;
          return codeB - codeA;
        });
        
        setManufacturers(sortedManufacturers);
      }
    } catch (error) {
      setErrorMessage("Nie udało się pobrać listy grup");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAddManufacturer = async () => {
    try {
      setLoading(true);
      
      // Get all manufacturers to find next code
      const url = getApiUrl("/excel/manufacturers");
      const response = await tokenService.authenticatedFetch(url);
      
      if (!response.ok) {
        throw new Error("Nie udało się pobrać listy grup");
      }
      
      const data = await response.json();
      const manufacturerList = data.manufacturers || [];
      
      let nextCode;
      if (manufacturerList.length === 0) {
        nextCode = 1; // Start from 1
      } else {
        const maxCode = Math.max(...manufacturerList.map(mfr => Number(mfr.Prod_Kod) || 0));
        nextCode = maxCode + 1;
      }
      
      // Create new manufacturer
      const newManufacturer = {
        Prod_Kod: nextCode.toString(),
        Prod_Opis: ""
      };
      
      const addUrl = getApiUrl("/excel/manufacturers");
      const addResponse = await tokenService.authenticatedFetch(addUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newManufacturer),
      });
      
      if (addResponse.ok) {
        setSuccessMessage("Nowa grupa została dodana");
        setShowSuccessModal(true);
        fetchManufacturers();
      } else {
        const errorData = await addResponse.json();
        setErrorMessage(errorData.message || "Nie udało się dodać grupy");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas dodawania grupy");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEditManufacturer = (manufacturer) => {
    setEditingManufacturer(manufacturer);
    setProdKod(manufacturer.Prod_Kod.toString());
    setProdOpis(manufacturer.Prod_Opis || "");
    setShowModal(true);
  };

  const handleSaveManufacturer = async () => {
    // Check for duplicate Prod_Opis (only if not empty)
    if (prodOpis.trim() !== "") {
      const duplicate = manufacturers.find(
        mfr => 
          mfr.Prod_Opis.toLowerCase().trim() === prodOpis.toLowerCase().trim() && 
          mfr._id !== editingManufacturer?._id
      );

      if (duplicate) {
        setErrorMessage(`Grupa "${prodOpis}" już istnieje w bazie danych. Proszę wybrać inną nazwę.`);
        setShowErrorModal(true);
        return;
      }
    }

    try {
      const url = getApiUrl(`/excel/manufacturers/${editingManufacturer._id}`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Prod_Kod: prodKod,
          Prod_Opis: prodOpis.trim(),
        }),
      });

      if (response.ok) {
        setSuccessMessage("Grupa została zaktualizowana");
        setShowModal(false);
        setShowSuccessModal(true);
        fetchManufacturers();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.message || "Nie udało się zaktualizować grupy");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas zapisywania");
      setShowErrorModal(true);
    }
  };

  const filteredManufacturers = manufacturers.filter((mfr) =>
    mfr.Prod_Opis?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mfr.Prod_Kod?.toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderManufacturer = ({ item, index }) => {
    return (
      <View style={styles.manufacturerCard}>
        <View style={styles.manufacturerHeader}>
          <View style={styles.manufacturerInfo}>
            <Text style={styles.manufacturerCode}>Kod: {item.Prod_Kod}</Text>
            <Text style={styles.manufacturerName}>
              {item.Prod_Opis || "(Brak nazwy)"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditManufacturer(item)}
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
        <Text style={styles.headerTitle}>Tabela grup</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddManufacturer}
          disabled={loading}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color="#8B5CF6" />
        <Text style={styles.infoText}>
          Numeracja automatyczna od 1
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj grupy..."
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

      {/* Manufacturers List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      ) : filteredManufacturers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="briefcase-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>
            {searchTerm ? "Nie znaleziono grup" : "Brak grup"}
          </Text>
          {!searchTerm && (
            <Text style={styles.emptyHint}>
              Naciśnij "+" aby dodać nową grupę
            </Text>
          )}
        </View>
      ) : (
        <>
          <View style={styles.countContainer}>
            <Text style={styles.countText}>
              Znaleziono: {filteredManufacturers.length} / {manufacturers.length} grup
            </Text>
          </View>
          <FlatList
            data={filteredManufacturers}
            renderItem={renderManufacturer}
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
                Edytuj grupę
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={28} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Kod grupy */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Kod grupy</Text>
                <TextInput
                  style={[styles.formInput, styles.formInputDisabled]}
                  value={prodKod}
                  editable={false}
                />
                <Text style={styles.formHint}>Kod nie może być edytowany</Text>
              </View>

              {/* Nazwa grupy */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nazwa grupy</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Wpisz nazwę grupy"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={prodOpis}
                  onChangeText={setProdOpis}
                />
                <Text style={styles.formHint}>
                  Nazwa musi być unikalna (jeśli podana)
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
                onPress={handleSaveManufacturer}
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
    backgroundColor: "#8B5CF6",
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
  manufacturerCard: {
    backgroundColor: tc('surface', "#0A0A0A"),
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  manufacturerHeader: {
    marginBottom: 12,
  },
  manufacturerInfo: {
    flex: 1,
  },
  manufacturerCode: {
    fontSize: 14,
    color: tc('muted', "#64748B"),
    marginBottom: 4,
  },
  manufacturerName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#8B5CF6",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    backgroundColor: "#8B5CF6",
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
    backgroundColor: "#8B5CF6",
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

export default ManufacturersList;
