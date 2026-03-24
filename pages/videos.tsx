import Link from 'next/link';
import { PlayCircle, Sparkles } from 'lucide-react';

const specialties = [
  {
    slug: 'otologie',
    label: 'Otologie',
    subtitle: "Oreille externe, moyenne et interne",
    chipClass: 'specialty-glow-otology',
  },
  {
    slug: 'rhinologie',
    label: 'Rhinologie',
    subtitle: 'Nez, sinus et voies aériennes supérieures',
    chipClass: 'specialty-glow-rhinology',
  },
  {
    slug: 'laryngologie',
    label: 'Laryngologie',
    subtitle: 'Voix, déglutition et pathologies cervicales',
    chipClass: 'specialty-glow-laryngology',
  },
];

export default function VideosIndexPage() {
  return (
    <div className="flex-1 py-16 story-grid">
      <div className="container mx-auto px-4 max-w-5xl relative z-10">
        <div
          className="premium-panel rounded-3xl p-8 md:p-10 mb-8 motion-fade-up"
          style={{
            color: 'var(--hero-title)',
            background: 'linear-gradient(140deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
          }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] mb-4" style={{ borderColor: 'var(--hero-chip-border)', backgroundColor: 'var(--hero-chip-bg)', color: 'var(--hero-chip-text)' }}>
            <Sparkles className="h-3.5 w-3.5" />
            Navigation immersive
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mb-3">Catalogue vidéos par spécialité</h1>
          <p className="max-w-2xl" style={{ color: 'var(--hero-body)' }}>
            Choisissez une spécialité pour voir les vidéos disponibles et leurs contenus pédagogiques.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {specialties.map((item) => (
            <Link
              key={item.slug}
              href={`/specialties/${item.slug}`}
              className="premium-panel interactive-card rounded-2xl p-6 flex flex-col gap-4"
            >
              <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${item.chipClass}`}>
                <PlayCircle className="h-3.5 w-3.5" />
                {item.label}
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900">{item.label}</h2>
                <p className="text-sm text-slate-600 mt-1">{item.subtitle}</p>
              </div>
              <span className="text-sm font-semibold text-medical-700">Explorer le parcours</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
