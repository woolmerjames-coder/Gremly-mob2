import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from '../../ui';
import { lightTokens, colors } from '../../design/tokens';
import type { Chapter } from '../../lib/supabase/types';

const TITLE_MAX_LENGTH = 80;

interface ChapterTitleEditSheetProps {
  visible: boolean;
  chapter: Chapter;
  onClose: () => void;
  onSave: (input: { title: string; reason: string | null }) => Promise<void>;
}

export function ChapterTitleEditSheet({
  visible,
  chapter,
  onClose,
  onSave,
}: ChapterTitleEditSheetProps) {
  const [title, setTitle] = useState(chapter.title ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset when the sheet opens with a different chapter
  useEffect(() => {
    if (visible) {
      setTitle(chapter.title ?? '');
      setReason('');
      setValidationError(null);
    }
  }, [visible, chapter.id, chapter.title]);

  const trimmed = title.trim();
  const titleChanged = trimmed !== (chapter.title ?? '').trim();
  const isValid = trimmed.length > 0 && trimmed.length <= TITLE_MAX_LENGTH;
  const canSave = titleChanged && isValid && !saving;
  const charCount = title.length;
  const charCountColor =
    charCount > TITLE_MAX_LENGTH ? lightTokens.colors.blockerRed : lightTokens.colors.warmGrey;

  function handleSave() {
    if (trimmed.length === 0) {
      setValidationError('Title cannot be empty.');
      return;
    }
    if (trimmed.length > TITLE_MAX_LENGTH) {
      setValidationError(`Title must be ${TITLE_MAX_LENGTH} characters or fewer.`);
      return;
    }
    setValidationError(null);
    setSaving(true);
    onSave({
      title: trimmed,
      reason: reason.trim().length > 0 ? reason.trim() : null,
    })
      .then(() => onClose())
      .catch((err: unknown) => {
        setValidationError(err instanceof Error ? err.message : 'Failed to save. Try again.');
      })
      .finally(() => setSaving(false));
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>Edit chapter title</Text>
            <Pressable onPress={onClose} hitSlop={8} testID="title-edit-close">
              <X size={20} color={lightTokens.colors.warmGrey} />
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>TITLE</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Chapter title"
            placeholderTextColor={lightTokens.colors.warmGrey}
            maxLength={TITLE_MAX_LENGTH + 20}
            autoFocus
            multiline
            testID="title-edit-input"
          />
          <Text style={[styles.charCount, { color: charCountColor }]}>
            {charCount} / {TITLE_MAX_LENGTH}
          </Text>

          <Text style={styles.fieldLabel}>
            WHAT CHANGED <Text style={styles.fieldLabelOptional}>— optional</Text>
          </Text>
          <TextInput
            style={styles.textarea}
            placeholder="e.g. Renamed to reflect the actual scope."
            placeholderTextColor={lightTokens.colors.warmGrey}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
            testID="title-edit-reason"
          />

          {validationError ? <Text style={styles.error}>{validationError}</Text> : null}

          <View style={styles.buttons}>
            <Pressable style={styles.discardBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.discardText}>Discard</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave}
              testID="title-edit-save"
            >
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save changes'}</Text>
            </Pressable>
          </View>

          <Text style={styles.footnote}>
            Your title will be locked in. Gremly may suggest alternatives later, but won't
            overwrite.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: lightTokens.colors.worldsCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: lightTokens.colors.worldsCardBorder,
    marginBottom: 8,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: lightTokens.colors.worldsInk,
  },
  fieldLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
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
  titleInput: {
    minHeight: 56,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: lightTokens.colors.worldsCardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.cream,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    color: lightTokens.colors.worldsInk,
    textAlignVertical: 'top',
  },
  charCount: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    textAlign: 'right',
    marginTop: -8,
    marginBottom: 6,
  },
  textarea: {
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: lightTokens.colors.worldsCardBorder,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.cream,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: lightTokens.colors.worldsInk,
    textAlignVertical: 'top',
  },
  error: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: lightTokens.colors.blockerRed,
  },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  discardBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: lightTokens.colors.worldsCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: lightTokens.colors.worldsCardBorder,
  },
  discardText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: lightTokens.colors.warmGrey,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: lightTokens.colors.mossGreen,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#FFFFFF',
  },
  footnote: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: lightTokens.colors.warmGrey,
    textAlign: 'center',
    marginTop: 4,
  },
});
