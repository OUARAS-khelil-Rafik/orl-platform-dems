'use client';

import { useEffect } from 'react';
import { startRealtimeSync } from '@/lib/api/client';

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Démarre la synchro temps réel globale : SSE prioritaire + polling heartbeat
    // M0 : intervalle augmenté 30s (SSE gère le temps réel, polling = fallback seulement)
    // pause quand onglet caché, reprise au focus
    const stop = startRealtimeSync({ intervalMs: 30000, useSSE: true });
    return () => {
      try { stop?.(); } catch {}
    };
  }, []);

  return <>{children}</>;
}
