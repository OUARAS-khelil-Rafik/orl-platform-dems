'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  CreditCard,
  Loader2,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  X,
} from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { db, collection, addDoc, doc, updateDoc, uploadCloudinaryAsset, buildPaymentReceiptFolder } from '@/lib/api/client';
import { PaymentMethodPicker, type PaymentMethod } from '@/components/features/checkout/payment-method-picker';
import { BankDetails } from '@/components/features/checkout/bank-details';
import { ReceiptUpload } from '@/components/features/checkout/receipt-upload';

type Plan = 'monthly' | 'yearly';

const PRICES: Record<Plan, number> = { monthly: 15000, yearly: 150000 };

const VIP_PLUS_FEATURES = [
  'Accès illimité à toutes les vidéos',
  'Tous les cas cliniques et QCM',
  'Schémas interactifs',
  'Mises à jour régulières',
  'Support prioritaire',
];

const formatDZD = (value: number) => `${value.toLocaleString('fr-DZ')} DZD`;

export default function SubscriptionCheckoutPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [isProcessing, setIsProcessing] = useState(false);
  const [plan, setPlan] = useState<Plan>('monthly');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('baridimob');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const price = PRICES[plan];
  const priceLabel = formatDZD(price);
  const amountLabel = `${price.toLocaleString('fr-DZ')} DA`;

  const handleCheckout = async () => {
    if (!user || !profile) {
      setNotice('Veuillez vous connecter pour procéder au paiement.');
      return;
    }
    if (!receiptFile) {
      setNotice('Veuillez joindre votre reçu de paiement (PDF ou image).');
      return;
    }

    setNotice(null);
    setIsProcessing(true);
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
        amount: price,
        type: 'subscription',
        targetId: 'vip_plus',
        plan,
        status: 'pending',
        method: paymentMethod,
        receiptUrl: uploaded.secureUrl,
        receiptPublicId: uploaded.publicId,
        receiptResourceType: uploaded.resourceType,
        receiptFolder: folder,
        createdAt: new Date().toISOString(),
      });

      await updateDoc(doc(db, 'users', user.uid), {
        subscriptionApprovalStatus: 'pending',
      });

      setReceiptFile(null);
      setUploadProgress(0);
      setShowSuccess(true);
    } catch (error) {
      console.error('Checkout error:', error);
      const msg = error instanceof Error ? error.message : 'Une erreur est survenue lors du paiement.';
      setNotice(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 bg-[var(--app-bg)] py-10 sm:py-14">
      <div className="container mx-auto max-w-5xl px-4">
        {/* En-tête */}
        <header className="mb-8 text-center sm:mb-10">
          <span
            className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border"
            style={{
              background: 'color-mix(in oklab, var(--app-accent) 14%, var(--app-surface) 86%)',
              borderColor: 'color-mix(in oklab, var(--app-accent) 26%, var(--app-border) 74%)',
              color: 'var(--app-accent)',
            }}
          >
            <Star className="h-7 w-7 fill-current" aria-hidden />
          </span>
          <h1
            className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl"
            style={{ color: 'var(--app-text)', fontFamily: 'var(--font-display)' }}
          >
            Abonnement VIP Plus
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed sm:text-base" style={{ color: 'var(--app-muted)' }}>
            Accédez à l&apos;intégralité de la plateforme sans restriction. Choisissez votre formule, payez, puis
            recevez votre accès après validation.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(320px,400px)] lg:gap-8">
          {/* ── Colonne gauche : choix de la formule ── */}
          <section aria-labelledby="formule-title" className="space-y-6">
            <div>
              <h2
                id="formule-title"
                className="mb-1 flex items-center gap-2 text-lg font-bold"
                style={{ color: 'var(--app-text)', fontFamily: 'var(--font-display)' }}
              >
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold"
                  style={{ background: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}
                  aria-hidden
                >
                  1
                </span>
                Choisissez votre formule
              </h2>
              <p className="text-sm" style={{ color: 'var(--app-muted)' }}>
                Tarifs en dinars algériens (DZD).
              </p>
            </div>

            <div role="radiogroup" aria-label="Formule d'abonnement" className="space-y-4">
              <PlanCard
                name="plan"
                value="monthly"
                checked={plan === 'monthly'}
                onSelect={() => setPlan('monthly')}
                title="Mensuel"
                subtitle="Sans engagement"
                price={PRICES.monthly}
                priceSuffix="DZD / mois"
                disabled={isProcessing}
              />
              <PlanCard
                name="plan"
                value="yearly"
                checked={plan === 'yearly'}
                onSelect={() => setPlan('yearly')}
                title="Annuel"
                subtitle="Économisez 30 000 DZD"
                price={PRICES.yearly}
                priceSuffix="DZD / an"
                badge="2 mois offerts"
                hint="soit 12 500 DZD / mois"
                disabled={isProcessing}
              />
            </div>

            {/* Inclus dans VIP Plus */}
            <div
              className="rounded-2xl border p-6"
              style={{
                background: 'var(--app-deep-surface)',
                borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)',
                color: 'var(--app-deep-text)',
              }}
            >
              <h3 className="mb-4 flex items-center gap-2 font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <Sparkles className="h-5 w-5" style={{ color: 'var(--app-accent)' }} aria-hidden />
                Inclus dans VIP Plus
              </h3>
              <ul className="space-y-3">
                {VIP_PLUS_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm" style={{ color: 'color-mix(in oklab, var(--app-deep-text) 82%, transparent)' }}>
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ background: 'color-mix(in oklab, var(--app-accent) 22%, transparent)', color: 'var(--app-accent)' }}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── Colonne droite : paiement ── */}
          <aside aria-labelledby="paiement-title" className="lg:sticky lg:top-24 lg:self-start">
            <div
              className="rounded-[20px] border p-5 sm:p-6"
              style={{
                background: 'color-mix(in oklab, var(--app-surface) 96%, white 4%)',
                borderColor: 'color-mix(in oklab, var(--app-border) 78%, transparent)',
                boxShadow: 'var(--shadow-elevated)',
              }}
            >
              <div className="mb-5 h-1 -mx-5 -mt-5 sm:-mx-6 sm:-mt-6 rounded-t-[20px]" style={{ background: 'linear-gradient(90deg, var(--app-accent), color-mix(in oklab, var(--app-accent) 60%, var(--app-warning) 40%))' }} />

              <h2
                id="paiement-title"
                className="mb-5 flex items-center gap-2 text-lg font-bold"
                style={{ color: 'var(--app-text)', fontFamily: 'var(--font-display)' }}
              >
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold"
                  style={{ background: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}
                  aria-hidden
                >
                  2
                </span>
                <CreditCard className="h-5 w-5" style={{ color: 'var(--app-accent)' }} aria-hidden />
                Paiement
              </h2>

              {/* Méthode de paiement */}
              <div className="mb-5">
                <p className="mb-2.5 text-[13px] font-bold" style={{ color: 'var(--app-text)' }}>
                  Méthode de paiement
                </p>
                <PaymentMethodPicker
                  name="subscription-payment-method"
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  disabled={isProcessing}
                />
              </div>

              {/* Coordonnées de virement */}
              <div className="mb-5">
                <BankDetails method={paymentMethod} amountLabel={amountLabel} />
              </div>

              {/* Upload reçu */}
              <div className="mb-5">
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
                  processing={isProcessing}
                />
              </div>

              {/* Résumé */}
              <div className="mb-5 space-y-2.5 rounded-2xl border p-4" style={{ background: 'color-mix(in oklab, var(--app-bg) 60%, var(--app-surface) 40%)', borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--app-muted)' }}>
                    Abonnement VIP Plus ({plan === 'monthly' ? '1 mois' : '1 an'})
                  </span>
                  <span className="font-semibold" style={{ color: 'var(--app-text)' }}>{priceLabel}</span>
                </div>
                <div className="h-px" style={{ background: 'var(--app-border)' }} />
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold" style={{ color: 'var(--app-text)' }}>Total à payer</span>
                  <span className="text-lg font-bold tracking-tight" style={{ color: 'var(--app-accent)' }}>{priceLabel}</span>
                </div>
              </div>

              {/* Notice inline */}
              {notice ? (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed"
                  style={{
                    background: 'color-mix(in oklab, var(--app-danger) 9%, var(--app-surface) 91%)',
                    borderColor: 'color-mix(in oklab, var(--app-danger) 30%, var(--app-border) 70%)',
                    color: 'var(--app-danger)',
                  }}
                >
                  <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{notice}</span>
                </div>
              ) : null}

              {/* Connexion requise */}
              {!user ? (
                <div
                  className="mb-4 rounded-xl border p-4"
                  style={{
                    background: 'color-mix(in oklab, var(--app-warning) 10%, var(--app-surface) 90%)',
                    borderColor: 'color-mix(in oklab, var(--app-warning) 28%, var(--app-border) 72%)',
                  }}
                >
                  <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                    Vous devez être connecté pour finaliser votre commande.
                  </p>
                  <Link
                    href="/sign-in"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
                    style={{ background: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}
                  >
                    Se connecter <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isProcessing || !receiptFile}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
                  style={{
                    background: 'var(--app-accent)',
                    color: 'var(--app-accent-contrast)',
                    boxShadow: '0 14px 30px -16px color-mix(in srgb, var(--app-accent) 70%, transparent)',
                  }}
                >
                  {isProcessing ? (
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
              )}

              <div className="mt-4 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--app-muted)' }}>
                <ShieldCheck className="h-4 w-4" style={{ color: 'var(--app-success)' }} aria-hidden />
                <span>Validation manuelle par l&apos;admin (24h)</span>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Modal succès */}
      {showSuccess ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setShowSuccess(false)}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="success-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border p-7 text-center shadow-2xl sm:p-8"
            style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
          >
            <span
              className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border"
              style={{
                background: 'color-mix(in oklab, var(--app-success) 16%, var(--app-surface) 84%)',
                borderColor: 'color-mix(in oklab, var(--app-success) 26%, var(--app-border) 74%)',
                color: 'var(--app-success)',
              }}
            >
              <CheckCircle2 className="h-10 w-10" aria-hidden />
            </span>
            <h2 id="success-title" className="mb-2 text-2xl font-bold" style={{ color: 'var(--app-text)', fontFamily: 'var(--font-display)' }}>
              Demande envoyée !
            </h2>
            <p className="mb-1 text-sm" style={{ color: 'var(--app-text)' }}>
              Votre reçu a été enregistré. Un administrateur va vérifier et activer votre abonnement{' '}
              <span className="font-semibold">sous 24h</span>.
            </p>
            <p className="mb-5 text-sm" style={{ color: 'var(--app-muted)' }}>
              Formule : <span className="font-semibold">{plan === 'monthly' ? 'Mensuel' : 'Annuel'}</span> · {priceLabel}
            </p>
            <button
              type="button"
              onClick={() => {
                setShowSuccess(false);
                router.push('/dashboard');
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
              style={{ background: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}
            >
              <BadgeCheck className="h-5 w-5" aria-hidden /> Aller au tableau de bord
            </button>
            <button
              type="button"
              onClick={() => setShowSuccess(false)}
              className="mt-3 text-sm font-semibold transition hover:opacity-80"
              style={{ color: 'var(--app-muted)' }}
            >
              Fermer
            </button>
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Carte de formule ─── */
function PlanCard({
  name,
  value,
  checked,
  onSelect,
  title,
  subtitle,
  price,
  priceSuffix,
  badge,
  hint,
  disabled,
}: {
  name: string;
  value: Plan;
  checked: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  price: number;
  priceSuffix: string;
  badge?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        'relative block cursor-pointer rounded-2xl border-2 p-5 transition-all',
        'focus-within:ring-2 focus-within:ring-[var(--ring-focus)]',
        disabled ? 'cursor-not-allowed opacity-70' : '',
      ].join(' ')}
      style={{
        borderColor: checked ? 'var(--app-accent)' : 'var(--app-border)',
        background: checked
          ? 'color-mix(in oklab, var(--app-accent) 9%, var(--app-surface) 91%)'
          : 'var(--app-surface)',
        boxShadow: checked ? '0 14px 34px -22px color-mix(in srgb, var(--app-accent) 60%, transparent)' : 'var(--shadow-soft)',
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />

      {badge ? (
        <span
          className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
          style={{ background: 'var(--app-success)', color: '#fff' }}
        >
          <Tag className="h-3 w-3" aria-hidden /> {badge}
        </span>
      ) : null}

      <div className="flex items-center gap-4">
        {/* Indicateur sélection */}
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
          style={{
            borderColor: checked ? 'var(--app-accent)' : 'var(--app-border)',
            background: checked ? 'var(--app-accent)' : 'transparent',
          }}
          aria-hidden
        >
          {checked ? <span className="h-2 w-2 rounded-full" style={{ background: 'var(--app-accent-contrast)' }} /> : null}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold" style={{ color: 'var(--app-text)' }}>{title}</h3>
          <p className="text-sm" style={{ color: 'var(--app-muted)' }}>{subtitle}</p>
        </div>

        <div className="shrink-0 text-right">
          <span className="block text-2xl font-bold" style={{ color: 'var(--app-text)' }}>
            {price.toLocaleString('fr-DZ')}
          </span>
          <span className="text-xs" style={{ color: 'var(--app-muted)' }}>{priceSuffix}</span>
          {hint ? <span className="block text-[11px]" style={{ color: 'var(--app-muted)' }}>{hint}</span> : null}
        </div>
      </div>
    </label>
  );
}
