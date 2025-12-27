/**
 * AnimatedDropCard - Calm arrival animation for Mind Drop cards
 *
 * Cards gently settle into place with smooth, ADHD-friendly animations:
 * 1. Card slides up + fades in (280ms)
 * 2. Title shows in "draft" state (dimmed shimmer) with raw input
 * 3. When AI title arrives, crossfade to full opacity
 * 4. Confirmation message types in character-by-character
 * 5. Tags/meta fade in last with stagger
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { View, Pressable, StyleSheet, Text as RNText } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  FadeIn,
  SlideInDown,
  Layout,
  cancelAnimation,
} from 'react-native-reanimated';
import { Clock, Camera, Lock } from 'lucide-react-native';

import { ShimmerPlaceholder } from './ShimmerPlaceholder';

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
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
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
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const AnimatedDropCard: React.FC<AnimatedDropCardProps> = React.memo(
  ({ item, index, onPress, styles: parentStyles, badgeStyleKey }) => {
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
    // ─────────────────────────────────────────────────────────────────────────

    const displayTitle = useMemo(() => {
      if (isAITitleReady && item.title) {
        return item.title;
      }
      return truncateText(item.text, 50);
    }, [isAITitleReady, item.title, item.text]);

    // Stagger delay based on index (for multiple cards appearing at once)
    const staggerDelay = index * 80;

    // Kind badge label
    const kindLabel = item.kind === 'todo' ? 'Todo' : item.kind === 'habit' ? 'Habit' : 'Log';

    return (
      <Animated.View
        entering={SlideInDown.duration(280).delay(staggerDelay).easing(Easing.out(Easing.cubic))}
        layout={Layout.duration(200).easing(Easing.inOut(Easing.ease))}
        style={localStyles.cardWrapper}
      >
        <Pressable
          testID={`minddrop-card-${item.id}`}
          style={parentStyles.recentCard}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${displayTitle}`}
        >
          {/* Row 1: Title (left) + Kind badge (right) */}
          <View style={parentStyles.recentTopRow}>
            <Animated.Text
              numberOfLines={1}
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
              <RNText style={[parentStyles.recentCategoryPill, parentStyles[badgeStyleKey]]}>
                {kindLabel}
              </RNText>
            </View>
          </View>

          {/* Row 2: Confirmation message or skeleton */}
          {item.confirmationMessage ? (
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
                  <Clock size={10} color="#888" strokeWidth={2} />
                  <RNText style={localStyles.timeText}>~{item.timeEstimate}m</RNText>
                </View>
              )}

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
              {item.hasPhotos && <Camera size={14} color="#888" strokeWidth={1.5} />}
              <RNText style={parentStyles.recentMetaTime}>{relativeTime(item.createdAt)}</RNText>
            </View>
          </Animated.View>
        </Pressable>
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
  try {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = date.toDateString() === today.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    if (isToday) return 'due Today';
    if (isTomorrow) return 'due Tomorrow';

    return `due ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  } catch {
    return '';
  }
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
    color: '#6B7280',
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
});

export default AnimatedDropCard;
