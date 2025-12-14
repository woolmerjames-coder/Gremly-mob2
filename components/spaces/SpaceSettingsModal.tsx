/**
 * SpaceSettingsModal - Settings/edit modal for Spaces
 *
 * Options:
 * - Edit Space name
 * - Edit/set milestone (opens MilestoneEntryModal)
 * - Delete Space
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Edit3, Flag, Trash2, ChevronRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../../design/brand';

interface SpaceItemCounts {
  todos: number;
  habits: number;
  notes: number;
}

interface SpaceSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  space: { id: string; name: string } | null;
  hasMilestone: boolean;
  onEditMilestone: () => void;
  onSaveSpaceName: (name: string) => Promise<void>;
  onDeleteSpace: () => Promise<void>;
  getSpaceItemCounts?: () => Promise<SpaceItemCounts>;
}

export function SpaceSettingsModal({
  visible,
  onClose,
  space,
  hasMilestone,
  onEditMilestone,
  onSaveSpaceName,
  onDeleteSpace,
  getSpaceItemCounts,
}: SpaceSettingsModalProps) {
  const insets = useSafeAreaInsets();

  const [isEditingName, setIsEditingName] = useState(false);
  const [spaceName, setSpaceName] = useState(space?.name || '');
  const [saving, setSaving] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSpaceName(space?.name || '');
      setIsEditingName(false);
      setSaving(false);
    }
  }, [visible, space?.name]);

  const handleSaveName = async () => {
    if (!spaceName.trim() || spaceName.trim() === space?.name) {
      setIsEditingName(false);
      return;
    }

    setSaving(true);
    try {
      await onSaveSpaceName(spaceName.trim());
      setIsEditingName(false);
    } catch (error) {
      console.error('[SpaceSettings] Save name error:', error);
      Alert.alert('Error', 'Failed to save Space name. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditMilestone = () => {
    onClose();
    // Small delay to let modal close before opening milestone modal
    setTimeout(() => {
      onEditMilestone();
    }, 300);
  };

  const handleDeleteSpace = async () => {
    // Get item counts if the function is provided
    let countsMessage = '';
    if (getSpaceItemCounts) {
      try {
        const counts = await getSpaceItemCounts();
        const parts: string[] = [];
        if (counts.todos > 0) parts.push(`${counts.todos} todo${counts.todos === 1 ? '' : 's'}`);
        if (counts.habits > 0)
          parts.push(`${counts.habits} habit${counts.habits === 1 ? '' : 's'}`);
        if (counts.notes > 0) parts.push(`${counts.notes} note${counts.notes === 1 ? '' : 's'}`);

        if (parts.length > 0) {
          countsMessage = `\n\nThis space contains: ${parts.join(', ')}. These items will become unassigned.`;
        }
      } catch (error) {
        console.error('[SpaceSettings] Failed to get item counts:', error);
        // Continue without counts on error
      }
    }

    Alert.alert(
      'Delete Space',
      `Are you sure you want to delete "${space?.name}"?${countsMessage || ' This will remove the Space but keep all items inside it.'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await onDeleteSpace();
              onClose();
            } catch (error) {
              console.error('[SpaceSettings] Delete error:', error);
              Alert.alert('Error', 'Failed to delete Space. Please try again.');
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Space Settings</Text>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={24} color={BRAND.colors.inkMuted} />
            </Pressable>
          </View>

          {/* Settings Options */}
          <View style={styles.options}>
            {/* Space Name */}
            <View style={styles.option}>
              <View style={styles.optionHeader}>
                <View style={styles.iconContainer}>
                  <Edit3 size={18} color={BRAND.colors.mossGreen} />
                </View>
                <Text style={styles.optionLabel}>Space Name</Text>
              </View>

              {isEditingName ? (
                <View style={styles.editNameContainer}>
                  <TextInput
                    style={styles.nameInput}
                    value={spaceName}
                    onChangeText={setSpaceName}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                    maxLength={50}
                  />
                  <View style={styles.editNameActions}>
                    <Pressable
                      onPress={() => {
                        setSpaceName(space?.name || '');
                        setIsEditingName(false);
                      }}
                      style={styles.cancelEditButton}
                    >
                      <Text style={styles.cancelEditText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleSaveName}
                      disabled={saving || !spaceName.trim()}
                      style={[
                        styles.saveEditButton,
                        (!spaceName.trim() || saving) && styles.saveEditButtonDisabled,
                      ]}
                    >
                      <Text style={styles.saveEditText}>{saving ? 'Saving...' : 'Save'}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable onPress={() => setIsEditingName(true)} style={styles.optionValue}>
                  <Text style={styles.optionValueText}>{space?.name}</Text>
                  <ChevronRight size={18} color={BRAND.colors.inkMuted} />
                </Pressable>
              )}
            </View>

            {/* Milestone */}
            <Pressable onPress={handleEditMilestone} style={styles.option}>
              <View style={styles.optionHeader}>
                <View style={styles.iconContainer}>
                  <Flag size={18} color={BRAND.colors.mossGreen} />
                </View>
                <Text style={styles.optionLabel}>Goal</Text>
              </View>
              <View style={styles.optionValue}>
                <Text style={styles.optionValueText}>
                  {hasMilestone ? 'Edit goal' : 'Set a goal'}
                </Text>
                <ChevronRight size={18} color={BRAND.colors.inkMuted} />
              </View>
            </Pressable>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Delete Space */}
            <Pressable onPress={handleDeleteSpace} style={styles.option}>
              <View style={styles.optionHeader}>
                <View style={[styles.iconContainer, styles.iconContainerDanger]}>
                  <Trash2 size={18} color="#DC3545" />
                </View>
                <Text style={styles.deleteLabel}>Delete Space</Text>
              </View>
              <Text style={styles.deleteHint}>Items will be kept but unassigned</Text>
            </Pressable>
          </View>

          {/* Bottom padding */}
          <View style={{ height: insets.bottom + 16 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: {
    gap: 12,
  },
  option: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(191, 216, 192, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerDanger: {
    backgroundColor: 'rgba(220, 53, 69, 0.1)',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  optionValue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingLeft: 50,
  },
  optionValueText: {
    fontSize: 15,
    color: BRAND.colors.inkMuted,
  },
  editNameContainer: {
    marginTop: 8,
    paddingLeft: 50,
  },
  nameInput: {
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  editNameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelEditButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  cancelEditText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  saveEditButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 8,
  },
  saveEditButtonDisabled: {
    backgroundColor: 'rgba(191, 216, 192, 0.5)',
  },
  saveEditText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginVertical: 8,
    marginHorizontal: 8,
  },
  deleteLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#DC3545',
  },
  deleteHint: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    marginTop: 4,
    paddingLeft: 50,
  },
});

export default SpaceSettingsModal;
