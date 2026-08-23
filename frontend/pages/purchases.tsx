'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clock3,
  Lock,
  PlayCircle,
  ReceiptText,
  ShoppingBag,
  Search,
  BookOpen,
  Package,
  Sparkles,
  Layers,
  BadgeCheck,
  ArrowRight,
  Video,
  ExternalLink,
  GraduationCap,
  Filter,
  X,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Library,
  BookmarkCheck,
  Trophy,
} from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/components/providers/auth-provider';
import { collection, db, doc, getDoc, getDocs, query, where } from '@/lib/data/local-data';
import { VIDEO_FALLBACK_SRC, applyImageFallback } from '@/lib/utils/media-fallback';
import { useRealtimeRefresh } from '@/lib/hooks/useRealtimeRefresh';

type PaymentStatus = 'approved' | 'pending' | 'rejected';

type PaymentItem = {
  id?: string;
  type?: 'video' | 'pack' | string;
  title?: string;
  price?: number;
};

type PaymentRecord = {
  id: string;
  userId?: string;
  amount?: number;
  type?: string;
  plan?: string;
  targetId?: string;
  status?: string;
  method?: string;
  createdAt?: string;
  items?: PaymentItem[];
};

type PurchasedVideoData = {
  title?: string;
  url?: string;
  thumbnailUrl?: string;
  parts?: Array<{ secureUrl?: string; duration?: number | string }>;
  duration?: string | number;
  durationMinutes?: number;
  durationSeconds?: number;
  subspecialty?: string;
  subspeciality?: string;
  subspecialtyName?: string;
};

const STATUS_TONE: Record<string, { bg: string; border: string; text: string }> = {
  approved: {
    bg: 'color-mix(in oklab, var(--app-success) 20%, var(--app-surface) 80%)',
    border: 'color-mix(in oklab, var(--app-success) 56%, var(--app-border) 44%)',
    text: 'var(--app-text)',
  },
  rejected: {
    bg: 'color-mix(in oklab, var(--app-danger) 20%, var(--app-surface) 80%)',
    border: 'color-mix(in oklab, var(--app-danger) 56%, var(--app-border) 44%)',
    text: 'var(--app-text)',
  },
  pending: {
    bg: 'color-mix(in oklab, var(--app-warning) 16%, var(--app-surface) 84%)',
    border: 'color-mix(in oklab, var(--app-warning) 52%, var(--app-border) 48%)',
    text: 'var(--app-text)',
  },
};

const PACK_LABELS: Record<string, string> = {
  otologie: 'Otologie',
  rhinologie: 'Rhinologie & Sinusologie',
  laryngologie: 'Laryngologie & Cervicologie',
};

const PACK_META: Record<string, { icon: string; desc: string; color: string; sub: string }> = {
  otologie: { icon: '🦻', desc: "Pathologies de l'oreille", color: 'var(--specialty-otology)', sub: 'Oreille externe, moyenne & interne' },
  rhinologie: { icon: '👃', desc: 'Nez, sinus & fosses nasales', color: 'var(--specialty-rhinology)', sub: 'Rhinologie & sinusologie complète' },
  laryngologie: { icon: '🗣️', desc: 'Larynx, pharynx & cou', color: 'var(--specialty-laryngology)', sub: 'Voix, déglutition & cervicologie' },
};

const normalizeUniqueIdList = (source: unknown): string[] => {
  if (!Array.isArray(source)) return [];
  return Array.from(new Set(source.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)));
};

const normalizePaymentStatus = (status: unknown): PaymentStatus => {
  const value = String(status || '').toLowerCase();
  if (value === 'approved') return 'approved';
  if (value === 'rejected') return 'rejected';
  return 'pending';
};

const formatPackLabel = (packId: string) => {
  const normalized = packId.trim().toLowerCase();
  if (!normalized) return 'Pack inconnu';
  if (PACK_LABELS[normalized]) return PACK_LABELS[normalized];
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
};

const extractYouTubeVideoId = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const shortMatch = trimmed.match(/youtu\.be\/([^?&/]+)/i);
  if (shortMatch?.[1]) return shortMatch[1];
  const watchMatch = trimmed.match(/[?&]v=([^?&/]+)/i);
  if (watchMatch?.[1]) return watchMatch[1];
  const embedMatch = trimmed.match(/youtube\.com\/embed\/([^?&/]+)/i);
  if (embedMatch?.[1]) return embedMatch[1];
  return null;
};

const buildCloudinaryVideoThumbnailUrl = (videoUrl: string, secondMark = 60) => {
  const cleaned = videoUrl.trim().split('#')[0]?.split('?')[0] ?? '';
  if (!cleaned) return null;
  const uploadMarker = '/video/upload/';
  const markerIndex = cleaned.indexOf(uploadMarker);
  if (markerIndex === -1) return null;
  const uploadBase = cleaned.slice(0, markerIndex + uploadMarker.length);
  let pathAfterUpload = cleaned.slice(markerIndex + uploadMarker.length);
  if (!pathAfterUpload) return null;
  const versionSegmentMatch = pathAfterUpload.match(/\/v\d+\//);
  if (versionSegmentMatch && typeof versionSegmentMatch.index === 'number') {
    pathAfterUpload = pathAfterUpload.slice(versionSegmentMatch.index + 1);
  } else {
    const pathTokens = pathAfterUpload.split('/');
    if (pathTokens.length > 1 && pathTokens[0].includes(',')) pathAfterUpload = pathTokens.slice(1).join('/');
  }
  const jpgPath = /\.[a-z0-9]+$/i.test(pathAfterUpload) ? pathAfterUpload.replace(/\.[a-z0-9]+$/i, '.jpg') : `${pathAfterUpload}.jpg`;
  const safeSecond = Math.max(0, Math.floor(secondMark));
  return `${uploadBase}so_${safeSecond},c_fill,g_auto,ar_16:9,w_960,f_jpg,q_auto/${jpgPath}`;
};

const getVideoThumbnailUrl = (video: PurchasedVideoData, secondMark = 60) => {
  const explicitThumbnail = String(video.thumbnailUrl || '').trim();
  if (explicitThumbnail.length > 0) return explicitThumbnail;
  const firstPartUrl = Array.isArray(video.parts)
    ? String(video.parts.find((part) => typeof part?.secureUrl === 'string' && part.secureUrl.trim().length > 0)?.secureUrl || '').trim()
    : '';
  const primaryUrl = String(video.url || firstPartUrl || '').trim();
  if (!primaryUrl) return null;
  const cloudinaryThumb = buildCloudinaryVideoThumbnailUrl(primaryUrl, secondMark);
  if (cloudinaryThumb) return cloudinaryThumb;
  const youtubeId = extractYouTubeVideoId(primaryUrl);
  if (youtubeId) return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  return null;
};

export default function PurchasesPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [purchasedVideosById, setPurchasedVideosById] = useState<Record<string, PurchasedVideoData>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'packs' | 'videos' | 'history'>('packs');
  const [videoSearch, setVideoSearch] = useState('');

  const isLightMode = themeMode === 'light';
  const subtleText = 'color-mix(in oklab, var(--app-text) 68%, var(--app-muted) 32%)';
  const pageBackground = isLightMode
    ? 'radial-gradient(120% 120% at 20% 10%, color-mix(in oklab, var(--app-accent) 7%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, var(--app-bg) 100%)'
    : 'radial-gradient(120% 120% at 20% 10%, color-mix(in oklab, var(--app-accent) 10%, transparent), transparent 58%), linear-gradient(180deg, color-mix(in oklab, var(--app-bg) 92%, var(--app-surface) 8%) 0%, var(--app-bg) 100%)';

  const purchasedVideosFromProfile = useMemo(() => normalizeUniqueIdList(profile?.purchasedVideos), [profile?.purchasedVideos]);
  const purchasedPacksFromProfile = useMemo(() => normalizeUniqueIdList(profile?.purchasedPacks), [profile?.purchasedPacks]);
  const blockedVideoIdSet = useMemo(() => new Set(normalizeUniqueIdList(profile?.blockedVideoIds)), [profile?.blockedVideoIds]);

  const approvedPurchasesFromPayments = useMemo(() => {
    const videoIds = new Set<string>();
    const packIds = new Set<string>();
    payments.forEach((payment) => {
      if (normalizePaymentStatus(payment.status) !== 'approved') return;
      const paymentType = String(payment.type || '').toLowerCase();
      if (paymentType === 'video' && typeof payment.targetId === 'string' && payment.targetId.trim().length > 0) {
        videoIds.add(payment.targetId.trim());
        return;
      }
      if (paymentType === 'pack' && typeof payment.targetId === 'string' && payment.targetId.trim().length > 0) {
        packIds.add(payment.targetId.trim());
        return;
      }
      if (paymentType === 'cart' && Array.isArray(payment.items)) {
        payment.items.forEach((item) => {
          if (item?.type === 'video' && typeof item.id === 'string' && item.id.trim().length > 0) videoIds.add(item.id.trim());
          if (item?.type === 'pack' && typeof item.id === 'string' && item.id.trim().length > 0) packIds.add(item.id.trim());
        });
      }
    });
    return { videoIds: Array.from(videoIds), packIds: Array.from(packIds) };
  }, [payments]);

  const effectivePurchasedVideoIds = useMemo(
    () => Array.from(new Set([...purchasedVideosFromProfile, ...approvedPurchasesFromPayments.videoIds])),
    [approvedPurchasesFromPayments.videoIds, purchasedVideosFromProfile],
  );
  const effectivePurchasedPackIds = useMemo(
    () => Array.from(new Set([...purchasedPacksFromProfile, ...approvedPurchasesFromPayments.packIds])),
    [approvedPurchasesFromPayments.packIds, purchasedPacksFromProfile],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const syncThemeMode = () => setThemeMode(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    syncThemeMode();
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.attributeName === 'data-theme')) syncThemeMode();
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push('/sign-in');
  }, [authLoading, user, router]);

  const fetchHistory = useCallback(async () => {
    if (!user) {
      setPayments([]);
      setLoading(false);
      return;
    }
    try {
      const q = query(collection(db, 'payments'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      setPayments(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() } as PaymentRecord)));
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadPurchasedVideoData = useCallback(async () => {
    if (effectivePurchasedVideoIds.length === 0) {
      setPurchasedVideosById({});
      return;
    }
    try {
      const entries = await Promise.all(
        effectivePurchasedVideoIds.map(async (videoId) => {
          const snap = await getDoc(doc(db, 'videos', videoId));
          if (!snap.exists()) return [videoId, null] as const;
          const data = snap.data() as PurchasedVideoData;
          return [videoId, data || null] as const;
        }),
      );
      const nextMap = entries.reduce<Record<string, PurchasedVideoData>>((acc, [videoId, data]) => {
        if (data) acc[videoId] = data;
        return acc;
      }, {});
      setPurchasedVideosById(nextMap);
    } catch (error) {
      console.error('Error loading purchased video data:', error);
    }
  }, [effectivePurchasedVideoIds]);

  useEffect(() => {
    if (!authLoading) void fetchHistory();
  }, [authLoading, fetchHistory]);
  useEffect(() => {
    void loadPurchasedVideoData();
  }, [loadPurchasedVideoData]);

  useRealtimeRefresh(
    ['payments', 'users', 'videos'],
    () => {
      void fetchHistory();
      void loadPurchasedVideoData();
    },
    { intervalMs: 4000 },
  );

  const formatVideoDuration = (video: PurchasedVideoData): string => {
    const formatAsHourMinute = (totalMinutes: number) => {
      const safeMinutes = Math.max(0, Math.floor(totalMinutes));
      const hours = Math.floor(safeMinutes / 60);
      const minutes = safeMinutes % 60;
      return `${String(hours).padStart(2, '0')} h ${String(minutes).padStart(2, '0')} min`;
    };
    const partsDurationSeconds = Array.isArray(video.parts)
      ? video.parts.reduce((sum, part) => {
          const value = Number(part?.duration);
          if (!Number.isFinite(value) || value <= 0) return sum;
          return sum + value;
        }, 0)
      : 0;
    if (partsDurationSeconds > 0) return formatAsHourMinute(Math.floor(partsDurationSeconds / 60));
    if (typeof video.durationSeconds === 'number' && Number.isFinite(video.durationSeconds) && video.durationSeconds > 0)
      return formatAsHourMinute(Math.floor(video.durationSeconds / 60));
    if (typeof video.durationMinutes === 'number' && Number.isFinite(video.durationMinutes) && video.durationMinutes >= 0)
      return formatAsHourMinute(video.durationMinutes);
    const durationRaw = video?.duration;
    if (typeof durationRaw === 'number' && Number.isFinite(durationRaw)) return formatAsHourMinute(durationRaw);
    if (typeof durationRaw === 'string') {
      const s = durationRaw.trim().toLowerCase();
      if (s.length === 0) return formatAsHourMinute(0);
      const isoMatch = s.match(/^pt(?:(\d+(?:[\.,]\d+)?)h)?(?:(\d+(?:[\.,]\d+)?)m)?(?:(\d+(?:[\.,]\d+)?)s)?$/i);
      if (isoMatch) {
        const hours = Number((isoMatch[1] || '0').replace(',', '.'));
        const minutes = Number((isoMatch[2] || '0').replace(',', '.'));
        const seconds = Number((isoMatch[3] || '0').replace(',', '.'));
        const totalMinutes = (Number.isFinite(hours) ? hours * 60 : 0) + (Number.isFinite(minutes) ? minutes : 0) + (Number.isFinite(seconds) ? Math.floor(seconds / 60) : 0);
        return formatAsHourMinute(totalMinutes);
      }
      if (s.includes(':')) {
        const parts = s.split(':').map((p) => Number(p.trim()));
        if (parts.every(Number.isFinite)) {
          if (parts.length === 3) return formatAsHourMinute(Math.floor((parts[0] * 3600 + parts[1] * 60 + parts[2]) / 60));
          if (parts.length === 2) return formatAsHourMinute(Math.floor((parts[0] * 60 + parts[1]) / 60));
          if (parts.length === 1) return formatAsHourMinute(parts[0]);
        }
      }
      const hoursMatch = s.match(/(\d+(?:[\.,]\d+)?)\s*h/);
      const minutesMatch = s.match(/(\d+(?:[\.,]\d+)?)\s*m(?:in)?/);
      const secondsMatch = s.match(/(\d+(?:[\.,]\d+)?)\s*s/);
      if (hoursMatch || minutesMatch || secondsMatch) {
        const hours = Number((hoursMatch?.[1] || '0').replace(',', '.'));
        const minutes = Number((minutesMatch?.[1] || '0').replace(',', '.'));
        const seconds = Number((secondsMatch?.[1] || '0').replace(',', '.'));
        const totalMinutes = (Number.isFinite(hours) ? hours * 60 : 0) + (Number.isFinite(minutes) ? minutes : 0) + (Number.isFinite(seconds) ? Math.floor(seconds / 60) : 0);
        return formatAsHourMinute(totalMinutes);
      }
      const asNum = Number(s.replace(',', '.'));
      if (Number.isFinite(asNum)) return formatAsHourMinute(asNum);
    }
    return formatAsHourMinute(0);
  };

  const resolveSubspecialtyMeta = (sub?: string) => {
    if (!sub || typeof sub !== 'string') return { label: '', tone: 'default' as const };
    const trimmed = sub.trim();
    if (!trimmed) return { label: '', tone: 'default' as const };
    const normalized = trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (normalized.includes('otolog')) return { label: 'Otologie', tone: 'otologie' as const };
    if (normalized.includes('rhino') || normalized.includes('sinuso')) return { label: 'Rhinologie', tone: 'rhinologie' as const };
    if (normalized.includes('laryngo') || normalized.includes('cervico')) return { label: 'Laryngologie', tone: 'laryngologie' as const };
    return { label: `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`, tone: 'default' as const };
  };

  const paymentRequests = useMemo(() => {
    return [...payments]
      .sort((a, b) => {
        const aTime = typeof a?.createdAt === 'string' ? new Date(a.createdAt).getTime() : 0;
        const bTime = typeof b?.createdAt === 'string' ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .map((payment) => {
        const status = normalizePaymentStatus(payment.status);
        const statusLabel = status === 'approved' ? 'Approuvé' : status === 'rejected' ? 'Refusé' : 'En attente';
        const tone = STATUS_TONE[status] || STATUS_TONE.pending;
        const paymentType = String(payment?.type || '').toLowerCase();
        const items = Array.isArray(payment?.items) ? payment.items : [];
        const compactItemLabels = items
          .map((item) => {
            if (!item) return '';
            if (item.type === 'pack') return `Pack ${(item.title || '').trim() || formatPackLabel(String(item.id || ''))}`;
            if (item.type === 'video') return (item.title || '').trim() || `Vidéo ${String(item.id || '').trim()}`;
            return (item.title || '').trim();
          })
          .filter((label) => label.length > 0);
        const description = (() => {
          if (paymentType === 'subscription') {
            const plan = String(payment?.plan || '').toLowerCase();
            return plan === 'yearly' ? 'Abonnement VIP Plus annuel' : 'Abonnement VIP Plus mensuel';
          }
          if (paymentType === 'pack') return `Pack ${formatPackLabel(String(payment?.targetId || '').trim())}`;
          if (paymentType === 'video') {
            const title = (compactItemLabels[0] || '').trim();
            if (title) return title;
            return `Vidéo ${String(payment?.targetId || '').trim() || '-'}`.trim();
          }
          if (paymentType === 'cart') {
            if (compactItemLabels.length === 0) return 'Panier';
            if (compactItemLabels.length <= 2) return compactItemLabels.join(', ');
            return `${compactItemLabels.slice(0, 2).join(', ')} +${compactItemLabels.length - 2}`;
          }
          return 'Achat';
        })();
        const createdAtText = typeof payment?.createdAt === 'string' ? new Date(payment.createdAt).toLocaleString('fr-FR') : 'Date inconnue';
        const methodRaw = String(payment?.method || '').toLowerCase();
        const methodLabel = methodRaw === 'virement' ? 'Virement' : methodRaw === 'baridimob' ? 'BaridiMob' : methodRaw ? methodRaw : 'Non précisée';
        return {
          id: String(payment?.id || `${createdAtText}-${description}`),
          status,
          statusLabel,
          tone,
          amount: Number(payment?.amount || 0),
          description,
          createdAtText,
          methodLabel,
        };
      });
  }, [payments]);

  const paymentSummary = useMemo(
    () => ({
      total: paymentRequests.length,
      pending: paymentRequests.filter((entry) => entry.status === 'pending').length,
      approved: paymentRequests.filter((entry) => entry.status === 'approved').length,
      rejected: paymentRequests.filter((entry) => entry.status === 'rejected').length,
    }),
    [paymentRequests],
  );

  const filteredVideoIds = useMemo(() => {
    if (!videoSearch.trim()) return effectivePurchasedVideoIds;
    const q = videoSearch.trim().toLowerCase();
    return effectivePurchasedVideoIds.filter((id) => {
      const v = purchasedVideosById[id];
      const title = String(v?.title || id).toLowerCase();
      const sub = String(v?.subspecialty || v?.subspeciality || v?.subspecialtyName || '').toLowerCase();
      return title.includes(q) || sub.includes(q) || id.toLowerCase().includes(q);
    });
  }, [effectivePurchasedVideoIds, purchasedVideosById, videoSearch]);

  if (authLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]" style={{ background: pageBackground }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[var(--app-accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium" style={{ color: subtleText }}>Chargement de votre bibliothèque…</p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const totalLibraryItems = effectivePurchasedPackIds.length + effectivePurchasedVideoIds.length;
  const libraryProgress = totalLibraryItems > 0 ? 100 : 0; // placeholder for future progress

  return (
    <div className="flex-1 min-h-screen py-6 sm:py-8" style={{ background: pageBackground }}>
      <div className="max-w-[1160px] mx-auto px-4 sm:px-6">
        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[24px] sm:rounded-[28px] border mb-6 sm:mb-8"
          style={{
            background: isLightMode
              ? 'linear-gradient(135deg, color-mix(in oklab, var(--app-surface) 94%, white 6%) 0%, color-mix(in oklab, var(--app-surface-alt) 82%, var(--app-accent) 18%) 100%)'
              : 'linear-gradient(135deg, color-mix(in oklab, var(--app-surface) 96%, var(--app-bg) 4%) 0%, color-mix(in oklab, var(--app-deep-surface) 92%, var(--app-accent) 8%) 100%)',
            borderColor: 'color-mix(in oklab, var(--app-accent) 18%, var(--app-border) 82%)',
            boxShadow: '0 18px 48px -24px rgba(0,0,0,0.28)',
          }}
        >
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl pointer-events-none" style={{ background: 'color-mix(in oklab, var(--app-accent) 22%, transparent)' }} />
          <div className="absolute -bottom-24 -left-16 w-80 h-80 rounded-full blur-3xl pointer-events-none" style={{ background: 'color-mix(in oklab, var(--app-accent) 14%, transparent)' }} />
          <div className="relative z-10 px-5 sm:px-8 lg:px-10 py-7 sm:py-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide uppercase mb-3" style={{ background: 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)', borderColor: 'color-mix(in oklab, var(--app-accent) 26%, var(--app-border) 74%)', color: 'var(--app-accent)' }}>
                  <Library className="w-3 h-3" />
                  Bibliothèque personnelle
                </div>
                <h1 className="text-[26px] sm:text-[30px] lg:text-[34px] font-bold tracking-tight leading-none" style={{ color: 'var(--app-text)', fontFamily: 'var(--font-display)' }}>
                  Mes Achats
                </h1>
                <p className="mt-2 text-[14px] sm:text-[15px] leading-relaxed max-w-[560px]" style={{ color: subtleText }}>
                  Tous vos contenus débloqués, organisés par spécialité. Reprenez là où vous vous êtes arrêté.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/checkout" className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white shadow-sm hover:brightness-110 transition" style={{ background: 'var(--app-accent)' }}>
                    <ShoppingBag className="w-4 h-4" />
                    Aller au panier
                  </Link>
                  <Link href="/specialties" className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border hover:bg-[var(--app-surface)] transition" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)', background: 'color-mix(in oklab, var(--app-surface) 88%, white 12%)' }}>
                    Explorer les spécialités <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {/* stats */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[380px]">
                {[
                  { label: 'Packs', value: effectivePurchasedPackIds.length, sub: 'spécialités', icon: Layers, accent: 'var(--app-accent)' },
                  { label: 'Vidéos', value: effectivePurchasedVideoIds.length, sub: 'cours', icon: PlayCircle, accent: 'var(--app-info)' },
                  { label: 'Paiements', value: paymentSummary.total, sub: `${paymentSummary.pending} en attente`, icon: ReceiptText, accent: 'var(--app-warning)' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl border p-3 sm:p-4 text-center backdrop-blur" style={{ background: 'color-mix(in oklab, var(--app-surface) 88%, white 12%)', borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                    <div className="w-8 h-8 rounded-xl mx-auto flex items-center justify-center mb-2" style={{ background: `color-mix(in oklab, ${stat.accent} 18%, var(--app-surface) 82%)`, color: stat.accent }}>
                      <stat.icon className="w-4 h-4" />
                    </div>
                    <p className="text-xl sm:text-2xl font-bold leading-none" style={{ color: 'var(--app-text)' }}>{stat.value}</p>
                    <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide mt-1" style={{ color: subtleText }}>{stat.label}</p>
                    <p className="text-[10px] truncate" style={{ color: subtleText }}>{stat.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* progress hint */}
            {totalLibraryItems > 0 && (
              <div className="mt-6 rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ background: 'color-mix(in oklab, var(--app-success) 8%, var(--app-surface) 92%)', borderColor: 'color-mix(in oklab, var(--app-success) 18%, var(--app-border) 82%)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'color-mix(in oklab, var(--app-success) 16%, white 84%)', color: 'var(--app-success)' }}>
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>{totalLibraryItems} contenu{totalLibraryItems > 1 ? 's' : ''} débloqué{totalLibraryItems > 1 ? 's' : ''} • Accès illimité</p>
                    <p className="text-xs" style={{ color: subtleText }}>Votre bibliothèque grandit à chaque validation. Continuez votre préparation DEMS.</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full shrink-0" style={{ background: 'var(--app-success)', color: 'white' }}>
                  <BookmarkCheck className="w-4 h-4" />
                  Actif
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Main library card ── */}
        <div className="rounded-[20px] sm:rounded-[24px] border overflow-hidden" style={{ background: 'color-mix(in oklab, var(--app-surface) 96%, white 4%)', borderColor: 'color-mix(in oklab, var(--app-border) 78%, transparent)', boxShadow: '0 10px 32px -18px rgba(0,0,0,0.18)' }}>
          {/* tabs header */}
          <div className="px-5 sm:px-7 lg:px-8 py-5 sm:py-6 border-b" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 92%, var(--app-bg) 8%)' }}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-1 p-1 rounded-full w-fit border" style={{ background: 'color-mix(in oklab, var(--app-bg) 70%, var(--app-surface) 30%)', borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                {[
                  { id: 'packs', label: 'Packs', icon: Package, count: effectivePurchasedPackIds.length },
                  { id: 'videos', label: 'Vidéos', icon: PlayCircle, count: effectivePurchasedVideoIds.length },
                  { id: 'history', label: 'Historique', icon: ReceiptText, count: paymentSummary.total },
                ].map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full text-sm font-bold transition-all ${active ? 'shadow-sm' : 'hover:bg-[var(--app-surface)]'}`}
                      style={{ background: active ? 'var(--app-accent)' : 'transparent', color: active ? 'var(--app-accent-contrast)' : 'var(--app-muted)' }}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                      <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${active ? 'bg-white/20 text-white' : ''}`} style={!active ? { background: 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)', color: 'var(--app-accent)' } : undefined}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeTab === 'videos' && effectivePurchasedVideoIds.length > 0 && (
                <div className="flex items-center gap-2 w-full lg:w-auto">
                  <div className="relative flex-1 lg:w-[320px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--app-muted)' }} />
                    <input
                      type="text"
                      value={videoSearch}
                      onChange={(e) => setVideoSearch(e.target.value)}
                      placeholder="Rechercher une vidéo, spécialité…"
                      className="w-full pl-9 pr-9 py-2.5 rounded-full border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] focus:border-[var(--app-accent)] transition"
                      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    />
                    {videoSearch && (
                      <button onClick={() => setVideoSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--app-surface-2)] transition" style={{ color: 'var(--app-muted)' }}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {videoSearch && (
                    <span className="hidden sm:inline-flex text-xs font-semibold px-3 py-2 rounded-full border" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)', color: subtleText }}>
                      {filteredVideoIds.length} résultat{filteredVideoIds.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* content */}
          <div className="px-5 sm:px-7 lg:px-8 py-6 sm:py-7">
            <AnimatePresence mode="wait">
              {activeTab === 'packs' && (
                <motion.div key="packs" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  {effectivePurchasedPackIds.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                      {effectivePurchasedPackIds.map((packId) => {
                        const meta = PACK_META[packId.toLowerCase()] || { icon: '📚', desc: 'Pack spécialité', color: 'var(--app-accent)', sub: 'Contenu premium' };
                        return (
                          <motion.div key={packId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group relative rounded-2xl border p-5 sm:p-6 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col" style={{ background: 'color-mix(in oklab, var(--app-surface) 92%, white 8%)', borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: meta.color }} />
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg mb-4 border" style={{ background: `color-mix(in oklab, ${meta.color} 18%, var(--app-surface) 82%)`, borderColor: `color-mix(in oklab, ${meta.color} 26%, transparent)` }}>
                              <span>{meta.icon}</span>
                            </div>
                            <h3 className="text-[16px] font-bold leading-tight" style={{ color: 'var(--app-text)' }}>Pack {formatPackLabel(packId)}</h3>
                            <p className="text-xs font-semibold mt-1" style={{ color: meta.color }}>{meta.desc}</p>
                            <p className="text-xs mt-1 leading-relaxed" style={{ color: subtleText }}>{meta.sub}</p>
                            <div className="mt-4 flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `color-mix(in oklab, ${meta.color} 16%, var(--app-surface) 84%)`, color: meta.color }}>
                                <BadgeCheck className="w-3.5 h-3.5" />
                                Débloqué
                              </span>
                              <span className="text-[11px]" style={{ color: subtleText }}>Accès illimité • QCM inclus</span>
                            </div>
                            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                              {[
                                { icon: BookOpen, label: 'Cours' },
                                { icon: GraduationCap, label: 'QCM' },
                                { icon: Video, label: 'Cas' },
                              ].map((f) => (
                                <div key={f.label} className="rounded-xl border py-2 flex flex-col items-center gap-1" style={{ background: 'color-mix(in oklab, var(--app-bg) 60%, var(--app-surface) 40%)', borderColor: 'color-mix(in oklab, var(--app-border) 60%, transparent)' }}>
                                  <f.icon className="w-4 h-4" style={{ color: meta.color }} />
                                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: subtleText }}>{f.label}</span>
                                </div>
                              ))}
                            </div>
                            <Link href={`/specialties/${packId}`} className="mt-5 inline-flex items-center justify-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl hover:brightness-110 transition w-full" style={{ background: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}>
                              Accéder au contenu <ArrowRight className="w-4 h-4" />
                            </Link>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed p-8 sm:p-10 text-center" style={{ background: 'color-mix(in oklab, var(--app-bg) 70%, var(--app-surface) 30%)', borderColor: 'var(--app-border)' }}>
                      <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ background: 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)', color: 'var(--app-accent)' }}>
                        <Package className="w-7 h-7" />
                      </div>
                      <p className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Aucun pack acheté</p>
                      <p className="text-xs mt-1 max-w-sm mx-auto leading-relaxed" style={{ color: subtleText }}>Débloquez un pack par spécialité pour accéder à l&apos;intégralité des cours, QCM, schémas et cas cliniques.</p>
                      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                        <Link href="/pricing" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white hover:brightness-110 transition" style={{ background: 'var(--app-accent)' }}>
                          Voir les packs <ArrowRight className="w-4 h-4" />
                        </Link>
                        <Link href="/checkout" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border hover:bg-[var(--app-surface)] transition" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)', background: 'var(--app-surface)' }}>
                          <ShoppingBag className="w-4 h-4" />
                          Panier
                        </Link>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'videos' && (
                <motion.div key="videos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  {effectivePurchasedVideoIds.length > 0 ? (
                    filteredVideoIds.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                        {filteredVideoIds.map((videoId) => {
                          const v = purchasedVideosById[videoId] || {};
                          const title = (v.title && String(v.title).trim()) || `Vidéo ${videoId}`;
                          const durationLabel = formatVideoDuration(v);
                          const subspecialtyMeta = resolveSubspecialtyMeta(v.subspecialty || v.subspeciality || v.subspecialtyName);
                          const isBlocked = blockedVideoIdSet.has(videoId);
                          const thumbnailUrl = getVideoThumbnailUrl(v);
                          return (
                            <div key={videoId} className="group rounded-2xl border overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col" style={{ background: 'var(--app-surface)', borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                              <div className="relative aspect-video overflow-hidden bg-[var(--app-surface-2)]">
                                <Image src={thumbnailUrl || VIDEO_FALLBACK_SRC} alt={`Aperçu de ${title}`} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover group-hover:scale-[1.02] transition-transform duration-300" onError={(event) => applyImageFallback(event, VIDEO_FALLBACK_SRC)} />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                                {isBlocked ? (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/55 border border-white/30 text-white backdrop-blur">
                                      <Lock className="h-5 w-5" />
                                    </span>
                                  </div>
                                ) : (
                                  <Link href={`/videos/${videoId}`} aria-label={`Lire ${title}`} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-slate-900 border border-white shadow-lg hover:scale-105 transition-transform">
                                    <PlayCircle className="h-6 w-6" />
                                  </Link>
                                )}
                                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-full bg-black/70 text-white border border-white/20 backdrop-blur">
                                  <Clock3 className="w-3 h-3" />
                                  {durationLabel}
                                </span>
                                {isBlocked && <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[color-mix(in_oklab,var(--app-danger)_92%,black_8%)] text-white"><Lock className="w-3 h-3" /> Bloqué</span>}
                              </div>
                              <div className="p-4 flex-1 flex flex-col">
                                <h3 className="text-[14px] font-bold leading-tight line-clamp-2" style={{ color: 'var(--app-text)' }}>{title}</h3>
                                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                  {subspecialtyMeta.label && (
                                    <span className={`purchase-badge purchase-badge--specialty inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${subspecialtyMeta.tone !== 'default' ? `purchase-badge--specialty-${subspecialtyMeta.tone}` : ''}`}>
                                      {subspecialtyMeta.label}
                                    </span>
                                  )}
                                  {!isBlocked && <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: 'color-mix(in oklab, var(--app-success) 14%, var(--app-surface) 86%)', color: 'var(--app-success)' }}><BadgeCheck className="w-3 h-3" /> Débloqué</span>}
                                </div>
                                <div className="mt-4 flex gap-2">
                                  {isBlocked ? (
                                    <span className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-bold px-3 py-2 rounded-xl border text-center" style={{ borderColor: 'var(--app-border)', color: subtleText }}>
                                      <Lock className="w-4 h-4" />
                                      Indisponible
                                    </span>
                                  ) : (
                                    <Link href={`/videos/${videoId}`} className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-bold px-3 py-2 rounded-xl hover:brightness-110 transition" style={{ background: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}>
                                      <PlayCircle className="w-4 h-4" />
                                      Regarder
                                    </Link>
                                  )}
                                  {!isBlocked && (
                                    <Link href={`/videos/${videoId}`} className="inline-flex items-center justify-center w-10 h-10 rounded-xl border hover:bg-[var(--app-surface-2)] transition" style={{ borderColor: 'var(--app-border)', color: 'var(--app-muted)' }}>
                                      <ExternalLink className="w-4 h-4" />
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border p-8 text-center" style={{ background: 'color-mix(in oklab, var(--app-bg) 70%, var(--app-surface) 30%)', borderColor: 'var(--app-border)' }}>
                        <Search className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--app-muted)' }} />
                        <p className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Aucun résultat pour “{videoSearch}”</p>
                        <p className="text-xs mt-1" style={{ color: subtleText }}>Essayez un autre mot-clé ou effacez la recherche.</p>
                        <button onClick={() => setVideoSearch('')} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border hover:brightness-105 transition" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)', background: 'var(--app-surface)' }}>
                          <X className="w-4 h-4" />
                          Effacer la recherche
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="rounded-2xl border border-dashed p-8 sm:p-10 text-center" style={{ background: 'color-mix(in oklab, var(--app-bg) 70%, var(--app-surface) 30%)', borderColor: 'var(--app-border)' }}>
                      <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ background: 'color-mix(in oklab, var(--app-info) 12%, var(--app-surface) 88%)', color: 'var(--app-info)' }}>
                        <Video className="w-7 h-7" />
                      </div>
                      <p className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Aucune vidéo individuelle achetée</p>
                      <p className="text-xs mt-1 max-w-sm mx-auto leading-relaxed" style={{ color: subtleText }}>Les vidéos à l&apos;unité apparaîtront ici après approbation. Les packs débloquent automatiquement leurs vidéos.</p>
                      <Link href="/pricing" className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border hover:brightness-105 transition" style={{ borderColor: 'var(--app-accent)', color: 'var(--app-accent)', background: 'color-mix(in oklab, var(--app-accent) 8%, var(--app-surface) 92%)' }}>
                        Voir les offres <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  )}
                  {effectivePurchasedPackIds.length === 0 && effectivePurchasedVideoIds.length === 0 && (
                    <p className="text-center text-sm italic mt-6" style={{ color: subtleText }}>Aucun achat enregistré pour le moment.</p>
                  )}
                </motion.div>
              )}

              {activeTab === 'history' && (
                <motion.div key="history" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  {paymentRequests.length > 0 ? (
                    <div className="space-y-3">
                      {paymentRequests.map((payment) => (
                        <div key={payment.id} className="group rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:shadow-sm hover:-translate-y-px transition-all" style={{ background: 'var(--app-surface)', borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[14px] font-bold" style={{ color: 'var(--app-text)' }}>{payment.description}</p>
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-full border" style={{ background: payment.tone.bg, borderColor: payment.tone.border, color: payment.tone.text }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: payment.status === 'approved' ? 'var(--app-success)' : payment.status === 'rejected' ? 'var(--app-danger)' : 'var(--app-warning)' }} />
                                {payment.statusLabel}
                              </span>
                            </div>
                            <p className="text-xs mt-1 flex flex-wrap items-center gap-2" style={{ color: subtleText }}>
                              <span className="inline-flex items-center gap-1"><Clock3 className="w-3 h-3" />{payment.createdAtText}</span>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1"><CreditCard className="w-3 h-3" />{payment.methodLabel}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[16px] font-bold" style={{ color: 'var(--app-text)' }}>{payment.amount.toLocaleString('fr-DZ')} <span className="text-xs font-semibold" style={{ color: subtleText }}>DZD</span></span>
                            <span className="hidden sm:inline-flex w-8 h-8 rounded-xl items-center justify-center border" style={{ background: payment.tone.bg, borderColor: payment.tone.border, color: payment.tone.text }}>
                              {payment.status === 'approved' ? <CheckCircle2 className="w-4 h-4" /> : payment.status === 'rejected' ? <X className="w-4 h-4" /> : <Clock3 className="w-4 h-4" />}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="rounded-2xl border p-4 flex flex-wrap gap-3 text-xs font-semibold" style={{ background: 'color-mix(in oklab, var(--app-bg) 70%, var(--app-surface) 30%)', borderColor: 'var(--app-border)', color: subtleText }}>
                        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--app-text)' }} /> Total: {paymentSummary.total}</span>
                        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--app-success)' }} /> Approuvés: {paymentSummary.approved}</span>
                        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--app-danger)' }} /> Rejetés: {paymentSummary.rejected}</span>
                        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--app-warning)' }} /> En attente: {paymentSummary.pending}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed p-8 sm:p-10 text-center" style={{ background: 'color-mix(in oklab, var(--app-bg) 70%, var(--app-surface) 30%)', borderColor: 'var(--app-border)' }}>
                      <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ background: 'color-mix(in oklab, var(--app-warning) 12%, var(--app-surface) 88%)', color: 'var(--app-warning)' }}>
                        <ReceiptText className="w-7 h-7" />
                      </div>
                      <p className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Aucune demande de paiement</p>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: subtleText }}>Vos demandes apparaîtront ici après envoi du reçu depuis le panier. Elles passent en « Approuvé » après validation admin.</p>
                      <Link href="/checkout" className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white hover:brightness-110 transition" style={{ background: 'var(--app-accent)' }}>
                        <ShoppingBag className="w-4 h-4" />
                        Aller au panier
                      </Link>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* bottom CTA */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border p-4 sm:p-5 flex gap-3" style={{ background: 'color-mix(in oklab, var(--app-accent) 7%, var(--app-surface) 93%)', borderColor: 'color-mix(in oklab, var(--app-accent) 16%, var(--app-border) 84%)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--app-accent)', color: 'white' }}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Vous voulez débloquer plus ?</p>
              <p className="text-xs leading-relaxed" style={{ color: subtleText }}>Les packs donnent un accès illimité + tous les QCM et cas cliniques associés.</p>
              <Link href="/pricing" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold hover:underline" style={{ color: 'var(--app-accent)' }}>
                Comparer les offres <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border p-4 sm:p-5 flex gap-3" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'color-mix(in oklab, var(--app-info) 14%, var(--app-surface) 86%)', color: 'var(--app-info)' }}>
              <BookmarkCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Besoin d&apos;aide ?</p>
              <p className="text-xs leading-relaxed" style={{ color: subtleText }}>Le support répond sous 24h. Vérifiez l&apos;historique de paiement pour le statut.</p>
              <Link href="/checkout" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold hover:underline" style={{ color: 'var(--app-accent)' }}>
                Gérer mon panier <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
