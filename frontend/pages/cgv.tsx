'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Clock,
  CreditCard,
  FileText,
  GraduationCap,
  Lock,
  Mail,
  Scale,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const LAST_UPDATE = '24 août 2026';

const TOC = [
  { id: 'objet', label: '1. Objet & définitions', icon: FileText },
  { id: 'services', label: '2. Services proposés', icon: GraduationCap },
  { id: 'commande', label: '3. Commande & paiement', icon: CreditCard },
  { id: 'validation', label: '4. Validation & activation', icon: BadgeCheck },
  { id: 'duree', label: '5. Durée & disponibilité', icon: Clock },
  { id: 'propriete', label: '6. Propriété intellectuelle', icon: Lock },
  { id: 'responsabilite', label: '7. Responsabilités', icon: Scale },
  { id: 'donnees', label: '8. Données personnelles', icon: ShieldCheck },
  { id: 'support', label: '9. Support & litiges', icon: Mail },
] as const;

export default function CgvPage() {
  const [activeId, setActiveId] = useState<string>('objet');

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
          <div className="absolute -top-10 -right-10 h-44 w-44 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 30%, transparent)' }} />
          <div className="absolute -bottom-14 -left-10 h-52 w-52 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 18%, transparent)' }} />

          <div className="relative">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ borderColor: 'var(--hero-chip-border)', backgroundColor: 'var(--hero-chip-bg)', color: 'var(--hero-chip-text)' }}>
                <Scale className="h-3.5 w-3.5" />
                Cadre légal
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)', color: 'var(--hero-body)' }}>
                <Clock className="h-3.5 w-3.5" />
                Mise à jour : {LAST_UPDATE}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)', color: 'var(--hero-body)' }}>
                <ShieldCheck className="h-3.5 w-3.5" />
                Lecture 6 min
              </span>
            </div>

            <div className="grid lg:grid-cols-12 gap-6 items-end">
              <div className="lg:col-span-8">
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">Conditions Générales de Vente</h1>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: 'var(--hero-body)' }}>
                  Les règles qui encadrent l’accès à DEMS ENT — plateforme pédagogique ORL pour la préparation au DEMS. Claires, organisées et pensées pour une relation transparente.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)', background: 'color-mix(in oklab, var(--app-surface) 86%, white 14%)', color: 'var(--app-text)' }}>
                    <GraduationCap className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                    Usage personnel & pédagogique
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)', background: 'color-mix(in oklab, var(--app-surface) 86%, white 14%)', color: 'var(--app-text)' }}>
                    <Lock className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                    Contenus protégés
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)', background: 'color-mix(in oklab, var(--app-surface) 86%, white 14%)', color: 'var(--app-text)' }}>
                    <BadgeCheck className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                    Validation admin
                  </span>
                </div>
              </div>
              <div className="lg:col-span-4">
                <div className="rounded-2xl border p-4 backdrop-blur" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)' }}>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-70" style={{ color: 'var(--hero-body)' }}>En bref</p>
                  <ul className="mt-2 space-y-1.5 text-sm leading-relaxed list-disc list-inside" style={{ color: 'var(--hero-body)' }}>
                    <li>Commande ferme après validation & vérification</li>
                    <li>Accès selon type d’achat (vidéo / pack / VIP Plus)</li>
                    <li>Questions ? <Link href="/contact" className="underline decoration-dotted underline-offset-4 font-bold" style={{ color: 'var(--hero-title)' }}>Contactez-nous</Link></li>
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
                    Navigation fluide : cliquez pour défiler jusqu’à la section. La lecture suit l’ordre pédagogique réel.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border p-5" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 20%, var(--app-border) 80%)', background: 'color-mix(in oklab, var(--app-accent) 8%, var(--app-surface) 92%)' }}>
                <h3 className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: 'linear-gradient(135deg, #2f261d 0%, #8a5a36 100%)' }}>
                    <Mail className="h-3.5 w-3.5" />
                  </span>
                  Une question ?
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--app-muted)' }}>
                  Écrivez-nous via le formulaire premium — réponse humaine & organisée sous 24h ouvrées.
                </p>
                <Link href="/contact" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90" style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 74%, #5a3f2d 26%), var(--app-accent))' }}>
                  <Mail className="h-4 w-4" />
                  Contactez-nous
                </Link>
                <Link href="/confidentialite" className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold hover:opacity-80" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text)' }}>
                  <ShieldCheck className="h-4 w-4" />
                  Politique de confidentialité
                </Link>
              </div>

              <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:opacity-80" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }}>
                <ArrowLeft className="h-4 w-4" />
                Retour à l'accueil
              </Link>
            </div>
          </aside>

          {/* Content */}
          <main className="lg:col-span-8 space-y-4">
            <div className="rounded-2xl border px-4 py-3 flex gap-2.5" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 18%, var(--app-border) 82%)', background: 'color-mix(in oklab, var(--app-accent) 7%, var(--app-surface) 93%)' }}>
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white mt-0.5" style={{ background: 'var(--app-accent)' }}>i</span>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--app-muted)' }}>
                <strong style={{ color: 'var(--app-text)' }}>Important :</strong> l’accès à DEMS ENT vaut acceptation des présentes CGV. Conservez vos preuves de paiement jusqu’à activation confirmée.
              </p>
            </div>

            <Section id="objet" number="01" title="Objet & définitions" icon={FileText} activeId={activeId}>
              <p>
                DEMS ENT est une plateforme d’excellence dédiée à la préparation au concours DEMS en ORL (Otologie, Rhinologie & Sinusologie, Laryngologie & Cervicologie). Les présentes CGV encadrent toute commande passée sur la plateforme.
              </p>
              <ul>
                <li><strong>Utilisateur</strong> : toute personne disposant d’un compte DEMS ENT.</li>
                <li><strong>Contenu</strong> : vidéos, QCM/QROC, cas cliniques, schémas, planning et ressources associées.</li>
                <li><strong>Commande</strong> : achat d’une vidéo à l’unité, d’un pack spécialité ou d’un abonnement VIP Plus.</li>
                <li><strong>Administration</strong> : équipe chargée de la vérification et de l’activation des accès.</li>
              </ul>
            </Section>

            <Section id="services" number="02" title="Services proposés" icon={BookOpen} activeId={activeId}>
              <p>Les contenus sont conçus pour un <strong>usage pédagogique personnel</strong>, sans limite de consultation pendant la période d’accès achetée :</p>
              <ul>
                <li><strong>Vidéo à l’unité</strong> : accès ciblé à une vidéo + ses ressources liées.</li>
                <li><strong>Pack spécialité</strong> : toutes les vidéos d’une spécialité + QCM/cas/schémas inclus — plus économique.</li>
                <li><strong>VIP Plus</strong> : accès global à l’ensemble du catalogue pendant la durée d’abonnement, nouveautés incluses.</li>
              </ul>
              <p className="rounded-xl border px-3 py-2.5 text-xs leading-relaxed" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 86%, var(--app-surface-alt) 14%)', color: 'var(--app-muted)' }}>
                <strong style={{ color: 'var(--app-text)' }}>Note :</strong> le catalogue évolue en continu ; l’administration peut ajouter, améliorer ou réorganiser des contenus sans changer le périmètre de votre achat.
              </p>
            </Section>

            <Section id="commande" number="03" title="Commande & paiement" icon={CreditCard} activeId={activeId}>
              <p>Toute commande est considérée comme <strong>ferme</strong> après :</p>
              <ol>
                <li>Choix du produit (vidéo / pack / VIP Plus) et validation du panier ;</li>
                <li>Paiement selon le moyen proposé ;</li>
                <li>Vérification administrative du reçu / transaction.</li>
              </ol>
              <p>
                Les prix sont affichés en DZD, toutes taxes comprises. En cas d’écart manifeste d’affichage, l’administration vous contacte avant activation. Conservez votre preuve (capture, référence, reçu) jusqu’à confirmation.
              </p>
            </Section>

            <Section id="validation" number="04" title="Validation & activation" icon={BadgeCheck} activeId={activeId}>
              <p>
                La vérification est <strong>humaine</strong> : un administrateur contrôle la preuve et active l’accès dans votre espace. Délai habituel : quelques heures ouvrées. Vous recevez une notification “accès activé” et l’indicateur passe au vert.
              </p>
              <ul>
                <li>Si la preuve est incomplète, l’équipe vous demande un complément par email.</li>
                <li>En cas de paiement dupliqué, écrivez rapidement via <Link href="/contact" className="font-bold underline decoration-dotted underline-offset-4" style={{ color: 'var(--app-accent)' }}>Contact</Link> avec les deux références.</li>
              </ul>
            </Section>

            <Section id="duree" number="05" title="Durée & disponibilité" icon={Clock} activeId={activeId}>
              <p>
                L’accès dépend du type d’achat et de la durée associée (affichée avant commande). Pendant cette période, vous consultez à volonté. À l’échéance, l’accès se clôt sans suppression de votre compte.
              </p>
              <p>
                La plateforme vise une disponibilité élevée. Des maintenances ponctuelles peuvent survenir ; elles sont annoncées quand possible. Aucune compensation n’est due pour une interruption brève indépendante de notre volonté (réseau, hébergeur).
              </p>
            </Section>

            <Section id="propriete" number="06" title="Propriété intellectuelle & protection" icon={Lock} activeId={activeId}>
              <p>
                Tous les contenus (vidéos, schémas, QCM, cas) sont protégés. Toute reproduction, diffusion ou extraction est interdite.
              </p>
              <ul>
                <li><strong>Mesures actives :</strong> anti-copie globale, désactivation impression/téléchargement, watermark, vérification côté serveur.</li>
                <li>Usage strictement personnel — le partage de compte, de liens d’accès ou la captation est proscrit et peut entraîner la suspension.</li>
              </ul>
              <p className="rounded-xl border px-3 py-2.5 text-xs leading-relaxed flex gap-2" style={{ borderColor: 'color-mix(in oklab, var(--app-danger) 22%, var(--app-border) 78%)', background: 'color-mix(in oklab, var(--app-danger) 8%, var(--app-surface) 92%)', color: 'var(--app-muted)' }}>
                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--app-danger)' }} />
                <span><strong style={{ color: 'var(--app-text)' }}>Respect mutuel :</strong> ces protections préservent la qualité et l’investissement pédagogique pour tous.</span>
              </p>
            </Section>

            <Section id="responsabilite" number="07" title="Responsabilités & garanties" icon={Scale} activeId={activeId}>
              <p>
                Les contenus sont fournis à titre pédagogique et ne remplacent pas un avis médical personnalisé ni les référentiels officiels. DEMS ENT met tout en œuvre pour l’exactitude, sans garantie d’exhaustivité.
              </p>
              <p>
                Hors faute lourde, la responsabilité de la plateforme est limitée au montant de votre commande. Une assistance est proposée via le support et la <Link href="/faq" className="font-bold underline decoration-dotted underline-offset-4" style={{ color: 'var(--app-accent)' }}>FAQ</Link> pour toute difficulté technique.
              </p>
            </Section>

            <Section id="donnees" number="08" title="Données personnelles" icon={ShieldCheck} activeId={activeId}>
              <p>
                Les données sont limitées au strict nécessaire (compte, accès, achats) et ne sont jamais revendues. Détails complets dans la <Link href="/confidentialite" className="font-bold underline decoration-dotted underline-offset-4" style={{ color: 'var(--app-accent)' }}>Politique de confidentialité</Link>. Vous pouvez demander la suppression de votre compte à tout moment.
              </p>
            </Section>

            <Section id="support" number="09" title="Support & litiges" icon={Mail} activeId={activeId}>
              <p>
                Pour toute question, écrivez via <Link href="/contact" className="font-bold underline decoration-dotted underline-offset-4" style={{ color: 'var(--app-accent)' }}>Contactez-nous</Link> (formulaire premium avec réponse humaine & organisée) ou le chat support. Nous privilégions toujours le règlement amiable avant toute autre voie.
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--app-muted)' }}>
                Dernière mise à jour : {LAST_UPDATE} · DEMS ENT — ORL. En cas de modification substantielle, une information est affichée sur la plateforme.
              </p>
            </Section>

            <div className="rounded-2xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)', background: 'linear-gradient(135deg, #2f261d 0%, #3d2d1e 55%, #8a5a36 100%)', color: 'white' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold">Besoin d’une clarification ?</p>
                <p className="mt-1 text-sm leading-relaxed opacity-85">Nous vous répondons avec un exemple concret adapté à votre situation (vidéo, pack ou abonnement).</p>
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

function Section({ id, number, title, icon: Icon, children, activeId }: { id: string; number: string; title: string; icon: typeof FileText; children: React.ReactNode; activeId: string }) {
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
        {active && <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--app-accent)' }}><Sparkles className="h-3 w-3" /> À lire</span>}
      </div>
      <div className="px-5 sm:px-6 py-5 text-sm leading-relaxed space-y-3 [&_p]:text-[var(--app-muted)] [&_strong]:text-[var(--app-text)] [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:text-[var(--app-muted)] [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_ol]:text-[var(--app-muted)]">
        {children}
      </div>
    </section>
  );
}
