'use client';

import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { Stethoscope, Mail, Phone, MapPin } from 'lucide-react';

export function Footer() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return (
    <footer
      className="relative overflow-hidden py-14 border-t mt-auto"
      style={{
        borderColor: 'color-mix(in oklab, var(--footer-border) 80%, transparent)',
        background:
          'linear-gradient(145deg, var(--footer-bg-start) 0%, color-mix(in oklab, var(--footer-bg-end) 82%, var(--app-accent) 18%) 100%)',
      }}
    >
      <div className="absolute -top-24 left-0 w-80 h-80 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 30%, transparent)' }} />
      <div className="absolute -bottom-28 right-0 w-96 h-96 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 18%, transparent)' }} />

      <div className="container mx-auto px-4 relative z-10">
        <div
          className="rounded-3xl border backdrop-blur-sm p-6 md:p-8 mb-10 grid grid-cols-1 md:grid-cols-4 gap-8 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.75)]"
          style={{ borderColor: 'var(--footer-border)', backgroundColor: 'var(--footer-panel)' }}
        >
        <div className="flex flex-col gap-4">
          <Link href="/" className="flex items-center gap-2" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, white 22%)' }}>
            <Stethoscope className="h-6 w-6" />
            <span className="font-bold text-xl tracking-tight" style={{ color: 'var(--footer-text)' }}>DEMS ENT</span>
          </Link>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--footer-muted)' }}>
            Plateforme d'excellence pour la préparation au concours DEMS en Otorhinolaryngologie.
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-4" style={{ color: 'var(--footer-text)' }}>Spécialités</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/specialties/otologie" className="transition-opacity hover:opacity-80" style={{ color: 'var(--footer-link)' }}>Otologie</Link></li>
            <li><Link href="/specialties/rhinologie" className="transition-opacity hover:opacity-80" style={{ color: 'var(--footer-link)' }}>Rhinologie et Sinusologie</Link></li>
            <li><Link href="/specialties/laryngologie" className="transition-opacity hover:opacity-80" style={{ color: 'var(--footer-link)' }}>Laryngologie et Cervicologie</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold mb-4" style={{ color: 'var(--footer-text)' }}>Liens Utiles</h3>
          <ul className="space-y-2 text-sm">
            {!isAdmin && (
              <li><Link href="/pricing" className="transition-opacity hover:opacity-80" style={{ color: 'var(--footer-link)' }}>Tarifs & Abonnements</Link></li>
            )}
            <li>
              <Link href={isAdmin ? '/admin' : '/dashboard'} className="transition-opacity hover:opacity-80" style={{ color: 'var(--footer-link)' }}>
                {isAdmin ? 'Dashboard' : 'Mon Espace'}
              </Link>
            </li>
            <li><Link href="/contact" className="transition-opacity hover:opacity-80" style={{ color: 'var(--footer-link)' }}>Contactez-nous</Link></li>
            <li><Link href="/faq" className="transition-opacity hover:opacity-80" style={{ color: 'var(--footer-link)' }}>FAQ</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold mb-4" style={{ color: 'var(--footer-text)' }}>Contact</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4" style={{ color: 'color-mix(in oklab, var(--app-accent) 74%, white 26%)' }} />
              <span style={{ color: 'var(--footer-muted)' }}>contact@dems-ent.dz</span>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4" style={{ color: 'color-mix(in oklab, var(--app-accent) 74%, white 26%)' }} />
              <span style={{ color: 'var(--footer-muted)' }}>+213 (0) 555 12 34 56</span>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4" style={{ color: 'color-mix(in oklab, var(--app-accent) 74%, white 26%)' }} />
              <span style={{ color: 'var(--footer-muted)' }}>Alger, Algérie</span>
            </li>
          </ul>
        </div>
      </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-6 border-t text-sm" style={{ borderColor: 'color-mix(in oklab, var(--footer-border) 75%, transparent)', color: 'var(--footer-muted)' }}>
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 w-fit" style={{ borderColor: 'var(--footer-border)', backgroundColor: 'color-mix(in oklab, var(--footer-panel) 88%, transparent)' }}>
            <span style={{ color: 'color-mix(in oklab, var(--app-accent) 84%, white 16%)' }}>●</span>
            <p style={{ color: 'var(--footer-text)' }}>&copy; {new Date().getFullYear()} DEMS ENT. Tous droits réservés.</p>
          </div>
          <div className="flex gap-4">
            <Link href="/cgv" className="transition-opacity hover:opacity-80" style={{ color: 'var(--footer-link)' }}>CGV</Link>
            <Link href="/confidentialite" className="transition-opacity hover:opacity-80" style={{ color: 'var(--footer-link)' }}>Politique de confidentialité</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
