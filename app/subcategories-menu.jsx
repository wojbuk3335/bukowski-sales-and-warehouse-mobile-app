import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack } from "expo-router";

const SubcategoriesMenu = () => {
  const subcategories = [
    {
      id: "coats",
      title: "Kurtki Kożuchy Futra",
      subtitle: "Zarządzaj podkategorią kurtek",
      icon: "shirt",
      route: "/coats-subcategory-list",
      color: "#0D6EFD",
    },
    {
      id: "bags",
      title: "Torebki",
      subtitle: "Zarządzaj podkategorią torebek",
      icon: "bag-handle",
      route: "/bags-subcategory-list",
      color: "#EC4899",
    },
    {
      id: "wallets",
      title: "Portfele",
      subtitle: "Zarządzaj kategorią portfeli",
      icon: "wallet",
      route: "/wallets-subcategory-list",
      color: "#A855F7",
    },
    {
      id: "belts",
      title: "Paski",
      subtitle: "Zarządzaj podkategorią pasków",
      icon: "reorder-four",
      route: "/belts-subcategory-list",
      color: "#F59E0B",
    },
    {
      id: "gloves",
      title: "Rękawiczki",
      subtitle: "Zarządzaj podkategorią rękawiczek",
      icon: "hand-left",
      route: "/gloves-subcategory-list",
      color: "#06B6D4",
    },
    {
      id: "caps",
      title: "Czapki",
      subtitle: "Zarządzaj podkategorią czapek",
      icon: "snow",
      route: "/caps-subcategory-list",
      color: "#8B5CF6",
    },
  ];

  const handleSubcategoryPress = (route) => {
    router.push(route);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tabela podkategorii</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {subcategories.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.menuItem}
            onPress={() => handleSubcategoryPress(item.route)}
            activeOpacity={0.7}
          >
            <View
              style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}
            >
              <Ionicons name={item.icon} size={28} color={item.color} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#64748B" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
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
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
    textAlign: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#000000",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  menuIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  menuText: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  menuSubtitle: {
    fontSize: 13,
    color: "#94A3B8",
  },
});

export default SubcategoriesMenu;
