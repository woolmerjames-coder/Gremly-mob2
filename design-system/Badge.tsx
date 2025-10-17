/**
 * Badge - DS-based implementation (migrated from Tailwind)
 */
import * as React from 'react';
import { ViewStyle, TextStyle, type ViewProps } from 'react-native';
import { useTokens } from '../design/makeStyles';
import { Box } from '../ui/Box';
import { Text } from '../ui/Text';

type Variant = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
type Size = 'sm' | 'md' | 'lg';

export interface BadgeProps extends Omit<ViewProps, 'children'> {
  /** Badge label */
  label: string;
  /** Badge variant */
  variant?: Variant;
  /** Badge size */
  size?: Size;
  /** Left icon */
  leftIcon?: React.ReactNode;
}

export const Badge = React.forwardRef<React.ElementRef<typeof Box>, BadgeProps>(
  ({ label, variant = 'neutral', size = 'md', leftIcon, ...viewProps }, ref) => {
    const t = useTokens();

    const getVariantStyle = (v: Variant): { bg: string; textColor: string } => {
      switch (v) {
        case 'primary':
          return { bg: t.colors.primary, textColor: '#FFFFFF' };
        case 'success':
          return { bg: t.colors.success, textColor: '#FFFFFF' };
        case 'warning':
          return { bg: '#F59E0B', textColor: '#FFFFFF' };
        case 'error':
          return { bg: t.colors.danger, textColor: '#FFFFFF' };
        case 'info':
          return { bg: '#3B82F6', textColor: '#FFFFFF' };
        case 'neutral':
          return { bg: t.colors.surface, textColor: t.colors.text };
      }
    };

    const getSizeStyle = (
      s: Size,
    ): { px: number; py: number; minHeight: number; fontSize: number } => {
      switch (s) {
        case 'sm':
          return { px: 2, py: 0, minHeight: 20, fontSize: t.typography.size.xs };
        case 'md':
          return { px: 3, py: 1, minHeight: 24, fontSize: t.typography.size.sm };
        case 'lg':
          return { px: 4, py: 1, minHeight: 28, fontSize: t.typography.size.md };
      }
    };

    const variantStyle = getVariantStyle(variant);
    const sizeStyle = getSizeStyle(size);

    const badgeStyle: ViewStyle = {
      backgroundColor: variantStyle.bg,
      borderRadius: 9999,
      minHeight: sizeStyle.minHeight,
    };

    const textStyle: TextStyle = {
      color: variantStyle.textColor,
      fontSize: sizeStyle.fontSize,
      fontWeight: '500',
    };

    return (
      <Box
        ref={ref}
        row
        center
        px={sizeStyle.px}
        py={sizeStyle.py}
        style={badgeStyle}
        {...viewProps}
      >
        {leftIcon && <Box mr={1}>{leftIcon}</Box>}
        <Text style={textStyle}>{label}</Text>
      </Box>
    );
  },
);

Badge.displayName = 'Badge';
