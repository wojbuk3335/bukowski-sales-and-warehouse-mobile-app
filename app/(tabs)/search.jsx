import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useCallback, useContext, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlobalStateContext } from '../../context/GlobalState';
import Logger from '../../services/logger'; // Import logger service
import QRScannerSearch from '../QRScannerSearch';
import LogoutButton from '../../components/LogoutButton';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BackButton, MenuCard, PointPill, pointColorMap, ScreenHeader, look } from '../../components/AdminLook';
import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu
const SearchScreen = () => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const insets = useSafeAreaInsets(); // Get safe area insets
  const [showQR, setShowQR] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false); // Dodano stan dla pull-to-refresh
  const isFocused = useIsFocused();
  const { stateData, user, sizes, colors, goods, fetchState } = useContext(GlobalStateContext);

  useFocusEffect(
    useCallback(() => {
      setShowQR(false);
      setShowSearchBar(false);
      return () => {
        setShowQR(false);
        setShowSearchBar(false);
      };
    }, [])
  );

  // Funkcja odświeżania dla pull-to-refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchState(); // Odświeżenie danych z backendu
    } catch (error) {
      Logger.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredData = stateData?.filter(item => {
    const search = searchText.trim().toLowerCase();
    if (!search) return true;
    const searchWords = search.split(/\s+/);
    const color = (item.color || '').toLowerCase();

    // Polish color stemming: remove common endings for basic matching
    const stemPolishColor = (str) =>
      str
        .replace(/(y|a|e|ego|ej|ą|ę|i|iego|iej|ym|im|ie|ich|ych|emu|emu|ący|ąca|ące|ami|ami|owi|owie|ów|om|ach|u|o|ą)$/g, '');

    const itemString = (
      (item.fullName || '') + ' ' +
      (item.size || '') + ' ' +
      (item.symbol || '') + ' ' +
      (item.barcode || '') + ' ' +
      color
    ).toLowerCase();

    return searchWords.every(word => {
      // Try stemmed color matching for Polish endings
      if (color && (stemPolishColor(color) === stemPolishColor(word))) return true;
      if (itemString.includes(word)) return true;
      // Also try stemmed word in itemString
      if (itemString.includes(stemPolishColor(word))) return true;
      return false;
    });
  })?.sort((a, b) => {
    // Sortowanie alfabetyczne według fullName
    const nameA = (a.fullName || '').toLowerCase();
    const nameB = (b.fullName || '').toLowerCase();
    return nameA.localeCompare(nameB, 'pl', { sensitivity: 'base' });
  }) || [];

  // Kolor plakietki dla każdego punktu (różne kolory, magazyn pomarańczowy)
  const colorOf = pointColorMap((stateData || []).map((entry) => entry.symbol));

  if (showQR) {
    return (
      <View style={{ flex: 1, backgroundColor: tc('bg', 'black') }}>
        <QRScannerSearch
          stateData={stateData}
          user={user}
          sizes={sizes}
          colors={colors}
          goods={goods}
          isActive={isFocused}
        />
        <View style={{ padding: 16, paddingBottom: Math.max(16, insets.bottom + 8), backgroundColor: tc('bg', 'black') }}>
          <TouchableOpacity
            style={[look.neutralButton, { flex: 0, flexDirection: 'row', gap: 8 }]}
            onPress={() => setShowQR(false)}
          >
            <Ionicons name="chevron-back" size={20} color={tc('text', '#fff')} />
            <Text style={look.neutralButtonText}>Powrót</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (showSearchBar) {
    return (
      <View style={styles.searchBarContainer}>
        <View style={styles.searchBarRow}>
          <BackButton testID="search-back-button" onPress={() => setShowSearchBar(false)} />
          <View style={styles.searchField}>
            <Ionicons name="search" size={20} color={tc('muted', '#94A3B8')} />
            <TextInput
              style={styles.searchBar}
              placeholder="Nazwa, kolor, rozmiar, kod, punkt..."
              placeholderTextColor={tc('muted', "#888")}
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
            />
            {!!searchText && (
              <TouchableOpacity accessibilityLabel="Wyczyść" onPress={() => setSearchText('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={20} color={tc('muted', '#94A3B8')} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Text style={styles.resultCount}>Wyników: {filteredData.length}</Text>
        <FlatList
          testID="search-flatlist"
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: Math.max(120, insets.bottom + 120) }}
          data={filteredData}
          keyExtractor={item => item.id}
          onRefresh={handleRefresh} // Dodano funkcję odświeżania
          refreshing={isRefreshing} // Dodano stan odświeżania
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
            <View style={look.emptyState}>
              <Ionicons name="search-outline" size={40} color={tc('muted', '#94A3B8')} />
              <Text style={look.emptyStateText}>Brak wyników</Text>
            </View>
          }
          keyboardShouldPersistTaps="handled"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LogoutButton position="top-right" />
      <View style={{ paddingHorizontal: 12 }}>
        <ScreenHeader icon="search" title="Szukaj" subtitle="Znajdź produkt w stanach wszystkich punktów" />
        <MenuCard
          testID="search-by-code"
          icon="barcode-outline"
          color="#0D6EFD"
          title="Wyszukaj po kodzie"
          subtitle="Zeskanuj kod kreskowy aparatem"
          onPress={() => setShowQR(true)}
        />
        <MenuCard
          testID="search-by-text"
          icon="search"
          color="#10B981"
          title="Wyszukaj w wyszukiwarce"
          subtitle="Nazwa, kolor, rozmiar, kod albo punkt"
          onPress={() => setShowSearchBar(true)}
        />
      </View>
    </View>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc('bg', 'black'),
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
  optionButton: {
    backgroundColor: '#0d6efd', // Główny kolor aplikacji
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#ffffff',
    alignItems: 'center',
    width: '90%',
  },
  optionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: '#ef4444',
    marginTop: 10,
  },
  closeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchBarContainer: {
    flex: 1,
    backgroundColor: tc('bg', 'black'),
    justifyContent: 'flex-start',
    paddingTop: 48,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tc('surface', '#161622'),
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchBar: {
    flex: 1,
    color: tc('text', '#fff'),
    fontSize: 16,
    paddingVertical: 0,
  },
  resultCount: {
    color: tc('muted', '#94A3B8'),
    fontSize: 13,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  barcodeText: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    marginTop: 2,
  },
  listItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#333'),
  },
  listItemText: {
    color: tc('text', '#fff'),
    fontSize: 13,
  },
  emptyText: {
    color: tc('muted', '#888'),
    textAlign: 'center',
    marginTop: 24,
    fontSize: 13,
  },
  // --- Items styles same as writeoff.jsx ---
  item: {
    backgroundColor: "#0d6efd",
    paddingVertical: 9, // Increased from 7 for even more vertical space
    paddingHorizontal: 3, // Keep horizontal padding minimal
    borderRadius: 5,
    width: "100%",
    marginVertical: 3, // Zmniejszono z 5 na 3
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemTextLeft: {
    color: "white",
    fontSize: 12, // Delikatnie zwiększono z 11 na 12
    fontWeight: "bold", // Standardized font weight
    textAlign: "left",
    flex: 1,
  },
  dotsButton: {
    padding: 5,
  },
  dotsText: {
    color: tc('text', "white"),
    fontSize: 12, // Smaller font for symbol
    fontWeight: "bold",
  },
  
}));

export default SearchScreen;
