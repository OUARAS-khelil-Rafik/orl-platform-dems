'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { motion } from 'motion/react';
import { CreditCard, ShieldCheck, Loader2, Star, Check, Upload, FileText, X, Copy, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { db, collection, addDoc, doc, updateDoc, uploadCloudinaryAsset, buildPaymentReceiptFolder } from '@/lib/api/client';

export default function SubscriptionCheckoutPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [paymentMethod, setPaymentMethod] = useState<'ccp' | 'baridimob'>('baridimob');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const price = plan === 'monthly' ? 15000 : 150000;

  const handleReceiptFileChange = (file: File | null) => {
    if (!file) {
      setReceiptFile(null);
      setReceiptPreview(null);
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024;
    if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
      alert('Format non supporté. Veuillez joindre une image (JPG, PNG, WEBP) ou un PDF.');
      return;
    }
    if (file.size > maxSize) {
      alert('Fichier trop volumineux (max 10MB).');
      return;
    }
    setReceiptFile(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setReceiptPreview(url);
    } else {
      setReceiptPreview(null);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {}
  };

  const handleCheckout = async () => {
    if (!user || !profile) {
      alert("Veuillez vous connecter pour procéder au paiement.");
      return;
    }

    if (!receiptFile) {
      alert("Veuillez joindre votre reçu de paiement (PDF ou image).");
      return;
    }

    setIsProcessing(true);
    setUploadProgress(0);

    try {
      const folder = buildPaymentReceiptFolder(profile.displayName, profile.email, user.uid);
      const resourceType = receiptFile.type === 'application/pdf' ? 'raw' as const : 'image' as const;
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
        plan: plan,
        status: 'pending',
        method: paymentMethod,
        receiptUrl: uploaded.secureUrl,
        receiptPublicId: uploaded.publicId,
        receiptResourceType: uploaded.resourceType,
        receiptFolder: folder,
        createdAt: new Date().toISOString()
      });

      await updateDoc(doc(db, 'users', user.uid), {
        subscriptionApprovalStatus: 'pending',
      });

      if (receiptPreview) {
        try { URL.revokeObjectURL(receiptPreview); } catch {}
      }
      setReceiptFile(null);
      setReceiptPreview(null);
      setUploadProgress(0);
      setShowSuccess(true);
    } catch (error) {
      console.error('Checkout error:', error);
      const msg = error instanceof Error ? error.message : "Une erreur est survenue lors du paiement.";
      alert(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 py-12">
      <div className="container mx-auto px-4 max-w-5xl">
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

          {/* Checkout */}
          <div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 sticky top-24">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Paiement</h2>

              {/* Méthode */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-slate-700 mb-3">Méthode de paiement</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={()=>setPaymentMethod('baridimob')} className={`p-3 rounded-xl border-2 text-left transition-all ${paymentMethod==='baridimob'?'border-accent-500 bg-accent-50':'border-slate-200 hover:border-slate-300'}`}>
                    <span className="block text-sm font-bold text-slate-900">BaridiMob</span>
                    <span className="block text-xs text-slate-500">RIP</span>
                  </button>
                  <button type="button" onClick={()=>setPaymentMethod('ccp')} className={`p-3 rounded-xl border-2 text-left transition-all ${paymentMethod==='ccp'?'border-accent-500 bg-accent-50':'border-slate-200 hover:border-slate-300'}`}>
                    <span className="block text-sm font-bold text-slate-900">CCP</span>
                    <span className="block text-xs text-slate-500">Poste</span>
                  </button>
                </div>
              </div>

              {/* Infos selon méthode */}
              {paymentMethod==='baridimob' ? (
                <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-amber-900 mb-3 flex items-center gap-2"><CreditCard className="w-4 h-4"/> BaridiMob</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                      <span className="text-slate-500 text-xs">RIP</span>
                      <span className="font-mono font-bold text-slate-900 text-sm flex items-center gap-2">
                        00799999002821592660
                        <button type="button" onClick={()=>copyToClipboard('00799999002821592660','rip')} className="p-1 hover:bg-slate-100 rounded">
                          {copiedField==='rip' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600"/> : <Copy className="w-3.5 h-3.5 text-slate-400"/>}
                        </button>
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                      <span className="text-slate-500 text-xs">Montant</span>
                      <span className="font-bold text-amber-700">{price} DA</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><FileText className="w-4 h-4"/> CCP</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border">
                      <span className="text-slate-500 text-xs">Nom</span>
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                        OUARAS Khelil Rafik
                        <button type="button" onClick={()=>copyToClipboard('OUARAS Khelil Rafik','ccp-nom')} className="p-1 hover:bg-slate-100 rounded">
                          {copiedField==='ccp-nom' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600"/> : <Copy className="w-3.5 h-3.5 text-slate-400"/>}
                        </button>
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border">
                      <span className="text-slate-500 text-xs">N° Compte</span>
                      <span className="font-mono font-bold text-slate-900 text-sm flex items-center gap-2">
                        0028215926
                        <button type="button" onClick={()=>copyToClipboard('0028215926','ccp-compte')} className="p-1 hover:bg-slate-100 rounded">
                          {copiedField==='ccp-compte' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600"/> : <Copy className="w-3.5 h-3.5 text-slate-400"/>}
                        </button>
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border">
                      <span className="text-slate-500 text-xs">Clé</span>
                      <span className="font-mono font-bold text-slate-900 flex items-center gap-2">
                        60
                        <button type="button" onClick={()=>copyToClipboard('60','ccp-cle')} className="p-1 hover:bg-slate-100 rounded">
                          {copiedField==='ccp-cle' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600"/> : <Copy className="w-3.5 h-3.5 text-slate-400"/>}
                        </button>
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border">
                      <span className="text-slate-500 text-xs">Montant</span>
                      <span className="font-bold text-medical-700">{price} DA</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload reçu */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Reçu de paiement <span className="text-red-500">*</span> <span className="font-normal text-xs text-slate-500">(PDF ou image, max 10MB)</span></label>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e)=> handleReceiptFileChange(e.target.files?.[0]||null)} />
                {!receiptFile ? (
                  <button type="button" onClick={()=> fileInputRef.current?.click()} className="w-full border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:border-accent-300 hover:bg-accent-50/50 transition-colors">
                    <Upload className="w-8 h-8 text-slate-400"/>
                    <span className="text-sm font-medium text-slate-700">Cliquez pour joindre votre reçu</span>
                    <span className="text-xs text-slate-500">JPG, PNG, WEBP ou PDF</span>
                  </button>
                ) : (
                  <div className="border border-slate-200 rounded-xl p-3 bg-white">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                        {receiptPreview ? <img src={receiptPreview} alt="Aperçu reçu" className="w-full h-full object-cover"/> : <FileText className="w-6 h-6 text-slate-500"/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{receiptFile.name}</p>
                        <p className="text-xs text-slate-500">{(receiptFile.size/1024/1024).toFixed(2)} MB • {receiptFile.type || 'fichier'}</p>
                        {isProcessing && <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5"><div className="bg-accent-600 h-1.5 rounded-full transition-all" style={{width:`${uploadProgress}%`}}/></div>}
                      </div>
                      {!isProcessing && <button type="button" onClick={()=> handleReceiptFileChange(null)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-500"/></button>}
                    </div>
                    {!isProcessing && <button type="button" onClick={()=> fileInputRef.current?.click()} className="mt-3 w-full text-xs font-medium text-accent-600 hover:text-accent-700 border border-accent-200 rounded-lg py-2">Changer de fichier</button>}
                  </div>
                )}
              </div>
              
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
                  disabled={isProcessing || !receiptFile}
                  className="w-full flex items-center justify-center gap-2 bg-accent-600 text-white px-6 py-4 rounded-xl font-bold text-lg hover:bg-accent-700 transition-colors disabled:opacity-50 shadow-lg shadow-accent-600/30"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {uploadProgress>0 && uploadProgress<100 ? `Upload ${uploadProgress}%` : 'Envoi en cours...'}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      Envoyer — {price} DZD
                    </>
                  )}
                </button>
              )}

              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Validation manuelle par l'admin (24h)</span>
              </div>
              <p className="mt-2 text-[11px] text-center text-slate-400">Reçu stocké : orl-platform/recu-paiement/{String(profile?.displayName||profile?.email?.split('@')[0]||'user').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').toLowerCase().slice(0,20)}/</p>
            </div>
          </div>
        </div>

        {showSuccess && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-xl border border-slate-200">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3">Demande envoyée !</h2>
              <p className="text-slate-600 mb-2">Votre reçu a été enregistré dans <span className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">orl-platform/recu-paiement</span>.</p>
              <p className="text-slate-500 text-sm mb-6">Un administrateur va vérifier et activer votre abonnement sous 24h.</p>
              <button onClick={()=> {setShowSuccess(false); router.push('/dashboard');}} className="w-full py-3 rounded-xl font-semibold text-white" style={{background:'var(--app-accent)'}}>Aller au tableau de bord</button>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
