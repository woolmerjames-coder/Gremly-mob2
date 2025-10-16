/**
 * Card - DS-based implementation (migrated from Tailwind)
 * Uses Box primitive with card styling
 */
import * as React from 'react';
import { ViewStyle, type ViewProps } from 'react-native';
import { useTokens } from '../design/makeStyles';
import { Box } from '../ui/Box';

type Variant = 'elevated' | 'outlined' | 'flat';
type Padding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends Omit<ViewProps, 'style'> {
  /** Card children */
  children: React.ReactNode;
  /** Card variant */
  variant?: Variant;
  /** Card padding */
  padding?: Padding;
  /** Custom style */
  style?: ViewStyle;
}

export const Card = React.forwardRef<React.ElementRef<typeof Box>, CardProps>(
  ({ children, variant = 'elevated', padding = 'md', style, ...viewProps }, ref) => {
    const t = useTokens();

    const getPadding = (p: Padding): number | undefined => {
      switch (p) {
        case 'none':
          return 0;
        case 'sm':
          return 3;
        case 'md':
          return 4;
        case 'lg':
          return 6;
      }
    };

    const getVariantStyle = (v: Variant): ViewStyle => {
      switch (v) {
        case 'elevated':
          return {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
          };
        case 'outlined':
          return {
            borderWidth: 1,
            borderColor: t.colors.border,
          };
        case 'flat':
          return {};
      }
    };

    // Strip className if present
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { className: _ignored, ...cleanProps } = viewProps as Record<string, unknown>;

    return (
      <Box
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={ref as any}
        p={getPadding(padding)}
        bg="card"
        radius={3}
        style={[{ overflow: 'hidden' }, getVariantStyle(variant), style]}
        {...cleanProps}
      >
        {children}
      </Box>
    );
  },
);

Card.displayName = 'Card';
