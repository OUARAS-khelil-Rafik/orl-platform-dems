'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { Bell } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    const loadNotifications = async () => {
      if (!user) {
        setNotifications([]);
        return;
      }

      setIsLoadingNotifications(true);
      try {
        const notificationsSnap = await getDocs(
          query(collection(db, 'notifications'), where('userId', '==', user.uid)),
        );

        const nextNotifications = notificationsSnap.docs
          .map((entry) => ({ ...(entry.data() as UserNotification), id: entry.id }))
          .sort((a, b) => parseIsoToMs(b.createdAt) - parseIsoToMs(a.createdAt));

        setNotifications(nextNotifications);
      } catch (error) {
        console.error('Error loading notifications:', error);
        setNotifications([]);
      } finally {
        setIsLoadingNotifications(false);
      }
    };

    void loadNotifications();
  }, [user]);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((entry) => !entry.isRead).length,
    [notifications],
  );

  // Marquer toutes comme lues (local uniquement)
  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => n.isRead ? n : { ...n, isRead: true }));
  };

  // Supprimer toutes (local uniquement)
  const handleDeleteAll = () => {
    setNotifications([]);
  };

  const subtleTextClass = 'text-[color-mix(in_oklab,var(--app-text)_78%,var(--app-muted)_22%)]';
  const cardClassName =
    'rounded-2xl border border-(--app-border) bg-(--app-surface) shadow-[0_14px_48px_-24px_rgba(0,0,0,0.55)] p-4 sm:p-6 md:p-8';
  const insetCardClassName =
    'rounded-2xl border border-(--app-border) bg-[color-mix(in_oklab,var(--app-surface-2)_86%,var(--app-bg)_14%)] p-5';

  const handleMarkNotificationAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        isRead: true,
        updatedAt: new Date().toISOString(),
      });

      setNotifications((prev) =>
        prev.map((entry) => (entry.id === notificationId ? { ...entry, isRead: true } : entry)),
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-medical-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="flex-1 min-h-screen py-5 sm:py-8 md:py-10 bg-[radial-gradient(130%_120%_at_20%_20%,color-mix(in_oklab,var(--app-accent)_4%,var(--app-bg)_96%),var(--app-bg))]">
      <main className="px-3 sm:px-6 md:px-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-baseline gap-2">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-(--app-muted)" />
                <h1 className="text-2xl sm:text-3xl font-bold text-(--app-text)">Notifications</h1>
              </div>
              <span className={`text-sm font-semibold ${subtleTextClass}`}>
                {unreadNotificationsCount} non lue{unreadNotificationsCount > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex gap-2 mt-2 sm:mt-0">
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                disabled={notifications.length === 0 || unreadNotificationsCount === 0}
                className="px-3 py-1 rounded-lg text-xs font-semibold text-(--app-accent) border border-(--app-border) bg-white/80 hover:bg-(--app-surface-2) disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Tout lire
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={notifications.length === 0}
                className="px-3 py-1 rounded-lg text-xs font-semibold text-red-600 border border-(--app-border) bg-white/80 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Tout supprimer
              </button>
            </div>
          </div>

          <section className={cardClassName}>
            <div className={insetCardClassName}>
              {isLoadingNotifications ? (
                <p className={`text-sm ${subtleTextClass}`}>Chargement des notifications...</p>
              ) : notifications.length === 0 ? (
                <p className={`text-sm ${subtleTextClass}`}>Aucune notification pour le moment.</p>
              ) : (
                <div className="space-y-3">
                  {notifications.map((entry) => (
                    <div
                      key={entry.id}
                      className={`rounded-xl border px-3 sm:px-4 py-3 bg-(--app-surface) border-(--app-border) ${
                        entry.isRead
                          ? ''
                          : 'border-[color-mix(in_oklab,var(--app-accent)_45%,var(--app-border)_55%)]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-(--app-text)">{entry.title || 'Notification'}</p>
                          <p className={`text-xs mt-1 ${subtleTextClass}`}>{entry.description || '-'}</p>
                          <p className={`text-[11px] mt-2 ${subtleTextClass}`}>
                            {entry.createdAt ? new Date(entry.createdAt).toLocaleString('fr-FR') : '-'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {entry.targetHref ? (
                            <Link
                              href={entry.targetHref}
                              className="text-xs font-semibold text-(--app-accent) hover:underline"
                            >
                              Ouvrir
                            </Link>
                          ) : null}

                          {!entry.isRead ? (
                            <button
                              type="button"
                              onClick={() => handleMarkNotificationAsRead(entry.id)}
                              className="text-xs font-semibold text-(--app-accent) hover:underline"
                            >
                              Marquer lue
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
