// components/worlds/sections/RecurringHabitsModule.tsx
//
// BUILDING · last 13 weeks — rendered on world pages for Practice and Domestic
// archetypes. Each habit shows its name, "X of 13 weeks hit" count, and a row
// of 13 square tiles (amber = hit, cream = miss, last tile darker to mark the
// current week).

import { View, StyleSheet } from 'react-native';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { useActiveHabitsForWorld, useHabitWeekGrid } from '../../../lib/store/worldsSelectors';
import type { Habit } from '../../../lib/types';

const WEEKS_BACK = 13;

interface RecurringHabitsModuleProps {
  worldId: string;
}

export function RecurringHabitsModule({ worldId }: RecurringHabitsModuleProps) {
  const habits = useActiveHabitsForWorld(worldId);
  if (habits.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>BUILDING · last {WEEKS_BACK} weeks</Text>
      {habits.map((habit, idx) => {
        const isLast = idx === habits.length - 1;
        return <HabitGridRow key={habit.id} habit={habit} isLast={isLast} />;
      })}
    </View>
  );
}

interface HabitGridRowProps {
  habit: Habit;
  isLast: boolean;
}

function HabitGridRow({ habit, isLast }: HabitGridRowProps) {
  const grid = useHabitWeekGrid(habit.id, WEEKS_BACK);

  return (
    <View style={[styles.habitWrap, !isLast && styles.habitDivider]}>
      {/* Name + count row */}
      <View style={styles.habitHeader}>
        <Text style={styles.habitName} numberOfLines={1}>
          {habit.name || '(untitled)'}
        </Text>
        <Text style={styles.hitCount}>
          {grid.hitCount} of {WEEKS_BACK} weeks hit
        </Text>
      </View>

      {/* 13-tile grid */}
      <View style={styles.tileRow}>
        {grid.weeks.map((hit, i) => {
          const isCurrentWeek = i === WEEKS_BACK - 1;
          return (
            <View
              key={i}
              style={[
                styles.tile,
                hit ? (isCurrentWeek ? styles.tileHitCurrent : styles.tileHit) : styles.tileMiss,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 26,
    paddingHorizontal: 16,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 14,
  },
  habitWrap: {
    paddingBottom: 16,
    paddingHorizontal: 2,
  },
  habitDivider: {
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  habitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  habitName: {
    flex: 1,
    marginRight: 8,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: lightTokens.colors.worldsInk,
  },
  hitCount: {
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    color: lightTokens.colors.warmGrey,
    flexShrink: 0,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 3,
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 2,
  },
  tileHit: {
    backgroundColor: lightTokens.colors.ambergold,
  },
  tileHitCurrent: {
    // Current week: deeper amber
    backgroundColor: '#BA7517',
    borderWidth: 1,
    borderColor: '#412402',
  },
  tileMiss: {
    backgroundColor: '#F5F1E8',
    borderWidth: 0.5,
    borderColor: '#E5DFD2',
  },
});
