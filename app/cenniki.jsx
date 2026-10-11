import React, { useEffect, useMemo, useState } from "react";
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
  Image,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import tokenService from "../services/tokenService";
import useLiveRefresh from "../services/useLiveRefresh"; // zmiany cenników na żywo (także z panelu)
import { API_CONFIG, getApiUrl } from "../config/api";

// Walidacja ceny w cenniku: cena > 0, promocja 0 albo niższa od ceny, wyjątki z rozmiarem i ceną > 0, bez powtórzeń.
// Zwraca komunikat błędu albo null.
const validatePriceListPrice = ({ price, discountPrice, priceExceptions }) => {
    const priceNumber = Number(price);
    if (price === '' || price === null || price === undefined || !Number.isFinite(priceNumber) || priceNumber <= 0) {
        return 'Cena musi być większa od 0 zł.';
    }
    const discountNumber = discountPrice === '' || discountPrice === null || discountPrice === undefined ? 0 : Number(discountPrice);
    if (!Number.isFinite(discountNumber) || discountNumber < 0) {
        return 'Cena promocyjna nie może być ujemna (0 = brak promocji).';
    }
    if (discountNumber > 0 && discountNumber >= priceNumber) {
        return 'Cena promocyjna musi być niższa od ceny.';
    }
    const seenSizes = new Set();
    for (const exception of priceExceptions || []) {
        const sizeKey = String((exception && exception.size && (exception.size._id || exception.size)) || '');
        if (!sizeKey) return 'Każdy wyjątek cenowy musi mieć wybrany rozmiar.';
        const valueNumber = Number(exception.value);
        if (!Number.isFinite(valueNumber) || valueNumber <= 0) return 'Cena w wyjątku dla rozmiaru musi być większa od 0 zł.';
        if (seenSizes.has(sizeKey)) return 'Ten sam rozmiar nie może mieć dwóch wyjątków cenowych.';
        seenSizes.add(sizeKey);
    }
    return null;
};

const Cenniki = () => {
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState([]);
  const [selectedSellingPoint, setSelectedSellingPoint] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [priceList, setPriceList] = useState([]);
  const [loadingPriceList, setLoadingPriceList] = useState(false);
  const [sizes, setSizes] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [showSellingPointModal, setShowSellingPointModal] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [errorText, setErrorText] = useState(""); // błąd walidacji ceny w oknie edycji
  const [editingItem, setEditingItem] = useState(null);
  const [editPrice, setEditPrice] = useState("");
  const [editDiscountPrice, setEditDiscountPrice] = useState("");
  const [editPriceExceptions, setEditPriceExceptions] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [sizeSearch, setSizeSearch] = useState("");
  const [activeExceptionIndex, setActiveExceptionIndex] = useState(null);

  const [showCloneModal, setShowCloneModal] = useState(false);
  const [sourcePointForClone, setSourcePointForClone] = useState("");

  const [showGlobalUpdateModal, setShowGlobalUpdateModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [showOutdatedWarning, setShowOutdatedWarning] = useState(false);

  const [selectedPicture, setSelectedPicture] = useState(null);

  const formatPrice = (price) => {
    if (price === null || price === undefined || price === "") return "";
    const num = parseFloat(price);
    if (Number.isNaN(num)) return "";
    return num % 1 === 0 ? num.toString() : num.toFixed(2);
  };

  const formatDiscountPrice = (price) => {
    if (!price || Number(price) === 0) return "";
    const num = parseFloat(price);
    if (Number.isNaN(num)) return "";
    return num % 1 === 0 ? num.toString() : num.toFixed(2);
  };

  const getSellingPointName = (user) => {
    if (!user) return "";
    if (user.role === "magazyn") return "Magazyn";
    if (user.role === "dom") return "Dom";
    return user.sellingPoint || user.symbol || "Nieznany punkt";
  };

  const filteredUsers = useMemo(() => {
    if (!Array.isArray(users)) return [];
    return users.filter((user) => {
      const symbol = user.symbol?.toLowerCase();
      const role = user.role?.toLowerCase();
      return (
        symbol !== "admin" &&
        symbol !== "limited_admin" &&
        role !== "admin" &&
        role !== "admin2" &&
        role !== "superadmin"
      );
    });
  }, [users]);

  const selectedUser = users.find((user) => user._id === selectedSellingPoint);

  const getImageUrl = (picturePath) => {
    if (!picturePath || picturePath.trim() === "") return null;

    if (picturePath.startsWith("http://") || picturePath.startsWith("https://")) {
      const baseUrl = API_CONFIG.BASE_URL.replace("/api", "");
      return picturePath.replace("http://localhost:3000", baseUrl);
    }

    if (picturePath.startsWith("/")) {
      const baseUrl = API_CONFIG.BASE_URL.replace("/api", "");
      return `${baseUrl}${picturePath}`;
    }

    const baseUrl = API_CONFIG.BASE_URL.replace("/api", "");
    return `${baseUrl}/images/${picturePath}`;
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const url = getApiUrl("/user");
      const response = await tokenService.authenticatedFetch(url);
      if (response.ok) {
        const data = await response.json();
        const filtered = (data.users || []).filter((user) => {
          const symbol = user.symbol?.toLowerCase();
          const role = user.role?.toLowerCase();
          return (
            symbol !== "admin" &&
            symbol !== "limited_admin" &&
            role !== "admin" &&
            role !== "admin2" &&
            role !== "superadmin"
          );
        });
        setUsers(filtered);
        if (filtered.length > 0) {
          setSelectedSellingPoint(filtered[0]._id);
        }
      } else {
        console.error("Failed to fetch users:", response.status);
        setUsers([]);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchSizes = async () => {
    try {
      const url = getApiUrl("/excel/size/get-all-sizes");
      const response = await tokenService.authenticatedFetch(url);
      if (response.ok) {
        const data = await response.json();
        setSizes(data.sizes || []);
      }
    } catch (error) {
      // Ignore size fetch errors for now
    }
  };

  const fetchPriceList = async (sellingPointId) => {
    if (!sellingPointId) return;
    setLoadingPriceList(true);
    try {
      const url = getApiUrl(`/pricelists/${sellingPointId}`);
      const response = await tokenService.authenticatedFetch(url);
      if (response.ok) {
        const data = await response.json();
        setPriceList(data.priceList || []);
      } else if (response.status === 404) {
        setPriceList([]);
      } else {
        setPriceList([]);
      }
    } catch (error) {
      setPriceList([]);
    }
    setLoadingPriceList(false);

    await checkSynchronization(sellingPointId);
  };

  // Zmiana cennika gdziekolwiek (panel, inny telefon) od razu odświeża widok
  useLiveRefresh(["pricelists", "goods"], () => {
    if (selectedSellingPoint) fetchPriceList(selectedSellingPoint);
  });

  const checkSynchronization = async (sellingPointId) => {
    try {
      const url = getApiUrl(`/pricelists/${sellingPointId}/compare`);
      const response = await tokenService.authenticatedFetch(url);
      if (response.ok) {
        const data = await response.json();
        setComparisonData(data);
        if (data.summary.totalChanges > 0) {
          setShowOutdatedWarning(true);
        } else {
          setShowOutdatedWarning(false);
        }
      } else if (response.status === 404) {
        setComparisonData(null);
        setShowOutdatedWarning(false);
      }
    } catch (error) {
      setComparisonData(null);
      setShowOutdatedWarning(false);
    }
  };

  const createInitialPriceList = async () => {
    if (!selectedSellingPoint) return;
    try {
      setLoadingPriceList(true);
      const url = getApiUrl(`/pricelists/${selectedSellingPoint}/create`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        await fetchPriceList(selectedSellingPoint);
        Alert.alert("Sukces", "Cennik został utworzony na podstawie produktów");
      } else {
        Alert.alert("Błąd", "Nie udało się utworzyć cennika");
      }
    } catch (error) {
      Alert.alert("Błąd", "Nie udało się utworzyć cennika");
    } finally {
      setLoadingPriceList(false);
    }
  };

  const clonePriceList = async () => {
    if (!selectedSellingPoint || !sourcePointForClone) return;
    try {
      setLoadingPriceList(true);
      const url = getApiUrl(`/pricelists/${selectedSellingPoint}/clone`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSellingPointId: sourcePointForClone }),
      });
      if (response.ok) {
        await fetchPriceList(selectedSellingPoint);
        setShowCloneModal(false);
        setSourcePointForClone("");
        Alert.alert("Sukces", "Cennik został sklonowany");
      } else {
        Alert.alert("Błąd", "Nie udało się sklonować cennika");
      }
    } catch (error) {
      Alert.alert("Błąd", "Nie udało się sklonować cennika");
    } finally {
      setLoadingPriceList(false);
    }
  };

  const deletePriceList = async () => {
    if (!selectedSellingPoint) return;
    Alert.alert(
      "Usuń cennik",
      "Czy na pewno chcesz usunąć cały cennik?",
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Usuń",
          style: "destructive",
          onPress: async () => {
            try {
              const url = getApiUrl(`/pricelists/${selectedSellingPoint}`);
              const response = await tokenService.authenticatedFetch(url, {
                method: "DELETE",
              });
              if (response.ok) {
                setPriceList([]);
                Alert.alert("Sukces", "Cennik został usunięty");
              } else {
                Alert.alert("Błąd", "Nie udało się usunąć cennika");
              }
            } catch (error) {
              Alert.alert("Błąd", "Nie udało się usunąć cennika");
            }
          },
        },
      ]
    );
  };

  const updatePrice = async () => {
    if (!editingItem || !selectedSellingPoint) return;
    const validationError = validatePriceListPrice({ price: editPrice, discountPrice: editDiscountPrice, priceExceptions: editPriceExceptions });
    if (validationError) {
      setErrorText(validationError);
      return;
    }
    setErrorText("");
    try {
      const url = getApiUrl(`/pricelists/${selectedSellingPoint}/update`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: editingItem._id,
          price: parseFloat(editPrice) || 0,
          discountPrice: parseFloat(editDiscountPrice) || 0,
          priceExceptions: editPriceExceptions,
        }),
      });

      if (response.ok) {
        await fetchPriceList(selectedSellingPoint);
        setShowEditModal(false);
        setEditingItem(null);
        setEditPrice("");
        setEditDiscountPrice("");
        setEditPriceExceptions([]);
        setSuccessMessage("Cena została zaktualizowana");
        setShowSuccessModal(true);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setErrorText(errorData.message || "Nie udało się zaktualizować ceny");
      }
    } catch (error) {
      setErrorText("Nie udało się zaktualizować ceny");
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setEditPrice(item.price?.toString() || "");
    setEditDiscountPrice(item.discountPrice?.toString() || "");

    if (item.priceExceptions && item.priceExceptions.length > 0) {
      const validExceptions = item.priceExceptions
        .map((exception) => {
          const size = sizes.find((s) => s._id === exception.size?._id);
          if (!size) return null;
          return { size: size._id, value: exception.value };
        })
        .filter(Boolean);
      setEditPriceExceptions(validExceptions);
    } else {
      setEditPriceExceptions([]);
    }

    setShowEditModal(true);
  };

  const handlePriceExceptionChange = (index, field, value) => {
    const updated = [...editPriceExceptions];
    updated[index][field] = value;
    setEditPriceExceptions(updated);
  };

  const handleAddPriceException = () => {
    setEditPriceExceptions((prev) => [...prev, { size: "", value: 0 }]);
  };

  const handleRemovePriceException = (index) => {
    setEditPriceExceptions((prev) => prev.filter((_, i) => i !== index));
  };

  const openSyncModal = async () => {
    if (!selectedSellingPoint) return;
    setLoadingComparison(true);
    setShowSyncModal(true);
    try {
      const url = getApiUrl(`/pricelists/${selectedSellingPoint}/compare`);
      const response = await tokenService.authenticatedFetch(url);
      if (response.ok) {
        const data = await response.json();
        setComparisonData(data);
      } else {
        setComparisonData(null);
      }
    } catch (error) {
      setComparisonData(null);
    }
    setLoadingComparison(false);
  };

  const synchronizePriceList = async (updateOutdated = true, addNew = true, removeDeleted = false) => {
    if (!selectedSellingPoint) return;
    try {
      const url = getApiUrl(`/pricelists/${selectedSellingPoint}/sync`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateOutdated, addNew, removeDeleted }),
      });
      if (response.ok) {
        const result = await response.json();
        setPriceList(result.priceList || []);
        setShowSyncModal(false);
        setShowOutdatedWarning(false);
        Alert.alert("Sukces", "Synchronizacja zakończona");
      } else {
        Alert.alert("Błąd", "Nie udało się zsynchronizować cennika");
      }
    } catch (error) {
      Alert.alert("Błąd", "Nie udało się zsynchronizować cennika");
    }
  };

  const synchronizeAllPriceLists = async (updateOutdated = true, addNew = true, removeDeleted = false) => {
    try {
      const url = getApiUrl("/pricelists/sync-all");
      const response = await tokenService.authenticatedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateOutdated, addNew, removeDeleted }),
      });
      if (response.ok) {
        setShowSyncModal(false);
        setShowOutdatedWarning(false);
        if (selectedSellingPoint) {
          await fetchPriceList(selectedSellingPoint);
        }
        Alert.alert("Sukces", "Globalna synchronizacja zakończona");
      } else {
        Alert.alert("Błąd", "Nie udało się zsynchronizować cenników");
      }
    } catch (error) {
      Alert.alert("Błąd", "Nie udało się zsynchronizować cenników");
    }
  };

  const addNewProductsToAll = async () => {
    try {
      const url = getApiUrl("/pricelists/add-new-to-all");
      const response = await tokenService.authenticatedFetch(url, {
        method: "POST",
      });
      if (response.ok) {
        setShowGlobalUpdateModal(false);
        if (selectedSellingPoint) {
          await fetchPriceList(selectedSellingPoint);
        }
        Alert.alert("Sukces", "Globalna aktualizacja zakończona");
      } else {
        Alert.alert("Błąd", "Nie udało się zaktualizować cenników");
      }
    } catch (error) {
      Alert.alert("Błąd", "Nie udało się zaktualizować cenników");
    }
  };

  useEffect(() => {
    const initializeComponent = async () => {
      try {
        await fetchUsers();
        await fetchSizes();
      } catch (error) {
        console.error("Error initializing cenniki:", error);
      }
    };
    initializeComponent();
  }, []);

  useEffect(() => {
    if (selectedSellingPoint) {
      fetchPriceList(selectedSellingPoint).catch(error => {
        console.error("Error fetching price list:", error);
      });
    }
  }, [selectedSellingPoint]);

  const filteredPriceList = useMemo(() => {
    if (!Array.isArray(priceList)) return [];
    if (!searchTerm.trim()) return priceList;
    const term = searchTerm.toLowerCase();
    return priceList.filter((item) => {
      const name = (item.fullName || "").toLowerCase();
      const code = (item.code || "").toLowerCase();
      return name.includes(term) || code.includes(term);
    });
  }, [priceList, searchTerm]);

  const renderPriceItem = ({ item, index }) => {
    const imageUrl = getImageUrl(item.picture);
    const exceptionsText = (item.priceExceptions || [])
      .map((exception) => {
        const sizeName = exception.size?.Roz_Opis || "BR";
        return `${sizeName}=${formatPrice(exception.value)}`;
      })
      .join(", ");

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.fullName || "Brak nazwy"}</Text>
          <Text style={styles.cardIndex}>#{index + 1}</Text>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <View style={styles.imageContainer}>
              {imageUrl ? (
                <TouchableOpacity onPress={() => setSelectedPicture(imageUrl)}>
                  <Image source={{ uri: imageUrl }} style={styles.thumbnail} />
                </TouchableOpacity>
              ) : (
                <View style={styles.thumbnailPlaceholder}>
                  <Image source={require("./bukowski.png")} style={styles.placeholderLogo} />
                </View>
              )}
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardLabel}>Produkt: <Text style={styles.cardValue}>{item.stock?.Tow_Opis || item.bagProduct || "-"}</Text></Text>
              <Text style={styles.cardLabel}>Kolor: <Text style={styles.cardValue}>{item.color?.Kol_Opis || "-"}</Text></Text>
              <Text style={styles.cardLabel}>Kod: <Text style={styles.cardValue}>{item.code || "-"}</Text></Text>
              <Text style={styles.cardLabel}>Kategoria: <Text style={styles.cardValue}>{item.category || "-"}</Text></Text>
              <Text style={styles.cardLabel}>Podkategoria: <Text style={styles.cardValue}>{item.subcategory?.Kat_1_Opis_1 || "-"}</Text></Text>
              <Text style={styles.cardLabel}>Podpodkategoria: <Text style={styles.cardValue}>{item.remainingsubsubcategory || "-"}</Text></Text>
              <Text style={styles.cardLabel}>Grupa: <Text style={styles.cardValue}>{item.manufacturer?.Prod_Opis || "-"}</Text></Text>
            </View>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceText}>Cena: {formatPrice(item.price)}</Text>
            <Text style={styles.discountText}>Promocja: {formatDiscountPrice(item.discountPrice)}</Text>
          </View>
          <Text style={styles.exceptionsText}>Wyjątki: {exceptionsText || "-"}</Text>
        </View>
        <TouchableOpacity style={styles.editButton} onPress={() => handleEdit(item)}>
          <Ionicons name="pencil" size={16} color="#fff" style={styles.buttonIcon} />
          <Text style={styles.editButtonText}>Edytuj</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cenniki</Text>
        <View style={styles.backButton} />
      </View>

      {loadingUsers ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D6EFD" />
        </View>
      ) : (
        <>
          <View style={styles.selectorContainer}>
            <Text style={styles.selectorLabel}>Wybierz punkt sprzedaży</Text>
            <TouchableOpacity
              style={styles.selectorButton}
              onPress={() => setShowSellingPointModal(true)}
            >
              <Text style={styles.selectorText}>
                {selectedUser ? getSellingPointName(selectedUser) : "Wybierz punkt"}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {showOutdatedWarning && comparisonData && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningTitle}>Cennik wymaga aktualizacji</Text>
              <Text style={styles.warningText}>
                Zmiany: {comparisonData.summary.outdatedCount} zaktualizowanych, {comparisonData.summary.newCount} nowych, {comparisonData.summary.removedCount} usuniętych
              </Text>
            </View>
          )}

          {selectedUser && (
            <View style={styles.actionsContainer}>
              {priceList.length === 0 && !loadingPriceList && (
                <TouchableOpacity style={[styles.primaryAction, styles.actionButton]} onPress={createInitialPriceList}>
                  <Ionicons name="add-circle" size={18} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.actionText}>Utwórz cennik</Text>
                </TouchableOpacity>
              )}

              {priceList.length > 0 && (
                <>
                  <TouchableOpacity style={[styles.secondaryAction, styles.actionButton]} onPress={() => setShowCloneModal(true)}>
                    <Ionicons name="copy" size={18} color="#fff" style={styles.buttonIcon} />
                    <Text style={styles.actionText}>Sklonuj</Text>
                  </TouchableOpacity>
                  {/* Removed Synchronizuj and Aktualizuj globalnie buttons as requested */}
                  {showOutdatedWarning && (
                    <TouchableOpacity
                      style={[styles.primaryAction, styles.actionButton]}
                      onPress={() => synchronizeAllPriceLists(true, true, false)}
                    >
                      <Ionicons name="flash" size={18} color="#fff" style={styles.buttonIcon} />
                      <Text style={styles.actionText}>Aktualizuj wszędzie</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.dangerAction, styles.actionButton]} onPress={deletePriceList}>
                    <Ionicons name="trash" size={18} color="#fff" style={styles.buttonIcon} />
                    <Text style={styles.actionText}>Usuń</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Szukaj po nazwie lub kodzie..."
              placeholderTextColor="#64748B"
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
            {searchTerm.length > 0 && (
              <TouchableOpacity onPress={() => setSearchTerm("")}> 
                <Ionicons name="close-circle" size={20} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {loadingPriceList ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0D6EFD" />
              <Text style={styles.loadingText}>Ładowanie cennika...</Text>
            </View>
          ) : filteredPriceList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="pricetag-outline" size={64} color="#475569" />
              <Text style={styles.emptyText}>
                {priceList.length === 0
                  ? "Brak cennika dla tego punktu"
                  : "Brak wyników"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredPriceList}
              renderItem={renderPriceItem}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: Math.max(120, insets.bottom + 120) }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      <Modal
        visible={showSellingPointModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSellingPointModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wybierz punkt</Text>
              <TouchableOpacity onPress={() => setShowSellingPointModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {filteredUsers.map((user) => (
                <TouchableOpacity
                  key={user._id}
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedSellingPoint(user._id);
                    setShowSellingPointModal(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{getSellingPointName(user)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edytuj ceny</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.modalSubtitle}>{editingItem?.fullName}</Text>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cena</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="numeric"
                  value={editPrice}
                  onChangeText={setEditPrice}
                  placeholder="Wprowadź cenę"
                  placeholderTextColor="#64748B"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cena promocyjna</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="numeric"
                  value={editDiscountPrice}
                  onChangeText={setEditDiscountPrice}
                  placeholder="Wprowadź cenę promocyjną"
                  placeholderTextColor="#64748B"
                />
              </View>

              {editingItem?.category === "Kurtki kożuchy futra" && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Wyjątki cenowe</Text>
                  {editPriceExceptions.map((exception, index) => (
                    <View key={`${index}`} style={styles.exceptionRow}>
                      <View style={styles.exceptionPicker}>
                        <TouchableOpacity
                          style={styles.exceptionSelect}
                          onPress={() => {
                            setActiveExceptionIndex(index);
                            setShowSizePicker(true);
                          }}
                        >
                          <Text style={styles.exceptionSelectText}>
                            {sizes.find((size) => size._id === exception.size)?.Roz_Opis || "Wybierz rozmiar"}
                          </Text>
                          <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={styles.exceptionInput}
                        keyboardType="numeric"
                        value={String(exception.value)}
                        onChangeText={(value) =>
                          handlePriceExceptionChange(index, "value", parseFloat(value) || 0)
                        }
                        placeholder="Cena"
                        placeholderTextColor="#64748B"
                      />
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => handleRemovePriceException(index)}
                      >
                        <Ionicons name="trash" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addExceptionButton} onPress={handleAddPriceException}>
                    <Ionicons name="add" size={18} color="#fff" style={styles.buttonIcon} />
                    <Text style={styles.addExceptionText}>Dodaj wyjątek</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
            {errorText ? (
              <Text style={{ color: "#F87171", fontWeight: "600", marginBottom: 10, textAlign: "center" }}>{errorText}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.primaryAction, styles.actionButton]} onPress={updatePrice}>
                <Text style={styles.actionText}>Zapisz</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryAction, styles.actionButton]} onPress={() => setShowEditModal(false)}>
                <Text style={styles.actionText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSizePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSizePicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz rozmiar</Text>
              <TouchableOpacity onPress={() => setShowSizePicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Ionicons name="search" size={18} color="#94A3B8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Szukaj rozmiaru..."
                placeholderTextColor="#64748B"
                value={sizeSearch}
                onChangeText={setSizeSearch}
              />
            </View>
            <FlatList
              data={sizes.filter((size) =>
                size.Roz_Opis?.toLowerCase().includes(sizeSearch.toLowerCase())
              )}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    if (activeExceptionIndex !== null) {
                      handlePriceExceptionChange(activeExceptionIndex, "size", item._id);
                    }
                    setShowSizePicker(false);
                    setSizeSearch("");
                    setActiveExceptionIndex(null);
                  }}
                >
                  <Text style={styles.pickerItemText}>{item.Roz_Opis}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wynikow</Text>
              }
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCloneModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCloneModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sklonuj cennik</Text>
              <TouchableOpacity onPress={() => setShowCloneModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Wybierz punkt źródłowy</Text>
            <View style={styles.formGroup}>
              <View style={styles.exceptionPicker}>
                <Picker
                  selectedValue={sourcePointForClone}
                  onValueChange={(value) => setSourcePointForClone(value)}
                  dropdownIconColor="#fff"
                  style={styles.picker}
                >
                  <Picker.Item label="Wybierz punkt..." value="" />
                  {users
                    .filter((user) => user._id !== selectedSellingPoint)
                    .map((user) => (
                      <Picker.Item key={user._id} label={getSellingPointName(user)} value={user._id} />
                    ))}
                </Picker>
              </View>
            </View>
            <Text style={styles.warningText}>To zastąpi aktualny cennik</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.primaryAction, styles.actionButton, !sourcePointForClone && styles.disabledAction]}
                onPress={clonePriceList}
                disabled={!sourcePointForClone}
              >
                <Text style={styles.actionText}>Sklonuj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryAction, styles.actionButton]} onPress={() => setShowCloneModal(false)}>
                <Text style={styles.actionText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showGlobalUpdateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGlobalUpdateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Globalna aktualizacja</Text>
              <TouchableOpacity onPress={() => setShowGlobalUpdateModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Dodaj nowe produkty do wszystkich cenników</Text>
            <Text style={styles.modalNote}>
              Operacja zachowa ręcznie zmienione ceny oraz promocje.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.warningAction, styles.actionButton]} onPress={addNewProductsToAll}>
                <Text style={styles.actionText}>Aktualizuj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryAction, styles.actionButton]} onPress={() => setShowGlobalUpdateModal(false)}>
                <Text style={styles.actionText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSyncModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSyncModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Synchronizacja cennika</Text>
              <TouchableOpacity onPress={() => setShowSyncModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            {loadingComparison ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0D6EFD" />
                <Text style={styles.loadingText}>Porównywanie danych...</Text>
              </View>
            ) : comparisonData ? (
              <ScrollView>
                <View style={styles.syncSummary}>
                  <Text style={styles.syncTitle}>Podsumowanie zmian</Text>
                  <Text style={styles.syncItem}>Aktualizacje: {comparisonData.summary.outdatedCount}</Text>
                  <Text style={styles.syncItem}>Nowe: {comparisonData.summary.newCount}</Text>
                  <Text style={styles.syncItem}>Usunięte: {comparisonData.summary.removedCount}</Text>
                </View>

                {comparisonData.changes?.outdatedItems?.length > 0 && (
                  <View style={styles.syncSection}>
                    <Text style={styles.syncSectionTitle}>Produkty do aktualizacji</Text>
                    {comparisonData.changes.outdatedItems.slice(0, 5).map((item, index) => (
                      <Text key={`${index}`} style={styles.syncRowText}>{item.priceListItem.fullName}</Text>
                    ))}
                    {comparisonData.changes.outdatedItems.length > 5 && (
                      <Text style={styles.syncRowHint}>...i {comparisonData.changes.outdatedItems.length - 5} więcej</Text>
                    )}
                  </View>
                )}

                {comparisonData.changes?.newItems?.length > 0 && (
                  <View style={styles.syncSection}>
                    <Text style={styles.syncSectionTitle}>Nowe produkty</Text>
                    {comparisonData.changes.newItems.slice(0, 5).map((item, index) => (
                      <Text key={`${index}`} style={styles.syncRowText}>{item.fullName}</Text>
                    ))}
                    {comparisonData.changes.newItems.length > 5 && (
                      <Text style={styles.syncRowHint}>...i {comparisonData.changes.newItems.length - 5} więcej</Text>
                    )}
                  </View>
                )}
              </ScrollView>
            ) : (
              <Text style={styles.emptyText}>Nie udało się pobrać danych porównania</Text>
            )}
            <View style={styles.modalActions}>
              {comparisonData?.summary?.totalChanges > 0 && (
                <>
                  <TouchableOpacity style={[styles.primaryAction, styles.actionButton]} onPress={() => synchronizePriceList(true, true, false)}>
                    <Text style={styles.actionText}>Aktualizuj i dodaj nowe</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.warningAction, styles.actionButton]} onPress={() => synchronizePriceList(true, false, false)}>
                    <Text style={styles.actionText}>Tylko aktualizuj</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={[styles.secondaryAction, styles.actionButton]} onPress={() => setShowSyncModal(false)}>
                <Text style={styles.actionText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedPicture}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPicture(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.imageModalContent}>
            <TouchableOpacity style={styles.imageModalClose} onPress={() => setSelectedPicture(null)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            {selectedPicture && (
              <Image source={{ uri: selectedPicture }} style={styles.fullImage} resizeMode="contain" />
            )}
          </View>
        </View>
      </Modal>

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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#000000",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },
  backButton: {
    width: 40,
    alignItems: "center",
  },
  selectorContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  selectorLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 6,
  },
  selectorButton: {
    backgroundColor: "#0F172A",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  selectorText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  actionsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  actionButton: {
    marginRight: 8,
    marginBottom: 8,
  },
  buttonIcon: {
    marginRight: 6,
  },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D6EFD",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  secondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#334155",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  warningAction: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F59E0B",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  dangerAction: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DC2626",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  disabledAction: {
    opacity: 0.5,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    marginLeft: 8,
  },
  warningBanner: {
    backgroundColor: "#F59E0B",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    padding: 12,
  },
  warningTitle: {
    color: "#111827",
    fontWeight: "700",
    marginBottom: 4,
  },
  warningText: {
    color: "#111827",
    fontSize: 12,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  loadingText: {
    color: "#CBD5F5",
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: "#CBD5F5",
    marginTop: 8,
  },
  card: {
    backgroundColor: "#0F172A",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
    paddingRight: 8,
  },
  cardIndex: {
    color: "#94A3B8",
    fontSize: 12,
  },
  cardBody: {},
  cardRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  imageContainer: {
    marginRight: 12,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  thumbnailPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderLogo: {
    width: 32,
    height: 32,
    tintColor: "#64748B",
  },
  cardInfo: {
    flex: 1,
  },
  cardLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 2,
  },
  cardValue: {
    color: "#FFFFFF",
    fontSize: 12,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  priceText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  discountText: {
    color: "#FBBF24",
    fontWeight: "700",
  },
  exceptionsText: {
    color: "#CBD5F5",
    fontSize: 12,
  },
  editButton: {
    marginTop: 10,
    backgroundColor: "#0D6EFD",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  editButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    maxHeight: "80%",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  modalContentLarge: {
    width: "100%",
    maxHeight: "90%",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  modalSubtitle: {
    color: "#CBD5F5",
    marginBottom: 8,
  },
  modalNote: {
    color: "#94A3B8",
    fontSize: 12,
  },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  modalItemText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  pickerModalContent: {
    backgroundColor: "#000000",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  pickerModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  pickerSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0A0A0A",
    margin: 16,
    marginBottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
    marginLeft: 8,
  },
  pickerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  pickerItemText: {
    fontSize: 14,
    color: "#fff",
  },
  pickerEmptyText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    padding: 24,
  },
  exceptionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  exceptionPicker: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
    marginRight: 8,
  },
  exceptionSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  exceptionSelectText: {
    color: "#FFFFFF",
    fontSize: 12,
    flex: 1,
    marginRight: 6,
  },
  picker: {
    color: "#FFFFFF",
  },
  exceptionInput: {
    width: 80,
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1E293B",
    marginRight: 8,
  },
  removeButton: {
    backgroundColor: "#DC2626",
    padding: 8,
    borderRadius: 6,
  },
  addExceptionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D6EFD",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  addExceptionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    marginTop: 12,
  },
  syncSummary: {
    backgroundColor: "#111827",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  syncTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    marginBottom: 6,
  },
  syncItem: {
    color: "#CBD5F5",
    fontSize: 12,
  },
  syncSection: {
    marginBottom: 12,
  },
  syncSectionTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    marginBottom: 6,
  },
  syncRowText: {
    color: "#CBD5F5",
    fontSize: 12,
  },
  syncRowHint: {
    color: "#94A3B8",
    fontSize: 12,
  },
  imageModalContent: {
    width: "100%",
    height: "80%",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  imageModalClose: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 2,
  },
  fullImage: {
    width: "100%",
    height: "100%",
  },
  successModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  successModalContent: {
    backgroundColor: "#0A0A0A",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    width: "80%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  successIconContainer: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 16,
    color: "#94A3B8",
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
});

export default Cenniki;
