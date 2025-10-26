import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, RADII, SPACE } from '../_tokens';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialTitle: string;
  onSubmit: (newTitle: string) => Promise<void>;
};

export default function RenameChatModal({ isOpen, onClose, initialTitle, onSubmit }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [submitting, setSubmitting] = useState(false);
  const opacity = useMemo(() => new Animated.Value(0), []);
  const y = useMemo(() => new Animated.Value(30), []);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: 30,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen, initialTitle, opacity, y]);

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (e) {
      console.error('Failed to rename chat:', e);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal visible={isOpen} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <BlurView intensity={8} style={StyleSheet.absoluteFill}>
          <View style={styles.backdrop} />
        </BlurView>
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View
            style={[
              styles.sheet,
              {
                opacity,
                transform: [{ translateY: y }],
              },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Rename Chat</Text>
            </View>
            <View style={styles.content}>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Chat title"
                placeholderTextColor="rgba(26,51,40,0.4)"
                autoFocus
                selectTextOnFocus
                editable={!submitting}
              />
            </View>
            <View style={styles.footer}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.btnSecondary, pressed && styles.btnPressed]}
                disabled={submitting}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                style={({ pressed }) => [
                  styles.btnPrimary,
                  pressed && styles.btnPressed,
                  submitting && styles.btnDisabled,
                ]}
                disabled={submitting || title.trim().length === 0}
              >
                <Text style={styles.btnPrimaryText}>{submitting ? 'Saving...' : 'Save'}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,51,40,0.08)',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '72%',
    backgroundColor: COLORS.Linen,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 5,
  },
  header: {
    paddingHorizontal: SPACE.md,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(46,85,64,0.12)',
  },
  headerTitle: {
    color: COLORS.Deep,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACE.md,
    paddingTop: 20,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.Sage,
    borderRadius: RADII.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.Deep,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: SPACE.md,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(46,85,64,0.12)',
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: RADII.card,
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: COLORS.Moss,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: COLORS.Moss,
    paddingVertical: 14,
    borderRadius: RADII.card,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: COLORS.Linen,
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ translateY: 1 }],
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
