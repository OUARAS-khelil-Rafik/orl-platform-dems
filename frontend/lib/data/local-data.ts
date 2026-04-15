type Primitive = string | number | boolean | null;
type LocalDocumentData = Record<string, any>;

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

interface ApiCollectionDocument {
  id: string;
  data: LocalDocumentData;
}

interface ApiSessionPayload {
  token: string;
  user: LocalAuthUser;
}

interface ApiHttpError extends Error {
  status?: number;
  code?: string;
  serverMessage?: string;
}

export interface LocalAuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  googleConnected?: boolean;
}

export type CloudinaryResourceType = 'image' | 'video' | 'raw';

export interface CloudinaryCleanupAsset {
  publicId?: string;
  secureUrl?: string;
  resourceType?: CloudinaryResourceType;
}

export interface CloudinaryCleanupResult extends CloudinaryCleanupAsset {
  deleted: boolean;
  skipped: boolean;
  reason: string;
  usedBy: string[];
  deletedAs?: CloudinaryResourceType | null;
}

const resolveApiBaseUrl = () => {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  if (fromEnv) {
    return fromEnv;
  }

  if (isBrowser()) {
    const host = window.location.hostname || 'localhost';
    return `http://${host}:4000/api`;
  }

  return 'http://localhost:4000/api';
};

const getApiBaseUrlCandidates = () => {
  const primary = resolveApiBaseUrl();
  const candidates = [primary];

  if (!isBrowser()) {
    return candidates;
  }

  if (primary.includes('://localhost:4000')) {
    candidates.push(primary.replace('://localhost:4000', '://127.0.0.1:4000'));
  } else if (primary.includes('://127.0.0.1:4000')) {
    candidates.push(primary.replace('://127.0.0.1:4000', '://localhost:4000'));
  }

  return Array.from(new Set(candidates));
};

const AUTH_SESSION_KEY = 'dems-auth-session-v1';
const AUTH_SESSION_TEMP_KEY = 'dems-auth-session-temp-v1';

const authListeners = new Set<(user: LocalAuthUser | null) => void>();

const isBrowser = () => typeof window !== 'undefined';

const normalizeCollectionName = (collectionName: string) => {
  if (collectionName === 'clinical_cases') {
    return 'clinicalCases';
  }
  return collectionName;
};

const safeClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getStoredSession = (): ApiSessionPayload | null => {
  if (!isBrowser()) {
    return null;
  }

  const raw =
    window.localStorage.getItem(AUTH_SESSION_KEY) ??
    window.sessionStorage.getItem(AUTH_SESSION_TEMP_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ApiSessionPayload;
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    window.sessionStorage.removeItem(AUTH_SESSION_TEMP_KEY);
    return null;
  }
};

const writeSession = (session: ApiSessionPayload | null, persistence: 'local' | 'session' = 'local') => {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(AUTH_SESSION_KEY);
  window.sessionStorage.removeItem(AUTH_SESSION_TEMP_KEY);

  if (!session) {
    return;
  }

  const serialized = JSON.stringify(session);
  if (persistence === 'session') {
    window.sessionStorage.setItem(AUTH_SESSION_TEMP_KEY, serialized);
    return;
  }

  window.localStorage.setItem(AUTH_SESSION_KEY, serialized);
};

const getSessionPersistence = (): 'local' | 'session' => {
  if (!isBrowser()) {
    return 'local';
  }

  if (window.localStorage.getItem(AUTH_SESSION_KEY)) {
    return 'local';
  }

  if (window.sessionStorage.getItem(AUTH_SESSION_TEMP_KEY)) {
    return 'session';
  }

  return 'local';
};

const notifyAuthListeners = (user: LocalAuthUser | null) => {
  authListeners.forEach((listener) => listener(user));
};

const getAuthToken = () => getStoredSession()?.token || '';

const resolveMessage = async (response: Response) => {
  try {
    const payload = await response.json();
    return String(payload?.message || 'Request failed.');
  } catch {
    try {
      const text = await response.text();
      return text || 'Request failed.';
    } catch {
      return 'Request failed.';
    }
  }
};

const createApiHttpError = (status: number, message: string, code?: string): ApiHttpError => {
  const error = new Error(`HTTP ${status}: ${message}`) as ApiHttpError;
  error.status = status;
  error.serverMessage = message;
  if (code) {
    error.code = code;
  }
  return error;
};

const apiRequest = async <TResponse>(
  path: string,
  options: RequestInit = {},
  authRequired = false,
): Promise<TResponse> => {
  const headers = new Headers(options.headers || {});
  const token = getAuthToken();

  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (authRequired && !token) {
    throw new Error('Authentication required.');
  }

  const apiBaseUrlCandidates = getApiBaseUrlCandidates();

  let response: Response | null = null;
  let lastFetchError: unknown = null;
  let resolvedApiBaseUrl = apiBaseUrlCandidates[0] || resolveApiBaseUrl();

  for (const apiBaseUrl of apiBaseUrlCandidates) {
    resolvedApiBaseUrl = apiBaseUrl;

    try {
      response = await fetch(`${apiBaseUrl}${path}`, {
        ...options,
        headers,
      });
      break;
    } catch (error) {
      lastFetchError = error;
    }
  }

  if (!response) {
    const details = lastFetchError instanceof Error ? lastFetchError.message : 'Network error';
    throw new Error(
      `Failed to reach API (${resolvedApiBaseUrl}). ${details}. Ensure backend is running on port 4000 (backend: npm run dev).`,
    );
  }

  if (!response.ok) {
    const message = await resolveMessage(response);
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  if (response.status === 204) {
    return {} as TResponse;
  }

  return (await response.json()) as TResponse;
};

export const app = { name: 'api-app' };
export const db = { name: 'api-db' };
export const auth = { name: 'api-auth' };

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

const mapDocs = <TData extends LocalDocumentData = LocalDocumentData>(
  source: ApiCollectionDocument[],
): QuerySnapshot<TData> => {
  const docs = source.map((entry) => {
    const cloned = safeClone(entry.data) as TData;
    return {
      id: entry.id,
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

export const getDocs = async <TData extends LocalDocumentData = LocalDocumentData>(
  source: CollectionReference | QueryReference,
): Promise<QuerySnapshot<TData>> => {
  if (source.kind === 'query') {
    const payload = await apiRequest<{ docs: ApiCollectionDocument[] }>(
      '/data/query',
      {
        method: 'POST',
        body: JSON.stringify({
          collection: source.collection,
          constraints: source.constraints,
        }),
      },
      false,
    );
    return mapDocs<TData>(payload.docs || []);
  }

  const payload = await apiRequest<{ docs: ApiCollectionDocument[] }>(
    `/data/${encodeURIComponent(source.name)}`,
    { method: 'GET' },
    false,
  );
  return mapDocs<TData>(payload.docs || []);
};

export const addDoc = async <TData extends LocalDocumentData = LocalDocumentData>(
  collectionRef: CollectionReference,
  data: TData,
): Promise<{ id: string }> => {
  return apiRequest<{ id: string }>(
    `/data/${encodeURIComponent(collectionRef.name)}`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    false,
  );
};

export const deleteDoc = async (docRef: DocReference): Promise<void> => {
  await apiRequest(
    `/data/${encodeURIComponent(docRef.collection)}/${encodeURIComponent(docRef.id)}`,
    { method: 'DELETE' },
    false,
  );
};

export const getDoc = async <TData extends LocalDocumentData = LocalDocumentData>(
  docRef: DocReference,
): Promise<DocumentSnapshot<TData>> => {
  const payload = await apiRequest<{ exists: boolean; data?: TData }>(
    `/data/${encodeURIComponent(docRef.collection)}/${encodeURIComponent(docRef.id)}`,
    { method: 'GET' },
    false,
  );

  return {
    id: docRef.id,
    exists: () => Boolean(payload.exists),
    data: () => (payload.exists && payload.data ? safeClone(payload.data) : undefined),
  };
};

export const setDoc = async <TData extends LocalDocumentData = LocalDocumentData>(
  docRef: DocReference,
  data: TData,
): Promise<void> => {
  await apiRequest(
    `/data/${encodeURIComponent(docRef.collection)}/${encodeURIComponent(docRef.id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
    false,
  );
};

export const updateDoc = async (
  docRef: DocReference,
  updates: Record<string, unknown>,
): Promise<void> => {
  await apiRequest(
    `/data/${encodeURIComponent(docRef.collection)}/${encodeURIComponent(docRef.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    },
    false,
  );
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
  callback(getStoredSession()?.user || null);
  authListeners.add(callback);

  return () => {
    authListeners.delete(callback);
  };
};

export const signOut = async (_auth: typeof auth) => {
  writeSession(null);
  notifyAuthListeners(null);
};

export const getValidatedSessionUser = async (): Promise<LocalAuthUser | null> => {
  const session = getStoredSession();
  if (!session?.token) {
    return null;
  }

  try {
    const response = await fetch(`${resolveApiBaseUrl()}/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      writeSession(null);
      return null;
    }

    const payload = (await response.json()) as { user?: LocalAuthUser };
    if (!payload?.user?.uid) {
      writeSession(null);
      return null;
    }

    writeSession(
      { token: session.token, user: payload.user },
      getSessionPersistence(),
    );

    return payload.user;
  } catch {
    return session.user || null;
  }
};

export const ensureDemoAccountsSeeded = async () => {
  if (!isBrowser()) {
    return;
  }

  try {
    await apiRequest('/auth/seed-demo', { method: 'POST' }, false);
  } catch {
    // Non-blocking by design to keep app usable when seed endpoint is unavailable.
  }
};

export const createAuthAccount = async (payload: {
  email: string;
  password: string;
  displayName: string;
  photoURL?: string;
}): Promise<LocalAuthUser> => {
  const response = await apiRequest<{ token: string; user: LocalAuthUser }>(
    '/auth/signup',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    false,
  );

  writeSession({ token: response.token, user: response.user }, 'local');
  notifyAuthListeners(response.user);
  return response.user;
};

export const createAuthAccountByAdmin = async (payload: {
  email: string;
  password: string;
  displayName: string;
  photoURL?: string;
  role?: 'admin' | 'user' | 'vip' | 'vip_plus';
}): Promise<LocalAuthUser | null> => {
  try {
    const response = await apiRequest<{ user: LocalAuthUser }>(
      '/auth/admin-create',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      true,
    );
    return response.user;
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('existe deja')) {
      return null;
    }
    throw error;
  }
};

export const signInWithEmail = async (
  email: string,
  password: string,
  rememberMe = false,
): Promise<LocalAuthUser> => {
  const response = await apiRequest<{ token: string; user: LocalAuthUser }>(
    '/auth/signin',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    false,
  );

  writeSession({ token: response.token, user: response.user }, rememberMe ? 'local' : 'session');
  notifyAuthListeners(response.user);

  return response.user;
};

export const beginGoogleSignIn = (rememberMe = true, nextPath = '/dashboard') => {
  if (!isBrowser()) {
    return;
  }

  const params = new URLSearchParams({
    remember: rememberMe ? '1' : '0',
    next: nextPath,
  });

  window.location.assign(`${resolveApiBaseUrl()}/auth/google/start?${params.toString()}`);
};

export const beginGoogleConnect = async (nextPath = '/dashboard?tab=profile') => {
  const response = await apiRequest<{ url: string }>(
    '/auth/google/connect-start',
    {
      method: 'POST',
      body: JSON.stringify({ next: nextPath }),
    },
    true,
  );

  if (isBrowser() && response?.url) {
    window.location.assign(response.url);
  }
};

export const disconnectGoogleAccount = async (newPassword?: string): Promise<LocalAuthUser> => {
  const normalizedNewPassword = typeof newPassword === 'string' ? newPassword : '';

  const response = await apiRequest<{ token: string; user: LocalAuthUser }>(
    '/auth/google/disconnect',
    normalizedNewPassword
      ? {
          method: 'POST',
          body: JSON.stringify({ newPassword: normalizedNewPassword }),
        }
      : {
          method: 'POST',
        },
    true,
  );

  writeSession(
    { token: response.token, user: response.user },
    getSessionPersistence(),
  );
  notifyAuthListeners(response.user);

  return response.user;
};

export const signInWithOAuthToken = async (
  token: string,
  rememberMe = true,
): Promise<LocalAuthUser> => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw new Error('OAuth token is missing.');
  }

  const response = await fetch(`${resolveApiBaseUrl()}/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${normalizedToken}`,
    },
  });

  if (!response.ok) {
    const message = await resolveMessage(response);
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  const payload = (await response.json()) as { user?: LocalAuthUser };
  if (!payload?.user?.uid) {
    throw new Error('OAuth session payload is invalid.');
  }

  writeSession(
    { token: normalizedToken, user: payload.user },
    rememberMe ? 'local' : 'session',
  );
  notifyAuthListeners(payload.user);

  return payload.user;
};

export const updateAuthDisplayName = async (uid: string, displayName: string) => {
  const response = await apiRequest<{ user: LocalAuthUser }>(
    '/auth/profile',
    {
      method: 'PATCH',
      body: JSON.stringify({ uid, displayName }),
    },
    true,
  );

  const session = getStoredSession();
  if (session && session.user.uid === uid) {
    const nextSession = {
      ...session,
      user: {
        ...session.user,
        displayName: response.user.displayName,
      },
    };
    writeSession(nextSession);
    notifyAuthListeners(nextSession.user);
  }
};

export const updateAuthPhotoURL = async (uid: string, photoURL: string) => {
  const response = await apiRequest<{ user: LocalAuthUser }>(
    '/auth/profile',
    {
      method: 'PATCH',
      body: JSON.stringify({ uid, photoURL }),
    },
    true,
  );

  const session = getStoredSession();
  if (session && session.user.uid === uid) {
    const nextSession = {
      ...session,
      user: {
        ...session.user,
        photoURL: response.user.photoURL,
      },
    };
    writeSession(nextSession);
    notifyAuthListeners(nextSession.user);
  }
};

export const updateAuthPassword = async (
  uid: string,
  currentPassword: string,
  newPassword: string,
) => {
  await apiRequest(
    '/auth/change-password',
    {
      method: 'POST',
      body: JSON.stringify({ uid, currentPassword, newPassword }),
    },
    true,
  );
};

export const deleteAuthAccountByUid = async (uid: string) => {
  const response = await apiRequest<{ deleted: boolean }>(
    `/auth/users/${encodeURIComponent(uid)}`,
    { method: 'DELETE' },
    true,
  );

  const session = getStoredSession();
  if (response.deleted && session?.user.uid === uid) {
    writeSession(null);
    notifyAuthListeners(null);
  }

  return Boolean(response.deleted);
};

export const uploadCloudinaryAsset = async (
  file: File,
  options: {
    resourceType?: 'image' | 'video';
    folder?: string;
    fileName?: string;
    onProgress?: (percentage: number) => void;
  } = {},
): Promise<{
  secureUrl: string;
  publicId: string;
  resourceType?: 'image' | 'video';
  isMultipart?: boolean;
  totalParts?: number;
  parts?: Array<{ publicId: string; secureUrl: string; duration?: number; fileSize?: number }>;
}> => {
  const formData = new FormData();
  formData.append('file', file);

  const resourceType = options.resourceType === 'video' ? 'video' : 'image';
  const folder = options.folder || 'orl-platform';

  const params = new URLSearchParams({
    resourceType,
    folder,
  });

  const explicitFileName = String(options.fileName || '').trim();
  if (explicitFileName) {
    params.set('fileName', explicitFileName);
  }

  const token = getAuthToken();
  if (!token) {
    throw new Error('Authentication required.');
  }

  if (!isBrowser() || typeof XMLHttpRequest === 'undefined') {
    return apiRequest<{
      secureUrl: string;
      publicId: string;
      resourceType?: 'image' | 'video';
      isMultipart?: boolean;
      totalParts?: number;
      parts?: Array<{ publicId: string; secureUrl: string; duration?: number; fileSize?: number }>;
    }>(
      `/uploads/cloudinary?${params.toString()}`,
      {
        method: 'POST',
        body: formData,
      },
      true,
    );
  }

  return new Promise((resolve, reject) => {
    const apiBaseUrl = resolveApiBaseUrl();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBaseUrl}/uploads/cloudinary?${params.toString()}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (options.onProgress) {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }
        const percentage = Math.min(100, Math.round((event.loaded / event.total) * 100));
        options.onProgress?.(percentage);
      };
    }

    xhr.onload = () => {
      let payload: Record<string, any> = {};
      try {
        payload = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, any>) : {};
      } catch {
        payload = {};
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        const secureUrl = String(payload.secureUrl || '');
        const publicId = String(payload.publicId || '');
        if (!secureUrl || !publicId) {
          reject(new Error('Upload completed but response is invalid.'));
          return;
        }
        resolve({
          secureUrl,
          publicId,
          resourceType: payload.resourceType === 'video' ? 'video' : 'image',
          isMultipart: Boolean(payload.isMultipart),
          totalParts: Number(payload.totalParts || 0) || undefined,
          parts: Array.isArray(payload.parts)
            ? payload.parts
                .map((part) => ({
                  publicId: String(part?.publicId || ''),
                  secureUrl: String(part?.secureUrl || ''),
                  duration: Number(part?.duration || 0) || undefined,
                  fileSize: Number(part?.fileSize || 0) || undefined,
                }))
                .filter((part) => part.publicId && part.secureUrl)
            : undefined,
        });
        return;
      }

      const message = String(payload.message || payload.error || xhr.statusText || 'Upload failed.');
      const code = String(payload.code || '').trim() || undefined;
      reject(createApiHttpError(xhr.status, message, code));
    };

    xhr.onerror = () => {
      reject(new Error(`Network error during upload to API (${apiBaseUrl}).`));
    };

    xhr.send(formData);
  });
};

export const uploadAvatarImage = async (
  file: File,
): Promise<{ secureUrl: string; publicId: string }> => {
  const formData = new FormData();
  formData.append('file', file);

  return apiRequest<{ secureUrl: string; publicId: string }>(
    '/uploads/avatar',
    {
      method: 'POST',
      body: formData,
    },
    true,
  );
};

export const cleanupCloudinaryAssets = async (
  assets: CloudinaryCleanupAsset[],
): Promise<{
  results: CloudinaryCleanupResult[];
  summary: {
    requested: number;
    deleted: number;
    skippedInUse: number;
    missingPublicId: number;
    notFound: number;
    failed: number;
  };
}> => {
  return apiRequest(
    '/uploads/cleanup',
    {
      method: 'POST',
      body: JSON.stringify({ assets }),
    },
    true,
  );
};

export const cleanupCloudinaryAssetsOnPageExit = (assets: CloudinaryCleanupAsset[]): boolean => {
  if (!isBrowser()) {
    return false;
  }

  const token = getAuthToken();
  if (!token) {
    return false;
  }

  const payload = assets
    .map((entry) => ({
      publicId: String(entry.publicId || '').trim(),
      secureUrl: String(entry.secureUrl || '').trim(),
      resourceType:
        entry.resourceType === 'image' || entry.resourceType === 'video' || entry.resourceType === 'raw'
          ? entry.resourceType
          : undefined,
    }))
    .filter((entry) => entry.publicId || entry.secureUrl);

  if (payload.length === 0) {
    return false;
  }

  try {
    const apiBaseUrl = resolveApiBaseUrl();
    void fetch(`${apiBaseUrl}/uploads/cleanup`, {
      method: 'POST',
      keepalive: true,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assets: payload }),
    });
    return true;
  } catch {
    return false;
  }
};
