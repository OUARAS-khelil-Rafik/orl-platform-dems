import express from 'express';
import { getContactRecipient, isSmtpMailerConfigured, sendContactMail } from '../config/mailer.js';

const router = express.Router();

// ─────────────────────────────────────────────
// In-memory rate limiting (per IP + per email)
// 15 min window, 5 req / IP, 5 req / email
// Simple Map — resets on server restart (fine for this use-case)
// For production multi-instance, consider Redis.
// ─────────────────────────────────────────────
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;

const buckets = new Map(); // key -> { count, resetAt }

const isRateLimited = (key) => {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= MAX_PER_WINDOW) return true;
  entry.count += 1;
  return false;
};

// Periodic cleanup every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets.entries()) {
    if (now > v.resetAt) buckets.delete(k);
  }
}, 10 * 60 * 1000).unref?.();

const getClientIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
};

const ALLOWED_SUBJECTS = new Set([
  'Accès & comptes',
  'Paiements & abonnements',
  'Contenu pédagogique',
  'Support technique',
  'Autre',
]);

const validateContactPayload = (body) => {
  const errors = {};

  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const phone = String(body?.phone || '').trim();
  const subject = String(body?.subject || '').trim();
  const message = String(body?.message || '').trim();
  const website = String(body?.website || '').trim(); // honeypot

  // Honeypot: silently accept but signal bot
  const isBot = website.length > 0;

  if (!isBot) {
    if (name.length < 2) errors.name = 'Nom trop court (min 2 caractères).';
    else if (name.length > 80) errors.name = 'Nom trop long (max 80 caractères).';

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) errors.email = 'Email requis.';
    else if (!emailRe.test(email)) errors.email = 'Email invalide.';
    else if (email.length > 120) errors.email = 'Email trop long.';

    if (phone && phone.length > 30) errors.phone = 'Téléphone trop long.';
    // basic phone chars
    if (phone && !/^[\d\s+().-]{6,30}$/.test(phone)) {
      errors.phone = 'Téléphone invalide.';
    }

    if (!subject) errors.subject = 'Sujet requis.';
    else if (subject.length < 3) errors.subject = 'Sujet trop court.';
    else if (subject.length > 120) errors.subject = 'Sujet trop long (max 120).';
    // allow either predefined or free subject, but if not in allowed set we still accept free text
    // no extra check

    if (!message) errors.message = 'Message requis.';
    else if (message.length < 10) errors.message = 'Message trop court (min 10 caractères).';
    else if (message.length > 5000) errors.message = 'Message trop long (max 5000 caractères).';
  }

  return {
    isBot,
    errors,
    sanitized: { name, email, phone, subject, message, website },
    isValid: Object.keys(errors).length === 0,
  };
};

router.post('/', async (req, res) => {
  const ip = getClientIp(req);
  const { isBot, errors, sanitized, isValid } = validateContactPayload(req.body || {});

  // Honeypot bot: pretend success
  if (isBot) {
    await new Promise((r) => setTimeout(r, 300));
    return res.json({ ok: true, message: 'Message bien reçu. Nous vous répondrons rapidement.' });
  }

  if (!isValid) {
    return res.status(400).json({ message: 'Validation échouée.', errors });
  }

  // Rate limit checks
  const ipKey = `ip:${ip}`;
  const emailKey = `email:${sanitized.email}`;

  if (isRateLimited(ipKey)) {
    return res.status(429).json({
      message: 'Trop de messages envoyés. Réessayez dans quelques minutes.',
    });
  }
  if (isRateLimited(emailKey)) {
    // rollback ip count? not needed; keep both
    return res.status(429).json({
      message: 'Trop de messages avec cet email. Réessayez plus tard.',
    });
  }

  if (!isSmtpMailerConfigured) {
    console.error('[contact] SMTP not configured — CONTACT_TO_EMAIL=', getContactRecipient());
    return res.status(503).json({
      message: "Le service d'envoi d'email est momentanément indisponible. Contactez-nous directement à " + (getContactRecipient() || 'kh.ouaras@univ-alger.dz'),
    });
  }

  const recipient = getContactRecipient();
  if (!recipient) {
    return res.status(503).json({ message: "Destinataire de contact non configuré." });
  }

  try {
    const sent = await sendContactMail({
      name: sanitized.name,
      email: sanitized.email,
      phone: sanitized.phone,
      subject: sanitized.subject,
      message: sanitized.message,
      meta: {
        ip,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
      },
    });

    if (!sent) {
      return res.status(500).json({ message: "L'envoi du message a échoué. Réessayez ou écrivez à " + recipient });
    }

    return res.json({
      ok: true,
      message: 'Message envoyé avec succès. Nous vous répondrons très bientôt.',
    });
  } catch (err) {
    console.error('[contact] send error:', err?.message || err, err?.response || '');
    return res.status(500).json({
      message: "Une erreur est survenue lors de l'envoi. Réessayez ou écrivez directement à " + recipient,
    });
  }
});

// Optional: health / debug for admin
router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    smtpConfigured: isSmtpMailerConfigured,
    recipient: getContactRecipient() || null,
  });
});

export default router;
