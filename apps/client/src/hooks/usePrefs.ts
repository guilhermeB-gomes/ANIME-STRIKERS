import { useCallback, useEffect, useState } from 'react';
import { storage, type Prefs } from '../services/storage';

export function applyMotionPreference(reduce: boolean): void {
  document.documentElement.dataset.reduceMotion = reduce ? 'true' : 'false';
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() => storage.getPrefs());
  useEffect(() => applyMotionPreference(prefs.reduceMotion), [prefs.reduceMotion]);
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      storage.setPrefs(next);
      return next;
    });
  }, []);
  return [prefs, update];
}
