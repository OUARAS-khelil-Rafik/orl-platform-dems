'use client';

import { motion } from 'motion/react';
import { Check, X, Shield, Zap, Star } from 'lucide-react';
import Link from 'next/link';

export default function PricingPage() {
  return (
    <div className="flex-1 bg-slate-50 py-20">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-bold text-slate-900 mb-6"
          >
            Investissez dans votre réussite
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-slate-600"
          >
            Choisissez l'offre qui correspond le mieux à vos besoins de préparation au concours DEMS ORL.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Free Tier */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col"
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
                    <Check className="h-5 w-5 text-medical-500 flex-shrink-0" />
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
              href="/signup" 
              className="w-full py-4 rounded-xl font-medium text-center border-2 border-slate-200 text-slate-700 hover:border-medical-500 hover:text-medical-600 transition-colors"
            >
              Créer un compte gratuit
            </Link>
          </motion.div>

          {/* VIP (Packs) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-3xl p-8 border-2 border-medical-500 shadow-xl relative flex flex-col transform md:-translate-y-4"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-medical-500 text-white px-4 py-1 rounded-full text-sm font-bold tracking-wide uppercase flex items-center gap-1">
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
                    <Check className="h-5 w-5 text-medical-500 flex-shrink-0" />
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
              className="w-full py-4 rounded-xl font-medium text-center bg-medical-600 text-white hover:bg-medical-700 transition-colors shadow-lg shadow-medical-600/30"
            >
              Voir les packs
            </Link>
          </motion.div>

          {/* VIP Plus (Subscription) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-xl flex flex-col text-white"
          >
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-white mb-2">VIP Plus</h3>
              <p className="text-slate-400 mb-6">Accès total par abonnement</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white">15 000</span>
                <span className="text-slate-400">DZD / mois</span>
              </div>
              <p className="text-sm text-accent-400 mt-2">ou 150 000 DZD / an (2 mois offerts)</p>
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
                  <Check className="h-5 w-5 text-accent-400 flex-shrink-0" />
                  <span className="text-slate-300">
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>
            <Link 
              href="/checkout/subscription" 
              className="w-full py-4 rounded-xl font-medium text-center bg-accent-600 text-white hover:bg-accent-500 transition-colors shadow-lg shadow-accent-600/30"
            >
              S&apos;abonner maintenant
            </Link>
          </motion.div>
        </div>

        {/* Payment Methods Info */}
        <div className="mt-20 text-center">
          <h4 className="text-xl font-semibold text-slate-900 mb-6">Moyens de paiement acceptés en Algérie</h4>
          <div className="flex flex-wrap justify-center gap-8 items-center opacity-70">
            <div className="flex items-center gap-2 bg-white px-6 py-3 rounded-xl shadow-sm border border-slate-200">
              <Shield className="h-6 w-6 text-slate-700" />
              <span className="font-bold text-slate-700">CCP (Virement)</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-6 py-3 rounded-xl shadow-sm border border-slate-200">
              <Zap className="h-6 w-6 text-yellow-500" />
              <span className="font-bold text-slate-700">BaridiMob (Chargily Pay)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
