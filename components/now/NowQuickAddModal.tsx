/**
 * NowQuickAddModal - Modal for quick adding items to Today's Focus
 * Large bottom sheet with MindDrop header, input, submit button, and manual add link
 *
 * Uses fire-and-forget pattern: closes immediately on submit, pipeline runs in background.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  View,
  Image,
} from 'react-native';
import { Box, Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';

// MindDrop header asset
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MINDDROP_HEADER = require('../../assets/minddrop_header-removebg.png');

interface NowQuickAddModalProps {
  visible: boolean;
  onClose: () => void;
  /** Fire-and-forget submit - closes modal immediately, pipeline runs in background */
  onSubmit: (text: string) => void;
  onPressManualAdd: () => void;
}

const useStyles = makeStyles((t) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: t.colors.surface,
    borderTopLeftRadius: t.radius[4],
    borderTopRightRadius: t.radius[4],
    paddingTop: t.spacing[4],
    paddingHorizontal: t.spacing[5],
    paddingBottom: t.spacing[7],
    minHeight: 420,
    ...t.elevation.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: t.spacing[2],
  },
  mindDropLogo: {
    width: 160,
    height: 40,
  },
  headerSubtitle: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: t.spacing[2],
  },
  inputContainer: {
    marginBottom: t.spacing[4],
  },
  input: {
    backgroundColor: t.colors.bg,
    borderRadius: t.radius[2],
    paddingVertical: t.spacing[4],
    paddingHorizontal: t.spacing[4],
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.text,
    minHeight: 112,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  submitButton: {
    backgroundColor: t.colors.mossGreen,
    paddingVertical: t.spacing[3],
    borderRadius: t.radius[2],
    alignItems: 'center',
    marginBottom: t.spacing[3],
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.medium,
    color: '#FFFFFF',
  },
  manualAddLink: {
    alignItems: 'center',
    paddingVertical: t.spacing[2],
  },
  manualAddText: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    textDecorationLine: 'underline',
  },
}));

export function NowQuickAddModal({
  visible,
  onClose,
  onSubmit,
  onPressManualAdd,
}: NowQuickAddModalProps) {
  const styles = useStyles();
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const wasVisible = useRef(visible);
  // Brief flag to prevent double-submit on fast taps
  const isSubmittingRef = useRef(false);

  // Focus input when modal opens
  useEffect(() => {
    if (visible && !wasVisible.current) {
      // Modal just opened
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
    wasVisible.current = visible;
  }, [visible]);

  // Reset state when modal closes
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!visible) {
      // Schedule reset for next tick to avoid cascading renders
      const timeout = setTimeout(() => {
        setText('');
        isSubmittingRef.current = false;
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [visible]);

  const handleSubmit = () => {
    const value = text.trim();
    if (!value) return;

    // Prevent double-submit
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    // Clear input and close modal immediately (fire-and-forget)
    setText('');
    onClose();

    // Trigger the async pipeline in background
    onSubmit(value);
  };

  const handleManualAdd = () => {
    Keyboard.dismiss();
    onClose();
    onPressManualAdd();
  };

  const isDisabled = !text.trim();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity
            style={styles.sheet}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.headerRow}>
              <Image source={MINDDROP_HEADER} style={styles.mindDropLogo} resizeMode="contain" />
              <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">
                Adding to Today's Focus
              </Text>
            </View>

            <Box style={styles.inputContainer}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="What's on your mind?"
                placeholderTextColor="#999999"
                value={text}
                onChangeText={setText}
                multiline
                maxLength={500}
              />
            </Box>

            <TouchableOpacity
              style={[styles.submitButton, isDisabled && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isDisabled}
              activeOpacity={0.8}
            >
              <Text style={styles.submitButtonText}>Drop to Gremly →</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.manualAddLink} onPress={handleManualAdd}>
              <Text style={styles.manualAddText}>Prefer to add it manually?</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}
