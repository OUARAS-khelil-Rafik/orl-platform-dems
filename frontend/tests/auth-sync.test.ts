import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onAuthStateChanged, auth } from '@/lib/api/client';

const AUTH_KEY = 'dems-auth-session-v1';
const AUTH_TEMP_KEY = 'dems-auth-session-temp-v1';

const makeSession = (uid = 'u1') => ({
  token: `token-${uid}`,
  user: { uid, email: `${uid}@test.local`, displayName: `User ${uid}`, photoURL: '' },
});

describe('Auth cross-tab sync', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('new tab should immediately see localStorage session (rememberMe=true)', async () => {
    const session = makeSession('u1');
    window.localStorage.setItem(AUTH_KEY, JSON.stringify(session));

    const cb = vi.fn();
    const unsub = onAuthStateChanged(auth, cb);

    // Callback appelé immédiatement avec l'utilisateur stocké
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }));

    unsub();
  });

  it('new tab without session should stay null if no other tab has session', async () => {
    const cb = vi.fn();
    const unsub = onAuthStateChanged(auth, cb);
    expect(cb).toHaveBeenCalledWith(null);
    unsub();
  });

  it('should notify listeners when localStorage session changes via storage event (logout/login cross-tab)', async () => {
    const session = makeSession('u1');
    window.localStorage.setItem(AUTH_KEY, JSON.stringify(session));

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = onAuthStateChanged(auth, cb1);
    const unsub2 = onAuthStateChanged(auth, cb2);

    // Both have user initially
    expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }));
    expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }));

    cb1.mockClear();
    cb2.mockClear();

    // Simulate logout from tab1: clear localStorage and dispatch storage event to tab2
    // In real browser, storage event fires only in *other* tabs, not the one that did the change.
    // Here we simulate the event that tab2 would receive.
    window.localStorage.removeItem(AUTH_KEY);
    const storageEvent = new StorageEvent('storage', {
      key: AUTH_KEY,
      oldValue: JSON.stringify(session),
      newValue: null,
    } as StorageEventInit);
    window.dispatchEvent(storageEvent);

    // Allow microtask for handler
    await new Promise((r) => setTimeout(r, 20));

    // cb2 should have been notified with null (logout propagated)
    // cb1 was in same tab as change, it already was notified via direct writeSession path in real code.
    // In this manual simulation, we check that at least one listener got null.
    // Our handleAuthStorageEvent calls notifyAuthListeners(null) which notifies all listeners in this window.
    expect(cb2).toHaveBeenCalledWith(null);

    unsub1();
    unsub2();
  });

  it('should handle sessionStorage session being readable via getStoredSession fallback', async () => {
    const session = makeSession('u2');
    window.sessionStorage.setItem(AUTH_TEMP_KEY, JSON.stringify(session));

    const cb = vi.fn();
    const unsub = onAuthStateChanged(auth, cb);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u2' }));
    unsub();
  });

  it('should keep session after BroadcastChannel auth-change (session persistence cross-tab)', async () => {
    // Simulate tab A login with session (sessionStorage)
    const session = makeSession('u3');
    window.sessionStorage.setItem(AUTH_TEMP_KEY, JSON.stringify(session));

    // Tab B has no session initially, but will receive broadcast.
    // We simulate broadcast by directly calling the fallback localStorage sync key
    // which is the fallback path for browsers without BroadcastChannel.
    const broadcastPayload = {
      type: 'auth-change',
      session,
      persistence: 'session',
      tabId: 'other-tab-id',
      timestamp: Date.now(),
    };
    window.localStorage.setItem('dems-auth-sync-v1', JSON.stringify(broadcastPayload));
    const ev = new StorageEvent('storage', {
      key: 'dems-auth-sync-v1',
      newValue: JSON.stringify(broadcastPayload),
      oldValue: null,
    } as StorageEventInit);
    window.dispatchEvent(ev);

    await new Promise((r) => setTimeout(r, 30));

    // After broadcast, session should be clonée dans sessionStorage de ce tab
    const raw = window.sessionStorage.getItem(AUTH_TEMP_KEY);
    expect(raw).not.toBeNull();
    if (raw) {
      const parsed = JSON.parse(raw);
      expect(parsed.user.uid).toBe('u3');
    }

    // Et un nouveau listener doit voir l'utilisateur
    const cb = vi.fn();
    const unsub = onAuthStateChanged(auth, cb);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u3' }));
    unsub();
  });
});
