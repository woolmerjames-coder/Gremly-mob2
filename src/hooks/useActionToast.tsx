import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { useRepo } from '../../providers/RepoProvider';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import type { CreateRecordInput } from '../../lib/repo/IRepo';
import type {
  Frequency,
  HabitSubtype,
  NoteSubtype,
  LogSubtype,
  CanonicalType,
} from '../../lib/types';

type ActionType = 'habit' | 'todo' | 'note' | 'disambiguation' | 'success';

type ActionToastInput = {
  type: ActionType;
  content: string;
  metadata?: ActionToastMetadata;
};

type ActionToastMetadata = {
  summaryOverride?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  frequency?: Frequency;
  habitSubtype?: HabitSubtype | null;
  noteSubtype?: NoteSubtype;
  noteBody?: string;
  frequencyValue?: any;
  spaceId?: string | null;
  autoOrigin?: 'catchall' | 'space_chat' | 'manual';
  aiPlaced?: boolean;
  reminders?: any[];
  onConfirm?: () => Promise<void>;
  onCancel?: () => void;
  onEdit?: () => void;
  onCompleted?: (recordId?: string) => void;
  onAutoDismiss?: () => void;
  // Optional quick actions for success toasts
  onUndo?: () => void;
  onViewDetails?: () => void;
  conversionMeta?: {
    initialTitle?: string;
    initialNote?: string;
    initialDueDate?: string | null;
  };
  // Disambiguation support
  disambiguationOptions?: {
    choices: Array<'todo' | 'note'>;
    onChoose: (choice: 'todo' | 'note') => void;
  };
};

type UseActionToastResult = {
  showToast: (payload: ActionToastInput) => void;
  hideToast: () => void;
  isVisible: boolean;
  Toast: ReactNode;
};

const GOLDEN_PEAR = '#E0C47A';
const AUTO_DISMISS_MS = 6000;
const SUCCESS_GREEN = '#34C759';
const SUCCESS_DISMISS_MS = 3000;
const SUCCESS_SUMMARY_MAX = 40;

// Helpers: natural date/time normalization and title cleanup
const DAY_ABBR: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

function stripPrefixes(s: string): string {
  return s
    .replace(/^\s*(note to|note:|remember to|remember:|jot down|write down)\b\s*/i, '')
    .trim();
}

function normalizeDueTime(raw?: string | null): string | null {
  if (!raw) return null;
  let t = raw.trim();
  t = t.replace(/^\b(at|around)\s+/i, '').trim();
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s?(am|pm)$/i);
  if (m) {
    const hh = m[1];
    const mm = m[2] ? `:${m[2]}` : '';
    const ap = m[3].toLowerCase();
    return `${hh}${mm}${ap}`;
  }
  if (/^(noon|midnight)$/i.test(t)) {
    return t[0].toUpperCase() + t.slice(1).toLowerCase();
  }
  return t;
}

function normalizeDueDate(raw?: string | null): string | null {
  if (!raw) return null;
  let d = raw.trim();
  d = d.replace(/^\b(by the|by|on|this)\s+/i, '').trim();
  // Day-of-week
  const dow = d.toLowerCase();
  if (DAY_ABBR[dow]) return DAY_ABBR[dow];
  if (/^tomorrow$/i.test(d)) {
    const now = new Date();
    now.setDate(now.getDate() + 1);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  }
  if (/^today$/i.test(d)) {
    const now = new Date();
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  }
  // Month name + day (keep as e.g., "Jan 2")
  const monthDay = d.match(
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?$/i,
  );
  if (monthDay) {
    const parts = d.split(/\s+/);
    const mon = parts[0].slice(0, 3);
    const day = parts[1].replace(/(st|nd|rd|th)$/i, '');
    return `${mon[0].toUpperCase()}${mon.slice(1).toLowerCase()} ${day}`;
  }
  // Numeric dates like 12/25 -> leave as-is
  return d;
}

function deriveNoteSuccessTitle(content: string, noteBody?: string | null): string {
  const fromBody = (noteBody || '').trim();
  if (fromBody) {
    const m = fromBody.match(/^\s*([^:]{1,40}):\s*(.+)$/);
    if (m) {
      const left = stripPrefixes(m[1]);
      const right = stripPrefixes(m[2]);
      return `${left}: ${right}`.trim();
    }
  }
  return stripPrefixes(content.trim());
}

type UseActionToastConfig = {
  bottomOffset?: number;
};

export function useActionToast(config: UseActionToastConfig = {}): UseActionToastResult {
  const { bottomOffset = 32 } = config;
  const repo = useRepo();
  const overlay = useUnifiedOverlayController();

  const [payload, setPayload] = useState<ActionToastInput | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const opacityRef = useRef(new Animated.Value(0));
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const payloadRef = useRef<ActionToastInput | null>(null);
  const showTimeRef = useRef<number | null>(null);
  const isHidingRef = useRef(false);

  const MIN_DISPLAY_MS = 4000; // 4 seconds minimum

  const clearExistingTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hideToast = useCallback(() => {
    // Prevent duplicate hide calls
    if (!isVisible || isHidingRef.current) {
      if (__DEV__) {
        console.log('[ActionToast] hide blocked - already hidden or hiding');
      }
      return;
    }

    // Check minimum display duration
    if (showTimeRef.current) {
      const elapsed = Date.now() - showTimeRef.current;
      if (elapsed < MIN_DISPLAY_MS) {
        // Don't hide yet, schedule for later
        if (__DEV__) {
          console.log('[ActionToast] hide deferred - minimum display time not met', {
            elapsed,
            remaining: MIN_DISPLAY_MS - elapsed,
          });
        }
        clearExistingTimer();
        timerRef.current = setTimeout(() => hideToast(), MIN_DISPLAY_MS - elapsed);
        return;
      }
    }

    isHidingRef.current = true;
    clearExistingTimer();
    setIsVisible(false);
    Animated.timing(opacityRef.current, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      if (__DEV__) {
        console.log('[ActionToast] hidden');
      }
      setPayload(null);
      payloadRef.current = null;
      showTimeRef.current = null;
      isHidingRef.current = false;
      setIsSaving(false);
    });
  }, [clearExistingTimer, isVisible]);

  const scheduleAutoDismiss = useCallback(
    (ms: number = AUTO_DISMISS_MS) => {
      clearExistingTimer();
      timerRef.current = setTimeout(() => {
        // Trigger auto-dismiss callback if present and still the same payload
        const current = payloadRef.current;
        if (current?.metadata?.onAutoDismiss) {
          try {
            current.metadata.onAutoDismiss();
          } catch (e) {
            if (__DEV__) console.warn('[ActionToast] onAutoDismiss handler failed', e);
          }
        }
        hideToast();
      }, ms);
    },
    [clearExistingTimer, hideToast],
  );

  const showToast = useCallback(
    (input: ActionToastInput) => {
      if (__DEV__) {
        console.log('[ActionToast] show', {
          type: input.type,
          content: input.content,
          metadata: input.metadata,
        });
      }

      // Clear any pending hide operation
      isHidingRef.current = false;

      // Record show time for minimum display duration
      showTimeRef.current = Date.now();

      setPayload(input);
      payloadRef.current = input;
      setIsVisible(true);
      Animated.timing(opacityRef.current, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      scheduleAutoDismiss();
    },
    [scheduleAutoDismiss],
  );

  useEffect(() => {
    return () => {
      clearExistingTimer();
    };
  }, [clearExistingTimer]);

  const formatSummary = useCallback((input: ActionToastInput | null) => {
    if (!input) {
      return '';
    }

    const { type, content, metadata } = input;
    if (metadata?.summaryOverride) {
      return metadata.summaryOverride;
    }

    const trimmed = content.trim();
    const baseText = trimmed || 'New item';

    if (type === 'disambiguation') {
      return `"${baseText}"\nWould you like this as:`;
    }

    if (type === 'success') {
      return baseText;
    }

    if (type === 'habit') {
      return `⚡ Habit: ${baseText}`;
    }

    if (type === 'todo') {
      const parts = [];
      parts.push(`🗒️ To-Do: ${baseText}`);
      if (metadata?.dueDate) {
        const due = metadata.dueTime
          ? `${metadata.dueDate} · ${metadata.dueTime}`
          : metadata.dueDate;
        parts.push(`Due ${due}`);
      }
      return parts.join(' — ');
    }

    const noteLabel = metadata?.noteSubtype === 'journal' ? 'Journal' : 'Note';
    return `📝 ${noteLabel}: ${baseText}`;
  }, []);

  const performCreate = useCallback(
    async (input: ActionToastInput) => {
      const { type, content, metadata } = input;
      if (__DEV__) {
        console.log('[ActionToast] performCreate:start', { type, content, metadata });
      }
      if (type === 'disambiguation' || type === 'success') {
        throw new Error('Invalid create type');
      }

      let createPayload: CreateRecordInput;
      if (type === 'todo') {
        createPayload = {
          type: 'todo',
          ai_placed: metadata?.aiPlaced ?? false,
          origin: metadata?.autoOrigin ?? 'manual',
          space_id: metadata?.spaceId,
          name: content.trim() || 'Untitled',
          due_date: metadata?.dueDate ?? null,
          due_time: metadata?.dueTime ?? null,
          reminders: metadata?.reminders,
        } as CreateRecordInput;
      } else if (type === 'habit') {
        createPayload = {
          type: 'habit',
          ai_placed: metadata?.aiPlaced ?? false,
          origin: metadata?.autoOrigin ?? 'manual',
          space_id: metadata?.spaceId,
          name: content.trim() || 'Untitled Habit',
          frequency: metadata?.frequency ?? 'daily',
          subtype: metadata?.habitSubtype ?? 'start_habit',
          frequency_value: metadata?.frequencyValue,
          reminders: metadata?.reminders,
          notes: metadata?.noteBody ?? null,
        } as CreateRecordInput;
      } else {
        // note
        createPayload = {
          type: 'note',
          ai_placed: metadata?.aiPlaced ?? false,
          origin: metadata?.autoOrigin ?? 'manual',
          space_id: metadata?.spaceId,
          title: content.trim() || 'Untitled Note',
          subtype: metadata?.noteSubtype ?? 'catchall',
          body: metadata?.noteBody ?? content.trim(),
          reminders: metadata?.reminders,
        } as CreateRecordInput;
      }

      const record = await repo.create(createPayload);
      if (__DEV__) {
        console.log('[ActionToast] performCreate:success', { id: record.id, type });
      }
      metadata?.onCompleted?.(record.id);
    },
    [repo],
  );

  const handleConfirm = useCallback(async () => {
    if (!payload || isSaving) {
      return;
    }

    clearExistingTimer();
    setIsSaving(true);

    try {
      if (__DEV__) {
        console.log('[ActionToast] confirm_clicked', {
          hasCustomConfirm: !!payload.metadata?.onConfirm,
          type: payload.type,
          content: payload.content,
        });
      }
      if (payload.metadata?.onConfirm) {
        await payload.metadata.onConfirm();
        payload.metadata.onCompleted?.();
      } else {
        await performCreate(payload);
      }
      // After successful save, morph into success toast with short duration
      const successLabel = (() => {
        // Helper: constrain length with ellipsis
        const constrain = (s: string) =>
          s.length > SUCCESS_SUMMARY_MAX ? s.slice(0, SUCCESS_SUMMARY_MAX - 1) + '…' : s;
        if (payload.type === 'todo') {
          const title = stripPrefixes(payload.content.trim() || 'Untitled');
          const d = normalizeDueDate(payload.metadata?.dueDate ?? null);
          const t = normalizeDueTime(payload.metadata?.dueTime ?? null);
          const when = d && t ? `${d} ${t}` : d || t || '';
          const body = when ? `${title} — ${when}` : title;
          return constrain(`✅ ${body}`);
        }
        if (payload.type === 'habit') {
          const name = stripPrefixes(payload.content.trim() || 'New habit');
          const freq = payload.metadata?.frequency || 'daily';
          const niceFreq =
            freq === 'daily'
              ? 'every day'
              : freq === 'weekly'
                ? 'every week'
                : freq === 'monthly'
                  ? 'every month'
                  : String(freq);
          return constrain(`✅ ${name} — ${niceFreq}`);
        }
        if (payload.type === 'note') {
          const title = deriveNoteSuccessTitle(payload.content, payload.metadata?.noteBody);
          return constrain(`✅ ${title}`);
        }
        return constrain(`✅ Saved`);
      })();

      const successPayload: ActionToastInput = {
        type: 'success',
        content: successLabel,
        metadata: {
          summaryOverride: successLabel,
        },
      };
      setPayload(successPayload);
      payloadRef.current = successPayload;
      scheduleAutoDismiss(SUCCESS_DISMISS_MS);
    } catch (error) {
      console.error('[useActionToast] confirm failed', error);
      if (Platform.OS === 'ios') {
        Alert.alert('Sorry, unable to save. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  }, [clearExistingTimer, hideToast, isSaving, payload, performCreate]);

  const handleEdit = useCallback(() => {
    if (!payload) return;
    if (payload.type === 'disambiguation' || payload.type === 'success') return;

    clearExistingTimer();
    hideToast();

    if (payload.metadata?.onEdit) {
      if (__DEV__) {
        console.log('[ActionToast] edit_clicked:custom');
      }
      payload.metadata.onEdit();
      return;
    }

    if (__DEV__) {
      console.log('[ActionToast] edit_clicked:open_overlay');
    }
    const initialTitle = payload.metadata?.conversionMeta?.initialTitle ?? payload.content;
    const initialNote = payload.metadata?.conversionMeta?.initialNote ?? payload.metadata?.noteBody;

    const overlayParams = (() => {
      if (payload.type === 'habit') {
        return { type: 'habit' as CanonicalType };
      }
      if (payload.type === 'todo') {
        return { type: 'todo' as CanonicalType };
      }
      if (payload.type === 'note') {
        const noteSubtype = payload.metadata?.noteSubtype;
        // Phase 7: 'list' is no longer a subtype, it's an attribute
        // Map NoteSubtype to LogSubtype
        const logSubtype: LogSubtype | null = (() => {
          switch (noteSubtype) {
            case 'journal':
              return 'journal';
            case 'idea':
              return 'idea';
            case 'reference':
              return 'reference';
            default:
              return null; // plain
          }
        })();
        return { type: 'log' as CanonicalType, logSubtype };
      }
      return null;
    })();

    if (overlayParams) {
      overlay.openCreate({
        ...overlayParams,
        spaceId: payload.metadata?.spaceId,
        conversionMeta: {
          initialTitle,
          initialNote,
        },
      });
    }
  }, [clearExistingTimer, hideToast, overlay, payload]);

  const handleCancel = useCallback(() => {
    if (!payload) return;

    clearExistingTimer();
    if (__DEV__) {
      console.log('[ActionToast] cancel_clicked');
    }
    payload.metadata?.onCancel?.();
    hideToast();
  }, [clearExistingTimer, hideToast, payload]);

  const summary = useMemo(() => formatSummary(payload), [payload, formatSummary]);

  const toastWidth = useMemo(() => {
    const windowWidth = Dimensions.get('window').width;
    return Math.max(windowWidth * 0.2, 240);
  }, []);

  const Toast = useMemo(() => {
    if (!payload) {
      return null;
    }

    return (
      <Animated.View
        pointerEvents={isVisible ? 'auto' : 'none'}
        style={[
          styles.container,
          payload.type === 'success' && styles.successContainer,
          {
            opacity: opacityRef.current,
            width: toastWidth,
            bottom: bottomOffset,
          },
        ]}
      >
        <Text
          style={[styles.summary, payload.type === 'success' && styles.successSummary]}
          numberOfLines={3}
        >
          {summary}
        </Text>
        {payload.type === 'disambiguation' && payload.metadata?.disambiguationOptions ? (
          <View style={styles.buttonRow}>
            {payload.metadata.disambiguationOptions.choices.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.button, styles.confirmButton]}
                onPress={() => {
                  payload.metadata?.disambiguationOptions?.onChoose(c);
                }}
              >
                <Text style={[styles.buttonText, styles.confirmText]}>
                  {c === 'note' ? '📝 Note' : '✅ Todo/Reminder'}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.button} onPress={handleCancel}>
              <Text style={styles.buttonText}>✖️ Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : payload.type === 'success' ? (
          <View style={styles.buttonRow}>
            {payload.metadata?.onUndo ? (
              <TouchableOpacity
                testID="toast-undo"
                style={styles.button}
                onPress={() => {
                  try {
                    payload.metadata?.onUndo?.();
                  } finally {
                    hideToast();
                  }
                }}
              >
                <Text style={styles.buttonText}>↩️ Undo</Text>
              </TouchableOpacity>
            ) : null}

            {payload.metadata?.onViewDetails ? (
              <TouchableOpacity
                testID="toast-view-details"
                style={styles.button}
                onPress={() => {
                  try {
                    payload.metadata?.onViewDetails?.();
                  } finally {
                    hideToast();
                  }
                }}
              >
                <Text style={styles.buttonText}>🔎 View Details</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={hideToast}>
              <Text style={[styles.buttonText, styles.confirmText]}>👍 Got it</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton, isSaving && styles.disabledButton]}
              onPress={handleConfirm}
              disabled={isSaving}
            >
              <Text style={[styles.buttonText, styles.confirmText]}>✅ Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={handleEdit}>
              <Text style={styles.buttonText}>✏️ Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={handleCancel}>
              <Text style={styles.buttonText}>✖️ Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    );
  }, [handleCancel, handleConfirm, handleEdit, isSaving, isVisible, payload, summary, toastWidth]);

  return {
    showToast,
    hideToast,
    isVisible,
    Toast,
  };
}

export type { ActionToastInput, ActionToastMetadata };

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: GOLDEN_PEAR,
    zIndex: 999, // Below modal (1000) but above everything else
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10, // Android shadow
  },
  successContainer: {
    borderColor: SUCCESS_GREEN,
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
  },
  summary: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  successSummary: {
    color: '#E8FFE8',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  button: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  confirmButton: {
    backgroundColor: GOLDEN_PEAR,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  confirmText: {
    color: '#121212',
  },
});
