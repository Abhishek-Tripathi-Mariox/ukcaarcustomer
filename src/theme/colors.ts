// UKCAAR Design System - Colors
// Light theme with teal accents — matched to Figma design

export const Colors = {
  // Primary Brand (Teal)
  primary: '#0097B3',
  primaryDark: '#007A93',
  primaryLight: '#33B2C8',
  primaryMuted: 'rgba(0, 151, 179, 0.12)',

  // Accent (Blue – map elements, badges)
  accent: '#3B65DB',
  accentLight: '#5B85FB',
  accentMuted: 'rgba(59, 101, 219, 0.12)',

  // Gold CTA (from Figma)
  gold: '#EDAE10',
  goldDark: '#D49B0E',

  // Link blue (from Figma)
  link: '#0082DF',

  // Backgrounds
  background: '#F4F4F4',
  backgroundCard: '#FFFFFF',
  backgroundElevated: '#FFFFFF',
  backgroundOverlay: 'rgba(0, 0, 0, 0.5)',
  backgroundInput: '#F8F8F8',
  backgroundWhite: '#FFFFFF',
  backgroundDark: '#141414',

  // Text
  textPrimary: '#141414',
  textSecondary: '#545365',
  textMuted: '#ABB7C2',
  textDark: '#141414',
  textOnPrimary: '#FFFFFF',
  textGold: '#FFB800',

  // Status
  success: '#00C853',
  successLight: 'rgba(0, 200, 83, 0.12)',
  error: '#FF3D57',
  errorLight: 'rgba(255, 61, 87, 0.12)',
  warning: '#FFA726',
  info: '#29B6F6',

  // UI Elements
  border: '#CDCDCD',
  borderLight: '#E5E5E5',
  borderActive: '#0097B3',
  borderDark: '#45474A',
  divider: '#EEEEEE',
  shadow: 'rgba(0, 0, 0, 0.08)',
  // Figma-specific (onboarding, login)
  textOnLight: '#010101',
  textSecondaryFigma: '#484848',
  termsMuted: '#A6A6A6',

  // Map / Ride
  mapBackground: '#EFF6EE',
  mapSand: '#F9EFE1',
  mapGreen: '#BFE090',
  mapWater: '#BAD7EB',
  cabBadgeBlue: '#3B65DB',
  routeBlue: '#3B65DB',
  pickupGreen: '#00C853',
  dropoffRed: '#FF3D57',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  star: '#FFB800',
  online: '#00C853',
  offline: '#FF3D57',

  // Tab bar
  tabActive: '#141414',
  tabInactive: '#ABB7C2',
} as const;

export type ColorKeys = keyof typeof Colors;
