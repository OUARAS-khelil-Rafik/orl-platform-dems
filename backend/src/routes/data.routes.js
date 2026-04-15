import express from 'express';
import { ObjectId } from 'mongodb';
import mongoose from 'mongoose';
import { authOptional, authRequired, adminRequired } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { isCloudinarySettingsDoc, normalizeCollectionName } from '../utils/collection-name.js';

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

    const docs = await mongoose.connection.db.collection(collection).find({}).toArray();
    return res.json({ docs: docs.map(parseDoc).filter(Boolean) });
  } catch {
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

    const docs = await mongoose.connection.db.collection(collection).find(filter).toArray();
    return res.json({ docs: docs.map(parseDoc).filter(Boolean) });
  } catch {
    return res.status(500).json({ message: 'Unable to execute query.' });
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

export default router;
