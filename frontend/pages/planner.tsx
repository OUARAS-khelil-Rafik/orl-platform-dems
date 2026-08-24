'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function PlannerRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/planning?tab=agenda');
  }, [router]);

  return (
    <div className="flex-1 py-20" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-medical-200 border-t-medical-600 rounded-full animate-spin" />
        </div>
        <p className="text-center text-sm mt-4" style={{ color: 'var(--app-muted)' }}>
          Redirection vers le Planning unifié...
        </p>
      </div>
    </div>
  );
}
