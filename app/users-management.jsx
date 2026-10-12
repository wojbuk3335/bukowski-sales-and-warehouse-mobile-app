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

const UsersManagement = () => {
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
        <Text style={styles.label}>Email *</Text>
        <TextInput
          style={styles.input}
          value={formData.email}
          onChangeText={(text) => setFormData({ ...formData, email: text })}
          placeholder="email@example.com"
          placeholderTextColor="#666"
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Symbol *</Text>
        <TextInput
          style={styles.input}
          value={formData.symbol}
          onChangeText={(text) => setFormData({ ...formData, symbol: text })}
          placeholder="Symbol użytkownika"
          placeholderTextColor="#666"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Hasło {!isEditing && '*'}</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            value={formData.password}
            onChangeText={(text) => setFormData({ ...formData, password: text })}
            placeholder={isEditing ? 'Zostaw puste aby nie zmieniać' : 'Minimum 5 znaków'}
            placeholderTextColor="#666"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Potwierdź hasło {!isEditing && '*'}</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            value={formData.confirmPassword}
            onChangeText={(text) => setFormData({ ...formData, confirmPassword: text })}
            placeholder="Powtórz hasło"
            placeholderTextColor="#666"
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={24} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Rola *</Text>
        <View style={styles.roleButtons}>
          {['user', 'admin', 'magazyn', 'dom'].map((role) => (
            <TouchableOpacity
              key={role}
              style={[
                styles.roleButton,
                formData.role === role && styles.roleButtonActive,
              ]}
              onPress={() => setFormData({ ...formData, role })}
            >
              <Text
                style={[
                  styles.roleButtonText,
                  formData.role === role && styles.roleButtonTextActive,
                ]}
              >
                {getRoleName(role)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {(formData.role === 'user' || formData.role === 'magazyn') && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Numer punktu *</Text>
          <TextInput
            style={styles.input}
            value={formData.pointNumber}
            onChangeText={(text) => setFormData({ ...formData, pointNumber: text })}
            placeholder="np. 00, 01, 02..."
            placeholderTextColor="#666"
            keyboardType="numeric"
            maxLength={2}
          />
          <Text style={styles.helpText}>Unikalny dwucyfrowy numer (wymagany do drukowania etykiet)</Text>
        </View>
      )}

      {formData.role === 'user' && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Punkt sprzedaży *</Text>
          <TextInput
            style={styles.input}
            value={formData.sellingPoint}
            onChangeText={(text) => setFormData({ ...formData, sellingPoint: text })}
            placeholder="Punkt sprzedaży"
            placeholderTextColor="#666"
          />
        </View>
      )}

      {(formData.role === 'user' || formData.role === 'magazyn') && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Lokalizacja *</Text>
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
        style={styles.submitButton}
        onPress={isEditing ? handleUpdateUser : handleAddUser}
      >
        <Text style={styles.submitButtonText}>
          {isEditing ? 'Zaktualizuj' : 'Dodaj'} użytkownika
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => {
          isEditing ? setIsEditModalVisible(false) : setIsAddModalVisible(false);
          resetForm();
          setEditingUser(null);
        }}
      >
        <Text style={styles.cancelButtonText}>Anuluj</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0d6efd" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Zarządzanie użytkownikami',
          headerStyle: {
            backgroundColor: '#000000',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
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

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {users.map((userItem, index) => (
          <View key={userItem._id} style={styles.userCard}>
            <View style={styles.userCardHeader}>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{userItem.email}</Text>
                <View style={styles.userBadges}>
                  <View style={[styles.badge, styles.roleBadge]}>
                    <Text style={styles.badgeText}>{getRoleName(userItem.role)}</Text>
                  </View>
                  {userItem.symbol && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{userItem.symbol}</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={styles.userNumber}>#{index + 1}</Text>
            </View>

            {(userItem.role === 'user' || userItem.role === 'magazyn') && (
              <View style={styles.userDetails}>
                {userItem.pointNumber && (
                  <View style={styles.detailRow}>
                    <Ionicons name="pricetag" size={16} color="#CDCDE0" />
                    <Text style={styles.detailText}>Punkt nr: {userItem.pointNumber}</Text>
                  </View>
                )}
                {userItem.role === 'user' && userItem.sellingPoint && (
                  <View style={styles.detailRow}>
                    <Ionicons name="storefront" size={16} color="#CDCDE0" />
                    <Text style={styles.detailText}>{userItem.sellingPoint}</Text>
                  </View>
                )}
                {(userItem.role === 'user' || userItem.role === 'magazyn') && userItem.location && (
                  <View style={styles.detailRow}>
                    <Ionicons name="location" size={16} color="#CDCDE0" />
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dodaj użytkownika</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsAddModalVisible(false);
                  resetForm();
                }}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            {renderUserForm(false)}
          </View>
        </View>
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edytuj użytkownika</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsEditModalVisible(false);
                  resetForm();
                  setEditingUser(null);
                }}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            {renderUserForm(true)}
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={isSuccessModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsSuccessModalVisible(false)}
      >
        <View style={styles.notificationOverlay}>
          <View style={[styles.notificationContainer, styles.successContainer]}>
            <View style={styles.notificationIcon}>
              <Ionicons name="checkmark-circle" size={60} color="#28a745" />
            </View>
            <Text style={styles.notificationTitle}>Sukces!</Text>
            <Text style={styles.notificationMessage}>{successMessage}</Text>
            <TouchableOpacity
              style={[styles.notificationButton, styles.successButton]}
              onPress={() => setIsSuccessModalVisible(false)}
            >
              <Text style={styles.notificationButtonText}>OK</Text>
            </TouchableOpacity>
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
        <View style={styles.notificationOverlay}>
          <View style={[styles.notificationContainer, styles.errorContainer]}>
            <View style={styles.notificationIcon}>
              <Ionicons name="close-circle" size={60} color="#dc3545" />
            </View>
            <Text style={styles.notificationTitle}>Błąd!</Text>
            <Text style={styles.notificationMessage}>{errorMessage}</Text>
            <TouchableOpacity
              style={[styles.notificationButton, styles.errorButton]}
              onPress={() => setIsErrorModalVisible(false)}
            >
              <Text style={styles.notificationButtonText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  backButton: {
    marginLeft: 10,
    padding: 5,
  },
  header: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d6efd',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  userCard: {
    backgroundColor: '#1a1a1a',
    margin: 10,
    marginBottom: 5,
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  userCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  userBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadge: {
    backgroundColor: '#0d6efd',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  userNumber: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
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
    color: '#CDCDE0',
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
    padding: 10,
    borderRadius: 8,
    gap: 6,
  },
  editButton: {
    backgroundColor: '#f59e0b',
  },
  deleteButton: {
    backgroundColor: '#dc2626',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#000',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalContent: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#CDCDE0',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  helpText: {
    color: '#888',
    fontSize: 12,
    marginTop: 5,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeIcon: {
    position: 'absolute',
    right: 15,
    top: 15,
  },
  roleButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  roleButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2a2a2a',
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: '#0d6efd',
    borderColor: '#0d6efd',
  },
  roleButtonText: {
    color: '#CDCDE0',
    fontSize: 14,
    fontWeight: '600',
  },
  roleButtonTextActive: {
    color: '#fff',
  },
  locationPicker: {
    maxHeight: 150,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  locationOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  locationOptionSelected: {
    backgroundColor: '#0d6efd',
  },
  locationOptionText: {
    color: '#CDCDE0',
    fontSize: 14,
  },
  locationOptionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#0d6efd',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
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
  notificationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notificationContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 30,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 2,
  },
  successContainer: {
    borderColor: '#28a745',
  },
  errorContainer: {
    borderColor: '#dc3545',
  },
  notificationIcon: {
    marginBottom: 20,
  },
  notificationTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  notificationMessage: {
    color: '#CDCDE0',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 22,
  },
  notificationButton: {
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 120,
  },
  successButton: {
    backgroundColor: '#28a745',
  },
  errorButton: {
    backgroundColor: '#dc3545',
  },
  notificationButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default UsersManagement;
