import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import bukowskiLogo from "./bukowski.png";

import CustomButton from "../components/CustomButton";
import ThemeSwitch from "../components/ThemeSwitch";

import { tc, createThemedStyles, useAppTheme, statusBarStyle } from '../context/ThemeContext'; // kolory zależne od motywu
const Welcome = () => {
  const { theme, colors } = useAppTheme(); // przerysowanie ekranu po zmianie motywu
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Image
            source={bukowskiLogo}
            resizeMode="contain"
            style={[styles.logo, theme === 'light' && { tintColor: colors.text }]} // w białym motywie logo czarne
          />
          <CustomButton
            title="Zaloguj się"
            handlePress={() => router.push("/(auth)/sign-in")}
            containerStyles={styles.button}
          />
          {/* Motyw aplikacji (Biały / Szary / Czarny) - domyślnie szary */}
          <ThemeSwitch style={{ marginHorizontal: 0, marginTop: 28, alignSelf: 'stretch' }} />
        </View>
      </ScrollView>
      <StatusBar backgroundColor={tc('bg', "black")} style={statusBarStyle()} />
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tc('bg', "#000"),
  },
  scrollContent: {
    flexGrow: 1,
    height: "100%",
  },
  container: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  logo: {
    width: 190,
    height: 54,
    alignSelf: "center",
  },
  button: {
    width: "100%",
    marginTop: 28,
    height: 64,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
}));

export default Welcome;