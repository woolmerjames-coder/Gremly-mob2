import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  AccessibilityInfo,
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
import { useActionToast } from '../../src/hooks/useActionToast';
import { cortexRoute } from '../../lib/cortex/router';
import type { CortexContext, CortexAction } from '../../lib/cortex/cortexDecide';
import { shouldUseHaptics } from '../../config/featureFlags';
import { haptics } from '../../lib/haptics';
import {
  ORGANIZED_TOAST_PREFIX,
  organizedToastContent,
  type OrganizedKind,
} from '../../lib/ui/toast/copy';

const CATCHALL_LABEL = 'catchall';
const UNSORTED_LABEL = 'needs_review';

export default function CatchAllNotepadSimple(): React.JSX.Element {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const repo = useRepo();
  const { userId } = useAuth();
  const { c, mode } = useTheme();
  const { showToast: showActionToast } = useActionToast({
    bottomOffset: Platform.select({ ios: 112, android: 112, default: 112 }) ?? 112,
  });

  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleSubmit = useCallback(async () => {
    if (!note.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const trimmed = note.trim();
      const currentUserId = userId || 'anonymous';

      // Call Cortex SDK for AI routing
      const ctx: CortexContext = {
        lane: 'catchall',
        userId: currentUserId,
        activeSpaceId: null,
        uiSurface: 'overlay',
      };

      const response = await cortexRoute({ text: trimmed }, ctx);

      // Log event (non-blocking)
      (repo as any)
        .writeEvent?.(
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
        .catch((err: any) => console.error('[CatchAllNotepad] Failed to log event:', err));

      if (response.mode === 'auto' && response.actions.length > 0) {
        // Execute actions in parallel
        const counts = { todos: 0, notes: 0, habits: 0 };

        await Promise.all(
          response.actions.map(async (action: CortexAction) => {
            try {
              if (action.type === 'add.to.list') {
                const list = await (repo as any).getOrCreateList(action.payload.listKey, {
                  userId: currentUserId,
                  spaceId: action.payload.spaceId ?? null,
                });
                await (repo as any).addListItem(list.id, action.payload.item);
              } else if (action.type === 'create.todo') {
                await (repo as any).create({
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
                counts.todos += 1;
              } else if (action.type === 'create.habit') {
                await (repo as any).create({
                  type: 'habit',
                  name: action.payload.name,
                  frequency:
                    (action.payload.freq === 'custom' ? 'daily' : action.payload.freq) || 'daily',
                  subtype: 'start_habit',
                  space_id: action.payload.spaceId ?? null,
                  ai_placed: true,
                  why_string: response.explanation,
                  origin: 'catchall',
                });
                counts.habits += 1;
              } else if (action.type === 'create.note') {
                await (repo as any).create({
                  type: 'note',
                  title: action.payload.text || trimmed,
                  body: action.payload.text,
                  subtype: (action.payload.subtype as any) || 'note',
                  space_id: action.payload.spaceId ?? null,
                  ai_placed: true,
                  why_string: response.explanation,
                  origin: 'catchall',
                });
                counts.notes += 1;
              }
            } catch (err) {
              console.error('[CatchAllNotepad] Failed to execute action:', action, err);
            }
          }),
        );

        // Show success toast
        const segments: Array<{ kind: OrganizedKind; count: number }> = [];
        if (counts.todos) segments.push({ kind: 'todo', count: counts.todos });
        if (counts.notes) segments.push({ kind: 'note', count: counts.notes });
        if (counts.habits) segments.push({ kind: 'habit', count: counts.habits });

        let label: string;
        if (segments.length === 0) {
          label = `${ORGANIZED_TOAST_PREFIX}items`;
        } else if (segments.length === 1) {
          const seg = segments[0];
          label = organizedToastContent(seg.kind, seg.count);
        } else {
          const parts = segments.map((seg) =>
            organizedToastContent(seg.kind, seg.count).replace(ORGANIZED_TOAST_PREFIX, ''),
          );
          label = `${ORGANIZED_TOAST_PREFIX}${parts.join(', ')}`;
        }

        showActionToast({
          type: 'success',
          content: label,
        });

        // Haptic feedback
        try {
          if (shouldUseHaptics()) void haptics.submitSuccess();
        } catch (e) {
          void e;
        }

        // Announce for accessibility
        try {
          AccessibilityInfo.announceForAccessibility?.('Mind Drop organized successfully.');
        } catch (e) {
          void e;
        }

        // Clear input
        setNote('');
      } else {
        // Mode is 'ask' or 'keep' - save to unsorted
        await (repo as any).create({
          type: 'note',
          title: trimmed || 'Quick note',
          body: trimmed,
          subtype: 'catchall',
          origin: 'catchall',
          ai_placed: false,
          space_id: null,
          why_string: response.explanation,
          canonicalType: 'note',
          labels: [CATCHALL_LABEL, ...(response.mode === 'ask' ? [UNSORTED_LABEL] : [])],
          views: {
            alsoShowIn: ['Hub:Catch-All'],
          },
        });

        showActionToast({
          type: 'success',
          content: '✅ Saved to your inbox',
        });

        setNote('');
      }
    } catch (error) {
      console.error('Failed to save:', error);

      // Fallback: save directly
      try {
        await (repo as any).create({
          type: 'note',
          title: note.trim() || 'Quick note',
          body: note.trim(),
          subtype: 'catchall',
          origin: 'catchall',
          ai_placed: false,
          space_id: null,
          why_string: 'Saved from Mind Drop',
          canonicalType: 'note',
          labels: [CATCHALL_LABEL],
          views: {
            alsoShowIn: ['Hub:Catch-All'],
          },
        });

        showActionToast({
          type: 'success',
          content: '✅ Saved',
        });

        setNote('');
      } catch (fallbackError) {
        console.error('Fallback save failed:', fallbackError);
        // Keep the text so user can retry
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [note, isSubmitting, repo, userId, showActionToast]);

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
