'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import {
  db,
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  deleteAuthAccountByUid,
  updateAuthPhotoURL,
  updateAuthPassword,
} from '@/lib/local-data';
import { motion } from 'motion/react';
import { User, PlayCircle, Star, Camera, LockKeyhole, HardDrive, Moon, Sun, Trash2 } from 'lucide-react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import { isSubscriptionActive } from '@/lib/access-control';
import { formatFullName, normalizeNameParts, splitFullName } from '@/lib/name-utils';

export default function UserDashboard() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'profile' | 'storage' | 'purchases'>('profile');
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [defaultMode, setDefaultMode] = useState<'light' | 'dark'>('light');
  const [isSavingDefaultMode, setIsSavingDefaultMode] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [storageSettings, setStorageSettings] = useState({
    cloudName: '',
    apiKey: '',
    apiSecret: '',
  });
  const [isSavingStorageSettings, setIsSavingStorageSettings] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (profile) {
      const splitName = splitFullName(profile.displayName || '');
      setLastName(profile.lastName || splitName.lastName);
      setFirstName(profile.firstName || splitName.firstName);
      setDefaultMode(profile.defaultMode || 'light');
    }
  }, [profile]);

  useEffect(() => {
    const tabParam = router.query.tab;
    if (!tabParam || Array.isArray(tabParam)) return;
    if (tabParam === 'profile' || tabParam === 'purchases' || tabParam === 'storage') {
      setActiveTab(tabParam);
    }
  }, [router.query.tab]);

  useEffect(() => {
    const loadStorageSettings = async () => {
      if (!profile || profile.role !== 'admin') return;

      try {
        const settingsDoc = await getDoc(doc(db, 'appSettings', 'cloudinary'));
        if (settingsDoc.exists()) {
          const data = settingsDoc.data() as Record<string, any>;
          setStorageSettings({
            cloudName: String(data.cloudName || ''),
            apiKey: String(data.apiKey || ''),
            apiSecret: String(data.apiSecret || ''),
          });
        }
      } catch (error) {
        console.error('Error loading storage settings:', error);
      }
    };

    loadStorageSettings();
  }, [profile]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) return;
      try {
        const q = query(collection(db, 'payments'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error('Error fetching history:', error);
      } finally {
        setLoading(false);
      }
    };
    if (!authLoading) fetchHistory();
  }, [user, authLoading]);

  const handleUpdateProfile = async () => {
    if (!user) return;

    const normalizedNames = normalizeNameParts(lastName, firstName);
    const displayName = formatFullName(normalizedNames.lastName, normalizedNames.firstName);
    if (!displayName) {
      alert('Le nom et le prénom sont obligatoires.');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName,
        lastName: normalizedNames.lastName,
        firstName: normalizedNames.firstName,
      });
      setIsEditing(false);
      alert('Profil mis à jour avec succès.');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Erreur lors de la mise à jour.');
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

    if (!uploadPreset || !cloudName) {
      alert('Configuration Cloudinary manquante.');
      return;
    }

    try {
      setAvatarUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Erreur lors du téléversement de l'image.");
      }

      const data = await res.json();
      const url = data.secure_url as string;

      await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
      updateAuthPhotoURL(user.uid, url);
    } catch (error) {
      console.error('Error updating avatar:', error);
      alert('Erreur lors du changement de la photo.');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert('Veuillez remplir tous les champs.');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('Les nouveaux mots de passe ne correspondent pas.');
      return;
    }

    try {
      setIsUpdatingPassword(true);
      updateAuthPassword(user.uid, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      alert('Mot de passe mis à jour avec succès.');
    } catch (error: any) {
      console.error('Error changing password:', error);
      alert(error?.message || 'Erreur lors du changement de mot de passe.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSaveDefaultMode = async () => {
    if (!user) return;

    try {
      setIsSavingDefaultMode(true);
      await updateDoc(doc(db, 'users', user.uid), { defaultMode });
      alert('Mode par défaut enregistré.');
    } catch (error) {
      console.error('Error saving default mode:', error);
      alert('Erreur lors de l\'enregistrement du mode.');
    } finally {
      setIsSavingDefaultMode(false);
    }
  };

  const handleSaveStorageSettings = async () => {
    if (!profile || profile.role !== 'admin') return;

    try {
      setIsSavingStorageSettings(true);
      await setDoc(doc(db, 'appSettings', 'cloudinary'), {
        cloudName: storageSettings.cloudName.trim(),
        apiKey: storageSettings.apiKey.trim(),
        apiSecret: storageSettings.apiSecret.trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: profile.uid,
      });
      alert('Paramètres Cloudinary enregistrés.');
    } catch (error) {
      console.error('Error saving storage settings:', error);
      alert('Erreur lors de l\'enregistrement des paramètres de stockage.');
    } finally {
      setIsSavingStorageSettings(false);
    }
  };

  const handleDeleteAccountPermanently = async () => {
    if (!user || !profile || profile.role === 'admin') return;

    const firstConfirm = confirm('Cette action est définitive. Voulez-vous vraiment supprimer votre compte ?');
    if (!firstConfirm) return;

    const secondConfirm = confirm('Toutes vos données seront supprimées définitivement. Confirmer ?');
    if (!secondConfirm) return;

    try {
      setIsDeletingAccount(true);

      const [paymentsSnap, pedagogicalFeedbackSnap, clinicalCaseFeedbackSnap] = await Promise.all([
        getDocs(query(collection(db, 'payments'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'pedagogicalFeedback'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'clinicalCaseFeedback'), where('userId', '==', user.uid))),
      ]);

      await Promise.all([
        ...paymentsSnap.docs.map((paymentDoc) => deleteDoc(doc(db, 'payments', paymentDoc.id))),
        ...pedagogicalFeedbackSnap.docs.map((feedbackDoc) =>
          deleteDoc(doc(db, 'pedagogicalFeedback', feedbackDoc.id)),
        ),
        ...clinicalCaseFeedbackSnap.docs.map((feedbackDoc) =>
          deleteDoc(doc(db, 'clinicalCaseFeedback', feedbackDoc.id)),
        ),
      ]);

      await deleteDoc(doc(db, 'users', user.uid));
      deleteAuthAccountByUid(user.uid);
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Erreur lors de la suppression du compte.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (loading || authLoading) {
    return <div className="flex-1 flex items-center justify-center"><div className="w-12 h-12 border-4 border-medical-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!profile) return null;

  const isVipPlus = isSubscriptionActive(profile);
  const purchasedPacksCount = profile.purchasedPacks?.length || 0;
  const purchasedVideosCount = profile.purchasedVideos?.length || 0;
  const accountLevelLabel = isVipPlus ? 'VIP Plus' : profile.role === 'vip' ? 'VIP' : profile.role === 'admin' ? 'Admin' : 'Demo';

  return (
    <div className="flex-1 bg-gradient-to-br from-slate-100 via-stone-50 to-slate-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white/85 backdrop-blur-md border-r border-slate-200 flex-shrink-0 md:sticky md:top-0 md:h-[calc(100vh-4rem)]">
        <div className="p-6 border-b border-slate-100 flex flex-col items-center text-center">
          <div className="relative w-24 h-24 rounded-full overflow-hidden bg-slate-100 mb-4 border-4 border-white shadow-md">
            {profile.photoURL ? (
              <Image src={profile.photoURL} alt={profile.displayName} fill className="object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className="w-12 h-12 text-slate-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            )}
            <label
              className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-1 flex justify-center items-center gap-1 hover:bg-black/70 transition-colors cursor-pointer"
              title="Changer la photo"
              aria-label="Changer la photo"
            >
              {avatarUploading ? (
                <span>Chargement...</span>
              ) : (
                <>
                  <Camera className="w-3 h-3" />
                  <span>Changer la photo</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
                disabled={avatarUploading}
              />
            </label>
          </div>
          <h2 className="text-lg font-bold text-slate-900">{formatFullName(lastName, firstName) || profile.displayName}</h2>
          <p className="text-sm text-slate-500 mb-3">{profile.email}</p>
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider
            ${isVipPlus ? 'bg-accent-100 text-accent-700' :
              profile.role === 'vip' ? 'bg-medical-100 text-medical-700' :
              profile.role === 'admin' ? 'bg-purple-100 text-purple-700' :
              'bg-slate-100 text-slate-700'}`}
          >
            {isVipPlus ? <Star className="w-3 h-3 fill-current" /> : null}
            {isVipPlus ? 'VIP Plus' : profile.role.replace('_', ' ')}
          </span>
        </div>
        <nav className="p-4 space-y-1">
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${
              activeTab === 'profile' ? 'bg-medical-50 text-medical-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <User className={`h-5 w-5 ${activeTab === 'profile' ? 'text-medical-600' : 'text-slate-400'}`} />
            Mon Profil
          </button>
          {profile.role === 'admin' && (
            <button
              onClick={() => setActiveTab('storage')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${
                activeTab === 'storage' ? 'bg-medical-50 text-medical-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <HardDrive className={`h-5 w-5 ${activeTab === 'storage' ? 'text-medical-600' : 'text-slate-400'}`} />
              Gestion de Stockage
            </button>
          )}
          {(profile.role === 'vip' || isVipPlus) && (
            <button
              onClick={() => setActiveTab('purchases')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${
                activeTab === 'purchases' ? 'bg-medical-50 text-medical-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <PlayCircle className={`h-5 w-5 ${activeTab === 'purchases' ? 'text-medical-600' : 'text-slate-400'}`} />
              Mes Achats
            </button>
          )}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div
            className="mb-6 rounded-3xl border p-6 shadow-xl"
            style={{
              color: 'var(--hero-title)',
              borderColor: 'color-mix(in oklab, var(--hero-chip-border) 72%, var(--app-border) 28%)',
              background: 'linear-gradient(140deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
            }}
          >
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--hero-body)' }}>Espace personnel</p>
                <h1 className="text-2xl md:text-3xl font-bold mt-1">{formatFullName(lastName, firstName) || profile.displayName}</h1>
                <p className="text-sm mt-2" style={{ color: 'var(--hero-body)' }}>Gérez votre profil, votre sécurité et vos accès pédagogiques depuis un seul espace.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:min-w-[300px]">
                <div className="rounded-2xl border px-3 py-2" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)' }}>
                  <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--hero-body)' }}>Niveau</p>
                  <p className="text-sm font-semibold">{accountLevelLabel}</p>
                </div>
                <div className="rounded-2xl border px-3 py-2" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)' }}>
                  <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--hero-body)' }}>Packs</p>
                  <p className="text-sm font-semibold">{purchasedPacksCount}</p>
                </div>
                <div className="rounded-2xl border px-3 py-2" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)' }}>
                  <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--hero-body)' }}>Videos</p>
                  <p className="text-sm font-semibold">{purchasedVideosCount}</p>
                </div>
                <div className="rounded-2xl border px-3 py-2" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)' }}>
                  <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--hero-body)' }}>Mode</p>
                  <p className="text-sm font-semibold">{defaultMode === 'dark' ? 'Sombre' : 'Clair'}</p>
                </div>
              </div>
            </div>
          </div>

          {activeTab === 'profile' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-md border border-slate-200 p-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Informations Personnelles</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Nom et prénom</label>
                  {isEditing ? (
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input 
                        type="text" 
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        title="Nom"
                        aria-label="Nom"
                        placeholder="NOM"
                        className="flex-1 px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-medical-500 outline-none transition-all"
                      />
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        title="Prénom"
                        aria-label="Prénom"
                        placeholder="Prénom"
                        className="flex-1 px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-medical-500 outline-none transition-all"
                      />
                      <button onClick={handleUpdateProfile} className="bg-medical-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-medical-700">Enregistrer</button>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          const splitName = splitFullName(profile.displayName || '');
                          setLastName(profile.lastName || splitName.lastName);
                          setFirstName(profile.firstName || splitName.firstName);
                        }}
                        className="bg-slate-100 text-slate-700 px-4 py-2 rounded-xl font-medium hover:bg-slate-200"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-slate-900 font-medium">{formatFullName(lastName, firstName) || profile.displayName}</span>
                      <button onClick={() => setIsEditing(true)} className="text-sm text-medical-600 font-medium hover:underline">Modifier</button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Adresse Email</label>
                  <div className="px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed">
                    {profile.email}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">L'adresse email ne peut pas être modifiée depuis votre espace.</p>
                </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-5">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <LockKeyhole className="w-4 h-4 text-slate-500" />
                    Changer le mot de passe
                  </h4>
                  <div className="space-y-3">
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Mot de passe actuel"
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-medical-500 outline-none transition-all"
                    />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nouveau mot de passe"
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-medical-500 outline-none transition-all"
                    />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirmer le nouveau mot de passe"
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-medical-500 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={handleChangePassword}
                      disabled={isUpdatingPassword}
                      className="mt-1 inline-flex items-center justify-center px-4 py-2 rounded-xl bg-medical-600 text-white text-sm font-medium hover:bg-medical-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isUpdatingPassword ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Mode par défaut</h4>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative flex-1">
                      <select
                        value={defaultMode}
                        onChange={(e) => setDefaultMode(e.target.value as 'light' | 'dark')}
                        className="w-full appearance-none px-4 py-2 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-medical-500 focus:border-medical-500 outline-none"
                        title="Mode par défaut"
                        aria-label="Mode par défaut"
                      >
                        <option value="light">Light mode</option>
                        <option value="dark">Dark mode</option>
                      </select>
                      {defaultMode === 'dark' ? (
                        <Moon className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-500" />
                      ) : (
                        <Sun className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-500" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveDefaultMode}
                      disabled={isSavingDefaultMode}
                      className="px-4 py-2 rounded-xl bg-medical-600 text-white text-sm font-medium hover:bg-medical-700 disabled:opacity-60"
                    >
                      {isSavingDefaultMode ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </div>
                </div>

                {profile.role !== 'admin' && (
                  <div className="pt-3 border-t border-slate-200">
                    <h4 className="text-sm font-semibold text-red-700 mb-2">Suppression définitive du compte</h4>
                    <p className="text-xs text-slate-600 mb-3">
                      Cette action est irréversible et supprime votre compte ainsi que vos données associées.
                    </p>
                    <button
                      type="button"
                      onClick={handleDeleteAccountPermanently}
                      disabled={isDeletingAccount}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                    >
                      <Trash2 className="w-4 h-4" />
                      {isDeletingAccount ? 'Suppression...' : 'Supprimer définitivement mon compte'}
                    </button>
                  </div>
                )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'storage' && profile.role === 'admin' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-md border border-slate-200 p-8"
            >
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Gestion de Stockage</h3>
              <p className="text-sm text-slate-500 mb-6">
                Configurez les identifiants Cloudinary utilisés par la plateforme.
              </p>

              <div className="max-w-xl space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Cloudinary Cloud Name</label>
                  <input
                    type="text"
                    value={storageSettings.cloudName}
                    onChange={(e) => setStorageSettings((prev) => ({ ...prev, cloudName: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-medical-500 outline-none"
                    placeholder="ex: demo-cloud"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">CLOUDINARY_API_KEY</label>
                  <input
                    type="text"
                    value={storageSettings.apiKey}
                    onChange={(e) => setStorageSettings((prev) => ({ ...prev, apiKey: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-medical-500 outline-none"
                    placeholder="ex: 123456789012345"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">CLOUDINARY_API_SECRET</label>
                  <input
                    type="password"
                    value={storageSettings.apiSecret}
                    onChange={(e) => setStorageSettings((prev) => ({ ...prev, apiSecret: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-medical-500 outline-none"
                    placeholder="Secret API"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveStorageSettings}
                  disabled={isSavingStorageSettings}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-medical-600 text-white text-sm font-medium hover:bg-medical-700 disabled:opacity-60"
                >
                  {isSavingStorageSettings ? 'Enregistrement...' : 'Enregistrer les paramètres'}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'purchases' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-md border border-slate-200 p-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Mes Achats</h3>
              
              <div className="space-y-8">
                {/* Packs */}
                <div>
                  <h4 className="text-lg font-bold text-slate-800 mb-4">Packs de spécialités</h4>
                  {profile.purchasedPacks && profile.purchasedPacks.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {profile.purchasedPacks.map((packId) => (
                        <div key={packId} className="border border-slate-200 rounded-xl p-6 hover:border-medical-300 transition-colors group">
                          <div className="w-12 h-12 bg-medical-50 text-medical-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <PlayCircle className="h-6 w-6" />
                          </div>
                          <h4 className="font-bold text-slate-900 mb-2 capitalize">Pack {packId}</h4>
                          <Link href={`/specialties/${packId}`} className="text-sm font-medium text-medical-600 hover:text-medical-700 flex items-center gap-1">
                            Accéder au contenu &rarr;
                          </Link>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">Aucun pack acheté.</p>
                  )}
                </div>

                {/* Videos */}
                <div>
                  <h4 className="text-lg font-bold text-slate-800 mb-4">Vidéos individuelles</h4>
                  {profile.purchasedVideos && profile.purchasedVideos.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {profile.purchasedVideos.map((videoId) => (
                        <div key={videoId} className="border border-slate-200 rounded-xl p-6 hover:border-medical-300 transition-colors group">
                          <div className="w-12 h-12 bg-accent-50 text-accent-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <PlayCircle className="h-6 w-6" />
                          </div>
                          <h4 className="font-bold text-slate-900 mb-2 truncate">Vidéo {videoId}</h4>
                          <Link href={`/videos/${videoId}`} className="text-sm font-medium text-accent-600 hover:text-accent-700 flex items-center gap-1">
                            Regarder la vidéo &rarr;
                          </Link>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">Aucune vidéo individuelle achetée.</p>
                  )}
                </div>

                {(!profile.purchasedPacks?.length && !profile.purchasedVideos?.length) && (
                  <p className="text-slate-500 italic">Aucun achat enregistré pour le moment.</p>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
