import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { icons } from "../constants";

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
const FormField = ({
  title,
  value,
  placeholder,
  handleChangeText,
  otherStyles,
  secureTextEntry,
  ...props
}) => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.fieldContainer, otherStyles]}>
      <Text style={styles.label}>{title}</Text>

      <View
        style={[
          styles.inputWrapper,
          { borderColor: isFocused ? "#0d6efd" : tc('border', "#000000") },
        ]}
      >
        <TextInput
          style={styles.input}
          value={value}
          placeholder={placeholder}
          placeholderTextColor="#0d6efd"
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
          secureTextEntry={secureTextEntry ? !showPassword : false}
          testID="text-input"
        />

        {secureTextEntry && (
          <Pressable 
            onPress={() => setShowPassword(!showPassword)}
            style={({ pressed }) => [
              styles.iconTouchable,
              { opacity: pressed ? 0.7 : 1 }
            ]}
            testID="password-toggle-button"
          >
            <Image
              source={!showPassword ? icons.eye : icons.eyeHide}
              style={styles.icon}
              resizeMode="contain"
              testID="eye-icon"
            />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  fieldContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    color: tc('text', "#f3f4f6"),
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 8,
  },
  inputWrapper: {
    width: "100%",
    height: 64,
    paddingHorizontal: 16,
    backgroundColor: tc('surface', "#18181b"),
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    color: tc('text', "#fff"),
    fontWeight: "600",
    fontSize: 16,
  },
  icon: {
    width: 24,
    height: 24,
  },
  iconTouchable: {
    padding: 12,
    marginRight: -12,
    justifyContent: 'center',
    alignItems: 'center',
  },
}));

export default FormField;
