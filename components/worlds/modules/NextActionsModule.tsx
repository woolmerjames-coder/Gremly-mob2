import { View, Pressable, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { ChevronRight } from 'lucide-react-native';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { ModuleSection } from './ModuleSection';
import { useWorldDrops, useWorldPalette } from '../../../lib/store/worldsSelectors';
import { getDateService } from '../../../lib/date/DateService';
import type { WorldModuleProps } from './types';
import type { Todo } from '../../../lib/types';

const CAP = 5;

export function NextActionsModule({ world }: WorldModuleProps) {
  const drops = useWorldDrops(world.id);
  const palette = useWorldPalette(world.id);
  const open = drops.todos.filter((t) => !t.completed_at);
  if (open.length === 0) return null;

  const sorted = [...open].sort((a, b) => {
    const ad = a.due_date ?? '';
    const bd = b.due_date ?? '';
    if (ad && bd) return ad.localeCompare(bd);
    if (ad) return -1;
    if (bd) return 1;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });
  const visible = sorted.slice(0, CAP);

  const onSeeAll =
    sorted.length > CAP ? () => console.log('[NextActionsModule] see all', world.id) : undefined;

  return (
    <ModuleSection label={`NEXT ACTIONS \u00b7 ${open.length} OPEN`} seeAllOnPress={onSeeAll}>
      {visible.map((t) => (
        <TodoRow
          key={t.id}
          todo={t}
          accent={palette.dot}
          onPress={() => console.log('[NextActionsModule] tap', t.id)}
        />
      ))}
    </ModuleSection>
  );
}

interface TodoRowProps {
  todo: Todo;
  accent: string;
  onPress: () => void;
}

function TodoRow({ todo, accent, onPress }: TodoRowProps) {
  return (
    <Pressable onPress={onPress} style={styles.row} testID={`todo-row-${todo.id}`}>
      <View style={[styles.chk, { borderColor: accent }]} />
      <Text style={styles.title} numberOfLines={2}>
        {todo.title || todo.name || '(untitled)'}
      </Text>
      {todo.due_date ? <Text style={styles.due}>{formatShortDue(todo.due_date)}</Text> : null}
      <ChevronRight size={14} color={lightTokens.colors.warmGrey} />
    </Pressable>
  );
}

function formatShortDue(due: string): string {
  const d = new Date(due);
  if (isNaN(d.getTime())) return '';
  const now = getDateService().now();
  const diff = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'today';
  if (diff === 1) return 'tmrw';
  if (diff < 0 && diff > -7) return `${Math.abs(diff)}d late`;
  if (diff > 0 && diff < 7) return `${diff}d`;
  return format(d, 'MMM d');
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
  chk: {
    width: 18,
    height: 18,
    borderWidth: 1.8,
    borderRadius: 5,
  },
  title: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
    color: lightTokens.colors.deepForest,
  },
  due: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    color: lightTokens.colors.warmGrey,
  },
});
