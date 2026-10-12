import React, { useState } from "react";
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
import { router } from "expo-router";
import LogoutButton from "../../components/LogoutButton";
import { appAlert } from '../../services/appAlert';

const Reports = () => {
  const insets = useSafeAreaInsets(); // Get safe area insets
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    // Reports don't need to reload data, just simulate refresh
    setTimeout(() => setRefreshing(false), 500);
  };

  const reportTypes = [
    {
      id: 1,
      title: "Raport sprzedaży",
      description: "Szczegółowy raport wszystkich sprzedaży",
      icon: "cart",
      color: "#0d6efd",
    },
    {
      id: 2,
      title: "Stany magazynowe",
      description: "Aktualny stan wszystkich produktów",
      icon: "cube",
      color: "#198754",
    },
    {
      id: 3,
      title: "Raport przepływów magazynowych",
      description: "Historia przepływów dla wybranego okresu",
      icon: "swap-horizontal",
      color: "#10B981",
    },
    {
      id: 4,
      title: "Raport transferów",
      description: "Historia wszystkich transferów",
      icon: "arrow-forward",
      color: "#ffc107",
    },
    {
      id: 5,
      title: "Raport finansowy",
      description: "Przychody, koszty i wynagrodzenia",
      icon: "cash",
      color: "#dc3545",
    },
    {
      id: 6,
      title: "Raport aktywności użytkowników",
      description: "Godziny pracy i aktywność",
      icon: "time",
      color: "#6f42c1",
    },
  ];

  return (
    <SafeAreaView style={{
      flex: 1,
      backgroundColor: "#000000",
      paddingBottom: Math.max(20, insets.bottom + 20)
    }}>
      <LogoutButton position="top-right" />
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="bar-chart" size={32} color="#fff" />
        </View>
        <Text style={styles.title}>Raporty</Text>
        <Text style={styles.subtitle}>Wybierz rodzaj raportu</Text>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {reportTypes.map((report) => (
          <TouchableOpacity
            key={report.id}
            style={styles.reportCard}
            onPress={() => {
              if (report.id === 1) {
                // Raport sprzedaży
                router.push('/sales-report');
              } else if (report.id === 2) {
                // Raport stanów magazynowych
                router.push('/inventory-report');
              } else if (report.id === 3) {
                // Raport przepływów magazynowych
                router.push('/movements-report');
              } else {
                // TODO: Implement other reports
                appAlert('Wkrótce', `Raport "${report.title}" będzie wkrótce dostępny`);
              }
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.reportIcon, { backgroundColor: `${report.color}20` }]}>
              <Ionicons name={report.icon} size={28} color={report.color} />
            </View>
            <View style={styles.reportInfo}>
              <Text style={styles.reportTitle}>{report.title}</Text>
              <Text style={styles.reportDescription}>
                {report.description}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#64748B" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgb(0, 123, 255)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
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
  reportCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#000000",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  reportIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  reportInfo: {
    flex: 1,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  reportDescription: {
    fontSize: 13,
    color: "#94A3B8",
  },
});

export default Reports;
