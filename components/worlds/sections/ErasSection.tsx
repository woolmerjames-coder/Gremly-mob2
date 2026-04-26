// components/worlds/sections/ErasSection.tsx
//
// ERAS section — closed chapters linked to this world, rendered as memoir cards.
// Each card shows the chapter title, a CLOSED tag, meta line (date range · duration
// · moments), and an optional epigraph quote. Returns null when there are no eras.

import { View, Pressable, StyleSheet } from 'react-native';
import { format, parseISO } from 'date-fns';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { useErasForWorld, type WorldEra } from '../../../lib/store/worldsSelectors';

const SERIF_FONT = 'Georgia';

interface ErasSectionProps {
  worldId: string;
  onPressEra?: (chapterId: string) => void;
}

export function ErasSection({ worldId, onPressEra }: ErasSectionProps) {
  const eras = useErasForWorld(worldId);
  if (eras.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>ERAS · {eras.length}</Text>
      {eras.map((era) => (
        <EraCard key={era.id} era={era} onPress={() => onPressEra?.(era.id)} />
      ))}
    </View>
  );
}

function EraCard({ era, onPress }: { era: WorldEra; onPress: () => void }) {
  const meta = buildMeta(era);

  return (
    <Pressable style={styles.card} onPress={onPress} testID={`era-card-${era.id}`}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {era.title}
        </Text>
        <View style={styles.closedTag}>
          <Text style={styles.closedTagText}>CLOSED</Text>
        </View>
      </View>
      {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}
      {era.epigraph ? (
        <Text style={styles.cardEpigraph} numberOfLines={3}>
          &ldquo;{era.epigraph}&rdquo;
        </Text>
      ) : null}
    </Pressable>
  );
}

function buildMeta(era: WorldEra): string | null {
  const parts: string[] = [];

  if (era.startDate && era.endDate) {
    const start = format(parseISO(era.startDate), 'MMM yyyy');
    const end = format(parseISO(era.endDate), 'MMM yyyy');
    parts.push(`${start} – ${end}`);
  } else if (era.endDate) {
    parts.push(`ended ${format(parseISO(era.endDate), 'MMM yyyy')}`);
  }

  if (era.durationDays != null && era.durationDays > 0) {
    parts.push(`${era.durationDays} days`);
  }

  if (era.momentCount > 0) {
    parts.push(`${era.momentCount} ${era.momentCount === 1 ? 'moment' : 'moments'}`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 26,
    paddingHorizontal: 16,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  card: {
    backgroundColor: lightTokens.colors.worldsCard,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: lightTokens.colors.worldsCardBorder,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontFamily: SERIF_FONT,
    fontSize: 16,
    lineHeight: 22,
    color: lightTokens.colors.worldsInk,
  },
  closedTag: {
    backgroundColor: lightTokens.colors.closedTagBg,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
    flexShrink: 0,
  },
  closedTagText: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: lightTokens.colors.closedTagFg,
    textTransform: 'uppercase',
  },
  cardMeta: {
    marginTop: 6,
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: lightTokens.colors.warmGrey,
  },
  cardEpigraph: {
    marginTop: 10,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: lightTokens.colors.epigraphBorder,
    fontFamily: SERIF_FONT,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 19,
    color: lightTokens.colors.worldsInkSoft,
  },
});
