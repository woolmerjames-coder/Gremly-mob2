import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendingUp } from 'lucide-react-native';
import type { V07Card, V07PatternBody } from '../../../../../lib/types';
import { v07 } from '../tokens';
import { SummaryCard, Eyebrow, Headline } from '../primitives';

interface PatternCardProps {
  card: V07Card;
}

export function PatternCard({ card }: PatternCardProps) {
  const body = card.body as V07PatternBody;

  return (
    <SummaryCard>
      {/* 1 — Eyebrow */}
      <Eyebrow
        label={card.eyebrow ?? ''}
        icon={<TrendingUp size={14} color={v07.color.moss} strokeWidth={2} />}
      />

      {/* 2 — Headline */}
      <Headline>{body.headline}</Headline>

      {/* 3 — Items list */}
      <View style={styles.itemsList}>
        {body.items.map((item, i) => (
          <View
            key={i}
            style={[styles.itemRow, i === 0 ? styles.itemRowFirst : styles.itemRowBordered]}
          >
            {/* Golden diamond tick */}
            <View style={styles.tick} />

            {/* Label + optional meta */}
            <View style={styles.itemText}>
              <Text style={styles.itemLabel}>{item.label}</Text>
              {item.meta ? <Text style={styles.itemMeta}>{item.meta}</Text> : null}
            </View>
          </View>
        ))}
      </View>

      {/* 4 — Footer */}
      {body.footer ? (
        <View style={styles.footerBox}>
          <Text style={styles.footerText}>{body.footer}</Text>
        </View>
      ) : null}
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  itemsList: {
    marginTop: 20,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 13,
  },
  itemRowFirst: {
    borderTopWidth: 0,
    paddingTop: 4,
  },
  itemRowBordered: {
    borderTopWidth: 1,
    borderTopColor: v07.color.hair,
  },
  tick: {
    width: 7,
    height: 7,
    borderRadius: 2,
    backgroundColor: v07.color.golden,
    marginTop: 6,
    transform: [{ rotate: '45deg' }],
  },
  itemText: {
    flex: 1,
  },
  itemLabel: {
    fontFamily: v07.font.uiSemiBold,
    fontSize: 13.5,
    fontWeight: '600',
    color: v07.color.ink,
    lineHeight: 19,
  },
  itemMeta: {
    fontFamily: v07.font.ui,
    fontSize: 11.5,
    color: v07.color.textFaint,
    marginTop: 3,
    lineHeight: 16,
  },
  footerBox: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: v07.color.sageSoft,
    borderRadius: 14,
  },
  footerText: {
    fontFamily: v07.font.ui,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 20,
    color: v07.color.mossDeep,
  },
});
