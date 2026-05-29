'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { Bell, Mail, MailOpen, Trash2, ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { db, collection, doc, getDocs, query, updateDoc, where } from '@/lib/data/local-data';

type UserNotification = {
  id: string;
  title?: string;
  description?: string;
  type?: string;
  targetHref?: string;
  isRead?: boolean;
  createdAt?: string;
};

type Video = {
  id: string;
  title?: string;
  createdAt?: string;
  isFreeDemo?: boolean;
  [key: string]: any;
};

const parseIsoToMs = (value: unknown) => {
  if (typeof value !== 'string') return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export default function NotificationsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notificationReadIds, setNotificationReadIds] = useState<string[]>([]);
  const [notificationDeletedIds, setNotificationDeletedIds] = useState<string[]>([]);
  const [isNotificationStorageHydrated, setIsNotificationStorageHydrated] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    const loadNotifications = async () => {
      if (!user || !profile) {
        setNotifications([]);
        return;
      }

      setIsLoadingNotifications(true);
      try {
        const [videosSnap, qcmsSnap, openQuestionsSnap, diagramsSnap, clinicalCasesSnap, userNotificationsSnap] =
          await Promise.all([
            getDocs(collection(db, 'videos')),
            getDocs(collection(db, 'qcms')),
            getDocs(collection(db, 'openQuestions')),
            getDocs(collection(db, 'diagrams')),
            getDocs(collection(db, 'clinicalCases')),
            getDocs(query(collection(db, 'notifications'), where('userId', '==', user.uid))),
          ]);

        const allVideos: Video[] = videosSnap.docs.map((d) => {
          const data = d.data() as Record<string, any>;
          return { id: d.id, ...data };
        });
        const allowedVideos =
          profile.role === 'admin' || profile.role === 'vip' || profile.role === 'vip_plus'
            ? allVideos
            : allVideos.filter((video) => Boolean(video.isFreeDemo));

        const allowedVideoIds = new Set(allowedVideos.map((v) => v.id));
        const videoTitleById = new Map(allowedVideos.map((v) => [v.id, String(v.title || v.id)]));

        const nextNotifications: UserNotification[] = [];

        // Videos
        allowedVideos.forEach((video) => {
          nextNotifications.push({
            id: `video:${video.id}`,
            type: 'video',
            title: 'Nouveau cours vidéo',
            description: String(video.title || video.id),
            targetHref: `/videos/${video.id}`,
            isRead: false,
            createdAt: String(video.createdAt || ''),
          });
        });

        // QCM
        qcmsSnap.docs.forEach((d) => {
          const data = d.data() as Record<string, any>;
          if (!allowedVideoIds.has(String(data.videoId || ''))) return;
          const videoTitle = videoTitleById.get(String(data.videoId || '')) || String(data.videoId || 'Cours');
          nextNotifications.push({
            id: `qcm:${d.id}`,
            type: 'qcm',
            title: 'Nouveau QCM',
            description: `QCM ajouté dans ${videoTitle}.`,
            targetHref: `/videos/${String(data.videoId)}?tab=qcm`,
            isRead: false,
            createdAt: String(data.createdAt || ''),
          });
        });

        // Open questions
        openQuestionsSnap.docs.forEach((d) => {
          const data = d.data() as Record<string, any>;
          if (!allowedVideoIds.has(String(data.videoId || ''))) return;
          const videoTitle = videoTitleById.get(String(data.videoId || '')) || String(data.videoId || 'Cours');
          nextNotifications.push({
            id: `openQuestion:${d.id}`,
            type: 'openQuestion',
            title: 'Nouveau QROC',
            description: `QROC ajouté dans ${videoTitle}.`,
            targetHref: `/videos/${String(data.videoId)}?tab=open`,
            isRead: false,
            createdAt: String(data.createdAt || ''),
          });
        });

        // Diagrams
        diagramsSnap.docs.forEach((d) => {
          const data = d.data() as Record<string, any>;
          if (!allowedVideoIds.has(String(data.videoId || ''))) return;
          const videoTitle = videoTitleById.get(String(data.videoId || '')) || String(data.videoId || 'Cours');
          nextNotifications.push({
            id: `diagram:${d.id}`,
            type: 'diagram',
            title: 'Nouveau schéma',
            description: `Schéma ajouté dans ${videoTitle}.`,
            targetHref: `/videos/${String(data.videoId)}?tab=diagram`,
            isRead: false,
            createdAt: String(data.createdAt || ''),
          });
        });

        // Clinical cases
        clinicalCasesSnap.docs.forEach((d) => {
          const data = d.data() as Record<string, any>;
          if (!allowedVideoIds.has(String(data.videoId || ''))) return;
          const videoTitle = videoTitleById.get(String(data.videoId || '')) || String(data.videoId || 'Cours');
          nextNotifications.push({
            id: `clinicalCase:${d.id}`,
            type: 'clinicalCase',
            title: 'Nouveau cas clinique',
            description: `Cas clinique ajouté dans ${videoTitle}.`,
            targetHref: `/videos/${String(data.videoId)}?tab=cas`,
            isRead: false,
            createdAt: String(data.createdAt || ''),
          });
        });

        // User notifications stored in DB
        userNotificationsSnap.docs.forEach((d) => {
          const data = d.data() as Record<string, any>;
          const rawType = String(data.type || '').toLowerCase();
          const type = rawType === 'payment' ? 'payment' : 'video';
          nextNotifications.push({
            id: `userNotification:${d.id}`,
            type,
            title: String(data.title || (type === 'payment' ? 'Mise a jour paiement' : 'Mise a jour video')),
            description: String(data.description || ''),
            targetHref: String(data.targetHref || '/checkout'),
            isRead: Boolean(data.isRead),
            createdAt: String(data.createdAt || ''),
          });
        });

        // Apply deleted filter and sort
        // hydrate storage if not yet
        const storageKey = `dems-navbar-notifications-v1-${user.uid}`;
        let stored = { readIds: [] as string[], deletedIds: [] as string[] };
        try {
          const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
          if (raw) {
            const parsed = JSON.parse(raw) as { readIds?: string[]; deletedIds?: string[] };
            stored.readIds = Array.isArray(parsed.readIds) ? parsed.readIds : [];
            stored.deletedIds = Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [];
          }
        } catch {
          // ignore
        }

        // include server-side isRead flags for user notifications
        const serverReadIds = userNotificationsSnap.docs
          .filter((d) => Boolean((d.data() as any).isRead))
          .map((d) => `userNotification:${d.id}`);

        const initialReadIds = Array.from(new Set([...stored.readIds, ...serverReadIds]));

        const filtered = nextNotifications
          .filter((item) => !stored.deletedIds.includes(item.id))
          .sort((a, b) => parseIsoToMs(String(b.createdAt || '')) - parseIsoToMs(String(a.createdAt || '')));

        setNotificationReadIds(initialReadIds);
        setNotificationDeletedIds(stored.deletedIds);
        setIsNotificationStorageHydrated(true);

        setNotifications(filtered);
      } catch (error) {
        console.error('Error loading notifications:', error);
        setNotifications([]);
      } finally {
        setIsLoadingNotifications(false);
      }
    };

    void loadNotifications();
  }, [user, profile]);

  const unreadNotificationsCount = useMemo(() => {
    if (!isNotificationStorageHydrated) {
      return notifications.filter((entry) => !entry.isRead).length;
    }
    return notifications.filter((entry) => !notificationReadIds.includes(entry.id)).length;
  }, [notifications, notificationReadIds, isNotificationStorageHydrated]);

  const getTypeToneClass = (type?: string) => {
    const normalized = String(type || '').toLowerCase();
    switch (normalized) {
      case 'payment':
        return 'notification-type-chip tone-payment';
      case 'video':
        return 'notification-type-chip tone-video';
      case 'qcm':
        return 'notification-type-chip tone-qcm';
      case 'openquestion':
        return 'notification-type-chip tone-open-question';
      case 'diagram':
        return 'notification-type-chip tone-diagram';
      case 'clinicalcase':
        return 'notification-type-chip tone-clinical-case';
      default:
        return 'notification-type-chip';
    }
  };

  const getTypeLabel = (type?: string) => {
    const normalized = String(type || '').toLowerCase();
    switch (normalized) {
      case 'payment':
        return 'Paiement';
      case 'video':
        return 'Cours';
      case 'qcm':
        return 'QCM';
      case 'openquestion':
        return 'Question';
      case 'diagram':
        return 'Schéma';
      case 'clinicalcase':
        return 'Cas clinique';
      default:
        return 'Notification';
    }
  };

  const formatNotificationTime = (timestamp: string | undefined) => {
    if (!timestamp) return 'À l\'instant';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.round(diffMs / 60000);
      const diffHours = Math.round(diffMinutes / 60);
      const diffDays = Math.round(diffHours / 24);

      if (Math.abs(diffMinutes) < 60) {
        return `Il y a ${Math.abs(diffMinutes)}m`;
      }
      if (Math.abs(diffHours) < 24) {
        return `Il y a ${Math.abs(diffHours)}h`;
      }
      if (Math.abs(diffDays) < 7) {
        return `Il y a ${Math.abs(diffDays)}j`;
      }

      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    } catch {
      return 'À l\'instant';
    }
  };

  // Marquer comme lu/non-lu
  const handleToggleNotificationRead = (notificationId: string) => {
    if (!user) return;

    // Calculer le nouvel état AVANT d'utiliser localStorage
    const isCurrentlyRead = notificationReadIds.includes(notificationId);
    const nextRead = isCurrentlyRead
      ? notificationReadIds.filter((id) => id !== notificationId)
      : [...notificationReadIds, notificationId];

    setNotificationReadIds(nextRead);

    // if persisted user notification, update DB
    if (notificationId.startsWith('userNotification:')) {
      const docId = notificationId.replace('userNotification:', '');
      updateDoc(doc(db, 'notifications', docId), {
        isRead: !isCurrentlyRead,
        updatedAt: new Date().toISOString(),
      }).catch((error) => console.error('Error updating notification:', error));
    }

    // save to localStorage avec la valeur calculée
    const storageKey = `dems-navbar-notifications-v1-${user.uid}`;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ readIds: nextRead, deletedIds: notificationDeletedIds }));
    } catch {}
  };

  const handleDeleteNotification = (notificationId: string) => {
    if (!user) return;

    // Calculer les nouveaux états AVANT de les utiliser
    const nextDeleted = Array.from(new Set([...notificationDeletedIds, notificationId]));
    const nextRead = notificationReadIds.filter((id) => id !== notificationId);
    const nextNotifications = notifications.filter((item) => item.id !== notificationId);

    // Puis mettre à jour les états
    setNotificationDeletedIds(nextDeleted);
    setNotificationReadIds(nextRead);
    setNotifications(nextNotifications);

    // save to localStorage avec les valeurs calculées
    const storageKey = `dems-navbar-notifications-v1-${user.uid}`;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ readIds: nextRead, deletedIds: nextDeleted }));
    } catch {}
  };

  // Marquer toutes comme lues
  const handleMarkAllAsRead = () => {
    if (!user || notifications.length === 0) return;
    const visibleIds = notifications.map((n) => n.id);
    const nextRead = Array.from(new Set([...notificationReadIds, ...visibleIds]));
    setNotificationReadIds(nextRead);

    const storageKey = `dems-navbar-notifications-v1-${user.uid}`;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ readIds: nextRead, deletedIds: notificationDeletedIds }));
    } catch {}
  };

  // Supprimer toutes
  const handleDeleteAll = () => {
    if (!user || notifications.length === 0) return;
    const visibleIds = notifications.map((n) => n.id);
    const nextDeleted = Array.from(new Set([...notificationDeletedIds, ...visibleIds]));

    // Calculer les nouveaux états
    const nextRead: string[] = [];
    const nextNotifications: UserNotification[] = [];

    // Puis mettre à jour
    setNotificationDeletedIds(nextDeleted);
    setNotificationReadIds(nextRead);
    setNotifications(nextNotifications);

    const storageKey = `dems-navbar-notifications-v1-${user.uid}`;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ readIds: nextRead, deletedIds: nextDeleted }));
    } catch {}
  };

  if (!profile) return null;

  return (
    <div className="flex-1 min-h-screen py-5 sm:py-8 md:py-10 bg-[radial-gradient(130%_120%_at_20%_20%,color-mix(in_oklab,var(--app-accent)_4%,var(--app-bg)_96%),var(--app-bg))]">
      <main className="px-3 sm:px-6 md:px-10">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[color-mix(in_oklab,var(--app-accent)_14%,var(--app-surface)_86%)] rounded-lg">
                <Bell className="w-5 h-5 text-(--app-accent)" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-(--app-text)">Notifications</h1>
                <p className="text-sm text-[color-mix(in_oklab,var(--app-text)_70%,var(--app-muted)_30%)]">
                  {unreadNotificationsCount} non lue{unreadNotificationsCount > 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Actions */}
            {notifications.length > 0 && (
              <div className="flex gap-2 sm:ml-auto">
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  disabled={unreadNotificationsCount === 0}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-(--app-accent) border border-(--app-border) bg-white/80 hover:bg-(--app-surface-2) disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  Tout lire
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-red-600 border border-(--app-border) bg-white/80 hover:bg-red-50 transition-colors"
                >
                  Tout supprimer
                </button>
              </div>
            )}
          </div>

          {/* Notifications List */}
          <div className="rounded-2xl border-2 border-(--app-border) bg-(--app-surface) shadow-[0_14px_48px_-24px_rgba(0,0,0,0.55)] overflow-hidden">
            {isLoadingNotifications ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <div className="w-8 h-8 border-3 border-(--app-accent) border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[color-mix(in_oklab,var(--app-text)_70%,var(--app-muted)_30%)]">
                  Chargement des notifications...
                </p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <Bell className="w-10 h-10 text-(--app-muted)" />
                <p className="text-sm font-semibold text-(--app-text)">Aucune notification</p>
                <p className="text-xs text-[color-mix(in_oklab,var(--app-text)_70%,var(--app-muted)_30%)]">
                  Les nouvelles activités apparaîtront ici
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[color-mix(in_oklab,var(--app-border)_50%,transparent)]">
                {notifications.map((notification, idx) => {
                  const isRead = isNotificationStorageHydrated
                    ? notificationReadIds.includes(notification.id)
                    : Boolean(notification.isRead);

                  return (
                    <li
                      key={notification.id}
                      className={`flex min-w-0 items-start gap-3 px-4 sm:px-5 py-3.5 transition-all duration-200 ease-in-out hover:bg-[color-mix(in_oklab,var(--app-accent)_3%,var(--app-surface)_97%)] ${
                        isRead
                          ? 'bg-(--app-surface) hover:bg-[color-mix(in_oklab,var(--app-accent)_3%,var(--app-surface)_97%)]'
                          : 'bg-[linear-gradient(100deg,color-mix(in_oklab,var(--app-accent)_14%,var(--app-surface)_86%),color-mix(in_oklab,var(--app-surface)_92%,white_8%))] border-l-3 border-[color-mix(in_oklab,var(--app-accent)_52%,var(--app-border)_48%)]'
                      }`}
                    >
                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className={getTypeToneClass(notification.type)}>
                            {getTypeLabel(notification.type)}
                          </span>
                          <span className="notification-time text-xs">{formatNotificationTime(notification.createdAt)}</span>
                        </div>
                        <p className="notification-title font-semibold text-(--app-text) text-sm">{notification.title || 'Notification'}</p>
                        {notification.description && (
                          <p className="notification-desc text-xs mt-1 text-[color-mix(in_oklab,var(--app-text)_70%,var(--app-muted)_30%)] line-clamp-2">
                            {notification.description}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {notification.targetHref && (
                          <Link href={notification.targetHref} title="Ouvrir le contenu" aria-label="Ouvrir le contenu">
                            <button
                              type="button"
                              className="notification-action p-2 rounded-lg flex items-center justify-center transition-transform hover:scale-105"
                              aria-label="Ouvrir"
                              title="Ouvrir le contenu"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </button>
                          </Link>
                        )}

                        <button
                          type="button"
                          onClick={() => handleToggleNotificationRead(notification.id)}
                          className={`notification-action mark-read ${isRead ? 'read' : 'unread'} p-2 rounded-lg flex items-center justify-center transition-transform hover:scale-105`}
                          title={isRead ? 'Marquer comme non vue' : 'Marquer comme vue'}
                          aria-label={isRead ? 'Marquer comme non vue' : 'Marquer comme vue'}
                        >
                          {isRead ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteNotification(notification.id)}
                          className="notification-action delete p-2 rounded-lg flex items-center justify-center transition-transform hover:scale-105"
                          title="Supprimer la notification"
                          aria-label="Supprimer la notification"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
