'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { UserPlus } from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();
  const { user, loading, signUp } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [doctorSpecialty, setDoctorSpecialty] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caracteres.');
      return;
    }

    try {
      setIsSubmitting(true);
      await signUp({
        displayName,
        email,
        password,
        doctorSpecialty,
      });

      router.push('/dashboard');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Inscription impossible.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 py-14 px-4">
      <div className="max-w-lg mx-auto rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Inscription</h1>
        <p className="text-slate-600 mb-6">Creez votre compte avec les champs obligatoires marques par *.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="signup-display-name" className="block text-sm font-medium text-slate-700 mb-1">
              Nom complet *
            </label>
            <input
              id="signup-display-name"
              type="text"
              required
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-medical-500 focus:ring-2 focus:ring-medical-200"
              placeholder="Dr Nom Prenom"
            />
          </div>

          <div>
            <label htmlFor="signup-email" className="block text-sm font-medium text-slate-700 mb-1">
              Email *
            </label>
            <input
              id="signup-email"
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
            <label htmlFor="signup-specialty" className="block text-sm font-medium text-slate-700 mb-1">
              Spécialité médicale *
            </label>
            <input
              id="signup-specialty"
              type="text"
              required
              value={doctorSpecialty}
              onChange={(event) => setDoctorSpecialty(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-medical-500 focus:ring-2 focus:ring-medical-200"
              placeholder="ORL"
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="block text-sm font-medium text-slate-700 mb-1">
              Mot de passe *
            </label>
            <input
              id="signup-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-medical-500 focus:ring-2 focus:ring-medical-200"
              placeholder="Au moins 6 caractères"
            />
          </div>

          <div>
            <label htmlFor="signup-confirm-password" className="block text-sm font-medium text-slate-700 mb-1">
              Confirmation du mot de passe *
            </label>
            <input
              id="signup-confirm-password"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-medical-500 focus:ring-2 focus:ring-medical-200"
              placeholder="Retapez le mot de passe"
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
            <UserPlus className="h-4 w-4" />
            {isSubmitting ? 'Inscription...' : 'Creer mon compte'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-600 text-center">
          Vous avez deja un compte ?{' '}
          <Link href="/sign-in" className="font-semibold text-medical-700 hover:text-medical-800">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
