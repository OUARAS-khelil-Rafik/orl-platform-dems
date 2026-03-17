'use client';

import { useState } from 'react';
import { useCart } from '@/components/providers/cart-provider';
import { useAuth } from '@/components/providers/auth-provider';
import { motion } from 'motion/react';
import { Trash2, CreditCard, ShieldCheck, Loader2, ArrowRight, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { db, collection, addDoc } from '@/lib/local-data';

export default function CheckoutPage() {
  const { items, removeItem, total, clearCart } = useCart();
  const { user, profile } = useAuth();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCheckout = async () => {
    if (!user || !profile) {
      alert("Veuillez vous connecter pour procéder au paiement.");
      return;
    }

    if (items.length === 0) return;

    setIsProcessing(true);

    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Record payment in history as pending
      const paymentRef = await addDoc(collection(db, 'payments'), {
        userId: user.uid,
        amount: total,
        items: items.map(i => ({ id: i.id, type: i.type, title: i.title, price: i.price })),
        status: 'pending',
        type: 'cart',
        method: 'virement',
        createdAt: new Date().toISOString()
      });

      clearCart();
      alert("Demande de paiement envoyée ! Un administrateur va vérifier et débloquer vos contenus sous peu.");
      router.push('/dashboard');
    } catch (error) {
      console.error('Checkout error:', error);
      alert("Une erreur est survenue lors du paiement.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex-1 bg-slate-50 py-20">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <div className="bg-white p-12 rounded-3xl shadow-sm border border-slate-200">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingCart className="w-10 h-10 text-slate-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-4">Votre panier est vide</h1>
            <p className="text-slate-500 mb-8">Découvrez nos vidéos et packs de formation pour préparer votre concours.</p>
            <Link 
              href="/"
              className="inline-flex items-center gap-2 bg-medical-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-medical-700 transition-colors"
            >
              Parcourir les spécialités
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-50 py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-8">Votre Panier</h1>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-4">
            {items.map((item) => (
              <motion.div 
                key={item.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4"
              >
                <div className="w-24 h-16 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.title}
                      width={96}
                      height={64}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-medical-100 text-medical-500">
                      {item.type === 'video' ? 'Vidéo' : 'Pack'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 truncate">{item.title}</h3>
                  <p className="text-sm text-slate-500 capitalize">{item.type}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-slate-900">{item.price} DZD</p>
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors ml-2"
                  title="Retirer du panier"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </motion.div>
            ))}
          </div>

          <div className="md:col-span-1">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 sticky top-24">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Résumé de la commande</h2>
              
              <div className="space-y-4 mb-6">
                <div className="flex justify-between text-slate-600">
                  <span>Sous-total ({items.length} articles)</span>
                  <span>{total} DZD</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Taxes</span>
                  <span>0 DZD</span>
                </div>
                <div className="h-px bg-slate-200 my-4" />
                <div className="flex justify-between text-lg font-bold text-slate-900">
                  <span>Total</span>
                  <span>{total} DZD</span>
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
                  className="w-full flex items-center justify-center gap-2 bg-medical-600 text-white px-6 py-4 rounded-xl font-bold text-lg hover:bg-medical-700 transition-colors disabled:opacity-70"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Traitement...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Payer {total} DZD
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
