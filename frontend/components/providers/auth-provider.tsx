'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  auth,
  beginGoogleConnect,
  beginGoogleSignIn,
  createAuthAccount,
  db,
  disconnectGoogleAccount as disconnectGoogleAccountApi,
  doc,
  ensureDemoAccountsSeeded,
  getValidatedSessionUser,
  getDoc,
  onAuthStateChanged,
  setDoc,
  updateDoc,
  signInWithEmail,
  signOut as localSignOut,
  updateAuthDisplayName,
  type LocalAuthUser,
} from '@/lib/data/local-data';
import { type SubscriptionApprovalStatus, type UserRole } from '@/lib/security/access-control';
import { formatFullName, normalizeNameParts, splitFullName } from '@/lib/utils/name-utils';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  photoURL: string;
  defaultMode?: 'light' | 'dark';
  role: UserRole;
  subscriptionEndDate?: string;
  subscriptionApprovalStatus: SubscriptionApprovalStatus;
  doctorSpecialty?: string;
  phoneNumber?: string;
  purchasedVideos: string[];
  purchasedPacks: string[];
  favoriteVideoIds: string[];
  importantVideoIds: string[];
  blockedVideoIds?: string[];
  isBlocked?: boolean;
  passwordLoginEnabled?: boolean;
  googleAuth?: {
    sub?: string;
    email?: string;
    picture?: string;
    connectedAt?: string;
  };
  supportAdminOnline?: boolean;
  supportAdminConnectedAt?: string;
  supportAdminDisconnectedAt?: string;
  supportClientOnline?: boolean;
  supportClientConnectedAt?: string;
  supportClientDisconnectedAt?: string;
  createdAt: string;
}

interface AuthContextType {
  user: LocalAuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signInWithGoogle: (rememberMe?: boolean) => void;
  connectGoogleAccount: () => Promise<void>;
  disconnectGoogleAccount: (newPassword?: string) => Promise<void>;
  signUp: (payload: {
    lastName: string;
    firstName: string;
    email: string;
    password: string;
    phoneNumber?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
  signIn: async () => {},
  signInWithGoogle: () => {},
  connectGoogleAccount: async () => {},
  disconnectGoogleAccount: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalAuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const normalizeProfile = (profile: UserProfile, authUser?: LocalAuthUser): UserProfile => {
    const uniquePurchasedVideos = Array.isArray(profile.purchasedVideos)
      ? Array.from(new Set(profile.purchasedVideos.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
      : [];
    const uniquePurchasedPacks = Array.isArray(profile.purchasedPacks)
      ? Array.from(new Set(profile.purchasedPacks.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
      : [];
    const uniqueImportantVideoIds = Array.isArray(profile.importantVideoIds)
      ? Array.from(new Set(profile.importantVideoIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
      : [];
    const uniqueFavoriteVideoIds = Array.isArray(profile.favoriteVideoIds)
      ? Array.from(new Set(profile.favoriteVideoIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
      : [];

    // Important videos are a subset of favorites in the UX.
    const mergedFavoriteVideoIds = Array.from(new Set([...uniqueFavoriteVideoIds, ...uniqueImportantVideoIds]));

    const googleAuthSub = String(profile.googleAuth?.sub || '').trim();
    const normalizedGoogleAuth = googleAuthSub
      ? {
          sub: googleAuthSub,
          email: String(profile.googleAuth?.email || '').trim().toLowerCase(),
          picture: String(profile.googleAuth?.picture || '').trim(),
          connectedAt: String(profile.googleAuth?.connectedAt || '').trim(),
        }
      : undefined;

    const sourceDisplayName = profile.displayName || authUser?.displayName || 'Utilisateur';
    const splitSourceName = splitFullName(sourceDisplayName);
    const normalizedNames = normalizeNameParts(
      profile.lastName || splitSourceName.lastName,
      profile.firstName || splitSourceName.firstName,
    );
    const normalizedDisplayName =
      formatFullName(normalizedNames.lastName, normalizedNames.firstName) || sourceDisplayName;

    return {
      ...profile,
      uid: profile.uid,
      email: profile.email,
      displayName: normalizedDisplayName,
      firstName: normalizedNames.firstName,
      lastName: normalizedNames.lastName,
      photoURL: profile.photoURL || authUser?.photoURL || '',
      defaultMode: profile.defaultMode === 'dark' ? 'dark' : 'light',
      role: profile.role || 'user',
      subscriptionApprovalStatus: profile.subscriptionApprovalStatus || 'none',
      purchasedVideos: uniquePurchasedVideos,
      purchasedPacks: uniquePurchasedPacks,
      favoriteVideoIds: mergedFavoriteVideoIds,
      importantVideoIds: uniqueImportantVideoIds,
      blockedVideoIds: Array.isArray(profile.blockedVideoIds) ? profile.blockedVideoIds : [],
      isBlocked: Boolean(profile.isBlocked),
      passwordLoginEnabled: profile.passwordLoginEnabled !== false,
      googleAuth: normalizedGoogleAuth,
      createdAt: profile.createdAt || new Date().toISOString(),
    };
  };

  const ensureUserProfile = useCallback(async (authUser: LocalAuthUser): Promise<UserProfile> => {
    const userDocRef = doc(db, 'users', authUser.uid);
    const userDoc = await getDoc<UserProfile>(userDocRef);

    if (userDoc.exists()) {
      const existing = normalizeProfile(userDoc.data() as UserProfile, authUser);
      if (existing.displayName !== authUser.displayName || existing.photoURL !== authUser.photoURL) {
        const updated = normalizeProfile(
          {
            ...existing,
            displayName: authUser.displayName,
            photoURL: authUser.photoURL,
          },
          authUser,
        );
        await setDoc(userDocRef, updated);
        return updated;
      }

      return existing;
    }

    const newProfile: UserProfile = {
      uid: authUser.uid,
      email: authUser.email,
      displayName: authUser.displayName || 'Utilisateur',
      firstName: splitFullName(authUser.displayName || 'Utilisateur').firstName,
      lastName: splitFullName(authUser.displayName || 'Utilisateur').lastName,
      photoURL: authUser.photoURL || '',
      defaultMode: 'light',
      role: 'user',
      subscriptionApprovalStatus: 'none',
      purchasedVideos: [],
      purchasedPacks: [],
      favoriteVideoIds: [],
      importantVideoIds: [],
      blockedVideoIds: [],
      isBlocked: false,
      passwordLoginEnabled: true,
      createdAt: new Date().toISOString(),
    };

    await setDoc(userDocRef, newProfile);
    return newProfile;
  }, []);

  const publishAccountConnectionStatus = useCallback(
    async (uid: string, role: UserRole | undefined, isOnline: boolean) => {
      const nowIso = new Date().toISOString();
      const normalizedRole: UserRole = role || 'user';

      if (normalizedRole === 'admin') {
        await updateDoc(doc(db, 'users', uid), {
          supportAdminOnline: isOnline,
          ...(isOnline
            ? { supportAdminConnectedAt: nowIso }
            : { supportAdminDisconnectedAt: nowIso }),
        });
        return;
      }

      await updateDoc(doc(db, 'users', uid), {
        supportClientOnline: isOnline,
        ...(isOnline
          ? { supportClientConnectedAt: nowIso }
          : { supportClientDisconnectedAt: nowIso }),
      });
    },
    [],
  );

  useEffect(() => {
    void ensureDemoAccountsSeeded();

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          const validatedUser = await getValidatedSessionUser();

          if (!validatedUser) {
            setUser(null);
            setProfile(null);
            setLoading(false);
            setIsAuthReady(true);
            return;
          }

          setUser(validatedUser);
          const resolvedProfile = await ensureUserProfile(validatedUser);
          setProfile(resolvedProfile);
          void publishAccountConnectionStatus(validatedUser.uid, resolvedProfile.role, true);
        } catch (error) {
          console.error('Error fetching user profile:', error);
          setUser(null);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      
      setLoading(false);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, [ensureUserProfile, publishAccountConnectionStatus]);

  const signIn = async (email: string, password: string, rememberMe = false) => {
    const signedInUser = await signInWithEmail(email, password, rememberMe);
    setUser(signedInUser);
    const resolvedProfile = await ensureUserProfile(signedInUser);
    setProfile(resolvedProfile);
    void publishAccountConnectionStatus(signedInUser.uid, resolvedProfile.role, true);
  };

  const signInWithGoogle = (rememberMe = true) => {
    beginGoogleSignIn(rememberMe, '/dashboard');
  };

  const connectGoogleAccount = async () => {
    await beginGoogleConnect('/dashboard?tab=profile');
  };

  const disconnectGoogleAccount = async (newPassword?: string) => {
    const nextUser = await disconnectGoogleAccountApi(newPassword);
    setUser(nextUser);
    const resolvedProfile = await ensureUserProfile(nextUser);
    setProfile(resolvedProfile);
  };

  const signUp = async (payload: {
    lastName: string;
    firstName: string;
    email: string;
    password: string;
    phoneNumber?: string;
  }) => {
    const normalizedNames = normalizeNameParts(payload.lastName, payload.firstName);
    const displayName = formatFullName(normalizedNames.lastName, normalizedNames.firstName);

    const createdUser = await createAuthAccount({
      email: payload.email,
      password: payload.password,
      displayName,
    });
    setUser(createdUser);
    const resolvedProfile = await ensureUserProfile(createdUser);

    const nextProfile = {
      ...resolvedProfile,
      firstName: normalizedNames.firstName,
      lastName: normalizedNames.lastName,
      displayName,
      phoneNumber: payload.phoneNumber?.trim() || resolvedProfile.phoneNumber,
    };

    await setDoc(doc(db, 'users', createdUser.uid), nextProfile);
    setProfile(nextProfile);
    void publishAccountConnectionStatus(createdUser.uid, nextProfile.role, true);
  };

  const signOut = async () => {
    if (user?.uid && profile?.role) {
      try {
        await publishAccountConnectionStatus(user.uid, profile.role, false);
      } catch (error) {
        console.error('Error publishing disconnect status:', error);
      }
    }

    await localSignOut(auth);
    setUser(null);
    setProfile(null);
  };

  useEffect(() => {
    if (!user || !profile) {
      return;
    }

    if (profile.displayName !== user.displayName) {
      void updateAuthDisplayName(user.uid, profile.displayName);
    }
  }, [profile, user]);

  useEffect(() => {
    if (!user?.uid || !profile?.role) {
      return;
    }

    let disposed = false;

    const publishDisconnected = async () => {
      try {
        await publishAccountConnectionStatus(user.uid, profile.role, false);
      } catch (error) {
        if (!disposed) {
          console.error('Error publishing disconnect status on unload:', error);
        }
      }
    };

    const handleBeforeUnload = () => {
      void publishDisconnected();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      disposed = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void publishDisconnected();
    };
  }, [publishAccountConnectionStatus, user?.uid, profile?.role]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAuthReady,
        signIn,
        signInWithGoogle,
        connectGoogleAccount,
        disconnectGoogleAccount,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
