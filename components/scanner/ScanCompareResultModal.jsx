import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext';
import { countsOf, piecesSummary } from '../../utils/compareScans';

// Wynik porównania „oczekiwane vs zeskanowane”: 4 kafelki (oczekiwane / zeskanowane / braki / nadwyżki)
// i listy braków i nadwyżek z różnicą −N / +N. Wspólny dla Remanentu („Na stanie”) i zakładki „Sprawdź” („Dobrane”).
//
// Props:
//   visible, onClose     - widoczność; strzałka wstecz / systemowe wstecz zamyka
//   title, subtitle      - nagłówek (subtitle opcjonalny, np. aktywne filtry)
//   results              - { currentStateCount, remanentCount, missingItems, extraItems, missingCount?, excessCount? }
//   labels               - teksty zależne od ekranu (patrz DEFAULT_LABELS)
//   actions              - opcjonalny element pod listami (np. „Zakończ remanent i zapisz wynik”)
//   showCloseButton      - przycisk „Zamknij” na dole (gdy ekran nie ma własnej akcji)
//   children             - okienka nałożone na wynik (np. potwierdzenie zakończenia)

const DEFAULT_LABELS = {
  expected: 'Na stanie',
  scanned: 'Zeskanowane',
  missingSubtitle: 'Produkty w stanie, ale nie zeskanowane',
  extraSubtitle: 'Produkty zeskanowane, ale nie ma ich w stanie',
  missingLine: (item) => `Na stanie: ${item.expectedCount || 0}, zeskanowano: ${item.actualCount || 0}`,
  extraLine: (item) => (item.expectedCount === 0
    ? `Nie ma na stanie, zeskanowano: ${item.actualCount}`
    : `Na stanie: ${item.expectedCount}, zeskanowano: ${item.actualCount}`),
  successTitle: '🎉 Wszystko się zgadza!',
  successSubtitle: 'Remanent jest zgodny ze stanem magazynowym',
};

const ScanCompareResultModal = ({
  visible,
  onClose,
  title,
  subtitle,
  results,
  labels: customLabels,
  actions = null,
  showCloseButton = false,
  children = null,
}) => {
  useAppTheme(); // przerysowanie po zmianie motywu
  const labels = { ...DEFAULT_LABELS, ...(customLabels || {}) };
  const counts = countsOf(results);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.modalContainer]}>
        {/* Nagłówek jak w innych ekranach: powrót po lewej, krótki tytuł, opcjonalnie druga linia */}
        <View style={styles.comparisonHeader}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.comparisonBackButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID="compare-result-back"
          >
            <Ionicons name="arrow-back" size={24} color={tc('text', 'white')} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.comparisonTitle} numberOfLines={1}>{title}</Text>
            {subtitle ? (
              <Text style={styles.comparisonSubtitle} numberOfLines={2}>{subtitle}</Text>
            ) : null}
          </View>
        </View>

        {results ? (
          <ScrollView style={styles.comparisonContent} showsVerticalScrollIndicator={false}>
            {/* Statystyki */}
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber} testID="stat-expected">{results.currentStateCount || 0}</Text>
                <Text style={styles.statLabel}>{labels.expected}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber} testID="stat-scanned">{results.remanentCount || 0}</Text>
                <Text style={styles.statLabel}>{labels.scanned}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: '#dc3545' }]} testID="stat-missing">{counts.missing}</Text>
                <Text style={styles.statLabel}>Braki</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: '#ffc107' }]} testID="stat-excess">{counts.excess}</Text>
                <Text style={styles.statLabel}>Nadwyżki</Text>
              </View>
            </View>

            {/* Produkty brakujące */}
            {results.missingItems && results.missingItems.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.sectionTitle}>
                  ❌ Brakuje: {piecesSummary(counts.missing, results.missingItems.length)}
                </Text>
                <Text style={styles.sectionSubtitle}>{labels.missingSubtitle}</Text>
                {results.missingItems.map((item, index) => (
                  <View key={index} style={styles.resultItem}>
                    <View style={styles.resultItemContent}>
                      <Text style={styles.itemName}>
                        {item.name && item.size ? `${item.name} ${item.size}` : item.name || 'Nieznany produkt'}
                      </Text>
                      <Text style={styles.itemQuantity}>{labels.missingLine(item)}</Text>
                    </View>
                    <Text style={[styles.historyDelta, { color: '#dc3545' }]}>
                      -{item.missingCount ?? ((item.expectedCount || 0) - (item.actualCount || 0))}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Produkty nadwyżkowe */}
            {results.extraItems && results.extraItems.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.sectionTitle}>
                  ⚠️ Nadwyżka: {piecesSummary(counts.excess, results.extraItems.length)}
                </Text>
                <Text style={styles.sectionSubtitle}>{labels.extraSubtitle}</Text>
                {results.extraItems.map((item, index) => (
                  <View key={index} style={styles.resultItem}>
                    <View style={styles.resultItemContent}>
                      <Text style={styles.itemName}>{item.name || 'Nieznany produkt'}</Text>
                      <Text style={styles.itemQuantity}>{labels.extraLine(item)}</Text>
                    </View>
                    <Text style={[styles.historyDelta, { color: '#ffc107' }]}>
                      +{item.excessCount ?? ((item.actualCount || 0) - (item.expectedCount || 0))}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {actions}

            {/* Wszystko OK */}
            {(!results.missingItems || results.missingItems.length === 0) &&
             (!results.extraItems || results.extraItems.length === 0) && (
              <View style={styles.resultSection}>
                <Text style={styles.successTitle}>{labels.successTitle}</Text>
                <Text style={styles.successSubtitle}>{labels.successSubtitle}</Text>
              </View>
            )}

            {showCloseButton ? (
              <TouchableOpacity style={styles.closeResultButton} onPress={onClose}>
                <Ionicons name="close" size={20} color="white" />
                <Text style={styles.closeResultButtonText}>Zamknij</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        ) : (
          <View style={styles.comparisonContent}>
            <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>Ładowanie danych...</Text>
          </View>
        )}

        {children}
      </SafeAreaView>
    </Modal>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: tc('bg', '#000000'),
  },
  comparisonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#232533'),
  },
  comparisonBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('surface', '#1E293B'),
  },
  comparisonTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: tc('text', 'white'),
  },
  comparisonSubtitle: {
    fontSize: 13,
    color: tc('muted', '#94A3B8'),
    marginTop: 2,
  },
  comparisonContent: {
    flex: 1,
    padding: 20,
    backgroundColor: tc('bg', '#000000'),
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    backgroundColor: tc('surface', '#232533'),
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#0D6EFD',
  },
  statLabel: {
    fontSize: 14,
    color: tc('muted', '#888'),
    marginTop: 4,
  },
  resultSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: tc('text', 'white'),
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: tc('muted', '#888'),
    marginBottom: 12,
  },
  resultItem: {
    backgroundColor: tc('surface', '#232533'),
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultItemContent: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: tc('text', 'white'),
    marginBottom: 4,
  },
  itemQuantity: {
    fontSize: 12,
    color: tc('muted', '#CDCDE0'),
    marginTop: 2,
    fontStyle: 'italic',
  },
  historyDelta: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 10,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10B981',
    textAlign: 'center',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  closeResultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#64748B',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 32,
  },
  closeResultButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
}));

export default ScanCompareResultModal;
