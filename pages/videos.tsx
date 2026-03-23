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
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Catalogue vidéos</h1>
        <p className="text-slate-600 mb-8">
          Choisissez une spécialité pour voir les vidéos disponibles et leurs contenus pédagogiques.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {specialties.map((item) => (
            <Link
              key={item.slug}
              href={`/specialties/${item.slug}`}
              className="rounded-xl border border-slate-200 bg-white p-5 font-semibold text-slate-800 hover:border-medical-400 hover:text-medical-700"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
