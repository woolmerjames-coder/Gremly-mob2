import { View, Pressable, StyleSheet } from 'react-native';
import { formatDistanceToNowStrict } from 'date-fns';
import { Flame } from 'lucide-react-native';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { ModuleSection } from './ModuleSection';
import { useWorldDrops, useWorldPalette } from '../../../lib/store/worldsSelectors';
import type { WorldModuleProps } from './types';
import type { Habit } from '../../../lib/types';

const CAP = 4;

export function HabitStreaksModule({ world }: WorldModuleProps) {
  const drops = useWorldDrops(world.id);
  const palette = useWorldPalette(world.id);
  const active = drops.habits.filter((h) => !h.archived);
  if (active.length === 0) return null;

  const visible = active.slice(0, CAP);
  const onSeeAll =
    active.length > CAP ? () => console.log('[HabitStreaksModule] see all', world.id) : undefined;

  return (
    <ModuleSection label={`HABIT STREAKS \u00b7 ${active.length} ACTIVE`} seeAllOnPress={onSeeAll}>
      {visible.map((h) => (
        <HabitRow
          key={h.id}
          habit={h}
          accent={palette.dot}
          onPress={() => console.log('[HabitStreaksModule] tap', h.id)}
        />
      ))}
    </ModuleSection>
  );
}

interface HabitRowProps {
  habit: Habit;
  accent: string;
  onPress: () => void;
}

function HabitRow({ habit, accent, onPress }: HabitRowProps) {
  const cadence = resolveCadence(habit);
  const last = habit.last_completed_at
    ? formatDistanceToNowStrict(new Date(habit.last_completed_at), { addSuffix: true })
    : 'not started';

  return (
    <Pressable onPress={onPress} style={styles.row} testID={`habit-row-${habit.id}`}>
      <View style={[styles.icon, { backgroundColor: `${accent}22`, borderColor: accent }]}>
        <Flame size={14} color={accent} />
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {habit.name || '(habit)'}
        </Text>
        <Text style={styles.meta}>
          {cadence} · last {last}
        </Text>
      </View>
    </Pressable>
  );
}

function resolveCadence(h: Habit): string {
  if (h.cadence) return String(h.cadence);
  if (h.frequency) return String(h.frequency);
  if (h.target_per_period) return `${h.target_per_period}x per period`;
  return 'ongoing';
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: 16,
    marginBottom: 5,
    padding: 11,
    paddingHorizontal: 13,
    backgroundColor: 'rgba(250,244,222,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(26,58,40,0.05)',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '600',
    color: lightTokens.colors.deepForest,
  },
  meta: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: lightTokens.colors.warmGrey,
    marginTop: 2,
  },
});
