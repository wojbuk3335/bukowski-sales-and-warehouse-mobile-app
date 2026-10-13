import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { useContext } from "react";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../context/ThemeContext';
import { GlobalStateContext } from "../../context/GlobalState";

// Ikona zakładki (jak w panelu użytkownika): aktywna - wypełniona, na niebieskiej plakietce
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

const AdminTabLayout = () => {
  const { user } = useContext(GlobalStateContext);
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme(); // motyw: tło, pasek zakładek, pasek stanu

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Status bar spacer */}
      <View style={{ height: 32, backgroundColor: colors.bg }} />
      <Tabs
        options={{ headerShown: false }}
        screenOptions={{
          tabBarActiveTintColor: "rgb(0, 123, 255)",
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
          name="dashboard"
          options={{
            title: "Sprawdź",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon iconName="checkmark-done-circle" color={color} name="Sprawdź" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="users"
          options={{
            title: "Dobierz",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon iconName="shirt" color={color} name="Dobierz" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="various"
          options={{
            title: "Różne",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon iconName="apps" color={color} name="Różne" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="reports"
          options={{
            title: "Raporty",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon iconName="bar-chart" color={color} name="Raporty" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Profil",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon iconName="person-circle" color={color} name="Profil" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="settings"
          options={{
            href: null,
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

export default AdminTabLayout;
