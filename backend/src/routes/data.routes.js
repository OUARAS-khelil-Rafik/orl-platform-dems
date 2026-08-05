import express from 'express';
import { ObjectId } from 'mongodb';
import mongoose from 'mongoose';
import { authOptional, authRequired, adminRequired } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { isCloudinarySettingsDoc, normalizeCollectionName } from '../utils/collection-name.js';
import { uploadBufferToCloudinary } from '../config/cloudinary.js';

const router = express.Router();

const isUsersCollection = (collection) => normalizeCollectionName(collection) === 'users';

const parseDoc = (doc) => {
  if (!doc) {
    return null;
  }

  const { _id, ...rest } = doc;
  return {
    id: String(_id),
    data: rest,
  };
};

const isNamespaceNotFoundError = (error) => {
  const code = Number(error?.code);
  const codeName = String(error?.codeName || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();

  if (code === 26 || codeName === 'namespacenotfound') {
    return true;
  }

  return (
    (message.includes('namespace') && message.includes('not found')) ||
    message.includes('ns does not exist')
  );
};

const findCollectionDocsOrEmpty = async ({ db, collection, filter = {} }) => {
  try {
    return await db.collection(collection).find(filter).toArray();
  } catch (error) {
    if (isNamespaceNotFoundError(error)) {
      return [];
    }
    throw error;
  }
};

const toMongoFilter = (constraints = []) => {
  const filter = {};

  for (const constraint of constraints) {
    if (!constraint || !constraint.fieldPath) {
      continue;
    }

    if (constraint.operator === 'array-contains') {
      filter[constraint.fieldPath] = { $in: [constraint.value] };
    } else {
      filter[constraint.fieldPath] = constraint.value;
    }
  }

  return filter;
};

const applyUpdateOperators = (updates = {}) => {
  const setOps = {};
  const addToSetOps = {};
  const pullOps = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value && typeof value === 'object' && value.__op === 'arrayUnion' && Array.isArray(value.values)) {
      addToSetOps[key] = { $each: value.values };
      continue;
    }

    if (value && typeof value === 'object' && value.__op === 'arrayRemove' && Array.isArray(value.values)) {
      pullOps[key] = { $in: value.values };
      continue;
    }

    setOps[key] = value;
  }

  const result = {};
  if (Object.keys(setOps).length > 0) {
    result.$set = setOps;
  }
  if (Object.keys(addToSetOps).length > 0) {
    result.$addToSet = addToSetOps;
  }
  if (Object.keys(pullOps).length > 0) {
    result.$pull = pullOps;
  }

  return result;
};

const DUPLICATE_GUARDED_COLLECTIONS = new Set([
  'videos',
  'qcms',
  'openQuestions',
  'clinicalCases',
  'diagrams',
]);

const CONTENT_NOTIFICATION_COLLECTIONS = new Set([
  'videos',
  'qcms',
  'openQuestions',
  'clinicalCases',
  'diagrams',
]);

class DuplicateDataError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'DuplicateDataError';
    this.code = code;
    this.details = details;
    this.statusCode = 409;
  }
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeComparableText = (value) => {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

const trimStringIfNeeded = (value) => {
  return typeof value === 'string' ? value.trim() : value;
};

const dedupeStringArray = (values = []) => {
  const seen = new Set();
  const output = [];

  for (const entry of values) {
    const normalized = String(entry ?? '').trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
};

const truthyAnswerValues = new Set(['true', 'vrai', 'yes', 'oui', '1', 'x']);
const falseyAnswerValues = new Set(['false', 'faux', 'no', 'non', '0']);

const normalizeImportedAnswer = (value) => {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return false;
  }

  if (truthyAnswerValues.has(normalized)) {
    return true;
  }

  if (falseyAnswerValues.has(normalized)) {
    return false;
  }

  return false;
};

const normalizeImportedQcmMode = (value, correctOptionIndexes = []) => {
  const normalized = normalizeComparableText(value);
  if (
    normalized.includes('multiple') ||
    normalized.includes('plusieurs') ||
    correctOptionIndexes.length > 1
  ) {
    return 'multiple';
  }

  return 'single';
};

const normalizeImportedQcmRow = (row, rowIndex) => {
  if (!isPlainObject(row)) {
    return {
      error: {
        rowIndex,
        message: 'Ligne invalide.',
      },
    };
  }

  const videoTitle = String(row.videoTitle || '').trim();
  const question = String(row.question || '').trim();
  const rawOptions = Array.isArray(row.options) ? row.options : [];
  const options = rawOptions
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
  const importedCorrectIndexes = Array.isArray(row.correctOptionIndexes)
    ? row.correctOptionIndexes
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry < options.length)
    : [];
  const correctOptionIndexes = importedCorrectIndexes.length > 0
    ? Array.from(new Set(importedCorrectIndexes))
    : rawOptions
        .map((_, index) => (normalizeImportedAnswer(row.answers?.[index]) ? index : -1))
        .filter((index) => index >= 0 && index < options.length);

  if (!videoTitle) {
    return {
      error: {
        rowIndex,
        message: 'Nom vidéo manquant.',
      },
    };
  }

  if (!question) {
    return {
      error: {
        rowIndex,
        videoTitle,
        message: 'Énoncé manquant.',
      },
    };
  }

  if (options.length < 2) {
    return {
      error: {
        rowIndex,
        videoTitle,
        question,
        message: 'Au moins deux options sont requises.',
      },
    };
  }

  if (correctOptionIndexes.length === 0) {
    return {
      error: {
        rowIndex,
        videoTitle,
        question,
        message: 'Aucune bonne réponse détectée.',
      },
    };
  }

  const mode = normalizeImportedQcmMode(row.qcmType, correctOptionIndexes);
  const normalizedCorrectOptionIndexes = mode === 'single'
    ? [correctOptionIndexes[0]]
    : correctOptionIndexes;

  return {
    row: {
      videoTitle,
      question,
      options,
      mode,
      correctOptionIndexes: normalizedCorrectOptionIndexes,
      correctOptionIndex: normalizedCorrectOptionIndexes[0] || 0,
      explanation: String(row.explanation || '').trim(),
      reference: String(row.reference || '').trim(),
      qcmNumber: String(row.qcmNumber || '').trim(),
    },
  };
};

const normalizeImportedOpenQuestionRow = (row, rowIndex) => {
  if (!isPlainObject(row)) {
    return {
      error: {
        rowIndex,
        message: 'Ligne invalide.',
      },
    };
  }

  const videoTitle = String(row.videoTitle || '').trim();
  const question = String(row.question || '').trim();
  const answer = String(row.answer || '').trim();

  if (!videoTitle) {
    return {
      error: {
        rowIndex,
        message: 'Nom vidéo manquant.',
      },
    };
  }

  if (!question) {
    return {
      error: {
        rowIndex,
        videoTitle,
        message: 'Énoncé manquant.',
      },
    };
  }

  if (!answer) {
    return {
      error: {
        rowIndex,
        videoTitle,
        question,
        message: 'Réponse manquante.',
      },
    };
  }

  return {
    row: {
      videoTitle,
      question,
      answer,
      reference: String(row.reference || '').trim(),
      qrocNumber: String(row.qrocNumber || '').trim(),
    },
  };
};

const splitImportedLinks = (value) => {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const createImportedQuestionId = (prefix, index) => {
  return `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
};

const toSafeCloudinaryName = (value, fallback = 'import') => {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return normalized || fallback;
};

const normalizeImportedClinicalCaseRows = (rows) => {
  const casesByKey = new Map();
  const invalidRows = [];
  let questionCounter = 0;

  rows.forEach((row, index) => {
    const rowIndex = index + 1;
    if (!isPlainObject(row)) {
      invalidRows.push({ rowIndex, message: 'Ligne invalide.' });
      return;
    }

    const videoTitle = String(row.videoTitle || '').trim();
    const caseNumber = String(row.caseNumber || '').trim();
    const description = String(row.description || '').trim();
    const reference = String(row.reference || '').trim();
    const caseImageLinks = splitImportedLinks(row.imageLinks);

    if (!videoTitle) {
      invalidRows.push({ rowIndex, message: 'Nom vidéo manquant.' });
      return;
    }

    if (!caseNumber && !description) {
      invalidRows.push({ rowIndex, videoTitle, message: 'Numéro ou énoncé du cas clinique manquant.' });
      return;
    }

    const caseKey = [
      normalizeComparableText(videoTitle),
      normalizeComparableText(caseNumber || description),
    ].join('|');

    if (!casesByKey.has(caseKey)) {
      const fallbackNumber = casesByKey.size + 1;
      const title = caseNumber
        ? `Cas clinique ${caseNumber} — ${videoTitle}`
        : `Cas clinique ${fallbackNumber} — ${videoTitle}`;

      casesByKey.set(caseKey, {
        videoTitle,
        caseNumber,
        title,
        description,
        reference,
        imageLinks: caseImageLinks,
        questions: [],
      });
    }

    const clinicalCase = casesByKey.get(caseKey);
    if (!clinicalCase.description && description) {
      clinicalCase.description = description;
    }
    if (!clinicalCase.reference && reference) {
      clinicalCase.reference = reference;
    }
    clinicalCase.imageLinks = dedupeStringArray([
      ...clinicalCase.imageLinks,
      ...caseImageLinks,
    ]);

    const qcmPrompt = String(row.qcmQuestion || '').trim();
    if (qcmPrompt) {
      const rawOptions = Array.isArray(row.qcmOptions) ? row.qcmOptions : [];
      const options = rawOptions.map((entry) => String(entry || '').trim()).filter(Boolean);
      const correctOptionIndexes = Array.isArray(row.qcmCorrectOptionIndexes)
        ? row.qcmCorrectOptionIndexes
            .map((entry) => Number(entry))
            .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry < options.length)
        : [];

      if (options.length >= 2 && correctOptionIndexes.length > 0) {
        const qcmMode = normalizeImportedQcmMode(row.qcmType, correctOptionIndexes);
        const normalizedIndexes = qcmMode === 'single' ? [correctOptionIndexes[0]] : correctOptionIndexes;
        clinicalCase.questions.push({
          id: createImportedQuestionId('qcm', questionCounter += 1),
          kind: 'qcm',
          prompt: qcmPrompt,
          images: splitImportedLinks(row.qcmImageLinks),
          options,
          qcmMode,
          correctOptionIndexes: normalizedIndexes,
          correctOptionIndex: normalizedIndexes[0] || 0,
          explanation: String(row.qcmExplanation || '').trim(),
        });
      } else {
        invalidRows.push({
          rowIndex,
          videoTitle,
          question: qcmPrompt,
          message: 'QCM ignoré: options ou bonnes réponses insuffisantes.',
        });
      }
    }

    const openPrompt = String(row.openQuestion || '').trim();
    const openAnswer = String(row.openAnswer || '').trim();
    if (openPrompt || openAnswer) {
      if (openPrompt && openAnswer) {
        clinicalCase.questions.push({
          id: createImportedQuestionId('open', questionCounter += 1),
          kind: 'open',
          prompt: openPrompt,
          answer: openAnswer,
          images: splitImportedLinks(row.openImageLinks),
        });
      } else {
        invalidRows.push({
          rowIndex,
          videoTitle,
          question: openPrompt,
          message: 'QROC ignoré: énoncé ou réponse manquant.',
        });
      }
    }

    const selectPrompt = String(row.selectQuestion || '').trim();
    if (selectPrompt) {
      const rawSelectOptions = Array.isArray(row.selectOptions) ? row.selectOptions : [];
      const selectOptions = rawSelectOptions.map((entry) => String(entry || '').trim()).filter(Boolean);
      const correctSelectIndexes = Array.isArray(row.selectCorrectOptionIndexes)
        ? row.selectCorrectOptionIndexes
            .map((entry) => Number(entry))
            .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry < selectOptions.length)
        : [];

      if (selectOptions.length >= 2 && correctSelectIndexes.length > 0) {
        clinicalCase.questions.push({
          id: createImportedQuestionId('select', questionCounter += 1),
          kind: 'select',
          prompt: selectPrompt,
          images: splitImportedLinks(row.selectImageLinks),
          options: selectOptions,
          correctOptionIndex: correctSelectIndexes[0],
          explanation: String(row.selectExplanation || '').trim(),
        });
      } else {
        invalidRows.push({
          rowIndex,
          videoTitle,
          question: selectPrompt,
          message: 'Sélecteur ignoré: options ou bonne réponse insuffisantes.',
        });
      }
    }
  });

  return {
    cases: [...casesByKey.values()],
    invalidRows,
  };
};

const extractDriveFileId = (url) => {
  const value = String(url || '').trim();
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{20,})/,
    /[?&]id=([a-zA-Z0-9_-]{20,})/,
    /\/d\/([a-zA-Z0-9_-]{20,})/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  if (isPotentialDriveFileId(value)) {
    return value;
  }

  return '';
};

const isDriveFolderUrl = (url) => {
  const value = String(url || '').trim();
  if (!value) {
    return false;
  }

  const folderPattern = /(?:drive|docs)\.google\.com\/(?:drive\/u\/\d+\/folders|drive\/folders|folders)\/[a-zA-Z0-9_-]{20,}(?:\/[a-zA-Z0-9_-]+)?(?:\?[^\s]+)?/i;
  if (folderPattern.test(value)) {
    return true;
  }

  if (/(?:drive|docs)\.google\.com\/embeddedfolderview\?id=([a-zA-Z0-9_-]{20,})/i.test(value)) {
    return true;
  }

  return false;
};

const extractDriveFolderId = (url) => {
  const value = String(url || '').trim();
  if (!value) {
    return '';
  }

  const pathMatch = value.match(/(?:drive|docs)\.google\.com\/(?:drive\/u\/\d+\/folders|drive\/folders|folders)\/([a-zA-Z0-9_-]{20,})(?:\/[a-zA-Z0-9_-]+)?/i);
  if (pathMatch?.[1]) {
    return pathMatch[1];
  }

  const embeddedMatch = value.match(/(?:drive|docs)\.google\.com\/embeddedfolderview\?id=([a-zA-Z0-9_-]{20,})/i);
  if (embeddedMatch?.[1]) {
    return embeddedMatch[1];
  }

  const openMatch = value.match(/(?:drive|docs)\.google\.com\/open\?id=([a-zA-Z0-9_-]{20,})/i);
  if (openMatch?.[1]) {
    return openMatch[1];
  }

  return '';
};

const extractDriveFolderResourceKey = (url) => {
  const value = String(url || '').trim();
  if (!value) {
    return '';
  }

  const match = value.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/i);
  return match?.[1] || '';
};

const normalizeDriveFolderUrl = (url) => {
  const folderId = extractDriveFolderId(url);
  if (!folderId) {
    return '';
  }

  const resourceKey = extractDriveFolderResourceKey(url);
  try {
    const parsed = new URL(url, 'https://drive.google.com');
    const allowedParams = ['resourcekey', 'authuser', 'usp'];
    const searchParams = new URLSearchParams();

    for (const name of allowedParams) {
      if (parsed.searchParams.has(name)) {
        searchParams.set(name, parsed.searchParams.get(name));
      }
    }

    if (!searchParams.has('usp')) {
      searchParams.set('usp', 'sharing');
    }

    if (resourceKey && !searchParams.has('resourcekey')) {
      searchParams.set('resourcekey', resourceKey);
    }

    return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}?${searchParams.toString()}`;
  } catch {
    const params = new URLSearchParams({ usp: 'sharing' });
    if (resourceKey) {
      params.set('resourcekey', resourceKey);
    }
    return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}?${params.toString()}`;
  }
};

const isPotentialDriveFileId = (value) => {
  return /^[a-zA-Z0-9_-]{20,}$/.test(String(value || ''));
};

const extractDriveFileIdsFromFolderHtml = (html, folderId = '') => {
  const fileIds = new Set();
  const folderIds = new Set();
  const folderUrls = new Set();
  const content = String(html || '');

  const pushId = (id, isFolder = false) => {
    if (!id || id === folderId) {
      return;
    }

    if (!isPotentialDriveFileId(id) || id.startsWith('goog') || id.startsWith('drive')) {
      return;
    }

    if (isFolder) {
      folderIds.add(id);
      return;
    }

    if (!folderIds.has(id)) {
      fileIds.add(id);
    }
  };

  const pushFolderUrl = (url) => {
    if (!url) {
      return;
    }

    const id = extractDriveFolderId(url);
    if (!id || id === folderId) {
      return;
    }

    if (!isPotentialDriveFileId(id) || id.startsWith('goog') || id.startsWith('drive')) {
      return;
    }

    folderUrls.add(url);
    folderIds.add(id);
  };

  const matchIds = (regex, isFolder = false) => {
    for (const match of content.matchAll(regex)) {
      pushId(match?.[1] || '', isFolder);
    }
  };

  const matchFolderUrls = (regex) => {
    for (const match of content.matchAll(regex)) {
      pushFolderUrl(match?.[0] || '');
    }
  };

  matchFolderUrls(/(?:https?:\/\/)?(?:drive|docs)\.google\.com\/(?:drive\/u\/\d+\/folders|drive\/folders|folders)\/[a-zA-Z0-9_-]{20,}(?:\?[^"'\s]*)?/gi);
  matchFolderUrls(/(?:https?:\/\/)?(?:drive|docs)\.google\.com\/embeddedfolderview\?id=[a-zA-Z0-9_-]{20,}(?:[^"'\s]*)?/gi);
  matchIds(/"id"\s*:\s*"([a-zA-Z0-9_-]{20,})"[^\}]*?"mimeType"\s*:\s*"application\/vnd\.google-apps\.folder"/gi, true);

  matchIds(/(?:drive|docs)\.google\.com\/(?:uc\?export=download|open)\?(?:[^\s"']*?&)?id=([a-zA-Z0-9_-]{20,})/gi);
  matchIds(/\/file\/d\/([a-zA-Z0-9_-]{20,})/gi);
  matchIds(/data-id=["']([a-zA-Z0-9_-]{20,})["']/gi);
  matchIds(/"id"\s*:\s*"([a-zA-Z0-9_-]{20,})"/gi);
  matchIds(/['"]([a-zA-Z0-9_-]{20,})['"]/g);

  for (const folderIdEntry of folderIds) {
    fileIds.delete(folderIdEntry);
  }

  return {
    fileIds: [...fileIds],
    folderIds: [...folderIds],
    folderUrls: [...folderUrls],
  };
};

const extractDriveFileIdsFromFolder = async (url, visitedFolderIds = new Set(), depth = 0) => {
  if (depth >= 3) {
    return [];
  }

  const folderId = extractDriveFolderId(url);
  if (!folderId || visitedFolderIds.has(folderId)) {
    return [];
  }

  visitedFolderIds.add(folderId);
  const resourceKey = extractDriveFolderResourceKey(url);

  const candidateUrls = [
    normalizeDriveFolderUrl(url),
    `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}?usp=sharing`,
    `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}/view?usp=sharing`,
    `https://drive.google.com/drive/u/0/folders/${encodeURIComponent(folderId)}?usp=sharing`,
    `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}&usp=sharing`,
  ];

  if (resourceKey) {
    candidateUrls.unshift(`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}?resourcekey=${encodeURIComponent(resourceKey)}&usp=sharing`);
  }

  let html = '';
  for (const candidateUrl of candidateUrls) {
    if (!candidateUrl) {
      continue;
    }

    try {
      const response = await fetch(candidateUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.google.com/',
        },
      });

      if (!response.ok) {
        continue;
      }

      const body = await response.text();
      if (/accounts\.google\.com|ServiceLogin/i.test(response.url) || /ServiceLogin/i.test(body)) {
        continue;
      }

      html = body;
      break;
    } catch {
      continue;
    }
  }

  if (!html) {
    return [];
  }

  const { fileIds, folderUrls } = extractDriveFileIdsFromFolderHtml(html, folderId);
  const nestedIds = [];

  for (const nestedUrl of folderUrls) {
    const nestedFolderId = extractDriveFolderId(nestedUrl);
    if (!nestedFolderId || visitedFolderIds.has(nestedFolderId)) {
      continue;
    }

    nestedIds.push(...await extractDriveFileIdsFromFolder(nestedUrl, visitedFolderIds, depth + 1));
  }

  return dedupeStringArray([...fileIds, ...nestedIds]).slice(0, 50);
};

const getBufferFromResponse = async (response) => {
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const isImageBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true; // PNG
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true; // JPEG
  }

  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return true; // GIF
  }

  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return true; // BMP
  }

  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.length >= 12 &&
    buffer.slice(8, 12).equals(Buffer.from('WEBP'))
  ) {
    return true; // WEBP
  }

  const header = buffer.slice(0, 256).toString('utf8').trimStart();
  if (header.startsWith('<?xml') && header.includes('<svg')) {
    return true;
  }

  if (header.startsWith('<svg')) {
    return true;
  }

  return false;
};

const extractDriveImageUrlFromHtml = (html) => {
  const metaMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (metaMatch?.[1]) {
    return metaMatch[1];
  }

  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1]) {
    return imgMatch[1];
  }

  const hrefMatch = html.match(/href=["']([^"']*(?:uc\?export=download|uc\?export=view)[^"']*)["']/i);
  if (hrefMatch?.[1]) {
    return hrefMatch[1];
  }

  const urlMatch = html.match(/https:\/\/lh3\.googleusercontent\.com\/[^"'\s]+/i);
  if (urlMatch?.[0]) {
    return urlMatch[0];
  }

  return '';
};

const downloadDriveImageBuffer = async (fileId) => {
  const urls = [
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/thumbnail?authuser=0&sz=w1280&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/thumbnail?authuser=0&sz=w1024&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/thumbnail?authuser=0&sz=w640&id=${encodeURIComponent(fileId)}`,
    `https://docs.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
    `https://docs.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (!response.ok) {
        continue;
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const buffer = await getBufferFromResponse(response);

      if (contentType.startsWith('image/') || isImageBuffer(buffer)) {
        return buffer;
      }

      if (contentType.includes('html') || contentType.includes('text')) {
        const html = buffer.toString('utf8');
        const imageUrl = extractDriveImageUrlFromHtml(html);
        if (imageUrl) {
          try {
            const imageResponse = await fetch(imageUrl, {
              redirect: 'follow',
              headers: {
                'User-Agent': 'Mozilla/5.0',
              },
            });

            if (!imageResponse.ok) {
              continue;
            }

            const imageType = String(imageResponse.headers.get('content-type') || '').toLowerCase();
            const imageBuffer = await getBufferFromResponse(imageResponse);
            if (imageType.startsWith('image/') || isImageBuffer(imageBuffer)) {
              return imageBuffer;
            }
          } catch {
            continue;
          }
        }
      }
    } catch {
      continue;
    }
  }

  return null;
};

const uploadImportedDriveImages = async ({
  links,
  folder,
  filenamePrefix,
  authUser,
  failures,
}) => {
  const urls = [];
  const uniqueLinks = dedupeStringArray(links);

  for (const link of uniqueLinks) {
    const fileIds = isDriveFolderUrl(link)
      ? await extractDriveFileIdsFromFolder(link)
      : [extractDriveFileId(link)].filter(Boolean);

    if (fileIds.length === 0) {
      failures.push({ link, reason: 'Lien Drive inaccessible ou non public.' });
      continue;
    }

    for (const fileId of fileIds) {
      try {
        const buffer = await downloadDriveImageBuffer(fileId);
        if (!buffer) {
          failures.push({ link, fileId, reason: 'Image Drive inaccessible ou format non image.' });
          continue;
        }

        const result = await uploadBufferToCloudinary({
          buffer,
          folder,
          resourceType: 'image',
          filename: `${filenamePrefix}-${fileId}`,
          format: 'png',
          authUser,
          configOptions: {
            preferUserConfig: true,
            allowGlobalFallback: authUser?.role !== 'admin',
          },
        });

        if (result?.secure_url) {
          urls.push(result.secure_url);
        }
      } catch (error) {
        failures.push({
          link,
          fileId,
          reason: error?.message || 'Upload Cloudinary impossible.',
        });
      }
    }
  }

  return dedupeStringArray(urls);
};

const createPlaceholderVideoPayload = (title, now) => ({
  title,
  description: '',
  url: '',
  subspecialty: '',
  section: '',
  isFreeDemo: false,
  price: 0,
  isPlaceholder: true,
  createdAt: now,
  updatedAt: now,
});

const hasIntersection = (left, right) => {
  for (const value of left) {
    if (right.has(value)) {
      return value;
    }
  }
  return '';
};

const withIdExclusion = (filter, excludeId) => {
  if (!excludeId) {
    return filter;
  }

  const clauses = [filter, { _id: { $ne: excludeId } }];
  if (ObjectId.isValid(excludeId)) {
    clauses.push({ _id: { $ne: new ObjectId(excludeId) } });
  }

  return { $and: clauses };
};

const findDocByCollectionId = async ({ db, collection, id }) => {
  let existing = await db.collection(collection).findOne({ _id: id });
  if (!existing && ObjectId.isValid(id)) {
    existing = await db.collection(collection).findOne({ _id: new ObjectId(id) });
  }
  return existing;
};

const stripMongoId = (doc) => {
  if (!isPlainObject(doc)) {
    return {};
  }

  const { _id, ...rest } = doc;
  return rest;
};

const extractVideoAssetKeys = (payload) => {
  const urls = new Set();
  const publicIds = new Set();

  const mainUrl = String(payload?.url || '').trim();
  if (mainUrl) {
    urls.add(mainUrl);
  }

  if (Array.isArray(payload?.parts)) {
    for (const part of payload.parts) {
      const publicId = String(part?.publicId || '').trim();
      const secureUrl = String(part?.secureUrl || '').trim();

      if (publicId) {
        publicIds.add(publicId);
      }
      if (secureUrl) {
        urls.add(secureUrl);
      }
    }
  }

  return { urls, publicIds };
};

const extractCaseImageUrls = (payload) => {
  const urls = new Set();

  if (Array.isArray(payload?.images)) {
    for (const entry of payload.images) {
      const normalized = String(entry || '').trim();
      if (normalized) {
        urls.add(normalized);
      }
    }
  }

  if (Array.isArray(payload?.questions)) {
    for (const question of payload.questions) {
      if (!Array.isArray(question?.images)) {
        continue;
      }

      for (const image of question.images) {
        const normalized = String(image || '').trim();
        if (normalized) {
          urls.add(normalized);
        }
      }
    }
  }

  return urls;
};

const sanitizeVideoPayload = (payload) => {
  const next = {
    ...payload,
    title: trimStringIfNeeded(payload?.title),
    description: trimStringIfNeeded(payload?.description),
    url: trimStringIfNeeded(payload?.url),
    subspecialty: trimStringIfNeeded(payload?.subspecialty),
    section: trimStringIfNeeded(payload?.section),
    packId: trimStringIfNeeded(payload?.packId),
  };

  if (Array.isArray(payload?.parts)) {
    const seen = new Set();
    const parts = [];

    for (const entry of payload.parts) {
      if (!isPlainObject(entry)) {
        continue;
      }

      const normalizedPart = {
        ...entry,
        publicId: String(entry.publicId || '').trim(),
        secureUrl: String(entry.secureUrl || '').trim(),
      };

      if (!normalizedPart.publicId && !normalizedPart.secureUrl) {
        continue;
      }

      const key = `${normalizedPart.publicId}|${normalizedPart.secureUrl}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      parts.push(normalizedPart);
    }

    next.parts = parts;
    if (!Number.isFinite(Number(next.totalParts)) || Number(next.totalParts) <= 0) {
      next.totalParts = parts.length;
    }
  }

  return next;
};

const sanitizeQcmPayload = (payload) => {
  return {
    ...payload,
    videoId: trimStringIfNeeded(payload?.videoId),
    question: trimStringIfNeeded(payload?.question),
    explanation: trimStringIfNeeded(payload?.explanation),
    reference: trimStringIfNeeded(payload?.reference),
    options: Array.isArray(payload?.options)
      ? payload.options.map((entry) => trimStringIfNeeded(entry))
      : payload?.options,
  };
};

const sanitizeOpenQuestionPayload = (payload) => {
  return {
    ...payload,
    videoId: trimStringIfNeeded(payload?.videoId),
    question: trimStringIfNeeded(payload?.question),
    answer: trimStringIfNeeded(payload?.answer),
    reference: trimStringIfNeeded(payload?.reference),
  };
};

const sanitizeClinicalCaseQuestion = (question) => {
  if (!isPlainObject(question)) {
    return null;
  }

  return {
    ...question,
    id: trimStringIfNeeded(question.id),
    kind: trimStringIfNeeded(question.kind),
    prompt: trimStringIfNeeded(question.prompt),
    explanation: trimStringIfNeeded(question.explanation),
    answer: trimStringIfNeeded(question.answer),
    images: Array.isArray(question.images) ? dedupeStringArray(question.images) : question.images,
    options: Array.isArray(question.options)
      ? question.options.map((entry) => trimStringIfNeeded(entry))
      : question.options,
  };
};

const sanitizeClinicalCasePayload = (payload) => {
  const next = {
    ...payload,
    videoId: trimStringIfNeeded(payload?.videoId),
    title: trimStringIfNeeded(payload?.title),
    description: trimStringIfNeeded(payload?.description),
    patientHistory: trimStringIfNeeded(payload?.patientHistory),
    clinicalExamination: trimStringIfNeeded(payload?.clinicalExamination),
    additionalTests: trimStringIfNeeded(payload?.additionalTests),
    diagnosis: trimStringIfNeeded(payload?.diagnosis),
    treatment: trimStringIfNeeded(payload?.treatment),
    discussion: trimStringIfNeeded(payload?.discussion),
    reference: trimStringIfNeeded(payload?.reference),
    images: Array.isArray(payload?.images) ? dedupeStringArray(payload.images) : payload?.images,
  };

  if (Array.isArray(payload?.questions)) {
    const seen = new Set();
    const questions = [];

    for (const entry of payload.questions) {
      const normalizedQuestion = sanitizeClinicalCaseQuestion(entry);
      if (!normalizedQuestion) {
        continue;
      }

      const promptKey = normalizeComparableText(normalizedQuestion.prompt);
      const uniqueKey = promptKey
        ? `${normalizeComparableText(normalizedQuestion.kind)}|${promptKey}`
        : '';

      if (uniqueKey && seen.has(uniqueKey)) {
        continue;
      }

      if (uniqueKey) {
        seen.add(uniqueKey);
      }

      questions.push(normalizedQuestion);
    }

    next.questions = questions;
  }

  return next;
};

const sanitizeDiagramPayload = (payload) => {
  return {
    ...payload,
    videoId: trimStringIfNeeded(payload?.videoId),
    title: trimStringIfNeeded(payload?.title),
    imageUrl: trimStringIfNeeded(payload?.imageUrl),
    reference: trimStringIfNeeded(payload?.reference),
  };
};

const sanitizeCollectionPayload = (collection, payload) => {
  if (!isPlainObject(payload)) {
    return {};
  }

  if (collection === 'videos') {
    return sanitizeVideoPayload(payload);
  }

  if (collection === 'qcms') {
    return sanitizeQcmPayload(payload);
  }

  if (collection === 'openQuestions') {
    return sanitizeOpenQuestionPayload(payload);
  }

  if (collection === 'clinicalCases') {
    return sanitizeClinicalCasePayload(payload);
  }

  if (collection === 'diagrams') {
    return sanitizeDiagramPayload(payload);
  }

  return payload;
};

const assertNoVideoDuplicates = async ({ db, payload, excludeId }) => {
  const incomingTitle = normalizeComparableText(payload?.title);
  const incomingAssets = extractVideoAssetKeys(payload);

  if (!incomingTitle && incomingAssets.urls.size === 0 && incomingAssets.publicIds.size === 0) {
    return;
  }

  const existingVideos = await db
    .collection('videos')
    .find(withIdExclusion({}, excludeId), { projection: { title: 1, url: 1, parts: 1 } })
    .toArray();

  for (const existing of existingVideos) {
    if (incomingTitle && normalizeComparableText(existing?.title) === incomingTitle) {
      throw new DuplicateDataError(
        'Une video avec ce titre existe deja.',
        'DUPLICATE_VIDEO_TITLE',
        { field: 'title', value: payload?.title },
      );
    }

    const existingAssets = extractVideoAssetKeys(existing);
    const duplicatedUrl = hasIntersection(incomingAssets.urls, existingAssets.urls);
    if (duplicatedUrl) {
      throw new DuplicateDataError(
        'Cette video (URL ou partie) existe deja.',
        'DUPLICATE_VIDEO_ASSET_URL',
        { field: 'url', value: duplicatedUrl },
      );
    }

    const duplicatedPublicId = hasIntersection(incomingAssets.publicIds, existingAssets.publicIds);
    if (duplicatedPublicId) {
      throw new DuplicateDataError(
        'Une partie video avec le meme identifiant Cloudinary existe deja.',
        'DUPLICATE_VIDEO_PART_PUBLIC_ID',
        { field: 'parts.publicId', value: duplicatedPublicId },
      );
    }
  }
};

const assertNoQcmDuplicates = async ({ db, payload, excludeId }) => {
  const videoId = String(payload?.videoId || '').trim();
  const question = normalizeComparableText(payload?.question);
  if (!videoId || !question) {
    return;
  }

  const existing = await db
    .collection('qcms')
    .find(withIdExclusion({ videoId }, excludeId), { projection: { question: 1 } })
    .toArray();

  if (existing.some((entry) => normalizeComparableText(entry?.question) === question)) {
    throw new DuplicateDataError(
      'Ce QCM existe deja pour cette video.',
      'DUPLICATE_QCM_QUESTION',
      { field: 'question', value: payload?.question, videoId },
    );
  }
};

const assertNoOpenQuestionDuplicates = async ({ db, payload, excludeId }) => {
  const videoId = String(payload?.videoId || '').trim();
  const question = normalizeComparableText(payload?.question);
  if (!videoId || !question) {
    return;
  }

  const existing = await db
    .collection('openQuestions')
    .find(withIdExclusion({ videoId }, excludeId), { projection: { question: 1 } })
    .toArray();

  if (existing.some((entry) => normalizeComparableText(entry?.question) === question)) {
    throw new DuplicateDataError(
      'Cette question ouverte existe deja pour cette video.',
      'DUPLICATE_OPEN_QUESTION',
      { field: 'question', value: payload?.question, videoId },
    );
  }
};

const assertNoClinicalCaseDuplicates = async ({ db, payload, excludeId }) => {
  const videoId = String(payload?.videoId || '').trim();
  const incomingTitle = normalizeComparableText(payload?.title);
  const incomingImageUrls = extractCaseImageUrls(payload);

  if (videoId && incomingTitle) {
    const existingCasesByVideo = await db
      .collection('clinicalCases')
      .find(withIdExclusion({ videoId }, excludeId), { projection: { title: 1 } })
      .toArray();

    if (existingCasesByVideo.some((entry) => normalizeComparableText(entry?.title) === incomingTitle)) {
      throw new DuplicateDataError(
        'Un cas clinique avec ce titre existe deja pour cette video.',
        'DUPLICATE_CLINICAL_CASE_TITLE',
        { field: 'title', value: payload?.title, videoId },
      );
    }
  }

  if (incomingImageUrls.size > 0) {
    const existingCases = await db
      .collection('clinicalCases')
      .find(withIdExclusion({}, excludeId), { projection: { images: 1, questions: 1 } })
      .toArray();

    for (const existingCase of existingCases) {
      const existingUrls = extractCaseImageUrls(existingCase);
      const duplicatedImage = hasIntersection(incomingImageUrls, existingUrls);
      if (duplicatedImage) {
        throw new DuplicateDataError(
          'Une image de cas clinique est deja utilisee.',
          'DUPLICATE_CLINICAL_CASE_IMAGE',
          { field: 'images', value: duplicatedImage },
        );
      }
    }

    const existingDiagram = await db.collection('diagrams').findOne(
      { imageUrl: { $in: [...incomingImageUrls] } },
      { projection: { imageUrl: 1 } },
    );

    if (existingDiagram?.imageUrl) {
      throw new DuplicateDataError(
        'Cette image est deja utilisee dans un schema.',
        'DUPLICATE_IMAGE_USED_BY_DIAGRAM',
        { field: 'imageUrl', value: existingDiagram.imageUrl },
      );
    }
  }
};

const assertNoDiagramDuplicates = async ({ db, payload, excludeId }) => {
  const videoId = String(payload?.videoId || '').trim();
  const incomingTitle = normalizeComparableText(payload?.title);
  const imageUrl = String(payload?.imageUrl || '').trim();

  if (videoId && incomingTitle) {
    const existingByVideo = await db
      .collection('diagrams')
      .find(withIdExclusion({ videoId }, excludeId), { projection: { title: 1 } })
      .toArray();

    if (existingByVideo.some((entry) => normalizeComparableText(entry?.title) === incomingTitle)) {
      throw new DuplicateDataError(
        'Un schema avec ce titre existe deja pour cette video.',
        'DUPLICATE_DIAGRAM_TITLE',
        { field: 'title', value: payload?.title, videoId },
      );
    }
  }

  if (!imageUrl) {
    return;
  }

  const existingDiagram = await db.collection('diagrams').findOne(
    withIdExclusion({ imageUrl }, excludeId),
    { projection: { _id: 1, imageUrl: 1 } },
  );

  if (existingDiagram?.imageUrl) {
    throw new DuplicateDataError(
      'Cette image est deja utilisee dans un autre schema.',
      'DUPLICATE_DIAGRAM_IMAGE',
      { field: 'imageUrl', value: existingDiagram.imageUrl },
    );
  }

  const existingCase = await db.collection('clinicalCases').findOne(
    {
      $or: [
        { images: imageUrl },
        { 'questions.images': imageUrl },
      ],
    },
    { projection: { _id: 1 } },
  );

  if (existingCase) {
    throw new DuplicateDataError(
      'Cette image est deja utilisee dans un cas clinique.',
      'DUPLICATE_IMAGE_USED_BY_CASE',
      { field: 'imageUrl', value: imageUrl },
    );
  }
};

const assertNoCollectionDuplicates = async ({ db, collection, payload, excludeId }) => {
  if (collection === 'videos') {
    await assertNoVideoDuplicates({ db, payload, excludeId });
    return;
  }

  if (collection === 'qcms') {
    await assertNoQcmDuplicates({ db, payload, excludeId });
    return;
  }

  if (collection === 'openQuestions') {
    await assertNoOpenQuestionDuplicates({ db, payload, excludeId });
    return;
  }

  if (collection === 'clinicalCases') {
    await assertNoClinicalCaseDuplicates({ db, payload, excludeId });
    return;
  }

  if (collection === 'diagrams') {
    await assertNoDiagramDuplicates({ db, payload, excludeId });
  }
};

const preparePayloadForWrite = async ({ db, collection, payload, excludeId = null }) => {
  const sanitized = sanitizeCollectionPayload(collection, payload);

  if (DUPLICATE_GUARDED_COLLECTIONS.has(collection)) {
    await assertNoCollectionDuplicates({
      db,
      collection,
      payload: sanitized,
      excludeId,
    });
  }

  return sanitized;
};

const handleCollectionWriteError = (res, error, fallbackMessage) => {
  if (error instanceof DuplicateDataError) {
    return res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
      details: error.details,
    });
  }

  return res.status(500).json({ message: fallbackMessage });
};

const resolveContentNotificationPayload = ({ collection, payload, insertedId }) => {
  const labelByCollection = {
    videos: 'Video',
    qcms: 'QCM',
    openQuestions: 'QROC',
    clinicalCases: 'Cas clinique',
    diagrams: 'Schema',
  };

  const contentLabel = labelByCollection[collection] || 'Contenu';
  const rawTitle = String(payload?.title || payload?.question || payload?.description || '').trim();
  const title = rawTitle || `${contentLabel} ${insertedId}`;
  const targetVideoId = String(payload?.videoId || insertedId || '').trim();

  return {
    title: 'Nouveau contenu disponible',
    description: `${contentLabel} ajoute: "${title}".`,
    targetHref: targetVideoId ? `/video-detail?id=${targetVideoId}` : '/videos',
  };
};

const createNewContentNotifications = async ({ db, collection, payload, insertedId, actor }) => {
  if (!CONTENT_NOTIFICATION_COLLECTIONS.has(collection)) {
    return;
  }

  if (!actor || actor.role !== 'admin') {
    return;
  }

  const publishedAt = new Date();
  const usersToNotify = await User.find(
    {
      role: { $ne: 'admin' },
      createdAt: { $lte: publishedAt },
    },
    { uid: 1 },
  ).lean();

  if (!Array.isArray(usersToNotify) || usersToNotify.length === 0) {
    return;
  }

  const basePayload = resolveContentNotificationPayload({
    collection,
    payload,
    insertedId,
  });

  const nowIso = publishedAt.toISOString();
  const docs = usersToNotify
    .map((user) => String(user?.uid || '').trim())
    .filter(Boolean)
    .map((uid) => ({
      userId: uid,
      type: 'content',
      category: 'new-content',
      isRead: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      ...basePayload,
    }));

  if (docs.length === 0) {
    return;
  }

  await db.collection('notifications').insertMany(docs, { ordered: false });
};

router.get('/:collection', async (req, res) => {
  try {
    const collection = normalizeCollectionName(req.params.collection);

    if (isUsersCollection(collection)) {
      const users = await User.find({}, { passwordHash: 0, passwordReset: 0, __v: 0 }).lean();
      const docs = users.map((entry) => {
        const { _id, uid, ...rest } = entry;
        return {
          id: uid,
          data: {
            uid,
            ...rest,
          },
        };
      });
      return res.json({ docs });
    }

    const docs = await findCollectionDocsOrEmpty({
      db: mongoose.connection.db,
      collection,
      filter: {},
    });
    return res.json({ docs: docs.map(parseDoc).filter(Boolean) });
  } catch (error) {
    console.error('Error fetching collection', { collection: req.params.collection, error });
    return res.status(500).json({ message: 'Unable to fetch collection.' });
  }
});

router.post('/query', async (req, res) => {
  try {
    const collection = normalizeCollectionName(req.body?.collection || '');
    const constraints = Array.isArray(req.body?.constraints) ? req.body.constraints : [];
    const filter = toMongoFilter(constraints);

    if (isUsersCollection(collection)) {
      const users = await User.find(filter, { passwordHash: 0, passwordReset: 0, __v: 0 }).lean();
      const docs = users.map((entry) => {
        const { _id, uid, ...rest } = entry;
        return {
          id: uid,
          data: {
            uid,
            ...rest,
          },
        };
      });
      return res.json({ docs });
    }

    const docs = await findCollectionDocsOrEmpty({
      db: mongoose.connection.db,
      collection,
      filter,
    });
    return res.json({ docs: docs.map(parseDoc).filter(Boolean) });
  } catch (error) {
    console.error('Error executing collection query', { body: req.body, error });
    return res.status(500).json({ message: 'Unable to execute query.' });
  }
});

router.post('/qcms/import', authOptional, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ message: 'Aucune ligne QCM à importer.' });
    }

    const now = new Date().toISOString();
    const normalizedRows = [];
    const invalidRows = [];

    rows.forEach((row, index) => {
      const normalized = normalizeImportedQcmRow(row, index + 1);
      if (normalized.error) {
        invalidRows.push(normalized.error);
        return;
      }

      normalizedRows.push(normalized.row);
    });

    if (normalizedRows.length === 0) {
      return res.status(400).json({
        message: 'Aucune ligne QCM valide à importer.',
        imported: 0,
        skippedDuplicates: 0,
        createdVideos: 0,
        invalidRows,
      });
    }

    const db = mongoose.connection.db;
    const videoTitleKeys = new Set(normalizedRows.map((row) => normalizeComparableText(row.videoTitle)));
    const existingVideos = await findCollectionDocsOrEmpty({
      db,
      collection: 'videos',
      filter: {},
    });
    const videoByTitleKey = new Map();

    for (const video of existingVideos) {
      const key = normalizeComparableText(video?.title);
      if (key && videoTitleKeys.has(key) && !videoByTitleKey.has(key)) {
        videoByTitleKey.set(key, String(video._id));
      }
    }

    const createdVideoTitles = [];
    for (const row of normalizedRows) {
      const titleKey = normalizeComparableText(row.videoTitle);
      if (!titleKey || videoByTitleKey.has(titleKey)) {
        continue;
      }

      const result = await db
        .collection('videos')
        .insertOne(createPlaceholderVideoPayload(row.videoTitle, now));

      videoByTitleKey.set(titleKey, String(result.insertedId));
      createdVideoTitles.push(row.videoTitle);
    }

    const videoIds = Array.from(new Set([...videoByTitleKey.values()]));
    const existingQcms = videoIds.length > 0
      ? await findCollectionDocsOrEmpty({
          db,
          collection: 'qcms',
          filter: { videoId: { $in: videoIds } },
        })
      : [];
    const existingQcmKeys = new Set(
      existingQcms
        .map((entry) => {
          const videoId = String(entry?.videoId || '').trim();
          const questionKey = normalizeComparableText(entry?.question);
          return videoId && questionKey ? `${videoId}|${questionKey}` : '';
        })
        .filter(Boolean),
    );

    const batchQcmKeys = new Set();
    const qcmsToInsert = [];
    const skippedDuplicates = [];

    for (const row of normalizedRows) {
      const videoId = videoByTitleKey.get(normalizeComparableText(row.videoTitle)) || '';
      const questionKey = normalizeComparableText(row.question);
      const duplicateKey = videoId && questionKey ? `${videoId}|${questionKey}` : '';

      if (!videoId || !questionKey) {
        invalidRows.push({
          videoTitle: row.videoTitle,
          question: row.question,
          message: 'Lien vidéo/question invalide après normalisation.',
        });
        continue;
      }

      if (existingQcmKeys.has(duplicateKey) || batchQcmKeys.has(duplicateKey)) {
        skippedDuplicates.push({
          videoTitle: row.videoTitle,
          question: row.question,
          qcmNumber: row.qcmNumber,
        });
        continue;
      }

      batchQcmKeys.add(duplicateKey);
      qcmsToInsert.push({
        videoId,
        question: row.question,
        options: row.options,
        mode: row.mode,
        correctOptionIndexes: row.correctOptionIndexes,
        correctOptionIndex: row.correctOptionIndex,
        explanation: row.explanation,
        reference: row.reference,
        qcmNumber: row.qcmNumber,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (qcmsToInsert.length > 0) {
      await db.collection('qcms').insertMany(qcmsToInsert, { ordered: false });
    }

    return res.status(201).json({
      imported: qcmsToInsert.length,
      skippedDuplicates: skippedDuplicates.length,
      createdVideos: createdVideoTitles.length,
      invalidRows,
      duplicateRows: skippedDuplicates,
      createdVideoTitles,
    });
  } catch (error) {
    console.error('[qcms-import]', error);
    return res.status(500).json({ message: 'Unable to import QCM rows.' });
  }
});

router.post('/openQuestions/import', authOptional, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ message: 'Aucune ligne QROC à importer.' });
    }

    const now = new Date().toISOString();
    const normalizedRows = [];
    const invalidRows = [];

    rows.forEach((row, index) => {
      const normalized = normalizeImportedOpenQuestionRow(row, index + 1);
      if (normalized.error) {
        invalidRows.push(normalized.error);
        return;
      }

      normalizedRows.push(normalized.row);
    });

    if (normalizedRows.length === 0) {
      return res.status(400).json({
        message: 'Aucune ligne QROC valide à importer.',
        imported: 0,
        skippedDuplicates: 0,
        createdVideos: 0,
        invalidRows,
      });
    }

    const db = mongoose.connection.db;
    const videoTitleKeys = new Set(normalizedRows.map((row) => normalizeComparableText(row.videoTitle)));
    const existingVideos = await findCollectionDocsOrEmpty({
      db,
      collection: 'videos',
      filter: {},
    });
    const videoByTitleKey = new Map();

    for (const video of existingVideos) {
      const key = normalizeComparableText(video?.title);
      if (key && videoTitleKeys.has(key) && !videoByTitleKey.has(key)) {
        videoByTitleKey.set(key, String(video._id));
      }
    }

    const createdVideoTitles = [];
    for (const row of normalizedRows) {
      const titleKey = normalizeComparableText(row.videoTitle);
      if (!titleKey || videoByTitleKey.has(titleKey)) {
        continue;
      }

      const result = await db
        .collection('videos')
        .insertOne(createPlaceholderVideoPayload(row.videoTitle, now));

      videoByTitleKey.set(titleKey, String(result.insertedId));
      createdVideoTitles.push(row.videoTitle);
    }

    const videoIds = Array.from(new Set([...videoByTitleKey.values()]));
    const existingOpenQuestions = videoIds.length > 0
      ? await findCollectionDocsOrEmpty({
          db,
          collection: 'openQuestions',
          filter: { videoId: { $in: videoIds } },
        })
      : [];
    const existingOpenQuestionKeys = new Set(
      existingOpenQuestions
        .map((entry) => {
          const videoId = String(entry?.videoId || '').trim();
          const questionKey = normalizeComparableText(entry?.question);
          return videoId && questionKey ? `${videoId}|${questionKey}` : '';
        })
        .filter(Boolean),
    );

    const batchOpenQuestionKeys = new Set();
    const openQuestionsToInsert = [];
    const skippedDuplicates = [];

    for (const row of normalizedRows) {
      const videoId = videoByTitleKey.get(normalizeComparableText(row.videoTitle)) || '';
      const questionKey = normalizeComparableText(row.question);
      const duplicateKey = videoId && questionKey ? `${videoId}|${questionKey}` : '';

      if (!videoId || !questionKey) {
        invalidRows.push({
          videoTitle: row.videoTitle,
          question: row.question,
          message: 'Lien vidéo/question invalide après normalisation.',
        });
        continue;
      }

      if (existingOpenQuestionKeys.has(duplicateKey) || batchOpenQuestionKeys.has(duplicateKey)) {
        skippedDuplicates.push({
          videoTitle: row.videoTitle,
          question: row.question,
          qrocNumber: row.qrocNumber,
        });
        continue;
      }

      batchOpenQuestionKeys.add(duplicateKey);
      openQuestionsToInsert.push({
        videoId,
        question: row.question,
        answer: row.answer,
        reference: row.reference,
        qrocNumber: row.qrocNumber,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (openQuestionsToInsert.length > 0) {
      await db.collection('openQuestions').insertMany(openQuestionsToInsert, { ordered: false });
    }

    return res.status(201).json({
      imported: openQuestionsToInsert.length,
      skippedDuplicates: skippedDuplicates.length,
      createdVideos: createdVideoTitles.length,
      invalidRows,
      duplicateRows: skippedDuplicates,
      createdVideoTitles,
    });
  } catch (error) {
    console.error('[openQuestions-import]', error);
    return res.status(500).json({ message: 'Unable to import QROC rows.' });
  }
});

router.post('/clinicalCases/import', authOptional, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ message: 'Aucune ligne de cas clinique à importer.' });
    }

    const now = new Date().toISOString();
    const normalized = normalizeImportedClinicalCaseRows(rows);

    if (normalized.cases.length === 0) {
      return res.status(400).json({
        message: 'Aucun cas clinique valide à importer.',
        imported: 0,
        skippedDuplicates: 0,
        createdVideos: 0,
        invalidRows: normalized.invalidRows,
        imageFailures: [],
      });
    }

    const db = mongoose.connection.db;
    const videoTitleKeys = new Set(normalized.cases.map((entry) => normalizeComparableText(entry.videoTitle)));
    const existingVideos = await findCollectionDocsOrEmpty({
      db,
      collection: 'videos',
      filter: {},
    });
    const videoByTitleKey = new Map();

    for (const video of existingVideos) {
      const key = normalizeComparableText(video?.title);
      if (key && videoTitleKeys.has(key) && !videoByTitleKey.has(key)) {
        videoByTitleKey.set(key, String(video._id));
      }
    }

    const createdVideoTitles = [];
    for (const clinicalCase of normalized.cases) {
      const titleKey = normalizeComparableText(clinicalCase.videoTitle);
      if (!titleKey || videoByTitleKey.has(titleKey)) {
        continue;
      }

      const result = await db
        .collection('videos')
        .insertOne(createPlaceholderVideoPayload(clinicalCase.videoTitle, now));

      videoByTitleKey.set(titleKey, String(result.insertedId));
      createdVideoTitles.push(clinicalCase.videoTitle);
    }

    const videoIds = Array.from(new Set([...videoByTitleKey.values()]));
    const existingCases = videoIds.length > 0
      ? await findCollectionDocsOrEmpty({
          db,
          collection: 'clinicalCases',
          filter: { videoId: { $in: videoIds } },
        })
      : [];
    const existingCaseKeys = new Set(
      existingCases
        .map((entry) => {
          const videoId = String(entry?.videoId || '').trim();
          const titleKey = normalizeComparableText(entry?.title);
          return videoId && titleKey ? `${videoId}|${titleKey}` : '';
        })
        .filter(Boolean),
    );

    const batchCaseKeys = new Set();
    const skippedDuplicates = [];
    const casesToPrepare = [];

    for (const clinicalCase of normalized.cases) {
      const videoId = videoByTitleKey.get(normalizeComparableText(clinicalCase.videoTitle)) || '';
      const titleKey = normalizeComparableText(clinicalCase.title);
      const duplicateKey = videoId && titleKey ? `${videoId}|${titleKey}` : '';

      if (!videoId || !titleKey) {
        normalized.invalidRows.push({
          videoTitle: clinicalCase.videoTitle,
          message: 'Lien vidéo/titre invalide après normalisation.',
        });
        continue;
      }

      if (existingCaseKeys.has(duplicateKey) || batchCaseKeys.has(duplicateKey)) {
        skippedDuplicates.push({
          videoTitle: clinicalCase.videoTitle,
          title: clinicalCase.title,
          caseNumber: clinicalCase.caseNumber,
        });
        continue;
      }

      batchCaseKeys.add(duplicateKey);
      casesToPrepare.push({
        ...clinicalCase,
        videoId,
      });
    }

    const imageFailures = [];
    const casesToInsert = [];
    let uploadedImages = 0;

    for (const clinicalCase of casesToPrepare) {
      const caseKey = toSafeCloudinaryName(`${clinicalCase.videoTitle}-${clinicalCase.caseNumber || clinicalCase.title}`, 'case-import');
      const images = await uploadImportedDriveImages({
        links: clinicalCase.imageLinks,
        folder: 'orl-platform/case-images',
        filenamePrefix: `case-${caseKey || Date.now()}`,
        authUser: req.authUser,
        failures: imageFailures,
      });
      uploadedImages += images.length;

      const questions = [];
      for (let index = 0; index < clinicalCase.questions.length; index += 1) {
        const question = clinicalCase.questions[index];
        const questionImages = await uploadImportedDriveImages({
          links: question.images,
          folder: 'orl-platform/case-question-images',
          filenamePrefix: `case-question-${caseKey}-${index + 1}`,
          authUser: req.authUser,
          failures: imageFailures,
        });
        uploadedImages += questionImages.length;
        questions.push({
          ...question,
          images: questionImages,
        });
      }

      casesToInsert.push(sanitizeClinicalCasePayload({
        videoId: clinicalCase.videoId,
        title: clinicalCase.title,
        description: clinicalCase.description,
        patientHistory: '',
        clinicalExamination: '',
        additionalTests: '',
        diagnosis: '',
        treatment: '',
        discussion: '',
        images,
        reference: clinicalCase.reference,
        questions,
        createdAt: now,
        updatedAt: now,
      }));
    }

    if (casesToInsert.length > 0) {
      await db.collection('clinicalCases').insertMany(casesToInsert, { ordered: false });
    }

    return res.status(201).json({
      imported: casesToInsert.length,
      skippedDuplicates: skippedDuplicates.length,
      createdVideos: createdVideoTitles.length,
      uploadedImages,
      invalidRows: normalized.invalidRows,
      duplicateRows: skippedDuplicates,
      createdVideoTitles,
      imageFailures,
    });
  } catch (error) {
    console.error('[clinicalCases-import]', error);
    return res.status(500).json({ message: 'Unable to import clinical case rows.' });
  }
});

router.get('/:collection/:id', authOptional, async (req, res) => {
  try {
    const collection = normalizeCollectionName(req.params.collection);
    const id = String(req.params.id);

    if (isCloudinarySettingsDoc(collection, id)) {
      if (!req.authUser || req.authUser.role !== 'admin') {
        return res.json({ exists: false });
      }

      return res.json({
        exists: true,
        data: {
          cloudName: req.authUser.cloudinary?.cloudName || '',
          apiKey: req.authUser.cloudinary?.apiKey || '',
          apiSecret: req.authUser.cloudinary?.apiSecret || '',
          updatedAt: req.authUser.cloudinary?.updatedAt || null,
          updatedBy: req.authUser.uid,
        },
      });
    }

    if (isUsersCollection(collection)) {
      const user = await User.findOne({ uid: id }, { passwordHash: 0, passwordReset: 0, __v: 0 }).lean();
      if (!user) {
        return res.json({ exists: false });
      }

      const { _id, uid, ...rest } = user;
      return res.json({
        exists: true,
        id: uid,
        data: {
          uid,
          ...rest,
        },
      });
    }

    const doc = await mongoose.connection.db.collection(collection).findOne({ _id: id });
    if (doc) {
      const { _id, ...rest } = doc;
      return res.json({ exists: true, data: rest, id: String(_id) });
    }

    if (ObjectId.isValid(id)) {
      const oidDoc = await mongoose.connection.db.collection(collection).findOne({ _id: new ObjectId(id) });
      if (oidDoc) {
        const { _id, ...rest } = oidDoc;
        return res.json({ exists: true, data: rest, id: String(_id) });
      }
    }

    return res.json({ exists: false });
  } catch {
    return res.status(500).json({ message: 'Unable to fetch document.' });
  }
});

router.post('/:collection', authOptional, async (req, res) => {
  try {
    const collection = normalizeCollectionName(req.params.collection);
    const rawPayload = req.body || {};

    if (isUsersCollection(collection)) {
      const uid = String(rawPayload.uid || '');
      if (!uid) {
        return res.status(400).json({ message: 'uid is required for users collection.' });
      }

      const updatePayload = {
        ...rawPayload,
        updatedAt: new Date().toISOString(),
      };

      delete updatePayload.passwordHash;
      delete updatePayload._id;

      await User.updateOne({ uid }, { $set: updatePayload }, { upsert: true });
      return res.status(201).json({ id: uid });
    }

    const payload = await preparePayloadForWrite({
      db: mongoose.connection.db,
      collection,
      payload: rawPayload,
      excludeId: null,
    });

    const now = new Date().toISOString();
    const enriched = {
      ...payload,
      createdAt: payload.createdAt || now,
      updatedAt: now,
    };

    const result = await mongoose.connection.db.collection(collection).insertOne(enriched);

    await createNewContentNotifications({
      db: mongoose.connection.db,
      collection,
      payload: enriched,
      insertedId: String(result.insertedId),
      actor: req.authUser,
    });

    return res.status(201).json({ id: String(result.insertedId) });
  } catch (error) {
    return handleCollectionWriteError(res, error, 'Unable to insert document.');
  }
});

router.put('/:collection/:id', authOptional, async (req, res) => {
  try {
    const collection = normalizeCollectionName(req.params.collection);
    const id = String(req.params.id);

    if (isCloudinarySettingsDoc(collection, id)) {
      if (!req.authUser || req.authUser.role !== 'admin') {
        return res.status(403).json({ message: 'Admin role required.' });
      }

      const cloudinary = {
        cloudName: String(req.body?.cloudName || '').trim(),
        apiKey: String(req.body?.apiKey || '').trim(),
        apiSecret: String(req.body?.apiSecret || '').trim(),
        updatedAt: new Date().toISOString(),
      };

      await User.updateOne({ uid: req.authUser.uid }, { $set: { cloudinary } });
      return res.json({ ok: true });
    }

    if (isUsersCollection(collection)) {
      const payload = {
        ...(req.body || {}),
        uid: id,
        updatedAt: new Date().toISOString(),
      };

      delete payload.passwordHash;
      delete payload._id;

      await User.updateOne({ uid: id }, { $set: payload }, { upsert: true });
      return res.json({ ok: true });
    }

    const validatedPayload = await preparePayloadForWrite({
      db: mongoose.connection.db,
      collection,
      payload: {
        ...(req.body || {}),
        updatedAt: new Date().toISOString(),
      },
      excludeId: id,
    });

    const payload = validatedPayload;

    const setByStringId = await mongoose.connection.db
      .collection(collection)
      .updateOne({ _id: id }, { $set: payload }, { upsert: true });

    if (setByStringId.matchedCount > 0 || setByStringId.upsertedCount > 0 || !ObjectId.isValid(id)) {
      return res.json({ ok: true });
    }

    await mongoose.connection.db
      .collection(collection)
      .updateOne({ _id: new ObjectId(id) }, { $set: payload }, { upsert: true });
    return res.json({ ok: true });
  } catch (error) {
    return handleCollectionWriteError(res, error, 'Unable to set document.');
  }
});

router.patch('/:collection/:id', authOptional, async (req, res) => {
  try {
    const collection = normalizeCollectionName(req.params.collection);
    const id = String(req.params.id);

    if (isCloudinarySettingsDoc(collection, id)) {
      if (!req.authUser || req.authUser.role !== 'admin') {
        return res.status(403).json({ message: 'Admin role required.' });
      }

      const cloudinary = {
        cloudName: String(req.body?.cloudName || req.authUser.cloudinary?.cloudName || '').trim(),
        apiKey: String(req.body?.apiKey || req.authUser.cloudinary?.apiKey || '').trim(),
        apiSecret: String(req.body?.apiSecret || req.authUser.cloudinary?.apiSecret || '').trim(),
        updatedAt: new Date().toISOString(),
      };

      await User.updateOne({ uid: req.authUser.uid }, { $set: { cloudinary } });
      return res.json({ ok: true });
    }

    if (isUsersCollection(collection)) {
      const operations = applyUpdateOperators({
        ...(req.body || {}),
        updatedAt: new Date().toISOString(),
      });

      if (operations.$set) {
        delete operations.$set.passwordHash;
        delete operations.$set._id;
        operations.$set.uid = id;
      }

      const result = await User.updateOne({ uid: id }, operations);
      if (result.matchedCount === 0) {
        return res.status(404).json({ message: `Document ${collection}/${id} does not exist.` });
      }

      return res.json({ ok: true });
    }

    const hasArrayOperatorMarker = Object.values(req.body || {}).some(
      (value) => isPlainObject(value) && (value.__op === 'arrayUnion' || value.__op === 'arrayRemove'),
    );

    if (DUPLICATE_GUARDED_COLLECTIONS.has(collection) && !hasArrayOperatorMarker) {
      const existingDoc = await findDocByCollectionId({
        db: mongoose.connection.db,
        collection,
        id,
      });

      if (!existingDoc) {
        return res.status(404).json({ message: `Document ${collection}/${id} does not exist.` });
      }

      const mergedPayload = {
        ...stripMongoId(existingDoc),
        ...(req.body || {}),
        updatedAt: new Date().toISOString(),
      };

      const payload = await preparePayloadForWrite({
        db: mongoose.connection.db,
        collection,
        payload: mergedPayload,
        excludeId: id,
      });

      let result = await mongoose.connection.db
        .collection(collection)
        .updateOne({ _id: id }, { $set: payload });

      if (result.matchedCount === 0 && ObjectId.isValid(id)) {
        result = await mongoose.connection.db
          .collection(collection)
          .updateOne({ _id: new ObjectId(id) }, { $set: payload });
      }

      if (result.matchedCount === 0) {
        return res.status(404).json({ message: `Document ${collection}/${id} does not exist.` });
      }

      return res.json({ ok: true });
    }

    const operations = applyUpdateOperators({
      ...(req.body || {}),
      updatedAt: new Date().toISOString(),
    });

    if (Object.keys(operations).length === 0) {
      return res.json({ ok: true });
    }

    let result = await mongoose.connection.db.collection(collection).updateOne({ _id: id }, operations);

    if (result.matchedCount === 0 && ObjectId.isValid(id)) {
      result = await mongoose.connection.db.collection(collection).updateOne({ _id: new ObjectId(id) }, operations);
    }

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: `Document ${collection}/${id} does not exist.` });
    }

    return res.json({ ok: true });
  } catch (error) {
    return handleCollectionWriteError(res, error, 'Unable to update document.');
  }
});

router.delete('/:collection/:id', authOptional, async (req, res) => {
  try {
    const collection = normalizeCollectionName(req.params.collection);
    const id = String(req.params.id);

    if (isCloudinarySettingsDoc(collection, id)) {
      if (!req.authUser || req.authUser.role !== 'admin') {
        return res.status(403).json({ message: 'Admin role required.' });
      }

      await User.updateOne(
        { uid: req.authUser.uid },
        {
          $set: {
            cloudinary: {
              cloudName: '',
              apiKey: '',
              apiSecret: '',
              updatedAt: new Date().toISOString(),
            },
          },
        },
      );
      return res.json({ ok: true });
    }

    if (isUsersCollection(collection)) {
      const result = await User.deleteOne({ uid: id });
      return res.json({ deleted: result.deletedCount > 0 });
    }

    let result = await mongoose.connection.db.collection(collection).deleteOne({ _id: id });
    if (result.deletedCount === 0 && ObjectId.isValid(id)) {
      result = await mongoose.connection.db.collection(collection).deleteOne({ _id: new ObjectId(id) });
    }

    return res.json({ deleted: result.deletedCount > 0 });
  } catch {
    return res.status(500).json({ message: 'Unable to delete document.' });
  }
});

export {
  extractDriveFileIdsFromFolder,
  extractDriveFileIdsFromFolderHtml,
  extractDriveFileId,
  extractDriveFolderId,
  extractDriveFolderResourceKey,
  normalizeDriveFolderUrl,
  isDriveFolderUrl,
};
export default router;
