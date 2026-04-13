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

router.get('/:collection', async (req, res) => {
  try {
    const collection = normalizeCollectionName(req.params.collection);

    if (isUsersCollection(collection)) {
      const users = await User.find({}, { passwordHash: 0, __v: 0 }).lean();
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
      const users = await User.find(filter, { passwordHash: 0, __v: 0 }).lean();
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
      const user = await User.findOne({ uid: id }, { passwordHash: 0, __v: 0 }).lean();
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

router.post('/:collection', async (req, res) => {
  try {
    const collection = normalizeCollectionName(req.params.collection);
    const payload = req.body || {};

    if (isUsersCollection(collection)) {
      const uid = String(payload.uid || '');
      if (!uid) {
        return res.status(400).json({ message: 'uid is required for users collection.' });
      }

      const updatePayload = {
        ...payload,
        updatedAt: new Date().toISOString(),
      };

      delete updatePayload.passwordHash;
      delete updatePayload._id;

      await User.updateOne({ uid }, { $set: updatePayload }, { upsert: true });
      return res.status(201).json({ id: uid });
    }

    const now = new Date().toISOString();
    const enriched = {
      ...payload,
      createdAt: payload.createdAt || now,
      updatedAt: now,
    };

    const result = await mongoose.connection.db.collection(collection).insertOne(enriched);
    return res.status(201).json({ id: String(result.insertedId) });
  } catch {
    return res.status(500).json({ message: 'Unable to insert document.' });
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

    const payload = {
      ...(req.body || {}),
      updatedAt: new Date().toISOString(),
    };

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
  } catch {
    return res.status(500).json({ message: 'Unable to set document.' });
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
  } catch {
    return res.status(500).json({ message: 'Unable to update document.' });
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
