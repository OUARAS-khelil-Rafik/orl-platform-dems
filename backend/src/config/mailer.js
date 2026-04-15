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

const buildPasswordResetEmailText = ({ displayName, resetUrl, expiryLabel }) => {
  const safeDisplayName = String(displayName || 'Utilisateur').trim() || 'Utilisateur';
  const safeExpiryLabel = String(expiryLabel || '').trim() || '30';

  return [
    `Bonjour ${safeDisplayName},`,
    '',
    'Nous avons recu une demande de reinitialisation de votre mot de passe.',
    `Ce lien est valide pendant ${safeExpiryLabel} minutes.`,
    '',
    'Reinitialiser mon mot de passe :',
    resetUrl,
    '',
    "Si vous n'etes pas a l'origine de cette demande, vous pouvez ignorer cet email.",
    `Equipe ${smtpFromName}`,
  ].join('\n');
};

const buildPasswordResetEmailHtml = ({ safeName, safeResetUrl, expiryLabel }) => {
  const brandName = escapeHtml(smtpFromName || 'DEMS ENT');
  const supportEmail = escapeHtml(smtpFromEmail || 'support@example.com');
  const safeExpiryLabel = escapeHtml(expiryLabel);
  const currentYear = new Date().getFullYear();

  return `
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reinitialisation du mot de passe</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Reinitialisez votre mot de passe en toute securite.
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background-color:#1f2937;padding:20px 24px;">
                <p style="margin:0;color:#f9fafb;font-size:18px;font-weight:700;letter-spacing:0.2px;">${brandName}</p>
                <p style="margin:6px 0 0 0;color:#d1d5db;font-size:13px;">Securite du compte</p>
              </td>
            </tr>

            <tr>
              <td style="padding:28px 24px 10px 24px;color:#111827;">
                <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.3;color:#111827;">Reinitialisation du mot de passe</h1>
                <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#374151;">Bonjour ${safeName},</p>
                <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#374151;">
                  Nous avons recu une demande de reinitialisation de votre mot de passe.
                  Pour continuer, cliquez sur le bouton ci-dessous.
                </p>
                <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#4b5563;">
                  Ce lien est valide pendant <strong>${safeExpiryLabel} minutes</strong>.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 16px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left" style="margin:0;">
                  <tr>
                    <td align="center" bgcolor="#b0673e" style="border-radius:10px;">
                      <a href="${safeResetUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
                        Reinitialiser mon mot de passe
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 24px 0 24px;">
                <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;line-height:1.6;">
                  Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :
                </p>
                <p style="margin:0;padding:12px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;word-break:break-all;font-size:12px;color:#374151;line-height:1.5;">
                  <a href="${safeResetUrl}" target="_blank" rel="noopener noreferrer" style="color:#b0673e;text-decoration:underline;">${safeResetUrl}</a>
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 24px 6px 24px;">
                <div style="background-color:#fef3f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;">
                  <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#991b1b;">Information de securite</p>
                  <p style="margin:0;font-size:13px;line-height:1.6;color:#7f1d1d;">
                    Si vous n'etes pas a l'origine de cette demande, vous pouvez ignorer cet email.
                    Votre mot de passe actuel restera inchange.
                  </p>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 24px 24px 24px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">
                  Besoin d'aide ? Contactez-nous : <a href="mailto:${supportEmail}" style="color:#b0673e;text-decoration:underline;">${supportEmail}</a>
                </p>
                <p style="margin:10px 0 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
                  © ${currentYear} ${brandName}. Tous droits reserves.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
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
  const text = buildPasswordResetEmailText({
    displayName,
    resetUrl,
    expiryLabel,
  });

  const html = buildPasswordResetEmailHtml({
    safeName,
    safeResetUrl,
    expiryLabel,
  });

  await transporter.sendMail({
    from: buildFromHeader(),
    to: toEmail,
    subject,
    text,
    html,
  });

  return true;
};
