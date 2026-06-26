import React from 'react';
import Svg, { Path, G } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

/**
 * Bus / shuttle seat icon used on the scheduled-route seat picker.
 * Single-colour silhouette so each instance can be tinted teal (available),
 * rose (selected) or grey (booked) just by changing the `color` prop.
 *
 * Path approximates Figma node 70:8700 (24.96 × 33.33 viewBox).
 */
export const BusSeatIcon: React.FC<IconProps> = ({ size = 25, color = '#0097B3' }) => (
  <Svg width={size} height={size * (33.33 / 24.96)} viewBox="0 0 25 34" fill="none">
    {/* Headrest */}
    <Path
      d="M7 1.5 H18 A3 3 0 0 1 21 4.5 V11 A2 2 0 0 1 19 13 H6 A2 2 0 0 1 4 11 V4.5 A3 3 0 0 1 7 1.5 Z"
      fill={color}
    />
    {/* Backrest */}
    <Path
      d="M5 14 H20 A1.5 1.5 0 0 1 21.5 15.5 V20 A2 2 0 0 1 19.5 22 H5.5 A2 2 0 0 1 3.5 20 V15.5 A1.5 1.5 0 0 1 5 14 Z"
      fill={color}
    />
    {/* Seat base */}
    <Path
      d="M2 24 H23 A2 2 0 0 1 25 26 V30 A2 2 0 0 1 23 32 H2 A2 2 0 0 1 0 30 V26 A2 2 0 0 1 2 24 Z"
      fill={color}
    />
  </Svg>
);

/**
 * Driver bust / steering-wheel icon shown above the seat grid.
 * Approximates Figma node 70:8859 (49 × 49 group of small shapes).
 */
export const DriverHeadIcon: React.FC<IconProps> = ({ size = 32, color = '#0097B3' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <G fill={color}>
      {/* Head */}
      <Path d="M16 4 a4.5 4.5 0 1 1 0 9 a4.5 4.5 0 0 1 0 -9 Z" />
      {/* Steering wheel */}
      <Path d="M16 15.5 a6.5 6.5 0 1 1 0 13 a6.5 6.5 0 0 1 0 -13 Z M16 18 a4 4 0 1 0 0 8 a4 4 0 0 0 0 -8 Z" />
      {/* Steering spokes */}
      <Path d="M15.25 19 h1.5 v3 h-1.5z" />
      <Path d="M11.5 21.5 h3 v1.5 h-3z" />
      <Path d="M17.5 21.5 h3 v1.5 h-3z" />
    </G>
  </Svg>
);
