/**
 * PeopleLinker - People linking component for overlay
 * Phase 8: Add/remove people linked to habits, todos, notes, journals
 */

import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '../../../ui/Text';
import { colors, spacing, radii } from '../../../theme/tokens';
import type { EntityPerson } from '../../../lib/repo/types';

export interface PeopleLinkerProps {
  userId: string;
  itemId: string | null; // null for new items
  itemType: 'habit' | 'todo' | 'journal' | 'note' | 'catchall' | 'space';
  linkedPeople: EntityPerson[];
  onPeopleChange: (people: EntityPerson[]) => void;
  onLinkPerson: (personName: string, personEmail?: string) => Promise<EntityPerson>;
  onUnlinkPerson: (linkId: string) => Promise<void>;
}

export function PeopleLinker({
  linkedPeople,
  onPeopleChange,
  onLinkPerson,
  onUnlinkPerson,
}: PeopleLinkerProps) {
  const [showForm, setShowForm] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAddPerson = async () => {
    if (!nameInput.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const person = await onLinkPerson(nameInput.trim(), emailInput.trim() || undefined);
      onPeopleChange([...linkedPeople, person]);
      setNameInput('');
      setEmailInput('');
      setShowForm(false);
    } catch (error) {
      console.error('Failed to link person:', error);
      // Could show toast here
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemovePerson = async (person: EntityPerson) => {
    try {
      await onUnlinkPerson(person.id);
      onPeopleChange(linkedPeople.filter((p) => p.id !== person.id));
    } catch (error) {
      console.error('Failed to unlink person:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>People</Text>

      {/* Linked people chips */}
      {linkedPeople.length > 0 && (
        <View style={styles.peopleContainer}>
          {linkedPeople.map((person) => (
            <View key={person.id} style={styles.chip}>
              <View>
                <Text style={styles.chipName}>{person.person_name}</Text>
                {person.person_email && <Text style={styles.chipEmail}>{person.person_email}</Text>}
              </View>
              <TouchableOpacity
                onPress={() => handleRemovePerson(person)}
                style={styles.chipRemove}
                testID={`person-remove-${person.id}`}
              >
                <Text style={styles.chipRemoveText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Add button / form */}
      {!showForm ? (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowForm(true)}
          testID="people-add-button"
        >
          <Text style={styles.addButtonText}>+ Add Person</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Name *"
            placeholderTextColor={colors.gray400}
            value={nameInput}
            onChangeText={setNameInput}
            autoFocus
            returnKeyType="next"
            testID="person-name-input"
          />
          <TextInput
            style={[styles.input, styles.inputSpaced]}
            placeholder="Email (optional)"
            placeholderTextColor={colors.gray400}
            value={emailInput}
            onChangeText={setEmailInput}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleAddPerson}
            testID="person-email-input"
          />
          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.formButton, styles.cancelButton]}
              onPress={() => {
                setShowForm(false);
                setNameInput('');
                setEmailInput('');
              }}
              testID="person-cancel"
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formButton, styles.saveButton]}
              onPress={handleAddPerson}
              disabled={!nameInput.trim() || isLoading}
              testID="person-save"
            >
              <Text style={styles.saveButtonText}>{isLoading ? 'Adding...' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  peopleContainer: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.periwinkle,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  chipEmail: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  chipRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRemoveText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
  },
  addButton: {
    paddingVertical: spacing.sm,
  },
  addButtonText: {
    fontSize: 14,
    color: colors.periwinkle,
    fontWeight: '500',
  },
  form: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.gray100,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: '#FFFFFF',
  },
  inputSpaced: {
    marginTop: spacing.sm,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  formButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  cancelButton: {
    backgroundColor: colors.gray200,
  },
  cancelButtonText: {
    color: colors.gray600,
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: colors.periwinkle,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
