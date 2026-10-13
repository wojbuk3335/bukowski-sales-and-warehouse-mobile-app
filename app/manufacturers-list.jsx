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
        title="Tabela grup"
        icon="briefcase-outline"
        color="#8B5CF6"
        onBack={() => router.back()}
        right={<IconButton icon="add" color="#8B5CF6" onPress={handleAddManufacturer} disabled={loading} accessibilityLabel="Dodaj" />}
      />

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
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="create-outline" color="#8B5CF6" title="Edytuj grupę" />

            <ScrollView style={styles.modalBody}>
              {/* Kod grupy */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Kod grupy</Text>
                <TextInput
                  style={[look.formInput, styles.formInputDisabled]}
                  value={prodKod}
                  editable={false}
                />
                <Text style={styles.formHint}>Kod nie może być edytowany</Text>
              </View>

              {/* Nazwa grupy */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Nazwa grupy</Text>
                <TextInput
                  style={look.formInput}
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

            <View style={[look.buttonRow, styles.modalActions]}>
              <TouchableOpacity
                style={look.neutralButton}
                onPress={() => setShowModal(false)}
              >
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[look.primaryButton, { backgroundColor: '#10B981' }]}
                onPress={handleSaveManufacturer}
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
    backgroundColor: "#8B5CF61A",
    borderWidth: 1,
    borderColor: "#8B5CF666",
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
  manufacturerCard: {
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
  manufacturerHeader: {
    flex: 1,
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

export default ManufacturersList;
