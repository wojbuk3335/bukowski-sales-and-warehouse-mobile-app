import React, { useState, useEffect, useContext } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import axios from 'axios';
import { GlobalStateContext } from '../context/GlobalState';
import { getApiUrl } from '../config/api';
import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { PageHeader, ModalHeader, OptionCard, PointPill, pointColorMap, look } from '../components/AdminLook'; // wspólny wygląd (styl panelu admina)
import { KeyboardSafeOverlay } from "../components/KeyboardSafe"; // klawiatura nie zasłania pola

// Kolor i ikona roli (tylko wygląd: pasek karty, plakietka, karta wyboru roli)
const ROLE_LOOK = {
  user: { color: '#0D6EFD', icon: 'storefront' },
  admin: { color: '#8B5CF6', icon: 'shield-checkmark' },
  magazyn: { color: '#F59E0B', icon: 'cube' },
  dom: { color: '#10B981', icon: 'home' },
};
const roleLook = (role) => ROLE_LOOK[role] || ROLE_LOOK.user;
const UsersManagement = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const { user } = useContext(GlobalStateContext);
  const [users, setUsers] = useState([]);
  const [localizations, setLocalizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Modal states
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isErrorModalVisible, setIsErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Form states
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    symbol: '',
    role: 'user',
    sellingPoint: '',
    location: '',
    pointNumber: '',
  });
  
  const [editingUser, setEditingUser] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchUsers(), fetchLocalizations()]);
    } catch (error) {
      console.error('Error loading data:', error);
      showError('Nie udało się załadować danych');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const fetchUsers = async () => {
    try {
      const { accessToken } = await tokenService.getTokens();
      const response = await axios.get(getApiUrl('/user'), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      setUsers(response.data.users);
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  };

  const fetchLocalizations = async () => {
    try {
      const { accessToken } = await tokenService.getTokens();
      const response = await axios.get(getApiUrl('/excel/localization/get-all-localizations'), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const localizationsWithDescription = response.data.localizations.filter(
        (loc) => loc.Miejsc_1_Opis_1 && loc.Miejsc_1_Opis_1.trim() !== ''
      );
      setLocalizations(localizationsWithDescription);
    } catch (error) {
      console.error('Error fetching localizations:', error);
      // Ustaw pustą tablicę jeśli nie udało się pobrać lokalizacji
      setLocalizations([]);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      confirmPassword: '',
      symbol: '',
      role: 'user',
      sellingPoint: '',
      location: '',
      pointNumber: '',
    });
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const showError = (message) => {
    setErrorMessage(message);
    setIsErrorModalVisible(true);
  };

  const validateForm = (isEditing = false) => {
    if (!formData.email || !formData.symbol) {
      showError('Email i symbol są wymagane');
      return false;
    }

    if (!isEditing && !formData.password) {
      showError('Hasło jest wymagane');
      return false;
    }

    if (formData.password && formData.password.length < 5) {
      showError('Hasło musi mieć co najmniej 5 znaków');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      showError('Hasła nie są identyczne');
      return false;
    }

    if (formData.role === 'user') {
      if (!formData.sellingPoint) {
        showError('Użytkownik musi mieć punkt sprzedaży');
        return false;
      }
    }
    
    // Walidacja lokalizacji dla user i magazyn
    if (formData.role === 'user' || formData.role === 'magazyn') {
      if (!formData.location) {
        showError('Lokalizacja jest wymagana');
        return false;
      }
    }

    // Walidacja numeru punktu dla user i magazyn
    if (formData.role === 'user' || formData.role === 'magazyn') {
      if (!formData.pointNumber || formData.pointNumber.trim() === '') {
        showError('Numer punktu jest wymagany (00-99)');
        return false;
      }
      if (!/^\d{2}$/.test(formData.pointNumber)) {
        showError('Numer punktu musi być dwucyfrowy (00-99)');
        return false;
      }
      const pointNumberExists = users.some(
        (u) =>
          u.pointNumber &&
          u.pointNumber === formData.pointNumber &&
          (!isEditing || u._id !== editingUser?._id)
      );
      if (pointNumberExists) {
        showError(`Numer punktu ${formData.pointNumber} jest już zajęty`);
        return false;
      }
    }

    // Check duplicates
    const emailExists = users.some(
      (u) =>
        u.email.toLowerCase() === formData.email.toLowerCase() &&
        (!isEditing || u._id !== editingUser?._id)
    );
    if (emailExists) {
      showError('Użytkownik z tym emailem już istnieje');
      return false;
    }

    const symbolExists = users.some(
      (u) =>
        u.symbol.toLowerCase() === formData.symbol.toLowerCase() &&
        (!isEditing || u._id !== editingUser?._id)
    );
    if (symbolExists) {
      showError('Użytkownik z tym symbolem już istnieje');
      return false;
    }

    if (formData.role === 'user') {
      const sellingPointExists = users.some(
        (u) =>
          u.sellingPoint &&
          formData.sellingPoint &&
          u.sellingPoint.toLowerCase() === formData.sellingPoint.toLowerCase() &&
          (!isEditing || u._id !== editingUser?._id)
      );
      if (sellingPointExists) {
        showError('Użytkownik z tym punktem sprzedaży już istnieje');
        return false;
      }
    }

    return true;
  };

  const handleAddUser = async () => {
    if (!validateForm()) return;

    try {
      const payload = {
        ...formData,
        sellingPoint: formData.role === 'user' ? formData.sellingPoint : '',
        location: formData.role === 'user' ? formData.location : '',
        userLoggedInId: user.email,
      };
      delete payload.confirmPassword;

      const { accessToken } = await tokenService.getTokens();
      await axios.post(getApiUrl('/user/signup'), payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'transaction-id': Date.now().toString(),
        },
      });

      setSuccessMessage('Użytkownik został dodany pomyślnie');
      setIsSuccessModalVisible(true);
      setIsAddModalVisible(false);
      resetForm();
      await fetchUsers();
    } catch (error) {
      console.error('Error adding user:', error);
      setErrorMessage(error.response?.data?.message || 'Nie udało się dodać użytkownika');
      setIsErrorModalVisible(true);
    }
  };

  const handleEditUser = (userToEdit) => {
    setEditingUser(userToEdit);
    setFormData({
      email: userToEdit.email,
      password: '',
      confirmPassword: '',
      symbol: userToEdit.symbol,
      role: userToEdit.role,
      sellingPoint: userToEdit.sellingPoint || '',
      location: userToEdit.location || '',
      pointNumber: userToEdit.pointNumber || '',
    });
    setIsEditModalVisible(true);
  };

  const handleUpdateUser = async () => {
    if (!validateForm(true)) return;

    // Check if changing last admin
    if (editingUser.role === 'admin' && formData.role !== 'admin') {
      const adminCount = users.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) {
        showError('Nie można zmienić ostatniego administratora na użytkownika');
        return;
      }
    }

    try {
      const payload = {
        ...formData,
        sellingPoint: formData.role === 'user' ? formData.sellingPoint : '',
        location: formData.role === 'user' ? formData.location : '',
      };
      delete payload.confirmPassword;
      if (!payload.password) delete payload.password;

      const { accessToken } = await tokenService.getTokens();
      await axios.put(getApiUrl(`/user/${editingUser._id}`), payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'transaction-id': Date.now().toString(),
        },
      });

      setSuccessMessage('Użytkownik został zaktualizowany pomyślnie');
      setIsSuccessModalVisible(true);
      setIsEditModalVisible(false);
      resetForm();
      setEditingUser(null);
      await fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      setErrorMessage(error.response?.data?.message || 'Nie udało się zaktualizować użytkownika');
      setIsErrorModalVisible(true);
    }
  };

  const handleDeleteUser = (userId) => {
    const userToDelete = users.find((u) => u._id === userId);
    
    if (userToDelete.role === 'admin') {
      const adminCount = users.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) {
        showError('Nie można usunąć ostatniego administratora');
        return;
      }
    }

    appAlert(
      'Potwierdź usunięcie',
      `Czy na pewno chcesz usunąć użytkownika ${userToDelete.email}?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              const { accessToken } = await tokenService.getTokens();
              await axios.delete(getApiUrl(`/user/${userId}`), {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'transaction-id': Date.now().toString(),
                },
              });
              setSuccessMessage('Użytkownik został usunięty');
              setIsSuccessModalVisible(true);
              await fetchUsers();
            } catch (error) {
              console.error('Error deleting user:', error);
              setErrorMessage('Nie udało się usunąć użytkownika');
              setIsErrorModalVisible(true);
            }
          },
        },
      ]
    );
  };

  const getRoleName = (role) => {
    switch (role) {
      case 'admin':
        return 'Administrator';
      case 'magazyn':
        return 'Magazyn';
      case 'dom':
        return 'Dom';
      default:
        return 'Użytkownik';
    }
  };

  const renderUserForm = (isEditing = false) => (
    <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
      <View style={styles.formGroup}>
        <Text style={look.formLabel}>Email *</Text>
        <TextInput
          style={look.formInput}
          value={formData.email}
          onChangeText={(text) => setFormData({ ...formData, email: text })}
          placeholder="email@example.com"
          placeholderTextColor={tc('muted', "#666")}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={look.formLabel}>Symbol *</Text>
        <TextInput
          style={look.formInput}
          value={formData.symbol}
          onChangeText={(text) => setFormData({ ...formData, symbol: text })}
          placeholder="Symbol użytkownika"
          placeholderTextColor={tc('muted', "#666")}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={look.formLabel}>Hasło {!isEditing && '*'}</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[look.formInput, styles.passwordInput]}
            value={formData.password}
            onChangeText={(text) => setFormData({ ...formData, password: text })}
            placeholder={isEditing ? 'Zostaw puste aby nie zmieniać' : 'Minimum 5 znaków'}
            placeholderTextColor={tc('muted', "#666")}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color={tc('muted', "#666")} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={look.formLabel}>Potwierdź hasło {!isEditing && '*'}</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[look.formInput, styles.passwordInput]}
            value={formData.confirmPassword}
            onChangeText={(text) => setFormData({ ...formData, confirmPassword: text })}
            placeholder="Powtórz hasło"
            placeholderTextColor={tc('muted', "#666")}
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={24} color={tc('muted', "#666")} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={look.formLabel}>Rola *</Text>
        <View>
          {['user', 'admin', 'magazyn', 'dom'].map((role) => (
            <OptionCard
              key={role}
              selected={formData.role === role}
              icon={roleLook(role).icon}
              color={roleLook(role).color}
              label={getRoleName(role)}
              onPress={() => setFormData({ ...formData, role })}
            />
          ))}
        </View>
      </View>

      {(formData.role === 'user' || formData.role === 'magazyn') && (
        <View style={styles.formGroup}>
          <Text style={look.formLabel}>Numer punktu *</Text>
          <TextInput
            style={look.formInput}
            value={formData.pointNumber}
            onChangeText={(text) => setFormData({ ...formData, pointNumber: text })}
            placeholder="np. 00, 01, 02..."
            placeholderTextColor={tc('muted', "#666")}
            keyboardType="numeric"
            maxLength={2}
          />
          <Text style={styles.helpText}>Unikalny dwucyfrowy numer (wymagany do drukowania etykiet)</Text>
        </View>
      )}

      {formData.role === 'user' && (
        <View style={styles.formGroup}>
          <Text style={look.formLabel}>Punkt sprzedaży *</Text>
          <TextInput
            style={look.formInput}
            value={formData.sellingPoint}
            onChangeText={(text) => setFormData({ ...formData, sellingPoint: text })}
            placeholder="Punkt sprzedaży"
            placeholderTextColor={tc('muted', "#666")}
          />
        </View>
      )}

      {(formData.role === 'user' || formData.role === 'magazyn') && (
        <View style={styles.formGroup}>
          <Text style={look.formLabel}>Lokalizacja *</Text>
          <ScrollView style={styles.locationPicker} nestedScrollEnabled>
            <TouchableOpacity
              style={[
                styles.locationOption,
                !formData.location && styles.locationOptionSelected,
              ]}
              onPress={() => setFormData({ ...formData, location: '' })}
            >
              <Text
                style={[
                  styles.locationOptionText,
                  !formData.location && styles.locationOptionTextSelected,
                ]}
              >
                Wybierz lokalizację
              </Text>
            </TouchableOpacity>
            {localizations.map((loc) => (
              <TouchableOpacity
                key={loc._id}
                style={[
                  styles.locationOption,
                  formData.location === loc.Miejsc_1_Opis_1 &&
                    styles.locationOptionSelected,
                ]}
                onPress={() =>
                  setFormData({ ...formData, location: loc.Miejsc_1_Opis_1 })
                }
              >
                <Text
                  style={[
                    styles.locationOptionText,
                    formData.location === loc.Miejsc_1_Opis_1 &&
                      styles.locationOptionTextSelected,
                  ]}
                >
                  {loc.Miejsc_1_Opis_1}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <TouchableOpacity
        style={[look.primaryButton, styles.fullButton]}
        onPress={isEditing ? handleUpdateUser : handleAddUser}
      >
        <Text style={look.buttonText}>
          {isEditing ? 'Zaktualizuj' : 'Dodaj'} użytkownika
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[look.neutralButton, styles.fullButton]}
        onPress={() => {
          isEditing ? setIsEditModalVisible(false) : setIsAddModalVisible(false);
          resetForm();
          setEditingUser(null);
        }}
      >
        <Text style={look.neutralButtonText}>Anuluj</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // kolor plakietki punktu (symbolu) - różny dla każdego punktu z listy
  const pointColorFor = pointColorMap(users.map((u) => u.symbol));

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0d6efd" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <PageHeader
        title="Zarządzanie użytkownikami"
        icon="people"
        onBack={() => router.back()}
      />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            resetForm();
            setIsAddModalVisible(true);
          }}
        >
          <Ionicons name="person-add" size={20} color="#fff" />
          <Text style={styles.addButtonText}>Dodaj użytkownika</Text>
        </TouchableOpacity>
      </View>

      <ScrollView alwaysBounceVertical
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {users.map((userItem, index) => (
          <View key={userItem._id} style={[styles.userCard, { borderLeftColor: roleLook(userItem.role).color }]}>
            <View style={styles.userCardHeader}>
              <View style={[styles.userIcon, { backgroundColor: `${roleLook(userItem.role).color}26` }]}>
                <Ionicons name={roleLook(userItem.role).icon} size={22} color={roleLook(userItem.role).color} />
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{userItem.email}</Text>
                <View style={styles.userBadges}>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: `${roleLook(userItem.role).color}26`,
                        borderColor: `${roleLook(userItem.role).color}80`,
                      },
                    ]}
                  >
                    <Text style={styles.badgeText}>{getRoleName(userItem.role)}</Text>
                  </View>
                  {userItem.symbol && (
                    <PointPill symbol={userItem.symbol} color={pointColorFor(userItem.symbol)} />
                  )}
                </View>
              </View>
              <Text style={styles.userNumber}>#{index + 1}</Text>
            </View>

            {(userItem.role === 'user' || userItem.role === 'magazyn') && (
              <View style={styles.userDetails}>
                {userItem.pointNumber && (
                  <View style={styles.detailRow}>
                    <Ionicons name="pricetag" size={16} color={tc('muted', "#CDCDE0")} />
                    <Text style={styles.detailText}>Punkt nr: {userItem.pointNumber}</Text>
                  </View>
                )}
                {userItem.role === 'user' && userItem.sellingPoint && (
                  <View style={styles.detailRow}>
                    <Ionicons name="storefront" size={16} color={tc('muted', "#CDCDE0")} />
                    <Text style={styles.detailText}>{userItem.sellingPoint}</Text>
                  </View>
                )}
                {(userItem.role === 'user' || userItem.role === 'magazyn') && userItem.location && (
                  <View style={styles.detailRow}>
                    <Ionicons name="location" size={16} color={tc('muted', "#CDCDE0")} />
                    <Text style={styles.detailText}>{userItem.location}</Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.userActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.editButton]}
                onPress={() => handleEditUser(userItem)}
              >
                <Ionicons name="create" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Edytuj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => handleDeleteUser(userItem._id)}
              >
                <Ionicons name="trash" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Usuń</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Add User Modal */}
      <Modal
        visible={isAddModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setIsAddModalVisible(false);
          resetForm();
        }}
      >
        <KeyboardSafeOverlay>
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, styles.modalContainer]}>
            <ModalHeader icon="person-add" color="#0D6EFD" title="Dodaj użytkownika" />
            {renderUserForm(false)}
          </View>
        </View>
        </KeyboardSafeOverlay>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setIsEditModalVisible(false);
          resetForm();
          setEditingUser(null);
        }}
      >
        <KeyboardSafeOverlay>
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, styles.modalContainer]}>
            <ModalHeader icon="create" color="#0D6EFD" title="Edytuj użytkownika" />
            {renderUserForm(true)}
          </View>
        </View>
        </KeyboardSafeOverlay>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={isSuccessModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsSuccessModalVisible(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="checkmark-circle" color="#10B981" title="Sukces!" />
            <Text style={look.modalMessage}>{successMessage}</Text>
            <View style={look.buttonRow}>
              <TouchableOpacity
                style={[look.primaryButton, { backgroundColor: '#10B981' }]}
                onPress={() => setIsSuccessModalVisible(false)}
              >
                <Text style={look.buttonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Error Modal */}
      <Modal
        visible={isErrorModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsErrorModalVisible(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="close-circle" color="#DC3545" title="Błąd!" />
            <Text style={look.modalMessage}>{errorMessage}</Text>
            <View style={look.buttonRow}>
              <TouchableOpacity
                style={[look.primaryButton, { backgroundColor: '#DC3545' }]}
                onPress={() => setIsErrorModalVisible(false)}
              >
                <Text style={look.buttonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('bg', '#000000'),
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D6EFD',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  userCard: {
    backgroundColor: tc('surface', '#161622'),
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    borderLeftWidth: 4,
  },
  userCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  userIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: tc('text', '#fff'),
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  userBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 2,
  },
  badgeText: {
    color: tc('text', '#fff'),
    fontSize: 12,
    fontWeight: '700',
  },
  userNumber: {
    color: tc('muted', '#94A3B8'),
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  userDetails: {
    marginBottom: 12,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    color: tc('muted', '#CDCDE0'),
    fontSize: 14,
  },
  userActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  editButton: {
    backgroundColor: '#0D6EFD',
  },
  deleteButton: {
    backgroundColor: '#DC3545',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  modalContainer: {
    maxHeight: '90%',
  },
  // przewijana treść formularza w okienku
  modalContent: {
    flexGrow: 0,
  },
  formGroup: {
    marginBottom: 16,
  },
  helpText: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    marginTop: 5,
  },
  passwordContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeIcon: {
    position: 'absolute',
    right: 14,
  },
  locationPicker: {
    maxHeight: 170,
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    padding: 4,
  },
  locationOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    marginVertical: 1,
  },
  locationOptionSelected: {
    backgroundColor: '#0D6EFD26',
    borderColor: '#0D6EFD',
  },
  locationOptionText: {
    color: tc('text', '#fff'),
    fontSize: 15,
  },
  locationOptionTextSelected: {
    fontWeight: '700',
  },
  // przyciski formularza: na całą szerokość, jeden pod drugim
  fullButton: {
    flex: 0,
    marginTop: 10,
  },
}));

export default UsersManagement;
