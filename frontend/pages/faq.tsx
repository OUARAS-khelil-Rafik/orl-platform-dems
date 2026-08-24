'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Clock,
  CreditCard,
  HelpCircle,
  KeyRound,
  Mail,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  FileText,
  GraduationCap,
} from 'lucide-react';

type Category = 'all' | 'acces' | 'paiement' | 'contenu' | 'technique';

type FaqItem = {
  id: string;
  category: Exclude<Category, 'all'>;
  categoryLabel: string;
  q: string;
  a: string;
  icon: typeof HelpCircle;
};

const CATEGORIES: Array<{ id: Category; label: string; icon: typeof HelpCircle }> = [
  { id: 'all', label: 'Toutes', icon: HelpCircle },
  { id: 'acces', label: 'Accès & comptes', icon: KeyRound },
  { id: 'paiement', label: 'Paiements', icon: CreditCard },
  { id: 'contenu', label: 'Contenu', icon: BookOpen },
  { id: 'technique', label: 'Support', icon: Wrench },
];

const FAQS: FaqItem[] = [
  {
    id: 'paid-access',
    category: 'acces',
    categoryLabel: 'Accès & comptes',
    q: 'Comment accéder aux vidéos payantes ?',
    a: 'Vous pouvez acheter une vidéo à l’unité, un pack de spécialité (Otologie, Rhinologie, Laryngologie) ou souscrire à l’abonnement VIP Plus qui débloque l’intégralité de la plateforme. Une fois le paiement vérifié par un administrateur, l’accès apparaît automatiquement dans Mon Espace et notifié.',
    icon: KeyRound,
  },
  {
    id: 'activation-delay',
    category: 'acces',
    categoryLabel: 'Accès & comptes',
    q: 'Quand mon accès est-il activé ?',
    a: 'Après validation du paiement par l’administration (généralement sous quelques heures ouvrées). Vous recevez une notification dans la plateforme et l’indicateur d’accès passe au vert. En cas d’attente anormale, contactez-nous avec votre reçu.',
    icon: Clock,
  },
  {
    id: 'forgot-password',
    category: 'acces',
    categoryLabel: 'Accès & comptes',
    q: 'J’ai oublié mon mot de passe — que faire ?',
    a: 'Depuis la page Connexion → “Mot de passe oublié”, saisissez votre email. Si le SMTP est configuré, vous recevez un email premium avec un lien valide 30 minutes. Sinon, utilisez la connexion Google liée à votre compte ou contactez le support.',
    icon: ShieldCheck,
  },
  {
    id: 'google-link',
    category: 'acces',
    categoryLabel: 'Accès & comptes',
    q: 'Puis-je lier / délier mon compte Google ?',
    a: 'Oui, depuis Dashboard → Profil : “Lier Google” (consent OAuth) ou “Délier” (nécessite un mot de passe local). La liaison facilite la connexion et sécurise l’accès si vous perdez votre mot de passe.',
    icon: KeyRound,
  },
  {
    id: 'packs-vs-vip',
    category: 'paiement',
    categoryLabel: 'Paiements & abonnements',
    q: 'Quelle différence entre achat à l’unité, pack et VIP Plus ?',
    a: 'À l’unité : accès à une seule vidéo et ses ressources. Pack : toutes les vidéos d’une spécialité + QCM/cas associés, plus économique. VIP Plus : accès global à toute la plateforme pendant la durée de l’abonnement, avec suivi et nouveautés incluses.',
    icon: CreditCard,
  },
  {
    id: 'invoice',
    category: 'paiement',
    categoryLabel: 'Paiements & abonnements',
    q: 'Comment obtenir ma facture ou mon reçu ?',
    a: 'Après vérification, votre achat apparaît dans Dashboard → Achats avec date, montant et statut. Pour une facture nominative, envoyez votre nom complet et référence de paiement via la page Contact — l’équipe vous l’adresse par email.',
    icon: FileText,
  },
  {
    id: 'refund',
    category: 'paiement',
    categoryLabel: 'Paiements & abonnements',
    q: 'Un remboursement est-il possible ?',
    a: 'Toute commande est définitive après validation et activation de l’accès. Si une erreur de paiement ou un doublon est constaté, contactez-nous rapidement avec la preuve — nous étudions chaque cas avec bienveillance, mais l’accès consommé n’est pas remboursable.',
    icon: CreditCard,
  },
  {
    id: 'progress',
    category: 'contenu',
    categoryLabel: 'Contenu pédagogique',
    q: 'Comment suivre ma progression et reprendre une vidéo ?',
    a: 'Votre progression est enregistrée automatiquement (temps, pourcentage, “à reprendre”). Retrouvez-la en accueil (“Reprendre”) et dans la fiche vidéo. Les vidéos vues, favoris et importants sont aussi suivis dans votre espace.',
    icon: GraduationCap,
  },
  {
    id: 'qcm-included',
    category: 'contenu',
    categoryLabel: 'Contenu pédagogique',
    q: 'Les QCM, cas cliniques et schémas sont-ils inclus ?',
    a: 'Oui, chaque vidéo peut inclure des QCM/QROC, cas cliniques (avec images) et schémas annotés. L’accès à ces ressources suit l’accès vidéo : si vous avez la vidéo (ou le pack / VIP Plus), vous avez ses ressources.',
    icon: BookOpen,
  },
  {
    id: 'download',
    category: 'contenu',
    categoryLabel: 'Contenu pédagogique',
    q: 'Puis-je télécharger ou imprimer les contenus ?',
    a: 'Non — pour protéger le travail pédagogique, le téléchargement, l’impression et la copie sont désactivés (protection globale + watermark). Vous pouvez consulter et réviser à volonté en ligne, sur tous vos appareils.',
    icon: ShieldCheck,
  },
  {
    id: 'playback',
    category: 'technique',
    categoryLabel: 'Support technique',
    q: 'La lecture bloque ou charge indéfiniment — que faire ?',
    a: 'Essayez : 1) rafraîchir, 2) tester en 720p, 3) changer de navigateur/réseau, 4) vider le cache. Les vidéos volumineuses sont découpées automatiquement (Cloudinary + ffmpeg). Si le problème persiste, envoyez-nous l’URL de la vidéo, l’heure et une capture via Contact.',
    icon: Wrench,
  },
  {
    id: 'contact-support',
    category: 'technique',
    categoryLabel: 'Support technique',
    q: 'Puis-je contacter le support ?',
    a: 'Oui, via la page Contactez-nous (formulaire premium avec accusé et mise en forme organisée) ou le chat support en accueil. Réponse humaine sous 24h ouvrées — joignez un maximum de détails pour aller plus vite.',
    icon: MessageCircle,
  },
];

export default function FaqPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string>(FAQS[0].id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQS.filter((item) => {
      const byCat = activeCategory === 'all' || item.category === activeCategory;
      if (!byCat) return false;
      if (!q) return true;
      return (item.q + ' ' + item.a + ' ' + item.categoryLabel).toLowerCase().includes(q);
    });
  }, [activeCategory, query]);

  const grouped = useMemo(() => {
    if (activeCategory !== 'all' || query.trim()) return null;
    const map = new Map<Exclude<Category, 'all'>, FaqItem[]>();
    for (const f of FAQS) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return map;
  }, [activeCategory, query]);

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
          <div className="absolute -top-10 -right-10 h-44 w-44 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 32%, transparent)' }} />
          <div className="absolute -bottom-14 -left-10 h-52 w-52 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 18%, transparent)' }} />

          <div className="relative">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ borderColor: 'var(--hero-chip-border)', backgroundColor: 'var(--hero-chip-bg)', color: 'var(--hero-chip-text)' }}>
                <HelpCircle className="h-3.5 w-3.5" />
                Centre d'aide
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)', color: 'var(--hero-body)' }}>
                <Clock className="h-3.5 w-3.5" />
                Réponses instantanées
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)', color: 'var(--hero-body)' }}>
                <Sparkles className="h-3.5 w-3.5" />
                Mise à jour continue
              </span>
            </div>

            <div className="grid lg:grid-cols-12 gap-6 items-end">
              <div className="lg:col-span-8">
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">Questions fréquentes</h1>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: 'var(--hero-body)' }}>
                  Trouvez en quelques secondes la réponse sur les accès, paiements, contenus ou le support — organisée par thématique et recherchable.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
                  {CATEGORIES.slice(1).map((c) => (
                    <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)', background: 'color-mix(in oklab, var(--app-surface) 86%, white 14%)', color: 'var(--app-text)' }}>
                      <c.icon className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="lg:col-span-4">
                <div className="rounded-2xl border p-4 backdrop-blur" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)' }}>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-70" style={{ color: 'var(--hero-body)' }}>Astuce</p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--hero-body)' }}>
                    Tapez un mot-clé ci-dessous (ex: “VIP”, “facture”, “Google”) — le filtrage est instantané, sans rechargement.
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--hero-body)' }}>
                    <Search className="h-3.5 w-3.5 shrink-0" />
                    <span>{FAQS.length} réponses organisées</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left sticky */}
          <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-6 self-start">
            {/* Search */}
            <div className="rounded-2xl border p-4 shadow-sm" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 18%, var(--app-border) 82%)', background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 88%, var(--app-accent) 12%) 100%)' }}>
              <label htmlFor="faq-search" className="block text-xs font-bold uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--app-muted)' }}>
                Rechercher
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--app-muted)' }} />
                <input
                  id="faq-search"
                  type="search"
                  placeholder="Ex: remboursement, progression, mot de passe…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-xl border pl-9 pr-9 py-2.5 text-sm outline-none focus:ring-2 placeholder:text-[var(--app-muted)]"
                  style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-bold border" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface-2)', color: 'var(--app-muted)' }}>
                    ✕
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--app-muted)' }}>
                {filtered.length} résultat{filtered.length !== 1 ? 's' : ''} {query ? `pour “${query}”` : ''} · {activeCategory !== 'all' ? CATEGORIES.find((c) => c.id === activeCategory)?.label : 'toutes catégories'}
              </p>
            </div>

            {/* Categories */}
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', background: 'color-mix(in oklab, var(--app-surface) 92%, white 8%)' }}>
              <p className="text-xs font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--app-muted)' }}>Filtrer par thème</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => {
                  const active = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition"
                      style={{
                        borderColor: active ? 'var(--app-accent)' : 'var(--app-border)',
                        background: active ? 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 78%, #5a3f2d 22%), var(--app-accent))' : 'var(--app-surface)',
                        color: active ? 'white' : 'var(--app-text)',
                      }}
                    >
                      <cat.icon className="h-3.5 w-3.5" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CTA contact */}
            <div className="rounded-2xl border p-5" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 20%, var(--app-border) 80%)', background: 'color-mix(in oklab, var(--app-accent) 8%, var(--app-surface) 92%)' }}>
              <h3 className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: 'linear-gradient(135deg, #2f261d 0%, #8a5a36 100%)' }}>
                  <MessageCircle className="h-3.5 w-3.5" />
                </span>
                Pas trouvé ?
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--app-muted)' }}>
                Notre équipe répond sous 24h ouvrées. Précisez votre compte, la vidéo/pack concerné et une capture si possible.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90" style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 74%, #5a3f2d 26%), var(--app-accent))' }}>
                  <Mail className="h-4 w-4" />
                  Contactez-nous
                </Link>
                <Link href="/" className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-bold hover:opacity-80" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text)' }}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Retour à l'accueil
                </Link>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--app-muted)' }}>
                <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'var(--app-success)' }} />
                Échange humain & confidentiel
              </div>
            </div>
          </div>

          {/* Right — FAQ list */}
          <div className="lg:col-span-8 space-y-6">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--app-border)', background: 'color-mix(in oklab, var(--app-surface) 94%, white 6%)' }}>
                <Search className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--app-muted)' }} />
                <p className="font-bold" style={{ color: 'var(--app-text)' }}>Aucun résultat</p>
                <p className="mt-1 text-sm" style={{ color: 'var(--app-muted)' }}>Essayez un autre mot-clé ou changez de catégorie — ou écrivez-nous.</p>
                <button type="button" onClick={() => { setQuery(''); setActiveCategory('all'); }} className="mt-4 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-bold" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text)' }}>
                  Réinitialiser
                </button>
              </div>
            ) : grouped ? (
              // Grouped view
              Array.from(grouped.entries()).map(([cat, items]) => {
                const catMeta = CATEGORIES.find((c) => c.id === cat)!;
                return (
                  <div key={cat} className="rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 14%, var(--app-border) 86%)', background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 88%, var(--app-accent) 12%) 100%)' }}>
                    <div className="px-5 sm:px-6 py-4 flex items-center gap-2 border-b" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 92%, white 8%)' }}>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border" style={{ background: 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)', borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)', color: 'var(--app-accent)' }}>
                        <catMeta.icon className="h-4 w-4" />
                      </span>
                      <h2 className="text-sm font-extrabold uppercase tracking-[0.08em]" style={{ color: 'var(--app-text)' }}>{catMeta.label}</h2>
                      <span className="ml-auto inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full text-xs font-bold border" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-muted)' }}>{items.length}</span>
                    </div>
                    <div className="divide-y" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}>
                      {items.map((item) => (
                        <FaqRow key={item.id} item={item} open={openId === item.id} onToggle={() => setOpenId(openId === item.id ? '' : item.id)} />
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              // Flat filtered view
              <div className="rounded-2xl border overflow-hidden shadow-sm divide-y" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 14%, var(--app-border) 86%)', background: 'color-mix(in oklab, var(--app-surface) 96%, white 4%)' }}>
                <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'color-mix(in oklab, var(--app-surface) 92%, white 8%)' }}>
                  <span className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--app-muted)' }}>{filtered.length} réponse{filtered.length !== 1 ? 's' : ''}</span>
                  {(query || activeCategory !== 'all') && (
                    <button type="button" onClick={() => { setQuery(''); setActiveCategory('all'); }} className="ml-auto text-xs font-bold underline decoration-dotted underline-offset-4" style={{ color: 'var(--app-accent)' }}>Effacer les filtres</button>
                  )}
                </div>
                {filtered.map((item) => (
                  <FaqRow key={item.id} item={item} open={openId === item.id} onToggle={() => setOpenId(openId === item.id ? '' : item.id)} />
                ))}
              </div>
            )}

            {/* Bottom CTA banner */}
            <div className="rounded-2xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)', background: 'linear-gradient(135deg, #2f261d 0%, #3d2d1e 55%, #8a5a36 100%)', color: 'white' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold">Toujours une question en suspens ?</p>
                <p className="mt-1 text-sm leading-relaxed opacity-85">Décrivez-nous votre situation — nous vous répondons avec une procédure claire et personnalisée.</p>
              </div>
              <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm shrink-0 hover:opacity-90" style={{ background: 'white', color: '#2f261d' }}>
                <Mail className="h-4 w-4" />
                Nous écrire
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FaqRow({ item, open, onToggle }: { item: FaqItem; open: boolean; onToggle: () => void }) {
  return (
    <div className="group">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left px-5 sm:px-6 py-4 flex items-start gap-3 hover:opacity-[0.98] transition"
        style={{ background: open ? 'color-mix(in oklab, var(--app-accent) 7%, var(--app-surface) 93%)' : 'transparent' }}
      >
        <span className="hidden sm:inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border mt-0.5" style={{ background: open ? 'var(--app-accent)' : 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)', borderColor: open ? 'var(--app-accent)' : 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)', color: open ? 'white' : 'var(--app-accent)' }}>
          <item.icon className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[12px] font-bold uppercase tracking-[0.07em] mb-1" style={{ color: 'var(--app-accent)' }}>{item.categoryLabel}</span>
          <span className="block text-sm sm:text-[15px] font-bold leading-snug" style={{ color: 'var(--app-text)' }}>{item.q}</span>
        </span>
        <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full border mt-1" style={{ borderColor: 'var(--app-border)', background: open ? 'var(--app-accent)' : 'var(--app-surface)', color: open ? 'white' : 'var(--app-muted)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 180ms ease, background-color 180ms ease' }}>
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
      <div className="grid transition-all" style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}>
        <div className="overflow-hidden">
          <div className="px-5 sm:px-6 pb-4 sm:pb-5 pl-5 sm:pl-[3.3rem]">
            <div className="rounded-xl border px-4 py-3 text-sm leading-relaxed" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 92%, white 8%)', color: 'var(--app-muted)' }}>
              {item.a}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href="/contact" className="inline-flex items-center gap-1 text-xs font-bold underline decoration-dotted underline-offset-4" style={{ color: 'var(--app-accent)' }}>
                Besoin d'aide sur ce point ? Contactez-nous →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
