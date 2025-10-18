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

export default function CatchAllNotepad(): JSX.Element {
  const repo = useRepo();
  const [mode, setMode] = useState<Mode>('free');
  const [listStyle, setListStyle] = useState<ListStyle>('none');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
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
  }, []);

  const performSave = useCallback(async () => {
    try {
      const trimmed = note.trim();
      if (!trimmed) {
        resetState();
        return;
      }

      await repo.create({
        type: 'note',
        title: '',
        body: trimmed,
        subtype: 'catchall',
        origin: 'catchall',
        ai_placed: true,
        why_string: 'Needs decision',
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
    } catch (error) {
      console.error('[CatchAllNotepad] Failed to capture note', error);
      Alert.alert('Something went wrong', 'Please try again in a moment.');
      resetState();
    }
  }, [note, repo, resetState]);

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
});
