import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';

export default function ContactPage() {
  return (
    <div
      className="flex-1 py-16"
      style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 95%, white 5%) 0%, color-mix(in oklab, var(--app-surface-alt) 76%, var(--app-accent) 24%) 100%)' }}
    >
      <div className="container mx-auto px-4 max-w-3xl">
        <div
          className="relative overflow-hidden rounded-3xl border p-8 mb-8"
          style={{
            color: 'var(--hero-title)',
            borderColor: 'color-mix(in oklab, var(--hero-chip-border) 72%, var(--app-border) 28%)',
            background: 'linear-gradient(145deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
          }}
        >
          <div className="absolute -top-12 -right-8 h-40 w-40 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 36%, transparent)' }} />
          <div className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 24%, transparent)' }} />
          <h1 className="text-3xl font-bold mb-4">Contactez-nous</h1>
          <p style={{ color: 'var(--hero-body)' }}>
            Notre equipe est disponible pour vous aider concernant les acces, paiements et contenus pedagogiques.
          </p>
        </div>

        <div className="border rounded-2xl p-6 space-y-4 shadow-md" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)', background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 84%, var(--app-accent) 16%) 100%)' }}>
          <p className="text-slate-700 inline-flex items-center gap-2"><Mail className="h-4 w-4" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }} /><span className="font-semibold">Email:</span> contact@dems-ent.dz</p>
          <p className="text-slate-700 inline-flex items-center gap-2"><Phone className="h-4 w-4" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }} /><span className="font-semibold">Telephone:</span> +213 (0) 555 12 34 56</p>
          <p className="text-slate-700 inline-flex items-center gap-2"><MapPin className="h-4 w-4" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }} /><span className="font-semibold">Adresse:</span> Alger, Algerie</p>
        </div>

        <div className="mt-8">
          <Link href="/" className="font-medium" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }}>
            Retour a l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
