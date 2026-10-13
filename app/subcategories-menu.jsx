import React from "react";
import {
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, MenuCard } from '../components/AdminLook'; // wspólny wygląd panelu admina
const SubcategoriesMenu = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
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
      {/* Nagłówek podstrony */}
      <PageHeader
        title="Tabela podkategorii"
        icon="git-branch-outline"
        onBack={() => router.back()}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        {subcategories.map((item) => (
          <MenuCard
            key={item.id}
            icon={item.icon}
            color={item.color}
            title={item.title}
            subtitle={item.subtitle}
            onPress={() => handleSubcategoryPress(item.route)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
    </>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
}));

export default SubcategoriesMenu;
