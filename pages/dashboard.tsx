'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import { User, Star, Camera, LockKeyhole, Moon, Sun, Trash2 } from 'lucide-react';
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
import { isSubscriptionActive } from '@/lib/access-control';
import { formatFullName, normalizeNameParts, splitFullName } from '@/lib/name-utils';

export default function UserDashboard() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'profile' | 'storage'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
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

  const isLightMode = themeMode === 'light';

  const cardStyle = {
    background: isLightMode
      ? 'color-mix(in oklab, var(--app-bg) 94%, var(--app-surface) 6%)'
      : 'color-mix(in oklab, var(--app-surface) 96%, var(--app-bg) 4%)',
    borderColor: isLightMode
      ? 'color-mix(in oklab, var(--app-border) 88%, var(--app-surface-2) 12%)'
      : 'color-mix(in oklab, var(--app-border) 90%, var(--app-deep-surface) 10%)',
    boxShadow: '0 14px 48px -24px rgba(0, 0, 0, 0.55)',
  };

  const insetCardStyle = {
    background: isLightMode
      ? 'color-mix(in oklab, var(--app-bg) 96%, var(--app-surface-2) 4%)'
      : 'color-mix(in oklab, var(--app-surface-2) 86%, var(--app-deep-surface) 14%)',
    borderColor: isLightMode
      ? 'color-mix(in oklab, var(--app-border) 92%, var(--app-surface) 8%)'
      : 'color-mix(in oklab, var(--app-border) 86%, var(--app-deep-surface-2) 14%)',
  };

  const inputClasses =
    'w-full px-4 py-2 rounded-xl border bg-[var(--app-surface)] text-[var(--app-text)] border-[var(--app-border)] placeholder:text-[var(--app-muted)] focus:ring-2 focus:ring-[var(--app-accent)] focus:border-[var(--app-accent)] outline-none transition-all';

  const inputTone = {
    background: isLightMode
      ? 'color-mix(in oklab, var(--app-bg) 96%, var(--app-surface) 4%)'
      : 'var(--app-surface)',
    borderColor: isLightMode
      ? 'color-mix(in oklab, var(--app-border) 92%, var(--app-surface-2) 8%)'
      : 'var(--app-border)',
    color: 'var(--app-text)',
  };

  const subtleText = { color: 'color-mix(in oklab, var(--app-text) 78%, var(--app-muted) 22%)' };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const syncThemeMode = () => {
      const attrTheme = root.getAttribute('data-theme');
      setThemeMode(attrTheme === 'dark' ? 'dark' : 'light');
    };

    syncThemeMode();

    const observer = new MutationObserver((mutations) => {
      const hasThemeMutation = mutations.some((mutation) => mutation.attributeName === 'data-theme');
      if (hasThemeMutation) {
        syncThemeMode();
      }
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

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
    if (tabParam === 'profile' || tabParam === 'storage') {
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
    setThemeMode(defaultMode);
  }, [defaultMode]);

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

  if (authLoading) {
    return <div className="flex-1 flex items-center justify-center"><div className="w-12 h-12 border-4 border-medical-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!profile) return null;

  const isVipPlus = isSubscriptionActive(profile);
  const accountLevelLabel = isVipPlus ? 'VIP Plus' : profile.role === 'vip' ? 'VIP' : profile.role === 'admin' ? 'Admin' : 'Demo';

  return (
    <div
      className="flex-1 min-h-screen py-8 md:py-10"
      style={{
        background: 'radial-gradient(130% 120% at 20% 20%, color-mix(in oklab, var(--app-accent) 4%, var(--app-bg) 96%), var(--app-bg))',
      }}
    >
      <main className="px-4 md:px-10">
        <div className="max-w-5xl mx-auto">
          <div
            className="mb-6 rounded-3xl border p-6 shadow-xl"
            style={{
              color: 'var(--hero-title)',
              borderColor: 'color-mix(in oklab, var(--hero-chip-border) 72%, var(--app-border) 28%)',
              background: 'linear-gradient(140deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
            }}
          >
            <div className="flex flex-col gap-5">
              <div className="flex flex-col lg:flex-row lg:items-center gap-5">
                <div className="p-4 rounded-2xl flex flex-col items-center text-center min-w-[220px]">
                  <div className="relative w-24 h-24 rounded-full overflow-hidden bg-slate-100 mb-3 border-4 border-white shadow-md">
                    {profile.photoURL ? (
                      <Image src={profile.photoURL} alt={profile.displayName} fill className="object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User className="w-12 h-12 text-[var(--app-muted)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
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
                  <h2 className="text-base font-bold">{formatFullName(lastName, firstName) || profile.displayName}</h2>
                  <p className="text-xs mb-2" style={{ color: 'var(--hero-body)' }}>{profile.email}</p>
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    isVipPlus
                      ? 'bg-accent-100 text-accent-700'
                      : profile.role === 'vip'
                        ? 'bg-medical-100 text-medical-700'
                        : profile.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-[var(--app-surface-2)] text-[var(--app-text)]'
                  }`}>
                    {isVipPlus ? <Star className="w-3 h-3 fill-current" /> : null}
                    {accountLevelLabel}
                  </span>
                </div>

                <div className="flex-1">
                  <p className="text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--hero-body)' }}>Espace personnel</p>
                  <h1 className="text-2xl md:text-3xl font-bold mt-1">{formatFullName(lastName, firstName) || profile.displayName}</h1>
                  <p className="text-sm mt-2" style={{ color: 'var(--hero-body)' }}>Gérez votre profil, votre sécurité et vos accès pédagogiques depuis un seul espace.</p>
                </div>
              </div>

            </div>
          </div>

          {activeTab === 'profile' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <section className="rounded-2xl p-8 shadow-lg" style={cardStyle}>
                <h3 className="text-2xl font-bold mb-6" style={{ color: 'var(--app-text)' }}>Mon Profil</h3>
                <div className="rounded-2xl border p-5 space-y-6" style={insetCardStyle}>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={subtleText}>Nom et prénom</label>
                    {isEditing ? (
                      <div className="grid sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          title="Nom"
                          aria-label="Nom"
                          placeholder="NOM"
                          className={inputClasses}
                          style={inputTone}
                        />
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          title="Prénom"
                          aria-label="Prénom"
                          placeholder="Prénom"
                          className={inputClasses}
                          style={inputTone}
                        />
                        <button onClick={handleUpdateProfile} className="bg-[var(--app-accent)] text-[var(--app-accent-contrast)] px-4 py-2 rounded-xl font-medium hover:brightness-110 transition-colors">Enregistrer</button>
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            const splitName = splitFullName(profile.displayName || '');
                            setLastName(profile.lastName || splitName.lastName);
                            setFirstName(profile.firstName || splitName.firstName);
                          }}
                          className="bg-[var(--app-surface-2)] text-[var(--app-text)] px-4 py-2 rounded-xl font-medium border border-[var(--app-border)] hover:brightness-105 transition-colors"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center px-4 py-3 border rounded-xl" style={insetCardStyle}>
                        <span className="font-medium text-[var(--app-text)]">{formatFullName(lastName, firstName) || profile.displayName}</span>
                        <button onClick={() => setIsEditing(true)} className="text-sm font-medium text-[var(--app-accent)] hover:underline">Modifier</button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={subtleText}>Adresse Email</label>
                    <div className="px-4 py-3 border rounded-xl text-[var(--app-muted)] cursor-not-allowed" style={insetCardStyle}>
                      {profile.email}
                    </div>
                    <p className="text-xs mt-2" style={subtleText}>L'adresse email ne peut pas être modifiée depuis votre espace.</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl p-8 shadow-lg" style={cardStyle}>
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                  <LockKeyhole className="w-5 h-5 text-[var(--app-muted)]" />
                  Changement du mot de passe
                </h3>
                <div className="rounded-2xl border p-5 space-y-3" style={insetCardStyle}>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Mot de passe actuel"
                    className={inputClasses}
                    style={inputTone}
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nouveau mot de passe"
                    className={inputClasses}
                    style={inputTone}
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirmer le nouveau mot de passe"
                    className={inputClasses}
                    style={inputTone}
                  />
                  <button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={isUpdatingPassword}
                    className="mt-1 inline-flex items-center justify-center px-4 py-2 rounded-xl bg-[var(--app-accent)] text-[var(--app-accent-contrast)] text-sm font-medium hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {isUpdatingPassword ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
                  </button>
                </div>
              </section>

              <section className="rounded-2xl p-8 shadow-lg" style={cardStyle}>
                <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--app-text)' }}>Mode par défaut</h3>
                <div className="rounded-2xl border p-5" style={insetCardStyle}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative flex-1">
                      <select
                        value={defaultMode}
                        onChange={(e) => setDefaultMode(e.target.value as 'light' | 'dark')}
                        className={`${inputClasses} appearance-none pr-10`}
                        title="Mode par défaut"
                        aria-label="Mode par défaut"
                        style={inputTone}
                      >
                        <option value="light">Light mode</option>
                        <option value="dark">Dark mode</option>
                      </select>
                      {defaultMode === 'dark' ? (
                        <Moon className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-[var(--app-muted)]" />
                      ) : (
                        <Sun className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-[var(--app-muted)]" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveDefaultMode}
                      disabled={isSavingDefaultMode}
                      className="px-4 py-2 rounded-xl bg-[var(--app-accent)] text-[var(--app-accent-contrast)] text-sm font-medium hover:brightness-110 disabled:opacity-60 transition-colors"
                    >
                      {isSavingDefaultMode ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              </section>

              {profile.role !== 'admin' && (
                <section
                  className="rounded-2xl shadow-lg border p-8"
                  style={{
                    ...cardStyle,
                    background: 'color-mix(in oklab, var(--app-surface) 88%, var(--app-danger) 12%)',
                    borderColor: 'color-mix(in oklab, var(--app-danger) 52%, var(--app-border) 48%)',
                  }}
                >
                  <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--app-danger)' }}>
                    Suppression définitive du compte
                  </h3>
                  <p className="text-sm mb-4" style={subtleText}>
                    Cette action est irréversible et supprime votre compte ainsi que vos données associées.
                  </p>
                  <button
                    type="button"
                    onClick={handleDeleteAccountPermanently}
                    disabled={isDeletingAccount}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--app-danger)] text-[var(--app-accent-contrast)] text-sm font-medium hover:brightness-110 disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4" />
                    {isDeletingAccount ? 'Suppression...' : 'Supprimer définitivement mon compte'}
                  </button>
                </section>
              )}
            </motion.div>
          )}

          {activeTab === 'storage' && profile.role === 'admin' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl shadow-lg border p-8"
              style={cardStyle}
            >
              <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--app-text)' }}>Gestion de Stockage</h3>
              <p className="text-sm mb-6" style={subtleText}>
                Configurez les identifiants Cloudinary utilisés par la plateforme.
              </p>

              <div className="max-w-xl space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={subtleText}>Cloudinary Cloud Name</label>
                  <input
                    type="text"
                    value={storageSettings.cloudName}
                    onChange={(e) => setStorageSettings((prev) => ({ ...prev, cloudName: e.target.value }))}
                    className={inputClasses}
                    placeholder="ex: demo-cloud"
                    style={inputTone}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={subtleText}>CLOUDINARY_API_KEY</label>
                  <input
                    type="text"
                    value={storageSettings.apiKey}
                    onChange={(e) => setStorageSettings((prev) => ({ ...prev, apiKey: e.target.value }))}
                    className={inputClasses}
                    placeholder="ex: 123456789012345"
                    style={inputTone}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={subtleText}>CLOUDINARY_API_SECRET</label>
                  <input
                    type="password"
                    value={storageSettings.apiSecret}
                    onChange={(e) => setStorageSettings((prev) => ({ ...prev, apiSecret: e.target.value }))}
                    className={inputClasses}
                    placeholder="Secret API"
                    style={inputTone}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveStorageSettings}
                  disabled={isSavingStorageSettings}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-[var(--app-accent)] text-[var(--app-accent-contrast)] text-sm font-medium hover:brightness-110 disabled:opacity-60"
                >
                  {isSavingStorageSettings ? 'Enregistrement...' : 'Enregistrer les paramètres'}
                </button>
              </div>
            </motion.div>
          )}

        </div>
      </main>
    </div>
  );
}