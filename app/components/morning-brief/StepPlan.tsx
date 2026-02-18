import React from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { ShieldOff, Calendar, MoreHorizontal } from 'lucide-react-native';
import { BreakHabitCard } from '../../../components/now/BreakHabitCard';
import { MorningBriefFooter, TimeBlockSection, type TaskItemData } from './components';
import type { Note } from '../../../lib/types';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface StepPlanProps {
  capacity: any;
  keyDatesByBlock: Record<string, Note[]>;
  tasksByBlock: {
    morning: TaskItemData[];
    afternoon: TaskItemData[];
    evening: TaskItemData[];
    flexible: TaskItemData[];
  };
  slottedItemsByBlock: Record<string, any[]>;
  breakHabitsByBlock: Record<string, string[]>;
  collapsedBlocks: Record<string, boolean>;
  hiddenEventIds: string[];
  taskDataById: Record<string, any>;
  today: string;
  scheduleDayName: string;
  onToggleCollapse: (block: string) => void;
  onTaskPress: (task: any) => void;
  onTimePress: (task: any) => void;
  onSlottedTaskPress: (task: any) => void;
  onGapSlotPress: (gap: any, block: 'morning' | 'afternoon' | 'evening') => void;
  onKeyDatePress?: (event: Note) => void;
  onEventQuickAction: (event: Note) => void;
  onFreeMinutesCalculated: (block: string, mins: number) => void;
  getSpaceName: (spaceId: string | null | undefined) => string | undefined;
  organizeMessage?: string | null;
  organizeReasoning?: string[] | null;
  onShowReasoning?: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function StepPlan({
  capacity,
  keyDatesByBlock,
  tasksByBlock,
  slottedItemsByBlock,
  breakHabitsByBlock,
  collapsedBlocks,
  hiddenEventIds,
  taskDataById,
  today,
  scheduleDayName,
  onToggleCollapse,
  onTaskPress,
  onTimePress,
  onSlottedTaskPress,
  onGapSlotPress,
  onKeyDatePress,
  onEventQuickAction,
  onFreeMinutesCalculated,
  getSpaceName,
  organizeMessage,
  organizeReasoning,
  onShowReasoning,
  onConfirm,
  isLoading,
}: StepPlanProps) {
  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Organize feedback — shown if organize ran in Step 4 */}
        {organizeMessage && (
          <View style={styles.organizeFeedback}>
            <Text style={styles.organizeMessage}>{organizeMessage}</Text>
            {(organizeReasoning?.length ?? 0) > 0 && onShowReasoning && (
              <Pressable onPress={onShowReasoning}>
                <Text style={styles.reasoningLink}>Why this plan?</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ─── SCHEDULE SECTION HEADER ─── */}
        <Text style={styles.scheduleHeader}>{`${scheduleDayName}\u2019S SCHEDULE`}</Text>

        {/* All Day - key date events + break habit awareness card */}
        {(breakHabitsByBlock.allday?.length > 0 || keyDatesByBlock.allday?.length > 0) && (
          <>
            <View style={styles.alldaySection}>
              <View style={styles.alldayHeader}>
                <View style={[styles.alldayBar, { backgroundColor: '#8B7E74' }]} />
                <ShieldOff size={16} color="#8B7E74" />
                <Text style={styles.alldayLabel}>ALL DAY</Text>
              </View>

              {/* All-day key date events */}
              {keyDatesByBlock.allday?.map((keyDate) => (
                <Pressable
                  key={keyDate.id}
                  style={styles.alldayEventRow}
                  onPress={() => onKeyDatePress?.(keyDate)}
                >
                  <Calendar size={14} color="#999999" style={{ marginRight: 10 }} />
                  <Text style={styles.alldayEventTitle} numberOfLines={1}>
                    {keyDate.title || 'Untitled Event'}
                  </Text>
                  <Pressable
                    style={styles.quickActionButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      onEventQuickAction(keyDate);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MoreHorizontal size={16} color="#CCCCCC" />
                  </Pressable>
                </Pressable>
              ))}

              {breakHabitsByBlock.allday?.length > 0 && (
                <BreakHabitCard names={breakHabitsByBlock.allday} />
              )}
            </View>
          </>
        )}

        {/* ─── SCHEDULE TIMELINE ─── */}
        <View>
          {/* Morning */}
          <TimeBlockSection
            capacity={capacity.blocks.morning}
            events={[]}
            keyDateEvents={keyDatesByBlock.morning}
            getSpaceName={getSpaceName}
            onKeyDatePress={onKeyDatePress}
            onKeyDateQuickAction={onEventQuickAction}
            tasks={tasksByBlock.morning}
            onTaskPress={onTaskPress}
            onTimePress={onTimePress}
            hiddenEventIds={hiddenEventIds}
            dateContext={today}
            slottedItems={slottedItemsByBlock.morning}
            onGapSlotPress={(gap) => onGapSlotPress(gap, 'morning')}
            onSlottedTaskPress={onSlottedTaskPress}
            taskDataById={taskDataById}
            collapsed={!!collapsedBlocks['morning']}
            onToggleCollapse={() => onToggleCollapse('morning')}
            onFreeMinutesCalculated={onFreeMinutesCalculated}
          />
          {breakHabitsByBlock.morning?.length > 0 && (
            <View style={styles.timelineBreakHabit}>
              <BreakHabitCard names={breakHabitsByBlock.morning} />
            </View>
          )}

          {/* Afternoon */}
          <TimeBlockSection
            capacity={capacity.blocks.day}
            events={[]}
            keyDateEvents={keyDatesByBlock.day}
            getSpaceName={getSpaceName}
            onKeyDatePress={onKeyDatePress}
            onKeyDateQuickAction={onEventQuickAction}
            tasks={tasksByBlock.afternoon}
            onTaskPress={onTaskPress}
            onTimePress={onTimePress}
            hiddenEventIds={hiddenEventIds}
            dateContext={today}
            slottedItems={slottedItemsByBlock.afternoon}
            onGapSlotPress={(gap) => onGapSlotPress(gap, 'afternoon')}
            onSlottedTaskPress={onSlottedTaskPress}
            taskDataById={taskDataById}
            collapsed={!!collapsedBlocks['day']}
            onToggleCollapse={() => onToggleCollapse('day')}
            onFreeMinutesCalculated={onFreeMinutesCalculated}
          />
          {breakHabitsByBlock.afternoon?.length > 0 && (
            <View style={styles.timelineBreakHabit}>
              <BreakHabitCard names={breakHabitsByBlock.afternoon} />
            </View>
          )}

          {/* Evening */}
          <TimeBlockSection
            capacity={capacity.blocks.evening}
            events={[]}
            keyDateEvents={keyDatesByBlock.evening}
            getSpaceName={getSpaceName}
            onKeyDatePress={onKeyDatePress}
            onKeyDateQuickAction={onEventQuickAction}
            tasks={tasksByBlock.evening}
            onTaskPress={onTaskPress}
            onTimePress={onTimePress}
            hiddenEventIds={hiddenEventIds}
            dateContext={today}
            slottedItems={slottedItemsByBlock.evening}
            onGapSlotPress={(gap) => onGapSlotPress(gap, 'evening')}
            onSlottedTaskPress={onSlottedTaskPress}
            taskDataById={taskDataById}
            collapsed={!!collapsedBlocks['evening']}
            onToggleCollapse={() => onToggleCollapse('evening')}
            onFreeMinutesCalculated={onFreeMinutesCalculated}
          />
          {breakHabitsByBlock.evening?.length > 0 && (
            <View style={styles.timelineBreakHabit}>
              <BreakHabitCard names={breakHabitsByBlock.evening} />
            </View>
          )}
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Footer */}
      <MorningBriefFooter onComplete={onConfirm} isLoading={isLoading} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles (copied from MorningBriefSheet.tsx)
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  scheduleHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginLeft: 36,
    marginBottom: 8,
    marginTop: 4,
  },
  timelineBreakHabit: {
    paddingLeft: 16,
  },
  alldaySection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  alldayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    gap: 6,
  },
  alldayBar: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    marginRight: 4,
  },
  alldayLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#8B7E74',
  },
  alldayEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  alldayEventTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0E1116',
    flex: 1,
  },
  quickActionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  organizeFeedback: {
    marginHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  organizeMessage: {
    fontSize: 13,
    color: '#666666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  reasoningLink: {
    fontSize: 13,
    color: '#2E5540',
    textDecorationLine: 'underline',
    marginTop: 6,
  },
});

export default StepPlan;
