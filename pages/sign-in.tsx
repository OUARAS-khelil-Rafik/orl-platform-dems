'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { LogIn } from 'lucide-react';

export default function SignInPage() {
  const router = useRouter();
  const { user, loading, signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    try {
      setIsSubmitting(true);
      await signIn(email, password);
      router.push('/dashboard');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Connexion impossible.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 py-14 px-4">
      <div className="max-w-md mx-auto rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Connexion</h1>
        <p className="text-slate-600 mb-6">Accedez a votre espace DEMS ENT.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-medical-500 focus:ring-2 focus:ring-medical-200"
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
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-medical-500 focus:ring-2 focus:ring-medical-200"
              placeholder="********"
            />
          </div>

          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-medical-600 px-4 py-3 font-semibold text-white hover:bg-medical-700 disabled:opacity-70"
          >
            <LogIn className="h-4 w-4" />
            {isSubmitting ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-600 text-center">
          Pas de compte ?{' '}
          <Link href="/sign-up" className="font-semibold text-medical-700 hover:text-medical-800">
            Creer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}
