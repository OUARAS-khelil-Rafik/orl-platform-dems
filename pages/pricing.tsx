'use client';

import { motion } from 'motion/react';
import { Check, X, Shield, Zap, Star } from 'lucide-react';
import Link from 'next/link';

export default function PricingPage() {
  return (
    <div
      className="flex-1 py-20"
      style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 94%, white 6%) 0%, color-mix(in oklab, var(--app-surface-alt) 76%, var(--app-accent) 24%) 100%)' }}
    >
      <div className="container mx-auto px-4">
        <div
          className="relative overflow-hidden rounded-3xl border px-6 py-12 md:px-10 md:py-14 mb-16"
          style={{
            color: 'var(--hero-title)',
            borderColor: 'color-mix(in oklab, var(--hero-chip-border) 72%, var(--app-border) 28%)',
            background: 'linear-gradient(145deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
          }}
        >
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 36%, transparent)' }} />
          <div className="absolute -bottom-20 -left-10 w-64 h-64 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 24%, transparent)' }} />
          <div className="relative z-10 text-center max-w-3xl mx-auto">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-bold mb-6"
            style={{ color: 'var(--hero-title)' }}
          >
            Investissez dans votre réussite
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg"
            style={{ color: 'var(--hero-body)' }}
          >
            Choisissez l'offre qui correspond le mieux à vos besoins de préparation au concours DEMS ORL.
          </motion.p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Free Tier */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-3xl p-8 border border-slate-200 shadow-md flex flex-col"
            style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)', background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 86%, var(--app-accent) 14%) 100%)' }}
          >
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Découverte</h3>
              <p className="text-slate-500 mb-6">Pour tester la plateforme</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-slate-900">Gratuit</span>
              </div>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              {[
                { text: 'Accès aux vidéos de démo', included: true },
                { text: 'Aperçu des cas cliniques', included: true },
                { text: 'QCM de base', included: true },
                { text: 'Vidéos premium', included: false },
                { text: 'Schémas interactifs', included: false },
                { text: 'Support prioritaire', included: false },
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-3">
                  {feature.included ? (
                    <Check className="h-5 w-5 flex-shrink-0" style={{ color: 'color-mix(in oklab, var(--app-accent) 80%, #7a5439 20%)' }} />
                  ) : (
                    <X className="h-5 w-5 text-slate-300 flex-shrink-0" />
                  )}
                  <span className={feature.included ? 'text-slate-700' : 'text-slate-400'}>
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>
            <Link 
              href="/sign-up" 
              className="w-full py-4 rounded-xl font-medium text-center border-2 text-slate-700 transition-colors"
              style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 30%, var(--app-border) 70%)', color: 'color-mix(in oklab, var(--app-accent) 76%, var(--app-text) 24%)' }}
            >
              Créer un compte gratuit
            </Link>
          </motion.div>

          {/* VIP (Packs) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-3xl p-8 border-2 shadow-xl relative flex flex-col transform md:-translate-y-4"
            style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 66%, #7f5740 34%)', background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 82%, var(--app-accent) 18%) 100%)' }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white px-4 py-1 rounded-full text-sm font-bold tracking-wide uppercase flex items-center gap-1" style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 74%, #6b4a35 26%), color-mix(in oklab, var(--app-accent) 90%, #3d2b1f 10%))' }}>
              <Star className="h-4 w-4 fill-current" />
              Le plus populaire
            </div>
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-2">VIP (Packs)</h3>
              <p className="text-slate-500 mb-6">Achetez par spécialité</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-slate-900">À la carte</span>
              </div>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              {[
                { text: 'Accès aux vidéos du pack acheté', included: true },
                { text: 'Cas cliniques du pack', included: true },
                { text: 'QCM du pack', included: true },
                { text: 'Schémas interactifs du pack', included: true },
                { text: 'Accès illimité dans le temps', included: true },
                { text: 'Toutes les spécialités', included: false },
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-3">
                  {feature.included ? (
                    <Check className="h-5 w-5 flex-shrink-0" style={{ color: 'color-mix(in oklab, var(--app-accent) 80%, #7a5439 20%)' }} />
                  ) : (
                    <X className="h-5 w-5 text-slate-300 flex-shrink-0" />
                  )}
                  <span className={feature.included ? 'text-slate-700' : 'text-slate-400'}>
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>
            <Link 
              href="/specialties" 
              className="w-full py-4 rounded-xl font-medium text-center text-white transition-colors shadow-lg"
              style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 76%, #5b402f 24%), color-mix(in oklab, var(--app-accent) 90%, #37271c 10%))' }}
            >
              Voir les packs
            </Link>
          </motion.div>

          {/* VIP Plus (Subscription) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-3xl p-8 border shadow-xl flex flex-col"
            style={{ color: 'var(--hero-title)', borderColor: 'color-mix(in oklab, var(--hero-chip-border) 72%, var(--app-border) 28%)', background: 'linear-gradient(145deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)' }}
          >
            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--hero-title)' }}>VIP Plus</h3>
              <p className="mb-6" style={{ color: 'var(--hero-body)' }}>Accès total par abonnement</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold" style={{ color: 'var(--hero-title)' }}>15 000</span>
                <span style={{ color: 'var(--hero-body)' }}>DZD / mois</span>
              </div>
              <p className="text-sm mt-2" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, #f8f4ef 22%)' }}>ou 150 000 DZD / an (2 mois offerts)</p>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              {[
                { text: 'Accès à TOUTES les vidéos', included: true },
                { text: 'Tous les cas cliniques', included: true },
                { text: 'Tous les QCM', included: true },
                { text: 'Tous les schémas interactifs', included: true },
                { text: 'Mises à jour régulières', included: true },
                { text: 'Support prioritaire', included: true },
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-3">
                  <Check className="h-5 w-5 flex-shrink-0" style={{ color: 'color-mix(in oklab, var(--app-accent) 80%, #f8f4ef 20%)' }} />
                  <span style={{ color: 'var(--hero-body)' }}>
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>
            <Link 
              href="/checkout/subscription" 
              className="w-full py-4 rounded-xl font-medium text-center text-white transition-colors shadow-lg"
              style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 76%, #5b402f 24%), color-mix(in oklab, var(--app-accent) 90%, #37271c 10%))' }}
            >
              S&apos;abonner maintenant
            </Link>
          </motion.div>
        </div>

        {/* Payment Methods Info */}
        <div className="mt-20 text-center">
          <h4 className="text-xl font-semibold text-slate-900 mb-6">Moyens de paiement acceptés en Algérie</h4>
          <div className="flex flex-wrap justify-center gap-8 items-center">
            <div className="flex items-center gap-2 bg-white px-6 py-3 rounded-xl shadow-md border" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)' }}>
              <Shield className="h-6 w-6" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }} />
              <span className="font-bold text-slate-700">CCP (Virement)</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-6 py-3 rounded-xl shadow-md border" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)' }}>
              <Zap className="h-6 w-6" style={{ color: 'color-mix(in oklab, var(--app-accent) 74%, #f59e0b 26%)' }} />
              <span className="font-bold text-slate-700">BaridiMob (Chargily Pay)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
