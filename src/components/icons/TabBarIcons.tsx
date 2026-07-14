import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

interface TabIconProps {
  size?: number;
  color?: string;
  focused?: boolean;
}

// Bottom-nav "Home" glyph. Matches the Figma footer (20087213.svg): a
// rounded-house shape that is solid-filled in the brand teal with a small
// white notch near the base when the tab is active, and a thin outline in the
// inactive grey otherwise. Ionicons' generic `home` is a sharp-roofed house
// that doesn't match, so we draw the exact glyph here.
export const HomeGlyphIcon: React.FC<TabIconProps> = ({
  size = 24,
  color = '#0097B3',
  focused = false,
}) => {
  // Rounded-house outline: soft-cornered roof apex, gently rounded body.
  const house =
    'M12 2.6c.53 0 1.05.18 1.47.52l6.8 5.4c.66.52 1.05 1.32 1.05 2.16v7.98c0 1.28-1.04 2.32-2.32 2.32H6.99c-1.28 0-2.32-1.04-2.32-2.32v-7.98c0-.84.39-1.64 1.05-2.16l6.8-5.4c.42-.34.94-.52 1.48-.52z';
  if (focused) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d={house} fill={color} />
        {/* small white "door/slot" notch near the base */}
        <Rect x="9.4" y="15.6" width="5.2" height="2.6" rx="1.3" fill="#FFFFFF" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={house}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Rect
        x="9.4"
        y="15.9"
        width="5.2"
        height="2.3"
        rx="1.15"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
      />
    </Svg>
  );
};
