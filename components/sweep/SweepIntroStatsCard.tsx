/**
 * SweepIntroStatsCard - Expandable card showing activity since last sweep
 *
 * Displays completed items and newly captured items in a calm, brand-styled card.
 * Each section can be tapped to expand and show individual item names.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import {
  formatIntroStatsSummary,
  type SweepIntroStats,
  type SweepIntroItem,
} from '../../lib/sweep/introStats';
import { Check, Plus, ChevronDown, ChevronUp } from 'lucide-react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SweepIntroStatsCardProps {
  stats: SweepIntroStats;
  isLoading?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_VISIBLE_ITEMS = 8;
const GOLDEN_PEAR = '#E0C47A';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SweepIntroStatsCard({ stats, isLoading }: SweepIntroStatsCardProps) {
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [capturedExpanded, setCapturedExpanded] = useState(false);

  const { completedLine, droppedLine } = formatIntroStatsSummary(stats);

  // Toggle handlers with animation
  const toggleCompleted = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCompletedExpanded((prev) => !prev);
  }, []);

  const toggleCaptured = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCapturedExpanded((prev) => !prev);
  }, []);

  // Combine all completed items
  const completedItems: SweepIntroItem[] = [...stats.completed.todos, ...stats.completed.habits];

  // Combine all captured items
  const capturedItems: SweepIntroItem[] = [
    ...stats.dropped.todos,
    ...stats.dropped.habits,
    ...stats.dropped.notes,
  ];

  // Return null if nothing to show and not loading
  if (!isLoading && !completedLine && !droppedLine) {
    return null;
  }

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={BRAND.colors.inkSubtle} />
          <Text style={styles.loadingText}>Loading activity...</Text>
        </View>
      ) : (
        <>
          {/* Completed Row */}
          {completedLine && (
            <View style={styles.section}>
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={toggleCompleted}
              >
                <View style={[styles.iconCircle, styles.completedIconCircle]}>
                  <Check size={16} color={BRAND.colors.mossGreen} strokeWidth={2.5} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>COMPLETED</Text>
                  <Text style={styles.rowValue}>{completedLine}</Text>
                </View>
                {completedExpanded ? (
                  <ChevronUp size={18} color={BRAND.colors.inkSubtle} />
                ) : (
                  <ChevronDown size={18} color={BRAND.colors.inkSubtle} />
                )}
              </Pressable>

              {/* Expanded Items */}
              {completedExpanded && (
                <View style={styles.expandedList}>
                  {completedItems.slice(0, MAX_VISIBLE_ITEMS).map((item) => (
                    <View key={item.id} style={styles.expandedItem}>
                      <View style={[styles.itemDot, styles.completedDot]} />
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>{item.type}</Text>
                      </View>
                    </View>
                  ))}
                  {completedItems.length > MAX_VISIBLE_ITEMS && (
                    <Text style={styles.moreText}>
                      +{completedItems.length - MAX_VISIBLE_ITEMS} more
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Divider */}
          {completedLine && droppedLine && <View style={styles.divider} />}

          {/* Captured Row */}
          {droppedLine && (
            <View style={styles.section}>
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={toggleCaptured}
              >
                <View style={[styles.iconCircle, styles.capturedIconCircle]}>
                  <Plus size={16} color={GOLDEN_PEAR} strokeWidth={2.5} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>CAPTURED</Text>
                  <Text style={styles.rowValue}>{droppedLine}</Text>
                </View>
                {capturedExpanded ? (
                  <ChevronUp size={18} color={BRAND.colors.inkSubtle} />
                ) : (
                  <ChevronDown size={18} color={BRAND.colors.inkSubtle} />
                )}
              </Pressable>

              {/* Expanded Items */}
              {capturedExpanded && (
                <View style={styles.expandedList}>
                  {capturedItems.slice(0, MAX_VISIBLE_ITEMS).map((item) => (
                    <View key={item.id} style={styles.expandedItem}>
                      <View style={[styles.itemDot, styles.capturedDot]} />
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>
                          {item.type === 'note' ? 'log' : item.type}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {capturedItems.length > MAX_VISIBLE_ITEMS && (
                    <Text style={styles.moreText}>
                      +{capturedItems.length - MAX_VISIBLE_ITEMS} more
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    overflow: 'hidden',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: BRAND.colors.inkSubtle,
  },
  section: {
    // Container for each expandable section
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowPressed: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedIconCircle: {
    backgroundColor: `${BRAND.colors.mossGreen}1A`, // 10% opacity
  },
  capturedIconCircle: {
    backgroundColor: `${GOLDEN_PEAR}1A`, // 10% opacity
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: BRAND.colors.inkSubtle,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  divider: {
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
    marginHorizontal: 16,
  },
  expandedList: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 4,
    gap: 8,
  },
  expandedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  completedDot: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  capturedDot: {
    backgroundColor: GOLDEN_PEAR,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    color: BRAND.colors.charcoalInk,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
    textTransform: 'lowercase',
  },
  moreText: {
    fontSize: 12,
    color: BRAND.colors.inkSubtle,
    fontStyle: 'italic',
    marginLeft: 14,
    marginTop: 4,
  },
});
