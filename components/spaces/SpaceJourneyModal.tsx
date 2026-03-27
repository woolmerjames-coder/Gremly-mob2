/**
 * SpaceJourneyModal - Unified Goal + Key Dates modal for a Space
 *
 * Features:
 * - Goals section (up to 3 goals per Space)
 * - Inline goal creation and editing
 * - Check-ins expansion per goal
 * - Key dates section (upcoming, past, dateless)
 * - Calendar add button for quick date picker
 * - Chat with goal support
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  X,
  Calendar,
  ChevronDown,
  ChevronUp,
  Star,
  Plus,
  Pencil,
  BookOpen,
  MessageCircle,
  Trash2,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO, isToday, isTomorrow, isFuture, differenceInDays } from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BRAND } from '../../design/brand';
import { useEventsForSpace, useGoalsForSpace, useSpaceById } from '../../lib/store/selectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { getTodayDayString, getDateService } from '../../lib/date';
import { env, getEnv } from '../../lib/env';
import type { Note } from '../../lib/types';

// --- Helpers to read env vars ---
const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

const readCortexUrl = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_CORTEX_URL');
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

const readSupabaseAnonKey = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const fromEnvConfig = typeof env.supabaseAnonKey === 'string' ? env.supabaseAnonKey : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
};

interface GoalContext {
  type: 'goal_checkin';
  goal_id: string;
  goal_name: string;
  space_name: string;
}

interface SpaceJourneyModalProps {
  visible: boolean;
  spaceId: string;
  spaceName?: string;
  onClose: () => void;
  onEventPress: (event: Note) => void;
  onGoalChat?: (goal: Note, checkIns: Note[]) => void; // Open space chat with goal context
  onCheckInPress?: (checkIn: Note) => void; // Open check-in note
  onGoalCheckIn?: (goal: Note, spaceName: string) => void; // Open goal check-in journal
  onAddEvent: (title: string, date: string) => void;
  initialEditGoalId?: string | null; // If set, auto-open edit mode for this goal
}

const MAX_GOALS = 3;

/**
 * Format date for display: "Feb 18" or "Today"
 */
function formatDateDisplay(targetDate: string): string {
  const date = parseISO(targetDate);
  if (isToday(date)) return 'Today';
  return format(date, 'MMM d');
}

/**
 * Format time: "14:00" -> "2pm"
 */
function formatTime(time24: string): string {
  const [hours] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'pm' : 'am';
  const hours12 = hours % 12 || 12;
  return `${hours12}${period}`;
}

/**
 * Format countdown display based on days difference
 */
function formatCountdown(targetDate: string, isPastDate: boolean): string {
  const date = parseISO(targetDate);
  const today = getDateService().now();
  today.setHours(0, 0, 0, 0);

  const days = Math.abs(differenceInDays(date, today));

  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';

  if (isPastDate) {
    if (days === 1) return '1 day ago';
    if (days < 7) return `${days} days ago`;
    if (days < 30) {
      const weeks = Math.round(days / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    const months = Math.round(days / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }

  // Future dates
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  if (days < 90) {
    const weeks = Math.round(days / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''}`;
  }
  const months = Math.round(days / 30);
  return `${months} month${months > 1 ? 's' : ''}`;
}

// Goal Block Component
interface GoalBlockProps {
  goal: Note;
  spaceId: string;
  checkIns: Note[]; // Pass check-ins from parent to avoid hook in child
  isEditing: boolean;
  onEditToggle: () => void;
  onSave: (id: string, title: string, targetDate: string | null) => void;
  onRemove: (id: string) => void;
  onChat?: (goal: Note, checkIns: Note[]) => void;
  onCheckInPress?: (checkIn: Note) => void;
  onJournalCreate: (goal: Note) => void;
}

function GoalBlock({
  goal,
  spaceId,
  checkIns,
  isEditing,
  onEditToggle,
  onSave,
  onRemove,
  onChat,
  onCheckInPress,
  onJournalCreate,
}: GoalBlockProps) {
  const [editTitle, setEditTitle] = useState(goal.title || '');
  const [editDate, setEditDate] = useState<Date | null>(
    goal.target_date ? parseISO(goal.target_date) : null,
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCheckIns, setShowCheckIns] = useState(false);

  // checkIns now passed as prop - no hook here
  const hasDate = Boolean(goal.target_date);
  const isPastDate =
    hasDate && parseISO(goal.target_date!).getTime() < getDateService().now().setHours(0, 0, 0, 0);
  const countdown = hasDate ? formatCountdown(goal.target_date!, isPastDate) : null;

  const handleSave = useCallback(() => {
    const dateStr = editDate ? format(editDate, 'yyyy-MM-dd') : null;
    onSave(goal.id, editTitle.trim(), dateStr);
    onEditToggle();
  }, [goal.id, editTitle, editDate, onSave, onEditToggle]);

  const handleRemove = useCallback(() => {
    Alert.alert('Remove Goal', "Remove this goal? Key dates in this Space won't be affected.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => onRemove(goal.id),
      },
    ]);
  }, [goal.id, onRemove]);

  const handleDateChange = useCallback((_event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setEditDate(date);
    }
  }, []);

  if (isEditing) {
    return (
      <View style={styles.goalBlock}>
        {/* Edit Title */}
        <View style={styles.goalEditRow}>
          <Star size={16} color={BRAND.colors.goldenPear} fill={BRAND.colors.goldenPear} />
          <TextInput
            style={styles.goalTitleInput}
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="Goal name"
            placeholderTextColor={BRAND.colors.inkMuted}
            autoFocus
          />
        </View>

        {/* Edit Date */}
        <View style={styles.goalDateEditRow}>
          <Pressable onPress={() => setShowDatePicker(true)} style={styles.goalDateRow}>
            <Text style={styles.goalDateLabel}>Target date:</Text>
            <Text style={styles.goalDateValue}>
              {editDate ? format(editDate, 'MMM d, yyyy') : 'None set'}
            </Text>
          </Pressable>
          {editDate && (
            <Pressable onPress={() => setEditDate(null)} style={styles.clearDateButton} hitSlop={8}>
              <X size={12} color={BRAND.colors.inkMuted} />
              <Text style={styles.clearDateText}>Clear date</Text>
            </Pressable>
          )}
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={editDate || getDateService().now()}
            mode="date"
            display="spinner"
            onChange={handleDateChange}
          />
        )}

        {/* Action buttons */}
        <View style={styles.goalEditButtons}>
          <Pressable onPress={handleRemove} style={styles.removeGoalButton}>
            <Trash2 size={14} color="#C9553D" />
            <Text style={styles.removeGoalText}>Remove goal</Text>
          </Pressable>
          <View style={styles.goalEditActions}>
            <Pressable onPress={onEditToggle} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={[styles.saveButton, !editTitle.trim() && styles.saveButtonDisabled]}
              disabled={!editTitle.trim()}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.goalBlock}>
      {/* Goal header row */}
      <View style={styles.goalHeaderRow}>
        <View style={styles.goalTitleRow}>
          <Star size={16} color={BRAND.colors.goldenPear} fill={BRAND.colors.goldenPear} />
          <Text style={styles.goalTitle} numberOfLines={2}>
            {goal.title || 'Untitled Goal'}
          </Text>
        </View>
        <Pressable onPress={onEditToggle} hitSlop={12} style={styles.editButton}>
          <Pencil size={14} color={BRAND.colors.inkMuted} />
          <Text style={styles.editButtonText}>Edit</Text>
        </Pressable>
      </View>

      {/* Target date + countdown */}
      {hasDate ? (
        <Text style={styles.goalDate}>
          Target: {formatDateDisplay(goal.target_date!)} · {countdown}
        </Text>
      ) : (
        <Text style={[styles.goalDate, styles.textMuted, styles.textItalic]}>No target date</Text>
      )}

      {/* Actions row */}
      <View style={styles.goalActionsRow}>
        <Pressable onPress={() => setShowCheckIns(!showCheckIns)} style={styles.checkInsButton}>
          <BookOpen size={14} color={BRAND.colors.inkMuted} />
          <Text style={styles.checkInsText}>{checkIns.length} check-ins</Text>
          {checkIns.length > 0 &&
            (showCheckIns ? (
              <ChevronUp size={12} color={BRAND.colors.inkMuted} />
            ) : (
              <ChevronDown size={12} color={BRAND.colors.inkMuted} />
            ))}
        </Pressable>
        <View style={styles.goalActionButtons}>
          <Pressable onPress={() => onJournalCreate(goal)} style={styles.journalButton}>
            <BookOpen size={14} color={BRAND.colors.mossGreen} />
            <Text style={styles.journalButtonText}>Check-in</Text>
          </Pressable>
          {onChat && (
            <Pressable onPress={() => onChat(goal, checkIns)} style={styles.chatButton}>
              <MessageCircle size={14} color={BRAND.colors.mossGreen} />
              <Text style={styles.chatButtonText}>Chat</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Check-ins expansion */}
      {showCheckIns && checkIns.length > 0 && (
        <View style={styles.checkInsList}>
          {checkIns.slice(0, 5).map((checkIn) => (
            <Pressable
              key={checkIn.id}
              onPress={() => onCheckInPress?.(checkIn)}
              style={styles.checkInRow}
            >
              <Text style={styles.checkInDate}>
                {checkIn.created_at ? format(parseISO(checkIn.created_at), 'MMM d') : ''}
              </Text>
              <Text style={styles.checkInTitle} numberOfLines={1}>
                {checkIn.title || 'Untitled'}
              </Text>
            </Pressable>
          ))}
          {checkIns.length > 5 && (
            <Text style={styles.checkInsMore}>+{checkIns.length - 5} more</Text>
          )}
        </View>
      )}
    </View>
  );
}

// Event Row Component
interface EventRowProps {
  event: Note;
  onPress: (event: Note) => void;
  isPast?: boolean;
}

function EventRow({ event, onPress, isPast = false }: EventRowProps) {
  const hasDate = Boolean(event.target_date);
  const dateDisplay = hasDate ? formatDateDisplay(event.target_date!) : 'No date';
  const timeDisplay = event.event_time ? formatTime(event.event_time) : null;
  const countdown = hasDate ? formatCountdown(event.target_date!, isPast) : null;

  return (
    <Pressable
      onPress={() => onPress(event)}
      style={({ pressed }) => [
        styles.eventRow,
        isPast && styles.eventRowPast,
        pressed && styles.eventRowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${event.title || 'Untitled'}, ${dateDisplay}${countdown ? `, ${countdown}` : ''}`}
    >
      <Text style={[styles.eventDate, isPast && styles.textMuted, !hasDate && styles.textItalic]}>
        {dateDisplay}
      </Text>
      <Text style={[styles.eventSeparator, isPast && styles.textMuted]}>·</Text>
      <Text style={[styles.eventTitle, isPast && styles.textMuted]} numberOfLines={1}>
        {event.title || 'Untitled'}
      </Text>
      {timeDisplay && !countdown && (
        <Text style={[styles.eventTime, isPast && styles.textMuted]}>· {timeDisplay}</Text>
      )}
      {countdown && (
        <Text style={[styles.countdown, isPast && styles.countdownPast]}>{countdown}</Text>
      )}
    </Pressable>
  );
}

export function SpaceJourneyModal({
  visible,
  spaceId,
  spaceName: propSpaceName,
  onClose,
  onEventPress,
  onGoalChat,
  onCheckInPress,
  onGoalCheckIn,
  onAddEvent,
  initialEditGoalId,
}: SpaceJourneyModalProps) {
  const insets = useSafeAreaInsets();
  const events = useEventsForSpace(spaceId);
  const goals = useGoalsForSpace(spaceId);
  const space = useSpaceById(spaceId);
  const spaceName = propSpaceName || space?.name || 'Space';
  const createNote = useGremlyStore((s) => s.createNote);
  const updateNote = useGremlyStore((s) => s.updateNote);
  const deleteNote = useGremlyStore((s) => s.deleteNote);
  const notes = useGremlyStore((s) => s.notes) as Note[];

  // Compute check-ins for all goals at modal level to avoid hooks in loop
  const goalCheckInsMap = useMemo(() => {
    const map = new Map<string, Note[]>();
    if (!visible || goals.length === 0 || !notes) return map;

    // Get all journals in this space
    const journalsInSpace = notes.filter(
      (n: Note) => n.subtype === 'journal' && n.space_id === spaceId && !n.archived,
    );

    console.log(
      '[SpaceJourneyModal] Computing goalCheckInsMap, journals in space:',
      journalsInSpace.length,
    );

    for (const goal of goals) {
      const goalTitleLower = (goal.title || '').toLowerCase();
      const goalWords = goalTitleLower.split(/\\s+/).filter((w: string) => w.length > 2);

      const matches = journalsInSpace.filter((n: Note) => {
        // Check 1: origin is goal_checkin AND views.goal_checkin.goal_id matches
        const hasGoalCheckinOrigin = n.origin === 'goal_checkin';
        const goalCheckinData = (n as any).views?.goal_checkin;
        const matchesGoalId = goalCheckinData?.goal_id === goal.id;
        const matchesGoalName = goalCheckinData?.goal_name?.toLowerCase() === goalTitleLower;

        // Check 2: title contains goal-related words
        const noteTitle = (n.title || '').toLowerCase();
        const hasGoalInTitle = goalWords.some((word: string) => noteTitle.includes(word));

        // Check 3: tags include goal name
        const hasTags =
          Array.isArray(n.tags) &&
          n.tags.some(
            (tag: string) =>
              tag.toLowerCase().includes(goalTitleLower) ||
              goalTitleLower.includes(tag.toLowerCase()),
          );

        const isMatch =
          (hasGoalCheckinOrigin && (matchesGoalId || matchesGoalName)) || hasGoalInTitle || hasTags;

        return isMatch;
      });

      // Sort by created_at descending
      matches.sort((a: Note, b: Note) => {
        const aDate = a.created_at || '';
        const bDate = b.created_at || '';
        return bDate.localeCompare(aDate);
      });

      console.log('[SpaceJourneyModal] Goal', goal.title, 'has', matches.length, 'check-ins');
      map.set(goal.id, matches);
    }

    return map;
  }, [visible, goals, notes, spaceId]);

  // UI state
  const [showPast, setShowPast] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getDateService().now());
  const [newEventTitle, setNewEventTitle] = useState('');
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const isProcessingRef = useRef(false);

  // Goal UI state
  const [editingGoalId, setEditingGoalId] = useState<string | null>(initialEditGoalId || null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDate, setNewGoalDate] = useState<Date | null>(null);
  const [showGoalDatePicker, setShowGoalDatePicker] = useState(false);
  const [isCreatingGoal, setIsCreatingGoal] = useState(false);

  // Split events into categories
  const { upcoming, past, dateless } = useMemo(() => {
    const today = getTodayDayString();

    const upcomingEvents: Note[] = [];
    const pastEvents: Note[] = [];
    const datelessEvents: Note[] = [];

    for (const event of events) {
      if (!event.target_date) {
        datelessEvents.push(event);
      } else {
        const eventDate = parseISO(event.target_date);
        if (isToday(eventDate) || isFuture(eventDate)) {
          upcomingEvents.push(event);
        } else {
          pastEvents.push(event);
        }
      }
    }

    upcomingEvents.sort((a, b) => {
      if (!a.target_date) return 1;
      if (!b.target_date) return -1;
      return a.target_date.localeCompare(b.target_date);
    });

    pastEvents.sort((a, b) => {
      if (!a.target_date) return 1;
      if (!b.target_date) return -1;
      return b.target_date.localeCompare(a.target_date);
    });

    return { upcoming: upcomingEvents, past: pastEvents, dateless: datelessEvents };
  }, [events]);

  // Handle date picker change for key dates
  const handleDateChange = useCallback((_event: any, date?: Date) => {
    if (date) {
      setSelectedDate(date);
      setShowDatePicker(false);
      setShowTitleInput(true);
    } else {
      setShowDatePicker(false);
    }
  }, []);

  // Handle title submit for key dates with enrichment
  const handleTitleSubmit = useCallback(() => {
    const trimmed = newEventTitle.trim();
    if (!trimmed) return;

    if (isProcessingRef.current) {
      console.warn('[SpaceJourneyModal] Already processing, ignoring duplicate submit');
      return;
    }

    isProcessingRef.current = true;
    setIsCreating(true);

    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    (async () => {
      try {
        const cortexUrl = readCortexUrl();
        const anonKey = readSupabaseAnonKey();

        if (!cortexUrl || !anonKey) {
          throw new Error('Missing cortex URL or anon key');
        }

        const ds = getDateService();
        const currentDate = ds.getCurrentDate();
        const dayOfWeek = ds.getDayOfWeek();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

        console.log('[SpaceJourneyModal] Running Phase 1.5a + Phase 2 in parallel');

        const [phase15aResult, phase2Result] = await Promise.all([
          (async () => {
            try {
              const res = await fetch(cortexUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${anonKey}`,
                },
                body: JSON.stringify({
                  type: 'enrich-phase1-5a',
                  text: trimmed,
                  bucket: 'log',
                  subtype: 'event',
                }),
              });
              if (!res.ok) return null;
              const json = await res.json();
              return {
                smart_title: json.smart_title || null,
                confirmation_message: json.confirmation_message || null,
              };
            } catch (err) {
              console.warn('[SpaceJourneyModal] Phase 1.5a failed:', err);
              return null;
            }
          })(),
          (async () => {
            try {
              const res = await fetch(cortexUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${anonKey}`,
                },
                body: JSON.stringify({
                  type: 'enrich-phase2',
                  text: trimmed,
                  bucket: 'log',
                  subtype: 'event',
                  currentDate,
                  dayOfWeek,
                  timezone,
                }),
              });
              if (!res.ok) return null;
              return await res.json();
            } catch (err) {
              console.warn('[SpaceJourneyModal] Phase 2 failed:', err);
              return null;
            }
          })(),
        ]);

        const smartTitle = phase15aResult?.smart_title || trimmed.substring(0, 60);
        const confirmationMessage = phase15aResult?.confirmation_message || null;

        await createNote({
          title: smartTitle,
          body: trimmed,
          subtype: 'event',
          space_id: spaceId,
          is_goal: false,
          target_date: dateStr,
          end_date: phase2Result?.end_date || null,
          event_time: phase2Result?.event_time || null,
          tags: phase2Result?.tags || [],
          origin: 'manual',
          views: confirmationMessage ? { confirmation_message: confirmationMessage } : undefined,
        });

        console.log('[SpaceJourneyModal] Event created with enrichment');
        setNewEventTitle('');
        setShowTitleInput(false);
      } catch (err) {
        console.error('[SpaceJourneyModal] Enrichment failed, falling back:', err);
        try {
          await createNote({
            title: trimmed.substring(0, 60),
            body: trimmed,
            subtype: 'event',
            space_id: spaceId,
            is_goal: false,
            target_date: dateStr,
            origin: 'manual',
          });
          setNewEventTitle('');
          setShowTitleInput(false);
        } catch (fallbackErr) {
          console.error('[SpaceJourneyModal] Fallback creation failed:', fallbackErr);
        }
      } finally {
        isProcessingRef.current = false;
        setIsCreating(false);
      }
    })();
  }, [newEventTitle, selectedDate, spaceId, createNote]);

  const handleCancelTitleInput = useCallback(() => {
    setNewEventTitle('');
    setShowTitleInput(false);
  }, []);

  const handleAddPress = useCallback(() => {
    setShowDatePicker(true);
  }, []);

  // Goal handlers
  const handleAddGoalPress = useCallback(() => {
    if (goals.length >= MAX_GOALS) {
      Alert.alert(
        'Goal Limit Reached',
        'Spaces work best with up to 3 focused goals. Could this be its own Space?',
        [{ text: 'OK', style: 'default' }],
      );
      return;
    }
    setShowAddGoal(true);
  }, [goals.length]);

  const handleGoalDateChange = useCallback((_event: any, date?: Date) => {
    setShowGoalDatePicker(false);
    if (date) {
      setNewGoalDate(date);
    }
  }, []);

  const handleCreateGoal = useCallback(async () => {
    const trimmed = newGoalTitle.trim();
    if (!trimmed) return;

    setIsCreatingGoal(true);
    try {
      const dateStr = newGoalDate ? format(newGoalDate, 'yyyy-MM-dd') : null;
      await createNote({
        title: trimmed,
        subtype: 'event',
        is_goal: true,
        space_id: spaceId,
        target_date: dateStr,
        origin: 'manual',
      });
      console.log('[SpaceJourneyModal] Goal created:', trimmed);
      setNewGoalTitle('');
      setNewGoalDate(null);
      setShowAddGoal(false);
    } catch (err) {
      console.error('[SpaceJourneyModal] Goal creation failed:', err);
    } finally {
      setIsCreatingGoal(false);
    }
  }, [newGoalTitle, newGoalDate, spaceId, createNote]);

  const handleCancelAddGoal = useCallback(() => {
    setNewGoalTitle('');
    setNewGoalDate(null);
    setShowAddGoal(false);
  }, []);

  const handleGoalSave = useCallback(
    async (id: string, title: string, targetDate: string | null) => {
      try {
        await updateNote(id, {
          title,
          target_date: targetDate,
        });
        console.log('[SpaceJourneyModal] Goal updated:', id);
      } catch (err) {
        console.error('[SpaceJourneyModal] Goal update failed:', err);
      }
    },
    [updateNote],
  );

  const handleGoalRemove = useCallback(
    async (id: string) => {
      try {
        await deleteNote(id);
        console.log('[SpaceJourneyModal] Goal removed:', id);
        setEditingGoalId(null);
      } catch (err) {
        console.error('[SpaceJourneyModal] Goal removal failed:', err);
      }
    },
    [deleteNote],
  );

  const handleJournalCreate = useCallback(
    (goal: Note) => {
      console.log('[SpaceJourneyModal] Check-in button pressed for goal:', {
        goal_id: goal.id,
        goal_title: goal.title,
        spaceName,
        hasOnGoalCheckIn: !!onGoalCheckIn,
      });
      // If onGoalCheckIn is provided, use it to open full journal screen
      if (onGoalCheckIn) {
        onGoalCheckIn(goal, spaceName);
        return;
      }
      // Fallback: Create a check-in journal inline (legacy behavior)
      console.log('[SpaceJourneyModal] Using fallback inline creation (no onGoalCheckIn handler)');
      createNote({
        title: `Check-in: ${goal.title || 'Untitled Goal'}`,
        subtype: 'journal',
        space_id: spaceId,
        tags: [goal.title || 'Untitled Goal'],
        origin: 'manual',
      });
    },
    [spaceId, spaceName, createNote, onGoalCheckIn],
  );

  // Don't render anything when modal is closed - prevents render loops from hooks
  if (!visible) {
    return null;
  }

  const totalEventCount = events.length;
  const goalsCount = goals.length;
  const remaining = MAX_GOALS - goalsCount;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Calendar size={20} color={BRAND.colors.mossGreen} />
            <Text style={styles.headerTitle}>
              <Text style={styles.headerSpaceName}>{spaceName}</Text>
              <Text style={styles.headerSeparator}> · </Text>
              <Text>Key Dates</Text>
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={handleAddPress}
              hitSlop={12}
              style={styles.addButton}
              accessibilityRole="button"
              accessibilityLabel="Add key date"
            >
              <Plus size={20} color={BRAND.colors.mossGreen} />
            </Pressable>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={24} color={BRAND.colors.charcoalInk} />
            </Pressable>
          </View>
        </View>

        {/* Date Picker for key dates */}
        {showDatePicker && (
          <View style={styles.datePickerContainer}>
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="inline"
              onChange={handleDateChange}
              minimumDate={getDateService().now()}
              style={styles.datePicker}
            />
          </View>
        )}

        {/* Title Input after date selection */}
        {showTitleInput && (
          <View style={styles.titleInputContainer}>
            <Text style={styles.titleInputLabel}>
              Event for {format(selectedDate, 'MMM d, yyyy')}
            </Text>
            <TextInput
              style={styles.titleInput}
              value={newEventTitle}
              onChangeText={setNewEventTitle}
              placeholder="What's happening?"
              placeholderTextColor={BRAND.colors.inkMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleTitleSubmit}
            />
            <View style={styles.titleInputButtons}>
              <Pressable
                onPress={handleCancelTitleInput}
                style={[styles.cancelButton]}
                disabled={isCreating}
              >
                <Text style={[styles.cancelButtonText, isCreating && styles.textDisabled]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleTitleSubmit}
                style={[
                  styles.saveButton,
                  (isCreating || !newEventTitle.trim()) && styles.saveButtonDisabled,
                ]}
                disabled={isCreating || !newEventTitle.trim()}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Add Event</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* Content */}
        {!showDatePicker && !showTitleInput && (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* GOALS SECTION */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <View style={styles.section}>
              <Text style={styles.sectionHeader}>Goals</Text>

              {/* Goal blocks */}
              {goals.map((goal, index) => (
                <React.Fragment key={goal.id}>
                  <GoalBlock
                    goal={goal}
                    spaceId={spaceId}
                    checkIns={goalCheckInsMap.get(goal.id) || []}
                    isEditing={editingGoalId === goal.id}
                    onEditToggle={() =>
                      setEditingGoalId(editingGoalId === goal.id ? null : goal.id)
                    }
                    onSave={handleGoalSave}
                    onRemove={handleGoalRemove}
                    onChat={onGoalChat}
                    onCheckInPress={onCheckInPress}
                    onJournalCreate={handleJournalCreate}
                  />
                  {/* Subtle divider between goals */}
                  {index < goals.length - 1 && <View style={styles.goalDivider} />}
                </React.Fragment>
              ))}

              {/* Add goal form */}
              {showAddGoal && (
                <View style={styles.addGoalForm}>
                  <TextInput
                    style={styles.goalTitleInput}
                    value={newGoalTitle}
                    onChangeText={setNewGoalTitle}
                    placeholder="What's your goal?"
                    placeholderTextColor={BRAND.colors.inkMuted}
                    autoFocus
                  />
                  <Pressable onPress={() => setShowGoalDatePicker(true)} style={styles.goalDateRow}>
                    <Text style={styles.goalDateLabel}>Target date (optional):</Text>
                    <Text style={styles.goalDateValue}>
                      {newGoalDate ? format(newGoalDate, 'MMM d, yyyy') : 'None'}
                    </Text>
                  </Pressable>
                  {showGoalDatePicker && (
                    <DateTimePicker
                      value={newGoalDate || getDateService().now()}
                      mode="date"
                      display="spinner"
                      onChange={handleGoalDateChange}
                    />
                  )}
                  <View style={styles.goalEditActions}>
                    <Pressable onPress={handleCancelAddGoal} style={styles.cancelButton}>
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleCreateGoal}
                      style={[
                        styles.saveButton,
                        (!newGoalTitle.trim() || isCreatingGoal) && styles.saveButtonDisabled,
                      ]}
                      disabled={!newGoalTitle.trim() || isCreatingGoal}
                    >
                      {isCreatingGoal ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.saveButtonText}>Save</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Add goal button */}
              {!showAddGoal && goalsCount < MAX_GOALS && (
                <Pressable onPress={handleAddGoalPress} style={styles.addGoalButton}>
                  <Plus size={16} color={BRAND.colors.mossGreen} />
                  <Text style={styles.addGoalText}>Add goal ({remaining} remaining)</Text>
                </Pressable>
              )}

              {/* Empty state for goals */}
              {goalsCount === 0 && !showAddGoal && (
                <View style={styles.emptyGoals}>
                  <Star size={24} color={BRAND.colors.inkMuted} />
                  <Text style={styles.emptyGoalsText}>
                    No goals yet. Add one to track your progress!
                  </Text>
                </View>
              )}
            </View>

            {/* Section divider */}
            <View style={styles.sectionDivider} />

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* KEY DATES SECTION */}
            {/* ═══════════════════════════════════════════════════════════════ */}

            {/* Upcoming Section */}
            {upcoming.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Upcoming ({upcoming.length})</Text>
                {upcoming.map((event) => (
                  <EventRow key={event.id} event={event} onPress={onEventPress} />
                ))}
              </View>
            )}

            {/* Past Section - collapsible */}
            {past.length > 0 && (
              <View style={styles.section}>
                <Pressable onPress={() => setShowPast(!showPast)} style={styles.collapsibleHeader}>
                  <Text style={styles.sectionHeader}>Past ({past.length})</Text>
                  {showPast ? (
                    <ChevronUp size={16} color={BRAND.colors.inkMuted} />
                  ) : (
                    <ChevronDown size={16} color={BRAND.colors.inkMuted} />
                  )}
                </Pressable>
                {showPast &&
                  past.map((event) => (
                    <EventRow key={event.id} event={event} onPress={onEventPress} isPast />
                  ))}
              </View>
            )}

            {/* Dateless Section */}
            {dateless.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>No Date ({dateless.length})</Text>
                {dateless.map((event) => (
                  <EventRow key={event.id} event={event} onPress={onEventPress} />
                ))}
              </View>
            )}

            {/* Empty state for key dates */}
            {totalEventCount === 0 && (
              <View style={styles.emptyContainer}>
                <Calendar size={48} color={BRAND.colors.inkMuted} />
                <Text style={styles.emptyTitle}>No key dates</Text>
                <Text style={styles.emptySubtitle}>
                  Add important dates to keep track of milestones and events
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  headerSpaceName: {
    fontWeight: '600',
  },
  headerSeparator: {
    color: BRAND.colors.inkMuted,
    fontWeight: '400',
  },
  addButton: {
    padding: 4,
  },

  // Date picker
  datePickerContainer: {
    padding: 16,
    backgroundColor: BRAND.colors.linenCream,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  datePicker: {
    height: 340,
  },

  // Title input
  titleInputContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  titleInputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
    marginBottom: 8,
  },
  titleInput: {
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: BRAND.colors.linenCream,
  },
  titleInputButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
  },

  // Scroll content
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
  },

  // Sections
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginHorizontal: 16,
    marginBottom: 20,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },

  // Goal block
  goalBlock: {
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 8,
  },
  goalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  goalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    flex: 1,
  },
  goalEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  goalTitleInput: {
    flex: 1,
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: BRAND.colors.linenCream,
  },
  goalDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  goalDateEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearDateText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  goalDateLabel: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
  },
  goalDateValue: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  goalDate: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    marginTop: 4,
  },
  goalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  checkInsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  checkInsText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  goalActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  journalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(191, 216, 192, 0.25)',
    borderRadius: 16,
  },
  journalButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(191, 216, 192, 0.25)',
    borderRadius: 16,
  },
  chatButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editButtonText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  goalEditButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  goalEditActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  removeGoalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  removeGoalText: {
    fontSize: 13,
    color: '#C9553D',
  },
  goalDivider: {
    width: '60%',
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignSelf: 'center',
    marginVertical: 4,
  },

  // Add goal
  addGoalForm: {
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginTop: 8,
  },
  addGoalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
  },
  addGoalText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  emptyGoals: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 32,
  },
  emptyGoalsText: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginTop: 8,
  },

  // Check-ins
  checkInsList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  checkInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  checkInDate: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    minWidth: 44,
  },
  checkInTitle: {
    flex: 1,
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
  },
  checkInsMore: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    marginTop: 4,
  },

  // Buttons
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: BRAND.colors.mossGreen,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  textDisabled: {
    opacity: 0.5,
  },

  // Event row
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  eventRowPast: {
    opacity: 0.6,
  },
  eventRowPressed: {
    opacity: 0.7,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  eventDate: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    minWidth: 48,
  },
  eventSeparator: {
    fontSize: 14,
    color: BRAND.colors.inkSubtle,
  },
  eventTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  eventTime: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  countdown: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
    marginLeft: 8,
  },
  countdownPast: {
    fontWeight: '400',
    color: BRAND.colors.inkSubtle,
  },
  textMuted: {
    color: BRAND.colors.inkMuted,
  },
  textItalic: {
    fontStyle: 'italic',
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default SpaceJourneyModal;
