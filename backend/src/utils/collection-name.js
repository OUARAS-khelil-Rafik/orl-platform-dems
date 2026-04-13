const aliases = {
  clinical_cases: 'clinicalCases',
};

export const normalizeCollectionName = (name) => aliases[name] || name;

export const isCloudinarySettingsDoc = (collection, id) => {
  return normalizeCollectionName(collection) === 'appSettings' && id === 'cloudinary';
};
