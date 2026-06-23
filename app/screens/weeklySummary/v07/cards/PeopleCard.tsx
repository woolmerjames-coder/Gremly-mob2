import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Users } from 'lucide-react-native';
import type { V07Card, V07PeopleBody } from '../../../../../lib/types';
import { v07 } from '../tokens';
import { SummaryCard, Eyebrow, Headline } from '../primitives';

interface PeopleCardProps {
  card: V07Card;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Formats 'yyyy-mm-dd' as 'May 14'. day_of_week is a structured field and is not rendered as prose. */
function formatBeatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(day)) return dateStr;
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

export function PeopleCard({ card }: PeopleCardProps) {
  const body = card.body as V07PeopleBody;

  return (
    <SummaryCard>
      {/* 1 — Eyebrow */}
      <Eyebrow
        label={card.eyebrow ?? ''}
        icon={<Users size={14} color={v07.color.moss} strokeWidth={2} />}
      />

      {/* 2 — Headline (body-level) */}
      <Headline>{body.headline}</Headline>

      {/* 3 — People chips */}
      <View style={styles.chipsRow}>
        {body.people.map((person, i) => {
          const emphasized = !!person.emphasized;
          return (
            <View
              key={i}
              style={[styles.chip, emphasized ? styles.chipEmphasized : styles.chipDefault]}
            >
              {/* Avatar with initial */}
              <View
                style={[styles.avatar, emphasized ? styles.avatarEmphasized : styles.avatarDefault]}
              >
                <Text style={styles.avatarInitial}>{person.name[0]}</Text>
              </View>

              {/* Name + relationship */}
              <View>
                <Text style={[styles.chipName, emphasized && styles.chipNameEmphasized]}>
                  {person.name}
                </Text>
                {person.relationship ? (
                  <Text
                    style={[
                      styles.chipRelationship,
                      emphasized && styles.chipRelationshipEmphasized,
                    ]}
                  >
                    {person.relationship}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {/* 4 — Beats */}
      {body.beats && body.beats.length > 0 && (
        <View style={styles.beats}>
          {body.beats.map((beat, i) => (
            <View key={i} style={styles.beatRow}>
              {/* date as "May 14"; day_of_week field preserved in data but not rendered as prose */}
              <Text style={styles.beatDate}>{formatBeatDate(beat.date)}</Text>
              <Text style={styles.beatLabel}>{beat.label}</Text>
            </View>
          ))}
        </View>
      )}
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 20,
    marginBottom: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 22,
    paddingVertical: 7,
    paddingLeft: 8,
    paddingRight: 13,
  },
  chipDefault: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: v07.color.hair,
  },
  chipEmphasized: {
    backgroundColor: v07.color.moss,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDefault: {
    backgroundColor: v07.color.sageMist,
  },
  avatarEmphasized: {
    backgroundColor: v07.color.golden,
  },
  avatarInitial: {
    fontFamily: v07.font.uiBold,
    fontSize: 11,
    fontWeight: '700',
    color: v07.color.mossDeep,
  },
  chipName: {
    fontFamily: v07.font.uiSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: v07.color.ink,
  },
  chipNameEmphasized: {
    color: v07.color.linen,
  },
  chipRelationship: {
    fontFamily: v07.font.ui,
    fontSize: 11,
    color: v07.color.textFaint,
  },
  chipRelationshipEmphasized: {
    color: v07.color.sageMist,
  },

  // Beats
  beats: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: v07.color.hair,
    paddingTop: 16,
  },
  beatRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 7,
  },
  beatDate: {
    fontFamily: v07.font.uiBold,
    fontSize: 13,
    fontWeight: '700',
    color: v07.color.moss,
    minWidth: 64,
  },
  beatLabel: {
    fontFamily: v07.font.ui,
    fontSize: 13,
    color: v07.color.textSoft,
    lineHeight: 18,
    flex: 1,
  },
});
