/**
 * TimeBlockSettingsSection
 *
 * Simple list showing time block ranges with tap to edit.
 */

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { Sunrise, Sun, Sunset, ChevronUp, ChevronDown, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { DEFAULT_TIME_BLOCK_PREFERENCES } from '../../lib/capacity';
import type { TimeBlockPreferences } from '../../lib/capacity';

const COLORS = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  divider: '#E8E6E1',
  surface: '#FFFFFF',
};

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour === 12) return '12:00 PM';
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

interface BlockConfig {
  key: 'morning' | 'day' | 'evening';
  label: string;
  Icon: LucideIcon;
}

const BLOCKS: BlockConfig[] = [
  { key: 'morning', label: 'Morning', Icon: Sunrise },
  { key: 'day', label: 'Afternoon', Icon: Sun },
  { key: 'evening', label: 'Evening', Icon: Sunset },
];

export function TimeBlockSettingsSection() {
  const timeBlockPreferences = useGremlyStore((s) => s.timeBlockPreferences);
  const setTimeBlockPreferences = useGremlyStore((s) => s.setTimeBlockPreferences);

  const [editingBlock, setEditingBlock] = useState<BlockConfig | null>(null);
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(0);

  const openEditor = (block: BlockConfig) => {
    const prefs = timeBlockPreferences[block.key];
    setEditStart(prefs.startHour);
    setEditEnd(prefs.endHour);
    setEditingBlock(block);
  };

  const saveEdit = () => {
    if (!editingBlock) return;

    const newPrefs = { ...timeBlockPreferences };

    if (editingBlock.key === 'morning') {
      newPrefs.morning = { startHour: editStart, endHour: editEnd };
      newPrefs.day = { ...newPrefs.day, startHour: editEnd };
    } else if (editingBlock.key === 'day') {
      newPrefs.morning = { ...newPrefs.morning, endHour: editStart };
      newPrefs.day = { startHour: editStart, endHour: editEnd };
      newPrefs.evening = { ...newPrefs.evening, startHour: editEnd };
    } else if (editingBlock.key === 'evening') {
      newPrefs.day = { ...newPrefs.day, endHour: editStart };
      newPrefs.evening = { startHour: editStart, endHour: editEnd };
    }

    setTimeBlockPreferences(newPrefs);
    setEditingBlock(null);
  };

  const getMinStart = (): number => {
    if (!editingBlock) return 0;
    if (editingBlock.key === 'morning') return 0;
    if (editingBlock.key === 'day') return timeBlockPreferences.morning.startHour + 1;
    return timeBlockPreferences.day.startHour + 1;
  };

  const getMaxEnd = (): number => {
    if (!editingBlock) return 23;
    if (editingBlock.key === 'morning') return timeBlockPreferences.day.endHour - 1;
    if (editingBlock.key === 'day') return timeBlockPreferences.evening.endHour - 1;
    return 23;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Time Blocks</Text>
      <Text style={styles.description}>
        Tap to adjust when each part of your day starts and ends.
      </Text>

      {BLOCKS.map((block) => {
        const prefs = timeBlockPreferences[block.key];
        const Icon = block.Icon;
        return (
          <Pressable key={block.key} style={styles.row} onPress={() => openEditor(block)}>
            <Icon size={18} color={COLORS.inkMuted} style={styles.icon} />
            <Text style={styles.label}>{block.label}</Text>
            <Text style={styles.range}>
              {formatHour(prefs.startHour)} → {formatHour(prefs.endHour)}
            </Text>
          </Pressable>
        );
      })}

      {/* Edit Modal */}
      <Modal
        visible={editingBlock !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingBlock(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setEditingBlock(null)}>
          <View style={styles.modal} onStartShouldSetResponder={() => true}>
            {editingBlock && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit {editingBlock.label}</Text>
                  <Pressable onPress={() => setEditingBlock(null)} hitSlop={8}>
                    <X size={20} color={COLORS.inkMuted} />
                  </Pressable>
                </View>

                <View style={styles.timeRow}>
                  <View style={styles.timeColumn}>
                    <Text style={styles.timeLabel}>Start</Text>
                    <View style={styles.adjuster}>
                      <Pressable
                        onPress={() => setEditStart(Math.max(getMinStart(), editStart - 1))}
                        disabled={editStart <= getMinStart()}
                        style={styles.adjusterButton}
                      >
                        <ChevronDown
                          size={20}
                          color={editStart <= getMinStart() ? COLORS.divider : COLORS.mossGreen}
                        />
                      </Pressable>
                      <Text style={styles.timeValue}>{formatHour(editStart)}</Text>
                      <Pressable
                        onPress={() => setEditStart(Math.min(editEnd - 1, editStart + 1))}
                        disabled={editStart >= editEnd - 1}
                        style={styles.adjusterButton}
                      >
                        <ChevronUp
                          size={20}
                          color={editStart >= editEnd - 1 ? COLORS.divider : COLORS.mossGreen}
                        />
                      </Pressable>
                    </View>
                  </View>

                  <Text style={styles.arrow}>→</Text>

                  <View style={styles.timeColumn}>
                    <Text style={styles.timeLabel}>End</Text>
                    <View style={styles.adjuster}>
                      <Pressable
                        onPress={() => setEditEnd(Math.max(editStart + 1, editEnd - 1))}
                        disabled={editEnd <= editStart + 1}
                        style={styles.adjusterButton}
                      >
                        <ChevronDown
                          size={20}
                          color={editEnd <= editStart + 1 ? COLORS.divider : COLORS.mossGreen}
                        />
                      </Pressable>
                      <Text style={styles.timeValue}>{formatHour(editEnd)}</Text>
                      <Pressable
                        onPress={() => setEditEnd(Math.min(getMaxEnd(), editEnd + 1))}
                        disabled={editEnd >= getMaxEnd()}
                        style={styles.adjusterButton}
                      >
                        <ChevronUp
                          size={20}
                          color={editEnd >= getMaxEnd() ? COLORS.divider : COLORS.mossGreen}
                        />
                      </Pressable>
                    </View>
                  </View>
                </View>

                <Pressable style={styles.saveButton} onPress={saveEdit}>
                  <Text style={styles.saveText}>Save</Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.charcoalInk,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: COLORS.inkMuted,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  icon: {
    marginRight: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.charcoalInk,
    flex: 1,
  },
  range: {
    fontSize: 14,
    color: COLORS.inkMuted,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modal: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.charcoalInk,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  timeColumn: {
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  adjuster: {
    alignItems: 'center',
  },
  adjusterButton: {
    padding: 8,
  },
  timeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.charcoalInk,
    paddingVertical: 4,
    minWidth: 90,
    textAlign: 'center',
  },
  arrow: {
    fontSize: 18,
    color: COLORS.inkMuted,
    marginHorizontal: 16,
    marginTop: 24,
  },
  saveButton: {
    backgroundColor: COLORS.mossGreen,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.surface,
  },
});
