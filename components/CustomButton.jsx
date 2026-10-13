import { StyleSheet, Text, TouchableOpacity } from "react-native";

import { createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
const CustomButton = ({
  title,
  handlePress,
  containerStyles,
  textStyles,
  isLoading,
}) => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={[
        styles.button,
        containerStyles,
        isLoading && styles.disabled,
      ]}
      disabled={isLoading}
    >
      <Text style={[styles.text, textStyles]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  button: {
    backgroundColor: "#0D6EFD",
    borderRadius: 12,
    minHeight: 54,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: "700",
    fontSize: 18,
    color: "#ffffff",
  },
}));

export default CustomButton;
