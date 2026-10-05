/**
 * An item shown in the thread so it can be opened: the one Gremly's question
 * was about, after the answer is saved. He does not change the item himself
 * in this build, so it is one tap to open and fix by hand.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarCheck, CheckSquare, FileText, Repeat } from 'lucide-react-native';
import type { SweepItemMeta } from '../../lib/brief/types';
import { CARD_COPY, itemSub } from '../../lib/wrapup/words';
import { BRIEF } from '../brief/briefStyles';
import { wrapStyles } from './wrapStyles';

export function WrapItemCard({
  meta,
  onOpen,
}: {
  meta: SweepItemMeta;
  onOpen?: (item: SweepItemMeta['item']) => void;
}) {
  const { item } = meta;
  const Icon =
    item.kind === 'todo'
      ? CheckSquare
      : item.kind === 'habit'
        ? Repeat
        : item.when
          ? CalendarCheck
          : FileText;
  return (
    <View style={wrapStyles.card} testID="wrap-item">
      <View style={styles.head}>
        <View style={styles.icon}>
          <Icon size={16} color={BRIEF.moss} strokeWidth={2} />
        </View>
        <View style={wrapStyles.rowBody}>
          <Text style={wrapStyles.rowTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={wrapStyles.rowSub}>{itemSub(item.kind, item.when)}</Text>
        </View>
      </View>
      {onOpen ? (
        <View style={wrapStyles.actions}>
          <Pressable
            style={[wrapStyles.btn, wrapStyles.btnSecondary]}
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            testID="wrap-item-open"
          >
            <Text style={wrapStyles.btnText}>{CARD_COPY.itemOpen}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRIEF.sageWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
