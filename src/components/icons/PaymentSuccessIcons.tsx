import React from 'react';
import Svg, { Circle, G, Path, Polyline } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

// Concentric success-animation rings with a filled teal tick circle.
// Mirrors Figma 49:1761 / 49:1762 / 49:1763 — outer 132×132 ring, inner 96×96 ring, center 71×71 check.
export const SuccessAnimationIcon: React.FC<{ size?: number }> = ({ size = 132 }) => (
  <Svg width={size} height={size} viewBox="0 0 132 132" fill="none">
    <Circle cx="66" cy="66" r="66" fill="#E0F4F7" opacity={0.55} />
    <Circle cx="66" cy="66" r="48.4" fill="#B6E4EC" opacity={0.75} />
    <Circle cx="66" cy="66" r="35.5" fill="#0097B3" />
    <Polyline
      points="51,66 62,77 82,57"
      stroke="#FFFFFF"
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

// Small decorative X / cross marker (Figma 49:1654)
export const DecorativeCrossIcon: React.FC<IconProps> = ({ size = 19, color = '#9AA3AC' }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <Path
      d="M5 5L15 15M15 5L5 15"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </Svg>
);

// Small decorative filled dot (Figma 49:1768)
export const DecorativeDotIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 8,
  color = '#0097B3',
}) => (
  <Svg width={size} height={size} viewBox="0 0 8 8">
    <Circle cx="4" cy="4" r="4" fill={color} />
  </Svg>
);

// Tiny "shape" sparkle marker (Figma 49:1766)
export const SparkleIcon: React.FC<IconProps> = ({ size = 12, color = '#0097B3' }) => (
  <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <Circle cx="6" cy="6" r="1.8" fill={color} />
  </Svg>
);

// Filled tick-circle (Vuesax bold) used on the receipt card — green badge with white tick.
export const FilledTickCircleIcon: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <Circle cx="16" cy="16" r="16" fill="#2BA84A" />
    <Path
      d="M10 16.5L14 20.5L22 12.5"
      stroke="#FFFFFF"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

// White circular ring around the tick (Figma 43:1944 icon background)
export const TickIconBackground: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
    <Circle cx="28" cy="28" r="27" fill="#FFFFFF" stroke="#F0F0F0" strokeWidth={1} />
  </Svg>
);

// Download / import icon (vuesax linear) for the "Get PDF Receipt" button
export const DownloadIcon: React.FC<IconProps> = ({ size = 24, color = '#3D3D3D' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 3V15M12 15L7.5 10.5M12 15L16.5 10.5"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M4 17V18C4 19.6569 5.34315 21 7 21H17C18.6569 21 20 19.6569 20 18V17"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </Svg>
);

// Outlined star (for Ramesh's 5.0 rating display)
export const OutlineStarIcon: React.FC<IconProps> = ({ size = 17, color = '#F5A623' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2L14.9 8.6L22 9.3L16.5 14.3L18.2 21.3L12 17.5L5.8 21.3L7.5 14.3L2 9.3L9.1 8.6L12 2Z"
      fill={color}
      stroke={color}
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
  </Svg>
);

// Empty rating star used in the "How was your trip?" bottom sheet
export const RatingStarIcon: React.FC<{ size?: number; filled?: boolean }> = ({
  size = 44,
  filled = false,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2L14.9 8.6L22 9.3L16.5 14.3L18.2 21.3L12 17.5L5.8 21.3L7.5 14.3L2 9.3L9.1 8.6L12 2Z"
      fill={filled ? '#F5A623' : 'none'}
      stroke={filled ? '#F5A623' : '#D0D2D6'}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </Svg>
);

// Serrated (zig-zag) receipt edge drawn natively so we don't need the Figma subtract mask.
// Renders a row of evenly spaced half-circle notches cut out of a white strip.
export const ReceiptSerratedEdge: React.FC<{ width?: number; notchRadius?: number }> = ({
  width = 345,
  notchRadius = 8,
}) => {
  const count = Math.floor(width / (notchRadius * 2));
  const step = width / count;
  let d = `M0,0 L${width},0 L${width},${notchRadius * 2} `;
  for (let i = count; i >= 0; i--) {
    const cx = i * step;
    d += `L${cx + notchRadius},${notchRadius * 2} A${notchRadius},${notchRadius} 0 0 1 ${
      cx - notchRadius
    },${notchRadius * 2} `;
  }
  d += `L0,${notchRadius * 2} Z`;
  return (
    <Svg width={width} height={notchRadius * 2} viewBox={`0 0 ${width} ${notchRadius * 2}`}>
      <Path d={d} fill="#FFFFFF" />
    </Svg>
  );
};
