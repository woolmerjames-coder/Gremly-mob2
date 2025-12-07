/**
 * SpaceQuickAddModal - Modal for quick adding items to a Space
 * Large bottom sheet with input and submit button.
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
import { BRAND } from '../../design/brand';

// MindDrop header asset
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MINDDROP_HEADER = require('../../assets/minddrop_header-removebg.png');

interface SpaceQuickAddModalProps {
  visible: boolean;
  spaceName: string;
  onClose: () => void;
  /** Fire-and-forget submit - closes modal immediately, pipeline runs in background */
  onSubmit: (text: string) => void;
  onPressManualAdd: (text: string) => void;
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
    backgroundColor: BRAND.colors.mossGreen,
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

export function SpaceQuickAddModal({
  visible,
  spaceName,
  onClose,
  onSubmit,
  onPressManualAdd,
}: SpaceQuickAddModalProps) {
  const styles = useStyles();
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const wasVisible = useRef(visible);
  const isSubmittingRef = useRef(false);

  // Focus input when modal opens
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
    wasVisible.current = visible;
  }, [visible]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
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

    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    // Clear input and close modal immediately (fire-and-forget)
    const savedText = value;
    setText('');
    onClose();

    // Trigger the async pipeline in background
    onSubmit(savedText);
  };

  const handleManualAdd = () => {
    const currentText = text.trim();
    Keyboard.dismiss();
    onClose();
    onPressManualAdd(currentText);
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
                Adding to {spaceName}
              </Text>
            </View>

            <Box style={styles.inputContainer}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="What do you want to capture?"
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
