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

    const getVariantStyle = (v: Variant): TextStyle => {
      switch (v) {
        case 'label':
          return {
            fontFamily: 'Inter-Medium',
            fontSize: t.typography.size.sm,
            lineHeight: t.typography.size.sm * t.typography.lineHeight.snug,
            fontWeight: '500',
            color: t.colors.text,
          };
        case 'body':
          return {
            fontFamily: 'Inter-Regular',
            fontSize: t.typography.size.md,
            lineHeight: t.typography.size.md * t.typography.lineHeight.normal,
            fontWeight: '400',
            color: t.colors.text,
          };
        case 'title':
          return {
            fontFamily: 'Inter-Medium',
            fontSize: t.typography.size.lg,
            lineHeight: t.typography.size.lg * t.typography.lineHeight.snug,
            fontWeight: '600',
            color: t.colors.text,
          };
        case 'display':
          return {
            fontFamily: 'Inter-Bold',
            fontSize: t.typography.size['2xl'],
            lineHeight: t.typography.size['2xl'] * t.typography.lineHeight.tight,
            fontWeight: '700',
            color: t.colors.text,
          };
        case 'subtle':
          return {
            fontFamily: 'Inter-Regular',
            fontSize: t.typography.size.sm,
            lineHeight: t.typography.size.sm * t.typography.lineHeight.normal,
            fontWeight: '400',
            color: t.colors.subtle,
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
