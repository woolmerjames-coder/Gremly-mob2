import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import type { V07Card, V07StatBody } from '../../../../../lib/types';
import { v07 } from '../tokens';
import { SummaryCard, Eyebrow } from '../primitives';

interface StatCardProps {
  card: V07Card;
}

export function StatCard({ card }: StatCardProps) {
  const body = card.body as V07StatBody;

  return (
    <SummaryCard center>
      {/* 1 — Eyebrow */}
      <Eyebrow
        label={card.eyebrow ?? ''}
        icon={<BarChart3 size={14} color={v07.color.moss} strokeWidth={2} />}
      />

      {/* 2 — Big number anchor */}
      <Text style={styles.number}>{body.number}</Text>

      {/* 3 — Unit label */}
      <Text style={styles.unit}>{body.unit}</Text>

      {/* 4 — Context sentence */}
      <Text style={styles.context}>{body.context}</Text>
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  number: {
    fontFamily: v07.font.display,
    fontWeight: '600',
    fontSize: 110,
    lineHeight: 99,
    letterSpacing: -3,
    color: v07.color.moss,
    textAlign: 'center',
  },
  unit: {
    fontFamily: v07.font.ui,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: v07.color.goldenDeep,
    marginTop: 6,
    textAlign: 'center',
  },
  context: {
    fontFamily: v07.font.ui,
    fontSize: 14,
    lineHeight: 22,
    color: v07.color.textSoft,
    marginTop: 22,
    maxWidth: 250,
    textAlign: 'center',
  },
});
