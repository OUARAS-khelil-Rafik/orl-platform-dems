import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unlink } from 'node:fs/promises';
import mongoose from 'mongoose';
import { authRequired } from '../middleware/auth.js';
import {
  destroyCloudinaryAsset,
  extractCloudinaryPublicId,
  inferCloudinaryResourceTypeFromUrl,
  uploadBufferToCloudinary,
  uploadFileToCloudinary,
  uploadLargeVideoToCloudinary,
} from '../config/cloudinary.js';
import { User } from '../models/User.js';

const router = express.Router();
const cloudinaryUpload = multer({
  storage: multer.diskStorage({}),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const MIN_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const TARGET_FILE_SIZE = 85 * 1024 * 1024; // 85MB
const CLOUDINARY_LIMIT = 100 * 1024 * 1024; // 100MB
const MAX_PARTS = 30;
const MAX_PARTS_TRANSCODE = 45;
const MAX_COPY_SPLIT_ATTEMPTS = 6;
const MAX_RETRIES = 3;
const UPLOAD_FOLDER = 'orl-platform';
const CLEANUP_MAX_ASSETS = 200;
const UPLOAD_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB
const PART_UPLOAD_CONCURRENCY = 3;
const MAX_RETRY_DELAY_MS = 8000;
const AVATAR_FOLDER_SEGMENT = '/orl-platform/avatars/';

const resolveContentCloudinaryOptions = (authUser) => {
  const isAdmin = authUser?.role === 'admin';
  return {
    preferUserConfig: true,
    allowGlobalFallback: !isAdmin,
  };
};

const isAvatarCloudinaryAsset = (entry) => {
  const publicId = String(entry?.publicId || '').trim().toLowerCase();
  const secureUrl = String(entry?.secureUrl || '').trim().toLowerCase();

  return (
    publicId.includes('orl-platform/avatars/')
    || secureUrl.includes(AVATAR_FOLDER_SEGMENT)
    || secureUrl.includes('/avatars/')
  );
};

const normalizeCleanupResourceType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'image' || normalized === 'video' || normalized === 'raw') {
    return normalized;
  }
  return null;
};

const normalizeCleanupAsset = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const secureUrl = String(entry.secureUrl || '').trim();
  const publicId = String(entry.publicId || '').trim() || extractCloudinaryPublicId(secureUrl);
  const resourceType =
    normalizeCleanupResourceType(entry.resourceType)
    || inferCloudinaryResourceTypeFromUrl(secureUrl)
    || null;

  if (!publicId && !secureUrl) {
    return null;
  }

  return {
    publicId,
    secureUrl,
    resourceType,
  };
};

const buildCleanupAssetKey = (entry) => {
  const normalized = normalizeCleanupAsset(entry);
  if (!normalized) {
    return '';
  }

  return `${normalized.publicId || ''}|${normalized.secureUrl || ''}|${normalized.resourceType || ''}`;
};

const verifyAssetUsageInMongo = async ({ publicId, secureUrl }) => {
  const db = mongoose.connection?.db;
  if (!db) {
    throw new Error('MongoDB is not connected. Unable to verify content usage.');
  }

  const usedBy = [];

  if (secureUrl) {
    const userMatch = await User.exists({ photoURL: secureUrl });
    if (userMatch) {
      usedBy.push('users.photoURL');
    }
  }

  const videoFilter = [];
  if (secureUrl) {
    videoFilter.push({ url: secureUrl }, { 'parts.secureUrl': secureUrl });
  }
  if (publicId) {
    videoFilter.push({ 'parts.publicId': publicId });
  }
  if (videoFilter.length > 0) {
    const videoMatch = await db.collection('videos').findOne(
      { $or: videoFilter },
      { projection: { _id: 1 } },
    );
    if (videoMatch) {
      usedBy.push('videos');
    }
  }

  if (secureUrl) {
    const caseMatch = await db.collection('clinicalCases').findOne(
      {
        $or: [{ images: secureUrl }, { 'questions.images': secureUrl }],
      },
      { projection: { _id: 1 } },
    );

    if (caseMatch) {
      usedBy.push('clinicalCases');
    }

    const diagramMatch = await db.collection('diagrams').findOne(
      { imageUrl: secureUrl },
      { projection: { _id: 1 } },
    );
    if (diagramMatch) {
      usedBy.push('diagrams');
    }
  }

  return {
    isReferenced: usedBy.length > 0,
    usedBy,
  };
};

const deleteCloudinaryAssetWithFallback = async ({
  publicId,
  resourceType,
  authUser,
  configOptions,
}) => {
  if (!publicId) {
    return {
      deleted: false,
      status: 'missing-public-id',
      resourceType: resourceType || null,
    };
  }

  const candidateTypes = resourceType ? [resourceType] : ['image', 'video', 'raw'];
  let lastError = null;
  let lastStatus = 'not found';

  for (const candidateType of candidateTypes) {
    try {
      const response = await destroyCloudinaryAsset({
        publicId,
        resourceType: candidateType,
        authUser,
        configOptions,
        invalidate: true,
      });

      const status = String(response?.result || '').trim().toLowerCase() || 'unknown';
      if (status === 'ok') {
        return {
          deleted: true,
          status,
          resourceType: candidateType,
        };
      }

      lastStatus = status;
      if (status !== 'not found') {
        return {
          deleted: false,
          status,
          resourceType: candidateType,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return {
    deleted: false,
    status: lastStatus,
    resourceType: resourceType || null,
  };
};

const execFileAsync = promisify(execFile);

const sanitizeBaseName = (name) => {
  return (
    String(name || '')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'video'
  );
};

const isRetryable = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const httpCode = Number(error?.http_code || 0);
  return (
    message.includes('timeout')
    || message.includes('timed out')
    || message.includes('socket hang up')
    || message.includes('econnreset')
    || message.includes('etimedout')
    || httpCode === 429
    || httpCode === 503
    || httpCode === 504
  );
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const computeRetryDelay = (attempt) => {
  const baseDelay = Math.min(MAX_RETRY_DELAY_MS, 1000 * (2 ** attempt));
  const jitter = Math.floor(Math.random() * 250);
  return baseDelay + jitter;
};

let ffmpegAvailabilityPromise = null;

const checkFFmpeg = async () => {
  if (!ffmpegAvailabilityPromise) {
    ffmpegAvailabilityPromise = (async () => {
      try {
        await execFileAsync('ffmpeg', ['-version']);
        await execFileAsync('ffprobe', ['-version']);
        return true;
      } catch {
        return false;
      }
    })();
  }

  return ffmpegAvailabilityPromise;
};

const getVideoDuration = async (filePath) => {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);

  return parseFloat(String(stdout || '').trim() || '0');
};

const listSplitParts = async (outputDir, baseName) => {
  return (await fs.readdir(outputDir))
    .filter((file) => file.startsWith(`${baseName}-part-`) && file.endsWith('.mp4'))
    .sort()
    .map((file) => path.join(outputDir, file));
};

const runSplitPass = async ({
  filePath,
  outputDir,
  baseName,
  segmentDuration,
  reencode,
}) => {
  const outputPattern = path.join(outputDir, `${baseName}-part-%03d.mp4`);

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const args = reencode
    ? [
      '-i',
      filePath,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '24',
      '-g',
      '48',
      '-keyint_min',
      '48',
      '-sc_threshold',
      '0',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-f',
      'segment',
      '-segment_time',
      String(segmentDuration),
      '-reset_timestamps',
      '1',
      '-avoid_negative_ts',
      'make_zero',
      outputPattern,
    ]
    : [
      '-i',
      filePath,
      '-c',
      'copy',
      '-f',
      'segment',
      '-segment_time',
      String(segmentDuration),
      '-reset_timestamps',
      '1',
      '-avoid_negative_ts',
      'make_zero',
      outputPattern,
    ];

  await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 10 });

  const parts = await listSplitParts(outputDir, baseName);
  if (parts.length === 0) {
    return {
      parts: [],
      maxPartSize: 0,
    };
  }

  const maxPartSize = parts.reduce((max, partPath) => {
    const size = fsSync.statSync(partPath).size;
    return size > max ? size : max;
  }, 0);

  return {
    parts,
    maxPartSize,
  };
};

const splitVideo = async (filePath, outputDir, baseName) => {
  const fileSize = fsSync.statSync(filePath).size;
  const duration = await getVideoDuration(filePath);

  const minSegmentsForCloudinaryLimit = Math.max(
    2,
    Math.ceil(fileSize / (CLOUDINARY_LIMIT * 0.9)),
  );

  let segments = Math.max(minSegmentsForCloudinaryLimit, Math.ceil(fileSize / TARGET_FILE_SIZE));
  if (segments > MAX_PARTS) {
    segments = MAX_PARTS;
  }

  while (segments > minSegmentsForCloudinaryLimit && fileSize / segments < MIN_FILE_SIZE) {
    segments -= 1;
  }

  let maxPartSize = 0;

  let currentSegments = Math.max(segments, minSegmentsForCloudinaryLimit);
  let attempts = 0;

  while (currentSegments <= MAX_PARTS && attempts < MAX_COPY_SPLIT_ATTEMPTS) {
    attempts += 1;
    const segmentDuration = duration > 0
      ? Math.max(1, Math.floor(duration / Math.max(currentSegments, 1)))
      : 1;

    const { parts, maxPartSize: currentMaxPartSize } = await runSplitPass({
      filePath,
      outputDir,
      baseName,
      segmentDuration,
      reencode: false,
    });
    if (parts.length === 0) {
      currentSegments = Math.min(MAX_PARTS, currentSegments + 1);
      continue;
    }

    maxPartSize = currentMaxPartSize;

    if (maxPartSize <= CLOUDINARY_LIMIT) {
      return parts;
    }

    const oversizeRatio = Math.max(1.05, maxPartSize / CLOUDINARY_LIMIT);
    const nextSegments = Math.ceil(currentSegments * Math.max(1.2, oversizeRatio * 1.15));
    currentSegments = Math.min(MAX_PARTS, Math.max(currentSegments + 1, nextSegments));
  }

  if (currentSegments < MAX_PARTS) {
    const segmentDuration = duration > 0
      ? Math.max(1, Math.floor(duration / Math.max(MAX_PARTS, 1)))
      : 1;

    const { parts, maxPartSize: currentMaxPartSize } = await runSplitPass({
      filePath,
      outputDir,
      baseName,
      segmentDuration,
      reencode: false,
    });

    if (parts.length > 0) {
      maxPartSize = currentMaxPartSize;
      if (maxPartSize <= CLOUDINARY_LIMIT) {
        return parts;
      }
    }
  }

  // Fallback: transcode with forced keyframe cadence to get predictable segment sizes.
  const transcodeSegmentsBase = Math.max(
    minSegmentsForCloudinaryLimit,
    Math.ceil(fileSize / (CLOUDINARY_LIMIT * 0.75)),
  );

  const transcodeSegmentCandidates = [
    Math.min(Math.max(transcodeSegmentsBase, segments), MAX_PARTS_TRANSCODE),
    MAX_PARTS_TRANSCODE,
  ].filter((value, index, array) => array.indexOf(value) === index);

  for (const currentSegments of transcodeSegmentCandidates) {
    const segmentDuration = duration > 0
      ? Math.max(1, Math.floor(duration / Math.max(currentSegments, 1)))
      : 1;

    const { parts, maxPartSize: currentMaxPartSize } = await runSplitPass({
      filePath,
      outputDir,
      baseName,
      segmentDuration,
      reencode: true,
    });

    if (parts.length === 0) {
      continue;
    }

    maxPartSize = currentMaxPartSize;
    if (maxPartSize <= CLOUDINARY_LIMIT) {
      return parts;
    }
  }

  const error = new Error(
    `Parts exceed 100MB limit (max part size: ${Math.round(maxPartSize / (1024 * 1024))}MB).`,
  );
  error.code = 'CLOUDINARY_PART_SIZE_LIMIT';
  throw error;
};

const uploadWithRetry = async ({
  filePath,
  folder,
  publicId,
  authUser,
  configOptions,
}) => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const result = await uploadLargeVideoToCloudinary({
        filePath,
        folder,
        filename: publicId,
        authUser,
        configOptions,
        chunkSize: UPLOAD_CHUNK_SIZE,
        maxRetries: 0,
      });
      return {
        result,
        publicId: result?.public_id || `${folder}/${publicId}`,
      };
    } catch (error) {
      if (attempt < MAX_RETRIES && isRetryable(error)) {
        await wait(computeRetryDelay(attempt));
        continue;
      }
      throw error;
    }
  }

  throw new Error('Upload failed after retries');
};

const uploadVideoPartsWithConcurrency = async ({
  parts,
  folder,
  basePublicId,
  authUser,
  configOptions,
}) => {
  if (!Array.isArray(parts) || parts.length === 0) {
    return [];
  }

  const concurrency = Math.max(
    1,
    Math.min(PART_UPLOAD_CONCURRENCY, parts.length),
  );

  const results = new Array(parts.length);
  let cursor = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;

      if (currentIndex >= parts.length) {
        return;
      }

      const partPublicId = `${basePublicId}-part-${String(currentIndex + 1).padStart(3, '0')}`;
      const uploaded = await uploadWithRetry({
        filePath: parts[currentIndex],
        folder,
        publicId: partPublicId,
        authUser,
        configOptions,
      });

      results[currentIndex] = {
        ...uploaded,
        filePath: parts[currentIndex],
      };
    }
  });

  await Promise.all(workers);
  return results;
};

const probeVideo = async (filePath) => {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration,bit_rate',
    '-show_entries',
    'stream=index,codec_type,codec_name,width,height,avg_frame_rate,bit_rate',
    '-of',
    'json',
    filePath,
  ]);

  const data = JSON.parse(String(stdout || '{}'));
  const streams = Array.isArray(data.streams) ? data.streams : [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  const audioStream = streams.find((stream) => stream.codec_type === 'audio');
  const format = data.format || {};

  const avgFrameRate = String(videoStream?.avg_frame_rate || '0/1');
  const [num, den] = avgFrameRate.split('/').map((value) => Number(value));
  const frameRate = den ? Math.round((num / den) * 1000) / 1000 : 0;

  return {
    duration: Number(format.duration || 0),
    width: Number(videoStream?.width || 0),
    height: Number(videoStream?.height || 0),
    videoCodec: videoStream?.codec_name,
    audioCodec: audioStream?.codec_name,
    frameRate,
    bitRate: Number(videoStream?.bit_rate || format.bit_rate || 0),
  };
};

const buildPartMetadataFromUpload = async ({ result, publicId, filePath }) => {
  const format = result?.format || path.extname(filePath).replace('.', '').toLowerCase();
  const cloudDuration = Number(result?.duration || 0);
  const cloudWidth = Number(result?.width || 0);
  const cloudHeight = Number(result?.height || 0);
  const cloudBitRate = Number(result?.bit_rate || 0);
  const cloudFrameRate = Number(result?.frame_rate || 0);
  const cloudVideoCodec = String(result?.video?.codec || '').trim();
  const cloudAudioCodec = String(result?.audio?.codec || '').trim();

  const missingCriticalMetadata = cloudDuration <= 0 || cloudWidth <= 0 || cloudHeight <= 0;
  const probe = missingCriticalMetadata ? await probeVideo(filePath) : null;

  const width = cloudWidth || probe?.width || 0;
  const height = cloudHeight || probe?.height || 0;
  const duration = cloudDuration || probe?.duration || 0;
  const secureUrl = result?.secure_url || result?.url || '';
  const fileSize = Number(result?.bytes || 0) || (await fs.stat(filePath)).size;

  return {
    publicId,
    secureUrl,
    format,
    duration,
    width,
    height,
    aspectRatio: width && height ? (width / height).toFixed(6) : undefined,
    bitRate: cloudBitRate || probe?.bitRate || undefined,
    frameRate: cloudFrameRate || probe?.frameRate || undefined,
    videoCodec: cloudVideoCodec || probe?.videoCodec || undefined,
    audioCodec: cloudAudioCodec || probe?.audioCodec || undefined,
    fileSize,
  };
};

const withSingleFile = (uploader) => {
  return (req, res, next) => {
    uploader.single('file')(req, res, (error) => {
      if (!error) {
        next();
        return;
      }

      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ message: 'Fichier trop volumineux pour cette operation.' });
        return;
      }

      res.status(400).json({ message: error.message || 'Invalid upload payload.' });
    });
  };
};

router.post('/cloudinary', authRequired, withSingleFile(cloudinaryUpload), async (req, res) => {
  let tempDir = '';
  let temporaryPath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'file is required.' });
    }

    temporaryPath = req.file.path;

    const resourceType = req.query.resourceType === 'video' ? 'video' : 'image';
    const folder = req.query.folder ? String(req.query.folder) : UPLOAD_FOLDER;
    const contentCloudinaryOptions = resolveContentCloudinaryOptions(req.authUser);

    let result;
    if (resourceType === 'video') {
      const baseName = sanitizeBaseName(req.file.originalname || req.file.filename || 'video');
      const uniqueSuffix = Date.now().toString(36);
      const basePublicId = `${baseName}-${uniqueSuffix}`;
      const fileSize = Number(req.file.size || fsSync.statSync(temporaryPath).size || 0);

      let partsResults = [];
      let isMultipart = false;

      if (fileSize <= CLOUDINARY_LIMIT) {
        const uploadResult = await uploadWithRetry({
          filePath: temporaryPath,
          folder,
          publicId: basePublicId,
          authUser: req.authUser,
          configOptions: contentCloudinaryOptions,
        });

        partsResults = [{ ...uploadResult, filePath: temporaryPath }];
      } else {
        isMultipart = true;

        const hasFFmpeg = await checkFFmpeg();
        if (!hasFFmpeg) {
          return res.status(500).json({ message: 'ffmpeg/ffprobe is not installed on the server.' });
        }

        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-upload-'));
        const outputDir = path.join(tempDir, 'split');
        await fs.mkdir(outputDir, { recursive: true });

        const parts = await splitVideo(temporaryPath, outputDir, basePublicId);

        partsResults = await uploadVideoPartsWithConcurrency({
          parts,
          folder,
          basePublicId,
          authUser: req.authUser,
          configOptions: contentCloudinaryOptions,
        });
      }

      const partsMetadata = await Promise.all(
        partsResults.map((part) =>
          buildPartMetadataFromUpload({
            result: part.result,
            publicId: part.publicId,
            filePath: part.filePath,
          }),
        ),
      );

      const primary = partsMetadata[0] || {};
      const totalDuration = partsMetadata.reduce((sum, part) => sum + (part.duration || 0), 0);
      const totalSize = partsMetadata.reduce((sum, part) => sum + (part.fileSize || 0), 0);

      return res.json({
        secureUrl: primary.secureUrl,
        publicId: primary.publicId,
        resourceType,
        uploadMode: isMultipart ? 'chunked-multipart-video' : 'chunked-single-video',
        isMultipart,
        totalParts: partsMetadata.length,
        duration: totalDuration,
        fileSize: totalSize,
        parts: isMultipart ? partsMetadata : [],
      });
    } else {
      result = await uploadFileToCloudinary({
        filePath: temporaryPath,
        folder,
        resourceType,
        filename: undefined,
        authUser: req.authUser,
        configOptions: contentCloudinaryOptions,
      });
    }

    return res.json({
      secureUrl: result.secure_url,
      publicId: result.public_id,
      resourceType,
      uploadMode: resourceType === 'video' ? 'chunked-single-video' : 'standard',
    });
  } catch (error) {
    const message = String(error?.message || 'Unable to upload file.');
    const lower = message.toLowerCase();
    const isTooLarge =
      lower.includes('requested resource too large')
      || lower.includes('file size too large')
      || lower.includes('parts exceed 100mb limit')
      || error?.code === 'CLOUDINARY_PART_SIZE_LIMIT'
      || Number(error?.http_code || 0) === 413;
    const isMissingCloudinaryConfig = lower.includes('cloudinary credentials are not configured');

    if (isMissingCloudinaryConfig && req.authUser?.role === 'admin') {
      return res.status(400).json({
        message:
          'Configuration Cloudinary admin manquante. Renseignez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET dans vos parametres avant de publier du contenu.',
      });
    }

    if (isTooLarge) {
      return res.status(413).json({
        message:
          'Cloudinary a refuse ce fichier car il depasse la taille autorisee pour ce compte. Compressez la video ou changez de plan Cloudinary.',
      });
    }

    return res.status(500).json({ message });
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
    if (temporaryPath) {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
});

router.post('/cleanup', authRequired, async (req, res) => {
  try {
    const rawAssets = Array.isArray(req.body?.assets) ? req.body.assets : [];
    if (rawAssets.length === 0) {
      return res.status(400).json({ message: 'assets must be a non-empty array.' });
    }

    if (rawAssets.length > CLEANUP_MAX_ASSETS) {
      return res.status(413).json({
        message: `Too many assets requested for cleanup. Maximum is ${CLEANUP_MAX_ASSETS}.`,
      });
    }

    const dedupeKeys = new Set();
    const assets = [];
    for (const entry of rawAssets) {
      const normalized = normalizeCleanupAsset(entry);
      if (!normalized) {
        continue;
      }

      const key = buildCleanupAssetKey(normalized);
      if (!key || dedupeKeys.has(key)) {
        continue;
      }

      dedupeKeys.add(key);
      assets.push(normalized);
    }

    if (assets.length === 0) {
      return res.status(400).json({ message: 'No valid Cloudinary assets were provided.' });
    }

    const results = [];

    for (const asset of assets) {
      try {
        const usage = await verifyAssetUsageInMongo(asset);
        if (usage.isReferenced) {
          results.push({
            ...asset,
            deleted: false,
            skipped: true,
            reason: 'still-referenced',
            usedBy: usage.usedBy,
          });
          continue;
        }

        if (!asset.publicId) {
          results.push({
            ...asset,
            deleted: false,
            skipped: true,
            reason: 'missing-public-id',
            usedBy: [],
          });
          continue;
        }

        const cleanupCloudinaryOptions = isAvatarCloudinaryAsset(asset)
          ? {
            preferUserConfig: false,
            allowGlobalFallback: true,
          }
          : {
            preferUserConfig: true,
            allowGlobalFallback: true,
          };

        const cleanupResult = await deleteCloudinaryAssetWithFallback({
          publicId: asset.publicId,
          resourceType: asset.resourceType,
          authUser: req.authUser,
          configOptions: cleanupCloudinaryOptions,
        });

        results.push({
          ...asset,
          deleted: cleanupResult.deleted,
          skipped: false,
          reason: cleanupResult.status,
          usedBy: [],
          deletedAs: cleanupResult.resourceType,
        });
      } catch (error) {
        results.push({
          ...asset,
          deleted: false,
          skipped: false,
          reason: String(error?.message || 'cleanup-failed'),
          usedBy: [],
        });
      }
    }

    const summary = {
      requested: assets.length,
      deleted: results.filter((entry) => entry.deleted).length,
      skippedInUse: results.filter((entry) => entry.reason === 'still-referenced').length,
      missingPublicId: results.filter((entry) => entry.reason === 'missing-public-id').length,
      notFound: results.filter((entry) => entry.reason === 'not found').length,
      failed: results.filter(
        (entry) => !entry.deleted && !entry.skipped && entry.reason !== 'not found',
      ).length,
    };

    return res.json({
      results,
      summary,
    });
  } catch (error) {
    return res.status(500).json({
      message: error?.message || 'Unable to cleanup Cloudinary assets.',
    });
  }
});

router.post('/avatar', authRequired, withSingleFile(avatarUpload), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'file is required.' });
    }

    const result = await uploadBufferToCloudinary({
      buffer: req.file.buffer,
      folder: `orl-platform/avatars/${req.authUser.uid}`,
      resourceType: 'image',
      filename: undefined,
      authUser: req.authUser,
      configOptions: {
        preferUserConfig: false,
        allowGlobalFallback: true,
      },
    });

    return res.json({
      secureUrl: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to upload avatar.' });
  }
});

export default router;
