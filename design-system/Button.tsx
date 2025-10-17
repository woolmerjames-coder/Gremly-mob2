/**
 * Button - DS-based implementation with Phase 7 animations
 * Features: press animations, haptic feedback, reduced motion support
 */
import * as React from 'react';
import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTokens } from '../design/makeStyles';
import { Text } from '../ui/Text';
import { useReducedMotion, pressDown, pressUp } from '../design/animations';
import { buttonPress, primaryButtonPress } from '../lib/haptics';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'disabled'> {
  /** Button label text */
  label: string;
  /** Button variant (maps: primary→primary, secondary/outline/ghost→neutral) */
  variant?: Variant;
  /** Button size */
  size?: Size;
  /** Disabled state */
  disabled?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Left icon */
  leftIcon?: React.ReactNode;
  /** Right icon */
  rightIcon?: React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  (
    {
      label,
      variant = 'primary',
      size = 'md',
      disabled,
      fullWidth,
      isLoading = false,
      leftIcon,
      rightIcon,
      onPressIn,
      onPressOut,
      onPress,
      ...pressableProps
    },
    ref,
  ) => {
    const t = useTokens();
    const isReducedMotion = useReducedMotion();

    // Animation values
    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);

    // Map old variants to DS variants
    const getDSVariant = (v: Variant): { bg: string; textColor: string; border?: string } => {
      switch (v) {
        case 'primary':
          return { bg: t.colors.primary, textColor: '#FFFFFF' };
        case 'secondary':
        case 'ghost':
          return { bg: t.colors.surface, textColor: t.colors.text };
        case 'outline':
          return { bg: 'transparent', textColor: t.colors.primary, border: t.colors.primary };
      }
    };

    const getSizeStyle = (
      s: Size,
    ): { height: number; paddingHorizontal: number; fontSize: number } => {
      switch (s) {
        case 'sm':
          return { height: 32, paddingHorizontal: t.spacing[3], fontSize: t.typography.size.sm };
        case 'md':
          return { height: 44, paddingHorizontal: t.spacing[4], fontSize: t.typography.size.md };
        case 'lg':
          return { height: 56, paddingHorizontal: t.spacing[5], fontSize: t.typography.size.lg };
      }
    };

    const variantStyle = getDSVariant(variant);
    const sizeStyle = getSizeStyle(size);

    // Animated style
    const animatedStyle = useAnimatedStyle(() => {
      if (isReducedMotion) {
        return {};
      }
      return {
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
      };
    });

    // Handle press in
    // Shared values (scale, opacity) intentionally excluded from deps - they're mutable refs
    const handlePressIn = React.useCallback(
      (e: any) => {
        if (!disabled && !isLoading && !isReducedMotion) {
          scale.value = pressDown();
          opacity.value = withTiming(0.9, { duration: 100 });
        }

        // Trigger haptic feedback
        if (!disabled && !isLoading) {
          if (variant === 'primary') {
            primaryButtonPress();
          } else {
            buttonPress();
          }
        }

        onPressIn?.(e);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [disabled, isLoading, isReducedMotion, variant, onPressIn],
    );

    // Handle press out
    // Shared values (scale, opacity) intentionally excluded from deps - they're mutable refs
    const handlePressOut = React.useCallback(
      (e: any) => {
        if (!disabled && !isLoading && !isReducedMotion) {
          scale.value = pressUp();
          opacity.value = withSpring(1, { damping: 15, stiffness: 150 });
        }
        onPressOut?.(e);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [disabled, isLoading, isReducedMotion, onPressOut],
    );

    const buttonStyle = {
      height: sizeStyle.height,
      paddingHorizontal: sizeStyle.paddingHorizontal,
      backgroundColor: variantStyle.bg,
      borderRadius: t.radius[2],
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: t.spacing[2],
      opacity: disabled || isLoading ? 0.5 : 1,
      ...(variantStyle.border && { borderWidth: 2, borderColor: variantStyle.border }),
      ...(fullWidth && { width: '100%' }),
    };

    return (
      <AnimatedPressable
        ref={ref}
        disabled={disabled || isLoading}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        {...pressableProps}
        style={[buttonStyle, animatedStyle]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={variantStyle.textColor} />
        ) : (
          <>
            {leftIcon}
            <Text
              style={{
                color: variantStyle.textColor,
                fontSize: sizeStyle.fontSize,
                fontWeight: '600',
              }}
            >
              {label}
            </Text>
            {rightIcon}
          </>
        )}
      </AnimatedPressable>
    );
  },
);

Button.displayName = 'Button';
