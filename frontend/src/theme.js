// Theme engine: preset selection + per-user custom CSS variable overrides.
//
// Presets live in CSS (index.css) and are activated via `data-theme` on
// <body>. Custom user overrides are stored as a JSON object in
// localStorage and applied as inline style.setProperty() on body, so
// they win against the preset values.

const PRESET_KEY = 'fwp_theme';
const OVERRIDES_KEY = 'fwp_theme_overrides';

export const THEME_PRESETS = [
  {
    id: 'midnight',
    label: 'Midnight',
    icon: '🌙',
    blurb: 'Cool slate base, twilight blue accent. The sky just before the show.',
  },
  {
    id: 'ember',
    label: 'Ember',
    icon: '🔥',
    blurb: 'Warm charcoal, glowing ember orange. The fuse just lit.',
  },
  {
    id: 'spark',
    label: 'Spark',
    icon: '⚡',
    blurb: 'Near-black, electric gold. High-contrast.',
  },
  {
    id: 'noir',
    label: 'Noir',
    icon: '◐',
    blurb: 'Monochrome and restrained.',
  },
];

// The subset of tokens we expose in the customizer. The rest are derived
// from preset CSS or kept static. Order is the display order in the UI.
export const CUSTOMIZABLE_TOKENS = [
  { key: '--bg', label: 'Background', hint: 'Outer page color.' },
  { key: '--surface', label: 'Card surface', hint: 'Most cards / panels.' },
  { key: '--accent', label: 'Accent', hint: 'Primary buttons + active states.' },
  { key: '--gold', label: 'Highlight', hint: 'Tags, attribution badges.' },
  { key: '--ember', label: 'Warning', hint: 'Errors / destructive actions.' },
  { key: '--text', label: 'Text', hint: 'Primary readable text.' },
];

export function loadPreset() {
  if (typeof window === 'undefined') return 'midnight';
  return localStorage.getItem(PRESET_KEY) || 'midnight';
}

export function savePreset(id) {
  localStorage.setItem(PRESET_KEY, id);
}

export function loadOverrides() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveOverrides(obj) {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(obj || {}));
}

// Apply a (preset, overrides) pair to <body>. Cleans up any previous
// inline overrides so a freshly chosen preset isn't polluted by older
// custom values.
export function applyTheme(presetId, overrides = {}) {
  if (typeof document === 'undefined') return;
  const body = document.body;
  body.setAttribute('data-theme', presetId);

  // Wipe previous overrides on every apply so a switch-to-preset is clean.
  for (const t of CUSTOMIZABLE_TOKENS) {
    body.style.removeProperty(t.key);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) body.style.setProperty(key, value);
  }
}

// Read the *currently rendered* value of a CSS var on body (post-preset,
// post-override). Used by the customizer so each picker starts at the
// right swatch.
export function readToken(key) {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.body).getPropertyValue(key).trim();
}
