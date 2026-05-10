// Organs and tissues legally donatable / transplantable in Pakistan under
// the Transplantation of Human Organs and Tissues Act (THOTA), 2010.
// Used as the single source of truth for organ dropdowns across the app.

export const ORGAN_GROUPS = {
  'Solid Organs': [
    'Kidney',
    'Liver',
    'Heart',
    'Lung',
    'Pancreas',
    'Intestine',
  ],
  'Tissues': [
    'Cornea',
    'Bone Marrow',
    'Heart Valve',
    'Bone',
    'Skin',
    'Tendon',
    'Blood Vessel',
  ],
};

// Flat list — display labels (Title Case)
export const ORGANS = [
  ...ORGAN_GROUPS['Solid Organs'],
  ...ORGAN_GROUPS['Tissues'],
];

// Flat list — storage values (lowercase, used by backend filters)
export const ORGANS_LOWER = ORGANS.map(o => o.toLowerCase());

// Normalize any value (any case, with or without spaces) back to its Title Case display label.
export const formatOrgan = (s) => {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .split(' ')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
};
