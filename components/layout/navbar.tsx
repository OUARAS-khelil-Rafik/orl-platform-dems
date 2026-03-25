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
  Stethoscope,
  ShoppingCart,
  ChevronDown,
  LayoutDashboard,
  ShoppingBag,
  Settings,
  Bell,
  Mail,
  MailOpen,
  Trash2,
  Sun,
  Moon,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { db, collection, getDocs, query, where } from '@/lib/local-data';
import { SearchModal } from '@/components/search-modal';

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

type NotificationStorageState = {
  readIds: string[];
  deletedIds: string[];
};

const NOTIFICATION_STORAGE_PREFIX = 'dems-navbar-notifications-v1';
const THEME_STORAGE_KEY = 'dems-theme-mode-v1';

export function Navbar() {
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();
  const { itemCount } = useCart();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchHover, setIsSearchHover] = useState(false);
  const [isAccountHover, setIsAccountHover] = useState(false);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [notifications, setNotifications] = useState<NavbarNotification[]>([]);
  const [notificationReadIds, setNotificationReadIds] = useState<string[]>([]);
  const [notificationDeletedIds, setNotificationDeletedIds] = useState<string[]>([]);
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
    { name: 'Tarifs', href: '/pricing' },
  ];
  const visibleNavLinks = isAdmin ? navLinks.filter((link) => link.name !== 'Tarifs') : navLinks;

  const isRouteActive = (href: string) => {
    if (href === '/') {
      return router.pathname === '/';
    }
    return router.asPath.startsWith(href);
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
    if (typeof window === 'undefined') return;

    const rootTheme = document.documentElement.getAttribute('data-theme');
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const profileTheme = profile?.defaultMode;

    const nextTheme =
      (storedTheme === 'light' || storedTheme === 'dark'
        ? storedTheme
        : rootTheme === 'light' || rootTheme === 'dark'
          ? rootTheme
          : profileTheme === 'light' || profileTheme === 'dark'
            ? profileTheme
            : 'light') as 'light' | 'dark';

    setThemeMode(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }, [profile?.defaultMode]);

  const getNotificationStorageKey = (uid: string) => `${NOTIFICATION_STORAGE_PREFIX}-${uid}`;

  const loadNotificationStorage = useCallback((uid: string): NotificationStorageState => {
    if (typeof window === 'undefined') {
      return { readIds: [], deletedIds: [] };
    }

    try {
      const raw = window.localStorage.getItem(getNotificationStorageKey(uid));
      if (!raw) {
        return { readIds: [], deletedIds: [] };
      }

      const parsed = JSON.parse(raw) as NotificationStorageState;
      return {
        readIds: Array.isArray(parsed.readIds) ? parsed.readIds : [],
        deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [],
      };
    } catch {
      return { readIds: [], deletedIds: [] };
    }
  }, []);

  const saveNotificationStorage = (uid: string, nextState: NotificationStorageState) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getNotificationStorageKey(uid), JSON.stringify(nextState));
  };

  const parseDateToMs = (value: unknown) => {
    if (typeof value !== 'string') return 0;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const fetchNotifications = useCallback(async () => {
    if (!user || !profile) {
      setNotifications([]);
      return;
    }

    try {
      setIsLoadingNotifications(true);

      const [videosSnap, qcmsSnap, openQuestionsSnap, diagramsSnap, clinicalCasesSnap] = await Promise.all([
        getDocs(collection(db, 'videos')),
        getDocs(collection(db, 'qcms')),
        getDocs(collection(db, 'openQuestions')),
        getDocs(collection(db, 'diagrams')),
        getDocs(collection(db, 'clinicalCases')),
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
          title: 'Nouvelle question ouverte',
          description: `Question ouverte ajoutée dans ${videoTitle}.`,
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

      const filtered = nextNotifications
        .filter((item) => !notificationDeletedIds.includes(item.id))
        .sort((a, b) => b.createdAt - a.createdAt);

      setNotifications(filtered);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [user, profile, notificationDeletedIds]);

  const toggleNotificationRead = (notificationId: string) => {
    if (!user) return;

    const nextReadIds = notificationReadIds.includes(notificationId)
      ? notificationReadIds.filter((id) => id !== notificationId)
      : [...notificationReadIds, notificationId];

    setNotificationReadIds(nextReadIds);
    saveNotificationStorage(user.uid, {
      readIds: nextReadIds,
      deletedIds: notificationDeletedIds,
    });
  };

  const deleteNotification = (notificationId: string) => {
    if (!user) return;

    if (notificationDeletedIds.includes(notificationId)) return;

    const nextDeletedIds = [...notificationDeletedIds, notificationId];
    setNotificationDeletedIds(nextDeletedIds);
    setNotifications((prev) => prev.filter((item) => item.id !== notificationId));

    saveNotificationStorage(user.uid, {
      readIds: notificationReadIds,
      deletedIds: nextDeletedIds,
    });
  };

  const markAllNotificationsRead = () => {
    if (!user || notifications.length === 0) return;

    const nextReadIds = Array.from(new Set([...notificationReadIds, ...notifications.map((item) => item.id)]));
    setNotificationReadIds(nextReadIds);
    saveNotificationStorage(user.uid, {
      readIds: nextReadIds,
      deletedIds: notificationDeletedIds,
    });
  };

  const deleteAllNotifications = () => {
    if (!user || notifications.length === 0) return;

    const nextDeletedIds = Array.from(
      new Set([...notificationDeletedIds, ...notifications.map((item) => item.id)]),
    );

    setNotificationDeletedIds(nextDeletedIds);
    setNotifications([]);
    setShowAllNotifications(false);

    saveNotificationStorage(user.uid, {
      readIds: notificationReadIds,
      deletedIds: nextDeletedIds,
    });
  };

  const openNotification = (notification: NavbarNotification) => {
    if (!user) return;

    if (!notificationReadIds.includes(notification.id)) {
      const nextReadIds = [...notificationReadIds, notification.id];
      setNotificationReadIds(nextReadIds);
      saveNotificationStorage(user.uid, {
        readIds: nextReadIds,
        deletedIds: notificationDeletedIds,
      });
    }

    setIsNotificationsOpen(false);
    setIsUserMenuOpen(false);
    setIsMobileMenuOpen(false);
    router.push(notification.targetHref);
  };

  const unreadNotificationCount = notifications.filter((item) => !notificationReadIds.includes(item.id)).length;
  const visibleNotifications = showAllNotifications ? notifications : notifications.slice(0, 5);

  useEffect(() => {
    if (!user) {
      setNotificationReadIds([]);
      setNotificationDeletedIds([]);
      setNotifications([]);
      return;
    }

    const stored = loadNotificationStorage(user.uid);
    setNotificationReadIds(stored.readIds);
    setNotificationDeletedIds(stored.deletedIds);
  }, [user, loadNotificationStorage]);

  useEffect(() => {
    if (!user || !profile) return;
    fetchNotifications();
    const timer = window.setInterval(() => {
      fetchNotifications();
    }, 60000);

    return () => window.clearInterval(timer);
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

      <header className="fly-header-shell sticky top-0 z-50 w-full text-[var(--app-text)]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-24 flex items-center justify-between gap-2 relative">
          {/* Logo à gauche */}
          <div className="flex items-center min-w-[120px]">
            <Link href="/" className="flex items-center gap-2 text-[var(--app-accent)] hover:opacity-85 transition-opacity group">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center border border-[color-mix(in_oklab,var(--app-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--app-accent)_16%,transparent)]">
                <Stethoscope className="h-5 w-5 group-hover:rotate-6 transition-transform" />
              </div>
              <span className="font-bold text-xl tracking-tight">DEMS ENT</span>
            </Link>
          </div>

          {/* Navigation centrée (XL+) */}
          <div className="flex-1 flex justify-center">
            <nav className="fly-glass-pill pointer-events-auto hidden xl:flex items-center rounded-full px-3 text-sm font-medium text-[var(--app-text)]">
              {visibleNavLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`fly-nav-link px-3 py-2.5 ${
                    isRouteActive(link.href)
                      ? 'is-active text-[var(--app-accent)]'
                      : 'text-[var(--app-muted)] hover:text-[var(--app-text)]'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>
          </div>

          {/* Actions à droite (desktop) */}
          <div className="hidden lg:flex items-center gap-3 min-w-[220px] justify-end">
            {/* Nav compact (lg-xl) */}
            <div className="fly-glass-pill hidden lg:flex xl:hidden items-center rounded-full px-2 py-1">
              {visibleNavLinks.map((link) => (
                <Link
                  key={`compact-${link.name}`}
                  href={link.href}
                  className={`fly-nav-link px-3 py-2 text-sm font-medium ${
                    isRouteActive(link.href)
                      ? 'is-active text-[var(--app-accent)]'
                      : 'text-[var(--app-muted)] hover:text-[var(--app-text)]'
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
                className="no-fly-style relative inline-flex items-center gap-2 rounded-full bg-white/75 px-3.5 py-2 text-sm text-[var(--app-muted)] hover:text-[var(--app-text)] hover:bg-white transition-colors"
                title="Ouvrir la recherche"
                aria-label="Ouvrir la recherche"
              >
                <Search className="h-4 w-4" />
                <AnimatePresence>
                  {(isSearchHover || isSearchOpen) && (
                    <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} className="flex items-center gap-2 whitespace-nowrap">
                      <span>Recherche</span>
                      <span className="rounded-md border border-[var(--app-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Ctrl/⌘ K</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
              <button
                type="button"
                onClick={toggleThemeMode}
                className="no-fly-style p-2 rounded-full bg-white/75 text-[var(--app-muted)] hover:text-[var(--app-text)] hover:bg-white transition-colors"
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
                      setShowAllNotifications(false);
                    }}
                    className="no-fly-style relative p-2 text-[var(--app-muted)] hover:text-[var(--app-text)] rounded-full transition-colors focus:bg-transparent active:bg-transparent"
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

                  {isNotificationsOpen && (
                    <div className="absolute right-0 top-11 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-lg py-2 z-50">
                      <div className="px-3 pb-2 border-b border-[var(--app-border)] flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[var(--app-text)]">Notifications</p>
                          <span className="text-xs text-[var(--app-muted)]">{unreadNotificationCount} non lue(s)</span>
                        </div>
                        {notifications.length > 0 && (
                          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={markAllNotificationsRead}
                              disabled={unreadNotificationCount === 0}
                              className="text-xs font-medium text-[var(--app-accent)] hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Marquer tout lu
                            </button>
                            <button
                              type="button"
                              onClick={deleteAllNotifications}
                              className="text-xs font-medium text-[var(--app-danger)] hover:opacity-85"
                            >
                              Supprimer tous
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="max-h-80 overflow-y-auto">
                        {isLoadingNotifications ? (
                          <p className="px-3 py-4 text-sm text-[var(--app-muted)]">Chargement...</p>
                        ) : visibleNotifications.length === 0 ? (
                          <p className="px-3 py-4 text-sm text-[var(--app-muted)]">Aucune notification.</p>
                        ) : (
                          <ul className="divide-y divide-[var(--app-border)]">
                            {visibleNotifications.map((notification) => {
                              const isRead = notificationReadIds.includes(notification.id);
                              return (
                                <li key={notification.id} className={`px-3 py-2 notification-item ${isRead ? 'read' : 'unread'}`}>
                                  <div className="flex items-start justify-between gap-3">
                                    <button
                                      type="button"
                                      onClick={() => openNotification(notification)}
                                      className="min-w-0 flex-1 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                                      title="Ouvrir la notification"
                                      aria-label="Ouvrir la notification"
                                    >
                                      <p className="text-sm font-medium truncate notification-title">{notification.title}</p>
                                      <p className="text-xs line-clamp-2 notification-desc">{notification.description}</p>
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          toggleNotificationRead(notification.id);
                                        }}
                                        className={`notification-action mark-read ${isRead ? 'read' : 'unread'}`}
                                        title={isRead ? 'Marquer non lue' : 'Marquer lue'}
                                        aria-label={isRead ? 'Marquer non lue' : 'Marquer lue'}
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

                      {notifications.length > 5 && (
                        <div className="px-3 pt-2 border-t border-[var(--app-border)]">
                          <button
                            type="button"
                            onClick={() => setShowAllNotifications((v) => !v)}
                            className="text-xs font-medium text-[var(--app-accent)] hover:opacity-85"
                          >
                            {showAllNotifications ? 'Voir moins' : 'Voir toutes les notifications'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {user && !isAdmin && (
                <Link href="/checkout" className="relative p-2 no-fly-style text-[var(--app-muted)] hover:text-[var(--app-text)] rounded-full transition-colors">
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
                        <div className="w-8 h-8 rounded-full bg-[var(--app-surface-2)] overflow-hidden flex items-center justify-center">
                          {profile.photoURL ? (
                            <Image
                              src={profile.photoURL}
                              alt={profile.displayName}
                              width={32}
                              height={32}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="h-5 w-5 text-[var(--app-muted)]" />
                          )}
                        </div>

                        <AnimatePresence>
                          {(isAccountHover || isUserMenuOpen) && (
                            <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} className="flex items-center gap-2 whitespace-nowrap">
                              <span className="text-sm font-medium text-[var(--app-text)] max-w-[160px] truncate">
                                {doctorName || profile.email}
                              </span>
                              <ChevronDown className="h-4 w-4 text-[var(--app-muted)]" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </button>

                      {isUserMenuOpen && (
                        <div className="absolute right-0 top-11 w-56 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-lg py-2 z-50">
                          {profile.role === 'admin' && (
                            <Link
                              href="/admin"
                              onClick={() => setIsUserMenuOpen(false)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--app-text)] hover:bg-[var(--app-surface-2)]"
                            >
                              <LayoutDashboard className="h-4 w-4 text-[var(--app-muted)]" />
                              <span>Dashboard</span>
                            </Link>
                          )}

                          {(profile.role === 'vip' || profile.role === 'vip_plus') && (
                            <Link
                              href="/purchases"
                              onClick={() => setIsUserMenuOpen(false)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--app-text)] hover:bg-[var(--app-surface-2)]"
                            >
                              <ShoppingBag className="h-4 w-4 text-[var(--app-muted)]" />
                              <span>Mes Achats</span>
                            </Link>
                          )}

                          <Link
                            href="/dashboard?tab=profile"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--app-text)] hover:bg-[var(--app-surface-2)]"
                          >
                            <Settings className="h-4 w-4 text-[var(--app-muted)]" />
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
                        className="px-4 py-2 rounded-full text-sm font-medium text-[var(--app-accent)] border border-white/70 bg-white/75 hover:bg-white transition-colors"
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
              className="fly-drawer-shell lg:hidden fixed top-0 left-0 bottom-0 z-50 w-full max-w-sm border-r border-[var(--app-border)] shadow-2xl"
            >
            <div className="flex items-center justify-between px-4 py-5 border-b border-[var(--app-border)]">
              <div className="flex items-center gap-2 text-[var(--app-accent)]">
                <Stethoscope className="h-5 w-5" />
                <span className="font-semibold">Navigation</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-full hover:bg-[var(--app-surface-2)]"
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
                      ? 'is-active text-[var(--app-accent)] bg-[color-mix(in_oklab,var(--app-accent)_12%,transparent)]'
                      : 'text-[var(--app-text)] hover:text-[var(--app-accent)]'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
              <div className="h-px bg-[var(--app-border)] my-2" />
              {!loading && (
                user ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[var(--app-surface-2)] overflow-hidden flex items-center justify-center">
                        {profile?.photoURL ? (
                          <Image
                            src={profile.photoURL}
                            alt={profile.displayName}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="h-5 w-5 text-[var(--app-muted)]" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-[var(--app-text)]">{doctorName || profile?.email}</span>
                      </div>
                    </div>

                    {profile?.role === 'admin' && (
                      <Link
                        href="/admin"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-2 text-base font-medium text-[var(--app-text)]"
                      >
                        <LayoutDashboard className="h-5 w-5 text-[var(--app-muted)]" />
                        <span>Dashboard</span>
                      </Link>
                    )}

                    {(profile?.role === 'vip' || profile?.role === 'vip_plus') && (
                      <Link
                        href="/purchases"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-2 text-base font-medium text-[var(--app-text)]"
                      >
                        <ShoppingBag className="h-5 w-5 text-[var(--app-muted)]" />
                        <span>Mes Achats</span>
                      </Link>
                    )}

                    <Link
                      href="/dashboard?tab=profile"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-2 text-base font-medium text-[var(--app-text)]"
                    >
                      <Settings className="h-5 w-5 text-[var(--app-muted)]" />
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
                      className="flex items-center justify-center gap-2 bg-white/80 text-medical-700 border border-medical-200 px-4 py-3 rounded-xl text-base font-medium"
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

        {user && isNotificationsOpen && (
          <div ref={notificationMobileRef} className="lg:hidden absolute top-16 right-4 left-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-lg py-2 z-50">
            {/* ...existing code... (notifications mobile) */}
          </div>
        )}
      </div>
    </header>
    <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}
