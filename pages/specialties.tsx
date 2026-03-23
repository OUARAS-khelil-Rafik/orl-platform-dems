import Link from 'next/link';
import { ArrowRight, Activity, Brain, Stethoscope } from 'lucide-react';

const specialties = [
  {
    slug: 'otologie',
    title: 'Otologie',
    description: "Oreille externe, moyenne et interne.",
    icon: Activity,
    gradient: 'from-amber-600 to-orange-500',
    badge: 'Axe oreille',
  },
  {
    slug: 'rhinologie',
    title: 'Rhinologie',
    description: 'Fosses nasales, sinus et pathologies associées.',
    icon: Brain,
    gradient: 'from-amber-700 to-amber-500',
    badge: 'Axe nez/sinus',
  },
  {
    slug: 'laryngologie',
    title: 'Laryngologie',
    description: 'Larynx, pharynx, cou et pathologies cervico-faciales.',
    icon: Stethoscope,
    gradient: 'from-orange-700 to-amber-600',
    badge: 'Axe voix/cou',
  },
];

export default function SpecialtiesIndexPage() {
  return (
    <div className="flex-1 py-16" style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 92%, white 8%) 0%, color-mix(in oklab, var(--app-surface-alt) 78%, var(--app-accent) 22%) 100%)' }}>
      <div className="container mx-auto px-4 max-w-5xl">
        <div
          className="relative overflow-hidden rounded-3xl border p-8 md:p-10 mb-8 shadow-[0_28px_80px_-36px_rgba(0,0,0,0.55)]"
          style={{
            color: 'var(--hero-title)',
            borderColor: 'color-mix(in oklab, var(--hero-chip-border) 72%, var(--app-border) 28%)',
            background: 'linear-gradient(140deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
          }}
        >
          <div className="absolute -top-12 -right-8 h-40 w-40 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 45%, transparent)' }} />
          <div className="absolute -bottom-10 -left-10 h-44 w-44 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 26%, transparent)' }} />
          <h1 className="relative text-3xl md:text-4xl font-bold mb-3">Spécialités ORL</h1>
          <p className="relative max-w-3xl" style={{ color: 'var(--hero-body)' }}>
            Accédez à chaque spécialité pour consulter les vidéos, cas cliniques, QCM et schémas associés.
          </p>
          <div className="relative mt-5 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]" style={{ borderColor: 'var(--hero-chip-border)', backgroundColor: 'var(--hero-chip-bg)', color: 'var(--hero-chip-text)' }}>
            Parcours premium terre ORL
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {specialties.map((item) => (
            <Link
              key={item.slug}
              href={`/specialties/${item.slug}`}
              className="group rounded-2xl border p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              style={{
                borderColor: 'color-mix(in oklab, var(--app-accent) 20%, var(--app-border) 80%)',
                background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 94%, white 6%) 0%, color-mix(in oklab, var(--app-surface-alt) 72%, var(--app-accent) 28%) 100%)',
              }}
            >
              <span className={`inline-flex items-center rounded-full bg-gradient-to-r ${item.gradient} text-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide mb-4`}>
                {item.badge}
              </span>
              <div
                className="w-12 h-12 rounded-xl border flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-105"
                style={{
                  borderColor: 'color-mix(in oklab, var(--app-accent) 30%, var(--app-border) 70%)',
                  background: 'color-mix(in oklab, var(--app-accent) 14%, var(--app-surface) 86%)',
                }}
              >
                <item.icon className="w-6 h-6" style={{ color: 'color-mix(in oklab, var(--app-accent) 80%, var(--app-text) 20%)' }} />
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--app-text)' }}>{item.title}</h2>
              <p className="mb-4" style={{ color: 'var(--app-muted)' }}>{item.description}</p>
              <span className="inline-flex items-center gap-2 font-semibold text-sm" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }}>
                Explorer <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
