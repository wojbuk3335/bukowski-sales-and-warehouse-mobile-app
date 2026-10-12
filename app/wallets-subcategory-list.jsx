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
import { Picker } from "@react-native-picker/picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack } from "expo-router";
import tokenService from "../services/tokenService";
import { getApiUrl } from "../config/api";
import { appAlert } from '../services/appAlert';

const WalletsSubcategoryList = () => {
  const insets = useSafeAreaInsets();
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Form states
  const [kat1Opis1, setKat1Opis1] = useState("");
  const [plec, setPlec] = useState("D");

  useEffect(() => {
    fetchSubcategories();
  }, []);

  const fetchSubcategories = async () => {
    try {
      setLoading(true);
      const url = getApiUrl("/excel/wallets-category/get-all-wallets-categories");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const sortedData = (data.walletCategories || []).sort((a, b) => {
          const aKod = parseInt(a.Kat_1_Kod_1) || 0;
          const bKod = parseInt(b.Kat_1_Kod_1) || 0;
          return bKod - aKod; // Descending order (newest first)
        });
        setSubcategories(sortedData);
      }
    } catch (error) {
      setErrorMessage("Nie udało się pobrać listy kategorii");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setKat1Opis1("");
    setPlec("D");
    setShowModal(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setKat1Opis1(item.Kat_1_Opis_1);
    setPlec(item.Plec || "D");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!kat1Opis1.trim()) {
      setErrorMessage("Nazwa kategorii jest wymagana");
      setShowErrorModal(true);
      return;
    }

    // Check for duplicate Kat_1_Opis_1
    const duplicate = subcategories.find(
      item => 
        item.Kat_1_Opis_1 === kat1Opis1.trim() && 
        item._id !== editingItem?._id
    );

    if (duplicate) {
      setErrorMessage(`Kategoria "${kat1Opis1}" już istnieje w bazie danych. Proszę wybrać inną nazwę.`);
      setShowErrorModal(true);
      return;
    }

    try {
      if (editingItem) {
        // Update existing
        const url = getApiUrl(`/excel/wallets-category/update-wallets-category/${editingItem._id}`);
        const response = await tokenService.authenticatedFetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            Kat_1_Opis_1: kat1Opis1.trim(),
            Plec: plec,
          }),
        });

        if (response.ok) {
          setSuccessMessage("Kategoria zaktualizowana pomyślnie");
          setShowSuccessModal(true);
          setShowModal(false);
          fetchSubcategories();
        } else {
          const error = await response.json();
          setErrorMessage(error.message || "Nie udało się zaktualizować kategorii");
          setShowErrorModal(true);
        }
      } else {
        // Add new
        // Get next code
        let nextCode = 1;
        if (subcategories.length > 0) {
          const maxCode = Math.max(...subcategories.map(item => Number(item.Kat_1_Kod_1) || 0));
          nextCode = maxCode + 1;
        }

        const url = getApiUrl("/excel/wallets-category/insert-many-wallets-categories");
        const response = await tokenService.authenticatedFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([{
            Kat_1_Kod_1: nextCode.toString(),
            Kat_1_Opis_1: kat1Opis1.trim(),
            Plec: plec,
          }]),
        });

        if (response.ok) {
          setSuccessMessage("Kategoria dodana pomyślnie");
          setShowSuccessModal(true);
          setShowModal(false);
          fetchSubcategories();
        } else {
          const error = await response.json();
          setErrorMessage(error.message || "Nie udało się dodać kategorii");
          setShowErrorModal(true);
        }
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas zapisywania");
      setShowErrorModal(true);
    }
  };

  const handleDelete = (item) => {
    appAlert(
      "Potwierdzenie",
      `Czy na pewno chcesz usunąć kategorię "${item.Kat_1_Opis_1}"?`,
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Usuń",
          style: "destructive",
          onPress: async () => {
            try {
              const url = getApiUrl(`/excel/wallets-category/delete-wallets-category/${item._id}`);
              const response = await tokenService.authenticatedFetch(url, {
                method: "DELETE",
              });

              if (response.ok) {
                setSuccessMessage("Kategoria usunięta pomyślnie");
                setShowSuccessModal(true);
                fetchSubcategories();
              } else {
                const error = await response.json();
                setErrorMessage(error.message || "Nie udało się usunąć kategorii");
                setShowErrorModal(true);
              }
            } catch (error) {
              setErrorMessage("Wystąpił błąd podczas usuwania");
              setShowErrorModal(true);
            }
          },
        },
      ]
    );
  };

  const filteredSubcategories = subcategories.filter(item =>
    (item.Kat_1_Opis_1 || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.Kat_1_Kod_1 || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderItem = ({ item }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemContent}>
        <Text style={styles.itemName}>{item.Kat_1_Opis_1}</Text>
        <Text style={styles.itemMeta}>Kod: {item.Kat_1_Kod_1}</Text>
        <Text style={styles.itemMeta}>Płeć: {item.Plec || "D"}</Text>
      </View>
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.editButton} onPress={() => handleEdit(item)}>
          <Text style={styles.editButtonText}>Edytuj</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item)}>
          <Text style={styles.deleteButtonText}>Usuń</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D6EFD" />
          <Text style={styles.loadingText}>Ładowanie...</Text>
        </View>
      </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Portfele</Text>
        <TouchableOpacity style={styles.addIconButton} onPress={handleAdd}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj..."
          placeholderTextColor="#64748B"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm !== "" && (
          <TouchableOpacity onPress={() => setSearchTerm("")}>
            <Ionicons name="close-circle" size={20} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredSubcategories}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(120, insets.bottom + 120) }]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={64} color="#64748B" />
            <Text style={styles.emptyText}>Brak kategorii</Text>
          </View>
        }
      />

      {/* Edit/Add Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? "Edytuj kategorię" : "Dodaj kategorię"}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Nazwa kategorii:</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Np. Portfel damski"
                  placeholderTextColor="#64748B"
                  value={kat1Opis1}
                  onChangeText={setKat1Opis1}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Płeć:</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={plec}
                    onValueChange={(itemValue) => setPlec(itemValue)}
                    style={styles.picker}
                    dropdownIconColor="#fff"
                  >
                    <Picker.Item label="Damskie (D)" value="D" />
                    <Picker.Item label="Męskie (M)" value="M" />
                    <Picker.Item label="Dziecięce (Dz)" value="Dz" />
                    <Picker.Item label="Unisex (U)" value="U" />
                  </Picker>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.buttonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSave}
              >
                <Text style={styles.buttonText}>Zapisz</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.smallModalContent}>
            <Ionicons name="checkmark-circle" size={48} color="#10B981" />
            <Text style={styles.modalMessage}>{successMessage}</Text>
            <TouchableOpacity
              style={[styles.button, styles.okButton]}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Error Modal */}
      <Modal visible={showErrorModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.smallModalContent}>
            <Ionicons name="alert-circle" size={48} color="#EF4444" />
            <Text style={styles.modalMessage}>{errorMessage}</Text>
            <TouchableOpacity
              style={[styles.button, styles.okButton]}
              onPress={() => setShowErrorModal(false)}
            >
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#fff",
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  addIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0D6EFD",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
    textAlign: "center",
  },
  headerContent: {
    display: "none",
  },
  title: {
    display: "none",
    color: "#fff",
    marginBottom: 5,
  },
  subtitle: {
    display: "none",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    marginHorizontal: 20,
    marginTop: 20,
    paddingHorizontal: 15,
    borderRadius: 12,
    height: 50,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D6EFD",
    marginHorizontal: 20,
    marginTop: 15,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  listContainer: {
    padding: 20,
  },
  itemCard: {
    backgroundColor: "#0A0A0A",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  itemContent: {
    marginBottom: 12,
  },
  itemName: {
    color: "#0D6EFD",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },
  itemMeta: {
    color: "#94A3B8",
    fontSize: 13,
    marginBottom: 3,
  },
  actionButtons: {
    flexDirection: "column",
    gap: 8,
  },
  editButton: {
    backgroundColor: "#0D6EFD",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  editButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  deleteButton: {
    backgroundColor: "#DC2626",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 16,
    marginTop: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1E293B",
    width: "90%",
    maxHeight: "80%",
    borderRadius: 20,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  modalBody: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    color: "#94A3B8",
    fontSize: 14,
    marginBottom: 8,
    fontWeight: "500",
  },
  input: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    padding: 15,
    color: "#fff",
    fontSize: 16,
  },
  pickerContainer: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    overflow: "hidden",
  },
  picker: {
    color: "#fff",
    height: 50,
  },
  modalFooter: {
    flexDirection: "row",
    padding: 20,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#64748B",
  },
  saveButton: {
    backgroundColor: "#10B981",
  },
  okButton: {
    backgroundColor: "#0D6EFD",
    marginTop: 15,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  smallModalContent: {
    backgroundColor: "#1E293B",
    padding: 30,
    borderRadius: 20,
    alignItems: "center",
    width: "80%",
  },
  modalMessage: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginTop: 15,
    marginBottom: 5,
  },
});

export default WalletsSubcategoryList;
