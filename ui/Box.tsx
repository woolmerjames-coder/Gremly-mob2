/**
 * Box Component - Flexible container with StyleSheet
 * Replaces View with styled props
 */

import React from 'react';
import { View, ViewProps, ViewStyle } from 'react-native';
import { useTheme } from '../design/theme';
import { spacing, borderRadius } from '../design/tokens';

type SpacingKey = keyof typeof spacing;
type BorderRadiusKey = keyof typeof borderRadius;

export interface BoxProps extends ViewProps {
  // Disallow Tailwind/NativeWind usage
  className?: never;

  // Spacing
  p?: SpacingKey | number;
  px?: SpacingKey | number;
  py?: SpacingKey | number;
  pt?: SpacingKey | number;
  pb?: SpacingKey | number;
  pl?: SpacingKey | number;
  pr?: SpacingKey | number;
  m?: SpacingKey | number;
  mx?: SpacingKey | number;
  my?: SpacingKey | number;
  mt?: SpacingKey | number;
  mb?: SpacingKey | number;
  ml?: SpacingKey | number;
  mr?: SpacingKey | number;
  gap?: SpacingKey | number;

  // Layout
  flex?: number;
  row?: boolean;
  center?: boolean;
  items?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';

  // Styling
  bg?: string;
  radius?: BorderRadiusKey | number;
  border?: { width: number; color: string };

  // Other
  testID?: string;
}

export const Box = React.forwardRef<View, BoxProps>(
  (
    {
      children,
      style,
      p,
      px,
      py,
      pt,
      pb,
      pl,
      pr,
      m,
      mx,
      my,
      mt,
      mb,
      ml,
      mr,
      gap,
      flex,
      row,
      center,
      items,
      justify,
      bg,
      radius,
      border,
      testID,
      ...rest
    },
    ref,
  ) => {
    const { theme } = useTheme();

    const resolveSpacing = (val: SpacingKey | number | undefined): number | undefined => {
      if (val === undefined) return undefined;
      if (typeof val === 'number') return val;
      return spacing[val];
    };

    const resolveRadius = (val: BorderRadiusKey | number | undefined): number | undefined => {
      if (val === undefined) return undefined;
      if (typeof val === 'number') return val;
      return borderRadius[val];
    };

    const boxStyle: ViewStyle = {
      ...(flex !== undefined && { flex }),
      ...(row && { flexDirection: 'row' }),
      ...(center && { alignItems: 'center', justifyContent: 'center' }),
      ...(items && { alignItems: items }),
      ...(justify && { justifyContent: justify }),
      ...(gap !== undefined && { gap: resolveSpacing(gap) }),

      // Padding
      ...(p !== undefined && { padding: resolveSpacing(p) }),
      ...(px !== undefined && { paddingHorizontal: resolveSpacing(px) }),
      ...(py !== undefined && { paddingVertical: resolveSpacing(py) }),
      ...(pt !== undefined && { paddingTop: resolveSpacing(pt) }),
      ...(pb !== undefined && { paddingBottom: resolveSpacing(pb) }),
      ...(pl !== undefined && { paddingLeft: resolveSpacing(pl) }),
      ...(pr !== undefined && { paddingRight: resolveSpacing(pr) }),

      // Margin
      ...(m !== undefined && { margin: resolveSpacing(m) }),
      ...(mx !== undefined && { marginHorizontal: resolveSpacing(mx) }),
      ...(my !== undefined && { marginVertical: resolveSpacing(my) }),
      ...(mt !== undefined && { marginTop: resolveSpacing(mt) }),
      ...(mb !== undefined && { marginBottom: resolveSpacing(mb) }),
      ...(ml !== undefined && { marginLeft: resolveSpacing(ml) }),
      ...(mr !== undefined && { marginRight: resolveSpacing(mr) }),

      // Styling
      ...(bg && { backgroundColor: bg }),
      ...(radius !== undefined && { borderRadius: resolveRadius(radius) }),
      ...(border && { borderWidth: border.width, borderColor: border.color }),
    };

    // Strip any accidental className at runtime so it never reaches RN View
    const { className: _ignoredClassName, ...cleanRest } =
      (rest as unknown as {
        className?: unknown;
      }) || {};

    return (
      <View ref={ref} style={[boxStyle, style]} testID={testID} {...(cleanRest as ViewProps)}>
        {children}
      </View>
    );
  },
);

Box.displayName = 'Box';
