import { useCallback, useEffect, useState } from 'react';
import { Property } from '../types';
import {
  addToCompare,
  clearCompareList,
  CompareItem,
  COMPARE_MAX,
  readCompareList,
  removeFromCompare,
  toCompareItem,
} from '../services/compareService';
import { showToast } from '../utils/ui/toast';

/**
 * Compare-tray state backed by AsyncStorage (see compareService.ts).
 * `count` drives the PropertyCard badge; `ids` avoids re-rendering when the
 * same property set is re-reported.
 */
export function useCompare() {
  const [items, setItems] = useState<CompareItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const stored = await readCompareList();
    setItems(stored);
    setLoading(false);
  }, []);

  // Reads from a promise callback so the effect body sets no state directly
  // (react-hooks/set-state-in-effect).
  useEffect(() => {
    let active = true;
    readCompareList().then((stored) => {
      if (!active) return;
      setItems(stored);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  /** Add a property snapshot; toasts when the tray is full. */
  const add = useCallback(
    async (property: Property): Promise<boolean> => {
      const result = await addToCompare(toCompareItem(property));
      if (result === 'full') {
        showToast(`Compare is full (max ${COMPARE_MAX})`);
        return false;
      }
      await refresh();
      return result === 'added';
    },
    [refresh]
  );

  const remove = useCallback(
    async (propertyId: string) => {
      setItems(await removeFromCompare(propertyId));
    },
    []
  );

  const clear = useCallback(async () => {
    await clearCompareList();
    setItems([]);
  }, []);

  const ids = items.map((i) => i.propertyId);
  const isComparing = useCallback(
    (propertyId: string) => ids.includes(propertyId),
    [ids]
  );

  return { items, ids, loading, count: items.length, max: COMPARE_MAX, add, remove, clear, isComparing, refresh };
}
