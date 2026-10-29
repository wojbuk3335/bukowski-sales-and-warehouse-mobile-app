import React, { useState, useEffect, useRef, useContext, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import tokenService from "../services/tokenService";
import useLiveRefresh from "../services/useLiveRefresh"; // zmiany cenników na żywo (także z panelu)
import { getApiUrl, API_CONFIG } from "../config/api";
import { GlobalStateContext } from "../context/GlobalState";

import { createThemedStyles, tc, tcl, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, ModalHeader, ActionItem, look } from '../components/AdminLook'; // wspólny wygląd panelu admina
import { KeyboardSafeScreen, KeyboardSafeOverlay, useRevealInput } from "../components/KeyboardSafe"; // klawiatura nie zasłania pola
import { buildLabelZpl } from "../utils/labelZpl"; // układ metki (jak na serwerze)

// Powody dodania / usunięcia - te same wartości i napisy co w panelu (Warehouse.js, serwer przyjmuje dokładnie te)
export const ADD_REASON_OPTIONS = [
  { value: "production-intake", label: "Przyjęcie z produkcji" },
  { value: "inventory-correction", label: "Korekta inwentaryzacyjna" },
  { value: "return-to-warehouse", label: "Zwrot z punktu" },
  { value: "other", label: "Inny ruch magazynowy" },
];
export const DELETE_REASON_OPTIONS = [
  { value: "inventory-correction", label: "Korekta inwentaryzacyjna" },
  { value: "return-to-production", label: "Zwrot do produkcji" },
  { value: "damage-disposal", label: "Uszkodzenie / likwidacja" },
  { value: "other", label: "Inny ruch magazynowy" },
];
// Torebki, portfele i pozostały asortyment dodaje się bez rozmiaru (jak w panelu)
const NO_SIZE_CATEGORIES = ["Torebki", "Portfele", "Pozostały asortyment"];
const PAGE_SIZE = 30; // karty rysowane porcjami - lista magazynu bywa długa
const toLocalDay = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const WarehouseMobile = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
    const { user, isLoggedIn } = useContext(GlobalStateContext);
    const isFocused = useIsFocused();
  const params = useLocalSearchParams();
  const normalizeParam = (value) => (Array.isArray(value) ? value[0] : value);
  const paramUserId = normalizeParam(params.userId);
  const paramUserName = normalizeParam(params.userName);
  const paramSymbol = normalizeParam(params.symbol);
  const paramRole = normalizeParam(params.role);
  const paramAllStates = normalizeParam(params.allStates);

  // State management
  const [goods, setGoods] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isCorrection, setIsCorrection] = useState(false); // tryb korekt (ekran „Stany” punktu)
  // Magazyn jak w panelu: okienko powodu przy dodaniu, menu ⋮ na karcie, okienko powodu przy usunięciu
  const [addPrompt, setAddPrompt] = useState(null); // { good, sizeLabel, sizeId }
  const [addReason, setAddReason] = useState("production-intake");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionsItem, setActionsItem] = useState(null); // karta z otwartym menu ⋮
  const [deletePrompt, setDeletePrompt] = useState(null); // { item }
  // Sprzedaż z magazynu do kontrahenta (29.10.2026): sztuka opuszcza obieg MAGAZYN - punkty (bez Dobierania); jak w panelu
  const [sellPrompt, setSellPrompt] = useState(null); // { item }
  const [contractors, setContractors] = useState([]);
  const [sellContractorId, setSellContractorId] = useState("");
  const [sellNote, setSellNote] = useState("");
  const [newContractorName, setNewContractorName] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const magazynIdRef = useRef(null); // id konta MAGAZYN - pobierane raz
  const [targetUserId, setTargetUserId] = useState(paramUserId || null);
  const [targetUserName, setTargetUserName] = useState(paramUserName || null);
  const [targetUserRole, setTargetUserRole] = useState(paramRole || null);
  const [targetSymbol, setTargetSymbol] = useState(paramSymbol || (paramUserId ? "" : "MAGAZYN"));
  const [isAllStatesMode, setIsAllStatesMode] = useState(paramAllStates === "true");

  const [productName, setProductName] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState("1");

  const [filteredProducts, setFilteredProducts] = useState([]);
  const [filteredSizes, setFilteredSizes] = useState([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [priceList, setPriceList] = useState([]); // State for dedykowany cennik
  const [priceListsBySymbol, setPriceListsBySymbol] = useState({}); // tryb „Wszystkie stany”: cennik każdego punktu
  const [pointIdsBySymbol, setPointIdsBySymbol] = useState({}); // tryb „Wszystkie stany”: id punktu po symbolu (druk etykiet)
  const [priceListOwnerId, setPriceListOwnerId] = useState(null); // punkt, którego cennik obowiązuje na tym ekranie
  const [editingItem, setEditingItem] = useState(null); // State for edit modal
  const [editFullName, setEditFullName] = useState("");
  const [editDate, setEditDate] = useState(new Date());
  const [editSize, setEditSize] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditProductDropdown, setShowEditProductDropdown] = useState(false);
  const [filteredEditProducts, setFilteredEditProducts] = useState([]);

  // Notification Modal states
  const [notificationModal, setNotificationModal] = useState({
    visible: false,
    title: "",
    message: "",
    type: "error", // 'error', 'success', 'confirmation'
    confirmText: "OK",
    cancelText: "Anuluj",
    onConfirm: null,
    onCancel: null,
  });

  const productInputRef = useRef(null);
  const sizeInputRef = useRef(null);
  const editProductInputRef = useRef(null);
  // Pola z podpowiedziami: po kliknięciu miejsce nad klawiaturą na pole i rozwiniętą listę
  const screenReveal = useRevealInput();
  const editReveal = useRevealInput();
  const listRef = useRef(null);

  const isStatesMode = Boolean(paramUserId || paramSymbol || paramAllStates);
  const headerTitle = isAllStatesMode
    ? "Wszystkie stany"
    : (isStatesMode ? (targetUserName || "Stany") : "Magazyn");
  const counterLabel = isAllStatesMode
    ? "Produktów we wszystkich stanach"
    : (isStatesMode ? "Produktów w stanie" : "Produktów w magazynie");
  const resolveCurrentSymbol = () => {
    if (targetUserRole && targetUserRole.toLowerCase() === "magazyn") {
      return "MAGAZYN";
    }
    if (isAllStatesMode) {
      return null;
    }
    if (isStatesMode && !targetSymbol) {
      return null;
    }
    return targetSymbol || "MAGAZYN";
  };

  useEffect(() => {
    setTargetUserId(paramUserId || null);
    setTargetUserName(paramUserName || null);
    setTargetUserRole(paramRole || null);
    setIsAllStatesMode(paramAllStates === "true");

    if (paramSymbol) {
      const normalizedSymbol = paramRole && paramRole.toLowerCase() === "magazyn"
        ? "MAGAZYN"
        : paramSymbol;
      setTargetSymbol(normalizedSymbol || "MAGAZYN");
      return;
    }

    if (!paramUserId && paramAllStates !== "true") {
      setTargetSymbol("MAGAZYN");
    } else if (!paramSymbol) {
      setTargetSymbol("");
    }
  }, [paramUserId, paramUserName, paramRole, paramSymbol, paramAllStates]);

  useEffect(() => {
    const fetchTargetUser = async () => {
      if (!paramUserId || paramSymbol || paramAllStates === "true") {
        return;
      }

      try {
        const userUrl = getApiUrl(`/user/${paramUserId}`);
        const response = await tokenService.authenticatedFetch(userUrl);
        const data = await response.json();
        const userData = data?.user;
        if (userData) {
          const normalizedSymbol = userData.role && userData.role.toLowerCase() === "magazyn"
            ? "MAGAZYN"
            : userData.symbol;
          setTargetSymbol(normalizedSymbol || "MAGAZYN");
          setTargetUserName(userData.name || userData.symbol || paramUserName || "Punkt sprzedaży");
          setTargetUserRole(userData.role || null);
        }
      } catch (error) {
        console.error("❌ Error fetching target user:", error.message);
      }
    };

    fetchTargetUser();
  }, [paramUserId, paramSymbol, paramUserName]);

  useEffect(() => {
    if (isStatesMode) {
      setIsCorrection(true);
    }
  }, [isStatesMode]);

  // Refresh goods when switching between selling points
  useEffect(() => {
    if (!isLoggedIn || !isStatesMode || isAllStatesMode) {
      return;
    }

    if (!targetUserId && !paramSymbol) {
      return;
    }

    fetchGoods();
  }, [isLoggedIn, isStatesMode, isAllStatesMode, targetUserId, paramSymbol]);

  // Refresh state data after params are resolved (avoids needing manual pull-to-refresh)
  useEffect(() => {
    if (!isLoggedIn || !isStatesMode) {
      return;
    }

    if (isAllStatesMode) {
      fetchTableData();
      return;
    }

    const currentSymbol = resolveCurrentSymbol();
    if (!currentSymbol) {
      return;
    }

    fetchTableData();
  }, [isLoggedIn, isStatesMode, isAllStatesMode, targetSymbol, targetUserRole, targetUserId]);

  // Zmiany na żywo (panel, inny telefon): stan osobno, towary i cenniki osobno - bez pobierania wszystkiego naraz
  useLiveRefresh(["states"], () => fetchTableData(), { enabled: Boolean(isLoggedIn && isFocused) });
  useLiveRefresh(["pricelists", "goods"], () => { fetchGoods(); fetchPriceList(); }, { enabled: Boolean(isLoggedIn && isFocused) });

  // Ensure data loads on screen focus for both magazyn and stany
  useEffect(() => {
    if (!isLoggedIn || !isFocused) {
      return;
    }

    if (isStatesMode && !isAllStatesMode) {
      const currentSymbol = resolveCurrentSymbol();
      if (!currentSymbol) {
        return;
      }
    }

    fetchTableData();
  }, [isLoggedIn, isFocused, isStatesMode, isAllStatesMode, targetSymbol, targetUserRole, targetUserId]);

  // Fetch initial data
  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    const initializeFetch = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchGoods(),
          fetchSizes(),
          fetchPriceList(),
          fetchTableData(),
        ]);
      } catch (error) {
        console.error("❌ Error during initial fetch:", error.message);
      } finally {
        setLoading(false);
      }
    };

    initializeFetch();
  }, [isLoggedIn]);

  // Karty produktów (raz; odświeżane zdarzeniem „goods”). Ceny z cennika liczy priceForGood przy dodaniu i wyświetlaniu.
  const fetchGoods = async () => {
    try {
      const url = getApiUrl("/excel/goods/get-all-goods");
      const response = await tokenService.authenticatedFetch(url);
      const data = await response.json();
      if (data?.goods && Array.isArray(data.goods)) {
        const validGoods = data.goods.filter((good) => good.fullName && good.fullName.trim() !== "");
        setGoods(validGoods);
        setFilteredProducts(validGoods);
      } else {
        console.warn("⚠️ No goods array found in response, data:", data);
      }
    } catch (error) {
      console.error("❌ Error fetching goods:", error.message);
    }
  };

  // Id konta MAGAZYN (cennik, etykiety) - pobierane raz, nie przy każdym odświeżeniu
  const resolveMagazynId = async () => {
    if (magazynIdRef.current) return magazynIdRef.current;
    const usersResponse = await tokenService.authenticatedFetch(getApiUrl("/user"));
    const usersData = await usersResponse.json();
    const magazynUser = usersData?.users?.find((u) => u.symbol === "MAGAZYN");
    magazynIdRef.current = magazynUser?._id || null;
    return magazynIdRef.current;
  };

  // Cennik punktu, którego stan oglądamy (MAGAZYN albo punkt z parametrów)
  const fetchPriceList = async () => {
    try {
      const priceListUserId = targetUserId || (await resolveMagazynId());
      if (!priceListUserId) return;
      setPriceListOwnerId(priceListUserId);
      const priceListResponse = await tokenService.authenticatedFetch(getApiUrl(`/pricelists/${priceListUserId}`));
      const priceListData = await priceListResponse.json();
      setPriceList(priceListData?.priceList || []);
    } catch (error) {
      // bez cennika - karta produktu
    }
  };

  const fetchSizes = async () => {
    try {
      const url = getApiUrl("/excel/size/get-all-sizes");
      const response = await tokenService.authenticatedFetch(url);
      const data = await response.json();
      if (data?.sizes) {
        // Kurtki/kożuchy/futra muszą mieć konkretny rozmiar - !NIEOKREŚLONY nie jest do wyboru (serwer też go odrzuca)
        const selectable = data.sizes.filter(
          (size) => !/NIEOKRE/i.test(String(size.Roz_Opis || "")) && String(size.Roz_Kod || "") !== "000"
        );
        setSizes(selectable);
        setFilteredSizes(selectable);
      }
    } catch (error) {
      console.error("❌ Error fetching sizes:", error);
    }
  };

  // Odświeżenie listy: tylko stan (duża odpowiedź) - karty produktów i cennik ładują się osobno, raz.
  // Dawniej każde odświeżenie (po każdej dodanej sztuce!) pobierało też wszystkie towary, użytkowników i cennik.
  const fetchTableData = async () => {
    try {
      if (!priceListOwnerId) {
        await fetchPriceList();
      }

      // Tryb „Wszystkie stany”: każda sztuka wyceniana cennikiem punktu, w którym leży
      if (isAllStatesMode) {
        const lists = {};
        try {
          const usersResponse = await tokenService.authenticatedFetch(getApiUrl("/user"));
          const usersData = await usersResponse.json();
          const points = (usersData?.users || []).filter((u) => u.symbol && String(u.symbol).toUpperCase() !== "MAGAZYN");
          setPointIdsBySymbol(Object.fromEntries(points.map((u) => [u.symbol, u._id])));
          await Promise.all(points.map(async (u) => {
            try {
              const plResponse = await tokenService.authenticatedFetch(getApiUrl(`/pricelists/${u._id}`));
              if (plResponse.ok) {
                const plData = await plResponse.json();
                lists[u.symbol] = plData?.priceList || [];
              }
            } catch (plError) {
              // punkt bez cennika
            }
          }));
        } catch (usersError) {
          // bez cenników punktów - zostaje cena ze stanu
        }
        setPriceListsBySymbol(lists);
      }

      // Step 3: Fetch state data - NO price transformation here
      // renderTableRow will handle all price lookup and display
      const url = getApiUrl("/state");
      const response = await tokenService.authenticatedFetch(url);
      const data = await response.json();
      if (data) {
        // Ekran „Magazyn” pokazuje tylko MAGAZYN, ekran punktu tylko ten punkt; „Wszystkie stany” - wszystko.
        // Dawniej ekran Magazynu brał cały stan wszystkich punktów (błąd: wolno i zły licznik).
        const currentSymbol = resolveCurrentSymbol();
        const filteredData = !isAllStatesMode && currentSymbol
          ? data.filter((item) => {
              const itemSymbol = typeof item.symbol === 'string'
                ? item.symbol
                : typeof item.sellingPoint === 'object'
                  ? item.sellingPoint.symbol
                  : item.sellingPoint;
              return itemSymbol === currentSymbol;
            })
          : data;

        // Najnowsza sztuka na górze: kolejność dodania (czas zapisany w identyfikatorze MongoDB), potem data
        const idOf = (row) => String(row.id || row._id || "");
        const sortedData = [...filteredData].sort((a, b) => {
          const idA = idOf(a);
          const idB = idOf(b);
          if (idA && idB && idA !== idB) return idB.localeCompare(idA);
          const dateA = new Date(a.createdAt || a.date || 0);
          const dateB = new Date(b.createdAt || b.date || 0);
          return dateB - dateA;
        });
        setTableData(sortedData);
      }
    } catch (error) {
      console.error("Error fetching table data:", error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchTableData();
    } catch (error) {
      console.error("Error during refresh:", error);
    } finally {
      setRefreshing(false);
    }
  };

  // Handle product name input
  const handleProductNameChange = (text) => {
    setProductName(text);
    if (text.trim()) {
      const filtered = goods.filter((good) =>
        good.fullName.toLowerCase().includes(text.toLowerCase())
      );
      setFilteredProducts(filtered);
      setShowProductDropdown(true);
    } else {
      setFilteredProducts(goods);
      setShowProductDropdown(false);
    }
  };

  // Handle size input
  const handleSizeChange = (text) => {
    setSelectedSize(text);
    if (text.trim()) {
      const filtered = sizes.filter((size) =>
        size.Roz_Opis.toLowerCase() === text.toLowerCase()
      );
      setFilteredSizes(filtered);
      setShowSizeDropdown(true);
    } else {
      setFilteredSizes(sizes);
      setShowSizeDropdown(false);
    }
  };

  // Cena sztuki jak w panelu: cennik MAGAZYNU (wyjątek rozmiaru, inaczej cena / promocja), bez niego karta produktu
  const priceForGood = (good, sizeLabel) => {
    const fromList = (priceList || []).find((item) =>
      (good?._id && item.originalGoodId && String(item.originalGoodId) === String(good._id))
      || item.fullName === good?.fullName || item.productName === good?.fullName);
    const source = fromList && Number(fromList.price) > 0
      ? { price: fromList.price, discount: fromList.discountPrice || 0, exceptions: fromList.priceExceptions || [] }
      : { price: good?.price || 0, discount: good?.discount_price || 0, exceptions: good?.priceExceptions || [] };
    const exception = sizeLabel
      ? source.exceptions.find((ex) => ((ex?.size && ex.size.Roz_Opis) || ex?.size) === sizeLabel)
      : null;
    if (exception && Number(exception.value) > 0) return { price: Number(exception.value), discount: 0 };
    return { price: Number(source.price) || 0, discount: Number(source.discount) || 0 };
  };

  const isMagazynMode = !isStatesMode && !isAllStatesMode;

  // Wybór produktu: torebki / portfele / pozostały asortyment bez rozmiaru -> od razu okienko powodu (jak w panelu)
  const selectProduct = (product) => {
    setProductName(product.fullName);
    setShowProductDropdown(false);
    if (isMagazynMode && NO_SIZE_CATEGORIES.includes(product.category)) {
      setAddReason("production-intake");
      setAddPrompt({ good: product, sizeLabel: null, sizeId: null });
      return;
    }
    setTimeout(() => {
      sizeInputRef.current?.focus();
    }, 100);
  };

  // Wybór rozmiaru: Magazyn -> okienko powodu dodania; ekran punktu -> dodanie jak dotąd (korekta)
  const selectSize = (size) => {
    setSelectedSize(size.Roz_Opis);
    setShowSizeDropdown(false);
    if (isMagazynMode) {
      const good = goods.find((g) => g.fullName === productName);
      if (!good) {
        showNotification({ title: "Błąd", message: "Produkt nie znaleziony w bazie", type: "error" });
        return;
      }
      setAddReason("production-intake");
      setAddPrompt({ good, sizeLabel: size.Roz_Opis, sizeId: size._id });
      return;
    }
    addProduct(size.Roz_Opis);
  };

  // Dodanie do magazynu jednym zapisem (ten sam adres co panel: POST /warehouse/batch-add, cała ilość naraz, z numerem
  // jednorazowym). Dawniej telefon wysyłał N osobnych zapisów jeden po drugim i po każdym przeładowywał cały stan.
  const confirmAddToWarehouse = async () => {
    if (!addPrompt || isSubmitting) return;
    const { good, sizeLabel, sizeId } = addPrompt;
    const quantityNum = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 99);
    const { price, discount } = priceForGood(good, sizeLabel);
    const isCorrectionFromReason = addReason === "inventory-correction";
    const items = Array.from({ length: quantityNum }).map(() => ({
      goodsId: good._id,
      sizeId: sizeId || null,
      price,
      discount_price: discount,
      isCorrection: isCorrectionFromReason,
      date: selectedDate.toISOString(),
    }));
    const idempotencyKey = `wh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    setIsSubmitting(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/warehouse/batch-add"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, additionReason: addReason, idempotencyKey }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || "Błąd podczas dodawania produktu");
      }
      setAddPrompt(null);
      setProductName("");
      setSelectedSize("");
      setQuantity("1");
      await fetchTableData();
      setTimeout(() => {
        listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
        productInputRef.current?.focus();
      }, 100);
    } catch (error) {
      showNotification({ title: "Błąd", message: error.message, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add product to warehouse
  const addProduct = async (sizeValue) => {
    if (isAllStatesMode) {
      showNotification({
        title: "Błąd",
        message: "Nie mozna dodawac produktow w widoku wszystkich stanow",
        type: "error",
      });
      return;
    }
    if (!productName.trim()) {
      showNotification({
        title: "Błąd",
        message: "Wybierz nazwę produktu",
        type: "error",
      });
      return;
    }

    if (!sizeValue.trim()) {
      showNotification({
        title: "Błąd",
        message: "Wybierz rozmiar",
        type: "error",
      });
      return;
    }

    setLoading(true);
    try {
      const selectedGood = goods.find((g) => g.fullName === productName);
      if (!selectedGood) {
        console.error("Product not found:", productName);
        showNotification({
          title: "Błąd",
          message: "Produkt nie znaleziony w bazie",
          type: "error",
        });
        setLoading(false);
        return;
      }

      // Cena z cennika punktu załadowanego raz przy wejściu (bez pobierania przy każdym dodaniu)
      const { price: finalPrice, discount: finalDiscountPrice } = priceForGood(selectedGood, sizeValue);

      const currentSymbol = isStatesMode ? resolveCurrentSymbol() : "MAGAZYN";

      if (isStatesMode && !currentSymbol) {
        showNotification({
          title: "Błąd",
          message: "Nie udało się ustalić punktu sprzedaży",
          type: "error",
        });
        setLoading(false);
        return;
      }

      const dataToSend = {
        fullName: productName,
        size: sizeValue,
        plec: selectedGood.gender || "Unisex",
        date: selectedDate.toISOString(),
        sellingPoint: currentSymbol,
        // Backend expects price in "price;discount_price" format as string
        price: `${finalPrice};${finalDiscountPrice || 0}`,
        isCorrection: isCorrection, // Add correction mode flag
      };

      // Add product multiple times based on quantity
      const quantityNum = parseInt(quantity) || 1;
      const url = getApiUrl("/state");

      for (let i = 0; i < quantityNum; i++) {
        const response = await tokenService.authenticatedFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(dataToSend),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Błąd podczas dodawania produktu');
        }
      }

      // Reset form
      setProductName("");
      setSelectedSize("");
      setQuantity("1");

      await fetchTableData();

      // Scroll to top to show newly added product
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
        productInputRef.current?.focus();
      }, 100);
    } catch (error) {
      console.error("❌ BŁĄD PODCZAS DODAWANIA PRODUKTU DO MAGAZYNU:", error.message);
      console.error("❌ Stack trace:", error.stack);
      showNotification({
        title: "Błąd",
        message: error.message,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // Usunięcie sztuki: te same nagłówki co panel (powód, czy korekta, dzień zdarzenia); serwer odmawia (409),
  // gdy dzień jest wcześniejszy niż przyjęcie sztuki
  const performDelete = async (id, removalReason) => {
    const response = await tokenService.authenticatedFetch(getApiUrl(`/state/${id}`), {
      method: "DELETE",
      headers: {
        "removal-reason": removalReason,
        "is-correction": removalReason === "inventory-correction" ? "true" : "false",
        "event-date": toLocalDay(selectedDate || new Date()),
      },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || "Nie udało się usunąć sztuki.");
    }
    await fetchTableData();
  };

  // --- Sprzedaż z magazynu do kontrahenta ---
  const loadContractors = async () => {
    const response = await tokenService.authenticatedFetch(getApiUrl("/contractors"));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Nie udało się pobrać kontrahentów.");
    setContractors(Array.isArray(data.contractors) ? data.contractors : []);
  };

  const openSellPrompt = async (item) => {
    setSellContractorId("");
    setSellNote("");
    setNewContractorName("");
    setSellPrompt({ item });
    try {
      await loadContractors();
    } catch (error) {
      showNotification({ title: "Kontrahenci", message: error.message, type: "error" });
    }
  };

  // Nowy kontrahent prosto z okienka (bez wychodzenia do panelu)
  const addContractorInline = async () => {
    const name = newContractorName.trim();
    if (!name || isSubmitting) return;
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/contractors"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Nie udało się dodać kontrahenta.");
      await loadContractors();
      if (data.contractor?._id) setSellContractorId(data.contractor._id);
      setNewContractorName("");
    } catch (error) {
      showNotification({ title: "Kontrahenci", message: error.message, type: "error" });
    }
  };

  const confirmSellToContractor = async () => {
    if (!sellPrompt || !sellContractorId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl("/warehouse/sales"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateIds: [sellPrompt.item.id || sellPrompt.item._id],
          contractorId: sellContractorId,
          eventDate: toLocalDay(selectedDate || new Date()), // dzień wybrany nad listą, jak przy usuwaniu
          note: sellNote.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || "Nie udało się zapisać sprzedaży z magazynu.");
      setSellPrompt(null);
      await fetchTableData();
      showNotification({ title: "Sprzedaż z magazynu", message: data.message || "Wydano towar kontrahentowi.", type: "success" });
    } catch (error) {
      showNotification({ title: "Sprzedaż z magazynu", message: error.message, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Magazyn: okienko „Usuń produkt z magazynu” z wyborem powodu (jak w panelu)
  const confirmDeleteWithReason = async () => {
    if (!deletePrompt || !deleteReason || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await performDelete(deletePrompt.item.id || deletePrompt.item._id, deleteReason);
      setDeletePrompt(null);
    } catch (error) {
      showNotification({ title: "Nie można usunąć sztuki", message: error.message, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteProduct = (item) => {
    if (isMagazynMode) {
      setDeleteReason("");
      setDeletePrompt({ item });
      return;
    }
    // Ekran punktu („Panel korekt”): potwierdzenie jak dotąd, zapis jako korekta
    showNotification({
      title: "Usuń produkt (korekta - zostanie uwzględniona w raportach)",
      message: "Czy chcesz usunąć ten produkt?",
      type: "confirmation",
      confirmText: "Usuń",
      cancelText: "Anuluj",
      onConfirm: async () => {
        try {
          await performDelete(item.id || item._id, "inventory-correction");
          showNotification({ title: "Sukces", message: "Produkt usunięty", type: "success" });
        } catch (error) {
          showNotification({ title: "Nie można usunąć sztuki", message: error.message, type: "error" });
        }
      },
    });
  };

  // Menu ⋮ karty: akcja po zamknięciu menu (okienko nie nakłada się na menu)
  const runRowAction = (action) => {
    const item = actionsItem;
    setActionsItem(null);
    if (item) setTimeout(() => action(item), 250);
  };

  // Handle date picker change
  const handleDateChange = (event, date) => {
    if (date) {
      setSelectedDate(date);
    }
    setShowDatePicker(false);
  };

  // Render product row
  // Handle edit button click
  const handleEditClick = (item) => {
    setEditingItem(item);
    const fullNameStr = typeof item.fullName === "string"
      ? item.fullName
      : (item.fullName?.fullName || "");
    setEditFullName(fullNameStr);
    setEditDate(new Date(item.date));
    setEditSize(item.size);
    setShowEditModal(true);
    setShowEditProductDropdown(false);
    setFilteredEditProducts([]);
  };

  // Handle edit product name change
  const handleEditProductNameChange = (text) => {
    setEditFullName(text);
    if (text.trim()) {
      const filtered = goods.filter((good) =>
        good.fullName.toLowerCase().includes(text.toLowerCase())
      );
      setFilteredEditProducts(filtered);
      setShowEditProductDropdown(true);
    } else {
      setFilteredEditProducts([]);
      setShowEditProductDropdown(false);
    }
  };

  // Select product from edit dropdown
  const selectEditProduct = (product) => {
    setEditFullName(product.fullName);
    setShowEditProductDropdown(false);
  };

  // Save edited product
  const handleSaveEdit = async () => {
    if (!editFullName.trim()) {
      showNotification({
        title: "Błąd",
        message: "Nazwa produktu nie może być pusta",
        type: "error",
      });
      return;
    }

    try {
      const updateUrl = getApiUrl(`/state/${editingItem.id || editingItem._id}`);
      await tokenService.authenticatedFetch(updateUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: editFullName,
          date: editDate.toISOString(),
          size: editSize,
          sellingPoint: typeof editingItem.symbol === "string" ? editingItem.symbol : editingItem.sellingPoint?.symbol, // jak panel
        }),
      });

      setShowEditModal(false);
      await fetchTableData();
    } catch (error) {
      showNotification({
        title: "Błąd",
        message: error.message,
        type: "error",
      });
    }
  };

  // Generate ZPL code for Zebra printer
  const generateZplCode = (item, priceValue) => {
    try {
      const fullNameStr = typeof item.fullName === "string"
        ? item.fullName
        : (item.fullName?.fullName || "N/A");

      const sizeStr = typeof item.size === "object"
        ? (item.size?.Roz_Opis || item.size || "-")
        : (item.size || "-");

      const barcode = item.barcode || "NO-BARCODE";
      const symbol = "02"; // MAGAZYN = 02

      // Układ metki wspólny z serwerem (utils/labelZpl.js) - wydruk zapasowy wygląda tak samo
      return buildLabelZpl({ productName: fullNameStr, price: priceValue, size: sizeStr, pointNumber: symbol, barcode });
    } catch (error) {
      console.error('Error generating ZPL:', error);
      return null;
    }
  };

  // Send ZPL to Zebra printer
  const sendZplToPrinter = async (zplCode) => {
    const printerIP = '192.168.1.25';
    const printerPort = 9100;
    const printerUrl = `http://${printerIP}:${printerPort}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300);

    try {
      await fetch(printerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: zplCode,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return true;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        return true; // Timeout is OK for Zebra printers
      }
      return false;
    }
  };

  // Handle print button - implements same price priority logic as web/print-labels
  const handlePrintLabel = async (item) => {
    try {
      const fullNameStr = typeof item.fullName === "string"
        ? item.fullName
        : (item.fullName?.fullName || "N/A");

      const sizeStr = typeof item.size === "object"
        ? (item.size?.Roz_Opis || item.size)
        : item.size;

      // Etykieta z serwera: cena z AKTUALNEGO cennika punktu w chwili druku (jak w panelu i „Drukuj etykiety”)
      const itemSymbol = typeof item.symbol === "string" ? item.symbol : item.sellingPoint?.symbol;
      const labelPointId = isAllStatesMode ? pointIdsBySymbol[itemSymbol] : priceListOwnerId;
      if (labelPointId) {
        try {
          const labelResponse = await tokenService.authenticatedFetch(getApiUrl("/print/generate-zpl"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sellingPointId: labelPointId,
              itemBarcode: item.barcode ? String(item.barcode) : undefined,
              itemFullName: fullNameStr,
              itemSize: sizeStr,
            }),
          });
          if (labelResponse.ok) {
            const labelData = await labelResponse.json();
            if (Array.isArray(labelData?.zplCodes) && labelData.zplCodes.length > 0) {
              let printed = 0;
              for (const code of labelData.zplCodes) {
                if (await sendZplToPrinter(code)) printed++;
              }
              if (printed === 0) {
                showNotification({
                  title: "Błąd",
                  message: "Nie udało się wysłać etykiety do drukarki. Sprawdź połączenie z drukarką Zebra (192.168.1.25:9100)",
                  type: "error",
                });
              }
              return;
            }
          }
        } catch (labelError) {
          // serwer niedostępny - druk lokalny poniżej
        }
      }

      // Parse price string "price;discount_price"
      let standardPrice = 0;
      let discountPrice = 0;
      if (typeof item.price === "string" && item.price.includes(";")) {
        const [p, dp] = item.price.split(";");
        standardPrice = parseFloat(p) || 0;
        discountPrice = parseFloat(dp) || 0;
      } else {
        standardPrice = parseFloat(item.price) || 0;
      }

      // Find matching good to get priceExceptions
      const matchingGood = goods.find(g => g.fullName === fullNameStr);
      const priceExceptions = matchingGood?.priceExceptions || [];

      // **PRIORITY 1**: Check if there's a price exception for this size
      const priceException = priceExceptions.find(ex => {
        const exceptionSize = typeof ex.size === 'object'
          ? (ex.size?.Roz_Opis || ex.size?.name)
          : ex.size;
        return exceptionSize === sizeStr;
      });

      let printCount = 0;

      if (priceException) {
        // Print 1 label with exception price
        const zpl = generateZplCode(item, priceException.value);
        if (zpl) {
          const success = await sendZplToPrinter(zpl);
          if (success) printCount = 1;
        }
      } else if (discountPrice > 0) {
        // Print 2 labels - discount and standard
        const discountZpl = generateZplCode(item, discountPrice);
        const regularZpl = generateZplCode(item, standardPrice);

        if (discountZpl && regularZpl) {
          const success1 = await sendZplToPrinter(discountZpl);
          const success2 = await sendZplToPrinter(regularZpl);
          if (success1 && success2) printCount = 2;
        }
      } else {
        // Print 1 label with standard price
        const zpl = generateZplCode(item, standardPrice);
        if (zpl) {
          const success = await sendZplToPrinter(zpl);
          if (success) printCount = 1;
        }
      }

      // Silent printing - no success modal
      if (printCount === 0) {
        showNotification({
          title: "Błąd",
          message: "Nie udało się wysłać etykiety do drukarki. Sprawdź połączenie z drukarką Zebra (192.168.1.25:9100)",
          type: "error",
        });
      }
    } catch (error) {
      showNotification({
        title: "Błąd",
        message: "Nie udało się drukować etykiety: " + error.message,
        type: "error",
      });
    }
  };

  // Helper function to show notifications
  const showNotification = ({
    title = "",
    message = "",
    type = "error",
    confirmText = "OK",
    cancelText = "Anuluj",
    onConfirm = null,
    onCancel = null,
  }) => {
    setNotificationModal({
      visible: true,
      title,
      message,
      type,
      confirmText,
      cancelText,
      onConfirm,
      onCancel,
    });
  };

  // Helper function to safely convert any value to string
  const safeString = (val) => {
    if (val === null || val === undefined) return "";
    if (typeof val === "string") return val;
    if (typeof val === "number") return val.toString();
    if (typeof val === "object") {
      if (val.Roz_Opis) return String(val.Roz_Opis);
      return String(val.toString ? val.toString() : "");
    }
    return String(val);
  };

  const renderTableRow = ({ item, index }) => {
    // Step 1: Get final price and exceptions from dedykowany cennik if available
    let displayPrice = item.price;
    let displayDiscountPrice = item.discount_price;
    let displayPriceExceptions = item.priceExceptions;
    let priceListItem = null;
    const fullNameStr = typeof item.fullName === "string"
      ? item.fullName
      : (item.fullName?.fullName || safeString(item.fullName));

    const itemSymbol = typeof item.symbol === "string" ? item.symbol : item.sellingPoint?.symbol;
    const rowPriceList = isAllStatesMode ? (priceListsBySymbol[itemSymbol] || []) : priceList;
    if (rowPriceList && rowPriceList.length > 0 && item.fullName) {
      // słownik zamiast przeszukiwania cennika przy każdej karcie
      const lookup = isAllStatesMode ? buildPriceListLookup(rowPriceList) : priceListLookup;
      priceListItem = lookup.byName.get(fullNameStr)
        || (item.fullName?._id ? lookup.byGoodId.get(String(item.fullName._id)) : null)
        || null;
      // 0 zł w cenniku = brak ceny w cenniku punktu: liczy się karta produktu (jak etykiety z serwera)
      if (priceListItem && !(Number(priceListItem.price) > 0)) priceListItem = null;

      // Cena wyświetlana = AKTUALNY cennik punktu (jak etykiety); cena ze stanu tylko gdy cennik nie ma produktu lub ma 0 zł
      const hasStoredPrice = !(Number(priceListItem?.price) > 0) && Number(item.price) > 0;
      if (priceListItem) {
        displayPrice = !hasStoredPrice && priceListItem.price !== undefined ? priceListItem.price : displayPrice;
        displayDiscountPrice = !hasStoredPrice && priceListItem.discountPrice !== undefined ? priceListItem.discountPrice : displayDiscountPrice;
        displayPriceExceptions = priceListItem.priceExceptions !== undefined ? priceListItem.priceExceptions : displayPriceExceptions;
      }
    }

    if (!priceListItem && goods && goods.length > 0) {
      const goodsItem = (item.fullName?._id && goodsLookup.byId.get(String(item.fullName._id))) || goodsLookup.byName.get(fullNameStr);

      if (goodsItem) { // bez ceny w cenniku punktu: aktualna karta produktu (jak etykiety z serwera)
        displayPrice = goodsItem.price !== undefined ? goodsItem.price : displayPrice;
        displayDiscountPrice = goodsItem.discount_price !== undefined ? goodsItem.discount_price : displayDiscountPrice;
        displayPriceExceptions = goodsItem.priceExceptions !== undefined ? goodsItem.priceExceptions : displayPriceExceptions;
      }
    }

    // Compute exceptions string - ensure all values are strings
    const exceptionsText = displayPriceExceptions && displayPriceExceptions.length > 0
      ? displayPriceExceptions
          .map((e) => {
            if (!e) return "";
            const sizeLabel = (e.size && e.size.Roz_Opis) || e.size || "";
            const exceptionValue = e.value !== undefined && e.value !== null ? e.value : "";
            if (!sizeLabel && exceptionValue === "") return "";
            return exceptionValue === "" ? safeString(sizeLabel) : `${safeString(sizeLabel)}=${safeString(exceptionValue)}`;
          })
          .filter(Boolean)
          .join(", ")
      : null;

    return (
      <View style={styles.card}>
        {/* Numer pozycji i nazwa produktu */}
        <View style={styles.cardTopRow}>
          <View style={styles.cardNumberBadge}>
            <Text style={styles.cardNumber}>{`#${index + 1}`}</Text>
          </View>
          <Text style={styles.cardProductName} numberOfLines={2}>
            {safeString(item.fullName)}
          </Text>
        </View>

        {/* Info rows */}
        <View style={styles.cardInfoRow}>
          <Text style={styles.cardInfoLabel}>Rozmiar:</Text>
          <Text style={styles.cardInfoValue}>{safeString(item.size)}</Text>
        </View>

        <View style={styles.cardInfoRow}>
          <Text style={styles.cardInfoLabel}>Data:</Text>
          <Text style={styles.cardInfoValue}>
            {item.date ? safeString(new Date(item.date).toLocaleDateString("pl-PL")) : "N/A"}
          </Text>
        </View>

        {item.symbol ? (
          <View style={styles.cardInfoRow}>
            <Text style={styles.cardInfoLabel}>Symbol:</Text>
            <Text style={styles.cardInfoValue}>{safeString(item.symbol)}</Text>
          </View>
        ) : null}

        {displayPrice ? (
          <View style={styles.cardInfoRow}>
            <Text style={styles.cardInfoLabel}>Cena (PLN):</Text>
            <Text style={styles.cardInfoValue}>{typeof displayPrice === 'number' ? displayPrice.toFixed(2) : safeString(displayPrice)}</Text>
          </View>
        ) : null}

        {displayDiscountPrice ? (
          <View style={styles.cardInfoRow}>
            <Text style={styles.cardInfoLabel}>Cena promocyjna:</Text>
            <Text style={styles.cardInfoValue}>{typeof displayDiscountPrice === 'number' ? displayDiscountPrice.toFixed(2) : safeString(displayDiscountPrice)}</Text>
          </View>
        ) : null}

        {exceptionsText ? (
          <View style={styles.cardInfoRow}>
            <Text style={styles.cardInfoLabel}>Wyjątki:</Text>
            <Text style={styles.cardInfoValue}>{safeString(exceptionsText)}</Text>
          </View>
        ) : null}

        {/* Menu ⋮ jak w panelu: Edytuj, Drukuj etykietę, Usuń */}
        <View style={[styles.cardActionButtons, { justifyContent: "flex-end" }]}>
          <TouchableOpacity
            testID={`warehouse-actions-${item.id || item._id}`}
            accessibilityLabel={`Akcje: ${fullNameStr}`}
            onPress={() => setActionsItem(item)}
            style={look.dotsButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={look.dotsText}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Słowniki do kart (budowane raz na zmianę danych, nie na każdą kartę)
  const goodsLookup = useMemo(() => ({
    byId: new Map((goods || []).map((g) => [String(g._id), g])),
    byName: new Map((goods || []).map((g) => [g.fullName, g])),
  }), [goods]);
  const buildPriceListLookup = (list) => {
    const byName = new Map();
    const byGoodId = new Map();
    (list || []).forEach((pli) => {
      if (pli.fullName && !byName.has(pli.fullName)) byName.set(pli.fullName, pli);
      if (pli.originalGoodId && !byGoodId.has(String(pli.originalGoodId))) byGoodId.set(String(pli.originalGoodId), pli);
    });
    return { byName, byGoodId };
  };
  const priceListLookup = useMemo(() => buildPriceListLookup(priceList), [priceList]);
  const visibleRows = tableData.slice(0, visibleCount);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc('bg', "#000000") }]}>
      <KeyboardSafeScreen>
      {/* Header */}
      <PageHeader
        title={headerTitle}
        icon={isStatesMode ? "layers-outline" : "cube-outline"}
        color={isStatesMode ? "#0D6EFD" : "#F59E0B"}
        onBack={() => router.back()}
      />

      <ScrollView alwaysBounceVertical
        ref={screenReveal.scrollRef}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        style={styles.content}
        contentContainerStyle={styles.contentInner}
      >
        {/* Product Counter */}
        <View style={styles.productCounter}>
          <View style={[styles.iconTile, { backgroundColor: "#0D6EFD26" }]}>
            <Ionicons name="cube-outline" size={20} color="#0D6EFD" />
          </View>
          <Text style={styles.productCounterText}>
            {counterLabel}: <Text style={styles.productCounterNumber} testID="warehouse-counter">{tableData.length}</Text>
          </Text>
        </View>

        {/* Input Form */}
        <View style={styles.formContainer}>
          {/* Correction Mode Info */}
          {isStatesMode ? (
            <View style={styles.correctionAlert}>
              <View style={styles.correctionInfoRow}>
                <Ionicons name="information-circle-outline" size={20} color="#0D6EFD" />
                <Text style={styles.correctionInfo}>
                  <Text style={styles.correctionInfoBold}>Panel korekt:</Text> Ten panel jest
                  przeznaczony dla korekt inwentaryzacyjnych. Wszystkie operacje
                  dodawania i usuwania produktów{" "}
                  <Text style={styles.correctionInfoBold}>będą uwzględniane w raportach</Text>.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.correctionAlert}>
              <View style={styles.correctionInfoRow}>
                <Ionicons name="information-circle-outline" size={20} color="#0D6EFD" />
                <Text style={styles.correctionInfo}>
                  Po wybraniu produktu (i rozmiaru) wskażesz <Text style={styles.correctionInfoBold}>powód dodania</Text>:
                  przyjęcie z produkcji, korekta inwentaryzacyjna, zwrot z punktu albo inny ruch - jak w panelu.
                </Text>
              </View>
            </View>
          )}

          <Text style={styles.label}>Ilość</Text>
          <TextInput
            style={styles.input}
            placeholder="1"
            placeholderTextColor={tc('muted', "#666")}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Nazwa produktu</Text>
          <View style={styles.dropdownContainer}>
            <TextInput
              ref={productInputRef}
              style={styles.input}
              placeholder="Wpisz nazwę produktu"
              placeholderTextColor={tc('muted', "#666")}
              value={productName}
              onChangeText={handleProductNameChange}
              onFocus={() => screenReveal.revealWithSpace(productInputRef, 220)}
              returnKeyType="next"
              onSubmitEditing={() => sizeInputRef.current?.focus()}
            />
            {showProductDropdown && filteredProducts.length > 0 && (
              <ScrollView
                style={styles.dropdownMenu}
                nestedScrollEnabled={true}
                scrollEnabled={filteredProducts.length > 5}
              >
                {filteredProducts.slice(0, 10).map((product, idx) => (
                  <TouchableOpacity
                    key={idx}
                    testID={`product-suggestion-${product._id || idx}`}
                    style={styles.dropdownItem}
                    onPress={() => selectProduct(product)}
                  >
                    <Text style={styles.dropdownItemText}>
                      {product.fullName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          <Text style={styles.label}>Rozmiar</Text>
          <View style={styles.dropdownContainer}>
            <TextInput
              ref={sizeInputRef}
              style={styles.input}
              placeholder="Wpisz rozmiar"
              autoCapitalize="characters" // rozmiar wielkimi literami
              placeholderTextColor={tc('muted', "#666")}
              value={selectedSize}
              onChangeText={handleSizeChange}
              onFocus={() => screenReveal.revealWithSpace(sizeInputRef, 220)}
              returnKeyType="done"
            />
            {showSizeDropdown && filteredSizes.length > 0 && (
              <ScrollView
                style={styles.dropdownMenu}
                nestedScrollEnabled={true}
                scrollEnabled={filteredSizes.length > 5}
              >
                {filteredSizes.map((size, idx) => (
                  <TouchableOpacity
                    key={idx}
                    testID={`size-suggestion-${size._id || idx}`}
                    style={styles.dropdownItem}
                    onPress={() => selectSize(size)}
                  >
                    <Text style={styles.dropdownItemText}>
                      {size.Roz_Opis}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          <Text style={styles.label}>Data</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar" size={20} color="#0D6EFD" />
            <Text style={styles.dateText}>
              {selectedDate.toLocaleDateString("pl-PL")}
            </Text>
            <Ionicons name="chevron-down" size={18} color={tc('muted', "#94A3B8")} />
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
              locale="pl"
            />
          )}
        </View>

        {/* Products List as Cards */}
        <FlatList
          ref={listRef}
          data={visibleRows}
          renderItem={renderTableRow}
          keyExtractor={(item, idx) => String(item.id || item._id || idx)}
          scrollEnabled={false}
          initialNumToRender={PAGE_SIZE}
          ListEmptyComponent={
            <View style={look.emptyState}>
              <Ionicons name="cube-outline" size={48} color={tc('muted', "#94A3B8")} />
              <Text style={look.emptyStateText}>Brak produktów w magazynie</Text>
            </View>
          }
          ListFooterComponent={tableData.length > visibleCount ? (
            <TouchableOpacity
              testID="warehouse-show-more"
              style={[look.neutralButton, { flex: 0, alignSelf: "stretch", marginTop: 8 }]}
              onPress={() => setVisibleCount((n) => n + PAGE_SIZE)}
            >
              <Text style={look.neutralButtonText}>{`Pokaż więcej (${tableData.length - visibleCount} pozostałych)`}</Text>
            </TouchableOpacity>
          ) : null}
        />
      </ScrollView>

      {/* Menu ⋮ karty - te same akcje co w panelu */}
      {actionsItem && (
        <View style={styles.notificationOverlay}>
          <View style={styles.notificationModal}>
            <ModalHeader
              icon="ellipsis-horizontal-circle"
              color="#0D6EFD"
              title={typeof actionsItem.fullName === "string" ? actionsItem.fullName : (actionsItem.fullName?.fullName || "Akcje")}
            />
            <ActionItem testID="warehouse-action-edit" icon="pencil" color="#F59E0B" label="Edytuj" onPress={() => runRowAction(handleEditClick)} />
            <ActionItem testID="warehouse-action-print" icon="print" label="Drukuj etykietę" onPress={() => runRowAction(handlePrintLabel)} />
            {isMagazynMode && (
              <ActionItem testID="warehouse-action-sell" icon="cart" color="#0D6EFD" label="Sprzedaj kontrahentowi" onPress={() => runRowAction(openSellPrompt)} />
            )}
            <ActionItem testID="warehouse-action-delete" icon="trash" color="#DC3545" label="Usuń" onPress={() => runRowAction(deleteProduct)} />
            <TouchableOpacity style={[look.neutralButton, { flex: 0, alignSelf: "stretch", marginTop: 12 }]} onPress={() => setActionsItem(null)}>
              <Text style={look.neutralButtonText}>Anuluj</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Dodaj produkt do magazynu - powód dodania (jak w panelu) */}
      {addPrompt && (
        <View style={styles.notificationOverlay}>
          <View style={styles.notificationModal}>
            <ModalHeader icon="add-circle-outline" color="#F59E0B" title="Dodaj produkt do magazynu" />
            <Text style={styles.reasonProduct}>
              {`Dodawany produkt: ${addPrompt.good.fullName}${addPrompt.sizeLabel ? ` (${addPrompt.sizeLabel})` : ""}${(parseInt(quantity, 10) || 1) > 1 ? ` × ${parseInt(quantity, 10)}` : ""}`}
            </Text>
            <Text style={styles.label}>Wybierz powód dodania</Text>
            {ADD_REASON_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                testID={`add-reason-${option.value}`}
                style={[styles.reasonOption, addReason === option.value && styles.reasonOptionSelected]}
                onPress={() => setAddReason(option.value)}
              >
                <Ionicons name={addReason === option.value ? "radio-button-on" : "radio-button-off"} size={20} color={addReason === option.value ? "#F59E0B" : tc('muted', "#94A3B8")} />
                <Text style={styles.reasonOptionText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={[look.buttonRow, { width: "100%", marginTop: 12 }]}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setAddPrompt(null)} disabled={isSubmitting}>
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="add-reason-confirm" style={[look.primaryButton, isSubmitting && look.disabled]} onPress={confirmAddToWarehouse} disabled={isSubmitting}>
                <Text style={look.buttonText}>{isSubmitting ? "Dodawanie..." : "Dodaj"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Usuń produkt z magazynu - powód usunięcia (jak w panelu) */}
      {deletePrompt && (
        <View style={styles.notificationOverlay}>
          <View style={styles.notificationModal}>
            <ModalHeader icon="trash-outline" color="#DC3545" title="Usuń produkt z magazynu" />
            <Text style={styles.reasonProduct}>
              {`${typeof deletePrompt.item.fullName === "string" ? deletePrompt.item.fullName : (deletePrompt.item.fullName?.fullName || "")} (${safeString(deletePrompt.item.size) || "-"})`}
            </Text>
            <Text style={styles.label}>Wybierz powód usunięcia</Text>
            {DELETE_REASON_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                testID={`delete-reason-${option.value}`}
                style={[styles.reasonOption, deleteReason === option.value && styles.reasonOptionSelected]}
                onPress={() => setDeleteReason(option.value)}
              >
                <Ionicons name={deleteReason === option.value ? "radio-button-on" : "radio-button-off"} size={20} color={deleteReason === option.value ? "#DC3545" : tc('muted', "#94A3B8")} />
                <Text style={styles.reasonOptionText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={[look.buttonRow, { width: "100%", marginTop: 12 }]}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setDeletePrompt(null)} disabled={isSubmitting}>
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="delete-reason-confirm"
                style={[look.primaryButton, { backgroundColor: "#DC3545" }, (!deleteReason || isSubmitting) && look.disabled]}
                onPress={confirmDeleteWithReason}
                disabled={!deleteReason || isSubmitting}
              >
                <Text style={look.buttonText}>{isSubmitting ? "Usuwanie..." : "Usuń"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Sprzedaj kontrahentowi - wybór odbiorcy (albo szybkie dodanie), uwagi; sztuka opuszcza magazyn (jak w panelu) */}
      {sellPrompt && (
        <View style={styles.notificationOverlay}>
          <KeyboardSafeOverlay>
          <View style={styles.notificationModal}>
            <ModalHeader icon="cart-outline" color="#0D6EFD" title="Sprzedaj kontrahentowi" />
            <Text style={styles.reasonProduct}>
              {`${typeof sellPrompt.item.fullName === "string" ? sellPrompt.item.fullName : (sellPrompt.item.fullName?.fullName || "")} (${safeString(sellPrompt.item.size) || "-"})`}
            </Text>
            <Text style={styles.label}>Kontrahent</Text>
            <ScrollView style={{ maxHeight: 180, alignSelf: "stretch" }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {contractors.length === 0 ? (
                <Text style={styles.reasonOptionText}>Brak kontrahentów - dodaj pierwszego poniżej.</Text>
              ) : contractors.map((contractor) => (
                <TouchableOpacity
                  key={contractor._id}
                  testID={`sell-contractor-${contractor._id}`}
                  style={[styles.reasonOption, sellContractorId === contractor._id && styles.reasonOptionSelected]}
                  onPress={() => setSellContractorId(contractor._id)}
                >
                  <Ionicons name={sellContractorId === contractor._id ? "radio-button-on" : "radio-button-off"} size={20} color={sellContractorId === contractor._id ? "#0D6EFD" : tc('muted', "#94A3B8")} />
                  <Text style={styles.reasonOptionText}>{contractor.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.label}>Nowy kontrahent (gdy nie ma go na liście)</Text>
            <View style={{ flexDirection: "row", gap: 8, alignSelf: "stretch" }}>
              <TextInput
                testID="sell-new-contractor"
                style={[styles.input, { flex: 1 }]}
                value={newContractorName}
                onChangeText={setNewContractorName}
                placeholder="Nazwa firmy / osoby"
                placeholderTextColor={tc('muted', "#64748B")}
                onSubmitEditing={addContractorInline}
              />
              <TouchableOpacity testID="sell-add-contractor" style={[look.neutralButton, { flex: 0 }, !newContractorName.trim() && look.disabled]} onPress={addContractorInline} disabled={!newContractorName.trim()}>
                <Text style={look.neutralButtonText}>Dodaj</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Uwagi (np. forma płatności)</Text>
            <TextInput testID="sell-note" style={[styles.input, { alignSelf: "stretch" }]} value={sellNote} onChangeText={setSellNote} placeholder="opcjonalnie" placeholderTextColor={tc('muted', "#64748B")} />
            <Text style={styles.reasonOptionText}>Data wydania: {toLocalDay(selectedDate || new Date())}</Text>
            <View style={[look.buttonRow, { width: "100%", marginTop: 12 }]}>
              <TouchableOpacity style={look.neutralButton} onPress={() => setSellPrompt(null)} disabled={isSubmitting}>
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="sell-confirm"
                style={[look.primaryButton, (!sellContractorId || isSubmitting) && look.disabled]}
                onPress={confirmSellToContractor}
                disabled={!sellContractorId || isSubmitting}
              >
                <Text style={look.buttonText}>{isSubmitting ? "Wydawanie..." : "Wydaj"}</Text>
              </TouchableOpacity>
            </View>
          </View>
          </KeyboardSafeOverlay>
        </View>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <View style={styles.modalOverlay}>
          {/* Okienko to zwykły View (nie Modal): tło jest absolutne, więc samo robi miejsce na klawiaturę */}
          <KeyboardSafeOverlay style={{ justifyContent: "flex-end" }}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <ModalHeader icon="pencil" color="#F59E0B" title="Edytuj produkt" />
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowEditModal(false)}
              >
                <Ionicons name="close" size={22} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>

            <ScrollView ref={editReveal.scrollRef} style={styles.modalContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Nazwa produktu</Text>
              <View style={styles.dropdownContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Wpisz nazwę produktu"
                  placeholderTextColor={tc('muted', "#666")}
                  value={editFullName}
                  onChangeText={handleEditProductNameChange}
                  ref={editProductInputRef}
                  onFocus={() => editReveal.revealWithSpace(editProductInputRef, 220)}
                />
                {showEditProductDropdown && filteredEditProducts.length > 0 && (
                  <ScrollView
                    style={styles.dropdownMenu}
                    nestedScrollEnabled={true}
                    scrollEnabled={filteredEditProducts.length > 5}
                  >
                    {filteredEditProducts.slice(0, 10).map((product, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.dropdownItem}
                        onPress={() => selectEditProduct(product)}
                      >
                        <Text style={styles.dropdownItemText}>
                          {product.fullName}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              <Text style={styles.label}>Rozmiar</Text>
              <TextInput
                style={styles.input}
                placeholder="Rozmiar"
                autoCapitalize="characters" // rozmiar wielkimi literami
                placeholderTextColor={tc('muted', "#666")}
                value={editSize}
                onChangeText={setEditSize}
              />

              <Text style={styles.label}>Data</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar" size={20} color="#0D6EFD" />
                <Text style={styles.dateText}>
                  {editDate.toLocaleDateString("pl-PL")}
                </Text>
                <Ionicons name="chevron-down" size={18} color={tc('muted', "#94A3B8")} />
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={editDate}
                  mode="date"
                  display="spinner"
                  onChange={(event, date) => {
                    if (date) setEditDate(date);
                    setShowDatePicker(false);
                  }}
                />
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={look.neutralButton}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[look.primaryButton, styles.buttonSuccess]}
                onPress={handleSaveEdit}
              >
                <Text style={look.buttonText}>Zapisz</Text>
              </TouchableOpacity>
            </View>
          </View>
          </KeyboardSafeOverlay>
        </View>
      )}

      {/* Notification Modal */}
      {notificationModal.visible && (
        <View style={styles.notificationOverlay}>
          <View style={styles.notificationModal}>
            <ModalHeader
              icon={
                notificationModal.type === "success"
                  ? "checkmark-circle"
                  : notificationModal.type === "confirmation"
                  ? "trash"
                  : "alert-circle"
              }
              color={
                notificationModal.type === "success"
                  ? "#10B981"
                  : notificationModal.type === "confirmation"
                  ? "#DC3545"
                  : "#F59E0B"
              }
              title={notificationModal.title}
            />

            <Text style={look.modalMessage}>
              {notificationModal.message}
            </Text>

            <View style={styles.notificationFooter}>
              {notificationModal.type === "confirmation" && (
                <TouchableOpacity
                  style={look.neutralButton}
                  onPress={() => {
                    if (notificationModal.onCancel) {
                      notificationModal.onCancel();
                    }
                    setNotificationModal({ ...notificationModal, visible: false });
                  }}
                >
                  <Text style={look.neutralButtonText}>
                    {notificationModal.cancelText}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  look.primaryButton,
                  notificationModal.type === "success"
                    ? styles.buttonSuccess
                    : notificationModal.type === "confirmation"
                    ? styles.buttonDanger
                    : null,
                ]}
                onPress={() => {
                  if (notificationModal.onConfirm) {
                    notificationModal.onConfirm();
                  }
                  setNotificationModal({ ...notificationModal, visible: false });
                }}
              >
                <Text style={look.buttonText}>
                  {notificationModal.confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc('bg', "#000000"),
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 24,
  },
  productCounter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    gap: 12,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  productCounterText: {
    color: tc('text', "#fff"),
    fontSize: 16,
    fontWeight: "600",
    flexShrink: 1,
  },
  productCounterNumber: {
    color: "#0D6EFD",
    fontSize: 18,
    fontWeight: "bold",
  },
  formContainer: {
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  label: {
    color: tc('muted', "#94A3B8"),
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    color: tc('text', "#fff"),
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  // informacja o korektach: karta z niebieskim paskiem z lewej
  correctionAlert: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderLeftWidth: 4,
    borderLeftColor: "#0D6EFD",
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#0D6EFD",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    backgroundColor: "transparent",
  },
  checkboxChecked: {
    backgroundColor: "#0D6EFD",
  },
  correctionLabel: {
    color: tc('text', "#fff"),
    fontSize: 15,
    fontWeight: "bold",
  },
  correctionInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  correctionInfo: {
    flex: 1,
    color: tc('muted', "#94A3B8"),
    fontSize: 13,
    lineHeight: 19,
  },
  correctionInfoBold: {
    fontWeight: "bold",
    color: tc('text', "#fff"),
  },
  dropdownContainer: {
    position: "relative",
    marginBottom: 0,
  },
  dropdownMenu: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    marginTop: 4,
    maxHeight: 150,
    zIndex: 1000,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#334155"),
  },
  dropdownItemText: {
    color: tc('text', "#fff"),
    fontSize: 14,
  },
  dateButton: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dateText: {
    flex: 1,
    color: tc('text', "#fff"),
    fontSize: 16,
    fontWeight: "600",
  },

  // karta produktu: niebieski pasek z lewej
  card: {
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderLeftWidth: 4,
    borderLeftColor: "#0D6EFD",
    marginBottom: 12,
    position: "relative",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  cardNumberBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "#0D6EFD26",
    borderWidth: 1,
    borderColor: "#0D6EFD66",
  },
  cardNumber: {
    fontSize: 12,
    color: tc('text', "#fff"),
    fontWeight: "700",
  },
  cardProductName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "bold",
    color: tc('text', "#fff"),
    lineHeight: 20,
  },
  cardInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    alignItems: "center",
  },
  cardInfoLabel: {
    fontSize: 13,
    color: tc('muted', "#94A3B8"),
    fontWeight: "600",
    flex: 0.4,
  },
  cardInfoValue: {
    fontSize: 14,
    color: tc('text', "#fff"),
    fontWeight: "600",
    flex: 0.6,
    textAlign: "right",
  },
  cardActionButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tc('border', "#1E293B"),
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  editButton: {
    borderColor: "#F59E0B66",
    backgroundColor: "#F59E0B1F",
  },
  printButton: {
    borderColor: "#0D6EFD66",
    backgroundColor: "#0D6EFD1F",
  },
  deleteButton: {
    borderColor: "#DC354566",
    backgroundColor: "#DC35451F",
  },
  actionButtonText: {
    color: tc('text', "#fff"),
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  // okienko edycji: arkusz od dołu
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: tc('surface', "#161622"),
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: tc('border', "#232533"),
  },
  modalHeader: {
    position: "relative",
    paddingHorizontal: 20,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#232533"),
  },
  modalCloseButton: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  modalFooter: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    backgroundColor: tc('surface', "#161622"),
    borderTopWidth: 1,
    borderTopColor: tc('border', "#232533"),
  },
  buttonSuccess: {
    backgroundColor: "#10B981",
  },
  buttonDanger: {
    backgroundColor: "#DC3545",
  },
  // okienko komunikatu
  notificationModal: {
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
  },
  notificationFooter: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  reasonProduct: {
    color: tc('text', '#fff'),
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    marginBottom: 8,
    width: '100%',
  },
  reasonOptionSelected: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  reasonOptionText: {
    color: tc('text', '#fff'),
    fontSize: 15,
  },
  notificationOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
}));

export default WarehouseMobile;
