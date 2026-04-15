'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import { User, Star, Camera, LockKeyhole, Moon, Sun, Trash2, Crop, RotateCcw, RotateCw, Square, Link2, Unplug } from 'lucide-react';
import Cropper, { type Area } from 'react-easy-crop';
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
  uploadAvatarImage,
  cleanupCloudinaryAssets,
  cleanupCloudinaryAssetsOnPageExit,
  type CloudinaryCleanupAsset,
} from '@/lib/data/local-data';
import { isSubscriptionActive } from '@/lib/security/access-control';
import { formatFullName, normalizeNameParts, splitFullName } from '@/lib/utils/name-utils';
import { AVATAR_FALLBACK_SRC, applyImageFallback } from '@/lib/utils/media-fallback';
import { normalizeGoogleOAuthError } from '@/lib/utils/oauth-error';

export default function UserDashboard() {
  const {
    user,
    profile,
    loading: authLoading,
    signOut,
    connectGoogleAccount,
    disconnectGoogleAccount,
  } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'profile' | 'storage'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [defaultMode, setDefaultMode] = useState<'light' | 'dark'>('light');
  const [isSavingDefaultMode, setIsSavingDefaultMode] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [avatarSource, setAvatarSource] = useState<string | null>(null);
  const [avatarSourceFileName, setAvatarSourceFileName] = useState('');
  const [avatarCrop, setAvatarCrop] = useState({ x: 0, y: 0 });
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarRotation, setAvatarRotation] = useState(0);
  const [avatarAspectMode, setAvatarAspectMode] = useState<'square' | 'free'>('square');
  const [avatarCroppedAreaPixels, setAvatarCroppedAreaPixels] = useState<Area | null>(null);
  const [pendingAvatarDraftAssets, setPendingAvatarDraftAssets] = useState<CloudinaryCleanupAsset[]>([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isGoogleLinking, setIsGoogleLinking] = useState(false);
  const [isGoogleDisconnecting, setIsGoogleDisconnecting] = useState(false);
  const [storageSettings, setStorageSettings] = useState({
    cloudName: '',
    apiKey: '',
    apiSecret: '',
  });
  const [isSavingStorageSettings, setIsSavingStorageSettings] = useState(false);

  const trimmedStorageSettings = {
    cloudName: storageSettings.cloudName.trim(),
    apiKey: storageSettings.apiKey.trim(),
    apiSecret: storageSettings.apiSecret.trim(),
  };

  const hasCompleteStorageSettings =
    Boolean(trimmedStorageSettings.cloudName)
    && Boolean(trimmedStorageSettings.apiKey)
    && Boolean(trimmedStorageSettings.apiSecret);

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
  const isGoogleConnected = Boolean(String(profile?.googleAuth?.sub || '').trim());
  const oauthErrorRaw = typeof router.query.oauthError === 'string' ? router.query.oauthError : '';
  const oauthError = useMemo(() => normalizeGoogleOAuthError(oauthErrorRaw), [oauthErrorRaw]);
  const hasLocalPassword = profile?.passwordLoginEnabled !== false;
  const authConnectionState = !isGoogleConnected && hasLocalPassword
    ? 'local-only'
    : isGoogleConnected && hasLocalPassword
      ? 'google-and-local'
      : 'google-only';
  const requiresCurrentPasswordForChange = hasLocalPassword && !isGoogleConnected;
  const passwordSectionTitle = authConnectionState === 'google-only'
    ? 'Definir un mot de passe local'
    : 'Mettre a jour le mot de passe local';
  const passwordPrimaryActionLabel = authConnectionState === 'google-only'
    ? 'Definir le mot de passe local'
    : 'Mettre a jour le mot de passe local';
  const authStateDescription = authConnectionState === 'local-only'
    ? 'Mode actuel: Mot de passe local uniquement.'
    : authConnectionState === 'google-and-local'
      ? 'Mode actuel: Connexion Google + mot de passe local.'
      : 'Mode actuel: Connexion Google uniquement.';

  const createImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const getRadianAngle = (degreeValue: number) => (degreeValue * Math.PI) / 180;

  const rotateSize = (width: number, height: number, rotation: number) => {
    const rotRad = getRadianAngle(rotation);
    return {
      width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
      height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
    };
  };

  const getCroppedAvatarBlob = async (imageSrc: string, pixelCrop: Area, rotation = 0): Promise<Blob> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    const rotatedSize = rotateSize(image.width, image.height, rotation);
    canvas.width = Math.floor(rotatedSize.width);
    canvas.height = Math.floor(rotatedSize.height);

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(getRadianAngle(rotation));
    ctx.translate(-image.width / 2, -image.height / 2);
    ctx.drawImage(image, 0, 0);

    const data = ctx.getImageData(
      Math.floor(pixelCrop.x),
      Math.floor(pixelCrop.y),
      Math.floor(pixelCrop.width),
      Math.floor(pixelCrop.height),
    );

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = Math.floor(pixelCrop.width);
    outputCanvas.height = Math.floor(pixelCrop.height);

    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) {
      throw new Error('Canvas output context not available');
    }
    outputCtx.putImageData(data, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      outputCanvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('Image conversion failed'));
      }, 'image/jpeg', 0.92);
    });
  };

  const resetAvatarEditor = () => {
    if (avatarSource) {
      URL.revokeObjectURL(avatarSource);
    }
    setAvatarEditorOpen(false);
    setAvatarSource(null);
    setAvatarSourceFileName('');
    setAvatarCrop({ x: 0, y: 0 });
    setAvatarZoom(1);
    setAvatarRotation(0);
    setAvatarAspectMode('square');
    setAvatarCroppedAreaPixels(null);
  };

  useEffect(() => {
    const flushAvatarDraftsOnPageExit = () => {
      if (pendingAvatarDraftAssets.length === 0) {
        return;
      }
      cleanupCloudinaryAssetsOnPageExit(pendingAvatarDraftAssets);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', flushAvatarDraftsOnPageExit);
      window.addEventListener('pagehide', flushAvatarDraftsOnPageExit);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', flushAvatarDraftsOnPageExit);
        window.removeEventListener('pagehide', flushAvatarDraftsOnPageExit);
      }

      if (pendingAvatarDraftAssets.length === 0) {
        return;
      }

      void cleanupCloudinaryAssets(pendingAvatarDraftAssets).catch((error) => {
        console.error('[avatar-cleanup:dashboard-unmount]', error);
      });
    };
  }, [pendingAvatarDraftAssets]);

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
          return;
        }

        setStorageSettings({
          cloudName: '',
          apiKey: '',
          apiSecret: '',
        });
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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;

    const localUrl = URL.createObjectURL(file);
    if (avatarSource) {
      URL.revokeObjectURL(avatarSource);
    }

    setAvatarSource(localUrl);
    setAvatarSourceFileName(file.name || 'avatar.jpg');
    setAvatarCrop({ x: 0, y: 0 });
    setAvatarZoom(1);
    setAvatarRotation(0);
    setAvatarAspectMode('square');
    setAvatarEditorOpen(true);
  };

  const handleAvatarCropComplete = (_croppedArea: Area, croppedAreaPixels: Area) => {
    setAvatarCroppedAreaPixels(croppedAreaPixels);
  };

  const handleAvatarSave = async () => {
    if (!user || !avatarSource || !avatarCroppedAreaPixels) return;

    const previousAvatarUrl = String(profile?.photoURL || user.photoURL || '').trim();
    let uploadedAvatarAsset: { publicId: string; secureUrl: string; resourceType: 'image' } | null = null;

    try {
      setAvatarUploading(true);
      const croppedBlob = await getCroppedAvatarBlob(
        avatarSource,
        avatarCroppedAreaPixels,
        avatarRotation,
      );
      const sourceName = String(avatarSourceFileName || '').trim();
      const sourceBaseName = sourceName
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.[^/.]+$/, '')
        .trim();
      const avatarFileBaseName = sourceBaseName || `avatar-${user.uid}`;

      const croppedFile = new File([croppedBlob], `${avatarFileBaseName}.jpg`, {
        type: 'image/jpeg',
      });

      const data = await uploadAvatarImage(croppedFile);
      const url = data.secureUrl;
      uploadedAvatarAsset = {
        publicId: data.publicId,
        secureUrl: data.secureUrl,
        resourceType: 'image',
      };
      setPendingAvatarDraftAssets([uploadedAvatarAsset]);

      await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
      await updateAuthPhotoURL(user.uid, url);

      if (previousAvatarUrl && previousAvatarUrl !== url) {
        await cleanupCloudinaryAssets([
          {
            secureUrl: previousAvatarUrl,
            resourceType: 'image',
          },
        ]).catch((cleanupError) => {
          console.warn('[avatar-cleanup:previous]', cleanupError);
        });
      }

      setPendingAvatarDraftAssets([]);
      uploadedAvatarAsset = null;
      resetAvatarEditor();
    } catch (error) {
      if (uploadedAvatarAsset) {
        const rollbackOk = await cleanupCloudinaryAssets([uploadedAvatarAsset])
          .then(() => true)
          .catch((cleanupError) => {
            console.warn('[avatar-cleanup:rollback]', cleanupError);
            return false;
          });

        if (rollbackOk) {
          setPendingAvatarDraftAssets([]);
        }
      }
      console.error('Error updating avatar:', error);
      alert('Erreur lors du changement de la photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;
    if ((!requiresCurrentPasswordForChange && (!newPassword || !confirmPassword)) || (requiresCurrentPasswordForChange && (!currentPassword || !newPassword || !confirmPassword))) {
      alert('Veuillez remplir tous les champs.');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('Les nouveaux mots de passe ne correspondent pas.');
      return;
    }

    try {
      setIsUpdatingPassword(true);
      await updateAuthPassword(user.uid, currentPassword, newPassword);
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

  const handleGoogleConnectOrReconnect = async () => {
    try {
      setIsGoogleLinking(true);
      await connectGoogleAccount();
    } catch (error: any) {
      console.error('Error connecting Google account:', error);
      alert(error?.message || 'Erreur lors de la connexion Google.');
      setIsGoogleLinking(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    if (!isGoogleConnected) return;

    const confirmed = confirm('Voulez-vous vraiment deconnecter Google de ce compte ?');
    if (!confirmed) {
      return;
    }

    const requiresLocalPassword = profile?.passwordLoginEnabled === false;
    let localPasswordToSet = '';

    if (requiresLocalPassword) {
      if (!newPassword || !confirmPassword) {
        alert('Pour deconnecter Google, definissez d\'abord un mot de passe local puis confirmez-le.');
        return;
      }

      if (newPassword !== confirmPassword) {
        alert('Les nouveaux mots de passe ne correspondent pas.');
        return;
      }

      if (newPassword.length < 6) {
        alert('Le mot de passe local doit contenir au moins 6 caracteres.');
        return;
      }

      localPasswordToSet = newPassword;
    }

    try {
      setIsGoogleDisconnecting(true);
      await disconnectGoogleAccount(localPasswordToSet || undefined);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      alert('Compte Google deconnecte.');
    } catch (error: any) {
      alert(error?.message || 'Erreur lors de la deconnexion Google.');
    } finally {
      setIsGoogleDisconnecting(false);
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

    if (!hasCompleteStorageSettings) {
      alert('Renseignez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET.');
      return;
    }

    try {
      setIsSavingStorageSettings(true);
      await setDoc(doc(db, 'appSettings', 'cloudinary'), {
        cloudName: trimmedStorageSettings.cloudName,
        apiKey: trimmedStorageSettings.apiKey,
        apiSecret: trimmedStorageSettings.apiSecret,
        updatedAt: new Date().toISOString(),
        updatedBy: profile.uid,
      });
      alert('Paramètres Cloudinary admin enregistrés.');
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
      await deleteAuthAccountByUid(user.uid);
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
            <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center">
              <div className="rounded-2xl p-4 backdrop-blur-sm">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-6">
                    <div className="relative w-36 h-36 md:w-40 md:h-40 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
                      {profile.photoURL ? (
                        <Image
                          src={profile.photoURL}
                          alt={profile.displayName}
                          fill
                          loading="eager"
                          fetchPriority="high"
                          sizes="160px"
                          className="object-cover"
                          referrerPolicy="no-referrer"
                          onError={(event) => applyImageFallback(event, AVATAR_FALLBACK_SRC)}
                        />
                      ) : (
                        <User className="w-16 h-16 text-[var(--app-muted)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      )}
                    </div>
                    <label
                      className={`absolute -bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-xs font-semibold text-[var(--app-text)] shadow-xl shadow-black/35 transition ${avatarUploading || avatarEditorOpen ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:-translate-y-0.5 hover:brightness-105'}`}
                      title="Modifier la photo"
                      aria-label="Modifier la photo"
                    >
                      {avatarUploading ? (
                        <span>Chargement...</span>
                      ) : (
                        <>
                          <Camera className="w-3.5 h-3.5" />
                          <span>Modifier</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                        disabled={avatarUploading || avatarEditorOpen}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="min-w-0 space-y-4">
                <p className="text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--hero-body)' }}>Espace personnel</p>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--hero-body)' }}>Nom complet</p>
                  <h1 className="text-2xl md:text-3xl font-bold mt-1">{formatFullName(lastName, firstName) || profile.displayName}</h1>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--hero-body)' }}>Gérez votre profil, votre sécurité et vos accès pédagogiques depuis un seul espace.</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/25 bg-white/10 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--hero-body)' }}>Email</p>
                    <p className="mt-1 text-sm font-medium break-all" style={{ color: 'var(--hero-title)' }}>{profile.email}</p>
                  </div>

                  <div className="rounded-xl border border-white/25 bg-white/10 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--hero-body)' }}>Role</p>
                    <div className="mt-1">
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
                  </div>
                </div>
              </div>
            </div>
          </div>

          {activeTab === 'profile' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {oauthError ? (
                <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'color-mix(in oklab, var(--app-danger) 36%, var(--app-border) 64%)', background: 'color-mix(in oklab, var(--app-danger) 12%, var(--app-surface) 88%)', color: 'color-mix(in oklab, var(--app-danger) 78%, var(--app-text) 22%)' }}>
                  {oauthError}
                </div>
              ) : null}

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

                  <div>
                    <label className="block text-sm font-medium mb-2" style={subtleText}>Connexion Google</label>
                    <div className="rounded-xl border p-4" style={insetCardStyle}>
                      <p className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                        {isGoogleConnected ? 'Compte Google connecte' : 'Aucun compte Google connecte'}
                      </p>
                      <p className="text-xs mt-1" style={subtleText}>
                        {isGoogleConnected
                          ? `Email Google: ${profile.googleAuth?.email || 'non disponible'}`
                          : 'Connectez Google pour vous authentifier plus rapidement.'}
                      </p>
                      <p className="text-xs mt-1" style={subtleText}>{authStateDescription}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {!isGoogleConnected ? (
                          <button
                            type="button"
                            onClick={handleGoogleConnectOrReconnect}
                            disabled={isGoogleLinking}
                            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium bg-[var(--app-accent)] text-[var(--app-accent-contrast)] hover:brightness-110 disabled:opacity-60"
                          >
                            <Link2 className="w-4 h-4" />
                            {isGoogleLinking ? 'Connexion...' : 'Connexion Google'}
                          </button>
                        ) : null}

                        {isGoogleConnected ? (
                          <button
                            type="button"
                            onClick={handleGoogleDisconnect}
                            disabled={isGoogleDisconnecting}
                            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium border border-[var(--app-border)] text-[var(--app-text)] hover:bg-[var(--app-surface-2)] disabled:opacity-60"
                          >
                            <Unplug className="w-4 h-4" />
                            {isGoogleDisconnecting
                              ? 'Deconnexion...'
                              : authConnectionState === 'google-only'
                                ? 'Deconnecter Google (avec mot de passe)'
                                : 'Deconnecter Google'}
                          </button>
                        ) : null}
                      </div>

                      <p className="text-xs mt-3" style={subtleText}>
                        {authConnectionState === 'google-only'
                          ? 'Pour desactiver la connexion Google, renseignez d\'abord un nouveau mot de passe local puis cliquez sur "Deconnecter Google".'
                          : authConnectionState === 'google-and-local'
                            ? 'Vous pouvez desactiver la connexion Google sans perdre l\'acces, car un mot de passe local est deja actif.'
                            : 'Vous pouvez activer la connexion Google en complement du mot de passe local.'}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl p-8 shadow-lg" style={cardStyle}>
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                  <LockKeyhole className="w-5 h-5 text-[var(--app-muted)]" />
                  {passwordSectionTitle}
                </h3>
                <div className="rounded-2xl border p-5 space-y-3" style={insetCardStyle}>
                  {requiresCurrentPasswordForChange ? (
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Mot de passe actuel"
                      className={inputClasses}
                      style={inputTone}
                    />
                  ) : (
                    <p className="text-xs" style={subtleText}>
                      {authConnectionState === 'google-and-local'
                        ? 'Le mot de passe actuel n\'est pas requis avec une session Google active. Definissez simplement le nouveau mot de passe local.'
                        : 'Votre compte utilise uniquement la connexion Google. Definissez un mot de passe local pour activer aussi la connexion classique.'}
                    </p>
                  )}
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
                    {isUpdatingPassword ? 'Mise a jour...' : passwordPrimaryActionLabel}
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
                Ces identifiants Cloudinary sont propres a cet admin et servent aux uploads de contenu pedagogique
                (videos, schemas et cas cliniques). Les avatars restent sur la configuration Cloudinary principale.
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
                  disabled={isSavingStorageSettings || !hasCompleteStorageSettings}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-[var(--app-accent)] text-[var(--app-accent-contrast)] text-sm font-medium hover:brightness-110 disabled:opacity-60"
                >
                  {isSavingStorageSettings ? 'Enregistrement...' : 'Enregistrer les paramètres'}
                </button>
              </div>
            </motion.div>
          )}

        </div>
      </main>

      {avatarEditorOpen && avatarSource && (
        <div
          className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Editeur de photo de profil"
        >
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--app-border)] flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--app-text)]">Modifier la photo de profil</h3>
                <p className="text-xs text-[var(--app-muted)]">Glissez l image, zoomez, faites pivoter, puis enregistrez.</p>
              </div>
              <button
                type="button"
                onClick={resetAvatarEditor}
                className="px-3 py-1.5 text-xs rounded-lg border border-[var(--app-border)] text-[var(--app-text)] hover:bg-[var(--app-surface-2)]"
              >
                Annuler
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="relative h-[320px] md:h-[420px] rounded-xl overflow-hidden bg-black">
                <Cropper
                  image={avatarSource}
                  crop={avatarCrop}
                  zoom={avatarZoom}
                  rotation={avatarRotation}
                  aspect={avatarAspectMode === 'square' ? 1 : undefined}
                  cropShape={avatarAspectMode === 'square' ? 'round' : 'rect'}
                  showGrid={avatarAspectMode === 'free'}
                  onCropChange={setAvatarCrop}
                  onZoomChange={setAvatarZoom}
                  onRotationChange={setAvatarRotation}
                  onCropComplete={handleAvatarCropComplete}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-muted)]">Zoom</p>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={avatarZoom}
                    onChange={(e) => setAvatarZoom(Number(e.target.value))}
                    title="Zoom de l avatar"
                    aria-label="Zoom de l avatar"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-muted)]">Rotation ({Math.round(avatarRotation)}°)</p>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={avatarRotation}
                    onChange={(e) => setAvatarRotation(Number(e.target.value))}
                    title="Rotation de l avatar"
                    aria-label="Rotation de l avatar"
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAvatarAspectMode('square')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    avatarAspectMode === 'square'
                      ? 'bg-[var(--app-accent)] text-[var(--app-accent-contrast)] border-[var(--app-accent)]'
                      : 'border-[var(--app-border)] text-[var(--app-text)] hover:bg-[var(--app-surface-2)]'
                  }`}
                >
                  <Square className="w-3.5 h-3.5" />
                  Carre avatar
                </button>
                <button
                  type="button"
                  onClick={() => setAvatarAspectMode('free')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    avatarAspectMode === 'free'
                      ? 'bg-[var(--app-accent)] text-[var(--app-accent-contrast)] border-[var(--app-accent)]'
                      : 'border-[var(--app-border)] text-[var(--app-text)] hover:bg-[var(--app-surface-2)]'
                  }`}
                >
                  <Crop className="w-3.5 h-3.5" />
                  Recadrage libre
                </button>

                <button
                  type="button"
                  onClick={() => setAvatarRotation((prev) => prev - 90)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--app-border)] text-[var(--app-text)] hover:bg-[var(--app-surface-2)]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  -90°
                </button>

                <button
                  type="button"
                  onClick={() => setAvatarRotation((prev) => prev + 90)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--app-border)] text-[var(--app-text)] hover:bg-[var(--app-surface-2)]"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  +90°
                </button>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-[var(--app-border)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={resetAvatarEditor}
                disabled={avatarUploading}
                className="px-4 py-2 rounded-xl border border-[var(--app-border)] text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-surface-2)] disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleAvatarSave}
                disabled={avatarUploading || !avatarCroppedAreaPixels}
                className="px-4 py-2 rounded-xl bg-[var(--app-accent)] text-[var(--app-accent-contrast)] text-sm font-medium hover:brightness-110 disabled:opacity-60"
              >
                {avatarUploading ? 'Enregistrement...' : 'Enregistrer la photo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}