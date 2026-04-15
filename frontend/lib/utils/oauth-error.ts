const decodeSafely = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const stripHttpPrefix = (value: string) => {
  const match = value.match(/^HTTP\s+\d+\s*:\s*(.+)$/i);
  if (!match?.[1]) {
    return value;
  }

  return match[1].trim();
};

export const normalizeGoogleOAuthError = (rawError: unknown) => {
  const source = typeof rawError === 'string' ? rawError.trim() : '';
  if (!source) {
    return '';
  }

  const normalizedSource = stripHttpPrefix(decodeSafely(source));
  const lower = normalizedSource.toLowerCase();

  if (
    lower.includes('this email is already linked to another google account')
    || lower.includes('cet email est deja lie a un autre compte google')
  ) {
    return 'Cet email est deja lie a un autre compte Google.';
  }

  if (lower.includes('conflit de compte detecte')) {
    return 'Conflit detecte entre votre compte Google et un compte existant. Contactez le support.';
  }

  if (lower.includes('ce compte google est deja lie a un autre utilisateur')) {
    return 'Ce compte Google est deja lie a un autre utilisateur.';
  }

  if (lower.includes('cet email google est deja utilise par un autre compte')) {
    return 'Cet email Google est deja utilise par un autre compte. Connectez-vous avec ce compte pour lier Google.';
  }

  if (lower.includes('session google expiree')) {
    return 'Session Google expiree. Reessayez.';
  }

  if (lower.includes('authentification google annulee')) {
    return 'Authentification Google annulee.';
  }

  if (lower.includes('reponse google incomplete')) {
    return 'Reponse Google incomplete. Reessayez.';
  }

  if (lower.includes('echec de verification google')) {
    return 'Echec de verification Google. Reessayez.';
  }

  if (lower.includes('google oauth non configure')) {
    return 'Connexion Google indisponible. Contactez le support.';
  }

  return normalizedSource;
};