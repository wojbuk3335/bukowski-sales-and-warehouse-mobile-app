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
import { router, Stack } from "expo-router";
import tokenService from "../services/tokenService";
import { getApiUrl } from "../config/api";
import usePullToRefresh from '../hooks/usePullToRefresh';
import { appAlert } from '../services/appAlert';

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, IconButton, ModalHeader, OptionCard, look } from '../components/AdminLook'; // wspólny wygląd (styl panelu admina)
import { KeyboardSafeScreen, KeyboardSafeOverlay } from "../components/KeyboardSafe"; // klawiatura nie zasłania pól tekstowych

// Ikona i kolor ekranu – te same co na kafelku w menu podkategorii
const SCREEN_ICON = "shirt";
const SCREEN_COLOR = "#0D6EFD";
const CoatsSubcategoryList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
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

  // Odświeżanie listy przeciągnięciem w dół - bez pełnoekranowego kręciołka
  const { refreshControl } = usePullToRefresh(() => fetchSubcategories({ silent: true }));

  const fetchSubcategories = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true); // silent: odświeżanie gestem, lista zostaje na ekranie
      const url = getApiUrl("/excel/subcategoryCoats/get-all-subcategoryCoats");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const sortedData = (data.subcategoryCoats || []).sort((a, b) => {
          const aKod = parseInt(a.Kat_1_Kod_1) || 0;
          const bKod = parseInt(b.Kat_1_Kod_1) || 0;
          return bKod - aKod; // Descending order (newest first)
        });
        setSubcategories(sortedData);
      }
    } catch (error) {
      setErrorMessage("Nie udało się pobrać listy podkategorii");
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
      setErrorMessage("Nazwa podkategorii jest wymagana");
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
      setErrorMessage(`Podkategoria "${kat1Opis1}" już istnieje w bazie danych. Proszę wybrać inną nazwę.`);
      setShowErrorModal(true);
      return;
    }

    try {
      if (editingItem) {
        // Update existing
        const url = getApiUrl(`/excel/subcategoryCoats/update-subcategoryCoats/${editingItem._id}`);
        const response = await tokenService.authenticatedFetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            Kat_1_Opis_1: kat1Opis1.trim(),
            Plec: plec,
          }),
        });

        if (response.ok) {
          setSuccessMessage("Podkategoria zaktualizowana pomyślnie");
          setShowSuccessModal(true);
          setShowModal(false);
          fetchSubcategories();
        } else {
          const error = await response.json();
          setErrorMessage(error.message || "Nie udało się zaktualizować podkategorii");
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

        const url = getApiUrl("/excel/subcategoryCoats/insert-many-subcategoryCoats");
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
          setSuccessMessage("Podkategoria dodana pomyślnie");
          setShowSuccessModal(true);
          setShowModal(false);
          fetchSubcategories();
        } else {
          const error = await response.json();
          setErrorMessage(error.message || "Nie udało się dodać podkategorii");
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
      `Czy na pewno chcesz usunąć podkategorię "${item.Kat_1_Opis_1}"?`,
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Usuń",
          style: "destructive",
          onPress: async () => {
            try {
              const url = getApiUrl(`/excel/subcategoryCoats/delete-subcategoryCoats/${item._id}`);
              const response = await tokenService.authenticatedFetch(url, {
                method: "DELETE",
              });

              if (response.ok) {
                setSuccessMessage("Podkategoria usunięta pomyślnie");
                setShowSuccessModal(true);
                fetchSubcategories();
              } else {
                const error = await response.json();
                setErrorMessage(error.message || "Nie udało się usunąć podkategorii");
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
        <View style={styles.itemMetaRow}>
          <Text style={styles.itemMeta}>Kod: {item.Kat_1_Kod_1}</Text>
          <Text style={styles.itemMeta}>Płeć: {item.Plec || "D"}</Text>
        </View>
      </View>
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEdit(item)}
          accessibilityLabel="Edytuj"
        >
          <Ionicons name="pencil" size={18} color="#0D6EFD" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item)}
          accessibilityLabel="Usuń"
        >
          <Ionicons name="trash-outline" size={18} color="#DC2626" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container}>
          <PageHeader
            title="Kurtki Kożuchy Futra"
            icon={SCREEN_ICON}
            color={SCREEN_COLOR}
            onBack={() => router.back()}
          />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={SCREEN_COLOR} />
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
        {/* Klawiatura nie zasłania pola: ekran kurczy się nad klawiaturą i przewija do klikniętego pola */}
        <KeyboardSafeScreen>
        {/* Nagłówek */}
        <PageHeader
          title="Kurtki Kożuchy Futra"
          icon={SCREEN_ICON}
          color={SCREEN_COLOR}
          onBack={() => router.back()}
          right={<IconButton icon="add" color="#10B981" onPress={handleAdd} accessibilityLabel="Dodaj" />}
        />

        {/* Wyszukiwarka */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj..."
            placeholderTextColor={tc('muted', "#64748B")}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm !== "" && (
            <TouchableOpacity onPress={() => setSearchTerm("")}>
              <Ionicons name="close-circle" size={20} color={tc('muted', "#94A3B8")} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          data={filteredSubcategories}
          renderItem={renderItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(120, insets.bottom + 120) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          alwaysBounceVertical
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name={SCREEN_ICON} size={64} color={tc('muted', "#475569")} />
              <Text style={styles.emptyText}>Brak podkategorii</Text>
            </View>
          }
        />
        </KeyboardSafeScreen>

      {/* Okno dodawania / edycji */}
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
              <ModalHeader
                icon={editingItem ? "create-outline" : "add-circle-outline"}
                color={SCREEN_COLOR}
                title={editingItem ? "Edytuj podkategorię" : "Dodaj podkategorię"}
              />

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                <View style={styles.formGroup}>
                  <Text style={look.formLabel}>Nazwa podkategorii:</Text>
                  <TextInput
                    style={look.formInput}
                    placeholder="Np. Kurtka damska"
                    placeholderTextColor={tc('muted', "#64748B")}
                    value={kat1Opis1}
                    onChangeText={setKat1Opis1}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={look.formLabel}>Płeć:</Text>
                    <OptionCard
                      icon="woman-outline"
                      label="Damskie (D)"
                      color={SCREEN_COLOR}
                      selected={plec === "D"}
                      onPress={() => setPlec("D")}
                    />
                    <OptionCard
                      icon="man-outline"
                      label="Męskie (M)"
                      color={SCREEN_COLOR}
                      selected={plec === "M"}
                      onPress={() => setPlec("M")}
                    />
                    <OptionCard
                      icon="people-outline"
                      label="Unisex (U)"
                      color={SCREEN_COLOR}
                      selected={plec === "U"}
                      onPress={() => setPlec("U")}
                    />
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
                  onPress={handleSave}
                >
                  <Text style={look.buttonText}>Zapisz</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardSafeOverlay>
      </Modal>

      {/* Okno sukcesu */}
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

      {/* Okno błędu */}
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
    </>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc('bg', "#000000"),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: tc('muted', "#94A3B8"),
    fontSize: 15,
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
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  itemCard: {
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
    borderLeftColor: SCREEN_COLOR,
  },
  itemContent: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  itemMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
  },
  itemMeta: {
    fontSize: 13,
    color: tc('muted', "#64748B"),
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
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
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#DC262626",
    borderWidth: 1,
    borderColor: "#DC262666",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('muted', "#94A3B8"),
    marginTop: 16,
    textAlign: "center",
  },
  modalBody: {
    flexGrow: 0,
  },
  formGroup: {
    marginBottom: 16,
  },
  formHint: {
    fontSize: 12,
    color: tc('muted', "#64748B"),
    marginBottom: 8,
  },
  modalActions: {
    marginTop: 4,
  },
}));

export default CoatsSubcategoryList;
