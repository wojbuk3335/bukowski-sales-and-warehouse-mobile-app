import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from '@expo/vector-icons/Ionicons';
import { appAlert } from '../../services/appAlert';
import { pointDisplayName, pointNameBySymbol } from '../../utils/pointName'; // pełna nazwa punktu zamiast symbolu
import { ModalHeader, look } from '../AdminLook';
import { tc, createThemedStyles } from '../../context/ThemeContext';

// „Sprzedano od” - wspólne dla „Dodaj” i odbioru Cudzicha (30.10.2026): ramka z wyborem punktu, przy każdym punkcie
// stan tej sztuki („Na stanie: 2 szt.” / „Brak na stanie - po przetworzeniu powstanie korekta”); punkt bez sztuki
// można wybrać dopiero po potwierdzeniu - w Dobieraniu powstanie korekta (25.10.2026).
//
// Props: value (symbol), onChange(symbol), barcode, points (punkty do wyboru), users (pełne nazwy), stateData, location

// Ile sztuk z tym kodem leży w danym punkcie (telefon ma stan wszystkich punktów)
export const stockAtPoint = (stateData, symbol, barcode) => (
  (stateData || []).filter((row) => row.symbol === symbol && row.barcode === barcode).length
);

const SalePointPicker = ({ value, onChange, barcode, points = [], users, stateData, location }) => {
  const [menuVisible, setMenuVisible] = useState(false);
  const stockAt = (symbol) => stockAtPoint(stateData, symbol, barcode);

  const choose = (symbol) => {
    if (barcode && stockAt(symbol) === 0) {
      appAlert(
        `Brak na stanie w punkcie ${symbol}`,
        `W punkcie ${symbol} nie ma tej kurtki na stanie. Jeśli sprzedaż zostanie zapisana z tego punktu, po przetworzeniu w Dobieraniu powstanie korekta (brak). Wybrać mimo to?`,
        [
          { text: "Anuluj", style: "cancel" },
          { text: "Wybierz", onPress: () => { onChange(symbol); setMenuVisible(false); } },
        ]
      );
      return;
    }
    onChange(symbol);
    setMenuVisible(false);
  };

  return (
    <>
      {/* „Sprzedano od” w ramce: mały wyśrodkowany podpis nad listą rozwijaną (zamiast dużego ostrzeżenia) */}
      <View style={styles.sellerFrame}>
        <Text style={styles.sellerFrameCaption}>Sprzedano od - bardzo ważne, wybierz uważnie</Text>
        <TouchableOpacity
          testID="sale-point-select"
          style={[look.selectField, styles.importantSelect]}
          onPress={() => setMenuVisible(true)}
        >
          <Text style={[look.selectFieldText, !value && { color: tc('muted', '#94A3B8') }]}>
            {value ? pointNameBySymbol(users, value) : "Wybierz punkt sprzedaży"}
          </Text>
          <Ionicons name="chevron-down" size={20} color="#F59E0B" />
        </TouchableOpacity>
        {barcode && value && stockAt(value) === 0 ? (
          <Text testID="sale-point-missing-warning" style={[styles.salePointNote, styles.salePointNoteMissing, { textAlign: 'center', marginTop: 6 }]}>
            {`W punkcie ${value} nie ma tej kurtki na stanie - po przetworzeniu powstanie korekta.`}
          </Text>
        ) : null}
      </View>
      {menuVisible && (
        <Modal
          transparent={true}
          animationType="slide"
          visible={menuVisible}
          onRequestClose={() => setMenuVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <ModalHeader icon="storefront" color="#F59E0B" title="Wybierz punkt sprzedaży" subtitle="Skąd pochodzi sprzedany produkt" />

              <ScrollView style={{ maxHeight: 400, width: '100%', marginBottom: 8 }}>
                {points.length > 0 ? (
                  points.map((item) => (
                    <TouchableOpacity
                      key={item._id}
                      testID={`sale-point-${item.symbol}`}
                      style={[styles.modalItem, styles.pointItemCentered]}
                      onPress={() => choose(item.symbol)}
                    >
                      <Text style={[styles.modalItemText, { textAlign: 'center' }]}>
                        {pointDisplayName(item)}
                      </Text>
                      {barcode ? (
                        <Text
                          testID={`sale-point-${item.symbol}-note`}
                          style={[styles.salePointNote, { textAlign: 'center' }, stockAt(item.symbol) === 0 && styles.salePointNoteMissing]}
                        >
                          {stockAt(item.symbol) > 0
                            ? `Na stanie: ${stockAt(item.symbol)} szt.`
                            : 'Brak na stanie - po przetworzeniu powstanie korekta'}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={{ padding: 20 }}>
                    <Text style={{ color: tc('text', 'white'), textAlign: 'center', fontSize: 16 }}>
                      {barcode
                        ? `Brak tego produktu w punktach sprzedaży w lokalizacji "${location || 'nieznana'}"`
                        : 'Zeskanuj kod kreskowy aby zobaczyć dostępne punkty sprzedaży'}
                    </Text>
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setMenuVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  sellerFrame: { // „Sprzedano od”: ramka z podpisem nad listą rozwijaną
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.6)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
  },
  sellerFrameCaption: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  importantSelect: {
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  salePointNote: { // stan kurtki w punkcie
    fontSize: 12,
    marginTop: 2,
    color: tc('muted', '#94A3B8'),
  },
  salePointNoteMissing: {
    color: '#EF4444',
  },
  pointItemCentered: { // lista punktów: nazwa i stan wyśrodkowane
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: tc('border', '#232533'),
  },
  modalItem: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
  },
  modalItemText: {
    color: tc('text', '#ffffff'),
    fontSize: 16,
    fontWeight: '600',
  },
  modalCloseButton: {
    backgroundColor: tc('surface2', '#2a2a3e'),
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: tc('text', '#fff'),
    fontSize: 16,
    fontWeight: 'bold',
  },
}));

export default SalePointPicker;
