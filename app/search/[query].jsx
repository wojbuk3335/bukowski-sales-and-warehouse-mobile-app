import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu
const Query = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
    return (
        <View style={styles.container}>
            <Text>Query</Text>
        </View>
    );
};

const styles = createThemedStyles(() => StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
}));

export default Query;