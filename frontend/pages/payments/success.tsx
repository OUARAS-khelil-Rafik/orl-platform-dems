'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { motion } from 'motion/react';
import { CheckCircle2, Loader2, AlertTriangle, ArrowRight, ReceiptText, ShieldCheck } from 'lucide-react';
import { verifyChargilyCheckout } from '@/lib/data/local-data';

export default function PaymentSuccessPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'approved' | 'pending' | 'rejected' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [checkoutId, setCheckoutId] = useState<string>('');

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
      // Si l'id n'est pas présent, on affiche un succès générique (webhook fera le reste)
      setStatus('pending');
      setMessage('Paiement en cours de vérification. Vous recevrez une confirmation sous peu.');
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
          setStatus('approved');
          setMessage('Paiement confirmé ! Votre accès a été activé automatiquement.');
        } else if (internalStatus === 'rejected' || ['failed', 'canceled', 'cancelled', 'expired'].includes(chargilyStatus)) {
          setStatus('rejected');
          setMessage('Paiement échoué ou annulé.');
        } else {
          setStatus('pending');
          setMessage('Paiement en attente de confirmation. Le webhook Chargily va activer votre accès sous quelques secondes.');
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Verify error:', error);
        // Fallback: si verify échoue, on laisse pending (webhook va traiter)
        setStatus('pending');
        setMessage('Vérification en cours… Votre accès sera activé automatiquement après confirmation Chargily Pay.');
      }
    };

    verify();

    // Polling léger : re-vérifie 2 fois à 3s d'intervalle si pending
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      if (attempts > 4) {
        clearInterval(interval);
        return;
      }
      if (cancelled) {
        clearInterval(interval);
        return;
      }
      try {
        const result = await verifyChargilyCheckout(id);
        if (cancelled) return;
        const internalStatus = String(result?.status || '').toLowerCase();
        const chargilyStatus = String(result?.chargilyStatus || '').toLowerCase();
        if (internalStatus === 'approved' || chargilyStatus === 'paid') {
          setStatus('approved');
          setMessage('Paiement confirmé ! Votre accès a été activé.');
          clearInterval(interval);
        }
      } catch {}
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router.isReady, router.query]);

  return (
    <div className="flex-1 py-12 px-4 flex items-center justify-center" style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 94%, white 6%) 0%, color-mix(in oklab, var(--app-surface-alt) 76%, var(--app-accent) 24%) 100%)' }}>
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl p-8 md:p-10 max-w-lg w-full text-center shadow-xl border border-slate-200"
      >
        {status === 'loading' && (
          <>
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 className="h-10 w-10 animate-spin text-slate-500" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Vérification du paiement…</h1>
            <p className="text-slate-600 mb-8">Veuillez patienter pendant que nous confirmons votre paiement Chargily Pay.</p>
          </>
        )}

        {status === 'approved' && (
          <>
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Paiement réussi !</h1>
            <p className="text-slate-600 mb-2 leading-relaxed">{message}</p>
            {checkoutId && <p className="text-xs text-slate-400 mb-6 font-mono break-all">Checkout: {checkoutId}</p>}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-start gap-3 text-left">
              <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-emerald-800 leading-relaxed">
                Votre accès a été débloqué. Si vous ne voyez pas le contenu immédiatement, rafraîchissez la page dans quelques secondes.
              </p>
            </div>
          </>
        )}

        {status === 'pending' && (
          <>
            <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <ReceiptText className="h-10 w-10" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Paiement en cours de validation</h1>
            <p className="text-slate-600 mb-2 leading-relaxed">{message}</p>
            {checkoutId && <p className="text-xs text-slate-400 mb-6 font-mono break-all">Checkout: {checkoutId}</p>}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-xs text-amber-800 leading-relaxed">
                Chargily Pay nous notifie via webhook. L&apos;activation est automatique et prend généralement moins de 30 secondes après le paiement.
              </p>
            </div>
          </>
        )}

        {status === 'rejected' && (
          <>
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Paiement non abouti</h1>
            <p className="text-slate-600 mb-2 leading-relaxed">{message || 'Votre paiement n’a pas été confirmé.'}</p>
            {checkoutId && <p className="text-xs text-slate-400 mb-6 font-mono break-all">Checkout: {checkoutId}</p>}
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Erreur de vérification</h1>
            <p className="text-slate-600 mb-6 leading-relaxed">{message}</p>
          </>
        )}

        <div className="flex flex-col gap-3">
          <Link
            href="/purchases"
            className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-white"
            style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 76%, #51392a 24%), color-mix(in oklab, var(--app-accent) 90%, #35261c 10%))' }}
          >
            Voir mes achats <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/dashboard"
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl font-medium border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Aller au tableau de bord
          </Link>
          {status !== 'approved' && (
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 border border-transparent"
            >
              Actualiser le statut
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
