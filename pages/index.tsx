'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  PlayCircle,
  Pause,
  FileText,
  CheckCircle2,
  Stethoscope,
  Brain,
  Activity,
  Shield,
  Users,
  Clock3,
  Layers3,
  Target,
  GraduationCap,
} from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/components/providers/auth-provider';
import { collection, db, getDocs } from '@/lib/local-data';

interface DemoVideo {
  id: string;
  title: string;
  url: string;
  subspecialty?: string;
  duration?: string | number;
  durationMinutes?: number;
  durationSeconds?: number;
  isFreeDemo?: boolean;
}

type WatchProgressEntry = {
  currentTime: number;
  duration: number;
  completed?: boolean;
  updatedAt?: string;
};

type UnfinishedVideoItem = {
  id: string;
  title: string;
  currentTime: number;
  duration: number;
  remainingSeconds: number;
  progressPercent: number;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          playerVars?: Record<string, number>;
          events?: {
            onReady?: (event: { target: { getDuration?: () => number } }) => void;
            onStateChange?: (event: { data: number }) => void;
          };
        }
      ) => {
        getCurrentTime?: () => number;
        getDuration?: () => number;
        playVideo?: () => void;
        pauseVideo?: () => void;
        seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
        destroy?: () => void;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const FALLBACK_DEMO_VIDEO_URL = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';
const WATCH_PROGRESS_KEY = 'dems-video-watch-progress-v1';

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

const formatClock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const formatDemoDurationLabel = (video: DemoVideo | null) => {
  if (!video) return '45 min';

  const raw = video.duration ?? video.durationMinutes ?? video.durationSeconds;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if ('durationSeconds' in video && video.durationSeconds === raw) {
      const minutes = Math.max(1, Math.round(raw / 60));
      return `${minutes} min`;
    }
    return `${Math.max(1, Math.round(raw))} min`;
  }

  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw;
  }

  return '45 min';
};

const parseDurationToSeconds = (video: DemoVideo): number => {
  if (typeof video.durationSeconds === 'number' && Number.isFinite(video.durationSeconds)) {
    return Math.max(0, video.durationSeconds);
  }

  if (typeof video.durationMinutes === 'number' && Number.isFinite(video.durationMinutes)) {
    return Math.max(0, Math.round(video.durationMinutes * 60));
  }

  if (typeof video.duration === 'number' && Number.isFinite(video.duration)) {
    return Math.max(0, Math.round(video.duration * 60));
  }

  if (typeof video.duration === 'string') {
    const raw = video.duration.trim();
    if (!raw) return 0;

    if (raw.includes(':')) {
      const parts = raw.split(':').map((part) => Number(part));
      if (parts.some((part) => !Number.isFinite(part))) return 0;
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 1) return parts[0] * 60;
    }

    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) {
      return Math.max(0, Math.round(asNumber * 60));
    }
  }

  return 0;
};

const formatSubspecialtyLabel = (subspecialty?: string) => {
  if (!subspecialty) return 'Otologie';
  return `${subspecialty.charAt(0).toUpperCase()}${subspecialty.slice(1)}`;
};

export default function HomePage() {
  const { user, isAuthReady } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const youtubePlayerRef = useRef<{
    getCurrentTime?: () => number;
    getDuration?: () => number;
    playVideo?: () => void;
    pauseVideo?: () => void;
    seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
    destroy?: () => void;
  } | null>(null);
  const [demoVideo, setDemoVideo] = useState<DemoVideo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [areVideoControlsVisible, setAreVideoControlsVisible] = useState(true);
  const [unfinishedVideos, setUnfinishedVideos] = useState<UnfinishedVideoItem[]>([]);
  const hideControlsTimeoutRef = useRef<number | null>(null);

  const youtubeVideoId = extractYouTubeVideoId(demoVideo?.url || '');
  const isYouTubeDemo = Boolean(youtubeVideoId);

  const clearHideControlsTimer = () => {
    if (hideControlsTimeoutRef.current) {
      window.clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }
  };

  const scheduleHideControls = () => {
    clearHideControlsTimer();
    hideControlsTimeoutRef.current = window.setTimeout(() => {
      setAreVideoControlsVisible(false);
    }, 5000);
  };

  const revealVideoControls = () => {
    setAreVideoControlsVisible(true);
    if (isPlaying) {
      scheduleHideControls();
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadFirstDemoVideo = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'videos'));
        const demos = snapshot.docs
          .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<DemoVideo, 'id'>) }))
          .filter((video) => video.isFreeDemo && typeof video.url === 'string' && video.url.length > 0);

        if (isMounted && demos.length > 0) {
          setDemoVideo(demos[0]);
        }
      } catch {
        // Keep fallback preview if videos are not available.
      }
    };

    loadFirstDemoVideo();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isAuthReady || !user) {
      setUnfinishedVideos([]);
      return;
    }

    const storageKey = `${WATCH_PROGRESS_KEY}:${user.uid}`;

    const loadUnfinishedVideos = async () => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        const progressMap = raw ? (JSON.parse(raw) as Record<string, WatchProgressEntry>) : {};

        const progressEntries = Object.entries(progressMap).filter(([, entry]) => {
          if (!entry) return false;
          const duration = Number(entry.duration) || 0;
          const current = Number(entry.currentTime) || 0;
          if (duration <= 0 || current <= 0) return false;
          const ratio = current / duration;
          return ratio < 0.98 && !entry.completed;
        });

        if (progressEntries.length === 0) {
          setUnfinishedVideos([]);
          return;
        }

        const snapshot = await getDocs(collection(db, 'videos'));
        const videos = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<DemoVideo, 'id'>) }));
        const videosById = new Map(videos.map((video) => [video.id, video]));

        const nextItems: UnfinishedVideoItem[] = progressEntries
          .map(([videoId, entry]) => {
            const source = videosById.get(videoId);
            if (!source) return null;

            const fallbackDuration = parseDurationToSeconds(source);
            const duration = Math.max(Number(entry.duration) || 0, fallbackDuration);
            const currentTime = Math.min(Math.max(Number(entry.currentTime) || 0, 0), duration);
            if (duration <= 0 || currentTime <= 0) return null;

            const remainingSeconds = Math.max(0, Math.floor(duration - currentTime));
            const progressPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

            return {
              id: videoId,
              title: source.title || 'Vidéo sans titre',
              currentTime,
              duration,
              remainingSeconds,
              progressPercent,
            };
          })
          .filter((item): item is UnfinishedVideoItem => Boolean(item))
          .sort((a, b) => b.progressPercent - a.progressPercent);

        setUnfinishedVideos(nextItems);
      } catch {
        setUnfinishedVideos([]);
      }
    };

    loadUnfinishedVideos();

    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        loadUnfinishedVideos();
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', loadUnfinishedVideos);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', loadUnfinishedVideos);
    };
  }, [isAuthReady, user?.uid, user]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const videoEl = videoRef.current;
    if (!videoEl || isYouTubeDemo) return;

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(videoEl.duration) ? videoEl.duration : 0);
    };
    const handleTimeUpdate = () => {
      setCurrentTime(videoEl.currentTime);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoEl.addEventListener('timeupdate', handleTimeUpdate);
    videoEl.addEventListener('play', handlePlay);
    videoEl.addEventListener('pause', handlePause);
    videoEl.addEventListener('ended', handleEnded);

    return () => {
      videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoEl.removeEventListener('timeupdate', handleTimeUpdate);
      videoEl.removeEventListener('play', handlePlay);
      videoEl.removeEventListener('pause', handlePause);
      videoEl.removeEventListener('ended', handleEnded);
    };
  }, [demoVideo?.id, isYouTubeDemo]);

  useEffect(() => {
    if (!isYouTubeDemo || !youtubeVideoId) {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy?.();
        youtubePlayerRef.current = null;
      }
      return;
    }

    let isDisposed = false;
    const previousReady = window.onYouTubeIframeAPIReady;

    const mountPlayer = () => {
      if (isDisposed || !window.YT?.Player) return;

      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy?.();
      }

      youtubePlayerRef.current = new window.YT.Player('home-demo-youtube-player', {
        videoId: youtubeVideoId,
        playerVars: {
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            if (isDisposed) return;
            const videoDuration = event.target.getDuration?.() ?? 0;
            setDuration(Number.isFinite(videoDuration) ? videoDuration : 0);
          },
          onStateChange: (event) => {
            const playingState = 1;
            const pausedState = 2;
            const endedState = 0;

            if (event.data === playingState) {
              setIsPlaying(true);
            }

            if (event.data === pausedState || event.data === endedState) {
              setIsPlaying(false);
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      mountPlayer();
    } else {
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(script);
      }

      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        mountPlayer();
      };
    }

    return () => {
      isDisposed = true;
      window.onYouTubeIframeAPIReady = previousReady;
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy?.();
        youtubePlayerRef.current = null;
      }
    };
  }, [isYouTubeDemo, youtubeVideoId]);

  useEffect(() => {
    if (!isYouTubeDemo || !youtubePlayerRef.current) return;

    const tick = window.setInterval(() => {
      const player = youtubePlayerRef.current;
      if (!player) return;

      const nextCurrentTime = player.getCurrentTime?.() ?? 0;
      const nextDuration = player.getDuration?.() ?? 0;

      if (Number.isFinite(nextCurrentTime)) {
        setCurrentTime(nextCurrentTime);
      }

      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        setDuration(nextDuration);
      }
    }, 250);

    return () => {
      window.clearInterval(tick);
    };
  }, [isYouTubeDemo, isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      clearHideControlsTimer();
      setAreVideoControlsVisible(true);
      return;
    }

    scheduleHideControls();
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      clearHideControlsTimer();
    };
  }, []);

  const togglePreviewPlayback = async () => {
    revealVideoControls();

    if (isYouTubeDemo && youtubePlayerRef.current) {
      if (isPlaying) {
        youtubePlayerRef.current.pauseVideo?.();
      } else {
        youtubePlayerRef.current.playVideo?.();
      }
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (videoEl.paused) {
      try {
        await videoEl.play();
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    videoEl.pause();
  };

  const handleSeek = (nextPercent: number) => {
    revealVideoControls();

    const clampedPercent = Math.min(100, Math.max(0, nextPercent));

    if (isYouTubeDemo && youtubePlayerRef.current && duration > 0) {
      const nextSeconds = (clampedPercent / 100) * duration;
      youtubePlayerRef.current.seekTo?.(nextSeconds, true);
      setCurrentTime(nextSeconds);
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return;

    videoEl.currentTime = (clampedPercent / 100) * videoEl.duration;
    setCurrentTime(videoEl.currentTime);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const previewTitle = demoVideo?.title || "Anatomie de l'Oreille Moyenne";
  const previewSubspecialty = formatSubspecialtyLabel(demoVideo?.subspecialty);
  const previewDurationLabel = formatDemoDurationLabel(demoVideo);
  const previewVideoUrl = demoVideo?.url || FALLBACK_DEMO_VIDEO_URL;
  const { scrollYProgress } = useScroll();
  const scrollProgressX = useSpring(scrollYProgress, {
    stiffness: 130,
    damping: 28,
    mass: 0.25,
  });

  const specialties = [
    {
      title: 'Otologie',
      desc: "Anatomie de l'oreille, audiométrie, pathologies de l'oreille moyenne et interne.",
      icon: Activity,
      gradient: 'from-amber-700 to-orange-500',
      chip: 'Axe oreille',
      href: '/specialties/otologie',
    },
    {
      title: 'Rhinologie & Sinusologie',
      desc: 'Fosses nasales, sinus de la face, physiologie olfactive et pathologies associées.',
      icon: Brain,
      gradient: 'from-amber-700 to-amber-500',
      chip: 'Axe nez/sinus',
      href: '/specialties/rhinologie',
    },
    {
      title: 'Laryngologie & Cervicologie',
      desc: 'Larynx, pharynx, cou et oncologie cervico-faciale avec approche clinique complète.',
      icon: Stethoscope,
      gradient: 'from-orange-700 to-amber-600',
      chip: 'Axe voix/cou',
      href: '/specialties/laryngologie',
    },
  ];

  const highlights = [
    { icon: Shield, label: 'Approche expert', value: 'Format DEMS' },
    { icon: Users, label: 'Parcours guidé', value: 'Étape par étape' },
    { icon: Clock3, label: 'Temps optimisé', value: 'Révision ciblée' },
  ];

  const outcomes = [
    { icon: Target, title: 'Priorisation intelligente', text: 'Vous savez quoi revoir, quand et comment.' },
    { icon: Layers3, title: 'Mémorisation durable', text: 'Formats croisés pour ancrer les notions clés.' },
    { icon: GraduationCap, title: 'Confiance examen', text: 'Simulation du raisonnement attendu au concours.' },
  ];

  const featurePillars = [
    {
      title: 'Vidéos HD',
      desc: 'Cours magistraux et démonstrations cliniques orientées pratique.',
      icon: PlayCircle,
    },
    {
      title: 'Cas cliniques',
      desc: 'Raisonnement progressif avec prises de décision réalistes.',
      icon: FileText,
    },
    {
      title: 'QCM + Questions ouvertes',
      desc: 'Évaluation active avec feedback immédiat.',
      icon: CheckCircle2,
    },
    {
      title: 'Schémas et radios',
      desc: 'Ancrage visuel durable des structures et repères clés.',
      icon: BookOpen,
    },
  ];

  const journey = [
    { step: '01', title: 'Choisissez votre spécialité', text: 'Otologie, Rhinologie ou Laryngologie selon votre priorité actuelle.' },
    { step: '02', title: 'Alternez cours et cas', text: 'Passez immédiatement de la théorie à la décision clinique.' },
    { step: '03', title: 'Validez par évaluation active', text: 'QCM et questions ouvertes pour fixer les automatismes utiles.' },
    { step: '04', title: 'Consolidez avec les schémas', text: 'Repères visuels et anatomiques pour une rétention rapide.' },
  ];

  const containerStagger = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemRise = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <div
      className="flex flex-col w-full"
      style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 95%, white 5%) 0%, color-mix(in oklab, var(--app-surface-alt) 78%, var(--app-accent) 22%) 100%)' }}
    >
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 z-[60] origin-left"
        style={{
          scaleX: scrollProgressX,
          background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 82%, #f8ecdd 18%), color-mix(in oklab, var(--app-accent) 60%, #2f2118 40%))',
        }}
      />

      <div className="relative overflow-hidden pt-24 pb-28" style={{ color: 'var(--hero-title)' }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(140deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 78%, var(--app-accent) 22%) 56%, color-mix(in oklab, var(--hero-bg-end) 86%, transparent 14%) 100%)',
          }}
        />
        <div className="absolute inset-0 z-0">
          <Image
            src="https://picsum.photos/seed/surgery/1920/1080?blur=2"
            alt="Medical Background"
            fill
            className="object-cover opacity-20"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0" style={{ background: 'var(--hero-overlay)' }} />
          <div className="absolute -top-24 -right-20 w-96 h-96 rounded-full blur-3xl" style={{ backgroundColor: 'color-mix(in srgb, var(--app-accent) 32%, transparent)' }} />
          <div className="absolute -bottom-32 -left-16 w-[28rem] h-[28rem] rounded-full blur-3xl" style={{ backgroundColor: 'color-mix(in srgb, var(--app-accent) 22%, transparent)' }} />
          <div className="absolute inset-0 opacity-35" style={{ backgroundImage: 'radial-gradient(circle at 24% 18%, color-mix(in srgb, var(--app-accent) 34%, transparent) 0%, transparent 38%), radial-gradient(circle at 80% 70%, color-mix(in srgb, var(--app-accent) 18%, transparent) 0%, transparent 36%)' }} />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-12">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6 text-sm font-medium"
                style={{
                  backgroundColor: 'var(--hero-chip-bg)',
                  color: 'var(--hero-chip-text)',
                  border: '1px solid var(--hero-chip-border)',
                }}
              >
                <Stethoscope className="h-4 w-4" />
                <span>Préparation au Concours DEMS ORL</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.05]"
                style={{ color: 'var(--hero-title)' }}
              >
                Refondez vos révisions en <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, color-mix(in srgb, var(--app-accent) 65%, #f5e0cc 35%), color-mix(in srgb, var(--app-accent) 84%, #fff 16%))' }}>performance clinique</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-lg md:text-xl mb-10 max-w-2xl leading-relaxed"
                style={{ color: 'var(--hero-body)' }}
              >
                DEMS ENT combine vidéos expertes, cas cliniques, évaluations actives et supports visuels pour accélérer votre maîtrise ORL sans dispersion.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <Link
                  href="/specialties"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-lg font-semibold transition-all shadow-lg"
                  style={{
                    backgroundColor: 'var(--app-accent)',
                    color: 'var(--app-accent-contrast)',
                    boxShadow: '0 12px 28px color-mix(in srgb, var(--app-accent) 36%, transparent)',
                  }}
                >
                  Explorer toutes les spécialités
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href="#demo-section"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-lg font-semibold transition-all backdrop-blur-sm"
                  style={{
                    backgroundColor: 'var(--hero-ghost-bg)',
                    color: 'var(--hero-title)',
                    border: '1px solid var(--hero-ghost-border)',
                  }}
                >
                  <PlayCircle className="h-5 w-5" />
                  Découvrir une démo
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.42 }}
                className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3"
              >
                {highlights.map((item) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45 }}
                    whileHover={{ y: -3, scale: 1.01 }}
                    className="rounded-2xl backdrop-blur-md px-4 py-3"
                    style={{
                      border: '1px solid var(--hero-panel-border)',
                      backgroundColor: 'var(--hero-panel-bg)',
                    }}
                  >
                    <p className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--hero-body)' }}>
                      <item.icon className="h-3.5 w-3.5" />
                      {item.label}
                    </p>
                    <p className="text-sm md:text-base font-semibold mt-1" style={{ color: 'var(--hero-title)' }}>{item.value}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>

          </div>
        </div>
      </div>

      {isAuthReady && user && unfinishedVideos.length > 0 && (
        <div className="relative py-10">
          <div className="container mx-auto px-4">
            <div
              className="rounded-3xl border p-6 md:p-8"
              style={{
                borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)',
                background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 84%, var(--app-accent) 16%) 100%)',
              }}
            >
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--app-muted)' }}>Continuer vos vidéos</p>
                  <h2 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--app-text)' }}>
                    Listes des vidéos pas encore terminées
                  </h2>
                </div>
                <span className="text-sm font-semibold" style={{ color: 'color-mix(in oklab, var(--app-accent) 76%, var(--app-text) 24%)' }}>
                  {unfinishedVideos.length} en cours
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {unfinishedVideos.map((item) => (
                  <Link
                    key={item.id}
                    href={`/videos/${item.id}`}
                    className="rounded-2xl border px-4 py-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
                    style={{
                      borderColor: 'color-mix(in oklab, var(--app-accent) 20%, var(--app-border) 80%)',
                      backgroundColor: 'color-mix(in oklab, var(--app-surface) 90%, white 10%)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <p className="font-semibold line-clamp-1" style={{ color: 'var(--app-text)' }}>{item.title}</p>
                      <span className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--app-muted)' }}>
                        Reste {formatClock(item.remainingSeconds)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'color-mix(in oklab, var(--app-border) 76%, transparent)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${item.progressPercent}%`,
                          background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 76%, #6b4a35 24%), color-mix(in oklab, var(--app-accent) 92%, #2e1f16 8%))',
                        }}
                      />
                    </div>
                    <div className="mt-2 text-xs" style={{ color: 'var(--app-muted)' }}>
                      {formatClock(item.currentTime)} / {formatClock(item.duration)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative py-20">
        <div className="container mx-auto px-4">
          <motion.div
            variants={containerStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {outcomes.map((item) => (
              <motion.div
                key={item.title}
                variants={itemRise}
                whileHover={{ y: -4 }}
                className="rounded-2xl border p-5 shadow-sm"
                style={{
                  borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)',
                  background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 84%, var(--app-accent) 16%) 100%)',
                }}
              >
                <item.icon className="h-5 w-5 mb-3" style={{ color: 'color-mix(in oklab, var(--app-accent) 76%, var(--app-text) 24%)' }} />
                <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--app-text)' }}>{item.title}</h3>
                <p style={{ color: 'var(--app-muted)' }}>{item.text}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      <div className="relative py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Trois spécialités, un même niveau d&apos;exigence</h2>
            <p className="text-lg text-slate-600">Chaque module combine fondements anatomiques, raisonnement clinique et entraînement évaluatif.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {specialties.map((spec, i) => (
              <motion.div
                key={spec.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                whileHover={{ y: -7 }}
                className="group relative rounded-3xl p-8 border shadow-sm hover:shadow-xl transition-all overflow-hidden"
                style={{
                  borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)',
                  background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 82%, var(--app-accent) 18%) 100%)',
                }}
              >
                <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${spec.gradient}`} />
                <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold mb-4" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)', backgroundColor: 'color-mix(in oklab, var(--app-accent) 10%, var(--app-surface) 90%)', color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }}>
                  {spec.chip}
                </span>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform" style={{ backgroundColor: 'color-mix(in oklab, var(--app-accent) 14%, var(--app-surface) 86%)' }}>
                  <spec.icon className="h-7 w-7" style={{ color: 'color-mix(in oklab, var(--app-accent) 80%, var(--app-text) 20%)' }} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">{spec.title}</h3>
                <p className="text-slate-600 mb-8 leading-relaxed">{spec.desc}</p>
                <Link 
                  href={spec.href}
                  className="inline-flex items-center gap-2 font-semibold transition-colors"
                  style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }}
                >
                  Explorer le module <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div id="demo-section" className="relative py-24 overflow-hidden" style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 92%, var(--app-bg) 8%) 0%, color-mix(in oklab, var(--app-surface-alt) 76%, var(--app-accent) 24%) 100%)' }}>
        <div className="absolute inset-0 opacity-35" style={{ background: 'radial-gradient(circle at 20% 20%, color-mix(in oklab, var(--app-accent) 22%, transparent) 0%, transparent 45%), radial-gradient(circle at 80% 60%, color-mix(in oklab, var(--app-accent) 16%, transparent) 0%, transparent 45%)' }} />
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">Une pédagogie conçue pour la rétention et la performance</h2>
              <p className="text-lg text-slate-600 mb-8">Chaque leçon active plusieurs formats pour ancrer le savoir, vérifier la compréhension et accélérer la prise de décision clinique.</p>
              
              <div className="space-y-6">
                {featurePillars.map((feature, i) => (
                  <motion.div 
                    key={feature.title}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.1 }}
                    className="flex gap-4"
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                      <feature.icon className="h-6 w-6" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }} />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-slate-900 mb-1">{feature.title}</h4>
                      <p className="text-slate-600">{feature.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="relative">
              <motion.div
                initial={{ opacity: 0, x: 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55 }}
                className="aspect-square md:aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl relative"
                onMouseMove={revealVideoControls}
                onMouseEnter={revealVideoControls}
              >
                <div className="absolute inset-0 z-10" onMouseMove={revealVideoControls} onMouseEnter={revealVideoControls} onClick={togglePreviewPlayback} />
                {isYouTubeDemo ? (
                  <div className="h-full w-full bg-black">
                    <div id="home-demo-youtube-player" className="h-full w-full" />
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    key={previewVideoUrl}
                    src={previewVideoUrl}
                    className="h-full w-full object-cover"
                    playsInline
                    preload="metadata"
                    onClick={togglePreviewPlayback}
                  />
                )}
                <motion.div
                  className="absolute inset-0 z-20 bg-gradient-to-t from-slate-900/60 to-transparent flex items-end p-8"
                  animate={{ opacity: areVideoControlsVisible ? 1 : 0, y: areVideoControlsVisible ? 0 : 28 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  style={{ pointerEvents: areVideoControlsVisible ? 'auto' : 'none' }}
                >
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 text-white w-full">
                    <div className="flex items-center gap-4 mb-4">
                      <button
                        type="button"
                        onClick={togglePreviewPlayback}
                        aria-label={isPlaying ? 'Pause preview video' : 'Play preview video'}
                        className="w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-105"
                        style={{ backgroundColor: 'var(--app-accent)' }}
                      >
                        {isPlaying ? <Pause className="h-6 w-6 text-white" /> : <PlayCircle className="h-6 w-6 text-white" />}
                      </button>
                      <div>
                        <p className="font-semibold">{previewTitle}</p>
                        <p
                          className="text-sm"
                          style={{ color: 'color-mix(in oklab, #ffffff 86%, var(--app-accent) 14%)' }}
                        >
                          Module {previewSubspecialty} • {previewDurationLabel}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="w-full bg-white/20 rounded-full h-2 relative overflow-hidden">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${progressPercent}%`,
                            backgroundColor: 'color-mix(in oklab, var(--app-accent) 72%, #f6e5d2 28%)',
                          }}
                        />
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={0.1}
                          value={progressPercent}
                          onChange={(event) => handleSeek(Number(event.target.value))}
                          aria-label="Contrôle de progression vidéo"
                          className="absolute inset-0 h-2 w-full cursor-pointer opacity-0"
                        />
                      </div>
                      <div
                        className="flex items-center justify-between text-xs"
                        style={{ color: 'color-mix(in oklab, #ffffff 92%, var(--app-accent) 8%)' }}
                      >
                        <span>{formatClock(currentTime)}</span>
                        <span>{formatClock(duration)}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob" style={{ backgroundColor: 'color-mix(in oklab, var(--app-accent) 30%, white 70%)' }} />
              <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000" style={{ backgroundColor: 'color-mix(in oklab, var(--app-accent) 42%, white 58%)' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">Un parcours clair, de la théorie à la décision</h2>
            <p className="text-slate-600">Chaque étape prépare la suivante pour éviter l&apos;apprentissage fragmenté.</p>
          </div>
          <motion.div
            variants={containerStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {journey.map((node) => (
              <motion.div
                key={node.step}
                variants={itemRise}
                className="rounded-2xl border p-5"
                style={{
                  borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)',
                  background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 84%, var(--app-accent) 16%) 100%)',
                }}
              >
                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-bold mb-3" style={{ backgroundColor: 'color-mix(in oklab, var(--app-accent) 18%, var(--app-surface) 82%)', color: 'color-mix(in oklab, var(--app-accent) 82%, var(--app-text) 18%)' }}>
                  {node.step}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mb-1">{node.title}</h3>
                <p className="text-sm text-slate-600">{node.text}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {isAuthReady && !user ? (
        <div className="py-20">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
              className="rounded-3xl p-8 md:p-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6"
              style={{
                color: 'var(--hero-title)',
                border: '1px solid color-mix(in oklab, var(--hero-chip-border) 72%, var(--app-border) 28%)',
                background: 'linear-gradient(110deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
              }}
            >
              <motion.div
                initial={{ opacity: 0, x: -18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1, duration: 0.45 }}
              >
                <h3 className="text-3xl font-bold mb-2">Prêt à structurer vos révisions ORL ?</h3>
                <p style={{ color: 'var(--hero-body)' }}>Commencez gratuitement puis activez le parcours adapté à votre rythme.</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.18, duration: 0.45 }}
                className="flex flex-col sm:flex-row gap-3"
              >
                <Link
                  href="/sign-up"
                  className="inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold transition-colors"
                  style={{
                    backgroundColor: 'var(--app-accent)',
                    color: 'var(--app-accent-contrast)',
                  }}
                >
                  Créer mon compte
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold transition-colors"
                  style={{
                    color: 'var(--hero-title)',
                    border: '1px solid var(--hero-chip-border)',
                    backgroundColor: 'var(--hero-ghost-bg)',
                  }}
                >
                  Voir les tarifs
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
