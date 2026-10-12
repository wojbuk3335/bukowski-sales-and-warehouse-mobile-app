import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import LogoutButton from "../../components/LogoutButton";
import { appAlert } from '../../services/appAlert';

const Settings = () => {
  const insets = useSafeAreaInsets(); // Get safe area insets
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [autoBackup, setAutoBackup] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  const onRefresh = () => {
    setRefreshing(true);
    // Settings are local state, just simulate refresh
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleClearCache = () => {
    appAlert(
      "Wyczyść pamięć podręczną",
      "Czy na pewno chcesz wyczyścić pamięć podręczną?",
      [
        { text: "Anuluj", style: "cancel" },
        { text: "Wyczyść", onPress: () => console.log("Cache cleared") },
      ]
    );
  };

  const handleExportData = () => {
    appAlert(
      "Eksportuj dane",
      "Funkcja eksportu danych zostanie wkrótce dodana."
    );
  };

  const handleBackupNow = () => {
    appAlert(
      "Kopia zapasowa",
      "Funkcja tworzenia kopii zapasowej zostanie wkrótce dodana."
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
          <Text style={styles.title}>Ustawienia</Text>
          <Text style={styles.subtitle}>Konfiguracja systemu</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ogólne</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="notifications" size={24} color="#0d6efd" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Powiadomienia</Text>
                <Text style={styles.settingDescription}>
                  Otrzymuj powiadomienia o ważnych zdarzeniach
                </Text>
              </View>
            </View>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: "#767577", true: "#0d6efd" }}
              thumbColor={notifications ? "#fff" : "#f4f3f4"}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="moon" size={24} color="#0d6efd" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Tryb ciemny</Text>
                <Text style={styles.settingDescription}>
                  Włącz ciemny motyw interfejsu
                </Text>
              </View>
            </View>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: "#767577", true: "#0d6efd" }}
              thumbColor={darkMode ? "#fff" : "#f4f3f4"}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dane</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="cloud-upload" size={24} color="#198754" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Automatyczne kopie zapasowe</Text>
                <Text style={styles.settingDescription}>
                  Twórz kopie zapasowe codziennie
                </Text>
              </View>
            </View>
            <Switch
              value={autoBackup}
              onValueChange={setAutoBackup}
              trackColor={{ false: "#767577", true: "#198754" }}
              thumbColor={autoBackup ? "#fff" : "#f4f3f4"}
            />
          </View>

          <TouchableOpacity style={styles.actionButton} onPress={handleBackupNow}>
            <Ionicons name="save" size={24} color="#0d6efd" />
            <Text style={styles.actionButtonText}>Utwórz kopię zapasową</Text>
            <Ionicons name="chevron-forward" size={24} color="#CDCDE0" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleExportData}>
            <Ionicons name="download" size={24} color="#0d6efd" />
            <Text style={styles.actionButtonText}>Eksportuj dane</Text>
            <Ionicons name="chevron-forward" size={24} color="#CDCDE0" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Konserwacja</Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleClearCache}
          >
            <Ionicons name="trash" size={24} color="#ffc107" />
            <Text style={styles.actionButtonText}>Wyczyść pamięć podręczną</Text>
            <Ionicons name="chevron-forward" size={24} color="#CDCDE0" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informacje</Text>

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Wersja aplikacji</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Ostatnia aktualizacja</Text>
            <Text style={styles.infoValue}>6 lutego 2026</Text>
          </View>
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
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#CDCDE0",
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
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E1E2D",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#232533",
  },
  settingInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingText: {
    marginLeft: 16,
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: "#CDCDE0",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E1E2D",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#232533",
  },
  actionButtonText: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
    marginLeft: 16,
  },
  infoItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E1E2D",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#232533",
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
});

export default Settings;
