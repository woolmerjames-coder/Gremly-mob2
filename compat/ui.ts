/**
 * Compat UI Barrel - Central export for DS primitives
 * Use this as the stable import path for primitives across the app
 */

// Core UI primitives
export { Box } from '../ui/Box';
export type { BoxProps } from '../ui/Box';

export { Text } from '../ui/Text';
export type { TextProps } from '../ui/Text';

export { Button } from '../ui/Button';
export type { ButtonProps } from '../ui/Button';

export { Input } from '../ui/Input';
export type { InputProps } from '../ui/Input';

export { Chip } from '../ui/Chip';
export type { ChipProps } from '../ui/Chip';

export { Screen } from '../ui/Screen';
export type { ScreenProps } from '../ui/Screen';

// Design system components (migrated from Tailwind)
export { Button as DSButton } from '../design-system/Button';
export type { ButtonProps as DSButtonProps } from '../design-system/Button';

export { Input as DSInput } from '../design-system/Input';
export type { InputProps as DSInputProps } from '../design-system/Input';

export { Card } from '../design-system/Card';
export type { CardProps } from '../design-system/Card';

export { Badge } from '../design-system/Badge';
export type { BadgeProps } from '../design-system/Badge';

export { Textarea } from '../design-system/Textarea';
export type { TextareaProps } from '../design-system/Textarea';

export { Icon } from '../design-system/Icon';
export type { IconProps } from '../design-system/Icon';

export { ListItem } from '../design-system/ListItem';
export type { ListItemProps } from '../design-system/ListItem';

export { Tabs, type Tab } from '../design-system/Tabs';
export type { TabsProps } from '../design-system/Tabs';
