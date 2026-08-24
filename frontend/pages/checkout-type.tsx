'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';

// Compat shim — ancien URL /checkout-type?type=xxx -> /checkout/xxx
export default function LegacyCheckoutTypeRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    const type = router.query.type as string | undefined;
    if (type) router.replace(`/checkout/${type}`);
    else router.replace('/checkout');
  }, [router, router.isReady, router.query.type]);
  return null;
}
