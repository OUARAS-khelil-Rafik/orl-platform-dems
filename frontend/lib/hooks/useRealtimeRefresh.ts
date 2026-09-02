'use client';

import { useCallback, useEffect, useRef } from 'react';
import { subscribeToDataChanges, type DataChangeEvent } from '@/lib/api/client';

type Options = {
  intervalMs?: number; // polling fallback, 0 = disabled
  focusRefresh?: boolean;
  pauseWhenHidden?: boolean;
};

/**
 * Hook générique pour synchro temps réel.
 * - Écoute RealtimeProvider (qui émet via subscribeToDataChanges)
 * - Ajoute polling de secours + focus/visibility
 * Usage:
 *   useRealtimeRefresh(['videos','qcms'], () => { void fetchData(); });
 */
export const useRealtimeRefresh = (
  collections: string[],
  refresh: () => void | Promise<void>,
  options: Options = {}
) => {
  // M0 : fallback polling désactivé par défaut (on s'appuie sur RealtimeProvider/SSE)
  // Mettre intervalMs > 0 seulement si besoin critique (ex: admin). Minimum 15s.
  const { intervalMs = 0, focusRefresh = true, pauseWhenHidden = true } = options;
  const refreshRef = useRef(refresh);
  const collectionsRef = useRef(new Set(collections));

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    collectionsRef.current = new Set(collections);
  }, [collections]);

  const safeRefresh = useCallback(() => {
    try {
      const res = refreshRef.current();
      if (res instanceof Promise) {
        void res.catch((e) => console.error('[realtime] refresh error', e));
      }
    } catch (e) {
      console.error('[realtime] refresh error', e);
    }
  }, []);

  useEffect(() => {
    // Écoute backend (via RealtimeProvider -> emitDataChange)
    const unsubscribe = subscribeToDataChanges((event: DataChangeEvent) => {
      if (collectionsRef.current.has(event.collection)) {
        safeRefresh();
      }
    });

    // Polling local de secours — désactivé si intervalMs=0 (recommandé M0)
    // Si activé, clamp minimum 15s pour éviter spam DB
    let timer: ReturnType<typeof setInterval> | null = null;
    if (intervalMs > 0) {
      const safeInterval = Math.max(15000, intervalMs);
      timer = setInterval(() => {
        if (pauseWhenHidden && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        safeRefresh();
      }, safeInterval);
    }

    // Focus / visibility
    const handleFocus = () => {
      if (focusRefresh) safeRefresh();
    };
    const handleVisibility = () => {
      if (focusRefresh && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        safeRefresh();
      }
    };

    if (focusRefresh && typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      window.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      unsubscribe();
      if (timer) clearInterval(timer);
      if (focusRefresh && typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [intervalMs, focusRefresh, pauseWhenHidden, safeRefresh]);
};
