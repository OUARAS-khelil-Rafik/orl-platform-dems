'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';

// Compat shim — ancien URL /checkout-subscription -> /checkout/subscription
export default function LegacyCheckoutSubscriptionRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (router.isReady) router.replace('/checkout/subscription');
  }, [router, router.isReady]);
  return null;
}
