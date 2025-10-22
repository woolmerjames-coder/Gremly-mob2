import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Button } from '../../design-system/Button';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { cortexDecide } from '../../lib/cortex/cortexDecide';
import type { CortexContext, CortexAction } from '../../lib/cortex/cortexDecide';
import {
  explainAddedToList,
  explainCreated,
  explainFiledToSpace,
  explainAmbiguous,
} from '../../lib/cortex/explain';
import { ConfirmationPill } from '../../components/common/ConfirmationPill';

export const THINKING_DURATION = 1200;

type Mode = 'free' | 'guided';
export type ListStyle = 'none' | 'bullets' | 'numbers' | 'checklist';

export function nextPrefix(style: ListStyle, currentText: string): string {
  if (style === 'bullets') {
    return '• ';
  }

  if (style === 'checklist') {
    return '[ ] ';
  }

  if (style === 'numbers') {
    const trimmed = currentText.replace(/\n+$/, '');
    const lines = trimmed.length ? trimmed.split('\n') : [];
    const lastLine = lines[lines.length - 1] ?? '';
    const match = lastLine.match(/^(\d+)\.\s/);
    if (match) {
      return `${Number(match[1]) + 1}. `;
    }
    const count = lines.filter((line) => /^\d+\.\s/.test(line)).length + 1;
    return `${count}. `;
  }

  return '';
}

const LIST_TOOLBAR_OPTIONS: Array<{ key: ListStyle; label: string; testID: string }> = [
  { key: 'none', label: 'None', testID: 'ca-toolbar-list-none' },
  { key: 'bullets', label: 'Bullets', testID: 'ca-toolbar-list-bullets' },
  { key: 'numbers', label: 'Numbers', testID: 'ca-toolbar-list-numbers' },
  { key: 'checklist', label: 'Checklist', testID: 'ca-toolbar-list-checklist' },
];

const PLACEHOLDER_COLOR = '#B6A999';

export default function CatchAllNotepad(): React.JSX.Element {
  const repo = useRepo();
  const { userId } = useAuth();
  const [mode, setMode] = useState<Mode>('free');
  const [listStyle, setListStyle] = useState<ListStyle>('none');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [confirmations, setConfirmations] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const disabled = useMemo(() => !note.trim() || isSubmitting, [note, isSubmitting]);

  const modeDescription = useMemo(() => {
    return mode === 'free'
      ? 'Just a calm notepad. You can format with bullets, numbers, or checkboxes.'
      : 'Talk it out with Gremly — I’ll suggest structure and help file it.';
  }, [mode]);

  const handleModeSelect = useCallback((next: Mode) => {
    setMode(next);
  }, []);

  const handleToolbarSelect = useCallback((next: ListStyle) => {
    setListStyle(next);
  }, []);

  const resetState = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setNote('');
    setIsSubmitting(false);
    setIsThinking(false);
    setConfirmations([]);
    setSuggestions([]);
  }, []);

  const performSave = useCallback(async () => {
    try {
      const trimmed = note.trim();
      if (!trimmed) {
        resetState();
        return;
      }

      const currentUserId = userId || 'anonymous';

      // Phase 10.3: Call Cortex SDK for guided mode
      if (mode === 'guided') {
        try {
          const ctx: CortexContext = {
            lane: 'catchall',
            userId: currentUserId,
            activeSpaceId: null,
            uiSurface: 'overlay',
          };

          // Dev-only lane logging
          if (process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
            console.log(
              '[CORTEX] lane=%s space=%s msg=%s',
              ctx.lane,
              ctx.spaceId ?? '-',
              ctx.messageId ?? '-',
            );
          }

          const response = await cortexDecide({ text: trimmed }, ctx);

          // Log event (non-blocking)
          repo
            .writeEvent(
              'cortex_decision',
              {
                source: 'catchall',
                text: trimmed,
                actions: response.actions,
                confidence: response.confidence,
                mode: response.mode,
              },
              { userId: currentUserId },
            )
            .catch((err) => console.error('[CatchAllNotepad] Failed to log event:', err));

          if (response.mode === 'auto' && response.actions.length > 0) {
            // Execute actions in parallel
            const confirmationTexts: string[] = [];

            await Promise.all(
              response.actions.map(async (action: CortexAction) => {
                try {
                  if (action.type === 'add.to.list') {
                    const list = await repo.getOrCreateList(action.payload.listKey, {
                      userId: currentUserId,
                      spaceId: action.payload.spaceId ?? null,
                    });
                    await repo.addListItem(list.id, action.payload.item);
                    confirmationTexts.push(explainAddedToList(list.name, 'warm'));
                  } else if (action.type === 'create.todo') {
                    await repo.create({
                      type: 'todo',
                      name: action.payload.title,
                      title: action.payload.title,
                      due_date: action.payload.due ?? null,
                      undefined_due: !action.payload.due,
                      space_id: action.payload.spaceId ?? null,
                      ai_placed: true,
                      why_string: response.explanation,
                      origin: 'catchall',
                    });
                    confirmationTexts.push(explainCreated('todo', 'warm'));
                  } else if (action.type === 'create.habit') {
                    await repo.create({
                      type: 'habit',
                      name: action.payload.name,
                      frequency:
                        (action.payload.freq === 'custom' ? 'daily' : action.payload.freq) ||
                        'daily',
                      subtype: 'start_habit',
                      space_id: action.payload.spaceId ?? null,
                      ai_placed: true,
                      why_string: response.explanation,
                      origin: 'catchall',
                    });
                    confirmationTexts.push(explainCreated('habit', 'warm'));
                  } else if (action.type === 'create.note') {
                    await repo.create({
                      type: 'note',
                      title: action.payload.text || trimmed,
                      body: action.payload.text,
                      subtype: (action.payload.subtype as any) || 'note',
                      space_id: action.payload.spaceId ?? null,
                      ai_placed: true,
                      why_string: response.explanation,
                      origin: 'catchall',
                    });
                    confirmationTexts.push(explainCreated('note', 'warm'));
                  }
                  // file.to.space and attach.reminder not yet implemented
                } catch (err) {
                  console.error('[CatchAllNotepad] Failed to execute action:', action, err);
                }
              }),
            );

            // Show confirmations
            setConfirmations(confirmationTexts);

            // Clear form after brief delay to show confirmations
            setTimeout(() => {
              resetState();
            }, 2000);
          } else {
            // Mode is 'ask' or 'keep' - save to catch-all with suggestions
            // Note: Using labels/views for filtering, metadata in why_string
            const suggestionHints = response.suggestions
              ? ` Suggestions: ${response.suggestions.join(', ')}`
              : '';
            await repo.create({
              type: 'note',
              title: trimmed || 'Quick note',
              body: trimmed,
              subtype: 'catchall',
              origin: 'catchall',
              ai_placed: false,
              space_id: null,
              why_string: `${response.explanation}${suggestionHints}`,
              canonicalType: 'note',
              labels: ['catchall', ...(response.mode === 'ask' ? ['needs_review'] : [])],
              views: {
                alsoShowIn: ['Hub:Catch-All'],
              },
            });

            // Show suggestions as chips
            if (response.suggestions && response.suggestions.length > 0) {
              setSuggestions(response.suggestions);
            }

            if (Platform.OS === 'android') {
              ToastAndroid.show('Saved for later.', ToastAndroid.SHORT);
            }

            // Clear form after showing suggestions
            setTimeout(() => {
              resetState();
            }, 3000);
          }
        } catch (error) {
          // Cortex failed - fall back to safe save
          console.error('[CatchAllNotepad] Cortex decision failed:', error);
          await repo.create({
            type: 'note',
            title: trimmed || 'Quick note',
            body: trimmed,
            subtype: 'catchall',
            origin: 'catchall',
            ai_placed: false,
            space_id: null,
            why_string: 'Saved from Catch-All Notepad',
            canonicalType: 'note',
            labels: ['catchall'],
            views: {
              alsoShowIn: ['Hub:Catch-All'],
            },
          });

          if (Platform.OS === 'android') {
            ToastAndroid.show('Saved for later.', ToastAndroid.SHORT);
          }
          resetState();
        }
      } else {
        // Free mode - simple save without AI
        await repo.create({
          type: 'note',
          title: trimmed || 'Quick note',
          body: trimmed,
          subtype: 'catchall',
          origin: 'catchall',
          ai_placed: false,
          space_id: null,
          why_string: 'Saved from Catch-All Notepad',
          canonicalType: 'note',
          labels: ['catchall'],
          views: {
            alsoShowIn: ['Hub:Catch-All'],
          },
        });

        console.log('Captured to Catch-All.');
        if (Platform.OS === 'android') {
          ToastAndroid.show('Captured to Catch-All.', ToastAndroid.SHORT);
        } else {
          Alert.alert('Captured to Catch-All.');
        }
        resetState();
      }
    } catch (error) {
      console.error('[CatchAllNotepad] Failed to capture note', error);
      Alert.alert('Something went wrong', 'Please try again in a moment.');
      resetState();
    }
  }, [note, repo, resetState, mode, userId]);

  const handleChangeText = useCallback(
    (value: string) => {
      if (value.endsWith('\n') && listStyle !== 'none') {
        const prefix = nextPrefix(listStyle, value);
        const augmented = prefix ? value + prefix : value;
        setNote(augmented);
      } else {
        setNote(value);
      }
    },
    [listStyle],
  );

  const handleSubmit = useCallback(() => {
    if (isSubmitting || !note.trim()) {
      return;
    }

    setIsSubmitting(true);
    const needsDelay = mode === 'guided';

    if (needsDelay) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setIsThinking(true);
      timerRef.current = setTimeout(() => {
        setIsThinking(false);
        timerRef.current = null;
        void performSave();
      }, THINKING_DURATION);
    } else {
      void performSave();
    }
  }, [isSubmitting, mode, note, performSave]);

  return (
    <Screen
      padded
      scroll={false}
      footer={
        <View style={styles.submitButtonWrapper}>
          <Button
            label={isThinking ? 'Thinking…' : 'Submit to Gremly'}
            onPress={handleSubmit}
            fullWidth
            isLoading={isSubmitting}
            disabled={disabled}
            testID="ca-submit"
          />
        </View>
      }
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.pageWrapper}>
            <View testID="ca-mode-toggle" style={styles.headerBackground}>
              <View style={styles.headerGradientTop} />
              <View style={styles.headerGlow} />
              <View style={styles.headerContent}>
                <View style={styles.modeButtonsRow}>
                  {(['free', 'guided'] as Mode[]).map((value) => {
                    const isActive = mode === value;
                    const label = value === 'free' ? 'Free' : 'Guided';
                    const testID = value === 'free' ? 'ca-mode-free' : 'ca-mode-guided';
                    return (
                      <Pressable
                        key={value}
                        onPress={() => handleModeSelect(value)}
                        style={[
                          styles.modeButton,
                          isActive ? styles.modeButtonActive : styles.modeButtonInactive,
                        ]}
                        testID={testID}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                      >
                        <Text
                          style={[
                            styles.modeButtonText,
                            isActive ? styles.modeButtonTextActive : styles.modeButtonTextInactive,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.modeDescription} testID="ca-mode-description">
                  {modeDescription}
                </Text>
              </View>
            </View>

            {isThinking && (
              <View style={styles.thinkingRow}>
                <ActivityIndicator size="small" color="#0E3B3A" />
                <Text style={styles.thinkingText}>Gremly is thinking…</Text>
              </View>
            )}

            {confirmations.length > 0 && (
              <View style={styles.confirmationsContainer}>
                {confirmations.map((text, index) => (
                  <ConfirmationPill key={index} text={text} testID={`ca-confirmation-${index}`} />
                ))}
              </View>
            )}

            {suggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                <Text style={styles.suggestionsLabel}>You could also:</Text>
                <View style={styles.suggestionChips}>
                  {suggestions.map((suggestion, index) => (
                    <View key={index} style={styles.suggestionChip}>
                      <Text style={styles.suggestionText}>{suggestion}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.inputWrapper}>
              <TextInput
                multiline
                textAlignVertical="top"
                placeholder="Drop anything here…"
                placeholderTextColor={PLACEHOLDER_COLOR}
                style={styles.textInput}
                value={note}
                onChangeText={handleChangeText}
                autoFocus
                testID="ca-note-input"
              />
            </View>

            <View style={styles.toolbar}>
              {LIST_TOOLBAR_OPTIONS.map((option) => {
                const isActive = listStyle === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => handleToolbarSelect(option.key)}
                    style={[
                      styles.toolbarButton,
                      isActive ? styles.toolbarButtonActive : styles.toolbarButtonInactive,
                    ]}
                    testID={option.testID}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text
                      style={[
                        styles.toolbarButtonText,
                        isActive
                          ? styles.toolbarButtonTextActive
                          : styles.toolbarButtonTextInactive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: 32,
    backgroundColor: '#FFFCF5',
  },
  pageWrapper: {
    flex: 1,
  },
  headerBackground: {
    position: 'relative',
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#FFFCF5',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    overflow: 'hidden',
  },
  headerGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: '#EAF6F3',
    opacity: 0.9,
  },
  headerGlow: {
    position: 'absolute',
    bottom: -60,
    left: -40,
    right: -40,
    height: 160,
    backgroundColor: '#BFE3DD',
    opacity: 0.35,
  },
  headerContent: {
    position: 'relative',
  },
  modeButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modeButton: {
    flex: 1,
    borderRadius: 26,
    paddingVertical: 12,
    marginHorizontal: 6,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  modeButtonActive: {
    backgroundColor: '#BFE3DD',
  },
  modeButtonInactive: {
    backgroundColor: '#EAF6F3',
  },
  modeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#0E3B3A',
  },
  modeButtonTextInactive: {
    color: '#276C69',
  },
  modeDescription: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 20,
    color: '#276C69',
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#EAF6F3',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  thinkingText: {
    marginLeft: 10,
    color: '#276C69',
    fontWeight: '500',
  },
  inputWrapper: {
    minHeight: 240,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EEE4D1',
    backgroundColor: '#FFFCF5',
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  textInput: {
    flex: 1,
    fontSize: 18,
    lineHeight: 26,
    color: '#0E3B3A',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EEE4D1',
    backgroundColor: '#FFFCF5',
    paddingVertical: 8,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    marginBottom: 24,
  },
  toolbarButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  toolbarButtonActive: {
    backgroundColor: '#BFE3DD',
  },
  toolbarButtonInactive: {
    backgroundColor: 'transparent',
  },
  toolbarButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  toolbarButtonTextActive: {
    color: '#0E3B3A',
  },
  toolbarButtonTextInactive: {
    color: '#276C69',
  },
  submitButtonWrapper: {
    borderRadius: 28,
    backgroundColor: '#FFFCF5',
    paddingVertical: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  confirmationsContainer: {
    marginBottom: 16,
  },
  suggestionsContainer: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#EAF6F3',
  },
  suggestionsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#276C69',
    marginBottom: 8,
  },
  suggestionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#FFFCF5',
    borderWidth: 1,
    borderColor: '#BFE3DD',
  },
  suggestionText: {
    fontSize: 13,
    color: '#0E3B3A',
    fontWeight: '500',
  },
});
