import type { AppProps } from 'next/app';
import { Inter } from 'next/font/google';
import { motion, useScroll, useSpring } from 'motion/react';
import '@/styles/globals.css';
import { AuthProvider } from '@/components/providers/auth-provider';
import { CartProvider } from '@/components/providers/cart-provider';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

function GlobalScrollProgress() {
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, {
    stiffness: 130,
    damping: 28,
    mass: 0.25,
  });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 z-[70] origin-left"
      style={{
        scaleX: progressX,
        background:
          'linear-gradient(90deg, color-mix(in oklab, var(--app-accent) 82%, #f8ecdd 18%), color-mix(in oklab, var(--app-accent) 60%, #2f2118 40%))',
      }}
    />
  );
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${inter.variable} scroll-smooth font-sans bg-[var(--app-bg)] text-[var(--app-text)] min-h-screen flex flex-col`}>
      <AuthProvider>
        <CartProvider>
          <GlobalScrollProgress />
          <Navbar />
          <main className="flex-1 flex flex-col">
            <Component {...pageProps} />
          </main>
          <Footer />
        </CartProvider>
      </AuthProvider>
    </div>
  );
}