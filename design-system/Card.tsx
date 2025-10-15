import React from 'react';
import { View, type ViewProps } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

const card = tv({
  base: 'rounded-lg bg-white overflow-hidden',
  variants: {
    variant: {
      elevated: 'shadow-md',
      outlined: 'border border-border',
      flat: '',
    },
    padding: {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
  },
  defaultVariants: {
    variant: 'elevated',
    padding: 'md',
  },
});

export type CardVariants = VariantProps<typeof card>;

export interface CardProps extends ViewProps, CardVariants {
  children: React.ReactNode;
}

export const Card = React.forwardRef<React.ElementRef<typeof View>, CardProps>(
  ({ children, variant, padding, ...viewProps }, ref) => {
    const styles = card({ variant, padding });

    return (
      <View ref={ref} {...viewProps} className={styles}>
        {children}
      </View>
    );
  },
);

Card.displayName = 'Card';
