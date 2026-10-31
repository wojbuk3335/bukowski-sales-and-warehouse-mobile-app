import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import ProductBasePicker from './scanner/ProductBasePicker';
import { KeyboardSafeScreen } from './KeyboardSafe';
import { CurrencyPickerModal, ModalHeader, look } from './AdminLook';
import { createThemedStyles, tc } from '../context/ThemeContext';
import { findGoodForBarcode, findSizeForBarcode } from '../utils/defaultSalePrice';
import { sanitizeAmountInput } from '../utils/amountInput';
import { getApiUrl } from '../config/api';
import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';

// Zwrot kurtki od klienta (31.10.2026): klient oddaje kurtkę i bierze pieniądze z dzisiejszej kasy - bez szukania
// w historii sprzedaży. Skaner jak przy sprzedaży (+ „Z bazy”), potem formularz jak „Nowa sprzedaż” w „Dodaj”:
// kod, produkt, kwota w walutach (wiersze kwota | waluta, „Dodaj walutę”), powód zwrotu, „Anuluj” / „Zwróć”.
// Serwer zapisuje razem: wypłatę z kasy (jedną na walutę) i kurtkę do MAGAZYNU do przetworzenia (Dobieranie).
// Kurtka sprzedana jako „Od Pana Kazka” - pytanie Tak / Nie; „Tak” odejmuje ją z rozliczenia Pana Kazka.
//
// Props: visible, onClose, onSaved({ label, payments }), goods, sizes, currencies [{ code, name, buyRate }],
//        availableFunds { PLN: 1200, ... }

const loadScanCamera = () => { // kamera dopiero po otwarciu okienka
  const mod = require('./scanner/ScanCamera');
  return mod.default || mod;
};
const EMPTY_ROW = { amount: '', currency: 'PLN' };
const newRequestId = () => `cret-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const formatDay = (value) => (value ? new Date(value).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }) : '');
const toNumber = (value) => Number(String(value || '').replace(',', '.'));

const CustomerReturnModal = ({ visible, onClose, onSaved, goods, sizes, currencies = [], availableFunds = {} }) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('scan'); // 'scan' | 'form'
  const [basePickerVisible, setBasePickerVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState('');
  const [info, setInfo] = useState(null); // { fullName, size, kazekSales }
  const [kazekChoice, setKazekChoice] = useState(undefined); // undefined - bez odpowiedzi, null - „nie”, saleId - „tak”
  const [rows, setRows] = useState([EMPTY_ROW]);
  const [currencyFor, setCurrencyFor] = useState(null); // indeks wiersza, dla którego wybieramy walutę
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const requestIdRef = useRef(newRequestId()); // ten sam numer przy ponowieniu po zerwanym połączeniu

  // każde otwarcie zaczyna od skanera
  useEffect(() => {
    if (!visible) return;
    setStep('scan');
    setBasePickerVisible(false);
    setCode('');
    setInfo(null);
    setKazekChoice(undefined);
    setRows([EMPTY_ROW]);
    setCurrencyFor(null);
    setReason('');
    requestIdRef.current = newRequestId();
  }, [visible]);

  const resolveName = (value) => {
    const good = findGoodForBarcode(value, Array.isArray(goods) ? goods : []);
    if (!good) return null;
    const size = findSizeForBarcode(value, Array.isArray(sizes) ? sizes : []);
    return size?.Roz_Opis && !/NIEOKRE/i.test(size.Roz_Opis) ? `${good.fullName} ${size.Roz_Opis}` : good.fullName;
  };

  // Kod ze skanu albo z bazy: serwer podaje nazwę i sprzedaże od Pana Kazka z tym kodem
  const checkCode = async (value) => {
    if (checking) return;
    setChecking(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl(`/transfer/customer-return/check?barcode=${encodeURIComponent(value)}`));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        appAlert('Nie rozpoznano kurtki', data?.message || 'Sprawdź kod albo wybierz kurtkę z bazy.');
        return;
      }
      setCode(value);
      setInfo({ fullName: data.fullName, size: data.size, kazekSales: Array.isArray(data.kazekSales) ? data.kazekSales : [] });
      setKazekChoice(Array.isArray(data.kazekSales) && data.kazekSales.length > 0 ? undefined : null);
      setStep('form');
    } catch (error) {
      appAlert('Brak połączenia', 'Nie udało się sprawdzić kurtki. Spróbuj ponownie.');
    } finally {
      setChecking(false);
    }
  };

  const label = info ? `${info.fullName}${info.size && info.size !== '-' ? ` ${info.size}` : ''}` : '';
  const updateRow = (index, patch) => setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const payments = rows.map((row) => ({ amount: toNumber(row.amount), currency: row.currency || 'PLN' })).filter((row) => row.amount > 0);
  const currencyOptions = currencies.length > 0 ? currencies : [{ code: 'PLN', name: 'Polski złoty', buyRate: 1 }];

  const submit = async () => {
    if (savingRef.current) return;
    if (kazekChoice === undefined) {
      appAlert('Pan Kazek', 'Odpowiedz, czy to kurtka od Pana Kazka.');
      return;
    }
    if (payments.length === 0) {
      appAlert('Kwota', 'Wpisz kwotę, którą oddajesz klientowi.');
      return;
    }
    if (!reason.trim()) {
      appAlert('Powód zwrotu', 'Wpisz powód zwrotu.');
      return;
    }
    // jak przy „Odpisz kwotę”: nie oddamy więcej, niż jest dziś w kasie w danej walucie
    const totals = payments.reduce((acc, row) => ({ ...acc, [row.currency]: (acc[row.currency] || 0) + row.amount }), {});
    const short = Object.entries(totals).find(([currency, sum]) => sum > Number(availableFunds?.[currency] || 0) + 0.004);
    if (short) {
      appAlert('Za mało w kasie', `W kasie jest dziś ${Number(availableFunds?.[short[0]] || 0).toFixed(2)} ${short[0]} - nie można oddać ${short[1].toFixed(2)} ${short[0]}.`);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await tokenService.authenticatedFetch(getApiUrl('/transfer/customer-return'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: code,
          payments,
          reason: reason.trim(),
          panKazekSaleId: kazekChoice || null,
          clientRequestId: requestIdRef.current,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        appAlert('Nie zapisano zwrotu', data?.message || 'Spróbuj ponownie.');
        return;
      }
      onSaved?.({ label, payments });
    } catch (error) {
      appAlert('Brak połączenia', 'Nie udało się zapisać zwrotu. Spróbuj ponownie - zwrot nie zapisze się dwa razy.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const renderScan = () => {
    const ScanCamera = loadScanCamera();
    return (
      <View style={styles.scanContainer} testID="customer-return-scanner">
        <ScanCamera
          enabled={!checking && !basePickerVisible}
          onScanned={({ data }) => checkCode(String(data || '').trim())}
          resolveName={resolveName}
          hint="Zeskanuj metkę oddanej kurtki"
          extraActions={[{ label: 'Z bazy', icon: 'list-outline', testID: 'customer-return-base', onPress: () => setBasePickerVisible(true) }]}
        >
          <TouchableOpacity testID="customer-return-close" style={styles.scanClose} onPress={onClose}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </ScanCamera>
        <ProductBasePicker
          visible={basePickerVisible}
          goods={goods}
          sizes={sizes}
          title="Zwrot - wybierz z bazy"
          onClose={() => setBasePickerVisible(false)}
          onPick={(picked) => { setBasePickerVisible(false); checkCode(picked); }}
        />
      </View>
    );
  };

  // Formularz jak „Nowa sprzedaż” w „Dodaj”: pełny ekran, te same pola, karta płatności z walutami, przyciski na dole
  const renderForm = () => (
    <KeyboardSafeScreen style={styles.screen}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          style={{ width: '100%' }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(120, insets.bottom + 120), paddingHorizontal: 20 }}
        >
          <View testID="customer-return-form">
            <Pressable style={styles.closeButton} onPress={onClose} accessibilityLabel="Zamknij">
              <Ionicons name="close" size={24} color={tc('text', '#fff')} />
            </Pressable>
            <ModalHeader icon="return-down-back" color="#F59E0B" title="Zwrot kurtki" />

            <Text style={look.formLabel}>Kod kreskowy</Text>
            <TextInput style={styles.inputField} value={code} editable={false} />
            <Text style={look.formLabel}>Zwracany produkt</Text>
            <View style={styles.productRow}>
              <TextInput testID="customer-return-product" style={[styles.inputField, { flex: 1, marginBottom: 0 }]} value={label} editable={false} />
              <TouchableOpacity style={styles.rescanTile} onPress={() => setStep('scan')} testID="customer-return-rescan" accessibilityLabel="Skanuj inną kurtkę">
                <Ionicons name="scan-outline" size={20} color="#0D6EFD" />
              </TouchableOpacity>
            </View>

            {/* Pan Kazek: tylko gdy taka kurtka była sprzedana z jego polecenia */}
            {info?.kazekSales?.length > 0 ? (
              <View testID="customer-return-kazek" style={{ gap: 8, marginBottom: 12 }}>
                <Text style={look.formLabel}>Czy to kurtka od Pana Kazka?</Text>
                {info.kazekSales.map((sale) => {
                  const checked = kazekChoice === String(sale.saleId);
                  return (
                    <Pressable
                      key={String(sale.saleId)}
                      testID={`customer-return-kazek-${sale.saleId}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked }}
                      style={[look.optionCard, checked && { borderColor: '#10B981', backgroundColor: '#10B9811F' }]}
                      onPress={() => setKazekChoice(String(sale.saleId))}
                    >
                      <Ionicons name={checked ? 'radio-button-on' : 'radio-button-off'} size={20} color="#10B981" />
                      <Text style={look.optionCardLabel}>
                        {info.kazekSales.length > 1 ? `Tak (${formatDay(sale.timestamp)}${sale.sellingPoint ? `, ${sale.sellingPoint}` : ''})` : 'Tak'}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  testID="customer-return-kazek-no"
                  accessibilityRole="radio"
                  accessibilityState={{ checked: kazekChoice === null }}
                  style={[look.optionCard, kazekChoice === null && { borderColor: '#94A3B8', backgroundColor: '#94A3B81F' }]}
                  onPress={() => setKazekChoice(null)}
                >
                  <Ionicons name={kazekChoice === null ? 'radio-button-on' : 'radio-button-off'} size={20} color="#94A3B8" />
                  <Text style={look.optionCardLabel}>Nie - zwykła kurtka</Text>
                </Pressable>
              </View>
            ) : null}

            <View testID="customer-return-payment" style={styles.paymentCard}>
              <View style={styles.paymentHeader}>
                <View style={[look.optionCardIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Ionicons name="cash-outline" size={20} color="#10B981" />
                </View>
                <Text style={styles.paymentTitle}>Zwrot gotówką</Text>
              </View>
              <Text style={styles.salePriceLabel}>Oddajesz klientowi z dzisiejszej kasy</Text>
              {rows.map((row, index) => (
                <View key={`row-${index}`} style={styles.amountRow}>
                  <TextInput
                    testID={`customer-return-amount-${index}`}
                    style={[look.formInput, { flex: 1.4 }]}
                    placeholderTextColor={tc('muted', '#888')}
                    value={row.amount}
                    onChangeText={(value) => updateRow(index, { amount: sanitizeAmountInput(value) })}
                    placeholder="Wpisz kwotę"
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    testID={`customer-return-currency-${index}`}
                    style={[look.selectField, { flex: 1 }]}
                    onPress={() => setCurrencyFor(index)}
                  >
                    <Text style={look.selectFieldText}>{row.currency || 'PLN'}</Text>
                    <Ionicons name="chevron-down" size={18} color={tc('muted', '#94A3B8')} />
                  </TouchableOpacity>
                  {index > 0 && (
                    <TouchableOpacity accessibilityLabel="Usuń" style={styles.removeTile} onPress={() => setRows((prev) => prev.filter((_, i) => i !== index))}>
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <Pressable style={styles.addPairButton} onPress={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])} testID="customer-return-add-currency">
                <Ionicons name="add" size={20} color="#0D6EFD" />
                <Text style={styles.addPairButtonText}>Dodaj walutę</Text>
              </Pressable>
            </View>

            <Text style={look.formLabel}>Powód zwrotu</Text>
            <TextInput
              testID="customer-return-reason"
              style={[styles.inputField, styles.reasonInput]}
              value={reason}
              onChangeText={setReason}
              placeholder="np. nie pasuje rozmiar, wada zamka"
              placeholderTextColor={tc('muted', '#888')}
              multiline
              maxLength={200}
            />

            <View style={styles.modalButtons}>
              <Pressable style={[styles.button, styles.cancelButton]} onPress={onClose} disabled={saving}>
                <Text style={look.neutralButtonText}>Anuluj</Text>
              </Pressable>
              <Pressable
                testID="customer-return-submit"
                style={[styles.button, styles.addButton, saving && { opacity: 0.6 }]}
                onPress={submit}
                disabled={saving}
              >
                <Text style={look.buttonText}>{saving ? 'Zapisuję…' : 'Zwróć'}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
      <CurrencyPickerModal
        visible={currencyFor !== null}
        options={currencyOptions}
        selected={currencyFor !== null ? rows[currencyFor]?.currency : null}
        onClose={() => setCurrencyFor(null)}
        onSelect={(selected) => { updateRow(currencyFor, { currency: selected }); setCurrencyFor(null); }}
        optionTestID={(item) => `customer-return-currency-option-${item}`}
      />
    </KeyboardSafeScreen>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => (step === 'form' ? setStep('scan') : onClose?.())}>
      {step === 'scan' ? renderScan() : renderForm()}
    </Modal>
  );
};

// Style jak w formularzu „Nowa sprzedaż” (QRScanner)
const styles = createThemedStyles(() => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tc('bg', '#000'),
  },
  scanContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scanClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('surface', '#161622'),
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    marginBottom: 4,
  },
  inputField: {
    backgroundColor: tc('surface2', '#1E1E2D'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 16,
    width: '100%',
    color: tc('text', '#fff'),
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  rescanTile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(13, 110, 253, 0.5)',
    backgroundColor: 'rgba(13, 110, 253, 0.12)',
  },
  reasonInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  paymentCard: {
    width: '100%',
    backgroundColor: tc('surface', '#161622'),
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  paymentTitle: {
    color: tc('text', '#fff'),
    fontSize: 16,
    fontWeight: '600',
  },
  salePriceLabel: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 6,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  removeTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  addPairButton: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#0D6EFD',
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPairButtonText: {
    color: '#0D6EFD',
    fontSize: 15,
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: tc('surface2', '#2a2a3e'),
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
  },
  addButton: {
    backgroundColor: '#10B981',
  },
}));

export default CustomerReturnModal;
