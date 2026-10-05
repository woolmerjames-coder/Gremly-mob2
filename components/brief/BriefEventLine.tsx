/** One centred line in the thread, such as "Swept 7 things, 3 kept for today". */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Check, Inbox, Lock, Pencil } from 'lucide-react-native';
import type { BriefEventMeta } from '../../lib/brief/types';
import { BRIEF } from './briefStyles';

const ICONS = { sweep: Inbox, saved: Pencil, locked: Lock, moved: ArrowRight } as const;

export function BriefEventLine({ text, icon }: { text: string; icon?: BriefEventMeta['icon'] }) {
  // a clock time alone: a quiet divider where the evening starts
  if (icon === 'time') {
    return (
      <View style={styles.wrap} testID="brief-time">
        <Text style={styles.time}>{text}</Text>
      </View>
    );
  }
  const Icon = (icon && ICONS[icon]) || Check;
  return (
    <View style={styles.wrap} testID="brief-event">
      <View style={styles.pill}>
        <Icon size={14} color={BRIEF.moss} strokeWidth={2.2} />
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRIEF.sageWash,
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  text: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 12.5,
    color: BRIEF.moss,
  },
  time: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 11,
    letterSpacing: 0.4,
    color: BRIEF.faint,
    fontVariant: ['tabular-nums'],
  },
});
