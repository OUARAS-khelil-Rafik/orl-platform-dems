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
const TARGET_FILE_SIZE = 70 * 1024 * 1024; // 70MB
const CLOUDINARY_LIMIT = 100 * 1024 * 1024; // 100MB
const MAX_PARTS = 20;
const MAX_RETRIES = 3;
const UPLOAD_FOLDER = 'orl-platform';
const CLEANUP_MAX_ASSETS = 200;

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

const deleteCloudinaryAssetWithFallback = async ({ publicId, resourceType, authUser }) => {
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
  return message.includes('timeout') || httpCode === 503 || httpCode === 504;
};

const checkFFmpeg = async () => {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    await execFileAsync('ffprobe', ['-version']);
    return true;
  } catch {
    return false;
  }
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

const splitVideo = async (filePath, outputDir, baseName) => {
  const fileSize = fsSync.statSync(filePath).size;
  const duration = await getVideoDuration(filePath);

  let segments = Math.ceil(fileSize / TARGET_FILE_SIZE);
  if (segments > MAX_PARTS) {
    segments = MAX_PARTS;
  }
  while (segments > 1 && fileSize / segments < MIN_FILE_SIZE) {
    segments -= 1;
  }

  const segmentDuration = Math.max(1, Math.floor(duration / Math.max(segments, 1)));
  const outputPattern = path.join(outputDir, `${baseName}-part-%03d.mp4`);

  await execFileAsync(
    'ffmpeg',
    [
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
    ],
    { maxBuffer: 1024 * 1024 * 10 },
  );

  const parts = (await fs.readdir(outputDir))
    .filter((file) => file.startsWith(`${baseName}-part-`) && file.endsWith('.mp4'))
    .sort()
    .map((file) => path.join(outputDir, file));

  const oversized = parts.some((part) => fsSync.statSync(part).size > CLOUDINARY_LIMIT);
  if (oversized) {
    throw new Error('Parts exceed 100MB limit');
  }

  return parts;
};

const uploadWithRetry = async ({ filePath, folder, publicId, authUser }) => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const result = await uploadLargeVideoToCloudinary({
        filePath,
        folder,
        filename: publicId,
        authUser,
        chunkSize: 6 * 1024 * 1024,
        maxRetries: 0,
      });
      return {
        result,
        publicId: result?.public_id || `${folder}/${publicId}`,
      };
    } catch (error) {
      if (attempt < MAX_RETRIES && isRetryable(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Upload failed after retries');
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
  const stats = await fs.stat(filePath);
  const probe = await probeVideo(filePath);
  const format = result?.format || path.extname(filePath).replace('.', '').toLowerCase();
  const width = result?.width || probe.width;
  const height = result?.height || probe.height;
  const duration = result?.duration || probe.duration;
  const secureUrl = result?.secure_url || result?.url || '';

  return {
    publicId,
    secureUrl,
    format,
    duration,
    width,
    height,
    aspectRatio: width && height ? (width / height).toFixed(6) : undefined,
    bitRate: result?.bit_rate || probe.bitRate || undefined,
    frameRate: result?.frame_rate || probe.frameRate || undefined,
    videoCodec: result?.video?.codec || probe.videoCodec,
    audioCodec: result?.audio?.codec || probe.audioCodec,
    fileSize: result?.bytes || stats.size,
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

    let result;
    if (resourceType === 'video') {
      const hasFFmpeg = await checkFFmpeg();
      if (!hasFFmpeg) {
        return res.status(500).json({ message: 'ffmpeg/ffprobe is not installed on the server.' });
      }

      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-upload-'));

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
        });

        partsResults = [{ ...uploadResult, filePath: temporaryPath }];
      } else {
        isMultipart = true;
        const outputDir = path.join(tempDir, 'split');
        await fs.mkdir(outputDir, { recursive: true });

        const parts = await splitVideo(temporaryPath, outputDir, basePublicId);
        const uploads = [];

        for (let i = 0; i < parts.length; i += 1) {
          const partPublicId = `${basePublicId}-part-${String(i + 1).padStart(3, '0')}`;
          uploads.push(
            uploadWithRetry({
              filePath: parts[i],
              folder,
              publicId: partPublicId,
              authUser: req.authUser,
            }).then((uploaded) => ({ ...uploaded, filePath: parts[i] })),
          );
        }

        partsResults = await Promise.all(uploads);
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
      || Number(error?.http_code || 0) === 413;

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

        const cleanupResult = await deleteCloudinaryAssetWithFallback({
          publicId: asset.publicId,
          resourceType: asset.resourceType,
          authUser: req.authUser,
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
