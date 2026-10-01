import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Keyboard,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CheckCircle } from 'lucide-react-native';
import { getDateService } from '../../lib/date/DateService';
import type { ClarificationWhen } from '../../lib/minddrop/clarification';
import { CLARIFY_CONFIRM_MS } from '../../lib/minddrop/popupTiming';

interface ClarificationOption {
  id: string;
  label: string;
  action: {
    bucket?: 'todo' | 'habit' | 'log';
    subtype?: string | null;
    target_date?: boolean;
    scheduled_date?: boolean;
    kind?: string | null;
    /** 'when': ask when it is before filing (date and optional time) */
    followUp?: 'when' | null;
  };
}

interface ClarificationPopupProps {
  visible: boolean;
  /** Question text from Phase 1.5 (null = still loading) */
  question: string | null;
  /** Options from Phase 1.5 (null or empty = still loading) */
  options: ClarificationOption[] | null;
  /** Original text the user dropped - shown for context */
  originalText?: string | null;
  /** `when` is set when the user answered "When is it?" after the option */
  onSelectOption: (optionId: string, when?: ClarificationWhen) => void | Promise<void>;
  onSkip: () => void;
  /** Just close the popup without triggering skip logic (used after selection) */
  onClose?: () => void;
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
  originalText,
  onSelectOption,
  onSkip,
  onClose,
  isSubmitting: _isSubmitting = false,
  successMessage = null,
}: ClarificationPopupProps) {
  // Use onClose if provided, otherwise fall back to onSkip for backwards compatibility
  const closePopup = onClose ?? onSkip;
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  // Free text input state
  const [freeText, setFreeText] = React.useState('');
  const [isTextInputFocused, setIsTextInputFocused] = React.useState(false);
  const [instantSuccess, setInstantSuccess] = React.useState(false);

  // "When is it?" step, shown after an answer that asks when (a booked appointment)
  const [whenOptionId, setWhenOptionId] = React.useState<string | null>(null);
  const [whenDate, setWhenDate] = React.useState<string | null>(null);
  const [whenTime, setWhenTime] = React.useState<string | null>(null);
  const [whenPicker, setWhenPicker] = React.useState<'date' | 'time' | null>(null);

  // Auto-detect loading state when Phase 1.5 hasn't completed yet
  // Options loading: question or options not ready
  const isOptionsLoading = !question || !options || options.length < 2;

  // Animation effect
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

  // Reset state when popup closes (separate effect to avoid React Compiler warning)
  useEffect(() => {
    if (!visible) {
      // Use microtask to avoid synchronous setState during render
      queueMicrotask(() => {
        setFreeText('');
        setIsTextInputFocused(false);
        setInstantSuccess(false);
        setWhenOptionId(null);
        setWhenDate(null);
        setWhenTime(null);
        setWhenPicker(null);
      });
    }
  }, [visible]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const finishSelection = (optionId: string, when?: ClarificationWhen) => {
    // Show instant success feedback
    setInstantSuccess(true);

    // Fire off the selection (will process in background)
    if (when) {
      onSelectOption(optionId, when);
    } else {
      onSelectOption(optionId);
    }

    // Dismiss popup after brief success display (just close, don't trigger skip logic)
    setTimeout(() => {
      setInstantSuccess(false);
      closePopup();
    }, CLARIFY_CONFIRM_MS);
  };

  const handleOptionPress = (optionId: string) => {
    console.log('[ClarificationPopup] Option pressed:', { optionId });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // An answer like "Yes, it's booked" asks when it is before filing
    const option = options?.find((o) => o.id === optionId);
    if (option?.action?.followUp === 'when') {
      setWhenOptionId(optionId);
      setWhenDate(null);
      setWhenTime(null);
      setWhenPicker(null);
      return;
    }

    finishSelection(optionId);
  };

  const handleFreeTextSubmit = () => {
    const trimmed = freeText.trim();
    if (trimmed.length < 2) return;

    console.log('[ClarificationPopup] Free text submitted:', { text: trimmed });
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Show instant success feedback
    setInstantSuccess(true);

    // Fire off the selection
    onSelectOption(`freetext:${trimmed}`);

    // Dismiss popup after brief success display (just close, don't trigger skip logic)
    setTimeout(() => {
      setInstantSuccess(false);
      closePopup();
    }, CLARIFY_CONFIRM_MS);
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

  // Instant success state - brief acknowledgment before dismissing
  if (visible && instantSuccess) {
    return (
      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.backdrop}>
          <Animated.View style={[styles.card, styles.successCard, animatedCardStyle]}>
            <View style={styles.successContainer}>
              <View style={styles.successIconContainer}>
                <CheckCircle size={48} color="#4A7C59" />
              </View>
              <Text style={styles.successText}>Great, on it</Text>
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  // Options loading state - Phase 1.5 hasn't completed yet.
  // Options arrive within the clarification timeout (worker or fixed fallback),
  // but the user must never be trapped here: tapping outside, the hardware back
  // button and "Close" all dismiss without resolving the item.
  if (visible && isOptionsLoading) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closePopup}
      >
        <Pressable
          style={styles.backdrop}
          onPress={closePopup}
          testID="clarification-loading-backdrop"
        >
          <Animated.View style={[styles.card, styles.loadingCard, animatedCardStyle]}>
            <ActivityIndicator size="small" color="#4A7C59" />
            <Text style={styles.loadingText}>Thinking...</Text>
            <Pressable
              style={({ pressed }) => [styles.skipButton, pressed && styles.skipButtonPressed]}
              onPress={closePopup}
              testID="clarification-loading-close"
            >
              <Text style={styles.skipText}>Close</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    );
  }

  // "When is it?" step: pick a day (today, tomorrow or any date) and
  // optionally a time. Save files it with that date; the second link files it
  // without one.
  if (visible && whenOptionId) {
    const dates = getDateService();
    const today = dates.today();
    const tomorrow = dates.tomorrow();
    const pickedOther = !!whenDate && whenDate !== today && whenDate !== tomorrow;
    const pickerValue =
      whenPicker === 'time'
        ? parseISO(`${whenDate || today}T${whenTime || '09:00'}`)
        : parseISO(whenDate || today);
    const renderChip = (label: string, selected: boolean, onPress: () => void, testID: string) => (
      <Pressable
        key={testID}
        testID={testID}
        style={({ pressed }) => [
          styles.chip,
          selected && styles.chipSelected,
          pressed && styles.optionButtonPressed,
        ]}
        onPress={onPress}
      >
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
      </Pressable>
    );

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setWhenOptionId(null)}
      >
        <View style={styles.backdrop}>
          <Animated.View style={[styles.card, animatedCardStyle]} testID="clarification-when-step">
            <Text style={styles.question}>When is it?</Text>

            <View style={styles.chipRow}>
              {renderChip(
                'Today',
                whenDate === today,
                () => {
                  setWhenDate(today);
                  setWhenPicker(null);
                },
                'clarification-when-today',
              )}
              {renderChip(
                'Tomorrow',
                whenDate === tomorrow,
                () => {
                  setWhenDate(tomorrow);
                  setWhenPicker(null);
                },
                'clarification-when-tomorrow',
              )}
              {renderChip(
                pickedOther && whenDate ? format(parseISO(whenDate), 'EEE d MMM') : 'Pick a date',
                pickedOther,
                () => setWhenPicker('date'),
                'clarification-when-pick-date',
              )}
            </View>

            <View style={styles.chipRow}>
              {renderChip(
                whenTime
                  ? format(parseISO(`${today}T${whenTime}`), 'h:mm a')
                  : 'Add a time (optional)',
                !!whenTime,
                () => setWhenPicker('time'),
                'clarification-when-pick-time',
              )}
            </View>

            {whenPicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  testID="clarification-when-picker"
                  value={pickerValue}
                  mode={whenPicker}
                  display={
                    Platform.OS === 'ios'
                      ? whenPicker === 'date'
                        ? 'inline'
                        : 'spinner'
                      : 'default'
                  }
                  onChange={(event, picked) => {
                    const kind = whenPicker;
                    // Android shows a dialog that closes itself; the iOS
                    // calendar closes once a day is picked.
                    if (Platform.OS !== 'ios' || kind === 'date') setWhenPicker(null);
                    if (event.type !== 'set' || !picked) return;
                    if (kind === 'date') setWhenDate(format(picked, 'yyyy-MM-dd'));
                    else setWhenTime(format(picked, 'HH:mm'));
                  }}
                />
                {Platform.OS === 'ios' && whenPicker === 'time' && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.skipButton,
                      pressed && styles.skipButtonPressed,
                    ]}
                    onPress={() => setWhenPicker(null)}
                  >
                    <Text style={styles.skipText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            <Pressable
              testID="clarification-when-save"
              disabled={!whenDate}
              style={({ pressed }) => [
                styles.saveButton,
                !whenDate && styles.saveButtonDisabled,
                pressed && styles.optionButtonPressed,
              ]}
              onPress={() => {
                if (!whenDate) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                finishSelection(whenOptionId, { date: whenDate, time: whenTime });
              }}
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>

            <Pressable
              testID="clarification-when-later"
              style={({ pressed }) => [styles.skipButton, pressed && styles.skipButtonPressed]}
              onPress={() => finishSelection(whenOptionId)}
            >
              <Text style={styles.skipText}>I'll add it later</Text>
            </Pressable>
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
      {/* Tapping outside closes it without answering (the question stays on the
          card); while typing, the first tap only puts the keyboard away */}
      <Pressable
        style={styles.backdrop}
        onPress={() => (isTextInputFocused ? Keyboard.dismiss() : closePopup())}
        testID="clarification-backdrop"
      >
        <Animated.View style={[styles.card, animatedCardStyle]}>
          {/* Taps on the card itself stay on the card */}
          <Pressable onPress={Keyboard.dismiss} style={styles.cardInner}>
            {/* Show original drop text for context */}
            {originalText && (
              <View style={styles.originalTextContainer}>
                <Text style={styles.originalTextLabel}>You dropped:</Text>
                <Text style={styles.originalText}>"{originalText}"</Text>
              </View>
            )}

            <Text style={styles.question}>{question}</Text>

            <View style={styles.optionsContainer}>
              {options?.map((option) => (
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

            {/* Free text input */}
            <View style={styles.freeTextContainer}>
              <TextInput
                style={[styles.freeTextInput, isTextInputFocused && styles.freeTextInputFocused]}
                placeholder="Or explain more..."
                placeholderTextColor="#9CA39C"
                value={freeText}
                onChangeText={setFreeText}
                onFocus={() => setIsTextInputFocused(true)}
                onBlur={() => setIsTextInputFocused(false)}
                onSubmitEditing={handleFreeTextSubmit}
                returnKeyType="done"
                maxLength={200}
                multiline={false}
              />
              {freeText.trim().length >= 2 && (
                <Pressable
                  style={({ pressed }) => [
                    styles.freeTextSubmit,
                    pressed && styles.freeTextSubmitPressed,
                  ]}
                  onPress={handleFreeTextSubmit}
                >
                  <Text style={styles.freeTextSubmitText}>Go</Text>
                </Pressable>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [styles.skipButton, pressed && styles.skipButtonPressed]}
              onPress={handleSkipPress}
            >
              <Text style={styles.skipText}>Skip for now</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
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
  cardInner: {
    width: '100%',
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
  originalTextContainer: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(142, 156, 142, 0.2)',
  },
  originalTextLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: '#8A8F8A',
    textAlign: 'center',
    marginBottom: 4,
    fontFamily: 'Inter-Regular',
  },
  originalText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2E3A2E',
    textAlign: 'center',
    fontFamily: 'Inter-Medium',
    fontStyle: 'italic',
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
  freeTextContainer: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  freeTextInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: 'rgba(142, 156, 142, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#2E3A2E',
    backgroundColor: 'rgba(250, 252, 250, 0.8)',
  },
  freeTextInputFocused: {
    borderColor: '#4A7C59',
    backgroundColor: '#FFFFFF',
  },
  freeTextSubmit: {
    height: 40,
    paddingHorizontal: 16,
    backgroundColor: '#4A7C59',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  freeTextSubmitPressed: {
    opacity: 0.8,
  },
  freeTextSubmitText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(191, 216, 192, 0.35)',
  },
  chipSelected: {
    backgroundColor: '#4A7C59',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2E5540',
    fontFamily: 'Inter-Medium',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  pickerContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  saveButton: {
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4A7C59',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
  },
});

export default ClarificationPopup;
