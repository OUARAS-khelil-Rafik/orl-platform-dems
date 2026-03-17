import Link from 'next/link';

const specialties = [
  {
    slug: 'otologie',
    title: 'Otologie',
    description: "Oreille externe, moyenne et interne.",
  },
  {
    slug: 'rhinologie',
    title: 'Rhinologie',
    description: 'Fosses nasales, sinus et pathologies associees.',
  },
  {
    slug: 'laryngologie',
    title: 'Laryngologie',
    description: 'Larynx, pharynx, cou et pathologies cervico-faciales.',
  },
];

export default function SpecialtiesIndexPage() {
  return (
    <div className="flex-1 bg-slate-50 py-16">
      <div className="container mx-auto px-4 max-w-5xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Specialites ORL</h1>
        <p className="text-slate-600 mb-8">
          Accedez a chaque specialite pour consulter les videos, cas cliniques, QCM et schemas associes.
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          {specialties.map((item) => (
            <Link
              key={item.slug}
              href={`/specialties/${item.slug}`}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-colors hover:border-medical-400"
            >
              <h2 className="text-xl font-bold text-slate-900 mb-2">{item.title}</h2>
              <p className="text-slate-600">{item.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
