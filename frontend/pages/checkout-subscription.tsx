'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { motion } from 'motion/react';
import { CreditCard, ShieldCheck, Loader2, Star, Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { db, collection, addDoc, doc, updateDoc } from '@/lib/data/local-data';

export default function SubscriptionCheckoutPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('monthly');

  const price = plan === 'monthly' ? 15000 : 150000;

  const handleCheckout = async () => {
    if (!user || !profile) {
      alert("Veuillez vous connecter pour procéder au paiement.");
      return;
    }

    setIsProcessing(true);

    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Record payment in history as pending
      await addDoc(collection(db, 'payments'), {
        userId: user.uid,
        amount: price,
        type: 'subscription',
        plan: plan,
        status: 'pending',
        method: 'virement',
        createdAt: new Date().toISOString()
      });

      await updateDoc(doc(db, 'users', user.uid), {
        role: 'vip_plus',
        subscriptionApprovalStatus: 'pending',
      });

      alert("Demande d'abonnement envoyée ! Un administrateur va vérifier et activer votre compte sous peu.");
      router.push('/dashboard');
    } catch (error) {
      console.error('Checkout error:', error);
      alert("Une erreur est survenue lors du paiement.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-100 text-accent-600 mb-6">
            <Star className="w-8 h-8 fill-current" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Abonnement VIP Plus</h1>
          <p className="text-lg text-slate-600">Accédez à l'intégralité de la plateforme sans restriction.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Plan Selection */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Choisissez votre formule</h2>
            
            <label className={`block relative cursor-pointer rounded-2xl border-2 p-6 transition-all ${
              plan === 'monthly' ? 'border-accent-500 bg-accent-50' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}>
              <input 
                type="radio" 
                name="plan" 
                value="monthly" 
                checked={plan === 'monthly'}
                onChange={() => setPlan('monthly')}
                className="sr-only"
              />
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Mensuel</h3>
                  <p className="text-slate-500">Sans engagement</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-slate-900">15 000</span>
                  <span className="text-slate-500"> DZD</span>
                </div>
              </div>
              {plan === 'monthly' && (
                <div className="absolute top-1/2 -translate-y-1/2 right-6 w-6 h-6 bg-accent-500 rounded-full flex items-center justify-center shadow-sm">
                  <div className="w-2 h-2 bg-white rounded-full" />
                </div>
              )}
            </label>

            <label className={`block relative cursor-pointer rounded-2xl border-2 p-6 transition-all ${
              plan === 'yearly' ? 'border-accent-500 bg-accent-50' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}>
              <input 
                type="radio" 
                name="plan" 
                value="yearly" 
                checked={plan === 'yearly'}
                onChange={() => setPlan('yearly')}
                className="sr-only"
              />
              <div className="absolute -top-3 left-6 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                2 mois offerts
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Annuel</h3>
                  <p className="text-slate-500">Économisez 30 000 DZD</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-slate-900">150 000</span>
                  <span className="text-slate-500"> DZD</span>
                </div>
              </div>
              {plan === 'yearly' && (
                <div className="absolute top-1/2 -translate-y-1/2 right-6 w-6 h-6 bg-accent-500 rounded-full flex items-center justify-center shadow-sm">
                  <div className="w-2 h-2 bg-white rounded-full" />
                </div>
              )}
            </label>

            <div className="bg-slate-900 rounded-2xl p-6 text-white mt-8">
              <h4 className="font-bold mb-4">Inclus dans VIP Plus :</h4>
              <ul className="space-y-3">
                {[
                  'Accès illimité à toutes les vidéos',
                  'Tous les cas cliniques et QCM',
                  'Schémas interactifs',
                  'Mises à jour régulières',
                  'Support prioritaire'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-slate-300">
                    <Check className="w-5 h-5 text-accent-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Checkout Summary */}
          <div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 sticky top-24">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Résumé de la commande</h2>
              
              <div className="space-y-4 mb-6">
                <div className="flex justify-between text-slate-600">
                  <span>Abonnement VIP Plus ({plan === 'monthly' ? '1 mois' : '1 an'})</span>
                  <span>{price} DZD</span>
                </div>
                <div className="h-px bg-slate-200 my-4" />
                <div className="flex justify-between text-xl font-bold text-slate-900">
                  <span>Total à payer</span>
                  <span>{price} DZD</span>
                </div>
              </div>

              {!user ? (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-6">
                  <p className="text-sm text-amber-800 mb-3">Vous devez être connecté pour finaliser votre commande.</p>
                  <Link 
                    href="/dashboard"
                    className="block w-full text-center bg-amber-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-600 transition-colors"
                  >
                    Se connecter
                  </Link>
                </div>
              ) : (
                <button
                  onClick={handleCheckout}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 bg-accent-600 text-white px-6 py-4 rounded-xl font-bold text-lg hover:bg-accent-700 transition-colors disabled:opacity-70 shadow-lg shadow-accent-600/30"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Traitement...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Payer {price} DZD
                    </>
                  )}
                </button>
              )}

              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Paiement 100% sécurisé</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
