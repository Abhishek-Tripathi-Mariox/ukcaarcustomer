import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

// assets/select ride/UKCAAR Mobile App_icon/card/icon/clock16x16.svg
export const ClockSmallIcon: React.FC<IconProps> = ({ size = 14, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Path
      d="M7.99984 14.6666C11.6817 14.6666 14.6665 11.6818 14.6665 7.99998C14.6665 4.31808 11.6817 1.33331 7.99984 1.33331C5.01472 1.33331 2.51601 3.29524 1.6665 5.99998H3.33317"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M8 5.33331V7.99998L9.33333 9.33331"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M1.3335 8C1.3335 8.22487 1.34363 8.44727 1.36346 8.66667M6.00016 14.6667C5.77243 14.5917 5.54997 14.5043 5.3335 14.4052M2.13976 11.3333C2.0112 11.0856 1.89652 10.8289 1.79681 10.5641M3.22098 12.871C3.42476 13.0905 3.6422 13.2961 3.87186 13.4861"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// assets/select ride/UKCAAR Mobile App_icon/card/icon/userCircle16x16.svg
export const UserCircleSmallIcon: React.FC<IconProps> = ({ size = 14, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Circle cx="8" cy="8" r="6.6668" stroke={color} />
    <Path
      d="M5 11.3334C6.55447 9.70522 9.4288 9.62855 11 11.3334M9.6634 6.33335C9.6634 7.25382 8.91613 8.00002 7.99433 8.00002C7.0726 8.00002 6.32531 7.25382 6.32531 6.33335C6.32531 5.41288 7.0726 4.66669 7.99433 4.66669C8.91613 4.66669 9.6634 5.41288 9.6634 6.33335Z"
      stroke={color}
      strokeLinecap="round"
    />
  </Svg>
);
