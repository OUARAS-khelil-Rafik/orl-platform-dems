type PersonNameParts = {
  lastName: string;
  firstName: string;
};

const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, ' ');

const toUpper = (value: string) => normalizeSpaces(value).toUpperCase();

const toCapitalized = (value: string) => {
  const normalized = normalizeSpaces(value).toLowerCase();
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export const formatFullName = (lastName: string, firstName: string) => {
  const normalizedLastName = toUpper(lastName);
  const normalizedFirstName = toCapitalized(firstName);
  return [normalizedLastName, normalizedFirstName].filter(Boolean).join(' ').trim();
};

export const splitFullName = (fullName: string): PersonNameParts => {
  const normalized = normalizeSpaces(fullName);
  if (!normalized) {
    return { lastName: '', firstName: '' };
  }

  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length === 1) {
    return { lastName: parts[0], firstName: '' };
  }

  const [lastName, ...firstNameParts] = parts;
  return {
    lastName,
    firstName: firstNameParts.join(' '),
  };
};

export const normalizeNameParts = (lastName: string, firstName: string): PersonNameParts => ({
  lastName: toUpper(lastName),
  firstName: toCapitalized(firstName),
});
