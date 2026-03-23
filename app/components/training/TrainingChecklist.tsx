import React, { useCallback, useMemo, useState } from 'react';
import {
  Dimensions,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Check,
  Coffee,
  FolderOpen,
  Lock,
  MessageCircle,
  Moon,
  Repeat,
  Sparkles,
} from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import {
  TRAINING_LEVELS,
  getVisibleLevel,
  getItemFraction,
  getProgressStage,
  getProgressLabel,
  getItemsForLevel,
  getCompletedCount,
  getRequiredItemCount,
  getLevelUnlockHint,
} from '../../../lib/training/trainingManager';
import type { TrainingItemConfig } from '../../../lib/training/trainingTypes';
import type { ProgressStage } from '../../../lib/training/trainingTypes';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ────────────────────────────────────────────────────────────
// Icon Map — maps iconName strings from TrainingItemConfig to components
// ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  ArrowDownToLine,
  Moon,
  Coffee,
  Repeat,
  MessageCircle,
  FolderOpen,
  CalendarCheck,
  BookOpen,
  Lock,
};

// ────────────────────────────────────────────────────────────
// Colors
// ────────────────────────────────────────────────────────────

const C = {
  mossGreen: BRAND.colors.mossGreen,
  sageMist: BRAND.colors.sageMist,
  goldenPear: BRAND.colors.goldenPear,
  linenCream: BRAND.colors.linenCream,
  charcoalInk: BRAND.colors.charcoalInk,
  inkMuted: BRAND.colors.inkMuted,
  track: '#ECEEE8',
  progressBar: '#F0F1EC',
  dragHandle: '#E4E6DE',
  labelMuted: '#A8AC9F',
  descMuted: '#B8BCAF',
  textMuted: '#6B6F63',
  lockedBg: '#FAFBF8',
  lockedBorder: '#EFF0EB',
  urgentBadge: '#B85A3E',
  rewardBg: '#EFF3EB',
  rewardBorder: '#DDE4D6',
  sageDark: '#3A5433',
  rewardBody: '#6B8A62',
  sageMid: '#8FB89A',
  iconDefault: '#E8EAE2',
};

// ────────────────────────────────────────────────────────────
// Subtitle helper
// ────────────────────────────────────────────────────────────

function getSubtitle(completedCount: number): string {
  if (completedCount === 0) {
    return 'Teach Gremly how your brain works in just a few minutes a day. Complete the challenge to see what it learns about you.';
  }
  if (completedCount <= 2) {
    return "You're building the rhythm. Drop thoughts, sweep before bed. A few minutes is all it takes.";
  }
  return "Gremly's learning fast. Finish the last few skills to see what it's figured out about you.";
}

// ────────────────────────────────────────────────────────────
// Progress Ring (per-item, 28×28)
// ────────────────────────────────────────────────────────────

const RING_SIZE = 28;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function getArcColor(stage: ProgressStage): string {
  if (stage === 'complete' || stage === 'almost_there') return C.mossGreen;
  if (stage === 'getting_there') return C.sageMid;
  return C.labelMuted;
}

function ItemProgressRing({
  fraction,
  stage,
}: {
  fraction: number;
  stage: ProgressStage;
}) {
  const progress = useSharedValue(fraction);

  React.useEffect(() => {
    progress.value = withTiming(fraction, {
      duration: 600,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [fraction, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.value),
  }));

  if (stage === 'complete') {
    return (
      <View style={styles.completedRing}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill={C.sageMist}
            stroke={C.mossGreen}
            strokeWidth={RING_STROKE}
          />
          <Polyline
            points="9,14 12.5,17.5 19,11"
            fill="none"
            stroke={C.mossGreen}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    );
  }

  return (
    <Svg
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      style={{ transform: [{ rotate: '-90deg' }] }}
    >
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        stroke={C.track}
        strokeWidth={RING_STROKE}
      />
      <AnimatedCircle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        stroke={getArcColor(stage)}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}

// ────────────────────────────────────────────────────────────
// Item Row
// ────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: TrainingItemConfig;
  stage: ProgressStage;
  fraction: number;
  isComplete: boolean;
  isExpanded: boolean;
  onPress: () => void;
  onCta: () => void;
}

function ItemRow({ item, stage, fraction, isComplete, isExpanded, onPress, onCta }: ItemRowProps) {
  const IconComponent = ICON_MAP[item.iconName];
  const isCalendar = item.id === 'calendar';
  const isOptional = !item.required;

  // Sublabel
  let sublabel: string;
  if (isCalendar && !isComplete) {
    sublabel = 'Recommended';
  } else if (isCalendar && isComplete) {
    sublabel = 'Connected';
  } else {
    sublabel = getProgressLabel(stage);
  }

  // Colors
  const labelColor = isComplete
    ? C.labelMuted
    : isOptional && !isComplete
      ? C.labelMuted
      : C.charcoalInk;
  const sublabelColor = isComplete
    ? C.mossGreen
    : stage === 'almost_there'
      ? C.goldenPear
      : C.descMuted;
  const iconBg = isComplete ? C.sageMist : C.iconDefault;
  const iconOpacity = isOptional && !isComplete ? 0.55 : 1;

  return (
    <View>
      <Pressable style={styles.itemRow} onPress={onPress}>
        {/* Left icon */}
        <View style={[styles.iconContainer, { backgroundColor: iconBg, opacity: iconOpacity }]}>
          {IconComponent && <IconComponent size={16} color={isComplete ? C.mossGreen : C.textMuted} />}
        </View>

        {/* Middle: label + sublabel */}
        <View style={styles.itemTextContainer}>
          <Text style={[styles.itemLabel, { color: labelColor }]}>{item.label}</Text>
          {sublabel ? (
            <Text style={[styles.itemSublabel, { color: sublabelColor }]}>{sublabel}</Text>
          ) : null}
        </View>

        {/* Right: progress ring */}
        <ItemProgressRing fraction={fraction} stage={stage} />
      </Pressable>

      {/* Expanded detail */}
      {isExpanded && (
        <View style={styles.expandedDetail}>
          <Text style={styles.expandedDescription}>{item.description}</Text>
          <Pressable style={styles.ctaButton} onPress={onCta}>
            <Text style={styles.ctaText}>{item.ctaLabel}</Text>
            <ArrowRight size={14} color={C.mossGreen} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Locked Level Section
// ────────────────────────────────────────────────────────────

function LockedLevelSection({ level }: { level: 2 | 3 }) {
  return (
    <View style={styles.lockedSection}>
      <View style={styles.lockedRow}>
        <Lock size={14} color={C.labelMuted} />
        <Text style={styles.lockedText}>Gremly is learning...</Text>
      </View>
      <Text style={styles.lockedHint}>{getLevelUnlockHint(level)}</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Days-left helper
// ────────────────────────────────────────────────────────────

function getDaysLeft(trainingStartedAt: string | null): number {
  if (!trainingStartedAt) return 7;
  const started = new Date(trainingStartedAt).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - started) / (1000 * 60 * 60 * 24));
  return Math.max(0, 7 - elapsed);
}

// ────────────────────────────────────────────────────────────
// Level description helper
// ────────────────────────────────────────────────────────────

function getLevelDescription(level: number): string {
  if (level === 1) return 'Your daily ritual. A few minutes, morning and night.';
  if (level === 2) return 'Build intention into your day.';
  return 'The tools that tie it all together.';
}

// ════════════════════════════════════════════════════════════
// TrainingChecklist
// ════════════════════════════════════════════════════════════

interface TrainingChecklistProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function TrainingChecklist({ visible, onDismiss }: TrainingChecklistProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Store data
  const trainingProgress = useGremlyStore((s) => s.trainingProgress);
  const trainingLevel = useGremlyStore((s) => s.trainingLevel);
  const trainingItemsCompleted = useGremlyStore((s) => s.trainingItemsCompleted);
  const trainingStartedAt = useGremlyStore((s) => s.trainingStartedAt);

  // Local state
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Derived
  const visibleLevel = useMemo(
    () => getVisibleLevel(trainingProgress),
    [trainingProgress],
  );
  const completedCount = useMemo(
    () => getCompletedCount(trainingItemsCompleted),
    [trainingItemsCompleted],
  );
  const requiredCount = getRequiredItemCount();
  const progressWidth = requiredCount > 0 ? (completedCount / requiredCount) * 100 : 0;
  const daysLeft = getDaysLeft(trainingStartedAt);
  const subtitle = getSubtitle(completedCount);

  const toggleExpand = useCallback((itemId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
  }, []);

  const handleCta = useCallback(
    (navigateTo: string) => {
      onDismiss();
      // Small delay to let the modal dismiss before navigating
      setTimeout(() => {
        (navigation as any).navigate(navigateTo);
      }, 300);
    },
    [navigation, onDismiss],
  );

  const renderLevelSection = useCallback(
    (levelNum: 1 | 2 | 3) => {
      const levelDef = TRAINING_LEVELS.find((l) => l.level === levelNum);
      if (!levelDef) return null;

      // Locked
      if (levelNum > visibleLevel) {
        return (
          <View key={`level-${levelNum}`} style={styles.levelSection}>
            <LockedLevelSection level={levelNum as 2 | 3} />
          </View>
        );
      }

      // Unlocked
      const items = getItemsForLevel(levelNum);
      return (
        <View key={`level-${levelNum}`} style={styles.levelSection}>
          <Text style={styles.levelTitle}>{levelDef.title.toUpperCase()}</Text>
          <Text style={styles.levelDesc}>{getLevelDescription(levelNum)}</Text>
          {items.map((item) => {
            const stage = getProgressStage(item.id, trainingProgress);
            const fraction = getItemFraction(item.id, trainingProgress);
            const isComplete = trainingItemsCompleted.includes(item.id);
            return (
              <ItemRow
                key={item.id}
                item={item}
                stage={stage}
                fraction={fraction}
                isComplete={isComplete}
                isExpanded={expandedItemId === item.id}
                onPress={() => toggleExpand(item.id)}
                onCta={() => handleCta(item.navigateTo)}
              />
            );
          })}
        </View>
      );
    },
    [visibleLevel, trainingProgress, trainingItemsCompleted, expandedItemId, toggleExpand, handleCta],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Drag Handle */}
          <View style={styles.dragHandleRow}>
            <View style={styles.dragHandle} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* ── Header ── */}
            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>7-day challenge</Text>
              <View
                style={[
                  styles.daysLeftBadge,
                  daysLeft <= 2 && styles.daysLeftBadgeUrgent,
                ]}
              >
                <Text
                  style={[
                    styles.daysLeftText,
                    daysLeft <= 2 && styles.daysLeftTextUrgent,
                  ]}
                >
                  {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                </Text>
              </View>
            </View>

            <Text style={styles.subtitle}>{subtitle}</Text>

            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressWidth}%` }]} />
            </View>
            <Text style={styles.progressCount}>
              {completedCount} of {requiredCount}
            </Text>

            {/* ── Level Sections ── */}
            {([1, 2, 3] as const).map(renderLevelSection)}

            {/* ── Reward Card ── */}
            <View style={styles.rewardCard}>
              <Sparkles size={20} color={C.sageDark} />
              <Text style={styles.rewardTitle}>See what Gremly learned about you</Text>
              <Text style={styles.rewardBody}>
                Complete the challenge and Gremly will show you patterns, insights, and connections
                from your first week.
              </Text>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// Styles
// ════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: BRAND.colors.linenCream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.85,
    paddingBottom: 34, // safe area
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 16,
  },
  dragHandleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.dragHandle,
  },
  scrollView: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    fontFamily: BRAND.typography.subhead.fontFamily,
  },
  daysLeftBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BRAND.radius.pill,
    backgroundColor: 'rgba(224,196,122,0.18)',
  },
  daysLeftBadgeUrgent: {
    backgroundColor: 'rgba(184,90,62,0.12)',
  },
  daysLeftText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.goldenPear,
    fontFamily: BRAND.typography.bodyMedium.fontFamily,
  },
  daysLeftTextUrgent: {
    color: C.urgentBadge,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: BRAND.colors.inkMuted,
    fontFamily: BRAND.typography.body.fontFamily,
    marginBottom: 14,
  },

  // Progress bar
  progressTrack: {
    height: 4,
    backgroundColor: C.progressBar,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: 4,
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 2,
  },
  progressCount: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    fontFamily: BRAND.typography.body.fontFamily,
    marginBottom: 18,
  },

  // Level sections
  levelSection: {
    marginBottom: 18,
  },
  levelTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: C.labelMuted,
    fontFamily: BRAND.typography.bodyMedium.fontFamily,
    marginBottom: 2,
  },
  levelDesc: {
    fontSize: 12,
    color: C.descMuted,
    fontFamily: BRAND.typography.body.fontFamily,
    marginBottom: 10,
  },

  // Item row
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: BRAND.radius.md,
  },
  iconContainer: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  itemTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  itemLabel: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: BRAND.typography.bodyMedium.fontFamily,
  },
  itemSublabel: {
    fontSize: 12,
    marginTop: 1,
    fontFamily: BRAND.typography.body.fontFamily,
  },

  // Completed ring
  completedRing: {},

  // Expanded detail
  expandedDetail: {
    paddingLeft: 46, // icon width (30) + marginRight (10) + 6px padding
    paddingRight: 6,
    paddingBottom: 8,
  },
  expandedDescription: {
    fontSize: 13,
    lineHeight: 19.5, // 13 * 1.5
    color: C.textMuted,
    fontFamily: BRAND.typography.body.fontFamily,
    marginBottom: 10,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: BRAND.colors.mossGreen,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 6,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
    fontFamily: BRAND.typography.bodyMedium.fontFamily,
  },

  // Locked section
  lockedSection: {
    backgroundColor: C.lockedBg,
    borderWidth: 1,
    borderColor: C.lockedBorder,
    borderRadius: BRAND.radius.md,
    padding: 14,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  lockedText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.labelMuted,
    fontFamily: BRAND.typography.bodyMedium.fontFamily,
  },
  lockedHint: {
    fontSize: 12,
    color: C.descMuted,
    fontFamily: BRAND.typography.body.fontFamily,
  },

  // Reward card
  rewardCard: {
    backgroundColor: C.rewardBg,
    borderWidth: 1,
    borderColor: C.rewardBorder,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  rewardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.sageDark,
    fontFamily: BRAND.typography.subhead.fontFamily,
    marginTop: 8,
    textAlign: 'center',
  },
  rewardBody: {
    fontSize: 12,
    color: C.rewardBody,
    fontFamily: BRAND.typography.body.fontFamily,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 4,
  },
});
