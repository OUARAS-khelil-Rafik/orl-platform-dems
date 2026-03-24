'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { db, doc, getDoc, collection, query, where, getDocs, addDoc } from '@/lib/local-data';
import { useAuth } from '@/components/providers/auth-provider';
import { useCart } from '@/components/providers/cart-provider';
import { canAccessVideo } from '@/lib/access-control';
import type {
  CaseQuestionModel,
  CaseQuestionUiState,
  ClinicalCaseModel,
  DiagramModel,
  OpenQuestionModel,
  QcmModel,
  VideoModel,
} from '@/lib/models';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, BookOpen, 
  CheckCircle2, 
  MessageSquare,
  Image as ImageIcon, 
  Lock, 
  ShieldAlert, 
  ShoppingCart,
  X,
  Maximize2,
  AlertCircle,
  RotateCcw,
  SendHorizontal,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  ClipboardList,
} from 'lucide-react';
import Image from 'next/image';

type VideoTab = 'cas' | 'open' | 'qcm' | 'schemas';

const VIEWED_VIDEOS_KEY = 'dems-viewed-videos-v1';
const WATCH_PROGRESS_KEY = 'dems-video-watch-progress-v1';

type WatchProgressEntry = {
  currentTime: number;
  duration: number;
  completed: boolean;
  updatedAt: string;
};

type LockedVideoPaymentStatus = 'pending' | 'rejected';

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

export default function VideoPage() {
  const router = useRouter();
  const idParam = router.query.id;
  const id = typeof idParam === 'string' ? idParam : '';
  const { user, profile, loading: authLoading } = useAuth();
  const { addItem, items } = useCart();
  
  const [video, setVideo] = useState<VideoModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<VideoTab>('cas');
  const [hasAccess, setHasAccess] = useState(false);
  const [lockedVideoPaymentStatus, setLockedVideoPaymentStatus] = useState<LockedVideoPaymentStatus | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Record<VideoTab, boolean>>({
    cas: false,
    open: false,
    qcm: false,
    schemas: false,
  });
  const [loadingTabs, setLoadingTabs] = useState<Record<VideoTab, boolean>>({
    cas: false,
    open: false,
    qcm: false,
    schemas: false,
  });

  // Content states
  const [qcms, setQcms] = useState<QcmModel[]>([]);
  const [clinicalCases, setClinicalCases] = useState<ClinicalCaseModel[]>([]);
  const [openQuestions, setOpenQuestions] = useState<OpenQuestionModel[]>([]);
  const [diagrams, setDiagrams] = useState<DiagramModel[]>([]);

  // QCM states
  const [qcmSelections, setQcmSelections] = useState<Record<string, number[]>>({});
  const [qcmResults, setQcmResults] = useState<Record<string, { selected: number[]; isCorrect: boolean | null }>>({});
  const [showQcmExplanations, setShowQcmExplanations] = useState<Record<string, boolean>>({});
  const [qcmValidationErrors, setQcmValidationErrors] = useState<Record<string, string>>({});

  // Navigation states for multiple items
  const [activeCaseIndex, setActiveCaseIndex] = useState(0);
  const [activeOpenQuestionIndex, setActiveOpenQuestionIndex] = useState(0);
  const [activeQcmIndex, setActiveQcmIndex] = useState(0);
  const [activeDiagramIndex, setActiveDiagramIndex] = useState(0);

  const [openQuestionAnswersVisible, setOpenQuestionAnswersVisible] = useState<Record<string, boolean>>({});

  // Schema answers visibility
  const [diagramAnswersVisible, setDiagramAnswersVisible] = useState<Record<string, boolean>>({});

  // Clinical case feedback drafts
  const [caseFeedbackDrafts, setCaseFeedbackDrafts] = useState<Record<string, string>>({});

  // Clinical case questions state (par cas et par question)
  const [caseQuestionAnswers, setCaseQuestionAnswers] = useState<Record<string, Record<string, CaseQuestionUiState>>>({});
  // QCM, open question and diagram feedback drafts & visibility
  const [qcmFeedbackDrafts, setQcmFeedbackDrafts] = useState<Record<string, string>>({});
  const [qcmFeedbackVisible, setQcmFeedbackVisible] = useState<Record<string, boolean>>({});
  const [openQuestionFeedbackDrafts, setOpenQuestionFeedbackDrafts] = useState<Record<string, string>>({});
  const [openQuestionFeedbackVisible, setOpenQuestionFeedbackVisible] = useState<Record<string, boolean>>({});
  const [diagramFeedbackDrafts, setDiagramFeedbackDrafts] = useState<Record<string, string>>({});
  const [diagramFeedbackVisible, setDiagramFeedbackVisible] = useState<Record<string, boolean>>({});

  // Index de la question active par cas clinique
  const [activeCaseQuestionIndexes, setActiveCaseQuestionIndexes] = useState<Record<string, number>>({});

  // Lightbox state
  const [selectedImage, setSelectedImage] = useState<{ url: string, title: string } | null>(null);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const lastPersistedSecondRef = useRef(0);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const tabParam = router.query.tab;
    const tab = Array.isArray(tabParam) ? tabParam[0] : tabParam;
    if (tab === 'qcm' || tab === 'cas' || tab === 'open' || tab === 'schemas') {
      setActiveTab(tab);
      return;
    }

    if (tab === 'case') {
      setActiveTab('cas');
      return;
    }

    if (tab === 'diagram') {
      setActiveTab('schemas');
    }

    if (tab === 'open-questions' || tab === 'openQuestions' || tab === 'open-question') {
      setActiveTab('open');
    }
  }, [router.isReady, router.query.tab]);

  useEffect(() => {
    const fetchVideo = async () => {
      if (!router.isReady || !id) return;
      try {
        const docRef = doc(db, 'videos', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const videoData = { id: docSnap.id, ...docSnap.data() } as VideoModel;
          setVideo(videoData);
          
          // Check access
          const access = canAccessVideo(videoData, profile);
          setHasAccess(access);
        }
      } catch (error) {
        console.error('Error fetching video:', error);
      } finally {
        setLoading(false);
      }
    };
    
    if (!authLoading) {
      fetchVideo();
    }
  }, [id, profile, authLoading, router.isReady]);

  useEffect(() => {
    setLoadedTabs({ cas: false, open: false, qcm: false, schemas: false });
    setLoadingTabs({ cas: false, open: false, qcm: false, schemas: false });
    setQcms([]);
    setClinicalCases([]);
    setOpenQuestions([]);
    setDiagrams([]);
  }, [id]);

  const fetchTabContent = useCallback(
    async (tab: VideoTab) => {
      if (!id || !hasAccess) return;
      if (loadedTabs[tab] || loadingTabs[tab]) return;

      setLoadingTabs((prev) => ({ ...prev, [tab]: true }));
      try {
        if (tab === 'qcm') {
          const qcmSnap = await getDocs(query(collection(db, 'qcms'), where('videoId', '==', id)));
          setQcms(qcmSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as QcmModel));
        }

        if (tab === 'cas') {
          const caseSnap = await getDocs(query(collection(db, 'clinicalCases'), where('videoId', '==', id)));
          setClinicalCases(caseSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClinicalCaseModel));
        }

        if (tab === 'open') {
          const openQuestionsSnap = await getDocs(query(collection(db, 'openQuestions'), where('videoId', '==', id)));
          setOpenQuestions(openQuestionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as OpenQuestionModel));
        }

        if (tab === 'schemas') {
          const diagramSnap = await getDocs(query(collection(db, 'diagrams'), where('videoId', '==', id)));
          setDiagrams(diagramSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as DiagramModel));
        }

        setLoadedTabs((prev) => ({ ...prev, [tab]: true }));
      } catch (error) {
        console.error('Error fetching tab content:', error);
      } finally {
        setLoadingTabs((prev) => ({ ...prev, [tab]: false }));
      }
    },
    [hasAccess, id, loadedTabs, loadingTabs],
  );

  useEffect(() => {
    if (!hasAccess || !id) return;
    fetchTabContent(activeTab);
  }, [activeTab, fetchTabContent, hasAccess, id]);

  useEffect(() => {
    const fetchLockedVideoPaymentStatus = async () => {
      if (!user || !id) {
        setLockedVideoPaymentStatus(null);
        return;
      }

      try {
        const paymentsSnap = await getDocs(query(collection(db, 'payments'), where('userId', '==', user.uid)));
        let latestStatusValue: LockedVideoPaymentStatus | 'approved' | null = null;
        let latestStatusCreatedAt = -1;

        paymentsSnap.docs.forEach((paymentDoc) => {
          const payment = paymentDoc.data() as Record<string, any>;
          const status = String(payment.status || '').toLowerCase();
          if (status !== 'pending' && status !== 'rejected' && status !== 'approved') return;

          const createdAtRaw = payment.createdAt;
          const createdAt = typeof createdAtRaw === 'string' ? new Date(createdAtRaw).getTime() : 0;

          const hasVideoInItems = Array.isArray(payment.items)
            ? payment.items.some((entry: any) => entry?.type === 'video' && entry?.id === id)
            : false;
          const isDirectVideoPayment = payment.type === 'video' && payment.targetId === id;

          if (!hasVideoInItems && !isDirectVideoPayment) return;

          if (createdAt >= latestStatusCreatedAt) {
            latestStatusCreatedAt = createdAt;
            latestStatusValue = status as LockedVideoPaymentStatus | 'approved';
          }
        });

        const finalStatus = latestStatusValue;

        if (finalStatus === 'pending' || finalStatus === 'rejected') {
          setLockedVideoPaymentStatus(finalStatus);
        } else {
          setLockedVideoPaymentStatus(null);
        }
      } catch (error) {
        console.error('Error fetching locked video payment status:', error);
        setLockedVideoPaymentStatus(null);
      }
    };

    fetchLockedVideoPaymentStatus();
  }, [user, id]);

  // Prevent right click and copy
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleCopy = (e: ClipboardEvent) => e.preventDefault();
    
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !video?.id || !hasAccess) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(VIEWED_VIDEOS_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      const current = Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];

      if (!current.includes(video.id)) {
        window.localStorage.setItem(VIEWED_VIDEOS_KEY, JSON.stringify([...current, video.id]));
      }
    } catch {
      window.localStorage.setItem(VIEWED_VIDEOS_KEY, JSON.stringify([video.id]));
    }
  }, [video?.id, hasAccess]);

  useEffect(() => {
    if (!video?.id || !hasAccess) {
      return;
    }

    const player = playerRef.current;
    if (!player || typeof window === 'undefined') {
      return;
    }

    const storageKey = `${WATCH_PROGRESS_KEY}:${user?.uid ?? 'guest'}`;

    const persistProgress = (force = false) => {
      const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
      if (duration <= 0) {
        return;
      }

      const currentTime = Number.isFinite(player.currentTime) ? player.currentTime : 0;
      const roundedCurrent = Math.floor(currentTime);

      if (!force && Math.abs(roundedCurrent - lastPersistedSecondRef.current) < 2) {
        return;
      }
      lastPersistedSecondRef.current = roundedCurrent;

      const completed = duration > 0 && currentTime / duration >= 0.98;
      const entry: WatchProgressEntry = {
        currentTime,
        duration,
        completed,
        updatedAt: new Date().toISOString(),
      };

      try {
        const raw = window.localStorage.getItem(storageKey);
        const parsed = raw ? (JSON.parse(raw) as Record<string, WatchProgressEntry>) : {};
        parsed[video.id] = entry;
        window.localStorage.setItem(storageKey, JSON.stringify(parsed));
      } catch {
        window.localStorage.setItem(storageKey, JSON.stringify({ [video.id]: entry }));
      }
    };

    const handleLoadedMetadata = () => {
      persistProgress(true);
    };
    const handleTimeUpdate = () => {
      persistProgress(false);
    };
    const handleEnded = () => {
      persistProgress(true);
    };

    player.addEventListener('loadedmetadata', handleLoadedMetadata);
    player.addEventListener('timeupdate', handleTimeUpdate);
    player.addEventListener('ended', handleEnded);

    return () => {
      player.removeEventListener('loadedmetadata', handleLoadedMetadata);
      player.removeEventListener('timeupdate', handleTimeUpdate);
      player.removeEventListener('ended', handleEnded);
      persistProgress(true);
    };
  }, [video?.id, hasAccess, user?.uid]);

  if (!router.isReady || loading || authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--app-surface-alt)]">
        <div className="w-12 h-12 border-4 border-[var(--app-border)] border-t-medical-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="video-locked-shell flex-1 flex flex-col items-center justify-center p-4 text-center">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-3xl font-bold mb-2">Vidéo Introuvable</h1>
        <p className="video-locked-body max-w-md">La vidéo que vous recherchez n'existe pas ou a été supprimée.</p>
      </div>
    );
  }

  const isInCart = items.some(item => item.id === video.id);
  const purchaseStatusLabel = video.isFreeDemo
    ? 'Démo Gratuite'
    : hasAccess
      ? profile?.role === 'vip_plus'
        ? 'VIP Plus Débloquée'
        : 'Débloquée'
      : 'Bloquée';

  if (!hasAccess) {
    const lockedAction = !user
      ? {
          label: 'Débloquer',
          onClick: () => router.push(`/sign-in?redirect=${encodeURIComponent(`/videos/${video.id}`)}`),
        }
      : isInCart
        ? {
            label: 'Aller au panier',
            onClick: () => router.push('/checkout'),
          }
        : lockedVideoPaymentStatus === 'pending'
          ? {
              label: 'Aller a la liste des achats',
              onClick: () => router.push('/purchases'),
            }
          : lockedVideoPaymentStatus === 'rejected'
            ? {
                label: 'Recommencer l\'achat',
                onClick: () =>
                  addItem({
                    id: video.id,
                    title: video.title,
                    price: video.price,
                    type: 'video',
                    imageUrl: '',
                  }),
              }
            : {
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

    return (
      <div className="video-locked-shell flex-1 flex flex-col items-center justify-center p-4 text-center">
        <Lock className="h-16 w-16 text-medical-500 mb-4" />
        <h1 className="text-3xl font-bold mb-2">Accès Restreint</h1>
        <p className="video-locked-body max-w-md mb-8">
          Vous n'avez pas l'autorisation de visionner ce contenu. Veuillez souscrire à un abonnement ou acheter la vidéo.
        </p>
        
        <div className="video-locked-card p-8 rounded-2xl border max-w-md w-full">
          <h2 className="video-locked-title text-2xl font-bold mb-2">{video.title}</h2>
          <p className="video-locked-body mb-4">{video.description}</p>
          <div className="video-status-chip inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            {purchaseStatusLabel}
          </div>
          <div className="text-3xl font-bold text-medical-400 mb-8">{video.price} DZD</div>
          
          <button
            onClick={lockedAction.onClick}
            className="w-full flex items-center justify-center gap-2 bg-medical-600 text-white px-6 py-4 rounded-xl font-bold text-lg hover:bg-medical-700 transition-colors"
          >
            <ShoppingCart className="w-5 h-5" />
            {lockedAction.label}
          </button>
        </div>
      </div>
    );
  }

  const handleSubmitCaseFeedback = async (caseId: string) => {
    const message = caseFeedbackDrafts[caseId]?.trim();
    if (!message) return;

    try {
      await addDoc(collection(db, 'clinicalCaseFeedback'), {
        videoId: id,
        caseId,
        userId: profile?.uid ?? null,
        userEmail: profile?.email ?? null,
        message,
        createdAt: new Date().toISOString(),
      });
      setCaseFeedbackDrafts((prev) => ({ ...prev, [caseId]: '' }));
      alert('Votre discussion a été envoyée à l\'administration.');
    } catch (error) {
      console.error('Error sending clinical case feedback:', error);
      alert('Erreur lors de l\'envoi de votre discussion.');
    }
  };

  // Generic pedagogical feedback sender used by questions and diagrams
  const handleSendPedagogicalFeedback = async (
    itemType: 'caseQuestion' | 'qcm' | 'openQuestion' | 'diagram',
    itemId: string,
    parentCaseId?: string,
  ) => {
    // Read the draft message from the corresponding draft state instead of using prompt()
    let message = '';
    if (itemType === 'qcm') {
      message = qcmFeedbackDrafts[itemId] ?? '';
    } else if (itemType === 'openQuestion') {
      message = openQuestionFeedbackDrafts[itemId] ?? '';
    } else if (itemType === 'diagram') {
      message = diagramFeedbackDrafts[itemId] ?? '';
    } else if (itemType === 'caseQuestion') {
      message = caseQuestionAnswers[parentCaseId ?? '']?.[itemId]?.feedbackText ?? '';
    }

    const trimmed = message?.trim();
    if (!trimmed) return;

    try {
      await addDoc(collection(db, 'pedagogicalFeedback'), {
        videoId: id,
        itemType,
        itemId,
        caseId: parentCaseId ?? null,
        userId: profile?.uid ?? null,
        userEmail: profile?.email ?? null,
        message: trimmed,
        createdAt: new Date().toISOString(),
      });

      // Clear draft and hide the textarea after sending
      if (itemType === 'qcm') {
        setQcmFeedbackDrafts((prev) => ({ ...prev, [itemId]: '' }));
        setQcmFeedbackVisible((prev) => ({ ...prev, [itemId]: false }));
      } else if (itemType === 'openQuestion') {
        setOpenQuestionFeedbackDrafts((prev) => ({ ...prev, [itemId]: '' }));
        setOpenQuestionFeedbackVisible((prev) => ({ ...prev, [itemId]: false }));
      } else if (itemType === 'diagram') {
        setDiagramFeedbackDrafts((prev) => ({ ...prev, [itemId]: '' }));
        setDiagramFeedbackVisible((prev) => ({ ...prev, [itemId]: false }));
      } else if (itemType === 'caseQuestion') {
        updateCaseQuestionState(parentCaseId ?? '', itemId, (cur) => ({ ...cur, feedbackText: '', showFeedback: false }));
      }

      alert('Feedback envoyé. Merci !');
    } catch (error) {
      console.error('Error sending pedagogical feedback:', error);
      alert("Erreur lors de l'envoi du feedback.");
    }
  };

  const updateCaseQuestionState = (
    caseId: string,
    questionId: string,
    updater: (current: CaseQuestionUiState) => CaseQuestionUiState,
  ) => {
    setCaseQuestionAnswers((prev) => {
      const caseState = prev[caseId] ?? {};
      const current = caseState[questionId] ?? {};
      const next = updater(current);
      return {
        ...prev,
        [caseId]: {
          ...caseState,
          [questionId]: next,
        },
      };
    });
  };

  const tabDefinitions: Array<{ id: VideoTab; label: string; description: string; icon: typeof FileText; count: number }> = [
    {
      id: 'cas',
      label: 'Cas Cliniques',
      description: 'Raisonnement clinique progressif et discussion guidée.',
      icon: FileText,
      count: clinicalCases.length,
    },
    {
      id: 'open',
      label: 'Questions Ouvertes',
      description: 'Entraînement rédactionnel avec réponses expertes.',
      icon: MessageSquare,
      count: openQuestions.length,
    },
    {
      id: 'qcm',
      label: 'QCM',
      description: 'Validation immédiate avec explication pédagogique.',
      icon: CheckCircle2,
      count: qcms.length,
    },
    {
      id: 'schemas',
      label: 'Schémas',
      description: 'Repères visuels anatomiques et radios clés.',
      icon: ImageIcon,
      count: diagrams.length,
    },
  ];

  const activeTabMeta = tabDefinitions.find((tab) => tab.id === activeTab) || tabDefinitions[0];
  const youtubeVideoId = extractYouTubeVideoId(video.url || '');

  return (
    <div className="video-experience-shell video-page flex-1 text-[var(--app-text)] flex flex-col select-none">
      {/* Video Player Area */}
      <div className="video-player-shell w-full relative aspect-video max-h-[70vh] flex justify-center">
        {/* Anti-download overlay */}
        <div className="absolute inset-0 z-10 pointer-events-none" />
        
        {/* Video Element (Simulated with iframe or video tag) */}
        {youtubeVideoId ? (
          <iframe
            src={`https://www.youtube.com/embed/${youtubeVideoId}?rel=0&modestbranding=1&playsinline=1`}
            title={video.title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video 
            ref={playerRef}
            src={video.url || "https://www.w3schools.com/html/mov_bbb.mp4"} 
            controls 
            controlsList="nodownload"
            preload="metadata"
            className="w-full h-full object-contain"
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
      </div>

      {/* Content Area */}
      <div className="container mx-auto px-4 py-8 flex-1 flex flex-col">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[var(--app-text)] mb-2">{video.title}</h1>
          <div className="video-status-chip inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-3">
            {purchaseStatusLabel}
          </div>
          <p className="text-[var(--app-muted)] text-lg">{video.description}</p>
        </div>

        {/* Tabs */}
        <div className="mb-8 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {tabDefinitions.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`text-left rounded-2xl border px-4 py-4 transition-all interactive-card ${
                  activeTab === tab.id ? 'video-tab-active' : 'video-tab-inactive'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold border border-current/35">
                    {loadedTabs[tab.id] ? tab.count : '...'}
                  </span>
                </div>
                <p className="mt-2 text-xs opacity-85">{tab.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
          {loadingTabs[activeTab] && (
            <div className="mb-5 flex items-center gap-3 text-sm text-[var(--app-muted)]" aria-live="polite">
              <div className="w-5 h-5 border-2 border-[var(--app-border)] border-t-medical-500 rounded-full animate-spin" />
              Chargement du contenu...
            </div>
          )}
          <AnimatePresence mode="wait">
            {activeTab === 'cas' && (
              <motion.div
                key="cas"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 video-learning-section"
              >
                {clinicalCases.length > 0 ? (
                  <>
                    {clinicalCases.length > 1 && (
                      <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar">
                        {clinicalCases.map((_, caseIndex) => (
                          <button
                            key={`case-nav-${caseIndex}`}
                            type="button"
                            onClick={() => setActiveCaseIndex(caseIndex)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
                              activeCaseIndex === caseIndex
                                ? 'video-tab-active'
                                : 'video-tab-inactive'
                            }`}
                          >
                            Cas {String(caseIndex + 1).padStart(2, '0')}
                          </button>
                        ))}
                      </div>
                    )}

                    {(() => {
                      const c = clinicalCases[Math.min(activeCaseIndex, clinicalCases.length - 1)];
                      const index = Math.min(activeCaseIndex, clinicalCases.length - 1);
                      return (
                        <div key={c.id} className="video-learning-card rounded-2xl border overflow-hidden">
                          <div className="cas-card-accent-bar" />
                          <div className="p-6 space-y-6">
                          <div className="flex items-center gap-3 pb-4 border-b border-[var(--app-border)]">
                            <span className="cas-number-badge flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--app-accent)] mb-0.5">Cas Clinique</p>
                              <h3 className="text-xl font-bold text-[var(--app-text)] leading-tight">Raisonnement clinique</h3>
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                                  {/* 1. Description du cas clinique */}
                                  {c.description ? (
                                    <div className="cas-section-item">
                                      <p className="whitespace-pre-wrap text-[var(--app-muted)] leading-relaxed">{c.description}</p>
                                    </div>
                                  ) : (
                                    <>
                                      {c.patientHistory && (
                                        <div className="cas-section-item">
                                          <p className="cas-section-label">Histoire du patient</p>
                                          <p className="whitespace-pre-wrap text-[var(--app-muted)] leading-relaxed mt-1">{c.patientHistory}</p>
                                        </div>
                                      )}
                                      {c.clinicalExamination && (
                                        <div className="cas-section-item">
                                          <p className="cas-section-label">Examen clinique</p>
                                          <p className="whitespace-pre-wrap text-[var(--app-muted)] leading-relaxed mt-1">{c.clinicalExamination}</p>
                                        </div>
                                      )}
                                      {c.additionalTests && (
                                        <div className="cas-section-item">
                                          <p className="cas-section-label">Examens complémentaires</p>
                                          <p className="whitespace-pre-wrap text-[var(--app-muted)] leading-relaxed mt-1">{c.additionalTests}</p>
                                        </div>
                                      )}
                                      {c.diagnosis && (
                                        <div className="cas-section-item cas-section-item--highlight">
                                          <p className="cas-section-label">Diagnostic</p>
                                          <p className="whitespace-pre-wrap text-[var(--app-muted)] leading-relaxed mt-1">{c.diagnosis}</p>
                                        </div>
                                      )}
                                      {c.treatment && (
                                        <div className="cas-section-item">
                                          <p className="cas-section-label">Prise en charge</p>
                                          <p className="whitespace-pre-wrap text-[var(--app-muted)] leading-relaxed mt-1">{c.treatment}</p>
                                        </div>
                                      )}
                                      {c.discussion && (
                                        <div className="cas-section-item">
                                          <p className="cas-section-label">Discussion</p>
                                          <p className="whitespace-pre-wrap text-[var(--app-muted)] leading-relaxed mt-1">{c.discussion}</p>
                                        </div>
                                      )}
                                    </>
                                  )}

                                {/* 2. Figures du cas clinique */}
                                {c.images && c.images.length > 0 && (
                                  <div className="pt-2">
                                    <p className="cas-section-label mb-3">Figures</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                      {c.images.map((imgUrl: string, imgIndex: number) => (
                                        <div
                                          key={imgIndex}
                                          className="group relative aspect-video rounded-xl overflow-hidden border border-[var(--app-border)] bg-[var(--app-surface-alt)] cursor-pointer"
                                          onClick={() => setSelectedImage({ url: imgUrl, title: `Cas Clinique #${String(index + 1).padStart(2, '0')} - Figure ${String(imgIndex + 1).padStart(2, '0')}` })}
                                        >
                                          <Image
                                            src={imgUrl}
                                            alt={`Figure ${String(imgIndex + 1).padStart(2, '0')}`}
                                            fill
                                            className="object-cover transition-transform duration-500 group-hover:scale-110"
                                            referrerPolicy="no-referrer"
                                          />
                                          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-1 text-xs text-white flex items-center justify-between">
                                            <span>Figure {String(imgIndex + 1).padStart(2, '0')}</span>
                                          </div>
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Maximize2 className="w-8 h-8 text-white" />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* 3. Références */}
                                {c.reference && (
                                  <div className="video-reference-panel rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-4 py-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--app-accent)] mb-1">Référence</h4>
                                    <p className="text-sm text-[var(--app-muted)] whitespace-pre-wrap">{c.reference}</p>
                                  </div>
                                )}

                                {/* 4. Questions pédagogiques du cas */}
                                {Array.isArray(c.questions) && c.questions.length > 0 && (
                                  <div className="pt-4 border-t border-[var(--app-border)]">
                                    <div className="flex items-center gap-2 mb-4">
                                      <ClipboardList className="w-4 h-4 text-[var(--app-accent)]" />
                                      <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--app-accent)]">Questions pédagogiques</h4>
                                      <span className="ml-auto text-xs text-[var(--app-muted)] font-medium tabular-nums">
                                        {c.questions.length} question{c.questions.length > 1 ? 's' : ''}
                                      </span>
                                    </div>

                                    {(() => {
                                      const totalQuestions = c.questions.length;
                                      const activeQuestionIndex = Math.min(
                                        activeCaseQuestionIndexes[c.id] ?? 0,
                                        totalQuestions - 1,
                                      );
                                      const q = c.questions[activeQuestionIndex] as CaseQuestionModel & {
                                        options?: string[];
                                        correctOptionIndexes?: number[];
                                        correctOptionIndex?: number;
                                        explanation?: string;
                                        answer?: string;
                                        images?: string[];
                                      };
                                      const kind: 'qcm' | 'select' | 'open' =
                                        q.kind === 'select' || q.kind === 'open' ? q.kind : 'qcm';
                                      const questionId = q.id || `q-${activeQuestionIndex}`;
                                      const caseState = caseQuestionAnswers[c.id] || {};
                                      const qState = caseState[questionId] || {};

                                      const correctIndexes: number[] =
                                        Array.isArray(q.correctOptionIndexes) && q.correctOptionIndexes.length > 0
                                          ? q.correctOptionIndexes
                                          : typeof q.correctOptionIndex === 'number'
                                            ? [q.correctOptionIndex]
                                            : [];

                                      const selectedIndexes: number[] = Array.isArray(qState.selectedIndexes)
                                        ? qState.selectedIndexes
                                        : [];
                                      const selectedIndex: number | null =
                                        typeof qState.selectedIndex === 'number' ? qState.selectedIndex : null;
                                      const validated: boolean = !!qState.validated;
                                      const isCorrect: boolean | null =
                                        typeof qState.isCorrect === 'boolean' ? qState.isCorrect : null;
                                      const showExplanation: boolean = !!qState.showExplanation;
                                      const feedbackText: string =
                                        typeof qState.feedbackText === 'string' ? qState.feedbackText : '';

                                      const hasSelection =
                                        kind === 'qcm'
                                          ? selectedIndexes.length > 0
                                          : kind === 'select'
                                            ? selectedIndex !== null
                                            : false;

                                      const handleValidate = () => {
                                        if (kind === 'open') return;

                                        if (!hasSelection) return;

                                        updateCaseQuestionState(c.id, questionId, (current) => {
                                          const currentSelectedIndexes: number[] =
                                            kind === 'qcm'
                                              ? (Array.isArray(current.selectedIndexes)
                                                  ? current.selectedIndexes
                                                  : [])
                                              : typeof current.selectedIndex === 'number'
                                                ? [current.selectedIndex]
                                                : [];

                                          let ok = false;
                                          if (correctIndexes.length > 0) {
                                            ok =
                                              currentSelectedIndexes.length === correctIndexes.length &&
                                              currentSelectedIndexes.every((idx) => correctIndexes.includes(idx));
                                          } else {
                                            ok = true;
                                          }

                                          return {
                                            ...current,
                                            validated: true,
                                            isCorrect: ok,
                                            showExplanation: true,
                                            showFeedback: true,
                                          };
                                        });
                                      };

                                      const handleReset = () => {
                                        updateCaseQuestionState(c.id, questionId, () => ({
                                          selectedIndexes: [],
                                          selectedIndex: null,
                                          answerText: '',
                                          feedbackText: '',
                                          validated: false,
                                          isCorrect: null,
                                          showExplanation: false,
                                        }));
                                      };

                                      const gotoQuestion = (nextIndex: number) => {
                                        setActiveCaseQuestionIndexes((prev) => ({
                                          ...prev,
                                          [c.id]: nextIndex,
                                        }));
                                      };

                                      return (
                                        <>
                                          <div className="cas-question-card rounded-xl border overflow-hidden">
                                            {/* Question header bar */}
                                            <div className="cas-question-header flex items-center gap-2 px-4 py-3 border-b border-[var(--app-border)]">
                                              <span className="cas-q-number flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold">
                                                {String(activeQuestionIndex + 1).padStart(2, '0')}
                                              </span>
                                              <span className="cas-q-type-badge px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                                                {kind === 'qcm'
                                                  ? 'QCM · Plusieurs réponses'
                                                  : kind === 'select'
                                                    ? 'Sélecteur · Une réponse'
                                                    : 'Question ouverte'}
                                              </span>
                                              {validated && (
                                                <div className="ml-auto flex items-center">
                                                  {isCorrect === true && (
                                                    <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                                      <CheckCircle2 className="w-3 h-3" />
                                                      Correct
                                                    </span>
                                                  )}
                                                  {isCorrect === false && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                                      <AlertCircle className="w-3 h-3" />
                                                      À revoir
                                                    </span>
                                                  )}
                                                  {isCorrect === null && (
                                                    <span className="inline-flex items-center gap-1 bg-[var(--app-surface-alt)] text-[var(--app-muted)] px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                                      <CheckCircle2 className="w-3 h-3" />
                                                      Enregistré
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                            {/* Question body */}
                                            <div className="p-4 space-y-3">
                                            <p className="text-sm font-semibold text-[var(--app-text)] whitespace-pre-wrap leading-relaxed">
                                              {q.prompt}
                                            </p>

                                            {kind === 'qcm' && (
                                              <div className="space-y-2">
                                                {q.options?.map((opt: string, optIndex: number) => {
                                                  const isSelected = selectedIndexes.includes(optIndex);
                                                  const isCorrectOption = correctIndexes.includes(optIndex);

                                                  let rowClass =
                                                    'video-option-row w-full text-left px-3 py-2 rounded-lg border text-xs flex items-center justify-between transition-all ';

                                                  if (validated) {
                                                    if (isCorrectOption) {
                                                      rowClass +=
                                                        'bg-emerald-500/15 border-emerald-500 text-emerald-200';
                                                    } else if (selectedIndexes.includes(optIndex)) {
                                                      rowClass += 'bg-red-500/10 border-red-500 text-red-200';
                                                    } else {
                                                      rowClass +=
                                                        'bg-[var(--app-surface-2)] border-[var(--app-border)] text-[var(--app-muted)] opacity-70';
                                                    }
                                                  } else if (isSelected) {
                                                    rowClass +=
                                                      'cas-option-selected';
                                                  } else {
                                                    rowClass +=
                                                      'bg-[var(--app-surface-2)] border-[var(--app-border)] text-[var(--app-text)] hover:bg-[var(--app-surface-alt)] hover:border-[var(--app-accent)]/40';
                                                  }

                                                  const handleClick = () => {
                                                    if (validated) return;
                                                    updateCaseQuestionState(c.id, questionId, (current) => {
                                                      const currentSelected: number[] = Array.isArray(
                                                        current.selectedIndexes,
                                                      )
                                                        ? [...current.selectedIndexes]
                                                        : [];
                                                      const exists = currentSelected.includes(optIndex);
                                                      const next = exists
                                                        ? currentSelected.filter((i) => i !== optIndex)
                                                        : [...currentSelected, optIndex];
                                                      return {
                                                        ...current,
                                                        selectedIndexes: next,
                                                      };
                                                    });
                                                  };

                                                  return (
                                                    <button
                                                      key={optIndex}
                                                      type="button"
                                                      className={rowClass}
                                                      onClick={handleClick}
                                                    >
                                                      <span className="flex items-center gap-3">
                                                        <span
                                                          className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold border transition-colors ${
                                                            validated && isCorrectOption
                                                              ? 'bg-emerald-500 text-white border-emerald-300'
                                                              : isSelected
                                                                ? 'cas-option-badge-selected'
                                                                : 'bg-[var(--app-surface-alt)] border-[var(--app-border)]'
                                                          }`}
                                                        >
                                                          {String.fromCharCode(65 + optIndex)}
                                                        </span>
                                                        <span className="flex-1 whitespace-pre-wrap">{opt}</span>
                                                      </span>
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            )}

                                            {kind === 'select' && (
                                              <div className="space-y-2">
                                                <label className="text-[11px] font-medium text-[var(--app-muted)]">
                                                  Choisissez la bonne réponse
                                                </label>
                                                {(() => {
                                                  let selectClass =
                                                    'video-select-field w-full rounded-lg border bg-[var(--app-surface-alt)]/60 px-3 py-2 text-xs text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] ';
                                                  if (validated) {
                                                    if (isCorrect === true) {
                                                      selectClass +=
                                                        'border-emerald-500 bg-emerald-500/10 text-emerald-100';
                                                    } else if (isCorrect === false) {
                                                      selectClass += 'border-red-500 bg-red-500/10 text-red-100';
                                                    } else {
                                                      selectClass += 'border-[var(--app-border)]';
                                                    }
                                                  } else {
                                                    selectClass += 'border-[var(--app-border)]';
                                                  }

                                                  return (
                                                    <select
                                                      className={selectClass}
                                                      value={selectedIndex !== null ? String(selectedIndex) : ''}
                                                      onChange={(e) => {
                                                        const value = e.target.value;
                                                        const nextIndex = value === '' ? null : Number(value);
                                                        updateCaseQuestionState(c.id, questionId, (current) => ({
                                                          ...current,
                                                          selectedIndex: nextIndex,
                                                        }));
                                                      }}
                                                      disabled={validated}
                                                      aria-label="Sélectionner une réponse pour la question"
                                                    >
                                                      <option value="">Sélectionner une réponse...</option>
                                                      {q.options?.map((opt: string, optIndex: number) => (
                                                        <option key={optIndex} value={optIndex}>
                                                          {String.fromCharCode(65 + optIndex)} — {opt}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  );
                                                })()}
                                              </div>
                                            )}

                                            {Array.isArray(q.images) && q.images.length > 0 && (
                                              <div className="mt-3 pt-3 border-t border-[var(--app-border)]">
                                                <p className="text-[11px] font-medium text-[var(--app-muted)] mb-2">
                                                  Figures associées à cette question
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                  {q.images.map((imgUrl: string, imgIndex: number) => (
                                                    <button
                                                      key={imgIndex}
                                                      type="button"
                                                      className="video-figure-thumb relative aspect-video rounded-lg overflow-hidden border border-[var(--app-border)] bg-[var(--app-surface-alt)] group"
                                                      onClick={() =>
                                                        setSelectedImage({
                                                          url: imgUrl,
                                                          title: `Cas Clinique #${String(index + 1).padStart(2, '0')} - Question ${String(activeQuestionIndex + 1).padStart(2, '0')} - Figure ${String(imgIndex + 1).padStart(2, '0')}`,
                                                        })
                                                      }
                                                    >
                                                      <Image
                                                        src={imgUrl}
                                                        alt={`Figure ${String(imgIndex + 1).padStart(2, '0')}`}
                                                        fill
                                                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                                                        referrerPolicy="no-referrer"
                                                      />
                                                      <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] text-[var(--app-text)] flex items-center justify-between">
                                                        <span>
                                                          Fig. {String(imgIndex + 1).padStart(2, '0')}
                                                        </span>
                                                      </div>
                                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <Maximize2 className="w-5 h-5 text-white" />
                                                      </div>
                                                    </button>
                                                  ))}
                                                </div>
                                              </div>
                                            )}

                                            {showExplanation && (q.explanation || q.answer) && (
                                              <div className="cas-explanation-panel rounded-xl border px-4 py-3">
                                                <div className="flex items-start gap-2">
                                                  <Lightbulb className="w-4 h-4 text-[var(--app-accent)] flex-shrink-0 mt-0.5" />
                                                  <div>
                                                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--app-accent)] mb-1">{kind === 'open' ? 'Réponse' : 'Explication'}</p>
                                                    <p className="text-sm text-[var(--app-text)] whitespace-pre-wrap leading-relaxed">{kind === 'open' && q.answer ? q.answer : q.explanation}</p>
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                            {/* Feedback utilisateur par question (optionnel) — affiché après interaction/réponse */}
                                            {caseQuestionAnswers[c.id]?.[questionId]?.showFeedback && (
                                              <div className="mt-3">
                                                <p className="text-[11px] font-medium text-[var(--app-muted)]">Discussion / Feedback (optionnel)</p>
                                                <div className="video-feedback-box relative mt-2 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-alt)]/60 focus-within:ring-1 focus-within:ring-[var(--app-accent)]">
                                                  <textarea
                                                    rows={2}
                                                    value={feedbackText}
                                                    onChange={(e) =>
                                                      updateCaseQuestionState(c.id, questionId, (current) => ({
                                                        ...current,
                                                        feedbackText: e.target.value,
                                                      }))
                                                    }
                                                    className="w-full rounded-2xl bg-transparent px-3 pr-12 py-2.5 text-[11px] leading-relaxed text-[var(--app-text)] placeholder:text-slate-500 focus:outline-none resize-none overflow-y-auto"
                                                    placeholder="Saisir une discussion / feedback..."
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={() => handleSendPedagogicalFeedback('caseQuestion', questionId, c.id)}
                                                    disabled={!feedbackText.trim()}
                                                    className="absolute right-2 bottom-2 inline-flex h-8 w-8 items-center justify-center rounded-full cas-validate-btn text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                                    aria-label="Envoyer le feedback à l'administration"
                                                  >
                                                    <SendHorizontal className="w-4 h-4" />
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          
                                            <div className="flex items-center justify-between gap-2 pt-1">
                                              <div className="flex items-center gap-2">
                                                {kind !== 'open' && (
                                                  <>
                                                    <button
                                                      type="button"
                                                      onClick={handleValidate}
                                                      disabled={!hasSelection}
                                                      className="px-3 py-1.5 rounded-lg cas-validate-btn text-white text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                      Valider
                                                    </button>
                                                    {validated && (
                                                      <button
                                                        type="button"
                                                        onClick={handleReset}
                                                        className="px-3 py-1.5 rounded-lg border border-[var(--app-border)] text-[11px] font-semibold text-[var(--app-text)] hover:bg-[var(--app-surface-alt)]"
                                                      >
                                                        Réinitialiser
                                                      </button>
                                                    )}
                                                  </>
                                                )}
                                              </div>

                                              {kind === 'open' && (q.explanation || q.answer) && (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    updateCaseQuestionState(c.id, questionId, (current) => ({
                                                      ...current,
                                                      showExplanation: !current.showExplanation,
                                                      showFeedback: !current.showExplanation,
                                                    }))
                                                  }
                                                  className="text-[11px] font-medium text-[var(--app-muted)] hover:text-[var(--app-accent)]"
                                                >
                                                  {showExplanation ? 'Masquer la réponse' : 'Afficher la réponse'}
                                                </button>
                                              )}
                                            </div>

                                            <div className="cas-question-nav flex items-center justify-between gap-2 pt-2 border-t border-[var(--app-border)]">
                                              <button
                                                type="button"
                                                onClick={() => gotoQuestion(Math.max(activeQuestionIndex - 1, 0))}
                                                disabled={activeQuestionIndex === 0}
                                                className="cas-nav-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--app-border)] text-[var(--app-text)] text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                              >
                                                <ChevronLeft className="w-3.5 h-3.5" />
                                                Précédente
                                              </button>
                                              <span className="text-[11px] text-[var(--app-muted)] font-medium tabular-nums">
                                                {String(activeQuestionIndex + 1).padStart(2, '0')} / {String(totalQuestions).padStart(2, '0')}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  gotoQuestion(
                                                    Math.min(activeQuestionIndex + 1, totalQuestions - 1),
                                                  )
                                                }
                                                disabled={activeQuestionIndex >= totalQuestions - 1}
                                                className="cas-nav-btn cas-nav-btn--accent flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                              >
                                                Suivante
                                                <ChevronRight className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                            </div>

                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                )}

                                {/* Global clinical-case discussion removed — per UX change */}
                          </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="video-empty-state bg-[var(--app-surface-alt)] rounded-xl p-6 border border-[var(--app-border)] text-center">
                    <p className="text-[var(--app-muted)] py-10">Aucun cas clinique disponible pour cette vidéo.</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'qcm' && (
              <motion.div
                key="qcm"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 video-learning-section"
              >
                {qcms.length > 0 ? (
                  <div className="space-y-8">
                    {qcms.length > 1 && (
                      <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar">
                        {qcms.map((_, qcmIndex) => (
                          <button
                            key={`qcm-nav-${qcmIndex}`}
                            type="button"
                            onClick={() => setActiveQcmIndex(qcmIndex)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
                              activeQcmIndex === qcmIndex
                                ? 'video-tab-active'
                                : 'video-tab-inactive'
                            }`}
                          >
                            QCM {qcmIndex + 1}
                          </button>
                        ))}
                      </div>
                    )}

                    {(() => {
                      const index = Math.min(activeQcmIndex, qcms.length - 1);
                      const q = qcms[index];
                      const result = qcmResults[q.id];
                      const showExplanation = showQcmExplanations[q.id];
                      const validationError = qcmValidationErrors[q.id] || '';
                      const selectedIndices = result?.selected ?? qcmSelections[q.id] ?? [];
                      const safeOptions: string[] = Array.isArray(q.options) ? q.options.filter((opt) => typeof opt === 'string') : [];
                      const correctIndexes: number[] =
                        Array.isArray(q.correctOptionIndexes) && q.correctOptionIndexes.length > 0
                          ? q.correctOptionIndexes
                          : typeof q.correctOptionIndex === 'number'
                            ? [q.correctOptionIndex]
                            : [];
                      const hasValidCorrectIndexes =
                        correctIndexes.length > 0 &&
                        correctIndexes.every((idx) => idx >= 0 && idx < safeOptions.length);
                      const qcmConfigError =
                        safeOptions.length === 0
                          ? "Ce QCM est indisponible: aucune option n'est configuree."
                          : !hasValidCorrectIndexes
                            ? "Ce QCM est mal configure: aucune bonne reponse valide n'est definie."
                            : '';

                      const toggleSelection = (optIndex: number) => {
                        if (result || qcmConfigError) return; // locked after validation or invalid config
                        setQcmSelections((prev) => {
                          const current = prev[q.id] ?? [];
                          const exists = current.includes(optIndex);
                          const next = exists ? current.filter((i) => i !== optIndex) : [...current, optIndex];

                          return { ...prev, [q.id]: next };
                        });
                      };

                      const validateAnswer = () => {
                        if (qcmConfigError) {
                          setQcmValidationErrors((prev) => ({ ...prev, [q.id]: qcmConfigError }));
                          return;
                        }

                        const current = qcmSelections[q.id] ?? [];
                        const isCorrect =
                          current.length === correctIndexes.length &&
                          current.every((idx) => correctIndexes.includes(idx));
                        setQcmResults(prev => ({ ...prev, [q.id]: { selected: current, isCorrect } }));
                        setShowQcmExplanations(prev => ({ ...prev, [q.id]: true }));
                        setQcmFeedbackVisible((prev) => ({ ...prev, [q.id]: true }));
                        setQcmValidationErrors((prev) => {
                          const next = { ...prev };
                          delete next[q.id];
                          return next;
                        });
                      };

                      return (
                        <>
                          <div key={q.id} className="video-learning-card rounded-2xl p-6 md:p-8 border shadow-xl">
                            <div className="flex items-start gap-4 mb-6">
                              <span className="flex-shrink-0 w-10 h-10 bg-medical-500/20 text-medical-400 rounded-xl flex items-center justify-center font-bold border border-medical-500/30">
                                {index + 1}
                              </span>
                              <div>
                                <p className="font-medium text-[var(--app-text)] text-xl leading-relaxed">{q.question}</p>

                                {q.reference && (
                                  <div className="mt-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3">
                                    <h4 className="text-sm font-semibold text-[var(--app-text)] mb-1">Référence</h4>
                                    <p className="text-sm text-[var(--app-muted)] whitespace-pre-wrap">{q.reference}</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {qcmConfigError && (
                              <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
                                {qcmConfigError}
                              </div>
                            )}

                            {validationError && (
                              <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                                {validationError}
                              </div>
                            )}

                            {safeOptions.length > 0 ? (
                              <div className="grid gap-3 mb-6">
                              {safeOptions.map((opt: string, optIndex: number) => {
                                const isSelected = selectedIndices.includes(optIndex);
                                const isCorrectOption = correctIndexes.includes(optIndex);
                                let rowClass = "video-option-row w-full text-left p-5 rounded-xl border transition-all flex items-center justify-between group ";

                                if (result) {
                                  if (isCorrectOption) {
                                    rowClass += "bg-emerald-500/20 border-emerald-500/50 text-emerald-400";
                                  } else if (result.selected.includes(optIndex) && !result.isCorrect) {
                                    rowClass += "bg-red-500/20 border-red-500/50 text-red-400";
                                  } else {
                                    rowClass += "bg-[var(--app-surface-alt)]/30 border-[var(--app-border)] text-slate-500 opacity-60";
                                  }
                                } else if (isSelected) {
                                  rowClass += "bg-medical-500/20 border-medical-500/60 text-medical-100";
                                } else {
                                  rowClass += "bg-[var(--app-surface-alt)]/50 border-[var(--app-border)] text-[var(--app-muted)] hover:bg-slate-700 hover:border-medical-500/50";
                                }

                                return (
                                  <button
                                    key={optIndex}
                                    type="button"
                                    className={rowClass}
                                    onClick={() => toggleSelection(optIndex)}
                                  >
                                    <span className="flex items-center gap-4 text-left">
                                      <span
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border transition-colors ${
                                          result && isCorrectOption
                                            ? 'bg-emerald-500 text-white border-emerald-400'
                                            : result && result.selected.includes(optIndex) && !result.isCorrect
                                              ? 'bg-red-500 text-white border-red-400'
                                              : isSelected
                                                ? 'bg-medical-600 text-white border-medical-400'
                                                : 'bg-[var(--app-surface-alt)] border-[var(--app-border)] group-hover:border-medical-500/50'
                                        }`}
                                      >
                                        {String.fromCharCode(65 + optIndex)}
                                      </span>
                                      <span className="flex-1">{opt}</span>
                                    </span>
                                  </button>
                                );
                              })}
                              </div>
                            ) : (
                              <div className="mb-6 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-4 text-sm text-[var(--app-muted)]">
                                Les options de ce QCM sont indisponibles.
                              </div>
                            )}

                            <div className="flex items-center justify-between gap-4 flex-wrap">
                              <button
                                type="button"
                                onClick={validateAnswer}
                                disabled={!!result || !!qcmConfigError || !(qcmSelections[q.id]?.length)}
                                className="px-4 py-2 rounded-lg bg-medical-600 text-white text-sm font-medium hover:bg-medical-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Valider
                              </button>

                              {result && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQcmResults(prev => {
                                      const next = { ...prev };
                                      delete next[q.id];
                                      return next;
                                    });
                                    setShowQcmExplanations(prev => ({ ...prev, [q.id]: false }));
                                    setQcmSelections(prev => ({ ...prev, [q.id]: [] }));
                                    setQcmFeedbackVisible((prev) => ({ ...prev, [q.id]: false }));
                                    setQcmValidationErrors((prev) => {
                                      const next = { ...prev };
                                      delete next[q.id];
                                      return next;
                                    });
                                  }}
                                  className="video-link-action flex items-center gap-2 text-[var(--app-muted)] hover:text-white transition-colors text-sm font-medium"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                  Recommencer
                                </button>
                              )}
                              {qcmFeedbackVisible[q.id] && (
                                <div className="w-full mt-3">
                                  <div className="video-feedback-box relative rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-alt)]/60 focus-within:ring-1 focus-within:ring-medical-500">
                                    <textarea
                                      rows={3}
                                      value={qcmFeedbackDrafts[q.id] ?? ''}
                                      onChange={(e) => setQcmFeedbackDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                                      className="w-full rounded-2xl bg-transparent px-3 pr-12 py-2.5 text-sm leading-relaxed text-[var(--app-text)] placeholder:text-slate-500 focus:outline-none resize-none overflow-y-auto"
                                      placeholder="Saisir une discussion / feedback (optionnel)..."
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSendPedagogicalFeedback('qcm', q.id)}
                                      disabled={!(qcmFeedbackDrafts[q.id] || '').trim()}
                                      className="absolute right-2 bottom-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-medical-400/40 bg-medical-600 text-white shadow-sm hover:bg-medical-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                      aria-label="Envoyer le feedback à l'administration"
                                    >
                                      <SendHorizontal className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            <AnimatePresence>
                              {showExplanation && q.explanation && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  className="video-answer-panel bg-medical-500/10 border border-medical-500/30 rounded-xl p-5 mt-6"
                                >
                                  <div className="flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-medical-400 mt-0.5" />
                                    <div>
                                      <h4 className="font-bold text-medical-400 mb-1">Explication</h4>
                                      <p className="text-[var(--app-muted)] text-sm leading-relaxed">{q.explanation}</p>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="video-empty-state bg-[var(--app-surface-alt)] rounded-xl p-6 border border-[var(--app-border)] text-center">
                    <p className="text-[var(--app-muted)] py-10">Aucun QCM disponible pour cette vidéo.</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'open' && (
              <motion.div
                key="open"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 video-learning-section"
              >
                {openQuestions.length > 0 ? (
                  <>
                    {openQuestions.length > 1 && (
                      <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar">
                        {openQuestions.map((_, openIndex) => (
                          <button
                            key={`open-nav-${openIndex}`}
                            type="button"
                            onClick={() => setActiveOpenQuestionIndex(openIndex)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
                              activeOpenQuestionIndex === openIndex
                                ? 'video-tab-active'
                                : 'video-tab-inactive'
                            }`}
                          >
                            QO {openIndex + 1}
                          </button>
                        ))}
                      </div>
                    )}

                    {(() => {
                      const index = Math.min(activeOpenQuestionIndex, openQuestions.length - 1);
                      const item = openQuestions[index];
                      const isAnswerVisible = !!openQuestionAnswersVisible[item.id];

                      return (
                        <>
                          <div key={item.id} className="video-learning-card rounded-2xl p-6 md:p-8 border shadow-xl space-y-5">
                            <div className="flex items-start gap-4">
                              <span className="flex-shrink-0 w-10 h-10 bg-medical-500/20 text-medical-400 rounded-xl flex items-center justify-center font-bold border border-medical-500/30">
                                {index + 1}
                              </span>
                              <div className="space-y-2">
                                <p className="text-[11px] uppercase tracking-wide text-[var(--app-muted)]">Question ouverte</p>
                                <p className="font-medium text-[var(--app-text)] text-xl leading-relaxed whitespace-pre-wrap">{item.question}</p>
                              </div>
                            </div>

                              <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  const nextVisible = !isAnswerVisible;
                                  setOpenQuestionAnswersVisible((prev) => ({
                                    ...prev,
                                    [item.id]: nextVisible,
                                  }));
                                  setOpenQuestionFeedbackVisible((prev) => ({ ...prev, [item.id]: nextVisible }));
                                }}
                                className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text)] hover:bg-slate-700 text-xs font-medium"
                              >
                                {isAnswerVisible ? 'Masquer la réponse' : 'Afficher la réponse'}
                              </button>
                            </div>

                            {isAnswerVisible && item.answer && (
                              <div className="video-answer-panel rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                                <h3 className="text-sm font-semibold text-emerald-300 mb-2">Réponse</h3>
                                <p className="text-sm text-[var(--app-text)] whitespace-pre-wrap">{item.answer}</p>
                              </div>
                            )}

                            {item.reference && (
                              <div className="video-reference-panel rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-4">
                                <h3 className="text-sm font-semibold text-[var(--app-text)] mb-2">Références</h3>
                                <p className="text-sm text-[var(--app-muted)] whitespace-pre-wrap">{item.reference}</p>
                              </div>
                            )}

                            {openQuestionFeedbackVisible[item.id] && (
                              <div className="mt-3 border-t border-[var(--app-border)] pt-3">
                                <p className="text-[11px] font-medium text-[var(--app-muted)]">Discussion / Feedback (optionnel)</p>
                                <div className="video-feedback-box relative mt-2 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-alt)]/60 focus-within:ring-1 focus-within:ring-medical-500">
                                  <textarea
                                    rows={3}
                                    value={openQuestionFeedbackDrafts[item.id] ?? ''}
                                    onChange={(e) => setOpenQuestionFeedbackDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                    className="w-full rounded-2xl bg-transparent px-3 pr-12 py-2.5 text-[11px] leading-relaxed text-[var(--app-text)] placeholder:text-slate-500 focus:outline-none resize-none overflow-y-auto"
                                    placeholder="Saisir une discussion / feedback (optionnel)..."
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSendPedagogicalFeedback('openQuestion', item.id)}
                                    disabled={!(openQuestionFeedbackDrafts[item.id] || '').trim()}
                                    className="absolute right-2 bottom-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-medical-400/40 bg-medical-600 text-white shadow-sm hover:bg-medical-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                    aria-label="Envoyer le feedback à l'administration"
                                  >
                                    <SendHorizontal className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <div className="video-empty-state bg-[var(--app-surface-alt)] rounded-xl p-6 border border-[var(--app-border)] text-center">
                    <p className="text-[var(--app-muted)] py-10">Aucune question ouverte disponible pour cette vidéo.</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'schemas' && (
              <motion.div
                key="schemas"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 video-learning-section"
              >
                {diagrams.length > 0 ? (
                  <>
                    {diagrams.length > 1 && (
                      <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar">
                        {diagrams.map((_, diagramIndex) => (
                          <button
                            key={`diagram-nav-${diagramIndex}`}
                            type="button"
                            onClick={() => setActiveDiagramIndex(diagramIndex)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
                              activeDiagramIndex === diagramIndex
                                ? 'video-tab-active'
                                : 'video-tab-inactive'
                            }`}
                          >
                            Figure {diagramIndex + 1}
                          </button>
                        ))}
                      </div>
                    )}

                    {(() => {
                      const index = Math.min(activeDiagramIndex, diagrams.length - 1);
                      const d = diagrams[index];
                      const showAnswers = diagramAnswersVisible[d.id];

                      return (
                        <>
                          <div key={d.id} className="video-learning-card rounded-xl overflow-hidden border">
                            <div className="relative aspect-video w-full bg-[var(--app-surface-alt)]">
                              <p className="video-section-intro text-[var(--app-muted)] mb-2">
                                Mettez un titre et légendez la figure suivante :
                              </p>
                              <Image src={d.imageUrl} alt={d.title} fill className="object-contain" referrerPolicy="no-referrer" />
                              {/* plus de calque SVG sur l'image : les marqueurs sont uniquement listés en dessous */}
                            </div>
                            <div className="p-6 space-y-4">
                              <div className="flex items-center justify-between gap-4 flex-wrap">
                                <h3 className="text-xl font-semibold text-[var(--app-text)]">
                                  Figure {index + 1}
                                </h3>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextVisible = !showAnswers;
                                    setDiagramAnswersVisible((prev) => ({
                                      ...prev,
                                      [d.id]: nextVisible,
                                    }));
                                    if (nextVisible) {
                                      setDiagramFeedbackVisible((prev) => ({ ...prev, [d.id]: true }));
                                    } else {
                                      setDiagramFeedbackVisible((prev) => ({ ...prev, [d.id]: false }));
                                    }
                                  }}
                                  className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text)] hover:bg-slate-700 text-xs font-medium"
                                >
                                  {showAnswers ? 'Masquer les réponses' : 'Afficher les réponses'}
                                </button>
                              </div>

                              {showAnswers && (
                                <>
                                  <p className="text-[var(--app-muted)] font-medium">{d.title}</p>
                                  {d.description && <p className="text-[var(--app-muted)] mb-2">{d.description}</p>}

                                  {d.markers && d.markers.length > 0 && (
                                    <div className="space-y-3 mt-4">
                                      <h4 className="font-medium text-medical-300 border-b border-[var(--app-border)] pb-2">Légendes</h4>
                                      <ul className="space-y-3">
                                        {d.markers.map((marker, markerIndex: number) => (
                                          <li key={markerIndex} className="flex gap-3 text-[var(--app-muted)]">
                                            <span className="flex-shrink-0 w-6 h-6 bg-slate-700 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                              {marker.number}
                                            </span>
                                            <div>
                                              <span className="font-medium text-white">{marker.label}</span>
                                              {marker.description && (
                                                <p className="text-sm text-[var(--app-muted)] mt-1">{marker.description}</p>
                                              )}
                                            </div>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {d.reference && (
                                    <div className="video-reference-panel mt-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3">
                                      <h4 className="text-sm font-semibold text-[var(--app-text)] mb-1">Référence</h4>
                                      <p className="text-sm text-[var(--app-muted)] whitespace-pre-wrap">{d.reference}</p>
                                    </div>
                                  )}
                                  {diagramFeedbackVisible[d.id] && (
                                    <div className="mt-3 border-t border-[var(--app-border)] pt-3">
                                      <p className="text-[11px] font-medium text-[var(--app-muted)]">Discussion / Feedback (optionnel)</p>
                                      <div className="video-feedback-box relative mt-2 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-alt)]/60 focus-within:ring-1 focus-within:ring-medical-500">
                                        <textarea
                                          rows={3}
                                          value={diagramFeedbackDrafts[d.id] ?? ''}
                                          onChange={(e) => setDiagramFeedbackDrafts((prev) => ({ ...prev, [d.id]: e.target.value }))}
                                          className="w-full rounded-2xl bg-transparent px-3 pr-12 py-2.5 text-[11px] leading-relaxed text-[var(--app-text)] placeholder:text-slate-500 focus:outline-none resize-none overflow-y-auto"
                                          placeholder="Saisir une discussion / feedback (optionnel)..."
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleSendPedagogicalFeedback('diagram', d.id)}
                                          disabled={!(diagramFeedbackDrafts[d.id] || '').trim()}
                                          className="absolute right-2 bottom-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-medical-400/40 bg-medical-600 text-white shadow-sm hover:bg-medical-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                          aria-label="Envoyer le feedback à l'administration"
                                        >
                                          <SendHorizontal className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <div className="video-empty-state bg-[var(--app-surface-alt)] rounded-xl p-6 border border-[var(--app-border)] text-center">
                    <p className="text-[var(--app-muted)] py-10">Aucun schéma disponible pour cette vidéo.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
      </div>

      {/* Lightbox Overlay */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 md:p-8"
            onClick={() => setSelectedImage(null)}
          >
            <div className="absolute top-6 right-6 flex items-center gap-4">
              <span className="text-white/70 text-sm font-medium hidden md:block">{selectedImage.title}</span>
              <button 
                onClick={() => setSelectedImage(null)}
                className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                title="Fermer l image"
                aria-label="Fermer l image"
              >
                <X className="w-8 h-8" />
              </button>
            </div>
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative w-full max-w-6xl h-full max-h-[80vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <Image 
                src={selectedImage.url} 
                alt={selectedImage.title} 
                fill 
                className="object-contain" 
                referrerPolicy="no-referrer" 
              />
            </motion.div>
            
            <div className="mt-8 text-center max-w-2xl">
              <h3 className="text-xl font-bold text-white mb-2">{selectedImage.title}</h3>
              <p className="text-white/60 text-sm">Utilisez la molette de la souris pour zoomer ou faites glisser pour explorer les détails.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
