/**
 * StepOrganize — "Good picks. Now let's organize"
 *
 * Lock in non-negotiable tasks, assign time blocks, then
 * let Gremly organize the rest. Features a full-screen
 * celebration animation during and after organizing.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  LayoutAnimation,
} from 'react-native';
import { Text } from '../../../ui';
import { Lock, Unlock, ChevronLeft, Sunrise, Sun, Moon, Repeat } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useCapacityForDate, useCalendarEventsForDate } from '../../../lib/store/capacitySelectors';
import {
  organizeDay,
  buildOrganizeDayRequest,
  type TaskAssignment,
} from '../../../lib/api/organizeDay';
import { getDateService } from '../../../lib/date';
import {
  selectCompletionsInRolling7Days,
  selectCompletionsInRolling30Days,
} from '../../../lib/store/selectors';
import type { TaskItemData } from './components';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_BUTTON_ICON = require('../../../assets/buttonforHP.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MORNING_BRIEF_GREMLY = require('../../../assets/mascot/morningbriefgremly.png');

// (Dimensions removed — not needed after all-done state removal)

// ═══════════════════════════════════════════════════════════════════
// Fun rotating words
// ═══════════════════════════════════════════════════════════════════

const ORGANIZING_WORDS = [
  'Organizing...',
  'Discombobulating...',
  'Sorting...',
  'Shuffling...',
  'Prioritizing...',
  'Aligning the stars...',
  'Crunching numbers...',
  'Juggling tasks...',
  'Working some magic...',
  'Plotting world domination...',
  'Doing the thing...',
  'Almost there...',
  'Slotting it in...',
  'Making it make sense...',
];

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function fmt(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const BLOCK_OPTIONS = [
  { key: null, label: 'Any time', icon: null, color: '#888', bg: 'transparent' },
  { key: 'morning', label: 'Morning', icon: Sunrise, color: '#D4A574', bg: '#FBF3EB' },
  { key: 'day', label: 'Afternoon', icon: Sun, color: '#C9956C', bg: '#FAF0E8' },
  { key: 'evening', label: 'Evening', icon: Moon, color: '#A89BC9', bg: '#F3F0FA' },
] as const;

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface StepOrganizeProps {
  targetDate?: string;
  isPrioritizing: boolean;
  selectedIds: Set<string>;
  lockedIds: Set<string>;
  isOverCapacity: boolean;
  hasTasksToOrganize: boolean;
  committedTasks: TaskItemData[];
  onToggleLock: (task: TaskItemData) => void;
  onAssignBlock: (
    taskId: string,
    taskType: 'todo' | 'habit',
    block: 'morning' | 'day' | 'evening' | null,
  ) => void;
  onOrganizeComplete: (summary: string, reasoning: string[]) => void;
  onOrganizeError: (error: string) => void;
  onAnimationStart: (assignments: TaskAssignment[]) => void;
  onAnimationComplete: () => void;
  onSaveParked?: () => void;
  onContinue: () => void;
  onShowCelebration: () => void;
  onSkip: () => void;
  onBack?: () => void;
}

// ═══════════════════════════════════════════════════════════════════
// Rotating Word Component
// ═══════════════════════════════════════════════════════════════════

function RotatingWord({ isActive }: { isActive: boolean }) {
  const [wordIndex, setWordIndex] = useState(0);
  const [fadeAnim] = useState(() => new Animated.Value(1));
  const [slideAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!isActive) {
      setWordIndex(0);
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      return;
    }

    const interval = setInterval(() => {
      // Fade out + slide up
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -12,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setWordIndex((prev) => (prev + 1) % ORGANIZING_WORDS.length);
        slideAnim.setValue(12);
        // Fade in + slide down
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }, 1800);

    return () => clearInterval(interval);
  }, [isActive, fadeAnim, slideAnim]);

  return (
    <View style={styles.rotatingWordContainer}>
      <Animated.Text
        style={[
          styles.rotatingWordText,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {ORGANIZING_WORDS[wordIndex]}
      </Animated.Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function StepOrganize({
  targetDate,
  isPrioritizing,
  selectedIds,
  lockedIds,
  isOverCapacity,
  hasTasksToOrganize,
  committedTasks,
  onToggleLock,
  onAssignBlock,
  onOrganizeComplete,
  onOrganizeError,
  onAnimationStart,
  onAnimationComplete,
  onSaveParked,
  onContinue,
  onShowCelebration,
  onSkip,
  onBack,
}: StepOrganizeProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fullscreen organizing overlay states
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [fullscreenFade] = useState(() => new Animated.Value(0));
  const [mascotScale] = useState(() => new Animated.Value(0.8));
  const [mascotBounce] = useState(() => new Animated.Value(0));

  // Button press animation
  const [buttonScale] = useState(() => new Animated.Value(1));
  const [gremlySpinAnim] = useState(() => new Animated.Value(0));

  // Auto-skip when nothing to organize
  useEffect(() => {
    if (!hasTasksToOrganize) {
      onContinue();
    }
  }, [hasTasksToOrganize, onContinue]);

  // ── Organize logic ────────────────────────────────────────────
  type OrganizePhase = 'idle' | 'organizing' | 'animating' | 'complete';
  const [phase, setPhase] = useState<OrganizePhase>('idle');

  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const applyOrganizeAssignments = useGremlyStore((s) => s.applyOrganizeAssignments);
  const slotUnpositionedTasks = useGremlyStore((s) => s.slotUnpositionedTasks);
  const hiddenTodayIds = useGremlyStore((s) => s.hiddenTodayIds);
  const habitRolling7 = useGremlyStore(selectCompletionsInRolling7Days);
  const habitRolling30 = useGremlyStore(selectCompletionsInRolling30Days);

  const today = targetDate ?? getDateService().getCurrentDate();
  const currentHour = targetDate ? 0 : getDateService().getHour();
  const capacity = useCapacityForDate(today);
  const calendarEvents = useCalendarEventsForDate(today);

  const isDisabled = isPrioritizing && (isOverCapacity || (selectedIds && selectedIds.size === 0));
  const isOrganizing = phase !== 'idle';

  // Button press animation
  const animateButtonPress = () => {
    // Press down
    Animated.spring(buttonScale, {
      toValue: 0.95,
      friction: 8,
      useNativeDriver: true,
    }).start(() => {
      // Bounce back up
      Animated.spring(buttonScale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();
    });

    // Spin the Gremly face
    gremlySpinAnim.setValue(0);
    Animated.timing(gremlySpinAnim, {
      toValue: 1,
      duration: 1200,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  // ── Fullscreen overlay animation (fires after React renders) ──
  useEffect(() => {
    if (!showFullscreen) return;

    // Animate overlay in
    Animated.parallel([
      Animated.timing(fullscreenFade, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(mascotScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Gentle mascot bob
    const bobAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(mascotBounce, {
          toValue: -8,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(mascotBounce, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    bobAnim.start();

    // Fire the API call now that the overlay is visible
    const runOrganize = async () => {
      try {
        const filteredTodos =
          isPrioritizing && selectedIds ? todos.filter((t) => selectedIds.has(t.id)) : todos;
        const filteredHabits =
          isPrioritizing && selectedIds ? habits.filter((h) => selectedIds.has(h.id)) : habits;

        const request = buildOrganizeDayRequest({
          todos: filteredTodos,
          habits: filteredHabits,
          calendarEvents,
          capacity,
          today,
          currentHour,
          hiddenTodayIds,
          habitRolling7,
          habitRolling30,
          lockedIds: isPrioritizing ? lockedIds : undefined,
        });

        const response = await organizeDay(request);

        if (response.error) {
          setPhase('idle');
          setTimeout(() => {
            Animated.timing(fullscreenFade, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }).start(() => {
              setShowFullscreen(false);
              fullscreenFade.setValue(0);
              mascotScale.setValue(0.8);
              mascotBounce.setValue(0);
            });
            onOrganizeError(response.summary || 'Something went wrong');
          }, 500);
          return;
        }

        // Success — apply assignments
        if (response.assignments.length > 0) {
          onAnimationStart(response.assignments);
          applyOrganizeAssignments(response.assignments);
        }
        slotUnpositionedTasks();
        onAnimationComplete();
        setPhase('idle');
        onOrganizeComplete(response.summary, response.reasoning ?? []);
        onSaveParked?.();

        // Cross-fade to "All done" within the overlay (no flash)
        showAllDoneFinale();
      } catch {
        setPhase('idle');
        setTimeout(() => {
          Animated.timing(fullscreenFade, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            setShowFullscreen(false);
            fullscreenFade.setValue(0);
            mascotScale.setValue(0.8);
            mascotBounce.setValue(0);
          });
          onOrganizeError('Failed to organize tasks');
        }, 500);
      }
    };
    runOrganize();

    return () => {
      bobAnim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFullscreen]);

  const showAllDoneFinale = () => {
    // Hand off to stepper celebration immediately.
    // Our rotating words overlay stays visible (zIndex 100) while
    // the stepper celebration (zIndex 200) paints on top.
    // The stepper will advance to Plan and fade out its overlay.
    // Our overlay gets unmounted when the step transitions away.
    onShowCelebration();
  };

  const handleOrganize = () => {
    if (phase !== 'idle' || isDisabled) return;

    // Button press effect (includes 1200ms Gremly spin)
    animateButtonPress();

    // Wait for spin to finish, then show fullscreen overlay
    setTimeout(() => {
      setShowFullscreen(true);
      setPhase('organizing');
    }, 1400);
  };

  // Gremly spin interpolation
  const gremlyRotation = gremlySpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // ── Derived data ──────────────────────────────────────────────
  const handleToggleBlock = useCallback(
    (task: TaskItemData, blockKey: 'morning' | 'day' | 'evening' | null) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onAssignBlock(task.id, task.type as 'todo' | 'habit', blockKey);
      setExpandedId(null);
    },
    [onAssignBlock],
  );

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. HEADLINE ─────────────────────────────────────── */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>Good picks. Now let's organize</Text>
        </View>

        {/* ── 2. PRIMARY CTA — Let Gremly organize ───────────── */}
        <Animated.View
          style={[
            styles.gremlyButtonOuter,
            {
              transform: [{ scale: buttonScale }],
            },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.gremlyButton,
              isDisabled && styles.gremlyButtonDisabled,
              pressed && !isDisabled && !isOrganizing && { backgroundColor: '#AECBB0' },
            ]}
            onPress={handleOrganize}
            disabled={!!isDisabled || isOrganizing}
          >
            <View style={styles.gremlyButtonLayout}>
              <Animated.Image
                source={GREMLY_BUTTON_ICON}
                style={[styles.gremlyButtonIcon, { transform: [{ rotate: gremlyRotation }] }]}
                resizeMode="contain"
              />
              <View style={styles.gremlyButtonTextArea}>
                <Text
                  style={[styles.gremlyButtonText, isDisabled && styles.gremlyButtonTextDisabled]}
                >
                  Let Gremly organize
                </Text>
                {!isDisabled && (
                  <Text style={styles.gremlyButtonHint}>Slots tasks into your free time</Text>
                )}
              </View>
            </View>
          </Pressable>
        </Animated.View>

        {/* ── 3. OPTIONAL FINE-TUNE SECTION ───────────────────── */}
        <View style={styles.fineTuneHeader}>
          <View style={styles.fineTuneLine} />
          <Text style={styles.fineTuneLabel}>or fine-tune first</Text>
          <View style={styles.fineTuneLine} />
        </View>

        <View style={styles.hintRow}>
          <Lock size={12} color={BRAND.colors.inkMuted} />
          <Text style={styles.hintText}>Lock in must-dos</Text>
          <View style={styles.hintDot} />
          <Sunrise size={12} color={BRAND.colors.inkMuted} />
          <Text style={styles.hintText}>Set a time of day</Text>
        </View>

        {/* ── 4. TASK LIST ────────────────────────────────────── */}
        {committedTasks.map((task, i) => {
          const isExpanded = expandedId === task.id;
          const isLocked = lockedIds.has(task.id);
          const blockKey = task.timeWindow === 'any' ? null : (task.timeWindow ?? null);
          const blockInfo = BLOCK_OPTIONS.find((b) => b.key === blockKey) ?? BLOCK_OPTIONS[0];

          return (
            <View
              key={task.id}
              style={[
                styles.organizeRow,
                i < committedTasks.length - 1 && styles.organizeRowBorder,
              ]}
            >
              <View style={styles.organizeRowInner}>
                <Pressable
                  onPress={() => onToggleLock(task)}
                  style={[styles.lockButton, isLocked && styles.lockButtonActive]}
                >
                  {isLocked ? (
                    <Lock size={14} color="#fff" strokeWidth={2.5} />
                  ) : (
                    <Unlock size={14} color={BRAND.colors.inkMuted} />
                  )}
                </Pressable>

                <View style={styles.organizeNameArea}>
                  <Text
                    style={[styles.organizeName, isLocked && styles.organizeNameLocked]}
                    numberOfLines={1}
                  >
                    {task.title}
                  </Text>
                  {task.type === 'habit' && (
                    <View style={styles.habitMetaRow}>
                      <Repeat size={9} color={BRAND.colors.inkMuted} />
                      <Text style={styles.habitMetaText}>Habit</Text>
                    </View>
                  )}
                </View>

                <Pressable
                  onPress={() => setExpandedId(isExpanded ? null : task.id)}
                  style={[
                    styles.blockBadge,
                    blockKey && { backgroundColor: blockInfo.bg, borderColor: 'transparent' },
                  ]}
                >
                  {blockKey && blockInfo.icon && (
                    <blockInfo.icon size={11} color={blockInfo.color} />
                  )}
                  <Text style={[styles.blockBadgeText, blockKey && { color: blockInfo.color }]}>
                    {blockKey ? blockInfo.label : 'Any time'}
                  </Text>
                  <Text style={styles.blockBadgeChevron}>▼</Text>
                </Pressable>

                <Text style={styles.organizeTime}>{fmt(task.estimatedMinutes || 0)}</Text>
              </View>

              {isExpanded && (
                <View style={styles.blockPicker}>
                  {BLOCK_OPTIONS.map((opt) => {
                    const isActive = blockKey === opt.key;
                    return (
                      <Pressable
                        key={opt.key ?? 'any'}
                        onPress={() => handleToggleBlock(task, opt.key)}
                        style={[
                          styles.blockPickerOption,
                          isActive && {
                            backgroundColor: opt.bg || '#E8F0EB',
                            borderColor: opt.color,
                          },
                        ]}
                      >
                        {opt.icon && <opt.icon size={12} color={opt.color} />}
                        <Text
                          style={[
                            styles.blockPickerText,
                            isActive && { color: opt.color, fontWeight: '700' },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── STICKY FOOTER ──────────────────────────────────────── */}
      <View style={styles.stickyFooter}>
        <View style={styles.footerRow}>
          {onBack && (
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
              onPress={onBack}
            >
              <ChevronLeft size={20} color={BRAND.colors.inkMuted} />
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [styles.skipButton, pressed && { opacity: 0.7 }]}
            onPress={onSkip}
          >
            <Text style={styles.skipButtonText}>I'll arrange it myself →</Text>
          </Pressable>
        </View>
        <Pressable
          style={({ pressed }) => [styles.exitPressable, pressed && { opacity: 0.5 }]}
          onPress={onSkip}
        >
          <Text style={styles.exitText}>Exit</Text>
        </Pressable>
      </View>

      {/* ── FULLSCREEN ORGANIZING OVERLAY ────────────────────── */}
      {showFullscreen && (
        <Animated.View style={[styles.fullscreenOverlay, { opacity: fullscreenFade }]}>
          <View style={styles.fullscreenContent}>
            <Animated.Image
              source={MORNING_BRIEF_GREMLY}
              style={[
                styles.fullscreenMascot,
                {
                  transform: [{ scale: mascotScale }, { translateY: mascotBounce }],
                },
              ]}
              resizeMode="contain"
            />
            <RotatingWord isActive={showFullscreen} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 8 },

  // Title
  titleArea: { paddingHorizontal: 20, marginTop: 16, minHeight: 40 },
  title: { fontSize: 22, fontWeight: '700', color: BRAND.colors.charcoalInk },

  // Gremly CTA button
  gremlyButtonOuter: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 4,
    borderRadius: 16,
    shadowColor: '#2E5540',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  gremlyButton: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#BFD8C0',
    overflow: 'hidden',
  },
  gremlyButtonDisabled: {
    backgroundColor: '#E8E6E1',
  },
  gremlyButtonLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    zIndex: 1,
  },
  gremlyButtonIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  gremlyButtonTextArea: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  gremlyButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2E5540',
  },
  gremlyButtonTextDisabled: {
    color: '#B0AEA8',
  },
  gremlyButtonHint: {
    fontSize: 12,
    color: '#2E5540',
    opacity: 0.6,
    marginTop: 2,
  },

  // "or fine-tune first" divider
  fineTuneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 28,
    marginBottom: 8,
    gap: 12,
  },
  fineTuneLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E8E6E1',
  },
  fineTuneLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    letterSpacing: 0.3,
  },

  // Compact hint row
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 12,
    minHeight: 20,
  },
  hintText: {
    fontSize: 11,
    color: BRAND.colors.inkMuted,
  },
  hintDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#D6D4CF',
  },

  // Organize rows
  organizeRow: { paddingHorizontal: 20 },
  organizeRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E6E1',
  },
  organizeRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  lockButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E8E6E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockButtonActive: {
    backgroundColor: BRAND.colors.mossGreen,
    borderColor: BRAND.colors.mossGreen,
  },
  organizeNameArea: { flex: 1, minWidth: 0 },
  organizeName: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  organizeNameLocked: { fontWeight: '600' },
  habitMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  habitMetaText: { fontSize: 10, color: BRAND.colors.inkMuted },
  blockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 90,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E8E6E1',
  },
  blockBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  blockBadgeChevron: { fontSize: 8, color: '#AAA' },
  organizeTime: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    fontVariant: ['tabular-nums'],
    width: 32,
    textAlign: 'right',
  },

  // Block picker
  blockPicker: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 10,
    paddingLeft: 38,
  },
  blockPickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FEFDFB',
    borderWidth: 1,
    borderColor: '#E8E6E1',
  },
  blockPickerText: { fontSize: 11, fontWeight: '500', color: '#888' },

  // Footer
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: BRAND.colors.linenCream ?? '#F9F6F1',
    shadowColor: '#F9F6F1',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#E8E6E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FEFDFB',
    borderWidth: 1.5,
    borderColor: '#E8E6E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  exitPressable: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  exitText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },

  // Fullscreen overlay
  fullscreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#BFD8C0',
    zIndex: 100,
  },
  fullscreenContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  fullscreenMascot: {
    width: 160,
    height: 160,
    marginBottom: 28,
  },

  // Rotating word
  rotatingWordContainer: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 280,
  },
  rotatingWordText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2E5540',
    textAlign: 'center',
  },
});

export default StepOrganize;
