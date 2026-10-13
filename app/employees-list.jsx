import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import tokenService from "../services/tokenService";
import { getApiUrl } from "../config/api";

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
const EmployeesList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets();
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  
  // Form states
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [salesCommission, setSalesCommission] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetchEmployees();
    fetchLocations();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const url = getApiUrl("/employees");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        setEmployees(data.employees || []);
      }
    } catch (error) {
      setErrorMessage("Nie udało się pobrać listy pracowników");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const url = getApiUrl("/excel/localization/get-all-localizations");
      const response = await tokenService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const localizationsWithDescription = (data.localizations || []).filter(
          loc => loc.Miejsc_1_Opis_1 && loc.Miejsc_1_Opis_1.trim() !== ""
        );
        const locationNames = localizationsWithDescription.map(loc => loc.Miejsc_1_Opis_1);
        setLocations(locationNames);
      }
    } catch (error) {
      // Default locations if fetch fails
      setLocations(['Warszawa', 'Kraków', 'Gdańsk']);
    }
  };

  const handleAddEmployee = () => {
    setIsEditing(false);
    setEditingEmployee(null);
    setFirstName("");
    setLastName("");
    setHourlyRate("");
    setSalesCommission("");
    setWorkLocation(locations[0] || "");
    setNotes("");
    setShowModal(true);
  };

  const handleEditEmployee = (employee) => {
    setIsEditing(true);
    setEditingEmployee(employee);
    setFirstName(employee.firstName || "");
    setLastName(employee.lastName || "");
    setHourlyRate(employee.hourlyRate?.toString() || "");
    setSalesCommission(employee.salesCommission?.toString() || "");
    setWorkLocation(employee.workLocation || "");
    setNotes(employee.notes || "");
    setShowModal(true);
  };

  const validateEmployee = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMessage("Proszę wypełnić imię i nazwisko");
      setShowErrorModal(true);
      return false;
    }

    if (!workLocation) {
      setErrorMessage("Proszę wybrać miejsce zatrudnienia");
      setShowErrorModal(true);
      return false;
    }

    if (hourlyRate && (isNaN(hourlyRate) || parseFloat(hourlyRate) < 0)) {
      setErrorMessage("Stawka godzinowa musi być liczbą większą lub równą 0");
      setShowErrorModal(true);
      return false;
    }

    if (salesCommission && (isNaN(salesCommission) || parseFloat(salesCommission) < 0 || parseFloat(salesCommission) > 100)) {
      setErrorMessage("Procent od sprzedaży musi być liczbą między 0 a 100");
      setShowErrorModal(true);
      return false;
    }

    // Check for duplicate firstName + lastName
    const duplicate = employees.find(emp => 
      emp.firstName.toLowerCase() === firstName.trim().toLowerCase() &&
      emp.lastName.toLowerCase() === lastName.trim().toLowerCase() &&
      emp._id !== editingEmployee?._id
    );

    if (duplicate) {
      setErrorMessage(`Pracownik "${firstName} ${lastName}" już istnieje w bazie danych.`);
      setShowErrorModal(true);
      return false;
    }

    return true;
  };

  const handleSaveEmployee = async () => {
    if (!validateEmployee()) {
      return;
    }

    try {
      const employeeData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        workLocation: workLocation,
        hourlyRate: hourlyRate ? parseFloat(hourlyRate) : 0,
        salesCommission: salesCommission ? parseFloat(salesCommission) : 0,
        notes: notes.trim() || ""
      };

      if (isEditing) {
        employeeData.employeeId = editingEmployee.employeeId;
      }

      const url = isEditing 
        ? getApiUrl(`/employees/${editingEmployee._id}`)
        : getApiUrl("/employees");
      
      const response = await tokenService.authenticatedFetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(employeeData),
      });

      if (response.ok) {
        setSuccessMessage(
          isEditing 
            ? "Pracownik zaktualizowany pomyślnie!" 
            : "Pracownik dodany pomyślnie!"
        );
        setShowModal(false);
        setShowSuccessModal(true);
        fetchEmployees();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.message || "Nie udało się zapisać pracownika");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas zapisywania");
      setShowErrorModal(true);
    }
  };

  const confirmDelete = (employee) => {
    setEmployeeToDelete(employee);
    setShowDeleteConfirm(true);
  };

  const handleDeleteEmployee = async () => {
    if (!employeeToDelete) return;

    try {
      const url = getApiUrl(`/employees/${employeeToDelete._id}`);
      const response = await tokenService.authenticatedFetch(url, {
        method: "DELETE",
      });

      if (response.ok) {
        setSuccessMessage("Pracownik usunięty pomyślnie!");
        setShowDeleteConfirm(false);
        setEmployeeToDelete(null);
        setShowSuccessModal(true);
        fetchEmployees();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.message || "Nie udało się usunąć pracownika");
        setShowErrorModal(true);
      }
    } catch (error) {
      setErrorMessage("Wystąpił błąd podczas usuwania");
      setShowErrorModal(true);
    }
  };

  const filteredEmployees = employees.filter((employee) =>
    `${employee.firstName} ${employee.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.employeeId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.workLocation?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderEmployee = ({ item }) => {
    return (
      <View style={styles.employeeCard}>
        <View style={styles.employeeHeader}>
          <View style={styles.employeeInfo}>
            <Text style={styles.employeeName}>
              {item.firstName} {item.lastName}
            </Text>
            <Text style={styles.employeeId}>ID: {item.employeeId}</Text>
            <Text style={styles.employeeLocation}>
              <Ionicons name="location" size={12} color={tc('muted', "#64748B")} /> {item.workLocation}
            </Text>
            {item.hourlyRate > 0 && (
              <Text style={styles.employeeRate}>
                Stawka: {item.hourlyRate} zł/h
              </Text>
            )}
            {item.salesCommission > 0 && (
              <Text style={styles.employeeCommission}>
                Prowizja: {item.salesCommission}%
              </Text>
            )}
          </View>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => handleEditEmployee(item)}
          >
            <Ionicons name="pencil" size={18} color="#fff" />
            <Text style={styles.editButtonText}>Edytuj</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => confirmDelete(item)}
          >
            <Ionicons name="trash" size={18} color="#fff" />
            <Text style={styles.deleteButtonText}>Usuń</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={tc('text', "#fff")} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tabela pracowników</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddEmployee}
          disabled={loading}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={tc('muted', "#94A3B8")} />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj pracownika..."
          placeholderTextColor={tc('muted', "#64748B")}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm.length > 0 && (
          <TouchableOpacity onPress={() => setSearchTerm("")}>
            <Ionicons name="close-circle" size={20} color={tc('muted', "#94A3B8")} />
          </TouchableOpacity>
        )}
      </View>

      {/* Employees List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : filteredEmployees.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>
            {searchTerm ? "Nie znaleziono pracowników" : "Brak pracowników"}
          </Text>
          {!searchTerm && (
            <Text style={styles.emptyHint}>
              Naciśnij "+" aby dodać nowego pracownika
            </Text>
          )}
        </View>
      ) : (
        <>
          <View style={styles.countContainer}>
            <Text style={styles.countText}>
              Znaleziono: {filteredEmployees.length} / {employees.length} pracowników
            </Text>
          </View>
          <FlatList
            data={filteredEmployees}
            renderItem={renderEmployee}
            keyExtractor={(item) => item._id}
            contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(120, insets.bottom + 120) }]}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isEditing ? "Edytuj pracownika" : "Dodaj pracownika"}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={28} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Imię */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Imię *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Wpisz imię"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={firstName}
                  onChangeText={setFirstName}
                />
              </View>

              {/* Nazwisko */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nazwisko *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Wpisz nazwisko"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>

              {/* Miejsce zatrudnienia */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Miejsce zatrudnienia *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={workLocation}
                    onValueChange={setWorkLocation}
                    style={styles.picker}
                    dropdownIconColor="#fff"
                  >
                    {locations.map(loc => (
                      <Picker.Item key={loc} label={loc} value={loc} />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Stawka godzinowa */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Stawka godzinowa (zł/h)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="0.00"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={hourlyRate}
                  onChangeText={setHourlyRate}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Prowizja */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Prowizja od sprzedaży (%)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="0-100"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={salesCommission}
                  onChangeText={setSalesCommission}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Notatki */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Notatki</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  placeholder="Dodatkowe informacje..."
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.cancelButtonText}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveEmployee}
              >
                <Text style={styles.saveButtonText}>Zapisz</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="warning" size={64} color="#F59E0B" />
            </View>
            <Text style={styles.successTitle}>Potwierdź usunięcie</Text>
            <Text style={styles.successMessage}>
              Czy na pewno chcesz usunąć pracownika {employeeToDelete?.firstName} {employeeToDelete?.lastName}?
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancel]}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setEmployeeToDelete(null);
                }}
              >
                <Text style={styles.confirmButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmDelete]}
                onPress={handleDeleteEmployee}
              >
                <Text style={styles.confirmButtonText}>Usuń</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={64} color="#10B981" />
            </View>
            <Text style={styles.successTitle}>Sukces!</Text>
            <Text style={styles.successMessage}>{successMessage}</Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={styles.successButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Error Modal */}
      <Modal
        visible={showErrorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowErrorModal(false)}
      >
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="close-circle" size={64} color="#DC2626" />
            </View>
            <Text style={styles.successTitle}>Błąd</Text>
            <Text style={styles.successMessage}>{errorMessage}</Text>
            <TouchableOpacity
              style={[styles.successButton, { backgroundColor: '#DC2626' }]}
              onPress={() => setShowErrorModal(false)}
            >
              <Text style={styles.successButtonText}>OK</Text>
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
    backgroundColor: tc('bg', "#000000"),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: tc('bg', "#000000"),
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: tc('text', "#fff"),
  },
  addButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#3B82F6",
    borderRadius: 20,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#0A0A0A"),
    marginHorizontal: 20,
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: tc('text', "#fff"),
  },
  countContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  countText: {
    fontSize: 14,
    color: tc('muted', "#64748B"),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    color: tc('muted', "#64748B"),
    marginTop: 16,
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 14,
    color: "#475569",
    marginTop: 8,
    textAlign: "center",
  },
  listContainer: {
    padding: 20,
    paddingTop: 0,
  },
  employeeCard: {
    backgroundColor: tc('surface', "#0A0A0A"),
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  employeeHeader: {
    marginBottom: 12,
  },
  employeeInfo: {
    flex: 1,
  },
  employeeName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#3B82F6",
    marginBottom: 4,
  },
  employeeId: {
    fontSize: 12,
    color: tc('muted', "#64748B"),
    marginBottom: 4,
  },
  employeeLocation: {
    fontSize: 14,
    color: tc('muted', "#94A3B8"),
    marginBottom: 4,
  },
  employeeRate: {
    fontSize: 13,
    color: "#10B981",
    marginTop: 4,
  },
  employeeCommission: {
    fontSize: 13,
    color: "#F59E0B",
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    backgroundColor: "#3B82F6",
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    backgroundColor: "#DC2626",
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: tc('bg', "#0A0A0A"),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', "#1E293B"),
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: tc('text', "#fff"),
  },
  modalBody: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: tc('text', "#fff"),
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: tc('surface', "#000000"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: tc('text', "#fff"),
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  pickerContainer: {
    backgroundColor: tc('surface', "#000000"),
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderRadius: 12,
    overflow: "hidden",
  },
  picker: {
    color: tc('text', "#fff"),
    backgroundColor: "transparent",
  },
  modalActions: {
    flexDirection: "row",
    padding: 20,
    paddingTop: 0,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: tc('surface', "#1E293B"),
  },
  saveButton: {
    backgroundColor: "#3B82F6",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  successModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  successModalContent: {
    backgroundColor: tc('surface', "#0A0A0A"),
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    width: "80%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
  },
  successIconContainer: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: tc('text', "#fff"),
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 16,
    color: tc('muted', "#94A3B8"),
    textAlign: "center",
    marginBottom: 24,
  },
  successButton: {
    backgroundColor: "#10B981",
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
  },
  successButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
  confirmActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmCancel: {
    backgroundColor: tc('surface', "#1E293B"),
  },
  confirmDelete: {
    backgroundColor: "#DC2626",
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: tc('text', "#fff"),
  },
}));

export default EmployeesList;
