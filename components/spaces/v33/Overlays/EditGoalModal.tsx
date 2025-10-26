import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, RADII, SPACE } from '../_tokens';
import type { AppRecord, Habit, Frequency, HabitSubtype } from '../../../../lib/types';
import { useRepo } from '../../../../providers/RepoProvider';

type Props = {
  visible: boolean;
  onClose: () => void;
  record: AppRecord; // Expected: Habit
  onSaved?: (updated: AppRecord) => void;
};

const FREQS: Frequency[] = ['daily', 'weekly', 'monthly'];
const TYPES: HabitSubtype[] = ['start_habit', 'break_habit', 'routine'];

export default function EditGoalModal({ visible, onClose, record, onSaved }: Props) {
  const repo = useRepo();
  const isHabit = record.type === 'habit';
  const [title, setTitle] = useState<string>(
    isHabit ? (record as Habit).name : (record as any).title || (record as any).name || '',
  );
  const [notes, setNotes] = useState<string>((record as any).notes || '');
  const [frequency, setFrequency] = useState<Frequency>(
    isHabit ? ((record as Habit).frequency as Frequency) : 'weekly',
  );
  const [subtype, setSubtype] = useState<HabitSubtype>(
    (isHabit ? (record as Habit).subtype : 'start_habit') as HabitSubtype,
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; visible: boolean }>({
    text: '',
    visible: false,
  });

  const y = useMemo(() => new Animated.Value(500), []);
  const opacity = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(y, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(y, {
          toValue: 500,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, y, opacity]);

  const handleSave = async () => {
    if (saving) return;
    try {
      setSaving(true);
      const patch: any = {};
      if (record.type === 'habit') {
        patch.name = title.trim();
        patch.frequency = frequency;
        patch.subtype = subtype;
        patch.notes = notes || null;
      } else if (record.type === 'todo') {
        patch.name = title.trim();
        patch.notes = notes || null;
      } else if (record.type === 'note') {
        patch.title = title.trim();
        patch.body = notes || null;
      }
      const updated = await repo.update({ id: record.id, patch });
      setToast({ text: `Updated your goal — ${frequency}`, visible: true });
      onSaved?.(updated);
      setTimeout(() => {
        setToast({ text: '', visible: false });
        onClose();
      }, 1200);
    } catch (e) {
      // Fallback: just close, we can enhance with error UI later
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" />
      </Animated.View>
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: y }] }]}
        accessibilityLabel="Edit goal modal"
      >
        <BlurView intensity={8} style={StyleSheet.absoluteFill} tint="dark" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(26,51,40,0.6)' }]} />

        <View style={styles.header}>
          <Text style={styles.headerTitle}>Adjust your rhythm</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {/* Title */}
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Run 3x per week"
            placeholderTextColor="rgba(249,246,241,0.6)"
            value={title}
            onChangeText={setTitle}
          />

          {/* Type */}
          <Text style={[styles.label, { marginTop: SPACE.md }]}>Type</Text>
          <View style={styles.segmentRow}>
            {TYPES.map((t) => (
              <TouchableOpacity key={t} onPress={() => setSubtype(t)} accessibilityRole="button">
                <View style={[styles.segment, subtype === t && styles.segmentActive]}>
                  <Text style={[styles.segmentText, subtype === t && styles.segmentTextActive]}>
                    {t === 'start_habit' ? 'Start' : t === 'break_habit' ? 'Break' : 'Routine'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Frequency */}
          <Text style={[styles.label, { marginTop: SPACE.md }]}>Frequency</Text>
          <View style={styles.segmentRow}>
            {FREQS.map((f) => (
              <TouchableOpacity key={f} onPress={() => setFrequency(f)} accessibilityRole="button">
                <View style={[styles.segment, frequency === f && styles.segmentActive]}>
                  <Text style={[styles.segmentText, frequency === f && styles.segmentTextActive]}>
                    {f}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Notes */}
          <Text style={[styles.label, { marginTop: SPACE.md }]}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Any details to remember"
            placeholderTextColor="rgba(249,246,241,0.6)"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} accessibilityRole="button" disabled={saving}>
            <View style={[styles.saveBtn, saving && { opacity: 0.7 }]}>
              <Text style={styles.saveText}>Save</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Toast */}
        {toast.visible && (
          <View style={styles.toast} accessibilityLiveRegion="polite">
            <Text style={styles.toastText}>{toast.text}</Text>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '80%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.lg,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(191,216,192,0.4)',
  },
  headerTitle: { color: COLORS.Linen, fontSize: 16, fontWeight: '700' },
  closeText: { color: COLORS.Sage, fontSize: 22, fontWeight: '700' },
  body: { paddingTop: SPACE.md },
  label: { color: COLORS.Linen, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(249,246,241,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(191,216,192,0.35)',
    borderRadius: RADII.card,
    color: COLORS.Linen,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textarea: { minHeight: 84, textAlignVertical: 'top' },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADII.btn,
    backgroundColor: 'rgba(249,246,241,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(191,216,192,0.35)',
  },
  segmentActive: { backgroundColor: 'rgba(191,216,192,0.25)' },
  segmentText: { color: 'rgba(249,246,241,0.8)', fontWeight: '600' },
  segmentTextActive: { color: COLORS.Linen },
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancelText: { color: COLORS.Sage, fontWeight: '700' },
  saveBtn: {
    backgroundColor: COLORS.Moss,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: RADII.btn,
  },
  saveText: { color: COLORS.Linen, fontWeight: '700' },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADII.card,
    backgroundColor: 'rgba(191,216,192,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(191,216,192,0.35)',
    alignItems: 'center',
  },
  toastText: { color: COLORS.Linen, fontWeight: '700' },
});
