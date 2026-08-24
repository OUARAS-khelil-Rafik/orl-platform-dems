'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  CreditCard,
  KeyRound,
  Mail,
  MessageSquare,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Wrench,
} from 'lucide-react';

const SUBJECT_OPTIONS = [
  'Accès & comptes',
  'Paiements & abonnements',
  'Contenu pédagogique',
  'Support technique',
  'Autre',
] as const;

type FormState = {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  website: string; // honeypot
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const CONTACT_EMAIL = 'kh.ouaras@univ-alger.dz';
const CONTACT_PHONE_DISPLAY = '+213 (0) 660 49 61 44';
const CONTACT_PHONE_TEL = '+213660496144';

const getApiBase = () => {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  if (fromEnv) {
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(fromEnv);
        const isLoopbackHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
        if (isLoopbackHost) {
          const host = window.location.hostname || 'localhost';
          return `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}${url.pathname}`;
        }
      } catch {
        // fall through
      }
      return fromEnv;
    }
    return fromEnv;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname || 'localhost';
    return `http://${host}:4000/api`;
  }
  return 'http://localhost:4000/api';
};

export default function ContactPage() {
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    website: '',
  });
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  const validate = (values: FormState): FieldErrors => {
    const errs: FieldErrors = {};
    if (!values.name.trim() || values.name.trim().length < 2) errs.name = 'Minimum 2 caractères.';
    else if (values.name.trim().length > 80) errs.name = 'Maximum 80 caractères.';

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!values.email.trim()) errs.email = 'Email requis.';
    else if (!emailRe.test(values.email.trim())) errs.email = 'Email invalide.';
    else if (values.email.trim().length > 120) errs.email = 'Email trop long.';

    if (values.phone && values.phone.length > 30) errs.phone = 'Téléphone trop long.';
    if (values.phone && values.phone.trim() && !/^[\d\s+().-]{6,30}$/.test(values.phone.trim())) {
      errs.phone = 'Téléphone invalide.';
    }

    if (!values.subject) errs.subject = 'Choisissez un sujet.';
    else if (values.subject.length < 3) errs.subject = 'Sujet trop court.';
    else if (values.subject.length > 120) errs.subject = 'Sujet trop long.';

    if (!values.message.trim()) errs.message = 'Message requis.';
    else if (values.message.trim().length < 10) errs.message = 'Minimum 10 caractères.';
    else if (values.message.trim().length > 5000) errs.message = 'Maximum 5000 caractères.';

    return errs;
  };

  useEffect(() => {
    setFieldErrors(validate(form));
  }, [form]);

  const isFormValid = Object.keys(validate(form)).length === 0;

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (apiError) setApiError('');
  };

  const copyToClipboard = async (text: string, kind: 'email' | 'phone') => {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === 'email') {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
      } else {
        setCopiedPhone(true);
        setTimeout(() => setCopiedPhone(false), 2000);
      }
    } catch {
      // fallback: do nothing
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, phone: true, subject: true, message: true });
    const errs = validate(form);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    // honeypot filled -> pretend success
    if (form.website.trim().length > 0) {
      setIsSuccess(true);
      return;
    }

    setIsSubmitting(true);
    setApiError('');
    try {
      const res = await fetch(`${getApiBase()}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          subject: form.subject,
          message: form.message.trim(),
          website: form.website,
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (payload?.errors && typeof payload.errors === 'object') {
          const serverErrors: FieldErrors = {};
          for (const [k, v] of Object.entries(payload.errors as Record<string, string>)) {
            if (k in form) (serverErrors as Record<string, string>)[k] = String(v);
          }
          if (Object.keys(serverErrors).length > 0) {
            setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
          }
        }
        throw new Error(payload?.message || "L'envoi a échoué. Réessayez ou écrivez à " + CONTACT_EMAIL);
      }

      setIsSuccess(true);
      setForm({ name: '', email: '', phone: '', subject: '', message: '', website: '' });
      setTouched({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Une erreur est survenue.";
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const showError = (key: keyof FormState) => Boolean(touched[key] && fieldErrors[key]);

  return (
    <div
      className="flex-1 py-10 sm:py-14"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 95%, white 5%) 0%, color-mix(in oklab, var(--app-surface-alt) 76%, var(--app-accent) 24%) 100%)',
      }}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        {/* ── Hero ── */}
        <div
          className="relative overflow-hidden rounded-3xl border p-7 sm:p-9 mb-8"
          style={{
            color: 'var(--hero-title)',
            borderColor: 'color-mix(in oklab, var(--hero-chip-border) 72%, var(--app-border) 28%)',
            background:
              'linear-gradient(145deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
          }}
        >
          <div className="absolute -top-12 -right-8 h-44 w-44 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 34%, transparent)' }} />
          <div className="absolute -bottom-14 -left-10 h-52 w-52 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 20%, transparent)' }} />

          <div className="relative flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ borderColor: 'var(--hero-chip-border)', backgroundColor: 'var(--hero-chip-bg)', color: 'var(--hero-chip-text)' }}>
                <Sparkles className="h-3.5 w-3.5" />
                Support dédié
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)', color: 'var(--hero-body)' }}>
                <Clock className="h-3.5 w-3.5" />
                Réponse sous 24h ouvrées
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)', color: 'var(--hero-body)' }}>
                <ShieldCheck className="h-3.5 w-3.5" />
                Échange 100% humain
              </span>
            </div>

            <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-8">
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">Contactez-nous</h1>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: 'var(--hero-body)' }}>
                  Une question sur les accès, les paiements ou le contenu pédagogique ? Écrivez-nous — votre message arrive
                  directement et avec une mise en forme premium dans notre boîte email, prêt à être traité.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)', background: 'color-mix(in oklab, var(--app-surface) 86%, white 14%)', color: 'var(--app-text)' }}>
                    <KeyRound className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                    Accès & comptes
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)', background: 'color-mix(in oklab, var(--app-surface) 86%, white 14%)', color: 'var(--app-text)' }}>
                    <CreditCard className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                    Paiements
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)', background: 'color-mix(in oklab, var(--app-surface) 86%, white 14%)', color: 'var(--app-text)' }}>
                    <BookOpen className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                    Contenu pédagogique
                  </span>
                </div>
              </div>

              <div className="lg:col-span-4">
                <div className="rounded-2xl border p-4 backdrop-blur" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)' }}>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-70" style={{ color: 'var(--hero-body)' }}>Besoin d'une réponse rapide ?</p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--hero-body)' }}>
                    Décrivez votre besoin avec précision (ex: vidéo, paiement, accès). Plus votre message est complet, plus notre réponse sera rapide.
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--hero-body)' }}>
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span>Formulaire sécurisé · Email direct · Anti-spam intégré</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left — Infos */}
          <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-6 self-start">
            {/* Email card */}
            <div className="rounded-2xl border p-5 shadow-sm" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)', background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 86%, var(--app-accent) 14%) 100%)' }}>
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border" style={{ background: 'color-mix(in oklab, var(--app-accent) 14%, var(--app-surface) 86%)', borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)', color: 'var(--app-accent)' }}>
                  <Mail className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--app-muted)]">Email direct</p>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="mt-1 block truncate text-[15px] font-bold hover:underline" style={{ color: 'var(--app-accent)' }}>
                    {CONTACT_EMAIL}
                  </a>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--app-muted)]">Cliquez pour ouvrir votre messagerie — ou copiez l'adresse.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={`mailto:${CONTACT_EMAIL}`}
                      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:opacity-90"
                      style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 78%, #5a3f2d 22%), var(--app-accent))' }}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Écrire un email
                    </a>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(CONTACT_EMAIL, 'email')}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition hover:opacity-80"
                      style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text)' }}
                    >
                      {copiedEmail ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <span className="h-3.5 w-3.5 grid place-items-center text-[11px]">⧉</span>}
                      {copiedEmail ? 'Copié !' : 'Copier'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Phone card */}
            <div className="rounded-2xl border p-5 shadow-sm" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 20%, var(--app-border) 80%)', background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 88%, var(--app-accent) 12%) 100%)' }}>
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border" style={{ background: 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)', borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)', color: 'var(--app-accent)' }}>
                  <Phone className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--app-muted)]">Téléphone</p>
                  <a href={`tel:${CONTACT_PHONE_TEL}`} className="mt-1 block text-[15px] font-bold hover:underline" style={{ color: 'var(--app-text)' }}>
                    {CONTACT_PHONE_DISPLAY}
                  </a>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--app-muted)]">Assistance directe — laissez un message si indisponible.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={`tel:${CONTACT_PHONE_TEL}`}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition hover:opacity-80"
                      style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text)' }}
                    >
                      <Phone className="h-3.5 w-3.5" />
                      Appeler
                    </a>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(CONTACT_PHONE_DISPLAY, 'phone')}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition hover:opacity-80"
                      style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text)' }}
                    >
                      {copiedPhone ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <span className="h-3.5 w-3.5 grid place-items-center text-[11px]">⧉</span>}
                      {copiedPhone ? 'Copié !' : 'Copier'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Pourquoi écrire */}
            <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--app-border)', background: 'color-mix(in oklab, var(--app-surface) 92%, white 8%)' }}>
              <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full" style={{ background: 'color-mix(in oklab, var(--app-accent) 16%, var(--app-surface) 84%)', color: 'var(--app-accent)' }}>
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                Comment pouvons-nous vous aider ?
              </h3>
              <ul className="mt-4 space-y-2.5">
                <li className="flex gap-2.5 rounded-xl border px-3 py-2.5" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 86%, var(--app-surface-alt) 14%)' }}>
                  <KeyRound className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--app-accent)' }} />
                  <div>
                    <p className="text-xs font-bold" style={{ color: 'var(--app-text)' }}>Accès & comptes</p>
                    <p className="text-xs leading-relaxed text-[var(--app-muted)]">Connexion, mot de passe, liaison Google, rôle.</p>
                  </div>
                </li>
                <li className="flex gap-2.5 rounded-xl border px-3 py-2.5" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 86%, var(--app-surface-alt) 14%)' }}>
                  <CreditCard className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--app-accent)' }} />
                  <div>
                    <p className="text-xs font-bold" style={{ color: 'var(--app-text)' }}>Paiements & abonnements</p>
                    <p className="text-xs leading-relaxed text-[var(--app-muted)]">Tarifs, factures, abonnement VIP / VIP+, packs.</p>
                  </div>
                </li>
                <li className="flex gap-2.5 rounded-xl border px-3 py-2.5" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 86%, var(--app-surface-alt) 14%)' }}>
                  <BookOpen className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--app-accent)' }} />
                  <div>
                    <p className="text-xs font-bold" style={{ color: 'var(--app-text)' }}>Contenu pédagogique</p>
                    <p className="text-xs leading-relaxed text-[var(--app-muted)]">Vidéos, QCM, cas cliniques, schémas, planning.</p>
                  </div>
                </li>
                <li className="flex gap-2.5 rounded-xl border px-3 py-2.5" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 86%, var(--app-surface-alt) 14%)' }}>
                  <Wrench className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--app-accent)' }} />
                  <div>
                    <p className="text-xs font-bold" style={{ color: 'var(--app-text)' }}>Support technique</p>
                    <p className="text-xs leading-relaxed text-[var(--app-muted)]">Lecture vidéo, bug d'affichage, performance.</p>
                  </div>
                </li>
              </ul>
              <div className="mt-4 rounded-xl border px-3 py-2.5 flex gap-2" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)', background: 'color-mix(in oklab, var(--app-accent) 8%, var(--app-surface) 92%)' }}>
                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--app-accent)' }} />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--app-muted)' }}>
                  <strong style={{ color: 'var(--app-text)' }}>Confidentialité :</strong> votre message n'est utilisé que pour vous répondre. Aucune newsletter automatique.
                </p>
              </div>
            </div>

            <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:opacity-80" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }}>
              <ArrowLeft className="h-4 w-4" />
              Retour à l'accueil
            </Link>
          </div>

          {/* Right — Formulaire */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl border shadow-md overflow-hidden" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 22%, var(--app-border) 78%)', background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 88%, var(--app-accent) 12%) 100%)' }}>
              {/* Form header */}
              <div className="px-6 sm:px-7 pt-6 sm:pt-7 pb-5 border-b" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 78%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 94%, white 6%)' }}>
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #2f261d 0%, #8a5a36 100%)' }}>
                    <Send className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-extrabold tracking-tight" style={{ color: 'var(--app-text)' }}>Envoyez-nous un message</h2>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--app-muted)]">
                      Réponse directe dans votre boîte email — <strong style={{ color: 'var(--app-text)' }}>mise en forme premium</strong> côté réception, tri et réponse en 1 clic.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)', background: 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)', color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }}>
                    ✦ Formulaire sécurisé
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-muted)' }}>
                    <Clock className="h-3 w-3" />
                    Réponse &lt; 24h
                  </span>
                </div>
              </div>

              <div className="px-6 sm:px-7 py-6">
                {isSuccess ? (
                  <div className="rounded-2xl border p-6 sm:p-8 text-center" style={{ borderColor: 'color-mix(in oklab, var(--app-success) 28%, var(--app-border) 72%)', background: 'color-mix(in oklab, var(--app-success) 10%, var(--app-surface) 90%)' }}>
                    <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #5b7b58 0%, #3d5a3a 100%)' }}>
                      <CheckCircle2 className="h-7 w-7" />
                    </span>
                    <h3 className="mt-4 text-xl font-extrabold" style={{ color: 'var(--app-text)' }}>Message envoyé avec succès !</h3>
                    <p className="mt-2 text-sm leading-relaxed max-w-md mx-auto" style={{ color: 'var(--app-muted)' }}>
                      Merci pour votre message — il vient d'arriver dans notre boîte email avec une présentation premium, prête à être traitée.
                      Nous vous répondons très bientôt à l'adresse que vous avez indiquée.
                    </p>
                    <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
                      <button
                        type="button"
                        onClick={() => setIsSuccess(false)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-bold transition hover:opacity-80"
                        style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text)' }}
                      >
                        <MessageSquare className="h-4 w-4" />
                        Envoyer un autre message
                      </button>
                      <Link
                        href="/"
                        className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
                        style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 74%, #5a3f2d 26%), color-mix(in oklab, var(--app-accent) 88%, #3a291d 12%))' }}
                      >
                        Retour à l'accueil
                      </Link>
                    </div>
                    <p className="mt-4 text-xs" style={{ color: 'var(--app-muted)' }}>
                      Vous recevrez notre réponse directement par email à l'adresse fournie.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} noValidate className="space-y-5">
                    {/* Honeypot */}
                    <div className="hidden" aria-hidden="true">
                      <label htmlFor="contact-website">Website</label>
                      <input
                        id="contact-website"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={form.website}
                        onChange={(e) => handleChange('website', e.target.value)}
                      />
                    </div>

                    {apiError && (
                      <div className="rounded-xl border px-4 py-3 flex gap-2.5" style={{ borderColor: 'color-mix(in oklab, var(--app-danger) 28%, var(--app-border) 72%)', background: 'color-mix(in oklab, var(--app-danger) 10%, var(--app-surface) 90%)' }}>
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--app-danger)' }} />
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--app-text)' }}>{apiError}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="contact-name" className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--app-text)' }}>
                          <span className="inline-flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                            Nom complet *
                          </span>
                        </label>
                        <input
                          id="contact-name"
                          type="text"
                          autoComplete="name"
                          placeholder="Dr. Ahmed Benali"
                          value={form.name}
                          onChange={(e) => handleChange('name', e.target.value)}
                          onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                          aria-invalid={showError('name')}
                          aria-describedby={showError('name') ? 'contact-name-error' : undefined}
                          className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition placeholder:text-[var(--app-muted)] focus:ring-2"
                          style={{
                            borderColor: showError('name') ? 'color-mix(in oklab, var(--app-danger) 60%, var(--app-border) 40%)' : 'var(--app-border)',
                            backgroundColor: 'var(--app-surface)',
                            color: 'var(--app-text)',
                            boxShadow: showError('name') ? '0 0 0 3px color-mix(in oklab, var(--app-danger) 18%, transparent)' : showError('name') ? undefined : 'none',
                          }}
                        />
                        {showError('name') && (
                          <p id="contact-name-error" className="mt-1.5 text-xs font-medium flex items-center gap-1" style={{ color: 'var(--app-danger)' }}>
                            <AlertCircle className="h-3 w-3" />
                            {fieldErrors.name}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="contact-email" className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--app-text)' }}>
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                            Adresse email *
                          </span>
                        </label>
                        <input
                          id="contact-email"
                          type="email"
                          autoComplete="email"
                          placeholder="vous@exemple.com"
                          value={form.email}
                          onChange={(e) => handleChange('email', e.target.value)}
                          onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                          aria-invalid={showError('email')}
                          aria-describedby={showError('email') ? 'contact-email-error' : undefined}
                          className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition placeholder:text-[var(--app-muted)] focus:ring-2"
                          style={{
                            borderColor: showError('email') ? 'color-mix(in oklab, var(--app-danger) 60%, var(--app-border) 40%)' : 'var(--app-border)',
                            backgroundColor: 'var(--app-surface)',
                            color: 'var(--app-text)',
                          }}
                        />
                        {showError('email') && (
                          <p id="contact-email-error" className="mt-1.5 text-xs font-medium flex items-center gap-1" style={{ color: 'var(--app-danger)' }}>
                            <AlertCircle className="h-3 w-3" />
                            {fieldErrors.email}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="contact-phone" className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--app-text)' }}>
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                            Téléphone <span className="font-normal text-[var(--app-muted)]">(optionnel)</span>
                          </span>
                        </label>
                        <input
                          id="contact-phone"
                          type="tel"
                          autoComplete="tel"
                          placeholder="+213 6 60 00 00 00"
                          value={form.phone}
                          onChange={(e) => handleChange('phone', e.target.value)}
                          onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
                          aria-invalid={showError('phone')}
                          aria-describedby={showError('phone') ? 'contact-phone-error' : undefined}
                          className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition placeholder:text-[var(--app-muted)] focus:ring-2"
                          style={{
                            borderColor: showError('phone') ? 'color-mix(in oklab, var(--app-danger) 60%, var(--app-border) 40%)' : 'var(--app-border)',
                            backgroundColor: 'var(--app-surface)',
                            color: 'var(--app-text)',
                          }}
                        />
                        {showError('phone') ? (
                          <p id="contact-phone-error" className="mt-1.5 text-xs font-medium flex items-center gap-1" style={{ color: 'var(--app-danger)' }}>
                            <AlertCircle className="h-3 w-3" />
                            {fieldErrors.phone}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-xs text-[var(--app-muted)]">Uniquement si vous souhaitez être rappelé.</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="contact-subject" className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--app-text)' }}>
                          <span className="inline-flex items-center gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                            Sujet *
                          </span>
                        </label>
                        <div className="relative">
                          <select
                            id="contact-subject"
                            value={form.subject}
                            onChange={(e) => handleChange('subject', e.target.value)}
                            onBlur={() => setTouched((p) => ({ ...p, subject: true }))}
                            aria-invalid={showError('subject')}
                            aria-describedby={showError('subject') ? 'contact-subject-error' : undefined}
                            className="w-full appearance-none rounded-xl border px-4 py-3 pr-9 text-sm outline-none transition focus:ring-2"
                            style={{
                              borderColor: showError('subject') ? 'color-mix(in oklab, var(--app-danger) 60%, var(--app-border) 40%)' : 'var(--app-border)',
                              backgroundColor: 'var(--app-surface)',
                              color: form.subject ? 'var(--app-text)' : 'color-mix(in oklab, var(--app-muted) 82%, transparent)',
                            }}
                          >
                            <option value="">Choisissez un sujet</option>
                            {SUBJECT_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-muted)]">▾</span>
                        </div>
                        {showError('subject') && (
                          <p id="contact-subject-error" className="mt-1.5 text-xs font-medium flex items-center gap-1" style={{ color: 'var(--app-danger)' }}>
                            <AlertCircle className="h-3 w-3" />
                            {fieldErrors.subject}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label htmlFor="contact-message" className="block text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                          Message *
                        </label>
                        <span className="text-xs tabular-nums" style={{ color: form.message.length > 4800 ? 'var(--app-warning)' : form.message.length > 5000 ? 'var(--app-danger)' : 'var(--app-muted)' }}>
                          {form.message.length} / 5000
                        </span>
                      </div>
                      <textarea
                        id="contact-message"
                        rows={6}
                        placeholder="Décrivez votre demande avec précision : contexte, compte concerné, capture si utile… Plus votre message est complet, plus notre réponse sera rapide."
                        value={form.message}
                        onChange={(e) => handleChange('message', e.target.value)}
                        onBlur={() => setTouched((p) => ({ ...p, message: true }))}
                        aria-invalid={showError('message')}
                        aria-describedby={showError('message') ? 'contact-message-error' : 'contact-message-hint'}
                        className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition placeholder:text-[var(--app-muted)] focus:ring-2 resize-y min-h-[140px]"
                        style={{
                          borderColor: showError('message') ? 'color-mix(in oklab, var(--app-danger) 60%, var(--app-border) 40%)' : 'var(--app-border)',
                          backgroundColor: 'var(--app-surface)',
                          color: 'var(--app-text)',
                        }}
                      />
                      {showError('message') ? (
                        <p id="contact-message-error" className="mt-1.5 text-xs font-medium flex items-center gap-1" style={{ color: 'var(--app-danger)' }}>
                          <AlertCircle className="h-3 w-3" />
                          {fieldErrors.message}
                        </p>
                      ) : (
                        <p id="contact-message-hint" className="mt-1.5 text-xs leading-relaxed text-[var(--app-muted)]">
                          Exemple : “Bonjour, je n'arrive pas à accéder à la vidéo Rhinologie — 3.2. Mon compte : {form.email || '...'}”
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border px-3.5 py-2.5 flex gap-2" style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)', background: 'color-mix(in oklab, var(--app-surface) 86%, var(--app-surface-alt) 14%)' }}>
                      <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--app-success)' }} />
                      <p className="text-xs leading-relaxed text-[var(--app-muted)]">
                        Votre message est envoyé de façon sécurisée. Réponse directe par email — aucun abonnement automatique.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || (!isFormValid && Object.keys(touched).length > 0)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-extrabold text-white shadow-md transition disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-95 active:scale-[0.99]"
                      style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 74%, #5a3f2d 26%), color-mix(in oklab, var(--app-accent) 88%, #3a291d 12%))' }}
                    >
                      {isSubmitting ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          Envoi en cours...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Envoyer le message
                        </>
                      )}
                    </button>

                    <p className="text-center text-xs leading-relaxed text-[var(--app-muted)]">
                      En cliquant sur “Envoyer”, vous acceptez d'être recontacté par email à l'adresse fournie.
                      <br />
                      Vous pouvez aussi nous écrire directement à{' '}
                      <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline decoration-dotted underline-offset-2 hover:opacity-80" style={{ color: 'var(--app-accent)' }}>
                        {CONTACT_EMAIL}
                      </a>
                      .
                    </p>
                  </form>
                )}
              </div>

              {!isSuccess && (
                <div className="px-6 sm:px-7 pb-6">
                  <div className="rounded-xl border p-3 flex items-start gap-2.5" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 18%, var(--app-border) 82%)', background: 'color-mix(in oklab, var(--app-accent) 7%, var(--app-surface) 93%)' }}>
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: 'var(--app-accent)' }}>✦</span>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--app-muted)' }}>
                      <strong style={{ color: 'var(--app-text)' }}>Ce qui se passe après l'envoi :</strong> votre message arrive instantanément dans notre boîte email avec une présentation premium (expéditeur, sujet, message, réponse en 1 clic). Nous traitons les demandes par ordre d'arrivée et vous répondons à votre adresse email.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
