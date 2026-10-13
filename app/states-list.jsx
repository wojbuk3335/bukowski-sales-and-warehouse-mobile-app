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
import { PageHeader, look } from '../components/AdminLook'; // wspólny wygląd panelu admina
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
        <PageHeader title="Stany" icon="layers-outline" onBack={() => router.back()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D6EFD" />
          <Text style={styles.loadingText}>Ładowanie punktów sprzedaży...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <PageHeader title="Stany" icon="layers-outline" onBack={() => router.back()} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Info Alert */}
        <View style={styles.infoAlert}>
          <View style={[styles.iconTile, { backgroundColor: "#0D6EFD26" }]}>
            <Ionicons name="information-circle-outline" size={20} color="#0D6EFD" />
          </View>
          <Text style={styles.infoText}>
            Wybierz punkt sprzedaży, aby zarządzać jego stanami. Wszystkie operacje dodawania i usuwania produktów będą uwzględniane w raportach.
          </Text>
        </View>

        {/* Counter */}
        <View style={styles.counterCard}>
          <View style={[styles.iconTile, { backgroundColor: "#0D6EFD26" }]}>
            <Ionicons name="storefront-outline" size={20} color="#0D6EFD" />
          </View>
          <Text style={styles.counterText}>
            Punktów sprzedaży: <Text style={styles.counterNumber}>{states.length}</Text>
          </Text>
        </View>

        {/* All States */}
        <TouchableOpacity
          style={styles.stateCard}
          onPress={handleAllStatesPress}
        >
          <View style={[styles.iconContainer, { backgroundColor: "#0D6EFD26" }]}>
            <Ionicons name="layers" size={26} color="#0D6EFD" />
          </View>
          <View style={styles.stateInfo}>
            <Text style={styles.stateTitle}>Wszystkie stany</Text>
            <Text style={styles.stateSubtitle}>Podglad wszystkich punktow sprzedazy</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={tc('muted', "#94A3B8")} />
        </TouchableOpacity>

        {/* States List */}
        {states.map((state, index) => (
          <TouchableOpacity
            key={state._id || index}
            style={styles.stateCard}
            onPress={() => handleStatePress(state)}
          >
            <View style={[styles.iconContainer, { backgroundColor: getColor(state) + '26' }]}>
              <Ionicons name={getIcon(state)} size={26} color={getColor(state)} />
            </View>
            <View style={styles.stateInfo}>
              <Text style={styles.stateTitle}>{getDisplayName(state)}</Text>
              <Text style={styles.stateSubtitle}>
                {state.email || 'Zarządzanie stanami i korektami'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={tc('muted', "#94A3B8")} />
          </TouchableOpacity>
        ))}

        {states.length === 0 && (
          <View style={look.emptyState}>
            <Ionicons name="folder-open-outline" size={56} color={tc('muted', "#94A3B8")} />
            <Text style={look.emptyStateText}>Brak punktów sprzedaży</Text>
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
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    color: tc('muted', "#94A3B8"),
    fontSize: 16,
  },
  // karta informacyjna z niebieskim paskiem z lewej
  infoAlert: {
    flexDirection: "row",
    backgroundColor: tc('surface', "#161622"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderLeftWidth: 4,
    borderLeftColor: "#0D6EFD",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 12,
    alignItems: "center",
  },
  infoText: {
    flex: 1,
    color: tc('muted', "#94A3B8"),
    fontSize: 14,
    lineHeight: 20,
  },
  counterCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    gap: 12,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  counterText: {
    color: tc('text', "#fff"),
    fontSize: 16,
    fontWeight: "600",
  },
  counterNumber: {
    color: "#0D6EFD",
    fontSize: 18,
    fontWeight: "bold",
  },
  stateCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    gap: 16,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  stateInfo: {
    flex: 1,
    gap: 3,
  },
  stateTitle: {
    color: tc('text', "#fff"),
    fontSize: 16,
    fontWeight: "600",
  },
  stateSubtitle: {
    color: tc('muted', "#94A3B8"),
    fontSize: 13,
  },
}));

export default StatesList;
