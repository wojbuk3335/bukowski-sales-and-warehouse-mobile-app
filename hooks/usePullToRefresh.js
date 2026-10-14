import React, { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';

/**
 * Odświeżanie przeciągnięciem palca - jednakowo na każdym ekranie.
 *
 *   const { refreshControl } = usePullToRefresh(() => fetchItems());
 *   <FlatList ... refreshControl={refreshControl} alwaysBounceVertical />
 *
 * load - funkcja pobierająca dane ekranu (może zwracać Promise). Kręciołek znika po jej zakończeniu,
 * także gdy rzuci błąd (błąd obsługuje sam ekran).
 */
export default function usePullToRefresh(load) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load?.();
    } catch (error) {
      // ekran pokazuje własne komunikaty błędów
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0D6EFD']} tintColor="#0D6EFD" />
  );

  return { refreshing, onRefresh, refreshControl };
}
