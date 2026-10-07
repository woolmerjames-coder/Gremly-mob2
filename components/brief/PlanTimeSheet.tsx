/**
 * Changing a time on a plan by hand (Daily brief in Chat): an item's start
 * and length, or a stretch of busy time the plan works around. Earlier and
 * Later move it by a quarter of an hour; the lengths are one tap.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Minus, Plus, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRIEF } from './briefStyles';
import { duration, spoken } from '../../lib/plan/planFlow';

export const LENGTHS = [15, 30, 45, 60, 90, 120];
const STEP = 15;

export type PlanTimeSheetProps = {
  visible: boolean;
  /** item: one of the plan's items. busy: a stretch they are not free */
  mode: 'item' | 'busy';
  /** The item's name (item mode) */
  name?: string;
  start: number;
  minutes: number;
  /** Nothing starts before this (the time now on today's plan) */
  earliest: number;
  onSave: (v: { start: number; minutes: number; title: string }) => void;
  /** Take the item out of the plan (item mode) */
  onRemove?: () => void;
  onClose: () => void;
};

export function PlanTimeSheet({
  visible,
  mode,
  name,
  start: start0,
  minutes: minutes0,
  earliest,
  onSave,
  onRemove,
  onClose,
}: PlanTimeSheetProps) {
  const insets = useSafeAreaInsets();
  const [start, setStart] = useState(start0);
  const [minutes, setMinutes] = useState(minutes0);
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (!visible) return;
    setStart(start0);
    setMinutes(minutes0);
    setTitle('');
  }, [visible, start0, minutes0]);
  const latest = 24 * 60 - minutes;
  const earlier = () => setStart((s) => Math.max(earliest, s - STEP));
  const later = () => setStart((s) => Math.min(latest, s + STEP));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} testID="plan-time-sheet">
        <View style={styles.grab} />
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={2}>
            {mode === 'busy' ? 'Add busy time' : name}
          </Text>
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={18} color={BRIEF.moss} />
          </TouchableOpacity>
        </View>

        {mode === 'busy' ? (
          <View style={styles.field}>
            <Text style={styles.label}>What is it? (optional)</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Busy"
              placeholderTextColor={BRIEF.faint}
              style={styles.input}
              accessibilityLabel="What the busy time is"
              testID="plan-time-title"
            />
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Starts</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={[styles.step, start <= earliest && styles.off]}
              onPress={earlier}
              disabled={start <= earliest}
              accessibilityRole="button"
              accessibilityLabel="Earlier"
              testID="plan-time-earlier"
            >
              <Minus size={18} color={BRIEF.moss} />
            </TouchableOpacity>
            <Text style={styles.when} testID="plan-time-start">
              {`${spoken(start)} to ${spoken(start + minutes)}`}
            </Text>
            <TouchableOpacity
              style={[styles.step, start >= latest && styles.off]}
              onPress={later}
              disabled={start >= latest}
              accessibilityRole="button"
              accessibilityLabel="Later"
              testID="plan-time-later"
            >
              <Plus size={18} color={BRIEF.moss} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>How long</Text>
          <View style={styles.chips}>
            {LENGTHS.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.chip, minutes === m && styles.chipOn]}
                onPress={() => setMinutes(m)}
                accessibilityRole="button"
                accessibilityState={{ selected: minutes === m }}
                testID={`plan-time-length-${m}`}
              >
                <Text style={[styles.chipText, minutes === m && styles.chipTextOn]}>
                  {duration(m)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.save}
          onPress={() => onSave({ start, minutes, title: title.trim() || 'Busy' })}
          accessibilityRole="button"
          testID="plan-time-save"
        >
          <Text style={styles.saveText}>{mode === 'busy' ? 'Add to the day' : 'Save'}</Text>
        </TouchableOpacity>
        {mode === 'item' && onRemove ? (
          <TouchableOpacity
            style={styles.remove}
            onPress={onRemove}
            accessibilityRole="button"
            testID="plan-time-remove"
          >
            <Text style={styles.removeText}>Take it out of the plan</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(20, 30, 24, 0.32)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BRIEF.linen,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    gap: 14,
  },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(26,51,40,0.18)',
    marginTop: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  title: { flex: 1, fontFamily: 'PlusJakartaSans-Bold', fontSize: 19, color: BRIEF.mossInk },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRIEF.sageWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { gap: 8 },
  label: { fontFamily: 'Inter-Medium', fontSize: 13, color: BRIEF.muted },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRIEF.chipBorder,
    backgroundColor: BRIEF.white,
    paddingHorizontal: 12,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: BRIEF.mossInk,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: BRIEF.chipBorder,
    backgroundColor: BRIEF.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.35 },
  when: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: BRIEF.mossInk,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 64,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRIEF.chipBorder,
    backgroundColor: BRIEF.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: BRIEF.moss, borderColor: BRIEF.moss },
  chipText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: BRIEF.mossInk },
  chipTextOn: { color: BRIEF.white },
  save: {
    height: 50,
    borderRadius: 14,
    backgroundColor: BRIEF.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: BRIEF.white },
  remove: { alignItems: 'center', paddingVertical: 6 },
  removeText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: BRIEF.warn },
});
