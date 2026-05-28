import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { V07Card, V07MomentBody } from '../../../../../lib/types';
import { v07 } from '../tokens';
import { SummaryCard, PhotoBacker } from '../primitives';

interface MomentCardProps {
  card: V07Card;
}

export function MomentCard({ card }: MomentCardProps) {
  const body = card.body as V07MomentBody;

  return (
    <SummaryCard noPadding>
      {/* 2 — Full-bleed photo */}
      <PhotoBacker imageUrl={body.image_url} tone="reflective" style={styles.photoBacker} />

      {/* 3 — Dark-to-darker scrim */}
      <LinearGradient
        colors={['rgba(20,36,28,0.12)', 'rgba(20,36,28,0.34)', 'rgba(20,36,28,0.84)']}
        locations={[0, 0.42, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.scrim}
      />

      {/* 4 — Quote content pinned to the bottom */}
      <View style={styles.content}>
        {/* Opening quotation mark */}
        <Text style={styles.quoteGlyph}>{'\u201C'}</Text>

        {/* Verbatim journal quote */}
        <Text style={styles.quote}>{body.quote}</Text>

        {/* Attribution — date and context from the structured field; no weekday added */}
        <Text style={styles.attribution}>{body.attribution}</Text>
      </View>
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  photoBacker: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 30,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 30,
  },
  content: {
    position: 'relative',
    zIndex: 2,
    marginTop: 'auto',
    paddingTop: 30,
    paddingHorizontal: 26,
    paddingBottom: 28,
  },
  quoteGlyph: {
    fontFamily: v07.font.display,
    fontSize: 80,
    lineHeight: 40,
    color: 'rgba(191,216,192,0.65)',
    height: 38,
  },
  quote: {
    fontFamily: v07.font.displayItalic,
    fontWeight: '400',
    fontSize: 26,
    lineHeight: 36,
    color: v07.color.linen,
    marginTop: 8,
    marginBottom: 24,
  },
  attribution: {
    fontFamily: v07.font.uiSemiBold,
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.72)',
  },
});
