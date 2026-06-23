import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HelpCircle } from 'lucide-react-native';
import type { V07Card, V07QuestionBody } from '../../../../../lib/types';
import { v07 } from '../tokens';
import { SummaryCard, Eyebrow } from '../primitives';

interface QuestionCardProps {
  card: V07Card;
}

export function QuestionCard({ card }: QuestionCardProps) {
  const body = card.body as V07QuestionBody;

  return (
    <SummaryCard center>
      {/* 1 — Eyebrow */}
      <Eyebrow
        label={card.eyebrow ?? ''}
        icon={<HelpCircle size={14} color={v07.color.moss} strokeWidth={2} />}
      />

      {/* 2 — Question (visual anchor; no headline) */}
      <Text style={styles.question}>{body.question}</Text>

      {/* 3 — Grounding with periwinkle left border */}
      <View style={styles.groundingBorder}>
        <Text style={styles.grounding}>{body.grounding}</Text>
      </View>
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  question: {
    fontFamily: v07.font.display,
    fontWeight: '500',
    fontSize: 27,
    lineHeight: 35,
    letterSpacing: -0.27,
    color: v07.color.mossDeep,
    marginBottom: 22,
  },
  groundingBorder: {
    borderLeftWidth: 3,
    borderLeftColor: v07.color.periwinkle,
    paddingLeft: 16,
  },
  grounding: {
    fontFamily: v07.font.ui,
    fontSize: 13.5,
    lineHeight: 22,
    color: v07.color.textSoft,
  },
});
