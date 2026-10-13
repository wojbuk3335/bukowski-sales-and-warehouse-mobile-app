import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import tokenService from "../services/tokenService";
import { getApiUrl } from "../config/api";

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
const StatesList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStates();
  }, []);

  const fetchStates = async () => {
    try {
      setLoading(true);
      const url = getApiUrl("/user");
      const response = await tokenService.authenticatedFetch(url);
      const data = await response.json();
      
      // Filter out admin users, keep magazyn, dom, and regular selling points
      const filteredStates = (data.users || []).filter(user => {
        const role = user.role?.toLowerCase();
        const symbol = user.symbol?.toLowerCase();
        return role !== 'admin' && role !== 'magazyn' && symbol !== 'magazyn';
      });
      
      setStates(filteredStates);
    } catch (error) {
      console.error("Error fetching states:", error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStates();
    setRefreshing(false);
  };

  const handleStatePress = (state) => {
    router.push({
      pathname: "/warehouse-mobile",
      params: { 
        userId: state._id,
        userName: state.sellingPoint || state.symbol || 'Punkt sprzedaży',
        symbol: state.symbol,
        role: state.role
      }
    });
  };

  const handleAllStatesPress = () => {
    router.push({
      pathname: "/warehouse-mobile",
      params: {
        allStates: "true",
        userName: "Wszystkie stany"
      }
    });
  };

  const getDisplayName = (state) => {
    if (state.role === 'magazyn') return 'Magazyn';
    if (state.role === 'dom') return 'Dom';
    return state.sellingPoint || state.symbol || 'Punkt sprzedaży';
  };

  const getIcon = (state) => {
    if (state.role === 'magazyn') return 'archive';
    if (state.role === 'dom') return 'home';
    return 'storefront';
  };

  const getColor = (state) => {
    if (state.role === 'magazyn') return '#DC2626';
    if (state.role === 'dom') return '#F59E0B';
    return '#0D6EFD';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={tc('text', "#fff")} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Stany</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D6EFD" />
          <Text style={styles.loadingText}>Ładowanie punktów sprzedaży...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={tc('text', "#fff")} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Stany</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Info Alert */}
        <View style={styles.infoAlert}>
          <Ionicons name="information-circle" size={24} color="#0D6EFD" />
          <Text style={styles.infoText}>
            Wybierz punkt sprzedaży, aby zarządzać jego stanami. Wszystkie operacje dodawania i usuwania produktów będą uwzględniane w raportach.
          </Text>
        </View>

        {/* Counter */}
        <View style={styles.counterCard}>
          <Ionicons name="storefront-outline" size={24} color="#0D6EFD" />
          <Text style={styles.counterText}>
            Punktów sprzedaży: <Text style={styles.counterNumber}>{states.length}</Text>
          </Text>
        </View>

        {/* All States */}
        <TouchableOpacity
          style={styles.stateCard}
          onPress={handleAllStatesPress}
        >
          <View style={[styles.iconContainer, { backgroundColor: "#0D6EFD20" }]}>
            <Ionicons name="layers" size={32} color="#0D6EFD" />
          </View>
          <View style={styles.stateInfo}>
            <Text style={styles.stateTitle}>Wszystkie stany</Text>
            <Text style={styles.stateSubtitle}>Podglad wszystkich punktow sprzedazy</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#666" />
        </TouchableOpacity>

        {/* States List */}
        {states.map((state, index) => (
          <TouchableOpacity
            key={state._id || index}
            style={styles.stateCard}
            onPress={() => handleStatePress(state)}
          >
            <View style={[styles.iconContainer, { backgroundColor: getColor(state) + '20' }]}>
              <Ionicons name={getIcon(state)} size={32} color={getColor(state)} />
            </View>
            <View style={styles.stateInfo}>
              <Text style={styles.stateTitle}>{getDisplayName(state)}</Text>
              <Text style={styles.stateSubtitle}>
                {state.email || 'Zarządzanie stanami i korektami'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={tc('muted', "#666")} />
          </TouchableOpacity>
        ))}

        {states.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={64} color={tc('muted', "#666")} />
            <Text style={styles.emptyText}>Brak punktów sprzedaży</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc('bg', "#000"),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: tc('bg', "#000"),
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
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
    color: tc('text', "#fff"),
    flex: 1,
    textAlign: "center",
  },
  content: {
    flex: 1,
    padding: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    color: tc('text', "#fff"),
    fontSize: 16,
  },
  infoAlert: {
    flexDirection: "row",
    backgroundColor: tc('surface', "#1a1a1a"),
    borderWidth: 1,
    borderColor: "#0D6EFD",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    gap: 12,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    color: tc('text', "#fff"),
    fontSize: 14,
    lineHeight: 20,
  },
  counterCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#1a1a1a"),
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#0D6EFD",
    gap: 12,
  },
  counterText: {
    color: tc('text', "#fff"),
    fontSize: 16,
    fontWeight: "500",
  },
  counterNumber: {
    color: "#0D6EFD",
    fontSize: 18,
    fontWeight: "bold",
  },
  stateCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#1a1a1a"),
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#333"),
    gap: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  stateInfo: {
    flex: 1,
    gap: 4,
  },
  stateTitle: {
    color: tc('text', "#fff"),
    fontSize: 18,
    fontWeight: "600",
  },
  stateSubtitle: {
    color: tc('muted', "#999"),
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 64,
    gap: 16,
  },
  emptyText: {
    color: tc('muted', "#666"),
    fontSize: 16,
  },
}));

export default StatesList;
