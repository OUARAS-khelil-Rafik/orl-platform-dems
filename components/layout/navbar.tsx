'use client';

import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { useCart } from '@/components/providers/cart-provider';
import { LogIn, LogOut, User, Menu, X, Stethoscope, ShoppingCart, ChevronDown, LayoutDashboard, ShoppingBag, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';

export function Navbar() {
  const { user, profile, loading, signOut } = useAuth();
  const { itemCount } = useCart();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = profile?.role === 'admin';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const navLinks = [
    { name: 'Accueil', href: '/' },
    { name: 'Otologie', href: '/specialties/otologie' },
    { name: 'Rhinologie', href: '/specialties/rhinologie' },
    { name: 'Laryngologie', href: '/specialties/laryngologie' },
    { name: 'Tarifs', href: '/pricing' },
  ];
  const visibleNavLinks = isAdmin ? navLinks.filter((link) => link.name !== 'Tarifs') : navLinks;

  const displayName = profile?.displayName?.trim() || '';
  const hasDoctorPrefix = /^dr\.?/i.test(displayName);
  const doctorName = displayName
    ? hasDoctorPrefix
      ? displayName
      : `Dr. ${displayName}`
    : '';

  useEffect(() => {
    if (!isUserMenuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!userMenuRef.current) return;
      const targetNode = event.target as Node | null;
      if (targetNode && !userMenuRef.current.contains(targetNode)) {
        setIsUserMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isUserMenuOpen]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-medical-700 hover:text-medical-800 transition-colors">
          <Stethoscope className="h-6 w-6" />
          <span className="font-bold text-xl tracking-tight">DEMS ENT</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          {visibleNavLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-sm font-medium text-slate-600 hover:text-medical-600 transition-colors"
            >
              {link.name}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          {user && !isAdmin && (
            <Link href="/checkout" className="relative p-2 text-slate-500 hover:text-medical-600 hover:bg-slate-100 rounded-full transition-colors">
              <ShoppingCart className="h-5 w-5" />
              {itemCount > 0 && (
                <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full">
                  {itemCount}
                </span>
              )}
            </Link>
          )}

          {!loading && (
            <>
              {user && profile ? (
                <div ref={userMenuRef} className="relative flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsUserMenuOpen((v) => !v)}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1.5 hover:border-medical-300 hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center">
                      {profile.photoURL ? (
                        <Image
                          src={profile.photoURL}
                          alt={profile.displayName}
                          width={32}
                          height={32}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="h-5 w-5 text-slate-500" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-slate-700 max-w-[160px] truncate">
                      {doctorName || profile.email}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </button>

                  {isUserMenuOpen && (
                    <div className="absolute right-0 top-11 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-2 z-50">
                      {profile.role === 'admin' && (
                        <Link
                          href="/admin"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <LayoutDashboard className="h-4 w-4 text-slate-500" />
                          <span>Dashboard</span>
                        </Link>
                      )}

                      {(profile.role === 'vip' || profile.role === 'vip_plus') && (
                        <Link
                          href="/dashboard?tab=purchases"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <ShoppingBag className="h-4 w-4 text-slate-500" />
                          <span>Mes Achats</span>
                        </Link>
                      )}

                      <Link
                        href="/dashboard?tab=profile"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <Settings className="h-4 w-4 text-slate-500" />
                        <span>Paramètres</span>
                      </Link>

                      <button
                        type="button"
                        onClick={async () => {
                          setIsUserMenuOpen(false);
                          await handleSignOut();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Déconnexion</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/sign-up"
                    className="px-4 py-2 rounded-full text-sm font-medium text-medical-700 border border-medical-200 hover:bg-medical-50 transition-colors"
                  >
                    Inscription
                  </Link>
                  <Link
                    href="/sign-in"
                    className="flex items-center gap-2 bg-medical-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-medical-700 transition-colors shadow-sm"
                  >
                    <LogIn className="h-4 w-4" />
                    <span>Connexion</span>
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <div className="md:hidden flex items-center gap-2">
          {user && !isAdmin && (
            <Link href="/checkout" className="relative p-2 text-slate-500 hover:text-medical-600 hover:bg-slate-100 rounded-full transition-colors">
              <ShoppingCart className="h-5 w-5" />
              {itemCount > 0 && (
                <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full">
                  {itemCount}
                </span>
              )}
            </Link>
          )}
          <button
            className="p-2 text-slate-600"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b border-slate-200 overflow-hidden"
          >
            <div className="flex flex-col px-4 py-4 gap-4">
              {visibleNavLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-base font-medium text-slate-700 hover:text-medical-600"
                >
                  {link.name}
                </Link>
              ))}
              <div className="h-px bg-slate-100 my-2" />
              {!loading && (
                user ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center">
                        {profile?.photoURL ? (
                          <Image
                            src={profile.photoURL}
                            alt={profile.displayName}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="h-5 w-5 text-slate-500" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-900">{doctorName || profile?.email}</span>
                      </div>
                    </div>

                    {profile?.role === 'admin' && (
                      <Link
                        href="/admin"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-2 text-base font-medium text-slate-700"
                      >
                        <LayoutDashboard className="h-5 w-5 text-slate-500" />
                        <span>Dashboard</span>
                      </Link>
                    )}

                    {(profile?.role === 'vip' || profile?.role === 'vip_plus') && (
                      <Link
                        href="/dashboard?tab=purchases"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-2 text-base font-medium text-slate-700"
                      >
                        <ShoppingBag className="h-5 w-5 text-slate-500" />
                        <span>Mes Achats</span>
                      </Link>
                    )}

                    <Link
                      href="/dashboard?tab=profile"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-2 text-base font-medium text-slate-700"
                    >
                      <Settings className="h-5 w-5 text-slate-500" />
                      <span>Paramètres</span>
                    </Link>

                    <button
                      onClick={() => { handleSignOut(); setIsMobileMenuOpen(false); }}
                      className="flex items-center gap-2 text-base font-medium text-red-600"
                    >
                      <LogOut className="h-5 w-5" />
                      <span>Déconnexion</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Link
                      href="/sign-up"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 bg-white text-medical-700 border border-medical-200 px-4 py-3 rounded-xl text-base font-medium"
                    >
                      Inscription
                    </Link>
                    <Link
                      href="/sign-in"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 bg-medical-600 text-white px-4 py-3 rounded-xl text-base font-medium"
                    >
                      <LogIn className="h-5 w-5" />
                      <span>Connexion</span>
                    </Link>
                  </div>
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
