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
    backgroundColor: "#0d6efd",
    borderRadius: 16,
    minHeight: 62,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: "600",
    fontSize: 22, // increased font size for bigger button text
    color: "#ffffff",
  },
}));

export default CustomButton;
