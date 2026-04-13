'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Video, FileText, HelpCircle, Image as ImageIcon, MessageSquare, Plus, Save, X, Loader2, Trash2, Edit2, Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  db,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  uploadCloudinaryAsset,
  cleanupCloudinaryAssets,
  cleanupCloudinaryAssetsOnPageExit,
  type CloudinaryCleanupAsset,
  type CloudinaryResourceType,
} from '@/lib/data/local-data';
import SeamlessPlayer from '@/components/features/video/seamless-player';
import type {
  CaseQuestionModel,
  ClinicalCaseModel,
  DiagramMarkerModel,
  DiagramModel,
  OpenQuestionModel,
  QcmModel,
  QcmMode,
  VideoPartModel,
  VideoModel,
} from '@/lib/domain/models';

type EditableCaseQuestion = {
  id: string;
  kind: 'qcm' | 'select' | 'open';
  prompt: string;
  images?: string[];
  options?: string[];
  correctOptionIndex?: number;
  correctOptionIndexes?: number[];
  qcmMode?: QcmMode;
  explanation?: string;
  answer?: string;
};

interface VideoFormData {
  title: string;
  description: string;
  url: string;
  subspecialty: string;
  section: string;
  isFreeDemo: boolean;
  price: number;
  isMultipart?: boolean;
  totalParts?: number;
  parts?: VideoPartModel[];
}

interface QcmFormData {
  videoId: string;
  question: string;
  options: string[];
  mode: QcmMode;
  correctOptionIndexes: number[];
  explanation: string;
  reference: string;
}

interface OpenQuestionFormData {
  videoId: string;
  question: string;
  answer: string;
  reference: string;
}

interface ClinicalCaseFormData {
  videoId: string;
  title: string;
  description: string;
  patientHistory: string;
  clinicalExamination: string;
  additionalTests: string;
  diagnosis: string;
  treatment: string;
  discussion: string;
  images: string[];
  reference: string;
  questions: EditableCaseQuestion[];
}

interface DiagramFormData {
  videoId: string;
  title: string;
  imageUrl: string;
  markers: DiagramMarkerModel[];
}

type PreviewSource = {
  secureUrl: string;
  duration?: number;
};

type VideoUploadPhase = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

const CLOUDINARY_LIMIT = 100 * 1024 * 1024; // 100MB
const BACKEND_UPLOAD_LIMIT = 1024 * 1024 * 1024; // 1GB
const UPLOAD_FOLDER = 'orl-platform';

const cleanupAssetKey = (asset: CloudinaryCleanupAsset) => {
  const publicId = String(asset.publicId || '').trim();
  const secureUrl = String(asset.secureUrl || '').trim();
  const resourceType = String(asset.resourceType || '').trim().toLowerCase();
  return `${publicId}|${secureUrl}|${resourceType}`;
};

const normalizeCleanupAsset = (asset: CloudinaryCleanupAsset): CloudinaryCleanupAsset | null => {
  const publicId = String(asset.publicId || '').trim();
  const secureUrl = String(asset.secureUrl || '').trim();
  const resourceTypeRaw = String(asset.resourceType || '').trim().toLowerCase();
  const resourceType: CloudinaryResourceType | undefined =
    resourceTypeRaw === 'image' || resourceTypeRaw === 'video' || resourceTypeRaw === 'raw'
      ? (resourceTypeRaw as CloudinaryResourceType)
      : undefined;

  if (!publicId && !secureUrl) {
    return null;
  }

  return {
    publicId,
    secureUrl,
    resourceType,
  };
};

const dedupeCleanupAssets = (assets: CloudinaryCleanupAsset[]): CloudinaryCleanupAsset[] => {
  const seen = new Set<string>();
  const output: CloudinaryCleanupAsset[] = [];

  for (const entry of assets) {
    const normalized = normalizeCleanupAsset(entry);
    if (!normalized) {
      continue;
    }

    const key = cleanupAssetKey(normalized);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(normalized);
  }

  return output;
};

const filterOutCleanupAssets = (
  source: CloudinaryCleanupAsset[],
  toRemove: CloudinaryCleanupAsset[],
) => {
  const removeKeys = new Set(dedupeCleanupAssets(toRemove).map(cleanupAssetKey));
  if (removeKeys.size === 0) {
    return dedupeCleanupAssets(source);
  }

  return dedupeCleanupAssets(source).filter((entry) => !removeKeys.has(cleanupAssetKey(entry)));
};

const inferResourceTypeFromCloudinaryUrl = (url: string): CloudinaryResourceType | undefined => {
  const normalized = String(url || '').toLowerCase();
  if (normalized.includes('/video/upload/')) {
    return 'video';
  }
  if (normalized.includes('/image/upload/')) {
    return 'image';
  }
  if (normalized.includes('/raw/upload/')) {
    return 'raw';
  }
  return undefined;
};

const toCleanupAssetFromUrl = (
  secureUrl: string | undefined,
  resourceTypeHint?: CloudinaryResourceType,
): CloudinaryCleanupAsset | null => {
  const normalizedUrl = String(secureUrl || '').trim();
  if (!normalizedUrl) {
    return null;
  }

  return {
    secureUrl: normalizedUrl,
    resourceType: resourceTypeHint || inferResourceTypeFromCloudinaryUrl(normalizedUrl),
  };
};

const collectVideoAssets = (video: {
  url?: string;
  parts?: VideoPartModel[];
}): CloudinaryCleanupAsset[] => {
  const assets: CloudinaryCleanupAsset[] = [];

  if (Array.isArray(video.parts)) {
    for (const part of video.parts) {
      assets.push({
        publicId: String(part?.publicId || '').trim(),
        secureUrl: String(part?.secureUrl || '').trim(),
        resourceType: 'video',
      });
    }
  }

  const fromUrl = toCleanupAssetFromUrl(video.url, 'video');
  if (fromUrl) {
    assets.push(fromUrl);
  }

  return dedupeCleanupAssets(assets);
};

const collectCaseAssets = (entry: {
  images?: string[];
  questions?: Array<{ images?: string[] }>;
}): CloudinaryCleanupAsset[] => {
  const assets: CloudinaryCleanupAsset[] = [];

  if (Array.isArray(entry.images)) {
    for (const imageUrl of entry.images) {
      const asset = toCleanupAssetFromUrl(imageUrl, 'image');
      if (asset) {
        assets.push(asset);
      }
    }
  }

  if (Array.isArray(entry.questions)) {
    for (const question of entry.questions) {
      if (!Array.isArray(question?.images)) {
        continue;
      }

      for (const imageUrl of question.images) {
        const asset = toCleanupAssetFromUrl(imageUrl, 'image');
        if (asset) {
          assets.push(asset);
        }
      }
    }
  }

  return dedupeCleanupAssets(assets);
};

const collectDiagramAssets = (entry: { imageUrl?: string }): CloudinaryCleanupAsset[] => {
  const asset = toCleanupAssetFromUrl(entry.imageUrl, 'image');
  return asset ? [asset] : [];
};

const subtractCleanupAssets = (
  source: CloudinaryCleanupAsset[],
  toKeep: CloudinaryCleanupAsset[],
) => {
  const keepKeys = new Set(dedupeCleanupAssets(toKeep).map(cleanupAssetKey));
  return dedupeCleanupAssets(source).filter((entry) => !keepKeys.has(cleanupAssetKey(entry)));
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const createCaseQuestionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `q-${crypto.randomUUID()}`;
  }
  return `q-${Date.now()}`;
};

const getSaveErrorMessage = (entityLabel: string, error: unknown) => {
  const details = getErrorMessage(error, 'Cause inconnue');
  return `Echec d'enregistrement ${entityLabel}. Verifiez les champs obligatoires puis reessayez. (${details})`;
};

const formatDisplayLabel = (value?: string) => {
  const normalized = value?.trim();
  if (!normalized) return 'N/A';
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
};

const markdownPreviewClassName = [
  'text-xs leading-relaxed text-[var(--app-muted)]',
  '[&_p]:mb-1',
  '[&_p:last-child]:mb-0',
  '[&_ul]:my-1',
  '[&_ul]:list-disc',
  '[&_ul]:pl-4',
  '[&_ul]:space-y-1',
  '[&_ol]:my-1',
  '[&_ol]:list-decimal',
  '[&_ol]:pl-4',
  '[&_ol]:space-y-1',
  '[&_li]:leading-relaxed',
  '[&_strong]:font-semibold',
  '[&_strong]:text-[var(--app-text)]',
  '[&_em]:italic',
].join(' ');

const MarkdownPreview = ({
  content,
  emptyMessage,
  maxHeightClass = 'max-h-24',
}: {
  content?: string;
  emptyMessage?: string;
  maxHeightClass?: string;
}) => {
  const normalized = content?.trim();
  if (!normalized) {
    return emptyMessage ? <p className="text-xs text-[var(--app-muted)]">{emptyMessage}</p> : null;
  }

  return (
    <div className={`${maxHeightClass} overflow-y-auto content-manager-scroll pr-1`}>
      <div className={markdownPreviewClassName}>
        <ReactMarkdown>{normalized}</ReactMarkdown>
      </div>
    </div>
  );
};

const logAdminAction = (action: 'create' | 'update' | 'delete', entity: string, payload: Record<string, unknown>) => {
  console.info('[admin-action]', {
    action,
    entity,
    at: new Date().toISOString(),
    ...payload,
  });
};

export function AdminContentManager() {
  const [activeTab, setActiveTab] = useState<'video' | 'qcm' | 'case' | 'openQuestion' | 'diagram'>('video');
  const [videoViewMode, setVideoViewMode] = useState<'editor' | 'byVideo'>('editor');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [contentSearch, setContentSearch] = useState('');
  
  const [videos, setVideos] = useState<VideoModel[]>([]);
  const [qcms, setQcms] = useState<QcmModel[]>([]);
  const [cases, setCases] = useState<ClinicalCaseModel[]>([]);
  const [openQuestions, setOpenQuestions] = useState<OpenQuestionModel[]>([]);
  const [diagrams, setDiagrams] = useState<DiagramModel[]>([]);

  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editingQcmId, setEditingQcmId] = useState<string | null>(null);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editingOpenQuestionId, setEditingOpenQuestionId] = useState<string | null>(null);
  const [editingDiagramId, setEditingDiagramId] = useState<string | null>(null);

  const [pendingVideoUploads, setPendingVideoUploads] = useState<CloudinaryCleanupAsset[]>([]);
  const [pendingCaseUploads, setPendingCaseUploads] = useState<CloudinaryCleanupAsset[]>([]);
  const [pendingDiagramUploads, setPendingDiagramUploads] = useState<CloudinaryCleanupAsset[]>([]);

  const editorGridClass = 'grid gap-6';
  const formPanelClass = 'order-2 space-y-6 rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm';
  const listPanelClass = 'order-1 rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-5 shadow-sm max-h-[58vh] overflow-y-auto content-manager-scroll';
  const sectionCardClass = 'rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-4 space-y-4';
  const existingItemCardClass = 'rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm';
  const existingItemRowClass = `${existingItemCardClass} flex items-start justify-between gap-3`;
  const listSummaryCardClass = 'rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 shadow-sm';
  const existingItemMetaChipClass = 'inline-flex items-center rounded-full border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-medium text-[var(--app-muted)]';
  const packGridClass = 'grid gap-4 md:grid-cols-2 xl:grid-cols-3';
  const sectionTitleClass = 'text-sm font-semibold text-[var(--app-text)]';
  const sectionHintClass = 'text-xs text-[var(--app-muted)]';

  const fetchData = async () => {
    try {
      const [videosSnap, qcmsSnap, casesSnap, openQuestionsSnap, diagramsSnap] = await Promise.all([
        getDocs(collection(db, 'videos')),
        getDocs(collection(db, 'qcms')),
        getDocs(collection(db, 'clinicalCases')),
        getDocs(collection(db, 'openQuestions')),
        getDocs(collection(db, 'diagrams'))
      ]);
      
      setVideos(videosSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as VideoModel));
      setQcms(qcmsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as QcmModel));
      setCases(casesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClinicalCaseModel));
      setOpenQuestions(openQuestionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as OpenQuestionModel));
      setDiagrams(diagramsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as DiagramModel));
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const runCloudinaryCleanup = useCallback(
    async (
      assets: CloudinaryCleanupAsset[],
      contextLabel: string,
      { silent = true }: { silent?: boolean } = {},
    ) => {
      const payload = dedupeCleanupAssets(assets);
      if (payload.length === 0) {
        return null;
      }

      try {
        const response = await cleanupCloudinaryAssets(payload);
        const hardFailures = response.results.filter(
          (entry) => !entry.deleted && entry.reason !== 'still-referenced' && entry.reason !== 'not found',
        );

        if (hardFailures.length > 0) {
          console.warn(`[cloudinary-cleanup:${contextLabel}]`, hardFailures);
          if (!silent) {
            setErrorMessage(
              `Nettoyage Cloudinary incomplet (${contextLabel}). Certains médias n'ont pas pu être supprimés.`,
            );
          }
        }

        return response;
      } catch (error) {
        console.error(`[cloudinary-cleanup:${contextLabel}]`, error);
        if (!silent) {
          setErrorMessage(
            `Impossible de finaliser le nettoyage Cloudinary (${contextLabel}).`,
          );
        }
        return null;
      }
    },
    [],
  );

  const getPendingDraftAssets = useCallback(() => {
    return dedupeCleanupAssets([
      ...pendingVideoUploads,
      ...pendingCaseUploads,
      ...pendingDiagramUploads,
    ]);
  }, [pendingVideoUploads, pendingCaseUploads, pendingDiagramUploads]);

  useEffect(() => {
    const flushPageExitDrafts = () => {
      const pendingAssets = getPendingDraftAssets();
      if (pendingAssets.length === 0) {
        return;
      }
      cleanupCloudinaryAssetsOnPageExit(pendingAssets);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', flushPageExitDrafts);
      window.addEventListener('pagehide', flushPageExitDrafts);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', flushPageExitDrafts);
        window.removeEventListener('pagehide', flushPageExitDrafts);
      }

      const pendingAssets = getPendingDraftAssets();
      if (pendingAssets.length === 0) {
        return;
      }

      void cleanupCloudinaryAssets(pendingAssets).catch((error) => {
        console.error('[cloudinary-cleanup:admin-unmount]', error);
      });
    };
  }, [getPendingDraftAssets]);

  const isAssetTrackedInPending = useCallback(
    (asset: CloudinaryCleanupAsset, pendingAssets: CloudinaryCleanupAsset[]) => {
      const key = cleanupAssetKey(asset);
      return pendingAssets.some((entry) => cleanupAssetKey(entry) === key);
    },
    [],
  );

  const getCollectionCleanupAssets = useCallback(
    (collectionName: string, id: string): CloudinaryCleanupAsset[] => {
      if (collectionName === 'videos') {
        const item = videos.find((entry) => entry.id === id);
        return item ? collectVideoAssets(item) : [];
      }

      if (collectionName === 'clinicalCases') {
        const item = cases.find((entry) => entry.id === id);
        return item ? collectCaseAssets(item) : [];
      }

      if (collectionName === 'diagrams') {
        const item = diagrams.find((entry) => entry.id === id);
        return item ? collectDiagramAssets(item) : [];
      }

      return [];
    },
    [videos, cases, diagrams],
  );

  const handleDelete = async (collectionName: string, id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet élément ?')) return;

    const cleanupCandidates = getCollectionCleanupAssets(collectionName, id);

    try {
      await deleteDoc(doc(db, collectionName, id));

      if (cleanupCandidates.length > 0) {
        await runCloudinaryCleanup(cleanupCandidates, `delete:${collectionName}`, { silent: true });
      }

      setSuccessMessage('Élément supprimé avec succès.');
      logAdminAction('delete', collectionName, { id });
      fetchData(); // Refresh lists
    } catch (error: unknown) {
      console.error('Error deleting document:', error);
      setErrorMessage(`Echec de suppression (${collectionName}). ${getErrorMessage(error, 'Cause inconnue')}`);
    }
  };

  // Video Form State
  const [videoData, setVideoData] = useState<VideoFormData>({
    title: '',
    description: '',
    url: '',
    subspecialty: 'otologie',
    section: 'anatomie',
    isFreeDemo: false,
    price: 0
  });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [videoUploadPhase, setVideoUploadPhase] = useState<VideoUploadPhase>('idle');
  const [videoUploadFileName, setVideoUploadFileName] = useState('');
  const [videoUploadFileSize, setVideoUploadFileSize] = useState(0);
  const [diagramUploadProgress, setDiagramUploadProgress] = useState(0);
  const [diagramUploadPhase, setDiagramUploadPhase] = useState<VideoUploadPhase>('idle');
  const [diagramUploadFileName, setDiagramUploadFileName] = useState('');
  const [diagramUploadFileSize, setDiagramUploadFileSize] = useState(0);

  const isVideoUploading = videoUploadPhase === 'uploading' || videoUploadPhase === 'processing';
  const isDiagramUploading = diagramUploadPhase === 'uploading' || diagramUploadPhase === 'processing';
  const progressWidthClassByStep: Record<number, string> = {
    0: 'w-0',
    5: 'w-[5%]',
    10: 'w-[10%]',
    15: 'w-[15%]',
    20: 'w-[20%]',
    25: 'w-[25%]',
    30: 'w-[30%]',
    35: 'w-[35%]',
    40: 'w-[40%]',
    45: 'w-[45%]',
    50: 'w-1/2',
    55: 'w-[55%]',
    60: 'w-3/5',
    65: 'w-[65%]',
    70: 'w-[70%]',
    75: 'w-3/4',
    80: 'w-4/5',
    85: 'w-[85%]',
    90: 'w-[90%]',
    95: 'w-[95%]',
    100: 'w-full',
  };
  const clampedVideoUploadProgress = Math.max(0, Math.min(100, Math.round(videoUploadProgress)));
  const normalizedVideoUploadProgressStep = Math.round(clampedVideoUploadProgress / 5) * 5;
  const videoUploadProgressWidthClass = progressWidthClassByStep[normalizedVideoUploadProgressStep] || 'w-0';
  const clampedDiagramUploadProgress = Math.max(0, Math.min(100, Math.round(diagramUploadProgress)));
  const normalizedDiagramUploadProgressStep = Math.round(clampedDiagramUploadProgress / 5) * 5;
  const diagramUploadProgressWidthClass = progressWidthClassByStep[normalizedDiagramUploadProgressStep] || 'w-0';

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) {
      return `${mb.toFixed(1)} MB`;
    }
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const resetVideoUploadState = () => {
    setVideoUploadProgress(0);
    setVideoUploadPhase('idle');
    setVideoUploadFileName('');
    setVideoUploadFileSize(0);
  };

  const resetDiagramUploadState = () => {
    setDiagramUploadProgress(0);
    setDiagramUploadPhase('idle');
    setDiagramUploadFileName('');
    setDiagramUploadFileSize(0);
  };

  const resetVideoFormState = () => {
    setEditingVideoId(null);
    setVideoData({
      title: '',
      description: '',
      url: '',
      subspecialty: 'otologie',
      section: 'anatomie',
      isFreeDemo: false,
      price: 0,
      isMultipart: false,
      totalParts: 1,
      parts: [],
    });
    resetVideoUploadState();
  };

  const discardPendingVideoUploads = useCallback(async () => {
    if (pendingVideoUploads.length === 0) {
      return;
    }

    await runCloudinaryCleanup(pendingVideoUploads, 'video:discard-pending', { silent: true });
    setPendingVideoUploads([]);
  }, [pendingVideoUploads, runCloudinaryCleanup]);

  const resetVideoForm = async () => {
    await discardPendingVideoUploads();
    resetVideoFormState();
  };

  const QCM_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'];
  const getDefaultQcmOptions = () => QCM_OPTION_LABELS.map(() => '');
  const getOptionLabel = (index: number) => {
    if (index < 26) {
      return String.fromCharCode(65 + index);
    }
    return `Option ${index + 1}`;
  };
  const normalizeQcmOptions = (options: unknown): string[] => {
    const fallback = getDefaultQcmOptions();
    if (!Array.isArray(options)) return fallback;

    const normalized = options.map((value) => (typeof value === 'string' ? value : ''));
    return normalized.length > 0 ? normalized : fallback;
  };
  const getDefaultCaseQuestionOptions = () => QCM_OPTION_LABELS.map(() => '');
  const normalizeCaseQuestionOptions = (options: unknown): string[] => {
    const fallback = getDefaultCaseQuestionOptions();
    if (!Array.isArray(options)) return fallback;

    const normalized = options.map((value) => (typeof value === 'string' ? value : ''));
    return normalized.length > 0 ? normalized : fallback;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const input = e.target;

    // The backend now performs chunked single-video upload, but we keep a guardrail here.
    if (file.size > BACKEND_UPLOAD_LIMIT) {
      setErrorMessage('Fichier trop volumineux. La limite actuelle est 1GB par video.');
      input.value = '';
      return;
    }

    setErrorMessage('');
    setVideoUploadFileName(file.name);
    setVideoUploadFileSize(file.size);
    setVideoUploadProgress(3);
    setVideoUploadPhase('uploading');

    const currentFormVideoAssets = collectVideoAssets(videoData);
    const stalePendingAssets = currentFormVideoAssets.filter((asset) =>
      isAssetTrackedInPending(asset, pendingVideoUploads),
    );

    if (stalePendingAssets.length > 0) {
      await runCloudinaryCleanup(stalePendingAssets, 'video:replace-draft', { silent: true });
      setPendingVideoUploads((prev) => filterOutCleanupAssets(prev, stalePendingAssets));
    }

    try {
      const response = await uploadCloudinaryAsset(file, {
        resourceType: 'video',
        folder: `${UPLOAD_FOLDER}/videos`,
        onProgress: (percentage) => {
          if (percentage >= 100) {
            setVideoUploadPhase('processing');
            setVideoUploadProgress((prev) => Math.max(prev, 96));
            return;
          }

          setVideoUploadPhase('uploading');
          setVideoUploadProgress(Math.max(3, Math.min(95, percentage)));
        },
      });

      setVideoUploadPhase('processing');
      setVideoUploadProgress((prev) => Math.max(prev, 98));

      const uploadedVideoAssets = dedupeCleanupAssets([
        {
          publicId: response.publicId,
          secureUrl: response.secureUrl,
          resourceType: 'video',
        },
        ...(Array.isArray(response.parts)
          ? response.parts.map((part) => ({
              publicId: part.publicId,
              secureUrl: part.secureUrl,
              resourceType: 'video' as const,
            }))
          : []),
      ]);

      if (uploadedVideoAssets.length > 0) {
        setPendingVideoUploads((prev) => dedupeCleanupAssets([...prev, ...uploadedVideoAssets]));
      }

      setVideoData((prev) => ({
        ...prev,
        url: response.secureUrl,
        isMultipart: Boolean(response.isMultipart),
        totalParts: response.totalParts,
        parts: response.parts,
      }));
      setVideoUploadProgress(100);
      setVideoUploadPhase('complete');
      setSuccessMessage('Video telechargee avec succes sur Cloudinary.');
    } catch (error) {
      console.error('Upload error:', error);
      const details = getErrorMessage(error, 'Une erreur inattendue est survenue lors du telechargement.');
      if (details.toLowerCase().includes('413') || details.toLowerCase().includes('volumineux')) {
        setErrorMessage(`Le fichier video depasse la limite de chunk Cloudinary (${Math.round(CLOUDINARY_LIMIT / (1024 * 1024))}MB). Essayez une compression ou un autre fichier.`);
      } else {
        setErrorMessage(details);
      }
      setVideoUploadPhase('error');
      setVideoUploadProgress((prev) => (prev > 0 ? prev : 0));
    } finally {
      input.value = '';
    }
  };

  // QCM Form State
  const [qcmData, setQcmData] = useState<QcmFormData>({
    videoId: '',
    question: '',
    options: getDefaultQcmOptions(),
    mode: 'single' as 'single' | 'multiple',
    correctOptionIndexes: [] as number[],
    explanation: '',
    reference: '',
  });

  const resetQcmForm = (videoId = '') => {
    setEditingQcmId(null);
    setQcmData({
      videoId,
      question: '',
      options: getDefaultQcmOptions(),
      mode: 'single',
      correctOptionIndexes: [],
      explanation: '',
      reference: '',
    });
  };

  const handleVideoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!videoData.url.trim()) {
      setErrorMessage('Veuillez uploader une vidéo avant de sauvegarder.');
      return;
    }

    if (!videoData.isFreeDemo) {
      if (Number.isNaN(videoData.price)) {
        setErrorMessage('Le prix est obligatoire pour une vidéo premium.');
        return;
      }

      if (videoData.price < 0) {
        setErrorMessage('Le prix ne peut pas être négatif.');
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const targetVideoId = editingVideoId;
      const payload = {
        ...videoData,
        packId: videoData.isFreeDemo ? '' : videoData.subspecialty,
      };

      const previousVideo = targetVideoId
        ? videos.find((entry) => entry.id === targetVideoId)
        : null;
      const previousAssets = previousVideo ? collectVideoAssets(previousVideo) : [];
      const nextAssets = collectVideoAssets(payload);
      const assetsToCleanupAfterSave = targetVideoId
        ? subtractCleanupAssets(previousAssets, nextAssets)
        : [];

      if (targetVideoId) {
        await updateDoc(doc(db, 'videos', targetVideoId), {
          ...payload,
          updatedAt: new Date().toISOString()
        });
        setSuccessMessage('Vidéo mise à jour avec succès !');
        logAdminAction('update', 'videos', { id: targetVideoId, title: payload.title });
        setEditingVideoId(null);
      } else {
        const docRef = await addDoc(collection(db, 'videos'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        logAdminAction('create', 'videos', { id: docRef.id, title: payload.title });
        setSuccessMessage('Vidéo ajoutée avec succès !');
      }

      setPendingVideoUploads([]);
      resetVideoFormState();
      await runCloudinaryCleanup(assetsToCleanupAfterSave, 'video:replace-saved', { silent: true });
      await fetchData();
    } catch (error: unknown) {
      console.error('Error adding/updating video:', error);
      setErrorMessage(getSaveErrorMessage('de la vidéo', error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditVideo = (video: VideoModel) => {
    void discardPendingVideoUploads();
    setEditingVideoId(video.id);
    setVideoViewMode('editor');
    resetVideoUploadState();
    setVideoData({
      title: video.title || '',
      description: video.description || '',
      url: video.url || '',
      subspecialty: video.subspecialty || 'otologie',
      section: video.section || 'anatomie',
      isFreeDemo: video.isFreeDemo || false,
      price: video.price || 0,
      isMultipart: Boolean(video.isMultipart),
      totalParts: video.totalParts || (Array.isArray(video.parts) ? video.parts.length : 1),
      parts: Array.isArray(video.parts) ? video.parts : [],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openCreationFromVideo = (target: 'qcm' | 'case' | 'openQuestion' | 'diagram', videoId: string) => {
    setActiveTab(target);

    if (target === 'qcm') {
      setEditingQcmId(null);
      setQcmData({
        videoId,
        question: '',
        options: getDefaultQcmOptions(),
        mode: 'single',
        correctOptionIndexes: [],
        explanation: '',
        reference: '',
      });
    }

    if (target === 'case') {
      void discardPendingCaseUploads();
      setEditingCaseId(null);
      setCaseData({
        videoId,
        title: '',
        description: '',
        patientHistory: '',
        clinicalExamination: '',
        additionalTests: '',
        diagnosis: '',
        treatment: '',
        discussion: '',
        images: [],
        reference: '',
        questions: [],
      });
    }

    if (target === 'openQuestion') {
      setEditingOpenQuestionId(null);
      setOpenQuestionData({
        videoId,
        question: '',
        answer: '',
        reference: '',
      });
    }

    if (target === 'diagram') {
      void discardPendingDiagramUploads();
      setEditingDiagramId(null);
      setDiagramData({
        videoId,
        title: '',
        imageUrl: '',
        markers: [],
        reference: '',
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQcmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qcmData.videoId) {
      setErrorMessage('Veuillez sélectionner une vidéo.');
      return;
    }
    if (qcmData.options.some(opt => !opt.trim())) {
      setErrorMessage('Veuillez remplir toutes les options.');
      return;
    }
    if (qcmData.correctOptionIndexes.length === 0) {
      setErrorMessage('Veuillez sélectionner au moins une bonne réponse.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        videoId: qcmData.videoId,
        question: qcmData.question,
        options: qcmData.options,
        mode: qcmData.mode,
        correctOptionIndexes: qcmData.correctOptionIndexes,
        // pour compatibilité avec l'ancien modèle
        correctOptionIndex:
          qcmData.correctOptionIndexes && qcmData.correctOptionIndexes.length > 0
            ? qcmData.correctOptionIndexes[0]
            : 0,
        explanation: qcmData.explanation,
        reference: qcmData.reference,
      };

      if (editingQcmId) {
        await updateDoc(doc(db, 'qcms', editingQcmId), {
          ...payload,
          updatedAt: new Date().toISOString()
        });
        setSuccessMessage('QCM mis à jour avec succès !');
        logAdminAction('update', 'qcms', { id: editingQcmId, videoId: payload.videoId });
        setEditingQcmId(null);
      } else {
        const docRef = await addDoc(collection(db, 'qcms'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        logAdminAction('create', 'qcms', { id: docRef.id, videoId: payload.videoId });
        setSuccessMessage('QCM ajouté avec succès !');
      }
      
      fetchData(); // Refresh list

      resetQcmForm(qcmData.videoId);
    } catch (error: unknown) {
      console.error('Error adding/updating QCM:', error);
      setErrorMessage(getSaveErrorMessage('du QCM', error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditQcm = (qcm: QcmModel) => {
    setEditingQcmId(qcm.id);

    const mode: 'single' | 'multiple' = qcm.mode === 'multiple' ? 'multiple' : 'single';
    const fallbackIndex = typeof qcm.correctOptionIndex === 'number' ? qcm.correctOptionIndex : 0;
    const correctOptionIndexes: number[] =
      Array.isArray(qcm.correctOptionIndexes) && qcm.correctOptionIndexes.length > 0
        ? qcm.correctOptionIndexes
        : fallbackIndex >= 0
          ? [fallbackIndex]
          : [];

    setQcmData({
      videoId: qcm.videoId || '',
      question: qcm.question || '',
      options: normalizeQcmOptions(qcm.options),
      mode,
      correctOptionIndexes,
      explanation: qcm.explanation || '',
      reference: qcm.reference || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...qcmData.options];
    newOptions[index] = value;
    setQcmData({ ...qcmData, options: newOptions });
  };

  const handleAddQcmOption = () => {
    setQcmData((prev) => ({
      ...prev,
      options: [...prev.options, ''],
    }));
  };

  const handleRemoveQcmOption = (indexToRemove: number) => {
    setQcmData((prev) => {
      if (prev.options.length <= 2) {
        return prev;
      }

      const nextOptions = prev.options.filter((_, index) => index !== indexToRemove);
      const nextCorrectOptionIndexes = prev.correctOptionIndexes
        .filter((index) => index !== indexToRemove)
        .map((index) => (index > indexToRemove ? index - 1 : index));

      return {
        ...prev,
        options: nextOptions,
        correctOptionIndexes: nextCorrectOptionIndexes,
      };
    });
  };

  const [openQuestionData, setOpenQuestionData] = useState<OpenQuestionFormData>({
    videoId: '',
    question: '',
    answer: '',
    reference: '',
  });

  const resetQrocForm = (videoId = '') => {
    setEditingOpenQuestionId(null);
    setOpenQuestionData({
      videoId,
      question: '',
      answer: '',
      reference: '',
    });
  };

  const handleOpenQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openQuestionData.videoId) {
      setErrorMessage('Veuillez sélectionner une vidéo.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        ...openQuestionData,
      };

      if (editingOpenQuestionId) {
        await updateDoc(doc(db, 'openQuestions', editingOpenQuestionId), {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
        setSuccessMessage('QROC mis à jour avec succès !');
        logAdminAction('update', 'openQuestions', {
          id: editingOpenQuestionId,
          videoId: payload.videoId,
        });
        setEditingOpenQuestionId(null);
      } else {
        const docRef = await addDoc(collection(db, 'openQuestions'), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
        logAdminAction('create', 'openQuestions', { id: docRef.id, videoId: payload.videoId });
        setSuccessMessage('QROC ajouté avec succès !');
      }

      fetchData();

      resetQrocForm(openQuestionData.videoId);
    } catch (error: unknown) {
      console.error('Error adding/updating open question:', error);
      setErrorMessage(getSaveErrorMessage('du QROC', error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditOpenQuestion = (item: OpenQuestionModel) => {
    setEditingOpenQuestionId(item.id);
    setOpenQuestionData({
      videoId: item.videoId || '',
      question: item.question || '',
      answer: item.answer || '',
      reference: item.reference || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Clinical Case Form State
  const [caseData, setCaseData] = useState<ClinicalCaseFormData>({
    videoId: '',
    title: '',
    description: '',
    patientHistory: '',
    clinicalExamination: '',
    additionalTests: '',
    diagnosis: '',
    treatment: '',
    discussion: '',
    images: [] as string[],
    reference: '',
    questions: []
  });

  const resetCaseFormState = (videoId = '') => {
    setEditingCaseId(null);
    setCaseData({
      videoId,
      title: '',
      description: '',
      patientHistory: '',
      clinicalExamination: '',
      additionalTests: '',
      diagnosis: '',
      treatment: '',
      discussion: '',
      images: [],
      reference: '',
      questions: [],
    });
  };

  const discardPendingCaseUploads = useCallback(async () => {
    if (pendingCaseUploads.length === 0) {
      return;
    }

    await runCloudinaryCleanup(pendingCaseUploads, 'case:discard-pending', { silent: true });
    setPendingCaseUploads([]);
  }, [pendingCaseUploads, runCloudinaryCleanup]);

  const resetCaseForm = async (videoId = '') => {
    await discardPendingCaseUploads();
    resetCaseFormState(videoId);
  };

  const handleCaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseData.videoId) {
      setErrorMessage('Veuillez sélectionner une vidéo.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const targetCaseId = editingCaseId;
      const previousCase = targetCaseId ? cases.find((entry) => entry.id === targetCaseId) : null;
      const previousAssets = previousCase ? collectCaseAssets(previousCase) : [];
      const nextAssets = collectCaseAssets(caseData);
      const assetsToCleanupAfterSave = targetCaseId
        ? subtractCleanupAssets(previousAssets, nextAssets)
        : [];

      if (targetCaseId) {
        await updateDoc(doc(db, 'clinicalCases', targetCaseId), {
          ...caseData,
          updatedAt: new Date().toISOString()
        });
        setSuccessMessage('Cas clinique mis à jour avec succès !');
        logAdminAction('update', 'clinicalCases', { id: targetCaseId, videoId: caseData.videoId });
        setEditingCaseId(null);
      } else {
        const docRef = await addDoc(collection(db, 'clinicalCases'), {
          ...caseData,
          createdAt: new Date().toISOString()
        });
        logAdminAction('create', 'clinicalCases', { id: docRef.id, videoId: caseData.videoId });
        setSuccessMessage('Cas clinique ajouté avec succès !');
      }

      setPendingCaseUploads([]);
      resetCaseFormState(caseData.videoId);
      await runCloudinaryCleanup(assetsToCleanupAfterSave, 'case:replace-saved', { silent: true });
      await fetchData();
    } catch (error: unknown) {
      console.error('Error adding/updating clinical case:', error);
      setErrorMessage(getSaveErrorMessage('du cas clinique', error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditCase = (c: ClinicalCaseModel) => {
    void discardPendingCaseUploads();
    setEditingCaseId(c.id);
    setCaseData({
      videoId: c.videoId || '',
      title: c.title || '',
      description: c.description || '',
      patientHistory: c.patientHistory || '',
      clinicalExamination: c.clinicalExamination || '',
      additionalTests: c.additionalTests || '',
      diagnosis: c.diagnosis || '',
      treatment: c.treatment || '',
      discussion: c.discussion || '',
      images: c.images || [],
      reference: c.reference || '',
      questions: c.questions || []
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCaseImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setErrorMessage('');

    try {
      const response = await uploadCloudinaryAsset(file, {
        resourceType: 'image',
        folder: 'orl-platform/case-images',
      });

      const uploadedAsset = dedupeCleanupAssets([
        {
          publicId: response.publicId,
          secureUrl: response.secureUrl,
          resourceType: 'image',
        },
      ]);
      if (uploadedAsset.length > 0) {
        setPendingCaseUploads((prev) => dedupeCleanupAssets([...prev, ...uploadedAsset]));
      }

      setUploadProgress(100);
      setCaseData((prev) => ({
        ...prev,
        images: [...(prev.images || []), response.secureUrl],
      }));
      setSuccessMessage('Figure ajoutee avec succes.');
      setIsUploading(false);
    } catch (error) {
      console.error('Upload figure error:', error);
      setErrorMessage('Une erreur inattendue est survenue lors du téléchargement de la figure.');
      setIsUploading(false);
    } finally {
      // reset input value so same file can be re-selected if needed
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleRemoveCaseImage = async (index: number) => {
    const targetUrl = caseData.images?.[index];
    const targetAsset = toCleanupAssetFromUrl(targetUrl, 'image');

    if (targetAsset && isAssetTrackedInPending(targetAsset, pendingCaseUploads)) {
      await runCloudinaryCleanup([targetAsset], 'case:remove-draft-image', { silent: true });
      setPendingCaseUploads((prev) => filterOutCleanupAssets(prev, [targetAsset]));
    }

    setCaseData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const handleRemoveCaseQuestionImage = async (questionIndex: number, imageIndex: number) => {
    const targetQuestion = caseData.questions?.[questionIndex];
    const targetUrl = Array.isArray(targetQuestion?.images)
      ? targetQuestion.images[imageIndex]
      : undefined;
    const targetAsset = toCleanupAssetFromUrl(targetUrl, 'image');

    if (targetAsset && isAssetTrackedInPending(targetAsset, pendingCaseUploads)) {
      await runCloudinaryCleanup([targetAsset], 'case:remove-draft-question-image', { silent: true });
      setPendingCaseUploads((prev) => filterOutCleanupAssets(prev, [targetAsset]));
    }

    setCaseData((prev) => {
      const questions = [...(prev.questions || [])];
      const current = questions[questionIndex];
      if (!current) {
        return prev;
      }

      const currentImages = Array.isArray(current.images) ? current.images : [];
      questions[questionIndex] = {
        ...current,
        images: currentImages.filter((_, i) => i !== imageIndex),
      };

      return {
        ...prev,
        questions,
      };
    });
  };

  const addCaseQuestion = (kind: 'qcm' | 'select' | 'open') => {
    setCaseData(prev => {
      const questions = [...(prev.questions || [])];

      const base: EditableCaseQuestion = {
        id: createCaseQuestionId(),
        kind,
        prompt: ''
      };

      let question: EditableCaseQuestion;
      if (kind === 'open') {
        question = {
          ...base,
          answer: '',
          images: [] as string[],
        };
      } else if (kind === 'select') {
        question = {
          ...base,
          options: getDefaultCaseQuestionOptions(),
          correctOptionIndex: 0,
          explanation: '',
          images: [] as string[],
        };
      } else {
        // QCM avec mode choix unique ou multiple
        question = {
          ...base,
          options: getDefaultCaseQuestionOptions(),
          qcmMode: 'single' as 'single' | 'multiple',
          correctOptionIndexes: [] as number[],
          explanation: '',
          images: [] as string[],
        };
      }

      return {
        ...prev,
        questions: [...questions, question]
      };
    });
  };

  const updateCaseQuestion = (
    index: number,
    updater: (q: EditableCaseQuestion) => EditableCaseQuestion,
  ) => {
    setCaseData(prev => {
      const questions = [...(prev.questions || [])];
      questions[index] = updater(
        questions[index] || ({ id: createCaseQuestionId(), kind: 'open', prompt: '' } as EditableCaseQuestion),
      );
      return {
        ...prev,
        questions
      };
    });
  };

  const removeCaseQuestion = (index: number) => {
    setCaseData(prev => {
      const questions = [...(prev.questions || [])];
      questions.splice(index, 1);
      return {
        ...prev,
        questions
      };
    });
  };

  const changeCaseQuestionKind = (index: number, kind: 'qcm' | 'select' | 'open') => {
    updateCaseQuestion(index, (existing) => {
      const base: EditableCaseQuestion = {
        id: existing?.id || createCaseQuestionId(),
        kind,
        prompt: existing?.prompt || '',
        images: Array.isArray(existing?.images) ? existing.images : [],
      };

      if (kind === 'open') {
        return {
          ...base,
          answer: existing?.answer || ''
        };
      }

      const options = Array.isArray(existing?.options) && existing.options.length
        ? normalizeCaseQuestionOptions(existing.options)
        : getDefaultCaseQuestionOptions();

      if (kind === 'select') {
        return {
          ...base,
          options,
          correctOptionIndex: typeof existing?.correctOptionIndex === 'number' ? existing.correctOptionIndex : 0,
          explanation: existing?.explanation || ''
        };
      }

      // QCM multi-réponses
      const fallbackSingleIndex = typeof existing?.correctOptionIndex === 'number'
        ? existing.correctOptionIndex
        : 0;
      const existingIndexes: number[] = Array.isArray(existing?.correctOptionIndexes)
        ? existing.correctOptionIndexes
        : [];
      return {
        ...base,
        options,
        qcmMode: existing?.qcmMode === 'multiple' ? 'multiple' : 'single',
        correctOptionIndexes: existingIndexes.length > 0 ? existingIndexes : [fallbackSingleIndex],
        explanation: existing?.explanation || ''
      };
    });
  };

  const handleCaseQuestionImageUpload = async (
    questionIndex: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setErrorMessage('');

    try {
      const response = await uploadCloudinaryAsset(file, {
        resourceType: 'image',
        folder: 'orl-platform/case-question-images',
      });

      const uploadedAsset = dedupeCleanupAssets([
        {
          publicId: response.publicId,
          secureUrl: response.secureUrl,
          resourceType: 'image',
        },
      ]);
      if (uploadedAsset.length > 0) {
        setPendingCaseUploads((prev) => dedupeCleanupAssets([...prev, ...uploadedAsset]));
      }

      setUploadProgress(100);
      setCaseData((prev) => {
        const questions = [...(prev.questions || [])];
        const current = questions[questionIndex] || {};
        const currentImages: string[] = Array.isArray(current.images)
          ? current.images
          : [];
        questions[questionIndex] = {
          ...current,
          images: [...currentImages, response.secureUrl],
        };
        return {
          ...prev,
          questions,
        };
      });
      setSuccessMessage('Figure de question ajoutee avec succes.');
      setIsUploading(false);
    } catch (error) {
      console.error('Upload case question figure error:', error);
      setErrorMessage(
        'Une erreur inattendue est survenue lors du téléchargement de la figure de question.',
      );
      setIsUploading(false);
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Diagram Form State
  const [diagramData, setDiagramData] = useState({
    videoId: '',
    title: '',
    imageUrl: '',
    markers: [] as { number: number, x: number, y: number, label: string, description: string }[],
    reference: '',
  });

  const resetDiagramFormState = (videoId = '') => {
    setEditingDiagramId(null);
    setDiagramData({
      videoId,
      title: '',
      imageUrl: '',
      markers: [],
      reference: '',
    });
    resetDiagramUploadState();
  };

  const discardPendingDiagramUploads = useCallback(async () => {
    if (pendingDiagramUploads.length === 0) {
      return;
    }

    await runCloudinaryCleanup(pendingDiagramUploads, 'diagram:discard-pending', { silent: true });
    setPendingDiagramUploads([]);
  }, [pendingDiagramUploads, runCloudinaryCleanup]);

  const resetDiagramForm = async (videoId = '') => {
    await discardPendingDiagramUploads();
    resetDiagramFormState(videoId);
  };

  const handleRemoveDiagramImage = useCallback(async () => {
    const currentAsset = toCleanupAssetFromUrl(diagramData.imageUrl, 'image');
    if (currentAsset && isAssetTrackedInPending(currentAsset, pendingDiagramUploads)) {
      await runCloudinaryCleanup([currentAsset], 'diagram:remove-draft-image', { silent: true });
      setPendingDiagramUploads((prev) => filterOutCleanupAssets(prev, [currentAsset]));
    }

    setDiagramData((prev) => ({ ...prev, imageUrl: '' }));
    resetDiagramUploadState();
  }, [diagramData.imageUrl, isAssetTrackedInPending, pendingDiagramUploads, runCloudinaryCleanup]);

  const handleDiagramSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagramData.videoId) {
      setErrorMessage('Veuillez sélectionner une vidéo.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const targetDiagramId = editingDiagramId;
      const previousDiagram = targetDiagramId
        ? diagrams.find((entry) => entry.id === targetDiagramId)
        : null;
      const previousAssets = previousDiagram ? collectDiagramAssets(previousDiagram) : [];
      const nextAssets = collectDiagramAssets(diagramData);
      const assetsToCleanupAfterSave = targetDiagramId
        ? subtractCleanupAssets(previousAssets, nextAssets)
        : [];

      if (targetDiagramId) {
        await updateDoc(doc(db, 'diagrams', targetDiagramId), {
          ...diagramData,
          updatedAt: new Date().toISOString()
        });
        setSuccessMessage('Schéma mis à jour avec succès !');
        logAdminAction('update', 'diagrams', { id: targetDiagramId, videoId: diagramData.videoId });
        setEditingDiagramId(null);
      } else {
        const docRef = await addDoc(collection(db, 'diagrams'), {
          ...diagramData,
          createdAt: new Date().toISOString()
        });
        logAdminAction('create', 'diagrams', { id: docRef.id, videoId: diagramData.videoId });
        setSuccessMessage('Schéma ajouté avec succès !');
      }

      setPendingDiagramUploads([]);
      resetDiagramFormState(diagramData.videoId);
      await runCloudinaryCleanup(assetsToCleanupAfterSave, 'diagram:replace-saved', { silent: true });
      await fetchData();
    } catch (error: unknown) {
      console.error('Error adding/updating diagram:', error);
      setErrorMessage(getSaveErrorMessage('du schéma', error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditDiagram = (d: DiagramModel) => {
    void discardPendingDiagramUploads();
    setEditingDiagramId(d.id);
    resetDiagramUploadState();
    setDiagramData({
      videoId: d.videoId || '',
      title: d.title || '',
      imageUrl: d.imageUrl || '',
      markers: d.markers || [],
      reference: d.reference || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDiagramImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const input = e.target;

    setDiagramUploadFileName(file.name);
    setDiagramUploadFileSize(file.size);
    setDiagramUploadProgress(3);
    setDiagramUploadPhase('uploading');
    setErrorMessage('');

    const currentDiagramAsset = toCleanupAssetFromUrl(diagramData.imageUrl, 'image');
    if (currentDiagramAsset && isAssetTrackedInPending(currentDiagramAsset, pendingDiagramUploads)) {
      await runCloudinaryCleanup([currentDiagramAsset], 'diagram:replace-draft', { silent: true });
      setPendingDiagramUploads((prev) => filterOutCleanupAssets(prev, [currentDiagramAsset]));
    }

    try {
      const response = await uploadCloudinaryAsset(file, {
        resourceType: 'image',
        folder: 'orl-platform/diagrams',
        onProgress: (percentage) => {
          if (percentage >= 100) {
            setDiagramUploadPhase('processing');
            setDiagramUploadProgress((prev) => Math.max(prev, 96));
            return;
          }

          setDiagramUploadPhase('uploading');
          setDiagramUploadProgress(Math.max(3, Math.min(95, percentage)));
        },
      });

      const uploadedAsset = dedupeCleanupAssets([
        {
          publicId: response.publicId,
          secureUrl: response.secureUrl,
          resourceType: 'image',
        },
      ]);
      if (uploadedAsset.length > 0) {
        setPendingDiagramUploads((prev) => dedupeCleanupAssets([...prev, ...uploadedAsset]));
      }

      setDiagramUploadPhase('processing');
      setDiagramUploadProgress((prev) => Math.max(prev, 98));
      setDiagramData((prev) => ({
        ...prev,
        imageUrl: response.secureUrl,
      }));
      setDiagramUploadProgress(100);
      setDiagramUploadPhase('complete');
      setSuccessMessage('Schema televerse avec succes.');
    } catch (error) {
      console.error('Upload diagram error:', error);
      setErrorMessage(getErrorMessage(error, 'Une erreur inattendue est survenue lors du téléchargement du schéma.'));
      setDiagramUploadPhase('error');
      setDiagramUploadProgress((prev) => (prev > 0 ? prev : 0));
    } finally {
      input.value = '';
    }
  };

  const getVideoExtensionStats = useCallback((videoId: string) => {
    const caseCount = cases.filter((entry) => entry.videoId === videoId).length;
    const qcmCount = qcms.filter((entry) => entry.videoId === videoId).length;
    const openQuestionCount = openQuestions.filter((entry) => entry.videoId === videoId).length;
    const diagramCount = diagrams.filter((entry) => entry.videoId === videoId).length;

    return {
      caseCount,
      qcmCount,
      openQuestionCount,
      diagramCount,
      totalExtensions: caseCount + qcmCount + openQuestionCount + diagramCount,
    };
  }, [cases, qcms, openQuestions, diagrams]);

  const normalizedSearch = contentSearch.trim().toLowerCase();

  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      return !normalizedSearch
        || video.title?.toLowerCase().includes(normalizedSearch)
        || video.description?.toLowerCase().includes(normalizedSearch)
        || video.subspecialty?.toLowerCase().includes(normalizedSearch)
        || video.section?.toLowerCase().includes(normalizedSearch);
    }).sort((a, b) => (a.title || '').localeCompare(b.title || '', 'fr', { sensitivity: 'base' }));
  }, [videos, normalizedSearch]);

  const filteredQcms = useMemo(() => {
    return qcms.filter((qcm) => {
      const video = videos.find((v) => v.id === qcm.videoId);
      return !normalizedSearch
        || qcm.question?.toLowerCase().includes(normalizedSearch)
        || video?.title?.toLowerCase().includes(normalizedSearch);
    });
  }, [qcms, videos, normalizedSearch]);

  const orderedFilteredQcms = useMemo(() => {
    return [...filteredQcms].sort((a, b) => (a.question || '').localeCompare(b.question || '', 'fr', { sensitivity: 'base' }));
  }, [filteredQcms]);

  const filteredOpenQuestions = useMemo(() => {
    return openQuestions.filter((item) => {
      const video = videos.find((v) => v.id === item.videoId);
      return !normalizedSearch
        || item.question?.toLowerCase().includes(normalizedSearch)
        || item.answer?.toLowerCase().includes(normalizedSearch)
        || video?.title?.toLowerCase().includes(normalizedSearch);
    });
  }, [openQuestions, videos, normalizedSearch]);

  const orderedFilteredOpenQuestions = useMemo(() => {
    return [...filteredOpenQuestions].sort((a, b) => (a.question || '').localeCompare(b.question || '', 'fr', { sensitivity: 'base' }));
  }, [filteredOpenQuestions]);

  const filteredCases = useMemo(() => {
    return cases.filter((entry) => {
      const video = videos.find((v) => v.id === entry.videoId);
      return !normalizedSearch
        || entry.title?.toLowerCase().includes(normalizedSearch)
        || entry.description?.toLowerCase().includes(normalizedSearch)
        || video?.title?.toLowerCase().includes(normalizedSearch);
    });
  }, [cases, videos, normalizedSearch]);

  const orderedFilteredCases = useMemo(() => {
    return [...filteredCases].sort((a, b) => {
      const left = a.title || a.description || '';
      const right = b.title || b.description || '';
      return left.localeCompare(right, 'fr', { sensitivity: 'base' });
    });
  }, [filteredCases]);

  const filteredDiagrams = useMemo(() => {
    return diagrams.filter((diagram) => {
      const video = videos.find((v) => v.id === diagram.videoId);
      return !normalizedSearch
        || diagram.title?.toLowerCase().includes(normalizedSearch)
        || video?.title?.toLowerCase().includes(normalizedSearch);
    });
  }, [diagrams, videos, normalizedSearch]);

  const orderedFilteredDiagrams = useMemo(() => {
    return [...filteredDiagrams].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'fr', { sensitivity: 'base' }));
  }, [filteredDiagrams]);

  const videoTitleById = useMemo(() => {
    const titleMap = new Map<string, string>();
    videos.forEach((video) => {
      titleMap.set(video.id, video.title || 'Vidéo sans titre');
    });
    return titleMap;
  }, [videos]);

  const qcmListStats = useMemo(() => {
    const uniqueVideoIds = new Set(filteredQcms.map((qcm) => qcm.videoId).filter(Boolean));
    const multipleCount = filteredQcms.filter((qcm) => qcm.mode === 'multiple').length;
    return {
      total: filteredQcms.length,
      videosLinked: uniqueVideoIds.size,
      multipleCount,
    };
  }, [filteredQcms]);

  const openQuestionListStats = useMemo(() => {
    const withReference = filteredOpenQuestions.filter((item) => Boolean(item.reference?.trim())).length;
    const uniqueVideoIds = new Set(filteredOpenQuestions.map((item) => item.videoId).filter(Boolean));
    return {
      total: filteredOpenQuestions.length,
      videosLinked: uniqueVideoIds.size,
      withReference,
    };
  }, [filteredOpenQuestions]);

  const caseListStats = useMemo(() => {
    const withQuestions = filteredCases.filter((entry) => Array.isArray(entry.questions) && entry.questions.length > 0).length;
    const withImages = filteredCases.filter((entry) => Array.isArray(entry.images) && entry.images.length > 0).length;
    return {
      total: filteredCases.length,
      withQuestions,
      withImages,
    };
  }, [filteredCases]);

  const diagramListStats = useMemo(() => {
    const withImage = filteredDiagrams.filter((diagram) => Boolean(diagram.imageUrl)).length;
    const totalMarkers = filteredDiagrams.reduce((sum, diagram) => sum + (Array.isArray(diagram.markers) ? diagram.markers.length : 0), 0);
    return {
      total: filteredDiagrams.length,
      withImage,
      totalMarkers,
    };
  }, [filteredDiagrams]);

  const tabItems = [
    { id: 'video' as const, label: 'Vidéos', icon: Video, count: videos.length, helper: 'Base du contenu' },
    { id: 'case' as const, label: 'Cas Cliniques', icon: FileText, count: cases.length, helper: 'Entraînement clinique' },
    { id: 'qcm' as const, label: 'QCM', icon: HelpCircle, count: qcms.length, helper: 'Evaluation rapide' },
    { id: 'openQuestion' as const, label: 'QROC', icon: MessageSquare, count: openQuestions.length, helper: 'Réponses rédigées' },
    { id: 'diagram' as const, label: 'Schémas', icon: ImageIcon, count: diagrams.length, helper: 'Supports visuels' },
  ];

  const hasVideoFormContent = Boolean(
    videoData.title.trim()
    || videoData.description.trim()
    || videoData.url.trim()
    || videoData.subspecialty !== 'otologie'
    || videoData.section !== 'anatomie'
    || videoData.isFreeDemo
    || videoData.price > 0
    || (Array.isArray(videoData.parts) && videoData.parts.length > 0)
    || videoUploadPhase !== 'idle'
    || videoUploadFileName
    || videoUploadFileSize > 0,
  );

  const hasQcmFormContent = Boolean(
    qcmData.videoId
    || qcmData.question.trim()
    || qcmData.options.some((option) => option.trim())
    || qcmData.mode !== 'single'
    || qcmData.correctOptionIndexes.length > 0
    || qcmData.explanation.trim()
    || qcmData.reference.trim(),
  );

  const hasQrocFormContent = Boolean(
    openQuestionData.videoId
    || openQuestionData.question.trim()
    || openQuestionData.answer.trim()
    || openQuestionData.reference.trim(),
  );

  const hasCaseFormContent = Boolean(
    caseData.videoId
    || caseData.title.trim()
    || caseData.description.trim()
    || caseData.patientHistory.trim()
    || caseData.clinicalExamination.trim()
    || caseData.additionalTests.trim()
    || caseData.diagnosis.trim()
    || caseData.treatment.trim()
    || caseData.discussion.trim()
    || caseData.reference.trim()
    || caseData.images.length > 0
    || caseData.questions.length > 0,
  );

  const hasDiagramFormContent = Boolean(
    diagramData.videoId
    || diagramData.title.trim()
    || diagramData.imageUrl.trim()
    || diagramData.reference.trim()
    || diagramData.markers.length > 0
    || diagramUploadPhase !== 'idle'
    || diagramUploadFileName
    || diagramUploadFileSize > 0,
  );

  const renderSelectedVideoPreview = (videoId: string) => {
    if (!videoId) return null;

    const selectedVideo = videos.find((video) => video.id === videoId);

    if (!selectedVideo) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Vidéo sélectionnée introuvable.
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-3 space-y-2">
        {selectedVideo.url ? (
          <AdminVideoPreviewCard
            label="Vidéo sélectionnée"
            url={selectedVideo.url}
            isMultipart={selectedVideo.isMultipart}
            parts={selectedVideo.parts}
            totalParts={selectedVideo.totalParts}
          />
        ) : (
          <p className="text-xs text-amber-700">Cette vidéo n'a pas encore d'URL de lecture.</p>
        )}
      </div>
    );
  };

  const normalizePreviewSources = (
    sourceUrl: string,
    sourceParts?: VideoPartModel[],
  ): PreviewSource[] => {
    const normalizedParts = Array.isArray(sourceParts)
      ? sourceParts
          .map((part) => ({
            secureUrl: String(part?.secureUrl || '').trim(),
            duration: Number(part?.duration || 0),
          }))
          .filter((part) => part.secureUrl)
      : [];

    if (normalizedParts.length > 0) {
      return normalizedParts;
    }

    const normalizedUrl = String(sourceUrl || '').trim();
    if (!normalizedUrl) {
      return [];
    }

    return [{ secureUrl: normalizedUrl }];
  };

  const AdminVideoPreviewCard = ({
    label,
    url,
    parts,
    isMultipart,
    totalParts,
    videoId,
  }: {
    label: string;
    url: string;
    parts?: VideoPartModel[];
    isMultipart?: boolean;
    totalParts?: number;
    videoId?: string;
  }) => {
    const previewSources = normalizePreviewSources(url, parts);
    const hasSources = previewSources.length > 0;
    const shouldUseMultipart = Boolean(isMultipart) || previewSources.length > 1;
    const partsCount = shouldUseMultipart
      ? Number(totalParts || previewSources.length || 1)
      : 1;

    return (
      <div className="rounded-xl">

        {hasSources ? (
          <div className="relative overflow-hidden rounded-lg border border-emerald-200 bg-black/95">
            {videoId && (
              <a
                href={`/videos/${videoId}`}
                className="absolute inset-0 z-10"
                aria-label="Ouvrir le détail de la vidéo"
                title="Ouvrir le détail de la vidéo"
              />
            )}
            <div className={videoId ? 'pointer-events-none' : ''}>
              <SeamlessPlayer
                url={url}
                parts={previewSources}
                initialTime={0}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-amber-700">Aucune source vidéo disponible pour la prévisualisation.</p>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl shadow-sm border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] overflow-hidden">
      <div className="border-b border-[var(--app-border)] bg-[var(--app-surface-alt)] px-8 py-6 space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[var(--app-text)]">Gestion de contenu pédagogique</h2>
            <p className="text-base text-[var(--app-muted)]">Organisez vos vidéos, cas cliniques, QCM, QROC et schémas depuis un seul espace.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {tabItems.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                  isActive
                    ? 'border-medical-300 bg-medical-50 shadow-sm'
                    : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:bg-[var(--app-surface-2)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </span>
                    <p className="text-xs text-[var(--app-muted)]">{tab.helper}</p>
                  </div>
                  <span className={`text-2xl font-bold ${isActive ? 'text-medical-700' : 'text-[var(--app-text)]'}`}>
                    {tab.count}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="relative w-full min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
            <input
              type="text"
              value={contentSearch}
              onChange={(e) => setContentSearch(e.target.value)}
              placeholder="Rechercher vidéos, QCM, cas, QROC et schémas..."
              className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] py-3 pl-9 pr-3 text-base text-[var(--app-text)] placeholder:text-[var(--app-muted)] outline-none focus:border-transparent focus:ring-2 focus:ring-medical-500"
            />
          </div>
          {activeTab === 'video' && (
            <div className="inline-flex items-center rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setVideoViewMode('editor')}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  videoViewMode === 'editor' ? 'bg-medical-100 text-medical-700' : 'text-[var(--app-muted)] hover:bg-[var(--app-surface-2)]'
                }`}
              >
                Formulaires
              </button>
              <button
                type="button"
                onClick={() => setVideoViewMode('byVideo')}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  videoViewMode === 'byVideo' ? 'bg-medical-100 text-medical-700' : 'text-[var(--app-muted)] hover:bg-[var(--app-surface-2)]'
                }`}
              >
                Bibliothèque vidéo
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-8">
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 flex items-center justify-between">
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage('')}
              className="text-emerald-600 hover:text-emerald-800"
              title="Fermer le message"
              aria-label="Fermer le message"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 text-red-800 rounded-xl border border-red-200 flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage('')}
              className="text-red-600 hover:text-red-800"
              title="Fermer le message"
              aria-label="Fermer le message"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {activeTab === 'video' && (
          <div className="space-y-6">
            {videoViewMode === 'byVideo' && (
              <div className="rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--app-text)]">Vue consolidée par vidéo</h3>
                    <p className="text-sm text-[var(--app-muted)]">Consultez votre bibliothèque vidéo, les extensions associées et les actions rapides de gestion.</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--app-text)]">
                    {filteredVideos.length} vidéo{filteredVideos.length > 1 ? 's' : ''}
                  </span>
                </div>

                {filteredVideos.length > 0 ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {filteredVideos.map((video) => {
                      const stats = getVideoExtensionStats(video.id);

                      return (
                        <div key={`overview-${video.id}`} className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <h4 className="text-base font-semibold text-[var(--app-text)] line-clamp-2">{video.title || 'Vidéo sans titre'}</h4>
                              <div className="flex flex-wrap gap-2 text-[11px]">
                                <span className={existingItemMetaChipClass}>{formatDisplayLabel(video.subspecialty)}</span>
                                <span className={existingItemMetaChipClass}>{formatDisplayLabel(video.section)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleEditVideo(video)}
                                className="rounded-lg p-2 text-[var(--app-muted)] transition-colors hover:bg-[var(--app-surface-2)]"
                                title="Modifier"
                              >
                                <Edit2 className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleDelete('videos', video.id)}
                                className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
                                title="Supprimer"
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-2 text-center">
                              <p className="text-[11px] font-medium text-[var(--app-muted)]">Cas</p>
                              <p className="text-lg font-bold text-[var(--app-text)]">{stats.caseCount}</p>
                            </div>
                            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-2 text-center">
                              <p className="text-[11px] font-medium text-[var(--app-muted)]">QCM</p>
                              <p className="text-lg font-bold text-[var(--app-text)]">{stats.qcmCount}</p>
                            </div>
                            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-2 text-center">
                              <p className="text-[11px] font-medium text-[var(--app-muted)]">QROC</p>
                              <p className="text-lg font-bold text-[var(--app-text)]">{stats.openQuestionCount}</p>
                            </div>
                            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-2 text-center">
                              <p className="text-[11px] font-medium text-[var(--app-muted)]">Schémas</p>
                              <p className="text-lg font-bold text-[var(--app-text)]">{stats.diagramCount}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => openCreationFromVideo('case', video.id)}
                              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-2)]"
                            >
                              Ajouter cas
                            </button>
                            <button
                              type="button"
                              onClick={() => openCreationFromVideo('qcm', video.id)}
                              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-2)]"
                            >
                              Ajouter QCM
                            </button>
                            <button
                              type="button"
                              onClick={() => openCreationFromVideo('openQuestion', video.id)}
                              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-2)]"
                            >
                              Ajouter QROC
                            </button>
                            <button
                              type="button"
                              onClick={() => openCreationFromVideo('diagram', video.id)}
                              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-2)]"
                            >
                              Ajouter schéma
                            </button>
                          </div>

                          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-3 space-y-3">
                            <AdminVideoPreviewCard
                              label="Cliquer sur la vidéo pour ouvrir le détail"
                              url={video.url || ''}
                              isMultipart={video.isMultipart}
                              parts={video.parts}
                              totalParts={video.totalParts}
                              videoId={video.id}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 text-center text-sm text-[var(--app-muted)]">
                    Aucune vidéo ne correspond à la recherche actuelle.
                  </div>
                )}
              </div>
            )}

            {videoViewMode === 'editor' && (
              <div className={editorGridClass}>
            <form onSubmit={handleVideoSubmit} className={formPanelClass}>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">{editingVideoId ? 'Modifier la vidéo' : 'Ajouter une nouvelle vidéo'}</h3>
                <p className="text-sm text-slate-500 mb-6">Remplissez les informations ci-dessous pour {editingVideoId ? 'modifier' : 'ajouter'} une vidéo à la plateforme.</p>
              </div>
            </div>

            <div className="space-y-5">
              <section className={sectionCardClass}>
                <div className="space-y-1">
                  <h4 className={sectionTitleClass}>Informations générales</h4>
                  <p className={sectionHintClass}>Structurez le contenu de la vidéo et son classement médical.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Titre de la vidéo</label>
                    <input
                      type="text"
                      required
                      value={videoData.title}
                      onChange={(e) => setVideoData({...videoData, title: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"
                      placeholder="Ex: Anatomie de l'oreille moyenne"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Description</label>
                    <textarea
                      required
                      value={videoData.description}
                      onChange={(e) => setVideoData({...videoData, description: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto min-h-[120px]"
                      placeholder="Description détaillée du contenu de la vidéo..."
                    />
                    <p className="text-[11px] text-[var(--app-muted)]">
                      Markdown accepté: `-`, `+`, `1.`, `*italique*`, `**gras**`.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Sous-spécialité</label>
                    <select
                      value={videoData.subspecialty}
                      onChange={(e) => setVideoData({...videoData, subspecialty: e.target.value})}
                      title="Sous-spécialité"
                      aria-label="Sous-spécialité"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white"
                    >
                      <option value="otologie">Otologie</option>
                      <option value="rhinologie">Rhinologie</option>
                      <option value="laryngologie">Laryngologie</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Section</label>
                    <select
                      value={videoData.section}
                      onChange={(e) => setVideoData({...videoData, section: e.target.value})}
                      title="Section"
                      aria-label="Section"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white"
                    >
                      <option value="anatomie">Anatomie</option>
                      <option value="pathologie">Pathologie</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className={sectionCardClass}>
                <div className="space-y-1">
                  <h4 className={sectionTitleClass}>Média et prévisualisation</h4>
                  <p className={sectionHintClass}>Chargez la vidéo source et contrôlez immédiatement le rendu final.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Vidéo (upload)</label>
                  <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {videoUploadFileName || 'Aucun fichier sélectionné'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {videoUploadFileName
                            ? `${formatFileSize(videoUploadFileSize)} - limite ${Math.round(BACKEND_UPLOAD_LIMIT / (1024 * 1024 * 1024))} GB`
                            : 'Chargez un fichier vidéo source (MP4, MOV, MKV...)'}
                        </p>
                      </div>

                      <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-medium transition-colors border w-fit ${
                        isVideoUploading
                          ? 'bg-slate-100 text-slate-500 border-slate-300'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                      }`}>
                        {isVideoUploading
                          ? (videoUploadPhase === 'processing' ? 'Traitement serveur...' : 'Transfert en cours...')
                          : 'Choisir un fichier'}
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={handleFileUpload}
                          disabled={isVideoUploading}
                        />
                      </label>
                    </div>

                    {videoUploadPhase !== 'idle' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-medium ${
                            videoUploadPhase === 'error'
                              ? 'text-red-600'
                              : videoUploadPhase === 'complete'
                                ? 'text-emerald-700'
                                : 'text-medical-700'
                          }`}>
                            {videoUploadPhase === 'uploading' && 'Transfert vers le serveur'}
                            {videoUploadPhase === 'processing' && 'Traitement et publication Cloudinary'}
                            {videoUploadPhase === 'complete' && 'Upload terminé'}
                            {videoUploadPhase === 'error' && 'Échec du téléversement'}
                          </span>
                          <span className="font-semibold text-slate-700">{clampedVideoUploadProgress}%</span>
                        </div>

                        <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              videoUploadPhase === 'error'
                                ? 'bg-red-500'
                                : videoUploadPhase === 'complete'
                                  ? 'bg-emerald-500'
                                  : 'bg-medical-600'
                            } ${videoUploadProgressWidthClass}`}
                          />
                        </div>

                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span className={`rounded-full px-2 py-1 border ${
                            videoUploadPhase === 'uploading' || videoUploadPhase === 'processing' || videoUploadPhase === 'complete'
                              ? 'border-medical-300 bg-medical-50 text-medical-700'
                              : 'border-slate-200 bg-white text-slate-500'
                          }`}>1. Transfert</span>
                          <span className={`rounded-full px-2 py-1 border ${
                            videoUploadPhase === 'processing' || videoUploadPhase === 'complete'
                              ? 'border-medical-300 bg-medical-50 text-medical-700'
                              : 'border-slate-200 bg-white text-slate-500'
                          }`}>2. Traitement</span>
                          <span className={`rounded-full px-2 py-1 border ${
                            videoUploadPhase === 'complete'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : videoUploadPhase === 'error'
                                ? 'border-red-300 bg-red-50 text-red-700'
                                : 'border-slate-200 bg-white text-slate-500'
                          }`}>3. Terminé</span>
                        </div>
                      </div>
                    )}

                    {videoData.url && !isVideoUploading && (
                      <AdminVideoPreviewCard
                        label="Vidéo uploadée"
                        url={videoData.url}
                        isMultipart={videoData.isMultipart}
                        parts={videoData.parts}
                        totalParts={videoData.totalParts}
                      />
                    )}
                  </div>
                </div>
              </section>

              <section className={sectionCardClass}>
                <div className="space-y-1">
                  <h4 className={sectionTitleClass}>Publication et tarification</h4>
                  <p className={sectionHintClass}>Définissez le mode d’accès pour vos apprenants.</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--app-text)]">Type d'accès</label>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label
                        className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                          videoData.isFreeDemo
                            ? 'border-medical-300 bg-medical-50 shadow-sm'
                            : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:bg-[var(--app-surface-2)]'
                        }`}
                      >
                        <input
                          type="radio"
                          checked={videoData.isFreeDemo}
                          onChange={() => setVideoData({ ...videoData, isFreeDemo: true })}
                          className="sr-only"
                        />
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-[var(--app-text)]">Démo Gratuite</p>
                            <p className="text-xs text-[var(--app-muted)]">Accès libre pour découvrir la vidéo.</p>
                          </div>
                          <span
                            className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                              videoData.isFreeDemo
                                ? 'border-medical-600 bg-medical-600'
                                : 'border-[var(--app-border)] bg-[var(--app-surface)]'
                            }`}
                          >
                            <span className={`h-2 w-2 rounded-full ${videoData.isFreeDemo ? 'bg-white' : 'bg-transparent'}`} />
                          </span>
                        </div>
                      </label>

                      <label
                        className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                          !videoData.isFreeDemo
                            ? 'border-medical-300 bg-medical-50 shadow-sm'
                            : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:bg-[var(--app-surface-2)]'
                        }`}
                      >
                        <input
                          type="radio"
                          checked={!videoData.isFreeDemo}
                          onChange={() => setVideoData({ ...videoData, isFreeDemo: false })}
                          className="sr-only"
                        />
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-[var(--app-text)]">Premium (Payant)</p>
                            <p className="text-xs text-[var(--app-muted)]">Contenu réservé aux apprenants premium.</p>
                          </div>
                          <span
                            className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                              !videoData.isFreeDemo
                                ? 'border-medical-600 bg-medical-600'
                                : 'border-[var(--app-border)] bg-[var(--app-surface)]'
                            }`}
                          >
                            <span className={`h-2 w-2 rounded-full ${!videoData.isFreeDemo ? 'bg-white' : 'bg-transparent'}`} />
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {!videoData.isFreeDemo && (
                    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-medium text-[var(--app-text)]">Prix (DZD)</label>
                        <span className="text-xs text-[var(--app-muted)]">Paiement unique</span>
                      </div>

                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-wide text-[var(--app-muted)]">
                          DZD
                        </span>
                        <input
                          type="number"
                          required
                          min={0}
                          value={videoData.price}
                          onChange={(e) => setVideoData({ ...videoData, price: Number(e.target.value) })}
                          className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] py-2.5 pl-14 pr-4 text-[var(--app-text)] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-medical-500"
                          placeholder="Ex: 1500"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {[1000, 1500, 2000].map((amount) => (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => setVideoData({ ...videoData, price: amount })}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              videoData.price === amount
                                ? 'border-medical-300 bg-medical-50 text-medical-700'
                                : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-muted)] hover:bg-[var(--app-surface-2)]'
                            }`}
                          >
                            {amount} DZD
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  void resetVideoForm();
                }}
                disabled={!hasVideoFormContent}
                className="flex items-center gap-2 border border-slate-300 text-slate-700 px-6 py-3 rounded-xl font-medium hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <X className="w-5 h-5" />
                {editingVideoId ? "Annuler" : "Annuler"}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 bg-medical-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-medical-700 transition-colors disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {editingVideoId ? 'Mettre à jour' : 'Enregistrer'}
              </button>
            </div>
          </form>
          
          <div className={listPanelClass}>
            <div className="space-y-4">
              <div className={listSummaryCardClass}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Vidéos existantes</h3>
                    <p className="text-xs text-slate-500">Bibliothèque triée par état de complétude pédagogique.</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {filteredVideos.length} vidéo{filteredVideos.length > 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div className={packGridClass}>
                {filteredVideos.map((video) => {
                  const stats = getVideoExtensionStats(video.id);
                  return (
                    <div key={video.id} className={`${existingItemCardClass} space-y-4`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <h5 className="font-semibold text-slate-900 line-clamp-1">{video.title || 'Vidéo sans titre'}</h5>
                          <p className="text-xs text-slate-500">{formatDisplayLabel(video.subspecialty)} • {formatDisplayLabel(video.section)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditVideo(video)}
                            className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Modifier"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete('videos', video.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className={existingItemMetaChipClass}>Cas: {stats.caseCount}</span>
                        <span className={existingItemMetaChipClass}>QCM: {stats.qcmCount}</span>
                        <span className={existingItemMetaChipClass}>Questions: {stats.openQuestionCount}</span>
                        <span className={existingItemMetaChipClass}>Schémas: {stats.diagramCount}</span>
                        <span className={existingItemMetaChipClass}>Total: {stats.totalExtensions}</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openCreationFromVideo('case', video.id)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                          + Cas
                        </button>
                        <button
                          type="button"
                          onClick={() => openCreationFromVideo('qcm', video.id)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                          + QCM
                        </button>
                        <button
                          type="button"
                          onClick={() => openCreationFromVideo('openQuestion', video.id)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                            + QROC
                        </button>
                        <button
                          type="button"
                          onClick={() => openCreationFromVideo('diagram', video.id)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                          + Schéma
                        </button>
                      </div>

                      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-sm space-y-2">
                        <AdminVideoPreviewCard
                          label="Cliquer sur la vidéo pour ouvrir le détail"
                          url={video.url || ''}
                          isMultipart={video.isMultipart}
                          parts={video.parts}
                          totalParts={video.totalParts}
                          videoId={video.id}
                        />
                        <MarkdownPreview
                          content={video.description}
                          emptyMessage="Aucune description disponible pour cette vidéo."
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredVideos.length === 0 && (
                <div className={listSummaryCardClass}>
                  <p className="text-slate-500 text-sm">
                    {normalizedSearch
                      ? 'Aucune vidéo ne correspond aux filtres actuels.'
                      : 'Aucune vidéo trouvée.'}
                  </p>
                </div>
              )}
            </div>
          </div>
          </div>
          )}
        </div>
        )}

        {activeTab === 'qcm' && (
          <div className={editorGridClass}>
            <form onSubmit={handleQcmSubmit} className={formPanelClass}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{editingQcmId ? 'Modifier le QCM' : 'Ajouter un QCM'}</h3>
                  <p className="text-sm text-slate-500 mb-6">Créez une question à choix multiples liée à une vidéo spécifique.</p>
                </div>
              </div>

              <div className="space-y-5">
                <section className={sectionCardClass}>
                  <div className="space-y-1">
                    <h4 className={sectionTitleClass}>Cadrage du QCM</h4>
                    <p className={sectionHintClass}>Sélectionnez la vidéo cible et rédigez l’énoncé principal.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Vidéo associée</label>
                      <select
                        required
                        value={qcmData.videoId}
                        onChange={(e) => setQcmData({...qcmData, videoId: e.target.value})}
                        title="Video associee au QCM"
                        aria-label="Video associee au QCM"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white"
                      >
                        <option value="" disabled>Sélectionner une vidéo...</option>
                        {videos.map(v => (
                          <option key={v.id} value={v.id}>{v.title}</option>
                        ))}
                      </select>
                      {renderSelectedVideoPreview(qcmData.videoId)}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Question</label>
                      <textarea
                        required
                        value={qcmData.question}
                        onChange={(e) => setQcmData({...qcmData, question: e.target.value})}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto min-h-[90px]"
                        placeholder="Posez votre question ici..."
                      />
                    </div>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="space-y-1">
                    <h4 className={sectionTitleClass}>Configuration et réponses</h4>
                    <p className={sectionHintClass}>Définissez le mode de réponse et préparez le corrigé interactif.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Type de QCM</label>
                      <select
                        value={qcmData.mode}
                        onChange={(e) => {
                          const nextMode = e.target.value as 'single' | 'multiple';
                          setQcmData((prev) => ({
                            ...prev,
                            mode: nextMode,
                            correctOptionIndexes:
                              nextMode === 'single'
                                ? (prev.correctOptionIndexes.length > 0 ? [prev.correctOptionIndexes[0]] : [])
                                : prev.correctOptionIndexes,
                          }));
                        }}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white text-sm"
                        title="Type de QCM"
                        aria-label="Type de QCM"
                      >
                        <option value="single">Choix unique</option>
                        <option value="multiple">Choix multiple</option>
                      </select>
                      <p className="text-xs text-slate-500">
                        Choix unique : une seule bonne réponse. Choix multiple : plusieurs réponses peuvent être correctes.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-700">Options de réponse</label>
                        <button
                          type="button"
                          onClick={handleAddQcmOption}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Ajouter une option
                        </button>
                      </div>
                      {qcmData.options.map((_, index) => {
                        const optionLabel = getOptionLabel(index);
                        return (
                        <div key={optionLabel} className="flex items-center gap-4">
                          {qcmData.mode === 'single' ? (
                            <input
                              type="radio"
                              name="main-qcm-correct-option"
                              checked={qcmData.correctOptionIndexes.includes(index)}
                              onChange={() =>
                                setQcmData((prev) => ({
                                  ...prev,
                                  correctOptionIndexes: [index],
                                }))
                              }
                              className="text-medical-600 focus:ring-medical-500 mt-1 h-4 w-4 border-slate-300"
                              title="Marquer comme bonne réponse"
                            />
                          ) : (
                            <input
                              type="checkbox"
                              checked={qcmData.correctOptionIndexes.includes(index)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setQcmData((prev) => {
                                  let nextIndexes = Array.isArray(prev.correctOptionIndexes)
                                    ? [...prev.correctOptionIndexes]
                                    : [];

                                  if (checked) {
                                    if (!nextIndexes.includes(index)) {
                                      nextIndexes.push(index);
                                    }
                                  } else {
                                    nextIndexes = nextIndexes.filter((i) => i !== index);
                                  }

                                  return {
                                    ...prev,
                                    correctOptionIndexes: nextIndexes,
                                  };
                                });
                              }}
                              className="text-medical-600 focus:ring-medical-500 mt-1 h-4 w-4 rounded border-slate-300"
                              title="Marquer comme bonne réponse"
                            />
                          )}
                          <span className="w-8 shrink-0 text-center text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-300 rounded-md py-1">
                            {optionLabel}
                          </span>
                          <input
                            type="text"
                            required
                            value={qcmData.options[index] || ''}
                            onChange={(e) => handleOptionChange(index, e.target.value)}
                            className={`flex-1 px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all ${
                              qcmData.correctOptionIndexes.includes(index) ? 'border-medical-500 bg-medical-50' : 'border-slate-300'
                            }`}
                            placeholder={`Option ${optionLabel}`}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveQcmOption(index)}
                            disabled={qcmData.options.length <= 2}
                            className="rounded-lg border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Supprimer cette option"
                            aria-label="Supprimer cette option"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        );
                      })}
                      <p className="text-xs text-slate-500">
                        Choix unique: boutons radio. Choix multiple: cases à cocher. Minimum 2 options.
                      </p>
                    </div>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="space-y-1">
                    <h4 className={sectionTitleClass}>Feedback pédagogique</h4>
                    <p className={sectionHintClass}>Ajoutez des éléments de correction pour enrichir l’apprentissage.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Explication (optionnelle)</label>
                      <textarea
                        value={qcmData.explanation}
                        onChange={(e) => setQcmData({...qcmData, explanation: e.target.value})}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto min-h-[80px]"
                        placeholder="Explication affichée après la réponse..."
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Références (optionnelle)</label>
                      <textarea
                        value={qcmData.reference}
                        onChange={(e) => setQcmData({ ...qcmData, reference: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto min-h-[80px]"
                        placeholder="Article, guide, source scientifique..."
                      />
                    </div>
                  </div>
                </section>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => resetQcmForm()}
                  disabled={!hasQcmFormContent}
                  className="flex items-center gap-2 border border-slate-300 text-slate-700 px-6 py-3 rounded-xl font-medium hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <X className="w-5 h-5" />
                  {editingQcmId ? "Annuler" : "Annuler"}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 bg-medical-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-medical-700 transition-colors disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingQcmId ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </div>
            </form>

            <div className={listPanelClass}>
              <div className="space-y-4">
                <div className={listSummaryCardClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">QCMs existants</h3>
                      <p className="text-xs text-slate-500">Vue organisée par libellé pour simplifier la maintenance pédagogique.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {qcmListStats.total}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={existingItemMetaChipClass}>Vidéos liées: {qcmListStats.videosLinked}</span>
                    <span className={existingItemMetaChipClass}>Choix multiple: {qcmListStats.multipleCount}</span>
                    <span className={existingItemMetaChipClass}>
                      Choix unique: {Math.max(0, qcmListStats.total - qcmListStats.multipleCount)}
                    </span>
                  </div>
                </div>

                <div className={packGridClass}>
                  {orderedFilteredQcms.map((qcm) => {
                    const videoTitle = videoTitleById.get(qcm.videoId) || 'Vidéo inconnue';
                    const optionCount = Array.isArray(qcm.options) ? qcm.options.length : 0;
                    const correctCount = Array.isArray(qcm.correctOptionIndexes) ? qcm.correctOptionIndexes.length : 0;

                    return (
                      <div key={qcm.id} className={`${existingItemRowClass} flex-col gap-3 md:flex-row md:items-start`}>
                        <div className="min-w-0 flex-1 space-y-2">
                          <h4 className="font-semibold text-slate-900 line-clamp-2">{qcm.question || 'Question non renseignée'}</h4>
                          <div className="flex flex-wrap gap-2">
                            <span className={existingItemMetaChipClass}>Vidéo: {videoTitle}</span>
                            <span className={existingItemMetaChipClass}>
                              Mode: {qcm.mode === 'multiple' ? 'Choix multiple' : 'Choix unique'}
                            </span>
                            <span className={existingItemMetaChipClass}>Options: {optionCount}</span>
                            <span className={existingItemMetaChipClass}>Bonnes réponses: {correctCount}</span>
                          </div>
                          <MarkdownPreview content={qcm.explanation} maxHeightClass="max-h-20" />
                        </div>
                        <div className="flex items-center gap-2 self-end md:self-start">
                          <button
                            onClick={() => handleEditQcm(qcm)}
                            className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Modifier"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete('qcms', qcm.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {orderedFilteredQcms.length === 0 && (
                    <div className={listSummaryCardClass}>
                      <p className="text-slate-500 text-sm">
                        {normalizedSearch ? 'Aucun QCM ne correspond à la recherche.' : 'Aucun QCM trouvé.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'openQuestion' && (
          <div className={editorGridClass}>
            <form onSubmit={handleOpenQuestionSubmit} className={formPanelClass}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">
                    {editingOpenQuestionId ? 'Modifier le QROC' : 'Ajouter un QROC'}
                  </h3>
                  <p className="text-sm text-slate-500 mb-6">
                    Ajoutez un QROC lié à une vidéo avec sa réponse et ses références.
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <section className={sectionCardClass}>
                  <div className="space-y-1">
                    <h4 className={sectionTitleClass}>Cadrage de la question</h4>
                    <p className={sectionHintClass}>Associez le QROC à la vidéo concernée.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Vidéo associée</label>
                    <select
                      required
                      value={openQuestionData.videoId}
                      onChange={(e) => setOpenQuestionData({ ...openQuestionData, videoId: e.target.value })}
                      title="Video associee au QROC"
                      aria-label="Video associee au QROC"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white"
                    >
                      <option value="" disabled>Sélectionner une vidéo...</option>
                      {videos.map(v => (
                        <option key={v.id} value={v.id}>{v.title}</option>
                      ))}
                    </select>
                    {renderSelectedVideoPreview(openQuestionData.videoId)}
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="space-y-1">
                    <h4 className={sectionTitleClass}>Question et corrigé</h4>
                    <p className={sectionHintClass}>Rédigez l’énoncé et la réponse attendue de manière structurée.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Question</label>
                      <textarea
                        required
                        value={openQuestionData.question}
                        onChange={(e) => setOpenQuestionData({ ...openQuestionData, question: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto min-h-[90px]"
                        placeholder="Saisissez le QROC..."
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Réponse</label>
                      <textarea
                        required
                        value={openQuestionData.answer}
                        onChange={(e) => setOpenQuestionData({ ...openQuestionData, answer: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto min-h-[120px]"
                        placeholder="Saisissez la réponse attendue..."
                      />
                    </div>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="space-y-1">
                    <h4 className={sectionTitleClass}>Références académiques</h4>
                    <p className={sectionHintClass}>Ajoutez la source ou la guideline pour renforcer la fiabilité.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Références (optionnelle)</label>
                    <textarea
                      value={openQuestionData.reference}
                      onChange={(e) => setOpenQuestionData({ ...openQuestionData, reference: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto min-h-[80px]"
                      placeholder="Article, source scientifique, guideline..."
                    />
                  </div>
                </section>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => resetQrocForm()}
                  disabled={!hasQrocFormContent}
                  className="flex items-center gap-2 border border-slate-300 text-slate-700 px-6 py-3 rounded-xl font-medium hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <X className="w-5 h-5" />
                  {editingOpenQuestionId ? "Annuler" : "Annuler"}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 bg-medical-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-medical-700 transition-colors disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingOpenQuestionId ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </div>
            </form>

            <div className={listPanelClass}>
              <div className="space-y-4">
                <div className={listSummaryCardClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">QROC existants</h3>
                      <p className="text-xs text-slate-500">Organisation par question pour retrouver rapidement les contenus rédactionnels.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {openQuestionListStats.total}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={existingItemMetaChipClass}>Vidéos liées: {openQuestionListStats.videosLinked}</span>
                    <span className={existingItemMetaChipClass}>Avec référence: {openQuestionListStats.withReference}</span>
                    <span className={existingItemMetaChipClass}>
                      Sans référence: {Math.max(0, openQuestionListStats.total - openQuestionListStats.withReference)}
                    </span>
                  </div>
                </div>

                <div className={packGridClass}>
                  {orderedFilteredOpenQuestions.map((item) => {
                    const videoTitle = videoTitleById.get(item.videoId) || 'Vidéo inconnue';

                    return (
                      <div key={item.id} className={`${existingItemRowClass} flex-col gap-3 md:flex-row md:items-start`}>
                        <div className="min-w-0 flex-1 space-y-2">
                          <h4 className="font-semibold text-slate-900 line-clamp-2">{item.question || 'Question non renseignée'}</h4>
                          <div className="flex flex-wrap gap-2">
                            <span className={existingItemMetaChipClass}>Vidéo: {videoTitle}</span>
                            {item.reference && (
                              <span className="inline-flex items-center rounded-full border border-medical-200 bg-medical-50 px-2 py-1 text-[11px] font-medium text-medical-700">
                                Référence incluse
                              </span>
                            )}
                          </div>
                          <MarkdownPreview
                            content={item.answer}
                            emptyMessage="Aucune réponse enregistrée pour cette question."
                            maxHeightClass="max-h-20"
                          />
                        </div>
                        <div className="flex items-center gap-2 self-end md:self-start">
                          <button
                            onClick={() => handleEditOpenQuestion(item)}
                            className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Modifier"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete('openQuestions', item.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {orderedFilteredOpenQuestions.length === 0 && (
                    <div className={listSummaryCardClass}>
                      <p className="text-slate-500 text-sm">
                        {normalizedSearch ? 'Aucun QROC ne correspond à la recherche.' : 'Aucun QROC trouvé.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'case' && (
          <div className={editorGridClass}>
            <form onSubmit={handleCaseSubmit} className={formPanelClass}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{editingCaseId ? 'Modifier le Cas Clinique' : 'Ajouter un Cas Clinique'}</h3>
                  <p className="text-sm text-slate-500 mb-6">Créez un cas clinique détaillé lié à une vidéo spécifique.</p>
                </div>
              </div>

              <div className="space-y-5">
                <section className={sectionCardClass}>
                  <div className="space-y-1">
                    <h4 className={sectionTitleClass}>Liaison vidéo et supports visuels</h4>
                    <p className={sectionHintClass}>Associez le cas à la bonne vidéo et ajoutez les figures utiles.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Vidéo associée</label>
                  <select
                    required
                    value={caseData.videoId}
                    onChange={(e) => setCaseData({...caseData, videoId: e.target.value})}
                    title="Video associee au cas clinique"
                    aria-label="Video associee au cas clinique"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="" disabled>Sélectionner une vidéo...</option>
                    {videos.map(v => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                  {renderSelectedVideoPreview(caseData.videoId)}
                </div>

                    <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Figures (upload d'images)</label>
                  <div className="space-y-3">
                    {caseData.images && caseData.images.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {caseData.images.map((img, index) => (
                          <div
                            key={index}
                            className={`${existingItemMetaChipClass} max-w-full`}
                          >
                            <span className="font-semibold">Figure {index + 1}</span>
                            <span className="truncate max-w-[160px]" title={img}>{img}</span>
                            <button
                              type="button"
                              onClick={() => {
                                void handleRemoveCaseImage(index);
                              }}
                              className="ml-1 text-red-600 hover:text-red-800"
                              title="Supprimer la figure"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-300 w-fit">
                        {isUploading ? 'Téléchargement...' : 'Ajouter une figure'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleCaseImageUpload}
                          disabled={isUploading}
                        />
                      </label>
                      {isUploading && (
                        <p className="text-xs text-slate-500">Téléchargement de la figure : {uploadProgress}%</p>
                      )}
                    </div>
                  </div>
                </div>

                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="space-y-1">
                    <h4 className={sectionTitleClass}>Narratif clinique</h4>
                    <p className={sectionHintClass}>Rédigez un contexte précis et documentez vos références.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Description du cas clinique</label>
                  <textarea
                    value={caseData.description}
                    onChange={(e) => setCaseData({ ...caseData, description: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto min-h-[120px]"
                    placeholder="Décrivez brièvement le cas clinique (contexte, symptômes, éléments clés)..."
                  />
                  <p className="text-[11px] text-[var(--app-muted)]">
                    Markdown accepté: `-`, `+`, `1.`, `*italique*`, `**gras**`.
                  </p>
                </div>

                    <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Référence (optionnelle)</label>
                  <textarea
                    value={caseData.reference || ''}
                    onChange={(e) => setCaseData({ ...caseData, reference: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto min-h-[80px]"
                    placeholder="Article, ouvrage, lien ou source à citer..."
                  />
                </div>

                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="space-y-1">
                    <h4 className={sectionTitleClass}>Questions pédagogiques</h4>
                    <p className={sectionHintClass}>Composez des interactions progressives pour guider le raisonnement.</p>
                  </div>

                  <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Questions pédagogiques (optionnel)</label>
                      <p className="text-xs text-slate-500">
                        Ajoutez des QCM, sélecteurs ou QROC pour structurer le raisonnement clinique.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => addCaseQuestion('qcm')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Plus className="w-3 h-3" />
                        QCM
                      </button>
                      <button
                        type="button"
                        onClick={() => addCaseQuestion('select')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Plus className="w-3 h-3" />
                        Sélecteur
                      </button>
                      <button
                        type="button"
                        onClick={() => addCaseQuestion('open')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Plus className="w-3 h-3" />
                        QROC
                      </button>
                    </div>
                  </div>

                  {(caseData.questions || []).length > 0 && (
                    <div className="space-y-4">
                      {(caseData.questions || []).map((q: EditableCaseQuestion, index: number) => {
                        const kind: 'qcm' | 'select' | 'open' =
                          q.kind === 'select' || q.kind === 'open' ? q.kind : 'qcm';
                        const qcmMode: 'single' | 'multiple' = q.qcmMode === 'multiple' ? 'multiple' : 'single';
                        const options: string[] = Array.isArray(q.options) && q.options.length
                          ? normalizeCaseQuestionOptions(q.options)
                          : getDefaultCaseQuestionOptions();

                        return (
                          <div
                            key={q.id || index}
                            className="border border-[var(--app-border)] rounded-xl p-4 bg-[var(--app-surface-alt)] space-y-4"
                          >
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-slate-500 uppercase">
                                  Question {index + 1}
                                </span>
                                <select
                                  value={kind}
                                  onChange={(e) => changeCaseQuestionKind(index, e.target.value as 'qcm' | 'select' | 'open')}
                                  className="text-xs px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700"
                                  title="Type de question pédagogique"
                                  aria-label="Type de question pédagogique"
                                >
                                  <option value="qcm">QCM (cases à cocher)</option>
                                  <option value="select">Sélecteur (liste déroulante)</option>
                                  <option value="open">QROC</option>
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeCaseQuestion(index)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Supprimer la question"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-700">Énoncé de la question</label>
                                <textarea
                                  value={q.prompt || ''}
                                  onChange={(e) =>
                                    updateCaseQuestion(index, (current) => ({
                                      ...current,
                                      prompt: e.target.value
                                    }))
                                  }
                                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto text-sm min-h-[60px]"
                                  placeholder="Formulez la question que verra l'étudiant..."
                                />
                              </div>

                              {(kind === 'qcm' || kind === 'select') && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <label className="text-xs font-medium text-slate-700">Options de réponse</label>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateCaseQuestion(index, (current) => {
                                          const currentOptions = Array.isArray(current.options)
                                            ? [...current.options]
                                            : getDefaultCaseQuestionOptions();
                                          currentOptions.push('');
                                          return {
                                            ...current,
                                            options: currentOptions,
                                          };
                                        })
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                                    >
                                      <Plus className="h-3 w-3" />
                                      Ajouter une option
                                    </button>
                                  </div>
                                  {kind === 'qcm' && (
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-medium text-slate-700">Mode de correction</label>
                                      <select
                                        value={qcmMode}
                                        onChange={(e) => {
                                          const nextMode = e.target.value as 'single' | 'multiple';
                                          updateCaseQuestion(index, (current) => {
                                            const currentIndexes: number[] = Array.isArray(current.correctOptionIndexes)
                                              ? current.correctOptionIndexes
                                              : [];
                                            return {
                                              ...current,
                                              qcmMode: nextMode,
                                              correctOptionIndexes:
                                                nextMode === 'single'
                                                  ? (currentIndexes.length > 0 ? [currentIndexes[0]] : [])
                                                  : currentIndexes,
                                            };
                                          });
                                        }}
                                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700"
                                        title="Mode de correction QCM"
                                        aria-label="Mode de correction QCM"
                                      >
                                        <option value="single">Choix unique</option>
                                        <option value="multiple">Choix multiple</option>
                                      </select>
                                    </div>
                                  )}
                                  <div className="space-y-2">
                                    {options.map((_, optIndex: number) => {
                                      const optLabel = getOptionLabel(optIndex);
                                      return (
                                      <div key={`${q.id || index}-${optIndex}`} className="flex items-center gap-2">
                                        {kind === 'qcm' ? (
                                          qcmMode === 'single' ? (
                                            <input
                                              type="radio"
                                              name={`case-qcm-correct-${index}`}
                                              className="mt-0.5 h-4 w-4 text-medical-600 border-slate-300"
                                              checked={Array.isArray(q.correctOptionIndexes) && q.correctOptionIndexes.includes(optIndex)}
                                              onChange={() =>
                                                updateCaseQuestion(index, (current) => ({
                                                  ...current,
                                                  correctOptionIndexes: [optIndex],
                                                }))
                                              }
                                              title="Bonne réponse"
                                            />
                                          ) : (
                                            <input
                                              type="checkbox"
                                              className="mt-0.5 h-4 w-4 text-medical-600 border-slate-300 rounded"
                                              checked={Array.isArray(q.correctOptionIndexes) && q.correctOptionIndexes.includes(optIndex)}
                                              onChange={(e) => {
                                                const checked = e.target.checked;
                                                updateCaseQuestion(index, (current) => {
                                                  const currentIndexes: number[] = Array.isArray(current.correctOptionIndexes)
                                                    ? [...current.correctOptionIndexes]
                                                    : [];
                                                  if (checked) {
                                                    if (!currentIndexes.includes(optIndex)) {
                                                      currentIndexes.push(optIndex);
                                                    }
                                                  } else {
                                                    const pos = currentIndexes.indexOf(optIndex);
                                                    if (pos !== -1) {
                                                      currentIndexes.splice(pos, 1);
                                                    }
                                                  }
                                                  return {
                                                    ...current,
                                                    correctOptionIndexes: currentIndexes,
                                                  };
                                                });
                                              }}
                                              title="Marquer comme bonne réponse"
                                            />
                                          )
                                        ) : (
                                          <input
                                            type="radio"
                                            name={`case-select-correct-${index}`}
                                            className="mt-0.5 h-4 w-4 text-medical-600 border-slate-300"
                                            checked={typeof q.correctOptionIndex === 'number' && q.correctOptionIndex === optIndex}
                                            onChange={() =>
                                              updateCaseQuestion(index, (current) => ({
                                                ...current,
                                                correctOptionIndex: optIndex
                                              }))
                                            }
                                            title="Réponse correcte"
                                          />
                                        )}
                                        <span className="w-7 shrink-0 text-center text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-300 rounded-md py-1">
                                          {optLabel}
                                        </span>
                                        <input
                                          type="text"
                                          value={options[optIndex] || ''}
                                          onChange={(e) =>
                                            updateCaseQuestion(index, (current) => {
                                              const nextOptions: string[] = Array.isArray(current.options)
                                                ? [...current.options]
                                                : getDefaultCaseQuestionOptions();
                                              nextOptions[optIndex] = e.target.value;
                                              return {
                                                ...current,
                                                options: nextOptions
                                              };
                                            })
                                          }
                                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all text-sm"
                                          placeholder={`Option ${optLabel}`}
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateCaseQuestion(index, (current) => {
                                              const currentOptions = Array.isArray(current.options)
                                                ? [...current.options]
                                                : getDefaultCaseQuestionOptions();

                                              if (currentOptions.length <= 2) {
                                                return current;
                                              }

                                              const nextOptions = currentOptions.filter((_, idx) => idx !== optIndex);

                                              const nextQcmIndexes = Array.isArray(current.correctOptionIndexes)
                                                ? current.correctOptionIndexes
                                                    .filter((idx) => idx !== optIndex)
                                                    .map((idx) => (idx > optIndex ? idx - 1 : idx))
                                                : [];

                                              const rawCorrectSelect =
                                                typeof current.correctOptionIndex === 'number'
                                                  ? current.correctOptionIndex
                                                  : undefined;

                                              const nextCorrectSelect =
                                                rawCorrectSelect === undefined
                                                  ? undefined
                                                  : rawCorrectSelect === optIndex
                                                    ? undefined
                                                    : rawCorrectSelect > optIndex
                                                      ? rawCorrectSelect - 1
                                                      : rawCorrectSelect;

                                              return {
                                                ...current,
                                                options: nextOptions,
                                                correctOptionIndexes: nextQcmIndexes,
                                                correctOptionIndex: nextCorrectSelect,
                                              };
                                            })
                                          }
                                          disabled={options.length <= 2}
                                          className="rounded-lg border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                          title="Supprimer cette option"
                                          aria-label="Supprimer cette option"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    );})}
                                  </div>
                                  <p className="text-[11px] text-slate-500">
                                    {kind === 'qcm'
                                      ? (qcmMode === 'single'
                                        ? 'Choisissez une seule bonne réponse.'
                                        : 'Cochez une ou plusieurs bonnes réponses.')
                                      : 'Sélectionnez l’option correcte pour la liste déroulante.'} Minimum 2 options.
                                  </p>
                                </div>
                              )}

                              {kind === 'open' && (
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-slate-700">Réponse attendue</label>
                                  <textarea
                                    value={q.answer || ''}
                                    onChange={(e) =>
                                      updateCaseQuestion(index, (current) => ({
                                        ...current,
                                        answer: e.target.value
                                      }))
                                    }
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto text-sm min-h-[60px]"
                                    placeholder="Rédigez la réponse ou le corrigé qui pourra être affiché / masqué."
                                  />
                                </div>
                              )}

                              {(kind === 'qcm' || kind === 'select') && (
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-slate-700">Explication (optionnelle)</label>
                                  <textarea
                                    value={q.explanation || ''}
                                    onChange={(e) =>
                                      updateCaseQuestion(index, (current) => ({
                                        ...current,
                                        explanation: e.target.value
                                      }))
                                    }
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto text-sm min-h-[60px]"
                                    placeholder="Détaillez le raisonnement ou les points clés à rappeler."
                                  />
                                </div>
                              )}

                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-700">
                                  Figures associées à la question (optionnel)
                                </label>
                                <div className="space-y-2">
                                  {Array.isArray(q.images) && q.images.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {q.images.map((img: string, imgIndex: number) => (
                                        <div
                                          key={imgIndex}
                                          className={`${existingItemMetaChipClass} max-w-full`}
                                        >
                                          <span className="font-semibold">Figure {imgIndex + 1}</span>
                                          <span
                                            className="truncate max-w-[160px]"
                                            title={img}
                                          >
                                            {img}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              void handleRemoveCaseQuestionImage(index, imgIndex);
                                            }}
                                            className="ml-1 text-red-600 hover:text-red-800"
                                            title="Supprimer la figure"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <div className="flex flex-col gap-2">
                                    <label className="cursor-pointer inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-medium transition-colors border border-slate-300 w-fit">
                                      {isUploading ? 'Téléchargement...' : 'Ajouter une figure'}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handleCaseQuestionImageUpload(index, e)}
                                        disabled={isUploading}
                                      />
                                    </label>
                                    {isUploading && (
                                      <p className="text-[11px] text-slate-500">
                                        Téléchargement de la figure : {uploadProgress}%
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                </section>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void resetCaseForm();
                  }}
                  disabled={!hasCaseFormContent}
                  className="flex items-center gap-2 border border-slate-300 text-slate-700 px-6 py-3 rounded-xl font-medium hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <X className="w-5 h-5" />
                  {editingCaseId ? "Annuler" : "Annuler"}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 bg-medical-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-medical-700 transition-colors disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingCaseId ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </div>
            </form>

            <div className={listPanelClass}>
              <div className="space-y-4">
                <div className={listSummaryCardClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Cas cliniques existants</h3>
                      <p className="text-xs text-slate-500">Réorganisation orientée pratique clinique et supports disponibles.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {caseListStats.total}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={existingItemMetaChipClass}>Avec questions: {caseListStats.withQuestions}</span>
                    <span className={existingItemMetaChipClass}>Avec figures: {caseListStats.withImages}</span>
                    <span className={existingItemMetaChipClass}>
                      Sans figures: {Math.max(0, caseListStats.total - caseListStats.withImages)}
                    </span>
                  </div>
                </div>

                <div className={packGridClass}>
                  {orderedFilteredCases.map((c, index) => {
                    const videoTitle = videoTitleById.get(c.videoId) || 'Vidéo inconnue';
                    const questionCount = Array.isArray(c.questions) ? c.questions.length : 0;
                    const imageCount = Array.isArray(c.images) ? c.images.length : 0;

                    return (
                      <div key={c.id} className={`${existingItemRowClass} flex-col gap-3 md:flex-row md:items-start`}>
                        <div className="min-w-0 flex-1 space-y-2">
                          <h4 className="font-semibold text-slate-900 line-clamp-1">{c.title || `Cas clinique #${index + 1}`}</h4>
                          <div className="flex flex-wrap gap-2">
                            <span className={existingItemMetaChipClass}>Vidéo: {videoTitle}</span>
                            <span className={existingItemMetaChipClass}>Questions: {questionCount}</span>
                            <span className={existingItemMetaChipClass}>Figures: {imageCount}</span>
                            {c.reference && (
                              <span className="inline-flex items-center rounded-full border border-medical-200 bg-medical-50 px-2 py-1 text-[11px] font-medium text-medical-700">
                                Référence incluse
                              </span>
                            )}
                          </div>
                          {c.description && (
                            <MarkdownPreview content={c.description} />
                          )}
                        </div>
                        <div className="flex items-center gap-2 self-end md:self-start">
                          <button
                            onClick={() => handleEditCase(c)}
                            className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Modifier"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete('clinicalCases', c.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {orderedFilteredCases.length === 0 && (
                    <div className={listSummaryCardClass}>
                      <p className="text-slate-500 text-sm">
                        {normalizedSearch ? 'Aucun cas clinique ne correspond à la recherche.' : 'Aucun cas clinique trouvé.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'diagram' && (
          <div className={editorGridClass}>
            <form onSubmit={handleDiagramSubmit} className={formPanelClass}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{editingDiagramId ? 'Modifier le Schéma' : 'Ajouter un Schéma'}</h3>
                  <p className="text-sm text-slate-500 mb-6">Ajoutez un schéma anatomique ou radiologique lié à une vidéo.</p>
                </div>
              </div>

              <div className="space-y-5">
                <section className={sectionCardClass}>
                  <div className="space-y-1">
                    <h4 className={sectionTitleClass}>Cadrage du schéma</h4>
                    <p className={sectionHintClass}>Rattachez le visuel à une vidéo et renseignez les informations de contexte.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Vidéo associée</label>
                  <select
                    required
                    value={diagramData.videoId}
                    onChange={(e) => setDiagramData({...diagramData, videoId: e.target.value})}
                    title="Vidéo associée au schéma"
                    aria-label="Vidéo associée au schéma"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="" disabled>Sélectionner une vidéo...</option>
                    {videos.map(v => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                  {renderSelectedVideoPreview(diagramData.videoId)}
                </div>

                    <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Titre du schéma</label>
                  <input
                    type="text"
                    required
                    value={diagramData.title}
                    onChange={(e) => setDiagramData({...diagramData, title: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"
                    placeholder="Ex: Scanner des rochers..."
                  />
                </div>

                    <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Référence (optionnel)</label>
                  <input
                    type="text"
                    value={diagramData.reference}
                    onChange={(e) => setDiagramData({...diagramData, reference: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"
                    placeholder="Ex: TDM ORL - Article / Page / DOI"
                  />
                    </div>

                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="space-y-1">
                    <h4 className={sectionTitleClass}>Image principale</h4>
                    <p className={sectionHintClass}>Téléversez le schéma source qui recevra les annotations.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Schéma (upload d'image)</label>

                    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 space-y-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {diagramUploadFileName || (diagramData.imageUrl ? 'Schéma prêt pour annotation' : 'Aucun fichier sélectionné')}
                          </p>
                          <p className="text-xs text-slate-500">
                            {diagramUploadFileName
                              ? `${formatFileSize(diagramUploadFileSize)} - fichier source`
                              : diagramData.imageUrl
                                ? 'Le schéma source est disponible. Vous pouvez le remplacer à tout moment.'
                                : 'Formats recommandés: PNG, JPG, WEBP.'}
                          </p>
                        </div>

                        <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-medium transition-colors border w-fit ${
                          isDiagramUploading
                            ? 'bg-slate-100 text-slate-500 border-slate-300'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                        }`}>
                          {isDiagramUploading
                            ? (diagramUploadPhase === 'processing' ? 'Traitement serveur...' : 'Téléversement en cours...')
                            : (diagramData.imageUrl ? 'Remplacer le schéma' : 'Importer un schéma')}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleDiagramImageUpload}
                            disabled={isDiagramUploading}
                          />
                        </label>
                      </div>

                      {diagramUploadPhase !== 'idle' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-medium ${
                              diagramUploadPhase === 'error'
                                ? 'text-red-600'
                                : diagramUploadPhase === 'complete'
                                  ? 'text-emerald-700'
                                  : 'text-medical-700'
                            }`}>
                              {diagramUploadPhase === 'uploading' && 'Téléversement de l’image'}
                              {diagramUploadPhase === 'processing' && 'Traitement et enregistrement'}
                              {diagramUploadPhase === 'complete' && 'Image principale mise à jour'}
                              {diagramUploadPhase === 'error' && 'Échec du téléversement'}
                            </span>
                            <span className="font-semibold text-slate-700">{clampedDiagramUploadProgress}%</span>
                          </div>

                          <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                diagramUploadPhase === 'error'
                                  ? 'bg-red-500'
                                  : diagramUploadPhase === 'complete'
                                    ? 'bg-emerald-500'
                                    : 'bg-medical-600'
                              } ${diagramUploadProgressWidthClass}`}
                            />
                          </div>

                          <div className="flex flex-wrap gap-2 text-[11px]">
                            <span className={`rounded-full px-2 py-1 border ${
                              diagramUploadPhase === 'uploading' || diagramUploadPhase === 'processing' || diagramUploadPhase === 'complete'
                                ? 'border-medical-300 bg-medical-50 text-medical-700'
                                : 'border-slate-200 bg-white text-slate-500'
                            }`}>1. Téléversement</span>
                            <span className={`rounded-full px-2 py-1 border ${
                              diagramUploadPhase === 'processing' || diagramUploadPhase === 'complete'
                                ? 'border-medical-300 bg-medical-50 text-medical-700'
                                : 'border-slate-200 bg-white text-slate-500'
                            }`}>2. Traitement</span>
                            <span className={`rounded-full px-2 py-1 border ${
                              diagramUploadPhase === 'complete'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : diagramUploadPhase === 'error'
                                  ? 'border-red-300 bg-red-50 text-red-700'
                                  : 'border-slate-200 bg-white text-slate-500'
                            }`}>3. Terminé</span>
                          </div>
                        </div>
                      )}

                      {diagramData.imageUrl ? (
                        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-3">
                          <div className="flex items-start gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={diagramData.imageUrl}
                              alt={diagramData.title || 'Schéma principal'}
                              className="h-20 w-20 rounded-lg border border-[var(--app-border)] object-cover bg-[var(--app-surface)]"
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-xs font-semibold text-slate-700">Schéma actuel</p>
                              <p className="text-xs text-slate-500 truncate" title={diagramData.imageUrl}>{diagramData.imageUrl}</p>
                              <button
                                type="button"
                                onClick={() => {
                                  void handleRemoveDiagramImage();
                                }}
                                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
                              >
                                <X className="w-3 h-3" />
                                Supprimer le schéma
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                          Aucun schéma importé pour le moment.
                        </div>
                      )}
                    </div>
                  </div>

                </section>

                <section className={sectionCardClass}>
                  <div className="space-y-1">
                    <h4 className={sectionTitleClass}>Annotations et légendes</h4>
                    <p className={sectionHintClass}>Créez des marqueurs lisibles et des descriptions pédagogiques précises.</p>
                  </div>

                  <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Marqueurs (Légendes numérotées)</label>
                  <div className="space-y-4">
                    {diagramData.markers.map((marker, index) => (
                      <div key={index} className="flex gap-4 items-start p-4 bg-[var(--app-surface-alt)] border border-[var(--app-border)] rounded-xl">
                        <div className="flex-1 space-y-4">
                          <div className="flex gap-4 items-center">
                            <div className="w-24 px-4 py-2.5 rounded-xl bg-[var(--app-surface-2)] border border-[var(--app-border)] text-xs font-semibold text-[var(--app-text)] text-center">
                              N° {index + 1}
                            </div>
                            <input
                              type="text"
                              placeholder="Titre de la légende"
                              value={marker.label}
                              onChange={(e) => {
                                const newMarkers = [...diagramData.markers];
                                newMarkers[index].label = e.target.value;
                                setDiagramData({...diagramData, markers: newMarkers});
                              }}
                              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"
                            />
                          </div>
                          <textarea
                            placeholder="Description détaillée (optionnelle)"
                            value={marker.description}
                            onChange={(e) => {
                              const newMarkers = [...diagramData.markers];
                              newMarkers[index].description = e.target.value;
                              setDiagramData({...diagramData, markers: newMarkers});
                            }}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all resize-none overflow-y-auto min-h-[80px]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newMarkers = diagramData.markers
                              .filter((_, i) => i !== index)
                              .map((m, i2) => ({ ...m, number: i2 + 1 }));
                            setDiagramData({...diagramData, markers: newMarkers});
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer ce marqueur"
                          aria-label="Supprimer ce marqueur"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const nextMarkers = [
                          ...diagramData.markers,
                          { number: diagramData.markers.length + 1, x: 50, y: 50, label: '', description: '' },
                        ].map((m, i) => ({ ...m, number: i + 1 }));
                        setDiagramData({
                          ...diagramData,
                          markers: nextMarkers,
                        });
                      }}
                      className="flex items-center gap-2 text-medical-600 font-medium hover:text-medical-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Ajouter un marqueur
                    </button>
                  </div>
                  </div>
                </section>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void resetDiagramForm();
                  }}
                  disabled={!hasDiagramFormContent}
                  className="flex items-center gap-2 border border-slate-300 text-slate-700 px-6 py-3 rounded-xl font-medium hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <X className="w-5 h-5" />
                  {editingDiagramId ? "Annuler" : "Annuler"}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 bg-medical-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-medical-700 transition-colors disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingDiagramId ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </div>
            </form>

            <div className={listPanelClass}>
              <div className="space-y-4">
                <div className={listSummaryCardClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Schémas existants</h3>
                      <p className="text-xs text-slate-500">Catalogue visuel organisé par titre avec aperçu et densité d’annotations.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {diagramListStats.total}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={existingItemMetaChipClass}>Avec image: {diagramListStats.withImage}</span>
                    <span className={existingItemMetaChipClass}>
                      Sans image: {Math.max(0, diagramListStats.total - diagramListStats.withImage)}
                    </span>
                    <span className={existingItemMetaChipClass}>Total marqueurs: {diagramListStats.totalMarkers}</span>
                  </div>
                </div>

                <div className={packGridClass}>
                  {orderedFilteredDiagrams.map((d) => {
                    const videoTitle = videoTitleById.get(d.videoId) || 'Vidéo inconnue';
                    const markerCount = Array.isArray(d.markers) ? d.markers.length : 0;

                    return (
                      <div key={d.id} className={`${existingItemRowClass} flex-col gap-3 md:flex-row md:items-start`}>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-start gap-3">
                            {d.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={d.imageUrl}
                                alt={d.title || 'Schéma'}
                                className="h-14 w-14 rounded-lg border border-[var(--app-border)] object-cover bg-[var(--app-surface-2)]"
                              />
                            ) : (
                              <div className="h-14 w-14 rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-surface-alt)]" />
                            )}
                            <div className="min-w-0 space-y-1">
                              <h4 className="font-semibold text-slate-900 line-clamp-1">{d.title || 'Schéma sans titre'}</h4>
                              <div className="flex flex-wrap gap-2">
                                <span className={existingItemMetaChipClass}>Vidéo: {videoTitle}</span>
                                <span className={existingItemMetaChipClass}>Marqueurs: {markerCount}</span>
                                {d.reference && (
                                  <span className="inline-flex items-center rounded-full border border-medical-200 bg-medical-50 px-2 py-1 text-[11px] font-medium text-medical-700">
                                    Référence incluse
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 self-end md:self-start">
                          <button
                            onClick={() => handleEditDiagram(d)}
                            className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Modifier"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete('diagrams', d.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {orderedFilteredDiagrams.length === 0 && (
                    <div className={listSummaryCardClass}>
                      <p className="text-slate-500 text-sm">
                        {normalizedSearch ? 'Aucun schéma ne correspond à la recherche.' : 'Aucun schéma trouvé.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
