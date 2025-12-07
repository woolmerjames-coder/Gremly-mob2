/**
 * AttachExistingModal - Modal for attaching existing items to a Space
 *
 * Shows a list of unattached entities (todos, habits, notes) that can be
 * selected to attach to the current space.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  TouchableOpacity,
  View,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';
import { BRAND } from '../../design/brand';
import { useRepo } from '../../providers/RepoProvider';
import type { AppRecord } from '../../lib/types';

interface AttachExistingModalProps {
  visible: boolean;
  spaceId: string;
  spaceName: string;
  onClose: () => void;
  /** Called when an item is successfully attached */
  onAttached: () => void;
}

type FilterType = 'all' | 'todos' | 'habits' | 'notes';

const useStyles = makeStyles((t) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: t.colors.surface,
    borderTopLeftRadius: t.radius[4],
    borderTopRightRadius: t.radius[4],
    paddingTop: t.spacing[4],
    paddingBottom: t.spacing[6],
    maxHeight: '80%',
    minHeight: 400,
  },
  header: {
    paddingHorizontal: t.spacing[5],
    paddingBottom: t.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  headerTitle: {
    fontSize: t.typography.size.lg,
    fontFamily: t.typography.fontFamily.bold,
    color: t.colors.text,
    marginBottom: t.spacing[1],
  },
  headerSubtitle: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: t.spacing[5],
    paddingVertical: t.spacing[3],
    gap: t.spacing[3],
  },
  filterPill: {
    paddingHorizontal: t.spacing[3],
    paddingVertical: t.spacing[2],
    borderRadius: t.radius[2],
    backgroundColor: t.colors.bg,
  },
  filterPillActive: {
    backgroundColor: BRAND.colors.sageMist,
  },
  filterPillText: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
  },
  filterPillTextActive: {
    color: BRAND.colors.mossGreen,
  },
  listContent: {
    paddingHorizontal: t.spacing[5],
    paddingVertical: t.spacing[3],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: t.spacing[3],
    paddingHorizontal: t.spacing[4],
    backgroundColor: t.colors.bg,
    borderRadius: t.radius[2],
    marginBottom: t.spacing[2],
  },
  itemRowPressed: {
    opacity: 0.8,
  },
  itemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRAND.colors.sageMist,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: t.spacing[3],
  },
  itemIconText: {
    fontSize: 14,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.text,
  },
  itemType: {
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.regular,
    color: BRAND.colors.mossGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: t.spacing[7],
    paddingHorizontal: t.spacing[6],
  },
  emptyStateText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    textAlign: 'center',
    marginTop: t.spacing[2],
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: t.spacing[7],
  },
  cancelButton: {
    marginHorizontal: t.spacing[5],
    marginTop: t.spacing[3],
    paddingVertical: t.spacing[3],
    alignItems: 'center',
  },
  cancelText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
  },
}));

export function AttachExistingModal({
  visible,
  spaceId,
  spaceName,
  onClose,
  onAttached,
}: AttachExistingModalProps) {
  const styles = useStyles();
  const repo = useRepo();
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [items, setItems] = useState<AppRecord[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Load unattached items when modal opens
  React.useEffect(() => {
    if (visible && !hasLoaded) {
      loadUnattachedItems();
    }
    if (!visible) {
      setHasLoaded(false);
      setItems([]);
    }
  }, [visible]);

  const loadUnattachedItems = async () => {
    setLoading(true);
    try {
      // Get all items without a space_id (unattached)
      const allItems = await Promise.resolve(repo.getAll());
      const unattached = allItems.filter((item: AppRecord) => {
        // Only include items without a space or in a different space
        const itemSpaceId = (item as any).space_id;
        if (itemSpaceId === spaceId) return false; // Already in this space
        if (itemSpaceId) return false; // Attached to another space
        // Include todos, habits, and notes
        return item.type === 'todo' || item.type === 'habit' || item.type === 'note';
      });
      setItems(unattached);
      setHasLoaded(true);
    } catch (err) {
      console.error('[AttachExistingModal] Failed to load items', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter items based on selected filter
  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'todos') return items.filter((i) => i.type === 'todo');
    if (filter === 'habits') return items.filter((i) => i.type === 'habit');
    if (filter === 'notes') return items.filter((i) => i.type === 'note');
    return items;
  }, [items, filter]);

  // Handle attaching an item
  const handleAttach = useCallback(
    async (item: AppRecord) => {
      setAttaching(item.id);
      try {
        await repo.update({
          id: item.id,
          patch: { space_id: spaceId } as any,
        });
        console.log('[AttachExistingModal] Attached item to space', { itemId: item.id, spaceId });
        // Remove from list
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        onAttached();
        onClose();
      } catch (err) {
        console.error('[AttachExistingModal] Failed to attach item', err);
      } finally {
        setAttaching(null);
      }
    },
    [repo, spaceId, onAttached, onClose],
  );

  // Get item display info
  const getItemInfo = (item: AppRecord) => {
    let icon = '📄';
    let typeLabel = 'Note';
    let title = 'Untitled';

    if (item.type === 'todo') {
      icon = '☑️';
      typeLabel = 'Todo';
      title = (item as any).name || (item as any).title || 'Untitled';
    } else if (item.type === 'habit') {
      icon = '🔄';
      typeLabel = 'Habit';
      title = (item as any).name || (item as any).title || 'Untitled';
    } else if (item.type === 'note') {
      const subtype = (item as any).subtype;
      if (subtype === 'journal') {
        icon = '📝';
        typeLabel = 'Log';
      } else if (subtype === 'idea') {
        icon = '💡';
        typeLabel = 'Idea';
      } else if (subtype === 'list' || (item as any).is_list) {
        icon = '📋';
        typeLabel = 'List';
      }
      title = (item as any).title || (item as any).body?.slice(0, 40) || 'Untitled';
    }

    return { icon, typeLabel, title };
  };

  const renderItem = ({ item }: { item: AppRecord }) => {
    const { icon, typeLabel, title } = getItemInfo(item);
    const isAttaching = attaching === item.id;

    return (
      <Pressable
        onPress={() => handleAttach(item)}
        disabled={isAttaching}
        style={({ pressed }) => [styles.itemRow, pressed && styles.itemRowPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Attach ${title} to ${spaceName}`}
      >
        <View style={styles.itemIcon}>
          <Text style={styles.itemIconText}>{icon}</Text>
        </View>
        <View style={styles.itemContent}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.itemType}>{typeLabel}</Text>
        </View>
        {isAttaching && <ActivityIndicator size="small" color={BRAND.colors.mossGreen} />}
      </Pressable>
    );
  };

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'todos', label: 'Todos' },
    { key: 'habits', label: 'Habits' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={styles.sheet}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Attach existing item</Text>
            <Text style={styles.headerSubtitle}>Select an item to add to {spaceName}</Text>
          </View>

          <View style={styles.filterRow}>
            {filters.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterPill, filter === f.key && styles.filterPillActive]}
              >
                <Text
                  style={[styles.filterPillText, filter === f.key && styles.filterPillTextActive]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No unattached items</Text>
              <Text style={styles.emptyStateSubtext}>
                All your items are already attached to spaces, or you haven't created any yet.
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredItems}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
