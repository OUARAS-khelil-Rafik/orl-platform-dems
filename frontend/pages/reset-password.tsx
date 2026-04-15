'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { FormEvent, useMemo, useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { resetPasswordWithToken } from '@/lib/data/local-data';

export default function ResetPasswordPage() {
  const router = useRouter();
  const tokenFromQuery = useMemo(() => {
    const raw = router.query.token;
    if (Array.isArray(raw)) {
      return String(raw[0] || '').trim();
    }
    return String(raw || '').trim();
  }, [router.query.token]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  const dangerStyle = {
    borderColor: 'color-mix(in oklab, var(--app-danger) 36%, var(--app-border) 64%)',
    background: 'color-mix(in oklab, var(--app-danger) 12%, var(--app-surface) 88%)',
    color: 'color-mix(in oklab, var(--app-danger) 78%, var(--app-text) 22%)',
  };

  const actionButtonStyle = {
    background:
      'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 74%, #5a3f2d 26%), color-mix(in oklab, var(--app-accent) 88%, #3a291d 12%))',
    color: 'var(--app-accent-contrast)',
  };

  const hasToken = tokenFromQuery.length > 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!hasToken) {
      setError('Le token de reinitialisation est manquant.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Le nouveau mot de passe doit contenir au moins 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('La confirmation du mot de passe ne correspond pas.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await resetPasswordWithToken(tokenFromQuery, newPassword);
      setSuccess(response.message || 'Mot de passe reinitialise avec succes.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (submitError) {
      const nextMessage = submitError instanceof Error ? submitError.message : 'Reinitialisation impossible.';
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
            Nouveau mot de passe
          </div>

          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--app-text)' }}>Reinitialiser le mot de passe</h1>
          <p className="mb-6" style={{ color: 'var(--app-muted)' }}>
            Definissez un nouveau mot de passe pour votre compte.
          </p>

          {!hasToken ? (
            <div className="rounded-xl border p-3 text-sm" style={dangerStyle}>
              Le lien est incomplet ou invalide. Veuillez refaire une demande de reinitialisation.
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium mb-1" style={{ color: 'var(--app-text)' }}>
                Nouveau mot de passe
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--app-muted)' }} />
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-xl border pl-10 pr-4 py-3 outline-none placeholder:text-slate-400 focus:ring-2 focus:border-amber-600 focus:ring-amber-200"
                  style={{
                    ...inputStyle,
                    outlineColor: 'transparent',
                    boxShadow: 'none',
                  }}
                  placeholder="Minimum 6 caracteres"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium mb-1" style={{ color: 'var(--app-text)' }}>
                Confirmer le mot de passe
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-xl border px-4 py-3 outline-none placeholder:text-slate-400 focus:ring-2 focus:border-amber-600 focus:ring-amber-200"
                style={{
                  ...inputStyle,
                  outlineColor: 'transparent',
                  boxShadow: 'none',
                }}
                placeholder="Retapez le mot de passe"
              />
            </div>

            {error ? (
              <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="text-sm" style={{ color: 'var(--app-success)' }}>
                {success}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || !hasToken}
              className="w-full rounded-xl px-4 py-3 font-semibold transition hover:brightness-95 disabled:opacity-70"
              style={actionButtonStyle}
            >
              {isSubmitting ? 'Reinitialisation...' : 'Mettre a jour le mot de passe'}
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
