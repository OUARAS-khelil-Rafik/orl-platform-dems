'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/components/providers/auth-provider';
import { db, collection, addDoc, doc, updateDoc } from '@/lib/local-data';
import { motion } from 'motion/react';
import { ShieldCheck, Upload, CheckCircle2, AlertCircle, CreditCard, Camera } from 'lucide-react';
import Image from 'next/image';

export default function CheckoutPage() {
  const router = useRouter();
  const typeParam = router.query.type;
  const type = typeof typeParam === 'string' ? typeParam : '';
  const { user, profile, loading: authLoading } = useAuth();

  const [paymentMethod, setPaymentMethod] = useState<'ccp' | 'baridimob'>('ccp');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (!authLoading && !user) {
      router.push('/pricing');
    }
  }, [user, authLoading, router, router.isReady]);

  const isSubscription = type === 'subscription';
  const amount = isSubscription ? 15000 : 5000; // Example prices
  const title = isSubscription ? 'Abonnement VIP Plus (1 Mois)' : `Pack Spécialité : ${type.charAt(0).toUpperCase() + type.slice(1)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!receiptUrl && paymentMethod === 'ccp') {
      alert('Veuillez fournir un lien vers votre reçu (ex: Google Drive, Imgur) ou utiliser le chat de support.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'payments'), {
        userId: user.uid,
        amount,
        method: paymentMethod,
        status: 'pending',
        type: isSubscription ? 'subscription' : 'pack',
        targetId: isSubscription ? 'vip_plus' : type,
        receiptUrl: receiptUrl || 'Paiement BaridiMob (en attente de validation API)',
        createdAt: new Date().toISOString()
      });

      if (isSubscription) {
        await updateDoc(doc(db, 'users', user.uid), {
          role: 'vip_plus',
          subscriptionApprovalStatus: 'pending',
        });
      }

      setSuccess(true);
    } catch (error) {
      console.error('Error submitting payment:', error);
      alert('Une erreur est survenue.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!router.isReady || authLoading) return <div className="flex-1 flex items-center justify-center"><div className="w-12 h-12 border-4 border-medical-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return null;

  if (success) {
    return (
      <div className="flex-1 bg-slate-50 flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-10 max-w-md w-full text-center shadow-xl border border-slate-200">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Demande Envoyée !</h2>
          <p className="text-slate-600 mb-8 leading-relaxed">
            Votre demande de paiement a été enregistrée avec succès. Notre équipe va vérifier votre reçu et activer votre accès dans les plus brefs délais (généralement sous 24h).
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-4 rounded-xl font-medium transition-colors"
            style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 76%, #51392a 24%), color-mix(in oklab, var(--app-accent) 90%, #35261c 10%))', color: 'var(--app-accent-contrast)' }}
          >
            Aller à mon tableau de bord
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-50 py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Finaliser votre commande</h1>
          <p className="text-slate-600">Sélectionnez votre méthode de paiement pour débloquer votre accès.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
              <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <CreditCard className="h-6 w-6 text-medical-600" />
                Méthode de paiement
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('ccp')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    paymentMethod === 'ccp' ? 'border-medical-500 bg-medical-50' : 'border-slate-200 hover:border-medical-300'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-slate-900">Virement CCP</span>
                    {paymentMethod === 'ccp' && <CheckCircle2 className="h-5 w-5 text-medical-600" />}
                  </div>
                  <p className="text-sm text-slate-500">Paiement manuel via la poste</p>
                </button>
                
                <button
                  type="button"
                  onClick={() => setPaymentMethod('baridimob')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    paymentMethod === 'baridimob' ? 'border-yellow-500 bg-yellow-50' : 'border-slate-200 hover:border-yellow-300'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-slate-900">BaridiMob</span>
                    {paymentMethod === 'baridimob' && <CheckCircle2 className="h-5 w-5 text-yellow-600" />}
                  </div>
                  <p className="text-sm text-slate-500">Paiement via l'application</p>
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {paymentMethod === 'ccp' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-6 overflow-hidden">
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                      <h3 className="font-bold text-slate-900 mb-4">Informations CCP</h3>
                      <div className="space-y-2 text-sm text-slate-700">
                        <p><span className="font-medium text-slate-500 w-24 inline-block">Nom:</span> DEMS ENT E-Learning</p>
                        <p><span className="font-medium text-slate-500 w-24 inline-block">Compte:</span> 0000 123456 78</p>
                        <p><span className="font-medium text-slate-500 w-24 inline-block">Clé:</span> 99</p>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Lien vers le reçu de paiement</label>
                      <input
                        type="url"
                        required
                        value={receiptUrl}
                        onChange={(e) => setReceiptUrl(e.target.value)}
                        placeholder="https://imgur.com/..."
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-medical-500 outline-none transition-all"
                      />
                      <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Uploadez la photo de votre reçu sur un service d'hébergement d'images et collez le lien ici.
                      </p>
                    </div>
                  </motion.div>
                )}

                {paymentMethod === 'baridimob' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-6 overflow-hidden">
                    <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200 text-center">
                      <p className="text-yellow-800 font-medium mb-4">Vous allez être redirigé vers l'interface sécurisée Chargily Pay pour effectuer votre paiement BaridiMob.</p>
                      <Image src="https://picsum.photos/seed/chargily/200/50" alt="Chargily Pay" width={200} height={50} className="mx-auto mix-blend-multiply opacity-50" />
                    </div>
                  </motion.div>
                )}

                <div className="mt-8 pt-6 border-t border-slate-200">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-medical-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-medical-700 transition-colors shadow-lg shadow-medical-600/30 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                  >
                    {isSubmitting ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="h-5 w-5" />
                        Confirmer et Payer {amount} DZD
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 p-6 md:p-8 text-white sticky top-24">
              <h2 className="text-xl font-bold mb-6">Résumé de la commande</h2>
              
              <div className="space-y-4 mb-6 pb-6 border-b border-slate-700">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-slate-200">{title}</p>
                    <p className="text-sm text-slate-400 mt-1">Accès {isSubscription ? '1 mois' : 'illimité'}</p>
                  </div>
                  <span className="font-bold">{amount} DZD</span>
                </div>
              </div>
              
              <div className="flex justify-between items-center mb-8">
                <span className="text-lg text-slate-300">Total à payer</span>
                <span className="text-3xl font-bold text-medical-400">{amount} DZD</span>
              </div>
              
              <div className="bg-slate-800/50 rounded-xl p-4 flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-medical-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  Paiement 100% sécurisé. En cas de problème, notre équipe de support est disponible 7j/7 pour vous assister.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
