import { useCameraPermissions } from "expo-camera";
import ScanCamera from "../components/scanner/ScanCamera"; // skaner jak w całej aplikacji: ramka, zdjęcie, „Wpisz kod”
import { useContext, useState } from "react";
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
import { GlobalStateContext } from "../context/GlobalState"; // Adjust the import path as necessary
import { ModalHeader, PointPill, pointColorMap, look } from '../components/AdminLook';
const QRScannerSearch = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const [facing, setFacing] = useState("back");
  const [permission, requestPermission] = useCameraPermissions();
  const [modalVisible, setModalVisible] = useState(false);
  const [matchedItems, setMatchedItems] = useState([]);
  const { stateData } = useContext(GlobalStateContext); // Access state data from global context


  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={[styles.message, { marginBottom: 20 }]}>Potrzebujemy Twojej zgody na dostęp do kamery</Text>
        <TouchableOpacity
          style={{
            backgroundColor: "#0d6efd",
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 8,
          }}
          onPress={requestPermission}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>Włącz skaner kodów krekowych</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleScan = ({ data, type }) => {
    // Find the exact product by barcode
    const exactMatch = stateData.find(item => (item.barcode || "") === data);
    
    if (!exactMatch) {
      // If no exact match, fallback to first 5 digits
      const prefix = data.slice(0, 5);
      const matches = stateData.filter(item => (item.barcode || "").slice(0, 5) === prefix);
      setMatchedItems(matches);
      setModalVisible(true);
      return;
    }

    // Extract base name (remove size from fullName)
    const getBaseName = (fullName) => {
      if (!fullName) return '';
      
      // Common size patterns to remove
      const sizePatterns = [
        /\b(XS|S|M|L|XL|XXL|XXXL)\b$/i,
        /\b(36|38|40|42|44|46|48|50|52|54|56|58|60)\b$/,
        /\b(\d+\/\d+)\b$/,  // e.g., 36/38
        /\b(ONESIZE|ONE SIZE)\b$/i
      ];
      
      let baseName = fullName.trim();
      
      // Try to remove size patterns from the end
      for (const pattern of sizePatterns) {
        baseName = baseName.replace(pattern, '').trim();
      }
      
      return baseName;
    };

    // Get base name of the scanned product
    const baseName = getBaseName(exactMatch.fullName);
    
    // Find all products with the same base name (same product, different sizes)
    const relatedProducts = stateData.filter(item => {
      const itemBaseName = getBaseName(item.fullName);
      return itemBaseName && baseName && 
             itemBaseName.toLowerCase() === baseName.toLowerCase();
    });

    // Remove duplicates and sort by size
    const uniqueProducts = relatedProducts.filter((item, index, self) => 
      index === self.findIndex(p => p.id === item.id)
    );

    setMatchedItems(uniqueProducts);
    setModalVisible(true);
  };

  // Kolor plakietki dla każdego punktu (różne kolory, magazyn pomarańczowy)
  // Nazwa dla „Wpisz kod”: sztuka na stanie z tym kodem albo ten sam model (5 pierwszych cyfr); null = brak w stanach
  const resolveScannedName = (code) => {
    const exact = (stateData || []).find((item) => (item.barcode || "") === code);
    if (exact) return `${exact.fullName} ${exact.size}`;
    const sameModel = (stateData || []).find((item) => (item.barcode || "").slice(0, 5) === code.slice(0, 5));
    return sameModel ? sameModel.fullName : null;
  };

  const colorOf = pointColorMap((stateData || []).map((entry) => entry.symbol));

  return (
    <View style={styles.container}>
      {/* Skaner jak w całej aplikacji (components/scanner/ScanCamera): ramka, „Odczytaj ze zdjęcia”, „Wpisz kod” */}
      <ScanCamera
        enabled={!modalVisible}
        onScanned={handleScan}
        resolveName={resolveScannedName}
        facing={facing}
      />
      <Modal
        visible={modalVisible}
        transparent={true} // Changed to transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="barcode-outline" color="#0D6EFD" title="Znalezione produkty" subtitle={`Pozycji: ${matchedItems.length}`} />
            <FlatList
              data={matchedItems}
              keyExtractor={item => item.id}
              style={{ width: '100%' }}
              renderItem={({ item, index }) => (
                <View style={[look.itemCard, { borderLeftColor: colorOf(item.symbol) }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={look.itemCardText} numberOfLines={1}>
                      {index + 1}. {item.fullName}  {item.size}
                    </Text>
                    {!!item.barcode && <Text style={styles.barcodeText}>{item.barcode}</Text>}
                  </View>
                  <PointPill symbol={item.symbol} color={colorOf(item.symbol)} />
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>Brak wyników</Text>
              }
            />
            <TouchableOpacity
              style={[look.neutralButton, { flex: 0, marginTop: 12 }]}
              onPress={() => setModalVisible(false)}
            >
              <Text style={look.neutralButtonText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc('bg', "black"), color: tc('text', "white") },
  message: { textAlign: "center", marginTop: 20, color: tc('text', "white") },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "#0D6EFD",
    borderRadius: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: tc('bg', '#000000'), // Prawdziwy czarny jak główne tło aplikacji
    borderRadius: 15,
    padding: 25,
    width: '90%',
    maxHeight: '80%',
    borderWidth: 2,
    borderColor: '#0d6efd', // Główny kolor aplikacji
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: tc('text', '#ffffff'),
    textAlign: 'center',
    marginBottom: 20,
  },
  itemContainer: {
    backgroundColor: "#0d6efd",
    paddingVertical: 9, // Same as search.jsx
    paddingHorizontal: 3, // Same as search.jsx
    borderRadius: 5,
    width: "100%",
    marginVertical: 3, // Same as search.jsx
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemText: {
    color: "white",
    fontSize: 12, // Same as search.jsx
    fontWeight: "bold",
    textAlign: "left",
    flex: 1,
  },
  dotsButton: {
    padding: 5, // Same as search.jsx
  },
  dotsText: {
    color: "white",
    fontSize: 12, // Same as search.jsx
    fontWeight: "bold",
  },
  barcodeText: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: tc('muted', '#888'),
    textAlign: 'center',
    marginTop: 24,
    fontSize: 13,
  },
  closeButton: {
    backgroundColor: '#ef4444', // Same red as other modals
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#ffffff',
    alignItems: 'center',
    width: '90%',
    marginTop: 20,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
}));

export default QRScannerSearch;