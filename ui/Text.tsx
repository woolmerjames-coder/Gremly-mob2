/**
 * Text Component - Styled text with design system integration
 */

import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';
import { useTheme } from '../design/theme';
import { fontSize, fontWeight, lineHeight } from '../design/tokens';

type FontSizeKey = keyof typeof fontSize;
type FontWeightKey = keyof typeof fontWeight;
type LineHeightKey = keyof typeof lineHeight;

export interface TextProps extends RNTextProps {
  // Typography
  size?: FontSizeKey | number;
  weight?: FontWeightKey;
  leading?: LineHeightKey;

  // Color (string or theme token path like 'text.primary')
  color?: string;

  // Alignment
  align?: 'left' | 'center' | 'right' | 'justify';

  // Other
  testID?: string;
}

export const Text = React.forwardRef<RNText, TextProps>(
  ({ children, style, size, weight, leading, color, align, testID, ...rest }, ref) => {
    const { theme } = useTheme();

    const resolveFontSize = (val: FontSizeKey | number | undefined): number | undefined => {
      if (val === undefined) return undefined;
      if (typeof val === 'number') return val;
      return fontSize[val];
    };

    const resolveFontWeight = (val: FontWeightKey | undefined): string | undefined => {
      if (val === undefined) return undefined;
      return fontWeight[val];
    };

    const resolveLineHeight = (
      val: LineHeightKey | undefined,
      currentFontSize: number,
    ): number | undefined => {
      if (val === undefined) return undefined;
      return currentFontSize * lineHeight[val];
    };

    const currentFontSize = resolveFontSize(size) || fontSize.base;

    const textStyle: TextStyle = {
      fontSize: currentFontSize,
      ...(weight && { fontWeight: resolveFontWeight(weight) as TextStyle['fontWeight'] }),
      ...(leading && { lineHeight: resolveLineHeight(leading, currentFontSize) }),
      ...(color && { color }),
      ...(align && { textAlign: align }),
    };

    return (
      <RNText ref={ref} style={[textStyle, style]} testID={testID} {...rest}>
        {children}
      </RNText>
    );
  },
);

Text.displayName = 'Text';
