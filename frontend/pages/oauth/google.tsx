'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { signInWithOAuthToken } from '@/lib/data/local-data';

const sanitizeNextPath = (rawPath: string | null, fallback = '/dashboard') => {
  const nextPath = String(rawPath || '').trim();
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return fallback;
  }
  return nextPath;
};

export default function GoogleOAuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Connexion Google en cours...');

  useEffect(() => {
    const completeOAuthSignIn = async () => {
      const hashPayload = typeof window !== 'undefined'
        ? window.location.hash.replace(/^#/, '')
        : '';

      const hashParams = new URLSearchParams(hashPayload);
      const token = hashParams.get('token');
      const remember = hashParams.get('remember') !== '0';
      const nextPath = sanitizeNextPath(hashParams.get('next'), '/dashboard');
      const oauthError = typeof router.query.oauthError === 'string'
        ? router.query.oauthError
        : '';

      if (oauthError) {
        setError(oauthError);
        setStatus('Connexion Google interrompue.');
        return;
      }

      if (!token) {
        setError('Token OAuth Google manquant.');
        setStatus('Connexion Google interrompue.');
        return;
      }

      try {
        await signInWithOAuthToken(token, remember);
        setStatus('Connexion reussie. Redirection...');
        router.replace(nextPath);
      } catch (callbackError) {
        const message = callbackError instanceof Error
          ? callbackError.message
          : 'Connexion Google impossible.';
        setError(message);
        setStatus('Connexion Google interrompue.');
      }
    };

    void completeOAuthSignIn();
  }, [router]);

  return (
    <div className="flex-1 min-h-[70vh] px-4 py-16" style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 95%, white 5%) 0%, color-mix(in oklab, var(--app-surface-alt) 78%, var(--app-accent) 22%) 100%)' }}>
      <div className="mx-auto max-w-lg rounded-2xl border p-8 shadow-lg" style={{ borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)', background: 'color-mix(in oklab, var(--app-surface) 96%, white 4%)' }}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>Authentification Google</h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--app-muted)' }}>{status}</p>

        {error ? (
          <div className="mt-5 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'color-mix(in oklab, var(--app-danger) 35%, var(--app-border) 65%)', background: 'color-mix(in oklab, var(--app-danger) 12%, var(--app-surface) 88%)', color: 'color-mix(in oklab, var(--app-danger) 78%, var(--app-text) 22%)' }}>
            {error}
          </div>
        ) : (
          <div className="mt-5 inline-flex items-center gap-2 text-sm" style={{ color: 'var(--app-muted)' }}>
            <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Verification de votre session...
          </div>
        )}

        {error ? (
          <div className="mt-6">
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold"
              style={{ backgroundColor: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}
            >
              Retour a la connexion
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
