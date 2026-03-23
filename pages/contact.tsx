import Link from 'next/link';

export default function ContactPage() {
  return (
    <div className="flex-1 bg-slate-50 py-16">
      <div className="container mx-auto px-4 max-w-3xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Contactez-nous</h1>
        <p className="text-slate-600 mb-8">
          Notre equipe est disponible pour vous aider concernant les acces, paiements et contenus pedagogiques.
        </p>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <p className="text-slate-700"><span className="font-semibold">Email:</span> contact@dems-ent.dz</p>
          <p className="text-slate-700"><span className="font-semibold">Telephone:</span> +213 (0) 555 12 34 56</p>
          <p className="text-slate-700"><span className="font-semibold">Adresse:</span> Alger, Algerie</p>
        </div>

        <div className="mt-8">
          <Link href="/" className="text-medical-700 hover:text-medical-800 font-medium">
            Retour a l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
