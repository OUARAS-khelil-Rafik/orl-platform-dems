'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'motion/react';
import { Clock3, Lock, PlayCircle, ReceiptText, ShoppingBag } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/components/providers/auth-provider';
import { collection, db, doc, getDoc, getDocs, query, where } from '@/lib/data/local-data';
import { VIDEO_FALLBACK_SRC, applyImageFallback } from '@/lib/utils/media-fallback';

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

const normalizeUniqueIdList = (source: unknown): string[] => {
  if (!Array.isArray(source)) {
    return [];
  }

  return Array.from(
    new Set(source.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)),
  );
};

const normalizePaymentStatus = (status: unknown): PaymentStatus => {
  const value = String(status || '').toLowerCase();
  if (value === 'approved') return 'approved';
  if (value === 'rejected') return 'rejected';
  return 'pending';
};

const formatPackLabel = (packId: string) => {
  const normalized = packId.trim().toLowerCase();
  if (!normalized) {
    return 'Pack inconnu';
  }

  if (PACK_LABELS[normalized]) {
    return PACK_LABELS[normalized];
  }

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
    if (pathTokens.length > 1 && pathTokens[0].includes(',')) {
      pathAfterUpload = pathTokens.slice(1).join('/');
    }
  }

  const jpgPath = /\.[a-z0-9]+$/i.test(pathAfterUpload)
    ? pathAfterUpload.replace(/\.[a-z0-9]+$/i, '.jpg')
    : `${pathAfterUpload}.jpg`;

  const safeSecond = Math.max(0, Math.floor(secondMark));
  return `${uploadBase}so_${safeSecond},c_fill,g_auto,ar_16:9,w_960,f_jpg,q_auto/${jpgPath}`;
};

const getVideoThumbnailUrl = (video: PurchasedVideoData, secondMark = 60) => {
  const explicitThumbnail = String(video.thumbnailUrl || '').trim();
  if (explicitThumbnail.length > 0) {
    return explicitThumbnail;
  }

  const firstPartUrl = Array.isArray(video.parts)
    ? String(video.parts.find((part) => typeof part?.secureUrl === 'string' && part.secureUrl.trim().length > 0)?.secureUrl || '').trim()
    : '';
  const primaryUrl = String(video.url || firstPartUrl || '').trim();
  if (!primaryUrl) {
    return null;
  }

  const cloudinaryThumb = buildCloudinaryVideoThumbnailUrl(primaryUrl, secondMark);
  if (cloudinaryThumb) {
    return cloudinaryThumb;
  }

  const youtubeId = extractYouTubeVideoId(primaryUrl);
  if (youtubeId) {
    return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  }

  return null;
};

export default function PurchasesPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [purchasedVideosById, setPurchasedVideosById] = useState<Record<string, PurchasedVideoData>>({});
  const [loading, setLoading] = useState(true);

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

  const tileStyle = {
    background: isLightMode
      ? 'color-mix(in oklab, var(--app-bg) 90%, var(--app-surface-2) 10%)'
      : 'color-mix(in oklab, var(--app-surface-2) 86%, var(--app-deep-surface) 14%)',
    borderColor: isLightMode
      ? 'color-mix(in oklab, var(--app-border) 90%, var(--app-surface) 10%)'
      : 'color-mix(in oklab, var(--app-border) 86%, var(--app-deep-surface-2) 14%)',
  };

  const subtleText = 'color-mix(in oklab, var(--app-text) 78%, var(--app-muted) 22%)';

  const pageBackground = isLightMode
    ? 'radial-gradient(130% 120% at 18% 18%, color-mix(in oklab, var(--app-accent) 2%, transparent 98%), color-mix(in oklab, var(--app-bg) 98%, transparent 2%))'
    : 'radial-gradient(130% 120% at 18% 18%, color-mix(in oklab, var(--app-accent) 4%, transparent 96%), color-mix(in oklab, var(--app-bg) 96%, transparent 4%))';

  const purchasedVideosFromProfile = useMemo(() => normalizeUniqueIdList(profile?.purchasedVideos), [profile?.purchasedVideos]);
  const purchasedPacksFromProfile = useMemo(() => normalizeUniqueIdList(profile?.purchasedPacks), [profile?.purchasedPacks]);
  const blockedVideoIdSet = useMemo(
    () => new Set(normalizeUniqueIdList(profile?.blockedVideoIds)),
    [profile?.blockedVideoIds],
  );

  const approvedPurchasesFromPayments = useMemo(() => {
    const videoIds = new Set<string>();
    const packIds = new Set<string>();

    payments.forEach((payment) => {
      if (normalizePaymentStatus(payment.status) !== 'approved') {
        return;
      }

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
          if (item?.type === 'video' && typeof item.id === 'string' && item.id.trim().length > 0) {
            videoIds.add(item.id.trim());
          }

          if (item?.type === 'pack' && typeof item.id === 'string' && item.id.trim().length > 0) {
            packIds.add(item.id.trim());
          }
        });
      }
    });

    return {
      videoIds: Array.from(videoIds),
      packIds: Array.from(packIds),
    };
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
    if (!authLoading && !user) {
      router.push('/sign-in');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    const fetchHistory = async () => {
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
    };

    if (!authLoading) {
      fetchHistory();
    }
  }, [authLoading, user]);

  useEffect(() => {
    const loadPurchasedVideoData = async () => {
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
    };

    loadPurchasedVideoData();
  }, [effectivePurchasedVideoIds]);

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
          if (!Number.isFinite(value) || value <= 0) {
            return sum;
          }
          return sum + value;
        }, 0)
      : 0;

    if (partsDurationSeconds > 0) {
      return formatAsHourMinute(Math.floor(partsDurationSeconds / 60));
    }

    if (typeof video.durationSeconds === 'number' && Number.isFinite(video.durationSeconds) && video.durationSeconds > 0) {
      return formatAsHourMinute(Math.floor(video.durationSeconds / 60));
    }

    if (typeof video.durationMinutes === 'number' && Number.isFinite(video.durationMinutes) && video.durationMinutes >= 0) {
      return formatAsHourMinute(video.durationMinutes);
    }

    const durationRaw = video?.duration;
    if (typeof durationRaw === 'number' && Number.isFinite(durationRaw)) {
      return formatAsHourMinute(durationRaw);
    }

    if (typeof durationRaw === 'string') {
      const s = durationRaw.trim().toLowerCase();
      if (s.length === 0) {
        return formatAsHourMinute(0);
      }

      const isoMatch = s.match(/^pt(?:(\d+(?:[\.,]\d+)?)h)?(?:(\d+(?:[\.,]\d+)?)m)?(?:(\d+(?:[\.,]\d+)?)s)?$/i);
      if (isoMatch) {
        const hours = Number((isoMatch[1] || '0').replace(',', '.'));
        const minutes = Number((isoMatch[2] || '0').replace(',', '.'));
        const seconds = Number((isoMatch[3] || '0').replace(',', '.'));
        const totalMinutes = (Number.isFinite(hours) ? hours * 60 : 0)
          + (Number.isFinite(minutes) ? minutes : 0)
          + (Number.isFinite(seconds) ? Math.floor(seconds / 60) : 0);
        return formatAsHourMinute(totalMinutes);
      }

      if (s.includes(':')) {
        const parts = s.split(':').map((p) => Number(p.trim()));
        if (parts.every(Number.isFinite)) {
          if (parts.length === 3) {
            return formatAsHourMinute(Math.floor((parts[0] * 3600 + parts[1] * 60 + parts[2]) / 60));
          }
          if (parts.length === 2) {
            return formatAsHourMinute(Math.floor((parts[0] * 60 + parts[1]) / 60));
          }
          if (parts.length === 1) {
            return formatAsHourMinute(parts[0]);
          }
        }
      }

      const hoursMatch = s.match(/(\d+(?:[\.,]\d+)?)\s*h/);
      const minutesMatch = s.match(/(\d+(?:[\.,]\d+)?)\s*m(?:in)?/);
      const secondsMatch = s.match(/(\d+(?:[\.,]\d+)?)\s*s/);

      if (hoursMatch || minutesMatch || secondsMatch) {
        const hours = Number((hoursMatch?.[1] || '0').replace(',', '.'));
        const minutes = Number((minutesMatch?.[1] || '0').replace(',', '.'));
        const seconds = Number((secondsMatch?.[1] || '0').replace(',', '.'));
        const totalMinutes = (Number.isFinite(hours) ? hours * 60 : 0)
          + (Number.isFinite(minutes) ? minutes : 0)
          + (Number.isFinite(seconds) ? Math.floor(seconds / 60) : 0);
        return formatAsHourMinute(totalMinutes);
      }

      const asNum = Number(s.replace(',', '.'));
      if (Number.isFinite(asNum)) {
        return formatAsHourMinute(asNum);
      }
    }

    return formatAsHourMinute(0);
  };

  const resolveSubspecialtyMeta = (sub?: string) => {
    if (!sub || typeof sub !== 'string') {
      return { label: '', tone: 'default' as const };
    }

    const trimmed = sub.trim();
    if (!trimmed) {
      return { label: '', tone: 'default' as const };
    }

    const normalized = trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (normalized.includes('otolog')) {
      return { label: 'Otologie', tone: 'otologie' as const };
    }

    if (normalized.includes('rhino') || normalized.includes('sinuso')) {
      return { label: 'Rhinologie', tone: 'rhinologie' as const };
    }

    if (normalized.includes('laryngo') || normalized.includes('cervico')) {
      return { label: 'Laryngologie', tone: 'laryngologie' as const };
    }

    return {
      label: `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`,
      tone: 'default' as const,
    };
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
        const statusLabel = status === 'approved' ? 'Approuve' : status === 'rejected' ? 'Refuse' : 'En attente';
        const tone = STATUS_TONE[status] || STATUS_TONE.pending;
        const paymentType = String(payment?.type || '').toLowerCase();
        const items = Array.isArray(payment?.items) ? payment.items : [];

        const compactItemLabels = items
          .map((item) => {
            if (!item) return '';

            if (item.type === 'pack') {
              const packName = (item.title || '').trim() || formatPackLabel(String(item.id || ''));
              return `Pack ${packName}`;
            }

            if (item.type === 'video') {
              return (item.title || '').trim() || `Video ${String(item.id || '').trim()}`;
            }

            return (item.title || '').trim();
          })
          .filter((label) => label.length > 0);

        const description = (() => {
          if (paymentType === 'subscription') {
            const plan = String(payment?.plan || '').toLowerCase();
            return plan === 'yearly' ? 'Abonnement VIP Plus annuel' : 'Abonnement VIP Plus mensuel';
          }

          if (paymentType === 'pack') {
            const packId = String(payment?.targetId || '').trim();
            return `Pack ${formatPackLabel(packId)}`;
          }

          if (paymentType === 'video') {
            const title = (compactItemLabels[0] || '').trim();
            if (title) return title;
            return `Video ${String(payment?.targetId || '').trim() || '-'} `.trim();
          }

          if (paymentType === 'cart') {
            if (compactItemLabels.length === 0) return 'Panier';
            if (compactItemLabels.length <= 2) return compactItemLabels.join(', ');
            return `${compactItemLabels.slice(0, 2).join(', ')} +${compactItemLabels.length - 2}`;
          }

          return 'Achat';
        })();

        const createdAtText =
          typeof payment?.createdAt === 'string'
            ? new Date(payment.createdAt).toLocaleString('fr-FR')
            : 'Date inconnue';

        const methodRaw = String(payment?.method || '').toLowerCase();
        const methodLabel =
          methodRaw === 'virement'
            ? 'Virement'
            : methodRaw === 'baridimob'
              ? 'BaridiMob'
              : methodRaw
                ? methodRaw
                : 'Non precisee';

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

  const paymentSummary = useMemo(() => {
    return {
      total: paymentRequests.length,
      pending: paymentRequests.filter((entry) => entry.status === 'pending').length,
      approved: paymentRequests.filter((entry) => entry.status === 'approved').length,
      rejected: paymentRequests.filter((entry) => entry.status === 'rejected').length,
    };
  }, [paymentRequests]);

  if (authLoading || loading) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{
          background: pageBackground,
        }}
      >
        <div className="w-12 h-12 border-4 border-medical-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div
      className="flex-1 min-h-screen py-10"
      style={{
        background: pageBackground,
      }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border p-8" style={cardStyle}>
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--app-text)' }}>Mes Achats</h1>
              <p className="mt-1 text-sm" style={{ color: subtleText }}>
                Suivez vos contenus debloques et vos demandes de paiement.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
                <ShoppingBag className="h-3.5 w-3.5" />
                {effectivePurchasedPackIds.length} pack(s)
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
                <PlayCircle className="h-3.5 w-3.5" />
                {effectivePurchasedVideoIds.length} video(s)
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
                <ReceiptText className="h-3.5 w-3.5" />
                {paymentSummary.pending} en attente
              </span>
            </div>
          </div>

          <div className="space-y-8">
            <section>
              <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--app-text)' }}>Packs de specialites</h2>
              {effectivePurchasedPackIds.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {effectivePurchasedPackIds.map((packId) => (
                    <div key={packId} className="border rounded-xl p-6 transition-transform duration-200 hover:-translate-y-1" style={tileStyle}>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: 'color-mix(in oklab, var(--app-accent) 18%, var(--app-surface) 82%)', color: 'var(--app-text)' }}>
                        <PlayCircle className="h-6 w-6" />
                      </div>
                      <h3 className="font-bold mb-2" style={{ color: 'var(--app-text)' }}>Pack {formatPackLabel(packId)}</h3>
                      <Link
                        href={`/specialties/${packId}`}
                        className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg shadow-sm transition-transform duration-150 hover:-translate-y-0.5"
                        style={{
                          background: 'var(--app-accent)',
                          color: 'var(--app-accent-contrast)',
                        }}
                      >
                        Acceder au contenu
                        <span aria-hidden>→</span>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="italic" style={{ color: subtleText }}>Aucun pack achete.</p>
              )}
            </section>

            <section>
              <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--app-text)' }}>Videos individuelles</h2>
              {effectivePurchasedVideoIds.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {effectivePurchasedVideoIds.map((videoId) => {
                    const v = purchasedVideosById[videoId] || {};
                    const title = (v.title && String(v.title).trim()) || `Video ${videoId}`;
                    const durationLabel = formatVideoDuration(v);
                    const subspecialtyMeta = resolveSubspecialtyMeta(v.subspecialty || v.subspeciality || v.subspecialtyName);
                    const isBlocked = blockedVideoIdSet.has(videoId);
                    const thumbnailUrl = getVideoThumbnailUrl(v);

                    return (
                      <div key={videoId} className="border rounded-xl p-6 transition-transform duration-200 hover:-translate-y-1" style={tileStyle}>
                        <div className="relative aspect-video rounded-xl overflow-hidden mb-4 border" style={{ borderColor: 'var(--app-border)' }}>
                          <Image
                            src={thumbnailUrl || VIDEO_FALLBACK_SRC}
                            alt={`Apercu de ${title}`}
                            fill
                            sizes="(max-width: 768px) 100vw, 50vw"
                            className="object-cover"
                            onError={(event) => applyImageFallback(event, VIDEO_FALLBACK_SRC)}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

                          {isBlocked ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/45 border border-white/30 text-white">
                                <Lock className="h-5 w-5" />
                              </span>
                            </div>
                          ) : (
                            <Link
                              href={`/videos/${videoId}`}
                              aria-label={`Lire ${title}`}
                              title={`Lire ${title}`}
                              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/85 text-slate-900 border border-white/90 shadow-sm transition-transform hover:scale-105"
                            >
                              <PlayCircle className="h-6 w-6" />
                            </Link>
                          )}
                        </div>

                        <h3 className="font-bold mb-2 truncate" style={{ color: 'var(--app-text)' }}>
                          {title}
                        </h3>

                        <div className="flex items-center gap-2 mb-3">
                          <span className="purchase-badge purchase-badge--duration inline-flex items-center gap-2">
                            <Clock3 className="h-3.5 w-3.5" />
                            <span>{durationLabel}</span>
                          </span>

                          {subspecialtyMeta.label ? (
                            <span
                              className={`purchase-badge purchase-badge--specialty inline-flex items-center gap-2${
                                subspecialtyMeta.tone === 'default' ? '' : ` purchase-badge--specialty-${subspecialtyMeta.tone}`
                              }`}
                            >
                              <span>{subspecialtyMeta.label}</span>
                            </span>
                          ) : null}

                          {isBlocked ? (
                            <span className="purchase-badge inline-flex items-center gap-2 border border-rose-200 bg-rose-100 text-rose-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                              <Lock className="h-3.5 w-3.5" />
                              Acces bloque
                            </span>
                          ) : null}
                        </div>

                        {isBlocked ? (
                          <span className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--app-border)', color: subtleText }}>
                            Contenu temporairement indisponible
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="italic" style={{ color: subtleText }}>Aucune video individuelle achetee.</p>
              )}
            </section>

            {(!effectivePurchasedPackIds.length && !effectivePurchasedVideoIds.length) && (
              <p className="italic" style={{ color: subtleText }}>Aucun achat enregistre pour le moment.</p>
            )}

            <section>
              <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--app-text)' }}>Demandes et historique de paiement</h2>
              {paymentRequests.length > 0 ? (
                <div className="space-y-3">
                  {paymentRequests.map((payment) => (
                    <div key={payment.id} className="border rounded-xl p-4" style={tileStyle}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>{payment.description}</p>
                          <p className="text-xs" style={{ color: subtleText }}>
                            {payment.createdAtText} • Methode: {payment.methodLabel}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[var(--app-text)]">{payment.amount} DZD</span>
                          <span
                            className="text-xs font-semibold border px-2.5 py-1 rounded-full"
                            style={{
                              background: payment.tone.bg,
                              color: payment.tone.text,
                              borderColor: payment.tone.border,
                            }}
                          >
                            {payment.statusLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="italic" style={{ color: subtleText }}>Aucune demande de paiement.</p>
              )}

              {paymentRequests.length > 0 ? (
                <p className="mt-3 text-xs" style={{ color: subtleText }}>
                  Total: {paymentSummary.total} • Approuves: {paymentSummary.approved} • Rejetes: {paymentSummary.rejected} • En attente: {paymentSummary.pending}
                </p>
              ) : null}
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}