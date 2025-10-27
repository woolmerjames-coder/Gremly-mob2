import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Button } from '../../design-system/Button';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../src/theme/useTheme';

const CATCHALL_LABEL = 'catchall';
const UNSORTED_LABEL = 'needs_review';

export default function CatchAllNotepadSimple(): React.JSX.Element {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const repo = useRepo();
  const { userId } = useAuth();
  const { c, mode } = useTheme();

  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleSubmit = useCallback(async () => {
    if (!note.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Create the note
      const baseInput = {
        type: 'note' as const,
        title: note.trim(),
        body: note.trim(),
        subtype: 'catchall' as const,
        ai_placed: true,
        origin: 'catchall' as const,
        labels: [CATCHALL_LABEL, UNSORTED_LABEL],
      };

      if (typeof (repo as any)?.addUnsorted === 'function') {
        await (repo as any).addUnsorted(null, baseInput);
      } else if (typeof (repo as any)?.create === 'function') {
        await (repo as any).create(baseInput);
      }

      // Success - clear input
      setNote('');

      // Optional: navigate or show success feedback
      // navigation.goBack();
    } catch (error) {
      console.error('Failed to save:', error);
      // Keep the text so user can retry
    } finally {
      setIsSubmitting(false);
    }
  }, [note, isSubmitting, repo]);

  const disabled = !note.trim() || isSubmitting;

  return (
    <Screen testID="catchall-notepad" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.greeting, { color: c.text }]}>✨ What's on your mind?</Text>

          <View
            style={[
              styles.inputContainer,
              {
                backgroundColor: c.sageTint,
                borderColor: c.mutedText,
              },
            ]}
          >
            <TextInput
              ref={inputRef}
              testID="minddrop-input"
              value={note}
              onChangeText={setNote}
              multiline
              style={[styles.input, { color: c.text }]}
              placeholder="Buy milk, call mom, that idea about..."
              placeholderTextColor={c.mutedText}
              maxLength={2000}
              autoFocus
              editable={!isSubmitting}
            />
          </View>

          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: c.mutedText }]}>🔒 Private & secure</Text>
            <Text style={[styles.metaText, { color: c.mutedText }]}>{note.length} / 2000</Text>
          </View>

          <Button
            testID="minddrop-submit-button"
            label={isSubmitting ? '✓ Organizing...' : 'Drop to Gremly →'}
            leftIcon={isSubmitting ? <ActivityIndicator size="small" color={c.bg} /> : undefined}
            onPress={disabled ? undefined : handleSubmit}
            disabled={disabled}
            disabledOpacity={0.6}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    flexGrow: 1,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 20,
  },
  inputContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    minHeight: 150,
  },
  input: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metaText: {
    fontSize: 12,
  },
});
