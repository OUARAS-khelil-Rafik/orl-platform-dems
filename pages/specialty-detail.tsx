'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { db, collection, query, where, getDocs } from '@/lib/local-data';
import { motion } from 'motion/react';
import { PlayCircle, Lock, Clock3, Search, SlidersHorizontal, ListChecks, Stethoscope, MessageSquare, Network } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { canAccessVideo } from '@/lib/access-control';
import { useCart } from '@/components/providers/cart-provider';
import Image from 'next/image';

interface Video {
  id: string;
  title: string;
  description: string;
  url: string;
  subspecialty: string;
  section: string;
  isFreeDemo: boolean;
  price: number;
  packId: string;
  duration?: string | number;
  durationMinutes?: number;
  durationSeconds?: number;
}

type VideoPaymentStatus = 'pending' | 'rejected';

type SectionFilter = 'all' | 'anatomie' | 'pathologie';

const VIEWED_VIDEOS_KEY = 'dems-viewed-videos-v1';

const formatSectionLabel = (section: string) =>
  section === 'anatomie' ? 'Anatomie' : section === 'pathologie' ? 'Pathologie' : 'Autre';

const getSectionBadgeClass = (section: string) => {
  if (section === 'anatomie') {
    return 'bg-cyan-500/90 text-white border-cyan-300/80';
  }

  if (section === 'pathologie') {
    return 'bg-amber-500/90 text-white border-amber-300/80';
  }

  return 'bg-slate-900/75 text-slate-100 border-white/20';
};

const formatVideoDuration = (video: Video): string => {
  const durationRaw = video.duration ?? video.durationMinutes ?? video.durationSeconds;

  // Helper to render minutes as "Xh Y min", "Xh" or "Y min" (always returns something)
  const minutesToLabel = (totalMinutes: number) => {
    const mins = Math.max(0, Math.floor(totalMinutes));
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes} min`;
    if (hours > 0 && minutes === 0) return `${hours}h`;
    return `${minutes} min`;
  };

  // If string, attempt to parse common patterns like "HH:MM:SS" or "MM:SS" or numeric string
  if (typeof durationRaw === 'string') {
    const s = durationRaw.trim();
    if (s.length === 0) return '0 min';

    // colon-delimited time
    if (s.includes(':')) {
      const parts = s.split(':').map(p => Number(p));
      if (parts.every(Number.isFinite)) {
        let totalSeconds = 0;
        if (parts.length === 3) {
          totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          totalSeconds = parts[0] * 60 + parts[1];
        } else {
          totalSeconds = Math.floor(parts[0]);
        }
        const totalMinutes = Math.floor(totalSeconds / 60);
        return minutesToLabel(totalMinutes);
      }
    }

    // try numeric parse (minutes)
    const asNum = Number(s);
    if (Number.isFinite(asNum)) {
      return minutesToLabel(asNum);
    }

    // fallback: return the raw string (but not empty)
    return s;
  }

  // If number: interpret as minutes by default. If it's likely seconds (durationSeconds), handled below.
  if (typeof durationRaw === 'number' && Number.isFinite(durationRaw)) {
    // If explicit durationSeconds provided on the model use it as seconds
    if (typeof video.durationSeconds === 'number' && Number.isFinite(video.durationSeconds)) {
      const totalMinutes = Math.floor(video.durationSeconds / 60);
      return minutesToLabel(totalMinutes);
    }

    // Otherwise interpret numeric as minutes
    return minutesToLabel(durationRaw);
  }

  // Default fallback: always show 0 min
  return '0 min';
};

const SPECIALTIES = {
  otologie: { title: 'Otologie', desc: 'Anatomie et pathologie de l\'oreille', color: 'from-amber-700 to-orange-500' },
  rhinologie: { title: 'Rhinologie & Sinusologie', desc: 'Fosses nasales et sinus', color: 'from-amber-800 to-amber-500' },
  laryngologie: { title: 'Laryngologie & Cervicologie', desc: 'Larynx, pharynx et cou', color: 'from-orange-700 to-amber-600' },
};

const SECTION_OPTIONS: Array<{ value: SectionFilter; label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'anatomie', label: 'Anatomie' },
  { value: 'pathologie', label: 'Pathologie' },
];

export default function SpecialtyPage() {
  const router = useRouter();
  const slugParam = router.query.slug;
  const slug = typeof slugParam === 'string' ? slugParam : '';
  const specialtyInfo = SPECIALTIES[slug as keyof typeof SPECIALTIES];
  
  const { user, profile, loading: authLoading } = useAuth();
  const { addItem, items } = useCart();
  const [videos, setVideos] = useState<Video[]>([]);
  const [videoNameFilter, setVideoNameFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');
  const [viewedVideoIds, setViewedVideoIds] = useState<string[]>([]);
  const [contentCounts, setContentCounts] = useState<Record<string, { qcm: number; cases: number; open: number; diagrams: number }>>({});
  const [videoPaymentStatusById, setVideoPaymentStatusById] = useState<Record<string, VideoPaymentStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVideoPaymentStatuses = async () => {
      if (!user) {
        setVideoPaymentStatusById({});
        return;
      }

      try {
        const paymentsSnap = await getDocs(query(collection(db, 'payments'), where('userId', '==', user.uid)));
        const latestByVideo = new Map<string, { status: VideoPaymentStatus | 'approved'; createdAt: number }>();

        paymentsSnap.docs.forEach((paymentDoc) => {
          const payment = paymentDoc.data() as Record<string, any>;
          const status = String(payment.status || '').toLowerCase();
          if (status !== 'pending' && status !== 'rejected' && status !== 'approved') return;

          const createdAtRaw = payment.createdAt;
          const createdAt = typeof createdAtRaw === 'string' ? new Date(createdAtRaw).getTime() : 0;
          const itemIds: string[] = [];

          if (Array.isArray(payment.items)) {
            payment.items.forEach((entry: any) => {
              if (entry?.type === 'video' && typeof entry.id === 'string') {
                itemIds.push(entry.id);
              }
            });
          }

          if (payment.type === 'video' && typeof payment.targetId === 'string') {
            itemIds.push(payment.targetId);
          }

          itemIds.forEach((videoId) => {
            const previous = latestByVideo.get(videoId);
            if (!previous || createdAt >= previous.createdAt) {
              latestByVideo.set(videoId, {
                status: status as VideoPaymentStatus | 'approved',
                createdAt,
              });
            }
          });
        });

        const nextStatuses: Record<string, VideoPaymentStatus> = {};
        latestByVideo.forEach((entry, videoId) => {
          if (entry.status === 'pending' || entry.status === 'rejected') {
            nextStatuses[videoId] = entry.status;
          }
        });

        setVideoPaymentStatusById(nextStatuses);
      } catch (error) {
        console.error('Error fetching video payment statuses:', error);
        setVideoPaymentStatusById({});
      }
    };

    fetchVideoPaymentStatuses();
  }, [user]);

  useEffect(() => {
    const fetchVideos = async () => {
      if (!router.isReady || !slug) return;
      try {
        const q = query(collection(db, 'videos'), where('subspecialty', '==', slug));
        const querySnapshot = await getDocs(q);
        const fetchedVideos = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Video));
        setVideos(fetchedVideos);
      } catch (error) {
        console.error('Error fetching videos:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchVideos();
  }, [slug, router.isReady]);

  useEffect(() => {
    if (!videos || videos.length === 0) return;

    const fetchCounts = async () => {
      const map: Record<string, { qcm: number; cases: number; open: number; diagrams: number }> = {};
      await Promise.all(videos.map(async (v) => {
        try {
          const [qcmSnap, caseSnap, openSnap, diagramSnap] = await Promise.all([
            getDocs(query(collection(db, 'qcms'), where('videoId', '==', v.id))),
            getDocs(query(collection(db, 'clinicalCases'), where('videoId', '==', v.id))),
            getDocs(query(collection(db, 'openQuestions'), where('videoId', '==', v.id))),
            getDocs(query(collection(db, 'diagrams'), where('videoId', '==', v.id))),
          ]);

          map[v.id] = {
            qcm: Array.isArray(qcmSnap.docs) ? qcmSnap.docs.length : 0,
            cases: Array.isArray(caseSnap.docs) ? caseSnap.docs.length : 0,
            open: Array.isArray(openSnap.docs) ? openSnap.docs.length : 0,
            diagrams: Array.isArray(diagramSnap.docs) ? diagramSnap.docs.length : 0,
          };
        } catch (e) {
          map[v.id] = { qcm: 0, cases: 0, open: 0, diagrams: 0 };
        }
      }));

      setContentCounts(map);
    };

    fetchCounts();
  }, [videos]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const readViewed = () => {
      try {
        const raw = window.localStorage.getItem(VIEWED_VIDEOS_KEY);
        if (!raw) {
          setViewedVideoIds([]);
          return;
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
          setViewedVideoIds([]);
          return;
        }

        const normalized = parsed
          .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          .map((entry) => entry.trim());

        setViewedVideoIds(normalized);
      } catch {
        setViewedVideoIds([]);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === VIEWED_VIDEOS_KEY) {
        readViewed();
      }
    };

    readViewed();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', readViewed);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', readViewed);
    };
  }, []);

  if (!router.isReady) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-medical-200 border-t-medical-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!specialtyInfo) {
    return <div className="p-20 text-center text-2xl">Spécialité introuvable</div>;
  }

  const hasAccess = (video: Video) => canAccessVideo(video, profile);

  const trimmedNameFilter = videoNameFilter.trim();

  // Build a RegExp from the user input. If the regex is invalid,
  // fall back to a case-insensitive substring match to avoid breaking the UI.
  let nameRegex: RegExp | null = null;
  if (trimmedNameFilter.length > 0) {
    try {
      nameRegex = new RegExp(trimmedNameFilter, 'i');
    } catch (err) {
      // invalid regex: keep nameRegex as null and fallback to substring matching
      console.warn('Invalid video name RegExp:', trimmedNameFilter);
      nameRegex = null;
    }
  }

  const normalizedFilter = trimmedNameFilter.toLowerCase();

  const filteredVideos = videos.filter((video) => {
    if (trimmedNameFilter.length > 0) {
      if (nameRegex) {
        if (!nameRegex.test(video.title)) {
          return false;
        }
      } else {
        // fallback: substring match
        if (!video.title.toLowerCase().includes(normalizedFilter)) {
          return false;
        }
      }
    }

    if (sectionFilter !== 'all' && video.section !== sectionFilter) {
      return false;
    }

    return true;
  });

  const filteredDemoCount = filteredVideos.filter((video) => video.isFreeDemo).length;
  const filteredUnlockedCount = filteredVideos.filter((video) => hasAccess(video)).length;
  const filteredViewedCount = filteredVideos.filter((video) => viewedVideoIds.includes(video.id)).length;

  const getLockedVideoAction = (video: Video, isInCart: boolean) => {
    const paymentStatus = videoPaymentStatusById[video.id];

    if (!user) {
      return {
        label: 'Débloquer',
        onClick: () => router.push(`/sign-in?redirect=${encodeURIComponent(`/specialties/${slug}`)}`),
      };
    }

    if (isInCart) {
      return {
        label: 'Aller au panier',
        onClick: () => router.push('/checkout'),
      };
    }

    if (paymentStatus === 'pending') {
      return {
        label: 'Aller a la liste des achats',
        onClick: () => router.push('/purchases'),
      };
    }

    if (paymentStatus === 'rejected') {
      return {
        label: 'Recommencer l\'achat',
        onClick: () =>
          addItem({
            id: video.id,
            title: video.title,
            price: video.price,
            type: 'video',
            imageUrl: '',
          }),
      };
    }

    return {
      label: 'Débloquer',
      onClick: () =>
        addItem({
          id: video.id,
          title: video.title,
          price: video.price,
          type: 'video',
          imageUrl: '',
        }),
    };
  };

  return (
    <div className="flex-1 pb-24" style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 94%, white 6%) 0%, color-mix(in oklab, var(--app-surface-alt) 76%, var(--app-accent) 24%) 100%)' }}>
      {/* Header */}
      <div
        className={`relative overflow-hidden bg-gradient-to-r ${specialtyInfo.color} py-20`}
        style={{
          color: 'var(--hero-title)',
          backgroundImage: `linear-gradient(145deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)`,
        }}
      >
        <div className="absolute inset-0" style={{ background: 'var(--hero-overlay)' }} />
        <div className="absolute -top-24 -right-16 w-80 h-80 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 34%, transparent)' }} />
        <div className="absolute -bottom-24 left-0 w-72 h-72 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 22%, transparent)' }} />

        <div className="container mx-auto px-4 relative z-10">
          <div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl font-bold mb-4"
            >
              {specialtyInfo.title}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg md:text-xl"
              style={{ color: 'var(--hero-body)' }}
            >
              {specialtyInfo.desc}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="mt-6 flex flex-wrap gap-2 text-xs font-semibold"
            >
              <span className="inline-flex items-center rounded-full border px-3 py-1" style={{ backgroundColor: 'var(--hero-chip-bg)', borderColor: 'var(--hero-chip-border)', color: 'var(--hero-chip-text)' }}>
                {filteredVideos.length} videos ciblees
              </span>
              <span className="inline-flex items-center rounded-full border px-3 py-1" style={{ backgroundColor: 'var(--hero-chip-bg)', borderColor: 'var(--hero-chip-border)', color: 'var(--hero-chip-text)' }}>
                {filteredDemoCount} demos gratuites
              </span>
              <span className="inline-flex items-center rounded-full border px-3 py-1" style={{ backgroundColor: 'var(--hero-chip-bg)', borderColor: 'var(--hero-chip-border)', color: 'var(--hero-chip-text)' }}>
                {filteredUnlockedCount} accessibles
              </span>
              <span className="inline-flex items-center rounded-full border px-3 py-1" style={{ backgroundColor: 'var(--hero-chip-bg)', borderColor: 'var(--hero-chip-border)', color: 'var(--hero-chip-text)' }}>
                {filteredViewedCount} deja vues
              </span>
            </motion.div>
          </div>
          
        </div>
      </div>

      <div className="container mx-auto px-4 mt-12">
        {loading || authLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-medical-200 border-t-medical-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-16">
            <div className="rounded-3xl border p-5 md:p-6 shadow-md" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)', background: 'linear-gradient(140deg, color-mix(in oklab, var(--app-surface) 94%, white 6%) 0%, color-mix(in oklab, var(--app-surface-alt) 72%, var(--app-accent) 28%) 100%)' }}>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                <div className="lg:col-span-8">
                  <label htmlFor="video-name-filter" className="text-sm font-semibold text-slate-700 mb-2 inline-flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Filtre par nom vidéo
                  </label>
                  <input
                    id="video-name-filter"
                    type="text"
                    value={videoNameFilter}
                    onChange={(e) => setVideoNameFilter(e.target.value)}
                    placeholder="Ex: Anatomie de l'oreille moyenne, Otite moyenne, Laryngite, ..."
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>

                <div className="lg:col-span-4">
                  <label htmlFor="section-filter" className="text-sm font-semibold text-slate-700 mb-2 inline-flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filtre sous-specialite
                  </label>
                  <select
                    id="section-filter"
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value as SectionFilter)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  >
                    {SECTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="inline-flex items-center rounded-full bg-white border border-slate-200 px-3 py-1 text-slate-700">
                  {filteredVideos.length} videos affichees
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-emerald-700">
                  {filteredVideos.filter((video) => video.isFreeDemo).length} demos
                </span>
                <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-blue-700">
                  {filteredVideos.filter((video) => viewedVideoIds.includes(video.id)).length} deja vues
                </span>
                <span className="inline-flex items-center rounded-full bg-medical-50 border border-medical-200 px-3 py-1 text-medical-700">
                  {filteredUnlockedCount} accessibles maintenant
                </span>
              </div>
            </div>

            <section>
              {filteredVideos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                  Aucune vidéo disponible pour le moment.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredVideos.map((video, i) => (
                    (() => {
                      const isInCart = items.some((item) => item.id === video.id);
                      const action = getLockedVideoAction(video, isInCart);

                      return (
                    <VideoCard
                      key={video.id}
                      video={video}
                      hasAccess={hasAccess(video)}
                      isViewed={viewedVideoIds.includes(video.id)}
                      counts={contentCounts[video.id] ?? { qcm: 0, cases: 0, open: 0, diagrams: 0 }}
                      role={profile?.role}
                      isInCart={isInCart}
                      lockActionLabel={action.label}
                      onUnlock={action.onClick}
                      index={i}
                    />
                      );
                    })()
                  ))}
                </div>
              )}
            </section>

          </div>
        )}
      </div>
    </div>
  );
}

function VideoCard({
  video,
  hasAccess,
  isViewed,
  counts,
  role,
  isInCart,
  lockActionLabel,
  onUnlock,
  index,
}: {
  video: Video;
  hasAccess: boolean;
  isViewed: boolean;
  counts: { qcm: number; cases: number; open: number; diagrams: number };
  role?: 'admin' | 'user' | 'vip' | 'vip_plus';
  isInCart: boolean;
  lockActionLabel: string;
  onUnlock: () => void;
  index: number;
}) {
  const statusLabel = video.isFreeDemo
    ? 'Démo Gratuite'
    : hasAccess
      ? role === 'vip_plus'
        ? 'VIP Plus Débloquée'
        : 'Débloquée'
      : 'Bloquée';

  const statusClass = video.isFreeDemo
    ? 'bg-emerald-500'
    : hasAccess
      ? 'bg-medical-500'
      : 'bg-slate-900/80';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 group flex flex-col"
    >
      <div className="aspect-video relative bg-slate-900 overflow-hidden">
        <Image
          src={`https://picsum.photos/seed/${video.id}/640/360`}
          alt={video.title}
          fill
          className="object-cover opacity-60 group-hover:opacity-80 transition-opacity"
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span
            className={`text-[10px] sm:text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wider backdrop-blur-sm border ${getSectionBadgeClass(video.section)}`}
          >
            {formatSectionLabel(video.section)}
          </span>
          <span
            className={`text-[10px] sm:text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wider backdrop-blur-sm border ${
              isViewed
                ? 'bg-emerald-500/85 text-white border-emerald-300/70'
                : 'bg-slate-900/70 text-slate-100 border-white/20'
            }`}
          >
            {isViewed ? 'Deja vue' : 'Non vue'}
          </span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          {hasAccess ? (
            <Link
              href={`/videos/${video.id}`}
              aria-label={`Ouvrir le contenu de ${video.title}`}
              className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-white/70"
            >
              <PlayCircle className="h-8 w-8 text-white" />
            </Link>
          ) : (
            <div className="w-14 h-14 rounded-full bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
              <Lock className="h-6 w-6 text-slate-300" />
            </div>
          )}
        </div>
        <div
          className={`absolute top-3 right-3 text-white text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wider ${statusClass}`}
        >
          {statusLabel}
        </div>
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2">{video.title}</h3>
        <p className="text-sm text-slate-500 mb-4 line-clamp-2 flex-1">{video.description}</p>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            <span>{formatVideoDuration(video)}</span>
          </span>

          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-1"
            title={`Nombre de QCM: ${counts.qcm}`}
            aria-label={`Nombre de QCM: ${counts.qcm}`}
          >
            <ListChecks className="h-3.5 w-3.5" />
            <strong>{counts.qcm}</strong>
          </span>

          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1"
            title={`Nombre de cas cliniques: ${counts.cases}`}
            aria-label={`Nombre de cas cliniques: ${counts.cases}`}
          >
            <Stethoscope className="h-3.5 w-3.5" />
            <strong>{counts.cases}</strong>
          </span>

          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1"
            title={`Nombre de questions ouvertes: ${counts.open}`}
            aria-label={`Nombre de questions ouvertes: ${counts.open}`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <strong>{counts.open}</strong>
          </span>

          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200 px-2.5 py-1"
            title={`Nombre de schémas: ${counts.diagrams}`}
            aria-label={`Nombre de schémas: ${counts.diagrams}`}
          >
            <Network className="h-3.5 w-3.5" />
            <strong>{counts.diagrams}</strong>
          </span>
        </div>
        
        {hasAccess ? null : (
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-slate-900">{video.price} DZD</span>
            <button
              type="button"
              onClick={onUnlock}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 76%, #51392a 24%), color-mix(in oklab, var(--app-accent) 90%, #35261c 10%))', color: 'var(--app-accent-contrast)' }}
            >
              {lockActionLabel}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
