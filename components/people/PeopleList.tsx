/**
 * PeopleList - Display people with linked item counts
 * Phase 7: Client-side count computation (no entity_people table yet)
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { Person } from '../../lib/types';
import { colors, spacing, radii } from '../../theme/tokens';
import { type as typeStyles } from '../../theme/typography';

export interface PersonWithCounts extends Person {
  linkedCounts: {
    habits: number;
    todos: number;
    notes: number;
    journal: number;
  };
}

interface PeopleListProps {
  people: PersonWithCounts[];
  onPersonPress?: (person: PersonWithCounts) => void;
  testID?: string;
}

export default function PeopleList({ people, onPersonPress, testID }: PeopleListProps) {
  if (people.length === 0) {
    return (
      <View style={styles.emptyContainer} testID={`${testID}-empty`}>
        <Text style={[typeStyles.body, { color: colors.gray400, textAlign: 'center' }]}>
          No people added yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID={testID}>
      {people.map((person) => (
        <PersonRow
          key={person.id}
          person={person}
          onPress={onPersonPress}
          testID={`person-${person.id}`}
        />
      ))}
    </View>
  );
}

interface PersonRowProps {
  person: PersonWithCounts;
  onPress?: (person: PersonWithCounts) => void;
  testID?: string;
}

function PersonRow({ person, onPress, testID }: PersonRowProps) {
  const { linkedCounts } = person;
  const totalCount =
    linkedCounts.habits + linkedCounts.todos + linkedCounts.notes + linkedCounts.journal;

  // Build count badges string (e.g., "2 To-Dos · 1 Note")
  const badges: string[] = [];
  if (linkedCounts.habits > 0) {
    badges.push(`${linkedCounts.habits} Habit${linkedCounts.habits !== 1 ? 's' : ''}`);
  }
  if (linkedCounts.todos > 0) {
    badges.push(`${linkedCounts.todos} To-Do${linkedCounts.todos !== 1 ? 's' : ''}`);
  }
  if (linkedCounts.journal > 0) {
    badges.push(
      `${linkedCounts.journal} Journal ${linkedCounts.journal !== 1 ? 'entries' : 'entry'}`,
    );
  }
  if (linkedCounts.notes > 0) {
    badges.push(`${linkedCounts.notes} Note${linkedCounts.notes !== 1 ? 's' : ''}`);
  }

  const badgeText = badges.join(' · ');

  const content = (
    <>
      <View style={styles.avatarContainer}>
        {person.avatar ? (
          <Text style={styles.avatar}>{person.avatar}</Text>
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>
              {person.name ? person.name.charAt(0).toUpperCase() : '?'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text style={[typeStyles.body, styles.name]} numberOfLines={1}>
          {person.name}
        </Text>
        {person.email && (
          <Text style={[typeStyles.meta, styles.email]} numberOfLines={1}>
            {person.email}
          </Text>
        )}
        {totalCount > 0 && (
          <Text style={[typeStyles.meta, styles.badges]} numberOfLines={1}>
            {badgeText}
          </Text>
        )}
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={styles.personCard}
        onPress={() => onPress(person)}
        testID={testID}
        activeOpacity={0.7}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.personCard} testID={testID}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gray200,
    gap: spacing.md,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    fontSize: 32,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.deepTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.white,
  },
  infoContainer: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: '600',
    color: colors.ink,
  },
  email: {
    color: colors.gray600,
    fontSize: 13,
  },
  badges: {
    color: colors.deepTeal,
    fontSize: 12,
    marginTop: 2,
  },
});
