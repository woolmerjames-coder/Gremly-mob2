/**
 * OrganizeButton
 *
 * "Help me organize" button that calls AI to assign tasks to time blocks.
 * Features animated progress bar during organization.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Pressable, Text, StyleSheet, Image, View, Animated, Easing } from 'react-native';
import { useGremlyStore } from '../../../../lib/store/useGremlyStore';
import {
  useCapacityForDate,
  useCalendarEventsForDate,
} from '../../../../lib/store/capacitySelectors';
import {
  organizeDay,
  buildOrganizeDayRequest,
  type TaskAssignment,
} from '../../../../lib/api/organizeDay';
import { getDateService } from '../../../../lib/date';
import {
  selectCompletionsInRolling7Days,
  selectCompletionsInRolling30Days,
} from '../../../../lib/store/selectors';

const COLORS = {
  mossGreen: '#2E5540',
  mossGreenLight: '#E8F0EC',
  surface: '#FFFFFF',
  inkMuted: '#666666',
};

type OrganizePhase = 'idle' | 'organizing' | 'animating' | 'complete';

interface OrganizeButtonProps {
  onComplete?: (summary: string, reasoning?: string[]) => void;
  onError?: (error: string) => void;
  onAnimationStart?: (assignments: TaskAssignment[]) => void;
  onAnimationComplete?: () => void;
  /** Target date in YYYY-MM-DD format. Defaults to today. */
  targetDate?: string;
}

export function OrganizeButton({
  onComplete,
  onError,
  onAnimationStart,
  onAnimationComplete,
  targetDate,
}: OrganizeButtonProps) {
  const [phase, setPhase] = useState<OrganizePhase>('idle');

  // Animation values - using refs without destructuring .current to satisfy React Compiler
  const progressAnimRef = useRef(new Animated.Value(0));
  const pulseAnimRef = useRef(new Animated.Value(1));
  const pulseCompositeRef = useRef<Animated.CompositeAnimation | null>(null);

  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const applyOrganizeAssignments = useGremlyStore((s) => s.applyOrganizeAssignments);
  const hiddenTodayIds = useGremlyStore((s) => s.hiddenTodayIds);
  const habitRolling7 = useGremlyStore(selectCompletionsInRolling7Days);
  const habitRolling30 = useGremlyStore(selectCompletionsInRolling30Days);

  const today = targetDate ?? getDateService().getCurrentDate();
  const currentHour = targetDate ? 0 : getDateService().getHour();

  const capacity = useCapacityForDate(today);
  const calendarEvents = useCalendarEventsForDate(today);

  // Pulse animation for icon during organizing
  useEffect(() => {
    if (phase === 'organizing') {
      pulseCompositeRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimRef.current, {
            toValue: 1.08,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimRef.current, {
            toValue: 1,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseCompositeRef.current.start();
    } else {
      pulseCompositeRef.current?.stop();
      pulseAnimRef.current.setValue(1);
    }

    return () => {
      pulseCompositeRef.current?.stop();
    };
  }, [phase]);

  // Count unassigned tasks
  const unassignedCount = React.useMemo(() => {
    const todayTodos = todos.filter(
      (t) =>
        !t.archived &&
        !t.completed_at &&
        t.due_day === today &&
        (!t.time_window || t.time_window === 'any'),
    );

    console.log('[OrganizeButton] today:', today, 'todayTodos count:', todayTodos.length);
    console.log(
      '[OrganizeButton] all todos due_days:',
      todos.slice(0, 10).map((t) => ({
        title: t.name?.substring(0, 20),
        due_day: t.due_day,
        time_window: t.time_window,
      })),
    );

    const activeHabits = habits.filter((h) => {
      if (h.archived) return false;
      if (!h.start_date || h.start_date > today) return false;
      if (h.end_date && h.end_date < today) return false;
      return !h.time_window || h.time_window === 'any';
    });
    return todayTodos.length + activeHabits.length;
  }, [todos, habits, today]);

  // Don't show if nothing to organize
  if (unassignedCount === 0) {
    return null;
  }

  const startProgressAnimation = () => {
    progressAnimRef.current.setValue(0);
    setPhase('organizing');

    // Animate to 85% over 8 seconds with ease-out
    Animated.timing(progressAnimRef.current, {
      toValue: 0.85,
      duration: 8000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const completeProgressAnimation = (callback: () => void) => {
    // Stop current animation and spring to 100%
    progressAnimRef.current.stopAnimation(() => {
      Animated.timing(progressAnimRef.current, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start(() => {
        // Brief pause at 100% before completing
        setTimeout(() => {
          setPhase('complete');
          progressAnimRef.current.setValue(0);
          callback();
        }, 200);
      });
    });
  };

  const handlePress = async () => {
    if (phase !== 'idle') return;

    startProgressAnimation();

    try {
      const request = buildOrganizeDayRequest({
        todos,
        habits,
        calendarEvents,
        capacity,
        today,
        currentHour,
        hiddenTodayIds,
        habitRolling7,
        habitRolling30,
      });

      console.log('[OrganizeButton] Sending request', {
        tasks: request.tasks.length,
        unassigned: unassignedCount,
      });

      const response = await organizeDay(request);

      if (response.error) {
        console.log('[OrganizeButton] API returned error', { error: response.error });
        completeProgressAnimation(() => {
          setPhase('idle');
          onError?.(response.summary || 'Something went wrong');
        });
        return;
      }

      // Complete progress animation, then trigger card animation
      completeProgressAnimation(() => {
        setPhase('animating');

        // Trigger card exit animations
        if (response.assignments.length > 0) {
          onAnimationStart?.(response.assignments);
        }

        // Calculate animation duration: base 400ms + 150ms per card staggered
        const animationDuration = 400 + response.assignments.length * 150;

        setTimeout(() => {
          // Now actually apply the assignments to Zustand
          if (response.assignments.length > 0) {
            applyOrganizeAssignments(response.assignments);
          }

          console.log('[OrganizeButton] Applied assignments', {
            assigned: response.assignments.length,
            overflow: response.overflow.length,
          });

          onAnimationComplete?.();
          setPhase('idle');
          onComplete?.(response.summary, response.reasoning);
        }, animationDuration);
      });
    } catch (err) {
      console.log('[OrganizeButton] Error', { error: String(err) });
      completeProgressAnimation(() => {
        setPhase('idle');
        onError?.('Failed to organize tasks');
      });
    }
  };

  // Progress bar width interpolation
  const progressWidth = progressAnimRef.current.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Render progress bar when organizing or animating
  if (phase === 'organizing' || phase === 'animating') {
    return (
      <View style={styles.progressContainer}>
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        <View style={styles.progressContent}>
          <Animated.Image
            source={require('../../../../assets/buttonforHP.png')}
            style={[styles.buttonIcon, { transform: [{ scale: pulseAnimRef.current }] }]}
          />
          <Text style={styles.text}>Organizing...</Text>
        </View>
      </View>
    );
  }

  // Default idle button
  return (
    <Pressable style={styles.button} onPress={handlePress} disabled={phase !== 'idle'}>
      <Image source={require('../../../../assets/buttonforHP.png')} style={styles.buttonIcon} />
      <Text style={styles.text}>Help me organize</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#BFD8C0',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    gap: 8,
  },
  buttonIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.mossGreen,
  },
  // Progress bar styles
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.mossGreenLight,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(46, 85, 64, 0.25)',
    borderRadius: 8,
  },
  progressContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 1,
  },
});
