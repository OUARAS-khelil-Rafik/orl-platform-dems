import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { createId } from '../utils/id.js';
import { adminRequired, authRequired } from '../middleware/auth.js';

const router = express.Router();

const INITIAL_ADMIN_DEFAULT_PASSWORD = process.env.INITIAL_ADMIN_DEFAULT_PASSWORD || 'Admin123!';

const INITIAL_ADMIN_ACCOUNTS = [
  {
    email: 'kikoouaras@gmail.com',
    displayName: 'OUARAS Khelil rafik',
    phoneNumber: '0660496144',
  },
  {
    email: 'histologieprincess@gmail.com',
    displayName: 'OUARAS Ryma',
    phoneNumber: '',
  },
];

const LEGACY_DEMO_EMAILS = [
  'admin@dems.local',
  'user@dems.local',
  'vip@dems.local',
  'vipplus@dems.local',
];

const toSessionUser = (user) => ({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName || 'Utilisateur',
  photoURL: user.photoURL || '',
});

const issueToken = (uid) => jwt.sign({ uid }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

const createUserWithPassword = async ({
  email,
  password,
  displayName,
  role = 'user',
  subscriptionApprovalStatus = 'none',
  phoneNumber = '',
}) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Email is required.');
  }

  if (!password || String(password).length < 6) {
    throw new Error('Password must have at least 6 characters.');
  }

  const existing = await User.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    return null;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  const uid = createId();

  const created = await User.create({
    uid,
    email: normalizedEmail,
    passwordHash,
    displayName: String(displayName || 'Utilisateur').trim() || 'Utilisateur',
    photoURL: '',
    role,
    subscriptionApprovalStatus,
    purchasedVideos: [],
    purchasedPacks: [],
    favoriteVideoIds: [],
    importantVideoIds: [],
    blockedVideoIds: [],
    isBlocked: false,
    phoneNumber: String(phoneNumber || '').trim(),
    createdAt: now,
  });

  return created;
};

router.post('/signup', async (req, res) => {
  try {
    const created = await createUserWithPassword(req.body || {});
    if (!created) {
      return res.status(409).json({ message: 'Un compte existe deja avec cet email.' });
    }

    const token = issueToken(created.uid);
    return res.status(201).json({ token, user: toSessionUser(created) });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to create account.' });
  }
});

router.post('/signin', async (req, res) => {
  try {
    const normalizedEmail = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: 'Email ou mot de passe invalide.' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Email ou mot de passe invalide.' });
    }

    const token = issueToken(user.uid);
    return res.json({ token, user: toSessionUser(user) });
  } catch {
    return res.status(500).json({ message: 'Unable to sign in.' });
  }
});

router.get('/me', authRequired, async (req, res) => {
  return res.json({ user: toSessionUser(req.authUser) });
});

router.patch('/profile', authRequired, async (req, res) => {
  try {
    const targetUid = String(req.body?.uid || req.authUser.uid);

    if (targetUid !== req.authUser.uid && req.authUser.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    const update = {};
    if (typeof req.body?.displayName === 'string') {
      update.displayName = req.body.displayName.trim();
    }
    if (typeof req.body?.photoURL === 'string') {
      update.photoURL = req.body.photoURL.trim();
    }

    await User.updateOne({ uid: targetUid }, { $set: update });
    const updated = await User.findOne({ uid: targetUid }).lean();

    return res.json({ user: toSessionUser(updated) });
  } catch {
    return res.status(500).json({ message: 'Unable to update profile.' });
  }
});

router.post('/change-password', authRequired, async (req, res) => {
  try {
    const targetUid = String(req.body?.uid || req.authUser.uid);
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 6 caracteres.' });
    }

    if (targetUid !== req.authUser.uid && req.authUser.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    const user = await User.findOne({ uid: targetUid });
    if (!user) {
      return res.status(404).json({ message: 'Compte introuvable.' });
    }

    if (req.authUser.role !== 'admin' || targetUid === req.authUser.uid) {
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        return res.status(400).json({ message: 'Mot de passe actuel incorrect.' });
      }
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ message: 'Unable to change password.' });
  }
});

router.post('/admin-create', adminRequired, async (req, res) => {
  try {
    const role = ['admin', 'user', 'vip', 'vip_plus'].includes(req.body?.role) ? req.body.role : 'user';
    const subscriptionApprovalStatus = role === 'vip_plus' ? 'approved' : 'none';
    const created = await createUserWithPassword({
      ...req.body,
      role,
      subscriptionApprovalStatus,
    });

    if (!created) {
      return res.status(409).json({ message: 'Un compte existe deja avec cet email.' });
    }

    return res.status(201).json({ user: toSessionUser(created) });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to create user.' });
  }
});

router.delete('/users/:uid', authRequired, async (req, res) => {
  const uid = String(req.params.uid || '');
  if (!uid) {
    return res.status(400).json({ message: 'uid is required.' });
  }

  if (uid !== req.authUser.uid && req.authUser.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden.' });
  }

  const found = await User.findOne({ uid });
  if (!found) {
    return res.json({ deleted: false });
  }

  if (found.role === 'admin' && req.authUser.role !== 'admin') {
    return res.status(403).json({ message: 'Cannot delete admin account.' });
  }

  await User.deleteOne({ uid });
  return res.json({ deleted: true });
});

router.post('/seed-demo', async (_req, res) => {
  try {
    const normalizedLegacyEmails = LEGACY_DEMO_EMAILS.map((email) => email.toLowerCase());
    const removedLegacyResult = await User.deleteMany({
      email: { $in: normalizedLegacyEmails },
    });

    const created = [];
    const updated = [];

    for (const account of INITIAL_ADMIN_ACCOUNTS) {
      const normalizedEmail = String(account.email || '').trim().toLowerCase();
      if (!normalizedEmail) {
        continue;
      }

      const existing = await User.findOne({ email: normalizedEmail });
      if (!existing) {
        const createdUser = await createUserWithPassword({
          email: normalizedEmail,
          password: INITIAL_ADMIN_DEFAULT_PASSWORD,
          displayName: account.displayName,
          role: 'admin',
          subscriptionApprovalStatus: 'none',
          phoneNumber: account.phoneNumber,
        });

        if (createdUser) {
          created.push(normalizedEmail);
        }
        continue;
      }

      const updatePayload = {};
      if (existing.role !== 'admin') {
        updatePayload.role = 'admin';
      }

      const desiredDisplayName = String(account.displayName || '').trim();
      if (desiredDisplayName && existing.displayName !== desiredDisplayName) {
        updatePayload.displayName = desiredDisplayName;
      }

      const desiredPhone = String(account.phoneNumber || '').trim();
      if (desiredPhone && String(existing.phoneNumber || '').trim() !== desiredPhone) {
        updatePayload.phoneNumber = desiredPhone;
      }

      if (existing.subscriptionApprovalStatus !== 'none') {
        updatePayload.subscriptionApprovalStatus = 'none';
      }

      if (Object.keys(updatePayload).length > 0) {
        await User.updateOne({ uid: existing.uid }, { $set: updatePayload });
        updated.push(normalizedEmail);
      }
    }

    return res.json({
      ok: true,
      created,
      updated,
      removedLegacyCount: Number(removedLegacyResult?.deletedCount || 0),
    });
  } catch {
    return res.status(500).json({ message: 'Unable to seed demo accounts.' });
  }
});

export default router;
