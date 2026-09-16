import { useState, useEffect, useCallback } from 'react';
import { DataExport } from '../types';
import { getUserExports } from '../services/exportService';

export function useExport(userId: string) {
  const [exports, setExports] = useState<DataExport[]>([]);
  const [loading, setLoading] = useState(true);

  const loadExports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUserExports(userId);
      setExports(data);
    } catch {
      setExports([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadExports();
  }, [userId, loadExports]);

  return { exports, loading, refresh: loadExports };
}
