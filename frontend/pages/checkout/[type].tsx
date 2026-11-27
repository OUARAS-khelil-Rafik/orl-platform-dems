'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  GraduationCap,
  Loader2,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { db, collection, addDoc, doc, updateDoc, uploadCloudinaryAsset, buildPaymentReceiptFolder } from '@/lib/api/client';
import { PaymentMethodPicker, type PaymentMethod } from '@/components/features/checkout/payment-method-picker';
import { BankDetails } from '@/components/features/checkout/bank-details';
import { ReceiptUpload } from '@/components/features/checkout/receipt-upload';

const SUBSCRIPTION_AMOUNT = 15000;
const PACK_AMOUNT = 5000;

const formatDZD = (value: number) => `${value.toLocaleString('fr-DZ')} DZD`;

export default function CheckoutPage() {
  const router = useRouter();
  const typeParam = router.query.type;
  const type = typeof typeParam === 'string' ? typeParam : '';
  const { user, profile, loading: authLoading } = useAuth();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('baridimob');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    if (!authLoading && !user) {
      router.push('/pricing');
    }
  }, [user, authLoading, router, router.isReady]);

  const isSubscription = type === 'subscription';
  const amount = isSubscription ? SUBSCRIPTION_AMOUNT : PACK_AMOUNT;
  const priceLabel = formatDZD(amount);
  const amountLabel = `${amount.toLocaleString('fr-DZ')} DA`;
  const title = isSubscription
    ? 'Abonnement VIP Plus (1 Mois)'
    : `Pack Spécialité : ${type.charAt(0).toUpperCase() + type.slice(1)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (!receiptFile) {
      setNotice('Veuillez joindre votre reçu de paiement (PDF ou image).');
      return;
    }

    setNotice(null);
    setIsSubmitting(true);
    setUploadProgress(0);
    try {
      const folder = buildPaymentReceiptFolder(profile.displayName, profile.email, user.uid);
      const resourceType = receiptFile.type === 'application/pdf' ? ('raw' as const) : ('image' as const);
      const uploaded = await uploadCloudinaryAsset(receiptFile, {
        folder,
        resourceType,
        fileName: `recu-${Date.now()}`,
        onProgress: setUploadProgress,
      });

      await addDoc(collection(db, 'payments'), {
        userId: user.uid,
        userEmail: profile.email,
        userDisplayName: profile.displayName,
        amount,
        method: paymentMethod,
        status: 'pending',
        type: isSubscription ? 'subscription' : 'pack',
        targetId: isSubscription ? 'vip_plus' : type,
        receiptUrl: uploaded.secureUrl,
        receiptPublicId: uploaded.publicId,
        receiptResourceType: uploaded.resourceType,
        receiptFolder: folder,
        createdAt: new Date().toISOString(),
      });

      if (isSubscription) {
        await updateDoc(doc(db, 'users', user.uid), {
          subscriptionApprovalStatus: 'pending',
        });
      }

      setSuccess(true);
    } catch (error) {
      console.error('Error submitting payment:', error);
      const msg = error instanceof Error ? error.message : 'Une erreur est survenue.';
      setNotice(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!router.isReady || authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--app-bg)]">
        <div
          className="h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
          style={{ borderColor: 'var(--app-accent)', borderTopColor: 'transparent' }}
          aria-label="Chargement"
        />
      </div>
    );
  }
  if (!user) return null;

  /* ── Écran de succès ── */
  if (success) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--app-bg)] p-4">
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          role="status"
          className="w-full max-w-md rounded-3xl border p-8 text-center shadow-xl sm:p-10"
          style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        >
          <span
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border"
            style={{
              background: 'color-mix(in oklab, var(--app-success) 16%, var(--app-surface) 84%)',
              borderColor: 'color-mix(in oklab, var(--app-success) 26%, var(--app-border) 74%)',
              color: 'var(--app-success)',
            }}
          >
            <BadgeCheck className="h-10 w-10" aria-hidden />
          </span>
          <h2 className="mb-3 text-2xl font-bold" style={{ color: 'var(--app-text)', fontFamily: 'var(--font-display)' }}>
            Demande envoyée !
          </h2>
          <p className="mb-2 text-sm leading-relaxed" style={{ color: 'var(--app-text)' }}>
            Votre reçu a été enregistré et est en attente de validation.
          </p>
          <p className="mb-7 text-sm" style={{ color: 'var(--app-muted)' }}>
            Notre équipe va vérifier votre paiement et activer votre accès sous 24h.
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-4 font-bold transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
            style={{ background: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}
          >
            Aller à mon tableau de bord <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[var(--app-bg)] py-10 sm:py-12">
      <div className="container mx-auto max-w-5xl px-4">
        {/* En-tête */}
        <header className="mb-8">
          <h1
            className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl"
            style={{ color: 'var(--app-text)', fontFamily: 'var(--font-display)' }}
          >
            Finaliser votre commande
          </h1>
          <p className="text-sm sm:text-base" style={{ color: 'var(--app-muted)' }}>
            Sélectionnez votre méthode de paiement puis joignez votre reçu.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          {/* ── Formulaire ── */}
          <div className="space-y-6 lg:col-span-2">
            <div
              className="rounded-2xl border p-5 sm:p-7"
              style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)', boxShadow: 'var(--shadow-soft)' }}
            >
              <h2
                className="mb-5 flex items-center gap-2 text-lg font-bold"
                style={{ color: 'var(--app-text)', fontFamily: 'var(--font-display)' }}
              >
                <CreditCard className="h-5 w-5" style={{ color: 'var(--app-accent)' }} aria-hidden />
                Méthode de paiement
              </h2>

              <form onSubmit={handleSubmit} noValidate>
                {/* Choix méthode */}
                <div className="mb-6">
                  <PaymentMethodPicker
                    name="type-payment-method"
                    value={paymentMethod}
                    onChange={setPaymentMethod}
                    disabled={isSubmitting}
                  />
                </div>

                {/* Coordonnées de virement */}
                <motion.div
                  key={paymentMethod}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6"
                >
                  <BankDetails method={paymentMethod} amountLabel={amountLabel} />
                </motion.div>

                {/* Upload reçu */}
                <div>
                  <label className="mb-2 flex flex-wrap items-center gap-1.5 text-[13px] font-bold" style={{ color: 'var(--app-text)' }}>
                    <span>Reçu de paiement</span>
                    <span style={{ color: 'var(--app-danger)' }} aria-hidden>*</span>
                    <span className="font-normal text-[11px]" style={{ color: 'var(--app-muted)' }}>
                      PDF ou image · max 10 Mo
                    </span>
                  </label>
                  <ReceiptUpload
                    value={receiptFile}
                    onChange={(f) => { setReceiptFile(f); setNotice(null); }}
                    onError={() => {}}
                    progress={uploadProgress}
                    processing={isSubmitting}
                  />
                </div>

                {/* Notice inline */}
                {notice ? (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl border px-3 py-2.5 text-xs leading-relaxed"
                    style={{
                      background: 'color-mix(in oklab, var(--app-danger) 9%, var(--app-surface) 91%)',
                      borderColor: 'color-mix(in oklab, var(--app-danger) 30%, var(--app-border) 70%)',
                      color: 'var(--app-danger)',
                    }}
                  >
                    {notice}
                  </div>
                ) : null}

                {/* Soumission */}
                <div className="mt-6 border-t pt-6" style={{ borderColor: 'var(--app-border)' }}>
                  <button
                    type="submit"
                    disabled={isSubmitting || !receiptFile}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-bold transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
                    style={{
                      background: 'var(--app-accent)',
                      color: 'var(--app-accent-contrast)',
                      boxShadow: '0 14px 30px -16px color-mix(in srgb, var(--app-accent) 70%, transparent)',
                    }}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                        {uploadProgress > 0 && uploadProgress < 100 ? `Upload ${uploadProgress}%` : 'Envoi en cours…'}
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-5 w-5" aria-hidden />
                        Envoyer — {priceLabel}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── Résumé ── */}
          <aside className="lg:col-span-1">
            <div
              className="sticky top-24 rounded-2xl border p-5 shadow-xl sm:p-6"
              style={{
                background: 'var(--app-deep-surface)',
                borderColor: 'color-mix(in oklab, var(--app-border) 60%, transparent)',
                color: 'var(--app-deep-text)',
                boxShadow: 'var(--shadow-elevated)',
              }}
            >
              <h2 className="mb-5 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                Résumé de la commande
              </h2>

              <div className="mb-5 border-b pb-5" style={{ borderColor: 'color-mix(in oklab, var(--app-deep-text) 18%, transparent)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold" style={{ color: 'var(--app-deep-text)' }}>{title}</p>
                    <p className="mt-1 text-xs" style={{ color: 'color-mix(in oklab, var(--app-deep-text) 60%, transparent)' }}>
                      Accès {isSubscription ? '1 mois' : 'illimité'}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold" style={{ color: 'var(--app-deep-text)' }}>{priceLabel}</span>
                </div>
              </div>

              <div className="mb-6 flex items-center justify-between">
                <span className="text-sm" style={{ color: 'color-mix(in oklab, var(--app-deep-text) 78%, transparent)' }}>
                  Total à payer
                </span>
                <span className="text-2xl font-bold" style={{ color: 'var(--app-accent)' }}>{priceLabel}</span>
              </div>

              <div
                className="flex items-start gap-3 rounded-xl p-4"
                style={{ background: 'color-mix(in oklab, var(--app-deep-text) 8%, transparent)' }}
              >
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--app-accent)' }} aria-hidden />
                <p className="text-xs leading-relaxed" style={{ color: 'color-mix(in oklab, var(--app-deep-text) 72%, transparent)' }}>
                  Validation manuelle par l&apos;admin sous 24h après vérification du reçu.
                </p>
              </div>

              {/* Avantages rapides */}
              <ul className="mt-5 space-y-2.5 border-t pt-5" style={{ borderColor: 'color-mix(in oklab, var(--app-deep-text) 16%, transparent)' }}>
                {[
                  { icon: Wallet, text: 'Paiement tracé' },
                  { icon: ShieldCheck, text: 'Aucun frais caché' },
                  { icon: GraduationCap, text: 'Accès après approbation' },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2.5 text-xs" style={{ color: 'color-mix(in oklab, var(--app-deep-text) 78%, transparent)' }}>
                    <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--app-accent)' }} aria-hidden />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
