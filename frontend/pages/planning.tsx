'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '@/components/providers/auth-provider';
import { PlanningProgramme } from '@/components/features/planning/programme';
import { PlannerAgenda } from '@/components/features/planning/agenda';
import { BookOpen, CalendarDays } from 'lucide-react';

type UnifiedTab = 'programme' | 'agenda';

export default function UnifiedPlanningPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<UnifiedTab>('programme');

  // Sync tab with URL query ?tab=agenda | ?tab=programme
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.tab;
    const raw = Array.isArray(q) ? q[0] : q;
    if (raw === 'agenda' || raw === 'programme') {
      setActiveTab(raw);
    } else if (raw === 'planner') {
      // backward compat /planner -> agenda
      setActiveTab('agenda');
    }
  }, [router.isReady, router.query.tab]);

  const switchTab = (tab: UnifiedTab) => {
    setActiveTab(tab);
    // shallow update URL without reload
    const query = { ...router.query, tab };
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  };

  if (authLoading) {
    return (
      <div className="flex-1 py-20" style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-medical-200 border-t-medical-600 rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className="flex-1 py-16"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 95%, white 5%) 0%, color-mix(in oklab, var(--app-surface-2) 76%, var(--app-accent) 24%) 100%)',
        }}
      >
        <div className="container mx-auto px-4 max-w-3xl">
          <section
            className="rounded-3xl border p-8 text-center space-y-4"
            style={{
              borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)',
              backgroundColor: 'var(--app-surface)',
            }}
          >
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--app-text)' }}>
              Accès au Planning réservé aux membres
            </h1>
            <p className="text-sm md:text-base" style={{ color: 'var(--app-muted)' }}>
              Connecte-toi pour accéder à ton programme ORL et à ton agenda personnel.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                style={{
                  background:
                    'linear-gradient(135deg, color-mix(in oklab, var(--app-accent) 88%, #000 12%) 0%, var(--app-accent) 100%)',
                }}
              >
                S&apos;inscrire
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-xl border px-5 py-2.5 text-sm font-semibold"
                style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
              >
                Se connecter
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 py-6 md:py-8"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 95%, white 5%) 0%, color-mix(in oklab, var(--app-surface-2) 76%, var(--app-accent) 24%) 100%)',
      }}
    >
      <div className="container mx-auto px-4 max-w-7xl space-y-6">
        {/* Hero unifié */}
        <section
          className="rounded-3xl border p-6 md:p-8"
          style={{
            borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)',
            background:
              'linear-gradient(145deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
          }}
        >
          <p className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--hero-body)' }}>
            Programme & Agenda
          </p>
          <h1 className="text-3xl md:text-4xl font-bold mt-1" style={{ color: 'var(--hero-title)' }}>
            Planning
          </h1>
          <p className="text-sm mt-2 max-w-2xl" style={{ color: 'var(--hero-body)' }}>
            Retrouve ton programme ORL officiel et ton agenda personnel au même endroit. Passe de la vue programme à la vue agenda en un clic.
          </p>
        </section>

        {/* Tabs — prend tout left/right (pleine largeur) */}
        <div className="w-full">
          <div
            className="flex w-full rounded-2xl border p-1.5 gap-1.5 shadow-sm"
            style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
          >
            <button
              type="button"
              onClick={() => switchTab('programme')}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 sm:px-6 py-3.5 text-sm sm:text-[15px] font-semibold transition ${activeTab === 'programme' ? 'shadow-md' : ''}`}
              style={{
                backgroundColor: activeTab === 'programme' ? 'var(--app-accent)' : 'transparent',
                color: activeTab === 'programme' ? 'var(--app-accent-contrast)' : 'var(--app-text)',
              }}
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Programme ORL</span>
            </button>
            <button
              type="button"
              onClick={() => switchTab('agenda')}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 sm:px-6 py-3.5 text-sm sm:text-[15px] font-semibold transition ${activeTab === 'agenda' ? 'shadow-md' : ''}`}
              style={{
                backgroundColor: activeTab === 'agenda' ? 'var(--app-accent)' : 'transparent',
                color: activeTab === 'agenda' ? 'var(--app-accent-contrast)' : 'var(--app-text)',
              }}
            >
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Agenda</span>
            </button>
          </div>
        </div>

        {/* Contenu onglet */}
        <div className="min-w-0">
          {activeTab === 'programme' ? <PlanningProgramme embedded /> : <PlannerAgenda embedded />}
        </div>
      </div>
    </div>
  );
}
