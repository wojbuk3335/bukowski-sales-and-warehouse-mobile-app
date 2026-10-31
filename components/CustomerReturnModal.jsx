import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import ProductBasePicker from './scanner/ProductBasePicker';
import { KeyboardSafeOverlay } from './KeyboardSafe';
import { ActionItem, ModalHeader, look } from './AdminLook';
import { createThemedStyles, tc } from '../context/ThemeContext';
import { findGoodForBarcode, findSizeForBarcode } from '../utils/defaultSalePrice';
import { sanitizeAmountInput } from '../utils/amountInput';
import { getApiUrl } from '../config/api';
import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';

// Zwrot kurtki od klienta (31.10.2026): klient oddaje kurtkę i bierze pieniądze z dzisiejszej kasy - bez szukania
// w historii sprzedaży. Skaner jak przy sprzedaży (+ „Z bazy”, gdy kurtka bez metki), kwota, powód, „Zwróć”.
// Serwer zapisuje razem: wypłatę „Zwrot kurtki” w kasie i kurtkę do MAGAZYNU do przetworzenia (Dobieranie).
// Gdy taka kurtka była sprzedana jako „Od Pana Kazka” - pytanie, czy to ta (wtedy odliczenie / nie płacimy).
//
// Props: visible, onClose, onSaved({ label, amount, currency, panKazek }), goods, sizes, availableFunds { PLN: 1200, ... }

const loadScanCamera = () => { // kamera dopiero po otwarciu okienka
  const mod = require('./scanner/ScanCamera');
  return mod.default || mod;
};
const REASONS = ['Nie pasuje', 'Wada', 'Rozmyślił się'];
const OTHER = 'Inny';
const newRequestId = () => `cret-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const formatDay = (value) => (value ? new Date(value).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }) : '');

const CustomerReturnModal = ({ visible, onClose, onSaved, goods, sizes, availableFunds = {} }) => {
  const [step, setStep] = useState('scan'); // 'scan' | 'form'
  const [basePickerVisible, setBasePickerVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState('');
  const [info, setInfo] = useState(null); // { fullName, size, kazekSales }
  const [kazekChoice, setKazekChoice] = useState(undefined); // undefined - bez odpowiedzi, null - „nie”, saleId - „tak”
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('PLN');
  const [reason, setReason] = useState(REASONS[0]);
  const [customReason, setCustomReason] = useState('');
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
    setAmount('');
    setCurrency('PLN');
    setReason(REASONS[0]);
    setCustomReason('');
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
  const finalReason = reason === OTHER ? customReason.trim() : reason;
  const numericAmount = Number(String(amount || '').replace(',', '.'));
  const currencies = [...new Set(['PLN', ...Object.keys(availableFunds || {})])];

  const submit = async () => {
    if (savingRef.current) return;
    if (kazekChoice === undefined) {
      appAlert('Pan Kazek', 'Odpowiedz, czy to kurtka od Pana Kazka.');
      return;
    }
    if (!(numericAmount > 0)) {
      appAlert('Kwota', 'Wpisz kwotę, którą oddajesz klientowi.');
      return;
    }
    if (!finalReason) {
      appAlert('Powód', 'Wpisz powód zwrotu.');
      return;
    }
    // jak przy „Odpisz kwotę”: nie oddamy więcej, niż jest dziś w kasie w tej walucie
    const available = Number(availableFunds?.[currency] || 0);
    if (numericAmount > available + 0.004) {
      appAlert('Za mało w kasie', `W kasie jest dziś ${available.toFixed(2)} ${currency} - nie można oddać ${numericAmount.toFixed(2)} ${currency}.`);
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
          amount: numericAmount,
          currency,
          reason: finalReason,
          panKazekSaleId: kazekChoice || null,
          clientRequestId: requestIdRef.current,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        appAlert('Nie zapisano zwrotu', data?.message || 'Spróbuj ponownie.');
        return;
      }
      onSaved?.({ label, amount: numericAmount, currency, panKazek: data.panKazek || null });
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

  const renderForm = () => (
    <KeyboardSafeOverlay>
      <View style={look.modalOverlay}>
        <View style={[look.modalContent, { maxHeight: '92%' }]} testID="customer-return-form">
          <ModalHeader icon="return-down-back" color="#EF4444" title="Zwrot kurtki" subtitle="Pieniądze z dzisiejszej kasy, kurtka do MAGAZYNU" />
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
            <View style={styles.productRow}>
              <Text style={styles.productName} testID="customer-return-product">{label}</Text>
              <TouchableOpacity onPress={() => setStep('scan')} testID="customer-return-rescan">
                <Text style={styles.link}>Zmień</Text>
              </TouchableOpacity>
            </View>

            {/* Pan Kazek: tylko gdy taka kurtka była sprzedana z jego polecenia */}
            {info?.kazekSales?.length > 0 ? (
              <View style={styles.kazekBox} testID="customer-return-kazek">
                <Text style={styles.kazekTitle}>Czy to kurtka od Pana Kazka?</Text>
                {info.kazekSales.map((sale) => (
                  <ActionItem
                    key={String(sale.saleId)}
                    testID={`customer-return-kazek-${sale.saleId}`}
                    icon={kazekChoice === String(sale.saleId) ? 'checkmark-circle' : 'person'}
                    color="#10B981"
                    label={`Tak - sprzedana ${formatDay(sale.timestamp)}${sale.sellingPoint ? ` w ${sale.sellingPoint}` : ''}`}
                    note={[sale.priceLabel, sale.status === 'paid' ? `rozliczona - odliczymy ${Number(sale.paidRate || 0).toFixed(2)} zł` : 'nierozliczona - nie zapłacimy'].filter(Boolean).join(' · ')}
                    onPress={() => setKazekChoice(String(sale.saleId))}
                  />
                ))}
                <ActionItem
                  testID="customer-return-kazek-no"
                  icon={kazekChoice === null ? 'checkmark-circle' : 'close-circle-outline'}
                  color="#94A3B8"
                  label="Nie - zwykła kurtka"
                  onPress={() => setKazekChoice(null)}
                />
              </View>
            ) : null}

            <Text style={look.formLabel}>Kwota do oddania</Text>
            <View style={styles.amountRow}>
              <TextInput
                testID="customer-return-amount"
                style={[look.formInput, { flex: 1 }]}
                value={amount}
                onChangeText={(value) => setAmount(sanitizeAmountInput(value))}
                keyboardType="decimal-pad"
                placeholder="np. 850"
                placeholderTextColor={tc('muted', '#64748B')}
              />
            </View>
            <View style={styles.chips}>
              {currencies.map((item) => (
                <TouchableOpacity
                  key={item}
                  testID={`customer-return-currency-${item}`}
                  style={[styles.chip, currency === item && styles.chipSelected]}
                  onPress={() => setCurrency(item)}
                >
                  <Text style={[styles.chipText, currency === item && styles.chipTextSelected]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>W kasie dziś: {Number(availableFunds?.[currency] || 0).toFixed(2)} {currency}</Text>

            <Text style={[look.formLabel, { marginTop: 12 }]}>Powód</Text>
            <View style={styles.chips}>
              {[...REASONS, OTHER].map((item) => (
                <TouchableOpacity
                  key={item}
                  testID={`customer-return-reason-${item}`}
                  style={[styles.chip, reason === item && styles.chipSelected]}
                  onPress={() => setReason(item)}
                >
                  <Text style={[styles.chipText, reason === item && styles.chipTextSelected]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {reason === OTHER ? (
              <TextInput
                testID="customer-return-custom-reason"
                style={[look.formInput, { marginTop: 8 }]}
                value={customReason}
                onChangeText={setCustomReason}
                placeholder="Wpisz powód"
                placeholderTextColor={tc('muted', '#64748B')}
                maxLength={150}
              />
            ) : null}
          </ScrollView>

          <View style={look.buttonRow}>
            <TouchableOpacity style={look.neutralButton} onPress={onClose} disabled={saving}>
              <Text style={look.neutralButtonText}>Anuluj</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="customer-return-submit"
              style={[look.primaryButton, { backgroundColor: '#EF4444' }, saving && look.disabled]}
              onPress={submit}
              disabled={saving}
            >
              <Text style={look.buttonText} numberOfLines={1}>
                {saving ? 'Zapisywanie…' : (numericAmount > 0 ? `Zwróć ${numericAmount.toFixed(2)} ${currency}` : 'Zwróć')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardSafeOverlay>
  );

  return (
    <Modal visible={visible} transparent={step !== 'scan'} animationType="slide" onRequestClose={() => (step === 'form' ? setStep('scan') : onClose?.())}>
      {step === 'scan' ? renderScan() : renderForm()}
    </Modal>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
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
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  productName: {
    flex: 1,
    color: tc('text', '#fff'),
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    color: '#0D6EFD',
    fontSize: 14,
    fontWeight: '600',
  },
  kazekBox: {
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  kazekTitle: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  amountRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tc('border', '#334155'),
    backgroundColor: tc('surface2', '#1E1E2D'),
  },
  chipSelected: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  chipText: {
    color: tc('text', '#fff'),
    fontSize: 14,
  },
  chipTextSelected: {
    color: '#EF4444',
    fontWeight: '700',
  },
  hint: {
    color: tc('muted', '#94A3B8'),
    fontSize: 12,
    marginTop: 6,
  },
}));

export default CustomerReturnModal;
