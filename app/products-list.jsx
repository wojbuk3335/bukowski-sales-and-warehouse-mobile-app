import React, { useState, useEffect, useRef } from "react";
import { REMAINING_SUBCATEGORY_OPTIONS, getRemainingProductTypeByKey, remainingCodeDigits } from "../config/remainingProductTypes";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import * as ImagePicker from 'expo-image-picker';
import tokenService from "../services/tokenService";
import { getApiUrl, API_CONFIG } from "../config/api";

const ProductsList = () => {
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [enlargedImage, setEnlargedImage] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  
  // Picker modals
  const [showStockPicker, setShowStockPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSubcategoryPicker, setShowSubcategoryPicker] = useState(false);
  const [showManufacturerPicker, setShowManufacturerPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [activeSizeExceptionIndex, setActiveSizeExceptionIndex] = useState(null);
  
  // Search terms for pickers
  const [stockSearch, setStockSearch] = useState("");
  const [colorSearch, setColorSearch] = useState("");
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [manufacturerSearch, setManufacturerSearch] = useState("");
  const [sizeSearch, setSizeSearch] = useState("");
  
  // Form states
  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [price, setPrice] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");
  const [category, setCategory] = useState("Kurtki kożuchy futra");
  const [description, setDescription] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Data from API
  const [stocks, setStocks] = useState([]);
  const [colors, setColors] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [belts, setBelts] = useState([]);
  const [gloves, setGloves] = useState([]);
  const [caps, setCaps] = useState([]); // czapki (Rodzaj D/M jak paski i rękawiczki)
  const [bagsData, setBagsData] = useState([]);
  const [walletsData, setWalletsData] = useState([]);
  const [bagsCategories, setBagsCategories] = useState([]);
  const [walletsCategories, setWalletsCategories] = useState([]);
  const [remainingProducts, setRemainingProducts] = useState([]);
  
  // Selected values
  const [selectedStock, setSelectedStock] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [selectedManufacturer, setSelectedManufacturer] = useState("");
  const [selectedGender, setSelectedGender] = useState("");
  const [priceExceptions, setPriceExceptions] = useState([]);
  
  // States for Torebki category
  const [selectedBagsCategoryId, setSelectedBagsCategoryId] = useState("");
  const [selectedBagsCategoryCode, setSelectedBagsCategoryCode] = useState("");
  const [selectedBagCode, setSelectedBagCode] = useState("");
  const [showBagsPicker, setShowBagsPicker] = useState(false);
  const [showBagsCategoryPicker, setShowBagsCategoryPicker] = useState(false);
  const [bagsSearch, setBagsSearch] = useState("");
  
  // States for Portfele category
  const [selectedWalletsCategoryId, setSelectedWalletsCategoryId] = useState("");
  const [selectedWalletsCategoryCode, setSelectedWalletsCategoryCode] = useState("");
  const [selectedWalletCode, setSelectedWalletCode] = useState("");
  const [showWalletsPicker, setShowWalletsPicker] = useState(false);
  const [showWalletsCategoryPicker, setShowWalletsCategoryPicker] = useState(false);
  const [walletsSearch, setWalletsSearch] = useState("");
  
  // States for Pozostały asortyment category
  const [remainingCategories, setRemainingCategories] = useState([]);
  const [remainingSubcategories, setRemainingSubcategories] = useState([]);
  const [selectedRemainingCategoryId, setSelectedRemainingCategoryId] = useState("");
  const [selectedRemainingSubcategoryId, setSelectedRemainingSubcategoryId] = useState("");
  const [selectedRemainingProductCode, setSelectedRemainingProductCode] = useState("");
  const [showRemainingPicker, setShowRemainingPicker] = useState(false);
  const [remainingProductsSearch, setRemainingProductsSearch] = useState("");
  const [showRemainingCategoryPicker, setShowRemainingCategoryPicker] = useState(false);
  const [showRemainingSubcategoryPicker, setShowRemainingSubcategoryPicker] = useState(false);

  // Ref for FlatList to scroll to bottom
  const flatListRef = useRef(null);

  useEffect(() => {
    fetchProducts();
    fetchAllData();
  }, []);

  // Helper function to get full image URL
  const getImageUrl = (picturePath) => {
    if (!picturePath || picturePath.trim() === '') {
      return null;
    }
    
    // If already a full URL (starts with http), replace localhost with actual IP
    if (picturePath.startsWith('http://') || picturePath.startsWith('https://')) {
      const baseUrl = API_CONFIG.BASE_URL.replace('/api', '');
      const fixedUrl = picturePath.replace('http://localhost:3000', baseUrl);
      return fixedUrl;
    }
    
    // If starts with /, it's a relative path - add base URL without /api
    if (picturePath.startsWith('/')) {
      const baseUrl = API_CONFIG.BASE_URL.replace('/api', '');
      return `${baseUrl}${picturePath}`;
    }
    
    // Otherwise, assume it's just filename and build full path
    const baseUrl = API_CONFIG.BASE_URL.replace('/api', '');
    return `${baseUrl}/images/${picturePath}`;
  };

  // Helper function to extract relative path from full URL
  const getRelativePath = (fullUrl) => {
    if (!fullUrl) return '';
    // If it's already a relative path, return it
    if (fullUrl.startsWith('/')) return fullUrl;
    // If it's a full URL, extract the path after domain
    if (fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) {
      try {
        const url = new URL(fullUrl);
        return url.pathname; // Returns /images/photo.jpg
      } catch (e) {
        return '';
      }
    }
    return fullUrl;
  };

  const fetchAllData = async () => {
    try {
      // Fetch stocks
      const stocksUrl = getApiUrl("/excel/stock/get-all-stocks");
      const stocksResponse = await tokenService.authenticatedFetch(stocksUrl);
      if (stocksResponse.ok) {
        const stocksData = await stocksResponse.json();
        const filteredStocks = (stocksData.stocks || []).filter(
          stock => stock.Tow_Opis && stock.Tow_Opis.trim() !== ""
        );
        setStocks(filteredStocks);
      }

      // Fetch colors
      const colorsUrl = getApiUrl("/excel/color/get-all-colors");
      const colorsResponse = await tokenService.authenticatedFetch(colorsUrl);
      if (colorsResponse.ok) {
        const colorsData = await colorsResponse.json();
        const filteredColors = (colorsData.colors || []).filter(
          color => color && color.Kol_Opis && color.Kol_Opis.trim() !== ""
        );
        setColors(filteredColors);
      }

      // Fetch sizes
      const sizesUrl = getApiUrl("/excel/size/get-all-sizes");
      const sizesResponse = await tokenService.authenticatedFetch(sizesUrl);
      if (sizesResponse.ok) {
        const sizesData = await sizesResponse.json();
        setSizes(sizesData.sizes || []);
      }

      // Fetch subcategories (for jackets)
      const subcategoriesUrl = getApiUrl("/excel/subcategoryCoats/get-all-subcategoryCoats");
      const subcategoriesResponse = await tokenService.authenticatedFetch(subcategoriesUrl);
      if (subcategoriesResponse.ok) {
        const subcategoriesData = await subcategoriesResponse.json();
        setSubcategories(subcategoriesData.subcategoryCoats || []);
      }

      // Fetch manufacturers
      const manufacturersUrl = getApiUrl("/excel/manufacturers");
      const manufacturersResponse = await tokenService.authenticatedFetch(manufacturersUrl);
      if (manufacturersResponse.ok) {
        const manufacturersData = await manufacturersResponse.json();
        setManufacturers(manufacturersData.manufacturers || []);
      }

      // Fetch belts
      const beltsUrl = getApiUrl("/excel/belts");
      const beltsResponse = await tokenService.authenticatedFetch(beltsUrl);
      if (beltsResponse.ok) {
        const beltsData = await beltsResponse.json();
        setBelts(beltsData.belts || []);
      }

      // Fetch gloves
      const glovesUrl = getApiUrl("/excel/gloves");
      const glovesResponse = await tokenService.authenticatedFetch(glovesUrl);
      if (glovesResponse.ok) {
        const glovesData = await glovesResponse.json();
        setGloves(glovesData.gloves || []);
      }

      // Fetch caps
      const capsUrl = getApiUrl("/excel/caps");
      const capsResponse = await tokenService.authenticatedFetch(capsUrl);
      if (capsResponse.ok) {
        const capsData = await capsResponse.json();
        setCaps(capsData.caps || []);
      }

      // Fetch bags
      const bagsUrl = getApiUrl("/excel/bags/get-all-bags");
      const bagsResponse = await tokenService.authenticatedFetch(bagsUrl);
      if (bagsResponse.ok) {
        const bagsDataResponse = await bagsResponse.json();
        setBagsData(bagsDataResponse.bags || []);
      }

      // Fetch wallets
      const walletsUrl = getApiUrl("/excel/wallets/get-all-wallets");
      const walletsResponse = await tokenService.authenticatedFetch(walletsUrl);
      if (walletsResponse.ok) {
        const walletsDataResponse = await walletsResponse.json();
        setWalletsData(walletsDataResponse.wallets || []);
      }

      // Fetch bags categories
      const bagsCategoriesUrl = getApiUrl("/excel/subcategoryBags/get-all-bags-categories");
      const bagsCategoriesResponse = await tokenService.authenticatedFetch(bagsCategoriesUrl);
      if (bagsCategoriesResponse.ok) {
        const bagsCategoriesData = await bagsCategoriesResponse.json();
        setBagsCategories(bagsCategoriesData.subcategoryBags || []);
      }

      // Fetch wallets categories
      const walletsCategoriesUrl = getApiUrl("/excel/wallets-category/get-all-wallets-categories");
      const walletsCategoriesResponse = await tokenService.authenticatedFetch(walletsCategoriesUrl);
      if (walletsCategoriesResponse.ok) {
        const walletsCategoriesData = await walletsCategoriesResponse.json();
        setWalletsCategories(walletsCategoriesData.walletCategories || []);
      }

      // Fetch remaining products
      const remainingUrl = getApiUrl("/excel/remaining-products/get-all-remaining-products");
      const remainingResponse = await tokenService.authenticatedFetch(remainingUrl);
      if (remainingResponse.ok) {
        const remainingData = await remainingResponse.json();
        setRemainingProducts(remainingData.remainingProducts || []);
      }

      // Podkategorie pozostałego asortymentu = typy produktów z Tabeli pozostałego asortymentu (lista wspólna z serwerem)
      setRemainingCategories(REMAINING_SUBCATEGORY_OPTIONS);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const url = getApiUrl("/excel/goods/get-all-goods");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const sortedProducts = (data.goods || []).sort((a, b) => {
          const kodA = (a.ToW_Kod || "").toString().toLowerCase();
          const kodB = (b.ToW_Kod || "").toString().toLowerCase();
          return kodA.localeCompare(kodB);
        });
        setProducts(sortedProducts);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      Alert.alert("Błąd", "Nie udało się pobrać listy produktów");
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert("Błąd", "Brak uprawnień do dostępu do galerii");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedImage(result.assets[0]);
    }
  };

  // Calculate control sum for barcode (EAN-13 format)
  const calculateControlSum = (code) => {
    let sum = 0;
    for (let i = 0; i < code.length; i++) {
      sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
    }
    return (10 - (sum % 10)) % 10;
  };

  // Update bag product name: bagCode + colorDescription
  const updateBagProductName = (bagCode, colorId) => {
    const color = colors.find(c => c._id === colorId);
    const newName = `${bagCode || ''} ${color ? color.Kol_Opis : ''}`.trim();
    setProductName(newName);
  };

  // Update wallet product name: walletCode + colorDescription
  const updateWalletProductName = (walletCode, colorId) => {
    const color = colors.find(c => c._id === colorId);
    const newName = `${walletCode || ''} ${color ? color.Kol_Opis : ''}`.trim();
    setProductName(newName);
  };

  // Update remaining product name: productCode + colorDescription
  const updateRemainingProductName = (productCode, colorId) => {
    const color = colors.find(c => c._id === colorId);
    const newName = `${productCode || ''} ${color ? color.Kol_Opis : ''}`.trim();
    setProductName(newName);
  };

  // Generate bag product code
  const generateBagProductCode = () => {
    // Format: 000 + kolor(2) + Torebki_Nr(4) + po_kropce(3) + suma(1) = 13 digits
    const color = colors.find(c => c._id === selectedColor);
    const bag = bagsData.find(b => b.Torebki_Kod === selectedBagCode);
    
    if (!color || !bag) {
      return '';
    }

    // Pozycje 1-3: zawsze 000
    let code = '000';
    
    // Pozycje 4-5: Kod koloru (Kol_Kod) - 2 cyfry
    const colorCode = color.Kol_Kod || '00';
    code += colorCode.padStart(2, '0').substring(0, 2);
    
    // Pozycje 6-9: Numer wiersza (Torebki_Nr) - 4 cyfry
    const rowNumber = bag.Torebki_Nr || 0;
    code += rowNumber.toString().padStart(4, '0').substring(0, 4);
    
    // Pozycje 10-12: Wartość po kropce z Torebki_Kod - 3 cyfry
    const bagCode = bag.Torebki_Kod || '';
    const afterDotMatch = bagCode.match(/\.(\d{3})/); // Znajdź 3 cyfry po kropce
    const afterDotValue = afterDotMatch ? afterDotMatch[1] : '000';
    code += afterDotValue.padStart(3, '0').substring(0, 3);
    
    // Pozycja 13: Suma kontrolna
    const controlSum = calculateControlSum(code);
    code += controlSum;
    
    return code;
  };

  // Generate wallet product code
  const generateWalletProductCode = () => {
    // Format: 000 + kolor(2) + 0 + Portfele_Nr(3) + po_kropce(3) + suma(1) = 13 digits
    const color = colors.find(c => c._id === selectedColor);
    const wallet = walletsData.find(w => w.Portfele_Kod === selectedWalletCode);
    
    if (!color || !wallet) {
      return '';
    }

    // Pozycje 1-3: zawsze 000
    let code = '000';
    
    // Pozycje 4-5: Kod koloru (Kol_Kod) - 2 cyfry
    const colorCode = color.Kol_Kod || '00';
    code += colorCode.padStart(2, '0').substring(0, 2);
    
    // Pozycja 6: zawsze 0
    code += '0';
    
    // Pozycje 7-9: Portfele_Nr - 3 cyfry
    const rowNumber = wallet.Portfele_Nr || 0;
    code += rowNumber.toString().padStart(3, '0').substring(0, 3);
    
    // Pozycje 10-12: Wartość po kropce z Portfele_Kod - 3 cyfry
    const walletCode = wallet.Portfele_Kod || '';
    const afterDotMatch = walletCode.match(/\.(\d+)/); // Znajdź cyfry po kropce
    let afterDotValue = '000';
    if (afterDotMatch) {
      const digits = afterDotMatch[1];
      afterDotValue = digits.padStart(3, '0').substring(0, 3); // Weź pierwsze 3 cyfry, uzupełnij zerami jeśli trzeba
    }
    code += afterDotValue;
    
    // Pozycja 13: Suma kontrolna
    const controlSum = calculateControlSum(code);
    code += controlSum;
    
    return code;
  };

  // Generate remaining product code
  const generateRemainingProductCode = () => {
    // Format: 000 + kolor(2) + 00 + Poz_Nr(2) + 3_cyfry(3) + suma(1) = 13 digits
    const color = colors.find(c => c._id === selectedColor);
    const remainingProduct = remainingProducts.find(p => p.Poz_Kod === selectedRemainingProductCode);
    
    if (!color || !remainingProduct) {
      return '';
    }

    // Pozycje 1-3: zawsze 000
    let code = '000';
    
    // Pozycje 4-5: Kod koloru (Kol_Kod) - 2 cyfry
    const colorCode = color.Kol_Kod || '00';
    code += colorCode.padStart(2, '0').substring(0, 2);
    
    // Pozycje 6-7: zawsze 00
    code += '00';
    
    // Pozycje 8-9: Poz_Nr z wybranego produktu - 2 cyfry
    const productNumber = remainingProduct.Poz_Nr || 0;
    code += productNumber.toString().padStart(2, '0').substring(0, 2);
    
    // Pozycje 10-12: 3 cyfry z kodu z metki (po kropce, gdy jest; inaczej końcowe cyfry)
    code += remainingCodeDigits(selectedRemainingProductCode);
    
    // Pozycja 13: Suma kontrolna
    const controlSum = calculateControlSum(code);
    code += controlSum;
    
    return code;
  };

  // Generate product name based on selections
  const generateProductName = () => {
    if (category === "Kurtki kożuchy futra") {
      const stock = stocks.find(s => s._id === selectedStock);
      const color = colors.find(c => c._id === selectedColor);
      if (stock && color) {
        return `${stock.Tow_Opis} ${color.Kol_Opis}`;
      }
      
      // Pokaż co brakuje
      if (!stock) return "(wybierz produkt)";
      if (!color) return "(wybierz kolor)";
    } else if (category === "Torebki") {
      // Bag name is updated by updateBagProductName
      return productName || "";
    } else if (category === "Portfele") {
      // Wallet name is updated by updateWalletProductName
      return productName || "";
    } else if (category === "Pozostałe") {
      // Remaining name is updated by updateRemainingProductName
      return productName || "";
    }
    return productName || "";
  };

  // Generate product code - different format for each category
  const generateProductCode = () => {
    if (category === "Kurtki kożuchy futra") {
      // Format: TOW_KOD + KOL_KOD + 0000000 + control sum (13 digits)
      const stock = stocks.find(s => s._id === selectedStock);
      const color = colors.find(c => c._id === selectedColor);
      
      if (stock && color) {
        const baseCode = `${stock.Tow_Kod}${color.Kol_Kod}`.trim();
        const extendedCode = `${baseCode}0000000`; // Add 7 zeros
        const controlSum = calculateControlSum(extendedCode);
        return `${extendedCode}${controlSum}`;
      }
      
      if (!stock) return "(wybierz produkt)";
      if (!color) return "(wybierz kolor)";
      
    } else if (category === "Torebki") {
      // Format: 000 + kolor(2) + Torebki_Nr(4) + po_kropce(3) + suma(1) = 13 digits
      return generateBagProductCode() || "(wybierz torebkę i kolor)";
      
    } else if (category === "Portfele") {
      // Format: 000 + kolor(2) + 0 + Portfele_Nr(3) + po_kropce(3) + suma(1) = 13 digits
      return generateWalletProductCode() || "(wybierz portfel i kolor)";
      
    } else if (category === "Pozostałe") {
      // Format: 000 + kolor(2) + 00 + Poz_Nr(2) + 3_cyfry(3) + suma(1) = 13 digits
      return generateRemainingProductCode() || "(wybierz produkt i kolor)";
    }
    
    return productCode || "";
  };

  // Kody z metek z Tabeli pozostałego asortymentu o typie wybranej podkategorii (Pasek, Rękawiczka, Czapka, …)
  const getFilteredRemainingProducts = () => {
    const type = getRemainingProductTypeByKey(selectedRemainingCategoryId);
    return remainingProducts
      .filter(product => product.Poz_Kod && product.Poz_Kod.trim() !== '')
      .filter(product => !type || product.productType === type.value)
      .filter(product => product.Poz_Kod.toLowerCase().includes(remainingProductsSearch.toLowerCase()));
  };

  const handleAddProduct = () => {
    setEditingProduct(null);
    setProductName("");
    setProductCode("");
    setPrice("");
    setDiscountPrice("");
    setCategory("Kurtki kożuchy futra");
    setDescription("");
    setSelectedImage(null);
    setSelectedStock("");
    setSelectedColor("");
    setSelectedSubcategory("");
    setSelectedManufacturer("");
    setSelectedGender("");
    setPriceExceptions([]);
    // Reset Portfele fields
    setSelectedWalletsCategoryId("");
    setSelectedWalletsCategoryCode("");
    setSelectedWalletCode("");
    setWalletsSearch("");
    // Reset Torebki fields
    setSelectedBagsCategoryId("");
    setSelectedBagsCategoryCode("");
    setSelectedBagCode("");
    setBagsSearch("");
    // Reset Pozostałe fields
    setSelectedRemainingCategoryId("");
    setSelectedRemainingSubcategoryId("");
    setSelectedRemainingProductCode("");
    // Reset search terms
    setStockSearch("");
    setColorSearch("");
    setSubcategorySearch("");
    setManufacturerSearch("");
    setSizeSearch("");
    setShowModal(true);
  };

  const handleAddPriceException = () => {
    if (sizes.length === 0) {
      Alert.alert("Błąd", "Brak dostępnych rozmiarów");
      return;
    }
    setPriceExceptions([...priceExceptions, { size: sizes[0]._id, value: 0 }]);
  };

  const handleRemovePriceException = (index) => {
    const newExceptions = priceExceptions.filter((_, i) => i !== index);
    setPriceExceptions(newExceptions);
  };

  const handlePriceExceptionChange = (index, field, value) => {
    const newExceptions = [...priceExceptions];
    newExceptions[index][field] = value;
    setPriceExceptions(newExceptions);
  };

  const handleEditProduct = (product) => {
    const imageUrl = product.picture ? getImageUrl(product.picture) : null;
    
    setEditingProduct(product);
    setProductName(product.fullName || "");
    setProductCode(product.code || "");
    setPrice((product.price || 0).toString());
    setDiscountPrice((product.discount_price || 0).toString());
    setCategory(product.category || "Kurtki kożuchy futra");
    setDescription(product.description || "");
    setSelectedImage(imageUrl ? { uri: imageUrl } : null);
    setSelectedStock(product.stock?._id || product.stock || "");
    setSelectedColor(product.color?._id || product.color || "");
    setSelectedSubcategory(product.subcategory?._id || product.subcategory || "");
    setSelectedManufacturer(product.manufacturer?._id || product.manufacturer || "");
    setSelectedGender(product.Plec || product.Rodzaj || "");
    
    // Transform priceExceptions from backend format (populated size object) to mobile format (size ID)
    const mappedExceptions = (product.priceExceptions || []).map(ex => ({
      size: typeof ex.size === 'object' ? ex.size._id : ex.size,
      value: ex.value
    }));
    setPriceExceptions(mappedExceptions);
    
    // Reset search terms
    setStockSearch("");
    setColorSearch("");
    setSubcategorySearch("");
    setManufacturerSearch("");
    setSizeSearch("");
    setShowModal(true);
  };

  const handleSaveProduct = async () => {
    const finalProductName = generateProductName();
    const finalProductCode = generateProductCode();
    const remainingType = category === "Pozostałe" ? getRemainingProductTypeByKey(selectedRemainingCategoryId) : null;

    if (!finalProductName.trim()) {
      setErrorMessage("Nazwa produktu jest wymagana");
      setShowErrorModal(true);
      return;
    }

    if (category === "Pozostałe") {
      if (!remainingType || !selectedRemainingProductCode) {
        setErrorMessage("Wybierz podkategorię i kod produktu");
        setShowErrorModal(true);
        return;
      }
      if (remainingType.hasSubcategoryTable && !selectedRemainingSubcategoryId) {
        setErrorMessage("Wybierz podpodkategorię");
        setShowErrorModal(true);
        return;
      }
    }

    if (!selectedColor) {
      setErrorMessage("Kolor jest wymagany");
      setShowErrorModal(true);
      return;
    }

    try {
      const formData = new FormData();
      
      // Basic fields
      formData.append("fullName", finalProductName);
      formData.append("code", finalProductCode);
      formData.append("price", parseFloat(price) || 0);
      formData.append("discount_price", discountPrice ? parseFloat(discountPrice) : 0);
      formData.append("category", category === "Pozostałe" ? "Pozostały asortyment" : category);
      formData.append("description", description || "");
      formData.append("color", selectedColor);
      if (category === "Pozostałe") {
        // Podkategoria (typ), podpodkategoria (wiersz tabeli pasków/rękawiczek/czapek) i kod z Tabeli pozostałego asortymentu
        formData.append("subcategory", selectedRemainingCategoryId);
        formData.append("bagsCategoryId", selectedRemainingCategoryId);
        formData.append("bagProduct", selectedRemainingProductCode);
        formData.append("remainingsubsubcategory", remainingType && remainingType.hasSubcategoryTable ? selectedRemainingSubcategoryId : "");
      }
      
      // Optional fields based on category
      if (selectedStock) formData.append("stock", selectedStock);
      if (selectedSubcategory) formData.append("subcategory", selectedSubcategory);
      if (selectedManufacturer) formData.append("manufacturer", selectedManufacturer);
      
      // Get Plec from selected subcategory or use selectedGender or default to "Unisex"
      let plecValue = selectedGender || 'Unisex';
      
      // If subcategory is selected, get Plec from it
      if (selectedSubcategory && subcategories && subcategories.length > 0) {
        const selectedSubcategoryData = subcategories.find(s => s._id === selectedSubcategory);
        if (selectedSubcategoryData && selectedSubcategoryData.Plec) {
          plecValue = selectedSubcategoryData.Plec;
        }
      }
      
      formData.append(category === "Pozostałe" ? "Rodzaj" : "Plec", plecValue);
      
      // Price exceptions - always send, even if empty
      formData.append("priceExceptions", JSON.stringify(priceExceptions || []));
      
      // Image handling
      if (selectedImage && selectedImage.uri) {
        if (!selectedImage.uri.startsWith('http')) {
          // New image selected from device
          const filename = selectedImage.uri.split('/').pop();
          const match = /\.(\w+)$/.exec(filename);
          const type = match ? `image/${match[1]}` : `image/jpeg`;
          
          formData.append("Picture", {
            uri: selectedImage.uri,
            name: filename,
            type: type,
          });
        } else if (editingProduct) {
          // Editing existing product and keeping old image
          const relativePath = getRelativePath(selectedImage.uri);
          if (relativePath) {
            formData.append("picture", relativePath);
          }
        }
      }

      let url, method;
      if (editingProduct) {
        url = getApiUrl(`/excel/goods/${editingProduct._id}`);
        method = "PUT";
      } else {
        url = getApiUrl("/excel/goods/create-goods");
        method = "POST";
      }

      const response = await tokenService.authenticatedFetch(url, {
        method,
        headers: {
          "Content-Type": "multipart/form-data",
        },
        body: formData,
      });

      if (response.ok) {
        const responseData = await response.json();
        
        // Backend już automatycznie synchronizuje cenniki po zapisie produktu
        setSuccessMessage(
          editingProduct
            ? "Produkt został zaktualizowany"
            : "Produkt został dodany"
        );
        setShowModal(false);
        setShowSuccessModal(true);
        fetchProducts();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.message || "Nie udało się zapisać produktu");
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Błąd podczas zapisywania produktu:", error);
      setErrorMessage("Wystąpił błąd podczas zapisywania produktu");
      setShowErrorModal(true);
    }
  };

  const handleDeleteProduct = (product) => {
    setProductToDelete(product);
    setConfirmMessage(`Czy na pewno chcesz usunąć produkt "${product.fullName}"?`);
    setShowConfirmModal(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;
    
    setShowConfirmModal(false);
    try {
      const url = getApiUrl(`/excel/goods/${productToDelete._id}`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "DELETE",
      });

      if (response.ok) {
        setSuccessMessage("Produkt został usunięty");
        setShowSuccessModal(true);
        fetchProducts();
      } else {
        const data = await response.json();
        setErrorMessage(data.message || "Nie udało się usunąć produktu");
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error deleting product:", error);
      setErrorMessage("Wystąpił błąd podczas usuwania produktu");
      setShowErrorModal(true);
    }
    setProductToDelete(null);
  };

  // Function to scroll to the bottom of the list
  const scrollToBottom = () => {
    if (flatListRef.current && filteredProducts.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  // Filter and sort products (newest first)
  const filteredProducts = products
    .filter((product) =>
      product.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.ToW_Kod?.toString().toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      // Sort by _id descending (newest first)
      // MongoDB ObjectId contains timestamp, so newer IDs are "greater"
      return b._id.localeCompare(a._id);
    });

  const renderProduct = ({ item, index }) => {
    const imageUrl = getImageUrl(item.picture);
    
    return (
      <View style={styles.productCard}>
        <View style={styles.productHeader}>
          <View style={styles.productInfo}>
            <Text style={styles.productName}>{item.fullName}</Text>
            {item.ToW_Kod && (
              <Text style={styles.productCode}>Kod: {item.ToW_Kod}</Text>
            )}
            {item.category && (
              <Text style={styles.productCategory}>{item.category.toUpperCase()}</Text>
            )}
            {item.subcategory?.Kat_1_Opis_1 && (
              <Text style={styles.productSubcategory}>{item.subcategory.Kat_1_Opis_1}</Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.productImageContainer}
            onPress={() => setEnlargedImage(imageUrl)}
            activeOpacity={0.8}
          >
            {item.picture ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.placeholderImage}>
                <Ionicons name="image-outline" size={32} color="#475569" />
              </View>
            )}
          </TouchableOpacity>
        </View>

      <View style={styles.productDetails}>
        <View style={styles.priceContainer}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Cena:</Text>
            <Text style={styles.priceValue}>{item.price || 0} zł</Text>
          </View>
          {item.discount_price > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Promocja:</Text>
              <Text style={[styles.priceValue, styles.discountPrice]}>
                {item.discount_price} zł
              </Text>
            </View>
          )}
          {item.priceExceptions && item.priceExceptions.length > 0 && (
            <View style={styles.exceptionsContainer}>
              <Text style={styles.exceptionsTitle}>Wyjątki cenowe:</Text>
              {item.priceExceptions.map((exception, idx) => (
                <View key={idx} style={styles.exceptionItemCompact}>
                  <Text style={styles.exceptionSize}>
                    {exception.size?.Roz_Opis || 'Rozmiar'}: 
                  </Text>
                  <Text style={styles.exceptionValue}> {exception.value} zł</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.productActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.editButton]}
          onPress={() => handleEditProduct(item)}
        >
          <Ionicons name="pencil" size={18} color="#fff" />
          <Text style={styles.actionButtonText}>Edytuj</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDeleteProduct(item)}
        >
          <Ionicons name="trash" size={18} color="#fff" />
          <Text style={styles.actionButtonText}>Usuń</Text>
        </TouchableOpacity>
      </View>
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
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lista produktów</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddProduct}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj produktu..."
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

      {/* Products List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D6EFD" />
        </View>
      ) : filteredProducts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="pricetags-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>
            {searchTerm ? "Nie znaleziono produktów" : "Brak produktów"}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.countContainer}>
            <Text style={styles.countText}>
              Znaleziono: {filteredProducts.length} produktów
            </Text>
          </View>
          <FlatList
            ref={flatListRef}
            data={filteredProducts}
            renderItem={renderProduct}
            keyExtractor={(item) => item._id}
            contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(120, insets.bottom + 120) }]}
            showsVerticalScrollIndicator={false}
          />
          
          {/* Scroll to Bottom Button */}
          {filteredProducts.length > 5 && (
            <TouchableOpacity 
              style={[styles.scrollToBottomButton, { bottom: insets.bottom + 80 }]}
              onPress={scrollToBottom}
            >
              <Ionicons name="arrow-down-circle" size={50} color="#3b82f6" />
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
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
                {editingProduct ? "Edytuj produkt" : "Dodaj produkt"}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              {/* 1. Kategoria */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Kategoria *</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowCategoryPicker(true)}
                  disabled={editingProduct ? true : false}
                >
                  <Text style={styles.selectButtonText}>
                    {category || "Wybierz kategorię"}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Dla kategorii Kurtki kożuchy futra */}
              {category === "Kurtki kożuchy futra" && (
                <>
                  {/* 2. Podkategoria */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Podkategoria</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowSubcategoryPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedSubcategory
                          ? subcategories.find(s => s._id === selectedSubcategory)?.Kat_1_Opis_1 || "Wybierz"
                          : "Wybierz podkategorię"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 3. Grupa (Manufacturer) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Grupa</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowManufacturerPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedManufacturer
                          ? manufacturers.find(m => m._id === selectedManufacturer)?.Prod_Opis || "Wybierz"
                          : "Wybierz grupę"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 4. Produkt (Stock) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Produkt</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowStockPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedStock
                          ? stocks.find(s => s._id === selectedStock)?.Tow_Opis || "Wybierz"
                          : "Wybierz produkt"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 5. Kolor */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Kolor *</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowColorPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedColor
                          ? colors.find(c => c._id === selectedColor)?.Kol_Opis || "Wybierz"
                          : "Wybierz kolor"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 6. Nazwa produktu (readonly) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Nazwa produktu</Text>
                    <TextInput
                      style={[styles.formInput, styles.readonlyInput]}
                      value={generateProductName()}
                      editable={false}
                    />
                  </View>

                  {/* 7. Opis */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Opis</Text>
                    <TextInput
                      style={[styles.formInput, styles.formTextArea]}
                      placeholder="Opcjonalny opis produktu (max 200 znaków)"
                      placeholderTextColor="#64748B"
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      maxLength={200}
                    />
                    <Text style={styles.characterCount}>{description.length}/200</Text>
                  </View>

                  {/* 8. Kod produktu (readonly) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Kod produktu</Text>
                    <TextInput
                      style={[styles.formInput, styles.readonlyInput]}
                      value={generateProductCode()}
                      editable={false}
                    />
                  </View>

                  {/* 9. Zdjęcie produktu */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Zdjęcie produktu</Text>
                    <TouchableOpacity
                      style={styles.imagePickerButton}
                      onPress={pickImage}
                    >
                      <Ionicons name="images" size={24} color="#0D6EFD" />
                      <Text style={styles.imagePickerText}>
                        {selectedImage ? "Zmień zdjęcie" : "Wybierz z galerii"}
                      </Text>
                    </TouchableOpacity>
                    {selectedImage && (
                      <View style={styles.imagePreviewContainer}>
                        <Image
                          source={{ uri: selectedImage.uri }}
                          style={styles.imagePreview}
                          resizeMode="cover"
                        />
                        <TouchableOpacity
                          style={styles.removeImageButton}
                          onPress={() => setSelectedImage(null)}
                        >
                          <Ionicons name="close-circle" size={24} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* 10 & 11. Ceny */}
                  <View style={styles.formRow}>
                    <View style={[styles.formGroup, styles.formGroupHalf]}>
                      <Text style={styles.formLabel}>Cena (PLN)</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="0.00"
                        placeholderTextColor="#64748B"
                        value={price}
                        onChangeText={setPrice}
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <View style={[styles.formGroup, styles.formGroupHalf]}>
                      <Text style={styles.formLabel}>Promocyjna (PLN)</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="0.00"
                        placeholderTextColor="#64748B"
                        value={discountPrice}
                        onChangeText={setDiscountPrice}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                  {/* 12. Wyjątki cenowe */}
                  <View style={styles.formGroup}>
                    <View style={styles.exceptionHeader}>
                      <Text style={styles.formLabel}>Wyjątki cenowe</Text>
                      <TouchableOpacity
                        style={styles.addExceptionButton}
                        onPress={handleAddPriceException}
                      >
                        <Ionicons name="add-circle" size={24} color="#0D6EFD" />
                        <Text style={styles.addExceptionText}>Dodaj wyjątek</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {priceExceptions.length === 0 ? (
                      <Text style={styles.noExceptionsText}>
                        Brak wyjątków cenowych. Dodaj wyjątek dla konkretnego rozmiaru.
                      </Text>
                    ) : (
                      priceExceptions.map((exception, index) => (
                        <View key={index} style={styles.exceptionItem}>
                          <View style={styles.exceptionRow}>
                            <View style={styles.exceptionField}>
                              <Text style={styles.exceptionLabel}>Rozmiar</Text>
                              <TouchableOpacity
                                style={styles.exceptionSelect}
                                onPress={() => {
                                  setActiveSizeExceptionIndex(index);
                                  setShowSizePicker(true);
                                }}
                              >
                                <Text style={styles.exceptionSelectText}>
                                  {sizes.find(s => s._id === exception.size)?.Roz_Opis || "Wybierz"}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                              </TouchableOpacity>
                            </View>

                            <View style={styles.exceptionField}>
                              <Text style={styles.exceptionLabel}>Cena (PLN)</Text>
                              <TextInput
                                style={styles.exceptionInput}
                                placeholder="0.00"
                                placeholderTextColor="#64748B"
                                value={exception.value?.toString() || ""}
                                onChangeText={(text) => handlePriceExceptionChange(index, 'value', parseFloat(text) || 0)}
                                keyboardType="decimal-pad"
                              />
                            </View>

                            <TouchableOpacity
                              style={styles.removeExceptionButton}
                              onPress={() => handleRemovePriceException(index)}
                            >
                              <Ionicons name="trash" size={20} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </>
              )}

              {/* Dla kategorii Torebki */}
              {category === "Torebki" && (
                <>
                  {/* 2. Podkategoria (Bags Category) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Podkategoria</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowBagsCategoryPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedBagsCategoryId
                          ? `${bagsCategories.find(c => c._id === selectedBagsCategoryId)?.Kat_1_Opis_1 || "Wybierz"} (${bagsCategories.find(c => c._id === selectedBagsCategoryId)?.Plec || ""})`
                          : "Wybierz podkategorię"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 3. Grupa (Manufacturer) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Grupa</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowManufacturerPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedManufacturer
                          ? manufacturers.find(m => m._id === selectedManufacturer)?.Prod_Opis || "Wybierz"
                          : "Wybierz grupę"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 4. Produkt (Bag) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Produkt</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowBagsPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedBagCode || "Wybierz torebkę"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 5. Kolor */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Kolor *</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowColorPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedColor
                          ? colors.find(c => c._id === selectedColor)?.Kol_Opis || "Wybierz"
                          : "Wybierz kolor"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 6. Nazwa produktu (readonly) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Nazwa produktu</Text>
                    <TextInput
                      style={[styles.formInput, styles.readonlyInput]}
                      value={generateProductName()}
                      editable={false}
                    />
                  </View>

                  {/* 7. Opis */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Opis</Text>
                    <TextInput
                      style={[styles.formInput, styles.formTextArea]}
                      placeholder="Opcjonalny opis produktu (max 200 znaków)"
                      placeholderTextColor="#64748B"
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      maxLength={200}
                    />
                    <Text style={styles.characterCount}>{description.length}/200</Text>
                  </View>

                  {/* 8. Kod produktu (readonly) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Kod produktu</Text>
                    <TextInput
                      style={[styles.formInput, styles.readonlyInput]}
                      value={generateProductCode()}
                      editable={false}
                    />
                  </View>

                  {/* 9. Zdjęcie produktu */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Zdjęcie produktu</Text>
                    <TouchableOpacity
                      style={styles.imagePickerButton}
                      onPress={pickImage}
                    >
                      <Ionicons name="images" size={24} color="#0D6EFD" />
                      <Text style={styles.imagePickerText}>
                        {selectedImage ? "Zmień zdjęcie" : "Wybierz z galerii"}
                      </Text>
                    </TouchableOpacity>
                    {selectedImage && (
                      <View style={styles.imagePreviewContainer}>
                        <Image
                          source={{ uri: selectedImage.uri }}
                          style={styles.imagePreview}
                          resizeMode="cover"
                        />
                        <TouchableOpacity
                          style={styles.removeImageButton}
                          onPress={() => setSelectedImage(null)}
                        >
                          <Ionicons name="close-circle" size={24} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* 10 & 11. Ceny */}
                  <View style={styles.formRow}>
                    <View style={[styles.formGroup, styles.formGroupHalf]}>
                      <Text style={styles.formLabel}>Cena (PLN)</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="0.00"
                        placeholderTextColor="#64748B"
                        value={price}
                        onChangeText={setPrice}
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <View style={[styles.formGroup, styles.formGroupHalf]}>
                      <Text style={styles.formLabel}>Promocyjna (PLN)</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="0.00"
                        placeholderTextColor="#64748B"
                        value={discountPrice}
                        onChangeText={setDiscountPrice}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                  {/* 12. Wyjątki cenowe */}
                  <View style={styles.formGroup}>
                    <View style={styles.exceptionHeader}>
                      <Text style={styles.formLabel}>Wyjątki cenowe</Text>
                      <TouchableOpacity
                        style={styles.addExceptionButton}
                        onPress={handleAddPriceException}
                      >
                        <Ionicons name="add-circle" size={24} color="#0D6EFD" />
                        <Text style={styles.addExceptionText}>Dodaj wyjątek</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {priceExceptions.length === 0 ? (
                      <Text style={styles.noExceptionsText}>
                        Brak wyjątków cenowych. Dodaj wyjątek dla konkretnego rozmiaru.
                      </Text>
                    ) : (
                      priceExceptions.map((exception, index) => (
                        <View key={index} style={styles.exceptionItem}>
                          <View style={styles.exceptionRow}>
                            <View style={styles.exceptionField}>
                              <Text style={styles.exceptionLabel}>Rozmiar</Text>
                              <TouchableOpacity
                                style={styles.exceptionSelect}
                                onPress={() => {
                                  setActiveSizeExceptionIndex(index);
                                  setShowSizePicker(true);
                                }}
                              >
                                <Text style={styles.exceptionSelectText}>
                                  {sizes.find(s => s._id === exception.size)?.Roz_Opis || "Wybierz"}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                              </TouchableOpacity>
                            </View>

                            <View style={styles.exceptionField}>
                              <Text style={styles.exceptionLabel}>Cena (PLN)</Text>
                              <TextInput
                                style={styles.exceptionInput}
                                placeholder="0.00"
                                placeholderTextColor="#64748B"
                                value={exception.value?.toString() || ""}
                                onChangeText={(text) => handlePriceExceptionChange(index, 'value', parseFloat(text) || 0)}
                                keyboardType="decimal-pad"
                              />
                            </View>

                            <TouchableOpacity
                              style={styles.removeExceptionButton}
                              onPress={() => handleRemovePriceException(index)}
                            >
                              <Ionicons name="trash" size={20} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </>
              )}

              {/* Dla kategorii Portfele */}
              {category === "Portfele" && (
                <>
                  {/* 2. Podkategoria (Wallet Category) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Podkategoria</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowWalletsCategoryPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedWalletsCategoryId
                          ? `${walletsCategories.find(c => c._id === selectedWalletsCategoryId)?.Kat_1_Opis_1 || "Wybierz"} (${walletsCategories.find(c => c._id === selectedWalletsCategoryId)?.Plec || ""})`
                          : "Wybierz podkategorię"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 3. Grupa (Manufacturer) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Grupa</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowManufacturerPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedManufacturer
                          ? manufacturers.find(m => m._id === selectedManufacturer)?.Prod_Opis || "Wybierz"
                          : "Wybierz grupę"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 4. Produkt (Wallet) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Produkt</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowWalletsPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedWalletCode || "Wybierz portfel"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 5. Kolor */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Kolor *</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowColorPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedColor
                          ? colors.find(c => c._id === selectedColor)?.Kol_Opis || "Wybierz"
                          : "Wybierz kolor"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 6. Nazwa produktu (readonly) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Nazwa produktu</Text>
                    <TextInput
                      style={[styles.formInput, styles.readonlyInput]}
                      value={generateProductName()}
                      editable={false}
                    />
                  </View>

                  {/* 7. Opis */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Opis</Text>
                    <TextInput
                      style={[styles.formInput, styles.formTextArea]}
                      placeholder="Opcjonalny opis produktu (max 200 znaków)"
                      placeholderTextColor="#64748B"
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      maxLength={200}
                    />
                    <Text style={styles.characterCount}>{description.length}/200</Text>
                  </View>

                  {/* 8. Kod produktu (readonly) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Kod produktu</Text>
                    <TextInput
                      style={[styles.formInput, styles.readonlyInput]}
                      value={generateProductCode()}
                      editable={false}
                    />
                  </View>

                  {/* 9. Zdjęcie produktu */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Zdjęcie produktu</Text>
                    <TouchableOpacity
                      style={styles.imagePickerButton}
                      onPress={pickImage}
                    >
                      <Ionicons name="images" size={24} color="#0D6EFD" />
                      <Text style={styles.imagePickerText}>
                        {selectedImage ? "Zmień zdjęcie" : "Wybierz z galerii"}
                      </Text>
                    </TouchableOpacity>
                    {selectedImage && (
                      <View style={styles.imagePreviewContainer}>
                        <Image
                          source={{ uri: selectedImage.uri }}
                          style={styles.imagePreview}
                          resizeMode="cover"
                        />
                        <TouchableOpacity
                          style={styles.removeImageButton}
                          onPress={() => setSelectedImage(null)}
                        >
                          <Ionicons name="close-circle" size={24} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* 10 & 11. Ceny */}
                  <View style={styles.formRow}>
                    <View style={[styles.formGroup, styles.formGroupHalf]}>
                      <Text style={styles.formLabel}>Cena (PLN)</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="0.00"
                        placeholderTextColor="#64748B"
                        value={price}
                        onChangeText={setPrice}
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <View style={[styles.formGroup, styles.formGroupHalf]}>
                      <Text style={styles.formLabel}>Promocyjna (PLN)</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="0.00"
                        placeholderTextColor="#64748B"
                        value={discountPrice}
                        onChangeText={setDiscountPrice}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                  {/* 12. Wyjątki cenowe */}
                  <View style={styles.formGroup}>
                    <View style={styles.exceptionHeader}>
                      <Text style={styles.formLabel}>Wyjątki cenowe</Text>
                      <TouchableOpacity
                        style={styles.addExceptionButton}
                        onPress={handleAddPriceException}
                      >
                        <Ionicons name="add-circle" size={24} color="#0D6EFD" />
                        <Text style={styles.addExceptionText}>Dodaj wyjątek</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {priceExceptions.length === 0 ? (
                      <Text style={styles.noExceptionsText}>
                        Brak wyjątków cenowych. Dodaj wyjątek dla konkretnego rozmiaru.
                      </Text>
                    ) : (
                      priceExceptions.map((exception, index) => (
                        <View key={index} style={styles.exceptionItem}>
                          <View style={styles.exceptionRow}>
                            <View style={styles.exceptionField}>
                              <Text style={styles.exceptionLabel}>Rozmiar</Text>
                              <TouchableOpacity
                                style={styles.exceptionSelect}
                                onPress={() => {
                                  setActiveSizeExceptionIndex(index);
                                  setShowSizePicker(true);
                                }}
                              >
                                <Text style={styles.exceptionSelectText}>
                                  {sizes.find(s => s._id === exception.size)?.Roz_Opis || "Wybierz"}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                              </TouchableOpacity>
                            </View>

                            <View style={styles.exceptionField}>
                              <Text style={styles.exceptionLabel}>Cena (PLN)</Text>
                              <TextInput
                                style={styles.exceptionInput}
                                placeholder="0.00"
                                placeholderTextColor="#64748B"
                                value={exception.value?.toString() || ""}
                                onChangeText={(text) => handlePriceExceptionChange(index, 'value', parseFloat(text) || 0)}
                                keyboardType="decimal-pad"
                              />
                            </View>

                            <TouchableOpacity
                              style={styles.removeExceptionButton}
                              onPress={() => handleRemovePriceException(index)}
                            >
                              <Ionicons name="trash" size={20} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </>
              )}

              {/* Dla kategorii Pozostałe */}
              {category === "Pozostałe" && (
                <>
                  {/* 2. Podkategoria (Remaining Category) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Podkategoria</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowRemainingCategoryPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedRemainingCategoryId
                          ? remainingCategories.find(c => c._id === selectedRemainingCategoryId)?.Rem_Kat_1_Opis_1 || "Wybierz"
                          : "Wybierz podkategorię"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 3. Podpodkategoria (Remaining Subcategory) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Podpodkategoria</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowRemainingSubcategoryPicker(true)}
                      disabled={!selectedRemainingCategoryId || remainingSubcategories.length === 0}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedRemainingSubcategoryId
                          ? remainingSubcategories.find(s => s._id === selectedRemainingSubcategoryId)?.Sub_Opis || "Wybierz"
                          : "Wybierz podpodkategorię"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 4. Grupa (Manufacturer) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Grupa</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowManufacturerPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedManufacturer
                          ? manufacturers.find(m => m._id === selectedManufacturer)?.Prod_Opis || "Wybierz"
                          : "Wybierz grupę"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 5. Produkt */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Produkt</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowRemainingPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedRemainingProductCode || "Wybierz produkt"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 6. Kolor */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Kolor *</Text>
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowColorPicker(true)}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedColor
                          ? colors.find(c => c._id === selectedColor)?.Kol_Opis || "Wybierz"
                          : "Wybierz kolor"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {/* 7. Nazwa produktu (readonly) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Nazwa produktu</Text>
                    <TextInput
                      style={[styles.formInput, styles.readonlyInput]}
                      value={generateProductName()}
                      editable={false}
                    />
                  </View>

                  {/* 8. Opis */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Opis</Text>
                    <TextInput
                      style={[styles.formInput, styles.formTextArea]}
                      placeholder="Opcjonalny opis produktu (max 200 znaków)"
                      placeholderTextColor="#64748B"
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      maxLength={200}
                    />
                    <Text style={styles.characterCount}>{description.length}/200</Text>
                  </View>

                  {/* 9. Kod produktu (readonly) */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Kod produktu</Text>
                    <TextInput
                      style={[styles.formInput, styles.readonlyInput]}
                      value={generateProductCode()}
                      editable={false}
                    />
                  </View>

                  {/* 10. Zdjęcie produktu */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Zdjęcie produktu</Text>
                    <TouchableOpacity
                      style={styles.imagePickerButton}
                      onPress={pickImage}
                    >
                      <Ionicons name="images" size={24} color="#0D6EFD" />
                      <Text style={styles.imagePickerText}>
                        {selectedImage ? "Zmień zdjęcie" : "Wybierz z galerii"}
                      </Text>
                    </TouchableOpacity>
                    {selectedImage && (
                      <View style={styles.imagePreviewContainer}>
                        <Image
                          source={{ uri: selectedImage.uri }}
                          style={styles.imagePreview}
                          resizeMode="cover"
                        />
                        <TouchableOpacity
                          style={styles.removeImageButton}
                          onPress={() => setSelectedImage(null)}
                        >
                          <Ionicons name="close-circle" size={24} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* 11 & 12. Ceny */}
                  <View style={styles.formRow}>
                    <View style={[styles.formGroup, styles.formGroupHalf]}>
                      <Text style={styles.formLabel}>Cena (PLN)</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="0.00"
                        placeholderTextColor="#64748B"
                        value={price}
                        onChangeText={setPrice}
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <View style={[styles.formGroup, styles.formGroupHalf]}>
                      <Text style={styles.formLabel}>Promocyjna (PLN)</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="0.00"
                        placeholderTextColor="#64748B"
                        value={discountPrice}
                        onChangeText={setDiscountPrice}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                  {/* 13. Wyjątki cenowe */}
                  <View style={styles.formGroup}>
                    <View style={styles.exceptionHeader}>
                      <Text style={styles.formLabel}>Wyjątki cenowe</Text>
                      <TouchableOpacity
                        style={styles.addExceptionButton}
                        onPress={handleAddPriceException}
                      >
                        <Ionicons name="add-circle" size={24} color="#0D6EFD" />
                        <Text style={styles.addExceptionText}>Dodaj wyjątek</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {priceExceptions.length === 0 ? (
                      <Text style={styles.noExceptionsText}>
                        Brak wyjątków cenowych. Dodaj wyjątek dla konkretnego rozmiaru.
                      </Text>
                    ) : (
                      priceExceptions.map((exception, index) => (
                        <View key={index} style={styles.exceptionItem}>
                          <View style={styles.exceptionRow}>
                            <View style={styles.exceptionField}>
                              <Text style={styles.exceptionLabel}>Rozmiar</Text>
                              <TouchableOpacity
                                style={styles.exceptionSelect}
                                onPress={() => {
                                  setActiveSizeExceptionIndex(index);
                                  setShowSizePicker(true);
                                }}
                              >
                                <Text style={styles.exceptionSelectText}>
                                  {sizes.find(s => s._id === exception.size)?.Roz_Opis || "Wybierz"}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                              </TouchableOpacity>
                            </View>

                            <View style={styles.exceptionField}>
                              <Text style={styles.exceptionLabel}>Cena (PLN)</Text>
                              <TextInput
                                style={styles.exceptionInput}
                                placeholder="0.00"
                                placeholderTextColor="#64748B"
                                value={exception.value?.toString() || ""}
                                onChangeText={(text) => handlePriceExceptionChange(index, 'value', parseFloat(text) || 0)}
                                keyboardType="decimal-pad"
                              />
                            </View>

                            <TouchableOpacity
                              style={styles.removeExceptionButton}
                              onPress={() => handleRemovePriceException(index)}
                            >
                              <Ionicons name="trash" size={20} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                  </View>

                </>
              )}
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
                onPress={handleSaveProduct}
              >
                <Text style={styles.saveButtonText}>Zapisz</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Category Picker Modal */}
      <Modal
        visible={showCategoryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz kategorię</Text>
              <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={["Kurtki kożuchy futra", "Torebki", "Portfele", "Pozostałe"]}
              keyExtractor={(item) => item}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    category === item && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setCategory(item);
                    
                    // Reset form and initialize defaults based on category
                    setProductName("");
                    setProductCode("");
                    setSelectedStock("");
                    setSelectedColor("");
                    setSelectedSubcategory("");
                    setSelectedBagsCategoryId("");
                    setSelectedBagsCategoryCode("");
                    setSelectedBagCode("");
                    setSelectedWalletsCategoryId("");
                    setSelectedWalletsCategoryCode("");
                    setSelectedWalletCode("");
                    
                    if (item === "Torebki") {
                      // Initialize Torebki category defaults
                      if (bagsCategories.length > 0) {
                        const firstCategory = bagsCategories[0];
                        setSelectedBagsCategoryId(firstCategory._id);
                        setSelectedBagsCategoryCode(firstCategory.Kat_1_Kod_1);
                      }
                      if (colors.length > 0) {
                        setSelectedColor(colors[0]._id);
                      }
                      if (bagsData.length > 0) {
                        const firstBag = bagsData[0];
                        setSelectedBagCode(firstBag.Torebki_Kod);
                        // Update product name with first bag and color
                        if (colors.length > 0) {
                          updateBagProductName(firstBag.Torebki_Kod, colors[0]._id);
                        }
                      }
                    } else if (item === "Portfele") {
                      // Initialize Portfele category defaults
                      if (walletsCategories.length > 0) {
                        const firstCategory = walletsCategories[0];
                        setSelectedWalletsCategoryId(firstCategory._id);
                        setSelectedWalletsCategoryCode(firstCategory.Kat_1_Kod_1);
                      }
                      if (colors.length > 0) {
                        setSelectedColor(colors[0]._id);
                      }
                      if (walletsData.length > 0) {
                        const firstWallet = walletsData[0];
                        setSelectedWalletCode(firstWallet.Portfele_Kod);
                        // Update product name with first wallet and color
                        if (colors.length > 0) {
                          updateWalletProductName(firstWallet.Portfele_Kod, colors[0]._id);
                        }
                      }
                    } else if (item === "Kurtki kożuchy futra") {
                      // Initialize defaults for Kurtki
                      if (subcategories.length > 0) {
                        setSelectedSubcategory(subcategories[0]._id);
                      }
                      if (colors.length > 0) {
                        setSelectedColor(colors[0]._id);
                      }
                    } else if (item === "Pozostałe") {
                      // Initialize defa ults for Pozostałe
                      if (remainingCategories.length > 0) {
                        const firstCategory = remainingCategories[0];
                        setSelectedRemainingCategoryId(firstCategory._id);
                        // subcategories will be fetched by useEffect
                      }
                      if (colors.length > 0) {
                        setSelectedColor(colors[0]._id);
                      }
                    }
                    
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    category === item && styles.pickerItemTextSelected
                  ]}>
                    {item}
                  </Text>
                  {category === item && (
                    <Ionicons name="checkmark" size={24} color="#0D6EFD" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Stock Picker Modal */}
      <Modal
        visible={showStockPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStockPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz produkt</Text>
              <TouchableOpacity onPress={() => setShowStockPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Ionicons name="search" size={20} color="#94A3B8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Szukaj produktu..."
                placeholderTextColor="#64748B"
                value={stockSearch}
                onChangeText={setStockSearch}
              />
            </View>
            <FlatList
              data={stocks.filter(s => 
                s.Tow_Opis?.toLowerCase().includes(stockSearch.toLowerCase())
              )}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedStock === item._id && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setSelectedStock(item._id);
                    setShowStockPicker(false);
                    setStockSearch("");
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    selectedStock === item._id && styles.pickerItemTextSelected
                  ]}>
                    {item.Tow_Opis}
                  </Text>
                  {selectedStock === item._id && (
                    <Ionicons name="checkmark" size={24} color="#0D6EFD" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wyników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Color Picker Modal */}
      <Modal
        visible={showColorPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowColorPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz kolor</Text>
              <TouchableOpacity onPress={() => setShowColorPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Ionicons name="search" size={20} color="#94A3B8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Szukaj koloru..."
                placeholderTextColor="#64748B"
                value={colorSearch}
                onChangeText={setColorSearch}
              />
            </View>
            <FlatList
              data={colors.filter(c => 
                c.Kol_Opis?.toLowerCase().includes(colorSearch.toLowerCase())
              )}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedColor === item._id && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setSelectedColor(item._id);
                    // Update product name based on category
                    if (category === "Torebki" && selectedBagCode) {
                      updateBagProductName(selectedBagCode, item._id);
                    } else if (category === "Portfele" && selectedWalletCode) {
                      updateWalletProductName(selectedWalletCode, item._id);
                    } else if (category === "Pozostałe" && selectedRemainingProductCode) {
                      updateRemainingProductName(selectedRemainingProductCode, item._id);
                    }
                    setShowColorPicker(false);
                    setColorSearch("");
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    selectedColor === item._id && styles.pickerItemTextSelected
                  ]}>
                    {item.Kol_Opis}
                  </Text>
                  {selectedColor === item._id && (
                    <Ionicons name="checkmark" size={24} color="#0D6EFD" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wyników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Subcategory Picker Modal */}
      <Modal
        visible={showSubcategoryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSubcategoryPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz podkategorię</Text>
              <TouchableOpacity onPress={() => setShowSubcategoryPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Ionicons name="search" size={20} color="#94A3B8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Szukaj..."
                placeholderTextColor="#64748B"
                value={subcategorySearch}
                onChangeText={setSubcategorySearch}
              />
            </View>
            <FlatList
              data={subcategories.filter(s => 
                s.Kat_1_Opis_1?.toLowerCase().includes(subcategorySearch.toLowerCase())
              )}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedSubcategory === item._id && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setSelectedSubcategory(item._id);
                    setShowSubcategoryPicker(false);
                    setSubcategorySearch("");
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    selectedSubcategory === item._id && styles.pickerItemTextSelected
                  ]}>
                    {item.Kat_1_Opis_1}
                  </Text>
                  {selectedSubcategory === item._id && (
                    <Ionicons name="checkmark" size={24} color="#0D6EFD" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wyników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Manufacturer Picker Modal */}
      <Modal
        visible={showManufacturerPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManufacturerPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz grupę</Text>
              <TouchableOpacity onPress={() => setShowManufacturerPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Ionicons name="search" size={20} color="#94A3B8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Szukaj..."
                placeholderTextColor="#64748B"
                value={manufacturerSearch}
                onChangeText={setManufacturerSearch}
              />
            </View>
            <FlatList
              data={manufacturers.filter(m => 
                m.Prod_Opis?.toLowerCase().includes(manufacturerSearch.toLowerCase())
              )}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedManufacturer === item._id && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setSelectedManufacturer(item._id);
                    setShowManufacturerPicker(false);
                    setManufacturerSearch("");
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    selectedManufacturer === item._id && styles.pickerItemTextSelected
                  ]}>
                    {item.Prod_Opis}
                  </Text>
                  {selectedManufacturer === item._id && (
                    <Ionicons name="checkmark" size={24} color="#0D6EFD" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wyników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Size Picker Modal (for price exceptions) */}
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
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Ionicons name="search" size={20} color="#94A3B8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Szukaj..."
                placeholderTextColor="#64748B"
                value={sizeSearch}
                onChangeText={setSizeSearch}
              />
            </View>
            <FlatList
              data={sizes.filter(s => 
                s.Roz_Opis?.toLowerCase().includes(sizeSearch.toLowerCase())
              )}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    if (activeSizeExceptionIndex !== null) {
                      handlePriceExceptionChange(activeSizeExceptionIndex, 'size', item._id);
                    }
                    setShowSizePicker(false);
                    setSizeSearch("");
                    setActiveSizeExceptionIndex(null);
                  }}
                >
                  <Text style={styles.pickerItemText}>
                    {item.Roz_Opis}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wyników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Bags Category Picker Modal */}
      <Modal
        visible={showBagsCategoryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBagsCategoryPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz podkategorię</Text>
              <TouchableOpacity onPress={() => setShowBagsCategoryPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={bagsCategories}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedBagsCategoryId === item._id && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setSelectedBagsCategoryId(item._id);
                    setSelectedBagsCategoryCode(item.Kat_1_Kod_1);
                    setShowBagsCategoryPicker(false);
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    selectedBagsCategoryId === item._id && styles.pickerItemTextSelected
                  ]}>
                    {item.Kat_1_Opis_1} ({item.Plec})
                  </Text>
                  {selectedBagsCategoryId === item._id && (
                    <Ionicons name="checkmark" size={24} color="#0D6EFD" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wyników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Bags Picker Modal */}
      <Modal
        visible={showBagsPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBagsPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz torebkę</Text>
              <TouchableOpacity onPress={() => setShowBagsPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Ionicons name="search" size={20} color="#94A3B8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Szukaj..."
                placeholderTextColor="#64748B"
                value={bagsSearch}
                onChangeText={setBagsSearch}
              />
            </View>
            <FlatList
              data={bagsData.filter(b => 
                b.Torebki_Kod?.toLowerCase().includes(bagsSearch.toLowerCase())
              )}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedBagCode === item.Torebki_Kod && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setSelectedBagCode(item.Torebki_Kod);
                    // Update product name when bag is selected
                    if (selectedColor) {
                      updateBagProductName(item.Torebki_Kod, selectedColor);
                    }
                    setShowBagsPicker(false);
                    setBagsSearch("");
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    selectedBagCode === item.Torebki_Kod && styles.pickerItemTextSelected
                  ]}>
                    {item.Torebki_Kod}
                  </Text>
                  {selectedBagCode === item.Torebki_Kod && (
                    <Ionicons name="checkmark" size={24} color="#0D6EFD" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wyników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Wallets Category Picker Modal */}
      <Modal
        visible={showWalletsCategoryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWalletsCategoryPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz podkategorię</Text>
              <TouchableOpacity onPress={() => setShowWalletsCategoryPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={walletsCategories}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedWalletsCategoryId === item._id && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setSelectedWalletsCategoryId(item._id);
                    setSelectedWalletsCategoryCode(item.Kat_1_Kod_1);
                    setShowWalletsCategoryPicker(false);
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    selectedWalletsCategoryId === item._id && styles.pickerItemTextSelected
                  ]}>
                    {item.Kat_1_Opis_1} ({item.Plec})
                  </Text>
                  {selectedWalletsCategoryId === item._id && (
                    <Ionicons name="checkmark" size={24} color="#0D6EFD" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wyników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Wallets Picker Modal */}
      <Modal
        visible={showWalletsPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWalletsPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz portfel</Text>
              <TouchableOpacity onPress={() => setShowWalletsPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Ionicons name="search" size={20} color="#94A3B8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Szukaj..."
                placeholderTextColor="#64748B"
                value={walletsSearch}
                onChangeText={setWalletsSearch}
              />
            </View>
            <FlatList
              data={walletsData.filter(w => 
                w.Portfele_Kod?.toLowerCase().includes(walletsSearch.toLowerCase())
              )}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedWalletCode === item.Portfele_Kod && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setSelectedWalletCode(item.Portfele_Kod);
                    // Update product name when wallet is selected
                    if (selectedColor) {
                      updateWalletProductName(item.Portfele_Kod, selectedColor);
                    }
                    setShowWalletsPicker(false);
                    setWalletsSearch("");
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    selectedWalletCode === item.Portfele_Kod && styles.pickerItemTextSelected
                  ]}>
                    {item.Portfele_Kod}
                  </Text>
                  {selectedWalletCode === item.Portfele_Kod && (
                    <Ionicons name="checkmark" size={24} color="#0D6EFD" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wyników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Remaining Category Picker Modal */}
      <Modal
        visible={showRemainingCategoryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRemainingCategoryPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz podkategorię</Text>
              <TouchableOpacity onPress={() => setShowRemainingCategoryPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={remainingCategories}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedRemainingCategoryId === item._id && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setSelectedRemainingCategoryId(item._id);
                    // Reset subcategory and product when category changes
                    setSelectedRemainingSubcategoryId("");
                    setSelectedRemainingProductCode("");
                    setProductName("");
                    
                    // Immediately load subcategories based on category
                    if (item._id === 'belts') {
                      const beltsOptions = belts.map(belt => ({
                        _id: belt._id,
                        Sub_Opis: belt.Belt_Opis,
                        type: 'belt'
                      }));
                      setRemainingSubcategories(beltsOptions);
                      if (beltsOptions.length > 0) {
                        setSelectedRemainingSubcategoryId(beltsOptions[0]._id);
                      }
                    } else if (item._id === 'gloves') {
                      const glovesOptions = gloves.map(glove => ({
                        _id: glove._id,
                        Sub_Opis: glove.Glove_Opis,
                        type: 'glove'
                      }));
                      setRemainingSubcategories(glovesOptions);
                      if (glovesOptions.length > 0) {
                        setSelectedRemainingSubcategoryId(glovesOptions[0]._id);
                      }
                    } else if (item._id === 'caps') {
                      const capsOptions = caps.map(cap => ({
                        _id: cap._id,
                        Sub_Opis: cap.Cap_Opis,
                        type: 'cap'
                      }));
                      setRemainingSubcategories(capsOptions);
                      if (capsOptions.length > 0) {
                        setSelectedRemainingSubcategoryId(capsOptions[0]._id);
                      }
                    } else {
                      setRemainingSubcategories([]); // impregnaty, pasty, pompony, kapy, kołnierze, opaski - bez podpodkategorii
                    }
                    
                    setShowRemainingCategoryPicker(false);
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    selectedRemainingCategoryId === item._id && styles.pickerItemTextSelected
                  ]}>
                    {item.Rem_Kat_1_Opis_1}
                  </Text>
                  {selectedRemainingCategoryId === item._id && (
                    <Ionicons name="checkmark" size={24} color="#0D6EFD" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wyników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Remaining Subcategory Picker Modal */}
      <Modal
        visible={showRemainingSubcategoryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRemainingSubcategoryPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz podpodkategorię</Text>
              <TouchableOpacity onPress={() => setShowRemainingSubcategoryPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={remainingSubcategories}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedRemainingSubcategoryId === item._id && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setSelectedRemainingSubcategoryId(item._id);
                    setShowRemainingSubcategoryPicker(false);
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    selectedRemainingSubcategoryId === item._id && styles.pickerItemTextSelected
                  ]}>
                    {item.Sub_Opis}
                  </Text>
                  {selectedRemainingSubcategoryId === item._id && (
                    <Ionicons name="checkmark" size={24} color="#0D6EFD" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wyników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Remaining Products Picker Modal */}
      <Modal
        visible={showRemainingPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRemainingPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Wybierz produkt</Text>
              <TouchableOpacity onPress={() => setShowRemainingPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Ionicons name="search" size={20} color="#94A3B8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Szukaj..."
                placeholderTextColor="#64748B"
                value={remainingProductsSearch}
                onChangeText={setRemainingProductsSearch}
              />
            </View>
            <FlatList
              data={getFilteredRemainingProducts()}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedRemainingProductCode === item.Poz_Kod && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setSelectedRemainingProductCode(item.Poz_Kod);
                    // Update product name when product is selected
                    if (selectedColor) {
                      updateRemainingProductName(item.Poz_Kod, selectedColor);
                    }
                    setShowRemainingPicker(false);
                    setRemainingProductsSearch("");
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    selectedRemainingProductCode === item.Poz_Kod && styles.pickerItemTextSelected
                  ]}>
                    {item.Poz_Kod}
                  </Text>
                  {selectedRemainingProductCode === item.Poz_Kod && (
                    <Ionicons name="checkmark" size={24} color="#0D6EFD" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Brak wyników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Enlarged Image Modal */}
      <Modal
        visible={enlargedImage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEnlargedImage(null)}
      >
        <View style={styles.imageModalOverlay}>
          <TouchableOpacity
            style={styles.imageModalClose}
            onPress={() => setEnlargedImage(null)}
            activeOpacity={1}
          >
            <View style={styles.imageModalContent}>
              <TouchableOpacity
                style={styles.imageCloseButton}
                onPress={() => setEnlargedImage(null)}
              >
                <Ionicons name="close-circle" size={40} color="#fff" />
              </TouchableOpacity>
              {enlargedImage ? (
                <Image
                  source={{ uri: enlargedImage }}
                  style={styles.enlargedImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.noImageContainer}>
                  <Ionicons name="image-outline" size={80} color="#475569" />
                  <Text style={styles.noImageText}>Brak zdjęcia</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
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

      {/* Confirm Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="warning" size={64} color="#F59E0B" />
            </View>
            <Text style={styles.successTitle}>Potwierdź</Text>
            <Text style={styles.successMessage}>{confirmMessage}</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.cancelConfirmButton]}
                onPress={() => {
                  setShowConfirmModal(false);
                  setProductToDelete(null);
                }}
              >
                <Text style={styles.successButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.deleteConfirmButton]}
                onPress={confirmDelete}
              >
                <Text style={styles.successButtonText}>Usuń</Text>
              </TouchableOpacity>
            </View>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
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
    color: "#fff",
    flex: 1,
    textAlign: "center",
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0D6EFD",
    justifyContent: "center",
    alignItems: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#000000",
    margin: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
  },
  countContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  countText: {
    fontSize: 14,
    color: "#94A3B8",
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
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#64748B",
    marginTop: 16,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  productCard: {
    backgroundColor: "#000000",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  productHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  productInfo: {
    flex: 1,
    gap: 4,
    marginRight: 12,
  },
  productImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  placeholderImage: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1E293B",
  },
  productName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  productCode: {
    fontSize: 13,
    color: "#94A3B8",
  },
  productCategory: {
    fontSize: 12,
    color: "#0D6EFD",
    marginTop: 4,
  },
  productDetails: {
    marginBottom: 12,
  },
  priceContainer: {
    gap: 8,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceLabel: {
    fontSize: 14,
    color: "#94A3B8",
  },
  priceValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  discountPrice: {
    color: "#10B981",
  },
  productActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  editButton: {
    backgroundColor: "#0D6EFD",
  },
  deleteButton: {
    backgroundColor: "#DC3545",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#000000",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  modalForm: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formGroupHalf: {
    flex: 1,
  },
  formRow: {
    flexDirection: "row",
    gap: 12,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#fff",
  },
  formTextArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  modalActions: {
    flexDirection: "row",
    padding: 20,
    paddingBottom: 40,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#1E293B",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  saveButton: {
    backgroundColor: "#0D6EFD",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageModalClose: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  imageModalContent: {
    width: "90%",
    height: "80%",
    position: "relative",
  },
  imageCloseButton: {
    position: "absolute",
    top: -50,
    right: 0,
    zIndex: 10,
  },
  enlargedImage: {
    width: "100%",
    height: "100%",
  },
  noImageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  noImageText: {
    fontSize: 18,
    color: "#64748B",
  },
  // New styles for image picker and form elements
  imagePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: "#000000",
    borderWidth: 2,
    borderColor: "#0D6EFD",
    borderRadius: 12,
    borderStyle: "dashed",
  },
  imagePickerText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D6EFD",
  },
  imagePreviewContainer: {
    marginTop: 12,
    position: "relative",
    alignSelf: "flex-start",
  },
  imagePreview: {
    width: 150,
    height: 150,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#1E293B",
  },
  removeImageButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#000000",
    borderRadius: 12,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#000000",
  },
  pickerButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pickerButtonText: {
    fontSize: 16,
    color: "#fff",
  },
  chipButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  chipButtonActive: {
    backgroundColor: "#0D6EFD",
    borderColor: "#0D6EFD",
  },
  chipButtonText: {
    fontSize: 14,
    color: "#94A3B8",
    fontWeight: "500",
  },
  chipButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  genderButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
  },
  genderButtonActive: {
    backgroundColor: "#0D6EFD",
    borderColor: "#0D6EFD",
  },
  genderButtonText: {
    fontSize: 16,
    color: "#94A3B8",
    fontWeight: "500",
  },
  genderButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  // New styles for select buttons and modals
  selectButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  selectButtonText: {
    fontSize: 16,
    color: "#fff",
    flex: 1,
  },
  readonlyInput: {
    backgroundColor: "#0A0A0A",
    color: "#94A3B8",
  },
  characterCount: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "right",
    marginTop: 4,
  },
  // Picker modal styles
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  pickerModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  pickerSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0A0A0A",
    margin: 20,
    marginBottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    gap: 10,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
  },
  pickerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  pickerItemSelected: {
    backgroundColor: "#0D6EFD15",
  },
  pickerItemText: {
    fontSize: 16,
    color: "#fff",
    flex: 1,
  },
  pickerItemTextSelected: {
    color: "#0D6EFD",
    fontWeight: "600",
  },
  pickerEmptyText: {
    fontSize: 16,
    color: "#64748B",
    textAlign: "center",
    padding: 40,
  },
  // Price exceptions styles
  exceptionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addExceptionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addExceptionText: {
    fontSize: 14,
    color: "#0D6EFD",
    fontWeight: "600",
  },
  noExceptionsText: {
    fontSize: 14,
    color: "#64748B",
    fontStyle: "italic",
    padding: 16,
    textAlign: "center",
    backgroundColor: "#0A0A0A",
    borderRadius: 8,
  },
  exceptionItem: {
    backgroundColor: "#0A0A0A",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  exceptionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  exceptionField: {
    flex: 1,
  },
  exceptionLabel: {
    fontSize: 12,
    color: "#94A3B8",
    marginBottom: 6,
  },
  exceptionSelect: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  exceptionSelectText: {
    fontSize: 14,
    color: "#fff",
    flex: 1,
  },
  exceptionInput: {
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#fff",
  },
  removeExceptionButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#DC262615",
    borderRadius: 6,
    marginBottom: 2,
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
  confirmButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 8,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
  },
  cancelConfirmButton: {
    backgroundColor: "#64748B",
  },
  deleteConfirmButton: {
    backgroundColor: "#DC2626",
  },
  productSubcategory: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  exceptionsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
  },
  exceptionsTitle: {
    fontSize: 13,
    color: "#94A3B8",
    marginBottom: 6,
    fontWeight: "600",
  },
  exceptionItemCompact: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  exceptionSize: {
    fontSize: 12,
    color: "#64748B",
  },
  exceptionValue: {
    fontSize: 12,
    color: "#0D6EFD",
    fontWeight: "600",
  },
  scrollToBottomButton: {
    position: "absolute",
    right: 20,
    backgroundColor: "transparent",
    borderRadius: 25,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
});

export default ProductsList;
