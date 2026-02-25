import React, { useMemo } from 'react';
import { View, Modal, StyleSheet, Text, Pressable, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationQuickActionSheetProps {
  visible: boolean;
  entityId: string | null;
  entityType: 'todo' | 'habit' | 'event' | null;
  onDismiss: () => void;
  onDone: (entityId: string, entityType: string) => void;
  onSnooze: (entityId: string, entityType: string, seconds: number) => void;
  onOpen: (entityId: string, entityType: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateSecondsUntilTomorrow9am(): number {
  const now = new Date();
  const tomorrow9am = new Date();
  tomorrow9am.setDate(tomorrow9am.getDate() + 1);
  tomorrow9am.setHours(9, 0, 0, 0);
  return Math.max(60, Math.floor((tomorrow9am.getTime() - now.getTime()) / 1000));
}

function formatDueDay(dueDay: string): string {
  const today = new Date();
  const due = new Date(dueDay + 'T12:00:00');
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays === -1) return 'Due yesterday';
  if (diffDays < 0) return `Overdue (${Math.abs(diffDays)}d)`;
  return `Due in ${diffDays}d`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationQuickActionSheet({
  visible,
  entityId,
  entityType,
  onDismiss,
  onDone,
  onSnooze,
  onOpen,
}: NotificationQuickActionSheetProps) {
  const insets = useSafeAreaInsets();
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const notes = useGremlyStore((s) => s.notes);
  const spaces = useGremlyStore((s) => s.spaces);

  const entity = useMemo(() => {
    if (!entityId) return null;
    if (entityType === 'todo') return todos.find((t) => t.id === entityId) ?? null;
    if (entityType === 'habit') return habits.find((h) => h.id === entityId) ?? null;
    if (entityType === 'event') return notes.find((n) => n.id === entityId) ?? null;
    return null;
  }, [entityId, entityType, todos, habits, notes]);

  const title = (entity as any)?.title ?? (entity as any)?.name ?? 'Reminder';
  const dueDay = (entity as any)?.due_day as string | undefined;
  const spaceId = (entity as any)?.space_id as string | undefined;
  const spaceName = spaceId ? spaces.find((s) => s.id === spaceId)?.name : null;

  const subtitle = useMemo(() => {
    const parts: string[] = [];
    if (dueDay) parts.push(formatDueDay(dueDay));
    if (spaceName) parts.push(spaceName);
    if (parts.length === 0) {
      if (entityType === 'todo') parts.push('Todo');
      else if (entityType === 'habit') parts.push('Habit');
      else if (entityType === 'event') parts.push('Event');
    }
    return parts.join(' · ');
  }, [dueDay, spaceName, entityType]);

  const showDoneButton = entityType === 'todo' || entityType === 'habit';

  if (!visible || !entityId || !entityType) return null;

  const handleDone = () => {
    onDone(entityId, entityType);
    onDismiss();
  };

  const handleSnooze = (seconds: number) => {
    onSnooze(entityId, entityType, seconds);
    onDismiss();
  };

  const handleOpen = () => {
    onOpen(entityId, entityType);
    onDismiss();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      {/* Overlay — tap to dismiss */}
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <View />
      </Pressable>

      {/* Sheet */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {/* Drag handle */}
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        {/* Subtitle */}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}

        {/* Actions row */}
        <View style={styles.actionsRow}>
          {/* Done button */}
          {showDoneButton && (
            <Pressable style={styles.doneButton} onPress={handleDone}>
              <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          )}

          {/* Snooze pills */}
          <View style={styles.snoozeGroup}>
            <Text style={styles.snoozeLabel}>Snooze</Text>
            <View style={styles.snoozePills}>
              <Pressable style={styles.snoozePill} onPress={() => handleSnooze(900)}>
                <Text style={styles.snoozePillText}>15m</Text>
              </Pressable>
              <Pressable style={styles.snoozePill} onPress={() => handleSnooze(3600)}>
                <Text style={styles.snoozePillText}>1hr</Text>
              </Pressable>
              <Pressable
                style={styles.snoozePill}
                onPress={() => handleSnooze(calculateSecondsUntilTomorrow9am())}
              >
                <Text style={styles.snoozePillText}>Tomorrow</Text>
              </Pressable>
            </View>
          </View>

          {/* Open button */}
          <Pressable style={styles.openButton} onPress={handleOpen}>
            <Text style={styles.openText}>Open</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SCREEN_HEIGHT = Dimensions.get('window').height;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    minHeight: SCREEN_HEIGHT * 0.28,
    backgroundColor: BRAND.colors.linenCream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    // Top shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 16,
  },

  // Drag handle
  handleRow: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },

  // Title & subtitle
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: BRAND.colors.mossGreen,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    marginBottom: 20,
  },

  // Actions row
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  // Done button
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BRAND.radius.lg,
  },
  doneText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },

  // Snooze group
  snoozeGroup: {
    flex: 1,
    alignItems: 'center',
  },
  snoozeLabel: {
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 11,
    color: BRAND.colors.inkMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  snoozePills: {
    flexDirection: 'row',
    gap: 6,
  },
  snoozePill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BRAND.radius.pill,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    backgroundColor: BRAND.colors.surface,
  },
  snoozePillText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 13,
    color: BRAND.colors.charcoalInk,
  },

  // Open button
  openButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: BRAND.radius.lg,
  },
  openText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 14,
    color: BRAND.colors.mossGreen,
  },
});

export default NotificationQuickActionSheet;
