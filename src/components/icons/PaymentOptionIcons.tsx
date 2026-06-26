import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';

interface IconProps {
  size?: number;
}

// assets/payment-option/check-circle.svg — selected radio (filled teal)
export const CheckCircleIcon: React.FC<IconProps> = ({ size = 21 }) => (
  <Svg width={size} height={size} viewBox="0 0 21.2833 21.2833" fill="none">
    <Circle cx="10.6416" cy="10.6416" r="10.482" fill="#0097B3" stroke="#FFFFFF" strokeWidth={0.319249} />
    <Path
      d="M6 10.5472L9.10381 13.651L15.3114 7"
      stroke="#FFFFFF"
      strokeWidth={1.59625}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// assets/payment-option/empty-circle.svg — unselected radio
export const EmptyCircleIcon: React.FC<IconProps> = ({ size = 21 }) => (
  <Svg width={size} height={size} viewBox="0 0 21.2833 21.2833" fill="none">
    <Circle cx="10.6416" cy="10.6416" r="9.94994" stroke="#D1CECE" strokeWidth={1.38341} />
  </Svg>
);

// assets/payment-option/secured-shield.svg — small "Secured" badge tick
export const SecuredShieldIcon: React.FC<IconProps> = ({ size = 8 }) => (
  <Svg width={size} height={size * (6.84645 / 5.95933)} viewBox="0 0 5.95933 6.84645" fill="none">
    <G>
      <Path
        d="M2.97967 6.52711C2.97967 6.52711 5.64008 5.64031 5.64008 3.4233"
        stroke="#0097B3"
        strokeWidth={0.638499}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5.64008 3.42314V0.762733C5.64008 0.762733 4.75327 0.319331 2.97967 0.319331"
        stroke="#0097B3"
        strokeWidth={0.638499}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2.97966 6.52711C2.97966 6.52711 0.319249 5.64031 0.319249 3.4233"
        stroke="#0097B3"
        strokeWidth={0.638499}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M0.319254 3.42306V0.762651C0.319254 0.762651 1.20606 0.319249 2.97967 0.319249"
        stroke="#0097B3"
        strokeWidth={0.638499}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4.75322 1.64954C2.97961 2.97975 2.53621 4.75335 2.53621 4.75335C2.53621 4.75335 2.0928 4.22411 1.6494 3.86655"
        stroke="#0097B3"
        strokeWidth={0.638499}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </G>
  </Svg>
);
