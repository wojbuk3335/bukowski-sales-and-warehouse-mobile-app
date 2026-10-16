import React, { useState, useContext } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import axios from 'axios';
import { GlobalStateContext } from '../context/GlobalState';
import { getApiUrl } from '../config/api';
import tokenService from '../services/tokenService';
import { KeyboardSafeScreen } from '../components/KeyboardSafe'; // klawiatura nie zasłania pola

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
const ChangePassword = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const { user } = useContext(GlobalStateContext);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });
  const [successModal, setSuccessModal] = useState(false);

  const validatePassword = (password) => {
    if (password.length < 8) {
      return 'Hasło musi mieć co najmniej 8 znaków';
    }
    if (!/(?=.*[a-z])/.test(password)) {
      return 'Hasło musi zawierać małą literę';
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      return 'Hasło musi zawierać wielką literę';
    }
    if (!/(?=.*\d)/.test(password)) {
      return 'Hasło musi zawierać cyfrę';
    }
    if (!/(?=.*[@$!%*?&])/.test(password)) {
      return 'Hasło musi zawierać znak specjalny (@$!%*?&)';
    }
    return null;
  };

  const handleChangePassword = async () => {
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorModal({ visible: true, message: 'Wypełnij wszystkie pola' });
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setErrorModal({ visible: true, message: passwordError });
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorModal({ visible: true, message: 'Nowe hasła nie są identyczne' });
      return;
    }

    if (currentPassword === newPassword) {
      setErrorModal({ visible: true, message: 'Nowe hasło musi być inne niż obecne' });
      return;
    }

    setLoading(true);

    try {
      // Use userId from login response (API returns userId, not _id)
      const userId = user.userId || user._id;
      
      if (!userId) {
        setErrorModal({ visible: true, message: 'Brak identyfikatora użytkownika. Zaloguj się ponownie.' });
        setLoading(false);
        return;
      }

      // Get access token from tokenService
      const { accessToken } = await tokenService.getTokens();
      
      if (!accessToken) {
        setErrorModal({ visible: true, message: 'Brak tokena autoryzacji. Zaloguj się ponownie.' });
        setLoading(false);
        return;
      }

      // Backend requires all user fields due to signupValidation
      const response = await axios.put(
        getApiUrl(`/user/${userId}`),
        {
          email: user.email,
          symbol: user.symbol,
          role: user.role,
          sellingPoint: user.sellingPoint || '',
          location: user.location || '',
          currentPassword,
          password: newPassword,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'transaction-id': Date.now().toString(),
          },
        }
      );

      if (response.status === 200) {
        setSuccessModal(true);
      }
    } catch (error) {
      console.error('Change password error:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      let errorMessage = 'Nie udało się zmienić hasła';
      
      if (error.response) {
        if (error.response.status === 401) {
          // Check if it's wrong password or auth issue
          if (error.response.data?.message?.toLowerCase().includes('password')) {
            errorMessage = 'Obecne hasło jest nieprawidłowe';
          } else {
            errorMessage = 'Problem z autoryzacją. Zaloguj się ponownie.';
          }
        } else if (error.response.status === 400) {
          errorMessage = error.response.data?.message || 'Nieprawidłowe dane. Sprawdź wymagania hasła.';
        } else if (error.response.data?.message) {
          errorMessage = error.response.data.message;
        }
      } else if (error.request) {
        errorMessage = 'Brak połączenia z serwerem';
      }

      setErrorModal({ visible: true, message: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Zmiana hasła',
          headerStyle: {
            backgroundColor: tc('bg', '#000000'),
          },
          headerTintColor: tc('text', '#fff'),
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color={tc('text', "#fff")} />
            </TouchableOpacity>
          ),
        }}
      />

      <KeyboardSafeScreen>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.content}>
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={24} color="#0d6efd" />
            <Text style={styles.infoText}>
              Hasło musi zawierać: minimum 8 znaków, małą i wielką literę, cyfrę oraz znak specjalny (@$!%*?&)
            </Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Obecne hasło</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry={!showCurrentPassword}
                placeholder="Wpisz obecne hasło"
                placeholderTextColor={tc('muted', "#666")}
                autoCapitalize="none"
                autoComplete="password"
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                <Ionicons
                  name={showCurrentPassword ? 'eye-off' : 'eye'}
                  size={24}
                  color={tc('muted', "#666")}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Nowe hasło</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNewPassword}
                placeholder="Wpisz nowe hasło"
                placeholderTextColor={tc('muted', "#666")}
                autoCapitalize="none"
                autoComplete="password"
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowNewPassword(!showNewPassword)}
              >
                <Ionicons
                  name={showNewPassword ? 'eye-off' : 'eye'}
                  size={24}
                  color={tc('muted', "#666")}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Potwierdź nowe hasło</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                placeholder="Wpisz ponownie nowe hasło"
                placeholderTextColor={tc('muted', "#666")}
                autoCapitalize="none"
                autoComplete="password"
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off' : 'eye'}
                  size={24}
                  color={tc('muted', "#666")}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleChangePassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.buttonText}>Zmień hasło</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Anuluj</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardSafeScreen>

      {/* Error Modal */}
      <Modal
        visible={errorModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setErrorModal({ visible: false, message: '' })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Ionicons name="close-circle" size={50} color="#dc2626" />
            </View>
            <Text style={styles.modalTitle}>Błąd</Text>
            <Text style={styles.modalMessage}>{errorModal.message}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setErrorModal({ visible: false, message: '' })}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={successModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setSuccessModal(false);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          router.back();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Ionicons name="checkmark-circle" size={50} color="#10b981" />
            </View>
            <Text style={styles.modalTitle}>Sukces</Text>
            <Text style={styles.modalMessage}>Hasło zostało pomyślnie zmienione</Text>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonSuccess]}
              onPress={() => {
                setSuccessModal(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                router.back();
              }}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc('bg', '#000000'),
  },
  backButton: {
    marginLeft: 10,
    padding: 5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  content: {
    flex: 1,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tc('surface', '#1a1a1a'),
    padding: 15,
    borderRadius: 10,
    marginBottom: 30,
    borderLeftWidth: 4,
    borderLeftColor: '#0d6efd',
  },
  infoText: {
    color: tc('muted', '#CDCDE0'),
    fontSize: 14,
    marginLeft: 10,
    flex: 1,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    color: tc('muted', '#CDCDE0'),
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputContainer: {
    position: 'relative',
  },
  input: {
    backgroundColor: tc('surface', '#1a1a1a'),
    color: tc('text', '#fff'),
    borderRadius: 10,
    padding: 15,
    paddingRight: 50,
    fontSize: 16,
    borderWidth: 1,
    borderColor: tc('border', '#2a2a2a'),
  },
  eyeIcon: {
    position: 'absolute',
    right: 15,
    top: 15,
  },
  button: {
    backgroundColor: '#0d6efd',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    borderRadius: 10,
    marginTop: 20,
    gap: 10,
  },
  buttonDisabled: {
    backgroundColor: '#0a4db3',
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  cancelButtonText: {
    color: '#CDCDE0',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: tc('surface', '#1a1a1a'),
    borderRadius: 20,
    padding: 30,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tc('border', '#2a2a2a'),
  },
  modalHeader: {
    marginBottom: 20,
  },
  modalTitle: {
    color: tc('text', '#fff'),
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  modalMessage: {
    color: tc('muted', '#CDCDE0'),
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 24,
  },
  modalButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonSuccess: {
    backgroundColor: '#10b981',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
}));

export default ChangePassword;
