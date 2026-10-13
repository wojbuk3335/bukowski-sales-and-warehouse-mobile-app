import React, { useState, useEffect, useContext } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlobalStateContext } from '../context/GlobalState';
import { getApiUrl } from '../config/api';
import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';

import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
const CorrectionsList = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const { user } = useContext(GlobalStateContext);
  const [corrections, setCorrections] = useState([]);
  const [filteredCorrections, setFilteredCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Stats
  const [stats, setStats] = useState({
    unresolved: 0,
    resolved: 0,
    total: 0
  });
  
  // Filters
  const [filters, setFilters] = useState({
    status: 'all',
    sellingPoint: '',
    productName: '',
    size: '',
    operationType: 'all'
  });
  
  // Modals
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedCorrection, setSelectedCorrection] = useState(null);
  const [availableLocations, setAvailableLocations] = useState([]);
  const [searchingProduct, setSearchingProduct] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalData, setConfirmModalData] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalData, setSuccessModalData] = useState(null);

  useEffect(() => {
    loadCorrections();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [corrections, filters]);

  const loadCorrections = async () => {
    setLoading(true);
    try {
      const response = await tokenService.authenticatedFetch(
        getApiUrl('/corrections')
      );
      const data = await response.json();
      
      const correctionsData = data || [];
      setCorrections(correctionsData);
      
      // Calculate stats
      const pending = correctionsData.filter(c => c.status === 'PENDING').length;
      const resolved = correctionsData.filter(c => c.status === 'RESOLVED').length;
      
      setStats({
        unresolved: pending,
        resolved: resolved,
        total: correctionsData.length
      });
    } catch (error) {
      console.error('Error loading corrections:', error);
      appAlert('Błąd', 'Nie udało się pobrać korekt');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCorrections();
    setRefreshing(false);
  };

  const applyFilters = () => {
    let filtered = [...corrections];

    if (filters.status !== 'all') {
      filtered = filtered.filter(correction => correction.status === filters.status);
    }

    if (filters.sellingPoint.trim()) {
      filtered = filtered.filter(correction => 
        correction.sellingPoint?.toLowerCase().includes(filters.sellingPoint.toLowerCase())
      );
    }

    if (filters.productName.trim()) {
      filtered = filtered.filter(correction => 
        correction.fullName?.toLowerCase().includes(filters.productName.toLowerCase())
      );
    }

    if (filters.size.trim()) {
      filtered = filtered.filter(correction => 
        correction.size?.toLowerCase().includes(filters.size.toLowerCase())
      );
    }

    if (filters.operationType !== 'all') {
      filtered = filtered.filter(correction => correction.attemptedOperation === filters.operationType);
    }

    setFilteredCorrections(filtered);
  };

  const resetFilters = () => {
    setFilters({
      status: 'all',
      sellingPoint: '',
      productName: '',
      size: '',
      operationType: 'all'
    });
  };

  const handleStatusUpdate = async (correctionId, newStatus, correctionData = null) => {
    try {
      const response = await tokenService.authenticatedFetch(
        getApiUrl(`/corrections/${correctionId}`),
        {
          method: 'PUT',
          body: JSON.stringify({
            status: newStatus,
            resolvedBy: user.email,
            description: `Status zmieniony na ${newStatus}`
          }),
        }
      );

      if (response.ok) {
        let responseData = null;
        try {
          responseData = await response.json();
        } catch (error) {
          responseData = null;
        }

        if (newStatus === 'PENDING' && responseData?.rollbackSummary) {
          const summary = responseData.rollbackSummary;
          const correctionForModal = correctionData || selectedCorrection;

          setSuccessModalData({
            success: true,
            title: 'Cofnięcie korekty zakończone pomyślnie',
            message: `Produkt "${correctionForModal?.fullName || ''}" został przywrócony do stanu w punkcie ${summary.fromSymbol}`,
            fromSymbol: summary.fromSymbol,
            productName: correctionForModal?.fullName || '',
            productSize: correctionForModal?.size || '',
            sellingPointCountBefore: summary.sellingPointCountBefore,
            sellingPointCountAfter: summary.sellingPointCountAfter,
            warehouseCountBefore: summary.warehouseCountBefore,
            warehouseCountAfter: summary.warehouseCountAfter,
            operationType: 'rollback'
          });
          setShowSuccessModal(true);
        }

        await loadCorrections();
      } else {
        appAlert('Błąd', 'Nie udało się zaktualizować statusu korekty');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      appAlert('Błąd', 'Nie udało się zaktualizować statusu korekty');
    }
  };

  const handleFindProduct = async (correction) => {
    try {
      setSearchingProduct(true);
      setSelectedCorrection(correction);
      
      const stateResponse = await tokenService.authenticatedFetch(
        getApiUrl('/state')
      );
      const allStates = await stateResponse.json();
      
      // Find matching items
      const matchingItems = allStates.filter(item => {
        const barcodeMatch = item.barcode === correction.barcode;
        const nameAndSizeMatch = item.fullName === correction.fullName && 
                                item.size === correction.size;
        return barcodeMatch || nameAndSizeMatch;
      });
      
      // Group by symbol
      const locationGroups = matchingItems.reduce((acc, item) => {
        if (!acc[item.symbol]) {
          acc[item.symbol] = {
            symbol: item.symbol,
            items: [],
            count: 0
          };
        }
        acc[item.symbol].items.push(item);
        acc[item.symbol].count++;
        return acc;
      }, {});
      
      const locations = Object.values(locationGroups);
      setAvailableLocations(locations);
      setShowProductModal(true);
      
    } catch (error) {
      console.error('Error finding product:', error);
      appAlert('Błąd', 'Nie udało się znaleźć produktu');
    } finally {
      setSearchingProduct(false);
    }
  };

  const handleWriteOffFromLocation = async (fromSymbol) => {
    try {
      if (!selectedCorrection) return;
      
      const itemToWriteOff = availableLocations
        .find(loc => loc.symbol === fromSymbol)
        ?.items[0];
        
      if (!itemToWriteOff) {
        appAlert('Błąd', 'Nie znaleziono produktu do odpisania');
        setShowProductModal(false);
        return;
      }
      
      // Get current state counts
      const stateResponse = await tokenService.authenticatedFetch(
        getApiUrl('/state')
      );
      
      let sellingPointCountBefore = 0;
      let warehouseCountBefore = 0;
      
      if (stateResponse.ok) {
        const stateData = await stateResponse.json();
        const sellingPointItems = stateData.filter(item => item.symbol === fromSymbol);
        sellingPointCountBefore = sellingPointItems.length || 0;
        
        const warehouseItems = stateData.filter(item => item.symbol === 'MAGAZYN');
        warehouseCountBefore = warehouseItems.length || 0;
      }
      
      setConfirmModalData({
        productName: selectedCorrection.fullName,
        productSize: selectedCorrection.size,
        fromSymbol: fromSymbol,
        itemToWriteOff: itemToWriteOff,
        sellingPointCountBefore: sellingPointCountBefore,
        warehouseCountBefore: warehouseCountBefore
      });
      setShowConfirmModal(true);
      
    } catch (error) {
      console.error('Error preparing write-off:', error);
      appAlert('Błąd', 'Nie udało się przygotować odpisania');
    }
  };

  const confirmWriteOff = async () => {
    try {
      setShowConfirmModal(false);
      
      if (!confirmModalData) return;
      
      const { itemToWriteOff, fromSymbol, sellingPointCountBefore, warehouseCountBefore } = confirmModalData;
      
      const writeOffResponse = await tokenService.authenticatedFetch(
        getApiUrl(`/state/barcode/${itemToWriteOff.barcode}/symbol/${fromSymbol}?count=1`),
        {
          method: 'DELETE',
          headers: {
            'operation-type': 'write-off',
            'correction-id': selectedCorrection._id,
            'correction-transaction-id': selectedCorrection.transactionId
          }
        }
      );
      
      if (writeOffResponse.ok) {
        await handleStatusUpdate(selectedCorrection._id, 'RESOLVED', selectedCorrection);
        setShowProductModal(false);
        
        const sellingPointCountAfter = sellingPointCountBefore - 1;
        const warehouseCountAfter = fromSymbol === 'MAGAZYN'
          ? warehouseCountBefore - 1
          : warehouseCountBefore;
        
        setSuccessModalData({
          success: true,
          title: 'Odpisanie zakończone pomyślnie',
          message: `Produkt "${selectedCorrection.fullName}" został odpisany ze stanu w punkcie ${fromSymbol}`,
          fromSymbol: fromSymbol,
          productName: selectedCorrection.fullName,
          productSize: selectedCorrection.size,
          sellingPointCountBefore: sellingPointCountBefore,
          sellingPointCountAfter: sellingPointCountAfter,
          warehouseCountBefore: warehouseCountBefore,
          warehouseCountAfter: warehouseCountAfter,
          operationType: 'writeoff'
        });
        setShowSuccessModal(true);
        
        const updatedLocations = availableLocations.filter(loc => loc.symbol !== fromSymbol);
        setAvailableLocations(updatedLocations);
      } else {
        const errorData = await writeOffResponse.json();
        appAlert('Błąd', errorData.message || 'Nie udało się odpisać produktu');
      }
      
    } catch (error) {
      console.error('Error writing off:', error);
      appAlert('Błąd', 'Nie udało się odpisać produktu');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getOperationLabel = (operation) => {
    const labels = {
      'SALE': 'Sprzedaż',
      'TRANSFER': 'Transfer',
      'WRITE_OFF': 'Odpisanie',
      'REMANENT_BRAK': 'Remanent-Brak',
      'REMANENT_NADWYŻKA': 'Remanent-Nadwyżka'
    };
    return labels[operation] || operation;
  };

  const getOperationColor = (operation) => {
    const colors = {
      'SALE': '#22C55E',
      'TRANSFER': '#3B82F6',
      'WRITE_OFF': '#EF4444',
      'REMANENT_BRAK': '#F59E0B',
      'REMANENT_NADWYŻKA': '#8B5CF6'
    };
    return colors[operation] || '#64748B';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'PENDING': 'Oczekuje',
      'RESOLVED': 'Rozwiązane',
      'IGNORED': 'Zignorowane'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
      'PENDING': '#F59E0B',
      'RESOLVED': '#22C55E',
      'IGNORED': '#64748B'
    };
    return colors[status] || '#64748B';
  };

  const renderCorrectionCard = (correction) => {
    const operationColor = getOperationColor(correction.attemptedOperation);
    const statusColor = getStatusColor(correction.status);
    
    return (
      <View key={correction._id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.operationBadge, { backgroundColor: `${operationColor}20` }]}>
            <Text style={[styles.operationText, { color: operationColor }]}>
              {getOperationLabel(correction.attemptedOperation)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {getStatusLabel(correction.status)}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Ionicons name="pricetag-outline" size={16} color={tc('muted', "#94A3B8")} />
            <Text style={styles.infoLabel}>Produkt:</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {correction.fullName}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="resize-outline" size={16} color={tc('muted', "#94A3B8")} />
            <Text style={styles.infoLabel}>Rozmiar:</Text>
            <Text style={styles.infoValue}>{correction.size}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color={tc('muted', "#94A3B8")} />
            <Text style={styles.infoLabel}>Punkt:</Text>
            <Text style={styles.infoValue}>{correction.sellingPoint}</Text>
          </View>

          {correction.errorType && (
            <View style={styles.infoRow}>
              <Ionicons name="alert-circle-outline" size={16} color={tc('muted', "#94A3B8")} />
              <Text style={styles.infoLabel}>Typ błędu:</Text>
              <Text style={styles.infoValue}>
                {correction.errorType === 'MISSING_IN_STATE' ? 'Brak w stanie' :
                 correction.errorType === 'DUPLICATE_IN_STATE' ? 'Duplikat' :
                 correction.errorType === 'QUANTITY_MISMATCH' ? 'Niezgodność ilości' :
                 correction.errorType}
              </Text>
            </View>
          )}

          <View style={styles.timestampRow}>
            <Ionicons name="time-outline" size={14} color={tc('muted', "#64748B")} />
            <Text style={styles.timestampText}>{formatDate(correction.createdAt)}</Text>
          </View>
        </View>

        {correction.status === 'PENDING' && (
          <View style={styles.cardActions}>
            {!['REMANENT_BRAK', 'REMANENT_NADWYŻKA'].includes(correction.attemptedOperation) ? (
              <>
                <TouchableOpacity
                  style={[styles.actionButton, styles.findButton]}
                  onPress={() => handleFindProduct(correction)}
                  disabled={searchingProduct}
                >
                  <Ionicons name="search" size={14} color="#fff" />
                  <Text style={styles.actionButtonText}>Wskaż</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.resolveButton]}
                  onPress={() => handleStatusUpdate(correction._id, 'RESOLVED', correction)}
                >
                  <Ionicons name="checkmark-circle" size={14} color="#fff" />
                  <Text style={styles.actionButtonText}>Rozwiązano</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.ignoreButton]}
                  onPress={() => handleStatusUpdate(correction._id, 'IGNORED', correction)}
                >
                  <Ionicons name="close-circle" size={14} color={tc('text', "#fff")} />
                  <Text style={styles.actionButtonText}>Zignoruj</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.actionButton, styles.resolveButton]}
                  onPress={() => handleStatusUpdate(correction._id, 'RESOLVED', correction)}
                >
                  <Ionicons name="checkmark-circle" size={14} color="#fff" />
                  <Text style={styles.actionButtonText}>Rozwiązano</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.ignoreButton]}
                  onPress={() => handleStatusUpdate(correction._id, 'IGNORED', correction)}
                >
                  <Ionicons name="close-circle" size={14} color={tc('text', "#fff")} />
                  <Text style={styles.actionButtonText}>Zignoruj</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {correction.status === 'RESOLVED' && (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.undoButton]}
              onPress={() => handleStatusUpdate(correction._id, 'PENDING', correction)}
            >
              <Ionicons name="arrow-undo" size={16} color="#fff" />
              <Text style={styles.actionButtonText}>Cofnij rozwiązanie</Text>
            </TouchableOpacity>
          </View>
        )}

        {correction.status === 'IGNORED' && (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.undoButton]}
              onPress={() => handleStatusUpdate(correction._id, 'PENDING', correction)}
            >
              <Ionicons name="arrow-undo" size={16} color="#fff" />
              <Text style={styles.actionButtonText}>Przywróć</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

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
          headerTitle: 'Korekty Magazynowe',
          headerStyle: {
            backgroundColor: tc('bg', '#000000'),
          },
          headerTintColor: tc('text', '#fff'),
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={tc('text', "#fff")} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={[styles.statCard, styles.statUnresolved]}>
          <Text style={styles.statNumber}>{stats.unresolved}</Text>
          <Text style={styles.statLabel}>Nierozwiązane</Text>
        </View>
        <View style={[styles.statCard, styles.statResolved]}>
          <Text style={styles.statNumber}>{stats.resolved}</Text>
          <Text style={styles.statLabel}>Rozwiązane</Text>
        </View>
        <View style={[styles.statCard, styles.statTotal]}>
          <Text style={styles.statNumber}>{stats.total}</Text>
          <Text style={styles.statLabel}>Łącznie</Text>
        </View>
      </View>

      {/* Filters and Actions */}
      <View style={styles.actionsBar}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterModalVisible(true)}
        >
          <Ionicons 
            name={
              filters.status !== 'all' || filters.sellingPoint || filters.productName || 
              filters.size || filters.operationType !== 'all'
                ? 'funnel'
                : 'funnel-outline'
            } 
            size={20} 
            color={
              filters.status !== 'all' || filters.sellingPoint || filters.productName || 
              filters.size || filters.operationType !== 'all'
                ? '#3B82F6'
                : '#fff'
            } 
          />
          <Text style={styles.filterButtonText}>Filtry</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {filteredCorrections.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={64} color={tc('muted', "#64748B")} />
            <Text style={styles.emptyStateText}>
              {corrections.length === 0 ? 'Brak korekt do wyświetlenia' : 'Brak korekt pasujących do filtrów'}
            </Text>
          </View>
        ) : (
          filteredCorrections.map(renderCorrectionCard)
        )}
      </ScrollView>

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtry</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Ionicons name="close" size={24} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Status Filter */}
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Status:</Text>
                <View style={styles.filterOptions}>
                  {[
                    { value: 'all', label: 'Wszystkie' },
                    { value: 'PENDING', label: 'Oczekujące' },
                    { value: 'RESOLVED', label: 'Rozwiązane' },
                    { value: 'IGNORED', label: 'Zignorowane' }
                  ].map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.filterOption,
                        filters.status === option.value && styles.filterOptionActive
                      ]}
                      onPress={() => setFilters({ ...filters, status: option.value })}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          filters.status === option.value && styles.filterOptionTextActive
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Operation Type Filter */}
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Typ operacji:</Text>
                <View style={styles.filterOptions}>
                  {[
                    { value: 'all', label: 'Wszystkie' },
                    { value: 'SALE', label: 'Sprzedaż' },
                    { value: 'TRANSFER', label: 'Transfer' },
                    { value: 'WRITE_OFF', label: 'Odpisanie' },
                    { value: 'REMANENT_BRAK', label: 'Remanent-Brak' },
                    { value: 'REMANENT_NADWYŻKA', label: 'Remanent-Nadwyżka' }
                  ].map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.filterOption,
                        filters.operationType === option.value && styles.filterOptionActive
                      ]}
                      onPress={() => setFilters({ ...filters, operationType: option.value })}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          filters.operationType === option.value && styles.filterOptionTextActive
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Text Filters */}
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Punkt sprzedaży:</Text>
                <TextInput
                  style={styles.filterInput}
                  value={filters.sellingPoint}
                  onChangeText={(text) => setFilters({ ...filters, sellingPoint: text })}
                  placeholder="Wpisz nazwę punktu..."
                  placeholderTextColor={tc('muted', "#64748B")}
                />
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Produkt:</Text>
                <TextInput
                  style={styles.filterInput}
                  value={filters.productName}
                  onChangeText={(text) => setFilters({ ...filters, productName: text })}
                  placeholder="Wpisz nazwę produktu..."
                  placeholderTextColor={tc('muted', "#64748B")}
                />
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Rozmiar:</Text>
                <TextInput
                  style={styles.filterInput}
                  value={filters.size}
                  onChangeText={(text) => setFilters({ ...filters, size: text })}
                  placeholder="Wpisz rozmiar..."
                  placeholderTextColor={tc('muted', "#64748B")}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.resetButton]}
                onPress={() => {
                  resetFilters();
                  setFilterModalVisible(false);
                }}
              >
                <Text style={styles.modalButtonText}>Resetuj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.applyButton]}
                onPress={() => setFilterModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Zastosuj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Product Modal */}
      <Modal
        visible={showProductModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProductModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Lokalizacje produktu</Text>
              <TouchableOpacity onPress={() => setShowProductModal(false)}>
                <Ionicons name="close" size={24} color={tc('text', "#fff")} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedCorrection && (
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{selectedCorrection.fullName}</Text>
                  <Text style={styles.productDetail}>Rozmiar: {selectedCorrection.size}</Text>
                  <Text style={styles.productDetail}>Barcode: {selectedCorrection.barcode}</Text>
                  <Text style={styles.productDetail}>
                    Brakuje w: <Text style={styles.productBold}>{selectedCorrection.sellingPoint}</Text>
                  </Text>
                  {selectedCorrection.errorType && (
                    <Text style={styles.productDetail}>
                      Typ błędu: <Text style={styles.productBold}>
                        {selectedCorrection.errorType === 'MISSING_IN_STATE' ? 'Brak w stanie' :
                         selectedCorrection.errorType === 'DUPLICATE_IN_STATE' ? 'Duplikat' :
                         selectedCorrection.errorType === 'QUANTITY_MISMATCH' ? 'Niezgodność ilości' :
                         selectedCorrection.errorType}
                      </Text>
                    </Text>
                  )}
                </View>
              )}

              {availableLocations.length > 0 ? (
                <>
                  <Text style={styles.locationsTitle}>Znaleziono produkt w punktach:</Text>
                  {availableLocations.map((location) => (
                    <View key={location.symbol} style={styles.locationItem}>
                      <View style={styles.locationInfo}>
                        <Text style={styles.locationSymbol}>{location.symbol}</Text>
                        <Text style={styles.locationCount}>({location.count} szt.)</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.writeOffButton}
                        onPress={() => handleWriteOffFromLocation(location.symbol)}
                      >
                        <Text style={styles.writeOffButtonText}>Odpisz</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              ) : (
                <View style={styles.noLocations}>
                  <Text style={styles.noLocationsText}>
                    Nie znaleziono tego produktu w żadnym innym punkcie sprzedaży.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooterVertical}>
              <TouchableOpacity
                style={[styles.modalButtonFull, styles.resetButton]}
                onPress={() => setShowProductModal(false)}
              >
                <Text style={styles.modalButtonText}>Anuluj</Text>
              </TouchableOpacity>
              {selectedCorrection && (
                <TouchableOpacity
                  style={[styles.modalButtonFull, styles.applyButton]}
                  onPress={() => {
                    handleStatusUpdate(selectedCorrection._id, 'RESOLVED', selectedCorrection);
                    setShowProductModal(false);
                  }}
                >
                  <Text style={styles.modalButtonText}>Oznacz jako rozwiązane</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Modal */}
      <Modal
        visible={showConfirmModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <View style={styles.confirmIcon}>
              <Text style={styles.confirmIconText}>⚠️</Text>
            </View>
            <Text style={styles.confirmTitle}>Potwierdź odpisanie</Text>
            
            {confirmModalData && (
              <>
                <Text style={styles.confirmText}>
                  Czy na pewno chcesz odpisać produkt:
                </Text>
                <View style={styles.confirmProductBox}>
                  <Text style={styles.confirmProductName}>{confirmModalData.productName}</Text>
                  <Text style={styles.confirmProductDetail}>
                    ze stanu w punkcie: <Text style={styles.productBold}>{confirmModalData.fromSymbol}</Text>
                  </Text>
                </View>
                <View style={styles.confirmStatsBox}>
                  {confirmModalData.fromSymbol !== 'MAGAZYN' && (
                    <Text style={styles.confirmStat}>
                      📊 Stan w punkcie: {confirmModalData.sellingPointCountBefore} szt.
                    </Text>
                  )}
                  <Text style={styles.confirmStat}>
                    📦 Stan w magazynie: {confirmModalData.warehouseCountBefore} szt.
                  </Text>
                </View>
              </>
            )}

            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancelButton]}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.confirmButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmDeleteButton]}
                onPress={confirmWriteOff}
              >
                <Text style={styles.confirmButtonText}>Odpisz</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModal, successModalData?.success && styles.successModal]}>
            <View style={styles.confirmIcon}>
              <Text style={styles.confirmIconText}>{successModalData?.success ? '✅' : '❌'}</Text>
            </View>
            <Text style={styles.confirmTitle}>{successModalData?.title}</Text>
            
            {successModalData && (
              <>
                <Text style={styles.confirmText}>{successModalData.message}</Text>
                
                {successModalData.success && (
                  <>
                    {successModalData.fromSymbol !== 'MAGAZYN' && (
                      <View style={styles.successStatsCard}>
                        <Text style={styles.successStatsTitle}>
                          🏪 PUNKT SPRZEDAŻY - {successModalData.fromSymbol}
                        </Text>
                        <View style={styles.successStatRow}>
                          <Text style={styles.successStatLabel}>Stan przed:</Text>
                          <Text style={styles.successStatValue}>{successModalData.sellingPointCountBefore}</Text>
                        </View>
                        <View style={styles.successStatRow}>
                          <Text style={styles.successStatLabel}>
                            {successModalData.operationType === 'rollback' ? 'Dodano:' : 'Odpisano:'}
                          </Text>
                          <Text style={styles.successStatValue}>
                            {`${successModalData.productName || ''} ${successModalData.productSize || ''}`.trim()} {successModalData.operationType === 'rollback' ? '+1' : '-1'}
                          </Text>
                        </View>
                        <View style={[styles.successStatRow, styles.successStatRowFinal]}>
                          <Text style={styles.successStatLabelFinal}>Stan końcowy:</Text>
                          <Text style={styles.successStatValueFinal}>{successModalData.sellingPointCountAfter}</Text>
                        </View>
                      </View>
                    )}

                    <View style={[styles.successStatsCard, styles.successStatsCardWarehouse]}>
                      <Text style={styles.successStatsTitle}>📦 MAGAZYN</Text>
                      <View style={styles.successStatRow}>
                        <Text style={styles.successStatLabel}>Stan przed:</Text>
                        <Text style={styles.successStatValue}>{successModalData.warehouseCountBefore}</Text>
                      </View>
                      {successModalData.warehouseCountBefore !== successModalData.warehouseCountAfter && (
                        <View style={styles.successStatRow}>
                          <Text style={styles.successStatLabel}>
                            {successModalData.operationType === 'rollback' ? 'Dodano:' : 'Odpisano:'}
                          </Text>
                          <Text style={styles.successStatValue}>
                            {`${successModalData.productName || ''} ${successModalData.productSize || ''}`.trim()} {successModalData.operationType === 'rollback' ? '+1' : '-1'}
                          </Text>
                        </View>
                      )}
                      <View style={[styles.successStatRow, styles.successStatRowFinal]}>
                        <Text style={styles.successStatLabelFinal}>Stan końcowy:</Text>
                        <Text style={styles.successStatValueFinal}>{successModalData.warehouseCountAfter}</Text>
                      </View>
                    </View>
                  </>
                )}
              </>
            )}

            <View style={styles.closeButtonContainer}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancelButton, styles.closeButton]}
                onPress={() => setShowSuccessModal(false)}
              >
                <Text style={styles.confirmButtonText}>Zamknij</Text>
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
  backButton: {
    marginLeft: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: tc('surface', '#1E293B'),
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  statUnresolved: {
    borderColor: '#F59E0B',
  },
  statResolved: {
    borderColor: '#22C55E',
  },
  statTotal: {
    borderColor: '#3B82F6',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: tc('muted', '#94A3B8'),
  },
  actionsBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tc('surface', '#1E293B'),
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  filterButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    color: tc('muted', '#64748B'),
    marginTop: 16,
  },
  card: {
    backgroundColor: tc('surface', '#1E293B'),
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#334155'),
  },
  operationBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  operationText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    padding: 12,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
  },
  infoValue: {
    fontSize: 14,
    color: tc('text', '#fff'),
    flex: 1,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  timestampText: {
    fontSize: 12,
    color: tc('muted', '#64748B'),
  },
  cardActions: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#334155'),
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  findButton: {
    backgroundColor: '#F59E0B',
  },
  resolveButton: {
    backgroundColor: '#22C55E',
  },
  ignoreButton: {
    backgroundColor: '#64748B',
  },
  undoButton: {
    backgroundColor: '#3B82F6',
  },
  actionButtonText: {
    color: '#ff1',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: tc('surface', '#1E293B'),
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#334155'),
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
  },
  modalBody: {
    padding: 20,
  },
  filterGroup: {
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tc('text', '#fff'),
    marginBottom: 8,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: tc('surface2', '#334155'),
  },
  filterOptionActive: {
    backgroundColor: '#3B82F6',
  },
  filterOptionText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  filterOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  filterInput: {
    backgroundColor: tc('surface2', '#334155'),
    borderRadius: 8,
    padding: 12,
    color: tc('text', '#fff'),
    fontSize: 14,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#334155'),
  },
  modalFooterVertical: {
    flexDirection: 'column',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#334155'),
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonFull: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: '#64748B',
  },
  applyButton: {
    backgroundColor: '#3B82F6',
  },
  modalButtonText: {
    color: tc('text', '#fff'),
    fontSize: 14,
    fontWeight: '600',
  },
  productInfo: {
    backgroundColor: tc('surface2', '#334155'),
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    marginBottom: 8,
  },
  productDetail: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    marginBottom: 4,
  },
  productBold: {
    fontWeight: 'bold',
    color: tc('text', '#fff'),
  },
  locationsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: tc('text', '#fff'),
    marginBottom: 12,
  },
  locationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: tc('surface2', '#334155'),
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationSymbol: {
    fontSize: 14,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
  },
  locationCount: {
    fontSize: 12,
    color: tc('muted', '#94A3B8'),
  },
  writeOffButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  writeOffButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  noLocations: {
    padding: 20,
    alignItems: 'center',
  },
  noLocationsText: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    textAlign: 'center',
  },
  confirmModal: {
    backgroundColor: tc('surface', '#1E293B'),
    borderRadius: 20,
    padding: 30,
    width: '85%',
    maxWidth: 400,
  },
  successModal: {
    borderWidth: 3,
    borderColor: '#22C55E',
  },
  confirmIcon: {
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmIconText: {
    fontSize: 48,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmText: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmProductBox: {
    backgroundColor: tc('surface2', '#334155'),
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  confirmProductName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: tc('text', '#fff'),
    marginBottom: 8,
  },
  confirmProductDetail: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
  },
  confirmStatsBox: {
    backgroundColor: tc('surface2', '#334155'),
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  confirmStat: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    marginBottom: 8,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmCancelButton: {
    backgroundColor: '#64748B',
  },
  confirmDeleteButton: {
    backgroundColor: '#EF4444',
  },
  closeButtonContainer: {
    alignItems: 'center',
    marginTop: 4,
    width: '100%',
  },
  closeButton: {
    flex: 0,
    minWidth: 200,
    paddingHorizontal: 40,
    paddingVertical: 14,
  },
  confirmButtonText: {
    color: tc('text', '#fff'),
    fontSize: 14,
    fontWeight: 'bold',
  },
  successStatsCard: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  successStatsCardWarehouse: {
    backgroundColor: '#F59E0B',
  },
  successStatsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  successStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  successStatRowFinal: {
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.5)',
    paddingTop: 12,
    marginTop: 4,
  },
  successStatLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  successStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  successStatLabelFinal: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  successStatValueFinal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
}));

export default CorrectionsList;
