'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCart } from '@/components/providers/cart-provider';
import { useAuth } from '@/components/providers/auth-provider';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trash2,
  CreditCard,
  ShieldCheck,
  Loader2,
  ShoppingCart,
  PlayCircle,
  Lock,
  ReceiptText,
  Clock3,
  ShoppingBag,
  Upload,
  FileText,
  X,
  Copy,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Package,
  GraduationCap,
  Wallet,
  ArrowRight,
  BookOpen,
  Layers,
  BadgeCheck,
  Info,
  ExternalLink,
  Video,
  Building2,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { db, collection, addDoc, getDocs, query, where, getDoc, doc, uploadCloudinaryAsset, buildPaymentReceiptFolder } from '@/lib/api/client';
import { IMAGE_FALLBACK_SRC, VIDEO_FALLBACK_SRC, applyImageFallback } from '@/lib/utils/media-fallback';

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

const PACK_META: Record<string, { icon: string; desc: string; color: string }> = {
  otologie: { icon: '🦻', desc: "Pathologies de l'oreille", color: 'var(--specialty-otology)' },
  rhinologie: { icon: '👃', desc: 'Nez, sinus & fosses nasales', color: 'var(--specialty-rhinology)' },
  laryngologie: { icon: '🗣️', desc: 'Larynx, pharynx & cou', color: 'var(--specialty-laryngology)' },
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
      const totalMinutes =
        (Number.isFinite(hours) ? hours * 60 : 0) + (Number.isFinite(minutes) ? minutes : 0) + (Number.isFinite(seconds) ? Math.floor(seconds / 60) : 0);
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
      const totalMinutes =
        (Number.isFinite(hours) ? hours * 60 : 0) + (Number.isFinite(minutes) ? minutes : 0) + (Number.isFinite(seconds) ? Math.floor(seconds / 60) : 0);
      return formatAsHourMinute(totalMinutes);
    }
    const asNum = Number(s.replace(',', '.'));
    if (Number.isFinite(asNum)) return formatAsHourMinute(asNum);
  }
  return formatAsHourMinute(0);
};

export default function CheckoutPage() {
  const { items, removeItem, total, clearCart } = useCart();
  const { user, profile } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [purchasedVideosById, setPurchasedVideosById] = useState<Record<string, PurchasedVideoData>>({});
  const [isPurchasesLoading, setIsPurchasesLoading] = useState(true);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [paymentMethod, setPaymentMethod] = useState<'ccp' | 'baridimob'>('baridimob');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeLibraryTab, setActiveLibraryTab] = useState<'packs' | 'videos' | 'history'>('packs');

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
        const methodRaw = String(payment?.method || '').toLowerCase();
        const methodLabel =
          methodRaw === 'virement' ? 'Virement' : methodRaw === 'baridimob' ? 'BaridiMob' : methodRaw ? methodRaw : 'Non précisée';
        return {
          id: payment.id,
          status,
          statusLabel,
          tone,
          amount: Number(payment.amount || 0),
          description,
          createdAtText: typeof payment?.createdAt === 'string' ? new Date(payment.createdAt).toLocaleString('fr-FR') : 'Date inconnue',
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

  const fetchPayments = useCallback(async () => {
    if (!user) {
      setPayments([]);
      setIsPurchasesLoading(false);
      return;
    }
    try {
      setIsPurchasesLoading(true);
      const snap = await getDocs(query(collection(db, 'payments'), where('userId', '==', user.uid)));
      setPayments(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() } as PaymentRecord)));
    } catch (error) {
      console.error('Error fetching payments:', error);
      setPayments([]);
    } finally {
      setIsPurchasesLoading(false);
    }
  }, [user]);

  const loadPurchasedVideoData = useCallback(async () => {
    if (!user || effectivePurchasedVideoIds.length === 0) {
      setPurchasedVideosById({});
      return;
    }
    try {
      const entries = await Promise.all(
        effectivePurchasedVideoIds.map(async (videoId) => {
          const snap = await getDoc(doc(db, 'videos', videoId));
          if (!snap.exists()) return [videoId, null] as const;
          return [videoId, (snap.data() as PurchasedVideoData) || null] as const;
        }),
      );
      const nextMap = entries.reduce<Record<string, PurchasedVideoData>>((acc, [videoId, data]) => {
        if (data) acc[videoId] = data;
        return acc;
      }, {});
      setPurchasedVideosById(nextMap);
    } catch (error) {
      console.error('Error loading purchased video data:', error);
      setPurchasedVideosById({});
    }
  }, [user, effectivePurchasedVideoIds]);

  useEffect(() => {
    void fetchPayments();
  }, [fetchPayments]);
  useEffect(() => {
    void loadPurchasedVideoData();
  }, [loadPurchasedVideoData]);

  // realtime hook placeholder - keep polling via effect
  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchPayments();
      void loadPurchasedVideoData();
    }, 6000);
    return () => window.clearInterval(id);
  }, [fetchPayments, loadPurchasedVideoData]);

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
    } else setReceiptPreview(null);
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
      alert('Veuillez vous connecter pour procéder au paiement.');
      return;
    }
    if (items.length === 0) return;
    if (!total || total <= 0) {
      alert('Panier invalide (montant 0).');
      return;
    }
    if (!receiptFile) {
      alert('Veuillez joindre votre reçu de paiement (PDF ou image).');
      return;
    }
    setIsProcessing(true);
    setUploadProgress(0);
    try {
      const folder = buildPaymentReceiptFolder(profile.displayName, profile.email, user.uid);
      const resourceType = receiptFile.type === 'application/pdf' ? ('raw' as const) : ('image' as const);
      const uploaded = await uploadCloudinaryAsset(receiptFile, {
        folder,
        resourceType,
        fileName: `recu-${Date.now()}`,
        onProgress: setUploadProgress,
      });
      const paymentPayload = {
        userId: user.uid,
        userEmail: profile.email,
        userDisplayName: profile.displayName,
        amount: total,
        items: items.map((i) => ({ id: String(i.id), type: String(i.type), title: String(i.title || ''), price: Number(i.price || 0) })),
        status: 'pending',
        type: 'cart' as const,
        method: paymentMethod,
        receiptUrl: uploaded.secureUrl,
        receiptPublicId: uploaded.publicId,
        receiptResourceType: uploaded.resourceType,
        receiptFolder: folder,
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'payments'), paymentPayload);
      if (receiptPreview) try { URL.revokeObjectURL(receiptPreview); } catch {}
      setReceiptFile(null);
      setReceiptPreview(null);
      setUploadProgress(0);
      clearCart();
      setShowSuccess(true);
      void fetchPayments();
    } catch (error) {
      console.error('Checkout error:', error);
      const message = error instanceof Error ? error.message : 'Une erreur est survenue lors du paiement.';
      alert(message);
    } finally {
      setIsProcessing(false);
    }
  };

  // trust / stats
  const totalLibraryItems = effectivePurchasedPackIds.length + effectivePurchasedVideoIds.length;

  return (
    <div className="flex-1 py-6 sm:py-8" style={{ background: pageBackground }}>
      <div className="container mx-auto px-4 sm:px-6 max-w-[1160px]">
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
                  <Sparkles className="w-3 h-3" />
                  Paiement sécurisé • Validation sous 24h
                </div>
                <h1 className="text-[26px] sm:text-[30px] lg:text-[34px] font-bold tracking-tight leading-none" style={{ color: 'var(--app-text)', fontFamily: 'var(--font-display)' }}>
                  Panier & Mes Achats
                </h1>
                <p className="mt-2 text-[14px] sm:text-[15px] leading-relaxed max-w-[560px]" style={{ color: subtleText }}>
                  Finalisez votre commande et retrouvez instantanément tous vos contenus débloqués au même endroit.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold" style={{ borderColor: 'var(--app-border)', background: 'color-mix(in oklab, var(--app-surface) 92%, transparent)', color: 'var(--app-text)' }}>
                    <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--app-success)' }} />
                    Reçu Cloudinary sécurisé
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold" style={{ borderColor: 'var(--app-border)', background: 'color-mix(in oklab, var(--app-surface) 92%, transparent)', color: 'var(--app-text)' }}>
                    <BadgeCheck className="w-3.5 h-3.5" style={{ color: 'var(--app-accent)' }} />
                    Accès illimité après validation
                  </span>
                </div>
              </div>

              {/* quick stats in hero */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[380px]">
                {[
                  { label: 'Panier', value: `${items.length}`, sub: items.length === 1 ? 'article' : 'articles', icon: ShoppingCart, accent: 'var(--app-accent)' },
                  { label: 'Bibliothèque', value: `${totalLibraryItems}`, sub: 'contenus', icon: BookOpen, accent: 'var(--app-success)' },
                  { label: 'En attente', value: `${paymentSummary.pending}`, sub: 'paiements', icon: Clock3, accent: 'var(--app-warning)' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl border p-3 sm:p-4 text-center backdrop-blur" style={{ background: 'color-mix(in oklab, var(--app-surface) 88%, white 12%)', borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                    <div className="w-8 h-8 rounded-xl mx-auto flex items-center justify-center mb-2" style={{ background: `color-mix(in oklab, ${stat.accent} 18%, var(--app-surface) 82%)`, color: stat.accent }}>
                      <stat.icon className="w-4 h-4" />
                    </div>
                    <p className="text-xl sm:text-2xl font-bold leading-none" style={{ color: 'var(--app-text)' }}>{stat.value}</p>
                    <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide mt-1" style={{ color: subtleText }}>{stat.label}</p>
                    <p className="text-[10px]" style={{ color: subtleText }}>{stat.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Main grid : panier + checkout ── */}
        <div className="grid lg:grid-cols-[1.65fr_0.95fr] gap-6 lg:gap-7 items-start">
          {/* Cart column */}
          <div className="space-y-4 min-w-0">
            <div className="rounded-[20px] border overflow-hidden" style={{ background: 'color-mix(in oklab, var(--app-surface) 96%, white 4%)', borderColor: 'color-mix(in oklab, var(--app-border) 78%, transparent)', boxShadow: '0 10px 32px -18px rgba(0,0,0,0.18)' }}>
              {/* cart header */}
              <div className="px-5 sm:px-6 py-4 sm:py-5 border-b flex items-center justify-between gap-3" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 92%, var(--app-bg) 8%)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}>
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[16px] sm:text-[17px] font-bold leading-none" style={{ color: 'var(--app-text)' }}>Votre panier</h2>
                    <p className="text-xs mt-1" style={{ color: subtleText }}>
                      {items.length === 0 ? 'Aucun article pour le moment' : `${items.length} ${items.length > 1 ? 'articles sélectionnés' : 'article sélectionné'} • Total ${total.toLocaleString('fr-DZ')} DZD`}
                    </p>
                  </div>
                </div>
                {items.length > 0 && (
                  <button onClick={() => clearCart()} className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border hover:brightness-105 transition" style={{ borderColor: 'color-mix(in oklab, var(--app-danger) 30%, var(--app-border) 70%)', color: 'var(--app-danger)', background: 'color-mix(in oklab, var(--app-danger) 8%, var(--app-surface) 92%)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                    Vider
                  </button>
                )}
              </div>

              {items.length === 0 ? (
                <div className="px-6 sm:px-8 py-10 sm:py-12 text-center">
                  <div className="w-20 h-20 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)', border: '1px solid color-mix(in oklab, var(--app-accent) 18%, var(--app-border) 82%)' }}>
                    <ShoppingCart className="w-9 h-9" style={{ color: 'var(--app-accent)' }} />
                  </div>
                  <h3 className="text-[18px] font-bold" style={{ color: 'var(--app-text)' }}>Votre panier est vide</h3>
                  <p className="text-sm mt-1.5 max-w-sm mx-auto leading-relaxed" style={{ color: subtleText }}>
                    Parcourez les spécialités et ajoutez des packs ou vidéos pour construire votre préparation DEMS.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                    <Link href="/specialties/otologie" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white shadow-sm hover:brightness-110 transition" style={{ background: 'var(--app-accent)' }}>
                      Explorer Otologie <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link href="/pricing" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border hover:bg-[var(--app-surface-2)] transition" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)', background: 'var(--app-surface)' }}>
                      Voir les tarifs
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 60%, transparent)' }}>
                  {items.map((item) => (
                    <motion.div key={item.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className="p-4 sm:p-5 flex gap-4 group hover:bg-[color-mix(in_oklab,var(--app-surface-2)_45%,transparent)] transition-colors">
                      <div className="w-[92px] sm:w-[108px] h-[64px] sm:h-[72px] rounded-xl overflow-hidden shrink-0 border relative bg-[var(--app-surface-2)]" style={{ borderColor: 'var(--app-border)' }}>
                        {item.imageUrl ? (
                          <Image src={item.imageUrl} alt={item.title} width={108} height={72} className="w-full h-full object-cover" onError={(e) => applyImageFallback(e, item.type === 'video' ? VIDEO_FALLBACK_SRC : IMAGE_FALLBACK_SRC)} />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1" style={{ color: 'var(--app-muted)' }}>
                            {item.type === 'video' ? <Video className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                            <span className="text-[10px] font-bold uppercase tracking-wide">{item.type}</span>
                          </div>
                        )}
                        <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border backdrop-blur" style={{
                          background: item.type === 'pack' ? 'color-mix(in oklab, var(--app-accent) 92%, white 8%)' : 'color-mix(in oklab, var(--app-info) 88%, white 12%)',
                          color: 'white',
                          borderColor: 'rgba(255,255,255,0.5)',
                        }}>
                          {item.type === 'pack' ? 'PACK' : 'VIDÉO'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <h3 className="text-[14px] sm:text-[15px] font-bold leading-tight line-clamp-2" style={{ color: 'var(--app-text)' }}>{item.title}</h3>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border" style={{ background: 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)', borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)', color: 'var(--app-accent)' }}>
                            {item.type === 'pack' ? <Layers className="w-3 h-3" /> : <PlayCircle className="w-3 h-3" />}
                            {item.type === 'pack' ? formatPackLabel(item.id) : 'Cours vidéo'}
                          </span>
                          <span className="text-xs hidden sm:inline" style={{ color: subtleText }}>• Paiement unique</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end justify-between shrink-0 ml-2">
                        <p className="text-[16px] sm:text-[17px] font-bold tracking-tight" style={{ color: 'var(--app-text)' }}>{item.price.toLocaleString('fr-DZ')} <span className="text-xs font-semibold" style={{ color: subtleText }}>DZD</span></p>
                        <button onClick={() => removeItem(item.id)} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-full border hover:bg-[color-mix(in_oklab,var(--app-danger)_10%,var(--app-surface)_90%)] hover:text-[var(--app-danger)] hover:border-[color-mix(in_oklab,var(--app-danger)_28%,var(--app-border)_72%)] transition" style={{ borderColor: 'var(--app-border)', color: 'var(--app-muted)', background: 'var(--app-surface)' }} title="Retirer du panier">
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Retirer</span>
                        </button>
                      </div>
                    </motion.div>
                  ))}
                  {items.length > 0 && (
                    <div className="px-4 sm:px-5 py-3 flex justify-end sm:hidden">
                      <button onClick={() => clearCart()} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border" style={{ borderColor: 'color-mix(in oklab, var(--app-danger) 30%, var(--app-border) 70%)', color: 'var(--app-danger)', background: 'color-mix(in oklab, var(--app-danger) 8%, var(--app-surface) 92%)' }}>
                        <Trash2 className="w-3.5 h-3.5" /> Vider le panier
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Trust row under cart */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { icon: ShieldCheck, title: 'Validation admin', desc: 'Sous 24h ouvrées', color: 'var(--app-success)' },
                { icon: Wallet, title: 'Paiement tracé', desc: 'Reçu horodaté', color: 'var(--app-accent)' },
                { icon: GraduationCap, title: 'Accès illimité', desc: 'Après approbation', color: 'var(--app-info)' },
              ].map((f) => (
                <div key={f.title} className="rounded-2xl border p-3 flex items-center gap-3" style={{ background: 'color-mix(in oklab, var(--app-surface) 90%, white 10%)', borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in oklab, ${f.color} 16%, var(--app-surface) 84%)`, color: f.color }}>
                    <f.icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-none" style={{ color: 'var(--app-text)' }}>{f.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: subtleText }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Checkout summary - sticky */}
          <div className="lg:sticky lg:top-24 space-y-4">
            <div className="rounded-[20px] border overflow-hidden" style={{ background: 'color-mix(in oklab, var(--app-surface) 96%, white 4%)', borderColor: 'color-mix(in oklab, var(--app-border) 78%, transparent)', boxShadow: '0 14px 40px -20px rgba(0,0,0,0.22)' }}>
              <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--app-accent), color-mix(in oklab, var(--app-accent) 60%, var(--app-warning) 40%))' }} />
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in oklab, var(--app-accent) 16%, var(--app-surface) 84%)', color: 'var(--app-accent)', border: '1px solid color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)' }}>
                    <ReceiptText className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-[17px] font-bold leading-none" style={{ color: 'var(--app-text)' }}>Résumé de la commande</h2>
                    <p className="text-xs mt-1" style={{ color: subtleText }}>Détail et règlement sécurisé</p>
                  </div>
                </div>

                <div className="rounded-2xl border p-4 space-y-3" style={{ background: 'color-mix(in oklab, var(--app-bg) 70%, var(--app-surface) 30%)', borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: subtleText }}>Sous-total ({items.length} {items.length > 1 ? 'articles' : 'article'})</span>
                    <span className="font-semibold" style={{ color: 'var(--app-text)' }}>{total.toLocaleString('fr-DZ')} DZD</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: subtleText }}>Frais de traitement</span>
                    <span className="font-semibold" style={{ color: 'var(--app-success)' }}>0 DZD</span>
                  </div>
                  <div className="h-px" style={{ background: 'var(--app-border)' }} />
                  <div className="flex justify-between items-center">
                    <span className="text-[15px] font-bold" style={{ color: 'var(--app-text)' }}>Total à régler</span>
                    <span className="text-[20px] font-bold tracking-tight" style={{ color: 'var(--app-accent)' }}>{total.toLocaleString('fr-DZ')} <span className="text-sm font-bold">DZD</span></span>
                  </div>
                  <p className="text-[11px] leading-relaxed flex gap-1.5" style={{ color: subtleText }}>
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Montant en dinars algériens. Aucun frais caché.
                  </p>
                </div>

                {!user ? (
                  <div className="mt-5 rounded-2xl border p-4 flex gap-3" style={{ background: 'color-mix(in oklab, var(--app-warning) 10%, var(--app-surface) 90%)', borderColor: 'color-mix(in oklab, var(--app-warning) 28%, var(--app-border) 72%)' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'color-mix(in oklab, var(--app-warning) 18%, white 82%)', color: 'var(--app-warning)' }}>
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Connexion requise</p>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: subtleText }}>Connectez-vous pour finaliser votre commande et associer le reçu à votre compte.</p>
                      <Link href="/sign-in" className="mt-3 inline-flex items-center justify-center gap-2 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white hover:brightness-110 transition" style={{ background: 'var(--app-accent)' }}>
                        Se connecter <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Méthode */}
                    <div className="mt-5">
                      <p className="text-[13px] font-bold mb-2.5 flex items-center gap-1.5" style={{ color: 'var(--app-text)' }}>
                        <CreditCard className="w-4 h-4" style={{ color: 'var(--app-accent)' }} />
                        Méthode de paiement
                      </p>
                      <div className="grid grid-cols-2 gap-2.5">
                        {[
                          { id: 'baridimob', label: 'BaridiMob', sub: 'RIP instantané', icon: Building2 },
                          { id: 'ccp', label: 'CCP', sub: 'Virement Poste', icon: FileText },
                        ].map((m) => {
                          const active = paymentMethod === m.id;
                          return (
                            <button key={m.id} type="button" onClick={() => setPaymentMethod(m.id as any)} className={`relative text-left rounded-2xl border-2 p-3.5 transition-all ${active ? 'shadow-sm' : 'hover:border-[var(--app-border)]'}`} style={{
                              borderColor: active ? 'var(--app-accent)' : 'var(--app-border)',
                              background: active ? 'color-mix(in oklab, var(--app-accent) 10%, var(--app-surface) 90%)' : 'var(--app-surface)',
                            }}>
                              {active && <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--app-accent)', color: 'white' }}><CheckCircle2 className="w-3.5 h-3.5" /></span>}
                              <m.icon className="w-5 h-5 mb-1.5" style={{ color: active ? 'var(--app-accent)' : 'var(--app-muted)' }} />
                              <span className="block text-sm font-bold leading-none" style={{ color: 'var(--app-text)' }}>{m.label}</span>
                              <span className="block text-[11px] mt-1" style={{ color: subtleText }}>{m.sub}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Infos comptes */}
                    <AnimatePresence mode="wait">
                      {paymentMethod === 'baridimob' ? (
                        <motion.div key="baridi" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-4 rounded-2xl border p-4" style={{ background: 'color-mix(in oklab, var(--app-warning) 8%, var(--app-surface) 92%)', borderColor: 'color-mix(in oklab, var(--app-warning) 24%, var(--app-border) 76%)' }}>
                          <p className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 mb-3" style={{ color: 'var(--app-warning)' }}>
                            <Building2 className="w-4 h-4" /> BaridiMob — Informations de virement
                          </p>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 border bg-white/90" style={{ borderColor: 'color-mix(in oklab, var(--app-warning) 22%, var(--app-border) 78%)' }}>
                              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: subtleText }}>RIP</span>
                              <span className="font-mono text-sm font-bold flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                                00799999002821592660
                                <button type="button" onClick={() => copyToClipboard('00799999002821592660', 'rip')} className="w-7 h-7 rounded-lg flex items-center justify-center border hover:brightness-105 transition" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                                  {copiedField === 'rip' ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--app-success)' }} /> : <Copy className="w-4 h-4" style={{ color: 'var(--app-muted)' }} />}
                                </button>
                              </span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl px-3 py-2.5 border bg-white/90" style={{ borderColor: 'color-mix(in oklab, var(--app-warning) 22%, var(--app-border) 78%)' }}>
                              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: subtleText }}>Montant</span>
                              <span className="text-sm font-bold" style={{ color: 'var(--app-warning)' }}>{total.toLocaleString('fr-DZ')} DA</span>
                            </div>
                          </div>
                          <p className="text-[11px] mt-2.5 leading-relaxed" style={{ color: subtleText }}>Effectuez le virement via BaridiMob puis joignez le reçu ci-dessous. La validation est manuelle sous 24h.</p>
                        </motion.div>
                      ) : (
                        <motion.div key="ccp" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-4 rounded-2xl border p-4" style={{ background: 'color-mix(in oklab, var(--app-surface-2) 60%, var(--app-surface) 40%)', borderColor: 'var(--app-border)' }}>
                          <p className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 mb-3" style={{ color: 'var(--app-text)' }}>
                            <FileText className="w-4 h-4" /> CCP — Informations de virement
                          </p>
                          <div className="space-y-2">
                            {[
                              { k: 'Nom', v: 'OUARAS Khelil Rafik', field: 'ccp-nom', mono: false },
                              { k: 'N° Compte', v: '0028215926', field: 'ccp-compte', mono: true },
                              { k: 'Clé', v: '60', field: 'ccp-cle', mono: true },
                            ].map((row) => (
                              <div key={row.field} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 border" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                                <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: subtleText }}>{row.k}</span>
                                <span className={`text-sm font-bold flex items-center gap-2 ${row.mono ? 'font-mono' : ''}`} style={{ color: 'var(--app-text)' }}>
                                  {row.v}
                                  <button type="button" onClick={() => copyToClipboard(row.v, row.field)} className="w-7 h-7 rounded-lg flex items-center justify-center border hover:brightness-105 transition" style={{ background: 'var(--app-surface-2)', borderColor: 'var(--app-border)' }}>
                                    {copiedField === row.field ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--app-success)' }} /> : <Copy className="w-4 h-4" style={{ color: 'var(--app-muted)' }} />}
                                  </button>
                                </span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between rounded-xl px-3 py-2.5 border bg-white/90" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 18%, var(--app-border) 82%)' }}>
                              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: subtleText }}>Montant</span>
                              <span className="text-sm font-bold" style={{ color: 'var(--app-accent)' }}>{total.toLocaleString('fr-DZ')} DA</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Upload reçu */}
                    <div className="mt-5">
                      <label className="flex items-center gap-1.5 text-[13px] font-bold mb-2" style={{ color: 'var(--app-text)' }}>
                        <Upload className="w-4 h-4" style={{ color: 'var(--app-accent)' }} />
                        Reçu de paiement <span className="text-[var(--app-danger)]">*</span>
                        <span className="font-normal text-[11px] ml-1" style={{ color: subtleText }}>PDF ou image • max 10MB</span>
                      </label>
                      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleReceiptFileChange(e.target.files?.[0] || null)} />
                      {!receiptFile ? (
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed p-5 sm:p-6 flex flex-col items-center justify-center gap-2 hover:border-[var(--app-accent)] hover:bg-[color-mix(in_oklab,var(--app-accent)_6%,var(--app-surface)_94%)] transition-colors group">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform" style={{ background: 'color-mix(in oklab, var(--app-accent) 14%, var(--app-surface) 86%)', color: 'var(--app-accent)' }}>
                            <Upload className="w-6 h-6" />
                          </div>
                          <span className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Cliquez pour joindre votre reçu</span>
                          <span className="text-xs" style={{ color: subtleText }}>JPG, PNG, WEBP ou PDF — Glisser-déposer possible</span>
                        </button>
                      ) : (
                        <div className="rounded-2xl border p-3" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                          <div className="flex items-start gap-3">
                            <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border flex items-center justify-center" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface-2)' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {receiptPreview ? <img src={receiptPreview} alt="Aperçu reçu" className="w-full h-full object-cover" /> : <FileText className="w-6 h-6" style={{ color: 'var(--app-muted)' }} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate" style={{ color: 'var(--app-text)' }}>{receiptFile.name}</p>
                              <p className="text-xs" style={{ color: subtleText }}>{(receiptFile.size / 1024 / 1024).toFixed(2)} MB • {receiptFile.type || 'fichier'}</p>
                              {isProcessing && (
                                <div className="mt-2 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-surface-2)' }}>
                                  <div className="h-full rounded-full transition-all" style={{ width: `${uploadProgress}%`, background: 'var(--app-accent)' }} />
                                </div>
                              )}
                              {isProcessing && <p className="text-[11px] mt-1 font-medium" style={{ color: 'var(--app-accent)' }}>{uploadProgress}% uploadé</p>}
                            </div>
                            {!isProcessing && (
                              <button type="button" onClick={() => handleReceiptFileChange(null)} className="w-8 h-8 rounded-xl flex items-center justify-center border hover:bg-[color-mix(in_oklab,var(--app-danger)_10%,var(--app-surface)_90%)] hover:text-[var(--app-danger)] transition" style={{ borderColor: 'var(--app-border)', color: 'var(--app-muted)', background: 'var(--app-surface)' }}>
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          {!isProcessing && (
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-3 w-full rounded-xl border py-2 text-xs font-bold hover:brightness-105 transition" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)', color: 'var(--app-accent)', background: 'color-mix(in oklab, var(--app-accent) 8%, var(--app-surface) 92%)' }}>
                              Changer de fichier
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleCheckout}
                      disabled={isProcessing || items.length === 0 || !receiptFile}
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 font-bold text-[15px] shadow-sm hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                      style={{ background: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {uploadProgress > 0 && uploadProgress < 100 ? `Upload ${uploadProgress}%` : 'Envoi en cours…'}
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-5 h-5" />
                          Envoyer — {total.toLocaleString('fr-DZ')} DZD
                        </>
                      )}
                    </button>
                    <p className="mt-2 text-[11px] text-center leading-relaxed" style={{ color: subtleText }}>
                      Reçu stocké dans <span className="font-mono px-1 py-0.5 rounded text-[11px]" style={{ background: 'color-mix(in oklab, var(--app-surface-2) 80%, white 20%)', color: 'var(--app-muted)' }}>orl-platform/recu-paiement/…</span>
                    </p>
                  </>
                )}

                <div className="mt-4 flex items-center justify-center gap-2 text-xs rounded-xl border p-2.5" style={{ background: 'color-mix(in oklab, var(--app-success) 8%, var(--app-surface) 92%)', borderColor: 'color-mix(in oklab, var(--app-success) 18%, var(--app-border) 82%)', color: 'var(--app-success)' }}>
                  <ShieldCheck className="w-4 h-4" />
                  <span className="font-semibold">Validation manuelle par l&apos;admin sous 24h • Support réactif</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Mes Achats - section bibliothèque ── */}
        <section className="mt-8 sm:mt-10">
          <div className="rounded-[20px] sm:rounded-[24px] border overflow-hidden" style={{ background: 'color-mix(in oklab, var(--app-surface) 96%, white 4%)', borderColor: 'color-mix(in oklab, var(--app-border) 78%, transparent)', boxShadow: '0 10px 32px -18px rgba(0,0,0,0.18)' }}>
            {/* header */}
            <div className="px-5 sm:px-7 lg:px-8 py-6 sm:py-7 border-b" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 92%, var(--app-bg) 8%)' }}>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--app-accent)' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--app-accent)' }} />
                    Bibliothèque personnelle
                  </div>
                  <h2 className="text-[22px] sm:text-[26px] font-bold tracking-tight mt-1" style={{ color: 'var(--app-text)', fontFamily: 'var(--font-display)' }}>
                    Mes contenus débloqués
                  </h2>
                  <p className="text-sm mt-1 max-w-xl leading-relaxed" style={{ color: subtleText }}>
                    Retrouvez vos packs, vidéos et l&apos;historique de vos paiements. Tout est accessible dès validation admin.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { k: 'packs', label: 'Packs', count: effectivePurchasedPackIds.length, icon: Layers },
                    { k: 'videos', label: 'Vidéos', count: effectivePurchasedVideoIds.length, icon: PlayCircle },
                    { k: 'history', label: 'Paiements', count: paymentSummary.total, icon: ReceiptText, badge: paymentSummary.pending > 0 ? `${paymentSummary.pending} en attente` : undefined },
                  ].map((b) => (
                    <span key={b.k} className="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in oklab, var(--app-accent) 14%, var(--app-surface) 86%)', color: 'var(--app-accent)' }}>
                        <b.icon className="w-3.5 h-3.5" />
                      </span>
                      {b.label} <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold" style={{ background: 'color-mix(in oklab, var(--app-accent) 14%, var(--app-surface) 86%)', color: 'var(--app-accent)' }}>{b.count}</span>
                      {b.badge && <span className="hidden sm:inline text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in oklab, var(--app-warning) 18%, var(--app-surface) 82%)', color: 'var(--app-warning)' }}>{b.badge}</span>}
                    </span>
                  ))}
                </div>
              </div>

              {/* tabs */}
              <div className="mt-6 flex items-center gap-1 p-1 rounded-full w-fit border" style={{ background: 'color-mix(in oklab, var(--app-bg) 70%, var(--app-surface) 30%)', borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                {[
                  { id: 'packs', label: 'Packs', icon: Package, count: effectivePurchasedPackIds.length },
                  { id: 'videos', label: 'Vidéos', icon: PlayCircle, count: effectivePurchasedVideoIds.length },
                  { id: 'history', label: 'Historique', icon: ReceiptText, count: paymentSummary.total },
                ].map((tab) => {
                  const active = activeLibraryTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveLibraryTab(tab.id as any)}
                      className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full text-sm font-bold transition-all ${active ? 'shadow-sm' : 'hover:bg-[var(--app-surface)]'}`}
                      style={{
                        background: active ? 'var(--app-accent)' : 'transparent',
                        color: active ? 'var(--app-accent-contrast)' : 'var(--app-muted)',
                      }}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                      <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${active ? 'bg-white/20 text-white' : ''}`} style={!active ? { background: 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)', color: 'var(--app-accent)' } : undefined}>{tab.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* tab content */}
            <div className="px-5 sm:px-7 lg:px-8 py-6 sm:py-7">
              {!user ? (
                <div className="rounded-2xl border p-6 text-center" style={{ background: 'color-mix(in oklab, var(--app-bg) 80%, var(--app-surface) 20%)', borderColor: 'var(--app-border)' }}>
                  <Lock className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--app-muted)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>Connectez-vous</p>
                  <p className="text-xs mt-1" style={{ color: subtleText }}>Connectez-vous pour afficher vos achats et vos demandes de paiement.</p>
                </div>
              ) : isPurchasesLoading ? (
                <div className="flex items-center justify-center gap-3 py-12 text-sm" style={{ color: subtleText }}>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Chargement de vos achats…
                </div>
              ) : (
                <>
                  {activeLibraryTab === 'packs' && (
                    <div>
                      {effectivePurchasedPackIds.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                          {effectivePurchasedPackIds.map((packId) => {
                            const meta = PACK_META[packId.toLowerCase()] || { icon: '📚', desc: 'Pack spécialité', color: 'var(--app-accent)' };
                            return (
                              <motion.div key={packId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group relative rounded-2xl border p-5 sm:p-6 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all" style={{ background: 'color-mix(in oklab, var(--app-surface) 92%, white 8%)', borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: meta.color }} />
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg mb-4 border" style={{ background: `color-mix(in oklab, ${meta.color} 18%, var(--app-surface) 82%)`, borderColor: `color-mix(in oklab, ${meta.color} 26%, transparent)` }}>
                                  <span>{meta.icon}</span>
                                </div>
                                <h3 className="text-[15px] font-bold" style={{ color: 'var(--app-text)' }}>Pack {formatPackLabel(packId)}</h3>
                                <p className="text-xs mt-1" style={{ color: subtleText }}>{meta.desc}</p>
                                <div className="mt-4 flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `color-mix(in oklab, ${meta.color} 16%, var(--app-surface) 84%)`, color: meta.color }}>
                                    <BadgeCheck className="w-3.5 h-3.5" />
                                    Débloqué
                                  </span>
                                  <span className="text-[11px]" style={{ color: subtleText }}>Accès illimité</span>
                                </div>
                                <Link href={`/specialties/${packId}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl hover:brightness-110 transition w-full justify-center" style={{ background: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}>
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
                          <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: subtleText }}>Choisissez un pack par spécialité pour débloquer l&apos;intégralité des cours, QCM et cas cliniques.</p>
                          <Link href="/pricing" className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border hover:brightness-105 transition" style={{ borderColor: 'var(--app-accent)', color: 'var(--app-accent)', background: 'color-mix(in oklab, var(--app-accent) 8%, var(--app-surface) 92%)' }}>
                            Voir les packs <ArrowRight className="w-4 h-4" />
                          </Link>
                        </div>
                      )}
                    </div>
                  )}

                  {activeLibraryTab === 'videos' && (
                    <div>
                      {effectivePurchasedVideoIds.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                          {effectivePurchasedVideoIds.map((videoId) => {
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
                                  {isBlocked && <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[color-mix(in_oklab,var(--app-danger)_92%,black_8%)] text-white"><Lock className="w-3 h-3" /> Accès bloqué</span>}
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
                                      <span className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-bold px-3 py-2 rounded-xl border text-center" style={{ borderColor: 'var(--app-border)', color: subtleText, background: 'color-mix(in oklab, var(--app-surface-2) 60%, white 40%)' }}>
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
                        <div className="rounded-2xl border border-dashed p-8 sm:p-10 text-center" style={{ background: 'color-mix(in oklab, var(--app-bg) 70%, var(--app-surface) 30%)', borderColor: 'var(--app-border)' }}>
                          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ background: 'color-mix(in oklab, var(--app-info) 12%, var(--app-surface) 88%)', color: 'var(--app-info)' }}>
                            <Video className="w-7 h-7" />
                          </div>
                          <p className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Aucune vidéo individuelle achetée</p>
                          <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: subtleText }}>Les vidéos à l&apos;unité apparaîtront ici après approbation. Vous pouvez aussi acheter un pack complet.</p>
                        </div>
                      )}
                      {effectivePurchasedPackIds.length === 0 && effectivePurchasedVideoIds.length === 0 && (
                        <p className="text-center text-sm italic mt-6" style={{ color: subtleText }}>Aucun achat enregistré pour le moment.</p>
                      )}
                    </div>
                  )}

                  {activeLibraryTab === 'history' && (
                    <div>
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
                          <p className="text-xs mt-1" style={{ color: subtleText }}>Vos demandes apparaîtront ici après envoi du reçu. Elles passent en « Approuvé » après validation admin.</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* bottom help */}
        <div className="mt-6 rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" style={{ background: 'color-mix(in oklab, var(--app-accent) 7%, var(--app-surface) 93%)', borderColor: 'color-mix(in oklab, var(--app-accent) 16%, var(--app-border) 84%)' }}>
          <div className="flex gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--app-accent)', color: 'white' }}>
              <Info className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Besoin d&apos;aide pour le paiement ?</p>
              <p className="text-xs leading-relaxed" style={{ color: subtleText }}>Contactez le support ou consultez la page tarifs pour comparer les offres. Réponse sous 24h via chat support.</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 w-full sm:w-auto">
            <Link href="/pricing" className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border hover:brightness-105 transition" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
              Tarifs
            </Link>
            <Link href="/dashboard" className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white hover:brightness-110 transition" style={{ background: 'var(--app-accent)' }}>
              Support <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Success modal */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.94, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} className="rounded-[24px] p-7 sm:p-8 max-w-md w-full text-center shadow-2xl border overflow-hidden relative" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg, var(--app-success), var(--app-accent))' }} />
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'color-mix(in oklab, var(--app-success) 18%, var(--app-surface) 82%)', color: 'var(--app-success)', border: '1px solid color-mix(in oklab, var(--app-success) 26%, var(--app-border) 74%)' }}>
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h2 className="text-[22px] font-bold" style={{ color: 'var(--app-text)' }}>Demande envoyée !</h2>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: subtleText }}>
                Votre reçu a été envoyé et stocké dans <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in oklab, var(--app-surface-2) 80%, white 20%)' }}>orl-platform/recu-paiement</span>.
              </p>
              <p className="text-xs mt-2" style={{ color: subtleText }}>Un administrateur va vérifier votre paiement et activer votre accès sous 24h. Vous serez notifié.</p>
              <button onClick={() => setShowSuccess(false)} className="mt-6 w-full py-3 rounded-xl font-bold text-white hover:brightness-110 transition" style={{ background: 'var(--app-accent)' }}>
                Fermer
              </button>
              <Link href="/purchases" className="block mt-3 text-sm font-semibold hover:underline" style={{ color: 'var(--app-accent)' }}>
                Voir ma bibliothèque →
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
