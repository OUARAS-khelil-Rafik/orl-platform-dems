'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { LogIn, ShieldCheck, Stethoscope } from 'lucide-react';
import { normalizeGoogleOAuthError } from '@/lib/utils/oauth-error';

export default function SignInPage() {
  const router = useRouter();
  const { user, loading, signIn, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const oauthErrorRaw = Array.isArray(router.query.oauthError)
    ? router.query.oauthError[0]
    : router.query.oauthError;
  const oauthError = useMemo(() => normalizeGoogleOAuthError(oauthErrorRaw), [oauthErrorRaw]);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/');
    }
  }, [loading, user, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    try {
      setIsSubmitting(true);
      await signIn(email, password, rememberMe);
      router.push('/');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Connexion impossible.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="flex-1 py-14 px-4"
      style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 94%, white 6%) 0%, color-mix(in oklab, var(--app-surface-alt) 74%, var(--app-accent) 26%) 100%)' }}
    >
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div
          className="relative overflow-hidden lg:col-span-5 rounded-3xl border p-8 shadow-xl"
          style={{
            color: 'var(--hero-title)',
            borderColor: 'color-mix(in oklab, var(--hero-chip-border) 72%, var(--app-border) 28%)',
            background: 'linear-gradient(145deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
          }}
        >
          <div className="absolute -top-8 -right-10 h-36 w-36 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 38%, transparent)' }} />
          <div className="absolute -bottom-10 -left-6 h-40 w-40 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--app-accent) 24%, transparent)' }} />
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.14em]" style={{ borderColor: 'var(--hero-chip-border)', backgroundColor: 'var(--hero-chip-bg)', color: 'var(--hero-chip-text)' }}>
            <Stethoscope className="h-3.5 w-3.5" />
            Espace sécurisé
          </div>
          <h1 className="relative text-3xl font-bold mt-5 mb-3 leading-tight">Connexion à votre tableau de bord DEMS ENT</h1>
          <p className="relative mb-6" style={{ color: 'var(--hero-body)' }}>Retrouvez vos cours, vos achats, vos progrès et vos paramètres depuis une interface unique.</p>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)' }}>Accès rapide aux spécialités et contenus pédagogiques</div>
            <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)' }}>Suivi des vidéos vues et de vos achats</div>
            <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--hero-panel-border)', backgroundColor: 'var(--hero-panel-bg)' }}>Gestion du profil et des préférences d'affichage</div>
          </div>
        </div>

        <div
          className="lg:col-span-7 rounded-3xl border bg-white p-8 shadow-md"
          style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)', background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 95%, white 5%) 0%, color-mix(in oklab, var(--app-surface-alt) 84%, var(--app-accent) 16%) 100%)' }}
        >
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold mb-4" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 34%, var(--app-border) 66%)', background: 'color-mix(in oklab, var(--app-accent) 13%, var(--app-surface) 87%)', color: 'color-mix(in oklab, var(--app-accent) 80%, var(--app-text) 20%)' }}>
          <ShieldCheck className="h-3.5 w-3.5" />
          Authentification
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Connexion</h2>
        <p className="text-slate-600 mb-6">Accédez à votre espace DEMS ENT.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {oauthError ? (
            <p className="text-sm text-red-600">{String(oauthError)}</p>
          ) : null}

          <div>
            <label htmlFor="signin-email" className="block text-sm font-medium text-slate-700 mb-1">
              Email *
            </label>
            <input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200"
              placeholder="vous@exemple.com"
            />
          </div>

          <div>
            <label htmlFor="signin-password" className="block text-sm font-medium text-slate-700 mb-1">
              Mot de passe *
            </label>
            <input
              id="signin-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200"
              placeholder="********"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <label htmlFor="signin-remember" className="inline-flex items-center gap-2 text-sm text-slate-700 select-none">
              <input
                id="signin-remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-amber-700 focus:ring-amber-500"
              />
              Se souvenir de moi
            </label>

            <Link
              href="/forgot-password"
              className="text-sm font-semibold auth-inline-link text-amber-700 hover:text-amber-800"
            >
              Mot de passe oublie ?
            </Link>
          </div>

          <button
            type="button"
            onClick={() => signInWithGoogle(rememberMe)}
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-70"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">G</span>
            Connexion Google
          </button>

          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-70"
            style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 74%, #5a3f2d 26%), color-mix(in oklab, var(--app-accent) 88%, #3a291d 12%))' }}
          >
            <LogIn className="h-4 w-4" />
            {isSubmitting ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-600 text-center">
          Pas de compte ?{' '}
          <Link href="/sign-up" className="font-semibold auth-inline-link" style={{ color: 'color-mix(in oklab, var(--app-accent) 78%, var(--app-text) 22%)' }}>
            Creer un compte
          </Link>
        </p>
        </div>
      </div>
    </div>
  );
}
