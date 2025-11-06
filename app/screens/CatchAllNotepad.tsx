import React, { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import {
  Animated,
  Easing,
  Alert,
  Platform,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  ToastAndroid,
  View,
  AccessibilityInfo,
  findNodeHandle,
  GestureResponderEvent,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Text } from '../../ui/Text';
import { Icon } from '../../design-system/Icon';
import { useRepo } from '../../providers/RepoProvider';
import { useCortex } from '../../providers/CortexProvider';
import { useAuth } from '../../providers/AuthProvider';
import { createCortexEngine } from '../../cortex/createEngine';
import { ConfirmationPill } from '../../components/common/ConfirmationPill';
import { MidConfidenceChips, type UISuggestion } from '../components/minddrop/MidConfidenceChips';
import { MIND_DROP_V2 } from '../../src/config/featureFlags';
import { useActionToast } from '../../src/hooks/useActionToast';
import { useTheme } from '../../src/theme/useTheme';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { shouldUseHaptics } from '../../config/featureFlags';
import { haptics } from '../../lib/haptics';
import { logCatchallDecision } from '../../lib/telemetry/catchallLogger';
import { organizedToastSummary, type OrganizedDetail } from '../../lib/ui/toast/copy';
import { startCatchallTrace, step, end } from '../../lib/diagnostics/catchallDebug';
import type { CreateRecordInput } from '../../lib/repo/IRepo';
import type { AppRecord } from '../../lib/types';
import type { CortexAction, CortexContext, CortexResponse } from '../../lib/cortex/cortexDecide';
import { persistedToCanonical } from '../../lib/cortex/canonicalMap';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { addOverlaySavedListener } from '../../lib/events/overlaySaved';
import { parseDue } from '../../lib/nlp/datetime/parseDue';
import { env } from '../../lib/env';
import { kindToDisplayLabel } from '../../lib/ui/kindToDisplayLabel';
import { appendLineageToWhyString, convertLogListToTodo, hasChecklist } from '../../lib/conversion';
import GREMLY_TOP from '../../assets/mascot/ACTUAL GREMLY.png';

export const THINKING_DURATION = 1200;
const MICROCOPY_FADE_MS = 300;
const THINKING_MICROCOPY = [
  'Organizing your thoughts …',
  'Finding a home for this …',
  'All set.',
] as const;

const AnimatedMicrocopyText = Animated.createAnimatedComponent(Text);
const INPUT_LINE_HEIGHT = 26;
const MAX_INPUT_HEIGHT = INPUT_LINE_HEIGHT * 5 + 32;

const TOGGLE_BLUE = '#9CA6E0';
const CHIPS_AUTO_DISMISS_MS =
  Number.parseInt(String(process.env.EXPO_PUBLIC_MINDDROP_CHIPS_AUTO_DISMISS_MS ?? '12000'), 10) ||
  12000;

const DUE_STRIP =
  String(process.env.EXPO_PUBLIC_MINDDROP_DUE_STRIP ?? 'on').toLowerCase() !== 'off';
const DUE_CONFIDENCE_FLOOR =
  Number.parseFloat(String(process.env.EXPO_PUBLIC_MINDDROP_DUE_CONFIDENCE ?? '0.84')) || 0.84;

function createSubmissionId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch (error) {
    void error;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `minddrop-${time}-${rand}`;
}

// Discriminating common errors without coupling too tightly:
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isNetworkError = (err: any) =>
  !!(
    err &&
    (String((err as { message?: string }).message || err).includes('Network') ||
      String((err as { name?: string }).name || '').includes('TypeError'))
  );

const UNSORTED_LABEL = 'needs_review'; // used as “Unsorted Tray” tag
const CATCHALL_LABEL = 'catchall'; // to mark Mind Drop items

type MindDropInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  placeholderTextColor: string;
  containerStyle: any;
  focusedStyle: any;
  inputStyle: any;
  onFocusChange?: (focused: boolean) => void;
  autoFocus?: boolean;
  onContentSizeChange?: (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => void;
  scrollEnabled?: boolean;
  hudContainerStyle: any;
  hudTextStyle: any;
  characterCount: number;
  lockIconColor: string; // Phase 1: theme color
};

const MindDropInput = React.memo<MindDropInputProps>(
  ({
    value,
    onChangeText,
    placeholder,
    placeholderTextColor,
    containerStyle,
    focusedStyle,
    inputStyle,
    onFocusChange,
    autoFocus = false,
    onContentSizeChange,
    scrollEnabled = false,
    hudContainerStyle,
    hudTextStyle,
    characterCount,
    lockIconColor,
  }) => {
    const inputRef = React.useRef<TextInput>(null);
    const [focused, setFocused] = React.useState(false);
    const hasAutoFocusedRef = React.useRef(false);

    const handleFocus = React.useCallback(() => {
      setFocused(true);
      onFocusChange?.(true);
    }, [onFocusChange]);

    const handleBlur = React.useCallback(() => {
      setFocused(false);
      onFocusChange?.(false);
    }, [onFocusChange]);

    // Ensure the TextInput keeps focus if parent re-renders while typing
    React.useEffect(() => {
      if (focused) {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
    }, [focused]);

    // Restore the historical behavior where the input grabs focus as soon as the screen mounts
    React.useEffect(() => {
      if (!autoFocus || hasAutoFocusedRef.current) {
        return;
      }

      hasAutoFocusedRef.current = true;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }, [autoFocus]);

    return (
      <Pressable
        testID="minddrop-input-container"
        accessible={false}
        style={[containerStyle, focused && focusedStyle]}
        onPress={() => {
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
        }}
      >
        <TextInput
          ref={inputRef}
          testID="minddrop-input"
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          multiline
          style={inputStyle}
          accessibilityLabel="Mind Drop input"
          accessibilityHint="Type anything on your mind"
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor}
          maxLength={2000}
          autoFocus={autoFocus}
          onContentSizeChange={onContentSizeChange}
          scrollEnabled={scrollEnabled}
        />
        <View style={hudContainerStyle} pointerEvents="none">
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              flexShrink: 1,
            }}
          >
            <View style={{ marginRight: 6 }}>
              <Icon name="Lock" size="xs" color={lockIconColor} strokeWidth={1.75} />
            </View>
            <Text
              testID="minddrop-privacy"
              style={hudTextStyle}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              Private & secure
            </Text>
          </View>
          <Text
            testID="minddrop-counter"
            style={[hudTextStyle, { fontSize: 11, textAlign: 'right', marginLeft: 'auto' }]}
          >{`${characterCount} / 2000`}</Text>
        </View>
      </Pressable>
    );
  },
);

MindDropInput.displayName = 'MindDropInput';

const copy = {
  title: 'Mind Drop',
} as const;

function buildChipsPrompt(suggestions: UISuggestion[]): string | null {
  const SHOW =
    String(process.env.EXPO_PUBLIC_MINDDROP_CHIPS_PROMPT ?? 'on').toLowerCase() !== 'off';
  if (!SHOW || !suggestions?.length) return null;
  const noteSuggestion = suggestions.find((s) => s.type === 'create.note');
  if (!noteSuggestion) {
    return 'Not sure? Save as a note…';
  }

  if (noteSuggestion.payload.subtype === 'list') {
    return 'Not sure? Save as a list…';
  }

  return env.feature.canonicalTypes ? 'Not sure? Save as a log…' : 'Not sure? Save as a note…';
}

// Centralized copy for consistent toasts/messages
const COPY = {
  retrying: 'Let me try again…',
  savedOfflineTitle: 'Saved offline',
  savedOfflineMsg: 'No internet — but I saved it! Will organize when connected.',
  savedUnsortedTitle: 'Saved to Unsorted',
  savedUnsortedMsg: 'Saved to your Unsorted Tray — we’ll organize it together!',
};

// Thin local fallback writer for unsorted mind drops
// Writes a single note with labels [catchall, needs_review] and a pending flag when supported
// Adapted to our repo layer shape (uses addUnsorted if available, else create)
export async function saveToUnsortedTray(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repo: any,
  text: string,
  options: { sourceMessageId?: string; whyString?: string } = {},
): Promise<string | undefined> {
  if (!text?.trim()) return undefined;
  const { sourceMessageId, whyString } = options;

  // Base create payload for our repos
  const baseInput = {
    type: 'note' as const,
    title: text,
    body: text,
    subtype: 'catchall' as const,
    ai_placed: true,
    origin: 'catchall' as const,
    labels: [CATCHALL_LABEL, UNSORTED_LABEL],
    why_string: whyString ?? null,
    sourceMessageId: sourceMessageId ?? undefined,
  };

  // If notes.create exists (future), prefer it; otherwise use addUnsorted/create
  try {
    if (repo?.notes?.create) {
      const note = await repo.notes.create({
        text,
        labels: [CATCHALL_LABEL, UNSORTED_LABEL],
        // pending_sync is optional; if unsupported downstream, it will be ignored
        pending_sync: true,
        sourceMessageId: sourceMessageId ?? undefined,
      });
      return note?.id;
    }

    if (typeof repo?.addUnsorted === 'function') {
      const created = await repo.addUnsorted(null, baseInput);
      return created?.id;
    }

    // Fallback to generic create
    const inputAny: any = { ...baseInput };
    // Hint for future reconciliation; safe to include if ignored by repo
    inputAny.pending_sync = true;
    const created = await repo.create(inputAny);
    return created?.id;
  } catch (err) {
    // Swallow transient network errors; the caller may retry separately
    if (!isNetworkError(err)) {
      // eslint-disable-next-line no-console
      console.warn('[saveToUnsortedTray] failed:', err);
    }
    return undefined;
  }
}

type UpdateFromChipParams = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repo: any;
  sourceMessageId: string;
  chosenSubtype: 'journal' | 'idea' | 'list';
  title?: string | null;
  body?: string | null;
  canonicalType?: string | null;
  views?: { alsoShowIn?: string[] };
  aiPlaced?: boolean;
  why?: string;
};

export async function updateCatchallToChosenSubtype({
  repo,
  sourceMessageId,
  chosenSubtype,
  title,
  body,
  canonicalType,
  views,
  aiPlaced,
  why = 'Chosen via chip',
}: UpdateFromChipParams) {
  if (!sourceMessageId) {
    throw new Error('sourceMessageId is required to update a catchall note');
  }

  if (typeof repo?.findNoteBySourceMessageId !== 'function') {
    throw new Error('Repository does not support findNoteBySourceMessageId');
  }

  const existingNote = await repo.findNoteBySourceMessageId(sourceMessageId);
  if (!existingNote) {
    throw new Error('No pre-saved note found for this submission');
  }

  const existingLabels = Array.isArray(existingNote.labels) ? existingNote.labels : [];
  const sanitizedLabels = existingLabels.filter((label: string) => label !== UNSORTED_LABEL);
  if (!sanitizedLabels.includes(CATCHALL_LABEL)) {
    sanitizedLabels.push(CATCHALL_LABEL);
  }

  const lineageWhy = appendLineageToWhyString(existingNote.why_string, {
    originId: existingNote.id,
    source: 'ask-chip',
  });
  const combinedWhy = [lineageWhy, why].filter(Boolean).join(' | ');

  const patch: Record<string, unknown> = {
    subtype: chosenSubtype,
    labels: sanitizedLabels,
    why_string: combinedWhy || null,
    canonicalType: canonicalType ?? existingNote.canonicalType ?? null,
    views: views ?? existingNote.views ?? {},
    ai_placed: aiPlaced ?? existingNote.ai_placed,
  };

  if (title !== undefined) {
    patch.title = title;
  }
  if (body !== undefined) {
    patch.body = body;
  }

  const updated = await repo.update({
    id: existingNote.id,
    patch: patch as any,
  });

  return updated;
}

type Mode = 'free' | 'guided';
export type ListStyle = 'none' | 'bullets' | 'numbers' | 'checklist';

type MindDropToastArgs = {
  todos?: number;
  notes?: number;
  habits?: number;
  details?: OrganizedDetail[];
};

export function nextPrefix(style: ListStyle, currentText: string): string {
  if (style === 'bullets') {
    return '• ';
  }

  if (style === 'checklist') {
    return '[ ] ';
  }

  if (style === 'numbers') {
    const trimmed = currentText.replace(/\n+$/, '');
    const lines = trimmed.length ? trimmed.split('\n') : [];
    const lastLine = lines[lines.length - 1] ?? '';
    const match = lastLine.match(/^(\d+)\.\s/);
    if (match) {
      return `${Number(match[1]) + 1}. `;
    }
    const count = lines.filter((line) => /^\d+\.\s/.test(line)).length + 1;
    return `${count}. `;
  }

  return '';
}

const LIST_TOOLBAR_OPTIONS: Array<{ key: ListStyle; label: string; testID: string }> = [
  { key: 'none', label: 'None', testID: 'ca-toolbar-list-none' },
  { key: 'bullets', label: 'Bullets', testID: 'ca-toolbar-list-bullets' },
  { key: 'numbers', label: 'Numbers', testID: 'ca-toolbar-list-numbers' },
  { key: 'checklist', label: 'Checklist', testID: 'ca-toolbar-list-checklist' },
];

function mapDecisionOutcome(mode: 'auto' | 'ask' | 'keep' | 'unsorted') {
  switch (mode) {
    case 'auto':
      return 'auto_create' as const;
    case 'ask':
      return 'ask_chip' as const;
    case 'keep':
      return 'keep_note' as const;
    default:
      return 'unsorted' as const;
  }
}

// Removed legacy hex placeholder color; placeholderTextColor now uses themed c.mutedText

export const PLACEHOLDERS = [
  'What’s on your mind?',
  'Tasks, thoughts, worries, ideas...',
  'Buy milk, call mom, that idea about...',
  'Just type everything...',
] as const;

// Trust Builders helpers
function startOfTodayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

// Recent Drops helpers and component (colocated for now)
type UnifiedDrop = {
  id: string;
  kind: 'note' | 'todo' | 'habit';
  text: string;
  created_at: string;
  unsorted?: boolean; // for notes carrying the needs_review label
  noteSubtype?: string | null;
};

const relativeTime = (iso: string) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

const RecentDrops: React.FC<{
  onEdited?: () => void;
  onDeleted?: () => void;
  refreshSignal?: number; // bump to force reload after submit
  initiallyOpen?: boolean;
  eagerLoad?: boolean;
}> = ({ onEdited, onDeleted, refreshSignal, initiallyOpen = true, eagerLoad = false }) => {
  const overlay = useGlobalOverlay();
  const repo = useRepo() as any;
  const { c, mode: themeMode } = useTheme();
  const styles = React.useMemo(() => makeStyles(c, themeMode), [c, themeMode]);

  const [open, setOpen] = React.useState(initiallyOpen); // open by default for inline confirmation
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<UnifiedDrop[]>([]);
  const [showOlder, setShowOlder] = React.useState(false); // Today-only by default
  const canonicalTypesOn = env.feature.canonicalTypes;

  const load = React.useCallback(async () => {
    const isTest = process.env.JEST_WORKAROUND === '1';
    if (!isTest) setLoading(true);
    try {
      const fetchNotes = async () => {
        if (!repo?.notes?.list) return [];
        try {
          const result = await repo.notes.list({ limit: 50, order: 'desc' });
          return Array.isArray(result) ? result : [];
        } catch {
          return [];
        }
      };

      const fetchTodos = async () => {
        if (!repo?.todos?.list) return [];
        try {
          const result = await repo.todos.list({ limit: 50, order: 'desc' });
          return Array.isArray(result) ? result : [];
        } catch {
          return [];
        }
      };

      const fetchHabits = async () => {
        if (!repo?.habits?.list) return [];
        try {
          const result = await repo.habits.list({ limit: 50, order: 'desc' });
          return Array.isArray(result) ? result : [];
        } catch {
          return [];
        }
      };

      const [notes, todos, habits] = await Promise.all([fetchNotes(), fetchTodos(), fetchHabits()]);

      const start = startOfTodayLocal();
      const cutoff = start.getTime();

      const noteDrops: UnifiedDrop[] = (Array.isArray(notes) ? notes : [])
        .filter(
          (n) =>
            n?.origin === 'catchall' ||
            (Array.isArray(n?.labels) && n.labels.includes(CATCHALL_LABEL)),
        )
        .map((n) => {
          const labels = Array.isArray(n?.labels) ? n.labels : [];
          const unsorted = labels.includes(UNSORTED_LABEL);
          const rawSubtype = typeof n?.subtype === 'string' ? n.subtype : null;
          const noteSubtype = rawSubtype ?? (unsorted ? 'catchall' : null);

          return {
            id: n.id,
            kind: 'note' as const,
            text: n.body || n.title || n.text || n.content || '',
            created_at: n.created_at,
            unsorted,
            noteSubtype,
          };
        });

      const todoDrops: UnifiedDrop[] = (Array.isArray(todos) ? todos : [])
        .filter((t) => t?.origin === 'catchall')
        .map((t) => ({
          id: t.id,
          kind: 'todo' as const,
          text: t.name || t.title || '',
          created_at: t.created_at,
        }));

      const habitDrops: UnifiedDrop[] = (Array.isArray(habits) ? habits : [])
        .filter((h) => h?.origin === 'catchall')
        .map((h) => ({
          id: h.id,
          kind: 'habit' as const,
          text: h.name || '',
          created_at: h.created_at,
        }));

      let unified = [...noteDrops, ...todoDrops, ...habitDrops].filter(
        (i) => i.text && i.created_at,
      );

      if (!showOlder) {
        unified = unified.filter((i) => {
          const ts = new Date(i.created_at).getTime();
          return Number.isFinite(ts) && ts >= cutoff; // "Today"
        });
      }

      unified = unified
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 25); // keep snappy; scroll handles overflow

      setItems(unified);
    } finally {
      if (!isTest) setLoading(false);
    }
  }, [repo, showOlder]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  useLayoutEffect(() => {
    if (eagerLoad) void load();
  }, [eagerLoad, load]);

  const handleEdit = (id: string, kind: UnifiedDrop['kind'], _unsorted?: boolean) => {
    overlay.openEdit({
      record: { id, type: kind } as any,
      spaceId: null,
    });
    onEdited?.();
  };

  const handleDelete = async (id: string, kind: UnifiedDrop['kind']) => {
    try {
      await (repo?.remove?.(id) ?? repo?.[`${kind}s`]?.delete?.(id));
      await load();
      onDeleted?.();
    } catch {
      // optional: error UI
    }
  };

  return (
    <View style={styles.recentRoot}>
      <View style={styles.recentHeaderRow}>
        <Pressable
          testID="minddrop-recent-toggle"
          onPress={() => setOpen((v) => !v)}
          style={styles.recentHeaderBtn}
          accessibilityRole="button"
          accessibilityLabel="Toggle recent drops"
          accessibilityState={{ expanded: open }}
        >
          <Text style={styles.recentHeaderText}>Recent drops {open ? '↑' : '↓'}</Text>
        </Pressable>

        <View style={styles.recentHeaderRight}>
          <Pressable onPress={() => setShowOlder(false)} accessibilityRole="button">
            <Text style={[styles.recentToggle, !showOlder && styles.recentToggleActive]}>
              Today
            </Text>
          </Pressable>
          <Text style={styles.recentDot}>•</Text>
          <Pressable onPress={() => setShowOlder(true)} accessibilityRole="button">
            <Text style={[styles.recentToggle, showOlder && styles.recentToggleActive]}>
              Show older
            </Text>
          </Pressable>
        </View>
      </View>

      {open ? (
        <View testID="minddrop-recent-list" style={styles.recentList}>
          {loading ? (
            <Text style={styles.recentEmpty}>Loading…</Text>
          ) : items.length === 0 ? (
            <Text style={styles.recentEmpty}>
              {showOlder ? 'No drops yet.' : 'No drops yet today.'}
            </Text>
          ) : (
            <ScrollView
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
              showsVerticalScrollIndicator
            >
              {items.map((item) => {
                const displayKind = kindToDisplayLabel(
                  item.kind,
                  item.noteSubtype ?? null,
                  canonicalTypesOn,
                );
                const showLegacyUnsortedBadge =
                  !canonicalTypesOn && item.kind === 'note' && item.unsorted;

                return (
                  <View
                    key={`${item.kind}:${item.id}`}
                    testID={`minddrop-recent-${item.kind}-${item.id}`}
                    style={styles.recentCard}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 8,
                      }}
                    >
                      <Text numberOfLines={2} style={styles.recentText}>
                        {item.text || '—'}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Text style={[styles.recentBadge, styles[`badge_${item.kind}` as const]]}>
                          {displayKind}
                        </Text>
                        {showLegacyUnsortedBadge ? (
                          <Text style={[styles.recentBadge, styles.badge_unsorted]}>Unsorted</Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.recentMetaRow}>
                      <Text style={styles.recentTime}>{relativeTime(item.created_at)}</Text>
                      <View style={styles.recentActions}>
                        <Pressable
                          onPress={() => handleEdit(item.id, item.kind, item.unsorted)}
                          hitSlop={8}
                          accessibilityRole="button"
                        >
                          <Text style={styles.recentAction}>Edit</Text>
                        </Pressable>
                        <Text style={styles.recentDot}>•</Text>
                        <Pressable
                          onPress={() => handleDelete(item.id, item.kind)}
                          hitSlop={8}
                          accessibilityRole="button"
                        >
                          <Text style={styles.recentActionDelete}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
};

// Memoize RecentDrops to avoid re-rendering when parent state (subtitle, trust, tips) changes
const RecentDropsMemo = React.memo(RecentDrops);

// Named export for tests to import the isolated component
export const RecentDropsTestable = RecentDrops;

export type CatchAllNotepadProps = {
  trustRefreshMs?: number;
  // Optional P8: allow parent to pass network status if a hook exists elsewhere
  networkIsOnline?: boolean;
};

export default function CatchAllNotepad(props: CatchAllNotepadProps = {}): React.JSX.Element {
  const { trustRefreshMs = 60000, networkIsOnline } = props;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const repo = useRepo();
  const { decideWithContext } = useCortex();
  const { user, userId } = useAuth();
  const { showToast: showActionToast, Toast: ActionToast } = useActionToast({
    bottomOffset: Platform.select({ ios: 112, android: 112, default: 112 }) ?? 112,
  });
  const TOASTS_ON = String(process.env.EXPO_PUBLIC_MINDDROP_TOASTS ?? 'off').toLowerCase() === 'on';
  const insets = useSafeAreaInsets();
  const themeResult = useTheme();
  const c = React.useMemo(() => themeResult.c, [themeResult.mode]);
  const motion = themeResult.motion;
  const themeMode = themeResult.mode;
  const styles = React.useMemo(() => makeStyles(c, themeMode), [c, themeMode]);
  const reduceMotion = useReducedMotion();
  const [uiMode, setUiMode] = useState<Mode>('free');
  const [listStyle, setListStyle] = useState<ListStyle>('none');
  const [note, setNote] = useState('');
  const [inputHeight, setInputHeight] = useState<number>(140);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [microcopyIndex, setMicrocopyIndex] = useState(0);
  const [confirmations, setConfirmations] = useState<string[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<UISuggestion[]>([]);
  // Auto-dismiss chips after configured interval so parent owns lifecycle
  useEffect(() => {
    if (!suggestions?.length) return;
    const timeout = setTimeout(() => setSuggestions([]), CHIPS_AUTO_DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [suggestions, CHIPS_AUTO_DISMISS_MS]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseScale = useRef(new Animated.Value(1)).current;
  const microcopyOpacity = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const microcopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);
  // Mind Drop: subtitle + static placeholder
  const greetingRef = useRef<any>(null);
  const subtitle = '✶ Capture those late-night thoughts…';
  const [placeholder] = useState('Drop your thoughts here…');
  const inputFocusRef = useRef(false);
  const handleInputFocusChange = useCallback((focused: boolean) => {
    inputFocusRef.current = focused;
  }, []);

  const handleInputContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const nextHeight = Math.min(event.nativeEvent.contentSize.height, MAX_INPUT_HEIGHT);
      setInputHeight((prev) => (Math.abs(prev - nextHeight) < 0.5 ? prev : nextHeight));
    },
    [setInputHeight],
  );

  // Mind Drop P4: submit lifecycle & guardrails
  const pendingUndo = useRef<{ todos: string[]; notes: string[]; habits: string[] }>({
    todos: [],
    notes: [],
    habits: [],
  });
  const unsortedIdRef = useRef<string | null>(null);
  const submissionIdRef = useRef<string | null>(null);
  const lastSubmitAt = useRef<number>(0);
  const submitLockRef = useRef(false);
  // Trust Builders: organized today count
  const [organizedToday, setOrganizedToday] = useState<number>(0);
  const trustRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recentRefresh, setRecentRefresh] = useState(0);
  const canonicalConversionsOn = env.feature.canonicalConversions;

  // Stable noop callbacks for RecentDrops to prevent unnecessary re-renders
  const noopCallback = useCallback(() => {}, []);

  const isProcessing = isSubmitting || isThinking;

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
      pulseScale.stopAnimation();
      pulseScale.setValue(1);
      return;
    }

    if (isProcessing) {
      pulseLoopRef.current?.stop();
      pulseScale.stopAnimation();
      pulseScale.setValue(1);
      const grow = Animated.timing(pulseScale, {
        toValue: 1.05,
        duration: motion.pulseMs / 2,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
      const shrink = Animated.timing(pulseScale, {
        toValue: 1,
        duration: motion.pulseMs / 2,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
      const loop = Animated.loop(Animated.sequence([grow, shrink]));
      pulseLoopRef.current = loop;
      loop.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
      pulseScale.stopAnimation();
      pulseScale.setValue(1);
    }

    return () => {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
      pulseScale.stopAnimation();
    };
  }, [isProcessing, reduceMotion, motion.pulseMs, pulseScale]);

  useEffect(() => {
    if (microcopyTimerRef.current) {
      clearTimeout(microcopyTimerRef.current);
      microcopyTimerRef.current = null;
    }

    if (!isProcessing) {
      microcopyOpacity.stopAnimation();
      microcopyOpacity.setValue(0);
      setMicrocopyIndex(0);
      return;
    }

    if (reduceMotion) {
      microcopyOpacity.stopAnimation();
      microcopyOpacity.setValue(1);
      setMicrocopyIndex(0);
      return;
    }

    microcopyOpacity.stopAnimation();
    microcopyOpacity.setValue(0);
    setMicrocopyIndex(0);

    const fadeIn = Animated.timing(microcopyOpacity, {
      toValue: 1,
      duration: MICROCOPY_FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });

    const scheduleNext = () => {
      const delay = Math.max(motion.pulseMs, MICROCOPY_FADE_MS * 2);
      microcopyTimerRef.current = setTimeout(() => {
        if (!isProcessingRef.current) {
          return;
        }

        Animated.timing(microcopyOpacity, {
          toValue: 0,
          duration: MICROCOPY_FADE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!finished || !isProcessingRef.current) {
            return;
          }

          setMicrocopyIndex((prev) => (prev + 1) % THINKING_MICROCOPY.length);

          Animated.timing(microcopyOpacity, {
            toValue: 1,
            duration: MICROCOPY_FADE_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start(({ finished: fadeInFinished }) => {
            if (fadeInFinished && isProcessingRef.current) {
              scheduleNext();
            }
          });
        });
      }, delay);
    };

    fadeIn.start(({ finished }) => {
      if (finished && isProcessingRef.current) {
        scheduleNext();
      }
    });

    return () => {
      if (microcopyTimerRef.current) {
        clearTimeout(microcopyTimerRef.current);
        microcopyTimerRef.current = null;
      }
      microcopyOpacity.stopAnimation();
    };
  }, [isProcessing, reduceMotion, microcopyOpacity, motion.pulseMs]);

  // Subtitle is static for consistent welcome tone

  const handleInfoOpen = useCallback(() => setInfoOpen(true), []);
  const handleInfoClose = useCallback(() => setInfoOpen(false), []);
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      (navigation as any).navigate('Tabs');
    }
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Trust Builders: loader for today's organized count
  const refreshOrganizedToday = useCallback(async () => {
    try {
      const since = startOfTodayLocal().toISOString();

      // Attempt to use repo APIs if available; otherwise, fall back to filtering
      const notes: any[] = (await (repo as any)?.notes?.list?.({ createdAfter: since })) ?? [];
      const todos: any[] = (await (repo as any)?.todos?.list?.({ createdAfter: since })) ?? [];
      const habits: any[] = (await (repo as any)?.habits?.list?.({ createdAfter: since })) ?? [];

      // no-op

      const count = [notes, todos, habits]
        .map((arr) =>
          Array.isArray(arr)
            ? arr.filter((i) => new Date(i.created_at) >= new Date(since)).length
            : 0,
        )
        .reduce((a, b) => a + b, 0);

      // Only update state if count actually changed to prevent unnecessary re-renders
      setOrganizedToday((prev) => (prev === count ? prev : count));
      // Optional debug for tests/dev; avoid error overlay in RN
      if (__DEV__ && process.env.JEST_WORKAROUND === '1') {
        // eslint-disable-next-line no-console
        console.debug('[TrustBuilders] computed count', count);
      }
    } catch (e) {
      // Silent fail — keep last known number
    }
  }, [repo]);

  useEffect(() => {
    const unsub = addOverlaySavedListener(() => {
      void refreshOrganizedToday?.();
      setRecentRefresh?.((v) => v + 1);
    });
    return unsub;
  }, [refreshOrganizedToday]);

  // Memoized disabled state: only depends on note & isSubmitting, isolating input from unrelated state
  const disabled = useMemo(
    () => note.trim().length === 0 || isSubmitting || isThinking,
    [note, isSubmitting, isThinking],
  );

  const modeDescription = useMemo(() => {
    return uiMode === 'free'
      ? 'Just a calm notepad. You can format with bullets, numbers, or checkboxes.'
      : 'Talk it out with Gremly — I’ll suggest structure and help file it.';
  }, [uiMode]);

  const handleModeSelect = useCallback((next: Mode) => {
    setUiMode(next);
  }, []);

  const handleToolbarSelect = useCallback((next: ListStyle) => {
    setListStyle(next);
  }, []);

  const resetState = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    unsortedIdRef.current = null;
    submissionIdRef.current = null;
    setNote('');
    setIsSubmitting(false);
    setIsThinking(false);
    setConfirmations([]);
    setSuggestions([]);
  }, []);

  // Trust Builders: start timer and initial refresh
  useEffect(() => {
    let mounted = true;
    (async () => {
      await refreshOrganizedToday();
      // Refresh count every 60s, but skip if user is typing to prevent TextInput disruption
      trustRefreshRef.current = setInterval(() => {
        if (!inputFocusRef.current) {
          void refreshOrganizedToday();
        }
      }, trustRefreshMs);
    })();
    return () => {
      mounted = false;
      if (trustRefreshRef.current) clearInterval(trustRefreshRef.current);
    };
  }, [refreshOrganizedToday, trustRefreshMs]);

  // Undo last created items (todos/notes/habits)
  const handleUndoCreated = useCallback(async () => {
    const snapshot = pendingUndo.current;
    if (
      !snapshot ||
      (!snapshot.todos.length && !snapshot.notes.length && !snapshot.habits.length)
    ) {
      if (TOASTS_ON) {
        showActionToast({ type: 'success', content: 'Nothing to undo' });
      }
      return;
    }

    try {
      // Delete items; if relationships exist, adjust order accordingly
      await Promise.all([
        ...snapshot.todos.map((id) => repo.remove(id)),
        ...snapshot.habits.map((id) => repo.remove(id)),
        ...snapshot.notes.map((id) => repo.remove(id)),
      ]);

      // Clear snapshot to avoid repeat undo
      pendingUndo.current = { todos: [], notes: [], habits: [] };

      if (TOASTS_ON) {
        showActionToast({ type: 'success', content: '✅ Undo complete — Mind Drop reverted' });
      }
    } catch (e) {
      Alert.alert('Undo failed', 'Could not revert items. You can edit from Recent.');
    }
  }, [repo, showActionToast, TOASTS_ON]);

  // Navigate to Hub → Recent (fallback toast if route missing)
  const handleViewDetails = useCallback(() => {
    try {
      // Navigate to Hub tab; pass filter for future use if supported
      (navigation as any).navigate('Tabs', { screen: 'Hub', params: { filter: 'recent' } });
    } catch (err) {
      if (TOASTS_ON) {
        showActionToast({
          type: 'success',
          content: 'ℹ️ Open Hub → Recent to see new items',
        });
      }
    }
  }, [navigation, showActionToast, TOASTS_ON]);

  const handleInfoViewRecent = useCallback(() => {
    handleInfoClose();
    handleViewDetails();
  }, [handleInfoClose, handleViewDetails]);

  // A11y: set focus to the greeting after successful actions
  const focusGreetingForA11y = useCallback(() => {
    try {
      const node = findNodeHandle(greetingRef.current);
      if (node) {
        // Optional API depending on platform
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (AccessibilityInfo as any).setAccessibilityFocus?.(node);
      }
    } catch (e) {
      void e;
    }
  }, []);

  // Shared success toast helper for Mind Drop
  const showMindDropSuccessToast = useCallback(
    (args: MindDropToastArgs = {}) => {
      if (!TOASTS_ON) {
        try {
          if (shouldUseHaptics()) void haptics.submitSuccess();
        } catch (e) {
          void e;
        }
        try {
          AccessibilityInfo.announceForAccessibility?.('Mind Drop organized successfully.');
        } catch (e) {
          void e;
        }
        return;
      }

      const { todos, notes, habits, details } = args;
      const counts = { todos, notes, habits };
      const label = organizedToastSummary(counts, {
        canonicalTypesOn: env.feature.canonicalTypes,
        details,
      });

      showActionToast({
        type: 'success',
        content: label,
        metadata: {
          onUndo: handleUndoCreated,
          onViewDetails: handleViewDetails,
        },
      });
      try {
        if (shouldUseHaptics()) void haptics.submitSuccess();
      } catch (e) {
        void e;
      }
      // Announce for accessibility
      try {
        AccessibilityInfo.announceForAccessibility?.('Mind Drop organized successfully.');
      } catch (e) {
        void e;
      }
    },
    [TOASTS_ON, showActionToast, handleUndoCreated, handleViewDetails],
  );

  type SaveResult = {
    created: { todos: string[]; notes: string[]; habits: string[] };
    createdDetails: OrganizedDetail[];
    suggestions?: UISuggestion[];
    decisionMode?: CortexResponse['mode'];
    decisionConfidence?: number;
  };

  const performSave = useCallback(async (): Promise<SaveResult> => {
    const trimmed = note.trim();
    const trace = startCatchallTrace('minddrop');
    step(trace, 'submit', { length: trimmed.length });

    try {
      if (!trimmed) {
        resetState();
        end(trace, 'empty', { length: 0 });
        return { created: { todos: [], notes: [], habits: [] }, createdDetails: [] };
      }

      const currentUserId = user?.id ?? userId ?? 'anonymous';
      const engineMode: 'LLM' | 'HEURISTIC' | 'DISABLED' = 'LLM';
      const modelVersion = process.env.EXPO_PUBLIC_CORTEX_MODEL || 'gpt-4o-mini';
      const submissionId = submissionIdRef.current ?? createSubmissionId();
      submissionIdRef.current = submissionId;

      const parsed = parseDue(trimmed);
      const hasConfidentDue = !!parsed && parsed.confidence >= DUE_CONFIDENCE_FLOOR;
      const cleanedSource =
        hasConfidentDue && DUE_STRIP ? (parsed?.textWithoutWhen ?? '') : trimmed;
      const cleanedText = cleanedSource.trim() || trimmed;
      const parsedIso = hasConfidentDue && parsed ? parsed.iso : null;

      setSuggestions([]);

      let decision: CortexResponse | null = null;
      try {
        const ctx: CortexContext = {
          userId: currentUserId,
          activeSpaceId: null,
          uiSurface: 'overlay',
          lane: 'catchall',
        };
        decision = await decideWithContext({ text: trimmed }, ctx);
        step(trace, 'decide:result', {
          mode: decision.mode,
          confidence: decision.confidence,
          actions: Array.isArray(decision.actions) ? decision.actions.map((a) => a.type) : [],
          suggestions: Array.isArray(decision.suggestions) ? decision.suggestions.length : 0,
        });
      } catch (err) {
        console.warn('[MindDrop][Decide] error', String(err));
        step(trace, 'decide:error', { error: String(err) });
      }

      if (decision) {
        const actions = Array.isArray(decision.actions) ? (decision.actions as CortexAction[]) : [];
        const chipSuggestions = Array.isArray(decision.suggestions)
          ? (decision.suggestions as unknown[]).filter(
              (s): s is UISuggestion =>
                !!s && typeof s === 'object' && 'type' in s && 'label' in s && 'payload' in s,
            )
          : [];

        if (decision.mode === 'auto' && actions.length > 0) {
          const mapped: Array<{
            bucket: 'todos' | 'notes' | 'habits';
            payload: CreateRecordInput;
          }> = [];
          let unsupported = false;

          for (const action of actions) {
            if (action.type === 'create.todo') {
              const title = (action.payload.title?.trim() || cleanedText).trim() || 'Quick task';
              const due = action.payload.due ?? parsedIso ?? null;
              mapped.push({
                bucket: 'todos',
                payload: {
                  type: 'todo',
                  title,
                  name: title,
                  due_date: due,
                  undefined_due: !due,
                  space_id: action.payload.spaceId ?? null,
                  ai_placed: true,
                  why_string: decision.explanation || 'Organized via Mind Drop',
                  origin: 'catchall',
                  sourceMessageId: submissionId,
                },
              });
            } else if (action.type === 'create.habit') {
              const name = action.payload.name?.trim() || cleanedText || trimmed;
              const freqRaw = action.payload.freq;
              const frequency: 'daily' | 'weekly' | 'monthly' =
                freqRaw === 'weekly' ? 'weekly' : 'daily';

              mapped.push({
                bucket: 'habits',
                payload: {
                  type: 'habit',
                  name,
                  frequency,
                  space_id: action.payload.spaceId ?? null,
                  ai_placed: true,
                  why_string: decision.explanation || 'Organized via Mind Drop',
                  origin: 'catchall',
                  sourceMessageId: submissionId,
                },
              });
            } else if (action.type === 'create.note') {
              const text = action.payload.text?.trim() || cleanedText || trimmed;
              const rawSubtype = action.payload.subtype;
              const subtype = rawSubtype === 'journal' ? 'journal' : 'catchall';
              const canonicalType = persistedToCanonical('note', subtype);

              mapped.push({
                bucket: 'notes',
                payload: {
                  type: 'note',
                  title: text || 'Quick note',
                  body: text,
                  subtype,
                  origin: 'catchall',
                  ai_placed: subtype !== 'catchall',
                  space_id: action.payload.spaceId ?? null,
                  why_string: decision.explanation || 'Organized via Mind Drop',
                  canonicalType,
                  labels: [CATCHALL_LABEL],
                  views: { alsoShowIn: ['Hub:Catch-All'] },
                  sourceMessageId: submissionId,
                },
              });
            } else if (action.type === 'add.to.list') {
              const itemText = action.payload.item?.trim() || cleanedText || trimmed;
              const title = cleanedText || itemText || trimmed || 'Quick list';
              const canonicalType = persistedToCanonical('note', 'list');

              mapped.push({
                bucket: 'notes',
                payload: {
                  type: 'note',
                  title,
                  body: cleanedText || itemText,
                  subtype: 'list',
                  origin: 'catchall',
                  ai_placed: true,
                  space_id: action.payload.spaceId ?? null,
                  why_string: decision.explanation || 'Ideas/list capture',
                  canonicalType,
                  labels: [CATCHALL_LABEL],
                  views: { alsoShowIn: ['Hub:Catch-All'] },
                  sourceMessageId: submissionId,
                },
              });
            } else {
              unsupported = true;
              break;
            }
          }

          if (!unsupported && mapped.length > 0) {
            const createdIds = {
              todos: [] as string[],
              notes: [] as string[],
              habits: [] as string[],
            };
            const counts = { todos: 0, notes: 0, habits: 0 };
            const createdDetails: OrganizedDetail[] = [];

            try {
              for (const entry of mapped) {
                const record = await repo.create(entry.payload);
                if (entry.bucket === 'todos') {
                  counts.todos += 1;
                  createdIds.todos.push(record.id);
                  createdDetails.push({ kind: 'todo' });
                } else if (entry.bucket === 'habits') {
                  counts.habits += 1;
                  createdIds.habits.push(record.id);
                  createdDetails.push({ kind: 'habit' });
                } else {
                  counts.notes += 1;
                  createdIds.notes.push(record.id);
                  const payloadSubtype =
                    typeof (entry.payload as any)?.subtype === 'string'
                      ? (entry.payload as any).subtype
                      : null;
                  createdDetails.push({
                    kind: 'note',
                    noteSubtype: payloadSubtype,
                  });
                }
              }

              setSuggestions([]);

              const firstAction = actions[0];
              const probableIntent =
                firstAction?.type === 'create.todo'
                  ? 'todo'
                  : firstAction?.type === 'create.habit'
                    ? 'habit'
                    : 'note';

              void logCatchallDecision({
                userId: currentUserId,
                text: trimmed,
                surface: 'catchall',
                engine: engineMode,
                modelVersion,
                intent: probableIntent,
                confidence: decision.confidence ?? 0,
                mode: decision.mode,
                decision: mapDecisionOutcome(decision.mode),
                createdTodos: counts.todos,
                createdNotes: counts.notes,
                createdHabits: counts.habits,
              });

              end(trace, 'saved', {
                ids: createdIds,
                mode: decision.mode,
              });

              return {
                created: createdIds,
                createdDetails,
                decisionMode: decision.mode,
                decisionConfidence: decision.confidence,
              };
            } catch (err) {
              console.warn('[MindDrop][Decide] action execution failed, falling back', err);
            }
          }
        }

        if (decision.mode === 'ask' && chipSuggestions.length > 0) {
          try {
            const id = await saveToUnsortedTray(repo as any, trimmed, {
              sourceMessageId: submissionId,
              whyString: 'Awaiting chip selection',
            });
            unsortedIdRef.current = id ?? null;
          } catch (e) {
            console.warn('[MindDrop][Ask] failed to save to Unsorted', e);
          }

          const savedUnsortedId = unsortedIdRef.current;
          const enrichedChips = chipSuggestions.map((s) => {
            if (s.type === 'create.todo') {
              const name = (s.payload?.name || cleanedText || '').trim();
              const due = s.payload?.due ?? s.payload?.due_date ?? parsedIso ?? null;
              return {
                ...s,
                payload: {
                  ...s.payload,
                  name,
                  due,
                  due_date: due,
                  undefined_due: !due,
                },
              } as UISuggestion;
            }

            if (s.type === 'convert.log-list-to-todo') {
              return {
                ...s,
                payload: {
                  noteId: savedUnsortedId ?? s.payload?.noteId ?? null,
                  preserveState: s.payload?.preserveState ?? true,
                },
              } as UISuggestion;
            }

            return s;
          });

          if (canonicalConversionsOn && savedUnsortedId && hasChecklist(trimmed)) {
            const hasConversionChip = enrichedChips.some(
              (chip) => chip.type === 'convert.log-list-to-todo',
            );

            if (!hasConversionChip) {
              enrichedChips.unshift({
                type: 'convert.log-list-to-todo',
                label: env.feature.canonicalTypes ? 'Convert to to-do' : 'Convert to task',
                payload: {
                  noteId: savedUnsortedId,
                  preserveState: true,
                },
              });
            }
          }

          const visibleChips = canonicalConversionsOn
            ? enrichedChips
            : enrichedChips.filter((chip) => chip.type !== 'convert.log-list-to-todo');

          setSuggestions(visibleChips);
          setNote('');
          setRecentRefresh?.((v) => v + 1);
          pendingUndo.current = { todos: [], notes: [], habits: [] };

          void logCatchallDecision({
            userId: currentUserId,
            text: trimmed,
            surface: 'catchall',
            engine: engineMode,
            modelVersion,
            intent: decision.meta?.intent?.kind ?? 'ambiguous',
            confidence: decision.confidence ?? 0,
            mode: decision.mode,
            decision: mapDecisionOutcome('ask'),
            createdTodos: 0,
            createdNotes: 0,
            createdHabits: 0,
          });

          step(trace, 'decide:chips', { count: chipSuggestions.length });
          return {
            created: { todos: [], notes: [], habits: [] },
            createdDetails: [],
            suggestions: enrichedChips,
            decisionMode: decision.mode,
            decisionConfidence: decision.confidence,
          };
        }
      }

      step(trace, 'classify:start', { excerpt: trimmed.slice(0, 120) });
      let classifyOut: any = null;
      try {
        const engine = createCortexEngine();
        classifyOut = await engine.classify({ text: trimmed, spaceId: null });
        step(trace, 'classify:result', classifyOut);
      } catch (err) {
        console.warn('[MindDrop][Classify] error', String(err));
        step(trace, 'classify:error', { error: String(err) });
      }

      const createdIds = {
        todos: [] as string[],
        notes: [] as string[],
        habits: [] as string[],
      };
      const counts = { todos: 0, notes: 0, habits: 0 };
      const createdDetails: OrganizedDetail[] = [];

      const looksLikeIdeas =
        /\bideas?\b|brainstorm|wish\s*list|packing\s*list|itinerary|list/i.test(trimmed);
      if (looksLikeIdeas && classifyOut?.type === 'todo') {
        classifyOut = {
          type: 'note',
          subtype: 'list',
          aiPlaced: true,
          whyString: 'Ideas/list capture',
        };
      }

      let payload: CreateRecordInput;
      if (classifyOut?.type === 'todo') {
        const due = parsedIso ?? null;
        payload = {
          type: 'todo',
          title: cleanedText,
          name: cleanedText,
          due_date: due,
          undefined_due: !due,
          space_id: null,
          ai_placed: true,
          why_string: classifyOut?.whyString || 'Auto-classified as a task',
          origin: 'catchall',
          sourceMessageId: submissionId,
        };
      } else if (classifyOut?.type === 'habit') {
        const freqRaw = typeof classifyOut?.frequency === 'string' ? classifyOut.frequency : null;
        const frequency: 'daily' | 'weekly' | 'monthly' =
          freqRaw === 'weekly' ? 'weekly' : freqRaw === 'monthly' ? 'monthly' : 'daily';

        payload = {
          type: 'habit',
          name: cleanedText || trimmed,
          frequency,
          space_id: null,
          ai_placed: true,
          why_string: classifyOut?.whyString || 'Auto-classified as a habit',
          origin: 'catchall',
          sourceMessageId: submissionId,
        };
      } else {
        const subtype =
          classifyOut?.type === 'note' &&
          (classifyOut?.subtype === 'journal' || classifyOut?.subtype === 'list')
            ? classifyOut.subtype
            : 'catchall';
        const canonicalType = persistedToCanonical('note', subtype);

        payload = {
          type: 'note',
          title: cleanedText || trimmed || 'Quick note',
          body: cleanedText || trimmed,
          subtype,
          origin: 'catchall',
          ai_placed:
            classifyOut?.type === 'note' &&
            (classifyOut?.subtype === 'journal' || classifyOut?.subtype === 'list')
              ? (classifyOut?.aiPlaced ?? true)
              : false,
          space_id: null,
          why_string: classifyOut?.whyString || 'Saved from Catch-All Notepad',
          canonicalType,
          labels: [CATCHALL_LABEL],
          views: {
            alsoShowIn: ['Hub:Catch-All'],
          },
          sourceMessageId: submissionId,
        };
      }

      step(trace, 'payload:final', payload);
      const rec = await repo.create(payload);

      if (payload.type === 'todo') {
        counts.todos = 1;
        createdIds.todos.push(rec.id);
        createdDetails.push({ kind: 'todo' });
      } else if (payload.type === 'habit') {
        counts.habits = 1;
        createdIds.habits.push(rec.id);
        createdDetails.push({ kind: 'habit' });
      } else {
        counts.notes = 1;
        createdIds.notes.push(rec.id);
        const subtypeValue =
          typeof (payload as any)?.subtype === 'string' ? (payload as any).subtype : null;
        createdDetails.push({ kind: 'note', noteSubtype: subtypeValue });
      }

      const probableIntent =
        payload.type === 'todo' ? 'todo' : payload.type === 'habit' ? 'habit' : 'note';
      const decisionMode = payload.type === 'note' ? 'keep' : 'auto';
      const decisionOutcome = payload.type === 'note' ? 'unsorted' : 'auto_create';

      void logCatchallDecision({
        userId: currentUserId,
        text: trimmed,
        surface: 'catchall',
        engine: engineMode,
        modelVersion,
        intent: probableIntent,
        confidence:
          typeof classifyOut?.confidence === 'number' && Number.isFinite(classifyOut.confidence)
            ? classifyOut.confidence
            : 0,
        mode: decisionMode,
        decision: decisionOutcome,
        createdTodos: counts.todos,
        createdNotes: counts.notes,
        createdHabits: counts.habits,
      });

      end(trace, 'saved', {
        id: rec?.id,
        type: payload.type,
        subtype: (payload as any)?.subtype,
      });

      return {
        created: createdIds,
        createdDetails,
        decisionMode,
        decisionConfidence:
          typeof classifyOut?.confidence === 'number' ? classifyOut.confidence : undefined,
      };
    } catch (error) {
      console.error('[CatchAllNotepad] Failed to capture note', error);
      end(trace, 'error', { message: String(error) });
      throw error;
    }
  }, [note, repo, user, userId, decideWithContext]);

  const handlePickSuggestion = useCallback(
    async (suggestion: UISuggestion) => {
      const trimmed = note.trim();
      const conversionsEnabled = canonicalConversionsOn;

      try {
        const existingUnsortedId = unsortedIdRef.current;
        const submissionId = submissionIdRef.current ?? createSubmissionId();
        submissionIdRef.current = submissionId;
        const isConversion = suggestion.type === 'convert.log-list-to-todo';
        const shouldRemoveUnsorted =
          !!existingUnsortedId && !isConversion && suggestion.type !== 'create.note';

        if (isConversion && !conversionsEnabled) {
          console.warn('[MindDrop][Chip] Conversion suggestion ignored (flag disabled)');
          return;
        }

        if (shouldRemoveUnsorted) {
          try {
            await (repo as any).remove?.(existingUnsortedId);
          } catch (e) {
            console.warn('[MindDrop][Chip] failed to remove unsorted', e);
          } finally {
            unsortedIdRef.current = null;
          }
        }

        setIsSubmitting(true);

        const createdIds = {
          todos: [] as string[],
          notes: [] as string[],
          habits: [] as string[],
        };
        const counts = { todos: 0, notes: 0, habits: 0 };
        const details: OrganizedDetail[] = [];

        if (suggestion.type === 'create.todo') {
          const rawTodoText = suggestion.payload.name?.trim() || trimmed;
          const ideasPattern = /\bideas?\b|brainstorm|wish\s*list|packing\s*list|itinerary|list/i;

          if (ideasPattern.test(rawTodoText)) {
            const canonicalType = persistedToCanonical('note', 'list');
            const record = await repo.create({
              type: 'note',
              title: rawTodoText || 'Quick note',
              body: rawTodoText,
              subtype: 'list',
              origin: 'catchall',
              ai_placed: true,
              space_id: null,
              why_string: 'Chosen via chip (ideas/list safety)',
              canonicalType,
              labels: [CATCHALL_LABEL],
              views: { alsoShowIn: ['Hub:Catch-All'] },
              sourceMessageId: submissionId,
            });
            counts.notes = 1;
            createdIds.notes.push(record.id);
            details.push({ kind: 'note', noteSubtype: 'list' });
          } else {
            const due = suggestion.payload.due ?? suggestion.payload.due_date ?? null;
            const record = await repo.create({
              type: 'todo',
              title: rawTodoText,
              name: rawTodoText,
              due_date: due,
              undefined_due: !due,
              ai_placed: true,
              why_string: 'Chosen via chip',
              origin: 'catchall',
              views: {},
              sourceMessageId: submissionId,
            });
            counts.todos = 1;
            createdIds.todos.push(record.id);
            details.push({ kind: 'todo' });
          }
        } else if (suggestion.type === 'create.habit') {
          const record = await repo.create({
            type: 'habit',
            name: suggestion.payload.name,
            frequency: suggestion.payload.freq,
            ai_placed: true,
            why_string: 'Chosen via chip',
            origin: 'catchall',
            views: {},
            sourceMessageId: submissionId,
          });
          counts.habits = 1;
          createdIds.habits.push(record.id);
          details.push({ kind: 'habit' });
        } else if (suggestion.type === 'convert.log-list-to-todo') {
          if (!conversionsEnabled) {
            console.warn('[MindDrop][Chip] Conversion attempt blocked (flag disabled)');
            return;
          }
          const targetId = suggestion.payload.noteId || existingUnsortedId;
          if (!targetId) {
            throw new Error('Missing note id for conversion');
          }

          const { todo } = await convertLogListToTodo(repo, targetId, {
            preserveState: suggestion.payload.preserveState ?? true,
          });

          counts.todos = 1;
          createdIds.todos.push(todo.id);
          details.push({ kind: 'todo' });
          unsortedIdRef.current = null;
        } else if (suggestion.type === 'create.note') {
          const rawSubtype = suggestion.payload.subtype as string | undefined;
          const canonicalType = persistedToCanonical('note', rawSubtype ?? undefined);
          const viewsValue =
            suggestion.payload.subtype === 'list' ? { alsoShowIn: ['Hub:Catch-All'] } : {};
          const aiPlaced = (suggestion.payload.subtype as string) !== 'catchall';
          const canUpdateCatchall =
            rawSubtype === 'journal' || rawSubtype === 'idea' || rawSubtype === 'list';

          let record: AppRecord | null = null;

          if (
            submissionId &&
            canUpdateCatchall &&
            typeof (repo as any).findNoteBySourceMessageId === 'function'
          ) {
            try {
              record = await updateCatchallToChosenSubtype({
                repo,
                sourceMessageId: submissionId,
                chosenSubtype: rawSubtype as 'journal' | 'idea' | 'list',
                title: suggestion.payload.title,
                body: suggestion.payload.body,
                canonicalType,
                views: viewsValue,
                aiPlaced,
                why: 'Chosen via chip',
              });
              unsortedIdRef.current = null;
            } catch (updateError) {
              console.warn(
                '[MindDrop][Chip] catchall update failed, falling back to create',
                updateError,
              );
            }
          }

          if (!record && existingUnsortedId) {
            try {
              record = await repo.update({
                id: existingUnsortedId,
                patch: {
                  title: suggestion.payload.title,
                  body: suggestion.payload.body,
                  subtype: suggestion.payload.subtype,
                  ai_placed: aiPlaced,
                  why_string: 'Chosen via chip',
                  origin: 'catchall',
                  canonicalType,
                  labels: [CATCHALL_LABEL],
                  views: viewsValue,
                } as any,
              });
              unsortedIdRef.current = null;
            } catch (updateByIdError) {
              console.warn('[MindDrop][Chip] fallback update by id failed', updateByIdError);
              record = null;
            }
          }

          if (!record) {
            record = await repo.create({
              type: 'note',
              title: suggestion.payload.title,
              body: suggestion.payload.body,
              subtype: suggestion.payload.subtype,
              origin: 'catchall',
              ai_placed: aiPlaced,
              space_id: null,
              why_string: 'Chosen via chip',
              canonicalType,
              labels: [CATCHALL_LABEL],
              views: viewsValue,
              sourceMessageId: submissionId,
            });
            unsortedIdRef.current = null;
          }

          counts.notes = 1;
          createdIds.notes.push(record.id);
          const subtypeValue = typeof rawSubtype === 'string' ? rawSubtype : null;
          details.push({ kind: 'note', noteSubtype: subtypeValue });
        } else {
          return;
        }

        showMindDropSuccessToast({
          todos: counts.todos,
          notes: counts.notes,
          habits: counts.habits,
          details,
        });
        await refreshOrganizedToday();
        pendingUndo.current = createdIds;
        resetState();
        setRecentRefresh?.((v) => v + 1);
        focusGreetingForA11y();

        if (trimmed) {
          void logCatchallDecision({
            userId: user?.id ?? userId ?? 'anonymous',
            text: trimmed,
            surface: 'catchall',
            engine: 'LLM',
            modelVersion: process.env.EXPO_PUBLIC_CORTEX_MODEL || 'gpt-4o-mini',
            intent:
              suggestion.type === 'create.todo'
                ? 'todo'
                : suggestion.type === 'create.habit'
                  ? 'habit'
                  : suggestion.type === 'convert.log-list-to-todo'
                    ? 'todo'
                    : 'note',
            confidence: 0,
            mode: 'auto',
            decision: 'auto_create',
            createdTodos: counts.todos,
            createdNotes: counts.notes,
            createdHabits: counts.habits,
          });
        }
      } catch (error) {
        console.error('[CatchAllNotepad] Failed to apply suggestion', error);
        Alert.alert('Something went wrong', 'Please try again in a moment.');
      } finally {
        setIsSubmitting(false);
        setSuggestions([]);
      }
    },
    [
      note,
      repo,
      resetState,
      refreshOrganizedToday,
      setRecentRefresh,
      focusGreetingForA11y,
      showMindDropSuccessToast,
      user,
      userId,
      canonicalConversionsOn,
    ],
  );

  const handleChangeText = useCallback(
    (value: string) => {
      if (value.endsWith('\n') && listStyle !== 'none') {
        const prefix = nextPrefix(listStyle, value);
        const augmented = prefix ? value + prefix : value;
        setNote(augmented);
      } else {
        setNote(value);
      }
    },
    [listStyle],
  );

  // Mind Drop: robust submit with retry + fallbacks
  const onSubmit = useCallback(async () => {
    const now = Date.now();
    if (submitLockRef.current) return;
    if (isSubmitting) return;
    if (now - lastSubmitAt.current < 600) return; // debounce 600ms
    lastSubmitAt.current = now;

    const trimmed = note.trim();
    if (!trimmed) return;

    submitLockRef.current = true;
    setIsSubmitting(true);

    const submissionId = submissionIdRef.current ?? createSubmissionId();
    submissionIdRef.current = submissionId;

    try {
      // Optional short-circuit if network state is provided and offline
      if (typeof networkIsOnline === 'boolean' && !networkIsOnline) {
        await saveToUnsortedTray(repo, trimmed, { sourceMessageId: submissionId });
        resetState();
        if (TOASTS_ON) {
          showActionToast({
            type: 'success',
            content: COPY.savedOfflineMsg,
          });
        }
        // Optional haptic warning
        try {
          if (shouldUseHaptics()) void haptics.warning();
        } catch (e) {
          void e;
        }
        try {
          AccessibilityInfo.announceForAccessibility?.(
            'Saved offline. Will organize when connected.',
          );
        } catch (e) {
          void e;
        }
        pendingUndo.current = { todos: [], notes: [], habits: [] };
        await refreshOrganizedToday?.();
        setRecentRefresh?.((v) => v + 1);
        // A11y focus target after clearing input
        focusGreetingForA11y();
        return;
      }

      // We’ll attempt performSave() up to 2 times total.
      let attempt = 0;
      const maxAttempts = 2;
      let finalResult: any = null;
      let lastError: any = null;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          // Primary path: existing pipeline
          // EXPECTED: returns { created: { todos: string[], notes: string[], habits: string[] } }
          const r = await performSave();

          // Treat an "empty create" result as a failure to trigger retry/fallback.
          const createdTodos = r?.created?.todos?.length ?? 0;
          const createdNotes = r?.created?.notes?.length ?? 0;
          const createdHabits = r?.created?.habits?.length ?? 0;
          const totalCreated = createdTodos + createdNotes + createdHabits;

          if (totalCreated > 0 || (r?.suggestions?.length ?? 0) > 0) {
            finalResult = r;
            break; // success
          }

          // No items created -> mark as failure and possibly retry
          lastError = new Error('EmptySave');
          if (attempt === 1) {
            if (TOASTS_ON) {
              showActionToast({ type: 'success', content: COPY.retrying });
            }
            // loop to attempt #2
          } else {
            // Second failure — stop retrying
            break;
          }
        } catch (err: any) {
          lastError = err;
          if (attempt === 1) {
            // First failure — show “retrying” toast and try again
            if (TOASTS_ON) {
              showActionToast({
                type: 'success',
                content: COPY.retrying,
              });
            }
            // loop to attempt #2
          } else {
            // Second failure — stop retrying
            break;
          }
        }
      }

      if (!finalResult) {
        // Primary pipeline failed twice. Decide fallback by error type.
        if (isNetworkError(lastError)) {
          // Offline-ish path — save locally and reassure
          await saveToUnsortedTray(repo, trimmed, { sourceMessageId: submissionId });
          resetState();
          if (TOASTS_ON) {
            showActionToast({
              type: 'success',
              content: COPY.savedOfflineMsg,
            });
          }
          // Optional haptic warning
          try {
            if (shouldUseHaptics()) void haptics.warning();
          } catch (e) {
            void e;
          }
          try {
            AccessibilityInfo.announceForAccessibility?.(
              'Saved offline. Will organize when connected.',
            );
          } catch (e) {
            void e;
          }
        } else {
          // Non-network error: save to Unsorted Tray for manual follow-up
          await saveToUnsortedTray(repo, trimmed, { sourceMessageId: submissionId });
          resetState();
          if (TOASTS_ON) {
            showActionToast({
              type: 'success',
              content: COPY.savedUnsortedMsg,
            });
          }
          // Optional haptic warning
          try {
            if (shouldUseHaptics()) void haptics.warning();
          } catch (e) {
            void e;
          }
          try {
            AccessibilityInfo.announceForAccessibility?.('Saved to Unsorted Tray.');
          } catch (e) {
            void e;
          }
        }
        // Nothing created (no Undo set)
        pendingUndo.current = { todos: [], notes: [], habits: [] };
        // Refresh trust count & recent
        await refreshOrganizedToday?.();
        setRecentRefresh?.((v) => v + 1);
        focusGreetingForA11y();
        return;
      }

      // SUCCESS PATH — summarize created items
      if ((finalResult?.suggestions?.length ?? 0) > 0) {
        try {
          AccessibilityInfo.announceForAccessibility?.('Mind Drop organized successfully.');
        } catch (e) {
          void e;
        }
        pendingUndo.current = { todos: [], notes: [], habits: [] };
        return;
      }

      const createdTodos = finalResult?.created?.todos ?? [];
      const createdNotes = finalResult?.created?.notes ?? [];
      const createdHabits = finalResult?.created?.habits ?? [];
      const createdDetails = finalResult?.createdDetails ?? [];

      pendingUndo.current = {
        todos: createdTodos,
        notes: createdNotes,
        habits: createdHabits,
      };

      resetState();

      showMindDropSuccessToast({
        todos: createdTodos.length,
        notes: createdNotes.length,
        habits: createdHabits.length,
        details: createdDetails,
      });

      await refreshOrganizedToday?.();
      setRecentRefresh?.((v) => v + 1);
      // A11y focus target after clearing input
      focusGreetingForA11y();
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  }, [
    note,
    isSubmitting,
    performSave,
    repo,
    refreshOrganizedToday,
    showActionToast,
    networkIsOnline,
    resetState,
    focusGreetingForA11y,
    setRecentRefresh,
    TOASTS_ON,
  ]);

  const handleSubmit = useCallback(() => {
    if (isSubmitting || isThinking || !note.trim()) {
      return;
    }

    const needsDelay = uiMode === 'guided';

    if (needsDelay) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setIsThinking(true);
      timerRef.current = setTimeout(() => {
        setIsThinking(false);
        timerRef.current = null;
        void onSubmit();
      }, THINKING_DURATION);
    } else {
      void onSubmit();
    }
  }, [isSubmitting, isThinking, uiMode, note, onSubmit]);

  const legacyUI = React.useMemo(() => {
    const prompt = buildChipsPrompt(suggestions);

    return (
      <View>
        <View style={styles.headerContainer}>
          <View style={styles.headerRow} testID="minddrop-header">
            <View style={styles.headerLeftGroup}>
              <Pressable
                accessibilityLabel="Go back"
                accessibilityRole="button"
                onPress={handleBack}
                hitSlop={12}
                style={styles.headerBackBtn}
              >
                <Text style={styles.headerBackText}>{'<'}</Text>
              </Pressable>
              <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>
                {copy.title}
              </Text>
              <Pressable
                accessibilityLabel="About Mind Drop"
                accessibilityRole="button"
                testID="minddrop-info-header"
                style={styles.headerInfoBtn}
                onPress={handleInfoOpen}
                hitSlop={12}
              >
                <Icon name="Info" size="sm" color={c.mossGreen} />
              </Pressable>
            </View>
          </View>
          {/* Subtitle above the input */}
          <Text
            ref={greetingRef}
            testID="minddrop-subtitle"
            style={styles.subtitle}
            accessibilityRole="header"
          >
            {subtitle}
          </Text>
          <Image
            source={GREMLY_TOP}
            style={styles.headerMascot}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        <View style={styles.inputBlock}>
          <MindDropInput
            value={note}
            onChangeText={handleChangeText}
            placeholder={placeholder}
            placeholderTextColor={c.mutedSageText} // Phase 2: placeholder color
            containerStyle={styles.inputContainer}
            focusedStyle={styles.inputContainerFocused}
            inputStyle={[
              styles.input,
              { height: inputHeight, paddingRight: 72, paddingBottom: 28 },
            ]}
            onFocusChange={handleInputFocusChange}
            autoFocus
            onContentSizeChange={handleInputContentSizeChange}
            scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT}
            hudContainerStyle={styles.inputHud}
            hudTextStyle={styles.inputHudText}
            characterCount={note.length}
            lockIconColor={c.goldenPear}
          />
        </View>
        {suggestions.length > 0 ? (
          <MidConfidenceChips
            suggestions={suggestions}
            onPick={handlePickSuggestion}
            prompt={prompt ?? undefined}
            autoDismissMs={CHIPS_AUTO_DISMISS_MS}
          />
        ) : null}
        <View style={styles.submitButtonWrapper}>
          <Pressable
            testID="minddrop-submit-button"
            onPress={handleSubmit}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={isProcessing ? 'Organizing' : 'Drop to Gremly'}
            accessibilityState={{ busy: isProcessing, disabled }}
            style={({ pressed }) => [
              styles.submitButton,
              disabled && styles.submitButtonDisabled,
              pressed && !disabled && !isProcessing && styles.submitButtonPressed,
            ]}
          >
            <View style={styles.submitInnerRow}>
              {isProcessing ? (
                <Animated.View
                  style={[
                    styles.submitPulse,
                    reduceMotion ? null : { transform: [{ scale: pulseScale }] },
                  ]}
                />
              ) : null}
              <Text style={styles.submitLabel}>
                {isProcessing ? '✓ Organizing...' : 'Drop to Gremly →'}
              </Text>
            </View>
          </Pressable>
          <View style={styles.submitMicrocopyContainer} pointerEvents="none">
            {isProcessing ? (
              <AnimatedMicrocopyText
                style={[
                  styles.submitMicrocopy,
                  reduceMotion ? null : { opacity: microcopyOpacity },
                ]}
                accessibilityLiveRegion="polite"
              >
                {THINKING_MICROCOPY[microcopyIndex]}
              </AnimatedMicrocopyText>
            ) : null}
          </View>
        </View>
        <View style={styles.trustRow} testID="minddrop-trust">
          <Text style={styles.trustStyled} testID="minddrop-trust-text">
            <Text style={styles.trustNumber}>{organizedToday}</Text>
            <Text style={styles.trustSuffix}>
              {organizedToday === 1 ? ' thought organized today' : ' thoughts organized today'}
            </Text>
          </Text>
        </View>
        {/* Recent Drops section */}
        <RecentDropsMemo
          refreshSignal={recentRefresh}
          onEdited={noopCallback}
          onDeleted={noopCallback}
          initiallyOpen={true}
        />
      </View>
    );
  }, [
    greetingRef,
    styles,
    note,
    handleChangeText,
    handleInputFocusChange,
    handleInputContentSizeChange,
    placeholder,
    c.mutedSageText,
    c.goldenPear,
    c.linenCream,
    c.mossGreen,
    isProcessing,
    pulseScale,
    reduceMotion,
    microcopyOpacity,
    microcopyIndex,
    handleSubmit,
    disabled,
    suggestions,
    handlePickSuggestion,
    organizedToday,
    subtitle,
    recentRefresh,
    noopCallback,
    inputHeight,
    handleBack,
    handleInfoOpen,
  ]);

  const content = MIND_DROP_V2 ? (
    <>
      {/* Mind Drop v2 UI will render here in subsequent steps */}
      {/* For P0: temporarily just render the existing UI so nothing changes visually. */}
      {legacyUI}
    </>
  ) : (
    legacyUI
  );

  return (
    <View style={styles.root} testID="minddrop-screen">
      {ActionToast}

      <Modal
        transparent
        animationType="fade"
        visible={infoOpen}
        onRequestClose={handleInfoClose}
        statusBarTranslucent
      >
        <Pressable
          style={styles.infoBackdrop}
          onPress={handleInfoClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss Mind Drop info"
        >
          <Pressable
            style={styles.infoSheetContainer}
            onPress={() => {}}
            accessibilityLabel="About Mind Drop"
          >
            <View style={styles.infoSheet} testID="minddrop-info-sheet">
              <Text style={styles.infoTitle}>About Mind Drop</Text>
              <Text style={styles.infoBody}>
                Mind Drop is a calming place to empty your mind. I privately sort what you share
                into tasks, notes, or habits so you can keep moving.
              </Text>
              <Text style={styles.infoHeading}>Need to revisit something?</Text>
              <Text style={styles.infoBody}>
                Recent drops stay close by. Open them to edit, move, or undo anything I organized
                for you.
              </Text>
              <View style={styles.infoActions}>
                <Pressable
                  testID="minddrop-info-open-recent"
                  onPress={handleInfoViewRecent}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="View recent drops"
                >
                  <Text style={styles.secondaryButtonLabel}>View recent drops</Text>
                </Pressable>
                <Pressable
                  testID="minddrop-info-close"
                  onPress={handleInfoClose}
                  accessibilityRole="button"
                >
                  <Text style={styles.infoClose}>Close</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View
        style={[
          styles.contentWrapper,
          {
            paddingTop: insets.top + 12,
            paddingBottom: 16 + insets.bottom,
          },
        ]}
      >
        {content}
      </View>
    </View>
  );
}

export function makeStyles(c: ReturnType<typeof useTheme>['c'], mode: string) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.linenCream, // Phase 2: full-bleed background
    },
    contentWrapper: {
      flex: 1,
      paddingHorizontal: 16,
    },
    headerContainer: {
      position: 'relative',
      paddingRight: 84,
      marginBottom: 12,
    },

    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      marginBottom: 2,
    },
    headerLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    headerTitle: {
      color: c.charcoalInk, // Phase 2: default text color
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 32,
      lineHeight: 34,
      flexShrink: 1,
    },
    headerBackBtn: {
      padding: 6,
      marginRight: 12,
    },
    headerBackText: {
      color: c.mossGreen, // Phase 2: mossGreen for secondary actions
      fontSize: 24,
      fontFamily: 'PlusJakartaSans-Bold',
      lineHeight: 28,
    },
    headerInfoBtn: {
      padding: 8,
      marginLeft: 8,
      borderRadius: 9999,
      backgroundColor: 'transparent',
    },
    headerMascot: {
      position: 'absolute',
      width: 72,
      height: 92,
      right: -2,
      bottom: -16,
    },

    subtitle: {
      color: c.mutedSageText, // Phase 2: muted text for subtitle
      fontSize: 14,
      marginTop: -2,
      marginBottom: 6,
      fontFamily: 'Inter-Medium',
      textShadowColor: '#00000033',
      textShadowRadius: 2,
      textShadowOffset: { width: 0, height: 1 },
    },

    inputBlock: {
      position: 'relative',
    },
    inputContainer: {
      backgroundColor: c.linenCream,
      borderRadius: 16,
      padding: 20,
      minHeight: 240,
      borderWidth: 1,
      borderColor: c.sageMist, // Phase 2: sageMist border
      shadowColor: 'rgba(46,85,64,0.08)', // Phase 2: mossGreen-based shadow
      shadowOpacity: 1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    inputContainerFocused: {
      borderColor: c.sageMist,
      shadowColor: 'rgba(46,85,64,0.12)', // Phase 2: stronger on focus
      shadowOpacity: 1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    input: {
      color: c.charcoalInk, // Phase 2: default text color
      fontSize: 18,
      lineHeight: 26,
      padding: 0,
      textAlignVertical: 'top',
      fontFamily: 'Inter-Regular',
    },
    inputHud: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      opacity: 0.8,
    },
    inputHudText: {
      color: c.mutedSageText, // Phase 2: muted text for HUD
      fontSize: 12,
      fontFamily: 'Inter-Regular',
    },

    infoBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    infoSheetContainer: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: 24,
      paddingTop: 12,
      width: '100%',
    },
    infoSheet: {
      padding: 16,
    },
    infoTitle: {
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 18,
      color: c.text,
      marginBottom: 8,
    },
    infoHeading: {
      fontFamily: 'Inter-Medium',
      fontSize: 14,
      color: c.text,
      marginTop: 14,
      marginBottom: 4,
    },
    infoBody: {
      fontFamily: 'Inter-Regular',
      fontSize: 14,
      color: c.mutedText,
    },
    infoActions: {
      marginTop: 16,
      gap: 12,
      width: '100%',
      alignItems: 'stretch',
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: c.mossGreen,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      width: '100%',
    },
    secondaryButtonPressed: {
      backgroundColor: 'rgba(46,85,64,0.08)',
    },
    secondaryButtonLabel: {
      color: c.mossGreen,
      fontFamily: 'Inter-Medium',
      fontSize: 16,
    },
    infoClose: {
      color: c.mutedText,
      fontFamily: 'Inter-Regular',
      fontSize: 14,
      textAlign: 'center',
    },

    submitButtonWrapper: {
      marginTop: 24,
    },
    submitButton: {
      marginTop: 16,
      height: 56,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.mossGreen, // Phase 2: primary CTA filled mossGreen
    },
    submitButtonPressed: {
      opacity: 0.9,
    },
    submitButtonDisabled: {
      backgroundColor: c.sageMist,
    },
    submitLabel: {
      color: c.linenCream, // Phase 2: linenCream text on mossGreen
      fontSize: 16,
      fontWeight: '600',
    },
    submitInnerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    submitPulse: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: c.linenCream,
    },
    submitMicrocopyContainer: {
      minHeight: 18,
      marginTop: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitMicrocopy: {
      color: c.linenCream,
      fontFamily: 'Inter-Medium',
      fontSize: 13,
    },

    trustRow: {
      marginTop: 8,
      alignItems: 'center',
      minHeight: 20,
    },
    trustStyled: {
      textAlign: 'center',
    },
    trustNumber: {
      color: c.goldenPear,
      fontFamily: 'Inter-SemiBold',
    },
    trustSuffix: {
      color: c.sageMist,
      fontFamily: 'Inter-Regular',
    },

    recentRoot: { marginTop: 8 },
    recentHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    recentHeaderBtn: {
      paddingVertical: 8,
    },
    recentHeaderText: {
      color: c.sageMist,
      fontSize: 16,
      fontWeight: '600',
      fontFamily: 'Inter-Medium',
    },
    recentHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    recentToggle: {
      color: TOGGLE_BLUE,
      fontSize: 12,
      fontFamily: 'Inter-Medium',
      textDecorationLine: 'underline',
    },
    recentToggleActive: {
      textDecorationLine: 'none',
    },
    recentList: { marginTop: 6, gap: 8 },
    recentCard: {
      backgroundColor: c.sageTint,
      borderRadius: 12,
      padding: 12,
      shadowColor: c.cardShadow,
      shadowOpacity: 0.05,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    recentCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 8,
    },
    recentText: {
      color: c.charcoalInk, // Phase 2: default text color
      fontSize: 14,
      lineHeight: 20,
      fontFamily: 'Inter-Regular',
    },
    recentBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    recentBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      fontSize: 11,
      overflow: 'hidden',
      color: c.text,
      backgroundColor: c.sageTint,
      fontFamily: 'Inter-Medium',
    },
    badge_note: {
      backgroundColor: c.sageTint,
    },
    badge_todo: {
      backgroundColor: '#E6F0FF',
    },
    badge_habit: {
      backgroundColor: '#EAF7ED',
    },
    badge_unsorted: {
      backgroundColor: '#FFF4CC',
    },
    recentMetaRow: {
      marginTop: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    recentActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    recentAction: {
      color: c.mossGreen, // Phase 2: mossGreen for actions
      fontSize: 13,
      textDecorationLine: 'underline',
      fontFamily: 'Inter-Medium',
      lineHeight: 18,
    },
    recentActionDelete: {
      color: c.danger,
      fontSize: 13,
      textDecorationLine: 'underline',
      fontFamily: 'Inter-Medium',
      lineHeight: 18,
    },
    recentDot: { color: c.mutedText, marginHorizontal: 6 },
    recentEmpty: {
      color: c.mutedText,
      fontSize: 13,
      textAlign: 'center',
      fontFamily: 'Inter-Regular',
      paddingVertical: 10,
    },
    recentTime: {
      color: c.mutedText,
      fontSize: 12,
      fontFamily: 'Inter-Regular',
    },
  });
}
