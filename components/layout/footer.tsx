import Link from 'next/link';
import { Stethoscope, Mail, Phone, MapPin } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300 py-12 border-t border-slate-800 mt-auto">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="flex flex-col gap-4">
          <Link href="/" className="flex items-center gap-2 text-medical-400">
            <Stethoscope className="h-6 w-6" />
            <span className="font-bold text-xl tracking-tight text-white">DEMS ENT</span>
          </Link>
          <p className="text-sm text-slate-400 leading-relaxed">
            Plateforme d'excellence pour la préparation au concours DEMS en Otorhinolaryngologie.
          </p>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-4">Spécialités</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/specialties/otologie" className="hover:text-medical-400 transition-colors">Otologie</Link></li>
            <li><Link href="/specialties/rhinologie" className="hover:text-medical-400 transition-colors">Rhinologie et Sinusologie</Link></li>
            <li><Link href="/specialties/laryngologie" className="hover:text-medical-400 transition-colors">Laryngologie et Cervicologie</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-4">Liens Utiles</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/pricing" className="hover:text-medical-400 transition-colors">Tarifs & Abonnements</Link></li>
            <li><Link href="/dashboard" className="hover:text-medical-400 transition-colors">Mon Espace</Link></li>
            <li><Link href="/contact" className="hover:text-medical-400 transition-colors">Contactez-nous</Link></li>
            <li><Link href="/faq" className="hover:text-medical-400 transition-colors">FAQ</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-4">Contact</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-medical-500" />
              <span>contact@dems-ent.dz</span>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-medical-500" />
              <span>+213 (0) 555 12 34 56</span>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-medical-500" />
              <span>Alger, Algérie</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="container mx-auto px-4 mt-12 pt-8 border-t border-slate-800 text-sm text-slate-500 flex flex-col md:flex-row items-center justify-between">
        <p>&copy; {new Date().getFullYear()} DEMS ENT. Tous droits réservés.</p>
        <div className="flex gap-4 mt-4 md:mt-0">
          <Link href="/cgv" className="hover:text-white transition-colors">CGV</Link>
          <Link href="/confidentialite" className="hover:text-white transition-colors">Politique de confidentialité</Link>
        </div>
      </div>
    </footer>
  );
}
