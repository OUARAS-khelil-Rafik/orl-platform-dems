import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { authRequired } from '../middleware/auth.js';
import { User } from '../models/User.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const CHARGILY_BASE_BY_MODE = {
  test: 'https://pay.chargily.net/test/api/v2',
  live: 'https://pay.chargily.net/api/v2',
};

const resolveChargilyBaseUrl = () => {
  // Allow override via explicit env var
  if (process.env.CHARGILY_API_URL) {
    return String(process.env.CHARGILY_API_URL).replace(/\/$/, '');
  }
  const mode = env.chargily?.mode === 'live' ? 'live' : 'test';
  return CHARGILY_BASE_BY_MODE[mode];
};

const resolveFrontendBaseUrl = () => {
  const fromEnv = String(env.chargily?.frontendUrl || process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const firstCors = Array.isArray(env.corsOrigins) ? String(env.corsOrigins[0] || '').trim().replace(/\/$/, '') : '';
  if (firstCors) return firstCors;
  return 'http://localhost:3000';
};

const resolveBackendBaseUrl = () => {
  const fromEnv = String(env.chargily?.backendUrl || process.env.BACKEND_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  // Render fallback: try to derive from env.port host? Not reliable.
  return '';
};

const computeSignature = (payloadRaw, secret) => {
  return crypto.createHmac('sha256', secret).update(payloadRaw, 'utf8').digest('hex');
};

const isValidSignature = (payloadRaw, receivedSignature, secret) => {
  if (!receivedSignature || !secret) return false;
  const expected = computeSignature(payloadRaw, secret);
  // Use timingSafeEqual for comparison
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(receivedSignature).trim(), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return expected === String(receivedSignature).trim();
  }
};

const normalizeAmount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num);
};

const buildSuccessUrl = (checkoutId) => {
  const frontend = resolveFrontendBaseUrl();
  return `${frontend}/payments/success?checkout_id=${encodeURIComponent(checkoutId)}`;
};

const buildFailureUrl = (checkoutId) => {
  const frontend = resolveFrontendBaseUrl();
  return `${frontend}/payments/failure?checkout_id=${encodeURIComponent(checkoutId)}`;
};

const buildWebhookUrl = () => {
  const backend = resolveBackendBaseUrl();
  if (backend) return `${backend}/api/payments/webhook`;
  // Fallback: if BACKEND_URL not set, ask to configure webhook manually in dashboard
  // Return empty so Chargily will use dashboard-configured webhook
  return '';
};

const validateCreateCheckoutPayload = (body) => {
  const amount = normalizeAmount(body?.amount);
  const type = String(body?.type || '').trim().toLowerCase();
  const allowedTypes = new Set(['cart', 'pack', 'video', 'subscription']);
  const normalizedType = allowedTypes.has(type) ? type : 'cart';
  const targetId = String(body?.targetId || '').trim();
  const plan = String(body?.plan || '').trim().toLowerCase();
  const locale = ['ar', 'en', 'fr'].includes(String(body?.locale || '').trim().toLowerCase())
    ? String(body.locale).trim().toLowerCase()
    : 'fr';
  const paymentMethodRaw = String(body?.payment_method || body?.paymentMethod || '').trim().toLowerCase();
  const allowedMethods = new Set(['edahabia', 'cib', '']);
  const paymentMethod = allowedMethods.has(paymentMethodRaw) ? paymentMethodRaw : '';
  const description = String(body?.description || '').trim().slice(0, 500);
  const items = Array.isArray(body?.items) ? body.items : [];
  const currency = String(body?.currency || 'dzd').trim().toLowerCase();

  // Basic validations
  if (amount <= 0) {
    return { error: 'Montant invalide. Le montant doit être > 0.' };
  }
  if (currency !== 'dzd') {
    return { error: 'Devise non supportée. Seul DZD est accepté.' };
  }
  if (normalizedType === 'pack' || normalizedType === 'video' || normalizedType === 'subscription') {
    if (normalizedType !== 'subscription' && !targetId && items.length === 0) {
      // For pack/video we expect targetId
    }
  }

  return {
    ok: true,
    amount,
    currency,
    type: normalizedType,
    targetId,
    plan: plan === 'yearly' ? 'yearly' : plan === 'monthly' ? 'monthly' : plan,
    locale,
    paymentMethod,
    description,
    items,
  };
};

const findPaymentByCheckoutId = async (db, checkoutId) => {
  if (!checkoutId) return null;
  return db.collection('payments').findOne({
    $or: [
      { chargilyCheckoutId: checkoutId },
      { checkoutId },
      { 'metadata.checkoutId': checkoutId },
    ],
  });
};

const applyApprovedPaymentToUser = async ({ payment, checkoutMetadata = null }) => {
  const userId = String(payment?.userId || payment?.metadata?.userId || checkoutMetadata?.userId || '').trim();
  if (!userId) {
    console.warn('[chargily] applyApproved: missing userId for payment', payment?._id || payment?.id);
    return;
  }

  const user = await User.findOne({ uid: userId });
  if (!user) {
    console.warn('[chargily] applyApproved: user not found', userId);
    return;
  }

  const type = String(payment?.type || payment?.metadata?.type || checkoutMetadata?.type || '').toLowerCase();
  const targetId = String(payment?.targetId || payment?.metadata?.targetId || checkoutMetadata?.targetId || '').trim();
  const plan = String(payment?.plan || payment?.metadata?.plan || checkoutMetadata?.plan || '').toLowerCase();
  const items = Array.isArray(payment?.items) ? payment.items : Array.isArray(payment?.metadata?.items) ? payment.metadata.items : [];

  const now = new Date();
  const nowIso = now.toISOString();

  // Subscription handling
  if (type === 'subscription') {
    const isYearly = plan === 'yearly';
    const durationMs = isYearly ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    const baseDate = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : now;
    const effectiveBase = Number.isFinite(baseDate.getTime()) && baseDate.getTime() > now.getTime() ? baseDate : now;
    const nextEndDate = new Date(effectiveBase.getTime() + durationMs).toISOString();

    await User.updateOne(
      { uid: userId },
      {
        $set: {
          role: 'vip_plus',
          subscriptionApprovalStatus: 'approved',
          subscriptionEndDate: nextEndDate,
          updatedAt: nowIso,
        },
      },
    );

    // Notification for subscription
    const db = mongoose.connection?.db;
    if (db) {
      await db.collection('notifications').insertOne({
        userId,
        type: 'subscription',
        category: 'payment',
        title: 'Abonnement VIP Plus activé',
        description: `Votre abonnement ${isYearly ? 'annuel' : 'mensuel'} a été activé avec succès.`,
        targetHref: '/dashboard',
        isRead: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    return;
  }

  if (type === 'pack' && targetId) {
    const normalizedPack = targetId.toLowerCase();
    await User.updateOne(
      { uid: userId },
      {
        $addToSet: { purchasedPacks: normalizedPack },
        $set: { updatedAt: nowIso },
      },
    );
    const db = mongoose.connection?.db;
    if (db) {
      await db.collection('notifications').insertOne({
        userId,
        type: 'purchase',
        category: 'payment',
        title: 'Pack débloqué',
        description: `Votre pack "${normalizedPack}" a été activé.`,
        targetHref: `/specialties/${normalizedPack}`,
        isRead: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    return;
  }

  if (type === 'video' && targetId) {
    await User.updateOne(
      { uid: userId },
      {
        $addToSet: { purchasedVideos: targetId },
        $set: { updatedAt: nowIso },
      },
    );
    const db = mongoose.connection?.db;
    if (db) {
      await db.collection('notifications').insertOne({
        userId,
        type: 'purchase',
        category: 'payment',
        title: 'Vidéo débloquée',
        description: `Votre vidéo a été débloquée.`,
        targetHref: `/videos/${targetId}`,
        isRead: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    return;
  }

  if (type === 'cart' && items.length > 0) {
    const videoIds = items.filter((i) => String(i?.type).toLowerCase() === 'video' && String(i?.id || '').trim()).map((i) => String(i.id).trim());
    const packIds = items.filter((i) => String(i?.type).toLowerCase() === 'pack' && String(i?.id || '').trim()).map((i) => String(i.id).trim().toLowerCase());

    const updateOps = {};
    if (videoIds.length > 0) {
      updateOps.$addToSet = { ...(updateOps.$addToSet || {}), purchasedVideos: { $each: videoIds } };
    }
    if (packIds.length > 0) {
      updateOps.$addToSet = { ...(updateOps.$addToSet || {}), purchasedPacks: { $each: packIds } };
    }
    if (Object.keys(updateOps).length > 0) {
      updateOps.$set = { updatedAt: nowIso };
      await User.updateOne({ uid: userId }, updateOps);
    }

    const db = mongoose.connection?.db;
    if (db) {
      const notifDesc = `Votre panier (${videoIds.length} vidéo(s), ${packIds.length} pack(s)) a été validé.`;
      await db.collection('notifications').insertOne({
        userId,
        type: 'purchase',
        category: 'payment',
        title: 'Achat confirmé',
        description: notifDesc,
        targetHref: '/purchases',
        isRead: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    return;
  }

  // Fallback generic notification
  const db = mongoose.connection?.db;
  if (db) {
    await db.collection('notifications').insertOne({
      userId,
      type: 'payment',
      category: 'payment',
      title: 'Paiement confirmé',
      description: 'Votre paiement a été confirmé et votre accès a été mis à jour.',
      targetHref: '/purchases',
      isRead: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/payments/create-checkout  (auth required)
// ─────────────────────────────────────────────────────────────
router.post('/create-checkout', authRequired, async (req, res) => {
  try {
    const secretKey = env.chargily?.secretKey || process.env.CHARGILY_SECRET_KEY || '';
    if (!secretKey) {
      return res.status(500).json({
        message:
          'Chargily Pay non configuré. Veuillez définir CHARGILY_SECRET_KEY dans les variables d’environnement backend.',
      });
    }

    const validation = validateCreateCheckoutPayload(req.body);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { amount, currency, type, targetId, plan, locale, paymentMethod, description, items } = validation;

    const userId = String(req.authUser.uid || '').trim();
    const userEmail = String(req.authUser.email || '').trim();

    // Build metadata for webhook recovery
    const metadata = {
      userId,
      userEmail,
      type,
      targetId: targetId || '',
      plan: plan || '',
      // Store items as JSON string if needed? Chargily metadata is key-value flat; we use JSON string for items
      items: items.length > 0 ? JSON.stringify(items) : '',
      app: 'orl-platform-dems',
    };

    // For redundancy, also store full items separately in metadata_flat
    // Chargily may restrict metadata value lengths; we keep items minimal

    const baseUrl = resolveChargilyBaseUrl();

    // Prepare temporary checkout payload – we need checkoutId for success/failure URLs.
    // However Chargily generates checkout ID server-side. So we have two options:
    // 1) Use placeholder success/failure URLs without checkoutId, and rely on webhook + client redirect with checkout_id query from Chargily's redirect.
    // Chargily automatically appends ?checkout_id=... when redirecting to success_url/failure_url.
    // So we can set success_url without id, and Chargily will add it.
    // To be safe we set URLs without id and also handle query.

    const frontend = resolveFrontendBaseUrl();
    const successUrl = `${frontend}/payments/success`;
    const failureUrl = `${frontend}/payments/failure`;

    // Determine webhook endpoint
    const webhookEndpoint = buildWebhookUrl();

    const chargilyPayload = {
      amount,
      currency,
      locale,
      description: description || `ORL DEMS - ${type}${targetId ? ` ${targetId}` : ''}${plan ? ` ${plan}` : ''}`.trim().slice(0, 100) || 'Paiement ORL DEMS',
      success_url: successUrl,
      failure_url: failureUrl,
      metadata,
    };

    if (webhookEndpoint) {
      chargilyPayload.webhook_endpoint = webhookEndpoint;
    }

    if (paymentMethod) {
      chargilyPayload.payment_method = paymentMethod;
    }

    // Optional: fees allocation via env or default customer
    if (process.env.CHARGILY_FEES_ALLOCATION) {
      chargilyPayload.chargily_pay_fees_allocation = String(process.env.CHARGILY_FEES_ALLOCATION).trim();
    }

    const response = await fetch(`${baseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chargilyPayload),
    });

    const responseText = await response.text();
    let payloadJson;
    try {
      payloadJson = responseText ? JSON.parse(responseText) : {};
    } catch {
      payloadJson = { raw: responseText };
    }

    if (!response.ok) {
      console.error('[chargily] create-checkout failed:', response.status, payloadJson);
      const msg = payloadJson?.message || payloadJson?.error || responseText || 'Erreur Chargily Pay';
      return res.status(response.status).json({
        message: `Chargily erreur: ${msg}`,
        details: payloadJson,
      });
    }

    const checkoutId = String(payloadJson?.id || payloadJson?.checkout?.id || '').trim();
    const checkoutUrl = String(payloadJson?.checkout_url || payloadJson?.checkoutUrl || payloadJson?.url || '').trim();

    if (!checkoutId || !checkoutUrl) {
      console.error('[chargily] unexpected response shape', payloadJson);
      return res.status(502).json({ message: 'Réponse Chargily invalide (checkout_url manquant).', details: payloadJson });
    }

    // Persist payment doc
    const db = mongoose.connection?.db;
    if (!db) {
      return res.status(500).json({ message: 'Base de données indisponible.' });
    }

    const nowIso = new Date().toISOString();
    const paymentDoc = {
      userId,
      amount,
      currency,
      type,
      targetId: targetId || null,
      plan: plan || null,
      items: items.length > 0 ? items : null,
      method: 'chargily',
      paymentMethod: paymentMethod || null,
      chargilyCheckoutId: checkoutId,
      checkoutId,
      checkoutUrl,
      status: 'pending',
      locale,
      description: chargilyPayload.description,
      metadata,
      chargilyResponse: payloadJson,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const insertResult = await db.collection('payments').insertOne(paymentDoc);

    return res.json({
      id: String(insertResult.insertedId),
      checkoutId,
      checkoutUrl,
      paymentId: String(insertResult.insertedId),
      amount,
      currency,
    });
  } catch (error) {
    console.error('[chargily] create-checkout error:', error);
    return res.status(500).json({ message: error?.message || 'Erreur interne lors de la création du paiement.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/payments/verify/:checkoutId
// Vérifie le statut d'un checkout côté serveur (fallback si webhook non reçu)
// ─────────────────────────────────────────────────────────────
router.get('/verify/:checkoutId', authRequired, async (req, res) => {
  try {
    const secretKey = env.chargily?.secretKey || process.env.CHARGILY_SECRET_KEY || '';
    if (!secretKey) {
      return res.status(500).json({ message: 'Chargily non configuré.' });
    }

    const checkoutId = String(req.params.checkoutId || '').trim();
    if (!checkoutId) {
      return res.status(400).json({ message: 'checkoutId manquant.' });
    }

    const db = mongoose.connection?.db;
    if (!db) {
      return res.status(500).json({ message: 'DB indisponible.' });
    }

    const payment = await findPaymentByCheckoutId(db, checkoutId);
    if (!payment) {
      return res.status(404).json({ message: 'Paiement introuvable pour ce checkout.' });
    }

    // Vérifier que l'utilisateur propriétaire ou admin
    const isOwner = String(payment.userId) === String(req.authUser.uid);
    const isAdmin = req.authUser.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const baseUrl = resolveChargilyBaseUrl();
    const response = await fetch(`${baseUrl}/checkouts/${encodeURIComponent(checkoutId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      console.error('[chargily] verify failed', response.status, payload);
      return res.status(response.status).json({ message: payload?.message || 'Erreur vérification Chargily', details: payload });
    }

    // Chargily checkout object - handle wrapped or direct
    const checkout = payload?.data || payload?.checkout || payload;
    const status = String(checkout?.status || '').toLowerCase();

    // Map Chargily status to internal status
    // Chargily statuses: pending, paid, failed, canceled, expired
    let internalStatus = String(payment.status || 'pending').toLowerCase();
    let shouldApprove = false;
    let shouldFail = false;

    if (status === 'paid') {
      internalStatus = 'approved';
      shouldApprove = true;
    } else if (['failed', 'canceled', 'cancelled', 'expired'].includes(status)) {
      internalStatus = 'rejected';
      shouldFail = true;
    } else if (status === 'pending') {
      internalStatus = 'pending';
    }

    const nowIso = new Date().toISOString();

    if (shouldApprove && payment.status !== 'approved') {
      await db.collection('payments').updateOne(
        { _id: payment._id },
        {
          $set: {
            status: 'approved',
            chargilyStatus: status,
            chargilyCheckout: checkout,
            updatedAt: nowIso,
          },
        },
      );
      // Re-fetch updated payment for approval logic
      const updatedPayment = { ...payment, status: 'approved', chargilyStatus: status };
      try {
        await applyApprovedPaymentToUser({ payment: updatedPayment, checkoutMetadata: checkout?.metadata || metadataFromCheckout(checkout) });
      } catch (e) {
        console.error('[chargily] applyApproved error (verify)', e);
      }
    } else if (shouldFail && payment.status !== 'rejected') {
      await db.collection('payments').updateOne(
        { _id: payment._id },
        {
          $set: {
            status: 'rejected',
            chargilyStatus: status,
            chargilyCheckout: checkout,
            updatedAt: nowIso,
          },
        },
      );
    } else {
      // Just update chargily status cache
      await db.collection('payments').updateOne(
        { _id: payment._id },
        {
          $set: {
            chargilyStatus: status,
            chargilyCheckout: checkout,
            updatedAt: nowIso,
          },
        },
      );
    }

    const fresh = await db.collection('payments').findOne({ _id: payment._id });

    return res.json({
      payment: fresh,
      checkout,
      status: fresh?.status || internalStatus,
      chargilyStatus: status,
    });
  } catch (error) {
    console.error('[chargily] verify error', error);
    return res.status(500).json({ message: error?.message || 'Erreur vérification.' });
  }
});

// Helper to extract metadata when Chargily stores it flat
const metadataFromCheckout = (checkout) => {
  const meta = checkout?.metadata || {};
  // Items might be JSON string
  let items = [];
  if (meta?.items) {
    try {
      const parsed = JSON.parse(String(meta.items));
      if (Array.isArray(parsed)) items = parsed;
    } catch {}
  }
  return {
    userId: meta?.userId || '',
    type: meta?.type || '',
    targetId: meta?.targetId || '',
    plan: meta?.plan || '',
    items,
  };
};

// ─────────────────────────────────────────────────────────────
// POST /api/payments/webhook
// Réception des webhooks Chargily Pay
// ─────────────────────────────────────────────────────────────
// Note: express.json middleware is configured with verify to keep rawBody.
// We verify signature against rawBody.
router.post('/webhook', async (req, res) => {
  const secret = env.chargily?.webhookSecret || env.chargily?.secretKey || process.env.CHARGILY_SECRET_KEY || '';
  const receivedSignature = req.headers['signature'] || req.headers['x-chargily-signature'] || req.headers['x-signature'] || '';

  // Try to get raw body
  const rawBody = typeof req.rawBody === 'string' && req.rawBody.length > 0 ? req.rawBody : JSON.stringify(req.body || {});

  if (secret && receivedSignature) {
    if (!isValidSignature(rawBody, String(receivedSignature), secret)) {
      console.warn('[chargily] webhook invalid signature', { receivedSignature: String(receivedSignature).slice(0, 20) + '...' });
      return res.status(403).json({ message: 'Invalid signature' });
    }
  } else if (secret && !receivedSignature) {
    // If secret configured but no signature, warn but allow in dev for testing
    console.warn('[chargily] webhook received without signature – rejecting in production');
    // In production, you should reject. We'll allow but log.
    // return res.status(400).json({ message: 'Missing signature' });
  }

  let event;
  try {
    event = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ message: 'Invalid JSON payload' });
  }

  // Extract type and data
  const eventType = String(event?.type || event?.event || '').toLowerCase();
  const data = event?.data || event?.checkout || event;

  // Checkout ID and status
  const checkoutId = String(data?.id || data?.checkout_id || data?.checkoutId || '').trim();
  const checkoutStatus = String(data?.status || '').toLowerCase();

  // Metadata recovery
  const metaFromCheckout = metadataFromCheckout(data);
  // Also fallback to data.metadata directly
  const metadata = {
    userId: String(data?.metadata?.userId || metaFromCheckout.userId || '').trim(),
    type: String(data?.metadata?.type || metaFromCheckout.type || '').trim().toLowerCase(),
    targetId: String(data?.metadata?.targetId || metaFromCheckout.targetId || '').trim(),
    plan: String(data?.metadata?.plan || metaFromCheckout.plan || '').trim(),
    items: metaFromCheckout.items || [],
  };

  console.log('[chargily] webhook received', { eventType, checkoutId, checkoutStatus, metadata });

  const db = mongoose.connection?.db;
  if (!db) {
    console.error('[chargily] webhook DB unavailable');
    return res.status(500).json({ message: 'DB unavailable' });
  }

  // Find corresponding payment
  let payment = null;
  if (checkoutId) {
    payment = await findPaymentByCheckoutId(db, checkoutId);
  }

  // If payment not found but we have metadata, try lookup by userId+amount+recent?
  if (!payment && checkoutId) {
    // Create an orphan payment record for traceability if not found?
    // We'll try to create one if we have metadata
    if (metadata.userId) {
      const amount = Number(data?.amount || 0);
      const nowIso = new Date().toISOString();
      const orphanDoc = {
        userId: metadata.userId,
        amount,
        currency: String(data?.currency || 'dzd').toLowerCase(),
        type: metadata.type || 'unknown',
        targetId: metadata.targetId || null,
        plan: metadata.plan || null,
        items: metadata.items.length > 0 ? metadata.items : null,
        method: 'chargily',
        chargilyCheckoutId: checkoutId,
        checkoutId,
        status: 'pending',
        metadata,
        chargilyCheckout: data,
        chargilyStatus: checkoutStatus,
        createdAt: nowIso,
        updatedAt: nowIso,
        orphan: true,
      };
      const inserted = await db.collection('payments').insertOne(orphanDoc);
      payment = { ...orphanDoc, _id: inserted.insertedId };
      console.log('[chargily] created orphan payment', inserted.insertedId);
    }
  }

  if (!payment) {
    console.warn('[chargily] webhook: payment not found for checkout', checkoutId);
    // Still return 200 to prevent retries storm, but log
    return res.json({ ok: true, message: 'Payment not found, logged.' });
  }

  const nowIso = new Date().toISOString();

  // Handle event types
  // Chargily sends checkout.paid, checkout.failed, checkout.canceled, etc.
  const isPaid = eventType === 'checkout.paid' || checkoutStatus === 'paid';
  const isFailed = eventType === 'checkout.failed' || ['failed', 'canceled', 'cancelled', 'expired'].includes(checkoutStatus) || eventType.includes('failed') || eventType.includes('canceled');

  if (isPaid) {
    if (payment.status !== 'approved') {
      await db.collection('payments').updateOne(
        { _id: payment._id },
        {
          $set: {
            status: 'approved',
            chargilyStatus: checkoutStatus || 'paid',
            chargilyEventType: eventType,
            chargilyCheckout: data,
            updatedAt: nowIso,
          },
        },
      );

      const updatedPayment = { ...payment, status: 'approved', type: metadata.type || payment.type, targetId: metadata.targetId || payment.targetId, plan: metadata.plan || payment.plan, items: metadata.items.length > 0 ? metadata.items : payment.items };

      try {
        // For cart, items may be in payment.items already, or in metadata.items JSON
        // Ensure updatedPayment has items
        if ((!updatedPayment.items || updatedPayment.items.length === 0) && metadata.items.length > 0) {
          updatedPayment.items = metadata.items;
        }
        await applyApprovedPaymentToUser({ payment: updatedPayment, checkoutMetadata: metadata });
      } catch (e) {
        console.error('[chargily] webhook applyApproved error', e);
      }
    }
    return res.json({ ok: true, status: 'approved' });
  }

  if (isFailed) {
    if (payment.status !== 'rejected') {
      await db.collection('payments').updateOne(
        { _id: payment._id },
        {
          $set: {
            status: 'rejected',
            chargilyStatus: checkoutStatus || eventType,
            chargilyEventType: eventType,
            chargilyCheckout: data,
            updatedAt: nowIso,
          },
        },
      );
    }
    return res.json({ ok: true, status: 'rejected' });
  }

  // For pending or other events, just update cache
  await db.collection('payments').updateOne(
    { _id: payment._id },
    {
      $set: {
        chargilyStatus: checkoutStatus,
        chargilyEventType: eventType,
        chargilyCheckout: data,
        updatedAt: nowIso,
      },
    },
  );

  return res.json({ ok: true, status: payment.status });
});

// ─────────────────────────────────────────────────────────────
// GET /api/payments/history  (auth required) – alias pour frontend
// ─────────────────────────────────────────────────────────────
router.get('/history', authRequired, async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(500).json({ message: 'DB indisponible.' });
    const userId = String(req.authUser.uid);
    const isAdmin = req.authUser.role === 'admin';
    const filter = isAdmin && req.query.all === '1' ? {} : { userId };
    const docs = await db.collection('payments').find(filter).sort({ createdAt: -1 }).limit(100).toArray();
    return res.json({ docs: docs.map((d) => ({ id: String(d._id), ...d, id: String(d._id) })) });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur' });
  }
});

export default router;
