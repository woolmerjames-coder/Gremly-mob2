import { View, Pressable, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { ModuleSection } from './ModuleSection';
import { useWorldDrops, useWorldPalette } from '../../../lib/store/worldsSelectors';
import type { WorldModuleProps } from './types';
import type { Note } from '../../../lib/types';

const CAP = 6;

export function ReflectionTimelineModule({ world }: WorldModuleProps) {
  const drops = useWorldDrops(world.id);
  const palette = useWorldPalette(world.id);
  const journals = drops.notes.filter((n) => n.subtype === 'journal');
  if (journals.length === 0) return null;

  const sorted = [...journals].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  );
  const visible = sorted.slice(0, CAP);
  const onSeeAll =
    sorted.length > CAP
      ? () => console.log('[ReflectionTimelineModule] see all', world.id)
      : undefined;

  const grouped = groupByDay(visible);

  return (
    <ModuleSection label={`REFLECTIONS \u00B7 ${journals.length}`} seeAllOnPress={onSeeAll}>
      <View style={styles.rail}>
        <View style={[styles.line, { backgroundColor: palette.dot + '33' }]} />
        {grouped.map((group) => (
          <View key={group.dateKey} style={styles.group}>
            <View style={styles.dateRow}>
              <View style={[styles.dot, { backgroundColor: palette.dot }]} />
              <Text style={styles.dateLabel}>{group.label}</Text>
            </View>
            {group.entries.map((n) => (
              <Pressable
                key={n.id}
                onPress={() => console.log('[ReflectionTimelineModule] tap', n.id)}
                style={styles.entry}
                testID={`reflection-entry-${n.id}`}
              >
                {n.title ? (
                  <Text style={styles.entryTitle} numberOfLines={1}>
                    {n.title}
                  </Text>
                ) : null}
                <Text style={styles.body} numberOfLines={3}>
                  {excerpt(n.body)}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </ModuleSection>
  );
}

interface Group {
  dateKey: string;
  label: string;
  entries: Note[];
}

function groupByDay(notes: Note[]): Group[] {
  const map = new Map<string, Group>();
  for (const n of notes) {
    const key = (n.created_at ?? '').slice(0, 10);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { dateKey: key, label: format(new Date(key), 'MMM d'), entries: [] });
    }
    map.get(key)!.entries.push(n);
  }
  return Array.from(map.values());
}

function excerpt(body: string | null | undefined): string {
  if (!body) return '';
  const clean = body.replace(/\s+/g, ' ').trim();
  if (clean.length <= 180) return clean;
  return clean.slice(0, 178).trim() + '\u2026';
}

const styles = StyleSheet.create({
  rail: {
    marginHorizontal: 16,
    paddingLeft: 18,
    position: 'relative',
  },
  line: {
    position: 'absolute',
    left: 22,
    top: 6,
    bottom: 6,
    width: 1,
    borderRadius: 1,
  },
  group: { marginBottom: 10 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    marginLeft: -8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginLeft: 8,
  },
  dateLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
  },
  entry: {
    marginLeft: 10,
    marginBottom: 6,
    padding: 11,
    paddingHorizontal: 13,
    backgroundColor: 'rgba(250,244,222,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(26,58,40,0.05)',
    borderRadius: 12,
  },
  entryTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
    color: lightTokens.colors.deepForest,
    marginBottom: 3,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 17,
    color: lightTokens.colors.deepForest,
    opacity: 0.65,
  },
});
