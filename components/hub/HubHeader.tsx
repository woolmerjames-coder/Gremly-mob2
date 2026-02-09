/**
 * HubHeader - Search input, view toggle, and filter controls
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
} from 'react-native';
import { LayoutGrid, BookOpen, Settings } from 'lucide-react-native';
import { colors, radii, spacing } from '../../theme/tokens';
import { type as typeStyles } from '../../theme/typography';
import { BRAND } from '../../design/brand';

// Mascot image for age badge
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../assets/mascot/gremly-mascot.png');

export type HubV1TypeFilter = 'todo' | 'habit' | 'note' | 'space';
export type HubV1TimeRange = 'week' | 'month' | '3months' | 'all';
export type HubV1StatusFilter = 'active' | 'completed' | 'all';
export type HubV1View = 'all' | 'timeline' | 'journals' | 'people';

const TIME_RANGE_LABELS: Record<HubV1TimeRange, string> = {
  week: 'This Week',
  month: 'This Month',
  '3months': 'Last 3 Months',
  all: 'All Time',
};

const STATUS_LABELS: Record<HubV1StatusFilter, string> = {
  active: 'Active',
  completed: 'Completed',
  all: 'All',
};

export interface HubHeaderProps {
  search: string;
  onSearchChange: (text: string) => void;
  hubView: HubV1View;
  onViewChange: (view: HubV1View) => void;
  selectedTypes: Set<HubV1TypeFilter>;
  onTypeToggle: (type: HubV1TypeFilter) => void;
  timeRange: HubV1TimeRange;
  onTimeRangeChange: (range: HubV1TimeRange) => void;
  status: HubV1StatusFilter;
  onStatusChange: (status: HubV1StatusFilter) => void;
  onSettingsPress?: () => void;
  gremlyAge?: number;
}

export default function HubHeader({
  search,
  onSearchChange,
  hubView,
  onViewChange,
  selectedTypes,
  onTypeToggle,
  timeRange,
  onTimeRangeChange,
  status,
  onStatusChange,
  onSettingsPress,
  gremlyAge,
}: HubHeaderProps) {
  const isJournalView = hubView === 'journals';

  return (
    <>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[typeStyles.h1, { marginTop: spacing.sm }]}>Hub</Text>
        <View style={styles.headerRight}>
          {/* Age badge: mascot + age number */}
          {gremlyAge !== undefined && (
            <View style={styles.ageBadge}>
              <Image
                source={GREMLY_MASCOT}
                style={styles.ageMascot}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              <Text style={styles.ageNumber}>{gremlyAge}</Text>
            </View>
          )}
          {onSettingsPress && (
            <TouchableOpacity
              onPress={onSettingsPress}
              style={styles.settingsButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              testID="hub-settings-button"
              accessibilityLabel="Settings"
              accessibilityRole="button"
            >
              <Settings size={24} color={colors.gray600} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Search your mind..."
          placeholderTextColor={colors.gray400}
          value={search}
          onChangeText={onSearchChange}
          testID="hub-search"
          returnKeyType="search"
        />
      </View>

      {/* View Toggle: All Items | Journals */}
      <View style={styles.viewToggleContainer} testID="hub-view-toggle">
        {(['all', 'journals'] as const).map((mode) => {
          const isActive = hubView === mode;
          const label = mode === 'all' ? 'All Items' : 'Journals';
          const IconComponent = mode === 'all' ? LayoutGrid : BookOpen;
          return (
            <Pressable
              key={mode}
              onPress={() => onViewChange(mode)}
              style={[styles.viewToggleTab, isActive && styles.viewToggleTabActive]}
              testID={`hub-view-toggle-${mode}`}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: isActive }}
            >
              <IconComponent
                size={16}
                color={isActive ? colors.deepTeal : colors.gray600}
                style={{ marginRight: spacing.xs }}
              />
              <Text
                style={[
                  styles.viewToggleTabText,
                  isActive ? styles.viewToggleTabTextActive : styles.viewToggleTabTextInactive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Filter Controls */}
      <View style={styles.filterContainer}>
        {/* Type Chips (multi-select) */}
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedTypes.has('todo') && styles.filterChipActive,
                isJournalView && styles.filterChipDisabled,
              ]}
              onPress={() => onTypeToggle('todo')}
              disabled={isJournalView}
              testID="filter-type-todo"
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedTypes.has('todo') && styles.filterChipTextActive,
                  isJournalView && styles.filterChipTextDisabled,
                ]}
              >
                To-Dos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedTypes.has('habit') && styles.filterChipActive,
                isJournalView && styles.filterChipDisabled,
              ]}
              onPress={() => onTypeToggle('habit')}
              disabled={isJournalView}
              testID="filter-type-habit"
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedTypes.has('habit') && styles.filterChipTextActive,
                  isJournalView && styles.filterChipTextDisabled,
                ]}
              >
                Habits
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                isJournalView
                  ? styles.filterChipActive
                  : selectedTypes.has('note') && styles.filterChipActive,
              ]}
              onPress={() => onTypeToggle('note')}
              disabled={isJournalView}
              testID="filter-type-note"
            >
              <Text
                style={[
                  styles.filterChipText,
                  isJournalView
                    ? styles.filterChipTextActive
                    : selectedTypes.has('note') && styles.filterChipTextActive,
                ]}
              >
                {isJournalView ? 'Journals' : 'Notes'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedTypes.has('space') && styles.filterChipActive,
                isJournalView && styles.filterChipDisabled,
              ]}
              onPress={() => onTypeToggle('space')}
              disabled={isJournalView}
              testID="filter-type-space"
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedTypes.has('space') && styles.filterChipTextActive,
                  isJournalView && styles.filterChipTextDisabled,
                ]}
              >
                Spaces
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Time + Status Dropdowns Row */}
        <View style={styles.dropdownRow}>
          {/* Time Range Dropdown */}
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              const ranges: HubV1TimeRange[] = ['week', 'month', '3months', 'all'];
              const currentIdx = ranges.indexOf(timeRange);
              const nextIdx = (currentIdx + 1) % ranges.length;
              onTimeRangeChange(ranges[nextIdx]);
            }}
            testID="filter-time-dropdown"
          >
            <Text style={styles.dropdownText}>{TIME_RANGE_LABELS[timeRange]}</Text>
            <Text style={styles.dropdownArrow}>▾</Text>
          </TouchableOpacity>

          {/* Status Dropdown */}
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              const statuses: HubV1StatusFilter[] = ['active', 'completed', 'all'];
              const currentIdx = statuses.indexOf(status);
              const nextIdx = (currentIdx + 1) % statuses.length;
              onStatusChange(statuses[nextIdx]);
            }}
            testID="filter-status-dropdown"
          >
            <Text style={styles.dropdownText}>{STATUS_LABELS[status]}</Text>
            <Text style={styles.dropdownArrow}>▾</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    marginTop: spacing.md,
  },
  search: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  viewToggleContainer: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    backgroundColor: colors.gray100,
    borderRadius: radii.xl,
    padding: spacing.xs,
  },
  viewToggleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  viewToggleTabActive: {
    backgroundColor: colors.white,
  },
  viewToggleTabText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  viewToggleTabTextActive: {
    color: colors.deepTeal,
    fontWeight: '600',
  },
  viewToggleTabTextInactive: {
    color: colors.gray600,
  },
  filterContainer: {
    marginTop: spacing.lg,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200,
    marginRight: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.deepTeal,
    borderColor: colors.deepTeal,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray600,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  filterChipDisabled: {
    backgroundColor: colors.gray100,
    borderColor: colors.gray100,
  },
  filterChipTextDisabled: {
    color: colors.gray400,
    fontStyle: 'italic',
  },
  dropdownRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
    marginRight: spacing.xs,
  },
  dropdownArrow: {
    fontSize: 10,
    color: colors.gray400,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 8,
    paddingLeft: 4,
  },
  ageMascot: {
    width: 24,
    height: 24,
  },
  ageNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  settingsButton: {
    padding: spacing.sm,
  },
});
