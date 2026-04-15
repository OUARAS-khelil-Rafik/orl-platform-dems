import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import {
  isGmailAppPasswordAuthError,
  isSmtpMailerConfigured,
  sendPasswordResetMail,
} from '../config/mailer.js';
import { User } from '../models/User.js';
import { createId } from '../utils/id.js';
import { adminRequired, authRequired } from '../middleware/auth.js';

const router = express.Router();

const GOOGLE_AUTH_BASE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_STATE_EXPIRATION = '10m';
const PASSWORD_RESET_REQUEST_MESSAGE = 'Si un compte existe avec cet email, un lien de reinitialisation a ete prepare.';
const PASSWORD_RESET_TTL_MINUTES = (() => {
  const parsed = Number.parseInt(String(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || '30'), 10);
  if (!Number.isFinite(parsed)) {
    return 30;
  }
  return Math.max(5, Math.min(parsed, 180));
})();

const parseInitialAdminAccountsFromEnv = () => {
  const raw = String(process.env.INITIAL_ADMIN_ACCOUNTS || '').trim();

  if (!raw) {
    return {
      accounts: [],
      error: 'Missing INITIAL_ADMIN_ACCOUNTS in .env.',
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      accounts: [],
      error: 'INITIAL_ADMIN_ACCOUNTS must be a valid JSON array.',
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      accounts: [],
      error: 'INITIAL_ADMIN_ACCOUNTS must be a JSON array.',
    };
  }

  const accounts = parsed
    .map((account) => ({
      email: String(account?.email || '').trim().toLowerCase(),
      displayName: String(account?.displayName || 'Administrateur').trim() || 'Administrateur',
      phoneNumber: String(account?.phoneNumber || '').trim(),
      initialPassword: String(account?.initialPassword || '').trim(),
    }))
    .filter((account) => account.email.length > 0);

  if (accounts.length === 0) {
    return {
      accounts: [],
      error: 'INITIAL_ADMIN_ACCOUNTS does not contain any valid email.',
    };
  }

  const hasWeakPassword = accounts.some((account) => account.initialPassword.length < 6);
  if (hasWeakPassword) {
    return {
      accounts: [],
      error: 'Each INITIAL_ADMIN_ACCOUNTS entry must contain an initialPassword with at least 6 characters.',
    };
  }

  return {
    accounts,
    error: '',
  };
};

const parseBooleanFlag = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const shouldExposePasswordResetLink = parseBooleanFlag(
  process.env.PASSWORD_RESET_EXPOSE_LINK
  || (process.env.NODE_ENV !== 'production' ? 'true' : 'false'),
);

const sanitizeNextPath = (value, fallback = '/dashboard') => {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) {
    return fallback;
  }
  return raw;
};

const resolveFrontendBaseUrl = () => {
  const fromEnv = String(process.env.FRONTEND_URL || '').trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }

  const firstCorsOrigin = Array.isArray(env.corsOrigins)
    ? String(env.corsOrigins[0] || '').trim()
    : '';

  if (firstCorsOrigin) {
    return firstCorsOrigin.replace(/\/$/, '');
  }

  return 'http://localhost:3000';
};

const getGoogleOAuthConfig = () => {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri =
    String(process.env.GOOGLE_REDIRECT_URI || '').trim()
    || `http://localhost:${env.port}/api/auth/google/callback`;

  const frontendBaseUrl = resolveFrontendBaseUrl();
  const successRedirect = String(process.env.GOOGLE_AUTH_SUCCESS_REDIRECT || `${frontendBaseUrl}/oauth/google`).trim();
  const failureRedirect = String(process.env.GOOGLE_AUTH_FAILURE_REDIRECT || `${frontendBaseUrl}/sign-in`).trim();

  return {
    clientId,
    clientSecret,
    redirectUri,
    successRedirect,
    failureRedirect,
    isConfigured: Boolean(clientId && clientSecret && redirectUri),
  };
};

const buildAbsoluteUrl = (value, fallback) => {
  try {
    return new URL(value).toString();
  } catch {
    return fallback;
  }
};

const buildGoogleState = ({ intent = 'signin', remember = false, uid = '', nextPath = '/dashboard' }) => {
  return jwt.sign(
    {
      provider: 'google',
      intent: intent === 'connect' ? 'connect' : 'signin',
      remember: Boolean(remember),
      uid: String(uid || ''),
      nextPath,
      nonce: crypto.randomUUID(),
    },
    env.jwtSecret,
    { expiresIn: GOOGLE_STATE_EXPIRATION },
  );
};

const parseGoogleState = (rawState) => {
  const payload = jwt.verify(rawState, env.jwtSecret);

  if (!payload || typeof payload !== 'object' || payload.provider !== 'google') {
    throw new Error('Invalid OAuth state payload.');
  }

  const intent = payload.intent === 'connect' ? 'connect' : 'signin';
  const fallbackNext = intent === 'connect' ? '/dashboard?tab=profile' : '/dashboard';

  return {
    intent,
    remember: Boolean(payload.remember),
    uid: String(payload.uid || ''),
    nextPath: sanitizeNextPath(payload.nextPath, fallbackNext),
  };
};

const buildGoogleAuthorizeUrl = ({ clientId, redirectUri, state, prompt = 'select_account' }) => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt,
  });

  return `${GOOGLE_AUTH_BASE_URL}?${params.toString()}`;
};

const exchangeGoogleCode = async ({ code, clientId, clientSecret, redirectUri }) => {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error('Google token exchange failed.');
  }

  return response.json();
};

const fetchGoogleIdentity = async (accessToken) => {
  if (!accessToken) {
    throw new Error('Missing Google access token.');
  }

  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Unable to fetch Google profile.');
  }

  const payload = await response.json();

  const sub = String(payload?.sub || '').trim();
  const email = String(payload?.email || '').trim().toLowerCase();
  const name = String(payload?.name || '').trim();
  const picture = String(payload?.picture || '').trim();
  const emailVerified = Boolean(payload?.email_verified);

  if (!sub || !email) {
    throw new Error('Incomplete Google profile information.');
  }

  if (!emailVerified) {
    throw new Error('Google email must be verified.');
  }

  return {
    sub,
    email,
    name: name || 'Utilisateur',
    picture,
  };
};

const redirectWithOAuthError = (res, targetUrl, message) => {
  const target = new URL(targetUrl);
  target.searchParams.set('oauthError', message);
  return res.redirect(target.toString());
};

const redirectWithOAuthSuccess = (res, { targetUrl, token, remember, nextPath }) => {
  const target = new URL(targetUrl);
  target.hash = new URLSearchParams({
    token,
    remember: remember ? '1' : '0',
    next: sanitizeNextPath(nextPath, '/dashboard'),
  }).toString();

  return res.redirect(target.toString());
};

const toSessionUser = (user) => ({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName || 'Utilisateur',
  photoURL: user.photoURL || '',
  googleConnected: Boolean(user?.googleAuth?.sub),
});

const issueToken = (uid) => jwt.sign({ uid }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
const issuePasswordResetToken = () => crypto.randomBytes(32).toString('hex');
const hashPasswordResetToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');

const buildSupportNotification = ({
  userId,
  type,
  title,
  description,
  targetHref,
  meta = {},
}) => {
  const now = new Date().toISOString();
  return {
    userId: String(userId || '').trim(),
    type: String(type || 'system').trim(),
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    targetHref: String(targetHref || '/dashboard').trim(),
    isRead: false,
    createdAt: now,
    updatedAt: now,
    ...meta,
  };
};

const notifyAdminsAboutNewAccount = async ({ createdUser, createdByUid = '' }) => {
  const db = mongoose.connection?.db;
  if (!db) {
    return;
  }

  const createdUserId = String(createdUser?.uid || '').trim();
  if (!createdUserId) {
    return;
  }

  const admins = await User.find({ role: 'admin' }, { uid: 1, displayName: 1, email: 1 }).lean();
  if (!Array.isArray(admins) || admins.length === 0) {
    return;
  }

  const actorUid = String(createdByUid || '').trim();
  const actorLabel = actorUid
    ? `compte cree par ${actorUid}`
    : 'inscription autonome';

  const notificationDocs = admins
    .map((admin) => String(admin?.uid || '').trim())
    .filter((uid) => uid && uid !== createdUserId)
    .map((adminUid) =>
      buildSupportNotification({
        userId: adminUid,
        type: 'admin-account-created',
        title: 'Nouveau compte cree',
        description: `Un nouveau compte vient d'etre cree (${createdUser.displayName || createdUser.email || createdUser.uid}) - ${actorLabel}.`,
        targetHref: '/admin',
        meta: {
          category: 'admin',
          actorUid: createdUserId,
          actorEmail: String(createdUser.email || '').trim().toLowerCase(),
        },
      }),
    );

  if (notificationDocs.length === 0) {
    return;
  }

  await db.collection('notifications').insertMany(notificationDocs, { ordered: false });
};

const notifyUserWelcome = async (createdUser) => {
  const db = mongoose.connection?.db;
  if (!db) {
    return;
  }

  const userId = String(createdUser?.uid || '').trim();
  if (!userId || createdUser?.role === 'admin') {
    return;
  }

  const existingWelcome = await db.collection('notifications').findOne({
    userId,
    type: 'welcome',
  });

  if (existingWelcome) {
    return;
  }

  await db.collection('notifications').insertOne(
    buildSupportNotification({
      userId,
      type: 'welcome',
      title: 'Bienvenue Docteur',
      description: `Bienvenue Docteur ${createdUser.displayName || ''}. Votre compte a bien ete cree.`,
      targetHref: '/dashboard',
      meta: { category: 'onboarding' },
    }),
  );
};

const emitAccountCreationNotifications = async ({ createdUser, createdByUid = '' }) => {
  try {
    await notifyUserWelcome(createdUser);
    await notifyAdminsAboutNewAccount({ createdUser, createdByUid });
  } catch (error) {
    console.error('[auth] account creation notification error:', error);
  }
};

const createUserWithPassword = async ({
  email,
  password,
  displayName,
  role = 'user',
  subscriptionApprovalStatus = 'none',
  phoneNumber = '',
  notifyOnCreate = true,
  createdByUid = '',
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
    passwordLoginEnabled: true,
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

  if (notifyOnCreate) {
    await emitAccountCreationNotifications({
      createdUser: created,
      createdByUid,
    });
  }

  return created;
};

const linkGoogleToUser = async (user, googleIdentity) => {
  const existingGoogleSub = String(user?.googleAuth?.sub || '').trim();
  if (existingGoogleSub && existingGoogleSub !== googleIdentity.sub) {
    throw new Error('Ce compte est deja lie a un autre compte Google.');
  }

  const updatePayload = {
    googleAuth: {
      sub: googleIdentity.sub,
      email: googleIdentity.email,
      picture: googleIdentity.picture,
      connectedAt: new Date().toISOString(),
    },
  };

  if (!String(user.photoURL || '').trim() && googleIdentity.picture) {
    updatePayload.photoURL = googleIdentity.picture;
  }

  if (!String(user.displayName || '').trim() && googleIdentity.name) {
    updatePayload.displayName = googleIdentity.name;
  }

  await User.updateOne({ uid: user.uid }, { $set: updatePayload });
  return User.findOne({ uid: user.uid });
};

const createUserWithGoogle = async (googleIdentity) => {
  const fallbackPassword = `${createId()}-${crypto.randomUUID()}`;

  const created = await createUserWithPassword({
    email: googleIdentity.email,
    password: fallbackPassword,
    displayName: googleIdentity.name,
    role: 'user',
    subscriptionApprovalStatus: 'none',
    phoneNumber: '',
    notifyOnCreate: false,
    createdByUid: '',
  });

  if (!created) {
    return null;
  }

  created.passwordLoginEnabled = false;
  created.photoURL = googleIdentity.picture || created.photoURL || '';
  created.googleAuth = {
    sub: googleIdentity.sub,
    email: googleIdentity.email,
    picture: googleIdentity.picture,
    connectedAt: new Date().toISOString(),
  };
  await created.save();

  await emitAccountCreationNotifications({
    createdUser: created,
    createdByUid: '',
  });

  return created;
};

const resolveUserFromGoogleSignIn = async (googleIdentity) => {
  const byGoogleSub = await User.findOne({ 'googleAuth.sub': googleIdentity.sub });
  if (byGoogleSub) {
    const linked = await linkGoogleToUser(byGoogleSub, googleIdentity);
    return linked || byGoogleSub;
  }

  const existingByEmail = await User.findOne({ email: googleIdentity.email }).lean();
  if (existingByEmail) {
    throw new Error(
      'Un compte existe deja avec cet email. Connectez-vous d abord avec email/mot de passe puis utilisez "Connexion Google" dans votre profil.',
    );
  }

  const created = await createUserWithGoogle(googleIdentity);
  if (!created) {
    throw new Error('Unable to create user with Google account.');
  }

  return created;
};

router.get('/google/start', async (req, res) => {
  const oauth = getGoogleOAuthConfig();

  if (!oauth.isConfigured) {
    return res.status(500).json({ message: 'Google OAuth is not configured.' });
  }

  const state = buildGoogleState({
    intent: 'signin',
    remember: parseBooleanFlag(req.query?.remember),
    nextPath: sanitizeNextPath(req.query?.next, '/dashboard'),
  });

  const authUrl = buildGoogleAuthorizeUrl({
    clientId: oauth.clientId,
    redirectUri: oauth.redirectUri,
    state,
    prompt: 'select_account',
  });

  return res.redirect(authUrl);
});

router.post('/google/connect-start', authRequired, async (req, res) => {
  const oauth = getGoogleOAuthConfig();

  if (!oauth.isConfigured) {
    return res.status(500).json({ message: 'Google OAuth is not configured.' });
  }

  const state = buildGoogleState({
    intent: 'connect',
    remember: true,
    uid: req.authUser.uid,
    nextPath: sanitizeNextPath(req.body?.next, '/dashboard?tab=profile'),
  });

  const authUrl = buildGoogleAuthorizeUrl({
    clientId: oauth.clientId,
    redirectUri: oauth.redirectUri,
    state,
    prompt: 'consent',
  });

  return res.json({ url: authUrl });
});

router.post('/google/disconnect', authRequired, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.authUser.uid });
    if (!user) {
      return res.status(404).json({ message: 'Compte introuvable.' });
    }

    if (!String(user?.googleAuth?.sub || '').trim()) {
      return res.status(400).json({ message: 'Google is not connected to this account.' });
    }

    const requestedNewPassword = String(req.body?.newPassword || '');

    if (user.passwordLoginEnabled === false) {
      if (requestedNewPassword.length < 6) {
        return res.status(400).json({
          message: 'Ajoutez d\'abord un mot de passe local avant de deconnecter Google.',
        });
      }

      user.passwordHash = await bcrypt.hash(requestedNewPassword, 10);
      user.passwordLoginEnabled = true;
    }

    user.googleAuth = {
      sub: '',
      email: '',
      picture: '',
      connectedAt: '',
    };
    await user.save();

    const token = issueToken(user.uid);
    return res.json({ token, user: toSessionUser(user) });
  } catch {
    return res.status(500).json({ message: 'Unable to disconnect Google account.' });
  }
});

router.get('/google/callback', async (req, res) => {
  const oauth = getGoogleOAuthConfig();
  const frontendBase = resolveFrontendBaseUrl();
  const successRedirectTarget = buildAbsoluteUrl(oauth.successRedirect, `${frontendBase}/oauth/google`);
  const rawState = String(req.query?.state || '').trim();

  let statePayloadForFailure = null;
  if (rawState) {
    try {
      statePayloadForFailure = parseGoogleState(rawState);
    } catch {
      statePayloadForFailure = null;
    }
  }

  const defaultFailureTarget = buildAbsoluteUrl(oauth.failureRedirect, `${frontendBase}/sign-in`);
  const connectFailureTarget = buildAbsoluteUrl(
    `${frontendBase}${sanitizeNextPath(statePayloadForFailure?.nextPath, '/dashboard?tab=profile')}`,
    `${frontendBase}/dashboard?tab=profile`,
  );
  const failureRedirectTarget = statePayloadForFailure?.intent === 'connect'
    ? connectFailureTarget
    : defaultFailureTarget;

  if (!oauth.isConfigured) {
    return redirectWithOAuthError(res, failureRedirectTarget, 'Google OAuth non configure.');
  }

  const providerError = String(req.query?.error || '').trim();
  if (providerError) {
    return redirectWithOAuthError(res, failureRedirectTarget, 'Authentification Google annulee.');
  }

  const code = String(req.query?.code || '').trim();
  if (!code || !rawState) {
    return redirectWithOAuthError(res, failureRedirectTarget, 'Reponse Google incomplete.');
  }

  let statePayload;
  try {
    statePayload = parseGoogleState(rawState);
  } catch {
    return redirectWithOAuthError(res, failureRedirectTarget, 'Session Google expiree. Reessayez.');
  }

  let googleIdentity;
  try {
    const tokenResponse = await exchangeGoogleCode({
      code,
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      redirectUri: oauth.redirectUri,
    });

    googleIdentity = await fetchGoogleIdentity(String(tokenResponse?.access_token || ''));
  } catch {
    return redirectWithOAuthError(res, failureRedirectTarget, 'Echec de verification Google.');
  }

  try {
    let user;

    if (statePayload.intent === 'connect') {
      if (!statePayload.uid) {
        return redirectWithOAuthError(res, failureRedirectTarget, 'Session utilisateur invalide.');
      }

      const targetUser = await User.findOne({ uid: statePayload.uid });
      if (!targetUser) {
        return redirectWithOAuthError(res, failureRedirectTarget, 'Utilisateur introuvable.');
      }

      const alreadyLinkedElsewhere = await User.findOne({
        'googleAuth.sub': googleIdentity.sub,
        uid: { $ne: targetUser.uid },
      }).lean();

      if (alreadyLinkedElsewhere) {
        return redirectWithOAuthError(res, failureRedirectTarget, 'Ce compte Google est deja lie a un autre utilisateur.');
      }

      const emailAlreadyUsedElsewhere = await User.findOne({
        email: googleIdentity.email,
        uid: { $ne: targetUser.uid },
      }).lean();

      if (emailAlreadyUsedElsewhere) {
        return redirectWithOAuthError(
          res,
          failureRedirectTarget,
          'Cet email Google est deja utilise par un autre compte. Connectez-vous avec ce compte pour lier Google.',
        );
      }

      user = await linkGoogleToUser(targetUser, googleIdentity);
    } else {
      user = await resolveUserFromGoogleSignIn(googleIdentity);
    }

    if (!user) {
      return redirectWithOAuthError(res, failureRedirectTarget, 'Connexion Google impossible.');
    }

    const token = issueToken(user.uid);
    const remember = statePayload.intent === 'connect' ? true : statePayload.remember;

    return redirectWithOAuthSuccess(res, {
      targetUrl: successRedirectTarget,
      token,
      remember,
      nextPath: statePayload.nextPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connexion Google impossible.';
    return redirectWithOAuthError(res, failureRedirectTarget, message);
  }
});

router.post('/signup', async (req, res) => {
  try {
    const created = await createUserWithPassword({
      ...(req.body || {}),
      notifyOnCreate: true,
      createdByUid: '',
    });
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

    if (user.passwordLoginEnabled === false) {
      return res.status(400).json({ message: 'Ce compte utilise Google. Utilisez la connexion Google.' });
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

router.post('/forgot-password', async (req, res) => {
  try {
    const normalizedEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.json({ ok: true, message: PASSWORD_RESET_REQUEST_MESSAGE });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.json({ ok: true, message: PASSWORD_RESET_REQUEST_MESSAGE });
    }

    const resetToken = issuePasswordResetToken();
    const resetTokenHash = hashPasswordResetToken(resetToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

    user.passwordReset = {
      tokenHash: resetTokenHash,
      expiresAt,
    };
    await user.save();

    const frontendBase = resolveFrontendBaseUrl();
    const resetUrl = `${frontendBase}/reset-password?token=${encodeURIComponent(resetToken)}`;

    let emailSent = false;
    if (isSmtpMailerConfigured) {
      try {
        await sendPasswordResetMail({
          toEmail: normalizedEmail,
          displayName: user.displayName || 'Utilisateur',
          resetUrl,
          expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
        });
        emailSent = true;
        console.info(`[auth] Password reset email sent to ${normalizedEmail}.`);
      } catch (error) {
        if (isGmailAppPasswordAuthError(error)) {
          console.error(
            '[auth] Gmail SMTP authentication failed. Enable Google 2-Step Verification and set a 16-character App Password in SMTP_PASS.',
          );
        }
        console.error(`[auth] Password reset email failed for ${normalizedEmail}.`, error);
      }
    } else {
      console.warn('[auth] SMTP mailer is not configured. Falling back to reset link exposure policy.');
    }

    const shouldReturnResetUrl = shouldExposePasswordResetLink && !emailSent;

    if (shouldReturnResetUrl) {
      console.info(`[auth] Password reset link generated for ${normalizedEmail}: ${resetUrl}`);
    }

    if (shouldReturnResetUrl) {
      return res.json({
        ok: true,
        message: PASSWORD_RESET_REQUEST_MESSAGE,
        resetUrl,
        emailSent,
      });
    }

    return res.json({ ok: true, message: PASSWORD_RESET_REQUEST_MESSAGE, emailSent });
  } catch {
    return res.status(500).json({ message: 'Unable to process password reset request.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!token) {
      return res.status(400).json({ message: 'Le token de reinitialisation est manquant.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 6 caracteres.' });
    }

    const tokenHash = hashPasswordResetToken(token);
    const user = await User.findOne({
      'passwordReset.tokenHash': tokenHash,
      'passwordReset.expiresAt': { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Le lien de reinitialisation est invalide ou expire.' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordLoginEnabled = true;
    user.passwordReset = {
      tokenHash: '',
      expiresAt: null,
    };

    await user.save();

    return res.json({ ok: true, message: 'Mot de passe reinitialise avec succes.' });
  } catch {
    return res.status(500).json({ message: 'Unable to reset password.' });
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

    const requiresCurrentPassword = req.authUser.role !== 'admin' || targetUid === req.authUser.uid;
    const isSelfUpdate = targetUid === req.authUser.uid;
    const hasGoogleLinked = Boolean(String(user?.googleAuth?.sub || '').trim());
    const allowPasswordResetThroughGoogleSession = isSelfUpdate && hasGoogleLinked;

    if (requiresCurrentPassword && user.passwordLoginEnabled !== false && !allowPasswordResetThroughGoogleSession) {
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        return res.status(400).json({ message: 'Mot de passe actuel incorrect.' });
      }
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordLoginEnabled = true;
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
      notifyOnCreate: true,
      createdByUid: req.authUser.uid,
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

  const db = mongoose.connection?.db;
  if (db) {
    try {
      await Promise.all([
        db.collection('notifications').deleteMany({ userId: uid }),
        db.collection('supportChats').deleteMany({ userId: uid }),
        db.collection('supportChatMessages').deleteMany({ userId: uid }),
      ]);
    } catch (cleanupError) {
      console.error('[auth] user cleanup warning:', cleanupError);
    }
  }

  await User.deleteOne({ uid });
  return res.json({ deleted: true });
});

router.post('/seed-demo', async (_req, res) => {
  try {
    const { accounts: initialAdminAccounts, error } = parseInitialAdminAccountsFromEnv();

    if (error) {
      return res.status(500).json({ message: error });
    }

    const created = [];
    const updated = [];

    for (const account of initialAdminAccounts) {
      const normalizedEmail = String(account.email || '').trim().toLowerCase();

      if (!normalizedEmail) {
        continue;
      }

      const existing = await User.findOne({ email: normalizedEmail });
      if (!existing) {
        const createdUser = await createUserWithPassword({
          email: normalizedEmail,
          password: account.initialPassword,
          displayName: account.displayName,
          role: 'admin',
          subscriptionApprovalStatus: 'none',
          phoneNumber: account.phoneNumber,
          notifyOnCreate: false,
          createdByUid: '',
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
    });
  } catch {
    return res.status(500).json({ message: 'Unable to seed admin accounts.' });
  }
});

export default router;
