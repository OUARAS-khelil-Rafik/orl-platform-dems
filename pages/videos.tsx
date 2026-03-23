import Link from 'next/link';

const specialties = [
  { slug: 'otologie', label: 'Otologie' },
  { slug: 'rhinologie', label: 'Rhinologie' },
  { slug: 'laryngologie', label: 'Laryngologie' },
];

export default function VideosIndexPage() {
  return (
    <div className="flex-1 bg-slate-50 py-16">
      <div className="container mx-auto px-4 max-w-4xl">
        <div
          className="rounded-3xl border p-8 md:p-10 mb-8"
          style={{
            color: 'var(--hero-title)',
            borderColor: 'color-mix(in oklab, var(--hero-chip-border) 72%, var(--app-border) 28%)',
            background: 'linear-gradient(140deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
          }}
        >
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Catalogue vidéos</h1>
          <p style={{ color: 'var(--hero-body)' }}>
            Choisissez une spécialité pour voir les vidéos disponibles et leurs contenus pédagogiques.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {specialties.map((item) => (
            <Link
              key={item.slug}
              href={`/specialties/${item.slug}`}
              className="rounded-2xl border border-slate-200 bg-white p-6 font-semibold text-slate-800 hover:border-medical-400 hover:text-medical-700 shadow-sm hover:shadow-md transition-all"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
