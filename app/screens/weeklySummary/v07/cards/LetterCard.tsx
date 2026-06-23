import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { V07Card, V07LetterBody } from '../../../../../lib/types';
import { v07 } from '../tokens';
import { SummaryCard, GremlyMascot } from '../primitives';

interface LetterCardProps {
  card: V07Card;
}

export function LetterCard({ card }: LetterCardProps) {
  const body = card.body as V07LetterBody;

  return (
    <SummaryCard>
      {/* 1 — Lead label */}
      <Text style={styles.leadLabel}>A note from your Gremly</Text>

      {/* 2 — Paragraphs */}
      {body.paragraphs.map((para, i) => (
        <Text key={i} style={styles.paragraph}>
          {para.text}
        </Text>
      ))}

      {/* 3 — Letter close: mascot + signature */}
      <View style={styles.close}>
        <GremlyMascot size={78} showLevel={false} />
        <Text style={styles.signatureName}>{body.signature.name}</Text>
        <Text style={styles.signatureState}>
          Level {body.signature.level} · {body.signature.state}
        </Text>
      </View>
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  leadLabel: {
    fontFamily: v07.font.display,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: v07.color.goldenDeep,
    marginBottom: 16,
  },
  paragraph: {
    fontFamily: v07.font.display,
    fontSize: 15.5,
    lineHeight: 26,
    color: v07.color.mossDeep,
    marginBottom: 16,
  },
  close: {
    marginTop: 'auto',
    paddingTop: 22,
    borderTopWidth: 1,
    borderTopColor: v07.color.hair,
    alignItems: 'center',
  },
  signatureName: {
    fontFamily: v07.font.ui,
    fontSize: 14,
    fontWeight: '700',
    color: v07.color.moss,
    marginBottom: 0,
  },
  signatureState: {
    fontFamily: v07.font.ui,
    fontSize: 11.5,
    color: v07.color.textFaint,
    marginTop: 3,
  },
});
