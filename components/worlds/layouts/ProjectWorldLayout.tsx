// components/worlds/layouts/ProjectWorldLayout.tsx

import { View, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { differenceInCalendarDays } from 'date-fns';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { ArchetypeWorldHero } from '../ArchetypeWorldHero';
import { AlsoOpenModule } from '../sections/AlsoOpenModule';
import {
  useWorldDrops,
  useRecentDropsForWorld,
  useBlockerCountForChapter,
} from '../../../lib/store/worldsSelectors';
import { resolveChapterPhases } from '../../../lib/worlds/chapterDisplay';
import { getDateService } from '../../../lib/date';
import { capitalizeVelocity, resolveProjectVelocityDotColor } from './archetypeHelpers';
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

  const velocityDotColor = resolveProjectVelocityDotColor(world.signal_velocity_delta);

  return (
    <View>
      <ArchetypeWorldHero
        world={world}
        accentColor={lightTokens.colors.velocityDotGrowing}
        velocityDotColor={velocityDotColor}
        statusLine={statusLine}
        underlineColor={lightTokens.colors.summaryUnderlineProject}
      />

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
  const phase = resolveChapterPhases(chapter);
  const progressFraction =
    phase.segments.length > 0 ? phase.segments.filter(Boolean).length / phase.segments.length : 0;

  const dayLine = buildPhaseDayLine(chapter, phase.label);

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

        {/* Phase + day line */}
        <Text style={unfoldingStyles.phaseLine}>{dayLine}</Text>

        {/* Phase progress bar */}
        <View style={unfoldingStyles.progressBarOuter}>
          <View
            style={[
              unfoldingStyles.progressBarInner,
              { width: `${Math.round(progressFraction * 100)}%` },
            ]}
          />
        </View>
      </Pressable>
    </View>
  );
}

function buildPhaseDayLine(chapter: Chapter, phaseLabel: string): string {
  const now = getDateService().now();
  const dayNumber = chapter.start_date
    ? Math.max(differenceInCalendarDays(now, new Date(chapter.start_date)), 0) + 1
    : null;
  const dayClause = dayNumber !== null ? `Day ${dayNumber}` : null;
  return [phaseLabel, dayClause].filter(Boolean).join(' \u00B7 ');
}

const unfoldingStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 26,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  card: {
    backgroundColor: lightTokens.colors.worldsCard,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderLeftColor: lightTokens.colors.velocityDotGrowing,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 3,
  },
  chapterTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '500',
    color: lightTokens.colors.worldsInk,
    flex: 1,
    marginRight: 8,
  },
  blockerPill: {
    backgroundColor: lightTokens.colors.blockerRedBg,
    borderWidth: 1,
    borderColor: lightTokens.colors.blockerRedBorder,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  blockerPillText: {
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    color: lightTokens.colors.blockerRed,
  },
  phaseLine: {
    fontSize: 10,
    color: lightTokens.colors.warmGrey,
    marginBottom: 10,
    fontFamily: 'Inter-Regular',
  },
  progressBarOuter: {
    height: 3,
    backgroundColor: lightTokens.colors.outcomeAccentSoft,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarInner: {
    height: 3,
    backgroundColor: lightTokens.colors.outcomeAccent,
    borderRadius: 2,
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
          ? { id: ref.drop_id, label: t.name || t.title || '(untitled)', type: 'todo' as const }
          : null;
      }
      if (ref.drop_type === 'habit') {
        const h = drops.habits.find((x) => x.id === ref.drop_id);
        return h ? { id: ref.drop_id, label: h.name, type: 'habit' as const } : null;
      }
      if (ref.drop_type === 'note') {
        const n = drops.notes.find((x) => x.id === ref.drop_id);
        return n
          ? {
              id: ref.drop_id,
              label: n.title || n.body?.slice(0, 40) || '(note)',
              type: 'note' as const,
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
        const isLast = idx === recentDrops.length - 1;
        return (
          <View key={drop.id} style={[recentStyles.row, !isLast && recentStyles.rowDivider]}>
            <Text style={recentStyles.rowLabel} numberOfLines={1}>
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
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  row: {
    paddingVertical: 7,
    paddingHorizontal: 2,
    flexDirection: 'row',
    gap: 10,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  rowLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: lightTokens.colors.worldsInk,
    flex: 1,
  },
});
