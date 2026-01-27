import React, { useEffect } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CheckCircle } from 'lucide-react-native';

interface ClarificationOption {
  id: string;
  label: string;
  action: {
    bucket?: 'todo' | 'habit' | 'log';
    subtype?: string | null;
    target_date?: boolean;
    scheduled_date?: boolean;
  };
}

interface ClarificationPopupProps {
  visible: boolean;
  /** Question text from Phase 1.5 (null = still loading) */
  question: string | null;
  /** Options from Phase 1.5 (null or empty = still loading) */
  options: ClarificationOption[] | null;
  onSelectOption: (optionId: string) => void | Promise<void>;
  onSkip: () => void;
  /** Manual loading override (e.g., while submitting selection) */
  isSubmitting?: boolean;
  successMessage?: string | null;
}

/**
 * ClarificationPopup - A focused popup for clarifying ambiguous Mind Drop entries.
 *
 * Appears over the UnifiedOverlayV2 when an item needs clarification.
 * Presents a question with 2-3 options for the user to choose from.
 * Supports loading and success states for async operations.
 */
export function ClarificationPopup({
  visible,
  question,
  options,
  onSelectOption,
  onSkip,
  isSubmitting = false,
  successMessage = null,
}: ClarificationPopupProps) {
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  // Auto-detect loading state when Phase 1.5 hasn't completed yet
  // Options loading: question or options not ready
  const isOptionsLoading = !question || !options || options.length < 2;

  useEffect(() => {
    if (visible) {
      scale.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
      opacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      scale.value = 0.9;
      opacity.value = 0;
    }
  }, [visible, scale, opacity]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handleOptionPress = (optionId: string) => {
    console.log('[ClarificationPopup] Option pressed:', { optionId });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectOption(optionId);
  };

  const handleSkipPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSkip();
  };

  // Success state - show briefly with checkmark
  if (visible && successMessage) {
    return (
      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.backdrop}>
          <Animated.View style={[styles.card, styles.successCard, animatedCardStyle]}>
            <View style={styles.successContainer}>
              <View style={styles.successIconContainer}>
                <CheckCircle size={48} color="#4A7C59" />
              </View>
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  // Loading state - either waiting for Phase 1.5 options OR submitting selection
  if (visible && isSubmitting) {
    return (
      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.backdrop}>
          <Animated.View style={[styles.card, styles.loadingCard, animatedCardStyle]}>
            <ActivityIndicator size="small" color="#4A7C59" />
            <Text style={styles.loadingText}>Updating...</Text>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  // Options loading state - Phase 1.5 hasn't completed yet
  if (visible && isOptionsLoading) {
    return (
      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.backdrop}>
          <Animated.View style={[styles.card, styles.loadingCard, animatedCardStyle]}>
            <ActivityIndicator size="small" color="#4A7C59" />
            <Text style={styles.loadingText}>Thinking...</Text>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  // Normal state - show question and options
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onSkip}
    >
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, animatedCardStyle]}>
          <Text style={styles.question}>{question}</Text>

          <View style={styles.optionsContainer}>
            {options.map((option) => (
              <Pressable
                key={option.id}
                style={({ pressed }) => [
                  styles.optionButton,
                  pressed && styles.optionButtonPressed,
                ]}
                onPress={() => handleOptionPress(option.id)}
              >
                <Text style={styles.optionText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.skipButton, pressed && styles.skipButtonPressed]}
            onPress={handleSkipPress}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    maxWidth: 320,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingCard: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  successCard: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  successContainer: {
    alignItems: 'center',
    gap: 12,
  },
  successIconContainer: {
    marginBottom: 4,
  },
  successText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2E5540',
    textAlign: 'center',
    fontFamily: 'Inter-Medium',
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7B6B',
    textAlign: 'center',
    marginTop: 12,
    fontFamily: 'Inter-Medium',
  },
  question: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2E3A2E',
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: 'Inter-SemiBold',
  },
  optionsContainer: {
    gap: 12,
  },
  optionButton: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(191, 216, 192, 0.35)',
    borderRadius: 12,
  },
  optionButtonPressed: {
    opacity: 0.8,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2E5540',
    textAlign: 'center',
    fontFamily: 'Inter-Medium',
  },
  skipButton: {
    marginTop: 16,
    paddingVertical: 8,
  },
  skipButtonPressed: {
    opacity: 0.6,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#8A8F8A',
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
  },
});

export default ClarificationPopup;
