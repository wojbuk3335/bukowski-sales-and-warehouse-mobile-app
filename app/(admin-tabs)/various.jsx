import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import LogoutButton from "../../components/LogoutButton";
import { ScreenHeader } from '../../components/AdminLook';

import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu
const Various = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets(); // Get safe area insets
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    // Menu is static, just simulate refresh
    setTimeout(() => setRefreshing(false), 500);
  };

  const menuItems = [
    {
      id: "states",
      title: "Stany",
      subtitle: "Wybierz punkt sprzedaży i zarządzaj stanami",
      icon: "layers",
      route: "/states-list",
      color: "#0EA5E9",
    },
    {
      id: "warehouse",
      title: "Magazyn",
      subtitle: "Zarządzaj produktami w magazynie",
      icon: "archive",
      route: "/warehouse-mobile",
      color: "#DC2626",
    },
    {
      id: "products",
      title: "Lista produktów",
      subtitle: "Zarządzaj produktami w systemie",
      icon: "pricetags",
      route: "/products-list",
      color: "#0D6EFD",
    },
    {
      id: "sales",
      title: "Podgląd sprzedaży",
      subtitle: "Zobacz sprzedaż z dowolnego dnia",
      icon: "receipt",
      route: "/sales-view",
      color: "#10B981",
    },
    {
      id: "stock",
      title: "Tabela asortymentu",
      subtitle: "Zarządzaj asortymentem produktów",
      icon: "cube",
      route: "/stock-list",
      color: "#F59E0B",
    },
    {
      id: "colors",
      title: "Lista kolorów",
      subtitle: "Zarządzaj kolorami produktów",
      icon: "color-palette",
      route: "/colors-list",
      color: "#8B5CF6",
    },
    {
      id: "sizes",
      title: "Lista rozmiarów",
      subtitle: "Zarządzaj rozmiarami produktów",
      icon: "resize",
      route: "/sizes-list",
      color: "#06B6D4",
    },
    {
      id: "localizations",
      title: "Lista lokalizacji",
      subtitle: "Zarządzaj lokalizacjami produktów",
      icon: "location",
      route: "/localizations-list",
      color: "#EF4444",
    },
    {
      id: "bags",
      title: "Tabela torebek",
      subtitle: "Zarządzaj torebkami (1000-9999)",
      icon: "bag-handle",
      route: "/bags-list",
      color: "#EC4899",
    },
    {
      id: "wallets",
      title: "Tabela portfeli",
      subtitle: "Zarządzaj portfelami (100-999)",
      icon: "wallet",
      route: "/wallets-list",
      color: "#A855F7",
    },
    {
      id: "remaining-products",
      title: "Pozostały asortyment",
      subtitle: "Zarządzaj pozostałymi produktami (10-99)",
      icon: "grid",
      route: "/remaining-products-list",
      color: "#84CC16",
    },
    {
      id: "employees",
      title: "Tabela pracowników",
      subtitle: "Zarządzaj pracownikami",
      icon: "people",
      route: "/employees-list",
      color: "#3B82F6",
    },
    {
      id: "manufacturers",
      title: "Tabela grup",
      subtitle: "Zarządzaj grupami producentów",
      icon: "briefcase",
      route: "/manufacturers-list",
      color: "#8B5CF6",
    },
    {
      id: "subcategories",
      title: "Tabela podkategorii",
      subtitle: "Zarządzaj podkategoriami produktów",
      icon: "file-tray-stacked",
      route: "/subcategories-menu",
      color: "#F97316",
    },
    {
      id: "payroll",
      title: "Wypłaty",
      subtitle: "Rozliczenia miesięczne pracowników",
      icon: "cash",
      route: "/payroll",
      color: "#22C55E",
    },
    {
      id: "history",
      title: "Historia",
      subtitle: "Historia wszystkich operacji w systemie",
      icon: "time-outline",
      route: "/history",
      color: "#6366F1",
    },
    {
      id: "users-management",
      title: "Zarządzanie użytkownikami",
      subtitle: "Dodawaj, edytuj i usuwaj użytkowników",
      icon: "people-circle",
      route: "/users-management",
      color: "#DC2626",
    },
    {
      id: "corrections",
      title: "Korekty",
      subtitle: "Zarządzaj korektami stanu magazynowego",
      icon: "create-outline",
      route: "/corrections-list",
      color: "#F59E0B",
    },
    {
      id: "orders",
      title: "Zamówienia",
      subtitle: "Przeglądaj i zarządzaj zamówieniami",
      icon: "cart-outline",
      route: "/orders-list",
      color: "#8B5CF6",
    },
    {
      id: "cudzich",
      title: "Cudzich",
      subtitle: "Zarządzaj transakcjami cudzych",
      icon: "swap-horizontal-outline",
      route: "/cudzich-list",
      color: "#10B981",
    },
    {
      id: "operacje",
      title: "Operacje",
      subtitle: "Operacje finansowe użytkowników",
      icon: "cash-outline",
      route: "/operacje-list",
      color: "#06B6D4",
    },
    {
      id: "cenniki",
      title: "Cenniki",
      subtitle: "Zarządzaj cennikami punktów sprzedaży",
      icon: "pricetags",
      route: "/cenniki",
      color: "#0EA5E9",
    },
    {
      id: "print-labels",
      title: "Wydruk etykiet",
      subtitle: "Drukuj etykiety produktów",
      icon: "print",
      route: "/print-labels",
      color: "#22C55E",
    },
    {
      id: "pan-kazek",
      title: "Pan Kazek",
      subtitle: "System rozliczania produktów",
      icon: "cash-outline",
      route: "/pan-kazek",
      color: "#16A34A",
    },
  ];

  const handleMenuPress = (route) => {
    router.push(route);
  };

  return (
    <SafeAreaView style={{
      flex: 1,
      backgroundColor: tc('bg', "#000000"),
      paddingBottom: Math.max(20, insets.bottom + 20)
    }}>
      <View style={{ paddingHorizontal: 12 }}>
        <ScreenHeader icon="grid" title="Różne" subtitle="Dodatkowe funkcje i narzędzia" />
      </View>

      <ScrollView alwaysBounceVertical 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.menuItem,
              index === menuItems.length - 1 && styles.lastMenuItem
            ]}
            onPress={() => handleMenuPress(item.route)}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
              <Ionicons name={item.icon} size={28} color={item.color} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={tc('muted', "#64748B")} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc('bg', "#000000"),
  },
  header: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: tc('bg', "#000000"),
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#0D6EFD",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#000000"),
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  lastMenuItem: {
    marginBottom: 20, // Większy margines dla ostatniego elementu
  },
  menuIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  menuText: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  menuSubtitle: {
    fontSize: 13,
    color: tc('muted', "#94A3B8"),
  },
}));

export default Various;
