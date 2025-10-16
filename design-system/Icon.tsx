/**
 * Icon - DS-based implementation (migrated from Tailwind)
 */
import * as React from 'react';
import * as Icons from 'lucide-react-native';
import { Box } from '../ui/Box';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface IconProps {
  /** Icon name from lucide-react-native */
  name: keyof typeof Icons;
  /** Icon size */
  size?: Size;
  /** Icon color */
  color?: string;
  /** Stroke width */
  strokeWidth?: number;
}

const sizeMap = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 40,
};

export const Icon = React.forwardRef<React.ElementRef<typeof Box>, IconProps>(
  ({ name, size = 'md', color = '#0F4C5C', strokeWidth = 2 }, ref) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Box ref={ref as any} center style={{ width: sizeMap[size], height: sizeMap[size] }}>
        <LucideIcon size={sizeMap[size]} color={color} strokeWidth={strokeWidth} />
      </Box>
    );
  },
);

Icon.displayName = 'Icon';
