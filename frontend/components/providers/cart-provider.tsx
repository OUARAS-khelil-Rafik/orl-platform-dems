'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/auth-provider';

export interface CartItem {
  id: string; // video.id or pack.id
  type: 'video' | 'pack';
  title: string;
  price: number;
  imageUrl?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthReady } = useAuth();
  // Hydration-safe: initial render toujours vide (pareil serveur/client), chargement réel dans useEffect
  const [items, setItems] = useState<CartItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const itemsRef = React.useRef(items);
  const suppressBroadcastRef = React.useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Chargement initial depuis localStorage après hydration
  useEffect(() => {
    try {
      const savedCart = window.localStorage.getItem('dems_ent_cart');
      if (savedCart) {
        const parsed = JSON.parse(savedCart) as CartItem[];
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }
    } catch {
      console.error('Failed to parse cart from local storage');
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Synchronisation cross-tab : garde le panier identique si on ouvre un nouvel onglet / modifie dans un autre onglet
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'dems_ent_cart') return;
      try {
        if (event.newValue) {
          const parsed = JSON.parse(event.newValue) as CartItem[];
          if (Array.isArray(parsed)) {
            if (JSON.stringify(itemsRef.current) !== JSON.stringify(parsed)) {
              suppressBroadcastRef.current = true;
              setItems(parsed);
            }
          }
        } else {
          if (itemsRef.current.length !== 0) {
            suppressBroadcastRef.current = true;
            setItems([]);
          }
        }
      } catch {
        // Ignore parse error
      }
    };
    window.addEventListener('storage', handleStorage);
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('dems-cart-channel-v1');
        bc.onmessage = (e: MessageEvent) => {
          const data = e.data as { type?: string; items?: CartItem[] } | null;
          if (data?.type === 'cart-update' && Array.isArray(data.items)) {
            if (JSON.stringify(itemsRef.current) !== JSON.stringify(data.items)) {
              suppressBroadcastRef.current = true;
              setItems(data.items);
            }
          } else if (data?.type === 'cart-clear') {
            if (itemsRef.current.length !== 0) {
              suppressBroadcastRef.current = true;
              setItems([]);
            }
          }
        };
      }
    } catch {}
    return () => {
      window.removeEventListener('storage', handleStorage);
      try { bc?.close(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('dems_ent_cart', JSON.stringify(items));
      if (suppressBroadcastRef.current) {
        suppressBroadcastRef.current = false;
        return;
      }
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const ch = new BroadcastChannel('dems-cart-channel-v1');
          ch.postMessage({ type: items.length === 0 ? 'cart-clear' : 'cart-update', items });
          ch.close();
        }
      } catch {}
    }
  }, [items, isHydrated]);

  // Clear cart when there is no connected user (e.g. after sign out)
  useEffect(() => {
    if (!isAuthReady) return;
    if (!user) {
      // Intentional reset on sign-out to avoid leaking a previous user's cart.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([]);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('dems_ent_cart');
      }
    }
  }, [user, isAuthReady]);

  const addItem = (item: CartItem) => {
    setItems((prev) => {
      if (prev.find((i) => i.id === item.id)) {
        return prev; // Item already in cart
      }
      return [...prev, item];
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setItems([]);
  };

  const total = items.reduce((sum, item) => sum + item.price, 0);
  const itemCount = items.length;

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, total, itemCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
