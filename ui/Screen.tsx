/**
 * Screen Component - Base screen container with safe area
 */

import React from 'react';
import { ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useTheme } from '../design/theme';
import { Box, BoxProps } from './Box';

export interface ScreenProps extends Omit<BoxProps, 'style'> {
  edges?: Edge[];
  style?: ViewStyle;
}

export const Screen = React.forwardRef<typeof SafeAreaView, ScreenProps>(
  ({ children, edges = ['top', 'bottom'], style, bg, ...boxProps }, ref) => {
    const { theme } = useTheme();

    return (
      <SafeAreaView
        style={[{ flex: 1, backgroundColor: bg || theme.colors.bg.DEFAULT }, style]}
        edges={edges}
      >
        <Box flex={1} {...boxProps}>
          {children}
        </Box>
      </SafeAreaView>
    );
  },
);

Screen.displayName = 'Screen';
