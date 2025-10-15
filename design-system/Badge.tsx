import React from 'react';
import { View, Text, type ViewProps } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

const badge = tv({
  slots: {
    base: 'flex-row items-center justify-center rounded-full',
    text: 'font-medium',
  },
  variants: {
    variant: {
      primary: {
        base: 'bg-primary',
        text: 'text-white',
      },
      success: {
        base: 'bg-success',
        text: 'text-white',
      },
      warning: {
        base: 'bg-warning',
        text: 'text-white',
      },
      error: {
        base: 'bg-error',
        text: 'text-white',
      },
      info: {
        base: 'bg-info',
        text: 'text-white',
      },
      neutral: {
        base: 'bg-bg-200',
        text: 'text-text-primary',
      },
    },
    size: {
      sm: {
        base: 'px-2 py-0.5 min-h-[20px]',
        text: 'text-xs',
      },
      md: {
        base: 'px-3 py-1 min-h-[24px]',
        text: 'text-sm',
      },
      lg: {
        base: 'px-4 py-1.5 min-h-[28px]',
        text: 'text-base',
      },
    },
  },
  defaultVariants: {
    variant: 'neutral',
    size: 'md',
  },
});

export type BadgeVariants = VariantProps<typeof badge>;

export interface BadgeProps extends Omit<ViewProps, 'children'>, BadgeVariants {
  label: string;
  leftIcon?: React.ReactNode;
}

export const Badge = React.forwardRef<React.ElementRef<typeof View>, BadgeProps>(
  ({ label, variant, size, leftIcon, ...viewProps }, ref) => {
    const styles = badge({ variant, size });

    return (
      <View ref={ref} {...viewProps} className={styles.base()}>
        {leftIcon && <View className="mr-1">{leftIcon}</View>}
        <Text className={styles.text()}>{label}</Text>
      </View>
    );
  },
);

Badge.displayName = 'Badge';
