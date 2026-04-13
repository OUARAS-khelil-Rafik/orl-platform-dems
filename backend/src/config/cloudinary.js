import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

export const hasCloudinaryConfig = (config) => {
  return Boolean(config?.cloudName && config?.apiKey && config?.apiSecret);
};

export const resolveCloudinaryConfig = (authUser) => {
  const userConfig = authUser?.cloudinary;

  if (hasCloudinaryConfig(userConfig)) {
    return {
      cloud_name: userConfig.cloudName,
      api_key: userConfig.apiKey,
      api_secret: userConfig.apiSecret,
    };
  }

  if (hasCloudinaryConfig(env.cloudinary)) {
    return {
      cloud_name: env.cloudinary.cloudName,
      api_key: env.cloudinary.apiKey,
      api_secret: env.cloudinary.apiSecret,
    };
  }

  return null;
};

export const uploadBufferToCloudinary = async ({ buffer, folder, resourceType, filename, authUser }) => {
  const config = resolveCloudinaryConfig(authUser);
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

export const uploadFileToCloudinary = async ({ filePath, folder, resourceType, filename, authUser }) => {
  const config = resolveCloudinaryConfig(authUser);
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
      uploader.upload_large(
        filePath,
        {
          folder,
          resource_type: 'video',
          public_id: filename,
          chunk_size: 20 * 1024 * 1024,
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
      },
      callback,
    );
  });
};

const isRetryableCloudinaryError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const httpCode = Number(error?.http_code || 0);
  return message.includes('timeout') || httpCode === 429 || httpCode === 503 || httpCode === 504;
};

export const uploadLargeVideoToCloudinary = async ({
  filePath,
  folder,
  filename,
  authUser,
  chunkSize,
  maxRetries = 3,
}) => {
  const config = resolveCloudinaryConfig(authUser);
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

export const destroyCloudinaryAsset = async ({
  publicId,
  resourceType = 'image',
  authUser,
  invalidate = true,
}) => {
  const config = resolveCloudinaryConfig(authUser);
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
