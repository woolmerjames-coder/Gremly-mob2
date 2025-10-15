import React from 'react';
import { Pressable, View, Text, type PressableProps } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

const listItem = tv({
  slots: {
    base: 'flex-row items-center px-4 py-3 bg-white active:bg-bg-100 transition-colors',
    leftContainer: 'mr-3',
    contentContainer: 'flex-1',
    title: 'text-base font-medium text-text-primary',
    subtitle: 'text-sm text-text-muted mt-0.5',
    rightContainer: 'ml-3',
  },
  variants: {
    variant: {
      default: {},
      bordered: {
        base: 'border-b border-border-subtle',
      },
    },
    disabled: {
      true: {
        base: 'opacity-50',
      },
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type ListItemVariants = VariantProps<typeof listItem>;

export interface ListItemProps extends Omit<PressableProps, 'disabled'>, ListItemVariants {
  title: string;
  subtitle?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  rightContent?: React.ReactNode;
}

export const ListItem = React.forwardRef<React.ElementRef<typeof Pressable>, ListItemProps>(
  (
    { title, subtitle, leftIcon, rightIcon, rightContent, variant, disabled, ...pressableProps },
    ref,
  ) => {
    const styles = listItem({ variant, disabled: disabled || undefined });

    return (
      <Pressable ref={ref} disabled={disabled} {...pressableProps} className={styles.base()}>
        {leftIcon && <View className={styles.leftContainer()}>{leftIcon}</View>}
        <View className={styles.contentContainer()}>
          <Text className={styles.title()}>{title}</Text>
          {subtitle && <Text className={styles.subtitle()}>{subtitle}</Text>}
        </View>
        {rightContent && <View className={styles.rightContainer()}>{rightContent}</View>}
        {rightIcon && <View className={styles.rightContainer()}>{rightIcon}</View>}
      </Pressable>
    );
  },
);

ListItem.displayName = 'ListItem';
