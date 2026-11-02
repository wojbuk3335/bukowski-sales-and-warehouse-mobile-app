import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardSafeOverlay } from '../KeyboardSafe';
import { ModalHeader, look } from '../AdminLook';
import { createThemedStyles, tc } from '../../context/ThemeContext';
import { jacketCodeForSize } from '../../utils/productName';
import { searchWords, filterBySearch } from '../../utils/searchText';

// Remanent MAGAZYNU - „Z bazy” z ekranu głównego (2.11.2026): trzy kroki w jednym okienku, każdy to pole z podpowiedziami
// (wpisujesz - lista się zawęża - wybierasz, Enter przy jednym trafieniu wybiera od razu), po wyborze przejście dalej samo:
//   1. produkt (model + kolor z karty produktu)  2. rozmiar (tylko kurtki)  3. ilość sztuk -> zapis.
// Z `preset` ({ code, name, current }) okienko zaczyna od ilości - poprawka pozycji z listy (×N).
// onSubmit({ code, name, count }) -> Promise<boolean>; true = zapisane (okienko się zamyka), false = zostaje otwarte.
// validateCode(code, { name }) -> { ok, message } - ten sam sprawdzian co dla skanu (nieznany kod, filtry).
const JACKETS = 'Kurtki kożuchy futra';
const MAX_COUNT = 999;

const WarehouseCountWizard = ({ visible, goods, sizes, preset = null, resolveName, validateCode, onSubmit, onClose }) => {
  const [step, setStep] = useState('product'); // product | size | quantity
  const [productText, setProductText] = useState('');
  const [sizeText, setSizeText] = useState('');
  const [quantityText, setQuantityText] = useState('');
  const [good, setGood] = useState(null);
  const [picked, setPicked] = useState(null); // { code, name }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const quantityRef = useRef(null);

  // Każde otwarcie zaczyna od zera: dodawanie od produktu, poprawka (preset) od ilości
  useEffect(() => {
    if (!visible) return;
    setError('');
    setBusy(false);
    setProductText('');
    setSizeText('');
    setGood(null);
    if (preset?.code) {
      setPicked({ code: preset.code, name: preset.name || preset.code });
      setQuantityText(preset.current > 0 ? String(preset.current) : '');
      setStep('quantity');
    } else {
      setPicked(null);
      setQuantityText('');
      setStep('product');
    }
  }, [visible, preset]);

  const goodsList = useMemo(() => (Array.isArray(goods) ? goods : []).filter((item) => item?.fullName && item?.code), [goods]);
  const products = useMemo(() => filterBySearch(goodsList, (item) => [item.fullName, item.category], searchWords(productText))
    .slice().sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), 'pl')).slice(0, 40), [goodsList, productText]);

  const allSizes = useMemo(() => (Array.isArray(sizes) ? sizes : [])
    .filter((size) => size?.Roz_Kod && size?.Roz_Opis && !/NIEOKRE/i.test(size.Roz_Opis))
    .sort((a, b) => String(a.Roz_Kod).localeCompare(String(b.Roz_Kod))), [sizes]);
  const sizeOptions = useMemo(() => {
    const text = sizeText.trim().toLowerCase();
    if (!text) return allSizes;
    return allSizes.filter((size) => String(size.Roz_Opis).toLowerCase().includes(text));
  }, [allSizes, sizeText]);

  const goToQuantity = (code, name) => {
    const verdict = validateCode ? validateCode(code, { name }) : { ok: true };
    if (verdict && verdict.ok === false) {
      setError(verdict.message || 'Tego produktu nie można dodać.');
      return;
    }
    setError('');
    setPicked({ code, name });
    setQuantityText('');
    setStep('quantity');
  };
  const nameFor = (code, fallback) => {
    try {
      const resolved = resolveName ? resolveName(code) : null;
      if (resolved && !String(resolved).startsWith('Nieznany kod')) return resolved;
    } catch (_error) { /* nazwa zapasowa */ }
    return fallback;
  };
  const chooseGood = (item) => {
    setError('');
    setGood(item);
    if (item.category === JACKETS) {
      setSizeText('');
      setStep('size');
      return;
    }
    const code = String(item.code);
    goToQuantity(code, nameFor(code, item.fullName));
  };
  const chooseSize = (size) => {
    if (!good) return;
    const code = jacketCodeForSize(good.code, size.Roz_Kod);
    goToQuantity(code, nameFor(code, `${good.fullName} ${size.Roz_Opis}`));
  };
  // Enter w polu: jedno trafienie (albo rozmiar wpisany dokładnie) = wybór bez klikania
  const submitProduct = () => {
    if (products.length === 1) chooseGood(products[0]);
  };
  const submitSize = () => {
    const exact = sizeOptions.find((size) => String(size.Roz_Opis).toLowerCase() === sizeText.trim().toLowerCase());
    if (exact) chooseSize(exact);
    else if (sizeOptions.length === 1) chooseSize(sizeOptions[0]);
  };
  const submitQuantity = async () => {
    if (!picked || busy) return;
    const text = quantityText.trim();
    const count = text ? Number(text) : NaN; // puste pole to NIE zero - zero (usunięcie pozycji) trzeba wpisać świadomie
    if (!Number.isInteger(count) || count < 0 || count > MAX_COUNT) {
      setError(`Podaj liczbę sztuk od 0 do ${MAX_COUNT}.`);
      return;
    }
    setBusy(true);
    try {
      const saved = await onSubmit?.({ code: picked.code, name: picked.name, count });
      if (saved) onClose?.();
    } finally {
      setBusy(false);
    }
  };
  const back = () => {
    setError('');
    if (step === 'quantity' && !preset) setStep(good?.category === JACKETS ? 'size' : 'product');
    else if (step === 'size') setStep('product');
    else onClose?.();
  };

  const isEdit = Boolean(preset?.code);
  const title = step === 'product' ? 'Produkt' : step === 'size' ? 'Rozmiar' : (isEdit ? 'Zmień ilość' : 'Ile sztuk?');
  const subtitle = step === 'product'
    ? 'Krok 1 z 3 · model i kolor'
    : step === 'size'
      ? `Krok 2 z 3 · ${good?.fullName || ''}`
      : (picked?.name || '');

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={back}>
      <KeyboardSafeOverlay>
        <View style={look.modalOverlay}>
          <View style={[look.modalContent, { maxHeight: '88%' }]} testID="warehouse-count-wizard">
            <ModalHeader icon={step === 'quantity' ? 'calculator-outline' : 'list-outline'} title={title} subtitle={subtitle} />

            {step === 'product' ? (
              <>
                <TextInput
                  testID="wizard-product-input"
                  style={styles.input}
                  placeholder="Wpisz: np. amanda czarny"
                  placeholderTextColor={tc('muted', '#64748B')}
                  value={productText}
                  onChangeText={(text) => { setProductText(text); setError(''); }}
                  autoFocus
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="next"
                  onSubmitEditing={submitProduct}
                />
                <FlatList
                  data={products}
                  keyExtractor={(item) => String(item._id || item.code)}
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 300 }}
                  initialNumToRender={12}
                  ListEmptyComponent={(
                    <Text style={styles.empty}>{goodsList.length === 0 ? 'Karty produktów jeszcze się wczytują…' : 'Brak produktów dla tego wpisu'}</Text>
                  )}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.row} onPress={() => chooseGood(item)} testID={`wizard-good-${item._id || item.code}`}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{item.fullName}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{item.category || ''}{item.category === JACKETS ? ' · dalej rozmiar' : ' · dalej ilość'}</Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            ) : null}

            {step === 'size' ? (
              <>
                <TextInput
                  testID="wizard-size-input"
                  style={styles.input}
                  placeholder="Wpisz rozmiar: np. 44 albo L"
                  placeholderTextColor={tc('muted', '#64748B')}
                  value={sizeText}
                  onChangeText={(text) => { setSizeText(text); setError(''); }}
                  autoFocus
                  autoCorrect={false}
                  autoCapitalize="characters"
                  returnKeyType="next"
                  onSubmitEditing={submitSize}
                />
                <FlatList
                  data={sizeOptions}
                  keyExtractor={(size) => String(size.Roz_Kod)}
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 300 }}
                  ListEmptyComponent={<Text style={styles.empty}>Brak takiego rozmiaru</Text>}
                  renderItem={({ item: size }) => (
                    <TouchableOpacity style={styles.row} onPress={() => chooseSize(size)} testID={`wizard-size-${size.Roz_Opis}`}>
                      <Text style={styles.rowTitle}>{size.Roz_Opis}</Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            ) : null}

            {step === 'quantity' ? (
              <>
                <Text style={styles.hint}>
                  {isEdit && preset.current > 0
                    ? `Policzono już ${preset.current} szt. - wpisz łączną liczbę (0 usuwa pozycję).`
                    : 'Łączna liczba sztuk tego produktu w magazynie.'}
                </Text>
                <TextInput
                  ref={quantityRef}
                  testID="wizard-quantity-input"
                  style={[styles.input, styles.quantityInput]}
                  value={quantityText}
                  onChangeText={(text) => { setQuantityText(text.replace(/[^0-9]/g, '').slice(0, 3)); setError(''); }}
                  keyboardType="number-pad"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={submitQuantity}
                  placeholder="0"
                  placeholderTextColor={tc('muted', '#64748B')}
                />
              </>
            ) : null}

            {error ? <Text style={styles.error} testID="wizard-error">{error}</Text> : null}

            <View style={styles.buttons}>
              {step === 'quantity' ? (
                <TouchableOpacity
                  style={[look.primaryButton, styles.button, busy && look.disabled]}
                  onPress={submitQuantity}
                  disabled={busy}
                  testID="wizard-save"
                >
                  {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={look.buttonText}>{isEdit ? 'Zapisz' : 'Dodaj do listy'}</Text>}
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[look.neutralButton, styles.button]} onPress={back} disabled={busy} testID="wizard-back">
                <Text style={look.neutralButtonText}>{step === 'product' || isEdit ? 'Anuluj' : 'Wstecz'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardSafeOverlay>
    </Modal>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  input: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: tc('text', '#fff'),
    fontSize: 16,
    marginBottom: 8,
  },
  quantityInput: {
    fontSize: 24,
    textAlign: 'center',
    fontWeight: '700',
  },
  row: {
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
  hint: {
    color: tc('muted', '#CBD5E1'),
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
  },
  error: {
    color: '#F59E0B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  buttons: {
    gap: 10,
    marginTop: 12,
  },
  button: {
    flex: 0,
    alignSelf: 'stretch',
    paddingVertical: 12,
  },
}));

export default WarehouseCountWizard;
