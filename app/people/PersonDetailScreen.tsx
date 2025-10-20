/**
 * PersonDetailScreen - Phase 8
 * Shows all items linked to a specific person, grouped by type
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../ui/Screen';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { colors, spacing, radii } from '../../theme/tokens';
import type { EntityPerson, ItemType } from '../../lib/repo/types';
import type { AppRecord } from '../../lib/types';

type RootStackParamList = {
  PersonDetail: {
    personName: string;
    personEmail?: string;
  };
};

type PersonDetailRouteProp = RouteProp<RootStackParamList, 'PersonDetail'>;
type PersonDetailNavigationProp = NativeStackNavigationProp<RootStackParamList, 'PersonDetail'>;

interface GroupedItems {
  habit: AppRecord[];
  todo: AppRecord[];
  journal: AppRecord[];
  note: AppRecord[];
}

export default function PersonDetailScreen() {
  const route = useRoute<PersonDetailRouteProp>();
  const navigation = useNavigation<PersonDetailNavigationProp>();
  const repo = useRepo();
  const { userId } = useAuth();

  const { personName, personEmail } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkedPeople, setLinkedPeople] = useState<EntityPerson[]>([]);
  const [groupedItems, setGroupedItems] = useState<GroupedItems>({
    habit: [],
    todo: [],
    journal: [],
    note: [],
  });

  const loadLinkedItems = useCallback(async () => {
    if (!userId) return;

    // Phase 8 polish: Validate inputs
    if (!personName || !personName.trim()) {
      setError('Invalid person name');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query all entity_people records for this person
      // Since we don't have a direct query by person, we need to fetch all items
      // and check their linked people (suboptimal but works for Phase 8)

      // Load all items across all types
      const [habits, todos, journals, notes] = await Promise.all([
        repo.listByType('habit'),
        repo.listByType('todo'),
        repo.listByType('note', { subtypes: ['journal'] }),
        repo.listByType('note', { subtypes: ['idea', 'list', 'reference'] }),
      ]);

      // For each item, check if this person is linked
      const grouped: GroupedItems = { habit: [], todo: [], journal: [], note: [] };

      for (const habit of habits) {
        const people = await (repo as any).listLinkedPeopleByItem(habit.id);
        const matches = people.some(
          (p: EntityPerson) =>
            p.person_name === personName && (personEmail ? p.person_email === personEmail : true),
        );
        if (matches) grouped.habit.push(habit);
      }

      for (const todo of todos) {
        const people = await (repo as any).listLinkedPeopleByItem(todo.id);
        const matches = people.some(
          (p: EntityPerson) =>
            p.person_name === personName && (personEmail ? p.person_email === personEmail : true),
        );
        if (matches) grouped.todo.push(todo);
      }

      for (const journal of journals) {
        const people = await (repo as any).listLinkedPeopleByItem(journal.id);
        const matches = people.some(
          (p: EntityPerson) =>
            p.person_name === personName && (personEmail ? p.person_email === personEmail : true),
        );
        if (matches) grouped.journal.push(journal);
      }

      for (const note of notes) {
        const people = await (repo as any).listLinkedPeopleByItem(note.id);
        const matches = people.some(
          (p: EntityPerson) =>
            p.person_name === personName && (personEmail ? p.person_email === personEmail : true),
        );
        if (matches) grouped.note.push(note);
      }

      setGroupedItems(grouped);
    } catch (err) {
      console.warn('[PersonDetail] Failed to load linked items:', err);
      setError('Failed to load linked items. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [userId, repo, personName, personEmail]);

  useEffect(() => {
    loadLinkedItems();
  }, [loadLinkedItems]);

  const getTotalCount = () => {
    return (
      groupedItems.habit.length +
      groupedItems.todo.length +
      groupedItems.journal.length +
      groupedItems.note.length
    );
  };

  const getItemTitle = (item: AppRecord): string => {
    if (item.type === 'habit' || item.type === 'todo') {
      return 'name' in item ? item.name : 'Untitled';
    }
    if (item.type === 'note') {
      if (item.title) return item.title;
      if (item.body) {
        // Truncate long body text
        return item.body.length > 50 ? `${item.body.substring(0, 50)}...` : item.body;
      }
      return 'Untitled';
    }
    return 'Untitled';
  };

  const renderGroup = (title: string, items: AppRecord[], type: ItemType) => {
    if (items.length === 0) return null;

    return (
      <View style={styles.group} key={type}>
        <Text style={styles.groupTitle}>
          {title} ({items.length})
        </Text>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.itemCard}
            onPress={() => {
              // TODO: Navigate to item detail screen if exists
              console.log('[PersonDetail] Item pressed:', item.id);
            }}
          >
            <Text style={styles.itemTitle}>{getItemTitle(item)}</Text>
            <Text style={styles.itemDate}>
              {new Date(item.updated_at || item.created_at).toLocaleDateString()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <Screen testID="person-detail-loading">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.deepTeal} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen testID="person-detail-error">
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadLinkedItems}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  return (
    <Screen testID="person-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.personName}>{personName || 'Unknown Person'}</Text>
          {personEmail && <Text style={styles.personEmail}>{personEmail}</Text>}
          <Text style={styles.itemCount}>{getTotalCount()} linked items</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {getTotalCount() === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No linked items</Text>
            <Text style={styles.emptyText}>
              This person hasn't been linked to any habits, todos, journal entries, or notes yet.
            </Text>
          </View>
        ) : (
          <>
            {renderGroup('Habits', groupedItems.habit, 'habit')}
            {renderGroup('To-Dos', groupedItems.todo, 'todo')}
            {renderGroup('Journal Entries', groupedItems.journal, 'note')}
            {renderGroup('Notes', groupedItems.note, 'note')}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.gray600,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: 16,
    color: colors.warning,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.deepTeal,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    padding: spacing.lg,
    backgroundColor: colors.cream,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  backButton: {
    marginBottom: spacing.sm,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.deepTeal,
    fontWeight: '600',
  },
  headerInfo: {
    marginTop: spacing.sm,
  },
  personName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  personEmail: {
    fontSize: 14,
    color: colors.gray600,
    marginBottom: spacing.xs,
  },
  itemCount: {
    fontSize: 14,
    color: colors.gray600,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.gray600,
    textAlign: 'center',
    lineHeight: 20,
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.md,
  },
  itemCard: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  itemDate: {
    fontSize: 12,
    color: colors.gray600,
  },
});
