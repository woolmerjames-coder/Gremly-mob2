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
  ActivityIndicator,
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
  firstLine,
  type BaseType,
  type TagKey,
  type V2State,
} from './overlayV2.state';
import ToastUndo from './ToastUndo';
import { linkSelectedPerson, sanitizeSuggestedTags } from './overlayV2.mapping';
import { recordOverlayFeedback } from './overlayV2.feedback';
import { useOverlayV2Draft, readOverlayV2Draft, clearOverlayV2Draft } from './useOverlayV2Draft';
import { eventBus } from '../../lib/events/EventBus';
import { TagsRow, type TagsRowTag, type TagsRowSuggestion } from './fields/TagsRow';
import useOverlayPrefill, { type SuggestedTag as PrefillSuggestedTag } from './useOverlayPrefill';
import { normalizeTag } from '../../lib/tags/normalize';
import { emitOverlayEvent } from '../../lib/telemetry/overlay';
import { getMindDropRawText } from './getMindDropRawText';

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

function coerceIsoTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function toCanonicalParts(value: string | null | undefined): { canonical: string; slug: string } {
  if (!value) return { canonical: '', slug: '' };
  let trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return { canonical: '', slug: '' };
  if (!/^[#@*]/.test(trimmed)) {
    trimmed = `#${trimmed}`;
  }
  const slug = trimmed.replace(/^[#@*]+/, '');
  return { canonical: trimmed, slug };
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
    return slug !== 'journal' && slug !== '*journal';
  });
}

function mergeSuggestionEntries(
  base: PrefillSuggestedTag[],
  incoming: PrefillSuggestedTag[],
): PrefillSuggestedTag[] {
  if (incoming.length === 0 && base.length === 0) return base;
  const map = new Map<string, PrefillSuggestedTag>();

  const upsert = (entry: PrefillSuggestedTag | undefined | null) => {
    if (!entry || typeof entry.name !== 'string') return;
    const key = normalizeToTagKey(entry.name);
    if (!key) return;
    map.set(key, { name: key, lowConfidence: !!entry.lowConfidence });
  };

  base.forEach(upsert);
  incoming.forEach(upsert);

  return Array.from(map.values());
}

function areSuggestionListsEqual(
  a: PrefillSuggestedTag[] | null | undefined,
  b: PrefillSuggestedTag[] | null | undefined,
): boolean {
  if (a === b) return true;
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  if (arrA.length !== arrB.length) return false;
  if (arrA.length === 0) return true;
  for (let i = 0; i < arrA.length; i += 1) {
    const left = arrA[i];
    const right = arrB[i];
    if (left?.name !== right?.name) return false;
    if (!!left?.lowConfidence !== !!right?.lowConfidence) return false;
  }
  return true;
}

// ============================================================================
// Mind Drop Detection Helpers (type-agnostic for todos, habits, notes)
// ============================================================================

/**
 * Check if an entity is a Mind Drop item that may need auto-prefill
 */
function isMindDropEntity(entity: any, mode: 'create' | 'edit'): boolean {
  if (mode !== 'edit') return false;
  if (!entity || entity.origin !== 'catchall') return false;
  const type = entity.type;
  return type === 'todo' || type === 'habit' || type === 'note';
}

/**
 * Get the short title for an entity (type-agnostic)
 * - todos: title ?? name
 * - habits: name ?? title
 * - notes: title
 */
function getEntityShortTitle(entity: any): string {
  if (!entity) return '';
  const type = entity.type;

  if (type === 'todo') {
    return entity.title ?? entity.name ?? '';
  }
  if (type === 'habit') {
    return entity.name ?? entity.title ?? '';
  }
  if (type === 'note') {
    return entity.title ?? '';
  }
  return '';
}

/**
 * Determine if an entity's title is still a "raw sentence" (not yet condensed by AI)
 * Returns true when:
 * - Title has 5+ words, AND
 * - Title matches the original raw Mind Drop text
 */
function isRawSentenceTitle(entity: any): boolean {
  const shortTitle = getEntityShortTitle(entity);
  if (!shortTitle || shortTitle.trim().length === 0) return false;

  const trimmed = shortTitle.trim();
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 5) return false;

  // Use standardized helper to get raw Mind Drop text
  const rawText = getMindDropRawText(entity);
  if (!rawText) return false;

  // Check if title equals the raw Mind Drop sentence
  return trimmed === rawText.trim();
}

// ============================================================================

function normalizePrefillSuggestions(
  text: string,
  entries: PrefillSuggestedTag[] | null | undefined,
  tombstones: Set<string>,
): PrefillSuggestedTag[] {
  if (!entries || entries.length === 0) return [];

  const lookup = new Map<string, boolean>();
  entries.forEach((entry) => {
    if (!entry || typeof entry.name !== 'string') return;
    const key = normalizeToTagKey(entry.name);
    if (!key) return;
    if (!lookup.has(key)) lookup.set(key, !!entry.lowConfidence);
  });

  const sanitized = sanitizeSuggestedTags(
    text,
    entries.map((entry) => (typeof entry?.name === 'string' ? entry.name : '')),
  );

  const result: PrefillSuggestedTag[] = [];
  const seen = new Set<string>();
  for (const name of sanitized) {
    const key = normalizeToTagKey(name);
    if (!key) continue;
    if (tombstones.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ name: key, lowConfidence: lookup.get(key) ?? false });
  }

  return result;
}

function toMetaCanonical(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const { tag } = normalizeTag(value);
  if (!tag) return null;
  return tag;
}

function addMetaTag(list: string[] | undefined | null, value: string | null | undefined): string[] {
  const canonical = toMetaCanonical(value ?? null);
  const base = Array.isArray(list) ? [...list] : [];
  if (!canonical) return base;
  const key = canonical.toLowerCase();
  if (base.some((entry) => typeof entry === 'string' && entry.toLowerCase() === key)) {
    return base;
  }
  return [...base, canonical];
}

function removeMetaTag(
  list: string[] | undefined | null,
  value: string | null | undefined,
): string[] {
  if (!Array.isArray(list)) return [];
  const canonical = toMetaCanonical(value ?? null);
  if (!canonical) return [...list];
  const key = canonical.toLowerCase();
  return list.filter((entry) => typeof entry === 'string' && entry.toLowerCase() !== key);
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
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [dueToastMessage, setDueToastMessage] = useState<string | null>(null);
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
  const [suggestedTags, setSuggestedTags] = useState<PrefillSuggestedTag[]>([]);
  const [isResuggestingTags, setIsResuggestingTags] = useState(false);
  const [isResummarizingTitle, setIsResummarizingTitle] = useState(false);
  const [pendingTitleResummarize, setPendingTitleResummarize] = useState(false);
  // Track whether user has modified tags (to avoid overwriting Mind Drop AI tags on edit)
  const [tagsDirty, setTagsDirty] = useState(false);
  // local UI state for undo toast
  const [showUndoToast, setShowUndoToast] = useState(false);
  const undoTimerRef = useRef<number | null>(null);
  const saveToastTimerRef = useRef<number | null>(null);
  const dueToastTimerRef = useRef<number | null>(null);
  const createPrefillAppliedRef = useRef(false);
  const editAutoPrefillRanRef = useRef(false);
  const aiTitlePersistedRef = useRef(false);
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
    overlayEntryTypeRef.current = state.baseType;
    if (!openTelemetrySentRef.current) {
      openTelemetrySentRef.current = true;
      void emitOverlayEvent({ type: 'overlay_open', mode, entryType: overlayEntryTypeRef.current });
    }
  }, [visible, mode, state.baseType]);

  useEffect(() => {
    overlayEntryTypeRef.current = baseType;
  }, [baseType]);

  useEffect(() => {
    if (!visible) {
      openTelemetrySentRef.current = false;
      if (showSaveToast) setShowSaveToast(false);
    }
  }, [visible, showSaveToast]);

  useEffect(() => {
    if (baseType !== 'todo' && dueToastMessage) {
      setDueToastMessage(null);
    }
  }, [baseType, dueToastMessage]);

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
  const headerPulse = useSharedValue(0);
  const sheetTranslateY = useRef(new RNAnimated.Value(16)).current;
  const sheetOpacity = useRef(new RNAnimated.Value(0)).current;
  const overlayEntryTypeRef = useRef<BaseType>(baseType);
  const openTelemetrySentRef = useRef(false);

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

  const headerPulseStyle = useAnimatedStyle(() => ({
    opacity: headerPulse.value,
  }));

  useEffect(() => {
    if (!visible) return;
    const delay = 24;
    if (reduceMotion) {
      sheetTranslateY.setValue(0);
      sheetOpacity.setValue(1);
      return;
    }
    sheetTranslateY.setValue(16);
    sheetOpacity.setValue(0);
    RNAnimated.parallel([
      RNAnimated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 160,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      RNAnimated.timing(sheetOpacity, {
        toValue: 1,
        duration: 150,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, reduceMotion, sheetTranslateY, sheetOpacity]);
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

  const getPrefillText = useCallback(() => {
    // Prefer the main text field if present
    const bodyText =
      baseType === 'log'
        ? state.log.body
        : baseType === 'todo'
          ? state.todo.details
          : state.habit.notes;

    if (bodyText && bodyText.trim().length > 0) {
      return bodyText;
    }

    // Fallback to the title if body/details/notes is empty
    const titleText =
      baseType === 'log'
        ? state.log.title
        : baseType === 'todo'
          ? state.todo.title
          : state.habit.title;

    return titleText || '';
  }, [
    baseType,
    state.log.body,
    state.log.title,
    state.todo.details,
    state.todo.title,
    state.habit.notes,
    state.habit.title,
  ]);

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
      const payload = buildDraftPayloadFromEntity(initialEntity);
      dispatch({ type: 'HYDRATE_EDIT', payload } as any);
    }
  }, [mode, initialEntity]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current as any);
        undoTimerRef.current = null;
      }
      if (saveToastTimerRef.current) {
        clearTimeout(saveToastTimerRef.current as any);
        saveToastTimerRef.current = null;
      }
      if (dueToastTimerRef.current) {
        clearTimeout(dueToastTimerRef.current as any);
        dueToastTimerRef.current = null;
      }
    };
  }, []);

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
        const metaPayload = buildDraftPayloadFromEntity(entity);
        if (
          Array.isArray((metaPayload as any).stickyTags) ||
          Array.isArray((metaPayload as any).tagTombstones)
        ) {
          dispatch({
            type: 'HYDRATE_EDIT',
            payload: {
              stickyTags: (metaPayload as any).stickyTags ?? [],
              tagTombstones: (metaPayload as any).tagTombstones ?? [],
            },
          } as any);
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

  // Detect if item already has AI-generated content from Mind Drop
  const hasAiTags = useMemo(() => {
    const entity = initialEntity as any;
    return Array.isArray(entity?.tags) && entity.tags.length > 0;
  }, [initialEntity]);

  const hasAiTitle = useMemo(() => {
    const short = getEntityShortTitle(initialEntity as any);
    return !!short && short.trim().length > 0;
  }, [initialEntity]);

  const isAiPlaced = useMemo(() => {
    const entity = initialEntity as any;
    return entity?.ai_placed === true;
  }, [initialEntity]);

  // Detect Mind Drop entities (todos, habits, notes) that need automatic title suggestion
  const isMindDrop = useMemo(() => isMindDropEntity(initialEntity, mode), [initialEntity, mode]);

  // Detect if title is still a raw sentence (not yet condensed by AI)
  const rawSentence = useMemo(() => isRawSentenceTitle(initialEntity), [initialEntity]);

  // Skip auto-prefill for items that already have AI content,
  // EXCEPT for Mind Drop entities with raw sentence titles (allow one auto-suggestion)
  const shouldSkipAutoPrefill = !rawSentence && (hasAiTags || hasAiTitle || isAiPlaced);

  console.log('[OverlayV2] Prefill detection', {
    mode,
    hasAiTags,
    hasAiTitle,
    isAiPlaced,
    isMindDrop,
    rawSentence,
    shouldSkipAutoPrefill,
  });

  // AI prefill hook: request suggestions when creating a new item with empty text
  const {
    suggestedTitle,
    suggestedTags: prefillSuggestedTags,
    refresh: refreshPrefill,
  } = useOverlayPrefill({
    mode,
    getText: getPrefillText,
    skipAutoRun: shouldSkipAutoPrefill,
  });

  // Auto-run prefill for Mind Drop entities with raw sentence titles on first edit open
  useEffect(() => {
    if (mode !== 'edit') return;
    if (!visible) return;
    if (!isMindDrop || !rawSentence) return;
    if (editAutoPrefillRanRef.current) return;
    if (!refreshPrefill) return;

    // Wait until the main text/details have been hydrated
    if (!currentText || !currentText.trim().length) {
      return;
    }

    console.log('[OverlayV2] auto prefill for Mind Drop entity on edit open', {
      type: (initialEntity as any)?.type,
      isMindDrop,
      rawSentence,
      textLen: currentText.length,
    });

    editAutoPrefillRanRef.current = true;
    setPendingTitleResummarize(true);
    void refreshPrefill();
  }, [mode, visible, isMindDrop, rawSentence, refreshPrefill, currentText, initialEntity]);

  const prefillSuggestionsRef = useRef<PrefillSuggestedTag[]>(prefillSuggestedTags ?? []);
  useEffect(() => {
    prefillSuggestionsRef.current = prefillSuggestedTags ?? [];
  }, [prefillSuggestedTags]);
  const suggestedTitleRef = useRef<string | null>(suggestedTitle ?? null);
  useEffect(() => {
    suggestedTitleRef.current = suggestedTitle ?? null;
  }, [suggestedTitle]);

  // COPILOT TASK: Log suggestedTitle changes for debugging
  useEffect(() => {
    console.log('[OverlayV2] suggestedTitle', {
      mode,
      suggestedTitle,
      currentText: currentText?.slice(0, 100) ?? null,
    });
  }, [suggestedTitle, mode, currentText]);

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

  const tagTombstoneSet = useMemo(() => {
    const set = new Set<string>();
    (state.tagTombstones ?? []).forEach((entry) => {
      const key = normalizeToTagKey(entry);
      if (key) set.add(key);
    });
    return set;
  }, [state.tagTombstones]);

  const resuggestRequestIdRef = useRef(0);
  const resuggestAppliedIdRef = useRef(0);

  useEffect(() => {
    if (mode !== 'create') return;

    const normalized = normalizePrefillSuggestions(
      currentText,
      prefillSuggestedTags,
      tagTombstoneSet,
    );

    setSuggestedTags((prev) => {
      let next: PrefillSuggestedTag[] = prev;

      if (normalized.length === 0) {
        if (Array.isArray(prefillSuggestedTags) && prefillSuggestedTags.length === 0) {
          next = [];
        }
      } else {
        next = mergeSuggestionEntries(prev, normalized);
      }

      if (areSuggestionListsEqual(prev, next)) {
        return prev;
      }

      return next;
    });
  }, [currentText, mode, prefillSuggestedTags, tagTombstoneSet]);

  const sanitizedTagSuggestions = useMemo<PrefillSuggestedTag[]>(() => {
    if (suggestedTags.length === 0) return [];

    const lowConfidenceLookup = new Map<string, boolean>();
    suggestedTags.forEach((entry) => {
      const key = normalizeToTagKey(entry?.name ?? '');
      if (!key || lowConfidenceLookup.has(key)) return;
      lowConfidenceLookup.set(key, !!entry.lowConfidence);
    });

    const sanitizedNames = sanitizeSuggestedTags(
      currentText,
      suggestedTags.map((entry) => (typeof entry?.name === 'string' ? entry.name : '')),
    );
    if (sanitizedNames.length === 0) return [];

    const results: PrefillSuggestedTag[] = [];
    for (const name of sanitizedNames) {
      const key = normalizeToTagKey(name);
      if (!key || tagTombstoneSet.has(key)) continue;
      results.push({ name: key, lowConfidence: lowConfidenceLookup.get(key) ?? false });
    }
    return results;
  }, [currentText, suggestedTags, tagTombstoneSet]);

  const filteredTagSuggestions = useMemo(() => {
    if (sanitizedTagSuggestions.length === 0) return [];
    return sanitizedTagSuggestions.filter((entry) => !state.tags.includes(entry.name));
  }, [sanitizedTagSuggestions, state.tags]);

  // AI Tag Override for Mind Drop narrative items
  // Replace hash noise tags with quality AI tags on first edit open
  const aiTagOverrideAppliedRef = useRef(false);
  useEffect(() => {
    // Only apply in edit mode
    if (mode !== 'edit') return;

    // Only run once per entity
    if (aiTagOverrideAppliedRef.current) return;

    // Don't override if user has already edited tags
    if (tagsDirty) return;

    // Only for Mind Drop narrative items (unsorted with raw sentence)
    if (!isMindDrop || !rawSentence) return;

    // Wait for AI tags to be available
    if (!sanitizedTagSuggestions || sanitizedTagSuggestions.length === 0) return;

    // Check if entity is from catchall origin (Mind Drop)
    const entity = initialEntity as any;
    const isCatchall = entity?.origin === 'catchall';
    const hasUnsortedLabels =
      Array.isArray(entity?.labels) &&
      (entity.labels.includes('catchall') || entity.labels.includes('needs_review'));

    if (!isCatchall && !hasUnsortedLabels) return;

    console.log('[OverlayV2] Applying AI tag override for Mind Drop narrative item', {
      entityId: entity?.id,
      oldTags: state.tags,
      aiTags: sanitizedTagSuggestions.map((t) => t.name),
    });

    // Replace state.tags with AI tags (sanitized and normalized)
    const aiTagNames = sanitizedTagSuggestions.map((entry) => entry.name);
    dispatch({ type: 'SET_TAGS', tags: aiTagNames });

    // Mark tags as dirty so they get persisted on save
    // This is different from manual user edits - we DO want to save AI improvements
    setTagsDirty(true);

    // Mark as applied so we don't re-run
    aiTagOverrideAppliedRef.current = true;
  }, [
    mode,
    tagsDirty,
    isMindDrop,
    rawSentence,
    sanitizedTagSuggestions,
    initialEntity,
    state.tags,
    dispatch,
  ]);

  // Reset the override flag when the entity changes
  useEffect(() => {
    const entityId = (initialEntity as any)?.id;
    return () => {
      aiTagOverrideAppliedRef.current = false;
    };
  }, [(initialEntity as any)?.id]);

  const suggestionChips = useMemo((): TagsRowSuggestion[] => {
    if (filteredTagSuggestions.length === 0) return [];
    const entries: TagsRowSuggestion[] = [];
    filteredTagSuggestions.forEach((entry) => {
      const { canonical, slug } = toCanonicalParts(entry.name);
      if (!canonical || !slug) return;
      entries.push({
        canonical,
        slug,
        provenance: 'AI',
        lowConfidence: entry.lowConfidence,
      });
    });
    return entries;
  }, [filteredTagSuggestions]);

  const hasLowConfidenceSuggestions = useMemo(
    () => suggestionChips.some((tag) => !!tag.lowConfidence),
    [suggestionChips],
  );

  const stickyCanonicalMap = useMemo(() => {
    const map = new Map<string, string>();
    (state.stickyTags ?? []).forEach((entry) => {
      if (typeof entry !== 'string') return;
      const { canonical, slug } = toCanonicalParts(entry);
      if (!canonical || !slug) return;
      if (!map.has(slug)) {
        map.set(slug, canonical);
      }
    });
    return map;
  }, [state.stickyTags]);

  const suggestionCanonicalMap = useMemo(() => {
    const map = new Map<string, string>();
    suggestionChips.forEach((chip) => {
      if (!map.has(chip.slug)) {
        map.set(chip.slug, chip.canonical);
      }
    });
    return map;
  }, [suggestionChips]);

  const activeTagChips = useMemo((): TagsRowTag[] => {
    if (!Array.isArray(state.tags)) return [];
    const entries: TagsRowTag[] = [];
    state.tags.forEach((slug) => {
      const canonicalCandidate =
        stickyCanonicalMap.get(slug) ??
        suggestionCanonicalMap.get(slug) ??
        toCanonicalParts(slug).canonical;
      if (!canonicalCandidate) return;
      const provenance = stickyCanonicalMap.has(slug)
        ? 'You'
        : suggestionCanonicalMap.has(slug)
          ? 'AI'
          : undefined;
      entries.push({
        canonical: canonicalCandidate,
        slug,
        provenance,
      });
    });
    return entries;
  }, [state.tags, stickyCanonicalMap, suggestionCanonicalMap]);

  const handleTagToggle = useCallback(
    (tag: string) => {
      const normalized = normalizeToTagKey(tag);
      if (!normalized) return;

      const stickySnapshot = Array.isArray(state.stickyTags) ? [...state.stickyTags] : [];
      const tombstoneSnapshot = Array.isArray(state.tagTombstones) ? [...state.tagTombstones] : [];

      pushUndoEntry('tag', {
        tags: [...state.tags],
        list: state.list,
        mood: state.mood,
        stickyTags: stickySnapshot,
        tagTombstones: tombstoneSnapshot,
      });

      const isActive = state.tags.includes(normalized);
      const metaSource = tag;

      if (isActive) {
        const nextTags = state.tags.filter((t) => t !== normalized);
        const nextSticky = removeMetaTag(stickySnapshot, metaSource);
        const nextTombstones = addMetaTag(tombstoneSnapshot, metaSource);
        dispatch({ type: 'SET_TAGS', tags: nextTags });
        dispatch({
          type: 'HYDRATE_EDIT',
          payload: { stickyTags: nextSticky, tagTombstones: nextTombstones },
        } as any);
        setTagsDirty(true); // Mark tags as user-modified
        return;
      }

      const nextTags = [...state.tags, normalized];
      const nextSticky = stickySnapshot;
      const nextTombstones = removeMetaTag(tombstoneSnapshot, metaSource);
      dispatch({ type: 'SET_TAGS', tags: nextTags });
      dispatch({
        type: 'HYDRATE_EDIT',
        payload: { stickyTags: nextSticky, tagTombstones: nextTombstones },
      } as any);
      setTagsDirty(true); // Mark tags as user-modified
    },
    [dispatch, state.list, state.mood, state.tags, state.stickyTags, state.tagTombstones],
  );

  const handleTagAdd = useCallback(
    (raw: string) => {
      const { tag: canonical } = normalizeTag(typeof raw === 'string' ? raw : '');
      if (!canonical) return;
      const normalized = normalizeToTagKey(canonical);
      if (!normalized) return;

      const stickySnapshot = Array.isArray(state.stickyTags) ? [...state.stickyTags] : [];
      const tombstoneSnapshot = Array.isArray(state.tagTombstones) ? [...state.tagTombstones] : [];

      pushUndoEntry('tag', {
        tags: [...state.tags],
        list: state.list,
        mood: state.mood,
        stickyTags: stickySnapshot,
        tagTombstones: tombstoneSnapshot,
      });

      const exists = state.tags.includes(normalized);
      const nextTags = exists ? [...state.tags] : [...state.tags, normalized];
      const nextSticky = addMetaTag(stickySnapshot, canonical);
      const nextTombstones = removeMetaTag(tombstoneSnapshot, canonical);

      dispatch({ type: 'SET_TAGS', tags: nextTags });
      dispatch({
        type: 'HYDRATE_EDIT',
        payload: { stickyTags: nextSticky, tagTombstones: nextTombstones },
      } as any);

      setSuggestedTags((prev) =>
        prev.filter((entry) => normalizeToTagKey(entry.name) !== normalized),
      );

      setTagsDirty(true); // Mark tags as user-modified
    },
    [
      dispatch,
      state.list,
      state.mood,
      state.tags,
      state.stickyTags,
      state.tagTombstones,
      setSuggestedTags,
    ],
  );

  const handleTelemetryTagAdd = useCallback((canonical: string) => {
    if (!canonical) return;
    void emitOverlayEvent({ type: 'overlay_tag_user_add', label: canonical });
  }, []);

  const handleTelemetryTagRemove = useCallback((canonical: string, wasAi: boolean) => {
    if (!canonical) return;
    void emitOverlayEvent({ type: 'overlay_tag_user_remove', label: canonical, wasAi });
  }, []);

  const handleResuggestTags = useCallback(async () => {
    if (!refreshPrefill || isResuggestingTags) return;
    const requestId = resuggestRequestIdRef.current + 1;
    resuggestRequestIdRef.current = requestId;
    setIsResuggestingTags(true);
    void emitOverlayEvent({ type: 'overlay_tags_resuggest' });
    try {
      await refreshPrefill();
      const compute = (source: PrefillSuggestedTag[] | null | undefined) =>
        normalizePrefillSuggestions(currentText, source, tagTombstoneSet);

      let normalized = compute(prefillSuggestionsRef.current);
      if (normalized.length === 0 && prefillSuggestedTags?.length) {
        normalized = compute(prefillSuggestedTags);
      }
      if (normalized.length === 0) return;

      setSuggestedTags((prev) => {
        const next = mergeSuggestionEntries(prev, normalized);
        if (areSuggestionListsEqual(prev, next)) {
          return prev;
        }
        resuggestAppliedIdRef.current = requestId;
        return next;
      });
    } catch (err) {
      if (__DEV__) console.error('[UnifiedOverlayV2] re-suggest tags failed', err);
    } finally {
      setIsResuggestingTags(false);
    }
  }, [refreshPrefill, isResuggestingTags, currentText, tagTombstoneSet, prefillSuggestedTags]);

  const handleResummarizeTitle = useCallback(async () => {
    if (!refreshPrefill || isResummarizingTitle) return;
    setIsResummarizingTitle(true);
    setPendingTitleResummarize(true);
    void emitOverlayEvent({ type: 'overlay_title_resummarize' });
    console.log('[OverlayV2] handleResummarizeTitle', { mode });
    try {
      await refreshPrefill();
      // Do not read suggestedTitle here; it may not have updated yet.
    } catch (err) {
      if (__DEV__) console.error('[UnifiedOverlayV2] re-summarize title failed', err);
      setPendingTitleResummarize(false);
    } finally {
      setIsResummarizingTitle(false);
    }
  }, [refreshPrefill, isResummarizingTitle, mode]);

  // Apply the resummarized title when it becomes available
  useEffect(() => {
    if (!pendingTitleResummarize) return;
    if (!suggestedTitle || !suggestedTitle.trim().length) return;

    console.log('[OverlayV2] applyResummarizedTitle', {
      mode,
      suggestedTitle,
    });

    const nextTitle = suggestedTitle.trim();

    // Update the main title used when saving (force=true to bypass userEditedTitle guard)
    // This ensures AI title updates state.todo.title even if user has typed text
    dispatch({ type: 'SET_TITLE', title: nextTitle, force: true });

    // ALSO update the compactTitle used as overlaySubtitle in the header
    dispatch({ type: 'SET_COMPACT_TITLE', title: nextTitle });

    prevTitleRef.current = nextTitle;

    // In edit mode, persist the AI title to the backend once so Recent Drops and future opens see it.
    if (
      mode === 'edit' &&
      !aiTitlePersistedRef.current &&
      (initialEntity as any)?.id &&
      baseType === 'todo'
    ) {
      aiTitlePersistedRef.current = true;
      const id = (initialEntity as any).id;
      // Fire-and-forget; don't block the UI.
      (async () => {
        try {
          await repo.update({
            id,
            patch: {
              type: 'todo',
              // UnifiedOverlayV2 uses name as the canonical title for todos
              name: nextTitle,
              title: nextTitle,
            } as any,
          });
        } catch (err) {
          if (__DEV__) {
            console.warn('[UnifiedOverlayV2] failed to persist AI title', err);
          }
          // Allow a retry on next open
          aiTitlePersistedRef.current = false;
        }
      })();
    }

    // In edit mode, also refresh suggested tags from the AI prefill
    if (mode === 'edit') {
      const normalized = normalizePrefillSuggestions(
        currentText,
        prefillSuggestedTags,
        tagTombstoneSet,
      );

      if (normalized.length > 0) {
        setSuggestedTags((prev) => {
          const next = mergeSuggestionEntries(prev, normalized);
          if (areSuggestionListsEqual(prev, next)) {
            return prev;
          }
          return next;
        });
      }
    }

    setPendingTitleResummarize(false);
  }, [
    pendingTitleResummarize,
    suggestedTitle,
    mode,
    dispatch,
    currentText,
    prefillSuggestedTags,
    tagTombstoneSet,
    initialEntity,
    baseType,
    repo,
  ]);

  const showDueToast = useCallback((message: string) => {
    setDueToastMessage(message);
    if (dueToastTimerRef.current) {
      clearTimeout(dueToastTimerRef.current as any);
    }
    dueToastTimerRef.current = setTimeout(() => {
      setDueToastMessage(null);
      dueToastTimerRef.current = null;
    }, 1000) as unknown as number;
  }, []);

  const handleTodoDueChange = useCallback(
    (iso: string | null, options?: { label?: string }) => {
      dispatch({ type: 'SET_TODO_DUE', due_at: iso });
      if (iso) {
        const formatted = options?.label ?? (safeFormat(iso) || 'selected date');
        showDueToast(`Due set for ${formatted}`);
        void emitOverlayEvent({ type: 'overlay_due_set' });
      } else {
        showDueToast('Due cleared');
        void emitOverlayEvent({ type: 'overlay_due_clear' });
      }
    },
    [dispatch, showDueToast],
  );

  useEffect(() => {
    if (mode === 'create') return;
    const requestId = resuggestRequestIdRef.current;
    if (!requestId) return;
    if (resuggestAppliedIdRef.current >= requestId) return;

    const normalized = normalizePrefillSuggestions(
      currentText,
      prefillSuggestedTags,
      tagTombstoneSet,
    );
    if (normalized.length === 0) return;

    setSuggestedTags((prev) => {
      const next = mergeSuggestionEntries(prev, normalized);
      if (areSuggestionListsEqual(prev, next)) {
        return prev;
      }
      resuggestAppliedIdRef.current = requestId;
      return next;
    });
  }, [mode, currentText, prefillSuggestedTags, tagTombstoneSet]);

  // theme / background for overlay (phase‑8 visual polish)
  const colorMode = useColorScheme();
  const sheetBackground =
    colorMode === 'dark' ? darkTokens.colors.linen : lightTokens.colors.linenCream;
  const sheetBorderColor = colorMode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const handleColor = colorMode === 'dark' ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.16)';
  const typeTabActiveColor =
    colorMode === 'dark' ? darkTokens.colors.charcoal : lightTokens.colors.charcoal;
  const typeTabInactiveColor =
    colorMode === 'dark' ? 'rgba(248,250,249,0.65)' : 'rgba(34,34,34,0.55)';
  const typeTabUnderlineColor =
    colorMode === 'dark' ? darkTokens.colors.moss : lightTokens.colors.moss;
  const headerPulseColor =
    colorMode === 'dark' ? 'rgba(94, 160, 138, 0.35)' : 'rgba(46, 125, 106, 0.18)';
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const overlaySubtitle = state.compactTitle?.trim() ?? '';

  const canSave = currentText.trim().length > 0 && !isSaving;

  function toCreateOrUpdateInput(
    baseType: BaseType,
    s: typeof initialV2State,
    spaceId: string | null,
  ) {
    const textForTags =
      baseType === 'log' ? s.log.body : baseType === 'todo' ? s.todo.details : s.habit.notes;
    const normalizeMetaValues = (values: string[] | undefined | null): string[] => {
      if (!Array.isArray(values)) return [];
      const normalized = values
        .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
        .filter(Boolean);
      return Array.from(new Set(normalized));
    };
    const normalizedStickyMeta = normalizeMetaValues(s.stickyTags);
    const normalizedTombstonesMeta = normalizeMetaValues(s.tagTombstones);

    const manualStickyKeys = normalizedStickyMeta
      .map((value) => {
        if (!value) return null;
        if (value.startsWith('#') || value.startsWith('@') || value.startsWith('*')) {
          const stripped = value.replace(/^[#@*]+/, '');
          return stripped || null;
        }
        return value;
      })
      .filter((value): value is string => !!value);

    const sanitized = sanitizeSuggestedTags(textForTags ?? '', Array.isArray(s.tags) ? s.tags : []);
    const combined = new Map<string, string>();
    sanitized.forEach((tag) => {
      const key = tag.toLowerCase();
      if (!combined.has(key)) combined.set(key, tag);
    });
    manualStickyKeys.forEach((tag) => {
      const key = tag.toLowerCase();
      if (!combined.has(key)) combined.set(key, tag);
    });

    const combinedTags = Array.from(combined.values());
    const tags = stripJournalTags(combinedTags, baseType === 'log');
    const tagsMeta = {
      sticky: normalizedStickyMeta,
      tombstones: normalizedTombstonesMeta,
    };

    // Conditionally include tags/tags_meta:
    // - Create mode: always include (mode !== 'edit')
    // - Edit mode: only include if user modified tags (tagsDirty === true)
    // This preserves Mind Drop AI-generated tags when user only edits title/due date
    const shouldIncludeTags = mode !== 'edit' || tagsDirty;
    const tagsPayload = shouldIncludeTags ? { tags, tags_meta: tagsMeta } : {};

    if (baseType === 'todo') {
      // For todos: title and details are strictly separate
      // - title should be the explicitly set short label (or empty)
      // - details is the long text field
      // Do NOT derive title from details (no firstLine fallback)
      const todoTitle = s.todo.title || '';
      const dueAt = coerceIsoTimestamp(s.todo.due_at) ?? coerceIsoTimestamp(s.reminderAt);
      return {
        type: 'todo' as const,
        title: todoTitle,
        name: todoTitle,
        details: s.todo.details || null,
        due_at: dueAt,
        space_id: s.spaceId ?? spaceId ?? null,
        origin: 'catchall' as const,
        ...tagsPayload, // Conditionally include tags/tags_meta
        // Commitment fields (only for todos/habits)
        ...{
          commitment: s.commitment,
          commitment_note: s.commitment ? s.commitmentNote || null : null,
          commitment_started_at: s.commitment ? coerceIsoTimestamp(s.commitmentStartedAt) : null,
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
        ...tagsPayload, // Conditionally include tags/tags_meta
        // Commitment fields (only for todos/habits)
        ...{
          commitment: s.commitment,
          commitment_note: s.commitment ? s.commitmentNote || null : null,
          commitment_started_at: s.commitment ? coerceIsoTimestamp(s.commitmentStartedAt) : null,
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
      ...tagsPayload, // Conditionally include tags/tags_meta
    } as any;

    // mood (Journal)
    const moodPatch = s.tags.includes('journal') ? { mood: s.mood ?? 'neu' } : { mood: null };

    // fmt: list tag overrides explicit format
    let fmtVal: any = null;
    if (s.tags.includes('list')) fmtVal = 'checkboxes';
    else if (s.format) fmtVal = s.format; // 'plain' | 'checkboxes' | 'bullet'

    const fmtPatch = fmtVal ? { fmt: fmtVal } : {};

    const reminderIso = coerceIsoTimestamp(s.reminderAt);
    const datePatch = reminderIso ? { date: reminderIso } : {};

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

      // Development logging for todo saves
      if (__DEV__ && baseType === 'todo') {
        console.log('[UnifiedOverlayV2.onSave] Todo state before save', {
          'state.todo.title': state.todo.title,
          'state.todo.details': state.todo.details,
          'state.compactTitle': state.compactTitle,
        });
        console.log('[UnifiedOverlayV2.onSave] Todo input payload', {
          title: (input as any).title,
          name: (input as any).name,
          details: (input as any).details,
        });
      }

      const telemetryTitle =
        typeof (input as any)?.title === 'string'
          ? ((input as any).title as string)
          : typeof (input as any)?.name === 'string'
            ? ((input as any).name as string)
            : state.compactTitle || '';
      const telemetryTagCount = Array.isArray((input as any)?.tags)
        ? (input as any).tags.length
        : state.tags.length;
      const telemetryDueAt = baseType === 'todo' ? ((input as any)?.due_at ?? null) : null;
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

      // Fire a subtle header pulse and toast success without blocking the close flow
      if (!reduceMotion) {
        try {
          // fire a success haptic (non-blocking)
          Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType?.Success);
        } catch (err) {
          // ignore
        }
        try {
          headerPulse.value = conditionalAnimation(
            withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 220 })),
            0,
            reduceMotion,
          );
        } catch (err) {
          // ignore mocked reanimated environments
        }
      }

      setShowSaveToast(true);
      if (saveToastTimerRef.current) {
        clearTimeout(saveToastTimerRef.current as any);
      }
      saveToastTimerRef.current = setTimeout(() => {
        setShowSaveToast(false);
        saveToastTimerRef.current = null;
      }, 1500) as unknown as number;

      void emitOverlayEvent({
        type: 'overlay_save',
        entryType: baseType,
        titleLen: telemetryTitle.length,
        tagCount: telemetryTagCount,
        dueAt: telemetryDueAt ?? null,
      });

      // Emit overlay saved analytics and call parent onSaved if supplied
      try {
        const savedType = (result as any)?.type ?? baseType;
        eventBus.emit('OverlaySaved', { id: result?.id, type: savedType });
      } catch (e) {
        // ignore
      }
      try {
        // Notify parent (OverlayHost) so it can run its saved hooks
        onSaved?.({
          id: result?.id,
          type: (result as any)?.type ?? baseType,
          savedEntity: result,
        } as any);
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
    reduceMotion,
    headerPulse,
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
        }}
      >
        {/* Bottom-anchored sheet: max 80% of viewport, rounded top corners */}
        <RNAnimated.View
          style={{
            width: '100%',
            opacity: sheetOpacity,
            transform: [{ translateY: sheetTranslateY }],
          }}
        >
          <View
            style={{
              width: '100%',
              alignSelf: 'stretch',
              height: SHEET_H,
              borderTopLeftRadius: tokenRadius.md,
              borderTopRightRadius: tokenRadius.md,
              overflow: 'hidden',
              backgroundColor: sheetBackground,
              borderTopWidth: 1,
              borderColor: 'rgba(34,34,34,0.08)',
              shadowColor: '#000',
              shadowOpacity: 0.16,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: -6 },
              elevation: 14,
            }}
          >
            {showSaveToast ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: tokenSpacing.sm,
                  right: tokenSpacing.base,
                  backgroundColor:
                    colorMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(46, 125, 106, 0.12)',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 12,
                  zIndex: 2,
                }}
              >
                <Text
                  style={{
                    color: typeTabUnderlineColor,
                    fontWeight: '600',
                    fontSize: lightTokens.typography.size.sm,
                  }}
                >
                  Saved
                </Text>
              </View>
            ) : null}
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
              <View style={{ position: 'relative' }}>
                <Reanimated.View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFillObject,
                    { backgroundColor: headerPulseColor, borderRadius: 12 },
                    headerPulseStyle,
                  ]}
                />
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <Text
                    variant="title"
                    style={{ color: lightTokens.colors.text, fontWeight: '600', flex: 1 }}
                    numberOfLines={1}
                  >
                    {headerFor(baseType, mode)}
                  </Text>
                  <Pressable
                    onPress={handleResummarizeTitle}
                    disabled={isResummarizingTitle}
                    accessibilityRole="button"
                    accessibilityLabel="Re-summarize title"
                    testID="resummarize-title-action"
                    style={({ pressed }) => [
                      {
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor:
                          pressed && !isResummarizingTitle ? 'rgba(0,0,0,0.06)' : 'transparent',
                      },
                      isResummarizingTitle ? { opacity: 0.65 } : null,
                    ]}
                  >
                    {isResummarizingTitle ? (
                      <ActivityIndicator
                        size="small"
                        color={typeTabUnderlineColor}
                        style={{ marginRight: 6 }}
                      />
                    ) : null}
                    <Text
                      style={{
                        color: typeTabUnderlineColor,
                        fontSize: lightTokens.typography.size.xs,
                        fontWeight: '600',
                      }}
                    >
                      Re-summarize title
                    </Text>
                  </Pressable>
                </View>
                {overlaySubtitle ? (
                  <Text
                    testID="overlay-compact-title"
                    numberOfLines={1}
                    style={{
                      marginTop: 4,
                      color: colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(34,34,34,0.65)',
                      fontSize: lightTokens.typography.size.sm,
                      fontWeight: '500',
                    }}
                  >
                    {overlaySubtitle}
                  </Text>
                ) : null}
              </View>
            </Box>

            {/* Body: entire form stack in a single scroll context */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, paddingTop: 16 }}
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
                  tags={activeTagChips}
                  suggested={suggestionChips}
                  onToggle={handleTagToggle}
                  onResuggest={handleResuggestTags}
                  resuggesting={isResuggestingTags}
                  onAdd={handleTagAdd}
                  onUserAdd={handleTelemetryTagAdd}
                  onUserRemove={handleTelemetryTagRemove}
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
                          colorMode === 'dark' ? darkTokens.colors.deep : lightTokens.colors.linen,
                        borderColor: bodyFocused
                          ? '#E0C47A'
                          : lightTokens.colors.sageMist || lightTokens.colors.sage,
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
                        state.todo.due_at ? `Due: ${safeFormat(state.todo.due_at)}` : 'Add due date'
                      }
                    />
                    {dueToastMessage ? (
                      <View
                        style={{
                          marginLeft: tokenSpacing.sm,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                          backgroundColor:
                            colorMode === 'dark'
                              ? 'rgba(255,255,255,0.08)'
                              : 'rgba(46,125,106,0.12)',
                        }}
                        pointerEvents="none"
                      >
                        <Text
                          style={{
                            color: typeTabUnderlineColor,
                            fontSize: lightTokens.typography.size.xs,
                            fontWeight: '600',
                          }}
                        >
                          {dueToastMessage}
                        </Text>
                      </View>
                    ) : null}
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
                                      spaces.find((s) => s.id === state.spaceId)?.name ?? 'Space',
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
                                title={state.commitment ? 'Committed' : 'Make this a commitment'}
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
                                          ? '#E0C47A'
                                          : lightTokens.colors.sageMist || lightTokens.colors.sage,
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
                            dispatch({ type: 'TOGGLE_LIST_ITEM', id: it.id, checked: !it.checked })
                          }
                          title={it.checked ? '✓' : '○'}
                        />
                        <Text>{it.text}</Text>
                      </Box>
                    ))}
                  </Box>
                ) : null}

                {/* Mentions / Dates chips (inline suggestions) */}
                <Box mt={3} row gap={2} style={{ flexWrap: 'wrap', marginTop: tokenSpacing.md }}>
                  {(state.detected?.mentions || []).map((m) => (
                    <Chip key={m} label={`@${m}`} />
                  ))}
                  {(state.detected?.dates || []).map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        if (d === '__token:today') {
                          handleTodoDueChange(new Date().toISOString(), { label: 'Today' });
                        } else if (d === '__token:tomorrow') {
                          handleTodoDueChange(addDays(new Date(), 1).toISOString(), {
                            label: 'Tomorrow',
                          });
                        } else {
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
                          else handleTodoDueChange(iso, { label: 'Today' });
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
                          else handleTodoDueChange(iso, { label: 'Tomorrow' });
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
                          else handleTodoDueChange(null);
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
                            ? '#E0C47A'
                            : lightTokens.colors.sageMist || lightTokens.colors.sage,
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
                            else
                              handleTodoDueChange(iso, {
                                label: safeFormat(iso) || customDate || 'selected date',
                              });
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
                <Button variant="ghost" onPress={handleCancel} disabled={isSaving} title="Cancel" />
                <Box flex={1} />
                <Reanimated.View style={saveStyle}>
                  <Button
                    onPress={onSave}
                    disabled={!canSave}
                    title={isSaving ? 'Saving...' : 'Save'}
                  />
                </Reanimated.View>
              </Box>
            </SafeAreaView>
            <ToastUndo
              visible={showUndoToast}
              onUndo={handleUndo}
              onHide={() => setShowUndoToast(false)}
              message="Change saved"
            />
          </View>
        </RNAnimated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

export function buildDraftPayloadFromEntity(entity: any): Partial<V2State> {
  if (!entity) return {};

  const type = (entity as any)?.type;
  const baseType: BaseType = type === 'todo' ? 'todo' : type === 'habit' ? 'habit' : 'log';

  // Use standardized helper to get raw Mind Drop text
  const mindDropRawText = getMindDropRawText(entity);

  // === Habit-specific long text and title computation ===
  if (type === 'habit') {
    // Long text for habits: prefer Mind Drop raw text, then notes, then body, then name
    const habitLongText =
      mindDropRawText ??
      (entity as any)?.notes ??
      (entity as any)?.body ??
      (entity as any)?.name ??
      '';

    // Short title for habits: prefer name, then title, then first line of long text
    const compactTitle =
      (entity as any)?.name ?? (entity as any)?.title ?? firstLine(habitLongText) ?? '';

    // Normalize tags from entity
    const extractedTags = extractTagKeysFromEntity(entity);

    const normalizeMetaValues = (values: unknown): string[] => {
      if (!Array.isArray(values)) return [];
      const normalized = values
        .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
        .filter(Boolean);
      return Array.from(new Set(normalized));
    };

    const tagsMeta = (entity as any)?.tags_meta ?? {};

    return {
      baseType: 'habit',
      compactTitle,
      // Hydrate all type-specific states for symmetry (in case user switches types)
      habit: {
        title: compactTitle,
        notes: habitLongText,
        schedule: 'custom',
      },
      todo: {
        title: compactTitle,
        details: habitLongText,
        due_at: null,
      },
      log: {
        title: compactTitle,
        body: habitLongText,
      },
      tags: extractedTags,
      stickyTags: normalizeMetaValues(tagsMeta?.sticky),
      tagTombstones: normalizeMetaValues(tagsMeta?.tombstones),
    };
  }

  // === Todo/Log handling ===
  // Use Mind Drop raw text if available, otherwise fall back to standard fields
  const rawDetails =
    mindDropRawText ??
    (entity as any)?.details ??
    (entity as any)?.body ??
    (entity as any)?.notes ??
    '';
  const title = (entity as any)?.title ?? '';
  const name = (entity as any)?.name ?? '';

  // For todos: handle Mind Drop items
  // - Use Mind Drop raw text as the long text source (body/details mapping)
  // - If no Mind Drop text, fall back to name/title (backwards compatibility)
  // - title remains as the short label (possibly AI-generated)
  const todoDetails = rawDetails || name || title || '';

  // For notes/logs: handle Mind Drop items
  // - Use Mind Drop raw text as the long text source (body mapping)
  // - title remains as the short label (possibly AI-generated)
  const logBody = rawDetails || title || '';

  const payload: Partial<V2State> = {
    baseType,
    log: {
      title,
      body: logBody,
    },
    todo: {
      title,
      details: todoDetails,
      due_at: (entity as any)?.due_at ?? (entity as any)?.due_date ?? null,
    },
    habit: {
      title,
      notes: rawDetails || '',
      schedule: 'custom',
    },
  };

  const normalizeMetaValues = (values: unknown): string[] => {
    if (!Array.isArray(values)) return [];
    const normalized = values
      .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
      .filter(Boolean);
    return Array.from(new Set(normalized));
  };

  const tagsMeta = (entity as any)?.tags_meta ?? {};
  (payload as any).stickyTags = normalizeMetaValues(tagsMeta?.sticky);
  (payload as any).tagTombstones = normalizeMetaValues(tagsMeta?.tombstones);

  return payload;
}

function headerFor(base: BaseType, mode: 'create' | 'edit') {
  if (mode === 'edit') return 'Edit';
  return base === 'log' ? 'New Log' : base === 'todo' ? 'New To-Do' : 'New Habit';
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
