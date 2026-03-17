type Primitive = string | number | boolean | null;
type LocalDocumentData = Record<string, any>;

interface LocalDbState {
  collections: Record<string, Record<string, LocalDocumentData>>;
}

interface CollectionReference {
  kind: 'collection';
  name: string;
}

interface DocReference {
  kind: 'doc';
  collection: string;
  id: string;
}

interface WhereConstraint {
  kind: 'where';
  fieldPath: string;
  operator: '==' | 'array-contains';
  value: Primitive;
}

interface QueryReference {
  kind: 'query';
  collection: string;
  constraints: WhereConstraint[];
}

interface QueryDocumentSnapshot<TData extends LocalDocumentData = LocalDocumentData> {
  id: string;
  data: () => TData;
}

interface QuerySnapshot<TData extends LocalDocumentData = LocalDocumentData> {
  docs: QueryDocumentSnapshot<TData>[];
  forEach: (callback: (doc: QueryDocumentSnapshot<TData>) => void) => void;
}

interface DocumentSnapshot<TData extends LocalDocumentData = LocalDocumentData> {
  id: string;
  exists: () => boolean;
  data: () => TData | undefined;
}

interface ArrayUnionMarker {
  __op: 'arrayUnion';
  values: unknown[];
}

interface ArrayRemoveMarker {
  __op: 'arrayRemove';
  values: unknown[];
}

export interface LocalAuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
}

interface LocalAuthAccount extends LocalAuthUser {
  password: string;
}

const DB_STORAGE_KEY = 'dems-local-db-v2';
const AUTH_ACCOUNTS_KEY = 'dems-local-auth-accounts-v2';
const AUTH_SESSION_KEY = 'dems-local-auth-session-v2';

const DEMO_AUTH_ACCOUNTS: Array<
  LocalAuthAccount & {
    role: 'admin' | 'user' | 'vip' | 'vip_plus';
    subscriptionApprovalStatus: 'none' | 'pending' | 'approved' | 'rejected';
    subscriptionEndDate?: string;
    doctorSpecialty?: string;
  }
> = [
  {
    uid: 'demo-admin-uid',
    email: 'admin@dems.local',
    password: 'Admin123!',
    displayName: 'Admin DEMS',
    photoURL: '',
    role: 'admin',
    subscriptionApprovalStatus: 'none',
  },
  {
    uid: 'demo-user-uid',
    email: 'user@dems.local',
    password: 'User123!',
    displayName: 'User DEMS',
    photoURL: '',
    role: 'user',
    subscriptionApprovalStatus: 'none',
    doctorSpecialty: 'ORL',
  },
  {
    uid: 'demo-vip-uid',
    email: 'vip@dems.local',
    password: 'Vip123!',
    displayName: 'VIP DEMS',
    photoURL: '',
    role: 'vip',
    subscriptionApprovalStatus: 'none',
    doctorSpecialty: 'ORL',
  },
  {
    uid: 'demo-vipplus-uid',
    email: 'vipplus@dems.local',
    password: 'VipPlus123!',
    displayName: 'VIP Plus DEMS',
    photoURL: '',
    role: 'vip_plus',
    subscriptionApprovalStatus: 'approved',
    subscriptionEndDate: '2099-12-31T23:59:59.999Z',
    doctorSpecialty: 'ORL',
  },
];

const authListeners = new Set<(user: LocalAuthUser | null) => void>();

const isBrowser = () => typeof window !== 'undefined';

const normalizeCollectionName = (collectionName: string) => {
  if (collectionName === 'clinical_cases') {
    return 'clinicalCases';
  }
  return collectionName;
};

const createEmptyState = (): LocalDbState => ({
  collections: {
    users: {},
    videos: {},
    qcms: {},
    clinicalCases: {},
    diagrams: {},
    payments: {},
  },
});

let inMemoryState = createEmptyState();
let inMemoryAccounts: LocalAuthAccount[] = [];
let inMemorySession: LocalAuthUser | null = null;

const safeClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const readDbState = (): LocalDbState => {
  if (!isBrowser()) {
    return inMemoryState;
  }

  const raw = window.localStorage.getItem(DB_STORAGE_KEY);
  if (!raw) {
    const initial = createEmptyState();
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(initial));
    inMemoryState = initial;
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as LocalDbState;
    if (!parsed.collections || typeof parsed.collections !== 'object') {
      throw new Error('Invalid DB state');
    }

    const merged: LocalDbState = {
      collections: {
        ...createEmptyState().collections,
        ...parsed.collections,
      },
    };

    inMemoryState = merged;
    return merged;
  } catch {
    const fallback = createEmptyState();
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(fallback));
    inMemoryState = fallback;
    return fallback;
  }
};

const writeDbState = (state: LocalDbState) => {
  inMemoryState = state;
  if (isBrowser()) {
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state));
  }
};

const ensureCollection = (state: LocalDbState, collectionName: string) => {
  const normalized = normalizeCollectionName(collectionName);
  if (!state.collections[normalized]) {
    state.collections[normalized] = {};
  }
  return normalized;
};

const readAuthAccounts = () => {
  if (!isBrowser()) {
    return inMemoryAccounts;
  }

  const raw = window.localStorage.getItem(AUTH_ACCOUNTS_KEY);
  if (!raw) {
    window.localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify([]));
    inMemoryAccounts = [];
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as LocalAuthAccount[];
    inMemoryAccounts = parsed;
    return parsed;
  } catch {
    window.localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify([]));
    inMemoryAccounts = [];
    return [];
  }
};

const writeAuthAccounts = (accounts: LocalAuthAccount[]) => {
  inMemoryAccounts = accounts;
  if (isBrowser()) {
    window.localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(accounts));
  }
};

const readAuthSession = (): LocalAuthUser | null => {
  if (!isBrowser()) {
    return inMemorySession;
  }

  const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) {
    inMemorySession = null;
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as LocalAuthUser;
    inMemorySession = parsed;
    return parsed;
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    inMemorySession = null;
    return null;
  }
};

const writeAuthSession = (session: LocalAuthUser | null) => {
  inMemorySession = session;
  if (isBrowser()) {
    if (session) {
      window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(AUTH_SESSION_KEY);
    }
  }
};

const notifyAuthListeners = (session: LocalAuthUser | null) => {
  authListeners.forEach((listener) => listener(session));
};

const isArrayUnionMarker = (value: unknown): value is ArrayUnionMarker => {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__op' in value &&
    (value as { __op?: string }).__op === 'arrayUnion'
  );
};

const isArrayRemoveMarker = (value: unknown): value is ArrayRemoveMarker => {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__op' in value &&
    (value as { __op?: string }).__op === 'arrayRemove'
  );
};

const isEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const applyFieldUpdate = (currentValue: unknown, updateValue: unknown) => {
  if (isArrayUnionMarker(updateValue)) {
    const currentArray = Array.isArray(currentValue) ? [...currentValue] : [];
    updateValue.values.forEach((value) => {
      if (!currentArray.some((entry) => isEqual(entry, value))) {
        currentArray.push(value);
      }
    });
    return currentArray;
  }

  if (isArrayRemoveMarker(updateValue)) {
    const currentArray = Array.isArray(currentValue) ? [...currentValue] : [];
    return currentArray.filter((entry) => !updateValue.values.some((value) => isEqual(entry, value)));
  }

  return updateValue;
};

const docMatchesConstraints = (docData: LocalDocumentData, constraints: WhereConstraint[]) => {
  return constraints.every((constraint) => {
    const value = docData[constraint.fieldPath];

    if (constraint.operator === 'array-contains') {
      return Array.isArray(value) && value.includes(constraint.value);
    }

    return value === constraint.value;
  });
};

export const app = { name: 'local-app' };
export const db = { name: 'local-db' };
export const auth = { name: 'local-auth' };

export const collection = (_db: typeof db, collectionName: string): CollectionReference => {
  return {
    kind: 'collection',
    name: normalizeCollectionName(collectionName),
  };
};

export const doc = (_db: typeof db, collectionName: string, id: string): DocReference => {
  return {
    kind: 'doc',
    collection: normalizeCollectionName(collectionName),
    id,
  };
};

export const where = (
  fieldPath: string,
  operator: '==' | 'array-contains',
  value: Primitive,
): WhereConstraint => {
  return {
    kind: 'where',
    fieldPath,
    operator,
    value,
  };
};

export const query = (
  collectionRef: CollectionReference,
  ...constraints: WhereConstraint[]
): QueryReference => {
  return {
    kind: 'query',
    collection: collectionRef.name,
    constraints,
  };
};

export const getDocs = async <TData extends LocalDocumentData = LocalDocumentData>(
  source: CollectionReference | QueryReference,
): Promise<QuerySnapshot<TData>> => {
  const state = readDbState();
  const collectionName = source.kind === 'query' ? source.collection : source.name;
  const normalizedCollection = ensureCollection(state, collectionName);
  const documents = Object.entries(state.collections[normalizedCollection]);

  const filtered =
    source.kind === 'query'
      ? documents.filter(([, data]) => docMatchesConstraints(data, source.constraints))
      : documents;

  const docs = filtered.map(([id, data]) => {
    const cloned = safeClone(data) as TData;
    return {
      id,
      data: () => safeClone(cloned),
    };
  });

  return {
    docs,
    forEach: (callback) => {
      docs.forEach((entry) => callback(entry));
    },
  };
};

export const addDoc = async <TData extends LocalDocumentData = LocalDocumentData>(
  collectionRef: CollectionReference,
  data: TData,
): Promise<{ id: string }> => {
  const state = readDbState();
  const normalizedCollection = ensureCollection(state, collectionRef.name);
  const id = createId();

  state.collections[normalizedCollection][id] = safeClone(data);
  writeDbState(state);

  return { id };
};

export const deleteDoc = async (docRef: DocReference): Promise<void> => {
  const state = readDbState();
  const normalizedCollection = ensureCollection(state, docRef.collection);

  delete state.collections[normalizedCollection][docRef.id];
  writeDbState(state);
};

export const getDoc = async <TData extends LocalDocumentData = LocalDocumentData>(
  docRef: DocReference,
): Promise<DocumentSnapshot<TData>> => {
  const state = readDbState();
  const normalizedCollection = ensureCollection(state, docRef.collection);
  const found = state.collections[normalizedCollection][docRef.id];

  return {
    id: docRef.id,
    exists: () => Boolean(found),
    data: () => (found ? (safeClone(found) as TData) : undefined),
  };
};

export const setDoc = async <TData extends LocalDocumentData = LocalDocumentData>(
  docRef: DocReference,
  data: TData,
): Promise<void> => {
  const state = readDbState();
  const normalizedCollection = ensureCollection(state, docRef.collection);

  state.collections[normalizedCollection][docRef.id] = safeClone(data);
  writeDbState(state);
};

export const updateDoc = async (
  docRef: DocReference,
  updates: Record<string, unknown>,
): Promise<void> => {
  const state = readDbState();
  const normalizedCollection = ensureCollection(state, docRef.collection);
  const current = state.collections[normalizedCollection][docRef.id];

  if (!current) {
    throw new Error(`Document ${docRef.collection}/${docRef.id} does not exist.`);
  }

  const next = { ...current };

  Object.entries(updates).forEach(([key, value]) => {
    next[key] = applyFieldUpdate(next[key], value);
  });

  state.collections[normalizedCollection][docRef.id] = next;
  writeDbState(state);
};

export const arrayUnion = (...values: unknown[]): ArrayUnionMarker => {
  return {
    __op: 'arrayUnion',
    values,
  };
};

export const arrayRemove = (...values: unknown[]): ArrayRemoveMarker => {
  return {
    __op: 'arrayRemove',
    values,
  };
};

export const onAuthStateChanged = (
  _auth: typeof auth,
  callback: (user: LocalAuthUser | null) => void,
) => {
  callback(readAuthSession());
  authListeners.add(callback);

  return () => {
    authListeners.delete(callback);
  };
};

export const signOut = async (_auth: typeof auth) => {
  writeAuthSession(null);
  notifyAuthListeners(null);
};

export const ensureDemoAccountsSeeded = () => {
  if (!isBrowser()) {
    return;
  }

  const accounts = readAuthAccounts();
  let hasChanges = false;

  DEMO_AUTH_ACCOUNTS.forEach((demo) => {
    const existing = accounts.find(
      (account) => account.email.toLowerCase() === demo.email.toLowerCase(),
    );

    if (!existing) {
      accounts.push({
        uid: demo.uid,
        email: demo.email,
        password: demo.password,
        displayName: demo.displayName,
        photoURL: demo.photoURL,
      });
      hasChanges = true;
    }
  });

  if (hasChanges) {
    writeAuthAccounts(accounts);
  }

  const state = readDbState();
  const usersCollection = ensureCollection(state, 'users');
  const now = new Date().toISOString();

  DEMO_AUTH_ACCOUNTS.forEach((account) => {
    state.collections[usersCollection][account.uid] = {
      uid: account.uid,
      email: account.email,
      displayName: account.displayName,
      photoURL: account.photoURL,
      role: account.role,
      subscriptionApprovalStatus: account.subscriptionApprovalStatus,
      subscriptionEndDate: account.subscriptionEndDate,
      doctorSpecialty: account.doctorSpecialty,
      purchasedVideos: [],
      purchasedPacks: [],
      createdAt: now,
    };
  });

  writeDbState(state);
};

export const createAuthAccount = (payload: {
  email: string;
  password: string;
  displayName: string;
  photoURL?: string;
}): LocalAuthUser => {
  const normalizedEmail = payload.email.trim().toLowerCase();
  const accounts = readAuthAccounts();
  const existing = accounts.find((account) => account.email.toLowerCase() === normalizedEmail);

  if (existing) {
    throw new Error('Un compte existe deja avec cet email.');
  }

  const account: LocalAuthAccount = {
    uid: createId(),
    email: normalizedEmail,
    password: payload.password,
    displayName: payload.displayName.trim() || 'Utilisateur',
    photoURL: payload.photoURL || '',
  };

  const nextAccounts = [...accounts, account];
  writeAuthAccounts(nextAccounts);

  const session: LocalAuthUser = {
    uid: account.uid,
    email: account.email,
    displayName: account.displayName,
    photoURL: account.photoURL,
  };

  writeAuthSession(session);
  notifyAuthListeners(session);

  return session;
};

export const signInWithEmail = (email: string, password: string): LocalAuthUser => {
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = readAuthAccounts();
  const found = accounts.find(
    (account) => account.email.toLowerCase() === normalizedEmail && account.password === password,
  );

  if (!found) {
    throw new Error('Email ou mot de passe invalide.');
  }

  const session: LocalAuthUser = {
    uid: found.uid,
    email: found.email,
    displayName: found.displayName,
    photoURL: found.photoURL,
  };

  writeAuthSession(session);
  notifyAuthListeners(session);

  return session;
};

export const updateAuthDisplayName = (uid: string, displayName: string) => {
  const accounts = readAuthAccounts();
  const nextAccounts = accounts.map((account) => {
    if (account.uid === uid) {
      return {
        ...account,
        displayName,
      };
    }

    return account;
  });

  writeAuthAccounts(nextAccounts);

  const currentSession = readAuthSession();
  if (currentSession && currentSession.uid === uid) {
    const nextSession = {
      ...currentSession,
      displayName,
    };

    writeAuthSession(nextSession);
    notifyAuthListeners(nextSession);
  }
};

export const updateAuthPhotoURL = (uid: string, photoURL: string) => {
  const accounts = readAuthAccounts();
  const nextAccounts = accounts.map((account) => {
    if (account.uid === uid) {
      return {
        ...account,
        photoURL,
      };
    }

    return account;
  });

  writeAuthAccounts(nextAccounts);

  const currentSession = readAuthSession();
  if (currentSession && currentSession.uid === uid) {
    const nextSession = {
      ...currentSession,
      photoURL,
    };

    writeAuthSession(nextSession);
    notifyAuthListeners(nextSession);
  }
};

export const updateAuthPassword = (
  uid: string,
  currentPassword: string,
  newPassword: string,
) => {
  const accounts = readAuthAccounts();
  const account = accounts.find((a) => a.uid === uid);

  if (!account) {
    throw new Error('Compte introuvable.');
  }

  if (account.password !== currentPassword) {
    throw new Error('Mot de passe actuel incorrect.');
  }

  const nextAccounts = accounts.map((a) =>
    a.uid === uid
      ? {
          ...a,
          password: newPassword,
        }
      : a,
  );

  writeAuthAccounts(nextAccounts);
};
