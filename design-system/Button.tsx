import React from 'react';
import { Pressable, Text, ActivityIndicator, type PressableProps } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

const button = tv({
  slots: {
    base: 'flex-row items-center justify-center rounded-md transition-all active:opacity-70',
    text: 'font-semibold text-center',
  },
  variants: {
    variant: {
      primary: {
        base: 'bg-primary',
        text: 'text-white',
      },
      secondary: {
        base: 'bg-accent',
        text: 'text-primary',
      },
      outline: {
        base: 'bg-transparent border-2 border-primary',
        text: 'text-primary',
      },
      ghost: {
        base: 'bg-transparent',
        text: 'text-primary',
      },
    },
    size: {
      sm: {
        base: 'px-3 py-2 min-h-[32px]',
        text: 'text-sm',
      },
      md: {
        base: 'px-4 py-3 min-h-[44px]',
        text: 'text-base',
      },
      lg: {
        base: 'px-6 py-4 min-h-[56px]',
        text: 'text-lg',
      },
    },
    disabled: {
      true: {
        base: 'opacity-50',
      },
    },
    fullWidth: {
      true: {
        base: 'w-full',
      },
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

export type ButtonVariants = VariantProps<typeof button>;

export interface ButtonProps extends Omit<PressableProps, 'children' | 'disabled'>, ButtonVariants {
  label: string;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  (
    {
      label,
      variant,
      size,
      disabled,
      fullWidth,
      isLoading = false,
      leftIcon,
      rightIcon,
      ...pressableProps
    },
    ref,
  ) => {
    const styles = button({ variant, size, disabled: disabled || undefined, fullWidth });

    return (
      <Pressable
        ref={ref}
        disabled={disabled || isLoading}
        {...pressableProps}
        className={styles.base()}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={variant === 'primary' ? 'white' : '#0F4C5C'} />
        ) : (
          <>
            {leftIcon}
            <Text className={styles.text()}>{label}</Text>
            {rightIcon}
          </>
        )}
      </Pressable>
    );
  },
);

Button.displayName = 'Button';
