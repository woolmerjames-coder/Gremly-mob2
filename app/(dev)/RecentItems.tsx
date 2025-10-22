/**
 * DEV-ONLY: Recent Items Screen
 *
 * Shows the last 20 items across all types with metadata for debugging.
 * Displays: id, type, title, space name, created_at, updated_at
 *
 * Access via DEV floating button.
 */

import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRepo } from '../../providers/RepoProvider';
import type { AppRecord, Space } from '../../lib/types';
import { Text } from '../../ui/Text';
import { Box } from '../../ui/Box';
import { Card } from '../../design-system/Card';

interface ItemWithMeta {
  id: string;
  type: 'habit' | 'todo' | 'note';
  created_at: string;
  updated_at: string;
  space_id?: string | null;
  ai_placed: boolean;
  archived?: boolean;
  origin?: 'catchall' | null;
  spaceName?: string;
  displayTitle: string;
}

export default function RecentItems() {
  const repo = useRepo();
  const [items, setItems] = useState<ItemWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRecentItems();
  }, []);

  const loadRecentItems = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all items and spaces
      const [habits, todos, notes, spaces] = await Promise.all([
        repo.listByType('habit'),
        repo.listByType('todo'),
        repo.listByType('note'),
        repo.listSpaces(),
      ]);

      // Create space lookup map
      const spaceMap = new Map<string, Space>();
      spaces.forEach((s) => spaceMap.set(s.id, s));

      // Combine all items
      const allItems: AppRecord[] = [...habits, ...todos, ...notes];

      // Sort by updated_at descending (most recent first)
      allItems.sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at).getTime();
        const dateB = new Date(b.updated_at || b.created_at).getTime();
        return dateB - dateA;
      });

      // Take last 20 and enrich with space names
      const recent = allItems.slice(0, 20).map((item): ItemWithMeta => {
        const spaceName = item.space_id ? spaceMap.get(item.space_id)?.name : undefined;

        let displayTitle = '';
        if (item.type === 'habit' || item.type === 'todo') {
          displayTitle = item.name || '(no name)';
        } else {
          displayTitle = item.title || item.body?.slice(0, 50) || '(no title)';
        }

        return {
          id: item.id,
          type: item.type,
          created_at: item.created_at,
          updated_at: item.updated_at,
          space_id: item.space_id,
          ai_placed: item.ai_placed,
          archived: item.archived,
          origin: item.origin,
          spaceName,
          displayTitle,
        };
      });

      setItems(recent);
    } catch (err) {
      console.error('[RecentItems] Failed to load:', err);
      setError(err instanceof Error ? err.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Box style={styles.centerBox}>
          <ActivityIndicator size="large" />
          <Text variant="body" style={styles.centerText}>
            Loading recent items...
          </Text>
        </Box>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Box style={styles.centerBox}>
          <Text variant="title" style={styles.errorText}>
            Error
          </Text>
          <Text variant="body" style={styles.centerText}>
            {error}
          </Text>
        </Box>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView style={styles.scrollView}>
        <Box p={4} gap={3}>
          <Text variant="display" style={styles.header}>
            📋 Recent Items ({items.length})
          </Text>
          <Text variant="subtle" style={styles.subtitle}>
            Last 20 items sorted by most recently updated
          </Text>

          {items.map((item, index) => (
            <Card key={item.id} style={styles.card}>
              <Box p={3} gap={2}>
                {/* Header row: type badge + title */}
                <Box style={styles.headerRow}>
                  <View
                    style={[
                      styles.typeBadge,
                      item.type === 'habit'
                        ? styles.habitBadge
                        : item.type === 'todo'
                          ? styles.todoBadge
                          : styles.noteBadge,
                    ]}
                  >
                    <Text style={styles.badgeText}>{item.type.toUpperCase()}</Text>
                  </View>
                  <Text variant="title" style={styles.titleText} numberOfLines={2}>
                    {item.displayTitle}
                  </Text>
                </Box>

                {/* Metadata grid */}
                <Box gap={1}>
                  <Box style={styles.metaRow}>
                    <Text variant="subtle" style={styles.metaLabel}>
                      ID:
                    </Text>
                    <Text variant="subtle" style={styles.metaValue} numberOfLines={1}>
                      {item.id}
                    </Text>
                  </Box>

                  {item.spaceName && (
                    <Box style={styles.metaRow}>
                      <Text variant="subtle" style={styles.metaLabel}>
                        Space:
                      </Text>
                      <Text variant="body" style={styles.metaValue}>
                        {item.spaceName}
                      </Text>
                    </Box>
                  )}

                  <Box style={styles.metaRow}>
                    <Text variant="subtle" style={styles.metaLabel}>
                      Created:
                    </Text>
                    <Text variant="subtle" style={styles.metaValue}>
                      {formatDate(item.created_at)}
                    </Text>
                  </Box>

                  <Box style={styles.metaRow}>
                    <Text variant="subtle" style={styles.metaLabel}>
                      Updated:
                    </Text>
                    <Text variant="subtle" style={styles.metaValue}>
                      {formatDate(item.updated_at)}
                    </Text>
                  </Box>

                  {/* Additional flags */}
                  <Box style={styles.flagRow}>
                    {item.ai_placed && (
                      <View style={styles.flag}>
                        <Text style={styles.flagText}>🤖 AI</Text>
                      </View>
                    )}
                    {item.archived && (
                      <View style={styles.flag}>
                        <Text style={styles.flagText}>📦 Archived</Text>
                      </View>
                    )}
                    {item.origin === 'catchall' && (
                      <View style={styles.flag}>
                        <Text style={styles.flagText}>📥 Catchall</Text>
                      </View>
                    )}
                  </Box>
                </Box>
              </Box>
            </Card>
          ))}

          {items.length === 0 && (
            <Card>
              <Box p={4} style={{ alignItems: 'center' }}>
                <Text variant="body" style={styles.centerText}>
                  No items found
                </Text>
              </Box>
            </Card>
          )}
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerText: {
    textAlign: 'center',
    marginTop: 8,
  },
  errorText: {
    color: '#dc2626',
    marginBottom: 8,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    marginTop: -8,
  },
  card: {
    backgroundColor: '#fff',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  habitBadge: {
    backgroundColor: '#10b981',
  },
  todoBadge: {
    backgroundColor: '#3b82f6',
  },
  noteBadge: {
    backgroundColor: '#8b5cf6',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  titleText: {
    flex: 1,
    fontSize: 16,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metaLabel: {
    width: 70,
    fontSize: 12,
  },
  metaValue: {
    flex: 1,
    fontSize: 12,
  },
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  flag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
  },
  flagText: {
    fontSize: 11,
  },
});
