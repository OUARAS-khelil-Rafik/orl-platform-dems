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
    <div className="flex-1 py-14 px-4 bg-slate-100/80">
      <div className="max-w-2xl mx-auto">
        <section className="rounded-3xl border border-amber-200 bg-white p-8 shadow-md">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold mb-4 text-amber-900">
            <KeyRound className="h-3.5 w-3.5" />
            Nouveau mot de passe
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">Reinitialiser le mot de passe</h1>
          <p className="text-slate-600 mb-6">
            Definissez un nouveau mot de passe pour votre compte.
          </p>

          {!hasToken ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Le lien est incomplet ou invalide. Veuillez refaire une demande de reinitialisation.
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 pl-10 pr-4 py-3 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200"
                  placeholder="Minimum 6 caracteres"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1">
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
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200"
                placeholder="Retapez le mot de passe"
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting || !hasToken}
              className="w-full rounded-xl bg-amber-700 px-4 py-3 font-semibold text-white disabled:opacity-70 hover:bg-amber-800"
            >
              {isSubmitting ? 'Reinitialisation...' : 'Mettre a jour le mot de passe'}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-600 text-center">
            Retour a la{' '}
            <Link href="/sign-in" className="font-semibold auth-inline-link text-amber-700 hover:text-amber-800">
              connexion
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
