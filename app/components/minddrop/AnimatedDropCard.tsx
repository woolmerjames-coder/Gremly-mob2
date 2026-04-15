/**
 * AnimatedDropCard - Calm arrival animation for Mind Drop cards
 *
 * Cards gently settle into place with smooth, gentle animations:
 * 1. Card slides up + fades in (280ms)
 * 2. Title shows in "draft" state (dimmed shimmer) with raw input
 * 3. When AI title arrives, crossfade to full opacity
 * 4. Confirmation message types in character-by-character
 * 5. Tags/meta fade in last with stagger
 */

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Text as RNText,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  Easing,
  FadeIn,
  SlideInDown,
  Layout,
  cancelAnimation,
} from 'react-native-reanimated';
import { Clock, Camera, Lock, Bell } from 'lucide-react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { getDateService } from '../../../lib/date';
import { ShimmerPlaceholder } from './ShimmerPlaceholder';
import { MultiSplitModal } from './MultiSplitModal';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useRepo } from '../../../providers/RepoProvider';
import { runPhase1 } from '../../../lib/minddrop/phase1';
import { runPhase2 } from '../../../lib/minddrop/phase2';
import type { MultiDropItem, MindDropBucket, LogSubtype } from '../../../lib/minddrop/types';
import { useNetworkStatus } from '../../../lib/network/useNetworkStatus';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AnimatedDropCardItem {
  id: string;
  text: string; // Raw input text
  title?: string; // AI-refined title (may arrive later)
  kind: 'todo' | 'habit' | 'note';
  confirmationMessage?: string;
  tags?: string[];
  timeEstimate?: number;
  dueDate?: string | null;
  dueDay?: string | null;
  hasPhotos?: boolean;
  isPrivate?: boolean;
  isPending?: boolean; // True while waiting for AI
  isEnriched?: boolean; // True when AI enrichment complete
  createdAt?: string;
  space_id?: string | null; // Associated space
  // Multi-entity support
  is_multi?: boolean; // True if this drop contains multiple items
  multi_items?: MultiDropItem[]; // Array of parsed items from multi-entity drop
  multi_summary_title?: string; // Combined title like "Groceries + Running Habit"
  noteSubtype?: 'event' | 'idea' | 'general' | 'journal' | null;
  views?: {
    is_multi?: boolean;
    multi_items?: MultiDropItem[];
    multi_summary_title?: string;
    [key: string]: unknown;
  }; // View flags
  /** Active reminders on this item (for bell chip display) */
  reminders?: Array<{ id: string; date?: string; time: string; frequency: string }> | null;
}

interface AnimatedDropCardProps {
  item: AnimatedDropCardItem;
  index: number; // For stagger delay
  onPress: () => void;
  onDelete?: () => void;
  styles: any; // Theme styles from parent
  badgeStyleKey: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: truncate text for draft title
// ─────────────────────────────────────────────────────────────────────────────

/** Format "14:00" → "2PM", "09:30" → "9:30AM" */
function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
}

/** Format reminder date for chip display using existing date service */
function formatReminderDate(dateStr: string): string {
  try {
    const ds = getDateService();
    return ds.formatForChip(dateStr);
  } catch {
    return dateStr;
  }
}

const truncateText = (text: string, maxLength: number): string => {
  if (!text) return '';
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) return trimmed;
  // Find last space before maxLength to avoid cutting words
  const truncated = trimmed.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace) + '...';
  }
  return truncated.substring(0, maxLength - 3) + '...';
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: relative time formatting
// ─────────────────────────────────────────────────────────────────────────────

const relativeTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = getDateService().now().getTime() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return getDateService().formatForChip(getDateService().toLocalDate(d));
};

// ─────────────────────────────────────────────────────────────────────────────
// TypewriterText - Character-by-character reveal
// ─────────────────────────────────────────────────────────────────────────────

const TypewriterText: React.FC<{
  text: string;
  style?: any;
  characterDelay?: number;
  onComplete?: () => void;
}> = ({ text, style, characterDelay = 25, onComplete }) => {
  const [displayedText, setDisplayedText] = React.useState('');
  const hasStartedRef = useRef(false);
  const textRef = useRef(text);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    textRef.current = text;
    onCompleteRef.current = onComplete;
  }, [text, onComplete]);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const targetText = textRef.current;
    if (!targetText) {
      setDisplayedText('');
      return;
    }

    let isMounted = true;
    let index = 0;

    const interval = setInterval(() => {
      if (!isMounted) return;
      if (index < targetText.length) {
        index++;
        setDisplayedText(targetText.substring(0, index));
      } else {
        clearInterval(interval);
        onCompleteRef.current?.();
      }
    }, characterDelay);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [characterDelay]);

  return (
    <RNText style={style} numberOfLines={2}>
      {displayedText}
    </RNText>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: offline status message
// ─────────────────────────────────────────────────────────────────────────────

function getOfflineStatusMessage(
  isOfflineCapture: boolean | undefined,
  isSynced: boolean,
  isConnected: boolean,
): string | null {
  if (!isOfflineCapture || isSynced) return null;
  if (isConnected) return 'Syncing now...';
  return "Saved! I'll organize this when we're back online ✓";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const AnimatedDropCard: React.FC<AnimatedDropCardProps> = React.memo(
  ({ item, index, onPress, styles: parentStyles, badgeStyleKey }) => {
    // DEBUG: Log every render to confirm component is used
    console.log('[AnimatedDropCard:RENDER]', item.id, item.kind, item.is_multi);

    const { isConnected } = useNetworkStatus();
    const queuedDrop = useGremlyStore((s) => s.queueItems.find((d) => d.localId === item.id));
    const isRetrying = false; // Pipeline handles retries now
    const offlineMessage = getOfflineStatusMessage(
      false, // offline capture no longer tracked on QueuedDrop
      queuedDrop?.phase === 'complete',
      isConnected,
    );

    // Determine if AI title is ready (different from raw text)
    const isAITitleReady =
      !!item.title && item.title !== item.text && item.title.length < item.text.length * 0.8; // AI titles are usually shorter

    // ─────────────────────────────────────────────────────────────────────────
    // Shimmer animation for draft state
    // ─────────────────────────────────────────────────────────────────────────

    const shimmerOpacity = useSharedValue(item.isPending ? 0.6 : 1);

    useEffect(() => {
      if (item.isPending && !isAITitleReady) {
        // Gentle pulse between 0.5 and 0.8 opacity
        shimmerOpacity.value = withRepeat(
          withSequence(
            withTiming(0.8, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.5, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
          true,
        );
      } else {
        // Stop shimmer, fade to full opacity
        cancelAnimation(shimmerOpacity);
        shimmerOpacity.value = withTiming(1, { duration: 300 });
      }

      return () => {
        cancelAnimation(shimmerOpacity);
      };
    }, [item.isPending, isAITitleReady]);

    const titleAnimatedStyle = useAnimatedStyle(() => ({
      opacity: shimmerOpacity.value,
    }));

    // ─────────────────────────────────────────────────────────────────────────
    // Confirmation message fade in
    // ─────────────────────────────────────────────────────────────────────────

    const confirmationOpacity = useSharedValue(0);
    const hasConfirmation = !!item.confirmationMessage;

    useEffect(() => {
      if (hasConfirmation) {
        confirmationOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));
      }
    }, [hasConfirmation]);

    const confirmationStyle = useAnimatedStyle(() => ({
      opacity: confirmationOpacity.value,
    }));

    // ─────────────────────────────────────────────────────────────────────────
    // Tags/meta staggered fade in
    // ─────────────────────────────────────────────────────────────────────────

    const metaOpacity = useSharedValue(item.isEnriched ? 1 : 0);

    useEffect(() => {
      if (item.isEnriched || !item.isPending) {
        metaOpacity.value = withDelay(400, withTiming(1, { duration: 400 }));
      }
    }, [item.isEnriched, item.isPending]);

    const metaStyle = useAnimatedStyle(() => ({
      opacity: metaOpacity.value,
    }));

    // ─────────────────────────────────────────────────────────────────────────
    // Display title: AI title if ready, otherwise truncated raw text
    // For multi-entity drops, use the summary title
    // ─────────────────────────────────────────────────────────────────────────

    // Check for multi-entity drops (flag may be at top level or in views)
    const isMulti = item.is_multi === true || item.views?.is_multi === true;

    // ─────────────────────────────────────────────────────────────────────────
    // Multi-drop bounce animation
    // When a card transitions to multi-drop, do a celebratory bounce
    // ─────────────────────────────────────────────────────────────────────────

    const bounceScale = useSharedValue(1);
    // Track if we've already animated this card becoming multi-drop
    // Use a ref that tracks the item ID to handle component reuse
    const hasAnimatedMultiRef = useRef<string | null>(null);

    useEffect(() => {
      // Trigger bounce when isMulti is true AND we haven't animated this specific item yet
      if (isMulti && hasAnimatedMultiRef.current !== item.id) {
        hasAnimatedMultiRef.current = item.id;

        // More pronounced bounce: 1.0 → 1.10 → 0.96 → 1.0
        bounceScale.value = withSequence(
          withTiming(1.1, { duration: 180, easing: Easing.out(Easing.back(2)) }),
          withTiming(0.96, { duration: 140, easing: Easing.inOut(Easing.ease) }),
          withSpring(1, { damping: 6, stiffness: 120, mass: 1 }),
        );
      }
    }, [isMulti, item.id, bounceScale]);

    const bounceStyle = useAnimatedStyle(() => ({
      transform: [{ scale: bounceScale.value }],
    }));

    // ─────────────────────────────────────────────────────────────────────────
    // Track content changes that could cause height jolt
    // Animate layout when multi_items or segments update
    // ─────────────────────────────────────────────────────────────────────────

    const prevMultiItemsCountRef = useRef(item.multi_items?.length ?? 0);
    const multiItemsCount = item.multi_items?.length ?? 0;

    useEffect(() => {
      // If multi_items count changed, something updated (Phase 1 titles arriving)
      if (multiItemsCount !== prevMultiItemsCountRef.current) {
        console.log('[MultiDrop] 📊 multi_items count changed', {
          id: item.id,
          prev: prevMultiItemsCountRef.current,
          now: multiItemsCount,
        });
        // Configure smooth layout animation for any height changes
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        prevMultiItemsCountRef.current = multiItemsCount;
      }
    }, [multiItemsCount, item.id]);

    // Also track when confirmation message or title changes (Phase 1 updates)
    const prevTitleRef = useRef(item.title);
    const prevConfirmRef = useRef(item.confirmationMessage);

    useEffect(() => {
      if (
        item.title !== prevTitleRef.current ||
        item.confirmationMessage !== prevConfirmRef.current
      ) {
        console.log('[MultiDrop] 📝 Card content updated', {
          id: item.id,
          titleChanged: item.title !== prevTitleRef.current,
          confirmChanged: item.confirmationMessage !== prevConfirmRef.current,
        });
        // Smooth any resulting layout changes
        LayoutAnimation.configureNext({
          duration: 250,
          update: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.scaleY,
          },
        });
        prevTitleRef.current = item.title;
        prevConfirmRef.current = item.confirmationMessage;
      }
    }, [item.title, item.confirmationMessage, item.id]);

    // DEBUG: Log multi status for notes
    if (item.kind === 'note') {
      console.log('[AnimatedDropCard:Multi]', {
        id: item.id,
        title: item.title?.substring(0, 30),
        is_multi: item.is_multi,
        views_is_multi: item.views?.is_multi,
        has_views: !!item.views,
        isMulti,
      });
    }

    // Multi-entity modal visibility state
    const [multiModalVisible, setMultiModalVisible] = useState(false);

    // DEBUG: Track modal state changes
    useEffect(() => {
      console.log('[DEBUG:Modal] State changed:', {
        itemId: item.id,
        dropId: (item as any).drop_id,
        multiModalVisible,
      });
    }, [multiModalVisible, item.id]);

    // DEBUG: Track component mount/unmount
    useEffect(() => {
      console.log('[DEBUG:Mount] AnimatedDropCard MOUNTED:', {
        itemId: item.id,
        dropId: (item as any).drop_id,
        title: item.title?.substring(0, 30),
      });
      return () => {
        console.log('[DEBUG:Unmount] AnimatedDropCard UNMOUNTED:', {
          itemId: item.id,
          dropId: (item as any).drop_id,
        });
      };
    }, []); // Empty deps = only on mount/unmount

    // Repo for Phase 2 enrichment
    const repo = useRepo();

    // Store methods for multi-entity actions
    const updateNote = useGremlyStore((s) => s.updateNote);
    const createTodo = useGremlyStore((s) => s.createTodo);
    const createHabit = useGremlyStore((s) => s.createHabit);
    const createNote = useGremlyStore((s) => s.createNote);
    const archiveNote = useGremlyStore((s) => s.archiveNote);

    // Handle keeping multi-drop as a single note
    const handleKeepAsNote = useCallback(async () => {
      // Close the modal
      setMultiModalVisible(false);

      try {
        // Get original text for re-classification
        const originalText = item.text || item.title || '';

        // 1. Set initial state - mark as classifying
        await updateNote(item.id, {
          views: {
            ...item.views,
            is_multi: false,
            minddrop_stage: 'classifying',
            ai_pending: true,
            multi_items: undefined,
            multi_summary_title: undefined,
          },
        } as any);

        // 2. Run Phase 1 to get smart_title and confirmation_message
        const phase1Result = await runPhase1(originalText, { hasAttachments: false });

        // Determine the correct title field based on bucket
        const titleField = phase1Result.bucket === 'log' ? 'title' : 'name';
        const smartTitle = phase1Result.smart_title || originalText.substring(0, 60);

        // 3. Update with Phase 1 results (title + confirmation message)
        await updateNote(item.id, {
          [titleField]: smartTitle,
          views: {
            ...item.views,
            is_multi: false,
            minddrop_stage: 'classified',
            ai_pending: true,
            confirmation_message: phase1Result.confirmation_message || undefined,
            dominant_bucket: phase1Result.bucket,
            dominant_subtype: phase1Result.subtype,
            multi_items: undefined,
            multi_summary_title: undefined,
          },
        } as any);

        console.log('[AnimatedDropCard] Phase 1 complete for kept-as-single:', {
          id: item.id,
          bucket: phase1Result.bucket,
          smartTitle: smartTitle?.substring(0, 30),
          hasConfirmation: !!phase1Result.confirmation_message,
        });

        // 4. Run Phase 2 for metadata enrichment (tags, mood, dates, etc.)
        const dominantBucket = phase1Result.bucket;
        const dominantSubtype = phase1Result.subtype;

        runPhase2(item.id, originalText, dominantBucket, dominantSubtype, repo)
          .then((result) => {
            if (result) {
              console.log(
                '[AnimatedDropCard:Phase2] Enrichment complete for kept-as-single:',
                item.id,
              );
            }
          })
          .catch((err) => {
            console.warn('[AnimatedDropCard:Phase2] Enrichment failed:', err);
          });
      } catch (error) {
        console.error('[AnimatedDropCard] Failed to process keep-as-single:', error);
      }
    }, [item.id, item.text, item.title, item.views, updateNote, repo]);

    // Handle splitting multi-drop into individual entities
    const handleSplitSelected = useCallback(
      async (selectedItems: MultiDropItem[]) => {
        setMultiModalVisible(false);

        console.log('[AnimatedDropCard] Splitting multi-drop into', selectedItems.length, 'items');

        try {
          for (const splitItem of selectedItems) {
            let newEntity: { id: string } | null = null;
            const bucket: MindDropBucket = splitItem.bucket;
            const subtype: LogSubtype | null = splitItem.subtype;

            // Use smart_title from Phase 1 if available
            const entityTitle = splitItem.smart_title || splitItem.preview_title || splitItem.text;

            if (splitItem.bucket === 'todo') {
              newEntity = await createTodo({
                name: entityTitle,
                body: splitItem.text,
                space_id: item.space_id ?? null,
                origin: 'catchall',
                views: {
                  minddrop_stage: 'classified',
                  ai_pending: true,
                  origin: 'multi_split',
                  source_drop_id: item.id,
                  confirmation_message: splitItem.confirmation_message ?? null,
                },
              } as any);
            } else if (splitItem.bucket === 'habit') {
              newEntity = await createHabit({
                name: entityTitle,
                title: entityTitle,
                notes: splitItem.text,
                frequency: 'daily',
                subtype: splitItem.habitSubtype || 'start_habit',
                space_id: item.space_id ?? null,
                origin: 'catchall',
                views: {
                  minddrop_stage: 'classified',
                  ai_pending: true,
                  origin: 'multi_split',
                  source_drop_id: item.id,
                  confirmation_message: splitItem.confirmation_message ?? null,
                },
              } as any);
            } else {
              // log bucket -> note
              const noteSubtype =
                splitItem.subtype === 'journal'
                  ? 'journal'
                  : splitItem.subtype === 'idea'
                    ? 'idea'
                    : 'catchall';
              newEntity = await createNote({
                title: entityTitle,
                body: splitItem.text,
                subtype: noteSubtype,
                space_id: item.space_id ?? null,
                origin: 'catchall',
                views: {
                  minddrop_stage: 'classified',
                  ai_pending: true,
                  origin: 'multi_split',
                  source_drop_id: item.id,
                  confirmation_message: splitItem.confirmation_message ?? null,
                },
              } as any);
            }

            // Trigger Phase 2 enrichment for the new entity (non-streaming)
            if (newEntity?.id) {
              runPhase2(newEntity.id, splitItem.text, bucket, subtype, repo)
                .then((enrichment) => {
                  if (enrichment) {
                    console.log('[AnimatedDropCard:Phase2] Enrichment complete', {
                      entityId: newEntity!.id,
                      tags: enrichment.tags?.length,
                    });
                  }
                })
                .catch((err) => {
                  console.warn('[AnimatedDropCard:Phase2] Enrichment failed', err);
                });
            }
          }

          // Archive the original multi-drop note
          await archiveNote(item.id, 'converted');
          console.log('[AnimatedDropCard] Split complete, archived original:', item.id);
        } catch (error) {
          console.error('[AnimatedDropCard] Failed to split multi-drop:', error);
        }
      },
      [item.id, item.space_id, createTodo, createHabit, createNote, archiveNote, repo],
    );

    const displayTitle = useMemo(() => {
      // Multi-entity drops use summary title
      if (isMulti) {
        return (
          item.multi_summary_title ||
          item.views?.multi_summary_title ||
          item.title ||
          'Multiple Items'
        );
      }
      // Single-entity: AI title if ready, otherwise truncated raw text
      if (isAITitleReady && item.title) {
        return item.title;
      }
      return truncateText(item.text, 50);
    }, [
      isMulti,
      item.multi_summary_title,
      item.views?.multi_summary_title,
      isAITitleReady,
      item.title,
      item.text,
    ]);

    // Stagger delay based on index (for multiple cards appearing at once)
    const staggerDelay = index * 80;

    // Kind badge label - Multi takes precedence
    const kindLabel = isMulti
      ? 'Multi'
      : item.kind === 'todo'
        ? 'Todo'
        : item.kind === 'habit'
          ? 'Habit'
          : item.kind === 'note' && item.noteSubtype === 'event'
            ? 'Event'
            : 'Note';

    const a11yLabel = useMemo(() => {
      const parts: string[] = [displayTitle, kindLabel];
      if (item.confirmationMessage) parts.push(item.confirmationMessage);
      if (item.kind === 'todo' && (item.dueDate || item.dueDay)) {
        const due = formatDueDate(item.dueDate || item.dueDay);
        if (due) parts.push(due);
      }
      if (item.timeEstimate) parts.push(`estimated ${item.timeEstimate} minutes`);
      if (item.tags?.length) parts.push(`tags: ${item.tags.slice(0, 2).join(', ')}`);
      parts.push(relativeTime(item.createdAt));
      return parts.filter(Boolean).join('. ');
    }, [displayTitle, kindLabel, item]);

    // Handle card press - open multi-split modal for multi-entity drops
    const handleCardPress = () => {
      if (isMulti) {
        setMultiModalVisible(true);
        return; // Don't run normal press behavior
      }
      onPress(); // Normal behavior for single-entity drops
    };

    return (
      <Animated.View
        entering={SlideInDown.duration(280).delay(staggerDelay).easing(Easing.out(Easing.cubic))}
        layout={Layout.duration(300).easing(Easing.inOut(Easing.ease))}
        style={localStyles.cardWrapper}
      >
        {/* Inner view for bounce animation - separate from layout animation */}
        <Animated.View style={bounceStyle}>
          <Pressable
            testID={`minddrop-card-${item.id}`}
            style={parentStyles.recentCard}
            onPress={handleCardPress}
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            accessibilityHint="Double tap to edit"
          >
            {/* Row 1: Title (left) + Kind badge (right) */}
            <View style={parentStyles.recentTopRow}>
              <Animated.Text
                numberOfLines={2}
                style={[
                  parentStyles.recentTitle,
                  titleAnimatedStyle,
                  item.isPending && !isAITitleReady && localStyles.draftTitle,
                ]}
              >
                {displayTitle || '—'}
              </Animated.Text>
              <View style={parentStyles.recentTopRight}>
                {item.kind === 'note' && item.isPrivate && <Lock size={12} color="#777" />}
                <RNText
                  style={[
                    parentStyles.recentCategoryPill,
                    parentStyles[badgeStyleKey],
                    isMulti && localStyles.multiBadge,
                  ]}
                >
                  {kindLabel}
                </RNText>
              </View>
            </View>

            {/* Row 2: Confirmation message or skeleton */}
            {isMulti ? (
              <RNText style={localStyles.multiHint}>Tap to decide what to do</RNText>
            ) : isRetrying ? (
              <RNText style={{ fontSize: 13, color: '#6a7484', fontStyle: 'italic', marginTop: 2 }}>
                Hmm, still thinking…
              </RNText>
            ) : item.confirmationMessage ? (
              <Animated.View style={confirmationStyle}>
                <TypewriterText
                  text={item.confirmationMessage}
                  style={parentStyles.recentConfirmation}
                  characterDelay={25}
                />
              </Animated.View>
            ) : (
              !item.isEnriched &&
              item.isPending && (
                <View style={localStyles.confirmationSkeleton}>
                  <ShimmerPlaceholder width="60%" height={14} borderRadius={4} />
                </View>
              )
            )}

            {/* Offline status message */}
            {offlineMessage && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
              >
                <RNText style={{ fontSize: 12, color: '#657865', fontStyle: 'italic' }}>
                  {offlineMessage}
                </RNText>
              </Animated.View>
            )}

            {/* Row 3: Meta row - context + time estimate + timestamp */}
            <Animated.View style={[parentStyles.recentMetaRow, metaStyle]}>
              {/* Left side: context chips */}
              <View style={localStyles.metaLeft}>
                {/* Due date chip for todos */}
                {item.kind === 'todo' && (item.dueDate || item.dueDay) && (
                  <View style={localStyles.contextPill}>
                    <RNText style={localStyles.contextPillText}>
                      {formatDueDate(item.dueDate || item.dueDay)}
                    </RNText>
                  </View>
                )}

                {/* Time estimate chip */}
                {item.timeEstimate && (
                  <View style={localStyles.timeChip}>
                    <Clock size={10} color="#737373" strokeWidth={2} />
                    <RNText style={localStyles.timeText}>~{item.timeEstimate}m</RNText>
                  </View>
                )}

                {/* Reminder chip */}
                {item.reminders &&
                  item.reminders.length > 0 &&
                  (() => {
                    const r = item.reminders[0];
                    const label =
                      r.frequency === 'daily'
                        ? `Daily, ${formatTime12h(r.time)}`
                        : r.date
                          ? `${formatReminderDate(r.date)}, ${formatTime12h(r.time)}`
                          : formatTime12h(r.time);
                    return (
                      <View style={localStyles.reminderChip}>
                        <Bell size={10} color="#735F28" strokeWidth={2} />
                        <RNText style={localStyles.reminderText}>{label}</RNText>
                      </View>
                    );
                  })()}

                {/* Tags (first 2) */}
                {item.tags &&
                  item.tags.slice(0, 2).map((tag) => (
                    <View key={tag} style={localStyles.tagChip}>
                      <RNText style={localStyles.tagText}>{tag}</RNText>
                    </View>
                  ))}
              </View>

              {/* Right side: photo icon + timestamp */}
              <View style={localStyles.metaRight}>
                {item.hasPhotos && <Camera size={14} color="#737373" strokeWidth={1.5} />}
                <RNText style={parentStyles.recentMetaTime}>{relativeTime(item.createdAt)}</RNText>
              </View>
            </Animated.View>
          </Pressable>
        </Animated.View>

        {/* Multi-entity split modal */}
        <MultiSplitModal
          visible={multiModalVisible}
          items={item.multi_items || item.views?.multi_items || []}
          summaryTitle={
            item.multi_summary_title || item.views?.multi_summary_title || 'Multiple Items'
          }
          onClose={() => setMultiModalVisible(false)}
          onKeepAsNote={handleKeepAsNote}
          onSplitSelected={handleSplitSelected}
        />
      </Animated.View>
    );
  },
);

AnimatedDropCard.displayName = 'AnimatedDropCard';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: format due date for display
// ─────────────────────────────────────────────────────────────────────────────

function formatDueDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const ds = getDateService();
  // Handle both YYYY-MM-DD (due_day) and ISO timestamps (due_date)
  const dueDay = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : ds.extractLocalDate(dateStr);
  if (!dueDay) return '';
  return `due ${ds.formatForChip(dueDay)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Styles
// ─────────────────────────────────────────────────────────────────────────────

const localStyles = StyleSheet.create({
  cardWrapper: {
    // Wrapper for entrance animation
  },
  draftTitle: {
    fontStyle: 'italic',
  },
  confirmationSkeleton: {
    marginTop: 4,
    marginBottom: 2,
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contextPill: {
    backgroundColor: 'rgba(191, 216, 192, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  contextPillText: {
    fontSize: 11,
    color: '#2E5540',
    fontFamily: 'Inter-Medium',
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(156, 166, 224, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  timeText: {
    fontSize: 11,
    color: '#656b79',
    fontFamily: 'Inter-Regular',
  },
  reminderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(224, 196, 122, 0.10)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  reminderText: {
    fontSize: 11,
    color: '#836c2f',
    fontFamily: 'Inter-Regular',
  },
  tagChip: {
    backgroundColor: 'rgba(46, 85, 64, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    color: '#2E5540',
    fontFamily: 'Inter-Regular',
  },
  // Multi-entity badge style
  multiBadge: {
    backgroundColor: 'rgba(156, 166, 224, 0.15)', // periwinkle at 15% opacity
    color: '#7B86C9', // darker periwinkle for legibility
  },
  // Multi-entity hint text
  multiHint: {
    fontSize: 13,
    color: '#5b6ccb',
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
  },
});

export default AnimatedDropCard;
