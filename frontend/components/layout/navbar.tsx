'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '@/components/providers/auth-provider';
import { useCart } from '@/components/providers/cart-provider';
import {
  LogIn,
  LogOut,
  User,
  Menu,
  X,
  ShoppingCart,
  ChevronDown,
  LayoutDashboard,
  Settings,
  Bell,
  Mail,
  MailOpen,
  Trash2,
  Sun,
  Moon,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import {
  db,
  collection,
  getDocs,
  loadNotificationStorageState,
  query,
  saveNotificationStorageState,
  subscribeToDataChanges,
  subscribeToNotificationStorageChanges,
  type NotificationStorageState,
  where,
} from '@/lib/data/local-data';
import { SearchModal } from '@/components/features/search/search-modal';
import { AVATAR_FALLBACK_SRC, applyImageFallback } from '@/lib/utils/media-fallback';

type NavbarNotification = {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  type: 'payment' | 'video' | 'qcm' | 'openQuestion' | 'diagram' | 'clinicalCase';
  targetHref: string;
};

type VideoNotificationSource = {
  id: string;
  title?: string;
  isFreeDemo?: boolean;
  createdAt?: string;
};

const THEME_STORAGE_KEY = 'dems-theme-mode-v1';

export function Navbar() {
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();
  const { itemCount } = useCart();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchHover, setIsSearchHover] = useState(false);
  const [isAccountHover, setIsAccountHover] = useState(false);
  const [isPathHydrated, setIsPathHydrated] = useState(false);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [notifications, setNotifications] = useState<NavbarNotification[]>([]);
  const [notificationStorage, setNotificationStorage] = useState<NotificationStorageState>({
    readIds: [],
    deletedIds: [],
  });
  const [isNotificationStorageHydrated, setIsNotificationStorageHydrated] = useState(false);
  const loadRequestIdRef = useRef(0);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationDesktopRef = useRef<HTMLDivElement | null>(null);
  const notificationMobileRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = profile?.role === 'admin';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const navLinks = [
    { name: 'Accueil', href: '/' },
    { name: 'Otologie', href: '/specialties/otologie' },
    { name: 'Rhinologie', href: '/specialties/rhinologie' },
    { name: 'Laryngologie', href: '/specialties/laryngologie' },
    { name: 'Planning', href: '/planning' },
    { name: 'Planner', href: '/planner' },
    { name: 'Tarifs', href: '/pricing' },
  ];
  const visibleNavLinks = isAdmin ? navLinks.filter((link) => link.name !== 'Tarifs') : navLinks;

  const normalizePath = (value: string) => {
    const [pathOnly] = value.split('?');
    if (!pathOnly) {
      return '/';
    }

    const trimmed = pathOnly.endsWith('/') && pathOnly !== '/' ? pathOnly.slice(0, -1) : pathOnly;
    return trimmed || '/';
  };

  const isRouteActive = (href: string) => {
    const targetPath = normalizePath(href);
    const currentPathname = normalizePath(router.pathname || '/');

    if (targetPath === '/') {
      return currentPathname === '/';
    }

    if (targetPath.startsWith('/specialties/')) {
      if (!isPathHydrated) {
        return false;
      }

      const targetSlug = targetPath.replace('/specialties/', '');
      const rawCurrentSlug = router.query.slug;
      const currentSlug = Array.isArray(rawCurrentSlug) ? rawCurrentSlug[0] : rawCurrentSlug;

      return currentPathname === '/specialty-detail' && currentSlug === targetSlug;
    }

    return currentPathname === targetPath;
  };

  const displayName = profile?.displayName?.trim() || '';
  const hasDoctorPrefix = /^dr\.?/i.test(displayName);
  const doctorName = displayName
    ? hasDoctorPrefix
      ? displayName
      : `Dr. ${displayName}`
    : '';

  const toggleThemeMode = () => {
    const nextMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextMode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    }
    document.documentElement.setAttribute('data-theme', nextMode);
  };

  useEffect(() => {
    setIsPathHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const rootTheme = document.documentElement.getAttribute('data-theme');
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    const nextTheme =
      (storedTheme === 'light' || storedTheme === 'dark'
        ? storedTheme
        : rootTheme === 'light' || rootTheme === 'dark'
          ? rootTheme
          : 'light') as 'light' | 'dark';

    setThemeMode(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }, []);

  const parseDateToMs = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== 'string') return 0;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const fetchNotifications = useCallback(async (options: { showLoading?: boolean } = {}) => {
    const { showLoading = false } = options;
    const loadId = ++loadRequestIdRef.current;

    if (!user || !profile) {
      setNotifications([]);
      setIsLoadingNotifications(false);
      return;
    }

    try {
      if (showLoading) {
        setIsLoadingNotifications(true);
      }

      const [videosSnap, qcmsSnap, openQuestionsSnap, diagramsSnap, clinicalCasesSnap, userNotificationsSnap] = await Promise.all([
        getDocs(collection(db, 'videos')),
        getDocs(collection(db, 'qcms')),
        getDocs(collection(db, 'openQuestions')),
        getDocs(collection(db, 'diagrams')),
        getDocs(collection(db, 'clinicalCases')),
        getDocs(query(collection(db, 'notifications'), where('userId', '==', user.uid))),
      ]);

      const pendingPaymentsSnap =
        profile.role === 'admin'
          ? await getDocs(query(collection(db, 'payments'), where('status', '==', 'pending')))
          : null;

      const allVideos: VideoNotificationSource[] = videosSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Record<string, any>),
      }));
      const allowedVideos =
        profile.role === 'admin' || profile.role === 'vip' || profile.role === 'vip_plus'
          ? allVideos
          : allVideos.filter((video) => Boolean(video.isFreeDemo));

      const allowedVideoIds = new Set(allowedVideos.map((video) => video.id));
      const videoTitleById = new Map(allowedVideos.map((video) => [video.id, String(video.title || video.id)]));
      const nextNotifications: NavbarNotification[] = [];

      if (profile.role === 'admin' && pendingPaymentsSnap) {
        pendingPaymentsSnap.docs.forEach((d) => {
          const data = d.data() as Record<string, any>;
          nextNotifications.push({
            id: `payment:${d.id}`,
            type: 'payment',
            title: 'Nouveau paiement en attente',
            description: `Paiement ${d.id} en attente de validation.`,
            createdAt: parseDateToMs(data.createdAt),
            targetHref: '/admin',
          });
        });
      }

      allowedVideos.forEach((video) => {
        nextNotifications.push({
          id: `video:${video.id}`,
          type: 'video',
          title: 'Nouveau cours vidéo',
          description: `${String(video.title || video.id)}`,
          createdAt: parseDateToMs(video.createdAt),
          targetHref: `/videos/${video.id}`,
        });
      });

      qcmsSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        if (!allowedVideoIds.has(String(data.videoId || ''))) return;
        const videoTitle = videoTitleById.get(String(data.videoId || '')) || String(data.videoId || 'Cours');
        nextNotifications.push({
          id: `qcm:${d.id}`,
          type: 'qcm',
          title: 'Nouveau QCM',
          description: `QCM ajouté dans ${videoTitle}.`,
          createdAt: parseDateToMs(data.createdAt),
          targetHref: `/videos/${String(data.videoId)}?tab=qcm`,
        });
      });

      openQuestionsSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        if (!allowedVideoIds.has(String(data.videoId || ''))) return;
        const videoTitle = videoTitleById.get(String(data.videoId || '')) || String(data.videoId || 'Cours');
        nextNotifications.push({
          id: `openQuestion:${d.id}`,
          type: 'openQuestion',
          title: 'Nouveau QROC',
          description: `QROC ajouté dans ${videoTitle}.`,
          createdAt: parseDateToMs(data.createdAt),
          targetHref: `/videos/${String(data.videoId)}?tab=open`,
        });
      });

      diagramsSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        if (!allowedVideoIds.has(String(data.videoId || ''))) return;
        const videoTitle = videoTitleById.get(String(data.videoId || '')) || String(data.videoId || 'Cours');
        nextNotifications.push({
          id: `diagram:${d.id}`,
          type: 'diagram',
          title: 'Nouveau schéma',
          description: `Schéma ajouté dans ${videoTitle}.`,
          createdAt: parseDateToMs(data.createdAt),
          targetHref: `/videos/${String(data.videoId)}?tab=diagram`,
        });
      });

      clinicalCasesSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        if (!allowedVideoIds.has(String(data.videoId || ''))) return;
        const videoTitle = videoTitleById.get(String(data.videoId || '')) || String(data.videoId || 'Cours');
        nextNotifications.push({
          id: `clinicalCase:${d.id}`,
          type: 'clinicalCase',
          title: 'Nouveau cas clinique',
          description: `Cas clinique ajouté dans ${videoTitle}.`,
          createdAt: parseDateToMs(data.createdAt),
          targetHref: `/videos/${String(data.videoId)}?tab=cas`,
        });
      });

      userNotificationsSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        const rawType = String(data.type || '').toLowerCase();
        const type: NavbarNotification['type'] = rawType === 'payment' ? 'payment' : 'video';

        nextNotifications.push({
          id: `userNotification:${d.id}`,
          type,
          title: String(data.title || (type === 'payment' ? 'Mise a jour paiement' : 'Mise a jour video')),
          description: String(data.description || ''),
          createdAt: parseDateToMs(data.createdAt),
          targetHref: String(data.targetHref || '/checkout'),
        });
      });

      const stored = loadNotificationStorageState(user.uid);
      const filtered = nextNotifications
        .filter((item) => !stored.deletedIds.includes(item.id))
        .sort((a, b) => b.createdAt - a.createdAt);

      if (loadRequestIdRef.current !== loadId) {
        return;
      }

      setNotifications(filtered);
    } catch (error) {
      if (loadRequestIdRef.current === loadId) {
        console.error('Error fetching notifications:', error);
      }
    } finally {
      if (loadRequestIdRef.current === loadId && showLoading) {
        setIsLoadingNotifications(false);
      }
    }
  }, [user, profile]);

  const toggleNotificationRead = (notificationId: string) => {
    if (!user) return;

    const isCurrentlyRead = notificationStorage.readIds.includes(notificationId);
    const nextReadIds = isCurrentlyRead
      ? notificationStorage.readIds.filter((id) => id !== notificationId)
      : [...notificationStorage.readIds, notificationId];
    const nextState = {
      readIds: nextReadIds,
      deletedIds: notificationStorage.deletedIds,
    };

    setNotificationStorage(nextState);
    saveNotificationStorageState(user.uid, nextState);
  };

  const deleteNotification = (notificationId: string) => {
    if (!user) return;

    const nextDeletedIds = Array.from(new Set([...notificationStorage.deletedIds, notificationId]));
    const nextReadIds = notificationStorage.readIds.filter((id) => id !== notificationId);
    const nextState = {
      readIds: nextReadIds,
      deletedIds: nextDeletedIds,
    };

    setNotificationStorage(nextState);
    setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
    saveNotificationStorageState(user.uid, nextState);
  };

  const markAllNotificationsRead = () => {
    if (!user || notifications.length === 0) return;

    const visibleIds = notifications.map((item) => item.id);
    const nextState = {
      readIds: Array.from(new Set([...notificationStorage.readIds, ...visibleIds])),
      deletedIds: notificationStorage.deletedIds,
    };

    setNotificationStorage(nextState);
    saveNotificationStorageState(user.uid, nextState);
  };

  const deleteAllNotifications = () => {
    if (!user || notifications.length === 0) return;

    const visibleIds = notifications.map((item) => item.id);
    const nextState = {
      readIds: notificationStorage.readIds.filter((id) => !visibleIds.includes(id)),
      deletedIds: Array.from(new Set([...notificationStorage.deletedIds, ...visibleIds])),
    };

    setNotificationStorage(nextState);
    setNotifications([]);
    saveNotificationStorageState(user.uid, nextState);
  };

  const openNotification = (notification: NavbarNotification) => {
    if (!user) return;

    const nextReadIds = notificationStorage.readIds.includes(notification.id)
      ? notificationStorage.readIds
      : [...notificationStorage.readIds, notification.id];
    const nextState = {
      readIds: nextReadIds,
      deletedIds: notificationStorage.deletedIds,
    };

    setNotificationStorage(nextState);
    saveNotificationStorageState(user.uid, nextState);

    setIsNotificationsOpen(false);
    setIsUserMenuOpen(false);
    setIsMobileMenuOpen(false);
    router.push(notification.targetHref);
  };

  const unreadNotificationCount = useMemo(() => {
    if (!isNotificationStorageHydrated) {
      return 0;
    }

    return notifications.filter((item) => !notificationStorage.readIds.includes(item.id)).length;
  }, [notifications, notificationStorage.readIds, isNotificationStorageHydrated]);
  const unreadNotificationLabel =
    unreadNotificationCount > 0 ? `${unreadNotificationCount} non lue${unreadNotificationCount > 1 ? 's' : ''}` : '';
  const visibleNotifications = notifications.slice(0, 5);

  const notificationTypeLabels: Record<NavbarNotification['type'], string> = {
    payment: 'Paiement',
    video: 'Cours',
    qcm: 'QCM',
    openQuestion: 'Question',
    diagram: 'Schema',
    clinicalCase: 'Cas clinique',
  };

  const formatNotificationTime = (timestamp: number) => {
    if (!timestamp || Number.isNaN(timestamp)) return 'A l\'instant';

    const diffMs = timestamp - Date.now();
    const diffMinutes = Math.round(diffMs / 60000);
    const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

    if (Math.abs(diffMinutes) < 60) {
      return rtf.format(diffMinutes, 'minute');
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
      return rtf.format(diffHours, 'hour');
    }

    const diffDays = Math.round(diffHours / 24);
    if (Math.abs(diffDays) < 7) {
      return rtf.format(diffDays, 'day');
    }

    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getTypeToneClass = (type: NavbarNotification['type']) => {
    switch (type) {
      case 'payment':
        return 'notification-type-chip tone-payment';
      case 'video':
        return 'notification-type-chip tone-video';
      case 'qcm':
        return 'notification-type-chip tone-qcm';
      case 'openQuestion':
        return 'notification-type-chip tone-open-question';
      case 'diagram':
        return 'notification-type-chip tone-diagram';
      case 'clinicalCase':
        return 'notification-type-chip tone-clinical-case';
      default:
        return 'notification-type-chip';
    }
  };

  const renderNotificationsPanel = (mode: 'desktop' | 'mobile') => (
    <div
      className={`notification-panel-shell ${mode === 'desktop' ? 'w-100 max-w-[calc(100vw-2rem)]' : 'w-full'}`}
      role="dialog"
      aria-label="Liste des notifications"
    >
      <div className="notification-panel-header">
        <div className="flex items-center gap-3">
          <div className="notification-panel-bell-wrap">
            <Bell className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-(--app-text)">Notifications</p>
            {unreadNotificationLabel && <span className="text-xs text-(--app-muted)">{unreadNotificationLabel}</span>}
          </div>
        </div>

        {notifications.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={markAllNotificationsRead}
              disabled={unreadNotificationCount === 0}
              className="notification-header-action"
            >
              Tout lire
            </button>
            <button
              type="button"
              onClick={deleteAllNotifications}
              className="notification-header-action danger"
            >
              Tout supprimer
            </button>
          </div>
        )}
      </div>

      <div className="notification-panel-body">
        {isLoadingNotifications ? (
          <div className="notification-empty-state">
            <p className="text-sm font-medium text-(--app-text)">Chargement des notifications...</p>
            <p className="text-xs text-(--app-muted)">Un instant, nous recuperons les nouveautes.</p>
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="notification-empty-state">
            <p className="text-sm font-medium text-(--app-text)">Aucune notification</p>
            <p className="text-xs text-(--app-muted)">Les nouvelles activites apparaitront ici.</p>
          </div>
        ) : (
          <ul className="space-y-2 p-2">
            {visibleNotifications.map((notification) => {
              const isRead = notificationStorage.readIds.includes(notification.id);

              return (
                <li key={notification.id} className={`notification-card ${isRead ? 'is-read' : 'is-unread'}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className="notification-card-main"
                      title="Ouvrir la notification"
                      aria-label="Ouvrir la notification"
                    >
                      <div className="flex items-center gap-2">
                        <span className={getTypeToneClass(notification.type)}>{notificationTypeLabels[notification.type]}</span>
                        <span className="notification-time">{formatNotificationTime(notification.createdAt)}</span>
                      </div>
                      <p className="notification-title mt-1">{notification.title}</p>
                      <p className="notification-desc line-clamp-2">{notification.description}</p>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          toggleNotificationRead(notification.id);
                        }}
                        className={`notification-action mark-read ${isRead ? 'read' : 'unread'}`}
                        title={isRead ? 'Marquer comme non vue' : 'Marquer comme vue'}
                        aria-label={isRead ? 'Marquer comme non vue' : 'Marquer comme vue'}
                      >
                        {isRead ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          deleteNotification(notification.id);
                        }}
                        className="notification-action delete"
                        title="Supprimer"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="notification-panel-footer">
        <Link
          href="/notifications"
          onClick={() => {
            setIsNotificationsOpen(false);
            setIsUserMenuOpen(false);
            setIsMobileMenuOpen(false);
          }}
          className="notification-footer-action"
        >
          Voir toutes les notifications
        </Link>
      </div>
    </div>
  );

  useEffect(() => {
    if (!user) {
      setNotificationStorage({ readIds: [], deletedIds: [] });
      setNotifications([]);
      setIsNotificationStorageHydrated(false);
      return;
    }

    if (!profile) {
      return;
    }

    setIsNotificationStorageHydrated(false);
    const stored = loadNotificationStorageState(user.uid);
    setNotificationStorage(stored);
    setIsNotificationStorageHydrated(true);
  }, [user, profile]);

  useEffect(() => {
    if (!user || !isNotificationStorageHydrated) return;

    const unsubscribe = subscribeToNotificationStorageChanges((event) => {
      if (event.uid !== user.uid) {
        return;
      }

      setNotificationStorage((prev) => {
        const sameRead = prev.readIds.length === event.state.readIds.length &&
          prev.readIds.every((value, index) => value === event.state.readIds[index]);
        const sameDeleted = prev.deletedIds.length === event.state.deletedIds.length &&
          prev.deletedIds.every((value, index) => value === event.state.deletedIds[index]);

        return sameRead && sameDeleted ? prev : event.state;
      });
      setNotifications((prev) => {
        const nextNotifications = prev.filter((item) => !event.state.deletedIds.includes(item.id));
        return nextNotifications.length === prev.length ? prev : nextNotifications;
      });
    });

    return unsubscribe;
  }, [user, isNotificationStorageHydrated]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setNotificationStorage({ readIds: [], deletedIds: [] });
      setIsNotificationStorageHydrated(false);
      setIsLoadingNotifications(false);
      return;
    }

    if (!profile) {
      setNotifications([]);
      setIsLoadingNotifications(false);
      return;
    }

    void fetchNotifications({ showLoading: true });

    const relevantCollections = new Set(['videos', 'qcms', 'openQuestions', 'diagrams', 'clinicalCases', 'notifications', 'payments']);
    const unsubscribe = subscribeToDataChanges((event) => {
      if (!relevantCollections.has(event.collection)) {
        return;
      }

      void fetchNotifications({ showLoading: false });
    });

    const timer = window.setInterval(() => {
      void fetchNotifications({ showLoading: false });
    }, 5000);

    // Revalidation au focus / retour onglet (temps réel perçu)
    const handleFocus = () => void fetchNotifications({ showLoading: false });
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void fetchNotifications({ showLoading: false });
      }
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, profile, fetchNotifications]);

  useEffect(() => {
    if (!isUserMenuOpen && !isNotificationsOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const targetNode = event.target as Node | null;
      if (userMenuRef.current && targetNode && !userMenuRef.current.contains(targetNode)) {
        setIsUserMenuOpen(false);
      }
      const isInsideDesktopNotification =
        notificationDesktopRef.current && targetNode
          ? notificationDesktopRef.current.contains(targetNode)
          : false;
      const isInsideMobileNotification =
        notificationMobileRef.current && targetNode
          ? notificationMobileRef.current.contains(targetNode)
          : false;

      if (!isInsideDesktopNotification && !isInsideMobileNotification) {
        setIsNotificationsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isUserMenuOpen, isNotificationsOpen]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen(true);
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  return (
    <>

      <header className="fly-header-shell sticky top-0 z-50 w-full text-(--app-text)">
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 lg:h-24 flex items-center justify-between gap-2 relative">
          {/* Logo à gauche */}
          <div className="flex items-center min-w-30">
            <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity group">
              <Image src="/logo.svg" alt="DEMS ENT" width={120} height={72} className="h-9 w-auto sm:h-10 navbar-logo" priority />
              <span className="font-bold text-xl tracking-tight text-(--app-text) hidden sm:inline">DEMS ENT</span>
            </Link>
          </div>

          {/* Navigation centrée (XL+) */}
          <div className="flex-1 flex justify-center">
            <nav className="fly-glass-pill pointer-events-auto hidden xl:flex items-center rounded-full px-3 text-sm font-medium text-(--app-text)">
              {visibleNavLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`fly-nav-link px-3 py-2.5 ${
                    isRouteActive(link.href)
                      ? 'is-active text-(--app-accent)'
                      : 'text-(--app-muted) hover:text-(--app-text)'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>
          </div>

          {/* Actions à droite (desktop) */}
          <div className="hidden lg:flex items-center gap-3 min-w-55 justify-end">
            {/* Nav compact (lg-xl) */}
            <div className="fly-glass-pill hidden lg:flex xl:hidden items-center rounded-full px-2 py-1">
              {visibleNavLinks.map((link) => (
                <Link
                  key={`compact-${link.name}`}
                  href={link.href}
                  className={`fly-nav-link px-3 py-2 text-sm font-medium ${
                    isRouteActive(link.href)
                      ? 'is-active text-(--app-accent)'
                      : 'text-(--app-muted) hover:text-(--app-text)'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
            </div>
            {/* Actions utilisateur */}
            <div className="fly-glass-pill flex items-center gap-2 rounded-full px-3 py-1">
              <motion.button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                onMouseEnter={() => setIsSearchHover(true)}
                onMouseLeave={() => setIsSearchHover(false)}
                className="no-fly-style relative inline-flex items-center gap-2 rounded-full bg-[var(--app-surface)]/85 backdrop-blur px-3.5 py-2 text-sm text-(--app-muted) hover:text-(--app-text) hover:bg-[var(--app-surface-2)] transition-colors border border-[color-mix(in_oklab,var(--app-border)_60%,transparent)]"
                title="Ouvrir la recherche"
                aria-label="Ouvrir la recherche"
              >
                <Search className="h-4 w-4" />
                <AnimatePresence>
                  {(isSearchHover || isSearchOpen) && (
                    <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} className="flex items-center gap-2 whitespace-nowrap">
                      <span>Recherche</span>
                      <span className="rounded-md border border-(--app-border) px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Ctrl/⌘ K</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
              <button
                type="button"
                onClick={toggleThemeMode}
                className="no-fly-style p-2 rounded-full bg-[var(--app-surface)]/85 backdrop-blur text-(--app-muted) hover:text-(--app-text) hover:bg-[var(--app-surface-2)] transition-colors border border-[color-mix(in_oklab,var(--app-border)_60%,transparent)]"
                title={themeMode === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
                aria-label={themeMode === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              >
                {themeMode === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              {user && (
                <div ref={notificationDesktopRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsNotificationsOpen((v) => !v);
                      setIsUserMenuOpen(false);
                    }}
                    className="no-fly-style relative p-2 text-(--app-muted) hover:text-(--app-text) rounded-full transition-colors focus:bg-transparent active:bg-transparent"
                    title="Notifications"
                    aria-label="Notifications"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadNotificationCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full">
                        {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                      </span>
                    )}
                  </button>

                  <AnimatePresence>
                    {isNotificationsOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="absolute right-0 top-11 z-50"
                      >
                        {renderNotificationsPanel('desktop')}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {user && !isAdmin && (
                <Link href="/checkout" className="relative p-2 no-fly-style text-(--app-muted) hover:text-(--app-text) rounded-full transition-colors">
                  <ShoppingCart className="h-5 w-5" />
                  {itemCount > 0 && (
                    <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full">
                      {itemCount}
                    </span>
                  )}
                </Link>
              )}
              {!loading && (
                <>
                  {user && profile ? (
                    <div ref={userMenuRef} className="relative flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsUserMenuOpen((v) => !v)}
                        onMouseEnter={() => setIsAccountHover(true)}
                        onMouseLeave={() => setIsAccountHover(false)}
                        className="no-fly-style flex items-center gap-2 rounded-full bg-white/75 px-2 py-1.5 hover:bg-white transition-colors"
                        title={doctorName || profile.email}
                        aria-label={doctorName || profile.email}
                      >
                        <div className="relative w-8 h-8 rounded-full bg-(--app-surface-2) overflow-hidden flex items-center justify-center">
                          {profile.photoURL ? (
                            <Image
                              src={profile.photoURL}
                              alt={profile.displayName}
                              fill
                              sizes="32px"
                              className="object-cover"
                              onError={(event) => applyImageFallback(event, AVATAR_FALLBACK_SRC)}
                            />
                          ) : (
                            <User className="h-5 w-5 text-(--app-muted)" />
                          )}
                        </div>

                        <AnimatePresence>
                          {(isAccountHover || isUserMenuOpen) && (
                            <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} className="flex items-center gap-2 whitespace-nowrap">
                              <span className="text-sm font-medium text-(--app-text) max-w-40 truncate">
                                {doctorName || profile.email}
                              </span>
                              <ChevronDown className="h-4 w-4 text-(--app-muted)" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </button>

                      {isUserMenuOpen && (
                        <div className="absolute right-0 top-11 w-56 rounded-xl border border-(--app-border) bg-(--app-surface) shadow-lg py-2 z-50">
                          {profile.role === 'admin' && (
                            <Link
                              href="/admin"
                              onClick={() => setIsUserMenuOpen(false)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-(--app-text) hover:bg-(--app-surface-2)"
                            >
                              <LayoutDashboard className="h-4 w-4 text-(--app-muted)" />
                              <span>Dashboard</span>
                            </Link>
                          )}

                          <Link
                            href="/dashboard?tab=profile"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-(--app-text) hover:bg-(--app-surface-2)"
                          >
                            <Settings className="h-4 w-4 text-(--app-muted)" />
                            <span>Paramètres</span>
                          </Link>

                          <button
                            type="button"
                            onClick={async () => {
                              setIsUserMenuOpen(false);
                              await handleSignOut();
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            <LogOut className="h-4 w-4" />
                            <span>Déconnexion</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Link
                        href="/sign-up"
                        className="px-4 py-2 rounded-full text-sm font-medium text-(--app-accent) border border-white/70 bg-white/75 hover:bg-white transition-colors"
                      >
                        Inscription
                      </Link>
                      <Link
                        href="/sign-in"
                        className="flex items-center gap-2 bg-medical-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-medical-700 transition-colors shadow-sm"
                      >
                        <LogIn className="h-4 w-4" />
                        <span>Connexion</span>
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Actions à droite (mobile / tablet) */}
          <div className="flex lg:hidden items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(true);
                setIsNotificationsOpen(false);
              }}
              className="no-fly-style p-2 rounded-full bg-[var(--app-surface)]/85 backdrop-blur text-(--app-muted) hover:text-(--app-text) hover:bg-[var(--app-surface-2)] transition-colors border border-[color-mix(in_oklab,var(--app-border)_60%,transparent)]"
              title="Ouvrir la recherche"
              aria-label="Ouvrir la recherche"
            >
              <Search className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>

            <button
              type="button"
              onClick={toggleThemeMode}
              className="no-fly-style p-2 rounded-full bg-[var(--app-surface)]/85 backdrop-blur text-(--app-muted) hover:text-(--app-text) hover:bg-[var(--app-surface-2)] transition-colors border border-[color-mix(in_oklab,var(--app-border)_60%,transparent)]"
              title={themeMode === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              aria-label={themeMode === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
            >
              {themeMode === 'dark' ? <Sun className="h-4 w-4 sm:h-5 sm:w-5" /> : <Moon className="h-4 w-4 sm:h-5 sm:w-5" />}
            </button>

            {user && (
              <button
                type="button"
                onClick={() => {
                  setIsNotificationsOpen((v) => !v);
                  setIsMobileMenuOpen(false);
                  setIsUserMenuOpen(false);
                }}
                className="no-fly-style relative p-2 rounded-full bg-[var(--app-surface)]/85 backdrop-blur text-(--app-muted) hover:text-(--app-text) hover:bg-[var(--app-surface-2)] transition-colors border border-[color-mix(in_oklab,var(--app-border)_60%,transparent)]"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>
            )}

            {user && !isAdmin && (
              <Link
                href="/checkout"
                className="relative p-2 no-fly-style rounded-full bg-[var(--app-surface)]/85 backdrop-blur text-(--app-muted) hover:text-(--app-text) hover:bg-[var(--app-surface-2)] transition-colors border border-[color-mix(in_oklab,var(--app-border)_60%,transparent)]"
              >
                <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
                {itemCount > 0 && (
                  <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full">
                    {itemCount}
                  </span>
                )}
              </Link>
            )}

            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(true);
                setIsNotificationsOpen(false);
                setIsUserMenuOpen(false);
              }}
              className="no-fly-style p-2 rounded-full bg-[var(--app-surface)]/85 backdrop-blur text-(--app-muted) hover:text-(--app-text) hover:bg-[var(--app-surface-2)] transition-colors border border-[color-mix(in_oklab,var(--app-border)_60%,transparent)]"
              title="Ouvrir le menu"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

        {/* Mobile Nav Drawer */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.button
                type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/25 backdrop-blur-sm z-40"
              aria-label="Fermer le menu"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fly-drawer-shell lg:hidden fixed top-0 left-0 bottom-0 z-50 w-full max-w-sm border-r border-(--app-border) shadow-2xl"
            >
            <div className="flex items-center justify-between px-4 py-5 border-b border-(--app-border)">
              <div className="flex items-center gap-2">
                <Image src="/logo.svg" alt="DEMS ENT" width={80} height={48} className="h-8 w-auto navbar-logo" />
                <span className="font-semibold text-(--app-text)">Navigation</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-full hover:bg-(--app-surface-2)"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col px-4 py-4 gap-4 overflow-y-auto h-[calc(100%-68px)]">
              {visibleNavLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`fly-nav-link justify-start px-3 py-2.5 text-base font-medium ${
                    isRouteActive(link.href)
                      ? 'is-active text-(--app-accent) bg-[color-mix(in_oklab,var(--app-accent)_12%,transparent)]'
                      : 'text-(--app-text) hover:text-(--app-accent)'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
              <div className="h-px bg-(--app-border) my-2" />
              {!loading && (
                user ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 rounded-full bg-(--app-surface-2) overflow-hidden flex items-center justify-center">
                        {profile?.photoURL ? (
                          <Image
                            src={profile.photoURL}
                            alt={profile.displayName}
                            fill
                            sizes="40px"
                            className="object-cover"
                            onError={(event) => applyImageFallback(event, AVATAR_FALLBACK_SRC)}
                          />
                        ) : (
                          <User className="h-5 w-5 text-(--app-muted)" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-(--app-text)">{doctorName || profile?.email}</span>
                      </div>
                    </div>

                    {profile?.role === 'admin' && (
                      <Link
                        href="/admin"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-2 text-base font-medium text-(--app-text)"
                      >
                        <LayoutDashboard className="h-5 w-5 text-(--app-muted)" />
                        <span>Dashboard</span>
                      </Link>
                    )}

                    <Link
                      href="/dashboard?tab=profile"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-2 text-base font-medium text-(--app-text)"
                    >
                      <Settings className="h-5 w-5 text-(--app-muted)" />
                      <span>Paramètres</span>
                    </Link>

                    <button
                      onClick={() => { handleSignOut(); setIsMobileMenuOpen(false); }}
                      className="flex items-center gap-2 text-base font-medium text-red-600"
                    >
                      <LogOut className="h-5 w-5" />
                      <span>Déconnexion</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Link
                      href="/sign-up"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 bg-[var(--app-surface)] text-[var(--app-accent)] border border-[var(--app-border)] px-4 py-3 rounded-xl text-base font-medium hover:bg-[var(--app-surface-2)]"
                    >
                      Inscription
                    </Link>
                    <Link
                      href="/sign-in"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 bg-medical-600 text-white px-4 py-3 rounded-xl text-base font-medium"
                    >
                      <LogIn className="h-5 w-5" />
                      <span>Connexion</span>
                    </Link>
                  </div>
                )
              )}
            </div>
            </motion.div>
          </>
        )}
        </AnimatePresence>

        <AnimatePresence>
          {user && isNotificationsOpen && (
            <motion.div
              ref={notificationMobileRef}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="lg:hidden absolute top-16 sm:top-20 right-3 left-3 sm:right-4 sm:left-4 z-50 max-h-[min(70vh,520px)] overflow-auto"
            >
              {renderNotificationsPanel('mobile')}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
    <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}
