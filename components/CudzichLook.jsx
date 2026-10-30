import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { createThemedStyles, tc } from '../context/ThemeContext';

// Wspólny wygląd Cudzicha (30.10.2026): zakładka punktu P i ekran admina (Różne → Cudzich) pokazują saldo
// i transakcje tymi samymi kartami - w stylu panelu admina (karta z kolorowym paskiem, kafelek ikony, plakietka).

// Typy transakcji: nazwa, kolor, ikona i wpływ na saldo (saldo = +odbiór +wypłata −zwrot −wpłata, jak na serwerze)
export const CUDZICH_TYPES = {
  odbior: { label: 'Odbiór', color: '#22C55E', icon: 'arrow-down-circle', sign: 1 },
  zwrot: { label: 'Zwrot', color: '#EF4444', icon: 'arrow-up-circle', sign: -1 },
  wplata: { label: 'Wpłata', color: '#3B82F6', icon: 'wallet', sign: -1 },
  wyplata: { label: 'Wypłata', color: '#F59E0B', icon: 'cash', sign: 1 },
};
const UNKNOWN_TYPE = { label: '?', color: '#64748B', icon: 'swap-horizontal', sign: 1 };
export const cudzichType = (type) => CUDZICH_TYPES[type] || { ...UNKNOWN_TYPE, label: type || '?' };

const formatAmount = (value) => {
  const amount = Number(value) || 0;
  return amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('pl-PL', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

// Saldo słownie (30.10.2026): kto komu ile oddaje - zamiast samej liczby ze znakiem
// dodatnie = Cudzich jest nam winien, ujemne = należy zwrócić Cudzichowi (kredyt ze zwrotów), zero = rozliczone
export const cudzichBalanceInfo = (balance) => {
  const value = Number(balance) || 0;
  if (value > 0.004) return { label: 'Cudzich jest nam winien', color: '#EF4444', icon: 'arrow-down-circle-outline', amount: value };
  if (value < -0.004) return { label: 'Należy zwrócić Cudzichowi', color: '#F59E0B', icon: 'arrow-up-circle-outline', amount: -value };
  return { label: 'Rozliczone - nikt nikomu nic nie jest winien', color: '#10B981', icon: 'checkmark-circle-outline', amount: 0 };
};

/** Karta salda: słownie, kto komu ile oddaje (kwota zawsze dodatnia), licznik kurtek u Cudzicha. */
export const CudzichBalanceCard = ({ balance, itemsCount = null, style }) => {
  const { label, color, icon, amount } = cudzichBalanceInfo(balance);
  return (
    <View style={[styles.balanceCard, { borderLeftColor: color }, style]} testID="cudzich-balance-card">
      <View style={styles.balanceHeader}>
        <View style={[styles.balanceIcon, { backgroundColor: `${color}26` }]}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        <Text style={[styles.balanceLabel, { color, flex: 1 }]} testID="cudzich-balance-label">{label}</Text>
      </View>
      <Text style={[styles.balanceAmount, { color }]} testID="cudzich-balance-amount">{formatAmount(amount)} zł</Text>
      {itemsCount !== null ? (
        <View style={styles.itemsRow} testID="cudzich-items-count">
          <Ionicons name="shirt-outline" size={16} color={tc('muted', '#94A3B8')} />
          <Text style={styles.itemsText}>U Cudzicha: {itemsCount} {itemsCount === 1 ? 'kurtka' : (itemsCount % 10 >= 2 && itemsCount % 10 <= 4 && (itemsCount % 100 < 10 || itemsCount % 100 >= 20) ? 'kurtki' : 'kurtek')}</Text>
        </View>
      ) : null}
    </View>
  );
};

/** Karta transakcji: kolorowy pasek i plakietka typu, data, produkt, rozmiar, kwota ze znakiem wpływu na saldo, uwagi. */
export const CudzichTransactionCard = ({ transaction }) => {
  const meta = cudzichType(transaction.type);
  const amount = Number(transaction.price ?? transaction.amount) || 0;
  const notes = transaction.notes || transaction.note;
  return (
    <View style={[styles.card, { borderLeftColor: meta.color }]} testID={`cudzich-transaction-${transaction._id}`}>
      <View style={styles.cardHeader}>
        <View style={styles.typeSection}>
          <View style={[styles.typeIcon, { backgroundColor: `${meta.color}26` }]}>
            <Ionicons name={meta.icon} size={20} color={meta.color} />
          </View>
          <View style={[styles.typeBadge, { backgroundColor: `${meta.color}26`, borderColor: `${meta.color}80` }]}>
            <Text style={[styles.typeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={[styles.amount, { color: meta.color }]}>
            {meta.sign > 0 ? '+' : '−'}{formatAmount(amount)} zł
          </Text>
        </View>
        <Text style={styles.dateText}>{formatDate(transaction.date)}</Text>
      </View>

      {(transaction.productName || transaction.size || notes) ? (
        <View style={styles.cardBody}>
          {transaction.productName ? (
            <View style={styles.infoRow}>
              <Ionicons name="pricetag-outline" size={16} color={tc('muted', '#94A3B8')} />
              <Text style={styles.infoLabel}>Produkt:</Text>
              <Text style={styles.infoValue} numberOfLines={1}>{transaction.productName}</Text>
            </View>
          ) : null}
          {transaction.size ? (
            <View style={styles.infoRow}>
              <Ionicons name="resize-outline" size={16} color={tc('muted', '#94A3B8')} />
              <Text style={styles.infoLabel}>Rozmiar:</Text>
              <Text style={styles.infoValue}>{transaction.size}</Text>
            </View>
          ) : null}
          {notes ? (
            <View style={styles.infoRow}>
              <Ionicons name="document-text-outline" size={16} color={tc('muted', '#94A3B8')} />
              <Text style={styles.infoLabel}>Uwagi:</Text>
              <Text style={styles.infoValue} numberOfLines={2}>{notes}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = createThemedStyles(() => StyleSheet.create({
  balanceCard: {
    backgroundColor: tc('surface', '#161622'),
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    borderLeftWidth: 4,
    marginBottom: 16,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  balanceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 16,
    color: tc('muted', '#94A3B8'),
    fontWeight: '600',
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  itemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  itemsText: {
    fontSize: 14,
    color: tc('muted', '#94A3B8'),
    fontWeight: '600',
  },
  card: {
    backgroundColor: tc('surface', '#161622'),
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tc('border', '#1E293B'),
    borderLeftWidth: 4,
  },
  cardHeader: {
    padding: 12,
  },
  typeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  amount: {
    marginLeft: 'auto',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dateText: {
    fontSize: 12,
    color: tc('muted', '#64748B'),
  },
  cardBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: tc('border', '#1E293B'),
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
}));
