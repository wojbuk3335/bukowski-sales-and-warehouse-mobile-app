import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { CommonActions } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { useContext } from "react";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../context/ThemeContext';
import { GlobalStateContext } from "../../context/GlobalState";

// Ikona zakładki: te same ikony co w nagłówkach ekranów; aktywna - wypełniona, na niebieskiej plakietce
const TabIcon = ({ iconName, color, name, focused }) => (
  <View style={styles.tabIconContainer}>
    <View style={[styles.iconPill, focused && styles.iconPillFocused]}>
      <Ionicons name={focused ? iconName : `${iconName}-outline`} size={22} color={color} />
    </View>
    <Text
      numberOfLines={1}
      style={[
        styles.tabText,
        focused ? styles.tabTextFocused : styles.tabTextRegular,
        { color },
      ]}
    >
      {name}
    </Text>
  </View>
);

// „Dodaj” - wyróżniony okrągły przycisk pośrodku menu (bez podpisu)
const AddTabIcon = ({ focused }) => (
  <View style={styles.tabIconContainer}>
    <View style={[styles.addButton, focused && styles.addButtonFocused]}>
      <Ionicons name="add" size={30} color="#fff" />
    </View>
  </View>
);

const TabLayout = () => {
  const { user } = useContext(GlobalStateContext);
  const isParzygnat = user?.symbol === 'P';
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme(); // motyw: tło, pasek zakładek, pasek stanu

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Status bar spacer */}
      <View style={{ height: 32, backgroundColor: colors.bg }} />
      <Tabs
        options={{ headerShown: false }}
        // Kliknięcie aktywnej zakładki otwiera ją od nowa (świeży ekran), jak po wejściu z innej zakładki
        screenListeners={({ navigation, route }) => ({
          tabPress: (event) => {
            if (!navigation.isFocused()) return;
            event.preventDefault();
            const state = navigation.getState();
            navigation.dispatch({
              ...CommonActions.reset({
                index: state.index,
                // trasa bez klucza dostaje nowy klucz = ekran montuje się od nowa
                routes: state.routes.map((r) => (r.key === route.key ? { name: r.name, params: r.params } : r)),
              }),
              target: state.key,
            });
          },
        })}
        screenOptions={{
          // Zakładka, która nie jest na wierzchu, nie renderuje się (react-freeze): zmiany w stanie globalnym
          // nie przerysowują już naraz wszystkich odwiedzonych zakładek (Sprzedaż ma ~7 tys. linii)
          freezeOnBlur: true,
          tabBarActiveTintColor: "#0D6EFD",
          tabBarInactiveTintColor: colors.muted,
          tabBarShowLabel: false,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            height: Math.max(90, 70 + insets.bottom),
            paddingBottom: Math.max(10, insets.bottom),
            paddingTop: 15,
            paddingHorizontal: 4,
            position: 'absolute',
            bottom: 0,
            width: '100%',
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon iconName="cart" color={color} name="Sprzedaż" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="writeoff"
          options={{
            title: "Stan",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon iconName="layers" color={color} name="Stan" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon iconName="search" color={color} name="Szukaj" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="create"
          options={{
            title: "Create",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <AddTabIcon focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="cudzych"
          options={{
            title: "Cudzich",
            headerShown: false,
            href: isParzygnat ? "/cudzych" : null,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon iconName="person" color={color} name="Cudzich" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Zamówienia",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon iconName="document-text" color={color} name="Zamów" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="remanent"
          options={{
            title: "Remanent",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon iconName="clipboard" color={color} name="Remanent" focused={focused} />
            ),
          }}
        />
      </Tabs>

      <StatusBar backgroundColor={colors.bg} style={colors.statusBar} />
    </View>
  );
};

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 56,
    height: 56,
    gap: 2,
    marginBottom: 20,
  },
  iconPill: {
    width: 44,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPillFocused: {
    backgroundColor: "rgba(13, 110, 253, 0.15)",
  },
  addButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginTop: 4,
    backgroundColor: "#0D6EFD",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0D6EFD",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  addButtonFocused: {
    backgroundColor: "#0B5ED7",
  },
  tabText: {
    fontSize: 10,
    textAlign: "center",
    minHeight: 12,
    lineHeight: 12,
  },
  tabTextFocused: {
    fontWeight: "700",
  },
  tabTextRegular: {
    fontWeight: "500",
  },
});

export default TabLayout;
