import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useNavigation, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useContext, useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Ionicons from "@expo/vector-icons/Ionicons";
import CustomButton from "../../components/CustomButton";
import FormField from "../../components/FormField";
import { GlobalStateContext } from "../../context/GlobalState";
import { checkAndApplyUpdate, getVersionLabel } from "../../services/appUpdates";
import { tc, createThemedStyles, useAppTheme, statusBarStyle } from '../../context/ThemeContext'; // kolory zależne od motywu
import Logger from "../../services/logger"; // Import logger service
import tokenService from "../../services/tokenService"; // Import token service
import bukowskiLogo from "./bukowski.png"; // Import the image

const SignIn = () => {
  const { theme, colors } = useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const params = useLocalSearchParams();
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isAdminPanel, setIsAdminPanel] = useState(false);
  const navigation = useNavigation();
  const { setUser, bukowski_login, isLoading, user } = useContext(GlobalStateContext);
  // Aktualizacja OTA sprawdzana przy wejściu na ekran logowania (null = sprawdzanie zakończone)
  const [updateStage, setUpdateStage] = useState("checking");

  useEffect(() => {
    let active = true;
    checkAndApplyUpdate({ onDownloading: () => active && setUpdateStage("downloading") })
      .then((result) => {
        Logger.debug("OTA update check:", result?.status);
        if (active && result?.status !== "reloading") setUpdateStage(null);
      })
      .catch(() => active && setUpdateStage(null));
    return () => {
      active = false;
    };
  }, []);

  // Usunięto automatyczne przekierowanie przy wejściu - użytkownik musi wybrać panel

  const handlePanelSwitch = async () => {
    const newIsAdminPanel = !isAdminPanel;
    setIsAdminPanel(newIsAdminPanel);
    
    // Sprawdź czy użytkownik ma ważne tokeny przed automatycznym logowaniem
    try {
      const userData = await AsyncStorage.getItem("user");
      if (userData) {
        const parsedUser = JSON.parse(userData);
        
        // Sprawdź czy użytkownik ma ważne tokeny
        const isAuthenticated = await tokenService.isAuthenticated();
        
        if (!isAuthenticated) {
          // Brak ważnych tokenów - wyczyść dane użytkownika i wymagaj ponownego logowania
          Logger.debug("No valid tokens found - clearing user data");
          await AsyncStorage.removeItem("user");
          return;
        }
        
        // Jeśli przełącza na panel admina i jest adminem - automatycznie zaloguj
        if (newIsAdminPanel && parsedUser.role === 'admin') {
          setUser(parsedUser);
          router.replace("/(admin-tabs)/dashboard");
          return;
        }
        
        // Jeśli przełącza na panel użytkownika i jest userem - automatycznie zaloguj
        if (!newIsAdminPanel && parsedUser.role !== 'admin') {
          setUser(parsedUser);
          router.replace("/home");
          return;
        }
      }
    } catch (error) {
      Logger.error("Failed to check user for panel switch:", error);
    }
  };

  const submit = async () => {
    try {
      setError(""); // Clear any previous errors
      const response = await bukowski_login(form.email, form.password, navigation, isAdminPanel);

      if (response?.requiresVerification) {
        router.push({
          pathname: "/(auth)/two-factor",
          params: {
            userId: response.userId,
            email: response.email,
            step: response.step || "2fa_verification",
          },
        });
        return;
      }
      
      // Check if user role matches the selected panel
      if (isAdminPanel && response?.role && response.role !== 'admin') {
        setError("To konto nie ma uprawnień administratora");
        await AsyncStorage.removeItem("user");
        setUser(null);
        return;
      }
      
      if (!isAdminPanel && response?.role === 'admin') {
        setError("Konto administratora nie może zalogować się do panelu użytkownika");
        await AsyncStorage.removeItem("user");
        setUser(null);
        return;
      }
      
      setUser(response); // Update global state with user data
      
      // Redirect to appropriate panel based on role
      if (response.role === 'admin') {
        router.replace("/(admin-tabs)/dashboard"); // Admin panel
      } else {
        router.replace("/home"); // User panel
      }
    } catch (error) {
      // 🔒 SESSION BLOCKING: Jeśli k toś już zalogowany
      if (error.code === 'SESSION_ACTIVE' || error.message?.includes('Konto jest już zalogowane')) {
        setError("⚠️ Ktoś jest już zalogowany na tym koncie. Wyloguj się z innego urządzenia, aby kontynuować.");
      } else if (error.code === 'INVALID_CREDENTIALS') {
        setError("Nieprawidłowy email lub hasło. Spróbuj ponownie.");
      } else if (error.code === 'FORBIDDEN') {
        setError("Brak uprawnień do logowania w tym panelu. Sprawdź wybrany panel.");
      } else if (error.message?.includes('Admin role required')) {
        setError("To konto nie ma uprawnień administratora. Przełącz na panel użytkownika.");
      } else {
        setError(error.message || "Logowanie nie powiodło się. Sprawdź swoje dane i spróbuj ponownie.");
      }
    }
  };

  return (
    <SafeAreaView style={{ backgroundColor: tc('bg', "#000"), flex: 1 }}>
      <StatusBar backgroundColor={tc('bg', "black")} style={statusBarStyle()} />
      <ScrollView>
        <View
          style={[
            styles.container,
            { minHeight: Dimensions.get("window").height - 100 },
          ]}
        >
          <Image
            source={bukowskiLogo}
            resizeMode="contain"
            style={[styles.logo, theme === 'light' && { tintColor: colors.text }]} // w białym motywie logo czarne
          />

          <View style={styles.card}>
          {/* Wybór panelu: użytkownik / administrator */}
          <View style={styles.segment}>
            {[
              { admin: false, label: "Użytkownik", icon: "person" },
              { admin: true, label: "Administrator", icon: "shield-checkmark" },
            ].map((option) => {
              const active = isAdminPanel === option.admin;
              return (
                <TouchableOpacity
                  key={option.label}
                  testID={option.admin ? "panel-admin" : "panel-user"}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  style={[styles.segmentOption, active && styles.segmentOptionActive]}
                  onPress={() => { if (!active) handlePanelSwitch(); }}
                >
                  <Ionicons name={active ? option.icon : `${option.icon}-outline`} size={18} color={active ? "#fff" : tc('muted', "#94A3B8")} />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderIcon}>
              <Ionicons name={isAdminPanel ? "shield-checkmark" : "log-in"} size={28} color="#0D6EFD" />
            </View>
            <Text style={styles.cardTitle}>Zaloguj się</Text>
            <Text style={styles.cardSubtitle}>{isAdminPanel ? "Panel administracyjny" : "Panel użytkownika"}</Text>
          </View>

          <FormField
            title="Email"
            value={form.email}
            handleChangeText={(e) => {
              // Aktualizacja funkcyjna: menedżer haseł (Bitwarden) wpisuje email i hasło
              // jedno po drugim w tej samej chwili - `...form` z domknięcia skasowałby email
              setForm((prev) => ({ ...prev, email: e.trim() }));
              if (error) setError(""); // Clear error when user starts typing
            }}
            otherStyles={styles.field}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <FormField
            title="Hasło"
            value={form.password}
            handleChangeText={(e) => {
              setForm((prev) => ({ ...prev, password: e.trim() }));
              if (error) setError(""); // Clear error when user starts typing
            }}
            otherStyles={styles.field}
            secureTextEntry={true} // Explicitly enable secure text entry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <CustomButton
            title="Zaloguj się"
            handlePress={submit}
            containerStyles={styles.button}
            isLoading={isLoading || Boolean(updateStage)} // Logowanie czeka na sprawdzenie aktualizacji
          />

          {updateStage ? (
            <View style={styles.updateContainer}>
              <ActivityIndicator color={tc('text', "#fff")} />
              <Text style={styles.updateText}>
                {updateStage === "downloading" ? "Pobieranie aktualizacji…" : "Sprawdzanie aktualizacji…"}
              </Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          </View>


          <Text style={styles.versionText}>{getVersionLabel()}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: {
    width: "100%",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginVertical: 24,
    flex: 1,
  },
  logo: {
    width: 200,
    height: 58,
    alignSelf: "center",
    marginBottom: 24,
  },
  card: {
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tc('border', "#232533"),
    padding: 20,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    padding: 4,
    gap: 4,
    marginBottom: 20,
  },
  segmentOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  segmentOptionActive: {
    backgroundColor: "#0D6EFD",
  },
  segmentText: {
    color: tc('muted', "#94A3B8"),
    fontSize: 14,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  cardHeader: {
    alignItems: "center",
    marginBottom: 8,
  },
  cardHeaderIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(13, 110, 253, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  cardTitle: {
    color: tc('text', "#fff"),
    fontSize: 24,
    fontWeight: "bold",
  },
  cardSubtitle: {
    color: tc('muted', "#94A3B8"),
    fontSize: 14,
    marginTop: 4,
  },
  field: {
    marginTop: 12,
  },
  button: {
    marginTop: 20,
    marginBottom: 8,
    width: "100%",
    height: 56,
    justifyContent: "center",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.5)",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    flex: 1,
    color: tc('text', "#fff"),
    fontSize: 14,
    fontWeight: "500",
  },
  updateContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  updateText: {
    color: tc('muted', "#94A3B8"),
    fontSize: 14,
  },
  versionText: {
    color: tc('muted', "#6b7280"),
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 8,
  },
}));

export default SignIn;

