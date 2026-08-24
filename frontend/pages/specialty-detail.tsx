'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';

// Compat shim — ancien URL /specialty-detail?slug=xxx -> /specialties/xxx
export default function LegacySpecialtyDetailRedirect() {
  const router = useRouter();
  useEffect(() => {
    const slug = router.query.slug as string | undefined;
    if (router.isReady && slug) {
      router.replace(`/specialties/${slug}`);
    } else if (router.isReady) {
      router.replace('/specialties');
    }
  }, [router, router.isReady, router.query.slug]);
  return null;
}
