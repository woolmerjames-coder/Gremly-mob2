/**
 * ListItem - DS-based implementation (migrated from Tailwind)
 */
import * as React from 'react';
import { Pressable, ViewStyle, type PressableProps } from 'react-native';
import { useTokens } from '../design/makeStyles';
import { Box } from '../ui/Box';
import { Text } from '../ui/Text';

type Variant = 'default' | 'bordered';

export interface ListItemProps extends Omit<PressableProps, 'disabled'> {
  /** Title text */
  title: string;
  /** Subtitle text */
  subtitle?: string;
  /** Left icon */
  leftIcon?: React.ReactNode;
  /** Right icon */
  rightIcon?: React.ReactNode;
  /** Right content */
  rightContent?: React.ReactNode;
  /** Variant style */
  variant?: Variant;
  /** Disabled state */
  disabled?: boolean;
}

export const ListItem = React.forwardRef<React.ElementRef<typeof Pressable>, ListItemProps>(
  (
    {
      title,
      subtitle,
      leftIcon,
      rightIcon,
      rightContent,
      variant = 'default',
      disabled,
      ...pressableProps
    },
    ref,
  ) => {
    const t = useTokens();

    const baseStyle: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: t.spacing[4],
      paddingVertical: t.spacing[3],
      backgroundColor: '#FFFFFF',
      opacity: disabled ? 0.5 : 1,
      ...(variant === 'bordered' && {
        borderBottomWidth: 1,
        borderBottomColor: t.colors.border,
      }),
    };

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        {...pressableProps}
        style={({ pressed }) => [baseStyle, pressed && { backgroundColor: t.colors.surface }]}
      >
        {leftIcon && <Box mr={3}>{leftIcon}</Box>}
        <Box flex={1}>
          <Text variant="body" style={{ fontWeight: '500' }}>
            {title}
          </Text>
          {subtitle && (
            <Text variant="subtle" style={{ marginTop: t.spacing[0] }}>
              {subtitle}
            </Text>
          )}
        </Box>
        {rightContent && <Box ml={3}>{rightContent}</Box>}
        {rightIcon && <Box ml={3}>{rightIcon}</Box>}
      </Pressable>
    );
  },
);

ListItem.displayName = 'ListItem';
