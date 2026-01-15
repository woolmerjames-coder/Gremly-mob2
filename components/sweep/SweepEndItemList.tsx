import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../ui';
import { Check, Lightbulb, Repeat, X, type LucideIcon } from 'lucide-react-native';
import { BRAND } from '../../design/brand';

interface SweepEndItemListProps {
  todos?: Array<{ id: string; name: string; outcome: string }>;
  habits?: Array<{ id: string; name: string; outcome: string }>;
  notes?: Array<{ id: string; name: string; outcome: string }>;
  // For "things let go" - simpler list without outcomes
  clearedItems?: Array<{ id: string; name: string; type: 'todo' | 'habit' | 'note' }>;
}

export function SweepEndItemList({ todos, habits, notes, clearedItems }: SweepEndItemListProps) {
  // Track which groups exist to handle first group margin
  const groups: Array<{
    key: string;
    items: Array<{ id: string; name: string; outcome: string }>;
    label: string;
    Icon: LucideIcon;
  }> = [
    { key: 'todos', items: todos || [], label: 'TODOS', Icon: Check },
    { key: 'notes', items: notes || [], label: 'IDEAS', Icon: Lightbulb },
    { key: 'habits', items: habits || [], label: 'HABITS', Icon: Repeat },
  ].filter((g) => g.items.length > 0);

  // If clearedItems provided, render simple list
  if (clearedItems && clearedItems.length > 0) {
    return (
      <View style={styles.container}>
        {clearedItems.map((item) => (
          <View key={item.id} style={styles.item}>
            <X size={14} color={BRAND.colors.inkMuted} />
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  // Empty state
  if (groups.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {groups.map((group, index) => (
        <React.Fragment key={group.key}>
          <Text style={[styles.groupHeader, index === 0 && styles.firstGroupHeader]}>
            {group.label}
          </Text>
          {group.items.map((item) => (
            <View key={item.id} style={styles.item}>
              <group.Icon size={14} color={BRAND.colors.mossGreen} />
              <Text style={styles.itemName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.itemOutcome}>→ {item.outcome}</Text>
            </View>
          ))}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
  },
  groupHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  firstGroupHeader: {
    marginTop: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
  },
  itemOutcome: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
});

export default SweepEndItemList;
