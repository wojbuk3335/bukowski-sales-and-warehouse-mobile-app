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
import { router } from "expo-router";
import tokenService from "../services/tokenService";
import { getApiUrl } from "../config/api";
import usePullToRefresh from '../hooks/usePullToRefresh';
import { REMAINING_PRODUCT_TYPES, getRemainingProductType, normalizeRemainingProductCode, validateRemainingProductCode } from "../config/remainingProductTypes";

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, IconButton, ModalHeader, look } from '../components/AdminLook'; // wspólny wygląd (styl panelu admina)
import { KeyboardSafeScreen, KeyboardSafeOverlay } from "../components/KeyboardSafe"; // klawiatura nie zasłania pól tekstowych
const RemainingProductsList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  
  // Form states
  const [pozNr, setPozNr] = useState("");
  const [pozKod, setPozKod] = useState("");
  const [productType, setProductType] = useState("");
  const [startingNumber, setStartingNumber] = useState(10);

  useEffect(() => {
    fetchProducts();
  }, []);

  // Odświeżanie listy przeciągnięciem w dół - bez pełnoekranowego kręciołka
  const { refreshControl } = usePullToRefresh(() => fetchProducts({ silent: true }));

  // Walidacja Poz_Kod wg typu produktu (ta sama lista wzorców co w panelu i na serwerze)
  const validatePozKod = (value, type) => {
    const check = validateRemainingProductCode(type, value);
    return { isValid: check.valid, message: check.valid ? '' : check.message };
  };

  const fetchProducts = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true); // silent: odświeżanie gestem, lista zostaje na ekranie
      const url = getApiUrl("/excel/remaining-products/get-all-remaining-products");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        // Sort by number descending (newest first)
        const sortedProducts = (data.remainingProducts || []).sort((a, b) => {
          return Number(b.Poz_Nr) - Number(a.Poz_Nr);
        });
        
        setProducts(sortedProducts);
      }
    } catch (error) {
      setErrorMessage("Nie udało się pobrać listy produktów");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async () => {
    try {
      setLoading(true);
      
      // Get all products to find next number
      const url = getApiUrl("/excel/remaining-products/get-all-remaining-products");
      const response = await tokenService.authenticatedFetch(url);
      
      if (!response.ok) {
        throw new Error("Nie udało się pobrać listy produktów");
      }
      
      const data = await response.json();
      const productList = data.remainingProducts || [];
      
      let nextPozNr;
      if (productList.length === 0) {
        // First row - use starting number, validate range
        if (startingNumber < 10 || startingNumber > 99) {
          setErrorMessage("Numer początkowy musi być w zakresie 10-99.");
          setShowErrorModal(true);
          setLoading(false);
          return;
        }
        nextPozNr = startingNumber;
      } else {
        const maxPozNr = Math.max(...productList.map(product => Number(product.Poz_Nr) || 0));
        nextPozNr = maxPozNr + 1;
      }
      
      // Check if we reached the limit (max 99)
      if (nextPozNr > 99) {
        setErrorMessage("Osiągnięto maksymalną liczbę produktów (99). Nie można dodać więcej.");
        setShowErrorModal(true);
        setLoading(false);
        return;
      }
      
      // Create new product
      const newProduct = {
        Poz_Nr: nextPozNr,
        Poz_Kod: ""
      };
      
      const addUrl = getApiUrl("/excel/remaining-products/insert-remaining-products");
      const addResponse = await tokenService.authenticatedFetch(addUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([newProduct]),
      });
      
      if (addResponse.ok) {
        setSuccessMessage("Nowy produkt został dodany");
        setShowSuccessModal(true);
        fetchProducts();
      } else {
        const errorData = await addResponse.json();
        setErrorMessage(errorData.error?.message || "Nie udało się dodać produktu");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas dodawania produktu");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEditProduct = (product) => {
    const defaultProductType = product.productType || '';
    setEditingProduct(product);
    setPozNr(product.Poz_Nr.toString());
    setPozKod(product.Poz_Kod || "");
    setProductType(defaultProductType);
    
    // Validate existing code
    if (product.Poz_Kod) {
      const validation = validatePozKod(product.Poz_Kod, defaultProductType);
      setValidationMessage(validation.isValid ? '' : validation.message);
    } else {
      setValidationMessage('');
    }
    
    setShowModal(true);
  };

  const handlePozKodChange = (text) => {
    setPozKod(text);
    
    // Real-time validation feedback
    if (text !== '') {
      const validation = validatePozKod(text, productType);
      setValidationMessage(validation.isValid ? '' : validation.message);
    } else {
      setValidationMessage('');
    }
  };

  const handleProductTypeChange = (value) => {
    setProductType(value);
    
    // Update validation for current value with new product type
    if (pozKod !== '') {
      const validation = validatePozKod(pozKod, value);
      setValidationMessage(validation.isValid ? '' : validation.message);
    } else {
      setValidationMessage('');
    }
  };

  const handleSaveProduct = async () => {
    // Validate before saving
    const validation = validatePozKod(pozKod, productType);
    if (!validation.isValid) {
      setErrorMessage(validation.message);
      setShowErrorModal(true);
      return;
    }
    
    // Check for duplicate Poz_Kod (only if not empty); kod zapisywany jest znormalizowany (wielkie litery, pojedyncze spacje)
    const normalizedCode = normalizeRemainingProductCode(pozKod);
    if (normalizedCode !== "") {
      const duplicate = products.find(
        product => 
          product.Poz_Kod === normalizedCode && 
          product._id !== editingProduct?._id
      );

      if (duplicate) {
        setErrorMessage(`Kod "${normalizedCode}" już istnieje w bazie danych. Proszę wybrać inną wartość.`);
        setShowErrorModal(true);
        return;
      }
    }

    try {
      const url = getApiUrl(`/excel/remaining-products/update-remaining-products/${editingProduct._id}`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Poz_Kod: normalizedCode,
          productType: productType,
        }),
      });

      if (response.ok) {
        setSuccessMessage("Produkt został zaktualizowany");
        setShowModal(false);
        setValidationMessage('');
        setShowSuccessModal(true);
        fetchProducts();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.message || errorData.error?.message || "Nie udało się zaktualizować produktu"); // serwer sprawdza wzór niezależnie
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas zapisywania");
      setShowErrorModal(true);
    }
  };

  const filteredProducts = products.filter((product) =>
    product.Poz_Kod?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.Poz_Nr?.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.productType?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderProduct = ({ item, index }) => {
    return (
      <View style={styles.productCard}>
        <View style={styles.productHeader}>
          <View style={styles.productInfo}>
            <Text style={styles.productNumber}>Nr: {item.Poz_Nr}</Text>
            <Text style={styles.productCode}>
              Kod: {item.Poz_Kod || "(Brak kodu)"}
            </Text>
            {item.productType && (
              <Text style={styles.productTypeText}>
                Typ: {item.productType}
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditProduct(item)}
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
          title="Pozostały asortyment"
          icon="cube-outline"
          color="#F59E0B"
          onBack={() => router.back()}
          right={<IconButton icon="add" color="#F59E0B" onPress={handleAddProduct} disabled={loading} accessibilityLabel="Dodaj" />}
        />

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color="#F59E0B" />
          <Text style={styles.infoText}>
            Zakres: 10-99 (max 90 pozycji)
          </Text>
        </View>

        {/* Starting Number Input - only visible when list is empty */}
        {products.length === 0 && !loading && (
          <View style={styles.startingNumberContainer}>
            <Text style={styles.startingNumberLabel}>Numer początkowy:</Text>
            <TextInput
              style={styles.startingNumberInput}
              value={startingNumber.toString()}
              onChangeText={(text) => {
                const num = parseInt(text) || 10;
                if (num < 10) {
                  setStartingNumber(10);
                } else if (num > 99) {
                  setStartingNumber(99);
                } else {
                  setStartingNumber(num);
                }
              }}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor={tc('muted', "#64748B")}
            />
            <Text style={styles.startingNumberHint}>(zakres: 10-99)</Text>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj produktu..."
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

        {/* Products List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#F59E0B" />
          </View>
        ) : filteredProducts.length === 0 ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.emptyContainer, { flexGrow: 1 }]} refreshControl={refreshControl} alwaysBounceVertical keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            <Ionicons name="cube-outline" size={64} color="#475569" />
            <Text style={styles.emptyText}>
              {searchTerm ? "Nie znaleziono produktów" : "Brak produktów"}
            </Text>
            {!searchTerm && (
              <Text style={styles.emptyHint}>
                Naciśnij "+" aby dodać nowy produkt
              </Text>
            )}
          </ScrollView>
        ) : (
          <>
            <View style={styles.countContainer}>
              <Text style={styles.countText}>
                Znaleziono: {filteredProducts.length} / {products.length} produktów
              </Text>
            </View>
            <FlatList
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
              data={filteredProducts}
              renderItem={renderProduct}
              keyExtractor={(item) => item._id}
              contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(120, insets.bottom + 120) }]}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
              alwaysBounceVertical
            />
          </>
        )}
      </KeyboardSafeScreen>

      {/* Edit Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowModal(false);
          setValidationMessage('');
        }}
      >
        {/* Klawiatura nie zasłania pól: tło okienka kurczy się nad klawiaturą */}
        <KeyboardSafeOverlay>
          <View style={look.modalOverlay}>
            <View style={look.modalContent}>
              <ModalHeader icon="create-outline" color="#F59E0B" title="Edytuj produkt" />

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                {/* Numer produktu */}
                <View style={styles.formGroup}>
                  <Text style={look.formLabel}>Numer produktu</Text>
                  <TextInput
                    style={[look.formInput, styles.formInputDisabled]}
                    value={pozNr}
                    editable={false}
                  />
                  <Text style={styles.formHint}>Numer nie może być edytowany</Text>
                </View>

                {/* Typ produktu */}
                <View style={styles.formGroup}>
                  <Text style={look.formLabel}>Typ produktu</Text>
                  <View style={styles.pickerContainer}>
                    <Picker
                      selectedValue={productType}
                      onValueChange={handleProductTypeChange}
                      style={styles.picker}
                      dropdownIconColor={tc('text', '#fff')}
                    >
                      <Picker.Item label="- wybierz typ -" value="" />
                      {REMAINING_PRODUCT_TYPES.map((type) => (
                        <Picker.Item key={type.value} label={type.label} value={type.value} />
                      ))}
                    </Picker>
                  </View>
                  <Text style={styles.formHint}>
                    {getRemainingProductType(productType)
                      ? `Wymagany wzór: ${getRemainingProductType(productType).formatHint}${getRemainingProductType(productType).example ? `, np. ${getRemainingProductType(productType).example}` : ''}`
                      : 'Najpierw wybierz typ produktu - od niego zależy wzór kodu'}
                  </Text>
                </View>

                {/* Kod produktu */}
                <View style={styles.formGroup}>
                  <Text style={look.formLabel}>Kod produktu</Text>
                  <TextInput
                    style={look.formInput}
                    placeholder={getRemainingProductType(productType)?.example ? `np. ${getRemainingProductType(productType).example}` : "Wpisz kod z metki"}
                    placeholderTextColor={tc('muted', "#64748B")}
                    value={pozKod}
                    onChangeText={handlePozKodChange}
                    autoCapitalize="characters"
                  />
                  {validationMessage !== '' && (
                    <Text style={styles.validationError}>{validationMessage}</Text>
                  )}
                  <Text style={styles.formHint}>
                    Kod musi być unikalny (jeśli podany)
                  </Text>
                </View>
              </ScrollView>

              <View style={[look.buttonRow, styles.modalActions]}>
                <TouchableOpacity
                  style={look.neutralButton}
                  onPress={() => {
                    setShowModal(false);
                    setValidationMessage('');
                  }}
                >
                  <Text style={look.neutralButtonText}>Anuluj</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[look.primaryButton, { backgroundColor: '#10B981' }]}
                  onPress={handleSaveProduct}
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
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F59E0B1A",
    borderWidth: 1,
    borderColor: "#F59E0B66",
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
    borderColor: "#F59E0B",
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
  productCard: {
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
    borderLeftColor: "#F59E0B",
  },
  productHeader: {
    flex: 1,
  },
  productInfo: {
    flex: 1,
  },
  productNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F59E0B",
    marginBottom: 4,
  },
  productCode: {
    fontSize: 14,
    color: tc('muted', "#94A3B8"),
    marginBottom: 2,
  },
  productTypeText: {
    fontSize: 12,
    color: tc('muted', "#64748B"),
    fontStyle: "italic",
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
  pickerContainer: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    overflow: "hidden",
  },
  picker: {
    color: tc('text', "#fff"),
    backgroundColor: "transparent",
  },
  formHint: {
    fontSize: 12,
    color: tc('muted', "#64748B"),
    marginTop: 6,
  },
  validationError: {
    fontSize: 12,
    color: "#DC2626",
    marginTop: 4,
  },
  modalActions: {
    marginTop: 4,
  },
}));

export default RemainingProductsList;
