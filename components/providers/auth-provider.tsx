'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  auth,
  createAuthAccount,
  db,
  doc,
  ensureDemoAccountsSeeded,
  getDoc,
  onAuthStateChanged,
  setDoc,
  signInWithEmail,
  signOut as localSignOut,
  updateAuthDisplayName,
  type LocalAuthUser,
} from '@/lib/local-data';
import { type SubscriptionApprovalStatus, type UserRole } from '@/lib/access-control';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  subscriptionEndDate?: string;
  subscriptionApprovalStatus: SubscriptionApprovalStatus;
  doctorSpecialty?: string;
  purchasedVideos: string[];
  purchasedPacks: string[];
  blockedVideoIds?: string[];
  isBlocked?: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: LocalAuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: {
    displayName: string;
    email: string;
    password: string;
    doctorSpecialty?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalAuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const normalizeProfile = (profile: UserProfile, authUser?: LocalAuthUser): UserProfile => {
    return {
      ...profile,
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName || authUser?.displayName || 'Utilisateur',
      photoURL: profile.photoURL || authUser?.photoURL || '',
      role: profile.role || 'user',
      subscriptionApprovalStatus: profile.subscriptionApprovalStatus || 'none',
      purchasedVideos: Array.isArray(profile.purchasedVideos) ? profile.purchasedVideos : [],
      purchasedPacks: Array.isArray(profile.purchasedPacks) ? profile.purchasedPacks : [],
      blockedVideoIds: Array.isArray(profile.blockedVideoIds) ? profile.blockedVideoIds : [],
      isBlocked: Boolean(profile.isBlocked),
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
      photoURL: authUser.photoURL || '',
      role: 'user',
      subscriptionApprovalStatus: 'none',
      purchasedVideos: [],
      purchasedPacks: [],
      blockedVideoIds: [],
      isBlocked: false,
      createdAt: new Date().toISOString(),
    };

    await setDoc(userDocRef, newProfile);
    return newProfile;
  }, []);

  useEffect(() => {
    ensureDemoAccountsSeeded();

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);

      if (authUser) {
        try {
          const resolvedProfile = await ensureUserProfile(authUser);
          setProfile(resolvedProfile);
        } catch (error) {
          console.error('Error fetching user profile:', error);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      
      setLoading(false);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, [ensureUserProfile]);

  const signIn = async (email: string, password: string) => {
    const signedInUser = signInWithEmail(email, password);
    setUser(signedInUser);
    const resolvedProfile = await ensureUserProfile(signedInUser);
    setProfile(resolvedProfile);
  };

  const signUp = async (payload: {
    displayName: string;
    email: string;
    password: string;
    doctorSpecialty?: string;
  }) => {
    const createdUser = createAuthAccount(payload);
    setUser(createdUser);
    const resolvedProfile = await ensureUserProfile(createdUser);

    const nextProfile = {
      ...resolvedProfile,
      doctorSpecialty: payload.doctorSpecialty?.trim() || resolvedProfile.doctorSpecialty,
    };

    await setDoc(doc(db, 'users', createdUser.uid), nextProfile);
    setProfile(nextProfile);
  };

  const signOut = async () => {
    await localSignOut(auth);
    setUser(null);
    setProfile(null);
  };

  useEffect(() => {
    if (!user || !profile) {
      return;
    }

    if (profile.displayName !== user.displayName) {
      updateAuthDisplayName(user.uid, profile.displayName);
    }
  }, [profile, user]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAuthReady, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
