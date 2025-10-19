/**
 * Icon wrapper for UI components
 * Maps entity types and actions to Lucide icons
 */
import * as React from 'react';
import { Icon as DSIcon, IconProps as DSIconProps } from '../../design-system/Icon';

export type IconName =
  | 'Activity' // Habit (running/activity)
  | 'CheckCircle2' // To-Do (check circle)
  | 'BookOpen' // Journal
  | 'FileText' // Note
  | 'User' // Person
  | 'Sparkles' // AI/sparkle
  | 'MapPin' // Space/location
  | 'Bell' // Notification/reminder
  | 'Tag' // Tags
  | 'Circle' // Generic/placeholder
  | 'X'; // Close

// Map entity types to icons
export const entityTypeToIcon: Record<string, IconName> = {
  habit: 'Activity',
  todo: 'CheckCircle2',
  journal: 'BookOpen',
  note: 'FileText',
  person: 'User',
};

export interface IconProps extends Omit<DSIconProps, 'name'> {
  name: IconName;
}

/**
 * Icon component wrapper
 * Usage: <Icon name="Activity" size="sm" color="#0F4C5C" />
 */
export const Icon = React.forwardRef<any, IconProps>(({ name, ...props }, ref) => {
  return <DSIcon ref={ref} name={name} {...props} />;
});

Icon.displayName = 'Icon';
