/**
 * KeyDatesModal - Modal showing all key dates for a Space
 *
 * Features:
 * - Goal event at top (if exists) with star icon
 * - Upcoming events section
 * - Collapsible past events section
 * - Dateless events section
 * - Tap event to open note overlay
 * - Calendar add button for quick date picker
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
} from 'react-native';
import { X, Calendar, ChevronDown, ChevronUp, Star, Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  format,
  parseISO,
  isToday,
  isTomorrow,
  isPast,
  isFuture,
  differenceInDays,
} from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BRAND } from '../../design/brand';
import {
  useEventsForSpace,
  useGoalForSpace,
  useGoalsForSpace,
  useSpaceById,
} from '../../lib/store/selectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { getTodayDayString, getDateService } from '../../lib/date';
import { env, getEnv } from '../../lib/env';
import * as Haptics from 'expo-haptics';
import type { Note } from '../../lib/types';

// --- Helpers to read env vars (same pattern as useEventQuickAdd.ts) ---
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

interface KeyDatesModalProps {
  visible: boolean;
  spaceId: string;
  spaceName?: string; // Optional - will fall back to selector if not provided
  onClose: () => void;
  onEventPress: (event: Note) => void;
  onAddEvent: (title: string, date: string) => void; // Create event with title and date
}

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

export function KeyDatesModal({
  visible,
  spaceId,
  spaceName: propSpaceName,
  onClose,
  onEventPress,
  onAddEvent,
}: KeyDatesModalProps) {
  const insets = useSafeAreaInsets();
  const events = useEventsForSpace(spaceId);
  const goalEvent = useGoalForSpace(spaceId);
  const allGoals = useGoalsForSpace(spaceId);
  const space = useSpaceById(spaceId);
  const spaceName = propSpaceName || space?.name || 'Space';
  const createNote = useGremlyStore((s) => s.createNote);
  const updateNote = useGremlyStore((s) => s.updateNote);

  // UI state
  const [showPast, setShowPast] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getDateService().now());
  const [newEventTitle, setNewEventTitle] = useState('');
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const isProcessingRef = useRef(false);

  // Split events into categories
  const { upcoming, past, dateless } = useMemo(() => {
    const today = getTodayDayString();
    const todayDate = parseISO(today);

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

    // Sort upcoming by date ascending
    upcomingEvents.sort((a, b) => {
      if (!a.target_date) return 1;
      if (!b.target_date) return -1;
      return a.target_date.localeCompare(b.target_date);
    });

    // Sort past by date descending (most recent first)
    pastEvents.sort((a, b) => {
      if (!a.target_date) return 1;
      if (!b.target_date) return -1;
      return b.target_date.localeCompare(a.target_date);
    });

    return { upcoming: upcomingEvents, past: pastEvents, dateless: datelessEvents };
  }, [events]);

  // Handle date picker change
  const handleDateChange = useCallback((_event: any, date?: Date) => {
    if (date) {
      setSelectedDate(date);
      setShowDatePicker(false);
      setShowTitleInput(true);
    } else {
      setShowDatePicker(false);
    }
  }, []);

  // Handle title submit - run enrichment then create note
  const handleTitleSubmit = useCallback(() => {
    const trimmed = newEventTitle.trim();
    if (!trimmed) return;

    // Prevent double submits
    if (isProcessingRef.current) {
      console.warn('[KeyDatesModal] Already processing, ignoring duplicate submit');
      return;
    }

    isProcessingRef.current = true;
    setIsCreating(true);

    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    // Run enrichment async
    (async () => {
      try {
        const cortexUrl = readCortexUrl();
        const anonKey = readSupabaseAnonKey();

        if (!cortexUrl || !anonKey) {
          throw new Error('Missing cortex URL or anon key');
        }

        // Get date context for Phase 2
        const ds = getDateService();
        const currentDate = ds.getCurrentDate();
        const dayOfWeek = ds.getDayOfWeek();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

        console.log('[KeyDatesModal] Running Phase 1.5a + Phase 2 in parallel');

        // Run Phase 1.5a and Phase 2 in parallel
        const [phase15aResult, phase2Result] = await Promise.all([
          // Phase 1.5a: Get smart title + confirmation message
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
              if (!res.ok) {
                console.warn('[KeyDatesModal] Phase 1.5a returned non-ok status:', res.status);
                return null;
              }
              const json = await res.json();
              console.log('[KeyDatesModal] Phase 1.5a result:', {
                smart_title: json.smart_title,
                confirmation_message: json.confirmation_message?.substring(0, 50),
              });
              return {
                smart_title: json.smart_title || null,
                confirmation_message: json.confirmation_message || null,
              };
            } catch (err) {
              console.warn('[KeyDatesModal] Phase 1.5a failed:', err);
              return null;
            }
          })(),

          // Phase 2: Get time and tags
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
              if (!res.ok) {
                console.warn('[KeyDatesModal] Phase 2 returned non-ok status:', res.status);
                return null;
              }
              const json = await res.json();
              console.log('[KeyDatesModal] Phase 2 result:', {
                event_time: json.event_time,
                end_date: json.end_date,
                tags: json.tags,
              });
              return json;
            } catch (err) {
              console.warn('[KeyDatesModal] Phase 2 failed:', err);
              return null;
            }
          })(),
        ]);

        // Use Phase 1.5a for title/message, Phase 2 for time/tags
        // IMPORTANT: Use selectedDate from calendar picker, NOT AI-extracted date
        const smartTitle = phase15aResult?.smart_title || trimmed.substring(0, 60);
        const confirmationMessage = phase15aResult?.confirmation_message || null;

        // Create the event note with enriched data
        await createNote({
          title: smartTitle,
          body: trimmed,
          subtype: 'event',
          space_id: spaceId,
          is_goal: false,
          target_date: dateStr, // Use calendar picker date, NOT AI-extracted
          end_date: phase2Result?.end_date || null,
          event_time: phase2Result?.event_time || null,
          tags: phase2Result?.tags || [],
          origin: 'manual',
          views: confirmationMessage ? { confirmation_message: confirmationMessage } : undefined,
        });

        console.log('[KeyDatesModal] Event created with enrichment');

        // Clear state and return to list
        setNewEventTitle('');
        setShowTitleInput(false);
      } catch (err) {
        console.error('[KeyDatesModal] Enrichment failed, falling back to plain note:', err);

        // Fallback: create plain note without enrichment
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

          console.log('[KeyDatesModal] Fallback plain event created');
          setNewEventTitle('');
          setShowTitleInput(false);
        } catch (fallbackErr) {
          console.error('[KeyDatesModal] Fallback creation failed:', fallbackErr);
        }
      } finally {
        isProcessingRef.current = false;
        setIsCreating(false);
      }
    })();
  }, [newEventTitle, selectedDate, spaceId, createNote]);

  // Cancel title input
  const handleCancelTitleInput = useCallback(() => {
    setNewEventTitle('');
    setShowTitleInput(false);
  }, []);

  // Start add flow
  const handleAddPress = useCallback(() => {
    setShowDatePicker(true);
  }, []);

  // Toggle featured goal star
  const handleToggleFeaturedGoal = useCallback(
    async (goal: Note) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const isCurrentlyFeatured = (goal as any).views?.featured_goal === true;

      if (isCurrentlyFeatured) {
        // Un-feature this goal (first-by-created_at will become featured via selector fallback)
        await updateNote(goal.id, {
          views: { ...((goal as any).views || {}), featured_goal: false },
        });
      } else {
        // Un-feature any previously featured goal, then feature this one
        const prevFeatured = allGoals.find((g) => (g as any).views?.featured_goal === true);
        if (prevFeatured && prevFeatured.id !== goal.id) {
          await updateNote(prevFeatured.id, {
            views: { ...((prevFeatured as any).views || {}), featured_goal: false },
          });
        }
        await updateNote(goal.id, {
          views: { ...((goal as any).views || {}), featured_goal: true },
        });
      }
    },
    [allGoals, updateNote],
  );

  const totalCount = events.length + allGoals.length;

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
              accessibilityLabel="Add key date with calendar"
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

        {/* Date Picker (inline iOS style) */}
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
                style={[styles.inputButton, styles.cancelButton]}
                disabled={isCreating}
              >
                <Text style={[styles.cancelButtonText, isCreating && styles.textDisabled]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleTitleSubmit}
                style={[
                  styles.inputButton,
                  styles.saveButton,
                  isCreating && styles.saveButtonDisabled,
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
        {totalCount === 0 && !showDatePicker && !showTitleInput ? (
          <View style={styles.emptyContainer}>
            <Calendar size={48} color={BRAND.colors.inkMuted} />
            <Text style={styles.emptyTitle}>No key dates</Text>
            <Text style={styles.emptySubtitle}>
              Add important dates to keep track of milestones and events
            </Text>
          </View>
        ) : !showDatePicker && !showTitleInput ? (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {/* Goals Section */}
            {allGoals.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>
                  {allGoals.length === 1 ? 'Goal' : `Goals (${allGoals.length})`}
                </Text>
                {allGoals.map((goal) => (
                  <EventRow
                    key={goal.id}
                    event={goal}
                    onPress={onEventPress}
                    isGoal
                    isFeatured={(goal as any).views?.featured_goal === true}
                    onStarPress={() => handleToggleFeaturedGoal(goal)}
                  />
                ))}
              </View>
            )}

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
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

// Event Row Component
interface EventRowProps {
  event: Note;
  onPress: (event: Note) => void;
  isGoal?: boolean;
  isFeatured?: boolean;
  isPast?: boolean;
  onStarPress?: () => void;
}

function EventRow({
  event,
  onPress,
  isGoal = false,
  isFeatured = false,
  isPast = false,
  onStarPress,
}: EventRowProps) {
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
      accessibilityLabel={`${isGoal ? 'Goal: ' : ''}${event.title || 'Untitled'}, ${dateDisplay}${countdown ? `, ${countdown}` : ''}`}
    >
      {/* Goal star icon - tappable to toggle featured */}
      {isGoal && (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onStarPress?.();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isFeatured ? 'Remove as featured goal' : 'Set as featured goal'}
        >
          <Star
            size={16}
            color={BRAND.colors.goldenPear}
            fill={isFeatured ? BRAND.colors.goldenPear : 'transparent'}
            style={styles.goalIcon}
          />
        </Pressable>
      )}

      {/* Date */}
      <Text style={[styles.eventDate, isPast && styles.textMuted, !hasDate && styles.textItalic]}>
        {dateDisplay}
      </Text>

      {/* Dot separator */}
      <Text style={[styles.eventSeparator, isPast && styles.textMuted]}>·</Text>

      {/* Title */}
      <Text
        style={[styles.eventTitle, isGoal && styles.eventTitleGoal, isPast && styles.textMuted]}
        numberOfLines={1}
      >
        {event.title || 'Untitled'}
      </Text>

      {/* Time suffix - only show if no countdown */}
      {timeDisplay && !countdown && (
        <Text style={[styles.eventTime, isPast && styles.textMuted]}>· {timeDisplay}</Text>
      )}

      {/* Countdown */}
      {countdown && (
        <Text
          style={[styles.countdown, isGoal && styles.countdownGoal, isPast && styles.countdownPast]}
        >
          {countdown}
        </Text>
      )}
    </Pressable>
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
  inputButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  saveButton: {
    backgroundColor: BRAND.colors.mossGreen,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
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

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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

  // Scroll content
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
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
  goalIcon: {
    marginRight: 4,
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
  eventTitleGoal: {
    fontWeight: '600',
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
  countdownGoal: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
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
});

export default KeyDatesModal;
