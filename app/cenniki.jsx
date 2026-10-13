import React, { useEffect, useMemo, useState, useRef } from "react";
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
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import tokenService from "../services/tokenService";
import useLiveRefresh from "../services/useLiveRefresh"; // zmiany cenników na żywo (także z panelu)
import { API_CONFIG, getApiUrl } from "../config/api";

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
// Walidacja ceny w cenniku: cena > 0, promocja 0 albo niższa od ceny, wyjątki z rozmiarem i ceną > 0, bez powtórzeń.
// Zwraca komunikat błędu albo null.
// Liczba z pola ceny: akceptuje przecinek jako separator dziesiętny ("199,99"), puste = NaN
const toPriceNumber = (value) => {
    if (value === null || value === undefined) return NaN;
    const text = String(value).trim().replace(',', '.');
    return text === '' ? NaN : Number(text);
};

const validatePriceListPrice = ({ price, discountPrice, priceExceptions }) => {
    const priceNumber = toPriceNumber(price);
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
        return 'Cena musi być większa od 0 zł.';
    }
    const discountText = discountPrice === null || discountPrice === undefined ? '' : String(discountPrice).trim();
    const discountNumber = discountText === '' ? 0 : toPriceNumber(discountText);
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
        const valueNumber = toPriceNumber(exception.value);
        if (!Number.isFinite(valueNumber) || valueNumber <= 0) return 'Cena w wyjątku dla rozmiaru musi być większa od 0 zł.';
        if (seenSizes.has(sizeKey)) return 'Ten sam rozmiar nie może mieć dwóch wyjątków cenowych.';
        seenSizes.add(sizeKey);
    }
    return null;
};

const Cenniki = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState([]);
  const [selectedSellingPoint, setSelectedSellingPoint] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [priceList, setPriceList] = useState([]);
  const [loadingPriceList, setLoadingPriceList] = useState(false);
  const [priceListError, setPriceListError] = useState(""); // błąd pobrania (sieć/serwer/uprawnienia) - to NIE jest brak cennika
  const [pointsWithPriceList, setPointsWithPriceList] = useState(null); // id punktów z cennikiem (źródła klonowania)
  const [sizes, setSizes] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [showSellingPointModal, setShowSellingPointModal] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [errorText, setErrorText] = useState(""); // błąd walidacji ceny w oknie edycji
  const [editingItem, setEditingItem] = useState(null);
  const [editPrice, setEditPrice] = useState("");
  const [editDiscountPrice, setEditDiscountPrice] = useState("");
  const [editPriceExceptions, setEditPriceExceptions] = useState([]);
  const [messageModal, setMessageModal] = useState(null); // { kind: 'success' | 'error', text } - zamiast systemowych okienek
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false); // potwierdzenie usunięcia cennika
  const showMessage = (text, kind = "success") => setMessageModal({ kind, text });
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [sizeSearch, setSizeSearch] = useState("");
  const [activeExceptionIndex, setActiveExceptionIndex] = useState(null);

  const [showCloneModal, setShowCloneModal] = useState(false);
  const [sourcePointForClone, setSourcePointForClone] = useState("");

  const [comparisonData, setComparisonData] = useState(null);
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
      // zdjęcie zapisane z innym hostem (localhost, IP z dev) - podmieniamy na aktualny serwer
      const baseUrl = API_CONFIG.BASE_URL.replace("/api", "");
      return picturePath.replace(/^https?:\/\/[^/]+/, baseUrl);
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
          const firstPoint = filtered.find((user) => String(user.role || "").toLowerCase() === "user") || filtered[0];
          setSelectedSellingPoint(firstPoint._id);
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

  const requestSeq = useRef(0); // numer ostatniego żądania - odpowiedzi starszych żądań (inny punkt) są ignorowane

  const fetchPriceList = async (sellingPointId, { silent = false } = {}) => {
    if (!sellingPointId) return;
    const seq = ++requestSeq.current;
    const isStale = () => seq !== requestSeq.current;
    if (!silent) setLoadingPriceList(true); // odświeżanie na żywo nie chowa listy i nie przewija jej na górę
    try {
      const url = getApiUrl(`/pricelists/${sellingPointId}`);
      const response = await tokenService.authenticatedFetch(url);
      if (isStale()) return;
      if (response.ok) {
        const data = await response.json();
        if (isStale()) return;
        setPriceList(data.priceList || []);
        setPriceListError("");
      } else if (response.status === 404) {
        setPriceList([]);
        setPriceListError("");
      } else {
        const errorData = await response.json().catch(() => ({}));
        setPriceListError(errorData.message || `Błąd ${response.status}`);
      }
    } catch (error) {
      if (isStale()) return;
      setPriceListError("Brak połączenia z serwerem");
    }
    setLoadingPriceList(false);

    await checkSynchronization(sellingPointId, isStale);
  };

  // Zmiana cennika gdziekolwiek (panel, inny telefon) od razu odświeża widok
  useLiveRefresh(["pricelists", "goods"], () => {
    if (selectedSellingPoint) fetchPriceList(selectedSellingPoint, { silent: true });
  });

  const checkSynchronization = async (sellingPointId, isStale = () => false) => {
    try {
      const url = getApiUrl(`/pricelists/${sellingPointId}/compare`);
      const response = await tokenService.authenticatedFetch(url);
      if (isStale()) return;
      if (response.ok) {
        const data = await response.json();
        if (isStale()) return;
        setComparisonData(data);
        if (data.summary.totalChanges > 0) {
          setShowOutdatedWarning(true);
        } else {
          setShowOutdatedWarning(false);
        }
      } else {
        setComparisonData(null);
        setShowOutdatedWarning(false);
      }
    } catch (error) {
      if (isStale()) return;
      setComparisonData(null);
      setShowOutdatedWarning(false);
    }
  };

  // Aktualizacja cennika BIEŻĄCEGO punktu: nazwy/kody z kart, nowe produkty, usunięcie skasowanych z kart.
  // Ceny ustawione w cenniku zostają.
  const synchronizeCurrentPriceList = async () => {
    if (!selectedSellingPoint) return;
    try {
      const url = getApiUrl(`/pricelists/${selectedSellingPoint}/sync`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateOutdated: true, addNew: true, removeDeleted: true, updatePrices: false }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        showMessage(`Nie udało się zaktualizować cennika: ${result.message || result.error || response.status}`, "error");
        return;
      }
      setShowOutdatedWarning(false);
      await fetchPriceList(selectedSellingPoint);
      const summary = result.summary || {};
      showMessage(`Cennik zaktualizowany.\nZmienione: ${summary.updatedCount || 0}, dodane: ${summary.addedCount || 0}, usunięte: ${summary.removedCount || 0}.\nCeny ustawione w cenniku zostały bez zmian.`);
    } catch (error) {
      showMessage("Nie udało się zaktualizować cennika", "error");
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
        showMessage("Cennik został utworzony na podstawie produktów");
      } else if (response.status === 409) {
        await fetchPriceList(selectedSellingPoint);
        showMessage("Ten punkt ma już cennik. Odświeżono widok.");
      } else {
        const errorData = await response.json().catch(() => ({}));
        showMessage(`Nie udało się utworzyć cennika: ${errorData.message || response.status}`, "error");
      }
    } catch (error) {
      showMessage("Nie udało się utworzyć cennika", "error");
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
        showMessage("Cennik został sklonowany");
      } else {
        const errorData = await response.json().catch(() => ({}));
        showMessage(`Nie udało się sklonować cennika: ${errorData.message || response.status}`, "error");
      }
    } catch (error) {
      showMessage("Nie udało się sklonować cennika", "error");
    } finally {
      setLoadingPriceList(false);
    }
  };

  const deletePriceList = async () => {
    if (!selectedSellingPoint) return;
    setConfirmDeleteOpen(true);
  };

  const confirmDeletePriceList = async () => {
    setConfirmDeleteOpen(false);
    try {
      const url = getApiUrl(`/pricelists/${selectedSellingPoint}`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "DELETE",
      });
      if (response.ok) {
        setPriceList([]);
        setComparisonData(null);
        setShowOutdatedWarning(false);
        showMessage("Cennik został usunięty");
      } else {
        showMessage("Nie udało się usunąć cennika", "error");
      }
    } catch (error) {
      showMessage("Nie udało się usunąć cennika", "error");
    }
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
          price: toPriceNumber(editPrice),
          discountPrice: String(editDiscountPrice ?? "").trim() === "" ? 0 : toPriceNumber(editDiscountPrice),
          priceExceptions: editPriceExceptions.map((exception) => ({ size: exception.size, value: toPriceNumber(exception.value) })),
        }),
      });

      if (response.ok) {
        await fetchPriceList(selectedSellingPoint);
        setShowEditModal(false);
        setEditingItem(null);
        setEditPrice("");
        setEditDiscountPrice("");
        setEditPriceExceptions([]);
        showMessage("Cena została zaktualizowana");
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
    setEditDiscountPrice(item.discountPrice > 0 ? String(item.discountPrice) : "");
    setErrorText("");

    // Wszystkie istniejące wyjątki trafiają do formularza (nie filtrujemy po liście rozmiarów -
    // gdyby rozmiary jeszcze się nie wczytały, zapis skasowałby wyjątki). Kwota jako tekst do edycji.
    setEditPriceExceptions((item.priceExceptions || []).map((exception) => ({
      size: String(exception.size?._id || exception.size || ""),
      sizeLabel: exception.size?.Roz_Opis || "",
      value: exception.value === null || exception.value === undefined ? "" : String(exception.value),
    })));

    setShowEditModal(true);
  };

  const handlePriceExceptionChange = (index, field, value) => {
    setEditPriceExceptions((prev) => prev.map((exception, i) => (i === index ? { ...exception, [field]: value } : exception)));
  };

  const handleAddPriceException = () => {
    setEditPriceExceptions((prev) => [...prev, { size: "", value: "" }]);
  };

  const handleRemovePriceException = (index) => {
    setEditPriceExceptions((prev) => prev.filter((_, i) => i !== index));
  };

  // Okno klonowania: lista źródeł tylko z punktów, które mają cennik
  const openCloneModal = async () => {
    setSourcePointForClone("");
    setShowCloneModal(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/pricelists/get-all-priceLists"));
      if (response.ok) {
        const data = await response.json();
        setPointsWithPriceList(new Set((data.priceLists || []).map((list) => String(list.sellingPointId))));
      } else {
        setPointsWithPriceList(null);
      }
    } catch (error) {
      setPointsWithPriceList(null);
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
          <Ionicons name="arrow-back" size={24} color={tc('text', "#fff")} />
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
              <Ionicons name="chevron-down" size={20} color={tc('text', "#fff")} />
            </TouchableOpacity>
          </View>

          {showOutdatedWarning && comparisonData && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningTitle}>Cennik wymaga aktualizacji</Text>
              <Text style={styles.warningText}>
                Do aktualizacji: {comparisonData.summary.outdatedCount} zmienionych, {comparisonData.summary.newCount} nowych, {comparisonData.summary.removedCount} usuniętych z kart. Ceny w cenniku zostaną bez zmian.
              </Text>
            </View>
          )}

          {selectedUser && (
            <View style={styles.actionsContainer}>
              {priceListError && !loadingPriceList && (
                <TouchableOpacity style={[styles.dangerAction, styles.actionButton]} onPress={() => fetchPriceList(selectedSellingPoint)}>
                  <Ionicons name="refresh" size={18} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.actionText}>Błąd: {priceListError}. Spróbuj ponownie</Text>
                </TouchableOpacity>
              )}

              {!priceListError && priceList.length === 0 && !loadingPriceList && (
                <>
                  <TouchableOpacity style={[styles.primaryAction, styles.actionButton]} onPress={createInitialPriceList}>
                    <Ionicons name="add-circle" size={18} color="#fff" style={styles.buttonIcon} />
                    <Text style={styles.actionText}>Utwórz cennik</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.secondaryAction, styles.actionButton]} onPress={openCloneModal}>
                    <Ionicons name="copy" size={18} color={tc('text', "#fff")} style={styles.buttonIcon} />
                    <Text style={styles.actionText}>Sklonuj</Text>
                  </TouchableOpacity>
                </>
              )}

              {!priceListError && priceList.length > 0 && (
                <>
                  <TouchableOpacity style={[styles.secondaryAction, styles.actionButton]} onPress={openCloneModal}>
                    <Ionicons name="copy" size={18} color={tc('text', "#fff")} style={styles.buttonIcon} />
                    <Text style={styles.actionText}>Sklonuj</Text>
                  </TouchableOpacity>
                  {/* Removed Synchronizuj and Aktualizuj globalnie buttons as requested */}
                  {showOutdatedWarning && (
                    <TouchableOpacity
                      style={[styles.primaryAction, styles.actionButton]}
                      onPress={synchronizeCurrentPriceList}
                    >
                      <Ionicons name="flash" size={18} color="#fff" style={styles.buttonIcon} />
                      <Text style={styles.actionText}>Zaktualizuj cennik</Text>
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
            <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
            <TextInput
              style={styles.searchInput}
              placeholder="Szukaj po nazwie lub kodzie..."
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

          {loadingPriceList ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0D6EFD" />
              <Text style={styles.loadingText}>Ładowanie cennika...</Text>
            </View>
          ) : filteredPriceList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="pricetag-outline" size={64} color="#475569" />
              <Text style={styles.emptyText}>
                {priceListError
                  ? "Nie udało się pobrać cennika"
                  : priceList.length === 0
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
                <Ionicons name="close" size={24} color={tc('text', "#fff")} />
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
                <Ionicons name="close" size={24} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.modalSubtitle}>{editingItem?.fullName}</Text>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cena</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="decimal-pad"
                  value={editPrice}
                  onChangeText={setEditPrice}
                  placeholder="Wprowadź cenę"
                  placeholderTextColor={tc('muted', "#64748B")}
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cena promocyjna</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="decimal-pad"
                  value={editDiscountPrice}
                  onChangeText={setEditDiscountPrice}
                  placeholder="Wprowadź cenę promocyjną"
                  placeholderTextColor={tc('muted', "#64748B")}
                />
              </View>

              {(!["Torebki", "Portfele", "Pozostały asortyment"].includes(editingItem?.category) || editPriceExceptions.length > 0) && (
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
                            {sizes.find((size) => size._id === exception.size)?.Roz_Opis || exception.sizeLabel || "Wybierz rozmiar"}
                          </Text>
                          <Ionicons name="chevron-down" size={16} color={tc('muted', "#94A3B8")} />
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={styles.exceptionInput}
                        keyboardType="decimal-pad"
                        value={String(exception.value ?? "")}
                        onChangeText={(value) => handlePriceExceptionChange(index, "value", value)}
                        placeholder="Cena"
                        placeholderTextColor={tc('muted', "#64748B")}
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
                <Ionicons name="close" size={24} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Ionicons name="search" size={18} color={tc('muted', "#94A3B8")} />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Szukaj rozmiaru..."
                placeholderTextColor={tc('muted', "#64748B")}
                value={sizeSearch}
                onChangeText={setSizeSearch}
              />
            </View>
            <FlatList
              data={sizes.filter((size) =>
                size.Roz_Opis?.toLowerCase().includes(sizeSearch.toLowerCase())
                && !editPriceExceptions.some((other, otherIndex) => otherIndex !== activeExceptionIndex && other.size === size._id)
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
                <Ionicons name="close" size={24} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Wybierz punkt, z którego skopiować cennik</Text>
            <ScrollView style={styles.cloneList}>
              {users
                .filter((user) => user._id !== selectedSellingPoint && (!pointsWithPriceList || pointsWithPriceList.has(String(user._id))))
                .map((user) => {
                  const isSelected = sourcePointForClone === user._id;
                  return (
                    <TouchableOpacity
                      key={user._id}
                      style={[styles.cloneItem, isSelected && styles.cloneItemSelected]}
                      onPress={() => setSourcePointForClone(user._id)}
                    >
                      <Ionicons
                        name={isSelected ? "radio-button-on" : "radio-button-off"}
                        size={20}
                        color={isSelected ? "#0D6EFD" : "#64748B"}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={[styles.modalItemText, isSelected && styles.cloneItemTextSelected]}>{getSellingPointName(user)}</Text>
                    </TouchableOpacity>
                  );
                })}
              {pointsWithPriceList && users.filter((user) => user._id !== selectedSellingPoint && pointsWithPriceList.has(String(user._id))).length === 0 ? (
                <Text style={styles.modalItemText}>Żaden inny punkt nie ma jeszcze cennika.</Text>
              ) : null}
            </ScrollView>
            {priceList.length > 0 ? (
              <Text style={styles.warningText}>To zastąpi aktualny cennik</Text>
            ) : null}
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
        visible={!!selectedPicture}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPicture(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.imageModalContent}>
            <TouchableOpacity style={styles.imageModalClose} onPress={() => setSelectedPicture(null)}>
              <Ionicons name="close" size={24} color={tc('text', "#fff")} />
            </TouchableOpacity>
            {selectedPicture && (
              <Image source={{ uri: selectedPicture }} style={styles.fullImage} resizeMode="contain" />
            )}
          </View>
        </View>
      </Modal>

      {/* Potwierdzenie usunięcia cennika (w stylu aplikacji) */}
      <Modal
        visible={confirmDeleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDeleteOpen(false)}
      >
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="warning" size={64} color="#F59E0B" />
            </View>
            <Text style={styles.successTitle}>Usuń cennik</Text>
            <Text style={styles.successMessage}>
              Czy na pewno chcesz usunąć cały cennik tego punktu? Tej operacji nie da się cofnąć. Punkt będzie korzystał z cen z kart produktów.
            </Text>
            <View style={styles.dialogButtons}>
              <TouchableOpacity style={[styles.dialogButton, styles.dialogDanger]} onPress={confirmDeletePriceList}>
                <Text style={styles.successButtonText}>Tak, usuń cennik</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogButton, styles.dialogCancel]} onPress={() => setConfirmDeleteOpen(false)}>
                <Text style={styles.successButtonText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Komunikaty (sukces / błąd) w stylu aplikacji */}
      <Modal
        visible={Boolean(messageModal)}
        transparent
        animationType="fade"
        onRequestClose={() => setMessageModal(null)}
      >
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons
                name={messageModal?.kind === "error" ? "close-circle" : "checkmark-circle"}
                size={64}
                color={messageModal?.kind === "error" ? "#EF4444" : "#10B981"}
              />
            </View>
            <Text style={styles.successTitle}>{messageModal?.kind === "error" ? "Błąd" : "Gotowe"}</Text>
            <Text style={styles.successMessage}>{messageModal?.text}</Text>
            <TouchableOpacity
              style={[styles.successButton, messageModal?.kind === "error" && styles.dialogDanger]}
              onPress={() => setMessageModal(null)}
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
    backgroundColor: tc('bg', "#000000"),
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  headerTitle: {
    color: tc('text', "#FFFFFF"),
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
    color: tc('muted', "#94A3B8"),
    fontSize: 12,
    marginBottom: 6,
  },
  selectorButton: {
    backgroundColor: tc('surface', "#0F172A"),
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  selectorText: {
    color: tc('text', "#FFFFFF"),
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
    backgroundColor: tc('surface2', "#334155"),
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
    color: tc('text', "#FFFFFF"),
    fontSize: 12,
    fontWeight: "600",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#0F172A"),
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  searchInput: {
    flex: 1,
    color: tc('text', "#FFFFFF"),
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
    backgroundColor: tc('surface', "#0F172A"),
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: {
    color: tc('text', "#FFFFFF"),
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
    paddingRight: 8,
  },
  cardIndex: {
    color: tc('muted', "#94A3B8"),
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
    backgroundColor: tc('surface', "#1E293B"),
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderLogo: {
    width: 32,
    height: 32,
    tintColor: tc('muted', "#64748B"),
  },
  cardInfo: {
    flex: 1,
  },
  cardLabel: {
    color: tc('muted', "#94A3B8"),
    fontSize: 12,
    marginBottom: 2,
  },
  cardValue: {
    color: tc('text', "#FFFFFF"),
    fontSize: 12,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  priceText: {
    color: tc('text', "#FFFFFF"),
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
    backgroundColor: tc('surface', "#0F172A"),
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  modalContentLarge: {
    width: "100%",
    maxHeight: "90%",
    backgroundColor: tc('surface', "#0F172A"),
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    color: tc('text', "#FFFFFF"),
    fontSize: 16,
    fontWeight: "700",
  },
  modalSubtitle: {
    color: "#CBD5F5",
    marginBottom: 8,
  },
  modalNote: {
    color: tc('muted', "#94A3B8"),
    fontSize: 12,
  },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  modalItemText: {
    color: tc('text', "#FFFFFF"),
    fontSize: 14,
  },
  cloneList: {
    maxHeight: 320,
    marginBottom: 12,
  },
  cloneItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    marginBottom: 8,
  },
  cloneItemSelected: {
    borderColor: "#0D6EFD",
    backgroundColor: "rgba(13, 110, 253, 0.12)",
  },
  cloneItemTextSelected: {
    fontWeight: "700",
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    color: tc('muted', "#94A3B8"),
    fontSize: 12,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: tc('surface', "#111827"),
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: tc('text', "#FFFFFF"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  pickerModalContent: {
    backgroundColor: tc('bg', "#000000"),
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
    borderBottomColor: tc('border', "#1E293B"),
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: tc('text', "#fff"),
  },
  pickerSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#0A0A0A"),
    margin: 16,
    marginBottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 14,
    color: tc('text', "#fff"),
    marginLeft: 8,
  },
  pickerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  pickerItemText: {
    fontSize: 14,
    color: tc('text', "#fff"),
  },
  pickerEmptyText: {
    fontSize: 14,
    color: tc('muted', "#64748B"),
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
    backgroundColor: tc('surface', "#111827"),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
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
    color: tc('text', "#FFFFFF"),
    fontSize: 12,
    flex: 1,
    marginRight: 6,
  },
  picker: {
    color: tc('text', "#FFFFFF"),
  },
  exceptionInput: {
    width: 80,
    backgroundColor: tc('surface', "#111827"),
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: tc('text', "#FFFFFF"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
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
    backgroundColor: tc('surface', "#111827"),
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  syncTitle: {
    color: tc('text', "#FFFFFF"),
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
    color: tc('text', "#FFFFFF"),
    fontWeight: "700",
    marginBottom: 6,
  },
  syncRowText: {
    color: "#CBD5F5",
    fontSize: 12,
  },
  syncRowHint: {
    color: tc('muted', "#94A3B8"),
    fontSize: 12,
  },
  imageModalContent: {
    width: "100%",
    height: "80%",
    backgroundColor: tc('surface', "#0F172A"),
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
  dialogButtons: {
    width: "100%",
    gap: 10,
  },
  dialogButton: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 12,
  },
  dialogDanger: {
    backgroundColor: "#DC2626",
  },
  dialogCancel: {
    backgroundColor: "#64748B",
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
    color: tc('text', "#fff"),
    textAlign: "center",
  },
}));

export default Cenniki;
