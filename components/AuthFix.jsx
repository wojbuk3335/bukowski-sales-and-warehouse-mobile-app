// Simple auth fix - clear all tokens and force re-login
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { appAlert } from '../services/appAlert';

const AuthFix = () => {
    const clearAllAuthData = async () => {
        try {
            // Clear ALL possible auth keys
            const keysToRemove = [
                'accessToken',
                'refreshToken', 
                'BukowskiAccessToken',
                'BukowskiRefreshToken',
                'BukowskiTokenExpiry',
                'user',
                'AdminToken'
            ];
            
            await AsyncStorage.multiRemove(keysToRemove);
            
            appAlert(
                'Tokens Cleared', 
                'All authentication data cleared. Please login again.',
                [
                    {
                        text: 'Go to Login',
                        onPress: () => {
                            // Navigate to login screen
                            router.replace('/(auth)/sign-in');
                        }
                    }
                ]
            );
            
        } catch (error) {
            appAlert('Error', 'Failed to clear tokens: ' + error.message);
        }
    };

    // Auto-clear on component mount
    useEffect(() => {
        clearAllAuthData();
    }, []);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>🔧 Authentication Fix</Text>
            <Text style={styles.subtitle}>
                The app has authentication issues.{'\n'}
                Clearing all tokens and forcing re-login.
            </Text>
            
            <TouchableOpacity style={styles.button} onPress={clearAllAuthData}>
                <Text style={styles.buttonText}>Clear Tokens & Login</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#f5f5f5',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        marginBottom: 30,
        textAlign: 'center',
        color: '#666',
        lineHeight: 24,
    },
    button: {
        backgroundColor: '#007AFF',
        padding: 15,
        borderRadius: 10,
        minWidth: 200,
    },
    buttonText: {
        color: 'white',
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default AuthFix;