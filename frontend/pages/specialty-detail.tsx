'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { db, collection, query, where, getDocs, doc, updateDoc, arrayUnion, arrayRemove } from '@/lib/data/local-data';
import { motion } from 'motion/react';
import { PlayCircle, Lock, Clock3, Search, SlidersHorizontal, ListChecks, Stethoscope, MessageSquare, Network, Heart, BookmarkCheck } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { canAccessVideo } from '@/lib/security/access-control';
import { useCart } from '@/components/providers/cart-provider';
import Image from 'next/image';
import { VIDEO_FALLBACK_SRC, applyImageFallback } from '@/lib/utils/media-fallback';

interface Video {
  id: string;
  title: string;
  description: string;
  url: string;
  parts?: Array<{ secureUrl?: string; duration?: number | string }>;
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
type PlaylistFilter = 'all' | 'favorites' | 'important';

const VIEWED_VIDEOS_KEY = 'dems-viewed-videos-v1';
const EMPTY_DURATION_LABEL = '00 h 00 min';

const normalizeUniqueIdList = (source: unknown): string[] => {
  if (!Array.isArray(source)) {
    return [];
  }

  return Array.from(
    new Set(source.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)),
  );
};

const appendUniqueId = (source: string[], id: string) => {
  if (source.includes(id)) {
    return source;
  }

  return [...source, id];
};

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

const formatMinutesAsHHMM = (totalMinutes: number) => {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')} h ${String(minutes).padStart(2, '0')} min`;
};

const formatSecondsAsHHMM = (totalSeconds: number) => {
  const roundedMinutes = Math.max(0, Math.ceil(totalSeconds / 60));
  return formatMinutesAsHHMM(roundedMinutes);
};

const formatVideoDuration = (video: Video): string => {
  const totalPartSeconds = Array.isArray(video.parts)
    ? video.parts.reduce((sum, part) => {
        const value = Number(part?.duration);
        if (!Number.isFinite(value) || value <= 0) {
          return sum;
        }
        return sum + value;
      }, 0)
    : 0;

  if (totalPartSeconds > 0) {
    return formatSecondsAsHHMM(totalPartSeconds);
  }

  const explicitSeconds = Number(video.durationSeconds);
  if (Number.isFinite(explicitSeconds) && explicitSeconds > 0) {
    return formatSecondsAsHHMM(explicitSeconds);
  }

  const explicitMinutes = Number(video.durationMinutes);
  if (Number.isFinite(explicitMinutes) && explicitMinutes >= 0) {
    return formatMinutesAsHHMM(explicitMinutes);
  }

  const durationRaw = video.duration;

  if (typeof durationRaw === 'number' && Number.isFinite(durationRaw)) {
    // Backward compatibility: numeric duration has historically been stored as minutes.
    return formatMinutesAsHHMM(durationRaw);
  }

  if (typeof durationRaw === 'string') {
    const source = durationRaw.trim().toLowerCase();
    if (!source) {
      return EMPTY_DURATION_LABEL;
    }

    const isoMatch = source.match(/^pt(?:(\d+(?:[\.,]\d+)?)h)?(?:(\d+(?:[\.,]\d+)?)m)?(?:(\d+(?:[\.,]\d+)?)s)?$/i);
    if (isoMatch) {
      const hours = Number((isoMatch[1] || '0').replace(',', '.'));
      const minutes = Number((isoMatch[2] || '0').replace(',', '.'));
      const seconds = Number((isoMatch[3] || '0').replace(',', '.'));
      const totalMinutes = (Number.isFinite(hours) ? hours * 60 : 0)
        + (Number.isFinite(minutes) ? minutes : 0)
        + (Number.isFinite(seconds) ? Math.ceil(seconds / 60) : 0);
      return formatMinutesAsHHMM(totalMinutes);
    }

    if (source.includes(':')) {
      const parts = source.split(':').map((part) => Number(part.trim()));
      if (parts.length > 0 && parts.every(Number.isFinite)) {
        let totalMinutes = 0;
        if (parts.length === 3) {
          return formatSecondsAsHHMM(parts[0] * 3600 + parts[1] * 60 + parts[2]);
        } else if (parts.length === 2) {
          // In this page we want HH:MM display; 2-part values are interpreted as HH:MM.
          totalMinutes = parts[0] * 60 + parts[1];
        } else {
          totalMinutes = parts[0];
        }
        return formatMinutesAsHHMM(totalMinutes);
      }
    }

    const hoursMatch = source.match(/(\d+(?:[\.,]\d+)?)\s*h/);
    const minutesMatch = source.match(/(\d+(?:[\.,]\d+)?)\s*m(?:in)?/);
    const secondsMatch = source.match(/(\d+(?:[\.,]\d+)?)\s*s/);

    if (hoursMatch || minutesMatch || secondsMatch) {
      const hours = Number((hoursMatch?.[1] || '0').replace(',', '.'));
      const minutes = Number((minutesMatch?.[1] || '0').replace(',', '.'));
      const seconds = Number((secondsMatch?.[1] || '0').replace(',', '.'));
      const totalMinutes = (Number.isFinite(hours) ? hours * 60 : 0)
        + (Number.isFinite(minutes) ? minutes : 0)
        + (Number.isFinite(seconds) ? Math.ceil(seconds / 60) : 0);
      return formatMinutesAsHHMM(totalMinutes);
    }

    const numericMinutes = Number(source.replace(',', '.'));
    if (Number.isFinite(numericMinutes)) {
      return formatMinutesAsHHMM(numericMinutes);
    }
  }

  return EMPTY_DURATION_LABEL;
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

const getVideoThumbnailUrl = (videoUrl: string, secondMark = 60) => {
  const cloudinaryThumb = buildCloudinaryVideoThumbnailUrl(videoUrl, secondMark);
  if (cloudinaryThumb) {
    return cloudinaryThumb;
  }

  const youtubeId = extractYouTubeVideoId(videoUrl);
  if (youtubeId) {
    return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  }

  return null;
};

const SPECIALTIES = {
  otologie: {
    title: 'Otologie',
    desc: "Voie oreille: anatomie, exploration fonctionnelle et pathologies ciblées.",
    color: 'from-orange-500 to-amber-500',
    chipClass: 'specialty-glow-otology',
  },
  rhinologie: {
    title: 'Rhinologie & Sinusologie',
    desc: 'Voie naso-sinusienne: bases morphologiques, sémiologie et raisonnement.',
    color: 'from-cyan-500 to-blue-500',
    chipClass: 'specialty-glow-rhinology',
  },
  laryngologie: {
    title: 'Laryngologie & Cervicologie',
    desc: 'Voie laryngo-cervicale: voix, déglutition, oncologie et stratégie clinique.',
    color: 'from-rose-500 to-pink-500',
    chipClass: 'specialty-glow-laryngology',
  },
};

const SECTION_OPTIONS: Array<{ value: SectionFilter; label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'anatomie', label: 'Anatomie' },
  { value: 'pathologie', label: 'Pathologie' },
];

const PLAYLIST_OPTIONS: Array<{ value: PlaylistFilter; label: string }> = [
  { value: 'all', label: 'Toutes les videos' },
  { value: 'favorites', label: 'Mes favorites' },
  { value: 'important', label: 'Mes importantes' },
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
  const [playlistFilter, setPlaylistFilter] = useState<PlaylistFilter>('all');
  const [viewedVideoIds, setViewedVideoIds] = useState<string[]>([]);
  const [favoriteVideoIds, setFavoriteVideoIds] = useState<string[]>([]);
  const [importantVideoIds, setImportantVideoIds] = useState<string[]>([]);
  const [favoritesBusyById, setFavoritesBusyById] = useState<Record<string, boolean>>({});
  const [favoriteActionError, setFavoriteActionError] = useState<string | null>(null);
  const [contentCounts, setContentCounts] = useState<Record<string, { qcm: number; cases: number; open: number; diagrams: number }>>({});
  const [videoPaymentStatusById, setVideoPaymentStatusById] = useState<Record<string, VideoPaymentStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const normalizedImportant = normalizeUniqueIdList(profile?.importantVideoIds);
    const normalizedFavorites = normalizeUniqueIdList(profile?.favoriteVideoIds);
    const mergedFavorites = Array.from(new Set([...normalizedFavorites, ...normalizedImportant]));

    setFavoriteVideoIds(mergedFavorites);
    setImportantVideoIds(normalizedImportant.filter((id) => mergedFavorites.includes(id)));
  }, [profile?.favoriteVideoIds, profile?.importantVideoIds, user?.uid]);

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
  const favoriteVideoIdSet = new Set(favoriteVideoIds);
  const importantVideoIdSet = new Set(importantVideoIds);

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

    if (playlistFilter === 'favorites' && !favoriteVideoIdSet.has(video.id)) {
      return false;
    }

    if (playlistFilter === 'important' && !importantVideoIdSet.has(video.id)) {
      return false;
    }

    return true;
  });

  const filteredDemoCount = filteredVideos.filter((video) => video.isFreeDemo).length;
  const filteredUnlockedCount = filteredVideos.filter((video) => hasAccess(video)).length;
  const filteredViewedCount = filteredVideos.filter((video) => viewedVideoIds.includes(video.id)).length;
  const filteredFavoriteCount = filteredVideos.filter((video) => favoriteVideoIdSet.has(video.id)).length;
  const filteredImportantCount = filteredVideos.filter((video) => importantVideoIdSet.has(video.id)).length;
  const specialtyFavoriteCount = videos.filter((video) => favoriteVideoIdSet.has(video.id)).length;
  const specialtyImportantCount = videos.filter((video) => importantVideoIdSet.has(video.id)).length;

  const withBusyFlag = (videoId: string, isBusy: boolean) => {
    setFavoritesBusyById((prev) => {
      if (isBusy) {
        return { ...prev, [videoId]: true };
      }

      const next = { ...prev };
      delete next[videoId];
      return next;
    });
  };

  const requireSignedInForPlaylist = () => {
    if (user) {
      return true;
    }

    void router.push(`/sign-in?redirect=${encodeURIComponent(`/specialties/${slug}`)}`);
    return false;
  };

  const handleToggleFavorite = async (videoId: string) => {
    const targetVideo = videos.find((entry) => entry.id === videoId);
    if (targetVideo && !hasAccess(targetVideo)) {
      return;
    }

    if (!requireSignedInForPlaylist() || !user || favoritesBusyById[videoId]) {
      return;
    }

    const isFavorite = favoriteVideoIdSet.has(videoId);
    setFavoriteActionError(null);
    withBusyFlag(videoId, true);

    try {
      if (isFavorite) {
        await updateDoc(doc(db, 'users', user.uid), {
          favoriteVideoIds: arrayRemove(videoId),
          importantVideoIds: arrayRemove(videoId),
        });

        setFavoriteVideoIds((prev) => prev.filter((entry) => entry !== videoId));
        setImportantVideoIds((prev) => prev.filter((entry) => entry !== videoId));
      } else {
        await updateDoc(doc(db, 'users', user.uid), {
          favoriteVideoIds: arrayUnion(videoId),
        });

        setFavoriteVideoIds((prev) => appendUniqueId(prev, videoId));
      }
    } catch (error) {
      console.error('Error while toggling favorite video:', error);
      setFavoriteActionError('Impossible de mettre a jour vos favoris pour le moment.');
    } finally {
      withBusyFlag(videoId, false);
    }
  };

  const handleToggleImportant = async (videoId: string) => {
    const targetVideo = videos.find((entry) => entry.id === videoId);
    if (targetVideo && !hasAccess(targetVideo)) {
      return;
    }

    if (!requireSignedInForPlaylist() || !user || favoritesBusyById[videoId]) {
      return;
    }

    const isImportant = importantVideoIdSet.has(videoId);
    setFavoriteActionError(null);
    withBusyFlag(videoId, true);

    try {
      if (isImportant) {
        await updateDoc(doc(db, 'users', user.uid), {
          importantVideoIds: arrayRemove(videoId),
        });

        setImportantVideoIds((prev) => prev.filter((entry) => entry !== videoId));
      } else {
        await updateDoc(doc(db, 'users', user.uid), {
          favoriteVideoIds: arrayUnion(videoId),
          importantVideoIds: arrayUnion(videoId),
        });

        setFavoriteVideoIds((prev) => appendUniqueId(prev, videoId));
        setImportantVideoIds((prev) => appendUniqueId(prev, videoId));
      }
    } catch (error) {
      console.error('Error while toggling important video:', error);
      setFavoriteActionError('Impossible de mettre a jour vos videos importantes.');
    } finally {
      withBusyFlag(videoId, false);
    }
  };

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
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] mb-4 ${specialtyInfo.chipClass}`}>
              Parcours expert
            </span>
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
                {filteredVideos.length} vidéos ciblées
              </span>
              <span className="inline-flex items-center rounded-full border px-3 py-1" style={{ backgroundColor: 'var(--hero-chip-bg)', borderColor: 'var(--hero-chip-border)', color: 'var(--hero-chip-text)' }}>
                {filteredDemoCount} démos gratuites
              </span>
              <span className="inline-flex items-center rounded-full border px-3 py-1" style={{ backgroundColor: 'var(--hero-chip-bg)', borderColor: 'var(--hero-chip-border)', color: 'var(--hero-chip-text)' }}>
                {filteredUnlockedCount} accessibles
              </span>
              <span className="inline-flex items-center rounded-full border px-3 py-1" style={{ backgroundColor: 'var(--hero-chip-bg)', borderColor: 'var(--hero-chip-border)', color: 'var(--hero-chip-text)' }}>
                {specialtyFavoriteCount} aimees
              </span>
              <span className="inline-flex items-center rounded-full border px-3 py-1" style={{ backgroundColor: 'var(--hero-chip-bg)', borderColor: 'var(--hero-chip-border)', color: 'var(--hero-chip-text)' }}>
                {specialtyImportantCount} importantes
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
            <div className="premium-panel rounded-3xl p-5 md:p-6 shadow-md">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                <div className="lg:col-span-8">
                  <label htmlFor="video-name-filter" className="text-sm font-semibold text-slate-700 mb-2 inline-flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Recherche intelligente
                  </label>
                  <input
                    id="video-name-filter"
                    type="text"
                    value={videoNameFilter}
                    onChange={(e) => setVideoNameFilter(e.target.value)}
                    placeholder="Ex: anatomie de l'oreille moyenne, sinusite, laryngite..."
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>

                <div className="lg:col-span-4">
                  <label htmlFor="section-filter" className="text-sm font-semibold text-slate-700 mb-2 inline-flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filtre par section
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

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {PLAYLIST_OPTIONS.map((option) => {
                  const active = playlistFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPlaylistFilter(option.value)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-amber-300 bg-amber-100 text-amber-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {favoriteActionError ? (
                <p className="mt-3 text-sm font-medium text-rose-700">{favoriteActionError}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="inline-flex items-center rounded-full bg-white border border-slate-200 px-3 py-1 text-slate-700">
                  {filteredVideos.length} vidéos affichées
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-emerald-700">
                  {filteredVideos.filter((video) => video.isFreeDemo).length} démos
                </span>
                <span className="inline-flex items-center rounded-full bg-medical-50 border border-medical-200 px-3 py-1 text-medical-700">
                  {filteredUnlockedCount} accessibles maintenant
                </span>
                <span className="inline-flex items-center rounded-full bg-rose-100 border border-red-200 px-3 py-1 text-rose-700">
                  {filteredFavoriteCount} favorites
                </span>
                <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-amber-700">
                  {filteredImportantCount} importantes
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
                      isFavorite={favoriteVideoIdSet.has(video.id)}
                      isImportant={importantVideoIdSet.has(video.id)}
                      favoriteBusy={Boolean(favoritesBusyById[video.id])}
                      onToggleFavorite={() => {
                        void handleToggleFavorite(video.id);
                      }}
                      onToggleImportant={() => {
                        void handleToggleImportant(video.id);
                      }}
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
  isFavorite,
  isImportant,
  favoriteBusy,
  onToggleFavorite,
  onToggleImportant,
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
  isFavorite: boolean;
  isImportant: boolean;
  favoriteBusy: boolean;
  onToggleFavorite: () => void;
  onToggleImportant: () => void;
  index: number;
}) {
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [thumbnailSecond, setThumbnailSecond] = useState(60);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const [durationLabel, setDurationLabel] = useState(() => formatVideoDuration(video));

  const primaryVideoUrl = String(video.parts?.[0]?.secureUrl || video.url || '').trim();
  const thumbnailUrl = getVideoThumbnailUrl(primaryVideoUrl, thumbnailSecond);

  useEffect(() => {
    setDurationLabel(formatVideoDuration(video));
  }, [video]);

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

  const hasInlinePreview =
    hasAccess &&
    primaryVideoUrl.length > 0 &&
    !/youtube\.com|youtu\.be/i.test(primaryVideoUrl);

  const arePlaylistActionsDisabled = favoriteBusy || !hasAccess;

  const handlePreviewStart = async () => {
    if (!hasInlinePreview || !previewRef.current) return;
    try {
      await previewRef.current.play();
      setIsPreviewPlaying(true);
    } catch {
      setIsPreviewPlaying(false);
    }
  };

  const handlePreviewStop = () => {
    if (!previewRef.current) return;
    previewRef.current.pause();
    previewRef.current.currentTime = 0;
    setIsPreviewPlaying(false);
  };

  const updateDurationFromMetadata = (durationValue: number) => {
    if (durationLabel !== EMPTY_DURATION_LABEL) {
      return;
    }
    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      return;
    }
    setDurationLabel(formatSecondsAsHHMM(durationValue));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="premium-panel rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 group flex flex-col interactive-card"
    >
      <div
        className="aspect-video relative bg-slate-900 overflow-hidden"
        onMouseEnter={handlePreviewStart}
        onMouseLeave={handlePreviewStop}
        onFocus={handlePreviewStart}
        onBlur={handlePreviewStop}
      >
        <Image
          src={thumbnailUrl || VIDEO_FALLBACK_SRC}
          alt={video.title}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className={`object-cover transition-opacity duration-300 ${
            isPreviewPlaying ? 'opacity-0' : 'opacity-60 group-hover:opacity-80'
          }`}
          loading={index === 0 ? 'eager' : 'lazy'}
          fetchPriority={index === 0 ? 'high' : 'auto'}
          referrerPolicy="no-referrer"
          onError={(event) => {
            if (thumbnailSecond !== 0) {
              setThumbnailSecond(0);
              return;
            }

            applyImageFallback(event, VIDEO_FALLBACK_SRC);
          }}
        />
        {hasInlinePreview && (
          <video
            ref={previewRef}
            src={primaryVideoUrl}
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => updateDurationFromMetadata(Number(event.currentTarget.duration))}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              isPreviewPlaying ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
        {durationLabel === EMPTY_DURATION_LABEL && primaryVideoUrl && !/youtube\.com|youtu\.be/i.test(primaryVideoUrl) && !hasInlinePreview && (
          <video
            src={primaryVideoUrl}
            preload="metadata"
            className="hidden"
            onLoadedMetadata={(event) => updateDurationFromMetadata(Number(event.currentTarget.duration))}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
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
            {isViewed ? 'Vue' : 'Non vue'}
          </span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleFavorite}
              disabled={arePlaylistActionsDisabled}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-sm transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                isFavorite
                  ? 'border-rose-200/80 bg-rose-500/80 text-white'
                  : 'border-white/45 bg-black/35 text-white hover:bg-black/50'
              }`}
              aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
            </button>

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

            <button
              type="button"
              onClick={onToggleImportant}
              disabled={arePlaylistActionsDisabled}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-sm transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                isImportant
                  ? 'border-amber-200/80 bg-amber-500/80 text-white'
                  : 'border-white/45 bg-black/35 text-white hover:bg-black/50'
              }`}
              aria-label={isImportant ? 'Retirer des importantes' : 'Marquer comme importante'}
              title={isImportant ? 'Retirer des importantes' : 'Marquer comme importante'}
            >
              <BookmarkCheck className="h-5 w-5" />
            </button>
          </div>
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
            <span>{durationLabel}</span>
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
            title={`Nombre de QROC: ${counts.open}`}
            aria-label={`Nombre de QROC: ${counts.open}`}
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
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
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
