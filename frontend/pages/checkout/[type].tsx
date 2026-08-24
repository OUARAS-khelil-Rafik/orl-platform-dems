'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/components/providers/auth-provider';
import { db, collection, addDoc, doc, updateDoc, uploadCloudinaryAsset, buildPaymentReceiptFolder } from '@/lib/data/local-data';
import { motion } from 'motion/react';
import { ShieldCheck, CheckCircle2, AlertCircle, CreditCard, Upload, FileText, X, Copy, Loader2 } from 'lucide-react';

export default function CheckoutPage() {
  const router = useRouter();
  const typeParam = router.query.type;
  const type = typeof typeParam === 'string' ? typeParam : '';
  const { user, profile, loading: authLoading } = useAuth();

  const [paymentMethod, setPaymentMethod] = useState<'ccp' | 'baridimob'>('baridimob');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (!authLoading && !user) {
      router.push('/pricing');
    }
  }, [user, authLoading, router, router.isReady]);

  const isSubscription = type === 'subscription';
  const amount = isSubscription ? 15000 : 5000;
  const title = isSubscription ? 'Abonnement VIP Plus (1 Mois)' : `Pack Spécialité : ${type.charAt(0).toUpperCase() + type.slice(1)}`;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (!receiptFile) {
      alert('Veuillez joindre votre reçu de paiement (PDF ou image).');
      return;
    }

    setIsSubmitting(true);
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
        amount,
        method: paymentMethod,
        status: 'pending',
        type: isSubscription ? 'subscription' : 'pack',
        targetId: isSubscription ? 'vip_plus' : type,
        receiptUrl: uploaded.secureUrl,
        receiptPublicId: uploaded.publicId,
        receiptResourceType: uploaded.resourceType,
        receiptFolder: folder,
        createdAt: new Date().toISOString()
      });

      if (isSubscription) {
        await updateDoc(doc(db, 'users', user.uid), {
          subscriptionApprovalStatus: 'pending',
        });
      }

      if (receiptPreview) {
        try { URL.revokeObjectURL(receiptPreview); } catch {}
      }
      setSuccess(true);
    } catch (error) {
      console.error('Error submitting payment:', error);
      const msg = error instanceof Error ? error.message : 'Une erreur est survenue.';
      alert(msg);
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
          <p className="text-slate-600 mb-2 leading-relaxed">
            Votre reçu a été enregistré dans <span className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">orl-platform/recu-paiement</span> et est en attente de validation.
          </p>
          <p className="text-slate-500 text-sm mb-8">Notre équipe va vérifier votre paiement et activer votre accès dans les plus brefs délais (généralement sous 24h).</p>
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
          <p className="text-slate-600">Sélectionnez votre méthode de paiement puis joignez votre reçu.</p>
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
                {/* Infos CCP */}
                {paymentMethod === 'ccp' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-6 overflow-hidden">
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                      <h3 className="font-bold text-slate-900 mb-4">Informations CCP</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border">
                          <span className="font-medium text-slate-500 w-24 inline-block">Nom:</span>
                          <span className="font-bold text-slate-900 flex items-center gap-2 text-xs">OUARAS Khelil Rafik
                            <button type="button" onClick={()=>copyToClipboard('OUARAS Khelil Rafik','ccp-nom')} className="p-1 hover:bg-slate-100 rounded">
                              {copiedField==='ccp-nom' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600"/> : <Copy className="w-3.5 h-3.5 text-slate-400"/>}
                            </button>
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border">
                          <span className="font-medium text-slate-500 w-24 inline-block">Compte:</span>
                          <span className="font-mono font-bold text-slate-900 flex items-center gap-2">0028215926
                            <button type="button" onClick={()=>copyToClipboard('0028215926','ccp-compte')} className="p-1 hover:bg-slate-100 rounded">
                              {copiedField==='ccp-compte' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600"/> : <Copy className="w-3.5 h-3.5 text-slate-400"/>}
                            </button>
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border">
                          <span className="font-medium text-slate-500 w-24 inline-block">Clé:</span>
                          <span className="font-mono font-bold text-slate-900 flex items-center gap-2">60
                            <button type="button" onClick={()=>copyToClipboard('60','ccp-cle')} className="p-1 hover:bg-slate-100 rounded">
                              {copiedField==='ccp-cle' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600"/> : <Copy className="w-3.5 h-3.5 text-slate-400"/>}
                            </button>
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border">
                          <span className="font-medium text-slate-500 w-24 inline-block">Montant:</span>
                          <span className="font-bold text-medical-700">{amount} DA</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {paymentMethod === 'baridimob' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-6 overflow-hidden">
                    <div className="bg-amber-50 p-6 rounded-xl border border-amber-200">
                      <h3 className="font-bold text-amber-900 mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5"/> Informations BaridiMob</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                          <span className="font-medium text-slate-500 w-24 inline-block">RIP:</span>
                          <span className="font-mono font-bold text-slate-900 flex items-center gap-2 text-xs sm:text-sm">00799999002821592660
                            <button type="button" onClick={()=>copyToClipboard('00799999002821592660','rip')} className="p-1 hover:bg-slate-100 rounded">
                              {copiedField==='rip' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600"/> : <Copy className="w-3.5 h-3.5 text-slate-400"/>}
                            </button>
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                          <span className="font-medium text-slate-500 w-24 inline-block">Montant:</span>
                          <span className="font-bold text-amber-700">{amount} DA</span>
                        </div>
                      </div>
                      <p className="text-xs text-amber-700 mt-3">Effectuez le virement via l'app BaridiMob puis joignez le reçu ci-dessous.</p>
                    </div>
                  </motion.div>
                )}

                {/* Upload reçu commun aux deux méthodes */}
                <div className="mt-6">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Reçu de paiement <span className="text-red-500">*</span> <span className="font-normal text-xs text-slate-500">(PDF ou image, max 10MB)</span></label>
                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e)=> handleReceiptFileChange(e.target.files?.[0]||null)} />
                  {!receiptFile ? (
                    <button type="button" onClick={()=> fileInputRef.current?.click()} className="w-full border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:border-medical-300 hover:bg-medical-50/50 transition-colors">
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
                          {isSubmitting && <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5"><div className="bg-medical-600 h-1.5 rounded-full transition-all" style={{width:`${uploadProgress}%`}}/></div>}
                        </div>
                        {!isSubmitting && <button type="button" onClick={()=> handleReceiptFileChange(null)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-500"/></button>}
                      </div>
                      {!isSubmitting && <button type="button" onClick={()=> fileInputRef.current?.click()} className="mt-3 w-full text-xs font-medium text-medical-600 hover:text-medical-700 border border-medical-200 rounded-lg py-2">Changer de fichier</button>}
                    </div>
                  )}
                  <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Stockage : orl-platform/recu-paiement/{String(profile?.displayName||profile?.email?.split('@')[0]||'user').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').toLowerCase().slice(0,20)}/</p>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-200">
                  <button
                    type="submit"
                    disabled={isSubmitting || !receiptFile}
                    className="w-full bg-medical-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-medical-700 transition-colors shadow-lg shadow-medical-600/30 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                  >
                    {isSubmitting ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> {uploadProgress>0 && uploadProgress<100 ? `Upload ${uploadProgress}%` : 'Envoi en cours...'} </>
                    ) : (
                      <>
                        <ShieldCheck className="h-5 w-5" />
                        Envoyer — {amount} DA
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
                  Validation manuelle par l'admin sous 24h après vérification du reçu (stocké dans Cloudinary).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
