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

type DataChangeOperation = 'add' | 'set' | 'update' | 'delete';

export type DataChangeEvent = {
  collection: string;
  id?: string;
  operation: DataChangeOperation;
  timestamp: number;
};

export interface LocalAuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  googleConnected?: boolean;
}

export type CloudinaryResourceType = 'image' | 'video' | 'raw';

export type NotificationStorageState = {
  readIds: string[];
  deletedIds: string[];
};

export type NotificationStorageChangeEvent = {
  uid: string;
  state: NotificationStorageState;
  timestamp: number;
};

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

export interface QcmImportRowPayload {
  videoTitle: string;
  qcmNumber?: string;
  question: string;
  qcmType?: string;
  options: string[];
  answers?: boolean[];
  correctOptionIndexes: number[];
  explanation?: string;
  reference?: string;
}

export interface QcmImportResponse {
  imported: number;
  skippedDuplicates: number;
  createdVideos: number;
  invalidRows: Array<{
    rowIndex?: number;
    videoTitle?: string;
    question?: string;
    message: string;
  }>;
  duplicateRows: Array<{
    videoTitle: string;
    question: string;
    qcmNumber?: string;
  }>;
  createdVideoTitles: string[];
}

export interface OpenQuestionImportRowPayload {
  videoTitle: string;
  qrocNumber?: string;
  question: string;
  answer: string;
  reference?: string;
}

export interface OpenQuestionImportResponse {
  imported: number;
  skippedDuplicates: number;
  createdVideos: number;
  invalidRows: Array<{
    rowIndex?: number;
    videoTitle?: string;
    question?: string;
    message: string;
  }>;
  duplicateRows: Array<{
    videoTitle: string;
    question: string;
    qrocNumber?: string;
  }>;
  createdVideoTitles: string[];
}

export interface ClinicalCaseImportRowPayload {
  videoTitle: string;
  caseNumber?: string;
  description?: string;
  imageLinks?: string;
  reference?: string;
  qcmNumber?: string;
  qcmQuestion?: string;
  qcmImageLinks?: string;
  qcmType?: string;
  qcmOptions?: string[];
  qcmCorrectOptionIndexes?: number[];
  qcmExplanation?: string;
  qcmReference?: string;
  openNumber?: string;
  openQuestion?: string;
  openAnswer?: string;
  openImageLinks?: string;
  selectQuestion?: string;
  selectImageLinks?: string;
  selectOptions?: string[];
  selectCorrectOptionIndexes?: number[];
  selectExplanation?: string;
}

export interface ClinicalCaseImportResponse {
  imported: number;
  skippedDuplicates: number;
  createdVideos: number;
  uploadedImages: number;
  invalidRows: Array<{
    rowIndex?: number;
    videoTitle?: string;
    question?: string;
    message: string;
  }>;
  duplicateRows: Array<{
    videoTitle: string;
    title: string;
    caseNumber?: string;
  }>;
  createdVideoTitles: string[];
  imageFailures: Array<{
    link?: string;
    fileId?: string;
    reason: string;
  }>;
}

export interface DiagramImportRowPayload {
  videoTitle: string;
  diagramNumber?: string;
  title?: string;
  reference?: string;
  imageLinks?: string;
  annotations?: string;
}

export interface DiagramImportResponse {
  imported: number;
  skippedDuplicates: number;
  createdVideos: number;
  uploadedImages: number;
  invalidRows: Array<{
    rowIndex?: number;
    videoTitle?: string;
    message: string;
  }>;
  duplicateRows: Array<{
    videoTitle: string;
    title: string;
    diagramNumber?: string;
  }>;
  createdVideoTitles: string[];
  imageFailures: Array<{
    link?: string;
    fileId?: string;
    reason: string;
  }>;
}

const resolveApiBaseUrl = () => {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  if (fromEnv) {
    if (isBrowser()) {
      try {
        const url = new URL(fromEnv);
        const isLoopbackHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

        if (isLoopbackHost) {
          const host = window.location.hostname || 'localhost';
          return `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}${url.pathname}`;
        }
      } catch {
        // If the configured URL is invalid, fall back to it and let requests fail loudly.
      }

      return fromEnv;
    }

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
const DATA_CHANGE_EVENT_NAME = 'dems-data-change-v1';
const DATA_CHANGE_CHANNEL_NAME = 'dems-data-change-channel-v1';
const NOTIFICATION_STORAGE_EVENT_NAME = 'dems-notification-storage-v1';

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

export const emitDataChange = (event: Omit<DataChangeEvent, 'timestamp'>) => {
  if (!isBrowser()) {
    return;
  }

  const payload: DataChangeEvent = {
    ...event,
    timestamp: Date.now(),
  };

  window.dispatchEvent(new CustomEvent<DataChangeEvent>(DATA_CHANGE_EVENT_NAME, { detail: payload }));

  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(DATA_CHANGE_CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  }
};

// ─────────────────────────────────────────────────────────────
// Temps réel : polling des versions backend + SSE fallback
// ─────────────────────────────────────────────────────────────
export type RealtimeVersions = Record<string, { count: number; updatedAt: number } & Record<string, unknown>> & { _hash?: string; _ts?: number };

let realtimePollingActive = false;
let realtimePollingTimer: ReturnType<typeof setInterval> | null = null;
let realtimeEventSource: EventSource | null = null;
let lastRealtimeVersions: RealtimeVersions | null = null;
let realtimePollingIntervalMs = 3000;

export const fetchRealtimeVersions = async (): Promise<RealtimeVersions | null> => {
  try {
    const data = await apiRequest<RealtimeVersions>('/realtime/versions', { method: 'GET' }, false);
    return data;
  } catch {
    return null;
  }
};

const diffAndEmitRealtimeVersions = (prev: RealtimeVersions | null, next: RealtimeVersions | null) => {
  if (!next) return;
  if (!prev) {
    lastRealtimeVersions = next;
    return;
  }
  if (prev._hash && next._hash && prev._hash === next._hash) {
    return;
  }
  // Compare each collection
  const collections = new Set([...Object.keys(prev), ...Object.keys(next)]);
  collections.delete('_hash');
  collections.delete('_ts');
  for (const col of collections) {
    const a = (prev as Record<string, unknown>)[col] as { count?: number; updatedAt?: number } | undefined;
    const b = (next as Record<string, unknown>)[col] as { count?: number; updatedAt?: number } | undefined;
    const aStr = JSON.stringify(a || {});
    const bStr = JSON.stringify(b || {});
    if (aStr !== bStr) {
      // Determine operation: count changed -> add/delete, timestamp changed -> update
      const op: DataChangeOperation = (a?.count ?? 0) !== (b?.count ?? 0) ? ((b?.count ?? 0) > (a?.count ?? 0) ? 'add' : 'delete') : 'update';
      emitDataChange({ collection: col, operation: op });
    }
  }
  lastRealtimeVersions = next;
};

export const startRealtimeSync = (options: { intervalMs?: number; useSSE?: boolean } = {}) => {
  if (!isBrowser() || realtimePollingActive) return () => {};

  realtimePollingActive = true;
  realtimePollingIntervalMs = Math.max(2000, options.intervalMs || 3000);
  const useSSE = options.useSSE !== false;

  let sseConnected = false;

  // Try SSE first if supported
  if (useSSE && typeof window !== 'undefined' && typeof window.EventSource !== 'undefined') {
    try {
      const base = resolveApiBaseUrl();
      const url = `${base}/realtime/stream`;
      const es = new window.EventSource(url);
      realtimeEventSource = es;

      es.onmessage = (event) => {
        try {
          const versions = JSON.parse(event.data) as RealtimeVersions;
          diffAndEmitRealtimeVersions(lastRealtimeVersions, versions);
          if (!sseConnected) sseConnected = true;
        } catch {}
      };
      es.onerror = () => {
        // SSE error -> fallback to polling, close SSE after 2 errors quickly
        // Keep polling as backup anyway
        sseConnected = false;
      };
    } catch {
      // ignore
    }
  }

  const poll = async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      // Pause when tab hidden to save resources, but still check occasionally
      return;
    }
    // If SSE is connected and working, skip polling to reduce load (poll every 2 intervals as heartbeat)
    if (sseConnected && Math.random() > 0.33) {
      return;
    }
    const versions = await fetchRealtimeVersions();
    diffAndEmitRealtimeVersions(lastRealtimeVersions, versions);
  };

  // Initial fetch to prime lastRealtimeVersions
  void (async () => {
    const v = await fetchRealtimeVersions();
    lastRealtimeVersions = v;
  })();

  realtimePollingTimer = setInterval(poll, realtimePollingIntervalMs);

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void poll();
    }
  };
  const handleFocus = () => {
    void poll();
  };
  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleFocus);

  return () => {
    realtimePollingActive = false;
    if (realtimePollingTimer) {
      clearInterval(realtimePollingTimer);
      realtimePollingTimer = null;
    }
    if (realtimeEventSource) {
      try { realtimeEventSource.close(); } catch {}
      realtimeEventSource = null;
    }
    window.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleFocus);
  };
};

export const stopRealtimeSync = () => {
  realtimePollingActive = false;
  if (realtimePollingTimer) {
    clearInterval(realtimePollingTimer);
    realtimePollingTimer = null;
  }
  if (realtimeEventSource) {
    try { realtimeEventSource.close(); } catch {}
    realtimeEventSource = null;
  }
};

const getNotificationStorageKey = (uid: string) => `dems-navbar-notifications-v1-${uid}`;

const normalizeNotificationStorageState = (state: Partial<NotificationStorageState>): NotificationStorageState => {
  const readIds = Array.isArray(state.readIds)
    ? Array.from(new Set(state.readIds.filter((id) => typeof id === 'string' && id.trim().length > 0))).sort()
    : [];
  const deletedIds = Array.isArray(state.deletedIds)
    ? Array.from(new Set(state.deletedIds.filter((id) => typeof id === 'string' && id.trim().length > 0))).sort()
    : [];

  return { readIds, deletedIds };
};

const areNotificationStorageStatesEqual = (left: NotificationStorageState, right: NotificationStorageState) => {
  if (left.readIds.length !== right.readIds.length || left.deletedIds.length !== right.deletedIds.length) {
    return false;
  }

  return (
    left.readIds.every((id, index) => id === right.readIds[index]) &&
    left.deletedIds.every((id, index) => id === right.deletedIds[index])
  );
};

export const loadNotificationStorageState = (uid: string): NotificationStorageState => {
  if (!isBrowser()) {
    return { readIds: [], deletedIds: [] };
  }

  try {
    const raw = window.localStorage.getItem(getNotificationStorageKey(uid));
    if (!raw) {
      return { readIds: [], deletedIds: [] };
    }

    const parsed = JSON.parse(raw) as Partial<NotificationStorageState>;
    return normalizeNotificationStorageState(parsed);
  } catch {
    return { readIds: [], deletedIds: [] };
  }
};

export const saveNotificationStorageState = (uid: string, nextState: NotificationStorageState) => {
  if (!isBrowser()) {
    return;
  }

  const normalizedNextState = normalizeNotificationStorageState(nextState);
  const currentState = loadNotificationStorageState(uid);

  if (areNotificationStorageStatesEqual(currentState, normalizedNextState)) {
    return;
  }

  window.localStorage.setItem(getNotificationStorageKey(uid), JSON.stringify(normalizedNextState));

  const payload: NotificationStorageChangeEvent = {
    uid,
    state: normalizedNextState,
    timestamp: Date.now(),
  };

  window.dispatchEvent(new CustomEvent<NotificationStorageChangeEvent>(NOTIFICATION_STORAGE_EVENT_NAME, { detail: payload }));
};

export const subscribeToNotificationStorageChanges = (
  listener: (event: NotificationStorageChangeEvent) => void,
) => {
  if (!isBrowser()) {
    return () => {};
  }

  const handleCustomEvent = (event: Event) => {
    const payload = (event as CustomEvent<NotificationStorageChangeEvent>).detail;
    if (payload?.uid) {
      listener(payload);
    }
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (!event.key || !event.key.startsWith('dems-navbar-notifications-v1-')) {
      return;
    }

    const uid = event.key.replace('dems-navbar-notifications-v1-', '');
    if (!uid) {
      return;
    }

    try {
      const parsed = event.newValue ? (JSON.parse(event.newValue) as Partial<NotificationStorageState>) : undefined;
      listener({
        uid,
        state: normalizeNotificationStorageState(parsed || {}),
        timestamp: Date.now(),
      });
    } catch {
      listener({
        uid,
        state: { readIds: [], deletedIds: [] },
        timestamp: Date.now(),
      });
    }
  };

  window.addEventListener(NOTIFICATION_STORAGE_EVENT_NAME, handleCustomEvent as EventListener);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(NOTIFICATION_STORAGE_EVENT_NAME, handleCustomEvent as EventListener);
    window.removeEventListener('storage', handleStorageEvent);
  };
};

export const subscribeToDataChanges = (listener: (event: DataChangeEvent) => void) => {
  if (!isBrowser()) {
    return () => {};
  }

  const handleCustomEvent = (event: Event) => {
    const payload = (event as CustomEvent<DataChangeEvent>).detail;
    if (payload?.collection) {
      listener(payload);
    }
  };

  window.addEventListener(DATA_CHANGE_EVENT_NAME, handleCustomEvent as EventListener);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(DATA_CHANGE_CHANNEL_NAME);
    channel.onmessage = (event) => {
      const payload = event.data as DataChangeEvent | undefined;
      if (payload?.collection) {
        listener(payload);
      }
    };
  }

  return () => {
    window.removeEventListener(DATA_CHANGE_EVENT_NAME, handleCustomEvent as EventListener);
    if (channel) {
      channel.close();
    }
  };
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
  const response = await apiRequest<{ id: string }>(
    `/data/${encodeURIComponent(collectionRef.name)}`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    false,
  );

  emitDataChange({
    collection: collectionRef.name,
    id: response.id,
    operation: 'add',
  });

  return response;
};

export const importQcmsFromRows = async (
  rows: QcmImportRowPayload[],
): Promise<QcmImportResponse> => {
  const response = await apiRequest<QcmImportResponse>(
    '/data/qcms/import',
    {
      method: 'POST',
      body: JSON.stringify({ rows }),
    },
    false,
  );

  emitDataChange({
    collection: 'qcms',
    operation: 'add',
  });
  if (response.createdVideos > 0) {
    emitDataChange({
      collection: 'videos',
      operation: 'add',
    });
  }

  return response;
};

export const importOpenQuestionsFromRows = async (
  rows: OpenQuestionImportRowPayload[],
): Promise<OpenQuestionImportResponse> => {
  const response = await apiRequest<OpenQuestionImportResponse>(
    '/data/openQuestions/import',
    {
      method: 'POST',
      body: JSON.stringify({ rows }),
    },
    false,
  );

  emitDataChange({
    collection: 'openQuestions',
    operation: 'add',
  });
  if (response.createdVideos > 0) {
    emitDataChange({
      collection: 'videos',
      operation: 'add',
    });
  }

  return response;
};

export const importClinicalCasesFromRows = async (
  rows: ClinicalCaseImportRowPayload[],
): Promise<ClinicalCaseImportResponse> => {
  const response = await apiRequest<ClinicalCaseImportResponse>(
    '/data/clinicalCases/import',
    {
      method: 'POST',
      body: JSON.stringify({ rows }),
    },
    false,
  );

  emitDataChange({
    collection: 'clinicalCases',
    operation: 'add',
  });
  if (response.createdVideos > 0) {
    emitDataChange({
      collection: 'videos',
      operation: 'add',
    });
  }

  return response;
};

export const importDiagramsFromRows = async (
  rows: DiagramImportRowPayload[],
): Promise<DiagramImportResponse> => {
  const response = await apiRequest<DiagramImportResponse>(
    '/data/diagrams/import',
    {
      method: 'POST',
      body: JSON.stringify({ rows }),
    },
    false,
  );

  emitDataChange({
    collection: 'diagrams',
    operation: 'add',
  });
  if (response.createdVideos > 0) {
    emitDataChange({
      collection: 'videos',
      operation: 'add',
    });
  }

  return response;
};

export const deleteDoc = async (docRef: DocReference): Promise<void> => {
  await apiRequest(
    `/data/${encodeURIComponent(docRef.collection)}/${encodeURIComponent(docRef.id)}`,
    { method: 'DELETE' },
    false,
  );

  emitDataChange({
    collection: docRef.collection,
    id: docRef.id,
    operation: 'delete',
  });
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

  emitDataChange({
    collection: docRef.collection,
    id: docRef.id,
    operation: 'set',
  });
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

  emitDataChange({
    collection: docRef.collection,
    id: docRef.id,
    operation: 'update',
  });
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

export const requestPasswordReset = async (email: string) => {
  const response = await apiRequest<{ ok: boolean; message: string; resetUrl?: string; emailSent?: boolean }>(
    '/auth/forgot-password',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
    false,
  );

  return response;
};

export const resetPasswordWithToken = async (token: string, newPassword: string) => {
  const response = await apiRequest<{ ok: boolean; message: string }>(
    '/auth/reset-password',
    {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    },
    false,
  );

  return response;
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

// ─────────────────────────────────────────────────────────────
// Helpers organisation Cloudinary — nouvelle structure
//   Vidéos          : orl-platform/videos/<speciality>/<nom-video>/
//   Cas cliniques   : orl-platform/videos/<speciality>/<nom-video>/cas-images/
//   Questions cas   : orl-platform/videos/<speciality>/<nom-video>/cas-question-images/
//   Avatars         : orl-platform/avatars/<name-user>/
//   Support chat    : orl-platform/support-chat/<name-user>/
//   Schémas         : orl-platform/diagrams/<speciality>/<nom-video>/
// ─────────────────────────────────────────────────────────────
const sanitizeCloudinaryFolderSegment = (value: string, fallback = ''): string => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const truncated = normalized.slice(0, 80).replace(/-+$/g, '');
  return truncated || fallback;
};

const sanitizeCloudinaryFolderPath = (folder: string, fallback = 'orl-platform'): string => {
  const raw = String(folder || '').trim();
  if (!raw) return fallback;
  const parts = raw
    .split('/')
    .map((seg) => sanitizeCloudinaryFolderSegment(seg, ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join('/') : fallback;
};

const resolveSpecialtySlug = (specialty?: string) => sanitizeCloudinaryFolderSegment(specialty || '', '');
const resolveVideoSlug = (videoSlug?: string, videoTitle?: string) =>
  sanitizeCloudinaryFolderSegment(videoSlug || '', '') ||
  sanitizeCloudinaryFolderSegment(videoTitle || '', '');

const resolveUserSlug = (userName?: string, userId?: string, fallback = 'user') => {
  const fromName = sanitizeCloudinaryFolderSegment(userName || '', '');
  if (fromName) return fromName;
  const fromId = sanitizeCloudinaryFolderSegment(userId || '', '');
  if (fromId) return fromId;
  return fallback;
};

export const buildCloudinaryVideoFolder = (options: {
  specialty?: string;
  videoTitle?: string;
  videoSlug?: string;
  baseFolder?: string;
}): string => {
  const base = sanitizeCloudinaryFolderSegment(options.baseFolder || 'orl-platform', 'orl-platform');
  const specialtySlug = resolveSpecialtySlug(options.specialty);
  const videoSlugResolved = resolveVideoSlug(options.videoSlug, options.videoTitle);
  const segments = [base, 'videos'];
  if (specialtySlug) segments.push(specialtySlug);
  if (videoSlugResolved) segments.push(videoSlugResolved);
  return segments.join('/');
};

export const buildCloudinaryCaseImagesFolder = (options: {
  specialty?: string;
  videoTitle?: string;
  videoSlug?: string;
  baseFolder?: string;
}): string => {
  const videoFolder = buildCloudinaryVideoFolder(options as any);
  return `${videoFolder}/cas-images`;
};

export const buildCloudinaryCaseQuestionImagesFolder = (options: {
  specialty?: string;
  videoTitle?: string;
  videoSlug?: string;
  baseFolder?: string;
}): string => {
  const videoFolder = buildCloudinaryVideoFolder(options as any);
  return `${videoFolder}/cas-question-images`;
};

export const buildCloudinaryDiagramFolder = (options: {
  specialty?: string;
  videoTitle?: string;
  videoSlug?: string;
  baseFolder?: string;
}): string => {
  const base = sanitizeCloudinaryFolderSegment(options.baseFolder || 'orl-platform', 'orl-platform');
  const specialtySlug = resolveSpecialtySlug(options.specialty);
  const videoSlugResolved = resolveVideoSlug(options.videoSlug, options.videoTitle);
  const segments = [base, 'diagrams'];
  if (specialtySlug) segments.push(specialtySlug);
  if (videoSlugResolved) segments.push(videoSlugResolved);
  return segments.join('/');
};

export const buildCloudinaryAvatarFolder = (options: {
  userName?: string;
  userId?: string;
  baseFolder?: string;
}): string => {
  const base = sanitizeCloudinaryFolderSegment(options.baseFolder || 'orl-platform', 'orl-platform');
  const userSlug = resolveUserSlug(options.userName, options.userId, 'user');
  return `${base}/avatars/${userSlug}`;
};

export const buildCloudinarySupportChatFolder = (options: {
  userName?: string;
  userId?: string;
  baseFolder?: string;
}): string => {
  const base = sanitizeCloudinaryFolderSegment(options.baseFolder || 'orl-platform', 'orl-platform');
  const userSlug = resolveUserSlug(options.userName, options.userId, 'user');
  return `${base}/support-chat/${userSlug}`;
};

export const buildCloudinaryOrganizedFolder = (options: {
  specialty?: string;
  videoTitle?: string;
  videoSlug?: string;
  subFolder?: string;
  baseFolder?: string;
}): string => {
  const normalizedSub = String(options.subFolder || '').trim().toLowerCase();
  const base = sanitizeCloudinaryFolderSegment(options.baseFolder || 'orl-platform', 'orl-platform');

  if (normalizedSub === 'diagrams' || normalizedSub === 'diagram' || normalizedSub.includes('diagram')) {
    return buildCloudinaryDiagramFolder({
      specialty: options.specialty,
      videoTitle: options.videoTitle,
      videoSlug: options.videoSlug,
      baseFolder: base,
    });
  }
  if (normalizedSub === 'avatars' || normalizedSub.includes('avatar')) {
    return `${base}/avatars`;
  }
  if (normalizedSub === 'support-chat' || normalizedSub.includes('support')) {
    return `${base}/support-chat`;
  }

  let suffix = '';
  if (
    normalizedSub === 'cas-images' ||
    normalizedSub === 'cases' ||
    normalizedSub === 'case' ||
    normalizedSub.includes('cas-images')
  ) {
    suffix = 'cas-images';
  } else if (
    normalizedSub === 'cas-question-images' ||
    normalizedSub === 'cases/questions' ||
    normalizedSub === 'case-question' ||
    normalizedSub.includes('cas-question')
  ) {
    suffix = 'cas-question-images';
  } else if (normalizedSub) {
    const customParts = String(options.subFolder || '')
      .split('/')
      .map((seg) => sanitizeCloudinaryFolderSegment(seg, ''))
      .filter(Boolean);
    if (customParts.length > 0) suffix = customParts.join('/');
  }

  const videoFolder = buildCloudinaryVideoFolder({
    specialty: options.specialty,
    videoTitle: options.videoTitle,
    videoSlug: options.videoSlug,
    baseFolder: base,
  });
  if (suffix) return `${videoFolder}/${suffix}`;
  return videoFolder;
};

export const resolveCloudinaryFolder = (options: {
  folder?: string;
  specialty?: string;
  videoTitle?: string;
  videoSlug?: string;
  subFolder?: string;
}): string => {
  const hasHints = Boolean(
    String(options.specialty || '').trim() ||
      String(options.videoTitle || '').trim() ||
      String(options.videoSlug || '').trim() ||
      String(options.subFolder || '').trim(),
  );
  if (hasHints) {
    return buildCloudinaryOrganizedFolder(options);
  }
  return sanitizeCloudinaryFolderPath(options.folder || 'orl-platform', 'orl-platform');
};

export const uploadCloudinaryAsset = async (
  file: File,
  options: {
    resourceType?: 'image' | 'video' | 'raw';
    folder?: string;
    fileName?: string;
    purpose?: 'support-chat';
    specialty?: string;
    videoTitle?: string;
    videoSlug?: string;
    subFolder?: string;
    userName?: string;
    userId?: string;
    onProgress?: (percentage: number) => void;
  } = {},
): Promise<{
  secureUrl: string;
  publicId: string;
  resourceType?: 'image' | 'video' | 'raw';
  isMultipart?: boolean;
  totalParts?: number;
  parts?: Array<{ publicId: string; secureUrl: string; duration?: number; fileSize?: number }>;
}> => {
  const formData = new FormData();
  formData.append('file', file);

  const resourceType = options.resourceType === 'video' || options.resourceType === 'raw'
    ? options.resourceType
    : 'image';

  // Construction du dossier selon nouvelle arborescence
  let folder: string;
  if (options.purpose === 'support-chat') {
    // orl-platform/support-chat/<name-user>/
    folder = buildCloudinarySupportChatFolder({
      userName: options.userName,
      userId: options.userId,
    });
  } else {
    const hasOrganizedHints = Boolean(
      String(options.specialty || '').trim() ||
        String(options.videoTitle || '').trim() ||
        String(options.videoSlug || '').trim() ||
        String(options.subFolder || '').trim(),
    );
    folder = hasOrganizedHints
      ? buildCloudinaryOrganizedFolder({
          specialty: options.specialty,
          videoTitle: options.videoTitle,
          videoSlug: options.videoSlug,
          subFolder: options.subFolder,
          baseFolder: 'orl-platform',
        })
      : sanitizeCloudinaryFolderPath(options.folder || 'orl-platform', 'orl-platform');
  }

  const params = new URLSearchParams({
    resourceType,
    folder,
  });

  // Transmet aussi les hints au backend pour double-vérification / reconstruction serveur
  if (options.specialty) params.set('specialty', String(options.specialty));
  if (options.videoTitle) params.set('videoTitle', String(options.videoTitle));
  if (options.videoSlug) params.set('videoSlug', String(options.videoSlug));
  if (options.subFolder) params.set('subFolder', String(options.subFolder));
  if (options.userName) params.set('userName', String(options.userName));
  if (options.userId) params.set('userId', String(options.userId));

  const explicitFileName = String(options.fileName || '').trim();
  if (explicitFileName) {
    params.set('fileName', explicitFileName);
  }

  if (options.purpose) {
    params.set('purpose', options.purpose);
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
          resourceType: payload.resourceType === 'video' || payload.resourceType === 'raw'
            ? payload.resourceType
            : 'image',
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

export const deleteCloudinaryAsset = async (
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' = 'image'
): Promise<boolean> => {
  try {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Authentication required.');
    }

    const params = new URLSearchParams({
      publicId,
      resourceType,
    });

    await apiRequest<{ deleted: boolean }>(
      `/uploads/cloudinary?${params.toString()}`,
      {
        method: 'DELETE',
      },
      true,
    );
    return true;
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────────────────────
// Chargily Pay – paiement en ligne (EDAHABIA / CIB)
// Backend: POST /api/payments/create-checkout → { checkoutUrl, checkoutId }
//         GET  /api/payments/verify/:checkoutId
// ─────────────────────────────────────────────────────────────
export interface ChargilyCreateCheckoutPayload {
  amount: number;
  currency?: 'dzd';
  type: 'cart' | 'pack' | 'video' | 'subscription';
  targetId?: string;
  plan?: 'monthly' | 'yearly' | string;
  locale?: 'ar' | 'en' | 'fr';
  paymentMethod?: 'edahabia' | 'cib' | string;
  description?: string;
  items?: Array<{ id: string; type: string; title?: string; price?: number }>;
}

export interface ChargilyCreateCheckoutResponse {
  checkoutUrl: string;
  checkoutId: string;
  paymentId: string;
  amount: number;
  currency: string;
}

export const createChargilyCheckout = async (
  payload: ChargilyCreateCheckoutPayload,
): Promise<ChargilyCreateCheckoutResponse> => {
  return apiRequest<ChargilyCreateCheckoutResponse>(
    '/payments/create-checkout',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true,
  );
};

export const verifyChargilyCheckout = async (
  checkoutId: string,
): Promise<{ payment?: Record<string, unknown>; checkout?: Record<string, unknown>; status?: string; chargilyStatus?: string }> => {
  return apiRequest(
    `/payments/verify/${encodeURIComponent(checkoutId)}`,
    { method: 'GET' },
    true,
  );
};
