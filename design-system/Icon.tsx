import * as React from 'react';
import { View } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';
import * as Icons from 'lucide-react-native';

const icon = tv({
  base: 'items-center justify-center',
  variants: {
    size: {
      xs: 'w-4 h-4',
      sm: 'w-5 h-5',
      md: 'w-6 h-6',
      lg: 'w-8 h-8',
      xl: 'w-10 h-10',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export type IconVariants = VariantProps<typeof icon>;

export interface IconProps extends IconVariants {
  name: keyof typeof Icons;
  color?: string;
  strokeWidth?: number;
}

const sizeMap = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 40,
};

export const Icon = React.forwardRef<React.ElementRef<typeof View>, IconProps>(
  ({ name, size = 'md', color = '#0F4C5C', strokeWidth = 2 }, ref) => {
    const styles = icon({ size });
    const LucideIcon = Icons[name] as React.ComponentType<{
      size: number;
      color: string;
      strokeWidth: number;
    }>;

    if (!LucideIcon) {
      console.warn(`Icon "${String(name)}" not found in lucide-react-native`);
      return null;
    }

    return (
      <View ref={ref} className={styles}>
        <LucideIcon size={sizeMap[size]} color={color} strokeWidth={strokeWidth} />
      </View>
    );
  },
);

Icon.displayName = 'Icon';
