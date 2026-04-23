import { View, Pressable, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { ModuleSection } from './ModuleSection';
import { useWorldDrops } from '../../../lib/store/worldsSelectors';
import { useUnifiedOverlayController } from '../../../hooks/useUnifiedOverlayController';
import type { WorldModuleProps } from './types';
import type { Note } from '../../../lib/types';

const CAP = 4;

export function RecentThoughtsModule({ world }: WorldModuleProps) {
  const { openEdit } = useUnifiedOverlayController();
  const drops = useWorldDrops(world.id);
  const thoughts = drops.notes.filter((n) => n.subtype !== 'journal');
  if (thoughts.length === 0) return null;

  const sorted = [...thoughts].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  );
  const visible = sorted.slice(0, CAP);
  // TODO(4a.5): navigate to all-thoughts-for-world view
  const onSeeAll = undefined;

  return (
    <ModuleSection label={`RECENT THOUGHTS \u00B7 ${thoughts.length}`} seeAllOnPress={onSeeAll}>
      {visible.map((n) => (
        <ThoughtCard key={n.id} note={n} onPress={() => openEdit({ record: n })} />
      ))}
    </ModuleSection>
  );
}

interface ThoughtCardProps {
  note: Note;
  onPress: () => void;
}

function ThoughtCard({ note, onPress }: ThoughtCardProps) {
  const title = note.title?.trim() || firstLine(note.body);
  const meta = resolveMeta(note);
  return (
    <Pressable onPress={onPress} style={styles.card} testID={`thought-card-${note.id}`}>
      <Text style={styles.title} numberOfLines={2}>
        {title || 'untitled'}
      </Text>
      <Text style={styles.meta}>{meta}</Text>
    </Pressable>
  );
}

function firstLine(body: string | null | undefined): string {
  if (!body) return '';
  const line = body.split('\n')[0];
  if (line.length <= 80) return line;
  return line.slice(0, 78).trim() + '\u2026';
}

function resolveMeta(note: Note): string {
  const parts: string[] = [];
  if (note.created_at) parts.push(format(new Date(note.created_at), 'MMM d'));
  if (note.subtype) parts.push(note.subtype);
  return parts.join(' \u00B7 ');
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 5,
    padding: 11,
    paddingHorizontal: 13,
    backgroundColor: lightTokens.colors.oatCard,
    borderWidth: 1,
    borderColor: lightTokens.colors.oatCardBorder,
    borderRadius: 12,
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    letterSpacing: -0.1,
    color: lightTokens.colors.worldsInk,
  },
  meta: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: lightTokens.colors.warmGrey,
    marginTop: 3,
  },
});
