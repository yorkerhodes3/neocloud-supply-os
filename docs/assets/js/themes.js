// Brand theme registry.
//
// A theme declares a handful of core tokens; `derive()` fills in every other
// variable the design system uses (surfaces, borders, muted text, status,
// series, map colours), and enforces WCAG contrast so that no brand can ship
// an illegible page. To add a brand, add one entry to BRANDS — or build one on
// brand.html and paste the JSON it exports.
//
// Brand presets other than the CoLab ones are APPROXIMATIONS of publicly
// observable visual identities, for demo dressing only. No logos are included.
// They imply no affiliation or endorsement. Swap in licensed assets and the
// official brand guide before showing a theme to that company's customers.

import { mix, rgba, contrast, inkOn, ensureContrast, alphaFor } from './lib/color.js';

const STATUS = {
  dark: { ok: '#4ade80', warn: '#fbbf24', risk: '#fb7185', info: '#7dd3fc' },
  light: { ok: '#15803d', warn: '#b45309', risk: '#be123c', info: '#0369a1' },
};

/** Expand a brand's core tokens into the full variable set. */
export function derive(t) {
  const dark = t.ground !== 'light';
  const bg = t.bg, fg = t.fg;
  const glow = t.glow || t.accent;
  const glow2 = t.glow2 || mix(t.accent, glow, 0.5);
  // UI accent must read against the ground (≥3:1 for components); keep the raw
  // brand colour separately for swatches and glows.
  let accent = ensureContrast(t.accent, bg, 3);
  // Button text on the accent must also reach 4.5:1; nudge the accent rather than the ink.
  const ink = t.accentInk || inkOn(accent);
  if (contrast(ink, accent) < 4.5) {
    const nudged = ensureContrast(accent, ink, 4.5);
    if (contrast(nudged, bg) >= 3) accent = nudged;
  }
  const surface = t.surface || (dark ? mix(bg, fg, 0.045) : mix(bg, '#ffffff', 0.7));
  const card = t.card || (dark ? mix(mix(bg, fg, 0.07), glow, 0.035) : '#ffffff');
  const mutedAlpha = Math.max(t.mutedAlpha ?? 0.62, alphaFor(fg, bg, 4.6, 0.5));
  const status = { ...STATUS[dark ? 'dark' : 'light'], ...(t.status || {}) };
  const series = t.series || [accent, glow, status.info, dark ? '#f472b6' : '#be185d', status.warn, dark ? '#2dd4bf' : '#0f766e'];
  return {
    '--bg': bg,
    '--surface': surface,
    '--card': card,
    '--secondary': t.secondary || mix(bg, glow, dark ? 0.35 : 0.14),
    '--fg': fg,
    '--muted': rgba(fg, mutedAlpha),
    '--border': t.border || rgba(dark ? glow : fg, dark ? 0.26 : 0.14),
    '--border-strong': t.borderStrong || rgba(accent, dark ? 0.42 : 0.55),
    '--accent': accent,
    '--accent-ink': ink,
    '--glow': glow,
    '--glow-2': glow2,
    '--grain-opacity': String(t.grain ?? (dark ? 0.04 : 0.03)),
    '--ok': status.ok, '--warn': status.warn, '--risk': status.risk, '--info': status.info,
    '--s1': series[0], '--s2': series[1], '--s3': series[2], '--s4': series[3], '--s5': series[4], '--s6': series[5],
    '--map-ocean': t.mapOcean || (dark ? mix(bg, '#000000', 0.35) : mix(bg, glow, 0.08)),
    '--map-land': t.mapLand || (dark ? mix(mix(bg, fg, 0.1), glow, 0.08) : mix(bg, fg, 0.1)),
    '--map-line': t.mapLine || rgba(glow, dark ? 0.35 : 0.3),
    '--font-display': t.fontDisplay,
    '--font-body': t.fontBody,
    '--font-mono': t.fontMono || '"JetBrains Mono", ui-monospace, Menlo, monospace',
    '--display-case': t.displayCase || 'none',
    '--display-tracking': t.displayTracking || '-0.02em',
    '--display-weight': String(t.displayWeight || 600),
    '--display-leading': String(t.displayLeading || 1.0),
    '--body-size': t.bodySize || '15px',
    '--body-leading': String(t.bodyLeading || 1.6),
    '--radius-sm': `${t.radius?.sm ?? 8}px`,
    '--radius': `${t.radius?.md ?? 14}px`,
    '--radius-lg': `${t.radius?.lg ?? 22}px`,
    '--radius-pill': t.radius?.pill === false ? `${t.radius?.md ?? 8}px` : '999px',
  };
}

const SANS = (f) => `"${f}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
const MONO = (f) => `"${f}", ui-monospace, "SFMono-Regular", Menlo, monospace`;

export const BRANDS = {
  colab: {
    name: 'Ethical Tech CoLab', short: 'CoLab', product: 'Neocloud', kind: 'lab', ground: 'dark',
    bg: '#120c1a', fg: '#f3eefb', accent: '#c8f04b', glow: '#7b5cff', glow2: '#b8d400',
    surface: '#1b1226', card: '#201630', secondary: '#3b1878',
    border: 'rgba(139, 92, 246, 0.26)', borderStrong: 'rgba(200, 240, 75, 0.4)', accentInk: '#141414',
    series: ['#c8f04b', '#7b5cff', '#38bdf8', '#f472b6', '#fbbf24', '#2dd4bf'],
    fontDisplay: '"Bebas Neue", Impact, sans-serif', fontBody: MONO('Space Mono'), fontMono: MONO('Space Mono'),
    displayCase: 'uppercase', displayTracking: '0.02em', displayWeight: 400, displayLeading: 0.9, bodySize: '14.5px',
    radius: { sm: 8, md: 14, lg: 22 },
    style: 'Near-black purple ground, signature lime, violet glow, Bebas Neue over Space Mono, film grain.',
    confidence: 'high', sources: ['https://github.com/Ethical-Tech-CoLab/website/blob/main/docs/DESIGN-SYSTEM.md'],
  },
  'colab-daylight': {
    name: 'CoLab Daylight', short: 'Daylight', product: 'Neocloud', kind: 'lab', ground: 'light',
    bg: '#f5f2f9', fg: '#1a1020', accent: '#5f6b00', glow: '#6d28d9', glow2: '#7c9a00',
    surface: '#ffffff', card: '#ffffff', secondary: '#e4dcf3',
    border: 'rgba(59, 24, 120, 0.18)', borderStrong: 'rgba(95, 107, 0, 0.5)', accentInk: '#ffffff',
    series: ['#5f6b00', '#6d28d9', '#0369a1', '#be185d', '#b45309', '#0f766e'],
    fontDisplay: '"Bebas Neue", Impact, sans-serif', fontBody: MONO('Space Mono'), fontMono: MONO('Space Mono'),
    displayCase: 'uppercase', displayTracking: '0.02em', displayWeight: 400, displayLeading: 0.9, bodySize: '14.5px',
    radius: { sm: 8, md: 14, lg: 22 },
    style: 'The CoLab daylight inversion: lilac-white ground, olive accent for contrast, violet glow.',
    confidence: 'high', sources: ['https://github.com/Ethical-Tech-CoLab/website/blob/main/docs/DESIGN-SYSTEM.md'],
  },

  // ---- Neocloud and AI-lab presets (approximations; see header) ----
  coreweave: {
    name: 'CoreWeave', short: 'CoreWeave', product: 'CoreWeave', kind: 'neocloud', ground: 'light',
    bg: '#ffffff', fg: '#0a0a0f', accent: '#2741e7', glow: '#2741e7', glow2: '#8fa0ff',
    fontDisplay: SANS('Plus Jakarta Sans'), fontBody: SANS('Plus Jakarta Sans'), fontMono: MONO('Geist Mono'),
    displayWeight: 700, displayTracking: '-0.035em', displayLeading: 1.0, bodySize: '15px',
    radius: { sm: 6, md: 10, lg: 16 },
    style: 'White ground, cobalt royal-blue accent, tight geometric sans, plenty of whitespace.',
    fontNote: 'Plus Jakarta Sans, as reported by brand aggregators.',
    confidence: 'medium', sources: ['https://brandfetch.com/coreweave.com', 'https://dwglogo.com/color-codes/coreweave/', 'https://www.characterquilt.com/branding/coreweave'],
  },
  nebius: {
    name: 'Nebius', short: 'Nebius', product: 'Nebius', kind: 'neocloud', ground: 'dark',
    bg: '#052b42', fg: '#ffffff', accent: '#e0ff4f', glow: '#3277ff', glow2: '#e0ff4f', accentInk: '#052b42',
    fontDisplay: SANS('Space Grotesk'), fontBody: SANS('Inter'), fontMono: MONO('JetBrains Mono'),
    displayWeight: 500, displayTracking: '-0.03em', displayLeading: 1.0,
    radius: { sm: 10, md: 18, lg: 28 },
    style: 'Deep navy ground, neon lime accent with blue glow, engineered geometric type, pill buttons.',
    fontNote: 'Gramatika (display) is proprietary; Space Grotesk stands in. Body is Inter.',
    confidence: 'medium', sources: ['https://www.keenwaves.com/nebius-design-code', 'https://brandfetch.com/nebius.com', 'https://www.designyourway.net/blog/nebius-logo/'],
  },
  openai: {
    name: 'OpenAI', short: 'OpenAI', product: 'OpenAI', kind: 'ai-lab', ground: 'light',
    bg: '#ffffff', fg: '#0f0f0f', accent: '#10a37f', glow: '#10a37f', glow2: '#8e8ea0', accentInk: '#ffffff',
    surface: '#f7f7f8', card: '#ffffff',
    fontDisplay: SANS('Inter'), fontBody: SANS('Inter'), fontMono: MONO('Roboto Mono'),
    displayWeight: 500, displayTracking: '-0.04em', displayLeading: 1.02, grain: 0,
    radius: { sm: 8, md: 14, lg: 24 },
    style: 'Monochrome and quiet: white ground, near-black type, colour used sparingly for function.',
    fontNote: 'OpenAI Sans is proprietary; Inter stands in.',
    confidence: 'medium', sources: ['https://openai.com/brand/', 'https://colorarchive.org/brands/openai/', 'https://mobbin.com/colors/brand/openai'],
  },
  lambda: {
    name: 'Lambda', short: 'Lambda', product: 'Lambda', kind: 'neocloud', ground: 'dark',
    bg: '#0b0b0b', fg: '#fefefe', accent: '#6236f4', glow: '#6236f4', glow2: '#e7e6d9',
    fontDisplay: SANS('Archivo'), fontBody: SANS('Archivo'), fontMono: MONO('IBM Plex Mono'),
    displayWeight: 600, displayTracking: '-0.03em', displayLeading: 1.0,
    radius: { sm: 4, md: 8, lg: 12, pill: false },
    style: 'Deep black ground, electric violet accent, Swiss-grid precision.',
    fontNote: 'Suisse Int’l is proprietary; Archivo stands in.',
    confidence: 'medium', sources: ['https://lambda.ai/brand-guidelines', 'https://brandfetch.com/lambdalabs.com', 'https://www.characterquilt.com/branding/lambda'],
  },
  crusoe: {
    name: 'Crusoe', short: 'Crusoe', product: 'Crusoe', kind: 'neocloud', ground: 'light',
    bg: '#ffffff', fg: '#000000', accent: '#ceeb13', glow: '#ceeb13', glow2: '#f59a36',
    fontDisplay: SANS('Instrument Sans'), fontBody: SANS('Instrument Sans'), fontMono: MONO('JetBrains Mono'),
    displayWeight: 600, displayTracking: '-0.035em', displayLeading: 1.0,
    radius: { sm: 6, md: 12, lg: 20 },
    style: 'Open white ground, high-voltage lime (darkened for legibility on white), warm orange second accent.',
    fontNote: 'Typeface unconfirmed; Instrument Sans stands in.',
    confidence: 'medium', sources: ['https://brandfetch.com/crusoe.ai', 'https://www.designyourway.net/blog/crusoe-logo/'],
  },
  together: {
    name: 'Together AI', short: 'Together', product: 'Together', kind: 'neocloud', ground: 'light',
    bg: '#ffffff', fg: '#0f172a', accent: '#6366f1', glow: '#8b5cf6', glow2: '#6366f1',
    fontDisplay: SANS('Geist'), fontBody: SANS('Geist'), fontMono: MONO('Geist Mono'),
    displayWeight: 600, displayTracking: '-0.04em', displayLeading: 1.02,
    radius: { sm: 8, md: 16, lg: 24 },
    style: 'White ground with indigo-to-violet gradients, rounded pill CTAs, developer-tool feel.',
    fontNote: 'Typeface unconfirmed; Geist stands in.',
    confidence: 'medium', sources: ['https://www.designpieces.com/palette/together-ai-color-palette-hex-and-rgb/'],
  },
  nscale: {
    name: 'Nscale', short: 'Nscale', product: 'Nscale', kind: 'neocloud', ground: 'dark',
    bg: '#0a0e14', fg: '#ffffff', accent: '#6b5bff', glow: '#6b5bff', glow2: '#cbd5e1',
    fontDisplay: SANS('DM Sans'), fontBody: SANS('DM Sans'), fontMono: MONO('JetBrains Mono'),
    displayWeight: 700, displayTracking: '-0.035em', displayLeading: 1.0,
    radius: { sm: 6, md: 10, lg: 16 },
    style: 'Clean and minimal. The palette is a placeholder: the colours could not be verified.',
    fontNote: 'DM Sans per the media kit; DM Mono replaced by JetBrains Mono.',
    confidence: 'low', sources: ['https://www.nscale.com/media-kit'],
  },
  fluidstack: {
    name: 'Fluidstack', short: 'Fluidstack', product: 'Fluidstack', kind: 'neocloud', ground: 'dark',
    bg: '#131313', fg: '#ffffff', accent: '#d5a81f', glow: '#d5a81f', glow2: '#bdbdbd', accentInk: '#131313',
    fontDisplay: SANS('Outfit'), fontBody: SANS('Inter'), fontMono: MONO('JetBrains Mono'),
    displayWeight: 600, displayTracking: '-0.03em', displayLeading: 1.0,
    radius: { sm: 6, md: 10, lg: 16 },
    style: 'Charcoal ground, gold accent with silver, bold headings.',
    fontNote: 'Typeface unconfirmed; Outfit and Inter stand in.',
    confidence: 'medium', sources: ['https://brandfetch.com/fluidstack.io', 'https://colorcodehub.com/brand/fluidstack.com'],
  },
  vultr: {
    name: 'Vultr', short: 'Vultr', product: 'Vultr', kind: 'neocloud', ground: 'light',
    bg: '#f8f8f8', fg: '#0b1222', accent: '#007bfc', glow: '#007bfc', glow2: '#51b9ff', accentInk: '#ffffff', card: '#ffffff', surface: '#ffffff',
    fontDisplay: SANS('Roboto'), fontBody: SANS('Roboto'), fontMono: MONO('Roboto Mono'),
    displayWeight: 700, displayTracking: '-0.025em', displayLeading: 1.02,
    radius: { sm: 6, md: 10, lg: 16 },
    style: 'Light ground, cobalt and sky-blue accents, a clean grid of cards.',
    fontNote: 'Roboto, per the official brand book.',
    confidence: 'high', sources: ['https://www.vultr.com/dist/brand-assets/vultr-brand-book.pdf', 'https://brandfetch.com/vultr.com'],
  },
  'voltage-park': {
    name: 'Voltage Park', short: 'Voltage Park', product: 'Voltage Park', kind: 'neocloud', ground: 'dark',
    bg: '#0f0f0f', fg: '#ffffff', accent: '#cbfc55', glow: '#6929c4', glow2: '#cbfc55', accentInk: '#0f0f0f',
    fontDisplay: SANS('Red Hat Display'), fontBody: SANS('Manrope'), fontMono: MONO('JetBrains Mono'),
    displayWeight: 700, displayTracking: '-0.03em', displayLeading: 1.0,
    radius: { sm: 6, md: 12, lg: 18 },
    style: 'Near-black ground, neon lime accent over a purple glow, confident and functional.',
    fontNote: 'Typeface unconfirmed; Red Hat Display and Manrope stand in.',
    confidence: 'medium', sources: ['https://brandfetch.com/voltagepark.com'],
  },
};

export { SANS, MONO };
export const DEFAULT_BRAND = 'colab';
