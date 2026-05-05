import { Pressable, StyleSheet } from 'react-native';
import { CalendarDays, CheckSquare, BookOpen } from 'lucide-react-native';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { ModuleSection } from './ModuleSection';
import { useUpcomingDatesForWorld } from '../../../lib/store/worldsSelectors';
import type { WorldModuleProps } from './types';
import type { UpcomingDate, UpcomingDateKind } from '../../../lib/worlds/upcomingDates';

const CAP = 5;

export function UpcomingDatesModule({ world }: WorldModuleProps) {
  const dates = useUpcomingDatesForWorld(world.id);
  if (dates.length === 0) return null;
  const visible = dates.slice(0, CAP);

  return (
    <ModuleSection
      label={`UPCOMING \u00b7 ${dates.length}`}
      seeAllOnPress={
        dates.length > CAP ? () => console.log('see all upcoming', world.id) : undefined
      }
    >
      {visible.map((d) => (
        <DateRow key={`${d.entityType}-${d.entityId}`} date={d} />
      ))}
    </ModuleSection>
  );
}

function DateRow({ date }: { date: UpcomingDate }) {
  return (
    <Pressable style={styles.row}>
      {iconFor(date.kind)}
      <Text style={styles.title} numberOfLines={1}>
        {date.title}
      </Text>
      <Text style={styles.label}>{date.label}</Text>
    </Pressable>
  );
}

function iconFor(kind: UpcomingDateKind) {
  const props = { size: 14, color: lightTokens.colors.worldsInkSoft } as const;
  switch (kind) {
    case 'chapter_end':
      return <BookOpen {...props} />;
    case 'todo_due':
      return <CheckSquare {...props} />;
    case 'note_event':
      return <CalendarDays {...props} />;
    case 'note_reminder':
      return <CalendarDays {...props} />;
  }
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: 16,
    marginBottom: 5,
    padding: 11,
    paddingHorizontal: 13,
    backgroundColor: lightTokens.colors.worldsCard,
    borderWidth: 1,
    borderColor: lightTokens.colors.worldsCardBorder,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
    color: lightTokens.colors.worldsInk,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    color: lightTokens.colors.worldsInkSoft,
  },
});
