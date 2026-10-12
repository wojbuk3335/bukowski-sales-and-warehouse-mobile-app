import React, { useContext, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";

import { GlobalStateContext } from "../../context/GlobalState";
import Logger from "../../services/logger";
import LogoutButton from "../../components/LogoutButton";
import { appAlert } from '../../services/appAlert';

const Profile = () => {
  const { user, setUser, setIsLoggedIn } = useContext(GlobalStateContext);
  const insets = useSafeAreaInsets(); // Get safe area insets
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    // Profile is static, just simulate refresh
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleLogout = async () => {
    appAlert(
      "Wylogowanie",
      "Czy na pewno chcesz się wylogować?",
      [
        {
          text: "Anuluj",
          style: "cancel",
        },
        {
          text: "Wyloguj",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem("user");
              await AsyncStorage.removeItem("token");
              setUser(null);
              setIsLoggedIn(false);
              router.replace("/sign-in");
            } catch (error) {
              Logger.error("Logout error:", error);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{
      flex: 1,
      backgroundColor: "#000000",
      paddingBottom: Math.max(20, insets.bottom + 20)
    }}>
      <LogoutButton position="top-right" />
      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(120, insets.bottom + 120) }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person-circle" size={80} color="#dc3545" />
          </View>
          <Text style={styles.userName}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>ADMINISTRATOR</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informacje o koncie</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email:</Text>
              <Text style={styles.infoValue}>{user?.email}</Text>
            </View>

            {user?.symbol && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Symbol:</Text>
                <Text style={styles.infoValue}>{user?.symbol}</Text>
              </View>
            )}

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Rola:</Text>
              <Text style={styles.infoValue}>Administrator</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Zarządzanie kontem</Text>

          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => router.push('/change-password')}
          >
            <Ionicons name="key" size={24} color="#0d6efd" />
            <Text style={styles.actionText}>Zmień hasło</Text>
            <Ionicons name="chevron-forward" size={24} color="#CDCDE0" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Ionicons name="log-out" size={24} color="#fff" />
            <Text style={styles.logoutText}>Wyloguj się</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Panel Administratora v1.0.0
          </Text>
          <Text style={styles.footerText}>
            © 2026 Bukowski App
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#161622",
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
    paddingTop: 16,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: 'rgb(0, 123, 255)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: "#1E1E2D",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#232533",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#232533",
  },
  infoLabel: {
    fontSize: 16,
    color: "#CDCDE0",
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E1E2D",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#232533",
  },
  actionText: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
    marginLeft: 16,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgb(0, 123, 255)",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  footer: {
    alignItems: "center",
    marginTop: 32,
    paddingBottom: 16,
  },
  footerText: {
    fontSize: 12,
    color: "#CDCDE0",
    marginBottom: 4,
  },
});

export default Profile;
