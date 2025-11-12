/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useCallback, useReducer, useState, useRef } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  UIManager,
  useColorScheme,
  View,
  Animated as RNAnimated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  interpolate,
} from 'react-native-reanimated';
import { useReducedMotion, conditionalAnimation, timingConfig } from '../../design/animations';
import { Box, Text, Button } from '../../ui';
import { firstLine } from '../../lib/text/firstLine';
import * as Haptics from 'expo-haptics';
import { Modal } from 'react-native';
import { format, parseISO, addDays } from 'date-fns';
import {
  lightTokens,
  darkTokens,
  spacing as tokenSpacing,
  borderRadius as tokenRadius,
} from '../../design/tokens';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import ScopeSelector from '../ScopeSelector';
import { usePhase8LinksState } from './hooks/usePhase8LinksState';
import { PeopleLinker } from './fields/PeopleLinker';
import PersonPicker from './fields/PersonPicker';
import type { UnifiedCreateOverlayProps } from './UnifiedCreateOverlay';
import {
  v2Reducer,
  initialV2State,
  type BaseType,
  type TagKey,
  type V2State,
} from './overlayV2.state';
import ToastUndo from './ToastUndo';
import { linkSelectedPerson, sanitizeSuggestedTags } from './overlayV2.mapping';
import { recordOverlayFeedback } from './overlayV2.feedback';
import { useOverlayV2Draft, readOverlayV2Draft, clearOverlayV2Draft } from './useOverlayV2Draft';
import { eventBus } from '../../lib/events/EventBus';
import { TagsRow } from './fields/TagsRow';
import useOverlayPrefill, { type SuggestedTag as PrefillSuggestedTag } from './useOverlayPrefill';

const BASE_LABEL: Record<BaseType, string> = { log: 'Log', todo: 'To-Do', habit: 'Habit' };

function normalizeTagCandidate(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, '');
}

function normalizeToTagKey(value: unknown): TagKey | null {
  const slug = normalizeTagCandidate(value);
  return slug || null;
}

function extractTagKeysFromEntity(entity: any): TagKey[] {
  if (!entity) return [];
  const raw = entity.tags;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<TagKey>();
  for (const entry of raw) {
    const tag = normalizeToTagKey(entry);
    if (tag && !seen.has(tag)) seen.add(tag);
  }
  return Array.from(seen);
}

function mergeTagKeys(base: TagKey[], incoming: TagKey[]): TagKey[] {
  if (incoming.length === 0) return base;
  const next = new Set(base.map((tag) => normalizeToTagKey(tag) ?? tag));
  incoming.forEach((tag) => {
    const normalized = normalizeToTagKey(tag);
    if (normalized) {
      next.add(normalized);
    }
  });
  return Array.from(next) as TagKey[];
}

function deriveBaseTypeFromInitial(type: unknown): BaseType | null {
  if (!type) return null;
  const normalized = String(type).toLowerCase();
  if (normalized === 'todo') return 'todo';
  if (normalized === 'habit') return 'habit';
  return 'log';
}

function stripJournalTags(tags: TagKey[], keepJournal: boolean): TagKey[] {
  if (keepJournal) return [...tags];
  return tags.filter((tag) => {
    const slug = tag.trim().toLowerCase();
    const withoutPrefix = slug.replace(/^[#*@]+/, '');
    return withoutPrefix !== 'journal';
  });
}
const SHEET_H = Math.round(Dimensions.get('window').height * 0.8);

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Runtime sanity checks (fail fast with clear messages during tests)
// These run at module-evaluation time to help identify broken imports.
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _any: any = {};
  if (typeof (Box as any) === 'undefined')
    throw new Error('UnifiedOverlayV2: import `Box` is undefined');
  if (typeof (Text as any) === 'undefined')
    throw new Error('UnifiedOverlayV2: import `Text` is undefined');
  if (typeof (Button as any) === 'undefined')
    throw new Error('UnifiedOverlayV2: import `Button` is undefined');
  if (typeof (ScopeSelector as any) === 'undefined')
    throw new Error('UnifiedOverlayV2: import `ScopeSelector` is undefined');
} catch (e: any) {
  // eslint-disable-next-line no-console
  console.error('UnifiedOverlayV2 sanity check failed:', e && e.message ? e.message : e);
}

export function UnifiedOverlayV2(props: UnifiedCreateOverlayProps) {
  const {
    visible,
    onClose,
    mode = 'create',
    initialEntity,
    initialSpaceId,
    onSaved,
    initialText,
  } = props;

  const repo = useRepo();
  const [state, dispatch] = useReducer(v2Reducer, initialV2State);
  const baseType = state.baseType;
  const [isSaving, setIsSaving] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateModalTarget, setDateModalTarget] = useState<'todo' | 'reminder' | null>(null);
  const [customDate, setCustomDate] = useState('');
  // save error UI
  const [saveError, setSaveError] = useState<string | null>(null);
  // transient UI success pulse
  const [savedPulse, setSavedPulse] = useState(false);
  // focus states for accessibility focus rings
  const [bodyFocused, setBodyFocused] = useState(false);
  const [customDateFocused, setCustomDateFocused] = useState(false);
  const [commitmentFocused, setCommitmentFocused] = useState(false);
  // useAuth may not be available in some test harnesses that mock providers,
  // so guard against the hook throwing by falling back to null.
  let userId: string | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    userId = useAuth().userId ?? null;
  } catch (e) {
    userId = null;
  }

  const phase8Links = usePhase8LinksState(
    repo,
    userId ?? '',
    null,
    baseType === 'todo' ? 'todo' : baseType === 'habit' ? 'habit' : 'note',
  );
  const [spaces, setSpaces] = useState<any[]>([]);
  // local UI state for undo toast
  const [showUndoToast, setShowUndoToast] = useState(false);
  const undoTimerRef = useRef<number | null>(null);
  const createPrefillAppliedRef = useRef(false);
  // feature flag for commitments (soft rollout)
  const commitmentsOn = process?.env?.EXPO_PUBLIC_FEATURE_COMMITMENTS === 'on';
  const currentTagsRef = useRef<TagKey[]>(state.tags);
  useEffect(() => {
    currentTagsRef.current = state.tags;
  }, [state.tags]);
  const hasLoadedEditTagsRef = useRef(false);

  async function canEnableCommitment(): Promise<boolean> {
    try {
      if (typeof (repo as any).countActiveCommitments === 'function') {
        const n = await (repo as any).countActiveCommitments();
        return n < 3;
      }
      if (typeof (repo as any).listCommitments === 'function') {
        const items = await (repo as any).listCommitments();
        return (items?.length ?? 0) < 3;
      }
    } catch (e) {
      // ignore and allow by default
    }
    return true;
  }

  // load spaces when details panel expands so selector can show options
  useEffect(() => {
    let mounted = true;
    if (!state.expanded) return;
    (async () => {
      try {
        const s = await repo.listSpaces();
        if (mounted) setSpaces(s || []);
      } catch (e) {
        if (__DEV__) console.warn('[UnifiedOverlayV2] listSpaces failed', e);
        if (mounted) setSpaces([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [repo, state.expanded]);

  // Emit an 'opened' funnel event when the overlay becomes visible so analytics
  // can track funnel starts (best-effort, ignore telemetry errors).
  useEffect(() => {
    if (!visible) return;
    try {
      eventBus.emit('OverlayOpened', { mode, baseType: state.baseType });
    } catch (e) {
      // ignore telemetry errors
    }
  }, [visible, mode, state.baseType]);

  // safe area insets (guard when the test harness doesn't provide the hook)
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    insets = useSafeAreaInsets();
  } catch (e) {
    insets = { top: 0, bottom: 0, left: 0, right: 0 };
  }

  // reduced motion preference
  const reduceMotion = useReducedMotion();

  const currentTitle =
    state.todo?.title ||
    state.log?.title ||
    state.habit?.title ||
    firstLine(state.todo?.details || state.log?.body || state.habit?.notes || initialText) ||
    (mode === 'edit'
      ? 'Edit'
      : baseType === 'log'
        ? 'New Log'
        : baseType === 'todo'
          ? 'New To-Do'
          : 'New Habit');

  const handleToggleDetails = useCallback(() => {
    if (!reduceMotion) {
      try {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      } catch (e) {
        // no-op if the platform doesn't support LayoutAnimation
      }
    }
    dispatch({ type: 'TOGGLE_EXPANDED' });
  }, [dispatch, reduceMotion]);

  const handleTypeSelect = useCallback(
    (next: BaseType) => {
      if (state.baseType === next) return;
      const prev = state.baseType;
      pushUndoEntry('type', {
        baseType: state.baseType,
        log: state.log,
        todo: state.todo,
        habit: state.habit,
      });
      dispatch({ type: 'SET_BASE_TYPE', to: next });
      try {
        eventBus.emit('OverlayTypeChanged', { from: prev, to: next });
      } catch (e) {
        // ignore telemetry errors
      }
    },
    [dispatch, state.baseType, state.habit, state.log, state.todo],
  );

  // Runtime checks for components that must exist at render time.
  if (typeof Box === 'undefined') throw new Error('UnifiedOverlayV2 render: `Box` is undefined');
  if (typeof Text === 'undefined') throw new Error('UnifiedOverlayV2 render: `Text` is undefined');
  if (typeof Button === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `Button` is undefined');
  if (typeof ScopeSelector === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `ScopeSelector` is undefined');
  if (typeof ToastUndo === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `ToastUndo` is undefined');
  if (typeof Reanimated === 'undefined' || typeof (Reanimated as any).View === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `Animated.View` is undefined');
  if (typeof SafeAreaView === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `SafeAreaView` is undefined');
  if (typeof PeopleLinker === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `PeopleLinker` is undefined');
  if (typeof PersonPicker === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `PersonPicker` is undefined');
  if (typeof Modal === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `Modal` is undefined');

  // animation values for details panel, commitment and save pulse
  const detailsAnim = useSharedValue(state.expanded ? 1 : 0);
  const commitmentAnim = useSharedValue(state.commitment ? 1 : 0);
  const savePulse = useSharedValue(0);
  const sheetTranslateY = useRef(new RNAnimated.Value(16)).current;

  const detailsStyle = useAnimatedStyle(() => ({
    opacity: detailsAnim.value,
    transform: [{ translateY: interpolate(detailsAnim.value, [0, 1], [8, 0]) }],
  }));

  const commitmentStyle = useAnimatedStyle(() => ({
    opacity: commitmentAnim.value,
    transform: [{ scale: interpolate(commitmentAnim.value, [0, 1], [0.98, 1]) }],
  }));

  const saveStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(savePulse.value, [0, 1], [1, 1.06]) }],
  }));

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      sheetTranslateY.setValue(0);
      return;
    }
    sheetTranslateY.setValue(16);
    RNAnimated.timing(sheetTranslateY, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, reduceMotion, sheetTranslateY]);
  // animate details panel expand/collapse
  useEffect(() => {
    try {
      if (detailsAnim && typeof (detailsAnim as any).value !== 'undefined') {
        (detailsAnim as any).value = conditionalAnimation(
          withTiming(state.expanded ? 1 : 0, timingConfig.normal),
          state.expanded ? 1 : 0,
          reduceMotion,
        );
      }
    } catch (e) {
      // In some test environments reanimated is mocked incompletely; ignore
    }
  }, [state.expanded, detailsAnim, reduceMotion]);

  // animate commitment reveal/hide
  useEffect(() => {
    try {
      if (commitmentAnim && typeof (commitmentAnim as any).value !== 'undefined') {
        (commitmentAnim as any).value = conditionalAnimation(
          withTiming(state.commitment ? 1 : 0, timingConfig.normal),
          state.commitment ? 1 : 0,
          reduceMotion,
        );
      }
    } catch (e) {
      // ignore incomplete mocks in tests
    }
  }, [state.commitment, commitmentAnim, reduceMotion]);

  const draftKey = useMemo(
    () => `overlayV2:draft:${mode}:${baseType}:${initialSpaceId ?? 'none'}`,
    [mode, baseType, initialSpaceId],
  );

  // load existing draft once
  const currentText =
    baseType === 'log'
      ? state.log.body
      : baseType === 'todo'
        ? state.todo.details
        : state.habit.notes;
  useEffect(() => {
    let mounted = true;
    readOverlayV2Draft(draftKey).then((v) => {
      if (mounted && v && !currentText) dispatch({ type: 'SET_TEXT', text: v });
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // autosave on change
  useOverlayV2Draft(draftKey, currentText);

  function pushUndoEntry(kind: 'type' | 'tag' | 'commitment', prev: Partial<any>) {
    try {
      dispatch({ type: 'PUSH_UNDO', entry: { kind, prev } } as any);
    } catch (e) {
      // ignore dispatch typing in JS/TS mixed environments
    }
    setShowUndoToast(true);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current as any);
    }
    // auto hide after 3s
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    undoTimerRef.current = setTimeout(() => setShowUndoToast(false), 3000) as unknown as number;
  }

  function handleUndo() {
    try {
      dispatch({ type: 'UNDO_LAST' } as any);
    } catch (e) {
      // ignore
    }
    setShowUndoToast(false);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current as any);
      undoTimerRef.current = null;
    }
  }

  function safeFormat(iso: string | null | undefined) {
    try {
      if (!iso) return '';
      return format(parseISO(iso), 'MMM d');
    } catch (e) {
      return '';
    }
  }

  useEffect(() => {
    if (mode !== 'create') return;
    if (createPrefillAppliedRef.current) return;

    const override = deriveBaseTypeFromInitial((initialEntity as any)?.type);
    const rawText = typeof initialText === 'string' ? initialText : '';
    const hasText = rawText.trim().length > 0;

    if (!override && !hasText) {
      createPrefillAppliedRef.current = true;
      return;
    }

    const payload: Partial<V2State> = {};
    if (override) payload.baseType = override;

    if (hasText) {
      const title = firstLine(rawText);
      payload.log = { ...initialV2State.log, body: rawText, title };
      payload.todo = { ...initialV2State.todo, details: rawText, title };
      payload.habit = { ...initialV2State.habit, notes: rawText, title };
    }

    if (Object.keys(payload).length > 0) {
      dispatch({ type: 'HYDRATE_EDIT', payload });
    }

    createPrefillAppliedRef.current = true;
  }, [mode, initialEntity, initialText, dispatch]);

  // Initial defaults (match brief: text-first; first line becomes title)
  useEffect(() => {
    if (mode === 'edit' && initialEntity) {
      // Hydrate minimal parity from initialEntity (title/body/details)
      const t = (initialEntity as any).type;
      const payload: any = {};
      if (t === 'todo') payload.baseType = 'todo';
      else if (t === 'habit') payload.baseType = 'habit';
      else payload.baseType = 'log';
      payload.log = {
        title: (initialEntity as any).title ?? '',
        body: ((initialEntity as any).body || (initialEntity as any).details || '') ?? '',
      };
      payload.todo = {
        title: (initialEntity as any).title ?? '',
        details: (initialEntity as any).details ?? '',
        due_at: (initialEntity as any).due_at ?? null,
      };
      payload.habit = {
        title: (initialEntity as any).title ?? '',
        notes: (initialEntity as any).notes ?? '',
        schedule: 'custom',
      };
      dispatch({ type: 'HYDRATE_EDIT', payload });
    }
  }, [mode, initialEntity]);

  useEffect(() => {
    if (mode !== 'edit') return;
    if (hasLoadedEditTagsRef.current) return;

    const inlineTags = extractTagKeysFromEntity(initialEntity);
    if (inlineTags.length > 0) {
      const merged = mergeTagKeys(currentTagsRef.current, inlineTags);
      if (merged.length !== currentTagsRef.current.length) {
        dispatch({ type: 'SET_TAGS', tags: merged });
      }
      hasLoadedEditTagsRef.current = true;
      return;
    }

    const entityId = (initialEntity as any)?.id;
    const fetchableRepo = repo as any;
    if (!entityId || typeof fetchableRepo?.getById !== 'function') {
      hasLoadedEditTagsRef.current = true;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const entity = await fetchableRepo.getById(entityId);
        if (cancelled) return;
        const fetched = extractTagKeysFromEntity(entity);
        if (fetched.length > 0) {
          const merged = mergeTagKeys(currentTagsRef.current, fetched);
          if (merged.length !== currentTagsRef.current.length) {
            dispatch({ type: 'SET_TAGS', tags: merged });
          }
        }
      } catch (err) {
        if (__DEV__) console.warn('[UnifiedOverlayV2] failed to preload edit tags', err);
      } finally {
        if (!cancelled) hasLoadedEditTagsRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, initialEntity, repo]);

  // AI prefill hook: request suggestions when creating a new item with empty text
  const { suggestedTitle, suggestedTags: prefillSuggestedTags } = useOverlayPrefill({
    mode,
    getText: () => currentText,
  });

  // Track previous title to detect manual edits after an AI suggestion was applied
  const prevTitleRef = useRef<string | null>(null);
  // Track which suggested tag names were offered
  useEffect(() => {
    // Only apply suggestions for fresh creates with an empty text body
    if (mode !== 'create') return;
    if (currentText && currentText.trim().length > 0) return;
    if (suggestedTitle && !state.log.title) {
      dispatch({ type: 'SET_TITLE', title: suggestedTitle });
      // remember that the current title equals the suggestion we applied
      prevTitleRef.current = suggestedTitle;
    }
  }, [currentText, dispatch, mode, state.log.title, suggestedTitle]);

  // Detect manual title edits away from an AI suggestion
  useEffect(() => {
    const prev = prevTitleRef.current;
    const cur = state.log.title;
    if (prev && prev.trim().length > 0 && cur !== prev && suggestedTitle === prev) {
      // user edited the suggested title -> mark as rejected
      recordOverlayFeedback({ type: 'title', accepted: false, prev, newValue: cur });
      // clear prev so we don't repeatedly send
      prevTitleRef.current = null;
    }
  }, [state.log.title, suggestedTitle]);

  const sanitizedTagSuggestions = useMemo<PrefillSuggestedTag[]>(() => {
    const rawNames = (prefillSuggestedTags ?? []).map((entry) =>
      typeof entry?.name === 'string' ? entry.name : '',
    );
    const sanitizedNames = sanitizeSuggestedTags(currentText, rawNames);
    if (sanitizedNames.length === 0) return [];

    const lowConfidenceLookup = new Map<string, boolean>();
    (prefillSuggestedTags ?? []).forEach((entry) => {
      const key = normalizeToTagKey(entry?.name ?? '');
      if (!key || lowConfidenceLookup.has(key)) return;
      lowConfidenceLookup.set(key, !!entry.lowConfidence);
    });

    return sanitizedNames.map((name) => {
      const normalized = normalizeToTagKey(name);
      const lowConfidence = normalized ? (lowConfidenceLookup.get(normalized) ?? false) : false;
      return { name, lowConfidence };
    });
  }, [currentText, prefillSuggestedTags]);

  const filteredTagSuggestions = useMemo(() => {
    if (sanitizedTagSuggestions.length === 0) return [];
    return sanitizedTagSuggestions.filter((entry) => {
      const normalized = normalizeToTagKey(entry.name);
      if (!normalized) return false;
      return !state.tags.includes(normalized);
    });
  }, [sanitizedTagSuggestions, state.tags]);

  const suggestionDisplayMap = useMemo(() => {
    const map = new Map<string, { label: string; isPerson: boolean }>();
    sanitizedTagSuggestions.forEach((entry) => {
      const normalized = normalizeToTagKey(entry.name);
      if (!normalized || map.has(normalized)) return;
      const trimmed = entry.name.trim();
      map.set(normalized, {
        label: trimmed,
        isPerson: trimmed.startsWith('@'),
      });
    });
    return map;
  }, [sanitizedTagSuggestions]);

  const mentionLookup = useMemo(() => {
    const map = new Map<string, string>();
    (state.detected?.mentions ?? []).forEach((mention) => {
      const normalized = normalizeToTagKey(mention);
      if (!normalized || map.has(normalized)) return;
      const sanitized = mention.replace(/^@+/, '');
      map.set(normalized, `@${sanitized}`);
    });
    return map;
  }, [state.detected?.mentions]);

  const activeTagMeta = useMemo(() => {
    const meta: Record<string, { label: string; isPerson: boolean }> = {};
    state.tags.forEach((tag) => {
      const mention = mentionLookup.get(tag);
      if (mention) {
        meta[tag] = { label: mention, isPerson: true };
        return;
      }
      const suggestion = suggestionDisplayMap.get(tag);
      if (suggestion) {
        meta[tag] = suggestion;
        return;
      }
      meta[tag] = { label: `#${tag}`, isPerson: false };
    });
    return meta;
  }, [mentionLookup, state.tags, suggestionDisplayMap]);

  const hasLowConfidenceSuggestions = useMemo(
    () => filteredTagSuggestions.some((tag) => !!tag.lowConfidence),
    [filteredTagSuggestions],
  );

  const handleTagToggle = useCallback(
    (tag: string) => {
      const normalized = normalizeToTagKey(tag);
      if (!normalized) return;
      pushUndoEntry('tag', { tags: [...state.tags], list: state.list, mood: state.mood });
      dispatch({ type: 'TOGGLE_TAG', tag: normalized });
    },
    [dispatch, state.list, state.mood, state.tags],
  );

  const handleTagRemove = useCallback(
    (tag: string) => {
      const normalized = normalizeToTagKey(tag);
      if (!normalized) return;
      if (!state.tags.includes(normalized)) return;
      pushUndoEntry('tag', { tags: [...state.tags], list: state.list, mood: state.mood });
      const nextTags = state.tags.filter((t) => t !== normalized);
      dispatch({ type: 'SET_TAGS', tags: nextTags });
    },
    [dispatch, state.list, state.mood, state.tags],
  );

  // theme / background for overlay (phase‑8 visual polish)
  const colorMode = useColorScheme();
  const palette = colorMode === 'dark' ? darkTokens : lightTokens;
  const sheetBackground =
    palette.colors.surface ??
    (colorMode === 'dark' ? darkTokens.colors.linen : lightTokens.colors.linenCream);
  const sheetBorderColor = 'rgba(46,85,64,0.1)';
  const sheetShadow = palette.elevation?.xl ?? lightTokens.elevation.xl;
  const handleColor = colorMode === 'dark' ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.16)';
  const typeTabActiveColor = palette.colors.charcoal;
  const typeTabInactiveColor =
    colorMode === 'dark' ? 'rgba(248,250,249,0.65)' : 'rgba(34,34,34,0.55)';
  const typeTabUnderlineColor = palette.colors.moss;
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const canSave = currentText.trim().length > 0 && !isSaving;

  function toCreateOrUpdateInput(
    baseType: BaseType,
    s: typeof initialV2State,
    spaceId: string | null,
  ) {
    const sanitized = sanitizeSuggestedTags('', Array.isArray(s.tags) ? s.tags : []);
    const tags = stripJournalTags(sanitized, baseType === 'log');
    if (baseType === 'todo') {
      const derivedTitle = s.todo.title || firstLine(s.todo.details) || 'Untitled';
      return {
        type: 'todo' as const,
        title: derivedTitle,
        name: derivedTitle,
        details: s.todo.details || null,
        due_at: s.todo.due_at ?? s.reminderAt ?? null,
        space_id: s.spaceId ?? spaceId ?? null,
        origin: 'catchall' as const,
        tags,
        // Commitment fields (only for todos/habits)
        ...{
          commitment: s.commitment,
          commitment_note: s.commitment ? s.commitmentNote || null : null,
          commitment_started_at: s.commitment ? s.commitmentStartedAt : null,
        },
      };
    }
    if (baseType === 'habit') {
      return {
        type: 'habit' as const,
        title: s.habit.title || firstLine(s.habit.notes) || 'Untitled',
        notes: s.habit.notes || null,
        frequency: s.habit.schedule ?? 'custom',
        space_id: s.spaceId ?? spaceId ?? null,
        origin: 'catchall' as const,
        tags,
        // Commitment fields (only for todos/habits)
        ...{
          commitment: s.commitment,
          commitment_note: s.commitment ? s.commitmentNote || null : null,
          commitment_started_at: s.commitment ? s.commitmentStartedAt : null,
        },
      };
    }

    // base note payload
    const base = {
      type: 'note' as const,
      subtype: 'catchall' as const,
      title: s.log.title || firstLine(s.log.body) || 'Untitled note',
      body: s.log.body,
      space_id: s.spaceId ?? spaceId ?? null,
      origin: 'catchall' as const,
      tags,
    } as any;

    // mood (Journal)
    const moodPatch = s.tags.includes('journal') ? { mood: s.mood ?? 'neu' } : { mood: null };

    // fmt: list tag overrides explicit format
    let fmtVal: any = null;
    if (s.tags.includes('list')) fmtVal = 'checkboxes';
    else if (s.format) fmtVal = s.format; // 'plain' | 'checkboxes' | 'bullet'

    const fmtPatch = fmtVal ? { fmt: fmtVal } : {};

    const datePatch = s.reminderAt ? { date: s.reminderAt } : {};

    return { ...base, ...moodPatch, ...fmtPatch, ...datePatch };
  }

  const onSave = useCallback(async () => {
    if (!canSave) return;
    // If offline, surface a small hint and keep the draft (enqueue behavior no-op here)
    if (isOffline) {
      setSaveError("You're offline — Save will keep the draft.");
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      const input = toCreateOrUpdateInput(baseType, state as any, initialSpaceId ?? null);
      const result =
        mode === 'edit' && (initialEntity as any)?.id
          ? await repo.update({ id: (initialEntity as any).id, patch: input as any })
          : await repo.create(input as any);
      // After a successful create/update, link any pending Phase‑8 tags/people
      try {
        const itemType = baseType === 'todo' ? 'todo' : baseType === 'habit' ? 'habit' : 'note';

        // Link any pending tags first (non-blocking failures)
        if ((phase8Links as any)?.pendingTagIds?.length) {
          for (const tagId of (phase8Links as any).pendingTagIds) {
            try {
              // Cast to any for Phase 8 helpers
              await (repo as any).linkTag({ itemId: result.id, tagId, itemType });
            } catch (err) {
              console.error('[Phase8] Failed to link pending tag to item:', err);
            }
          }
        }

        // Link any pending people
        if ((phase8Links as any)?.pendingPeople?.length) {
          for (const person of (phase8Links as any).pendingPeople) {
            try {
              await (repo as any).linkPerson({
                itemId: result.id,
                itemType,
                personName: person.personName,
                personEmail: person.personEmail,
              });
            } catch (err) {
              console.error('[Phase8] Failed to link pending person to item:', err);
            }
          }
        }

        // If there are pendingPeople entries (temp links), try to persist them
        if ((phase8Links as any)?.pendingPeople?.length) {
          for (const p of (phase8Links as any).pendingPeople) {
            try {
              const pid = p.id; // temp id from usePhase8LinksState (e.g., temp-...)
              if (pid && typeof (repo as any).linkPersonToEntity === 'function') {
                await (repo as any).linkPersonToEntity({ entityId: result.id, personId: pid });
              } else if (
                pid &&
                (repo as any).entities &&
                typeof (repo as any).entities.linkPerson === 'function'
              ) {
                await (repo as any).entities.linkPerson({ entityId: result.id, personId: pid });
              } else if (
                pid &&
                (repo as any).people &&
                typeof (repo as any).people.linkToEntity === 'function'
              ) {
                await (repo as any).people.linkToEntity({ entityId: result.id, personId: pid });
              }
            } catch (err) {
              console.error('[Phase8] Failed to persist pending person link:', err);
            }
          }
        }

        // Clear any pending markers in the links state (UI cleanup)
        try {
          phase8Links.clearPendingPeople?.();
          phase8Links.clearPendingTags?.();
        } catch (err) {
          // ignore
        }
      } catch (err) {
        // Non-fatal: linking errors should not block the save flow
        console.error('[UnifiedOverlayV2] post-save linking failed', err);
      }
      // Attempt to link the explicitly selected person (non-blocking)
      try {
        await linkSelectedPerson(repo, result?.id, (state as any).person?.id);
      } catch (err) {
        console.error('[UnifiedOverlayV2] person link failed', err);
      }

      setIsSaving(false);
      await clearOverlayV2Draft(draftKey);

      // transient saved pulse and optional haptic feedback
      setSavedPulse(true);
      // haptic feedback if available and not reduced motion
      if (!reduceMotion) {
        try {
          // fire a success haptic (non-blocking)
          Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType?.Success);
        } catch (err) {
          // ignore
        }
      }
      // auto-hide the saved pulse indicator after ~1s
      setTimeout(() => setSavedPulse(false), 1000);

      // Emit overlay saved analytics and call parent onSaved if supplied
      try {
        const savedType = (result as any)?.type ?? baseType;
        eventBus.emit('OverlaySaved', { id: result?.id, type: savedType });
      } catch (e) {
        // ignore
      }
      try {
        // Notify parent (OverlayHost) so it can run its saved hooks
        onSaved?.({ id: result?.id, type: (result as any)?.type ?? baseType } as any);
      } catch (e) {
        // ignore
      }

      // show a quick save pulse before closing (respect reduced motion)
      const runClose = () => onClose?.();
      if (reduceMotion) {
        runClose();
      } else {
        // animate via reanimated shared value and call close after duration
        const dur = 200;
        try {
          if (typeof (savePulse as any)?.value !== 'undefined') {
            (savePulse as any).value = conditionalAnimation(
              withSequence(withTiming(1, { duration: dur }), withTiming(0, { duration: dur })),
              0,
              reduceMotion,
            );
          }
        } catch (err) {
          // ignore mocked reanimated environments
        }
        setTimeout(() => runClose(), dur * 2);
      }
    } catch (e) {
      console.error('[UnifiedOverlayV2] save failed', e);
      // show inline retry bar; do not clear draft
      setSaveError('Save failed. Retry?');
      setIsSaving(false);
    }
  }, [
    canSave,
    baseType,
    state,
    initialSpaceId,
    mode,
    initialEntity,
    repo,
    draftKey,
    onClose,
    isOffline,
  ]);

  const handleCancel = useCallback(async () => {
    await clearOverlayV2Draft(draftKey);
    onClose?.();
  }, [draftKey, onClose]);

  if (!visible) return null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      keyboardVerticalOffset={Platform.select({ ios: 64, android: 0 })}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          alignSelf: 'stretch',
          position: 'relative',
        }}
      >
        <View
          testID="overlay-scrim"
          pointerEvents="auto"
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0,0,0,0.45)',
          }}
        />
        {/* Bottom-anchored sheet: max 80% of viewport, rounded top corners */}
        <RNAnimated.View
          style={{
            width: '100%',
            transform: [{ translateY: sheetTranslateY }],
          }}
        >
          <View
            style={{
              width: '100%',
              alignSelf: 'stretch',
              height: SHEET_H,
            }}
          >
            <View
              style={{
                flex: 1,
                borderRadius: tokenRadius.xl,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: sheetBorderColor,
                backgroundColor: sheetBackground,
                ...sheetShadow,
              }}
            >
              <View
                style={{
                  flex: 1,
                  borderRadius: tokenRadius.xl,
                  overflow: 'hidden',
                  backgroundColor: sheetBackground,
                }}
              >
                {/* Grab handle for visual separation */}
                <View
                  style={{
                    alignItems: 'center',
                    paddingTop: tokenSpacing.sm,
                    paddingBottom: 4,
                    backgroundColor: sheetBackground,
                  }}
                >
                  <View
                    style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: handleColor }}
                  />
                </View>
                {/* Header: contextual title */}
                <Box
                  px={4}
                  pb={3}
                  style={{
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: lightTokens.colors.border,
                    backgroundColor: sheetBackground,
                  }}
                >
                  <Text
                    variant="title"
                    style={{ color: lightTokens.colors.text, fontWeight: '600' }}
                  >
                    {currentTitle}
                  </Text>
                </Box>

                {/* Body: entire form stack in a single scroll context */}
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingBottom: 120,
                    paddingTop: 16,
                  }}
                >
                  <Box px={4}>
                    <View style={[styles.typeTabsRow, { marginBottom: tokenSpacing.md }]}>
                      {(['log', 'todo', 'habit'] as BaseType[]).map((t) => {
                        const selected = baseType === t;
                        return (
                          <Pressable
                            key={t}
                            onPress={() => handleTypeSelect(t)}
                            style={styles.typeTab}
                            accessibilityRole="tab"
                            accessibilityState={{ selected }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text
                              style={[
                                styles.typeTabLabel,
                                {
                                  color: selected ? typeTabActiveColor : typeTabInactiveColor,
                                  fontWeight: selected ? '600' : '500',
                                },
                              ]}
                            >
                              {BASE_LABEL[t]}
                            </Text>
                            <View
                              style={[
                                styles.typeTabUnderline,
                                {
                                  backgroundColor: selected ? typeTabUnderlineColor : 'transparent',
                                },
                              ]}
                            />
                          </Pressable>
                        );
                      })}
                    </View>
                    <TagsRow
                      tags={state.tags}
                      suggested={filteredTagSuggestions}
                      onToggle={handleTagToggle}
                      onRemove={handleTagRemove}
                      activeMeta={activeTagMeta}
                    />
                    {hasLowConfidenceSuggestions ? (
                      <Box mt={2}>
                        <Text variant="subtle">AI suggestions (low confidence)</Text>
                      </Box>
                    ) : null}

                    <Box mt={3}>
                      <TextInput
                        value={currentText}
                        onChangeText={(t) => dispatch({ type: 'SET_TEXT', text: t })}
                        accessibilityLabel="Overlay content input"
                        onFocus={() => setBodyFocused(true)}
                        onBlur={() => setBodyFocused(false)}
                        placeholder="Drop your thought…"
                        placeholderTextColor={lightTokens.colors.subtle}
                        multiline
                        scrollEnabled={false}
                        autoFocus
                        textAlignVertical="top"
                        style={[
                          styles.textArea,
                          {
                            color: lightTokens.colors.text,
                            backgroundColor:
                              colorMode === 'dark'
                                ? darkTokens.colors.deep
                                : lightTokens.colors.linen,
                            borderColor: bodyFocused
                              ? 'rgba(46,85,64,0.35)'
                              : 'rgba(46,85,64,0.18)',
                            borderWidth: bodyFocused ? 2 : StyleSheet.hairlineWidth,
                          },
                        ]}
                      />
                    </Box>
                    {baseType === 'todo' ? (
                      <Box row mt={2} style={{ alignItems: 'center' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onPress={() => {
                            setDateModalTarget('todo');
                            setShowDateModal(true);
                          }}
                          title={
                            state.todo.due_at
                              ? `Due: ${safeFormat(state.todo.due_at)}`
                              : 'Add due date'
                          }
                        />
                      </Box>
                    ) : null}
                    {baseType === 'log' ? (
                      <Box row mt={2} style={{ alignItems: 'center' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onPress={() => {
                            setDateModalTarget('reminder');
                            setShowDateModal(true);
                          }}
                          title={
                            state.reminderAt
                              ? `Reminder: ${safeFormat(state.reminderAt)}`
                              : 'Add reminder'
                          }
                        />
                      </Box>
                    ) : null}
                    <Box mt={3} row style={{ alignItems: 'center' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={handleToggleDetails}
                        title={state.expanded ? 'Hide details' : 'Add details'}
                      />
                      <Box flex={1} />
                    </Box>
                    {state.expanded ? (
                      <Reanimated.View style={[detailsStyle, { marginTop: tokenSpacing.sm }]}>
                        <Box pb={2}>
                          <Text variant="label">Details</Text>
                          {/* People linker + reminder/todo due + space selector */}
                          <Box mt={2}>
                            {/* Thin picker for selecting an existing person (Phase-4) */}
                            <PersonPicker
                              value={state.person ?? null}
                              onChange={(p) => dispatch({ type: 'SET_PERSON', person: p })}
                            />

                            <Box mt={2}>
                              {/* Space selector: load spaces when expanded */}
                              <ScopeSelector
                                selectedScope={
                                  state.spaceId
                                    ? {
                                        type: 'space',
                                        spaceId: state.spaceId,
                                        label:
                                          spaces.find((s) => s.id === state.spaceId)?.name ??
                                          'Space',
                                      }
                                    : { type: 'unassigned', label: 'Unassigned' }
                                }
                                spaces={spaces}
                                onChange={(opt) => {
                                  if (opt.type === 'space')
                                    dispatch({ type: 'SET_SPACE', spaceId: opt.spaceId ?? null });
                                  else dispatch({ type: 'SET_SPACE', spaceId: null });
                                }}
                              />
                            </Box>
                            {commitmentsOn && (baseType === 'todo' || baseType === 'habit') ? (
                              <Box mt={2}>
                                <Text variant="label">Commitment</Text>
                                <Box row mt={1} gap={2} style={{ alignItems: 'center' }}>
                                  <Button
                                    size="sm"
                                    variant={state.commitment ? 'primary' : 'ghost'}
                                    onPress={async () => {
                                      if (!state.commitment) {
                                        const ok = await canEnableCommitment();
                                        if (!ok) {
                                          console.log('[Commitment] Limit reached (3)');
                                          return;
                                        }
                                      }
                                      // push undo snapshot for commitment fields
                                      const prevOn = !!state.commitment;
                                      pushUndoEntry('commitment', {
                                        commitment: state.commitment,
                                        commitmentNote: state.commitmentNote,
                                        commitmentStartedAt: state.commitmentStartedAt,
                                      });
                                      dispatch({ type: 'TOGGLE_COMMITMENT' });
                                      try {
                                        eventBus.emit('OverlayCommitmentToggled', { on: !prevOn });
                                      } catch (e) {
                                        // ignore telemetry errors
                                      }
                                    }}
                                    title={
                                      state.commitment ? 'Committed' : 'Make this a commitment'
                                    }
                                  />

                                  {/* Animated reveal for the commitment note */}
                                  <Reanimated.View
                                    style={[commitmentStyle, { flex: 1 }]}
                                    pointerEvents={state.commitment ? 'auto' : 'none'}
                                  >
                                    {state.commitment ? (
                                      <TextInput
                                        placeholder="Why this matters (optional, 140 max)"
                                        accessibilityLabel="Commitment note input"
                                        maxLength={140}
                                        value={state.commitmentNote}
                                        onChangeText={(t) =>
                                          dispatch({ type: 'SET_COMMITMENT_NOTE', note: t })
                                        }
                                        onFocus={() => setCommitmentFocused(true)}
                                        onBlur={() => setCommitmentFocused(false)}
                                        style={[
                                          styles.textArea,
                                          { minHeight: 40, paddingVertical: 8 },
                                          {
                                            borderColor: commitmentFocused
                                              ? 'rgba(46,85,64,0.35)'
                                              : 'rgba(46,85,64,0.18)',
                                            borderWidth: commitmentFocused
                                              ? 2
                                              : StyleSheet.hairlineWidth,
                                          },
                                        ]}
                                      />
                                    ) : null}
                                  </Reanimated.View>
                                </Box>
                              </Box>
                            ) : null}
                          </Box>
                          {baseType === 'log' ? (
                            <Box mt={2} row gap={2} style={{ alignItems: 'center' }}>
                              <Button
                                size="sm"
                                variant={state.format === 'plain' ? 'primary' : 'ghost'}
                                onPress={() => dispatch({ type: 'SET_FORMAT', fmt: 'plain' })}
                                title="Plain"
                              />
                              <Button
                                size="sm"
                                variant={state.format === 'checkboxes' ? 'primary' : 'ghost'}
                                onPress={() => dispatch({ type: 'SET_FORMAT', fmt: 'checkboxes' })}
                                title="Checkboxes"
                              />
                              <Button
                                size="sm"
                                variant={state.format === 'bullet' ? 'primary' : 'ghost'}
                                onPress={() => dispatch({ type: 'SET_FORMAT', fmt: 'bullet' })}
                                title="Bullet"
                              />
                            </Box>
                          ) : null}
                        </Box>
                      </Reanimated.View>
                    ) : null}
                    {/* Journal mood row */}
                    {state.tags.includes('journal') ? (
                      <Box mt={3} row gap={2} style={{ marginTop: tokenSpacing.md }}>
                        <MoodPill
                          label="😊"
                          active={state.mood === 'pos'}
                          onPress={() => dispatch({ type: 'SET_MOOD', mood: 'pos' })}
                        />
                        <MoodPill
                          label="😐"
                          active={state.mood === 'neu'}
                          onPress={() => dispatch({ type: 'SET_MOOD', mood: 'neu' })}
                        />
                        <MoodPill
                          label="😔"
                          active={state.mood === 'neg'}
                          onPress={() => dispatch({ type: 'SET_MOOD', mood: 'neg' })}
                        />
                      </Box>
                    ) : null}

                    {/* List checkboxes */}
                    {state.tags.includes('list') && state.list ? (
                      <Box mt={3}>
                        {(state.list.items || []).map((it) => (
                          <Box
                            key={it.id}
                            row
                            gap={2}
                            style={{ alignItems: 'center', marginBottom: tokenSpacing.sm }}
                          >
                            <Button
                              size="sm"
                              variant={it.checked ? 'primary' : 'neutral'}
                              onPress={() =>
                                dispatch({
                                  type: 'TOGGLE_LIST_ITEM',
                                  id: it.id,
                                  checked: !it.checked,
                                })
                              }
                              title={it.checked ? '✓' : '○'}
                            />
                            <Text>{it.text}</Text>
                          </Box>
                        ))}
                      </Box>
                    ) : null}

                    {/* Mentions / Dates chips (inline suggestions) */}
                    <Box
                      mt={3}
                      row
                      gap={2}
                      style={{ flexWrap: 'wrap', marginTop: tokenSpacing.md }}
                    >
                      {(state.detected?.mentions || []).map((m) => (
                        <Chip key={m} label={`@${m}`} />
                      ))}
                      {(state.detected?.dates || []).map((d) => (
                        <Button
                          key={d}
                          size="sm"
                          variant="ghost"
                          onPress={() => {
                            if (d === '__token:today')
                              dispatch({ type: 'SET_TODO_DUE', due_at: new Date().toISOString() });
                            else if (d === '__token:tomorrow')
                              dispatch({
                                type: 'SET_TODO_DUE',
                                due_at: addDays(new Date(), 1).toISOString(),
                              });
                            else {
                              // fallback: open custom date modal prefilled (for todo)
                              setCustomDate(d.replace(/^\D+/g, ''));
                              setDateModalTarget('todo');
                              setShowDateModal(true);
                            }
                          }}
                          title={
                            d === '__token:today'
                              ? 'Set due: Today'
                              : d === '__token:tomorrow'
                                ? 'Set due: Tomorrow'
                                : d
                          }
                        />
                      ))}
                    </Box>
                    {/* Tag row hidden at Level-1; lands in Phase 3 */}
                  </Box>
                </ScrollView>

                <Modal visible={showDateModal} transparent animationType="fade">
                  <Box
                    style={{
                      flex: 1,
                      justifyContent: 'center',
                      paddingHorizontal: tokenSpacing.base * 3,
                    }}
                  >
                    <Box bg="bg" style={{ padding: tokenSpacing.md, borderRadius: tokenRadius.sm }}>
                      <Text variant="title">Set due date</Text>
                      <Box mt={3}>
                        <Box row gap={2}>
                          <Button
                            variant="ghost"
                            onPress={() => {
                              const iso = new Date().toISOString();
                              if (dateModalTarget === 'reminder')
                                dispatch({ type: 'SET_REMINDER', when: iso });
                              else dispatch({ type: 'SET_TODO_DUE', due_at: iso });
                              setShowDateModal(false);
                              setDateModalTarget(null);
                            }}
                            title="Today"
                          />
                          <Button
                            variant="ghost"
                            onPress={() => {
                              const iso = addDays(new Date(), 1).toISOString();
                              if (dateModalTarget === 'reminder')
                                dispatch({ type: 'SET_REMINDER', when: iso });
                              else dispatch({ type: 'SET_TODO_DUE', due_at: iso });
                              setShowDateModal(false);
                              setDateModalTarget(null);
                            }}
                            title="Tomorrow"
                          />
                          <Button
                            variant="ghost"
                            onPress={() => {
                              if (dateModalTarget === 'reminder')
                                dispatch({ type: 'SET_REMINDER', when: null });
                              else dispatch({ type: 'SET_TODO_DUE', due_at: null });
                              setShowDateModal(false);
                              setDateModalTarget(null);
                            }}
                            title="Clear"
                          />
                        </Box>
                      </Box>
                      <Box mt={3}>
                        <Text variant="label">Custom (YYYY-MM-DD)</Text>
                        <TextInput
                          value={customDate}
                          onChangeText={setCustomDate}
                          placeholder="2023-12-31"
                          accessibilityLabel="Custom date input (YYYY-MM-DD)"
                          onFocus={() => setCustomDateFocused(true)}
                          onBlur={() => setCustomDateFocused(false)}
                          style={[
                            styles.textArea,
                            { minHeight: 40, paddingVertical: 8 },
                            {
                              backgroundColor:
                                colorMode === 'dark'
                                  ? darkTokens.colors.deep
                                  : lightTokens.colors.linen,
                              borderColor: customDateFocused
                                ? 'rgba(46,85,64,0.35)'
                                : 'rgba(46,85,64,0.18)',
                              borderWidth: customDateFocused ? 2 : StyleSheet.hairlineWidth,
                            },
                          ]}
                        />
                        <Box row mt={2}>
                          <Button
                            variant="ghost"
                            onPress={() => {
                              setShowDateModal(false);
                              setDateModalTarget(null);
                            }}
                            title="Cancel"
                          />
                          <Box flex={1} />
                          <Button
                            variant="primary"
                            onPress={() => {
                              try {
                                if (customDate.trim().length === 0) return;
                                const parsed = new Date(`${customDate}T00:00:00`);
                                if (isNaN(parsed.getTime())) return;
                                const iso = parsed.toISOString();
                                if (dateModalTarget === 'reminder')
                                  dispatch({ type: 'SET_REMINDER', when: iso });
                                else dispatch({ type: 'SET_TODO_DUE', due_at: iso });
                                setCustomDate('');
                                setShowDateModal(false);
                                setDateModalTarget(null);
                              } catch (e) {
                                // ignore parse
                              }
                            }}
                            title="Set"
                          />
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                </Modal>

                {/* Save bar (fixed within the sheet) */}
                {/* Inline save error / retry bar (Phase 9) */}
                {saveError ? (
                  <Box
                    px={4}
                    py={2}
                    style={{ backgroundColor: '#fce8e6', borderTopWidth: StyleSheet.hairlineWidth }}
                  >
                    <Box row style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#7a2719', flex: 1 }}>{saveError}</Text>
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => {
                          // Retry invokes save again
                          setSaveError(null);
                          // call onSave again
                          // eslint-disable-next-line @typescript-eslint/no-floating-promises
                          onSave();
                        }}
                        title="Retry"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => setSaveError(null)}
                        title="Dismiss"
                      />
                    </Box>
                  </Box>
                ) : isOffline ? (
                  <Box px={4} py={1}>
                    <Text variant="subtle">You're offline — Save will keep the draft.</Text>
                  </Box>
                ) : null}
                <SafeAreaView
                  style={{
                    backgroundColor: sheetBackground,
                    paddingBottom: (insets?.bottom ?? 0) + 12,
                  }}
                >
                  <Box
                    px={4}
                    py={3}
                    row
                    gap={2}
                    style={{
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: lightTokens.colors.border,
                      paddingBottom: 0, // handled by SafeAreaView padding
                      backgroundColor: sheetBackground,
                    }}
                  >
                    <Button
                      variant="ghost"
                      onPress={handleCancel}
                      disabled={isSaving}
                      title="Cancel"
                    />
                    <Box flex={1} />
                    <Reanimated.View style={saveStyle}>
                      <Button
                        variant="primary"
                        onPress={onSave}
                        disabled={!canSave}
                        title={isSaving ? 'Saving...' : 'Save'}
                      />
                    </Reanimated.View>
                    {savedPulse ? (
                      <Reanimated.View
                        style={[saveStyle, { marginLeft: 8, justifyContent: 'center' }]}
                      >
                        <Box
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 8,
                            backgroundColor: lightTokens.colors.surface || '#fff',
                          }}
                        >
                          <Text>✓ Saved</Text>
                        </Box>
                      </Reanimated.View>
                    ) : null}
                  </Box>
                </SafeAreaView>
                <ToastUndo
                  visible={showUndoToast}
                  onUndo={handleUndo}
                  onHide={() => setShowUndoToast(false)}
                  message="Change saved"
                />
              </View>
            </View>
          </View>
        </RNAnimated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

function MoodPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const _on = onPress ?? (() => {});
  return (
    <Box style={styles.chipSmall}>
      <Button
        size="sm"
        variant={active ? 'primary' : 'ghost'}
        onPress={_on}
        title={label}
        accessibilityLabel={`Mood ${label}`}
      />
    </Box>
  );
}

function Chip({ label, onPress }: { label: string; onPress?: () => void }) {
  const _on = onPress ?? (() => {});
  return (
    <Box style={styles.chipSmall}>
      <Button
        size="sm"
        variant="ghost"
        onPress={_on}
        title={label}
        accessibilityLabel={`Mention ${label}`}
      />
    </Box>
  );
}

function buildCreateOrUpdateInput({
  mode,
  baseType,
  text,
  title,
  spaceId,
  initialEntity,
}: {
  mode: 'create' | 'edit';
  baseType: BaseType;
  text: string;
  title: string;
  spaceId: string | null;
  initialEntity?: { id?: string; type?: string } | null;
}) {
  // Minimal, safe parity with V1 paths:
  if (baseType === 'todo') {
    return {
      type: 'todo' as const,
      title: title || 'Untitled',
      details: text || null,
      space_id: spaceId,
      origin: 'catchall' as const,
    };
  }
  if (baseType === 'habit') {
    return {
      type: 'habit' as const,
      title: title || 'Untitled',
      notes: text || null,
      frequency: 'custom', // Level-1 default; refined in later phases
      space_id: spaceId,
      origin: 'catchall' as const,
    };
  }
  // default: log → note (catchall)
  return {
    type: 'note' as const,
    subtype: 'catchall' as const,
    title: title || 'Untitled note',
    body: text,
    space_id: spaceId,
    origin: 'catchall' as const,
  };
}

const styles = StyleSheet.create({
  typeTabsRow: {
    flexDirection: 'row',
  },
  typeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: tokenSpacing.sm,
  },
  typeTabLabel: {
    fontSize: lightTokens.typography.size.sm,
  },
  typeTabUnderline: {
    alignSelf: 'stretch',
    height: 2,
    marginTop: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
  },
  textArea: {
    minHeight: 120,
    fontSize: lightTokens.typography.size.md,
    lineHeight: 22,
    paddingVertical: tokenSpacing.md,
    paddingHorizontal: tokenSpacing.base,
  },

  /* Details panel layout */
  detailsContainer: {
    paddingHorizontal: tokenSpacing.base,
    paddingVertical: tokenSpacing.sm,
    borderRadius: tokenRadius.md,
    backgroundColor: lightTokens.colors.surface || '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: lightTokens.colors.border,
    // use token elevation for a subtle shadow
    ...lightTokens.elevation.lg,
  },

  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokenSpacing.sm,
    marginTop: tokenSpacing.sm,
  },

  controlButton: {
    minHeight: 36,
    paddingHorizontal: tokenSpacing.md,
    paddingVertical: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },

  scopeSelector: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: tokenSpacing.md,
  },

  chip: {
    minHeight: 44,
    paddingHorizontal: tokenSpacing.md,
    paddingVertical: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
    justifyContent: 'center',
  },
  chipSmall: {
    minHeight: 44,
    paddingHorizontal: tokenSpacing.sm,
    paddingVertical: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
    justifyContent: 'center',
    marginRight: tokenSpacing.sm,
    marginBottom: tokenSpacing.xs,
  },
  listItem: {
    alignItems: 'center',
    marginBottom: tokenSpacing.sm,
    minHeight: 44,
  },
});
