import { TextStyle } from 'react-native';

export const FontFamily = {
  light: 'Inter-Light',
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semiBold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
  extraBold: 'Inter-ExtraBold',
} as const;

// Fallback system fonts until custom fonts load
export const SystemFonts = {
  light: '300',
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
  extraBold: '800',
} as const;

export const Typography: Record<string, TextStyle> = {
  // Headings
  h1: {
    fontFamily: FontFamily.extraBold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  h2: {
    fontFamily: FontFamily.bold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  h3: {
    fontFamily: FontFamily.bold,
    fontSize: 24,
    lineHeight: 32,
  },
  h4: {
    fontFamily: FontFamily.semiBold,
    fontSize: 20,
    lineHeight: 28,
  },
  h5: {
    fontFamily: FontFamily.semiBold,
    fontSize: 18,
    lineHeight: 24,
  },

  // Body
  bodyLarge: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  bodySmall: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
  },

  // Labels
  label: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  labelSmall: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Button
  button: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  buttonSmall: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
  },

  // Caption
  caption: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  captionBold: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    lineHeight: 16,
  },

  // Special
  price: {
    fontFamily: FontFamily.bold,
    fontSize: 24,
    lineHeight: 32,
  },
  priceSmall: {
    fontFamily: FontFamily.semiBold,
    fontSize: 18,
    lineHeight: 24,
  },
};
