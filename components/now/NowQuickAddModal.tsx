/**
 * NowQuickAddModal - Modal for quick adding items to Today's Focus
 * Large bottom sheet with MindDrop header, input, submit button, and manual add link
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
  onSubmit: (text: string) => Promise<{ success: boolean; error?: string }>;
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
  successButton: {
    backgroundColor: t.colors.mossGreen,
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const wasVisible = useRef(visible);

  // Focus input when modal opens, reset state when it closes
  useEffect(() => {
    if (visible && !wasVisible.current) {
      // Modal just opened
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
    wasVisible.current = visible;
  }, [visible]);

  // Reset state when modal opens (fresh state each time)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!visible) {
      // Schedule reset for next tick to avoid cascading renders
      const timeout = setTimeout(() => {
        setText('');
        setIsProcessing(false);
        setShowSuccess(false);
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!text.trim() || isProcessing) return;

    setIsProcessing(true);

    try {
      // Call the MindDrop pipeline
      const result = await onSubmit(text.trim());

      if (result.success) {
        // Show success state briefly before closing
        setShowSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        // On error, reset processing state but keep modal open
        console.error('[NowQuickAddModal] Submit failed:', result.error);
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('[NowQuickAddModal] Submit error:', error);
      setIsProcessing(false);
    }
  };

  const handleManualAdd = () => {
    Keyboard.dismiss();
    onClose();
    onPressManualAdd();
  };

  const getButtonText = () => {
    if (showSuccess) return '✓ Added!';
    if (isProcessing) return '✓ Organizing...';
    return 'Drop to Gremly →';
  };

  const isDisabled = !text.trim() || isProcessing;

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
                editable={!isProcessing}
              />
            </Box>

            <TouchableOpacity
              style={[
                styles.submitButton,
                isDisabled && styles.submitButtonDisabled,
                showSuccess && styles.successButton,
              ]}
              onPress={handleSubmit}
              disabled={isDisabled}
              activeOpacity={0.8}
            >
              <Text style={styles.submitButtonText}>{getButtonText()}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.manualAddLink}
              onPress={handleManualAdd}
              disabled={isProcessing}
            >
              <Text style={styles.manualAddText}>Prefer to add it manually?</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}
