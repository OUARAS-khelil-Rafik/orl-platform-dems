'use client';

import { useEffect } from 'react';
import { startRealtimeSync } from '@/lib/api/client';

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Démarre la synchro temps réel globale : polling /versions + SSE
    // Interval 3000ms, pause quand onglet caché, reprise au focus
    const stop = startRealtimeSync({ intervalMs: 3000, useSSE: true });
    return () => {
      try { stop?.(); } catch {}
    };
  }, []);

  return <>{children}</>;
}
