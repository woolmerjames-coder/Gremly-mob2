import { useState } from 'react';
import {
  Modal,
  View,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { Calendar, X } from 'lucide-react-native';
import { Text } from '../../ui';
import { lightTokens, colors } from '../../design/tokens';
import { today, getDateService } from '../../lib/date/DateService';
import { parseLocalYMD } from '../../lib/utils/dates';
import type { Chapter } from '../../lib/supabase/types';

interface ChapterDateEditSheetProps {
  visible: boolean;
  chapter: Chapter;
  onClose: () => void;
  onSave: (input: { startDate: string; endDate: string; reason: string | null }) => Promise<void>;
}

export function ChapterDateEditSheet({
  visible,
  chapter,
  onClose,
  onSave,
}: ChapterDateEditSheetProps) {
  const initialStart = chapter.start_date ?? today();
  const initialEnd = chapter.end_date ?? today();
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [reason, setReason] = useState('');
  const [pickerOpen, setPickerOpen] = useState<'start' | 'end' | null>(null);
  const [pendingPickerValue, setPendingPickerValue] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const startChanged = startDate !== chapter.start_date;
  const endChanged = endDate !== chapter.end_date;
  const hasChanges = startChanged || endChanged;

  function handleOpenPicker(which: 'start' | 'end') {
    const initial = which === 'start' ? parseLocalYMD(startDate) : parseLocalYMD(endDate);
    setPendingPickerValue(initial);
    setPickerOpen(which);
  }

  function handlePickerChange(event: DateTimePickerEvent, date: Date | undefined) {
    if (Platform.OS === 'android') {
      // Android uses a native dialog with its own OK/Cancel — handle inline
      setPickerOpen(null);
      if (event.type !== 'set' || !date) return;
      const iso = format(date, 'yyyy-MM-dd');
      if (pickerOpen === 'start') setStartDate(iso);
      if (pickerOpen === 'end') setEndDate(iso);
      return;
    }
    // iOS: stage the value, do not commit
    if (date) setPendingPickerValue(date);
  }

  function handlePickerDone() {
    if (pendingPickerValue) {
      const iso = format(pendingPickerValue, 'yyyy-MM-dd');
      if (pickerOpen === 'start') setStartDate(iso);
      if (pickerOpen === 'end') setEndDate(iso);
    }
    setPendingPickerValue(null);
    setPickerOpen(null);
  }

  function handlePickerCancel() {
    setPendingPickerValue(null);
    setPickerOpen(null);
  }

  async function handleSave() {
    if (parseLocalYMD(endDate) < parseLocalYMD(startDate)) {
      setValidationError('End date must be on or after the start date.');
      return;
    }
    setValidationError(null);
    setSaving(true);
    try {
      await onSave({ startDate, endDate, reason: reason.trim() || null });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const startDisplayOld = chapter.start_date
    ? format(parseLocalYMD(chapter.start_date), 'MMM d, yyyy')
    : '—';
  const startDisplayNew = format(parseLocalYMD(startDate), 'MMM d, yyyy');
  const endDisplayOld = chapter.end_date
    ? format(parseLocalYMD(chapter.end_date), 'MMM d, yyyy')
    : '—';
  const endDisplayNew = format(parseLocalYMD(endDate), 'MMM d, yyyy');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.head}>
            <Text style={styles.title}>Edit Dates</Text>
            <Pressable onPress={onClose} hitSlop={8} testID="edit-sheet-close">
              <X size={20} color={lightTokens.colors.warmGrey} />
            </Pressable>
          </View>

          {/* START DATE */}
          <View>
            <Text style={styles.fieldLabel}>START DATE</Text>
            <Pressable
              style={[styles.field, pickerOpen === 'start' && styles.fieldFocus]}
              onPress={() => handleOpenPicker('start')}
            >
              {startChanged ? (
                <View style={styles.diffRow}>
                  <Text style={styles.oldValue}>{startDisplayOld}</Text>
                  <Text style={styles.arrow}>→</Text>
                  <Text style={styles.newValue}>{startDisplayNew}</Text>
                </View>
              ) : (
                <Text style={styles.fieldValue}>{startDisplayNew}</Text>
              )}
              <Calendar size={16} color={lightTokens.colors.warmGrey} />
            </Pressable>
          </View>

          {/* END DATE */}
          <View>
            <Text style={styles.fieldLabel}>ENDS</Text>
            <Pressable
              style={[styles.field, pickerOpen === 'end' && styles.fieldFocus]}
              onPress={() => handleOpenPicker('end')}
            >
              {endChanged ? (
                <View style={styles.diffRow}>
                  <Text style={styles.oldValue}>{endDisplayOld}</Text>
                  <Text style={styles.arrow}>→</Text>
                  <Text style={styles.newValue}>{endDisplayNew}</Text>
                </View>
              ) : (
                <Text style={styles.fieldValue}>{endDisplayNew}</Text>
              )}
              <Calendar size={16} color={lightTokens.colors.warmGrey} />
            </Pressable>
          </View>

          {/* iOS: render picker inline above the keyboard with Done/Cancel */}
          {Platform.OS === 'ios' && pickerOpen !== null && (
            <View style={styles.pickerWrap}>
              <View style={styles.pickerHeader}>
                <Pressable onPress={handlePickerCancel} hitSlop={8}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handlePickerDone} hitSlop={8}>
                  <Text style={styles.pickerDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={pendingPickerValue ?? getDateService().now()}
                mode="date"
                display="spinner"
                onChange={handlePickerChange}
                textColor={lightTokens.colors.worldsInk}
              />
            </View>
          )}

          {/* Android: native dialog, handled by handlePickerChange */}
          {Platform.OS === 'android' && pickerOpen !== null && (
            <DateTimePicker
              value={pendingPickerValue ?? getDateService().now()}
              mode="date"
              display="default"
              onChange={handlePickerChange}
            />
          )}

          {validationError ? <Text style={styles.error}>{validationError}</Text> : null}

          {/* Reason */}
          <View>
            <Text style={styles.fieldLabel}>
              WHAT CHANGED? <Text style={styles.fieldLabelOptional}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.textarea}
              value={reason}
              onChangeText={setReason}
              placeholder="Note why the dates shifted…"
              placeholderTextColor={lightTokens.colors.warmGrey}
              multiline
              maxLength={300}
            />
          </View>

          {/* Buttons */}
          <View style={styles.buttons}>
            <Pressable style={styles.discardBtn} onPress={onClose}>
              <Text style={styles.discardText}>Discard</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!hasChanges || saving}
            >
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>

          <Text style={styles.footnote}>
            Saving marks these dates as user-set. AI won't overwrite them.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: lightTokens.colors.worldsCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: lightTokens.colors.worldsCardBorder,
    marginBottom: 8,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 18, color: lightTokens.colors.worldsInk },

  fieldLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: lightTokens.colors.warmGrey,
    marginTop: 4,
    marginBottom: 4,
  },
  fieldLabelOptional: {
    color: lightTokens.colors.warmGrey,
    fontWeight: '400',
    textTransform: 'none',
    letterSpacing: 0,
  },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.cream,
  },
  fieldFocus: { borderColor: lightTokens.colors.epigraphBorder, borderWidth: 1 },
  fieldValue: { fontFamily: 'Inter-Regular', fontSize: 15, color: lightTokens.colors.worldsInk },
  pickerWrap: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: colors.cream,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  pickerCancel: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: lightTokens.colors.warmGrey,
  },
  pickerDone: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    fontWeight: '500',
    color: lightTokens.colors.mossGreen,
  },
  diffRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1 },
  oldValue: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: lightTokens.colors.warmGrey,
    textDecorationLine: 'line-through',
  },
  arrow: { fontSize: 14, color: lightTokens.colors.warmGrey },
  newValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '500',
    color: lightTokens.colors.epigraphBorder,
  },
  textarea: {
    minHeight: 64,
    backgroundColor: colors.cream,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: lightTokens.colors.worldsInk,
    textAlignVertical: 'top',
  },
  error: { fontFamily: 'Inter-Regular', fontSize: 12, color: lightTokens.colors.blockerRed },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  discardBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: lightTokens.colors.worldsCardBorder,
  },
  discardText: { fontFamily: 'Inter-Medium', fontSize: 14, color: lightTokens.colors.warmGrey },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: lightTokens.colors.mossGreen,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { fontFamily: 'Inter-Medium', fontSize: 14, color: '#FFFFFF' },
  footnote: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: lightTokens.colors.warmGrey,
    textAlign: 'center',
    marginTop: 4,
  },
});
