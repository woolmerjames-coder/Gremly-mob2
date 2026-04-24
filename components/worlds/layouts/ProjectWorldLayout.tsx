// components/worlds/layouts/ProjectWorldLayout.tsx

import { View, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { ArchetypeWorldHero } from '../ArchetypeWorldHero';
import { AlsoOpenModule } from '../sections/AlsoOpenModule';
import { UnfoldingProgress } from './UnfoldingProgress';
import {
  useWorldDrops,
  useRecentDropsForWorld,
  useBlockerCountForChapter,
} from '../../../lib/store/worldsSelectors';
import { capitalizeVelocity, resolvePillColors } from './archetypeHelpers';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import type { World, Chapter } from '../../../lib/supabase/types';
import type { Todo, Habit, Note } from '../../../lib/types';

interface ProjectWorldLayoutProps {
  world: World;
  currentChapter: Chapter | null;
}

export function ProjectWorldLayout({ world, currentChapter }: ProjectWorldLayoutProps) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const drops = useWorldDrops(world.id);
  const blockerCount = useBlockerCountForChapter(currentChapter?.id ?? '');

  const itemCount =
    drops.todos.filter((t) => !t.completed_at && !t.archived).length +
    drops.habits.filter((h) => !h.archived).length +
    drops.notes.filter((n) => !n.archived).length;

  const velocityLabel = capitalizeVelocity(world.signal_velocity_delta);
  const blockerClause =
    blockerCount > 0 ? `${blockerCount} blocker${blockerCount === 1 ? '' : 's'}` : null;

  const statusParts = [velocityLabel, `${itemCount} items`];
  if (blockerClause) statusParts.push(blockerClause);
  const statusLine = statusParts.join(' \u00B7 ');

  const pillColors = resolvePillColors(world);

  return (
    <View>
      <ArchetypeWorldHero world={world} statusLine={statusLine} pillColors={pillColors} />

      {currentChapter ? (
        <ProjectUnfoldingSection
          chapter={currentChapter}
          blockerCount={blockerCount}
          onPress={() => nav.navigate('ChapterDetail', { chapterId: currentChapter.id })}
        />
      ) : null}

      <AlsoOpenModule
        worldId={world.id}
        onPressSeeAll={() => console.log('[ProjectWorldLayout] see all todos', world.id)}
        onPressTodo={() => {
          /* TODO(phaseC): navigate to todo */
        }}
      />

      <ProjectRecentSection worldId={world.id} drops={drops} />
    </View>
  );
}

// ─── UNFOLDING sub-component ─────────────────────────────────────────────────

interface ProjectUnfoldingSectionProps {
  chapter: Chapter;
  blockerCount: number;
  onPress: () => void;
}

function ProjectUnfoldingSection({ chapter, blockerCount, onPress }: ProjectUnfoldingSectionProps) {
  return (
    <View style={unfoldingStyles.container}>
      <Text style={unfoldingStyles.sectionLabel}>UNFOLDING</Text>
      <Pressable onPress={onPress} style={unfoldingStyles.card}>
        {/* Title + blocker pill */}
        <View style={unfoldingStyles.topRow}>
          <Text style={unfoldingStyles.chapterTitle} numberOfLines={2}>
            {chapter.title}
          </Text>
          {blockerCount > 0 ? (
            <View style={unfoldingStyles.blockerPill}>
              <Text style={unfoldingStyles.blockerPillText}>
                {blockerCount} blocker{blockerCount === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Arc-shape-aware progress bar + label */}
        <UnfoldingProgress chapter={chapter} />
      </Pressable>
    </View>
  );
}

const unfoldingStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.mossGreen,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  card: {
    backgroundColor: lightTokens.colors.worldsCard,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderLeftWidth: 4,
    borderLeftColor: lightTokens.colors.mossGreen,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  chapterTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    lineHeight: 22,
    color: lightTokens.colors.worldsInk,
    flex: 1,
    marginRight: 8,
  },
  blockerPill: {
    backgroundColor: lightTokens.colors.blockerRedBg,
    borderWidth: 1,
    borderColor: lightTokens.colors.blockerRedBorder,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  blockerPillText: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    color: lightTokens.colors.blockerRed,
    letterSpacing: 0.4,
  },
});

// ─── RECENT sub-component ────────────────────────────────────────────────────

interface ProjectRecentSectionProps {
  worldId: string;
  drops: { todos: Todo[]; habits: Habit[]; notes: Note[] };
}

function ProjectRecentSection({ worldId, drops }: ProjectRecentSectionProps) {
  const recentRefs = useRecentDropsForWorld(worldId, 2);

  const recentDrops = recentRefs
    .map((ref) => {
      if (ref.drop_type === 'todo') {
        const t = drops.todos.find((x) => x.id === ref.drop_id);
        return t
          ? {
              id: ref.drop_id,
              label: t.name || t.title || '(untitled)',
              type: 'todo' as const,
              created_at: t.created_at,
            }
          : null;
      }
      if (ref.drop_type === 'habit') {
        const h = drops.habits.find((x) => x.id === ref.drop_id);
        return h
          ? { id: ref.drop_id, label: h.name, type: 'habit' as const, created_at: h.created_at }
          : null;
      }
      if (ref.drop_type === 'note') {
        const n = drops.notes.find((x) => x.id === ref.drop_id);
        return n
          ? {
              id: ref.drop_id,
              label: n.title || n.body?.slice(0, 40) || '(note)',
              type: 'note' as const,
              created_at: n.created_at,
            }
          : null;
      }
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (recentDrops.length === 0) return null;

  return (
    <View style={recentStyles.container}>
      <Text style={recentStyles.sectionLabel}>RECENT</Text>
      {recentDrops.map((drop, idx) => {
        const formattedDate = drop.created_at
          ? format(new Date(drop.created_at), 'MMM d').toUpperCase()
          : '';
        if (!formattedDate) return null;
        const isLast = idx === recentDrops.length - 1;
        return (
          <View key={drop.id} style={[recentStyles.row, !isLast && recentStyles.rowDivider]}>
            <Text style={recentStyles.recentDate}>{formattedDate}</Text>
            <Text style={recentStyles.recentBody} numberOfLines={1}>
              {drop.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const recentStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 2,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  recentDate: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    fontWeight: '600',
    color: lightTokens.colors.warmGrey,
    minWidth: 44,
    letterSpacing: 0.4,
    marginTop: 1,
  },
  recentBody: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 19,
    color: lightTokens.colors.worldsInk,
  },
});
