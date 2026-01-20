import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../ui/Text';
import { useRepo } from '../providers/RepoProvider';
import { useTheme } from '../providers/ThemeProvider';
import { eventBus } from '../lib/events';
import type { UpdateRecordInput } from '../lib/repo/IRepo';

const COMMITMENT_NOTE_LIMIT = 140;
const MAX_ACTIVE_COMMITMENTS = 3;

type CommitmentEntity = {
  id: string;
  type: 'habit' | 'todo';
};

type CommitmentToggleRowProps = {
  entity: CommitmentEntity;
  onChanged?: () => void | Promise<void>;
};

const CommitmentToggleRow: React.FC<CommitmentToggleRowProps> = ({ entity, onChanged }) => {
  const repo = useRepo();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [commitmentEnabled, setCommitmentEnabled] = useState(false);
  const [commitmentBusy, setCommitmentBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);

  const showToast = useCallback((message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert('Success', message);
    }
  }, []);

  const showErrorToast = useCallback((message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert('Heads up', message);
    }
  }, []);

  const notifyChanged = useCallback(() => {
    if (!onChanged) {
      return;
    }

    try {
      const result = onChanged();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>).catch((error) => {
          if (__DEV__) {
            console.warn('[CommitmentToggleRow] onChanged rejected', error);
          }
        });
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[CommitmentToggleRow] onChanged threw', error);
      }
    }
  }, [onChanged]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setCommitmentBusy(false);
      setNoteBusy(false);
      setNoteEditing(false);
      try {
        const record = await repo.getById(entity.id);
        if (cancelled || !record) {
          return;
        }

        if (record.type !== entity.type) {
          return;
        }

        const commitmentRecord = record as typeof record & {
          commitment?: boolean;
          commitment_archived_at?: string | null;
          commitment_note?: string | null;
        };

        const active = Boolean(
          commitmentRecord.commitment && !commitmentRecord.commitment_archived_at,
        );
        const existingNote = commitmentRecord.commitment_note ?? '';
        setCommitmentEnabled(active);
        setNote(existingNote);
        setNoteDraft(existingNote);
      } catch (error) {
        console.error('[CommitmentToggleRow] Failed to hydrate commitment state', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [entity.id, entity.type, repo]);

  const handleToggle = useCallback(
    async (nextValue: boolean) => {
      if (loading) return;
      if (commitmentBusy) return;
      if (noteBusy) return;
      if (nextValue === commitmentEnabled) return;

      setCommitmentBusy(true);
      try {
        if (nextValue) {
          const activeCount = await repo.countActiveCommitments();
          if (activeCount >= MAX_ACTIVE_COMMITMENTS) {
            showErrorToast('Limit of 3 active commitments reached');
            return;
          }

          const trimmed = noteDraft.trim();
          // For habits, use 7-day default duration. TODO: Add duration picker
          const durationDays = entity.type === 'habit' ? 7 : undefined;
          await repo.addCommitment(
            entity.id,
            entity.type,
            trimmed.length ? trimmed : null,
            durationDays,
          );
          setCommitmentEnabled(true);
          setNote(trimmed);
          setNoteDraft(trimmed);
          setNoteEditing(false);
          showToast('Marked as commitment.');
          eventBus.emit('CommitmentsChanged', {});
        } else {
          await repo.removeCommitment(entity.id, entity.type);
          setCommitmentEnabled(false);
          setNote('');
          setNoteDraft('');
          setNoteEditing(false);
          setNoteBusy(false);
          showToast('Commitment removed.');
          eventBus.emit('CommitmentsChanged', {});
        }

        notifyChanged();
      } catch (error) {
        console.error('[CommitmentToggleRow] Failed to toggle commitment', error);
        if (error instanceof Error && error.message === 'MAX_COMMITMENTS_REACHED') {
          showErrorToast('Limit of 3 active commitments reached');
        } else {
          showErrorToast('Unable to update commitment right now.');
        }
      } finally {
        setCommitmentBusy(false);
      }
    },
    [
      commitmentBusy,
      commitmentEnabled,
      entity.id,
      entity.type,
      loading,
      noteBusy,
      noteDraft,
      notifyChanged,
      repo,
      showErrorToast,
      showToast,
    ],
  );

  const handleNotePress = useCallback(() => {
    if (!commitmentEnabled) {
      showErrorToast('Enable commitment to add an intent.');
      return;
    }
    setNoteDraft(note);
    setNoteEditing(true);
  }, [commitmentEnabled, note, showErrorToast]);

  const handleNoteCancel = useCallback(() => {
    setNoteDraft(note);
    setNoteEditing(false);
  }, [note]);

  const handleNoteSave = useCallback(async () => {
    if (!commitmentEnabled) {
      showErrorToast('Enable commitment to add an intent.');
      return;
    }
    if (noteBusy) return;

    const trimmed = noteDraft.trim();
    if (trimmed.length > COMMITMENT_NOTE_LIMIT) {
      showErrorToast(`Intent must be ${COMMITMENT_NOTE_LIMIT} characters or fewer.`);
      return;
    }

    setNoteBusy(true);
    try {
      const patch = {
        commitment_note: trimmed.length ? trimmed : null,
      } as Record<string, unknown> as UpdateRecordInput['patch'];

      await repo.update({
        id: entity.id,
        patch,
      });
      setNote(trimmed);
      setNoteDraft(trimmed);
      setNoteEditing(false);
      showToast(trimmed.length ? 'Intent saved.' : 'Intent cleared.');
      eventBus.emit('CommitmentsChanged', {});
      notifyChanged();
    } catch (error) {
      console.error('[CommitmentToggleRow] Failed to save intent note', error);
      showErrorToast('Unable to save intent right now.');
    } finally {
      setNoteBusy(false);
    }
  }, [
    commitmentEnabled,
    entity.id,
    noteBusy,
    noteDraft,
    notifyChanged,
    repo,
    showErrorToast,
    showToast,
  ]);

  return (
    <View>
      <View
        style={[styles.commitmentRow, { borderColor: theme.colors.border.DEFAULT }]}
        testID="commitment-toggle-row"
      >
        <View style={styles.commitmentLabelContainer}>
          <Text style={[styles.commitmentLabel, { color: theme.colors.text.primary }]}>
            Commitment
          </Text>
          <Pressable
            onPress={handleNotePress}
            disabled={loading || commitmentBusy || noteBusy}
            hitSlop={8}
            testID="commitment-note-trigger"
          >
            <Text
              style={[
                styles.commitmentLink,
                {
                  color: commitmentEnabled
                    ? theme.colors.deepTeal.DEFAULT
                    : theme.colors.text.tertiary,
                  opacity: noteBusy || commitmentBusy ? 0.4 : 1,
                },
              ]}
            >
              {note.length ? 'Edit intent' : 'Add intent'}
            </Text>
          </Pressable>
        </View>
        <Switch
          value={commitmentEnabled}
          onValueChange={handleToggle}
          disabled={loading || commitmentBusy || noteBusy}
          testID="commitment-toggle"
          trackColor={{
            false: theme.colors.border.DEFAULT,
            true: theme.colors.deepTeal.DEFAULT,
          }}
          thumbColor={
            Platform.OS === 'android'
              ? commitmentEnabled
                ? theme.colors.deepTeal.DEFAULT
                : '#f4f3f4'
              : undefined
          }
          ios_backgroundColor={theme.colors.border.DEFAULT}
        />
      </View>
      {noteEditing && commitmentEnabled && (
        <View
          style={[styles.commitmentNoteEditor, { borderColor: theme.colors.border.DEFAULT }]}
          testID="commitment-note-editor"
        >
          <TextInput
            value={noteDraft}
            onChangeText={setNoteDraft}
            placeholder="Why is this important?"
            placeholderTextColor={theme.colors.text.tertiary}
            style={[styles.commitmentNoteInput, { color: theme.colors.text.primary }]}
            maxLength={COMMITMENT_NOTE_LIMIT}
            multiline
            editable={!noteBusy}
            testID="commitment-note-input"
          />
          <View style={styles.commitmentNoteMeta}>
            <Text style={[styles.commitmentNoteCount, { color: theme.colors.text.tertiary }]}>
              {noteDraft.length}/{COMMITMENT_NOTE_LIMIT}
            </Text>
          </View>
          <View style={styles.commitmentNoteActions}>
            <TouchableOpacity
              onPress={handleNoteCancel}
              disabled={noteBusy}
              style={styles.commitmentAction}
              testID="commitment-note-cancel"
            >
              <Text style={[styles.commitmentActionButton, { color: theme.colors.text.secondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNoteSave}
              disabled={noteBusy}
              style={[styles.commitmentAction, styles.commitmentActionPrimary]}
              testID="commitment-note-save"
            >
              <Text
                style={[
                  styles.commitmentActionButton,
                  {
                    color: noteBusy ? theme.colors.text.tertiary : theme.colors.deepTeal.DEFAULT,
                  },
                ]}
              >
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

export default CommitmentToggleRow;

const styles = StyleSheet.create({
  commitmentRow: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commitmentLabelContainer: {
    flex: 1,
  },
  commitmentLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  commitmentLink: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  commitmentNoteEditor: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  commitmentNoteInput: {
    minHeight: 80,
    fontSize: 14,
    lineHeight: 20,
  },
  commitmentNoteMeta: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  commitmentNoteCount: {
    fontSize: 12,
  },
  commitmentNoteActions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  commitmentAction: {
    paddingHorizontal: 8,
  },
  commitmentActionPrimary: {
    marginLeft: 18,
  },
  commitmentActionButton: {
    fontSize: 14,
    fontWeight: '600',
  },
});
