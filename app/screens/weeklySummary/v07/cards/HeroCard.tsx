import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { V07Card, V07HeroBody, V07MoodCell } from '../../../../../lib/types';
import { v07 } from '../tokens';
import { SummaryCard, PhotoBacker, GremlyMascot } from '../primitives';

interface HeroCardProps {
  card: V07Card;
  /** Level shown on the mascot badge. Pass the level from the letter card's signature. */
  level?: number;
}

function MoodDot({ valence }: { valence: V07MoodCell['valence'] }) {
  const bg =
    valence === 'negative'
      ? v07.color.periwinkle
      : valence === 'positive'
        ? v07.color.golden
        : v07.color.hair;
  return <View style={[styles.moodDot, { backgroundColor: bg }]} />;
}

export function HeroCard({ card, level }: HeroCardProps) {
  const body = card.body as V07HeroBody;

  // Chunk stat_strip into rows of 2 for the grid.
  const statRows: (typeof body.stat_strip)[] = [];
  for (let i = 0; i < body.stat_strip.length; i += 2) {
    statRows.push(body.stat_strip.slice(i, i + 2));
  }

  return (
    <SummaryCard>
      {/* 1 — Photo banner */}
      <PhotoBacker imageUrl={body.image_url} tone="overcast" style={styles.banner} />

      {/* 2 — Mascot pulled up over the banner */}
      <View style={styles.mascotWrapper}>
        <GremlyMascot size={92} level={level} showLevel={level !== undefined} />
      </View>

      {/* 3 — Classification chip */}
      <View style={styles.chipRow}>
        <Text style={styles.chip}>{body.classification_chip}</Text>
      </View>

      {/* 4 — Headline */}
      {card.headline ? <Text style={styles.headline}>{card.headline}</Text> : null}

      {/* 5 — Subtitle */}
      <Text style={styles.subtitle}>{body.subtitle}</Text>

      {/* 6 — Mood arc */}
      <View style={styles.moodRow}>
        {body.mood_arc.map((cell, i) => (
          <View key={i} style={styles.moodCell}>
            <MoodDot valence={cell.valence} />
            {/* day_label is a pre-structured field like "M 18" — never parsed from prose */}
            <Text style={styles.moodLabel}>{cell.day_label}</Text>
          </View>
        ))}
      </View>

      {/* 7 — Stat strip grid */}
      <View style={styles.statGrid}>
        {statRows.map((row, ri) => (
          <View key={ri} style={styles.statRow}>
            {row.map((entry, ci) => (
              <View key={ci} style={styles.statCell}>
                <Text style={styles.statValue}>{entry.value}</Text>
                <Text style={styles.statLabel}>{entry.label}</Text>
              </View>
            ))}
            {/* Pad odd last row so the single cell fills correctly */}
            {row.length === 1 && <View style={styles.statCellEmpty} />}
          </View>
        ))}
      </View>
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  // Banner
  banner: {
    marginTop: -30,
    marginLeft: -26,
    marginRight: -26,
    marginBottom: 14,
    height: 118,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },

  // Mascot pulled up over the banner
  mascotWrapper: {
    marginTop: -78,
    alignSelf: 'center',
    borderWidth: 4,
    borderColor: v07.color.linen,
    borderRadius: 50,
    zIndex: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },

  // Classification chip
  chipRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  chip: {
    backgroundColor: v07.color.sageSoft,
    color: v07.color.moss,
    fontFamily: v07.font.uiBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },

  // Headline
  headline: {
    fontFamily: v07.font.displayMedium,
    fontWeight: '500',
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
    color: v07.color.mossDeep,
    textAlign: 'center',
  },

  // Subtitle
  subtitle: {
    fontFamily: v07.font.ui,
    fontSize: 14,
    lineHeight: 22,
    color: v07.color.textSoft,
    textAlign: 'center',
    marginTop: 14,
  },

  // Mood arc
  moodRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 22,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: v07.color.hair,
  },
  moodCell: {
    flex: 1,
    alignItems: 'center',
  },
  moodDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 7,
  },
  moodLabel: {
    fontFamily: v07.font.uiSemiBold,
    fontSize: 9.5,
    fontWeight: '600',
    color: v07.color.textFaint,
    textAlign: 'center',
  },

  // Stat strip grid
  statGrid: {
    marginTop: 22,
    backgroundColor: v07.color.hairSoft,
    borderRadius: 16,
    overflow: 'hidden',
    gap: 1,
  },
  statRow: {
    flexDirection: 'row',
    gap: 1,
  },
  statCell: {
    flex: 1,
    backgroundColor: v07.color.linen,
    padding: 14,
  },
  statCellEmpty: {
    flex: 1,
    backgroundColor: v07.color.linen,
  },
  statValue: {
    fontFamily: v07.font.displaySemiBold,
    fontSize: 24,
    fontWeight: '600',
    color: v07.color.moss,
    lineHeight: 24,
  },
  statLabel: {
    fontFamily: v07.font.ui,
    fontSize: 10.5,
    color: v07.color.textSoft,
    marginTop: 6,
    lineHeight: 14,
  },
});
