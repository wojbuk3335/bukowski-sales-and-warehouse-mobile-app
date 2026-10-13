import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
export default function NotFoundScreen() {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Not Found</Text>
    </View>
  );
}

const styles = createThemedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc('bg', "#000"),
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    color: tc('text', "#fff"),
    fontSize: 22,
    fontWeight: "600",
  },
}));
