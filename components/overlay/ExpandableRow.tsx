/**
 * ExpandableRow — Inline-expandable metadata row
 *
 * Replaces modal-based editing (Schedule modal, Space picker modal, etc.)
 * with tap-to-expand inline sections.
 *
 * Usage:
 *   <ExpandableRow
 *     icon={Calendar}
 *     label="Schedule"
 *     summary="Today · 30m · Morning"
 *     expanded={expanded === 'schedule'}
 *     onToggle={() => toggle('schedule')}
 *   >
 *     <ScheduleFields ... />
 *   </ExpandableRow>
 */

import React from 'react';
import { Pressable, View, LayoutAnimation, Platform, UIManager, StyleSheet } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Text } from '../../ui';
import type { LucideIcon } from 'lucide-react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ExpandableRowProps {
  /** Lucide icon component */
  icon: LucideIcon;
  /** Row label */
  label: string;
  /** Summary text shown on right when collapsed */
  summary: string;
  /** Whether this row is expanded */
  expanded: boolean;
  /** Toggle callback */
  onToggle: () => void;
  /** Badge text (e.g. count) */
  badge?: string | number;
  /** Icon color override */
  iconColor?: string;
  /** Expanded content */
  children?: React.ReactNode;
  /** Whether row is disabled (view mode) */
  disabled?: boolean;
  /** Show bottom border */
  borderBottom?: boolean;
  /** Test ID */
  testID?: string;
}

export const ExpandableRow: React.FC<ExpandableRowProps> = ({
  icon: Icon,
  label,
  summary,
  expanded,
  onToggle,
  badge,
  iconColor = '#8B8579',
  children,
  disabled = false,
  borderBottom = true,
  testID,
}) => {
  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  return (
    <View style={[styles.container, borderBottom && styles.borderBottom]} testID={testID}>
      <Pressable
        onPress={handleToggle}
        disabled={disabled}
        style={({ pressed }) => [
          styles.header,
          pressed && !disabled && styles.headerPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${label}: ${summary}`}
      >
        <View style={styles.headerLeft}>
          <Icon size={17} color={iconColor} strokeWidth={1.8} />
          <Text style={styles.label}>{label}</Text>
          {badge !== undefined && badge !== null && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{String(badge)}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <Text
            style={[
              styles.summary,
              expanded && styles.summaryExpanded,
            ]}
            numberOfLines={1}
          >
            {summary}
          </Text>
          {expanded ? (
            <ChevronUp size={14} color="#8B8579" />
          ) : (
            <ChevronDown size={14} color="#8B8579" />
          )}
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.content}>
          {children}
        </View>
      )}
    </View>
  );
};

/** Simple non-expandable row for toggles, navigation, and actions */
export const StaticRow: React.FC<{
  icon: LucideIcon;
  label: string;
  right?: React.ReactNode;
  iconColor?: string;
  onPress?: () => void;
  borderBottom?: boolean;
  testID?: string;
}> = ({ icon: Icon, label, right, iconColor = '#8B8579', onPress, borderBottom = true, testID }) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    style={({ pressed }) => [
      styles.staticRow,
      borderBottom && styles.borderBottom,
      pressed && onPress && styles.headerPressed,
    ]}
    testID={testID}
  >
    <View style={styles.headerLeft}>
      <Icon size={17} color={iconColor} strokeWidth={1.8} />
      <Text style={styles.label}>{label}</Text>
    </View>
    {right}
  </Pressable>
);

const styles = StyleSheet.create({
  container: {},
  borderBottom: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#D5D0C8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  headerPressed: {
    opacity: 0.7,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '55%',
  },
  label: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '400',
  },
  summary: {
    fontSize: 12,
    color: '#8B8579',
    fontWeight: '400',
  },
  summaryExpanded: {
    color: '#2E5540',
    fontWeight: '500',
  },
  badge: {
    backgroundColor: 'rgba(46, 85, 64, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    color: '#2E5540',
    fontWeight: '500',
  },
  content: {
    paddingLeft: 27,
    paddingBottom: 14,
  },
  staticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
});

export default ExpandableRow;
