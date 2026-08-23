import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

export const hasCloudinaryConfig = (config) => {
  return Boolean(config?.cloudName && config?.apiKey && config?.apiSecret);
};

const toCloudinaryApiConfig = (config) => {
  return {
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
  };
};

export const resolveCloudinaryConfig = (
  authUser,
  {
    preferUserConfig = true,
    allowGlobalFallback = true,
  } = {},
) => {
  const userConfig = authUser?.cloudinary;

  if (preferUserConfig && hasCloudinaryConfig(userConfig)) {
    return toCloudinaryApiConfig(userConfig);
  }

  if (allowGlobalFallback && hasCloudinaryConfig(env.cloudinary)) {
    return toCloudinaryApiConfig(env.cloudinary);
  }

  return null;
};

const normalizeApiResourceType = (resourceType) => {
  if (resourceType === 'raw') {
    return 'raw';
  }
  if (resourceType === 'video') {
    return 'video';
  }
  return 'image';
};

const getCloudinaryErrorHttpCode = (error) => {
  return Number(error?.http_code || error?.error?.http_code || 0);
};

const getCloudinaryErrorMessage = (error) => {
  return String(error?.message || error?.error?.message || '').trim();
};

const isCloudinaryNotFound = (error) => {
  const httpCode = getCloudinaryErrorHttpCode(error);
  const message = getCloudinaryErrorMessage(error).toLowerCase();
  return httpCode === 404 || message.includes('not found');
};

export const cloudinaryAssetExists = async ({
  publicId,
  resourceType = 'image',
  authUser,
  configOptions,
}) => {
  const config = resolveCloudinaryConfig(authUser, configOptions);
  if (!config) {
    throw new Error('Cloudinary credentials are not configured for this account.');
  }

  const normalizedPublicId = String(publicId || '').trim();
  if (!normalizedPublicId) {
    return false;
  }

  cloudinary.config(config);

  try {
    await cloudinary.api.resource(normalizedPublicId, {
      resource_type: normalizeApiResourceType(resourceType),
      type: 'upload',
    });
    return true;
  } catch (error) {
    if (isCloudinaryNotFound(error)) {
      return false;
    }
    throw error;
  }
};

export const cloudinaryAssetsExistByPrefix = async ({
  prefix,
  resourceType = 'video',
  maxResults = 1,
  authUser,
  configOptions,
}) => {
  const config = resolveCloudinaryConfig(authUser, configOptions);
  if (!config) {
    throw new Error('Cloudinary credentials are not configured for this account.');
  }

  const normalizedPrefix = String(prefix || '').trim();
  if (!normalizedPrefix) {
    return false;
  }

  const safeMaxResults = Math.max(1, Math.min(10, Number(maxResults || 1)));

  cloudinary.config(config);

  const response = await cloudinary.api.resources({
    resource_type: normalizeApiResourceType(resourceType),
    type: 'upload',
    prefix: normalizedPrefix,
    max_results: safeMaxResults,
  });

  return Array.isArray(response?.resources) && response.resources.length > 0;
};

export const uploadBufferToCloudinary = async ({
  buffer,
  folder,
  resourceType,
  filename,
  format,
  authUser,
  configOptions,
}) => {
  const config = resolveCloudinaryConfig(authUser, configOptions);
  if (!config) {
    throw new Error('Cloudinary credentials are not configured for this account.');
  }

  cloudinary.config(config);
  const uploader = cloudinary.uploader;

  return new Promise((resolve, reject) => {
    const stream = uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        public_id: filename,
        ...(format ? { format } : {}),
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      },
    );

    stream.end(buffer);
  });
};

export const uploadFileToCloudinary = async ({
  filePath,
  folder,
  resourceType,
  filename,
  authUser,
  configOptions,
}) => {
  const config = resolveCloudinaryConfig(authUser, configOptions);
  if (!config) {
    throw new Error('Cloudinary credentials are not configured for this account.');
  }

  cloudinary.config(config);
  const uploader = cloudinary.uploader;

  return new Promise((resolve, reject) => {
    const callback = (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };

    if (resourceType === 'video') {
      uploader.upload(
        filePath,
        {
          folder,
          resource_type: 'video',
          public_id: filename,
          timeout: 600000,
          overwrite: false,
        },
        callback,
      );
      return;
    }

    uploader.upload(
      filePath,
      {
        folder,
        resource_type: resourceType,
        public_id: filename,
        overwrite: false,
      },
      callback,
    );
  });
};

const isRetryableCloudinaryError = (error) => {
  const message = getCloudinaryErrorMessage(error).toLowerCase();
  const httpCode = getCloudinaryErrorHttpCode(error);
  return message.includes('timeout') || httpCode === 429 || httpCode === 503 || httpCode === 504;
};

export const uploadLargeVideoToCloudinary = async ({
  filePath,
  folder,
  filename,
  authUser,
  configOptions,
  chunkSize,
  maxRetries = 3,
}) => {
  const config = resolveCloudinaryConfig(authUser, configOptions);
  if (!config) {
    throw new Error('Cloudinary credentials are not configured for this account.');
  }

  cloudinary.config(config);
  const uploader = cloudinary.uploader;

  const MIN_CLOUDINARY_CHUNK = 5 * 1024 * 1024;
  const MAX_CLOUDINARY_CHUNK = 95 * 1024 * 1024;
  const DEFAULT_CLOUDINARY_CHUNK = 6 * 1024 * 1024;
  const requestedChunk = Number(chunkSize || DEFAULT_CLOUDINARY_CHUNK);
  const safeChunkSize = Math.max(
    MIN_CLOUDINARY_CHUNK,
    Math.min(requestedChunk, MAX_CLOUDINARY_CHUNK),
  );

  const uploadOnce = () => {
    return new Promise((resolve, reject) => {
      uploader.upload_large(
        filePath,
        {
          resource_type: 'video',
          folder,
          public_id: filename,
          chunk_size: safeChunkSize,
          timeout: 600000,
          overwrite: false,
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(result);
        },
      );
    });
  };

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await uploadOnce();
    } catch (error) {
      if (attempt < maxRetries && isRetryableCloudinaryError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Video upload failed after retries.');
};

export const inferCloudinaryResourceTypeFromUrl = (secureUrl) => {
  const normalized = String(secureUrl || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('/video/upload/')) {
    return 'video';
  }
  if (normalized.includes('/image/upload/')) {
    return 'image';
  }
  if (normalized.includes('/raw/upload/')) {
    return 'raw';
  }

  return null;
};

export const extractCloudinaryPublicId = (secureUrl) => {
  const raw = String(secureUrl || '').trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = new URL(raw);
    if (!/res\.cloudinary\.com$/i.test(parsed.hostname)) {
      return '';
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const uploadIndex = segments.findIndex((segment) => segment === 'upload');
    if (uploadIndex === -1) {
      return '';
    }

    let startIndex = uploadIndex + 1;

    // Skip optional transformation segments until version marker when present.
    while (startIndex < segments.length && !/^v\d+$/i.test(segments[startIndex])) {
      const value = segments[startIndex];
      const hasTransformToken = value.includes(',') || value.includes('_');
      if (!hasTransformToken) {
        break;
      }
      startIndex += 1;
    }

    if (startIndex < segments.length && /^v\d+$/i.test(segments[startIndex])) {
      startIndex += 1;
    }

    const publicPath = segments.slice(startIndex).join('/');
    if (!publicPath) {
      return '';
    }

    return decodeURIComponent(publicPath).replace(/\.[^./]+$/, '');
  } catch {
    return '';
  }
};

// ─────────────────────────────────────────────────────────────
// Organisation des dossiers Cloudinary par spécialité / vidéo
// Structure cible : orl-platform/<specialite>/<videoSlug>[/<subFolder>]
// ex: orl-platform/otologie/anatomie-oreille-moyenne/videos
//     orl-platform/rhinologie/sinusite-aigue/cases
//     orl-platform/laryngologie/dysphonie/diagrams
// ─────────────────────────────────────────────────────────────
export const sanitizeCloudinaryFolderSegment = (value, fallback = '') => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  // Limite à 80 caractères pour éviter des chemins trop longs
  const truncated = normalized.slice(0, 80).replace(/-+$/g, '');
  return truncated || fallback;
};

export const sanitizeCloudinaryFolderPath = (folder, fallback = 'orl-platform') => {
  const raw = String(folder || '').trim();
  if (!raw) return fallback;
  const parts = raw
    .split('/')
    .map((seg) => sanitizeCloudinaryFolderSegment(seg, ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join('/') : fallback;
};

export const buildCloudinaryOrganizedFolder = ({
  specialty,
  videoTitle,
  videoSlug,
  subFolder = '',
  baseFolder = 'orl-platform',
} = {}) => {
  const base = sanitizeCloudinaryFolderSegment(baseFolder, 'orl-platform');
  const specialtySlug = sanitizeCloudinaryFolderSegment(specialty, '');
  const resolvedVideoSlug =
    sanitizeCloudinaryFolderSegment(videoSlug, '') ||
    sanitizeCloudinaryFolderSegment(videoTitle, '');
  const subParts = String(subFolder || '')
    .split('/')
    .map((seg) => sanitizeCloudinaryFolderSegment(seg, ''))
    .filter(Boolean);

  const segments = [base];
  if (specialtySlug) segments.push(specialtySlug);
  if (resolvedVideoSlug) segments.push(resolvedVideoSlug);
  if (subParts.length > 0) segments.push(...subParts);

  return segments.join('/');
};

export const resolveOrganizedCloudinaryFolder = ({
  folder,
  specialty,
  videoTitle,
  videoSlug,
  subFolder,
  resourceType,
  fallbackBase = 'orl-platform',
} = {}) => {
  const hasOrganizedHints = Boolean(
    String(specialty || '').trim() ||
      String(videoTitle || '').trim() ||
      String(videoSlug || '').trim() ||
      String(subFolder || '').trim(),
  );

  if (hasOrganizedHints) {
    let inferredSub = String(subFolder || '').trim();
    if (!inferredSub && folder) {
      const legacy = String(folder).toLowerCase();
      if (legacy.includes('case-question')) inferredSub = 'cases/questions';
      else if (legacy.includes('case-images') || legacy.includes('cases')) inferredSub = 'cases';
      else if (legacy.includes('diagrams')) inferredSub = 'diagrams';
      else if (legacy.includes('support-chat')) inferredSub = 'support-chat';
      else if (legacy.includes('avatars')) inferredSub = 'avatars';
    }
    // Pour les vidéos on garde le dossier racine de la vidéo sans sous-dossier supplémentaire
    // (la vidéo + ses parts vivent dans orl-platform/<spec>/<videoSlug>)
    // Les callers qui veulent un sous-dossier pour les images précisent subFolder explicitement.
    return buildCloudinaryOrganizedFolder({
      specialty,
      videoTitle,
      videoSlug,
      subFolder: inferredSub,
      baseFolder: fallbackBase,
    });
  }

  return sanitizeCloudinaryFolderPath(folder, fallbackBase);
};

export const destroyCloudinaryAsset = async ({
  publicId,
  resourceType = 'image',
  authUser,
  configOptions,
  invalidate = true,
}) => {
  const config = resolveCloudinaryConfig(authUser, configOptions);
  if (!config) {
    throw new Error('Cloudinary credentials are not configured for this account.');
  }

  const normalizedPublicId = String(publicId || '').trim();
  if (!normalizedPublicId) {
    throw new Error('publicId is required to delete a Cloudinary asset.');
  }

  cloudinary.config(config);
  return cloudinary.uploader.destroy(normalizedPublicId, {
    resource_type: resourceType,
    invalidate,
    type: 'upload',
  });
};
