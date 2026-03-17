import type { AppProps } from 'next/app';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { AuthProvider } from '@/components/providers/auth-provider';
import { CartProvider } from '@/components/providers/cart-provider';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${inter.variable} scroll-smooth font-sans bg-slate-50 text-slate-900 min-h-screen flex flex-col`}>
      <AuthProvider>
        <CartProvider>
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