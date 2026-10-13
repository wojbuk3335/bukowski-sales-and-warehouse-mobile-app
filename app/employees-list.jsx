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
import { PageHeader, IconButton, ModalHeader, look } from "../components/AdminLook"; // wspólny wygląd (styl panelu admina)
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
          <View style={styles.employeeIcon}>
            <Ionicons name="person" size={22} color="#0D6EFD" />
          </View>
          <View style={styles.employeeInfo}>
            <Text style={styles.employeeName}>
              {item.firstName} {item.lastName}
            </Text>
            <Text style={styles.employeeId}>ID: {item.employeeId}</Text>
            <Text style={styles.employeeLocation}>
              <Ionicons name="location" size={12} color={tc('muted', "#64748B")} /> {item.workLocation}
            </Text>
            {(item.hourlyRate > 0 || item.salesCommission > 0) && (
              <View style={styles.employeeBadges}>
                {item.hourlyRate > 0 && (
                  <View style={[styles.employeeBadge, { backgroundColor: "#10B98126", borderColor: "#10B98166" }]}>
                    <Text style={styles.employeeRate}>
                      Stawka: {item.hourlyRate} zł/h
                    </Text>
                  </View>
                )}
                {item.salesCommission > 0 && (
                  <View style={[styles.employeeBadge, { backgroundColor: "#F59E0B26", borderColor: "#F59E0B66" }]}>
                    <Text style={styles.employeeCommission}>
                      Prowizja: {item.salesCommission}%
                    </Text>
                  </View>
                )}
              </View>
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
      {/* Nagłówek */}
      <PageHeader
        title="Tabela pracowników"
        icon="people"
        onBack={() => router.back()}
        right={
          <IconButton
            icon="add"
            onPress={handleAddEmployee}
            disabled={loading}
            accessibilityLabel="Dodaj pracownika"
          />
        }
      />

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
          <ActivityIndicator size="large" color="#0D6EFD" />
        </View>
      ) : filteredEmployees.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color={tc('muted', "#475569")} />
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
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, styles.formModalContent]}>
            <ModalHeader
              icon={isEditing ? "create" : "person-add"}
              color="#0D6EFD"
              title={isEditing ? "Edytuj pracownika" : "Dodaj pracownika"}
            />

            <ScrollView style={styles.modalBody}>
              {/* Imię */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Imię *</Text>
                <TextInput
                  style={look.formInput}
                  placeholder="Wpisz imię"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={firstName}
                  onChangeText={setFirstName}
                />
              </View>

              {/* Nazwisko */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Nazwisko *</Text>
                <TextInput
                  style={look.formInput}
                  placeholder="Wpisz nazwisko"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>

              {/* Miejsce zatrudnienia */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Miejsce zatrudnienia *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={workLocation}
                    onValueChange={setWorkLocation}
                    style={styles.picker}
                    dropdownIconColor={tc('text', "#fff")}
                  >
                    {locations.map(loc => (
                      <Picker.Item key={loc} label={loc} value={loc} />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Stawka godzinowa */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Stawka godzinowa (zł/h)</Text>
                <TextInput
                  style={look.formInput}
                  placeholder="0.00"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={hourlyRate}
                  onChangeText={setHourlyRate}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Prowizja */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Prowizja od sprzedaży (%)</Text>
                <TextInput
                  style={look.formInput}
                  placeholder="0-100"
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={salesCommission}
                  onChangeText={setSalesCommission}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Notatki */}
              <View style={styles.formGroup}>
                <Text style={look.formLabel}>Notatki</Text>
                <TextInput
                  style={[look.formInput, styles.textArea]}
                  placeholder="Dodatkowe informacje..."
                  placeholderTextColor={tc('muted', "#64748B")}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </ScrollView>

            <View style={look.buttonRow}>
              <TouchableOpacity
                style={look.neutralButton}
                onPress={() => setShowModal(false)}
              >
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={look.primaryButton}
                onPress={handleSaveEmployee}
              >
                <Text style={look.buttonText}>Zapisz</Text>
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
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="warning" color="#F59E0B" title="Potwierdź usunięcie" />
            <Text style={look.modalMessage}>
              Czy na pewno chcesz usunąć pracownika {employeeToDelete?.firstName} {employeeToDelete?.lastName}?
            </Text>
            <View style={look.buttonRow}>
              <TouchableOpacity
                style={look.neutralButton}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setEmployeeToDelete(null);
                }}
              >
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[look.primaryButton, { backgroundColor: "#DC3545" }]}
                onPress={handleDeleteEmployee}
              >
                <Text style={look.buttonText}>Usuń</Text>
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
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="checkmark-circle" color="#10B981" title="Sukces!" />
            <Text style={look.modalMessage}>{successMessage}</Text>
            <View style={look.buttonRow}>
              <TouchableOpacity
                style={[look.primaryButton, { backgroundColor: "#10B981" }]}
                onPress={() => setShowSuccessModal(false)}
              >
                <Text style={look.buttonText}>OK</Text>
              </TouchableOpacity>
            </View>
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
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="close-circle" color="#DC3545" title="Błąd" />
            <Text style={look.modalMessage}>{errorMessage}</Text>
            <View style={look.buttonRow}>
              <TouchableOpacity
                style={[look.primaryButton, { backgroundColor: "#DC3545" }]}
                onPress={() => setShowErrorModal(false)}
              >
                <Text style={look.buttonText}>OK</Text>
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
    backgroundColor: tc('bg', "#000000"),
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tc('surface', "#161622"),
    marginHorizontal: 16,
    marginVertical: 14,
    paddingHorizontal: 14,
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
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  countText: {
    fontSize: 14,
    color: tc('muted', "#94A3B8"),
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
    color: tc('muted', "#94A3B8"),
    marginTop: 16,
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 14,
    color: tc('muted', "#64748B"),
    marginTop: 8,
    textAlign: "center",
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  employeeCard: {
    backgroundColor: tc('surface', "#161622"),
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', "#1E293B"),
    borderLeftWidth: 4,
    borderLeftColor: "#0D6EFD",
  },
  employeeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  employeeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#0D6EFD26",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  employeeInfo: {
    flex: 1,
  },
  employeeName: {
    fontSize: 17,
    fontWeight: "700",
    color: tc('text', "#fff"),
    marginBottom: 4,
  },
  employeeId: {
    fontSize: 12,
    color: tc('muted', "#94A3B8"),
    marginBottom: 4,
  },
  employeeLocation: {
    fontSize: 14,
    color: tc('muted', "#94A3B8"),
    marginBottom: 4,
  },
  employeeBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  employeeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  employeeRate: {
    fontSize: 12,
    fontWeight: "700",
    color: tc('text', "#fff"),
  },
  employeeCommission: {
    fontSize: 12,
    fontWeight: "700",
    color: tc('text', "#fff"),
  },
  actionButtons: {
    flexDirection: "row",
    gap: 10,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    backgroundColor: "#0D6EFD",
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    backgroundColor: "#DC3545",
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
  },
  formModalContent: {
    maxHeight: "90%",
  },
  modalBody: {
    flexGrow: 0,
    marginBottom: 8,
  },
  formGroup: {
    marginBottom: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  pickerContainer: {
    backgroundColor: tc('surface2', "#1E1E2D"),
    borderWidth: 1,
    borderColor: tc('border', "#334155"),
    borderRadius: 12,
    overflow: "hidden",
  },
  picker: {
    color: tc('text', "#fff"),
    backgroundColor: "transparent",
  },
}));

export default EmployeesList;
