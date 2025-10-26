import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, SPACE } from '../_tokens';
import {
  X as CloseIcon,
  FileText as NumbersIcon,
  Square as CheckboxIcon,
  NotebookText as JournalIcon,
} from 'lucide-react-native';
import { useRepo } from '../../../../providers/RepoProvider';
import type { AppRecord } from '../../../../lib/types';

export type NotepadOverlayProps = {
  visible: boolean;
  onClose: () => void;
  spaceId: string;
  initialDraft?: string; // optional: when provided, ensure a note exists prefilled and selected
};

export const NotepadOverlay: React.FC<NotepadOverlayProps> = ({
  visible,
  onClose,
  spaceId,
  initialDraft,
}) => {
  const repo = useRepo();
  const [notes, setNotes] = React.useState<AppRecord[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [text, setText] = React.useState('');
  const [fmt, setFmt] = React.useState<'bullets' | 'numbers' | 'checkboxes' | 'none'>('none');
  const [isJournal, setIsJournal] = React.useState<boolean>(false);
  const emotionalPrompt = React.useMemo(
    () =>
      'How are you feeling today? What felt good? What challenged you? Anything you want to remember?',
    [],
  );

  const load = React.useCallback(async () => {
    try {
      const list = await repo.listByType('note', { spaceId });
      // Only user-authored notes (exclude AI/catchall/space_chat artifacts)
      const userNotes = list.filter((n: any) => !n.ai_placed && n.origin !== 'space_chat');
      setNotes(userNotes);
      if (userNotes.length > 0 && !selectedId) {
        const first = userNotes[0] as any;
        setSelectedId(first.id);
        setText(first.body || '');
        setFmt((first.fmt as any) || 'none');
        setIsJournal(first.subtype === 'journal');
      }
    } catch {
      setNotes([]);
    }
  }, [repo, spaceId, selectedId]);

  React.useEffect(() => {
    if (visible) {
      (async () => {
        await load();
        // If an initialDraft is provided and nothing selected yet, create a new note and select it
        if (initialDraft && !selectedId) {
          try {
            const created = (await repo.create({
              type: 'note',
              space_id: spaceId,
              title: 'Intention for today',
              body: initialDraft,
              subtype: 'catchall',
              origin: 'manual',
              ai_placed: false,
            } as any)) as any;
            setSelectedId(created.id);
            setText(initialDraft);
            setFmt('none');
            setIsJournal(false);
            await load();
          } catch {
            // ignore create failure to avoid blocking overlay
          }
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, spaceId]);

  const selectNote = (note: any) => {
    setSelectedId(note.id);
    setText(note.body || '');
    setFmt((note.fmt as any) || 'none');
    setIsJournal(note.subtype === 'journal');
  };

  const save = async () => {
    if (!selectedId) return;
    try {
      const patch: any = { body: text };
      if (fmt === 'bullets' || fmt === 'numbers' || fmt === 'checkboxes') patch.fmt = fmt;
      // Journal toggle saves with journal subtype; otherwise keep as user-authored catchall
      patch.subtype = isJournal ? 'journal' : 'catchall';
      patch.origin = 'manual';
      await repo.update({ id: selectedId, patch });
      await load();
    } catch {
      // no-op for now
    }
  };

  const toggleJournal = () => {
    setIsJournal((prev) => {
      const next = !prev;
      if (next) {
        // Add emotional prompt for journal if empty or whitespace-only
        const trimmed = (text || '').trim();
        if (!trimmed) setText(emotionalPrompt);
      }
      return next;
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Notepad</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close notepad"
            >
              <CloseIcon color={COLORS.Linen} size={22} />
            </TouchableOpacity>
          </View>
          <View style={{ height: 12 }} />
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <ScrollView style={{ maxHeight: 140 }}>
                {notes.length === 0 ? (
                  <Text style={{ color: '#D9E6DA' }}>No notes yet in this Space.</Text>
                ) : (
                  notes.map((n: any) => (
                    <TouchableOpacity
                      key={n.id}
                      onPress={() => selectNote(n)}
                      style={{ paddingVertical: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit note ${n.title || 'Untitled'}`}
                    >
                      <Text
                        style={{
                          color: n.id === selectedId ? COLORS.Pear : COLORS.Linen,
                          fontWeight: n.id === selectedId ? '700' : '500',
                        }}
                        numberOfLines={1}
                      >
                        {n.title || 'Untitled'}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setFmt((prev) => (prev === 'bullets' ? 'none' : 'bullets'))}
                style={styles.toggleChip}
                accessibilityRole="button"
                testID="formatting-bullets"
              >
                <Text style={styles.toggleText}>{fmt === 'bullets' ? '• Bullets' : 'Bullets'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFmt((prev) => (prev === 'numbers' ? 'none' : 'numbers'))}
                style={styles.toggleChip}
                accessibilityRole="button"
                testID="formatting-numbers"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <NumbersIcon color={COLORS.Linen} size={14} />
                  <Text style={styles.toggleText}>
                    {fmt === 'numbers' ? '1. Numbers' : 'Numbers'}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFmt((prev) => (prev === 'checkboxes' ? 'none' : 'checkboxes'))}
                style={styles.toggleChip}
                accessibilityRole="button"
                testID="formatting-checkboxes"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <CheckboxIcon color={COLORS.Linen} size={14} />
                  <Text style={styles.toggleText}>
                    {fmt === 'checkboxes' ? '☑︎ Check' : 'Checkboxes'}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={toggleJournal}
                style={[
                  styles.toggleChip,
                  isJournal && { backgroundColor: 'rgba(255,255,255,0.12)' },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Toggle journal mode"
                testID="journal-toggle"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <JournalIcon color={COLORS.Linen} size={14} />
                  <Text style={styles.toggleText}>{isJournal ? 'Journal on' : 'Journal'}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ height: 12 }} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Jot a quick note…"
              placeholderTextColor="#9FB6A2"
              multiline
              style={styles.textArea}
            />
          </ScrollView>
          <View style={{ height: 12 }} />
          <TouchableOpacity onPress={save} accessibilityRole="button" style={styles.saveBtn}>
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 51, 40, 0.32)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.Deep,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: SPACE.lg,
    paddingBottom: SPACE.xl,
    height: '80%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.Linen,
  },
  textArea: {
    minHeight: 160,
    color: COLORS.Linen,
    fontSize: 16,
    lineHeight: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
  },
  toggleChip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  toggleText: {
    color: COLORS.Linen,
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtn: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.Moss,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveText: {
    color: COLORS.Linen,
    fontWeight: '700',
  },
});

export default NotepadOverlay;
