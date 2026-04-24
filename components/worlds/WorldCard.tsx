import { Pressable, View, StyleSheet, Image } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldPalette, useUpcomingDatesForWorld } from '../../lib/store/worldsSelectors';
import { resolveMascotAsset } from '../../lib/store/mascotRegistry';
import type { UpcomingDate } from '../../lib/worlds/upcomingDates';
import type { World } from '../../lib/supabase/types';

interface WorldCardProps {
  world: World;
  onPress: (worldId: string) => void;
}

export function WorldCard({ world, onPress }: WorldCardProps) {
  const palette = useWorldPalette(world.id);
  const upcoming = useUpcomingDatesForWorld(world.id);
  const name = world.display_name || world.name;
  const authoredSubtitle = world.card_subtitle?.trim() || null;
  const subtitle = authoredSubtitle ?? deriveSubtitle(world, upcoming);

  return (
    <Pressable
      onPress={() => onPress(world.id)}
      style={[styles.card, { backgroundColor: palette.tint }]}
      testID={`world-card-${world.id}`}
    >
      <View style={styles.topRow}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {name}
        </Text>
        <Image
          source={resolveMascotAsset(world.mascot_slug)}
          style={styles.mascot}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessibilityLabel=""
        />
      </View>
      {subtitle ? (
        <Text style={styles.sub} numberOfLines={3}>
          {subtitle}
        </Text>
      ) : null}
      <View style={styles.chevron}>
        <ChevronRight size={16} color={lightTokens.colors.worldsInkSoft} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

function deriveSubtitle(world: World, upcoming: UpcomingDate[]): string | null {
  // 1. Nearest chapter end within 14 days
  const chapterSoon = upcoming.find((u) => u.kind === 'chapter_end' && u.daysFromNow <= 14);
  if (chapterSoon) return `${chapterSoon.title.slice(0, 48)} ends ${chapterSoon.label}`;

  // 2. Nearest note event within 14 days
  const noteSoon = upcoming.find((u) => u.kind === 'note_event' && u.daysFromNow <= 14);
  if (noteSoon) return `${noteSoon.title.slice(0, 48)} ${noteSoon.label}`;

  // 3. Overdue todo
  const overdue = upcoming.find((u) => u.kind === 'todo_due' && u.daysFromNow < 0);
  if (overdue) return `${overdue.title.slice(0, 48)} ${overdue.label}`;

  // 4. Activity signal — drops/week if velocity is numeric and meaningful
  const vNum =
    typeof world.signal_velocity === 'number'
      ? world.signal_velocity
      : parseFloat(String(world.signal_velocity ?? ''));
  if (!isNaN(vNum) && vNum > 0) return `${vNum.toFixed(1)} drops/wk`;

  // 5. Hide
  return null;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    height: 140,
    overflow: 'hidden',
    position: 'relative',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  mascot: {
    width: 44,
    height: 44,
    flexShrink: 0,
  },
  name: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: lightTokens.colors.worldsInk,
    flex: 1,
    flexShrink: 1,
  },
  sub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 15,
    color: lightTokens.colors.worldsInkSoft,
    marginTop: 6,
  },
  chevron: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    opacity: 0.5,
  },
});
