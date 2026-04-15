'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import { requestPasswordReset } from '@/lib/data/local-data';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetUrl, setResetUrl] = useState('');

  const pageStyle = {
    background:
      'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 95%, white 5%) 0%, color-mix(in oklab, var(--app-surface-alt) 78%, var(--app-accent) 22%) 100%)',
  };

  const panelStyle = {
    borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)',
    background:
      'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-alt) 84%, var(--app-accent) 16%) 100%)',
  };

  const chipStyle = {
    borderColor: 'color-mix(in oklab, var(--app-warning) 36%, var(--app-border) 64%)',
    background: 'color-mix(in oklab, var(--app-warning) 14%, var(--app-surface) 86%)',
    color: 'color-mix(in oklab, var(--app-warning) 80%, var(--app-text) 20%)',
  };

  const inputStyle = {
    background: 'color-mix(in oklab, var(--app-surface) 95%, var(--app-bg) 5%)',
    borderColor: 'var(--app-border)',
    color: 'var(--app-text)',
  };

  const warningStyle = {
    borderColor: 'color-mix(in oklab, var(--app-warning) 36%, var(--app-border) 64%)',
    background: 'color-mix(in oklab, var(--app-warning) 12%, var(--app-surface) 88%)',
    color: 'color-mix(in oklab, var(--app-warning) 78%, var(--app-text) 22%)',
  };

  const actionButtonStyle = {
    background:
      'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 74%, #5a3f2d 26%), color-mix(in oklab, var(--app-accent) 88%, #3a291d 12%))',
    color: 'var(--app-accent-contrast)',
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setResetUrl('');

    try {
      setIsSubmitting(true);
      const response = await requestPasswordReset(email);
      setMessage(response.message || 'Si un compte existe, un lien a ete envoye.');

      const canDisplayDebugLink =
        typeof window !== 'undefined'
        && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      setResetUrl(canDisplayDebugLink ? response.resetUrl || '' : '');
    } catch (submitError) {
      const nextMessage = submitError instanceof Error ? submitError.message : 'Demande impossible.';
      setError(nextMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 py-14 px-4" style={pageStyle}>
      <div className="max-w-2xl mx-auto">
        <section className="rounded-3xl border p-8 shadow-md" style={panelStyle}>
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold mb-4" style={chipStyle}>
            <KeyRound className="h-3.5 w-3.5" />
            Recuperation du mot de passe
          </div>

          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--app-text)' }}>Mot de passe oublie</h1>
          <p className="mb-6" style={{ color: 'var(--app-muted)' }}>
            Entrez votre email. Si le compte existe, vous recevrez un lien pour definir un nouveau mot de passe.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-medium mb-1" style={{ color: 'var(--app-text)' }}>
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--app-muted)' }} />
                <input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border pl-10 pr-4 py-3 outline-none placeholder:text-slate-400 focus:ring-2 focus:border-amber-600 focus:ring-amber-200"
                  style={{
                    ...inputStyle,
                    outlineColor: 'transparent',
                    boxShadow: 'none',
                  }}
                  placeholder="vous@exemple.com"
                />
              </div>
            </div>

            {error ? (
              <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="text-sm" style={{ color: 'var(--app-success)' }}>
                {message}
              </p>
            ) : null}

            {resetUrl ? (
              <div className="rounded-xl border p-3 text-sm" style={warningStyle}>
                <p className="font-medium">Lien de reinitialisation (mode developpement)</p>
                <a href={resetUrl} className="mt-1 block break-all underline" target="_blank" rel="noreferrer">
                  {resetUrl}
                </a>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl px-4 py-3 font-semibold transition hover:brightness-95 disabled:opacity-70"
              style={actionButtonStyle}
            >
              {isSubmitting ? 'Envoi...' : 'Envoyer le lien'}
            </button>
          </form>

          <p className="mt-6 text-sm text-center" style={{ color: 'var(--app-muted)' }}>
            Retour a la{' '}
            <Link href="/sign-in" className="font-semibold auth-inline-link" style={{ color: 'var(--app-accent)' }}>
              connexion
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
