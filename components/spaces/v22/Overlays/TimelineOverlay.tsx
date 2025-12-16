import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, SPACE } from '../_tokens';
import { X as CloseIcon } from 'lucide-react-native';
import { useGremlyStore } from '../../../../lib/store/useGremlyStore';
import { useAllSpaceMilestones } from '../../../../lib/store/selectors';
import { format } from 'date-fns';

export type TimelineOverlayProps = {
  visible: boolean;
  onClose: () => void;
  spaceId: string;
  onSelectDate?: (dateISO: string) => void;
};

export const TimelineOverlay: React.FC<TimelineOverlayProps> = ({
  visible,
  onClose,
  spaceId,
  onSelectDate,
}) => {
  // Store-based data
  const milestones = useAllSpaceMilestones(spaceId);
  const storeCreateMilestone = useGremlyStore((s) => s.createMilestone);
  const storeDeleteMilestone = useGremlyStore((s) => s.deleteMilestone);

  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [date, setDate] = React.useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = React.useState<string>('');

  const handleAdd = async () => {
    try {
      if (!title.trim()) return;
      await storeCreateMilestone(spaceId, {
        name: title.trim(),
        date,
      });
      setTitle('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setNote('');
      setAdding(false);
    } catch (e) {
      console.warn('[TimelineOverlay] create milestone failed', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await storeDeleteMilestone(id);
    } catch (e) {
      console.warn('[TimelineOverlay] delete milestone failed', e);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <BlurView intensity={12} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Timeline</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close timeline"
            >
              <CloseIcon color={COLORS.Sage} size={24} />
            </TouchableOpacity>
          </View>
          <View style={{ height: 12 }} />
          <ScrollView>
            {milestones.length === 0 ? (
              <Text style={styles.emptyState}>No milestones yet — want to drop one?</Text>
            ) : (
              milestones.map((m) => (
                <View key={m.id} style={styles.milestoneRow}>
                  <View style={styles.pearDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.milestoneTitle} numberOfLines={1}>
                      {m.name || m.title}
                    </Text>
                    <Text style={styles.milestoneMeta}>
                      {m.date ? format(new Date(m.date), 'EEE, MMM d, yyyy') : 'No date'}
                    </Text>
                    {!!m.note && (
                      <Text style={styles.milestoneNote} numberOfLines={2}>
                        {m.note}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDelete(m.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete milestone ${m.name || m.title}`}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <View style={{ height: 8 }} />
          </ScrollView>
          <View style={{ height: 12 }} />
          {!adding ? (
            <TouchableOpacity
              onPress={() => setAdding(true)}
              accessibilityRole="button"
              style={styles.addBtn}
            >
              <Text style={styles.addBtnText}>+ Add milestone</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.form}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Title"
                placeholderTextColor="#9FB6A2"
                style={styles.input}
              />
              <TextInput
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9FB6A2"
                style={styles.input}
              />
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Optional note"
                placeholderTextColor="#9FB6A2"
                style={[styles.input, { height: 72 }]}
                multiline
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                <TouchableOpacity onPress={() => setAdding(false)} accessibilityRole="button">
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAdd} accessibilityRole="button">
                  <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 51, 40, 0.32)', // Deep with transparency
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
  emptyState: {
    color: '#BFD0C4',
    fontSize: 14,
    marginVertical: 8,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  pearDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.Pear,
    marginTop: 6,
  },
  milestoneTitle: {
    color: COLORS.Linen,
    fontSize: 15,
    fontWeight: '700',
  },
  milestoneMeta: {
    color: '#D9E6DA',
    fontSize: 12,
    marginTop: 2,
  },
  milestoneNote: {
    color: '#D9E6DA',
    fontSize: 13,
    marginTop: 4,
  },
  addBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.Sage,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addBtnText: {
    color: COLORS.Sage,
    fontWeight: '700',
  },
  form: {
    gap: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: COLORS.Linen,
  },
  cancelText: {
    color: '#BFD0C4',
    fontWeight: '600',
  },
  saveText: {
    color: COLORS.Pear,
    fontWeight: '800',
  },
  deleteText: {
    color: '#D66B6B',
    fontWeight: '700',
  },
});

export default TimelineOverlay;
