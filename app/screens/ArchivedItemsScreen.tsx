/**
 * ArchivedItemsScreen.tsx
 * Phase 3 - Shows archived items with search and filtering
 *
 * Features:
 * - Sticky search input at top
 * - Filter row: Type chips, Time dropdown, Status dropdown
 * - List area with empty state
 * - Restore and Delete actions per item
 * - Calm, minimal design (no emojis)
 *
 * Status Filter Behavior:
 * - 'archived': Show only archived items (archivedOnly: true)
 * - 'all': Show both archived and non-archived items
 *
 * For archived items, we don't distinguish "active" vs "completed" since
 * archived items are typically "done with". Users can optionally view
 * all items (including non-archived) using the 'all' status filter.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { colors, spacing, radii } from '../../theme/tokens';
import {
  ChevronLeft,
  Search,
  Archive,
  RotateCcw,
  Trash2,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react-native';
import { useRepo } from '../../providers/RepoProvider';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import HubItemCard, { type HubItem } from '../../components/HubItemCard';
import type { AppRecord } from '../../lib/types';
import {
  computeArchivedQueryOptions,
  type ArchivedTimeRange,
  type ArchivedStatusFilter,
} from '../../lib/hub/hubHelpers';
import { parseSearchTokens } from '../../lib/tags/parseSearch';

// =============================================================================
// Types
// =============================================================================

type ArchivedTypeFilter = 'todo' | 'habit' | 'note' | 'space';

const TIME_RANGE_LABELS: Record<ArchivedTimeRange, string> = {
  week: 'This Week',
  month: 'This Month',
  '3months': 'Last 3 Months',
  all: 'All Time',
};

const STATUS_LABELS: Record<ArchivedStatusFilter, string> = {
  archived: 'Archived',
  all: 'All',
};

// =============================================================================
// Helper: Convert AppRecord to HubItem
// =============================================================================

function recordToHubItem(record: AppRecord): HubItem {
  const kind = record.type === 'todo' ? 'todo' : record.type === 'habit' ? 'habit' : 'note';

  // Get title based on type
  let title = 'Untitled';
  if (record.type === 'todo' && 'title' in record) {
    title = (record as any).title || 'Untitled';
  } else if (record.type === 'habit' && 'name' in record) {
    title = (record as any).name || 'Untitled';
  } else if (record.type === 'note' && 'body' in record) {
    const body = (record as any).body || '';
    title = body.split('\n')[0]?.slice(0, 50) || 'Untitled';
  }

  return {
    id: record.id,
    kind,
    title,
    note: record.type === 'note' ? (record as any).body : undefined,
    placedBy: (record as any).ai_placed ? 'ai' : 'user',
  };
}

// =============================================================================
// Component
// =============================================================================

// Debounce delay for search
const SEARCH_DEBOUNCE_MS = 300;

export default function ArchivedItemsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ArchivedItems'>>();
  const repo = useRepo();
  const overlayController = useUnifiedOverlayController();

  // Initialize search from route param if provided
  const initialSearch = route.params?.searchQuery || '';

  // Search state
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState<Set<ArchivedTypeFilter>>(
    new Set(['todo', 'habit', 'note', 'space']),
  );
  const [timeRange, setTimeRange] = useState<ArchivedTimeRange>('all');
  const [statusFilter, setStatusFilter] = useState<ArchivedStatusFilter>('archived');

  // Items state
  const [items, setItems] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Delete confirmation modal state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<AppRecord | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Debounce search input
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [search]);

  // Parse search tokens for tag-based filtering
  const { text: parsedText, tagNames: parsedTags } = useMemo(
    () => parseSearchTokens(debouncedSearch),
    [debouncedSearch],
  );

  // Load archived items
  const loadArchivedItems = useCallback(async () => {
    if (!repo) return;

    setLoading(true);
    try {
      const queryOptions = computeArchivedQueryOptions(timeRange, statusFilter);
      const results: AppRecord[] = [];

      // Load each selected type with archived filter
      if (selectedTypes.has('todo')) {
        const todos = await repo.listByType('todo', queryOptions);
        results.push(...todos);
      }

      if (selectedTypes.has('habit')) {
        const habits = await repo.listByType('habit', queryOptions);
        results.push(...habits);
      }

      if (selectedTypes.has('note')) {
        const notes = await repo.listByType('note', queryOptions);
        results.push(...notes);
      }

      // Note: Spaces don't typically have archived status in the same way,
      // but we include them if selected and repo supports it
      // (For now, spaces are excluded from archived filtering)

      // Sort by created_at descending (most recent first)
      results.sort((a, b) => {
        const dateA = a.created_at || '';
        const dateB = b.created_at || '';
        return dateB.localeCompare(dateA);
      });

      setItems(results);
    } catch (err) {
      if (__DEV__) {
        console.error('[ArchivedItems] Failed to load:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [repo, selectedTypes, timeRange, statusFilter]);

  // Load items when filters change
  useEffect(() => {
    void loadArchivedItems();
  }, [loadArchivedItems]);

  // Toggle type filter
  const toggleTypeFilter = (type: ArchivedTypeFilter) => {
    const newTypes = new Set(selectedTypes);
    if (newTypes.has(type)) {
      // Don't allow deselecting all types
      if (newTypes.size > 1) {
        newTypes.delete(type);
      }
    } else {
      newTypes.add(type);
    }
    setSelectedTypes(newTypes);
  };

  // Handle item press - open in overlay
  const handleItemPress = (record: AppRecord) => {
    overlayController.openEdit({ record });
  };

  // Handle restore action - unarchive the item
  const handleRestore = async (record: AppRecord) => {
    if (!repo || actionLoading) return;

    setActionLoading(true);
    try {
      const itemType = record.type as 'todo' | 'habit' | 'note';
      await repo.restoreItem(record.id, itemType);
      // Refresh the list after restore
      await loadArchivedItems();
    } catch (err) {
      if (__DEV__) {
        console.error('[ArchivedItems] Failed to restore:', err);
      }
      Alert.alert('Error', 'Failed to restore item. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle delete action - show confirmation modal
  const handleDeletePress = (record: AppRecord) => {
    setItemToDelete(record);
    setDeleteModalVisible(true);
  };

  // Confirm and execute permanent deletion
  const confirmDelete = async () => {
    if (!repo || !itemToDelete || actionLoading) return;

    setActionLoading(true);
    try {
      await repo.remove(itemToDelete.id);
      setDeleteModalVisible(false);
      setItemToDelete(null);
      // Refresh the list after delete
      await loadArchivedItems();
    } catch (err) {
      if (__DEV__) {
        console.error('[ArchivedItems] Failed to delete:', err);
      }
      Alert.alert('Error', 'Failed to delete item. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel delete action
  const cancelDelete = () => {
    setDeleteModalVisible(false);
    setItemToDelete(null);
  };

  // Get item title for delete confirmation
  const getItemTitle = (record: AppRecord): string => {
    if (record.type === 'todo' && 'title' in record) {
      return (record as any).title || 'Untitled';
    }
    if (record.type === 'habit' && 'name' in record) {
      return (record as any).name || 'Untitled';
    }
    if (record.type === 'note' && 'body' in record) {
      const body = (record as any).body || '';
      return body.split('\n')[0]?.slice(0, 30) || 'Untitled';
    }
    return 'Untitled';
  };

  // Filter items by search query (debounced, with tag support)
  const filteredItems = useMemo(() => {
    if (!debouncedSearch.trim()) return items;

    return items.filter((item) => {
      // Get searchable text based on type
      let title = '';
      let body = '';
      let tags: string[] = [];

      if (item.type === 'todo') {
        title = ((item as any).title || '').toLowerCase();
        tags = ((item as any).tags || []).map((t: string) => t.toLowerCase());
      } else if (item.type === 'habit') {
        title = ((item as any).name || '').toLowerCase();
        tags = ((item as any).tags || []).map((t: string) => t.toLowerCase());
      } else if (item.type === 'note') {
        body = ((item as any).body || '').toLowerCase();
        title = body.split('\n')[0] || '';
        tags = ((item as any).tags || []).map((t: string) => t.toLowerCase());
      }

      // Check tag matches (all parsed tags must match)
      if (parsedTags.length > 0) {
        const tagMatches = parsedTags.every((searchTag) => {
          // Remove prefix (#, *, @) for comparison
          const normalizedSearchTag = searchTag.slice(1).toLowerCase();
          return tags.some((t) => t.includes(normalizedSearchTag));
        });
        if (!tagMatches) return false;
      }

      // Check text match (if there's free text)
      if (parsedText) {
        const textLower = parsedText.toLowerCase();
        const titleMatch = title.includes(textLower);
        const bodyMatch = body.includes(textLower);
        if (!titleMatch && !bodyMatch) return false;
      }

      return true;
    });
  }, [items, debouncedSearch, parsedText, parsedTags]);

  // Results count for display
  const resultsCount = filteredItems.length;
  const isSearching = debouncedSearch.trim().length > 0;
  const hasNoArchivedItems = items.length === 0;

  // Navigate back to Hub
  const handleBackToHub = () => {
    navigation.goBack();
  };

  // Render empty state - different messages for "nothing archived" vs "no search results"
  const renderEmptyState = () => {
    if (hasNoArchivedItems) {
      // Nothing archived yet
      return (
        <View style={styles.emptyState} testID="archived-empty-state">
          <Archive size={48} color={colors.gray400} />
          <Text style={styles.emptyTitle}>Nothing archived yet</Text>
          <Text style={styles.emptySubtitle}>
            When you archive items from your Hub, they will appear here. You can restore them
            anytime.
          </Text>
          <TouchableOpacity
            style={styles.backToHubRow}
            onPress={handleBackToHub}
            testID="archived-back-to-hub"
          >
            <ArrowLeft size={16} color={colors.deepTeal} />
            <Text style={styles.backToHubText}>Back to Hub</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Search returned no results
    return (
      <View style={styles.emptyState} testID="archived-no-results">
        <Search size={48} color={colors.gray400} />
        <Text style={styles.emptyTitle}>No results found</Text>
        <Text style={styles.emptySubtitle}>
          Try adjusting your search or filters to find what you're looking for.
        </Text>
        <TouchableOpacity
          style={styles.clearSearchButton}
          onPress={() => setSearch('')}
          testID="archived-clear-search"
        >
          <Text style={styles.clearSearchText}>Clear search</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render loading state
  const renderLoading = () => (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color={colors.deepTeal} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          testID="archived-back-button"
        >
          <ChevronLeft size={24} color={colors.deepTeal} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Archived Items</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Sticky Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Search size={18} color={colors.gray400} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search archived..."
            placeholderTextColor={colors.gray400}
            value={search}
            onChangeText={setSearch}
            testID="archived-search-input"
            returnKeyType="search"
          />
        </View>
      </View>

      {/* Filter Controls */}
      <View style={styles.filterContainer}>
        {/* Type Chips Row */}
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.filterChip, selectedTypes.has('todo') && styles.filterChipActive]}
              onPress={() => toggleTypeFilter('todo')}
              testID="archived-filter-type-todo"
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedTypes.has('todo') && styles.filterChipTextActive,
                ]}
              >
                To-Dos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, selectedTypes.has('habit') && styles.filterChipActive]}
              onPress={() => toggleTypeFilter('habit')}
              testID="archived-filter-type-habit"
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedTypes.has('habit') && styles.filterChipTextActive,
                ]}
              >
                Habits
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, selectedTypes.has('note') && styles.filterChipActive]}
              onPress={() => toggleTypeFilter('note')}
              testID="archived-filter-type-note"
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedTypes.has('note') && styles.filterChipTextActive,
                ]}
              >
                Logs
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, selectedTypes.has('space') && styles.filterChipActive]}
              onPress={() => toggleTypeFilter('space')}
              testID="archived-filter-type-space"
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedTypes.has('space') && styles.filterChipTextActive,
                ]}
              >
                Spaces
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Time + Status Dropdowns Row */}
        <View style={styles.dropdownRow}>
          {/* Time Range Dropdown */}
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              // Cycle through time ranges
              const ranges: ArchivedTimeRange[] = ['week', 'month', '3months', 'all'];
              const currentIdx = ranges.indexOf(timeRange);
              const nextIdx = (currentIdx + 1) % ranges.length;
              setTimeRange(ranges[nextIdx]);
            }}
            testID="archived-filter-time-dropdown"
          >
            <Text style={styles.dropdownText}>{TIME_RANGE_LABELS[timeRange]}</Text>
            <Text style={styles.dropdownArrow}>▾</Text>
          </TouchableOpacity>

          {/* Status Dropdown */}
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              // Cycle through statuses
              const statuses: ArchivedStatusFilter[] = ['archived', 'all'];
              const currentIdx = statuses.indexOf(statusFilter);
              const nextIdx = (currentIdx + 1) % statuses.length;
              setStatusFilter(statuses[nextIdx]);
            }}
            testID="archived-filter-status-dropdown"
          >
            <Text style={styles.dropdownText}>{STATUS_LABELS[statusFilter]}</Text>
            <Text style={styles.dropdownArrow}>▾</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Results Count */}
      {!loading && isSearching && resultsCount > 0 && (
        <View style={styles.resultsCountContainer}>
          <Text style={styles.resultsCountText}>
            {resultsCount} {resultsCount === 1 ? 'result' : 'results'}
          </Text>
        </View>
      )}

      {/* List Area */}
      <View style={styles.listContainer}>
        {loading ? (
          renderLoading()
        ) : filteredItems.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.itemContainer}>
                <HubItemCard
                  item={recordToHubItem(item)}
                  onPress={() => handleItemPress(item)}
                  testID={`archived-item-${item.id}`}
                />
                {/* Action Row */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleRestore(item)}
                    disabled={actionLoading}
                    testID={`archived-restore-${item.id}`}
                  >
                    <RotateCcw size={16} color={colors.deepTeal} />
                    <Text style={styles.actionButtonText}>Restore</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDeletePress(item)}
                    disabled={actionLoading}
                    testID={`archived-delete-${item.id}`}
                  >
                    <Trash2 size={16} color={colors.warning} />
                    <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            contentContainerStyle={styles.listContent}
            testID="archived-items-list"
            ListFooterComponent={
              // Back to Hub hint at bottom of list
              <TouchableOpacity
                style={styles.listFooterHint}
                onPress={handleBackToHub}
                testID="archived-list-back-to-hub"
              >
                <ArrowLeft size={14} color={colors.gray500} />
                <Text style={styles.listFooterHintText}>Back to Hub</Text>
              </TouchableOpacity>
            }
          />
        )}
      </View>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={cancelDelete}
        testID="delete-confirmation-modal"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalIconContainer}>
              <AlertTriangle size={32} color={colors.warning} />
            </View>
            <Text style={styles.modalTitle}>Delete permanently?</Text>
            <Text style={styles.modalMessage}>
              "{itemToDelete ? getItemTitle(itemToDelete) : ''}" will be permanently deleted. This
              action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={cancelDelete}
                disabled={actionLoading}
                testID="delete-modal-cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDeleteButton}
                onPress={confirmDelete}
                disabled={actionLoading}
                testID="delete-modal-confirm"
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.modalDeleteText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray200,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.ink,
  },
  headerSpacer: {
    width: 32, // Balance the back button
  },
  // Search
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cream,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.gray200,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    paddingVertical: spacing.sm,
  },
  // Filter Controls
  filterContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.cream,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray200,
  },
  filterRow: {
    marginBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.xl,
    backgroundColor: colors.gray100,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  filterChipActive: {
    backgroundColor: colors.deepTeal,
    borderColor: colors.deepTeal,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray600,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  dropdownRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  dropdownText: {
    fontSize: 14,
    color: colors.gray600,
    marginRight: spacing.xs,
  },
  dropdownArrow: {
    fontSize: 12,
    color: colors.gray400,
  },
  // List Area
  listContainer: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  listContent: {
    padding: spacing.md,
  },
  // Item Container with Action Row
  itemContainer: {
    marginBottom: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.deepTeal,
    marginLeft: spacing.xs,
  },
  deleteButton: {
    // Additional styles for delete button if needed
  },
  deleteButtonText: {
    color: colors.warning,
  },
  // Loading State
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Results Count
  resultsCountContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.cream,
  },
  resultsCountText: {
    fontSize: 13,
    color: colors.gray500,
    fontWeight: '500',
  },
  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.ink,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.gray600,
    textAlign: 'center',
    lineHeight: 22,
  },
  backToHubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  backToHubText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.deepTeal,
    marginLeft: spacing.xs,
  },
  clearSearchButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  clearSearchText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.deepTeal,
  },
  listFooterHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
  listFooterHintText: {
    fontSize: 13,
    color: colors.gray500,
    marginLeft: spacing.xs,
  },
  // Delete Confirmation Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContainer: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  modalIconContainer: {
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    color: colors.gray600,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.gray100,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray600,
  },
  modalDeleteButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  modalDeleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
});
