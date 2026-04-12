'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'motion/react';
import { PlayCircle } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { collection, db, doc, getDoc, getDocs, query, where } from '@/lib/data/local-data';

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

export default function PurchasesPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [payments, setPayments] = useState<any[]>([]);
  const [purchasedVideosById, setPurchasedVideosById] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const uniquePurchasedVideoIds = useMemo(() => {
    const source = Array.isArray(profile?.purchasedVideos) ? profile.purchasedVideos : [];
    return Array.from(new Set(source));
  }, [profile?.purchasedVideos]);

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
      if (!user) return;
      try {
        const q = query(collection(db, 'payments'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        setPayments(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
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
      if (uniquePurchasedVideoIds.length === 0) {
        setPurchasedVideosById({});
        return;
      }

      try {
        const entries = await Promise.all(
          uniquePurchasedVideoIds.map(async (videoId) => {
            const snap = await getDoc(doc(db, 'videos', videoId));
            if (!snap.exists()) return [videoId, null] as const;

            const data = snap.data() as Record<string, any>;
            return [videoId, data || null] as const;
          }),
        );

        const nextMap = entries.reduce<Record<string, any>>((acc, [videoId, data]) => {
          if (data) acc[videoId] = data;
          return acc;
        }, {});

        setPurchasedVideosById(nextMap);
      } catch (error) {
        console.error('Error loading purchased video data:', error);
      }
    };

    loadPurchasedVideoData();
  }, [uniquePurchasedVideoIds]);

  const formatVideoDuration = (video: Record<string, any>): string => {
    const durationRaw = video?.duration ?? video?.durationMinutes ?? video?.durationSeconds;
    const minutesToLabel = (totalMinutes: number) => {
      const mins = Math.max(0, Math.floor(totalMinutes));
      const hours = Math.floor(mins / 60);
      const minutes = mins % 60;
      if (hours > 0 && minutes > 0) return `${hours}h ${minutes} min`;
      if (hours > 0 && minutes === 0) return `${hours}h`;
      return `${minutes} min`;
    };

    if (typeof durationRaw === 'string') {
      const s = durationRaw.trim();
      if (s.length === 0) return '0 min';
      if (s.includes(':')) {
        const parts = s.split(':').map((p) => Number(p));
        if (parts.every(Number.isFinite)) {
          let totalSeconds = 0;
          if (parts.length === 3) totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else if (parts.length === 2) totalSeconds = parts[0] * 60 + parts[1];
          else totalSeconds = Math.floor(parts[0]);
          return minutesToLabel(Math.floor(totalSeconds / 60));
        }
      }
      const asNum = Number(s);
      if (Number.isFinite(asNum)) return minutesToLabel(asNum);
      return s;
    }

    if (typeof durationRaw === 'number' && Number.isFinite(durationRaw)) {
      if (typeof video?.durationSeconds === 'number' && Number.isFinite(video.durationSeconds)) {
        const totalMinutes = Math.floor(video.durationSeconds / 60);
        return minutesToLabel(totalMinutes);
      }
      return minutesToLabel(durationRaw);
    }

    return '0 min';
  };

  const formatSubspecialtyLabel = (sub?: string) => {
    if (!sub || typeof sub !== 'string') return '';
    return sub.charAt(0).toUpperCase() + sub.slice(1);
  };

  const paymentRequests = useMemo(() => {
    return [...payments]
      .sort((a, b) => {
        const aTime = typeof a?.createdAt === 'string' ? new Date(a.createdAt).getTime() : 0;
        const bTime = typeof b?.createdAt === 'string' ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .map((payment) => {
        const status = String(payment?.status || 'pending').toLowerCase();
        const statusLabel = status === 'approved' ? 'Approuve' : status === 'rejected' ? 'Refuse' : 'En attente';
        const tone = STATUS_TONE[status] || STATUS_TONE.pending;

        const itemCount = Array.isArray(payment?.items) ? payment.items.length : 0;
        const description =
          payment?.type === 'subscription'
            ? `Abonnement ${payment?.plan || ''}`.trim()
            : payment?.type === 'pack'
              ? `Pack ${payment?.targetId || ''}`.trim()
              : itemCount > 0
                ? `${itemCount} article(s)`
                : 'Achat';

        const createdAtText =
          typeof payment?.createdAt === 'string'
            ? new Date(payment.createdAt).toLocaleString('fr-FR')
            : 'Date inconnue';

        return {
          id: String(payment?.id || Math.random()),
          statusLabel,
          tone,
          amount: Number(payment?.amount || 0),
          description,
          createdAtText,
        };
      });
  }, [payments]);

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
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--app-text)' }}>Mes Achats</h1>
          </div>

          <div className="space-y-8">
            <section>
              <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--app-text)' }}>Packs de specialites</h2>
              {profile.purchasedPacks && profile.purchasedPacks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {profile.purchasedPacks.map((packId: string) => (
                    <div key={packId} className="border rounded-xl p-6 transition-transform duration-200 hover:-translate-y-1" style={tileStyle}>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: 'color-mix(in oklab, var(--app-accent) 18%, var(--app-surface) 82%)', color: 'var(--app-text)' }}>
                        <PlayCircle className="h-6 w-6" />
                      </div>
                      <h3 className="font-bold mb-2 capitalize" style={{ color: 'var(--app-text)' }}>Pack {packId}</h3>
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
              {uniquePurchasedVideoIds.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {uniquePurchasedVideoIds.map((videoId: string) => {
                    const v = purchasedVideosById[videoId] || {};
                    const title = (v.title && String(v.title).trim()) || `Video ${videoId}`;
                    const durationLabel = formatVideoDuration(v);
                    const subspecialtyLabel = formatSubspecialtyLabel(v.subspecialty || v.subspeciality || v.subspecialtyName);

                    return (
                      <div key={videoId} className="border rounded-xl p-6 transition-transform duration-200 hover:-translate-y-1" style={tileStyle}>
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: 'color-mix(in oklab, var(--app-info) 18%, var(--app-surface) 82%)', color: 'var(--app-text)' }}>
                          <PlayCircle className="h-6 w-6" />
                        </div>
                        <h3 className="font-bold mb-2 truncate" style={{ color: 'var(--app-text)' }}>
                          {title}
                        </h3>

                        <div className="flex items-center gap-2 mb-3">
                          <span className="purchase-badge purchase-badge--duration inline-flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" className="text-sm"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
                            <span>{durationLabel}</span>
                          </span>

                          {subspecialtyLabel ? (
                            <span className="purchase-badge purchase-badge--specialty inline-flex items-center gap-2">
                              <span>{subspecialtyLabel}</span>
                            </span>
                          ) : null}
                        </div>

                        <Link
                          href={`/videos/${videoId}`}
                          className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg shadow-sm transition-transform duration-150 hover:-translate-y-0.5"
                          style={{
                            background: 'var(--app-accent)',
                            color: 'var(--app-accent-contrast)',
                          }}
                        >
                          Regarder la video
                          <span aria-hidden>→</span>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="italic" style={{ color: subtleText }}>Aucune video individuelle achetee.</p>
              )}
            </section>

            {(!profile.purchasedPacks?.length && !uniquePurchasedVideoIds.length) && (
              <p className="italic" style={{ color: subtleText }}>Aucun achat enregistre pour le moment.</p>
            )}

            <section>
              <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--app-text)' }}>Demandes de paiement</h2>
              {paymentRequests.length > 0 ? (
                <div className="space-y-3">
                  {paymentRequests.map((payment) => (
                    <div key={payment.id} className="border rounded-xl p-4" style={tileStyle}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>{payment.description}</p>
                          <p className="text-xs" style={{ color: subtleText }}>{payment.createdAtText}</p>
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
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}