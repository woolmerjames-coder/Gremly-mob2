// components/worlds/layouts/DomesticWorldLayout.tsx

import { View, Pressable, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { ArchetypeWorldHero } from '../ArchetypeWorldHero';
import { RecurringHabitsModule } from '../sections/RecurringHabitsModule';
import {
  useWorldDrops,
  useRecentDropsForWorld,
  useChaptersForWorld,
} from '../../../lib/store/worldsSelectors';
import { capitalizeVelocity, resolveDomesticVelocityDotColor } from './archetypeHelpers';
import type { World, Chapter } from '../../../lib/supabase/types';
import type { Todo, Habit, Note } from '../../../lib/types';

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

  const velocityDotColor = resolveDomesticVelocityDotColor(world.signal_velocity_delta);

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
        velocityDotColor={velocityDotColor}
        statusLine={statusLine}
      />

      {currentChapter ? (
        <DomesticUnfoldingSection chapter={currentChapter} />
      ) : (
        <DomesticNoChapterFrame />
      )}

      <RecurringHabitsModule
        worldId={world.id}
        onPressHabit={() => {
          /* TODO(phaseC): navigate to habit */
        }}
      />

      <DomesticNeedsYouSection worldId={world.id} openTodos={openTodos} />

      <DomesticRecentSection worldId={world.id} drops={drops} />
    </View>
  );
}

// ─── UNFOLDING (when domestic world has a chapter) ────────────────────────────

function DomesticUnfoldingSection({ chapter }: { chapter: Chapter }) {
  return (
    <View style={domesticUnfoldingStyles.container}>
      <Text style={domesticUnfoldingStyles.sectionLabel}>UNFOLDING</Text>
      <View style={domesticUnfoldingStyles.card}>
        <Text style={domesticUnfoldingStyles.chapterTitle} numberOfLines={2}>
          {chapter.title}
        </Text>
      </View>
    </View>
  );
}

const domesticUnfoldingStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginBottom: 32 },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  card: {
    backgroundColor: lightTokens.colors.worldsCard,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: lightTokens.colors.warmGrey,
  },
  chapterTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    lineHeight: 22,
    color: lightTokens.colors.worldsInk,
  },
});

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
  container: { paddingHorizontal: 16, marginBottom: 32 },
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
  container: { marginBottom: 32, paddingHorizontal: 16 },
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

// ─── RECENT section ──────────────────────────────────────────────────────────

interface DomesticRecentSectionProps {
  worldId: string;
  drops: { todos: Todo[]; habits: Habit[]; notes: Note[] };
}

function DomesticRecentSection({ worldId, drops }: DomesticRecentSectionProps) {
  const recentRefs = useRecentDropsForWorld(worldId, 1);

  const recentDrops = recentRefs
    .map((ref) => {
      if (ref.drop_type === 'todo') {
        const t = drops.todos.find((x) => x.id === ref.drop_id);
        return t
          ? { id: ref.drop_id, label: t.name || t.title || '(untitled)', created_at: t.created_at }
          : null;
      }
      if (ref.drop_type === 'habit') {
        const h = drops.habits.find((x) => x.id === ref.drop_id);
        return h ? { id: ref.drop_id, label: h.name, created_at: h.created_at } : null;
      }
      if (ref.drop_type === 'note') {
        const n = drops.notes.find((x) => x.id === ref.drop_id);
        return n
          ? {
              id: ref.drop_id,
              label: n.title || n.body?.slice(0, 40) || '(note)',
              created_at: n.created_at,
            }
          : null;
      }
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (recentDrops.length === 0) return null;

  return (
    <View style={domesticRecentStyles.container}>
      <Text style={domesticRecentStyles.sectionLabel}>RECENT</Text>
      {recentDrops.map((drop) => {
        const formattedDate = drop.created_at
          ? format(new Date(drop.created_at), 'MMM d').toUpperCase()
          : '';
        if (!formattedDate) return null;
        return (
          <View key={drop.id} style={domesticRecentStyles.row}>
            <Text style={domesticRecentStyles.recentDate}>{formattedDate}</Text>
            <Text style={domesticRecentStyles.recentBody} numberOfLines={1}>
              {drop.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const domesticRecentStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginBottom: 32 },
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
