/**
 * Screen Component - DS-based screen container with safe area
 * No Tailwind/className usage
 */

import React from 'react';
import { ScrollView, ViewProps, ViewStyle, RefreshControlProps } from 'react-native';
import { SafeAreaView, Edge, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '../design/makeStyles';
import { Box } from './Box';
import { Text } from './Text';

export interface ScreenProps extends Omit<ViewProps, 'className'> {
  /** Disallow className */
  className?: never;

  /** Screen title */
  title?: string;

  /** Wrap children in ScrollView */
  scroll?: boolean;

  /** Apply padding (uses tokens.spacing[4]) */
  padded?: boolean;

  /** Safe area edges to respect */
  edges?: Edge[];

  /** Optional footer content */
  footer?: React.ReactNode;

  /** Optional refresh control (only works with scroll=true) */
  refreshControl?: React.ReactElement<RefreshControlProps>;

  /** Children */
  children: React.ReactNode;

  /** Test ID */
  testID?: string;
}

export const Screen = React.forwardRef<typeof SafeAreaView, ScreenProps>(
  (
    {
      title,
      scroll = false,
      padded = true,
      edges = ['top', 'bottom'],
      footer,
      refreshControl,
      children,
      testID,
      style,
      ...viewProps
    },
    _ref,
  ) => {
    const t = useTokens();
    const insets = useSafeAreaInsets();

    const Container = scroll ? ScrollView : Box;

    const containerStyle: ViewStyle = {
      flex: 1,
      backgroundColor: t.colors.bg,
    };

    const contentPadding = padded ? t.spacing[4] : 0;

    const scrollContentStyle = scroll
      ? {
          paddingHorizontal: contentPadding,
          paddingTop: contentPadding,
          paddingBottom: insets.bottom + 16,
        }
      : undefined;

    const boxStyle: ViewStyle = scroll
      ? {}
      : {
          flex: 1,
          paddingHorizontal: contentPadding,
          paddingTop: contentPadding,
        };

    // Strip className if present
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { className: _ignored, ...cleanProps } = viewProps as Record<string, unknown>;

    return (
      <SafeAreaView testID={testID} style={[containerStyle, style]} edges={edges}>
        <Container
          testID={scroll ? 'today-scroll' : undefined}
          {...(scroll ? { contentContainerStyle: scrollContentStyle } : { style: boxStyle })}
          {...(scroll && refreshControl ? { refreshControl } : {})}
          {...(cleanProps as Record<string, unknown>)}
        >
          {title && (
            <Text variant="title" style={{ marginBottom: t.spacing[3] }}>
              {title}
            </Text>
          )}
          {children}
        </Container>
        {footer && (
          <Box px={4} pb={4} style={{ paddingBottom: insets.bottom }}>
            {footer}
          </Box>
        )}
      </SafeAreaView>
    );
  },
);

Screen.displayName = 'Screen';
