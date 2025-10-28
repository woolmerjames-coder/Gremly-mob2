import React, { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Animated,
  ScrollView,
  StyleSheet,
  TextInput,
  ToastAndroid,
  View,
  AccessibilityInfo,
  findNodeHandle,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Button } from '../../design-system/Button';
import { Icon } from '../../design-system/Icon';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { cortexRoute } from '../../lib/cortex/router';
import type { CortexContext, CortexAction } from '../../lib/cortex/cortexDecide';
import {
  explainAddedToList,
  explainCreated,
  explainFiledToSpace,
  explainAmbiguous,
} from '../../lib/cortex/explain';
import { ConfirmationPill } from '../../components/common/ConfirmationPill';
import { MIND_DROP_V2 } from '../../src/config/featureFlags';
import { useActionToast } from '../../src/hooks/useActionToast';
import { useTheme } from '../../src/theme/useTheme';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { shouldUseHaptics } from '../../config/featureFlags';
import { haptics } from '../../lib/haptics';

export const THINKING_DURATION = 1200;
const INPUT_LINE_HEIGHT = 26;
const MAX_INPUT_HEIGHT = INPUT_LINE_HEIGHT * 5 + 32;

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
          <Text testID="minddrop-privacy" style={hudTextStyle}>
            🔒 Private & secure
          </Text>
          <Text testID="minddrop-counter" style={hudTextStyle}>{`${characterCount} / 2000`}</Text>
        </View>
      </Pressable>
    );
  },
);

MindDropInput.displayName = 'MindDropInput';

const copy = {
  title: 'Mind Drop — Drop it. I’ll sort it.',
  subtitle: 'Private & secure. Gremly organizes as you go.',
} as const;

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
): Promise<string | undefined> {
  if (!text?.trim()) return undefined;

  // Base create payload for our repos
  const baseInput = {
    type: 'note' as const,
    title: text,
    body: text,
    subtype: 'catchall' as const,
    ai_placed: true,
    origin: 'catchall' as const,
    labels: [CATCHALL_LABEL, UNSORTED_LABEL],
  };

  // If notes.create exists (future), prefer it; otherwise use addUnsorted/create
  try {
    if (repo?.notes?.create) {
      const note = await repo.notes.create({
        text,
        labels: [CATCHALL_LABEL, UNSORTED_LABEL],
        // pending_sync is optional; if unsupported downstream, it will be ignored
        pending_sync: true,
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

type Mode = 'free' | 'guided';
export type ListStyle = 'none' | 'bullets' | 'numbers' | 'checklist';

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

// Removed legacy hex placeholder color; placeholderTextColor now uses themed c.mutedText

// Mind Drop utilities and storage keys
export function getGreeting(now: Date, lastOpenedAt?: number | null): string {
  const h = now.getHours();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  if (lastOpenedAt && now.getTime() - lastOpenedAt >= threeDaysMs) {
    return '👋 Welcome back! Ready to clear your mind?';
  }
  if (h >= 6 && h < 11) return "🌅 Morning! What's on your mind?";
  if (h >= 11 && h < 17) return '☀️ Drop your thoughts here...';
  if (h >= 17 && h < 21) return "🌙 How's your day going?";
  return '✨ Capture those late-night thoughts...';
}

export const PLACEHOLDERS = [
  'What’s on your mind?',
  'Tasks, thoughts, worries, ideas...',
  'Buy milk, call mom, that idea about...',
  'Just type everything...',
] as const;

export const LAST_OPEN_KEY = 'minddrop:last_open_ts';

// Trust Builders helpers
function startOfTodayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

// Recent Drops helpers and component (colocated for now)
type RecentDrop = { id: string; text: string; created_at: string };

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
}> = ({ onEdited, onDeleted, refreshSignal, initiallyOpen = false, eagerLoad = false }) => {
  const navigation = useNavigation();
  const repo = useRepo() as any;
  const { c, mode: themeMode } = useTheme();
  const styles = React.useMemo(() => makeStyles(c, themeMode), [c, themeMode]);
  const [open, setOpen] = React.useState(!!initiallyOpen);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<RecentDrop[]>([]);

  const load = React.useCallback(async () => {
    // In tests, we avoid showing a persistent loading state to reduce flakiness
    const isTest = process.env.JEST_WORKAROUND === '1';
    if (!isTest) {
      setLoading(true);
    }
    try {
      // Fetch latest 3 catch-all notes (fallback filter in JS)
      const all = (await repo?.notes?.list?.({ limit: 10, order: 'desc' })) ?? [];
      const drops = (Array.isArray(all) ? all : [])
        .filter(
          (n) =>
            n?.subtype === 'catchall' ||
            (Array.isArray(n?.labels) && n.labels.includes(CATCHALL_LABEL)),
        )
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3)
        .map((n) => ({
          id: n.id,
          text: n.body || n.title || n.text || n.content || '',
          created_at: n.created_at,
        }));
      setItems(drops);
    } catch (e) {
      // no-op
    } finally {
      if (!isTest) {
        setLoading(false);
      }
    }
  }, [repo]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  // Optional eager load hook for tests to start load sooner
  useLayoutEffect(() => {
    if (eagerLoad) {
      void load();
    }
  }, [eagerLoad, load]);

  const handleEdit = (id: string) => {
    try {
      (navigation as any).navigate('NoteDetail', { id });
      onEdited?.();
    } catch {
      // TODO: implement inline edit sheet
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await (repo?.remove?.(id) ?? repo?.notes?.delete?.(id));
      await load();
      onDeleted?.();
    } catch {
      // Optional: handle error UI
    }
  };

  return (
    <View style={styles.recentRoot}>
      <Pressable
        testID="minddrop-recent-toggle"
        onPress={() => setOpen((v) => !v)}
        style={styles.recentHeader}
        accessibilityRole="button"
        accessibilityLabel="Toggle recent drops"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.recentHeaderText}>{open ? 'Recent drops ↑' : 'Recent drops ↓'}</Text>
      </Pressable>

      {open ? (
        <View testID="minddrop-recent-list" style={styles.recentList}>
          {loading ? (
            <Text style={styles.recentEmpty}>Loading…</Text>
          ) : items.length === 0 ? (
            <Text style={styles.recentEmpty}>No recent drops yet.</Text>
          ) : (
            items.map((item) => (
              <View key={item.id} testID={`minddrop-recent-${item.id}`} style={styles.recentCard}>
                <Text numberOfLines={2} style={styles.recentText}>
                  {item.text || '—'}
                </Text>
                <View style={styles.recentMetaRow}>
                  <Text style={styles.recentTime}>{relativeTime(item.created_at)}</Text>
                  <View style={styles.recentActions}>
                    <Pressable
                      onPress={() => handleEdit(item.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <Text style={styles.recentAction}>Edit</Text>
                    </Pressable>
                    <Text style={styles.recentDot}>•</Text>
                    <Pressable
                      onPress={() => handleDelete(item.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <Text style={styles.recentActionDelete}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
};

// Memoize RecentDrops to avoid re-rendering when parent state (greeting, trust, tips) changes
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
  const { userId } = useAuth();
  const { showToast: showActionToast, Toast: ActionToast } = useActionToast({
    bottomOffset: Platform.select({ ios: 112, android: 112, default: 112 }) ?? 112,
  });
  const themeResult = useTheme();
  const c = React.useMemo(() => themeResult.c, [themeResult.mode]);
  const themeMode = themeResult.mode;
  const styles = React.useMemo(() => makeStyles(c, themeMode), [c, themeMode]);
  const reduceMotion = useReducedMotion();
  const [uiMode, setUiMode] = useState<Mode>('free');
  const [listStyle, setListStyle] = useState<ListStyle>('none');
  const [note, setNote] = useState('');
  const [inputHeight, setInputHeight] = useState<number>(140);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [confirmations, setConfirmations] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  // Mind Drop: greeting + static placeholder
  const [greeting, setGreeting] = useState<string>('');
  const greetingRef = useRef<any>(null);
  const [placeholder] = useState('Buy milk, call mom, that idea about...');
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
  const lastSubmitAt = useRef<number>(0);
  // Trust Builders: organized today count
  const [organizedToday, setOrganizedToday] = useState<number>(0);
  const trustRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recentRefresh, setRecentRefresh] = useState(0);

  // Stable noop callbacks for RecentDrops to prevent unnecessary re-renders
  const noopCallback = useCallback(() => {}, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Auto-hide tooltip after 3 seconds
  useEffect(() => {
    if (!infoOpen) return;
    const t = setTimeout(() => setInfoOpen(false), 3000);
    return () => clearTimeout(t);
  }, [infoOpen]);

  // On mount: load last open ts, compute greeting, save new last open ts
  useEffect(() => {
    let isMounted = true;

    (async () => {
      let lastOpenedAt: number | null = null;
      try {
        const raw = await AsyncStorage.getItem(LAST_OPEN_KEY);
        if (raw) lastOpenedAt = Number(raw);
      } catch (e) {
        void e; // ignore read error
      }

      if (isMounted) {
        const now = new Date();
        setGreeting(getGreeting(now, lastOpenedAt));
      }

      // Save "last open" now
      try {
        await AsyncStorage.setItem(LAST_OPEN_KEY, String(Date.now()));
      } catch (e) {
        void e; // ignore write error
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: copy.title,
      headerShown: true,
      headerTitle: () => (
        <View style={styles.headerRow} testID="minddrop-header">
          <View style={styles.headerTextCol}>
            <Text style={styles.headerTitle} accessibilityRole="header">
              {copy.title}
            </Text>
            <Text style={styles.headerSubtitle}>{copy.subtitle}</Text>
          </View>
          <Pressable
            accessibilityLabel="About Mind Drop"
            accessibilityRole="button"
            testID="minddrop-info-header"
            style={styles.headerInfoBtn}
            onPress={() => setInfoOpen(true)}
            hitSlop={8}
          >
            <Icon name="Info" size="sm" color={c.mutedText} />
          </Pressable>
        </View>
      ),
    });
  }, [c.mutedText, navigation, setInfoOpen, styles]);

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

  // Memoized disabled state: only depends on note & isSubmitting, isolating input from unrelated state
  const disabled = useMemo(() => note.trim().length === 0 || isSubmitting, [note, isSubmitting]);

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
      showActionToast({ type: 'success', content: 'Nothing to undo' });
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

      showActionToast({ type: 'success', content: '✅ Undo complete — Mind Drop reverted' });
    } catch (e) {
      Alert.alert('Undo failed', 'Could not revert items. You can edit from Recent.');
    }
  }, [repo, showActionToast]);

  // Navigate to Hub → Recent (fallback toast if route missing)
  const handleViewDetails = useCallback(() => {
    try {
      // Navigate to Hub tab; pass filter for future use if supported
      (navigation as any).navigate('Tabs', { screen: 'Hub', params: { filter: 'recent' } });
    } catch (err) {
      showActionToast({
        type: 'success',
        content: 'ℹ️ Open Hub → Recent to see new items',
      });
    }
  }, [navigation, showActionToast]);

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
    (args: { todos?: number; notes?: number; habits?: number }) => {
      const { todos = 0, notes = 0, habits = 0 } = args || {};
      const parts: string[] = [];
      if (todos) parts.push(`${todos} ${todos === 1 ? 'task' : 'tasks'}`);
      if (notes) parts.push(`${notes} ${notes === 1 ? 'note' : 'notes'}`);
      if (habits) parts.push(`${habits} ${habits === 1 ? 'habit' : 'habits'}`);
      const body = parts.length ? parts.join(', ') : 'items';
      const label = `✅ Organized into ${body}`;
      showActionToast({
        type: 'success',
        content: label,
        metadata: {
          onUndo: handleUndoCreated,
          onViewDetails: handleViewDetails,
        },
      });
      // Optional haptic confirmation
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
    [showActionToast, handleUndoCreated, handleViewDetails],
  );

  type SaveResult = { created: { todos: string[]; notes: string[]; habits: string[] } };

  const performSave = useCallback(async (): Promise<SaveResult> => {
    try {
      const trimmed = note.trim();
      if (!trimmed) {
        resetState();
        return { created: { todos: [], notes: [], habits: [] } };
      }

      const currentUserId = userId || 'anonymous';

      // Phase 10.3: Call Cortex SDK for guided mode
      if (uiMode === 'guided') {
        try {
          const ctx: CortexContext = {
            lane: 'catchall',
            userId: currentUserId,
            activeSpaceId: null,
            uiSurface: 'overlay',
          };

          // Dev-only lane logging
          if (process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
            console.log(
              '[CORTEX] lane=%s space=%s msg=%s',
              ctx.lane,
              ctx.spaceId ?? '-',
              ctx.messageId ?? '-',
            );
          }

          const response = await cortexRoute({ text: trimmed }, ctx);

          // Log event (non-blocking)
          repo
            .writeEvent(
              'cortex_decision',
              {
                source: 'catchall',
                text: trimmed,
                actions: response.actions,
                confidence: response.confidence,
                mode: response.mode,
              },
              { userId: currentUserId },
            )
            .catch((err) => console.error('[CatchAllNotepad] Failed to log event:', err));

          if (response.mode === 'auto' && response.actions.length > 0) {
            // Execute actions in parallel
            const confirmationTexts: string[] = [];
            const counts = { todos: 0, notes: 0, habits: 0 };
            const createdIds = {
              todos: [] as string[],
              notes: [] as string[],
              habits: [] as string[],
            };

            await Promise.all(
              response.actions.map(async (action: CortexAction) => {
                try {
                  if (action.type === 'add.to.list') {
                    const list = await repo.getOrCreateList(action.payload.listKey, {
                      userId: currentUserId,
                      spaceId: action.payload.spaceId ?? null,
                    });
                    await repo.addListItem(list.id, action.payload.item);
                    confirmationTexts.push(explainAddedToList(list.name, 'warm'));
                  } else if (action.type === 'create.todo') {
                    const rec = await repo.create({
                      type: 'todo',
                      name: action.payload.title,
                      title: action.payload.title,
                      due_date: action.payload.due ?? null,
                      undefined_due: !action.payload.due,
                      space_id: action.payload.spaceId ?? null,
                      ai_placed: true,
                      why_string: response.explanation,
                      origin: 'catchall',
                    });
                    confirmationTexts.push(explainCreated('todo', 'warm'));
                    counts.todos += 1;
                    createdIds.todos.push(rec.id);
                  } else if (action.type === 'create.habit') {
                    const rec = await repo.create({
                      type: 'habit',
                      name: action.payload.name,
                      frequency:
                        (action.payload.freq === 'custom' ? 'daily' : action.payload.freq) ||
                        'daily',
                      subtype: 'start_habit',
                      space_id: action.payload.spaceId ?? null,
                      ai_placed: true,
                      why_string: response.explanation,
                      origin: 'catchall',
                    });
                    confirmationTexts.push(explainCreated('habit', 'warm'));
                    counts.habits += 1;
                    createdIds.habits.push(rec.id);
                  } else if (action.type === 'create.note') {
                    const rec = await repo.create({
                      type: 'note',
                      title: action.payload.text || trimmed,
                      body: action.payload.text,
                      subtype: (action.payload.subtype as any) || 'note',
                      space_id: action.payload.spaceId ?? null,
                      ai_placed: true,
                      why_string: response.explanation,
                      origin: 'catchall',
                    });
                    confirmationTexts.push(explainCreated('note', 'warm'));
                    counts.notes += 1;
                    createdIds.notes.push(rec.id);
                  }
                  // file.to.space and attach.reminder not yet implemented
                } catch (err) {
                  console.error('[CatchAllNotepad] Failed to execute action:', action, err);
                }
              }),
            );

            // Show confirmations
            setConfirmations(confirmationTexts);

            // Unified success toast summarizing created items
            showMindDropSuccessToast(counts);
            await refreshOrganizedToday();

            // Snapshot for undo
            pendingUndo.current = createdIds;

            // Clear form after brief delay to show confirmations
            setTimeout(() => {
              resetState();
            }, 2000);

            return { created: createdIds };
          } else {
            // Mode is 'ask' or 'keep' - save to catch-all with suggestions
            // Note: Using labels/views for filtering, metadata in why_string
            const suggestionHints = response.suggestions
              ? ` Suggestions: ${response.suggestions.join(', ')}`
              : '';
            const rec = await repo.create({
              type: 'note',
              title: trimmed || 'Quick note',
              body: trimmed,
              subtype: 'catchall',
              origin: 'catchall',
              ai_placed: false,
              space_id: null,
              why_string: `${response.explanation}${suggestionHints}`,
              canonicalType: 'note',
              labels: [CATCHALL_LABEL, ...(response.mode === 'ask' ? [UNSORTED_LABEL] : [])],
              views: {
                alsoShowIn: ['Hub:Catch-All'],
              },
            });

            // Show suggestions as chips
            if (response.suggestions && response.suggestions.length > 0) {
              setSuggestions(response.suggestions);
            }

            // Unified success toast for single note capture
            showMindDropSuccessToast({ notes: 1 });
            await refreshOrganizedToday();

            // Snapshot for undo (single note)
            pendingUndo.current = { todos: [], habits: [], notes: [rec.id] };

            // Clear form after showing suggestions
            setTimeout(() => {
              resetState();
            }, 3000);

            return { created: { todos: [], habits: [], notes: [rec.id] } };
          }
        } catch (error) {
          // Cortex failed - fall back to safe save
          console.error('[CatchAllNotepad] Cortex decision failed:', error);
          const rec = await repo.create({
            type: 'note',
            title: trimmed || 'Quick note',
            body: trimmed,
            subtype: 'catchall',
            origin: 'catchall',
            ai_placed: false,
            space_id: null,
            why_string: 'Saved from Catch-All Notepad',
            canonicalType: 'note',
            labels: [CATCHALL_LABEL],
            views: {
              alsoShowIn: ['Hub:Catch-All'],
            },
          });
          // Unified success toast fallback
          showMindDropSuccessToast({ notes: 1 });
          await refreshOrganizedToday();

          // Snapshot for undo
          pendingUndo.current = { todos: [], habits: [], notes: [rec.id] };
          resetState();

          return { created: { todos: [], habits: [], notes: [rec.id] } };
        }
      } else {
        // Free mode - simple save without AI
        const rec = await repo.create({
          type: 'note',
          title: trimmed || 'Quick note',
          body: trimmed,
          subtype: 'catchall',
          origin: 'catchall',
          ai_placed: false,
          space_id: null,
          why_string: 'Saved from Catch-All Notepad',
          canonicalType: 'note',
          labels: [CATCHALL_LABEL],
          views: {
            alsoShowIn: ['Hub:Catch-All'],
          },
        });
        // Unified success toast for free mode
        showMindDropSuccessToast({ notes: 1 });
        await refreshOrganizedToday();

        // Snapshot for undo
        pendingUndo.current = { todos: [], habits: [], notes: [rec.id] };
        resetState();

        return { created: { todos: [], habits: [], notes: [rec.id] } };
      }
    } catch (error) {
      console.error('[CatchAllNotepad] Failed to capture note', error);
      Alert.alert('Something went wrong', 'Please try again in a moment.');
      resetState();
      return { created: { todos: [], notes: [], habits: [] } };
    }
  }, [note, repo, resetState, uiMode, userId]);

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

  const handleSubmit = useCallback(() => {
    if (isSubmitting || !note.trim()) {
      return;
    }

    setIsSubmitting(true);
    const needsDelay = uiMode === 'guided';

    if (needsDelay) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setIsThinking(true);
      timerRef.current = setTimeout(() => {
        setIsThinking(false);
        timerRef.current = null;
        void performSave();
      }, THINKING_DURATION);
    } else {
      void performSave();
    }
  }, [isSubmitting, uiMode, note, performSave]);

  // Mind Drop: robust submit with retry + fallbacks
  const onSubmit = useCallback(async () => {
    const now = Date.now();
    if (isSubmitting) return;
    if (now - lastSubmitAt.current < 600) return; // debounce 600ms
    lastSubmitAt.current = now;

    const trimmed = note.trim();
    if (!trimmed) return;

    setIsSubmitting(true);

    // Optional short-circuit if network state is provided and offline
    if (typeof networkIsOnline === 'boolean' && !networkIsOnline) {
      try {
        await saveToUnsortedTray(repo, trimmed);
        setNote('');
        showActionToast({
          type: 'success',
          content: COPY.savedOfflineMsg,
        });
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
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // We’ll attempt performSave() up to 2 times total.
    let attempt = 0;
    const maxAttempts = 2;
    let finalResult: any = null;
    let lastError: any = null;

    try {
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

          if (totalCreated > 0) {
            finalResult = r;
            break; // success
          }

          // No items created -> mark as failure and possibly retry
          lastError = new Error('EmptySave');
          if (attempt === 1) {
            showActionToast({ type: 'success', content: COPY.retrying });
            // loop to attempt #2
          } else {
            // Second failure — stop retrying
            break;
          }
        } catch (err: any) {
          lastError = err;
          if (attempt === 1) {
            // First failure — show “retrying” toast and try again
            showActionToast({
              type: 'success',
              content: COPY.retrying,
            });
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
          await saveToUnsortedTray(repo, trimmed);
          setNote('');
          showActionToast({
            type: 'success',
            content: COPY.savedOfflineMsg,
          });
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
          await saveToUnsortedTray(repo, trimmed);
          setNote('');
          showActionToast({
            type: 'success',
            content: COPY.savedUnsortedMsg,
          });
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
        return;
      }

      // SUCCESS PATH — summarize created items
      const createdTodos = finalResult?.created?.todos ?? [];
      const createdNotes = finalResult?.created?.notes ?? [];
      const createdHabits = finalResult?.created?.habits ?? [];

      pendingUndo.current = {
        todos: createdTodos,
        notes: createdNotes,
        habits: createdHabits,
      };

      setNote('');

      showMindDropSuccessToast({
        todos: createdTodos.length,
        notes: createdNotes.length,
        habits: createdHabits.length,
      });

      await refreshOrganizedToday?.();
      setRecentRefresh?.((v) => v + 1);
      // A11y focus target after clearing input
      focusGreetingForA11y();
    } finally {
      setIsSubmitting(false);
    }
  }, [
    note,
    isSubmitting,
    performSave,
    repo,
    refreshOrganizedToday,
    showActionToast,
    networkIsOnline,
  ]);

  // Trust Builders static message - memoized to prevent re-renders
  const trustLine = React.useMemo(
    () =>
      organizedToday > 0
        ? `${organizedToday} ${organizedToday === 1 ? 'thought' : 'thoughts'} organized today`
        : 'Your thoughts are private & secure with Gremly.',
    [organizedToday],
  );
  const legacyUI = React.useMemo(
    () => (
      <View>
        {/* Greeting above the input */}
        {greeting ? (
          <Text
            ref={greetingRef}
            testID="minddrop-greeting"
            style={styles.greeting}
            accessibilityRole="header"
          >
            {greeting}
          </Text>
        ) : null}
        <MindDropInput
          value={note}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.mutedText}
          containerStyle={styles.inputContainer}
          focusedStyle={styles.inputContainerFocused}
          inputStyle={[styles.input, { height: inputHeight, paddingRight: 72, paddingBottom: 28 }]}
          onFocusChange={handleInputFocusChange}
          autoFocus
          onContentSizeChange={handleInputContentSizeChange}
          scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT}
          hudContainerStyle={styles.inputHud}
          hudTextStyle={styles.inputHudText}
          characterCount={note.length}
        />
        <View style={styles.submitButtonWrapper}>
          <Button
            testID="minddrop-submit-button"
            label={isSubmitting ? '✓ Organizing...' : 'Drop to Gremly →'}
            leftIcon={isSubmitting ? <ActivityIndicator size="small" color={c.bg} /> : undefined}
            onPress={onSubmit}
            disabled={disabled}
            disabledOpacity={0.4}
            accessibilityRole="button"
            accessibilityLabel={isSubmitting ? 'Organizing' : 'Drop to Gremly'}
            accessibilityState={{ busy: isSubmitting, disabled }}
          />
        </View>
        {/* Trust Builders row */}
        <View style={styles.trustRow} testID="minddrop-trust">
          <Text style={styles.trustText} testID="minddrop-trust-text">
            {trustLine}
          </Text>
        </View>
        {/* Recent Drops section */}
        <RecentDropsMemo
          refreshSignal={recentRefresh}
          onEdited={noopCallback}
          onDeleted={noopCallback}
        />
      </View>
    ),
    [
      greeting,
      greetingRef,
      styles,
      note,
      handleChangeText,
      handleInputFocusChange,
      handleInputContentSizeChange,
      placeholder,
      c.mutedText,
      c.bg,
      isSubmitting,
      disabled,
      onSubmit,
      trustLine,
      recentRefresh,
      noopCallback,
      inputHeight,
    ],
  );

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
      {/* Tooltip overlay just under the header - only render when visible to avoid input blocking */}
      {infoOpen ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setInfoOpen(false)} />
          <View style={styles.tipContainer} testID="minddrop-tip">
            <View style={styles.tipArrow} />
            <Text style={styles.tipText}>Just type everything on your mind. I'll organize it.</Text>
          </View>
        </View>
      ) : null}

      {/* Inline Action Toast overlay */}
      {ActionToast}

      {content}
    </View>
  );
}

export function makeStyles(c: ReturnType<typeof useTheme>['c'], mode: string) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.bg,
      padding: 16,
    },

    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    headerTextCol: {
      flexShrink: 1,
      paddingRight: 12,
    },
    headerTitle: {
      color: c.text,
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 24,
      lineHeight: 30,
    },
    headerSubtitle: {
      color: c.mutedText,
      fontFamily: 'Inter-Regular',
      fontSize: 14,
      marginTop: 4,
    },
    headerInfoBtn: {
      padding: 8,
      borderRadius: 9999,
    },

    greeting: {
      color: c.moss,
      fontSize: 16,
      marginBottom: 12,
    },

    inputContainer: {
      backgroundColor: '#FFFFFF',
      borderRadius: 16,
      padding: 20,
      minHeight: 240,
      borderWidth: 1.5,
      borderColor: c.sage ?? '#BFD8C0',
      shadowColor: c.cardShadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    inputContainerFocused: {
      borderColor: c.sage ?? '#BFD8C0',
      shadowColor: '#E0C47A',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    input: {
      color: c.text,
      fontSize: 18,
      lineHeight: 26,
      padding: 0,
      textAlignVertical: 'top',
    },
    inputHud: {
      position: 'absolute',
      right: 10,
      bottom: 8,
      flexDirection: 'row',
      gap: 12,
      opacity: 0.7,
    },
    inputHudText: {
      color: c.mutedText,
      fontSize: 12,
    },

    tipContainer: {
      position: 'absolute',
      top: 6,
      right: 8,
      maxWidth: 260,
      backgroundColor: c.bg,
      padding: 10,
      borderRadius: 12,
      shadowColor: c.cardShadow,
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    tipText: {
      color: c.moss,
      fontSize: 13,
      lineHeight: 18,
    },
    tipArrow: {
      position: 'absolute',
      bottom: -6,
      right: 18,
      width: 12,
      height: 12,
      backgroundColor: c.bg,
      transform: [{ rotate: '45deg' }],
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
      backgroundColor: c.moss,
    },
    submitLabel: {
      color: c.bg,
      fontSize: 16,
      fontWeight: '600',
    },
    submitInnerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },

    trustRow: {
      marginTop: 8,
      alignItems: 'center',
      minHeight: 20,
    },
    trustText: {
      color: c.mutedText,
      fontSize: 13,
      textAlign: 'center',
    },

    recentRoot: { marginTop: 12 },
    recentHeader: {
      paddingVertical: 8,
      alignItems: 'center',
    },
    recentHeaderText: {
      color: c.moss,
      fontSize: 16,
      fontWeight: '600',
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
    recentText: {
      color: c.text,
      fontSize: 14,
      lineHeight: 20,
    },
    recentMetaRow: {
      marginTop: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    recentTime: {
      color: c.mutedText,
      fontSize: 12,
    },
    recentActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    recentAction: {
      color: c.moss,
      fontSize: 13,
      textDecorationLine: 'underline',
    },
    recentActionDelete: {
      color: c.danger,
      fontSize: 13,
      textDecorationLine: 'underline',
    },
    recentDot: { color: c.mutedText, marginHorizontal: 6 },
    recentEmpty: {
      color: c.mutedText,
      fontSize: 13,
      textAlign: 'center',
      paddingVertical: 10,
    },
  });
}
