import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CustomButton from "../../components/CustomButton";
import { AuthContext } from "../../context/AuthContext";
import { GlobalStateContext } from "../../context/GlobalState";
import { getApiUrl } from "../../config/api";
import tokenService from "../../services/tokenService";

const TwoFactorScreen = () => {
  const params = useLocalSearchParams();
  const { userId, email, step = "2fa_verification" } = params || {};
  // Cały kod w jednym polu tekstowym - wklejenie trafia w całości do jednego pola,
  // bez przeskakiwania fokusu między okienkami (to powodowało nadpisywanie cyfr).
  const [code, setCode] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [setupOtpAuthUrl, setSetupOtpAuthUrl] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const submittingRef = useRef(false); // blokada podwójnego wysłania (auto-submit + przycisk)

  const { setUser, setIsLoggedIn } = useContext(GlobalStateContext);
  const authContext = useContext(AuthContext);

  useEffect(() => {
    const loadSetup = async () => {
      if (step !== "2fa_setup" || !userId) return;
      try {
        const response = await fetch(getApiUrl("/user/2fa/setup"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });

        const data = await response.json();
        if (!response.ok || !data?.success) {
          setError(data?.message || "Błąd inicjalizacji 2FA");
          return;
        }

        setSetupSecret(data.secret || "");
        setSetupOtpAuthUrl(data.otpauthUrl || "");
      } catch {
        setError("Błąd podczas inicjalizacji 2FA");
      }
    };

    loadSetup();
  }, [step, userId]);

  // `codeArg` podawany przy auto-submicie po wklejeniu (stan jeszcze się nie odświeżył);
  // przy kliknięciu przycisku CustomButton może przekazać zdarzenie - wtedy bierzemy stan
  const handleSubmit = async (codeArg) => {
    if (submittingRef.current) return;
    const codeValue = typeof codeArg === "string" ? codeArg : code;
    if (!codeValue || codeValue.length !== 6) {
      setError("Wprowadź 6-cyfrowy kod weryfikacyjny");
      return;
    }

    if (!userId) {
      setError("Brak danych użytkownika do weryfikacji");
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError("");

    try {
      const endpoint = step === "2fa_setup" ? "/user/2fa/confirm" : "/user/verify-2fa";
      const response = await fetch(getApiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          verificationCode: codeValue,
          rememberMe: false,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        setError(data?.message || "Niepoprawny kod weryfikacyjny");
        setCode(""); // czyste pole na kolejną próbę/wklejenie
        return;
      }

      const accessToken = data.accessToken || data.token;
      if (accessToken) {
        await tokenService.setTokens(accessToken, data.refreshToken);
      }

      await AsyncStorage.setItem("user", JSON.stringify(data));
      setUser(data);
      setIsLoggedIn(true);
      if (authContext?.login) {
        authContext.login(data);
      }

      if (data?.recoveryCodes?.length) {
        setRecoveryCodes(data.recoveryCodes);
        return;
      }

      router.replace("/(admin-tabs)/dashboard");
    } catch {
      setError("Wystąpił błąd podczas weryfikacji. Spróbuj ponownie.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleOpenAuthenticator = async () => {
    if (!setupOtpAuthUrl) return;
    try {
      await Linking.openURL(setupOtpAuthUrl);
    } catch {
      setError("Nie udało się otworzyć Authenticatora");
    }
  };

  const handleBack = () => {
    router.replace("/(auth)/sign-in");
  };

  const handleCodeChange = (value) => {
    const allDigits = value.replace(/\D/g, "");
    // Wklejenie do niepustego pola dokleja nowy kod na koniec (kursor zawsze na końcu),
    // np. "123456" + "105650" - wtedy liczy się ostatnie 6 cyfr, czyli nowo wklejony kod
    const digits = allDigits.length > 6 ? allDigits.slice(-6) : allDigits;
    const addedAtOnce = allDigits.length - code.length;
    setCode(digits);
    if (error) setError("");

    // Wklejony kompletny kod - wyślij od razu (jak w wersji webowej).
    // Przy wpisywaniu cyfra po cyfrze użytkownik klika "Zweryfikuj kod".
    if (digits.length === 6 && addedAtOnce > 1 && !(step === "2fa_setup" && !setupSecret)) {
      inputRef.current?.blur();
      handleSubmit(digits);
    }
  };


  return (
    <SafeAreaView style={{ backgroundColor: "#000", flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Weryfikacja dwuetapowa</Text>
        <Text style={styles.subtitle}>
          Użyj aplikacji Google Authenticator i wpisz 6-cyfrowy kod.
        </Text>

        {step === "2fa_setup" && (
          <View style={styles.setupBlock}>
            <Text style={styles.label}>Dodaj konto w Authenticatorze jako:</Text>
            <Text style={styles.value}>{email || ""}</Text>

            {setupOtpAuthUrl ? (
              <View style={styles.qrWrap}>
                <Text style={styles.qrHint}>Otworz link w Authenticatorze</Text>
              </View>
            ) : null}

            {setupSecret ? (
              <Text style={styles.manualKey}>Klucz ręczny: {setupSecret}</Text>
            ) : null}

            {setupOtpAuthUrl ? (
              <CustomButton
                title="Otwórz w Authenticatorze"
                handlePress={handleOpenAuthenticator}
                containerStyles={styles.secondaryButton}
                textStyles={styles.secondaryButtonText}
              />
            ) : null}
          </View>
        )}

        <Text style={styles.tileLabel}>Kod weryfikacyjny</Text>
        {/* Jedno zwykłe pole na cały kod: wklejanie (przytrzymaj -> Wklej) działa natywnie,
            bez przeskakiwania fokusu między sześcioma okienkami */}
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={handleCodeChange}
          keyboardType="number-pad"
          autoFocus
          autoComplete="off"
          importantForAutofill="no"
          placeholder="000000"
          placeholderTextColor="#4b5563"
          selectionColor="#0d6efd"
          textAlign="center"
          style={styles.codeInput}
          testID="otp-input"
        />

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <CustomButton
          title={loading ? "Weryfikacja..." : "Zweryfikuj kod"}
          handlePress={handleSubmit}
          containerStyles={styles.button}
          isLoading={loading}
        />


        <CustomButton
          title="Powrót do logowania"
          handlePress={handleBack}
          containerStyles={styles.secondaryButton}
          textStyles={styles.secondaryButtonText}
        />

        {recoveryCodes.length > 0 && (
          <View style={styles.recoveryBox}>
            <Text style={styles.recoveryTitle}>Zapisz kody zapasowe:</Text>
            <View style={styles.recoveryList}>
              {recoveryCodes.map((code) => (
                <Text key={code} style={styles.recoveryCode}>{code}</Text>
              ))}
            </View>
            <CustomButton
              title="Przejdź do panelu"
              handlePress={() => router.replace("/(admin-tabs)/dashboard")}
              containerStyles={styles.button}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: "#9ca3af",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  setupBlock: {
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  label: {
    color: "#9ca3af",
    fontSize: 13,
    textAlign: "center",
  },
  value: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },
  qrWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  qrHint: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 8,
  },
  tileLabel: {
    color: "#f3f4f6",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 6,
  },
  codeInput: {
    height: 64,
    borderRadius: 12,
    backgroundColor: "#18181b",
    borderWidth: 2,
    borderColor: "#0d6efd",
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 10,
    marginBottom: 8,
  },
  manualKey: {
    color: "#e5e7eb",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 12,
  },
  inputSpacing: {
    marginTop: 8,
  },
  button: {
    marginTop: 12,
  },
  secondaryButton: {
    marginTop: 12,
    backgroundColor: "#1f2937",
  },
  secondaryButtonText: {
    color: "#e5e7eb",
    fontSize: 16,
  },
  errorContainer: {
    backgroundColor: "#dc2626",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  errorText: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
    fontWeight: "500",
  },
  recoveryBox: {
    marginTop: 20,
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 16,
  },
  recoveryTitle: {
    color: "#f9fafb",
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 10,
  },
  recoveryList: {
    alignItems: "center",
    marginBottom: 12,
  },
  recoveryCode: {
    color: "#fff",
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 4,
  },
});

export default TwoFactorScreen;
