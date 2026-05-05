// components/worlds/layouts/DomesticWorldLayout.tsx

import { View, Pressable, StyleSheet } from 'react-native';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { ArchetypeWorldHero } from '../ArchetypeWorldHero';
import { RecurringHabitsModule } from '../sections/RecurringHabitsModule';
import { UnfoldingSection } from '../sections/UnfoldingSection';
import { RecentSection } from '../sections/RecentSection';
import { useWorldDrops, useChaptersForWorld } from '../../../lib/store/worldsSelectors';
import { capitalizeVelocity } from './archetypeHelpers';
import type { World, Chapter } from '../../../lib/supabase/types';
import type { Todo } from '../../../lib/types';

interface DomesticWorldLayoutProps {
  world: World;
  currentChapter: Chapter | null;
}

export function DomesticWorldLayout({ world, currentChapter }: DomesticWorldLayoutProps) {
  const drops = useWorldDrops(world.id);
  const chapters = useChaptersForWorld(world.id);

  const itemCount =
    drops.todos.filter((t) => !t.completed_at && !t.archived).length +
    drops.habits.filter((h) => !h.archived).length +
    drops.notes.filter((n) => !n.archived).length;

  const chapterCount = chapters.length;
  const velocityLabel = capitalizeVelocity(world.signal_velocity_delta);
  const thirdClause = currentChapter
    ? `${chapterCount} chapter${chapterCount === 1 ? '' : 's'}`
    : 'no chapter';
  const statusLine = [velocityLabel, `${itemCount} items`, thirdClause].join(' \u00B7 ');

  const velocityDotColor = (() => {
    switch (world.signal_velocity_delta) {
      case 'growing':
        return lightTokens.colors.velocityDotGrowing;
      case 'stable':
        return lightTokens.colors.velocityDotSteady;
      case 'declining':
        return lightTokens.colors.velocityDotCooling;
      default:
        return lightTokens.colors.velocityDotDormant;
    }
  })();

  const openTodos = drops.todos
    .filter((t) => !t.completed_at && !t.archived)
    .sort((a, b) => {
      // blockers first
      const aBlocker = a.priority_kind === 'blocker' ? 0 : 1;
      const bBlocker = b.priority_kind === 'blocker' ? 0 : 1;
      if (aBlocker !== bBlocker) return aBlocker - bBlocker;
      // then due date asc, nulls last
      if (a.due_day && b.due_day) return a.due_day.localeCompare(b.due_day);
      if (a.due_day) return -1;
      if (b.due_day) return 1;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });

  return (
    <View>
      <ArchetypeWorldHero
        world={world}
        statusLine={statusLine}
        velocityDotColor={velocityDotColor}
      />

      {currentChapter ? (
        <UnfoldingSection chapter={currentChapter} worldId={world.id} />
      ) : (
        <DomesticNoChapterFrame />
      )}

      <RecurringHabitsModule worldId={world.id} />

      <DomesticNeedsYouSection worldId={world.id} openTodos={openTodos} />

      <RecentSection worldId={world.id} limit={1} />
    </View>
  );
}

// ─── NO OPEN CHAPTER dashed frame ────────────────────────────────────────────

function DomesticNoChapterFrame() {
  return (
    <View style={frameStyles.container}>
      {/* iOS renders dashed; Android may render solid (RN border style limitation) */}
      <View style={frameStyles.frame}>
        <Text style={frameStyles.frameLabel}>NO OPEN CHAPTER</Text>
        <Text style={frameStyles.frameBody}>
          Home doesn&apos;t have a story unfolding right now. Just daily life.
        </Text>
      </View>
    </View>
  );
}

const frameStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginBottom: 26 },
  frame: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: lightTokens.colors.dashedFrameBorder,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  frameLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    letterSpacing: 0.6,
    color: lightTokens.colors.dashedFrameLabel,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  frameBody: {
    fontSize: 14,
    color: lightTokens.colors.worldsInk,
    lineHeight: 20,
    fontFamily: 'Inter-Regular',
  },
});

// ─── NEEDS YOU section ───────────────────────────────────────────────────────

interface DomesticNeedsYouSectionProps {
  worldId: string;
  openTodos: Todo[];
}

function DomesticNeedsYouSection({ worldId, openTodos }: DomesticNeedsYouSectionProps) {
  if (openTodos.length === 0) return null;

  const visible = openTodos.slice(0, 3);
  const count = openTodos.length;

  return (
    <View style={needsYouStyles.container}>
      <View style={needsYouStyles.header}>
        <Text style={needsYouStyles.label}>NEEDS YOU \u00B7 {count}</Text>
      </View>

      {visible.map((todo, idx) => {
        const isLast = idx === visible.length - 1;
        return (
          <View key={todo.id} style={[needsYouStyles.row, !isLast && needsYouStyles.rowDivider]}>
            <View style={needsYouStyles.checkbox} />
            <Text style={needsYouStyles.rowLabel} numberOfLines={1}>
              {todo.name || todo.title || '(untitled)'}
            </Text>
          </View>
        );
      })}

      <Pressable
        style={needsYouStyles.seeAllWrap}
        onPress={() => console.log('[DomesticWorldLayout] see all todos', worldId)}
      >
        <Text style={needsYouStyles.seeAllText}>{'see all ' + count + ' \u2192'}</Text>
      </Pressable>
    </View>
  );
}

const needsYouStyles = StyleSheet.create({
  container: { marginBottom: 26, paddingHorizontal: 16 },
  header: {
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderRadius: 4,
    borderColor: lightTokens.colors.warmGrey,
    flexShrink: 0,
  },
  rowLabel: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 19,
    color: lightTokens.colors.worldsInk,
  },
  seeAllWrap: { marginTop: 12, paddingHorizontal: 2, paddingVertical: 4 },
  seeAllText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: lightTokens.colors.worldsInk,
  },
});
