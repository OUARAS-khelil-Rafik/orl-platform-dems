'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import {
  db,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  deleteDoc,
  setDoc,
  createAuthAccountByAdmin,
  deleteAuthAccountByUid,
} from '@/lib/data/local-data';
import { motion } from 'motion/react';
import {
  Users,
  CreditCard,
  CheckCircle,
  XCircle,
  FileText,
  Trash2,
  ShieldBan,
  ShieldCheck,
  Plus,
  Video,
  Lock,
  Unlock,
  MessageSquare,
  Eye,
  EyeOff,
  User,
  Mail,
  Phone,
  CalendarDays,
  Shield,
  Activity,
  Clock3,
  Settings,
  ArrowUpDown,
  Search,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { AdminContentManager } from '@/components/features/admin/content-manager';
import { formatFullName, normalizeNameParts, splitFullName } from '@/lib/utils/name-utils';

type AdminUser = {
  id: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  role?: 'admin' | 'user' | 'vip' | 'vip_plus';
  createdAt?: string;
  subscriptionEndDate?: string;
  subscriptionApprovalStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  purchasedVideos?: string[];
  purchasedVideoDates?: Record<string, string>;
  purchasedPacks?: string[];
  blockedVideoIds?: string[];
  isBlocked?: boolean;
  cloudinary?: {
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string;
    updatedAt?: string;
  };
};

type AdminVideo = {
  id: string;
  title?: string;
  isFreeDemo?: boolean;
};

type AdminQcm = {
  id: string;
  videoId?: string;
};

type AdminOpenQuestion = {
  id: string;
  videoId?: string;
};

type AdminDiagram = {
  id: string;
  videoId?: string;
};

type AdminCaseQuestion = {
  id?: string;
  kind?: 'qcm' | 'select' | 'open';
};

type AdminClinicalCase = {
  id: string;
  videoId?: string;
  questions?: AdminCaseQuestion[];
};

type UserStatus = 'active' | 'expiring_soon' | 'expired' | 'pending';

type PurchaseCard = {
  paymentId?: string;
  videoId: string;
  title: string;
  createdAt?: string;
  status: 'active' | 'pending' | 'blocked';
};

type AdminPayment = {
  id: string;
  userId: string;
  type: 'subscription' | 'pack' | 'cart';
  targetId?: string;
  items?: Array<{ id: string; type: 'video' | 'pack'; title: string; price: number }>;
  plan?: 'monthly' | 'yearly';
  amount: number;
  method: string;
  status?: 'pending' | 'approved' | 'rejected';
  receiptUrl?: string;
  createdAt: string;
};

type UserNotificationPayload = {
  userId: string;
  type: 'video' | 'payment';
  title: string;
  description: string;
  targetHref: string;
};

type DiscussionEntry = {
  id: string;
  source: 'pedagogical' | 'clinicalCase';
  isRead: boolean;
  createdAt: string;
  userId?: string | null;
  userEmail?: string | null;
  videoId?: string | null;
  caseId?: string | null;
  itemType?: string | null;
  itemId?: string | null;
  message: string;
};

export default function AdminDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'users' | 'payments' | 'content' | 'discussions'>('payments');
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [allPayments, setAllPayments] = useState<AdminPayment[]>([]);
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [qcms, setQcms] = useState<AdminQcm[]>([]);
  const [openQuestions, setOpenQuestions] = useState<AdminOpenQuestion[]>([]);
  const [diagrams, setDiagrams] = useState<AdminDiagram[]>([]);
  const [clinicalCases, setClinicalCases] = useState<AdminClinicalCase[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [discussions, setDiscussions] = useState<DiscussionEntry[]>([]);
  const [purchaseModalUserId, setPurchaseModalUserId] = useState<string | null>(null);
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [cloudinaryModalUserId, setCloudinaryModalUserId] = useState<string | null>(null);
  const [adminCloudinaryForm, setAdminCloudinaryForm] = useState({
    cloudName: '',
    apiKey: '',
    apiSecret: '',
  });
  const [isSavingAdminCloudinary, setIsSavingAdminCloudinary] = useState(false);
  const [videoToAddByUser, setVideoToAddByUser] = useState<Record<string, string>>({});
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | NonNullable<AdminUser['role']>>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | UserStatus>('all');
  const [nameSortDirection, setNameSortDirection] = useState<'asc' | 'desc'>('asc');
  const [newUserForm, setNewUserForm] = useState({
    lastName: '',
    firstName: '',
    email: '',
    phoneNumber: '',
    password: '',
    role: 'user' as 'user' | 'vip' | 'vip_plus' | 'admin',
  });
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const trimmedAdminCloudinaryForm = {
    cloudName: adminCloudinaryForm.cloudName.trim(),
    apiKey: adminCloudinaryForm.apiKey.trim(),
    apiSecret: adminCloudinaryForm.apiSecret.trim(),
  };

  const hasCompleteAdminCloudinaryForm =
    Boolean(trimmedAdminCloudinaryForm.cloudName)
    && Boolean(trimmedAdminCloudinaryForm.apiKey)
    && Boolean(trimmedAdminCloudinaryForm.apiSecret);

  const todayDate = new Date().toISOString().split('T')[0];

  const activeTabLabel =
    activeTab === 'payments'
      ? 'Paiements en attente'
      : activeTab === 'users'
        ? 'Utilisateurs'
        : activeTab === 'discussions'
          ? 'Gestion des Discussions'
        : 'Contenu pédagogique';

  const approvedPaymentsCount = allPayments.filter((payment) => payment.status === 'approved').length;
  const blockedUsersCount = users.filter((user) => user.isBlocked).length;
  const pendingApprovalsCount = users.filter((user) => user.subscriptionApprovalStatus === 'pending').length;

  useEffect(() => {
    if (!authLoading && profile?.role !== 'admin') {
      router.push('/');
    }
  }, [profile, authLoading, router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (profile?.role !== 'admin') return;
      
      try {
        const [
          paymentsSnap,
          allPaymentsSnap,
          usersSnap,
          videosSnap,
          qcmsSnap,
          openQuestionsSnap,
          diagramsSnap,
          clinicalCasesSnap,
          pedagogicalFeedbackSnap,
          clinicalCaseFeedbackSnap,
        ] = await Promise.all([
          getDocs(query(collection(db, 'payments'), where('status', '==', 'pending'))),
          getDocs(collection(db, 'payments')),
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'videos')),
          getDocs(collection(db, 'qcms')),
          getDocs(collection(db, 'openQuestions')),
          getDocs(collection(db, 'diagrams')),
          getDocs(collection(db, 'clinicalCases')),
          getDocs(collection(db, 'pedagogicalFeedback')),
          getDocs(collection(db, 'clinicalCaseFeedback')),
        ]);

        setPayments(paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AdminPayment)));
        setAllPayments(allPaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AdminPayment)));

        const nextUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as AdminUser));
        setUsers(nextUsers);
        setVideos(videosSnap.docs.map((d) => ({ ...(d.data() as AdminVideo), id: d.id })));
        setQcms(qcmsSnap.docs.map((d) => ({ ...(d.data() as AdminQcm), id: d.id })));
        setOpenQuestions(openQuestionsSnap.docs.map((d) => ({ ...(d.data() as AdminOpenQuestion), id: d.id })));
        setDiagrams(diagramsSnap.docs.map((d) => ({ ...(d.data() as AdminDiagram), id: d.id })));
        setClinicalCases(clinicalCasesSnap.docs.map((d) => ({ ...(d.data() as AdminClinicalCase), id: d.id })));

        const pedagogicalEntries = pedagogicalFeedbackSnap.docs.map((d) => {
          const data = d.data() as Record<string, any>;
          return {
            id: d.id,
            source: 'pedagogical' as const,
            isRead: Boolean(data.isRead),
            createdAt: String(data.createdAt || ''),
            userId: data.userId ?? null,
            userEmail: data.userEmail ?? null,
            videoId: data.videoId ?? null,
            caseId: data.caseId ?? null,
            itemType: data.itemType ?? null,
            itemId: data.itemId ?? null,
            message: String(data.message || ''),
          };
        });

        const clinicalEntries = clinicalCaseFeedbackSnap.docs.map((d) => {
          const data = d.data() as Record<string, any>;
          return {
            id: d.id,
            source: 'clinicalCase' as const,
            isRead: Boolean(data.isRead),
            createdAt: String(data.createdAt || ''),
            userId: data.userId ?? null,
            userEmail: data.userEmail ?? null,
            videoId: data.videoId ?? null,
            caseId: data.caseId ?? null,
            itemType: 'clinicalCase' as const,
            itemId: data.caseId ?? null,
            message: String(data.message || ''),
          };
        });

        const nextDiscussions = [...pedagogicalEntries, ...clinicalEntries].sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
        setDiscussions(nextDiscussions);
      } catch (error) {
        console.error('Error fetching admin data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) fetchData();
  }, [profile, authLoading]);

  const getCreationDate = useCallback((user: AdminUser) => {
    if (!user.createdAt) {
      return new Date(0);
    }
    const parsed = new Date(user.createdAt);
    if (Number.isNaN(parsed.getTime())) {
      return new Date(0);
    }
    return parsed;
  }, []);

  const computeAutoExpiryDate = useCallback((user: AdminUser) => {
    if (user.role === 'admin') {
      return null;
    }

    const createdAt = getCreationDate(user);
    if (createdAt.getTime() === 0) {
      return null;
    }

    const expiry = new Date(createdAt);
    if (user.role === 'vip' || user.role === 'vip_plus') {
      expiry.setFullYear(expiry.getFullYear() + 1);
    } else {
      expiry.setDate(expiry.getDate() + 10);
    }
    return expiry;
  }, [getCreationDate]);

  const getEffectiveExpiryDate = useCallback((user: AdminUser) => {
    if (user.role === 'admin') {
      return null;
    }

    // Always prioritize an explicit admin-edited expiration date.
    if (user.subscriptionEndDate) {
      const customExpiry = new Date(user.subscriptionEndDate);
      if (!Number.isNaN(customExpiry.getTime())) {
        return customExpiry;
      }
    }

    if (
      user.role === 'vip_plus' &&
      user.subscriptionApprovalStatus === 'approved' &&
      user.subscriptionEndDate
    ) {
      const subscriptionExpiry = new Date(user.subscriptionEndDate);
      if (!Number.isNaN(subscriptionExpiry.getTime())) {
        return subscriptionExpiry;
      }
    }

    return computeAutoExpiryDate(user);
  }, [computeAutoExpiryDate]);

  const getUserStatus = useCallback((user: AdminUser): UserStatus => {
    if (user.subscriptionApprovalStatus === 'pending') {
      return 'pending';
    }

    const hasPendingPayment = allPayments.some(
      (payment) => payment.userId === user.id && payment.status === 'pending',
    );
    if (hasPendingPayment) {
      return 'pending';
    }

    if (user.role === 'admin') {
      return 'active';
    }

    if (user.isBlocked) {
      return 'expired';
    }

    const expiry = getEffectiveExpiryDate(user);
    if (!expiry) {
      return 'expired';
    }

    const msRemaining = expiry.getTime() - now.getTime();
    const isStillActive = msRemaining > 0;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    if (isStillActive && msRemaining <= sevenDaysMs) {
      return 'expiring_soon';
    }

    return expiry > now ? 'active' : 'expired';
  }, [allPayments, getEffectiveExpiryDate, now]);

  const getStatusBadgeClass = (status: UserStatus) => {
    if (status === 'active') {
      return 'bg-emerald-100 text-emerald-700';
    }
    if (status === 'expiring_soon') {
      return 'bg-orange-100 text-orange-700';
    }
    if (status === 'pending') {
      return 'bg-amber-100 text-amber-700';
    }
    return 'bg-rose-100 text-rose-700';
  };

  const getStatusLabel = (status: UserStatus) => {
    if (status === 'active') return 'Active';
    if (status === 'expiring_soon') return 'Bientot expire';
    if (status === 'pending') return 'En attente';
    return 'Expire';
  };

  const filteredAndSortedUsers = useMemo(() => {
    const normalizedQuery = userSearchQuery.trim().toLowerCase();

    const filtered = users.filter((user) => {
      if (userRoleFilter !== 'all' && user.role !== userRoleFilter) {
        return false;
      }

      const currentStatus = getUserStatus(user);
      if (userStatusFilter !== 'all' && currentStatus !== userStatusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const splitName = splitFullName(user.displayName || '');
      const fullName = (formatFullName(user.lastName || splitName.lastName, user.firstName || splitName.firstName) || user.displayName || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const phone = (user.phoneNumber || '').toLowerCase();

      return fullName.includes(normalizedQuery) || email.includes(normalizedQuery) || phone.includes(normalizedQuery);
    });

    return filtered.sort((a, b) => {
      const aSplit = splitFullName(a.displayName || '');
      const bSplit = splitFullName(b.displayName || '');
      const aName = (formatFullName(a.lastName || aSplit.lastName, a.firstName || aSplit.firstName) || a.displayName || '').toLowerCase();
      const bName = (formatFullName(b.lastName || bSplit.lastName, b.firstName || bSplit.firstName) || b.displayName || '').toLowerCase();

      const compare = aName.localeCompare(bName, 'fr', { sensitivity: 'base' });
      return nameSortDirection === 'asc' ? compare : -compare;
    });
  }, [users, userRoleFilter, userStatusFilter, userSearchQuery, nameSortDirection, getUserStatus]);

  const getVideoTitle = (videoId: string) => {
    return videos.find((video) => video.id === videoId)?.title || `Video ${videoId}`;
  };

  const getDateInputValue = (isoDate?: string) => {
    if (!isoDate) return '';
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().split('T')[0];
  };

  const getUserPurchaseCards = (userId: string): PurchaseCard[] => {
    const cards: PurchaseCard[] = [];
    const seen = new Set<string>();

    allPayments
      .filter((payment) => payment.userId === userId)
      .forEach((payment) => {
        const paymentStatus = payment.status;

        if (payment.type === 'cart' && Array.isArray(payment.items)) {
          payment.items
            .filter((item) => item.type === 'video')
            .forEach((item) => {
              const key = `${payment.id}-${item.id}`;
              if (seen.has(key)) return;
              seen.add(key);
              cards.push({
                paymentId: payment.id,
                videoId: item.id,
                title: item.title || getVideoTitle(item.id),
                createdAt: payment.createdAt,
                status: paymentStatus === 'pending' ? 'pending' : 'active',
              });
            });
        }

        if (payment.type === 'pack' && payment.targetId) {
          const key = `${payment.id}-pack-${payment.targetId}`;
          if (seen.has(key)) return;
          seen.add(key);
          cards.push({
            paymentId: payment.id,
            videoId: payment.targetId,
            title: `Pack ${payment.targetId}`,
            createdAt: payment.createdAt,
            status: paymentStatus === 'pending' ? 'pending' : 'active',
          });
        }
      });

    const user = users.find((entry) => entry.id === userId);
    const paymentVideoIds = new Set(cards.filter((card) => card.status !== 'pending').map((card) => card.videoId));
    const blockedSet = new Set(user?.blockedVideoIds || []);
    (user?.purchasedVideos || []).forEach((videoId) => {
      if (paymentVideoIds.has(videoId)) return;
      cards.push({
        videoId,
        title: getVideoTitle(videoId),
        createdAt: user?.purchasedVideoDates?.[videoId],
        status: blockedSet.has(videoId) ? 'blocked' : 'active',
      });
    });

    const updatedCards = cards.map((card) => {
      if (card.status === 'pending') {
        return card;
      }
      if (blockedSet.has(card.videoId)) {
        return { ...card, status: 'blocked' as const };
      }
      return { ...card, status: 'active' as const };
    });

    if (user?.role === 'vip_plus') {
      videos
        .filter((video) => !video.isFreeDemo)
        .forEach((video) => {
          if (updatedCards.some((card) => card.videoId === video.id)) {
            return;
          }

          updatedCards.push({
            videoId: video.id,
            title: video.title || video.id,
            createdAt: user.purchasedVideoDates?.[video.id] || user.createdAt,
            status: blockedSet.has(video.id) ? 'blocked' : 'active',
          });
        });
    }

    return updatedCards.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  };

  const handleApprovePayment = async (
    paymentId: string,
    userId: string,
    type: string,
    targetId?: string,
    items?: Array<{ id: string; type: 'video' | 'pack'; title: string; price: number }>,
    plan?: string,
  ) => {
    try {
      const grantedVideoIds = (() => {
        if (type === 'video' && typeof targetId === 'string' && targetId.trim().length > 0) {
          return [targetId.trim()];
        }

        if (type === 'cart' && Array.isArray(items)) {
          return Array.from(
            new Set(
              items
                .filter((item) => item?.type === 'video' && typeof item.id === 'string' && item.id.trim().length > 0)
                .map((item) => item.id.trim()),
            ),
          );
        }

        return [] as string[];
      })();

      const videoTitleById = new Map<string, string>();
      if (Array.isArray(items)) {
        items
          .filter((item) => item?.type === 'video' && typeof item.id === 'string')
          .forEach((item) => {
            const id = item.id.trim();
            if (!id) return;
            const title = String(item.title || '').trim();
            if (title.length > 0) {
              videoTitleById.set(id, title);
            }
          });
      }

      await updateDoc(doc(db, 'payments', paymentId), { status: 'approved' });

      const approvedAt = new Date();
      const vipExpiryAt = new Date(approvedAt);
      vipExpiryAt.setFullYear(vipExpiryAt.getFullYear() + 1);
      const vipExpiryIso = vipExpiryAt.toISOString();
      
      const userRef = doc(db, 'users', userId);
      const userDoc = users.find(u => u.id === userId);
      
      if (type === 'subscription') {
        const endDate = computeAutoExpiryDate(userDoc || { role: 'vip_plus', createdAt: new Date().toISOString() } as AdminUser) || new Date();
        await updateDoc(userRef, { 
          role: 'vip_plus',
          subscriptionEndDate: endDate.toISOString(),
          subscriptionApprovalStatus: 'approved',
        });
      } else if (type === 'pack' && targetId) {
        const currentPacks = userDoc?.purchasedPacks || [];
        const shouldPromoteFromDemo = userDoc?.role === 'user';
        const userUpdates: Record<string, any> = {
          role: shouldPromoteFromDemo ? 'vip' : userDoc?.role,
          purchasedPacks: [...currentPacks, targetId],
        };

        if (shouldPromoteFromDemo) {
          userUpdates.subscriptionEndDate = vipExpiryIso;
        }

        await updateDoc(userRef, userUpdates);
      } else if (type === 'cart' && items) {
        const currentPacks = userDoc?.purchasedPacks || [];
        const currentVideos = userDoc?.purchasedVideos || [];
        const currentVideoDates = userDoc?.purchasedVideoDates || {};
        
        const videoIds = items.filter(i => i.type === 'video').map(i => i.id);
        const packIds = items.filter(i => i.type === 'pack').map(i => i.id);
        
        const shouldPromoteFromDemo = userDoc?.role === 'user';
        const updates: any = {
          role: shouldPromoteFromDemo ? 'vip' : userDoc?.role
        };

        if (shouldPromoteFromDemo) {
          updates.subscriptionEndDate = vipExpiryIso;
        }
        
        if (videoIds.length > 0) {
          updates.purchasedVideos = [...new Set([...currentVideos, ...videoIds])];
          updates.purchasedVideoDates = {
            ...currentVideoDates,
            ...Object.fromEntries(videoIds.map((videoId) => [videoId, new Date().toISOString()])),
          };
        }
        if (packIds.length > 0) {
          updates.purchasedPacks = [...new Set([...currentPacks, ...packIds])];
        }
        
        await updateDoc(userRef, updates);
      }
      
      setPayments(payments.filter(p => p.id !== paymentId));
      setAllPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: 'approved' } : p)));
      setUsers((prev) =>
        prev.map((entry) => {
          if (entry.id !== userId) return entry;

          if (type === 'subscription') {
            const endDate = computeAutoExpiryDate(entry) || new Date();

            return {
              ...entry,
              role: 'vip_plus',
              subscriptionEndDate: endDate.toISOString(),
              subscriptionApprovalStatus: 'approved',
            };
          }

          if (type === 'pack' && targetId) {
            const current = entry.purchasedPacks || [];
            const shouldPromoteFromDemo = entry.role === 'user';
            return {
              ...entry,
              role: shouldPromoteFromDemo ? 'vip' : entry.role,
              ...(shouldPromoteFromDemo ? { subscriptionEndDate: vipExpiryIso } : {}),
              purchasedPacks: [...new Set([...current, targetId])],
            };
          }

          if (type === 'cart' && items) {
            const currentPacks = entry.purchasedPacks || [];
            const currentVideos = entry.purchasedVideos || [];
            const currentVideoDates = entry.purchasedVideoDates || {};
            const videoIds = items.filter((i) => i.type === 'video').map((i) => i.id);
            const packIds = items.filter((i) => i.type === 'pack').map((i) => i.id);
            const shouldPromoteFromDemo = entry.role === 'user';

            return {
              ...entry,
              role: shouldPromoteFromDemo ? 'vip' : entry.role,
              ...(shouldPromoteFromDemo ? { subscriptionEndDate: vipExpiryIso } : {}),
              purchasedVideos: [...new Set([...currentVideos, ...videoIds])],
              purchasedVideoDates: {
                ...currentVideoDates,
                ...Object.fromEntries(videoIds.map((videoId) => [videoId, new Date().toISOString()])),
              },
              purchasedPacks: [...new Set([...currentPacks, ...packIds])],
            };
          }

          return entry;
        }),
      );

      if (grantedVideoIds.length > 0) {
        await Promise.all(
          grantedVideoIds.map(async (videoId) => {
            const catalogTitle = String(videos.find((video) => video.id === videoId)?.title || '').trim();
            const resolvedTitle = videoTitleById.get(videoId) || catalogTitle || `Video ${videoId}`;
            const payload: UserNotificationPayload = {
              userId,
              type: 'payment',
              title: 'Paiement video approuve',
              description: `Votre paiement pour \"${resolvedTitle}\" a ete approuve.`,
              targetHref: `/videos/${videoId}`,
            };

            try {
              await addDoc(collection(db, 'notifications'), {
                ...payload,
                createdAt: new Date().toISOString(),
              });
            } catch (notificationError) {
              console.error('Error creating payment approval notification:', notificationError);
            }
          }),
        );
      }

      alert('Paiement approuvé et accès débloqué.');
    } catch (error) {
      console.error('Error approving payment:', error);
      alert('Erreur lors de l\'approbation.');
    }
  };

  const handleRejectPayment = async (payment: AdminPayment) => {
    try {
      await updateDoc(doc(db, 'payments', payment.id), { status: 'rejected' });

      if (payment.type === 'subscription') {
        await updateDoc(doc(db, 'users', payment.userId), {
          role: 'user',
          subscriptionApprovalStatus: 'rejected',
        });
      }

      setPayments(payments.filter(p => p.id !== payment.id));
      setAllPayments((prev) => prev.map((p) => (p.id === payment.id ? { ...p, status: 'rejected' } : p)));
      if (payment.type === 'subscription') {
        setUsers((prev) =>
          prev.map((entry) =>
            entry.id === payment.userId
              ? {
                  ...entry,
                  role: 'user',
                  subscriptionApprovalStatus: 'rejected',
                }
              : entry,
          ),
        );
      }
      alert('Paiement rejeté.');
    } catch (error) {
      console.error('Error rejecting payment:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const targetUser = users.find((user) => user.id === userId);
    if (targetUser?.role === 'admin') {
      alert('Suppression admin non autorisee.');
      return;
    }

    if (!confirm('Voulez-vous vraiment supprimer cet utilisateur ?')) {
      return;
    }

    try {
      const userPayments = await getDocs(query(collection(db, 'payments'), where('userId', '==', userId)));
      await Promise.all(userPayments.docs.map((paymentDoc) => deleteDoc(doc(db, 'payments', paymentDoc.id))));

      await deleteDoc(doc(db, 'users', userId));
      await deleteAuthAccountByUid(userId);

      setUsers((prev) => prev.filter((user) => user.id !== userId));
      setAllPayments((prev) => prev.filter((payment) => payment.userId !== userId));
      setPayments((prev) => prev.filter((payment) => payment.userId !== userId));
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Erreur lors de la suppression de l utilisateur.');
    }
  };

  const handleToggleBlockUser = async (user: AdminUser) => {
    if (user.role === 'admin') {
      alert('Blocage admin non autorise.');
      return;
    }

    const nextBlocked = !user.isBlocked;
    try {
      await updateDoc(doc(db, 'users', user.id), {
        isBlocked: nextBlocked,
      });
      setUsers((prev) =>
        prev.map((entry) =>
          entry.id === user.id
            ? {
                ...entry,
                isBlocked: nextBlocked,
              }
            : entry,
        ),
      );
    } catch (error) {
      console.error('Error updating user blocked state:', error);
      alert('Erreur lors de la mise a jour du blocage utilisateur.');
    }
  };

  const handleApprovePendingUser = async (user: AdminUser) => {
    try {
      const endDate = computeAutoExpiryDate(user) || new Date();

      await updateDoc(doc(db, 'users', user.id), {
        role: 'vip_plus',
        subscriptionApprovalStatus: 'approved',
        subscriptionEndDate: endDate.toISOString(),
        isBlocked: false,
      });

      setUsers((prev) =>
        prev.map((entry) =>
          entry.id === user.id
            ? {
                ...entry,
                role: 'vip_plus',
                subscriptionApprovalStatus: 'approved',
                subscriptionEndDate: endDate.toISOString(),
                isBlocked: false,
              }
            : entry,
        ),
      );
    } catch (error) {
      console.error('Error approving pending user:', error);
      alert('Erreur lors de l approbation utilisateur.');
    }
  };

  const handleRemovePurchasedVideo = async (user: AdminUser, videoId: string) => {
    try {
      const nextPurchasedVideos = (user.purchasedVideos || []).filter((id) => id !== videoId);
      const nextPurchaseDates = { ...(user.purchasedVideoDates || {}) };
      delete nextPurchaseDates[videoId];
      const nextBlockedVideoIds = (user.blockedVideoIds || []).filter((id) => id !== videoId);

      const removedPaymentIds = new Set<string>();
      const updatedPaymentsById = new Map<string, { items: AdminPayment['items']; amount: number }>();

      const relatedCartPayments = allPayments.filter(
        (payment) =>
          payment.userId === user.id
          && payment.type === 'cart'
          && Array.isArray(payment.items)
          && payment.items.some((item) => item.type === 'video' && item.id === videoId),
      );

      await Promise.all(
        relatedCartPayments.map(async (payment) => {
          const remainingItems = (payment.items || []).filter(
            (item) => !(item.type === 'video' && item.id === videoId),
          );

          if (remainingItems.length === 0) {
            await deleteDoc(doc(db, 'payments', payment.id));
            removedPaymentIds.add(payment.id);
            return;
          }

          const nextAmount = remainingItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
          await updateDoc(doc(db, 'payments', payment.id), {
            items: remainingItems,
            amount: nextAmount,
          });
          updatedPaymentsById.set(payment.id, {
            items: remainingItems,
            amount: nextAmount,
          });
        }),
      );

      await updateDoc(doc(db, 'users', user.id), {
        purchasedVideos: nextPurchasedVideos,
        purchasedVideoDates: nextPurchaseDates,
        blockedVideoIds: nextBlockedVideoIds,
      });

      setUsers((prev) =>
        prev.map((entry) =>
          entry.id === user.id
            ? {
                ...entry,
                purchasedVideos: nextPurchasedVideos,
                purchasedVideoDates: nextPurchaseDates,
                blockedVideoIds: nextBlockedVideoIds,
              }
            : entry,
        ),
      );

      const applyPaymentCleanup = (prev: AdminPayment[]) =>
        prev
          .filter((payment) => !removedPaymentIds.has(payment.id))
          .map((payment) => {
            const updates = updatedPaymentsById.get(payment.id);
            if (!updates) return payment;
            return {
              ...payment,
              items: updates.items,
              amount: updates.amount,
            };
          });

      setAllPayments((prev) => applyPaymentCleanup(prev));
      setPayments((prev) => applyPaymentCleanup(prev));
    } catch (error) {
      console.error('Error removing purchased video:', error);
      alert('Erreur lors de la suppression de la video.');
    }
  };

  const handleBlockVideoForUser = async (user: AdminUser, videoId: string) => {
    try {
      const blockedSet = new Set(user.blockedVideoIds || []);
      const wasBlocked = blockedSet.has(videoId);
      if (wasBlocked) {
        blockedSet.delete(videoId);
      } else {
        blockedSet.add(videoId);
      }

      const isNowBlocked = !wasBlocked;
      const blockedVideoIds = Array.from(blockedSet);

      await updateDoc(doc(db, 'users', user.id), {
        blockedVideoIds,
      });

      setUsers((prev) =>
        prev.map((entry) =>
          entry.id === user.id
            ? {
                ...entry,
                blockedVideoIds,
              }
            : entry,
        ),
      );

        const videoTitle = String(videos.find((video) => video.id === videoId)?.title || '').trim() || `Video ${videoId}`;
        const payload: UserNotificationPayload = {
          userId: user.id,
          type: 'video',
          title: isNowBlocked ? 'Video bloquee' : 'Video debloquee',
          description: isNowBlocked
            ? `L'admin a bloque votre acces a \"${videoTitle}\".`
            : `L'admin a debloque votre acces a \"${videoTitle}\".`,
          targetHref: `/videos/${videoId}`,
        };

        try {
          await addDoc(collection(db, 'notifications'), {
            ...payload,
            createdAt: new Date().toISOString(),
          });
        } catch (notificationError) {
          console.error('Error creating video block notification:', notificationError);
        }
    } catch (error) {
      console.error('Error blocking video for user:', error);
      alert('Erreur lors du blocage de la video.');
    }
  };

  const handleAddVideoToUser = async (user: AdminUser) => {
    const targetVideoId = (videoToAddByUser[user.id] || '').trim();
    if (!targetVideoId) {
      alert('Selectionnez une video a ajouter.');
      return;
    }

    try {
      const purchasedSet = new Set(user.purchasedVideos || []);
      const hadVideoAlready = purchasedSet.has(targetVideoId);
      purchasedSet.add(targetVideoId);
      const nextPurchasedVideos = Array.from(purchasedSet);

      const purchaseDates = {
        ...(user.purchasedVideoDates || {}),
        [targetVideoId]: new Date().toISOString(),
      };

      const blockedSet = new Set(user.blockedVideoIds || []);
      blockedSet.delete(targetVideoId);
      const blockedVideoIds = Array.from(blockedSet);

      await updateDoc(doc(db, 'users', user.id), {
        purchasedVideos: nextPurchasedVideos,
        purchasedVideoDates: purchaseDates,
        blockedVideoIds,
      });

      setUsers((prev) =>
        prev.map((entry) =>
          entry.id === user.id
            ? {
                ...entry,
                purchasedVideos: nextPurchasedVideos,
                purchasedVideoDates: purchaseDates,
                blockedVideoIds,
              }
            : entry,
        ),
      );
      setVideoToAddByUser((prev) => ({
        ...prev,
        [user.id]: '',
      }));

      if (!hadVideoAlready) {
        const videoTitle = String(videos.find((video) => video.id === targetVideoId)?.title || '').trim() || `Video ${targetVideoId}`;
        const payload: UserNotificationPayload = {
          userId: user.id,
          type: 'video',
          title: 'Acces video ajoute',
          description: `L'admin vous a donne l'acces a \"${videoTitle}\".`,
          targetHref: `/videos/${targetVideoId}`,
        };

        try {
          await addDoc(collection(db, 'notifications'), {
            ...payload,
            createdAt: new Date().toISOString(),
          });
        } catch (notificationError) {
          console.error('Error creating added video notification:', notificationError);
        }
      }
    } catch (error) {
      console.error('Error adding video to user:', error);
      alert('Erreur lors de l ajout de la video.');
    }
  };

  const handleUpdateExpirationDate = async (user: AdminUser, dateValue: string) => {
    if (user.role === 'admin') {
      return;
    }

    if (dateValue && new Date(dateValue) < new Date(todayDate)) {
      alert('La date d expiration ne peut pas etre anterieure a aujourd hui.');
      return;
    }

    const nextDate = dateValue ? new Date(dateValue).toISOString() : undefined;
    try {
      await updateDoc(doc(db, 'users', user.id), {
        subscriptionEndDate: nextDate,
      });
      setUsers((prev) =>
        prev.map((entry) =>
          entry.id === user.id
            ? {
                ...entry,
                subscriptionEndDate: nextDate,
              }
            : entry,
        ),
      );
    } catch (error) {
      console.error('Error updating expiration date:', error);
      alert('Erreur lors de la mise a jour de la date d expiration.');
    }
  };

  const handleApprovePendingVideoPayment = async (paymentId: string) => {
    try {
      const payment = allPayments.find((entry) => entry.id === paymentId);
      if (!payment) return;

      await handleApprovePayment(
        payment.id,
        payment.userId,
        payment.type,
        payment.targetId,
        payment.items,
        payment.plan,
      );

      const refreshedPayments = allPayments.map((entry): AdminPayment => {
        if (entry.id === paymentId) {
          return { ...entry, status: 'approved' };
        }
        return entry;
      });
      setAllPayments(refreshedPayments);
    } catch (error) {
      console.error('Error approving pending video payment:', error);
      alert('Erreur lors de l approbation du paiement video.');
    }
  };

  const handleOpenCloudinarySettingsModal = (user: AdminUser) => {
    if (user.role !== 'admin') {
      return;
    }

    setCloudinaryModalUserId(user.id);
    setAdminCloudinaryForm({
      cloudName: String(user.cloudinary?.cloudName || ''),
      apiKey: String(user.cloudinary?.apiKey || ''),
      apiSecret: String(user.cloudinary?.apiSecret || ''),
    });
  };

  const handleCloseCloudinarySettingsModal = () => {
    setCloudinaryModalUserId(null);
    setAdminCloudinaryForm({
      cloudName: '',
      apiKey: '',
      apiSecret: '',
    });
  };

  const handleSaveAdminCloudinarySettings = async () => {
    if (!cloudinaryModalUserId) {
      return;
    }

    if (!hasCompleteAdminCloudinaryForm) {
      alert('Renseignez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET.');
      return;
    }

    try {
      setIsSavingAdminCloudinary(true);
      const cloudinary = {
        cloudName: trimmedAdminCloudinaryForm.cloudName,
        apiKey: trimmedAdminCloudinaryForm.apiKey,
        apiSecret: trimmedAdminCloudinaryForm.apiSecret,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, 'users', cloudinaryModalUserId), {
        cloudinary,
      });

      setUsers((prev) =>
        prev.map((entry) =>
          entry.id === cloudinaryModalUserId
            ? {
                ...entry,
                cloudinary,
              }
            : entry,
        ),
      );

      alert('Parametres Cloudinary admin enregistres.');
      handleCloseCloudinarySettingsModal();
    } catch (error) {
      console.error('Error saving admin cloudinary settings:', error);
      alert('Erreur lors de l\'enregistrement des parametres Cloudinary admin.');
    } finally {
      setIsSavingAdminCloudinary(false);
    }
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedNames = normalizeNameParts(newUserForm.lastName, newUserForm.firstName);
    const displayName = formatFullName(normalizedNames.lastName, normalizedNames.firstName);
    const email = newUserForm.email.trim().toLowerCase();
    const phoneNumber = newUserForm.phoneNumber.trim();
    const password = newUserForm.password;

    if (!displayName || !email || !password) {
      alert('Nom, prénom, email et mot de passe sont obligatoires.');
      return;
    }

    if (users.some((user) => (user.email || '').toLowerCase() === email)) {
      alert('Un compte existe deja avec cet email.');
      return;
    }

    if (password.length < 6) {
      alert('Le mot de passe doit contenir au moins 6 caracteres.');
      return;
    }

    setIsCreatingUser(true);
    try {
      const authUser = await createAuthAccountByAdmin({
        displayName,
        email,
        password,
        role: newUserForm.role,
      });

      if (!authUser) {
        alert('Un compte existe deja avec cet email.');
        return;
      }

      const createdAt = new Date().toISOString();
      const baseUser: AdminUser = {
        id: authUser.uid,
        displayName,
        firstName: normalizedNames.firstName,
        lastName: normalizedNames.lastName,
        email,
        phoneNumber: phoneNumber || undefined,
        role: newUserForm.role,
        createdAt,
        subscriptionApprovalStatus: newUserForm.role === 'vip_plus' ? 'approved' : 'none',
        subscriptionEndDate:
          newUserForm.role === 'admin'
            ? undefined
            : (() => {
                const expiry = computeAutoExpiryDate({ role: newUserForm.role, createdAt } as AdminUser);
                return expiry?.toISOString();
              })(),
        purchasedVideos: [],
        purchasedVideoDates: {},
        purchasedPacks: [],
        blockedVideoIds: [],
        isBlocked: false,
      };

      await setDoc(doc(db, 'users', authUser.uid), {
        uid: authUser.uid,
        email,
        displayName,
        firstName: normalizedNames.firstName,
        lastName: normalizedNames.lastName,
        phoneNumber: phoneNumber || undefined,
        photoURL: '',
        role: baseUser.role,
        subscriptionEndDate: baseUser.subscriptionEndDate,
        subscriptionApprovalStatus: baseUser.subscriptionApprovalStatus,
        purchasedVideos: [],
        purchasedVideoDates: {},
        purchasedPacks: [],
        blockedVideoIds: [],
        isBlocked: false,
        createdAt,
      });

      setUsers((prev) => [...prev, baseUser]);
      setNewUserForm({
        lastName: '',
        firstName: '',
        email: '',
        phoneNumber: '',
        password: '',
        role: 'user',
      });
      alert('Compte utilisateur cree avec succes.');
    } catch (error) {
      console.error('Error creating user by admin:', error);
      alert(error instanceof Error ? error.message : 'Erreur lors de la creation du compte.');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const getDiscussionCollectionName = (entry: DiscussionEntry) =>
    entry.source === 'pedagogical' ? 'pedagogicalFeedback' : 'clinicalCaseFeedback';

  const handleToggleDiscussionRead = async (entry: DiscussionEntry) => {
    try {
      await updateDoc(doc(db, getDiscussionCollectionName(entry), entry.id), {
        isRead: !entry.isRead,
      });
      setDiscussions((prev) =>
        prev.map((item) =>
          item.id === entry.id && item.source === entry.source
            ? { ...item, isRead: !item.isRead }
            : item,
        ),
      );
    } catch (error) {
      console.error('Error updating discussion read state:', error);
      alert('Erreur lors de la mise à jour du statut lu/non lu.');
    }
  };

  const handleDeleteDiscussion = async (entry: DiscussionEntry) => {
    if (!confirm('Supprimer cette discussion ?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, getDiscussionCollectionName(entry), entry.id));
      setDiscussions((prev) =>
        prev.filter((item) => !(item.id === entry.id && item.source === entry.source)),
      );
    } catch (error) {
      console.error('Error deleting discussion:', error);
      alert('Erreur lors de la suppression de la discussion.');
    }
  };

  const unreadDiscussionCount = discussions.filter((entry) => !entry.isRead).length;
  const cloudinaryModalUser = users.find((entry) => entry.id === cloudinaryModalUserId) || null;

  const adminTabs: Array<{
    id: 'payments' | 'users' | 'discussions' | 'content';
    label: string;
    icon: typeof CreditCard;
    count?: number;
  }> = [
    { id: 'payments', label: 'Paiements en attente', icon: CreditCard, count: payments.length },
    { id: 'users', label: 'Utilisateurs', icon: Users },
    { id: 'discussions', label: 'Gestion des Discussions', icon: MessageSquare, count: unreadDiscussionCount },
    { id: 'content', label: 'Contenu Pedagogique', icon: FileText },
  ];

  const videoTitleById = new Map(videos.map((video) => [video.id, video.title || video.id]));

  const buildPerVideoIndexMap = <T extends { id: string; videoId?: string }>(items: T[]) => {
    const perVideoCounter = new Map<string, number>();
    const map = new Map<string, number>();

    items.forEach((item) => {
      const videoId = item.videoId || '__unknown__';
      const nextNumber = (perVideoCounter.get(videoId) || 0) + 1;
      perVideoCounter.set(videoId, nextNumber);
      map.set(item.id, nextNumber);
    });

    return map;
  };

  const qcmNumberById = buildPerVideoIndexMap(qcms);
  const openQuestionNumberById = buildPerVideoIndexMap(openQuestions);
  const diagramNumberById = buildPerVideoIndexMap(diagrams);

  const caseQuestionMetaByKey = new Map<string, { kind: 'qcm' | 'select' | 'open'; number: number; videoId?: string }>();
  clinicalCases.forEach((clinicalCase) => {
    (clinicalCase.questions || []).forEach((question, index) => {
      if (!question.id) return;
      caseQuestionMetaByKey.set(`${clinicalCase.id}::${question.id}`, {
        kind: question.kind || 'open',
        number: index + 1,
        videoId: clinicalCase.videoId,
      });
    });
  });

  const getDiscussionCourseTitle = (entry: DiscussionEntry) => {
    if (entry.videoId) {
      return videoTitleById.get(entry.videoId) || entry.videoId;
    }

    if (entry.itemType === 'caseQuestion' && entry.caseId && entry.itemId) {
      const meta = caseQuestionMetaByKey.get(`${entry.caseId}::${entry.itemId}`);
      if (meta?.videoId) {
        return videoTitleById.get(meta.videoId) || meta.videoId;
      }
    }

    return '-';
  };

  const getDiscussionTypeLabel = (entry: DiscussionEntry) => {
    if (entry.itemType === 'caseQuestion' && entry.caseId && entry.itemId) {
      const meta = caseQuestionMetaByKey.get(`${entry.caseId}::${entry.itemId}`);
      const kindLabel =
        meta?.kind === 'qcm'
          ? 'QCM'
          : meta?.kind === 'select'
            ? 'Selecteur'
            : 'QROC';
      return `Cas Clinique (${kindLabel} #${meta?.number ?? '?'})`;
    }

    if (entry.itemType === 'qcm') {
      return `QCMs (QCM #${entry.itemId ? qcmNumberById.get(entry.itemId) ?? '?' : '?'})`;
    }

    if (entry.itemType === 'openQuestion') {
      return `QROC (QROC #${entry.itemId ? openQuestionNumberById.get(entry.itemId) ?? '?' : '?'})`;
    }

    if (entry.itemType === 'diagram') {
      return `Schémas (Schémas #${entry.itemId ? diagramNumberById.get(entry.itemId) ?? '?' : '?'})`;
    }

    return 'Cas Clinique (Discussion globale)';
  };

  const getDiscussionUserDisplay = (entry: DiscussionEntry) => {
    const matchedUser = entry.userId ? users.find((user) => user.id === entry.userId) : undefined;
    const splitName = splitFullName(matchedUser?.displayName || '');
    const fullName = formatFullName(
      matchedUser?.lastName || splitName.lastName,
      matchedUser?.firstName || splitName.firstName,
    );
    return {
      displayName: fullName || matchedUser?.displayName || 'Utilisateur inconnu',
      email: matchedUser?.email || entry.userEmail || '-',
    };
  };

  if (loading || authLoading) {
    return <div className="flex-1 flex items-center justify-center"><div className="w-12 h-12 border-4 border-medical-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (profile?.role !== 'admin') return null;

  return (
    <div className="flex-1 bg-gradient-to-br from-slate-100 via-stone-50 to-slate-100 text-[15px] md:text-base">
      <main className="p-8 md:p-12 overflow-y-auto">
        <div className="max-w-[1500px] mx-auto">
          <div className="mb-6">
            <div className="min-w-0 rounded-full border border-[rgba(68,25,6,0.08)] bg-[rgba(68,25,6,0.04)] p-1.5">
              <nav className="flex items-center justify-between gap-2 rounded-full">
                  {adminTabs.map((item) => {
                    const isActive = activeTab === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={`inline-flex flex-1 items-center justify-center gap-2 px-5 py-3 rounded-full whitespace-nowrap text-base font-semibold border transition-all ${
                          isActive
                            ? 'bg-white text-slate-900 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.04),0_3px_3px_1px_rgba(0,0,0,0.04),0_12px_12px_-8px_rgba(0,0,0,0.08)]'
                            : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
                        }`}
                      >
                        <item.icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
                        <span>{item.label}</span>
                        {item.count !== undefined && item.count > 0 && (
                          <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[11px] font-bold ${
                            isActive ? 'bg-blue-50 text-blue-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {item.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900">{activeTabLabel}</h1>
            {activeTab === 'users' && (
              <button
                type="button"
                onClick={() => setIsCreateUserModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-medical-600 text-white text-base font-semibold hover:bg-medical-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Ajouter un compte
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-sm uppercase tracking-[0.14em] text-slate-500">Paiements en attente</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{payments.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-sm uppercase tracking-[0.14em] text-slate-500">Paiements approuvés</p>
              <p className="text-3xl font-bold text-emerald-700 mt-1">{approvedPaymentsCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-sm uppercase tracking-[0.14em] text-slate-500">Comptes en attente</p>
              <p className="text-3xl font-bold text-amber-700 mt-1">{pendingApprovalsCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-sm uppercase tracking-[0.14em] text-slate-500">Comptes bloqués</p>
              <p className="text-3xl font-bold text-rose-700 mt-1">{blockedUsersCount}</p>
            </div>
          </div>

          {activeTab === 'payments' && (
            <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
              {payments.length === 0 ? (
                <div className="p-10 text-center text-slate-500">Aucun paiement en attente.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium text-sm">
                        <th className="p-4">Date</th>
                        <th className="p-4">Utilisateur</th>
                        <th className="p-4">Type</th>
                        <th className="p-4">Montant</th>
                        <th className="p-4">Méthode</th>
                        <th className="p-4">Reçu</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {payments.map((payment) => {
                        const user = users.find(u => u.id === payment.userId);
                        const splitName = splitFullName(user?.displayName || '');
                        const paymentUserName = formatFullName(
                          user?.lastName || splitName.lastName,
                          user?.firstName || splitName.firstName,
                        ) || user?.displayName || 'Inconnu';
                        return (
                          <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 text-sm text-slate-600">{new Date(payment.createdAt).toLocaleDateString()}</td>
                            <td className="p-4">
                              <div className="font-medium text-slate-900">{paymentUserName}</div>
                              <div className="text-xs text-slate-500">{user?.email}</div>
                            </td>
                            <td className="p-4 text-sm font-medium text-slate-700 capitalize">{payment.type}</td>
                            <td className="p-4 font-bold text-slate-900">{payment.amount} DZD</td>
                            <td className="p-4 text-sm font-medium text-slate-700 uppercase">{payment.method}</td>
                            <td className="p-4">
                              {payment.receiptUrl ? (
                                <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="text-medical-600 hover:underline text-sm font-medium">Voir le reçu</a>
                              ) : (
                                <span className="text-slate-400 text-sm">Aucun</span>
                              )}
                            </td>
                            <td className="p-4 text-right flex justify-end gap-2">
                              <button 
                                onClick={() => handleApprovePayment(payment.id, payment.userId, payment.type, payment.targetId, payment.items, payment.plan)}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Approuver"
                              >
                                <CheckCircle className="h-5 w-5" />
                              </button>
                              <button 
                                onClick={() => handleRejectPayment(payment)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Rejeter"
                              >
                                <XCircle className="h-5 w-5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="relative block">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder="Rechercher nom complet, email, telephone"
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                    />
                  </label>

                  <select
                    title="Filtrer par role"
                    aria-label="Filtrer par role"
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value as 'all' | NonNullable<AdminUser['role']>)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                  >
                    <option value="all">Tous les roles</option>
                    <option value="user">User (Demo)</option>
                    <option value="vip">VIP (Achats)</option>
                    <option value="vip_plus">VIP Plus (Abonne)</option>
                    <option value="admin">Admin</option>
                  </select>

                  <select
                    title="Filtrer par statut"
                    aria-label="Filtrer par statut"
                    value={userStatusFilter}
                    onChange={(e) => setUserStatusFilter(e.target.value as 'all' | UserStatus)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                  >
                    <option value="all">Tous les statuts</option>
                    <option value="active">Active</option>
                    <option value="expiring_soon">Bientot expire</option>
                    <option value="pending">En attente</option>
                    <option value="expired">Expire</option>
                  </select>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-center border-collapse text-xs md:text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium text-sm">
                      <th className="p-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setNameSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap hover:text-slate-900 transition-colors"
                          title={`Tri nom complet ${nameSortDirection === 'asc' ? 'A-Z' : 'Z-A'}`}
                          aria-label={`Tri nom complet ${nameSortDirection === 'asc' ? 'A-Z' : 'Z-A'}`}
                        >
                          <User className="w-4 h-4" />
                          Nom complet
                          <ArrowUpDown className="w-4 h-4" />
                          <span className="text-[11px] font-semibold uppercase">{nameSortDirection === 'asc' ? 'A-Z' : 'Z-A'}</span>
                        </button>
                      </th>
                      <th className="p-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <Mail className="w-4 h-4" />
                          Email
                        </span>
                      </th>
                      <th className="p-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <Phone className="w-4 h-4" />
                          Telephone
                        </span>
                      </th>
                      <th className="p-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <CalendarDays className="w-4 h-4" />
                          Date creation
                        </span>
                      </th>
                      <th className="p-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <Shield className="w-4 h-4" />
                          Role
                        </span>
                      </th>
                      <th className="p-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <Activity className="w-4 h-4" />
                          Statut
                        </span>
                      </th>
                      <th className="p-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <Clock3 className="w-4 h-4" />
                          Expiration
                        </span>
                      </th>
                      <th className="p-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <Settings className="w-4 h-4" />
                          Actions
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredAndSortedUsers.map((user) => {
                      const status = getUserStatus(user);
                      const effectiveExpiry = getEffectiveExpiryDate(user);
                      const splitName = splitFullName(user.displayName || '');
                      const fullName = formatFullName(user.lastName || splitName.lastName, user.firstName || splitName.firstName) || user.displayName;

                      return (
                        <tr key={user.id} className="hover:bg-slate-50 transition-colors align-middle">
                          <td className="p-3 font-medium text-slate-900 text-center">{fullName}</td>
                          <td className="p-3 text-slate-600 text-center">{user.email}</td>
                          <td className="p-3 text-slate-600 text-center">{user.phoneNumber || '-'}</td>
                          <td className="p-3 text-slate-600 text-center">
                            {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex justify-center">
                            <select
                              value={user.role}
                              title="Role utilisateur"
                              aria-label="Role utilisateur"
                              onChange={async (e) => {
                                try {
                                  const nextRole = e.target.value as AdminUser['role'];

                                  const hasPurchasedFromProfile =
                                    (user.purchasedVideos?.length || 0) > 0 ||
                                    (user.purchasedPacks?.length || 0) > 0;

                                  const hasApprovedProductPayment = allPayments.some((payment) => {
                                    if (payment.userId !== user.id || payment.status !== 'approved') return false;
                                    if (payment.type === 'pack') return true;
                                    if (payment.type === 'cart') {
                                      return Array.isArray(payment.items)
                                        ? payment.items.some((item) => item.type === 'video' || item.type === 'pack')
                                        : false;
                                    }
                                    return false;
                                  });

                                  const hasPurchasedProduct = hasPurchasedFromProfile || hasApprovedProductPayment;

                                  if (
                                    nextRole === 'user' &&
                                    (user.role === 'vip' || user.role === 'vip_plus') &&
                                    hasPurchasedProduct
                                  ) {
                                    alert('Impossible de transferer cet utilisateur vers Demo: il a deja achete un produit.');
                                    return;
                                  }

                                  const roleUpdate: Record<string, unknown> = { role: nextRole };

                                  if (nextRole !== 'vip_plus') {
                                    roleUpdate.subscriptionApprovalStatus = 'none';
                                  }

                                  await updateDoc(doc(db, 'users', user.id), roleUpdate);
                                  setUsers((prev) =>
                                    prev.map((entry) =>
                                      entry.id === user.id
                                        ? {
                                            ...entry,
                                            role: nextRole,
                                            subscriptionApprovalStatus:
                                              nextRole !== 'vip_plus'
                                                ? 'none'
                                                : entry.subscriptionApprovalStatus,
                                          }
                                        : entry,
                                    ),
                                  );
                                } catch (error) {
                                  console.error('Error updating user role:', error);
                                  alert('Erreur lors de la mise a jour du role.');
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none outline-none cursor-pointer transition-colors ${
                                user.role === 'admin'
                                  ? 'bg-purple-100 text-purple-800'
                                  : user.role === 'vip_plus'
                                    ? 'bg-accent-100 text-accent-800'
                                    : user.role === 'vip'
                                      ? 'bg-medical-100 text-medical-800'
                                      : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              <option value="user">User (Demo)</option>
                              <option value="vip">VIP (Achats)</option>
                              <option value="vip_plus">VIP Plus (Abonne)</option>
                              <option value="admin">Admin</option>
                            </select>
                            </div>
                          </td>
                          <td className="p-3 text-slate-700 text-center">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(status)}`}>
                              {getStatusLabel(status)}
                            </span>
                            {user.isBlocked && (
                              <div className="mt-1 text-xs font-medium text-rose-600">Compte bloque</div>
                            )}
                          </td>
                          <td className="p-3 text-slate-600 whitespace-nowrap text-center">
                            {user.role === 'admin' ? (
                              <span className="text-emerald-700 font-medium">Illimite</span>
                            ) : (
                              <div className="flex justify-center">
                              <input
                                type="date"
                                title="Date d expiration"
                                aria-label="Date d expiration"
                                min={todayDate}
                                value={getDateInputValue(user.subscriptionEndDate || effectiveExpiry?.toISOString())}
                                onChange={(e) => handleUpdateExpirationDate(user, e.target.value)}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                              />
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                              {user.role === 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenCloudinarySettingsModal(user)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
                                  title="Configurer Cloudinary pour cet admin"
                                  aria-label="Configurer Cloudinary pour cet admin"
                                >
                                  <Settings className="w-3.5 h-3.5" />
                                  Cloudinary
                                </button>
                              )}
                              {user.role !== 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => setPurchaseModalUserId(user.id)}
                                  className="p-2 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                                  title="Voir les achats videos"
                                  aria-label="Voir les achats videos"
                                >
                                  <Video className="w-4 h-4" />
                                </button>
                              )}
                              {status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleApprovePendingUser(user)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                                  title="Approuver compte en attente"
                                >
                                  Approuver
                                </button>
                              )}
                              {user.role !== 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleBlockUser(user)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    user.isBlocked
                                      ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200'
                                      : 'text-amber-700 bg-amber-100 hover:bg-amber-200'
                                  }`}
                                  title={user.isBlocked ? 'Debloquer utilisateur' : 'Bloquer utilisateur'}
                                  aria-label={user.isBlocked ? 'Debloquer utilisateur' : 'Bloquer utilisateur'}
                                >
                                  {user.isBlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                </button>
                              )}
                              {user.role !== 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Supprimer utilisateur"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>

              {purchaseModalUserId && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                  <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[85vh] overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Details des achats video</h3>
                        <p className="text-sm text-slate-500">
                          {(() => {
                            const targetUser = users.find((u) => u.id === purchaseModalUserId);
                            const splitName = splitFullName(targetUser?.displayName || '');
                            return formatFullName(
                              targetUser?.lastName || splitName.lastName,
                              targetUser?.firstName || splitName.firstName,
                            ) || targetUser?.displayName || 'Utilisateur';
                          })()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPurchaseModalUserId(null)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 transition-colors"
                      >
                        Fermer
                      </button>
                    </div>

                    <div className="p-6 overflow-y-auto max-h-[calc(85vh-140px)] space-y-6 purchase-details-scroll">
                      <div className="flex flex-col md:flex-row gap-3">
                        <select
                          title="Selectionner une video a ajouter"
                          aria-label="Selectionner une video a ajouter"
                          value={videoToAddByUser[purchaseModalUserId] || ''}
                          onChange={(e) =>
                            setVideoToAddByUser((prev) => ({
                              ...prev,
                              [purchaseModalUserId]: e.target.value,
                            }))
                          }
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                        >
                          <option value="">Selectionner une video a ajouter</option>
                          {videos
                            .filter((video) => !video.isFreeDemo)
                            .map((video) => (
                            <option key={video.id} value={video.id}>
                              {video.title || video.id}
                            </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const selectedUser = users.find((u) => u.id === purchaseModalUserId);
                            if (!selectedUser) return;
                            handleAddVideoToUser(selectedUser);
                          }}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-medical-600 text-white text-sm font-medium hover:bg-medical-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" /> Ajouter video
                        </button>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        {getUserPurchaseCards(purchaseModalUserId).length === 0 ? (
                          <div className="sm:col-span-2 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">
                            Aucune video achetee pour cet utilisateur.
                          </div>
                        ) : (
                          getUserPurchaseCards(purchaseModalUserId).map((card, index) => {
                            const selectedUser = users.find((u) => u.id === purchaseModalUserId);
                            if (!selectedUser) return null;
                            const isPending = card.status === 'pending';
                            const isBlocked = card.status === 'blocked';

                            return (
                              <div key={`${card.videoId}-${card.paymentId || index}`} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                                <div className="flex items-start justify-between gap-2 mb-3">
                                  <div>
                                    <p className="font-semibold text-slate-900">{card.title}</p>
                                    <p className="text-xs text-slate-500">Date achat: {card.createdAt ? new Date(card.createdAt).toLocaleDateString() : '-'}</p>
                                  </div>
                                  <span className={`inline-flex px-2 py-1 rounded-full text-[11px] font-semibold ${
                                    isPending
                                      ? 'bg-amber-100 text-amber-700'
                                      : isBlocked
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-emerald-100 text-emerald-700'
                                  }`}>
                                    {isPending ? 'En attente' : isBlocked ? 'Bloquee' : 'Active'}
                                  </span>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {isPending && card.paymentId && (
                                    <button
                                      type="button"
                                      onClick={() => handleApprovePendingVideoPayment(card.paymentId!)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                                    >
                                      <ShieldCheck className="w-3.5 h-3.5" /> Approuver
                                    </button>
                                  )}

                                  {!isPending && (
                                    <button
                                      type="button"
                                      onClick={() => handleBlockVideoForUser(selectedUser, card.videoId)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                                    >
                                      {isBlocked ? <Unlock className="w-3.5 h-3.5" /> : <ShieldBan className="w-3.5 h-3.5" />} {isBlocked ? 'Debloquer' : 'Bloquer'}
                                    </button>
                                  )}

                                  {!isPending && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePurchasedVideo(selectedUser, card.videoId)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> Supprimer
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isCreateUserModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                  <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="text-lg font-bold text-slate-900">Ajouter un compte</h3>
                      <button
                        type="button"
                        onClick={() => setIsCreateUserModalOpen(false)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 transition-colors"
                      >
                        Fermer
                      </button>
                    </div>

                    <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                      <input
                        type="text"
                        placeholder="Nom (MAJUSCULES)"
                        value={newUserForm.lastName}
                        onChange={(e) => setNewUserForm((prev) => ({ ...prev, lastName: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Prénom"
                        value={newUserForm.firstName}
                        onChange={(e) => setNewUserForm((prev) => ({ ...prev, firstName: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                        required
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={newUserForm.email}
                        onChange={(e) => setNewUserForm((prev) => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                        required
                      />
                      <input
                        type="tel"
                        placeholder="Numéro de téléphone (Optionnel)"
                        value={newUserForm.phoneNumber}
                        onChange={(e) => setNewUserForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                      />
                      <input
                        type="password"
                        placeholder="Mot de passe"
                        value={newUserForm.password}
                        onChange={(e) => setNewUserForm((prev) => ({ ...prev, password: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                        minLength={6}
                        required
                      />
                      <select
                        title="Role nouveau compte"
                        aria-label="Role nouveau compte"
                        value={newUserForm.role}
                        onChange={(e) =>
                          setNewUserForm((prev) => ({
                            ...prev,
                            role: e.target.value as 'user' | 'vip' | 'vip_plus' | 'admin',
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none bg-white"
                      >
                        <option value="user">User</option>
                        <option value="vip">VIP</option>
                        <option value="vip_plus">VIP Plus</option>
                        <option value="admin">Admin</option>
                      </select>

                      <button
                        type="submit"
                        disabled={isCreatingUser}
                        className="w-full px-4 py-2 rounded-lg bg-medical-600 text-white text-sm font-semibold hover:bg-medical-700 transition-colors disabled:opacity-60"
                      >
                        {isCreatingUser ? 'Creation...' : 'Creer le compte'}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {cloudinaryModalUserId && cloudinaryModalUser && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                  <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Parametres Cloudinary admin</h3>
                        <p className="text-sm text-slate-500">{cloudinaryModalUser.email || cloudinaryModalUser.displayName || cloudinaryModalUser.id}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCloseCloudinarySettingsModal}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 transition-colors"
                      >
                        Fermer
                      </button>
                    </div>

                    <div className="p-6 space-y-4">
                      <p className="text-sm text-slate-600">
                        Ces identifiants seront utilises pour les uploads de contenu pedagogique de cet admin (videos, schemas, cas cliniques).
                      </p>

                      <div>
                        <label className="block text-sm font-medium mb-2 text-slate-700">CLOUDINARY_CLOUD_NAME</label>
                        <input
                          type="text"
                          value={adminCloudinaryForm.cloudName}
                          onChange={(e) =>
                            setAdminCloudinaryForm((prev) => ({
                              ...prev,
                              cloudName: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                          placeholder="ex: demo-cloud"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2 text-slate-700">CLOUDINARY_API_KEY</label>
                        <input
                          type="text"
                          value={adminCloudinaryForm.apiKey}
                          onChange={(e) =>
                            setAdminCloudinaryForm((prev) => ({
                              ...prev,
                              apiKey: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                          placeholder="ex: 123456789012345"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2 text-slate-700">CLOUDINARY_API_SECRET</label>
                        <input
                          type="password"
                          value={adminCloudinaryForm.apiSecret}
                          onChange={(e) =>
                            setAdminCloudinaryForm((prev) => ({
                              ...prev,
                              apiSecret: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-medical-500 outline-none"
                          placeholder="Secret API"
                        />
                      </div>

                      <div className="pt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={handleCloseCloudinarySettingsModal}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAdminCloudinarySettings}
                          disabled={isSavingAdminCloudinary || !hasCompleteAdminCloudinaryForm}
                          className="px-4 py-2 rounded-lg text-sm font-semibold bg-medical-600 text-white hover:bg-medical-700 transition-colors disabled:opacity-60"
                        >
                          {isSavingAdminCloudinary ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'content' && (
            <AdminContentManager />
          )}

          {activeTab === 'discussions' && (
            <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
              {discussions.length === 0 ? (
                <div className="p-10 text-center text-slate-500">Aucune discussion envoyée pour le moment.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium text-sm">
                        <th className="p-4">Date</th>
                        <th className="p-4">Utilisateur</th>
                        <th className="p-4">Nom Cours</th>
                        <th className="p-4">Type</th>
                        <th className="p-4">Message</th>
                        <th className="p-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {discussions.map((entry) => {
                        const discussionUser = getDiscussionUserDisplay(entry);
                        const courseTitle = getDiscussionCourseTitle(entry);
                        const discussionType = getDiscussionTypeLabel(entry);

                        return (
                          <tr
                            key={`${entry.source}-${entry.id}`}
                            className={`transition-colors align-top border-l-4 ${
                              entry.isRead
                                ? 'bg-slate-50/40 border-l-slate-200 hover:bg-slate-50'
                                : 'bg-amber-50/60 border-l-amber-300 hover:bg-amber-50'
                            }`}
                          >
                            <td className="p-4 text-sm text-slate-600 whitespace-nowrap">
                              {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '-'}
                            </td>
                            <td className="p-4">
                              <div className="font-medium text-slate-900">{discussionUser.displayName}</div>
                              <div className="text-xs text-slate-500">{discussionUser.email}</div>
                            </td>
                            <td className="p-4 text-sm text-slate-800">
                              {courseTitle}
                            </td>
                            <td className="p-4 text-xs text-slate-700 max-w-sm">
                              <p className="whitespace-pre-wrap leading-relaxed">{discussionType}</p>
                            </td>
                            <td className="p-4 max-w-xl">
                              <div
                                className="max-h-24 overflow-y-auto pr-2 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap"
                                title="Message feedback"
                                aria-label="Message feedback"
                              >
                                {entry.message || '-'}
                              </div>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggleDiscussionRead(entry)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    entry.isRead
                                      ? 'text-amber-700 bg-amber-100 hover:bg-amber-200'
                                      : 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200'
                                  }`}
                                  title={entry.isRead ? 'Marquer comme non lue' : 'Marquer comme lue'}
                                  aria-label={entry.isRead ? 'Marquer comme non lue' : 'Marquer comme lue'}
                                >
                                  {entry.isRead ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDiscussion(entry)}
                                  className="p-2 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                                  title="Supprimer"
                                  aria-label="Supprimer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
