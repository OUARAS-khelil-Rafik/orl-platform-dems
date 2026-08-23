'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { motion } from 'motion/react';
import { AlertTriangle, Loader2, ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';
import { verifyChargilyCheckout } from '@/lib/data/local-data';

export default function PaymentFailurePage() {
  const router = useRouter();
  const [checkoutId, setCheckoutId] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'rejected' | 'pending' | 'unknown'>('loading');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (!router.isReady) return;

    const rawId =
      (router.query.checkout_id as string) ||
      (router.query.checkoutId as string) ||
      (router.query.id as string) ||
      '';
    const id = String(rawId || '').trim();
    setCheckoutId(id);

    if (!id) {
      setStatus('unknown');
      setDetail("Aucun identifiant de paiement trouvé.");
      return;
    }

    let cancelled = false;

    const verify = async () => {
      try {
        const result = await verifyChargilyCheckout(id);
        if (cancelled) return;
        const internalStatus = String(result?.status || '').toLowerCase();
        const chargilyStatus = String(result?.chargilyStatus || '').toLowerCase();
        if (internalStatus === 'approved' || chargilyStatus === 'paid') {
          // Paid mais arrivé sur failure url ? Peut arriver si utilisateur annule puis revient
          setStatus('pending');
          setDetail('Votre paiement a finalement été confirmé. Vérifiez vos achats.');
        } else if (['failed', 'canceled', 'cancelled', 'expired'].includes(chargilyStatus) || internalStatus === 'rejected') {
          setStatus('rejected');
          setDetail('Paiement échoué, annulé ou expiré côté Chargily Pay.');
        } else {
          setStatus('rejected');
          setDetail('Paiement non complété.');
        }
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setStatus('unknown');
        setDetail("Impossible de vérifier le statut du paiement.");
      }
    };

    verify();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query]);

  return (
    <div className="flex-1 py-12 px-4 flex items-center justify-center" style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 94%, white 6%) 0%, color-mix(in oklab, var(--app-surface-alt) 76%, var(--app-accent) 24%) 100%)' }}>
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl p-8 md:p-10 max-w-lg w-full text-center shadow-xl border border-slate-200"
      >
        {status === 'loading' ? (
          <>
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 className="h-10 w-10 animate-spin text-slate-500" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Vérification…</h1>
            <p className="text-slate-600">Nous vérifions le statut de votre paiement.</p>
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Paiement annulé ou échoué</h1>
            <p className="text-slate-600 mb-2 leading-relaxed">{detail}</p>
            {checkoutId && <p className="text-xs text-slate-400 mb-6 font-mono break-all">Checkout: {checkoutId}</p>}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex items-start gap-3 text-left">
              <ShieldCheck className="h-5 w-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-600 leading-relaxed">
                Aucun montant n&apos;a été débité. Vous pouvez réessayer le paiement ou contacter le support si le problème persiste.
              </p>
            </div>
          </>
        )}

        <div className="flex flex-col gap-3">
          <Link
            href="/pricing"
            className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-white"
            style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 76%, #51392a 24%), color-mix(in oklab, var(--app-accent) 90%, #35261c 10%))' }}
          >
            <RefreshCw className="h-4 w-4" />
            Réessayer le paiement
          </Link>
          <Link
            href="/checkout"
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl font-medium border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au panier
          </Link>
          <Link href="/contact" className="text-sm text-slate-500 hover:text-slate-700 underline">
            Contacter le support
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
