import nodemailer from 'nodemailer';

const parseBooleanFlag = (value, fallback = false) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const parseSmtpPort = (value) => {
  const parsed = Number.parseInt(String(value || '587'), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 587;
  }
  return parsed;
};

const smtpHost = String(process.env.SMTP_HOST || '').trim();
const smtpPort = parseSmtpPort(process.env.SMTP_PORT);
const smtpUser = String(process.env.SMTP_USER || '').trim();
const isGmailSmtpHost = /(^|\.)gmail\.com$/i.test(smtpHost);
const smtpPassRaw = String(process.env.SMTP_PASS || '').trim();
const smtpPass = isGmailSmtpHost ? smtpPassRaw.replace(/\s+/g, '') : smtpPassRaw;
const smtpFromEmail = String(process.env.SMTP_FROM_EMAIL || '').trim();
const smtpFromName = String(process.env.SMTP_FROM_NAME || 'DEMS ENT').trim() || 'DEMS ENT';

const smtpSecureDefault = smtpPort === 465;
const smtpSecure = parseBooleanFlag(process.env.SMTP_SECURE, smtpSecureDefault);

const hasHost = smtpHost.length > 0;
const hasSender = smtpFromEmail.length > 0;
const hasPartialAuth = (smtpUser.length > 0 && smtpPass.length === 0) || (smtpUser.length === 0 && smtpPass.length > 0);

const canUseAuth = smtpUser.length > 0 && smtpPass.length > 0;

export const isSmtpMailerConfigured = hasHost && hasSender && !hasPartialAuth;

export const isGmailAppPasswordAuthError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  const response = String(error?.response || '').toLowerCase();

  if (code !== 'EAUTH') {
    return false;
  }

  if (responseCode !== 534 && responseCode !== 535) {
    return false;
  }

  return (
    response.includes('application-specific password required')
    || response.includes('invalidsecondfactor')
    || response.includes('invalid second factor')
  );
};

let cachedTransporter = null;

const resolveTransporter = () => {
  if (!isSmtpMailerConfigured) {
    return null;
  }

  if (cachedTransporter) {
    return cachedTransporter;
  }

  const transportOptions = {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
  };

  if (canUseAuth) {
    transportOptions.auth = {
      user: smtpUser,
      pass: smtpPass,
    };
  }

  cachedTransporter = nodemailer.createTransport(transportOptions);
  return cachedTransporter;
};

const escapeHtml = (value) => {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const buildFromHeader = () => {
  if (!smtpFromName) {
    return smtpFromEmail;
  }
  return `"${smtpFromName}" <${smtpFromEmail}>`;
};

export const sendPasswordResetMail = async ({ toEmail, displayName, resetUrl, expiresInMinutes }) => {
  const transporter = resolveTransporter();
  if (!transporter) {
    return false;
  }

  const safeName = escapeHtml(displayName || 'Utilisateur');
  const safeResetUrl = escapeHtml(resetUrl);
  const expiryLabel = `${Math.max(5, Number(expiresInMinutes) || 30)}`;

  const subject = 'Reinitialisation du mot de passe DEMS ENT';
  const text = [
    `Bonjour ${displayName || 'Utilisateur'},`,
    '',
    'Nous avons recu une demande de reinitialisation de votre mot de passe.',
    `Lien de reinitialisation (valide ${expiryLabel} minutes):`,
    resetUrl,
    '',
    "Si vous n'etes pas a l'origine de cette demande, vous pouvez ignorer cet email.",
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>Bonjour ${safeName},</p>
      <p>Nous avons recu une demande de reinitialisation de votre mot de passe.</p>
      <p>
        <a href="${safeResetUrl}" style="display:inline-block;padding:10px 16px;background:#b45309;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
          Reinitialiser mon mot de passe
        </a>
      </p>
      <p>Ce lien est valide pendant ${escapeHtml(expiryLabel)} minutes.</p>
      <p>Si vous n'etes pas a l'origine de cette demande, vous pouvez ignorer cet email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: buildFromHeader(),
    to: toEmail,
    subject,
    text,
    html,
  });

  return true;
};
