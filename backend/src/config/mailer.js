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

export const getContactRecipient = () => {
  const explicit = String(process.env.CONTACT_TO_EMAIL || '').trim();
  if (explicit) return explicit;
  if (smtpFromEmail) return smtpFromEmail;
  if (smtpUser) return smtpUser;
  return '';
};

const buildContactEmailText = ({ name, email, phone, subject, message, metaLine }) => {
  return [
    `Nouveau message de contact — DEMS ENT`,
    '',
    `Nom: ${name}`,
    `Email: ${email}`,
    phone ? `Telephone: ${phone}` : null,
    `Sujet: ${subject}`,
    metaLine ? `Info: ${metaLine}` : null,
    '',
    'Message:',
    message,
    '',
    `— Envoye depuis le formulaire de contact DEMS ENT`,
  ].filter(Boolean).join('\n');
};

const buildContactEmailHtml = ({ safeName, safeEmail, safePhone, safeSubject, safeMessageHtml, safeMetaLine, receivedAtLabel }) => {
  const brandName = escapeHtml(smtpFromName || 'DEMS ENT');
  const currentYear = new Date().getFullYear();
  const recipientDisplay = escapeHtml(getContactRecipient() || smtpFromEmail || '');

  return `
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nouveau message — ${brandName}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3ede8;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Nouveau message de ${safeName} — ${safeSubject}
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3ede8;padding:26px 14px;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center">
          <!-- container -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background-color:#ffffff;border:1px solid #e8ddd0;border-radius:16px;overflow:hidden;box-shadow:0 10px 28px rgba(63,51,38,0.08);">
            <!-- header -->
            <tr>
              <td style="background:linear-gradient(135deg,#2f261d 0%,#3d2d1e 52%,#8a5a36 100%);padding:22px 26px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <p style="margin:0;color:#fff6ed;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;opacity:0.92;">DEMS ENT &nbsp;·&nbsp; Plateforme ORL</p>
                      <p style="margin:8px 0 0 0;color:#ffffff;font-size:20px;font-weight:800;line-height:1.25;letter-spacing:-0.02em;">Nouveau message de contact</p>
                      <p style="margin:6px 0 0 0;color:#f5e0c8;font-size:13px;line-height:1.5;">Reçu via le formulaire <strong style="color:#fff;">Contactez-nous</strong> — réponse directe possible.</p>
                    </td>
                    <td align="right" valign="top" style="padding-left:12px;">
                      <span style="display:inline-block;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.22);color:#fff6ed;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:7px 10px;border-radius:999px;white-space:nowrap;">● Nouveau</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- sender meta grid -->
            <tr>
              <td style="padding:20px 24px 0 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #efe3d3;background:#fffaf2;border-radius:12px;overflow:hidden;">
                  <tr>
                    <td style="padding:14px 16px;width:50%;border-right:1px solid #efe3d3;vertical-align:top;">
                      <p style="margin:0;color:#8a7762;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Expéditeur</p>
                      <p style="margin:8px 0 0 0;color:#2f261d;font-size:15px;font-weight:700;line-height:1.35;">${safeName}</p>
                      <p style="margin:4px 0 0 0;color:#b0673e;font-size:13px;font-weight:600;word-break:break-all;">
                        <a href="mailto:${safeEmail}" style="color:#b0673e;text-decoration:none;word-break:break-all;">${safeEmail}</a>
                      </p>
                      ${safePhone ? `<p style="margin:6px 0 0 0;color:#5d4b3a;font-size:13px;line-height:1.5;">☎ ${safePhone}</p>` : ''}
                    </td>
                    <td style="padding:14px 16px;width:50%;vertical-align:top;">
                      <p style="margin:0;color:#8a7762;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Sujet & infos</p>
                      <p style="margin:8px 0 0 0;display:inline-block;background:#2f261d;color:#fff6ed;font-size:12px;font-weight:700;padding:6px 10px;border-radius:999px;max-width:100%;word-break:break-word;">${safeSubject}</p>
                      <p style="margin:10px 0 0 0;color:#7a6a57;font-size:12px;line-height:1.6;">${safeMetaLine}</p>
                      <p style="margin:4px 0 0 0;color:#9a8a78;font-size:11px;">Reçu le ${escapeHtml(receivedAtLabel)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- message -->
            <tr>
              <td style="padding:18px 24px 0 24px;">
                <p style="margin:0;color:#8a7762;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Message</p>
                <div style="margin:10px 0 0 0;background:#ffffff;border:1px solid #e8ddd0;border-left:4px solid #b0673e;border-radius:12px;padding:16px 16px;color:#2f261d;font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word;">${safeMessageHtml}</div>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td style="padding:18px 24px 0 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#b0673e" style="border-radius:10px;">
                      <a href="mailto:${safeEmail}?subject=Re:%20${safeSubject}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 18px;font-size:13px;font-weight:800;letter-spacing:0.02em;color:#fff6ed;text-decoration:none;">
                        ↩ Répondre à ${safeName}
                      </a>
                    </td>
                    <td style="padding-left:10px;">
                      <a href="mailto:${safeEmail}" style="display:inline-block;padding:11px 14px;font-size:12px;font-weight:700;color:#5d4b3a;text-decoration:none;border:1px solid #e8ddd0;border-radius:10px;background:#fffaf2;">Copier l'email</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:10px 0 0 0;color:#9a8a78;font-size:11px;line-height:1.6;">Astuce : le champ <strong>Répondre</strong> de cet email pointe déjà vers <strong>${safeEmail}</strong> — cliquez simplement sur Répondre.</p>
              </td>
            </tr>

            <!-- tip -->
            <tr>
              <td style="padding:16px 24px 0 24px;">
                <div style="background:#f9f5ef;border:1px dashed #e8ddd0;border-radius:10px;padding:11px 13px;">
                  <p style="margin:0;color:#7a6a57;font-size:12px;line-height:1.6;">
                    <strong style="color:#3f3326;">Info :</strong> ce message a été envoyé depuis <strong>dems-ent.com/contact</strong>. Ne pas répondre directement à ${recipientDisplay} si vous consultez cet email via une redirection.
                  </p>
                </div>
              </td>
            </tr>

            <!-- footer -->
            <tr>
              <td style="padding:18px 24px 22px 24px;border-top:1px solid #efe3d3;margin-top:16px;">
                <p style="margin:0;color:#9a8a78;font-size:11px;line-height:1.6;">
                  © ${currentYear} ${brandName}. Plateforme DEMS ENT — ORL.
                  <span style="color:#bba99a;">Cet email est généré automatiquement depuis le formulaire de contact.</span>
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:14px 0 0 0;color:#9a8a78;font-size:11px;">Si le bouton ne fonctionne pas, répondez directement à : <a href="mailto:${safeEmail}" style="color:#b0673e;text-decoration:underline;">${safeEmail}</a></p>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
};

export const sendContactMail = async ({ name, email, phone, subject, message, meta }) => {
  const transporter = resolveTransporter();
  if (!transporter) return false;

  const to = getContactRecipient();
  if (!to) return false;

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePhone = phone ? escapeHtml(phone) : '';
  const safeSubject = escapeHtml(subject);
  const safeMessageHtml = escapeHtml(message).replace(/\n/g, '<br />');
  const receivedAtLabel = new Date().toLocaleString('fr-DZ', {
    timeZone: 'Africa/Algiers',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const metaBits = [];
  if (meta?.ip) metaBits.push(`IP: ${escapeHtml(meta.ip)}`);
  if (meta?.userAgent) metaBits.push(escapeHtml(String(meta.userAgent).slice(0, 120)));
  const safeMetaLine = metaBits.length ? metaBits.join(' · ') : 'Formulaire web — DEMS ENT';

  const html = buildContactEmailHtml({
    safeName,
    safeEmail,
    safePhone,
    safeSubject,
    safeMessageHtml,
    safeMetaLine,
    receivedAtLabel,
  });
  const text = buildContactEmailText({
    name,
    email,
    phone,
    subject,
    message,
    metaLine: metaBits.join(' | ') || 'Formulaire web DEMS ENT',
  });

  await transporter.sendMail({
    from: buildFromHeader(),
    to,
    replyTo: `"${String(name).replace(/"/g, "'")}" <${email}>`,
    subject: `[DEMS ENT] Contact — ${subject} — ${name}`,
    text,
    html,
  });

  return true;
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
