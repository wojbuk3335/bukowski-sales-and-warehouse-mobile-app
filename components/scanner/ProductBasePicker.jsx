import React, { useMemo, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { KeyboardSafeOverlay } from '../KeyboardSafe';
import { ModalHeader, look } from '../AdminLook';
import { createThemedStyles, tc } from '../../context/ThemeContext';
import { jacketCodeForSize } from '../../utils/productName';
import { searchWords, filterBySearch } from '../../utils/searchText';

// „Z bazy” (30.10.2026): wybór produktu z kart produktów zamiast skanu metki - jak w skanerze Remanentu.
// Kurtka wymaga rozmiaru; wynik to kod metki (kurtki: model + kolor z karty + rozmiar + 0000 + cyfra kontrolna,
// reszta: kod karty), który dalej idzie tą samą drogą co zeskanowany kod.
//
// Props: visible, goods, sizes, onPick(code), onClose, title?
const JACKETS = 'Kurtki kożuchy futra';

const ProductBasePicker = ({ visible, goods, sizes, onPick, onClose, title = 'Wybierz z bazy produktów' }) => {
  const [search, setSearch] = useState('');
  const [pickedGood, setPickedGood] = useState(null);

  const results = useMemo(() => filterBySearch(
    (Array.isArray(goods) ? goods : []).filter((good) => good?.fullName && good?.code),
    (good) => [good.fullName, good.category],
    searchWords(search)
  ).slice().sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), 'pl')).slice(0, 60), [goods, search]);

  const pickerSizes = useMemo(() => (Array.isArray(sizes) ? sizes : [])
    .filter((size) => size?.Roz_Kod && size?.Roz_Opis && !/NIEOKRE/i.test(size.Roz_Opis))
    .sort((a, b) => String(a.Roz_Kod).localeCompare(String(b.Roz_Kod))), [sizes]);

  const close = () => {
    setSearch('');
    setPickedGood(null);
    onClose?.();
  };
  const pick = (code) => {
    setSearch('');
    setPickedGood(null);
    onPick?.(code);
  };
  const chooseGood = (good) => {
    if (good.category === JACKETS) {
      setPickedGood(good);
      return;
    }
    pick(String(good.code));
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={() => (pickedGood ? setPickedGood(null) : close())}>
      <KeyboardSafeOverlay>
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, { maxHeight: '88%' }]} testID="product-base-picker">
            <ModalHeader icon="list-outline" title={pickedGood ? 'Wybierz rozmiar' : title} subtitle={pickedGood ? pickedGood.fullName : null} />
            {pickedGood ? (
              <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                <View style={styles.sizeGrid}>
                  {pickerSizes.map((size) => (
                    <TouchableOpacity
                      key={size.Roz_Kod}
                      testID={`product-base-size-${size.Roz_Opis}`}
                      style={styles.sizeChip}
                      onPress={() => pick(jacketCodeForSize(pickedGood.code, size.Roz_Kod))}
                    >
                      <Text style={styles.sizeText}>{size.Roz_Opis}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={16} color={tc('muted', '#94A3B8')} />
                  <TextInput
                    testID="product-base-search"
                    style={styles.searchInput}
                    placeholder="Szukaj: np. amanda czarny"
                    placeholderTextColor={tc('muted', '#64748B')}
                    value={search}
                    onChangeText={setSearch}
                    autoCorrect={false}
                  />
                  {search ? (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <Ionicons name="close-circle" size={16} color={tc('muted', '#94A3B8')} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <FlatList
                  data={results}
                  keyExtractor={(good) => String(good._id || good.code)}
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 360 }}
                  initialNumToRender={15}
                  ListEmptyComponent={(
                    <Text style={styles.empty}>
                      {(goods || []).length === 0 ? 'Karty produktów jeszcze się wczytują…' : 'Brak produktów dla tego wyszukiwania'}
                    </Text>
                  )}
                  renderItem={({ item: good }) => (
                    <TouchableOpacity style={styles.row} onPress={() => chooseGood(good)} testID={`product-base-good-${good._id || good.code}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{good.fullName}</Text>
                        <Text style={styles.rowSub}>{good.category || ''}{good.category === JACKETS ? ' · wybierz rozmiar' : ''}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={tc('muted', '#94A3B8')} />
                    </TouchableOpacity>
                  )}
                />
              </>
            )}
            <TouchableOpacity
              style={[look.neutralButton, { flex: 0, alignSelf: 'stretch', marginTop: 12, paddingVertical: 12 }]}
              onPress={() => (pickedGood ? setPickedGood(null) : close())}
            >
              <Text style={look.neutralButtonText} numberOfLines={1}>{pickedGood ? 'Wstecz' : 'Anuluj'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardSafeOverlay>
    </Modal>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: tc('text', '#fff'),
    fontSize: 15,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tc('border', '#1E293B'),
  },
  rowTitle: {
    color: tc('text', '#fff'),
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    color: tc('muted', '#94A3B8'),
    textAlign: 'center',
    padding: 16,
  },
  sizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sizeChip: {
    minWidth: 64,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    backgroundColor: tc('surface2', '#1E1E2D'),
    alignItems: 'center',
  },
  sizeText: {
    color: tc('text', '#fff'),
    fontSize: 15,
    fontWeight: '700',
  },
}));

export default ProductBasePicker;
