'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import Link from 'next/link';
import {
  ArrowUp,
  ArrowRight,
  BookOpen,
  PlayCircle,
  Pause,
  Volume2,
  VolumeX,
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
  MessageCircle,
  Plus,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/components/providers/auth-provider';
import { collection, db, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where } from '@/lib/data/local-data';
import { IMAGE_FALLBACK_SRC, VIDEO_FALLBACK_SRC, applyImageFallback } from '@/lib/utils/media-fallback';

const isApiUnavailableError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes('Failed to reach API');
};

interface DemoVideo {
  id: string;
  title: string;
  url: string;
  parts?: Array<{ secureUrl?: string; duration?: number | string }>;
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
  thumbnailUrl: string;
  subspecialtyLabel: string;
  currentTime: number;
  duration: number;
  remainingSeconds: number;
  progressPercent: number;
};

type SupportProblemType = 'billing' | 'access' | 'account' | 'other';

type SupportChat = {
  id: string;
  userId: string;
  userEmail?: string;
  problemType: SupportProblemType;
  status?: 'open' | 'in_progress' | 'resolved';
  lastMessage?: string;
  lastSender?: 'user' | 'bot' | 'admin';
  createdAt?: string;
  updatedAt?: string;
};

type SupportChatMessage = {
  id: string;
  chatId: string;
  userId: string;
  sender: 'user' | 'bot' | 'admin';
  senderName?: string;
  text: string;
  createdAt?: string;
};

type AdminSupportPresence = {
  isOnline: boolean;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
};

const buildWaitingBotSuggestion = () => {
  return [
    'Votre message est bien recu. Nous attendons la reponse de l\'admin.',
  ].join('\n');
};

const buildWelcomeBotMessage = () => {
  return [
    'Bienvenue. Je suis **DEMS-ORL-Bot**.',
    'Une nouvelle discussion support est prete pour vous.',
    '',
    'Pour bien commencer, vous pouvez partager :',
    '- Le contexte du probleme',
    '- Le message d\'erreur exact',
    '- Ce que vous avez déja essaye',
  ].join('\n');
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
            onReady?: (event: { target: { getDuration?: () => number; playVideo?: () => void; mute?: () => void; setVolume?: (volume: number) => void } }) => void;
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

const VIDEO_CARD_PLACEHOLDER = VIDEO_FALLBACK_SRC;

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
  const cloudinaryThumbnail = buildCloudinaryVideoThumbnailUrl(videoUrl, secondMark);
  if (cloudinaryThumbnail) {
    return cloudinaryThumbnail;
  }

  const youtubeId = extractYouTubeVideoId(videoUrl);
  if (youtubeId) {
    return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  }

  return VIDEO_CARD_PLACEHOLDER;
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

const parsePartDurationToSeconds = (durationValue: unknown): number => {
  if (typeof durationValue === 'number' && Number.isFinite(durationValue)) {
    return Math.max(0, durationValue);
  }

  if (typeof durationValue === 'string') {
    const raw = durationValue.trim();
    if (!raw) return 0;

    if (raw.includes(':')) {
      const parts = raw.split(':').map((part) => Number(part));
      if (parts.some((part) => !Number.isFinite(part))) return 0;
      if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
      if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
      if (parts.length === 1) return Math.max(0, parts[0]);
    }

    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) {
      return Math.max(0, asNumber);
    }
  }

  return 0;
};

const formatDemoDurationLabel = (video: DemoVideo | null, totalDurationSeconds = 0) => {
  if (Number.isFinite(totalDurationSeconds) && totalDurationSeconds > 0) {
    const minutes = Math.max(1, Math.round(totalDurationSeconds / 60));
    return `${minutes} min`;
  }

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
  const partsTotalDuration = Array.isArray(video.parts)
    ? video.parts.reduce((sum, part) => sum + parsePartDurationToSeconds(part?.duration), 0)
    : 0;

  let explicitDuration = 0;

  if (typeof video.durationSeconds === 'number' && Number.isFinite(video.durationSeconds)) {
    explicitDuration = Math.max(explicitDuration, video.durationSeconds);
  }

  if (typeof video.durationMinutes === 'number' && Number.isFinite(video.durationMinutes)) {
    explicitDuration = Math.max(explicitDuration, Math.round(video.durationMinutes * 60));
  }

  if (typeof video.duration === 'number' && Number.isFinite(video.duration)) {
    explicitDuration = Math.max(explicitDuration, Math.round(video.duration * 60));
  }

  if (typeof video.duration === 'string') {
    const raw = video.duration.trim();
    if (!raw) return 0;

    if (raw.includes(':')) {
      const parts = raw.split(':').map((part) => Number(part));
      if (parts.some((part) => !Number.isFinite(part))) return 0;
      if (parts.length === 3) {
        explicitDuration = Math.max(explicitDuration, parts[0] * 3600 + parts[1] * 60 + parts[2]);
      }
      if (parts.length === 2) {
        explicitDuration = Math.max(explicitDuration, parts[0] * 60 + parts[1]);
      }
      if (parts.length === 1) {
        explicitDuration = Math.max(explicitDuration, parts[0] * 60);
      }
    }

    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) {
      explicitDuration = Math.max(explicitDuration, Math.round(asNumber * 60));
    }
  }

  return Math.max(partsTotalDuration, explicitDuration);
};

const formatSubspecialtyLabel = (subspecialty?: string) => {
  if (!subspecialty) return 'Otologie';
  return `${subspecialty.charAt(0).toUpperCase()}${subspecialty.slice(1)}`;
};

const getUnfinishedVideoTheme = (subspecialtyLabel: string) => {
  const normalized = subspecialtyLabel.toLowerCase();

  if (normalized.includes('rhin')) {
    return {
      chipClass: 'specialty-glow-rhinology',
      borderColor: 'color-mix(in oklab, var(--specialty-rhinology) 36%, var(--app-border) 64%)',
      background: 'linear-gradient(180deg, color-mix(in oklab, var(--specialty-rhinology) 14%, var(--app-surface) 86%) 0%, color-mix(in oklab, var(--specialty-rhinology) 24%, var(--app-surface-alt) 76%) 100%)',
      stripeGradient: 'linear-gradient(90deg, color-mix(in oklab, var(--specialty-rhinology) 84%, #0ea5e9 16%), color-mix(in oklab, var(--specialty-rhinology) 68%, #2563eb 32%))',
      progressGradient: 'linear-gradient(90deg, color-mix(in oklab, var(--specialty-rhinology) 88%, #0ea5e9 12%), color-mix(in oklab, var(--specialty-rhinology) 72%, #2563eb 28%))',
      ctaColor: 'color-mix(in oklab, var(--specialty-rhinology) 78%, var(--app-text) 22%)',
    };
  }

  if (normalized.includes('lary')) {
    return {
      chipClass: 'specialty-glow-laryngology',
      borderColor: 'color-mix(in oklab, var(--specialty-laryngology) 36%, var(--app-border) 64%)',
      background: 'linear-gradient(180deg, color-mix(in oklab, var(--specialty-laryngology) 14%, var(--app-surface) 86%) 0%, color-mix(in oklab, var(--specialty-laryngology) 24%, var(--app-surface-alt) 76%) 100%)',
      stripeGradient: 'linear-gradient(90deg, color-mix(in oklab, var(--specialty-laryngology) 84%, #ec4899 16%), color-mix(in oklab, var(--specialty-laryngology) 68%, #db2777 32%))',
      progressGradient: 'linear-gradient(90deg, color-mix(in oklab, var(--specialty-laryngology) 88%, #ec4899 12%), color-mix(in oklab, var(--specialty-laryngology) 72%, #db2777 28%))',
      ctaColor: 'color-mix(in oklab, var(--specialty-laryngology) 78%, var(--app-text) 22%)',
    };
  }

  return {
    chipClass: 'specialty-glow-otology',
    borderColor: 'color-mix(in oklab, var(--specialty-otology) 36%, var(--app-border) 64%)',
    background: 'linear-gradient(180deg, color-mix(in oklab, var(--specialty-otology) 14%, var(--app-surface) 86%) 0%, color-mix(in oklab, var(--specialty-otology) 24%, var(--app-surface-alt) 76%) 100%)',
    stripeGradient: 'linear-gradient(90deg, color-mix(in oklab, var(--specialty-otology) 84%, #f97316 16%), color-mix(in oklab, var(--specialty-otology) 68%, #f59e0b 32%))',
    progressGradient: 'linear-gradient(90deg, color-mix(in oklab, var(--specialty-otology) 88%, #f97316 12%), color-mix(in oklab, var(--specialty-otology) 72%, #f59e0b 28%))',
    ctaColor: 'color-mix(in oklab, var(--specialty-otology) 78%, var(--app-text) 22%)',
  };
};

export default function HomePage() {
  const { user, profile, isAuthReady } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const youtubePlayerRef = useRef<{
    getCurrentTime?: () => number;
    getDuration?: () => number;
    getVolume?: () => number;
    isMuted?: () => boolean;
    playVideo?: () => void;
    pauseVideo?: () => void;
    seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
    setVolume?: (volume: number) => void;
    mute?: () => void;
    unMute?: () => void;
    destroy?: () => void;
  } | null>(null);
  const [demoVideo, setDemoVideo] = useState<DemoVideo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(0.8);
  const [isMuted, setIsMuted] = useState(true);
  const [previewPartIndex, setPreviewPartIndex] = useState(0);
  const [previewPartDurations, setPreviewPartDurations] = useState<number[]>([]);
  const [areVideoControlsVisible, setAreVideoControlsVisible] = useState(true);
  const [unfinishedVideos, setUnfinishedVideos] = useState<UnfinishedVideoItem[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [supportChats, setSupportChats] = useState<SupportChat[]>([]);
  const [activeSupportChatId, setActiveSupportChatId] = useState('');
  const [supportChatMessages, setSupportChatMessages] = useState<SupportChatMessage[]>([]);
  const [adminSupportPresence, setAdminSupportPresence] = useState<AdminSupportPresence>({
    isOnline: false,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
  });
  const [chatComposer, setChatComposer] = useState('');
  const [isSendingChatMessage, setIsSendingChatMessage] = useState(false);
  const [isUserAvatarFallback, setIsUserAvatarFallback] = useState(false);
  const lastNonZeroVolumeRef = useRef(0.8);
  const hideControlsTimeoutRef = useRef<number | null>(null);
  const hasAutoPlayedRef = useRef(false);
  const supportMessagesContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldStickSupportScrollRef = useRef(true);
  const previousSupportChatIdRef = useRef('');
  const chatComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const isEnsuringWelcomeChatRef = useRef(false);
  const hasLoggedAdminPresenceApiDownRef = useRef(false);
  const hasLoggedSupportPollingApiDownRef = useRef(false);

  const activeSupportChat = useMemo(
    () => supportChats.find((chat) => chat.id === activeSupportChatId) || null,
    [activeSupportChatId, supportChats],
  );
  const isActiveSupportChatResolved = activeSupportChat?.status === 'resolved';
  const hasComposerWord = chatComposer.trim().length > 0;
  const chatComposerRows = chatComposer.includes('\n') ? 2 : 1;
  const showSendComposerAction = hasComposerWord && !isActiveSupportChatResolved;
  const isAdmin = profile?.role === 'admin';

  const adminSupportStatusLabel = useMemo(() => {
    if (adminSupportPresence.isOnline) {
      return 'En ligne';
    }

    const rawDisconnectedAt = String(adminSupportPresence.lastDisconnectedAt || '').trim();
    const rawConnectedAt = String(adminSupportPresence.lastConnectedAt || '').trim();
    const rawReferenceMoment = rawDisconnectedAt || rawConnectedAt;

    if (!rawReferenceMoment) {
      return 'Hors ligne · il y a un moment';
    }

    const elapsedMs = Date.now() - new Date(rawReferenceMoment).getTime();
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      return 'Hors ligne · il y a un moment';
    }

    const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / 60000));
    if (elapsedMinutes < 2) {
      return 'Hors ligne · il y a un moment';
    }

    if (elapsedMinutes < 60) {
      return `Hors ligne · il y a ${elapsedMinutes} min`;
    }

    const elapsedHours = Math.max(1, Math.floor(elapsedMinutes / 60));
    return `Hors ligne · il y a ${elapsedHours} h`;
  }, [adminSupportPresence]);

  useEffect(() => {
    if (!isChatOpen || !user || isAdmin) {
      return;
    }

    let isDisposed = false;

    const refreshAdminSupportPresence = async () => {
      try {
        const adminSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));

        let latestConnected = 0;
        let latestDisconnected = 0;
        let hasOnlineAdmin = false;

        adminSnap.docs.forEach((entry) => {
          const data = entry.data() as Record<string, unknown>;
          const rawConnectedAt = typeof data.supportAdminConnectedAt === 'string' ? data.supportAdminConnectedAt : '';
          const rawDisconnectedAt = typeof data.supportAdminDisconnectedAt === 'string' ? data.supportAdminDisconnectedAt : '';
          const connectedTime = rawConnectedAt ? new Date(rawConnectedAt).getTime() : 0;
          const disconnectedTime = rawDisconnectedAt ? new Date(rawDisconnectedAt).getTime() : 0;
          const isMarkedOnline = data.supportAdminOnline === true;

          if (connectedTime > latestConnected) {
            latestConnected = connectedTime;
          }

          if (disconnectedTime > latestDisconnected) {
            latestDisconnected = disconnectedTime;
          }

          if (isMarkedOnline) {
            hasOnlineAdmin = true;
          }
        });

        if (!isDisposed) {
          hasLoggedAdminPresenceApiDownRef.current = false;
          setAdminSupportPresence({
            isOnline: hasOnlineAdmin,
            lastConnectedAt: latestConnected > 0 ? new Date(latestConnected).toISOString() : null,
            lastDisconnectedAt: latestDisconnected > 0 ? new Date(latestDisconnected).toISOString() : null,
          });
        }
      } catch (error) {
        if (isApiUnavailableError(error)) {
          if (!hasLoggedAdminPresenceApiDownRef.current) {
            console.warn('Support status unavailable: backend API is temporarily unreachable.');
            hasLoggedAdminPresenceApiDownRef.current = true;
          }
          return;
        }

        console.error('Error loading admin support presence:', error);
      }
    };

    void refreshAdminSupportPresence();
    const timer = window.setInterval(() => {
      void refreshAdminSupportPresence();
    }, 4_000);

    return () => {
      isDisposed = true;
      window.clearInterval(timer);
    };
  }, [isChatOpen, user, isAdmin]);

  const quickReplyOptions = useMemo(() => {
    const transcript = supportChatMessages.map((message) => message.text.toLowerCase()).join(' ');
    const lastMessage = supportChatMessages[supportChatMessages.length - 1];

    if (lastMessage?.sender === 'admin') {
      return [
        {
          label: 'Infos demandees',
          message: '**Informations demandees**\n- Detail 1: \n- Detail 2: \n- Detail 3: ',
        },
        {
          label: 'Probleme persiste',
          message: '**Le probleme persiste**\n- Ce que je vois: \n- Quand cela arrive: ',
        },
        {
          label: 'C est resolu',
          message: '**Merci, le probleme est resolu de mon cote.**',
        },
      ];
    }

    if (/paiement|recu|transaction|abonnement/.test(transcript)) {
      return [
        {
          label: 'Details paiement',
          message: '**Paiement**\n- Numero de recu: \n- Date: \n- Montant: ',
        },
        {
          label: 'Preuve envoyee',
          message: 'Je confirme que la preuve de paiement est jointe.',
        },
        {
          label: 'Acces toujours bloque',
          message: '**Acces toujours bloque apres paiement**\n- Video/module: \n- Heure du test: ',
        },
      ];
    }

    if (/acces|video|lecture|contenu/.test(transcript)) {
      return [
        {
          label: 'Details acces',
          message: '**Probleme d acces**\n- Video ou module: \n- Message d erreur: \n- Navigateur/appareil: ',
        },
        {
          label: 'Probleme persiste',
          message: 'J ai teste a nouveau, le probleme persiste.',
        },
        {
          label: 'C est resolu',
          message: 'Merci, l acces fonctionne maintenant.',
        },
      ];
    }

    if (/connexion|compte|google|password|mot de passe/.test(transcript)) {
      return [
        {
          label: 'Details connexion',
          message: '**Probleme de connexion**\n- Email: \n- Etape bloquante: \n- Message affiche: ',
        },
        {
          label: 'Reset non recu',
          message: 'Je ne recois pas l email de reinitialisation.',
        },
        {
          label: 'Connexion OK',
          message: 'Merci, la connexion est retablie.',
        },
      ];
    }

    return [
      {
        label: 'Probleme paiement',
        message: '**Probleme de paiement**\n- Numero de recu: \n- Date: \n- Montant: ',
      },
      {
        label: 'Probleme acces video',
        message: '**Probleme d acces video**\n- Titre de la video: \n- Message d erreur: ',
      },
      {
        label: 'Probleme connexion',
        message: '**Probleme de connexion**\n- Email: \n- Etape bloquante: ',
      },
    ];
  }, [supportChatMessages]);

  const userAvatarInitial = useMemo(() => {
    const source = String(user?.displayName || user?.email || '').trim();
    if (!source) {
      return 'U';
    }
    return source.charAt(0).toUpperCase();
  }, [user?.displayName, user?.email]);

  const hasUserAvatarImage = Boolean(String(user?.photoURL || '').trim()) && !isUserAvatarFallback;

  const previewPartSources = useMemo(() => {
    const partUrls = Array.isArray(demoVideo?.parts)
      ? demoVideo.parts
          .map((part) => String(part?.secureUrl || '').trim())
          .filter((partUrl) => partUrl.length > 0)
      : [];

    if (partUrls.length > 0) {
      return partUrls;
    }

    const singleUrl = String(demoVideo?.url || '').trim();
    if (singleUrl) {
      return [singleUrl];
    }

    return [FALLBACK_DEMO_VIDEO_URL];
  }, [demoVideo]);

  const previewPartDurationHints = useMemo(
    () =>
      previewPartSources.map((_, index) => {
        const part = demoVideo?.parts?.[index];
        return parsePartDurationToSeconds(part?.duration);
      }),
    [demoVideo?.parts, previewPartSources],
  );

  const previewPartOffsets = useMemo(() => {
    const offsets: number[] = [0];
    for (let i = 0; i < previewPartSources.length; i += 1) {
      const hintedDuration = previewPartDurationHints[i] || 0;
      const measuredDuration = previewPartDurations[i] || 0;
      const effectiveDuration = hintedDuration > 0 ? hintedDuration : measuredDuration;
      offsets.push(offsets[i] + Math.max(0, effectiveDuration));
    }
    return offsets;
  }, [previewPartDurations, previewPartDurationHints, previewPartSources.length]);

  const previewMeasuredTotalDuration = useMemo(
    () => previewPartOffsets[previewPartOffsets.length - 1] || 0,
    [previewPartOffsets],
  );

  const previewFallbackDuration = useMemo(
    () => (demoVideo ? parseDurationToSeconds(demoVideo) : 0),
    [demoVideo],
  );

  const previewTotalDuration = useMemo(
    () => Math.max(previewMeasuredTotalDuration, previewFallbackDuration),
    [previewFallbackDuration, previewMeasuredTotalDuration],
  );

  const previewVideoUrl = previewPartSources[previewPartIndex] || previewPartSources[0] || FALLBACK_DEMO_VIDEO_URL;
  const isMultipartDemo = previewPartSources.length > 1;
  const youtubeVideoId = !isMultipartDemo ? extractYouTubeVideoId(previewVideoUrl) : null;
  const isYouTubeDemo = Boolean(youtubeVideoId);

  const clearHideControlsTimer = () => {
    if (hideControlsTimeoutRef.current !== null) {
      window.clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }
  };

  const scheduleHideControls = (delayMs = 1200) => {
    if (!isPlaying) return;
    clearHideControlsTimer();
    hideControlsTimeoutRef.current = window.setTimeout(() => {
      setAreVideoControlsVisible(false);
    }, delayMs);
  };

  const revealVideoControls = () => {
    setAreVideoControlsVisible(true);
    if (isPlaying) {
      scheduleHideControls();
    }
  };

  useEffect(() => {
    const nextPartCount = previewPartSources.length;

    if (nextPartCount === 0) {
      setPreviewPartIndex(0);
      setPreviewPartDurations([]);
      return;
    }

    setPreviewPartIndex((prev) => Math.min(prev, nextPartCount - 1));
    setPreviewPartDurations((prev) => {
      const next = new Array(nextPartCount).fill(0);
      for (let i = 0; i < nextPartCount; i += 1) {
        next[i] = Math.max(prev[i] || 0, previewPartDurationHints[i] || 0);
      }
      return next;
    });
  }, [previewPartDurationHints, previewPartSources.length]);

  useEffect(() => {
    let isMounted = true;

    const loadFirstDemoVideo = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'videos'));
        const demos = snapshot.docs
          .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<DemoVideo, 'id'>) }))
          .filter((video) => {
            const hasMainUrl = typeof video.url === 'string' && video.url.trim().length > 0;
            const hasPartUrls =
              Array.isArray(video.parts) &&
              video.parts.some((part) => typeof part?.secureUrl === 'string' && part.secureUrl.trim().length > 0);

            return Boolean(video.isFreeDemo && (hasMainUrl || hasPartUrls));
          });

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
      const clearUnfinishedFrame = window.requestAnimationFrame(() => {
        setUnfinishedVideos([]);
      });
      return () => {
        window.cancelAnimationFrame(clearUnfinishedFrame);
      };
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
              thumbnailUrl: getVideoThumbnailUrl(String(source.parts?.[0]?.secureUrl || source.url || '').trim()),
              subspecialtyLabel: formatSubspecialtyLabel(source.subspecialty),
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
    if (volumeLevel > 0) {
      lastNonZeroVolumeRef.current = volumeLevel;
    }
  }, [volumeLevel]);

  useEffect(() => {
    return () => {
      clearHideControlsTimer();
    };
  }, []);

  useEffect(() => {
    const resetStateFrame = window.requestAnimationFrame(() => {
      setPreviewPartIndex(0);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setAreVideoControlsVisible(true);
      setIsMuted(true);
    });

    return () => {
      window.cancelAnimationFrame(resetStateFrame);
    };
  }, [demoVideo?.id]);

  useEffect(() => {
    if (isYouTubeDemo) return;
    if (previewTotalDuration > 0) {
      setDuration(previewTotalDuration);
    }
  }, [isYouTubeDemo, previewTotalDuration]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || isYouTubeDemo) {
      return;
    }

    const currentPartOffset = previewPartOffsets[previewPartIndex] || 0;
    const hintedPartDuration =
      previewPartOffsets[previewPartIndex + 1] !== undefined
        ? Math.max(0, previewPartOffsets[previewPartIndex + 1] - currentPartOffset)
        : 0;

    const handleLoadedMetadata = () => {
      const localDuration = Number.isFinite(videoEl.duration) ? Math.max(0, videoEl.duration) : 0;

      if (localDuration > 0) {
        setPreviewPartDurations((prev) => {
          const next = [...prev];
          while (next.length < previewPartSources.length) {
            next.push(0);
          }
          next[previewPartIndex] = Math.max(next[previewPartIndex] || 0, localDuration);
          return next;
        });
      }

      const unifiedDuration = Math.max(previewTotalDuration, currentPartOffset + localDuration, currentPartOffset + hintedPartDuration);
      if (unifiedDuration > 0) {
        setDuration(unifiedDuration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(currentPartOffset + Math.max(0, videoEl.currentTime));
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setAreVideoControlsVisible(false);
    };
    const handlePause = () => {
      setIsPlaying(false);
      setAreVideoControlsVisible(true);
    };

    const handleEnded = () => {
      const isLastPart = previewPartIndex >= previewPartSources.length - 1;

      if (!isLastPart) {
        const nextPartIndex = previewPartIndex + 1;
        setPreviewPartIndex(nextPartIndex);
        setAreVideoControlsVisible(true);

        requestAnimationFrame(() => {
          const nextVideoEl = videoRef.current;
          if (!nextVideoEl) return;
          nextVideoEl.currentTime = 0;
          nextVideoEl.play().catch(() => {
            setIsPlaying(false);
          });
        });

        return;
      }

      const localDuration = Number.isFinite(videoEl.duration) ? Math.max(0, videoEl.duration) : hintedPartDuration;
      const finalTime = Math.max(previewTotalDuration, currentPartOffset + localDuration);

      setIsPlaying(false);
      setAreVideoControlsVisible(true);
      setCurrentTime(finalTime);
      if (finalTime > 0) {
        setDuration(finalTime);
      }
    };

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
  }, [isYouTubeDemo, previewPartIndex, previewPartOffsets, previewPartSources.length, previewTotalDuration]);

  useEffect(() => {
    if (isYouTubeDemo) return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const normalizedVolume = Math.min(1, Math.max(0, volumeLevel));
    videoEl.volume = normalizedVolume;
    videoEl.muted = isMuted || normalizedVolume <= 0;
  }, [isYouTubeDemo, isMuted, previewVideoUrl, volumeLevel]);

  useEffect(() => {
    if (isYouTubeDemo) return;
    if (!demoVideo) return;
    if (hasAutoPlayedRef.current) return;

    const videoEl = videoRef.current;
    if (!videoEl) return;

    hasAutoPlayedRef.current = true;
    setIsMuted(true);
    videoEl.muted = true;

    videoEl
      .play()
      .then(() => {
        setIsPlaying(true);
        setAreVideoControlsVisible(false);
      })
      .catch(() => {
        setIsPlaying(false);
        setAreVideoControlsVisible(true);
      });
  }, [demoVideo, isYouTubeDemo]);

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
          autoplay: 1,
          controls: 0,
          mute: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            if (isDisposed) return;
            const videoDuration = event.target.getDuration?.() ?? 0;
            setDuration(Number.isFinite(videoDuration) ? videoDuration : 0);

            if (!hasAutoPlayedRef.current) {
              hasAutoPlayedRef.current = true;
              setIsMuted(true);
              event.target.setVolume?.(0);
              event.target.mute?.();
              event.target.playVideo?.();
              setAreVideoControlsVisible(false);
            }
          },
          onStateChange: (event) => {
            const playingState = 1;
            const pausedState = 2;
            const endedState = 0;

            if (event.data === playingState) {
              setIsPlaying(true);
              setAreVideoControlsVisible(false);
            }

            if (event.data === pausedState || event.data === endedState) {
              setIsPlaying(false);
              setAreVideoControlsVisible(true);
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

    const normalizedVolume = Math.round(Math.min(1, Math.max(0, volumeLevel)) * 100);
    youtubePlayerRef.current.setVolume?.(normalizedVolume);

    if (isMuted || normalizedVolume <= 0) {
      youtubePlayerRef.current.mute?.();
    } else {
      youtubePlayerRef.current.unMute?.();
    }
  }, [isMuted, isYouTubeDemo, volumeLevel]);

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

  const togglePreviewPlayback = async () => {
    revealVideoControls();

    if (isYouTubeDemo && youtubePlayerRef.current) {
      if (isPlaying) {
        youtubePlayerRef.current.pauseVideo?.();
      } else {
        youtubePlayerRef.current.playVideo?.();
        setAreVideoControlsVisible(false);
      }
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (videoEl.paused) {
      try {
        await videoEl.play();
        setAreVideoControlsVisible(false);
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

    if (isMultipartDemo && previewTotalDuration > 0) {
      const targetGlobalTime = (clampedPercent / 100) * previewTotalDuration;

      let targetPartIndex = previewPartSources.length - 1;
      for (let index = 0; index < previewPartSources.length; index += 1) {
        const startOffset = previewPartOffsets[index] || 0;
        const endOffset =
          index === previewPartSources.length - 1
            ? previewTotalDuration
            : previewPartOffsets[index + 1] || previewTotalDuration;

        if (targetGlobalTime >= startOffset && targetGlobalTime <= endOffset) {
          targetPartIndex = index;
          break;
        }
      }

      const targetLocalTime = Math.max(0, targetGlobalTime - (previewPartOffsets[targetPartIndex] || 0));

      if (targetPartIndex !== previewPartIndex) {
        setPreviewPartIndex(targetPartIndex);
        requestAnimationFrame(() => {
          const nextVideoEl = videoRef.current;
          if (!nextVideoEl) return;
          nextVideoEl.currentTime = targetLocalTime;
          if (isPlaying) {
            nextVideoEl.play().catch(() => {
              setIsPlaying(false);
            });
          }
        });
      } else {
        const currentVideoEl = videoRef.current;
        if (currentVideoEl) {
          currentVideoEl.currentTime = targetLocalTime;
        }
      }

      setCurrentTime(targetGlobalTime);
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return;

    videoEl.currentTime = (clampedPercent / 100) * videoEl.duration;
    setCurrentTime(videoEl.currentTime);
  };

  const handleVolumeChange = (nextPercent: number) => {
    revealVideoControls();

    const clampedPercent = Math.min(100, Math.max(0, nextPercent));
    const nextVolume = clampedPercent / 100;
    const shouldMute = nextVolume <= 0;

    if (!shouldMute) {
      lastNonZeroVolumeRef.current = nextVolume;
    }

    setVolumeLevel(nextVolume);
    setIsMuted(shouldMute);

    if (isYouTubeDemo && youtubePlayerRef.current) {
      youtubePlayerRef.current.setVolume?.(Math.round(nextVolume * 100));
      if (shouldMute) {
        youtubePlayerRef.current.mute?.();
      } else {
        youtubePlayerRef.current.unMute?.();
      }
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.volume = nextVolume;
    videoEl.muted = shouldMute;
  };

  const toggleMute = () => {
    revealVideoControls();

    const shouldEnableAudio = isMuted || volumeLevel <= 0;

    if (shouldEnableAudio) {
      const restoredVolume = Math.max(lastNonZeroVolumeRef.current, 0.1);
      setVolumeLevel(restoredVolume);
      setIsMuted(false);

      if (isYouTubeDemo && youtubePlayerRef.current) {
        youtubePlayerRef.current.setVolume?.(Math.round(restoredVolume * 100));
        youtubePlayerRef.current.unMute?.();
      } else if (videoRef.current) {
        videoRef.current.volume = restoredVolume;
        videoRef.current.muted = false;
      }

      return;
    }

    setIsMuted(true);

    if (isYouTubeDemo && youtubePlayerRef.current) {
      youtubePlayerRef.current.mute?.();
    } else if (videoRef.current) {
      videoRef.current.muted = true;
    }
  };

  useEffect(() => {
    const loadUserSupportChats = async () => {
      if (!user || isAdmin) {
        setSupportChats([]);
        setActiveSupportChatId('');
        setSupportChatMessages([]);
        return;
      }

      try {
        const chatsSnap = await getDocs(query(collection(db, 'supportChats'), where('userId', '==', user.uid)));
        const nextSupportChats = chatsSnap.docs
          .map((entry) => ({ id: entry.id, ...(entry.data() as SupportChat) }))
          .sort((a, b) => {
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return bTime - aTime;
          });

        if (nextSupportChats.length === 0) {
          const welcomeChatId = await ensureWelcomeSupportChat();
          if (welcomeChatId) {
            await loadSupportMessagesByChatId(welcomeChatId);
          }
          return;
        }

        setSupportChats(nextSupportChats);
        setActiveSupportChatId((current) => {
          if (current && nextSupportChats.some((chat) => chat.id === current)) {
            return current;
          }
          return nextSupportChats[0]?.id || '';
        });
      } catch (error) {
        if (isApiUnavailableError(error)) {
          return;
        }

        console.error('Error loading support chats:', error);
      }
    };

    void loadUserSupportChats();
  }, [user, isAdmin]);

  const loadSupportMessagesByChatId = async (chatId: string) => {
    if (!chatId || !user || isAdmin) {
      setSupportChatMessages([]);
      return;
    }

    try {
      const messagesSnap = await getDocs(query(collection(db, 'supportChatMessages'), where('chatId', '==', chatId)));
      const nextMessages = messagesSnap.docs
        .map((entry) => ({ id: entry.id, ...(entry.data() as SupportChatMessage) }))
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return aTime - bTime;
        });
      setSupportChatMessages(nextMessages);
    } catch (error) {
      if (isApiUnavailableError(error)) {
        return;
      }

      console.error('Error loading support chat messages:', error);
    }
  };

  useEffect(() => {
    void loadSupportMessagesByChatId(activeSupportChatId);
  }, [activeSupportChatId, user, isAdmin]);

  useEffect(() => {
    if (!user || isAdmin || !isChatOpen) {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const chatsSnap = await getDocs(query(collection(db, 'supportChats'), where('userId', '==', user.uid)));
          const nextChats = chatsSnap.docs
            .map((entry) => ({ id: entry.id, ...(entry.data() as SupportChat) }))
            .sort((a, b) => {
              const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
              const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
              return bTime - aTime;
            });

          if (nextChats.length === 0) {
            const welcomeChatId = await ensureWelcomeSupportChat();
            if (welcomeChatId) {
              await loadSupportMessagesByChatId(welcomeChatId);
            }
            return;
          }

          setSupportChats(nextChats);

          const selectedChatId = activeSupportChatId || nextChats[0]?.id || '';
          if (!activeSupportChatId && selectedChatId) {
            setActiveSupportChatId(selectedChatId);
          }

          if (selectedChatId) {
            await loadSupportMessagesByChatId(selectedChatId);
          }

          hasLoggedSupportPollingApiDownRef.current = false;
        } catch (error) {
          if (isApiUnavailableError(error)) {
            if (!hasLoggedSupportPollingApiDownRef.current) {
              console.warn('Support polling paused: backend API is temporarily unreachable.');
              hasLoggedSupportPollingApiDownRef.current = true;
            }
            return;
          }

          console.error('Error polling support chat:', error);
        }
      })();
    }, 4000);

    return () => {
      window.clearInterval(timer);
    };
  }, [user, activeSupportChatId, isAdmin, isChatOpen]);

  useEffect(() => {
    if (!isChatOpen) {
      return;
    }

    shouldStickSupportScrollRef.current = true;
  }, [isChatOpen]);

  useEffect(() => {
    if (!isChatOpen) {
      return;
    }

    const container = supportMessagesContainerRef.current;
    if (!container) {
      return;
    }

    const didChangeChat = previousSupportChatIdRef.current !== activeSupportChatId;
    if (didChangeChat) {
      container.scrollTop = container.scrollHeight;
      shouldStickSupportScrollRef.current = true;
      previousSupportChatIdRef.current = activeSupportChatId;
      return;
    }

    if (shouldStickSupportScrollRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [isChatOpen, activeSupportChatId, supportChatMessages]);

  const handleSupportMessagesScroll = () => {
    const container = supportMessagesContainerRef.current;
    if (!container) {
      return;
    }

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickSupportScrollRef.current = distanceFromBottom <= 72;
  };

  useEffect(() => {
    setIsUserAvatarFallback(false);
  }, [user?.photoURL]);

  useEffect(() => {
    if (!isChatOpen || !user || isAdmin) {
      return;
    }

    if (supportChats.length > 0) {
      return;
    }

    void (async () => {
      const chatId = await ensureWelcomeSupportChat();
      if (chatId) {
        await loadSupportMessagesByChatId(chatId);
      }
    })();
  }, [isChatOpen, user, isAdmin, supportChats.length]);

  useEffect(() => {
    if (!isAdmin || !isChatOpen) {
      return;
    }

    setIsChatOpen(false);
  }, [isAdmin, isChatOpen]);

  const supportIntroMessage = () => {
    return buildWelcomeBotMessage();
  };

  const applyQuickReply = (template: string) => {
    setChatComposer((current) => (current.trim() ? `${current}\n${template}` : template));
  };

  const renderSenderAvatar = (sender: SupportChatMessage['sender']) => {
    if (sender === 'user') {
      if (hasUserAvatarImage) {
        return (
          <img
            src={String(user?.photoURL || '')}
            alt="Avatar utilisateur"
            className="h-8 w-8 rounded-full object-cover ring-1 ring-slate-300"
            referrerPolicy="no-referrer"
            onError={() => setIsUserAvatarFallback(true)}
          />
        );
      }

      return (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white ring-1 ring-slate-300">
          {userAvatarInitial}
        </span>
      );
    }

    if (sender === 'admin') {
      return (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-xs font-semibold text-white ring-1 ring-emerald-200">
          A
        </span>
      );
    }

    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-700 text-xs font-semibold text-white ring-1 ring-amber-200">
        B
      </span>
    );
  };

  const resolveSenderLabel = (message: SupportChatMessage) => {
    if (message.sender === 'bot') {
      return message.senderName || 'DEMS-ORL-Bot';
    }
    if (message.sender === 'admin') {
      return message.senderName || 'Admin';
    }
    return 'Vous';
  };

  const formatInlineMarkdown = (text: string): ReactNode[] => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={`strong-${index}`}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={`em-${index}`}>{part.slice(1, -1)}</em>;
      }
      return <span key={`span-${index}`}>{part}</span>;
    });
  };

  const renderMessageMarkdown = (raw: string) => {
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const nodes: ReactNode[] = [];

    let cursor = 0;
    while (cursor < lines.length) {
      const line = lines[cursor] || '';
      const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
      const unorderedMatch = line.match(/^\s*[-+]\s+(.+)$/);

      if (!line.trim()) {
        nodes.push(<div key={`space-${cursor}`} className="h-2" />);
        cursor += 1;
        continue;
      }

      if (orderedMatch) {
        const items: string[] = [];
        let nextCursor = cursor;
        while (nextCursor < lines.length) {
          const nextLine = lines[nextCursor] || '';
          const nextMatch = nextLine.match(/^\s*\d+\.\s+(.+)$/);
          if (!nextMatch) {
            break;
          }
          items.push(nextMatch[1]);
          nextCursor += 1;
        }

        nodes.push(
          <ol key={`ol-${cursor}`} className="list-decimal pl-5 space-y-1">
            {items.map((item, index) => (
              <li key={`ol-item-${cursor}-${index}`}>{formatInlineMarkdown(item)}</li>
            ))}
          </ol>,
        );
        cursor = nextCursor;
        continue;
      }

      if (unorderedMatch) {
        const items: string[] = [];
        let nextCursor = cursor;
        while (nextCursor < lines.length) {
          const nextLine = lines[nextCursor] || '';
          const nextMatch = nextLine.match(/^\s*[-+]\s+(.+)$/);
          if (!nextMatch) {
            break;
          }
          items.push(nextMatch[1]);
          nextCursor += 1;
        }

        nodes.push(
          <ul key={`ul-${cursor}`} className="list-disc pl-5 space-y-1">
            {items.map((item, index) => (
              <li key={`ul-item-${cursor}-${index}`}>{formatInlineMarkdown(item)}</li>
            ))}
          </ul>,
        );
        cursor = nextCursor;
        continue;
      }

      nodes.push(
        <p key={`p-${cursor}`} className="leading-relaxed">
          {formatInlineMarkdown(line)}
        </p>,
      );
      cursor += 1;
    }

    return <div className="space-y-1">{nodes}</div>;
  };

  const createSupportChatFromFirstMessage = async (firstMessage: string) => {
    if (!user) {
      return null;
    }

    const now = new Date().toISOString();
    const newChatId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userMessageId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}-u`;
    const botMessageId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}-b`;
    const introText = supportIntroMessage();

    await setDoc(doc(db, 'supportChats', newChatId), {
      userId: user.uid,
      userEmail: user.email || '',
      problemType: 'other' as SupportProblemType,
      status: 'open',
      lastMessage: firstMessage,
      lastSender: 'user',
      createdAt: now,
      updatedAt: now,
    });

    await setDoc(doc(db, 'supportChatMessages', userMessageId), {
      chatId: newChatId,
      userId: user.uid,
      sender: 'user',
      senderName: user.displayName || user.email || 'Utilisateur',
      text: firstMessage,
      createdAt: now,
    });

    await setDoc(doc(db, 'supportChatMessages', botMessageId), {
      chatId: newChatId,
      userId: user.uid,
      sender: 'bot',
      senderName: 'DEMS-ORL-Bot',
      text: introText,
      createdAt: new Date(Date.now() + 250).toISOString(),
    });

    await updateDoc(doc(db, 'supportChats', newChatId), {
      lastMessage: introText,
      lastSender: 'bot',
      updatedAt: new Date(Date.now() + 250).toISOString(),
    });

    return newChatId;
  };

  const ensureWelcomeSupportChat = async (): Promise<string> => {
    if (!user || isEnsuringWelcomeChatRef.current) {
      return '';
    }

    isEnsuringWelcomeChatRef.current = true;
    try {
      const existingChatsSnap = await getDocs(query(collection(db, 'supportChats'), where('userId', '==', user.uid)));
      const existingChats = existingChatsSnap.docs
        .map((entry) => ({ id: entry.id, ...(entry.data() as SupportChat) }))
        .sort((a, b) => {
          const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bTime - aTime;
        });

      if (existingChats.length > 0) {
        const selectedId = activeSupportChatId && existingChats.some((chat) => chat.id === activeSupportChatId)
          ? activeSupportChatId
          : existingChats[0].id;
        setSupportChats(existingChats);
        setActiveSupportChatId(selectedId);
        return selectedId;
      }

      const now = new Date().toISOString();
      const newChatId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const welcomeMessageId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}-welcome`;
      const welcomeText = buildWelcomeBotMessage();

      await setDoc(doc(db, 'supportChats', newChatId), {
        userId: user.uid,
        userEmail: user.email || '',
        problemType: 'other' as SupportProblemType,
        status: 'open',
        lastMessage: welcomeText,
        lastSender: 'bot',
        createdAt: now,
        updatedAt: now,
      });

      await setDoc(doc(db, 'supportChatMessages', welcomeMessageId), {
        chatId: newChatId,
        userId: user.uid,
        sender: 'bot',
        senderName: 'DEMS-ORL-Bot',
        text: welcomeText,
        createdAt: now,
      });

      setSupportChats([
        {
          id: newChatId,
          userId: user.uid,
          userEmail: user.email || '',
          problemType: 'other',
          status: 'open',
          lastMessage: welcomeText,
          lastSender: 'bot',
          createdAt: now,
          updatedAt: now,
        },
      ]);
      setActiveSupportChatId(newChatId);
      return newChatId;
    } catch (error) {
      console.error('Error ensuring welcome support chat:', error);
      return '';
    } finally {
      isEnsuringWelcomeChatRef.current = false;
    }
  };

  const deleteSupportChatById = async (chatId: string) => {
    if (!chatId) {
      return;
    }

    const messagesSnap = await getDocs(query(collection(db, 'supportChatMessages'), where('chatId', '==', chatId)));
    await Promise.all(messagesSnap.docs.map((entry) => deleteDoc(doc(db, 'supportChatMessages', entry.id))));
    await deleteDoc(doc(db, 'supportChats', chatId));
  };

  const handleResolveAndDeleteSupportChat = async () => {
    if (!activeSupportChatId) {
      return;
    }

    const shouldDelete = window.confirm('Marquer ce probleme comme resolu et supprimer la discussion ?');
    if (!shouldDelete) {
      return;
    }

    try {
      const removedChatId = activeSupportChatId;
      await deleteSupportChatById(removedChatId);

      setSupportChats((prev) => prev.filter((chat) => chat.id !== removedChatId));
      setActiveSupportChatId('');
      setSupportChatMessages([]);

      const nextChatId = await ensureWelcomeSupportChat();
      if (nextChatId) {
        await loadSupportMessagesByChatId(nextChatId);
      }
    } catch (error) {
      console.error('Error deleting support chat:', error);
      alert('Impossible de supprimer cette discussion.');
    }
  };

  const handleSendChatMessage = async () => {
    if (!user || isSendingChatMessage || isActiveSupportChatResolved) {
      return;
    }

    const trimmedMessage = chatComposer.trim();
    if (!trimmedMessage) {
      return;
    }

    setIsSendingChatMessage(true);
    try {
      if (!activeSupportChatId) {
        const createdChatId = await createSupportChatFromFirstMessage(trimmedMessage);
        if (!createdChatId) {
          return;
        }

        setActiveSupportChatId(createdChatId);
        setChatComposer('');
        setIsChatOpen(true);

        const chatsSnap = await getDocs(query(collection(db, 'supportChats'), where('userId', '==', user.uid)));
        const nextChats = chatsSnap.docs
          .map((entry) => ({ id: entry.id, ...(entry.data() as SupportChat) }))
          .sort((a, b) => {
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return bTime - aTime;
          });
        setSupportChats(nextChats);
        await loadSupportMessagesByChatId(createdChatId);
      } else {
        const now = new Date().toISOString();
        const messageId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}-m`;
        const botMessageId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}-bot`;
        const botWaitingText = buildWaitingBotSuggestion();

        await setDoc(doc(db, 'supportChatMessages', messageId), {
          chatId: activeSupportChatId,
          userId: user.uid,
          sender: 'user',
          senderName: user.displayName || user.email || 'Utilisateur',
          text: trimmedMessage,
          createdAt: now,
        });

        await setDoc(doc(db, 'supportChatMessages', botMessageId), {
          chatId: activeSupportChatId,
          userId: user.uid,
          sender: 'bot',
          senderName: 'DEMS-ORL-Bot',
          text: botWaitingText,
          createdAt: new Date(Date.now() + 250).toISOString(),
        });

        await updateDoc(doc(db, 'supportChats', activeSupportChatId), {
          lastMessage: botWaitingText,
          lastSender: 'bot',
          updatedAt: new Date(Date.now() + 250).toISOString(),
          status: activeSupportChat?.status === 'resolved' ? 'open' : activeSupportChat?.status || 'open',
        });

        setChatComposer('');
        await loadSupportMessagesByChatId(activeSupportChatId);
      }
    } catch (error) {
      console.error('Error sending support message:', error);
      alert('Impossible d envoyer votre message.');
    } finally {
      setIsSendingChatMessage(false);
    }
  };

  const effectivePlaybackDuration = isYouTubeDemo ? duration : Math.max(duration, previewTotalDuration);
  const progressPercent = effectivePlaybackDuration > 0 ? (currentTime / effectivePlaybackDuration) * 100 : 0;
  const volumePercent = Math.round((isMuted ? 0 : volumeLevel) * 100);
  const previewTitle = demoVideo?.title || "Anatomie de l'Oreille Moyenne";
  const previewSubspecialty = formatSubspecialtyLabel(demoVideo?.subspecialty);
  const previewDurationLabel = formatDemoDurationLabel(demoVideo, effectivePlaybackDuration);
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
      title: 'QCM + QROC',
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
    { step: '03', title: 'Validez par évaluation active', text: 'QCM et QROC pour fixer les automatismes utiles.' },
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
            sizes="100vw"
            loading="eager"
            className="object-cover opacity-20"
            referrerPolicy="no-referrer"
            onError={(event) => applyImageFallback(event, IMAGE_FALLBACK_SRC)}
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
                    Reprenez la lecture de vos contenus en cours
                  </h2>
                </div>
                <span className="text-sm font-semibold" style={{ color: 'color-mix(in oklab, var(--app-accent) 76%, var(--app-text) 24%)' }}>
                  {unfinishedVideos.length} en cours
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {unfinishedVideos.map((item) => {
                  const theme = getUnfinishedVideoTheme(item.subspecialtyLabel);

                  return (
                    <Link
                      key={item.id}
                      href={`/videos/${item.id}`}
                      className="group overflow-hidden rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-lg"
                      style={{
                        borderColor: theme.borderColor,
                        background: theme.background,
                      }}
                    >
                      <div className="relative aspect-video overflow-hidden bg-slate-900">
                        <Image
                          src={item.thumbnailUrl || VIDEO_CARD_PLACEHOLDER}
                          alt={item.title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(event) => applyImageFallback(event, VIDEO_FALLBACK_SRC)}
                        />
                        <div className="absolute inset-x-0 top-0 h-1" style={{ background: theme.stripeGradient }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                        <div className={`absolute top-3 left-3 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${theme.chipClass}`} style={{ borderColor: 'rgba(255,255,255,0.35)' }}>
                          {item.subspecialtyLabel}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border"
                            style={{ borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
                          >
                            <PlayCircle className="h-7 w-7" />
                          </span>
                        </div>
                      </div>

                      <div className="p-4">
                        <p className="font-semibold line-clamp-2 mb-3" style={{ color: 'var(--app-text)' }}>{item.title}</p>

                        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'color-mix(in oklab, var(--app-border) 76%, transparent)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${item.progressPercent}%`,
                              background: theme.progressGradient,
                            }}
                          />
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--app-muted)' }}>
                          <span>Reste {formatClock(item.remainingSeconds)}</span>
                          <span>{formatClock(item.currentTime)} / {formatClock(item.duration)}</span>
                        </div>
                      </div>

                      <div className="px-4 pb-4 text-xs font-semibold" style={{ color: theme.ctaColor }}>
                        Reprendre maintenant
                      </div>
                    </Link>
                  );
                })}
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
          <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-16 items-center">
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
                className={`aspect-video rounded-3xl overflow-hidden shadow-2xl relative ${isPlaying && !areVideoControlsVisible ? 'cursor-none' : 'cursor-default'}`}
                onMouseMove={revealVideoControls}
                onMouseEnter={revealVideoControls}
                onMouseLeave={() => {
                  if (!isPlaying) return;
                  clearHideControlsTimer();
                  setAreVideoControlsVisible(false);
                }}
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
                    className="h-full w-full object-contain bg-black"
                    playsInline
                    preload="metadata"
                    onClick={togglePreviewPlayback}
                  />
                )}
                <motion.div
                  className="absolute inset-0 z-20 flex items-end p-8"
                  animate={{ opacity: areVideoControlsVisible ? 1 : 0, y: areVideoControlsVisible ? 0 : 28 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  style={{
                    pointerEvents: areVideoControlsVisible ? 'auto' : 'none',
                    background: 'var(--demo-video-overlay)',
                  }}
                >
                  <div
                    className="backdrop-blur-md border rounded-2xl p-6 w-full"
                    style={{
                      backgroundColor: 'var(--demo-video-card-bg)',
                      borderColor: 'var(--demo-video-card-border)',
                      color: 'var(--demo-video-title)',
                    }}
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <button
                        type="button"
                        onClick={togglePreviewPlayback}
                        aria-label={isPlaying ? 'Pause preview video' : 'Play preview video'}
                        className="w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-105"
                        style={{ backgroundColor: 'var(--app-accent)' }}
                      >
                        {isPlaying ? (
                          <Pause className="h-6 w-6" style={{ color: 'var(--app-accent-contrast)' }} />
                        ) : (
                          <PlayCircle className="h-6 w-6" style={{ color: 'var(--app-accent-contrast)' }} />
                        )}
                      </button>
                      <div>
                        <p className="font-semibold" style={{ color: 'var(--demo-video-title)' }}>{previewTitle}</p>
                        <p
                          className="text-sm"
                          style={{ color: 'var(--demo-video-subtitle)' }}
                        >
                          Module {previewSubspecialty} • {previewDurationLabel}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div
                        className="w-full rounded-full h-2 relative"
                        style={{ backgroundColor: 'var(--demo-video-track-bg)' }}
                      >
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${progressPercent}%`,
                            backgroundColor: 'var(--demo-video-track-fill)',
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
                          className="absolute inset-0 h-2 w-full cursor-pointer demo-video-seek"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div
                          className="flex items-center gap-3 text-xs"
                          style={{ color: 'var(--demo-video-time)' }}
                        >
                          <span>{formatClock(currentTime)}</span>
                          <span>•</span>
                          <span>{formatClock(effectivePlaybackDuration)}</span>
                        </div>
                        <div className="flex items-center gap-2 min-w-[132px]">
                          <button
                            type="button"
                            onClick={toggleMute}
                            aria-label={isMuted || volumePercent === 0 ? 'Activer le son' : 'Couper le son'}
                            className="h-8 w-8 rounded-full border flex items-center justify-center transition-colors"
                            style={{
                              borderColor: 'color-mix(in oklab, var(--demo-video-card-border) 78%, transparent)',
                              backgroundColor: 'color-mix(in oklab, var(--demo-video-card-bg) 82%, transparent)',
                              color: 'var(--demo-video-time)',
                            }}
                          >
                            {isMuted || volumePercent === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                          </button>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={volumePercent}
                            onChange={(event) => handleVolumeChange(Number(event.target.value))}
                            aria-label="Contrôle du volume"
                            className="demo-video-volume w-full"
                            style={{
                              background: `linear-gradient(90deg, var(--demo-video-track-fill) 0%, var(--demo-video-track-fill) ${volumePercent}%, var(--demo-video-track-bg) ${volumePercent}%, var(--demo-video-track-bg) 100%)`,
                            }}
                          />
                        </div>
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

      {!isAdmin ? (
        <div className="fixed bottom-5 right-5 z-[70]">
          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsChatOpen((current) => !current)}
            className="h-14 w-14 rounded-full shadow-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, color-mix(in oklab, var(--app-accent) 90%, #ffe5c6 10%), color-mix(in oklab, var(--app-accent) 70%, #1e1e1e 30%))',
              color: 'var(--app-accent-contrast)',
            }}
            aria-label={isChatOpen ? 'Fermer le chatbot support' : 'Ouvrir le chatbot support'}
          >
            {isChatOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
          </motion.button>

          {isChatOpen ? (
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-16 right-0 flex h-[min(74vh,640px)] w-[min(92vw,390px)] flex-col rounded-3xl border shadow-2xl overflow-hidden"
              style={{
                borderColor: 'color-mix(in oklab, var(--app-border) 84%, var(--app-accent) 16%)',
                background: 'color-mix(in oklab, var(--app-surface) 96%, white 4%)',
              }}
            >
            <div
              className="px-4 py-3 border-b"
              style={{
                borderColor: 'color-mix(in oklab, var(--app-border) 88%, var(--app-accent) 12%)',
                background: 'color-mix(in oklab, var(--app-surface) 98%, white 2%)',
              }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>Support DEMS ENT</p>
              <p className="text-xs" style={{ color: 'var(--app-muted)' }}>Chat en direct avec suivi admin.</p>
              {activeSupportChat ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border"
                    style={{
                      borderColor: adminSupportPresence.isOnline
                        ? 'color-mix(in oklab, #6b8e23 44%, var(--app-border) 56%)'
                        : 'color-mix(in oklab, #8b6f47 44%, var(--app-border) 56%)',
                      backgroundColor: adminSupportPresence.isOnline
                        ? 'color-mix(in oklab, #7a8b52 18%, var(--app-surface) 82%)'
                        : 'color-mix(in oklab, #a27b56 16%, var(--app-surface) 84%)',
                      color: adminSupportPresence.isOnline
                        ? 'color-mix(in oklab, #3f4f24 74%, var(--app-text) 26%)'
                        : 'color-mix(in oklab, #5f4630 74%, var(--app-text) 26%)',
                    }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor: adminSupportPresence.isOnline ? '#6b8e23' : '#8b6f47',
                      }}
                    />
                    Statut : {adminSupportStatusLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleResolveAndDeleteSupportChat()}
                    className="text-[11px] px-2 py-1 rounded-md border"
                    style={{ borderColor: 'color-mix(in oklab, var(--app-danger) 42%, var(--app-border) 58%)', color: 'var(--app-danger)' }}
                  >
                    Resolu & Supprimer
                  </button>
                </div>
              ) : null}
            </div>

            {!isAuthReady ? (
              <div className="p-4 text-sm" style={{ color: 'var(--app-muted)' }}>Chargement...</div>
            ) : !user ? (
              <div className="p-4 space-y-3">
                <p className="text-sm" style={{ color: 'var(--app-text)' }}>
                  Connectez-vous pour discuter avec le support et recevoir les reponses admin en temps reel.
                </p>
                <div className="flex gap-2">
                  <Link href="/sign-in" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ backgroundColor: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}>
                    Se connecter
                  </Link>
                  <Link href="/sign-up" className="rounded-xl px-4 py-2 text-sm font-semibold border" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
                    Creer un compte
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {supportChats.length > 1 ? (
                  <div className="px-4 py-2 border-b" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 88%, var(--app-accent) 12%)' }}>
                    <div className="flex gap-2 overflow-x-auto">
                      {supportChats.map((chat) => (
                        <button
                          key={chat.id}
                          type="button"
                          onClick={() => setActiveSupportChatId(chat.id)}
                          className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold"
                          style={{
                            borderColor: activeSupportChatId === chat.id ? 'var(--app-accent)' : 'var(--app-border)',
                            backgroundColor: activeSupportChatId === chat.id ? 'color-mix(in oklab, var(--app-accent) 14%, var(--app-surface) 86%)' : 'var(--app-surface)',
                            color: 'var(--app-text)',
                          }}
                        >
                          {chat.problemType}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div
                  ref={supportMessagesContainerRef}
                  onScroll={handleSupportMessagesScroll}
                  className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
                  style={{ backgroundColor: 'color-mix(in oklab, var(--app-surface-alt) 36%, var(--app-surface) 64%)' }}
                >
                  {supportChatMessages.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--app-muted)' }}>
                      Aucun message pour le moment. Demarrez une conversation.
                    </p>
                  ) : (
                    supportChatMessages.map((message) => {
                      const isUserMessage = message.sender === 'user';

                      return (
                      <div
                        key={message.id}
                        className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex max-w-[94%] gap-3 ${isUserMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className="pt-0.5">{renderSenderAvatar(message.sender)}</div>
                          <div
                            className="rounded-2xl border px-3 py-2 text-sm"
                            style={{
                              backgroundColor: isUserMessage
                                ? 'color-mix(in oklab, var(--app-surface) 90%, white 10%)'
                                : message.sender === 'admin'
                                  ? 'color-mix(in oklab, var(--app-surface-alt) 72%, var(--app-accent) 28%)'
                                  : 'var(--app-surface)',
                              color: 'var(--app-text)',
                              borderColor: 'color-mix(in oklab, var(--app-border) 88%, var(--app-accent) 12%)',
                            }}
                          >
                            <p className="text-[10px] uppercase tracking-wide opacity-70 mb-1">{resolveSenderLabel(message)}</p>
                            <div>{renderMessageMarkdown(message.text)}</div>
                          </div>
                        </div>
                      </div>
                    );
                    })
                  )}

                  {!isActiveSupportChatResolved && quickReplyOptions.length > 0 ? (
                    <div className="flex justify-start">
                      <div className="flex max-w-[94%] gap-3">
                        <div className="pt-0.5">{renderSenderAvatar('bot')}</div>
                        <div
                          className="rounded-2xl border px-3 py-2"
                          style={{
                            backgroundColor: 'var(--app-surface)',
                            color: 'var(--app-text)',
                            borderColor: 'color-mix(in oklab, var(--app-border) 88%, var(--app-accent) 12%)',
                          }}
                        >
                          <p className="text-[10px] uppercase tracking-wide opacity-70 mb-1">DEMS-ORL-Bot</p>
                          <p className="text-xs mb-2" style={{ color: 'var(--app-muted)' }}>Suggestions selon votre contexte</p>
                          <div className="flex flex-wrap gap-2">
                      {quickReplyOptions.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => applyQuickReply(option.message)}
                          className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold"
                          style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
                        >
                          {option.label}
                        </button>
                      ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="border-t px-2.5 pb-2 pt-1.5" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 88%, var(--app-accent) 12%)', backgroundColor: 'color-mix(in oklab, var(--app-surface) 98%, white 2%)' }}>
                  <div
                    className="mx-0.5 flex flex-col rounded-[18px] border transition-all duration-200 hover:shadow-lg focus-within:shadow-xl"
                    style={{
                      borderColor: 'color-mix(in oklab, var(--app-border) 86%, var(--app-accent) 14%)',
                      backgroundColor: 'var(--app-surface)',
                      boxShadow: '0 0.25rem 1.25rem color-mix(in oklab, black 6%, transparent), 0 0 0 0.5px color-mix(in oklab, var(--app-border) 82%, transparent)',
                    }}
                  >
                    <div className="m-2.5 flex flex-col gap-2">
                      <div className="relative">
                        <textarea
                          ref={chatComposerRef}
                          value={chatComposer}
                          onChange={(event) => setChatComposer(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                              event.preventDefault();
                              void handleSendChatMessage();
                            }
                          }}
                          disabled={isActiveSupportChatResolved}
                          placeholder={
                            isActiveSupportChatResolved
                              ? 'Conversation resolue'
                              : 'Ecrivez votre message...'
                          }
                          rows={chatComposerRows}
                          className="w-full max-h-24 min-h-0 border-0 bg-transparent text-sm leading-5 resize-none outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:border-transparent"
                          style={{ color: 'var(--app-text)' }}
                        />
                      </div>

                      <div className="relative flex w-full items-center gap-2">
                        <div className="relative flex min-w-0 flex-1 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => chatComposerRef.current?.focus()}
                            className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
                            style={{ color: 'var(--app-text)', backgroundColor: 'color-mix(in oklab, var(--app-surface-alt) 64%, var(--app-surface) 36%)' }}
                            aria-label="Ajouter"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className={`transition-all duration-200 ease-out ${showSendComposerAction ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none'}`}>
                          <button
                            type="button"
                            onClick={() => void handleSendChatMessage()}
                            disabled={isSendingChatMessage || !showSendComposerAction}
                            className="h-7 w-7 rounded-lg disabled:opacity-60 flex items-center justify-center"
                            style={{ backgroundColor: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}
                            aria-label="Envoyer"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="mt-1 px-2 text-[10px]" style={{ color: 'var(--app-muted)' }}>
                    Ctrl/Cmd + Entree pour envoyer
                  </p>
                </div>
              </>
            )}
            </motion.div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
