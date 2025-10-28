/**
 * Text Component - Text primitive with variant-based styling
 */

import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';
import { useTokens } from '../design/makeStyles';

type Variant = 'label' | 'body' | 'title' | 'display' | 'subtle';

export interface TextProps extends Omit<RNTextProps, 'className'> {
  /** Disallow className */
  className?: never;

  /** Text variant */
  variant?: Variant;

  /** Number of lines to display */
  numberOfLines?: number;

  /** Test ID */
  testID?: string;
}

export const Text = React.forwardRef<RNText, TextProps>(
  ({ children, style, variant = 'body', numberOfLines, testID, ...rest }, ref) => {
    const t = useTokens();

    const { fontFamily, size, lineHeight } = t.typography;
    const { text, subtle } = t.colors;

    const getVariantStyle = (v: Variant): TextStyle => {
      switch (v) {
        case 'label':
          return {
            fontFamily: fontFamily.medium,
            fontSize: size.sm,
            lineHeight: size.sm * lineHeight.snug,
            fontWeight: '500',
            color: text,
          };
        case 'body':
          return {
            fontFamily: fontFamily.regular,
            fontSize: size.md,
            lineHeight: size.md * lineHeight.normal,
            fontWeight: '400',
            color: text,
          };
        case 'title':
          return {
            fontFamily: fontFamily.bold,
            fontSize: size.lg,
            lineHeight: size.lg * lineHeight.snug,
            fontWeight: '600',
            color: text,
          };
        case 'display':
          return {
            fontFamily: fontFamily.bold,
            fontSize: size['2xl'],
            lineHeight: size['2xl'] * lineHeight.tight,
            fontWeight: '700',
            color: text,
          };
        case 'subtle':
          return {
            fontFamily: fontFamily.regular,
            fontSize: size.sm,
            lineHeight: size.sm * lineHeight.normal,
            fontWeight: '400',
            color: subtle,
          };
      }
    };

    const textStyle = getVariantStyle(variant);

    // Strip any accidental className at runtime
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { className: _ignored, ...cleanRest } = rest as Record<string, unknown>;

    return (
      <RNText
        ref={ref}
        style={[textStyle, style]}
        numberOfLines={numberOfLines}
        testID={testID}
        {...cleanRest}
      >
        {children}
      </RNText>
    );
  },
);

Text.displayName = 'Text';
