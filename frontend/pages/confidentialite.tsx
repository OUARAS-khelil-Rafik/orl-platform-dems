'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Database,
  EyeOff,
  FileText,
  KeyRound,
  Lock,
  Mail,
  Scale,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Cookie,
} from 'lucide-react';

const LAST_UPDATE = '24 août 2026';

const TOC = [
  { id: 'responsable', label: '1. Responsable', icon: ShieldCheck },
  { id: 'collecte', label: '2. Données collectées', icon: Database },
  { id: 'finalites', label: '3. Finalités', icon: FileText },
  { id: 'conservation', label: '4. Conservation', icon: Clock },
  { id: 'partage', label: '5. Partage & hébergeurs', icon: Server },
  { id: 'securite', label: '6. Sécurité', icon: Lock },
  { id: 'droits', label: '7. Vos droits', icon: UserCheck },
  { id: 'cookies', label: '8. Cookies', icon: Cookie },
  { id: 'contact', label: '9. Nous contacter', icon: Mail },
] as const;

export default function ConfidentialitePage() {
  const [activeId, setActiveId] = useState<string>('responsable');

  const scrollTo = (id: string) => {
    setActiveId(id);
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 86;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <div
      className="flex-1 py-10 sm:py-14"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 76%, var(--app-accent) 24%) 100%)',
      }}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Hero */}
        <div
          className="relative overflow-hidden rounded-3xl border p-7 sm:p-9 mb-8"
          style={{
            color: 'var(--hero-title)',
            borderColor: 'color-mix(in oklab, var(--hero-chip-border) 72%, var(--app-border) 28%)',
            background:
              'linear-gradient(145deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
          }}
        >
          <div className="absolute -top-10 -right-10 h-44 w-44 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 28%, transparent)' }} />
          <div className="absolute -bottom-14 -left-10 h-52 w-52 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 18%, transparent)' }} />

          <div className="relative">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ borderColor: 'var(--hero-chip-border)', backgroundColor: 'var(--hero-chip-bg)', color: 'var(--hero-chip-text)' }}>
                <Lock className="h-3.5 w-3.5" />
                Données & vie privée
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)', color: 'var(--hero-body)' }}>
                <Clock className="h-3.5 w-3.5" />
                Mise à jour : {LAST_UPDATE}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)', color: 'var(--hero-body)' }}>
                <EyeOff className="h-3.5 w-3.5" />
                Aucune revente
              </span>
            </div>

            <div className="grid lg:grid-cols-12 gap-6 items-end">
              <div className="lg:col-span-8">
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">Politique de confidentialité</h1>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: 'var(--hero-body)' }}>
                  Nous collectons uniquement le strict nécessaire pour faire fonctionner DEMS ENT — ORL. Pas de revente, pas de traçage publicitaire : vos données servent uniquement à votre compte, vos accès et vos achats.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)', background: 'color-mix(in oklab, var(--app-surface) 86%, white 14%)', color: 'var(--app-text)' }}>
                    <Database className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                    Minimisation stricte
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)', background: 'color-mix(in oklab, var(--app-surface) 86%, white 14%)', color: 'var(--app-text)' }}>
                    <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                    Chiffrement & accès restreint
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)', background: 'color-mix(in oklab, var(--app-surface) 86%, white 14%)', color: 'var(--app-text)' }}>
                    <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                    Suppression sur demande
                  </span>
                </div>
              </div>
              <div className="lg:col-span-4">
                <div className="rounded-2xl border p-4 backdrop-blur" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)' }}>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-70" style={{ color: 'var(--hero-body)' }}>En bref</p>
                  <ul className="mt-2 space-y-1.5 text-sm leading-relaxed list-disc list-inside" style={{ color: 'var(--hero-body)' }}>
                    <li>Compte, accès, achats — rien de plus</li>
                    <li>Conservation limitée à l’usage</li>
                    <li>Exercez vos droits par <Link href="/contact" className="underline decoration-dotted underline-offset-4 font-bold" style={{ color: 'var(--hero-title)' }}>Contact</Link> ou depuis votre profil</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sommaire */}
          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-6 space-y-4">
              <div className="rounded-2xl border p-4 sm:p-5 shadow-sm" style={{ borderColor: 'var(--app-border)', background: 'color-mix(in oklab, var(--app-surface) 94%, white 6%)' }}>
                <p className="text-xs font-bold uppercase tracking-[0.1em] flex items-center gap-2" style={{ color: 'var(--app-muted)' }}>
                  <FileText className="h-3.5 w-3.5" />
                  Sommaire
                </p>
                <nav className="mt-3 space-y-1">
                  {TOC.map((item) => {
                    const active = activeId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => scrollTo(item.id)}
                        className="w-full text-left flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm font-semibold transition"
                        style={{
                          borderColor: active ? 'var(--app-accent)' : 'color-mix(in oklab, var(--app-border) 70%, transparent)',
                          background: active ? 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)' : 'var(--app-surface)',
                          color: active ? 'var(--app-accent)' : 'var(--app-text)',
                        }}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.label}
                        {active && <span className="ml-auto h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--app-accent)' }} />}
                      </button>
                    );
                  })}
                </nav>
                <div className="mt-4 rounded-xl border px-3 py-2.5 flex gap-2" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 86%, var(--app-surface-alt) 14%)' }}>
                  <Sparkles className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--app-accent)' }} />
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--app-muted)' }}>
                    Cette page est organisée pour une lecture rapide — cliquez pour atteindre la section qui vous intéresse.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border p-5" style={{ borderColor: 'color-mix(in oklab, var(--app-danger) 18%, var(--app-border) 82%)', background: 'color-mix(in oklab, var(--app-danger) 7%, var(--app-surface) 93%)' }}>
                <h3 className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                  <Trash2 className="h-4 w-4" style={{ color: 'var(--app-danger)' }} />
                  Supprimer mes données
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--app-muted)' }}>
                  Vous pouvez demander la suppression de votre compte et de ses données associées — opération définitive après confirmation.
                </p>
                <div className="mt-4 space-y-2">
                  <Link href="/dashboard" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold hover:opacity-80" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text)' }}>
                    <UserCheck className="h-4 w-4" />
                    Gérer depuis mon profil
                  </Link>
                  <Link href="/contact" className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90" style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 74%, #5a3f2d 26%), var(--app-accent))' }}>
                    <Mail className="h-4 w-4" />
                    Demander par email
                  </Link>
                </div>
                <p className="mt-3 text-xs leading-relaxed flex gap-1.5" style={{ color: 'var(--app-muted)' }}>
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: 'var(--app-success)' }} />
                  Réponse sous 24h ouvrées avec confirmation d’exécution.
                </p>
              </div>

              <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:opacity-80" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }}>
                <ArrowLeft className="h-4 w-4" />
                Retour à l'accueil
              </Link>
            </div>
          </aside>

          {/* Content */}
          <main className="lg:col-span-8 space-y-4">
            <div className="rounded-2xl border px-4 py-3 flex gap-2.5" style={{ borderColor: 'color-mix(in oklab, var(--app-success) 18%, var(--app-border) 82%)', background: 'color-mix(in oklab, var(--app-success) 8%, var(--app-surface) 92%)' }}>
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white mt-0.5" style={{ background: 'var(--app-success)' }}>
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--app-muted)' }}>
                <strong style={{ color: 'var(--app-text)' }}>Aucune revente — jamais.</strong> Vos informations servent uniquement à fournir le service pédagogique DEMS ENT. Pas de publicité ciblée, pas de partage commercial.
              </p>
            </div>

            <Section id="responsable" number="01" title="Qui est responsable ?" icon={ShieldCheck} activeId={activeId}>
              <p>
                Le traitement est opéré par <strong>DEMS ENT — OUARAS Khelil Rafik</strong>, éditeur de la plateforme. Contact vie privée : <a href="mailto:kh.ouaras@univ-alger.dz" className="font-bold underline decoration-dotted underline-offset-4" style={{ color: 'var(--app-accent)' }}>kh.ouaras@univ-alger.dz</a> ou via la <Link href="/contact" className="font-bold underline decoration-dotted underline-offset-4" style={{ color: 'var(--app-accent)' }}>page Contact</Link>.
              </p>
              <p>Hébergements : frontend Vercel, backend Render (Docker), base MongoDB Atlas — tous avec mesures de sécurité et accès restreint.</p>
            </Section>

            <Section id="collecte" number="02" title="Données collectées" icon={Database} activeId={activeId}>
              <p>Minimisation stricte — seules les données nécessaires :</p>
              <ul>
                <li><strong>Compte</strong> : email, nom d’affichage, avatar (optionnel), téléphone (si fourni), mot de passe haché (bcrypt), identifiant Google lié le cas échéant.</li>
                <li><strong>Authentification</strong> : jeton JWT, préférence “se souvenir”, historique de connexion limité.</li>
                <li><strong>Achats & accès</strong> : références de transaction communiquées, vidéos/packs acquis, statut de validation admin, durées d’accès.</li>
                <li><strong>Usage</strong> : progression vidéo (localStorage + serveur pour synchronisation), favoris/importants, préférences d’affichage.</li>
                <li><strong>Support</strong> : messages et pièces jointes du chat support / formulaire contact (avec IP et User-Agent côté email).</li>
              </ul>
              <p className="rounded-xl border px-3 py-2.5 text-xs leading-relaxed" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 86%, var(--app-surface-alt) 14%)', color: 'var(--app-muted)' }}>
                Aucune donnée bancaire conservée côté DEMS ENT — le paiement transite via le prestataire affiché lors de la commande.
              </p>
            </Section>

            <Section id="finalites" number="03" title="Finalités & bases" icon={FileText} activeId={activeId}>
              <ul>
                <li><strong>Fourniture du service</strong> (exécution contractuelle) : création de compte, accès aux contenus achetés, suivi pédagogique.</li>
                <li><strong>Vérification administrative</strong> (exécution contractuelle) : contrôle des preuves de paiement avant activation.</li>
                <li><strong>Support & communication</strong> (intérêt légitime) : réponse à vos demandes, notifications d’accès, informations de service.</li>
                <li><strong>Sécurité</strong> (intérêt légitime / obligation) : lutte anti-fraude, journalisation d’accès, protection des contenus.</li>
              </ul>
            </Section>

            <Section id="conservation" number="04" title="Durée de conservation" icon={Clock} activeId={activeId}>
              <ul>
                <li><strong>Compte actif</strong> : conservé tant que le compte existe.</li>
                <li><strong>Achats</strong> : 5 ans après fin de la relation (preuve comptable) puis anonymisation.</li>
                <li><strong>Support</strong> : 2 ans après dernier échange, puis purge ou anonymisation.</li>
                <li><strong>Journaux techniques</strong> : 6 à 12 mois.</li>
              </ul>
              <p>À la suppression du compte, les données associées sont effacées (notifications, chats, messages) sous réserve des obligations légales.</p>
            </Section>

            <Section id="partage" number="05" title="Partage & hébergeurs" icon={Server} activeId={activeId}>
              <p>Jamais de revente. Partage limité aux prestataires nécessaires :</p>
              <ul>
                <li><strong>MongoDB Atlas</strong> : base applicative.</li>
                <li><strong>Cloudinary</strong> : stockage vidéos/images (organisation par spécialité/vidéo).</li>
                <li><strong>Gmail SMTP</strong> : envoi des emails transactionnels (mot de passe, contact) via App Password.</li>
                <li><strong>Render / Vercel</strong> : hébergement backend/frontend.</li>
              </ul>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--app-muted)' }}>
                Chaque prestataire est soumis à ses propres engagements de confidentialité et ne reçoit que les données strictement nécessaires à sa mission.
              </p>
            </Section>

            <Section id="securite" number="06" title="Sécurité" icon={Lock} activeId={activeId}>
              <ul>
                <li>Mots de passe hachés (bcrypt) + JWT signé ; sessions “se souvenir” chiffrées côté client.</li>
                <li>Accès admin restreint, CORS filtré, validation serveur des rôles.</li>
                <li>Contenus protégés (anti-copie, watermark, vérification d’accès).</li>
                <li>Chiffrement en transit (HTTPS/TLS) et sauvegardes régulières.</li>
              </ul>
              <p className="rounded-xl border px-3 py-2.5 text-xs leading-relaxed flex gap-2" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 18%, var(--app-border) 82%)', background: 'color-mix(in oklab, var(--app-accent) 7%, var(--app-surface) 93%)', color: 'var(--app-muted)' }}>
                <KeyRound className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--app-accent)' }} />
                <span><strong style={{ color: 'var(--app-text)' }}>Bonne pratique :</strong> ne partagez jamais votre mot de passe et déconnectez-vous sur appareil partagé.</span>
              </p>
            </Section>

            <Section id="droits" number="07" title="Vos droits" icon={UserCheck} activeId={activeId}>
              <p>Vous disposez des droits suivants, exercés gratuitement via Profil ou <Link href="/contact" className="font-bold underline decoration-dotted underline-offset-4" style={{ color: 'var(--app-accent)' }}>Contact</Link> :</p>
              <ul>
                <li><strong>Accès & copie</strong> : obtenir les données vous concernant.</li>
                <li><strong>Rectification</strong> : corriger nom, photo, etc. depuis Dashboard → Profil.</li>
                <li><strong>Suppression</strong> : demander l’effacement du compte et de ses contenus (définitive après confirmation).</li>
                <li><strong>Opposition / limitation</strong> : pour les traitements fondés sur l’intérêt légitime.</li>
                <li><strong>Portabilité</strong> : recevoir vos données dans un format lisible.</li>
              </ul>
              <p className="text-xs" style={{ color: 'var(--app-muted)' }}>Réponse sous 30 jours. Une vérification d’identité peut être demandée pour sécuriser la demande.</p>
            </Section>

            <Section id="cookies" number="08" title="Cookies & traceurs" icon={Cookie} activeId={activeId}>
              <p>DEMS ENT n’utilise que des traceurs <strong>strictement nécessaires</strong> : session locale (`dems-auth-session-v1`), préférences d’affichage, synchronisation inter-onglets. Pas de cookies publicitaires ni de revente à des tiers.</p>
              <p>Vous pouvez effacer le stockage local depuis votre navigateur — cela vous déconnectera et réinitialisera les préférences.</p>
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                <div className="grid grid-cols-3 gap-px text-xs font-bold uppercase tracking-[0.07em] p-2" style={{ background: 'color-mix(in oklab, var(--app-surface) 86%, var(--app-surface-alt) 14%)', color: 'var(--app-muted)' }}>
                  <span>Nom</span><span>Finalité</span><span>Durée</span>
                </div>
                <div className="grid grid-cols-3 gap-px text-xs p-2" style={{ background: 'var(--app-surface)', color: 'var(--app-muted)' }}>
                  <span className="font-semibold" style={{ color: 'var(--app-text)' }}>dems-auth-session</span><span>Connexion</span><span>Session / persistant</span>
                </div>
                <div className="grid grid-cols-3 gap-px text-xs p-2" style={{ background: 'var(--app-surface)', color: 'var(--app-muted)' }}>
                  <span className="font-semibold" style={{ color: 'var(--app-text)' }}>dems-tab-id</span><span>Sync inter-onglets</span><span>Session</span>
                </div>
              </div>
            </Section>

            <Section id="contact" number="09" title="Nous contacter & évolutions" icon={Mail} activeId={activeId}>
              <p>
                Pour toute question vie privée, écrivez à <a href="mailto:kh.ouaras@univ-alger.dz" className="font-bold underline decoration-dotted underline-offset-4" style={{ color: 'var(--app-accent)' }}>kh.ouaras@univ-alger.dz</a> ou via le <Link href="/contact" className="font-bold underline decoration-dotted underline-offset-4" style={{ color: 'var(--app-accent)' }}>formulaire</Link>. Cette politique peut évoluer ; la date en tête fait foi et une information est affichée en cas de changement substantiel.
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--app-muted)' }}>
                Références : principes de minimisation, limitation de conservation, sécurité et droits — alignés avec les bonnes pratiques internationales et la réglementation algérienne applicable.
              </p>
            </Section>

            <div className="rounded-2xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)', background: 'linear-gradient(135deg, #2f261d 0%, #3d2d1e 55%, #8a5a36 100%)', color: 'white' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold flex items-center gap-2">
                  <Scale className="h-4 w-4" />
                  Un doute sur vos données ?
                </p>
                <p className="mt-1 text-sm leading-relaxed opacity-85">Nous vous répondons avec une explication claire et, si souhaité, lançons la procédure de votre choix.</p>
              </div>
              <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm shrink-0 hover:opacity-90" style={{ background: 'white', color: '#2f261d' }}>
                <Mail className="h-4 w-4" />
                Nous écrire
              </Link>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function Section({ id, number, title, icon: Icon, children, activeId }: { id: string; number: string; title: string; icon: typeof ShieldCheck; children: React.ReactNode; activeId: string }) {
  const active = activeId === id;
  return (
    <section
      id={id}
      className="rounded-2xl border overflow-hidden shadow-sm scroll-mt-24"
      style={{
        borderColor: active ? 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)' : 'color-mix(in oklab, var(--app-accent) 12%, var(--app-border) 88%)',
        background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 88%, var(--app-accent) 12%) 100%)',
      }}
    >
      <div className="px-5 sm:px-6 py-4 flex items-center gap-3 border-b" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: active ? 'color-mix(in oklab, var(--app-accent) 10%, var(--app-surface) 90%)' : 'color-mix(in oklab, var(--app-surface) 92%, white 8%)' }}>
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full text-xs font-black text-white px-2" style={{ background: active ? 'var(--app-accent)' : '#2f261d' }}>
          {number}
        </span>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border shrink-0" style={{ background: 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)', borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)', color: 'var(--app-accent)' }}>
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-sm sm:text-[15px] font-extrabold tracking-tight" style={{ color: 'var(--app-text)' }}>{title}</h2>
        {active && <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--app-accent)' }}><Sparkles className="h-3 w-3" /> Actif</span>}
      </div>
      <div className="px-5 sm:px-6 py-5 text-sm leading-relaxed space-y-3 [&_p]:text-[var(--app-muted)] [&_strong]:text-[var(--app-text)] [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:text-[var(--app-muted)] [&_a]:transition">
        {children}
      </div>
    </section>
  );
}
