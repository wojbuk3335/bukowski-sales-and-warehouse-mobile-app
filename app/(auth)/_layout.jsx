import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { statusBarStyle, tc, useAppTheme } from "../../context/ThemeContext"; // kolory zależne od motywu

const AuthLayout = () => {
  useAppTheme(); // przerysowanie po zmianie motywu

  return (
    <>
      {/* Add a View to set the status bar background color */}
      <View style={{ height: 32, backgroundColor: tc('bg', "#161622") }} />
      <Stack options={{ headerShown: false }}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ headerShown: false }} />
        <Stack.Screen name="two-factor" options={{ headerShown: false }} />
      </Stack>

      <StatusBar style={statusBarStyle()} />
    </>
  );
};

export default AuthLayout;
