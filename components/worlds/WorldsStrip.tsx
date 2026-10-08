/**
 * The row of Gremlys along the top of Worlds: one for each World, then New.
 */
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import type { World } from '../../lib/supabase/types';
import { F, W } from '../../lib/worlds/look';
import { worldGremly, worldName, worldTint } from '../../lib/worlds/model';
import { GremlyFace } from './GremlyFace';

export function WorldsStrip({
  worlds,
  revealId,
  onOpen,
  onNew,
}: {
  worlds: World[];
  /** A World just made: scroll along to it */
  revealId?: string | null;
  onOpen: (w: World) => void;
  onNew: () => void;
}) {
  const strip = useRef<ScrollView>(null);
  const has = !!revealId && worlds.some((w) => w.id === revealId);
  useEffect(() => {
    if (has) strip.current?.scrollToEnd({ animated: true });
  }, [has, revealId]);
  return (
    <ScrollView
      ref={strip}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.strip}
      testID="worlds-strip"
    >
      {worlds.map((w) => (
        <Pressable
          key={w.id}
          onPress={() => onOpen(w)}
          style={({ pressed }) => [styles.item, pressed && { transform: [{ scale: 0.96 }] }]}
          accessibilityRole="button"
          accessibilityLabel={`Open ${worldName(w)}`}
          testID={`world-${w.id}`}
        >
          <GremlyFace slug={worldGremly(w)} tint={worldTint(w)} size={50} />
          <Text style={styles.label} numberOfLines={2}>
            {worldName(w)}
          </Text>
        </Pressable>
      ))}
      <Pressable
        onPress={onNew}
        style={({ pressed }) => [styles.item, pressed && { transform: [{ scale: 0.96 }] }]}
        accessibilityRole="button"
        accessibilityLabel="Make a new World"
        testID="world-new"
      >
        <View style={styles.add}>
          <Plus size={20} color={W.moss} />
        </View>
        <Text style={[styles.label, { color: W.off }]}>New</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { marginHorizontal: -20, marginBottom: 10 },
  row: { paddingHorizontal: 20, paddingVertical: 3, gap: 6 },
  item: { width: 66, alignItems: 'center', gap: 5, paddingBottom: 4 },
  label: {
    width: 76,
    textAlign: 'center',
    fontFamily: F.bodyMedium,
    fontSize: 13,
    lineHeight: 15,
    color: W.forest,
  },
  add: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(46,85,64,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
