'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';

// Compat shim — ancien URL /video-detail?id=xxx -> /videos/xxx
export default function LegacyVideoDetailRedirect() {
  const router = useRouter();
  useEffect(() => {
    const id = router.query.id as string | undefined;
    if (router.isReady && id) {
      router.replace(`/videos/${id}`);
    } else if (router.isReady) {
      router.replace('/videos');
    }
  }, [router, router.isReady, router.query.id]);
  return null;
}
