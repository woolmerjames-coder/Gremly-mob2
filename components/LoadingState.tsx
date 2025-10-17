/**
 * LoadingState - Reusable loading indicator component
 */

import React from 'react';
import { ActivityIndicator, ViewStyle } from 'react-native';
import { Box, Text } from '../ui';
import { useTokens } from '../design/makeStyles';

interface LoadingStateProps {
  /** Loading message */
  message?: string;
  /** Size of the indicator */
  size?: 'small' | 'large';
  /** Full screen overlay */
  fullScreen?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  size = 'large',
  fullScreen = false,
}) => {
  const tokens = useTokens();

  const containerStyle: ViewStyle = fullScreen
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        zIndex: 1000,
      }
    : {};

  return (
    <Box center flex={1} style={containerStyle}>
      <ActivityIndicator size={size} color={tokens.colors.primary} />
      {message && (
        <Box mt={3}>
          <Text variant="body" style={{ color: tokens.colors.subtle }}>
            {message}
          </Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * LoadingOverlay - Full screen loading overlay
 */
export const LoadingOverlay: React.FC<{ visible: boolean; message?: string }> = ({
  visible,
  message,
}) => {
  if (!visible) return null;
  return <LoadingState fullScreen message={message} />;
};
