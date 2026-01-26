/**
 * OrganizeButton
 *
 * "Help me organize" button that calls AI to assign tasks to time blocks.
 */

import React, { useState } from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { useGremlyStore } from '../../../../lib/store/useGremlyStore';
import { useTodayCapacity, useTodayCalendarEvents } from '../../../../lib/store/capacitySelectors';
import { organizeDay, buildOrganizeDayRequest } from '../../../../lib/api/organizeDay';
import { getDateService } from '../../../../lib/date';

const COLORS = {
  mossGreen: '#2E5540',
  mossGreenLight: '#E8F0EC',
  surface: '#FFFFFF',
  inkMuted: '#666666',
};

interface OrganizeButtonProps {
  onComplete?: (summary: string, reasoning?: string[]) => void;
  onError?: (error: string) => void;
}

export function OrganizeButton({ onComplete, onError }: OrganizeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const applyOrganizeAssignments = useGremlyStore((s) => s.applyOrganizeAssignments);

  const capacity = useTodayCapacity();
  const calendarEvents = useTodayCalendarEvents();

  const today = getDateService().getCurrentDate();
  const currentHour = getDateService().getHour();

  // Count unassigned tasks
  const unassignedCount = React.useMemo(() => {
    const todayTodos = todos.filter(
      (t) => !t.archived && !t.completed_at && t.due_day === today && 
             (!t.time_window || t.time_window === 'any')
    );

    console.log('[OrganizeButton] today:', today, 'todayTodos count:', todayTodos.length);
    console.log('[OrganizeButton] all todos due_days:', todos.slice(0, 10).map(t => ({ title: t.name?.substring(0, 20), due_day: t.due_day, time_window: t.time_window })));

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

  const handlePress = async () => {
    setIsLoading(true);

    try {
      const request = buildOrganizeDayRequest({
        todos,
        habits,
        calendarEvents,
        capacity,
        today,
        currentHour,
      });

      console.log('[OrganizeButton] Sending request', {
        tasks: request.tasks.length,
        unassigned: unassignedCount,
      });

      const response = await organizeDay(request);

      if (response.error) {
        console.log('[OrganizeButton] API returned error', { error: response.error });
        onError?.(response.summary || 'Something went wrong');
        return;
      }

      // Apply assignments
      if (response.assignments.length > 0) {
        applyOrganizeAssignments(response.assignments);
      }

      console.log('[OrganizeButton] Applied assignments', {
        assigned: response.assignments.length,
        overflow: response.overflow.length,
      });

      onComplete?.(response.summary, response.reasoning);
    } catch (err) {
      console.log('[OrganizeButton] Error', { error: String(err) });
      onError?.('Failed to organize tasks');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Pressable
      style={[styles.button, isLoading && styles.buttonDisabled]}
      onPress={handlePress}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={COLORS.mossGreen} />
      ) : (
        <Image
          source={require('../../../../assets/buttonforHP.png')}
          style={styles.buttonIcon}
        />
      )}
      <Text style={styles.text}>{isLoading ? 'Organizing...' : 'Help me organize'}</Text>
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
  buttonDisabled: {
    opacity: 0.6,
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
});
