/**
 * Box Component - Layout View wrapper with ergonomic props
 */

import React from 'react';
import { View, ViewProps, ViewStyle } from 'react-native';
import { useTokens } from '../design/makeStyles';
import type { Tokens } from '../design/tokens';

export interface BoxProps extends Omit<ViewProps, 'className'> {
  /** Disallow className */
  className?: never;

  /** Padding (index into spacing) */
  p?: number;
  /** Padding horizontal */
  px?: number;
  /** Padding vertical */
  py?: number;
  /** Padding top */
  pt?: number;
  /** Padding right */
  pr?: number;
  /** Padding bottom */
  pb?: number;
  /** Padding left */
  pl?: number;

  /** Margin (index into spacing) */
  m?: number;
  /** Margin horizontal */
  mx?: number;
  /** Margin vertical */
  my?: number;
  /** Margin top */
  mt?: number;
  /** Margin right */
  mr?: number;
  /** Margin bottom */
  mb?: number;
  /** Margin left */
  ml?: number;

  /** Gap between children (index into spacing) */
  gap?: number;

  /** Flex value */
  flex?: number;

  /** Flex direction row */
  row?: boolean;
  /** Center vertically and horizontally */
  center?: boolean;

  /** Border radius (index into radius) */
  radius?: number;
  /** Background color (key from tokens.colors) */
  bg?: keyof Tokens['colors'];

  /** Test ID */
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
      pr,
      pb,
      pl,
      m,
      mx,
      my,
      mt,
      mr,
      mb,
      ml,
      gap,
      flex,
      row,
      center,
      radius,
      bg,
      testID,
      ...rest
    },
    ref,
  ) => {
    const t = useTokens();

    const getSpacing = (index: number | undefined): number | undefined => {
      if (index === undefined) return undefined;
      return t.spacing[index] ?? index;
    };

    const getRadius = (index: number | undefined): number | undefined => {
      if (index === undefined) return undefined;
      return t.radius[index] ?? index;
    };

    const boxStyle: ViewStyle = {
      ...(flex !== undefined && { flex }),
      ...(row && { flexDirection: 'row' }),
      ...(center && { alignItems: 'center', justifyContent: 'center' }),
      ...(gap !== undefined && { gap: getSpacing(gap) }),

      // Padding
      ...(p !== undefined && { padding: getSpacing(p) }),
      ...(px !== undefined && { paddingHorizontal: getSpacing(px) }),
      ...(py !== undefined && { paddingVertical: getSpacing(py) }),
      ...(pt !== undefined && { paddingTop: getSpacing(pt) }),
      ...(pr !== undefined && { paddingRight: getSpacing(pr) }),
      ...(pb !== undefined && { paddingBottom: getSpacing(pb) }),
      ...(pl !== undefined && { paddingLeft: getSpacing(pl) }),

      // Margin
      ...(m !== undefined && { margin: getSpacing(m) }),
      ...(mx !== undefined && { marginHorizontal: getSpacing(mx) }),
      ...(my !== undefined && { marginVertical: getSpacing(my) }),
      ...(mt !== undefined && { marginTop: getSpacing(mt) }),
      ...(mr !== undefined && { marginRight: getSpacing(mr) }),
      ...(mb !== undefined && { marginBottom: getSpacing(mb) }),
      ...(ml !== undefined && { marginLeft: getSpacing(ml) }),

      // Styling
      ...(radius !== undefined && { borderRadius: getRadius(radius) }),
      ...(bg && { backgroundColor: t.colors[bg] }),
    };

    // Strip any accidental className at runtime
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { className: _ignored, ...cleanRest } = rest as Record<string, unknown>;

    return (
      <View ref={ref} style={[boxStyle, style]} testID={testID} {...cleanRest}>
        {children}
      </View>
    );
  },
);

Box.displayName = 'Box';
