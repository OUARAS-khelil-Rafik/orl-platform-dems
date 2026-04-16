'use client';

import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowLeft, Compass, Home, Stethoscope } from 'lucide-react';

const quickLinks = [
  {
    href: '/videos',
    title: 'Explorer les videos',
    description: 'Reprendre les contenus les plus consultes',
  },
  {
    href: '/planning',
    title: 'Voir le planning',
    description: 'Verifier les prochaines sessions et disponibilites',
  },
  {
    href: '/contact',
    title: 'Contacter le support',
    description: 'Signaler un lien casse ou demander de l aide',
  },
];

export default function NotFoundPage() {
  return (
    <>
      <Head>
        <title>404 | Page introuvable</title>
      </Head>

      <div className="not-found-page relative flex-1 overflow-hidden px-4 py-14 sm:px-6 lg:px-10">
        <div className="not-found-pattern pointer-events-none absolute inset-0 opacity-55" />

        <div className="not-found-glow not-found-glow-right" />
        <div className="not-found-glow not-found-glow-left" />

        <div className="relative mx-auto w-full max-w-6xl">
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="not-found-shell grid gap-8 overflow-hidden rounded-3xl border p-6 shadow-(--shadow-elevated) md:p-10 lg:grid-cols-[1.15fr_0.85fr]"
          >
            <div className="relative z-10">
              <motion.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1, duration: 0.35 }}
                className="not-found-badge mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
              >
                <Compass className="h-3.5 w-3.5" />
                Navigation
              </motion.div>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16, duration: 0.35 }}
                className="not-found-kicker mb-3 text-sm font-semibold uppercase tracking-[0.26em]"
              >
                Erreur 404
              </motion.p>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="not-found-title mb-4 text-5xl leading-[0.95] sm:text-6xl md:text-7xl"
              >
                Page introuvable
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28, duration: 0.4 }}
                className="not-found-body max-w-2xl text-base sm:text-lg"
              >
                Le lien que vous cherchez est absent ou a ete deplace. Utilisez les raccourcis ci-dessous
                pour revenir rapidement vers les pages essentielles de la plateforme DEMS ORL.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.34, duration: 0.4 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Link
                  href="/"
                  className="not-found-primary-btn inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white"
                >
                  <Home className="h-4 w-4" />
                  Retour accueil
                </Link>

                <Link
                  href="/videos"
                  className="not-found-secondary-btn inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Aller aux videos
                </Link>
              </motion.div>
            </div>

            <motion.aside
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.22, duration: 0.4 }}
              className="not-found-side relative rounded-2xl border p-5 sm:p-6"
            >
              <div className="not-found-side-badge mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold">
                <Stethoscope className="h-3.5 w-3.5" />
                Raccourcis utiles
              </div>

              <div className="space-y-3">
                {quickLinks.map((item, index) => (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.34 + index * 0.08, duration: 0.3 }}
                  >
                    <Link
                      href={item.href}
                      className="not-found-link block rounded-xl border px-4 py-3 transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <p className="text-sm font-semibold text-[var(--app-text)]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-[var(--app-muted)]">
                        {item.description}
                      </p>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </motion.aside>
          </motion.section>
        </div>
      </div>
    </>
  );
}
