/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useCallback, useReducer, useState, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  StyleSheet,
  Animated,
} from 'react-native';
import { Box, Text, Button } from '../../ui';
import { Modal } from 'react-native';
import { format, parseISO, addDays } from 'date-fns';
import {
  lightTokens,
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
import { v2Reducer, initialV2State, firstLine, type BaseType } from './overlayV2.state';
import { toCreateOrUpdateInput, linkSelectedPerson } from './overlayV2.mapping';
import { useOverlayV2Draft, readOverlayV2Draft, clearOverlayV2Draft } from './useOverlayV2Draft';

const BASE_LABEL: Record<BaseType, string> = { log: 'Log', todo: 'To-Do', habit: 'Habit' };

export function UnifiedOverlayV2(props: UnifiedCreateOverlayProps) {
  const { visible, onClose, mode = 'create', initialEntity, initialSpaceId } = props;

  const repo = useRepo();
  const [state, dispatch] = useReducer(v2Reducer, initialV2State);
  const baseType = state.baseType;
  const [isSaving, setIsSaving] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateModalTarget, setDateModalTarget] = useState<'todo' | 'reminder' | null>(null);
  const [customDate, setCustomDate] = useState('');
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

  // cross-fade anim for smooth type switching (best-effort caret preservation)
  const fade = useRef(new Animated.Value(1)).current;
  const firstMount = useRef(true);
  useEffect(() => {
    if (firstMount.current) {
      firstMount.current = false;
      return;
    }
    // short cross-fade when switching base type
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 60, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [baseType, fade]);

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

  function safeFormat(iso: string | null | undefined) {
    try {
      if (!iso) return '';
      return format(parseISO(iso), 'MMM d');
    } catch (e) {
      return '';
    }
  }

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

  const canSave = currentText.trim().length > 0 && !isSaving;

  function toCreateOrUpdateInput(
    baseType: BaseType,
    s: typeof initialV2State,
    spaceId: string | null,
  ) {
    if (baseType === 'todo') {
      return {
        type: 'todo' as const,
        title: s.todo.title || firstLine(s.todo.details) || 'Untitled',
        details: s.todo.details || null,
        due_at: s.todo.due_at ?? s.reminderAt ?? null,
        space_id: s.spaceId ?? spaceId ?? null,
        origin: 'catchall' as const,
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
    } as any;

    // mood (Journal)
    const moodPatch = s.tags?.journal ? { mood: s.mood ?? 'neu' } : { mood: null };

    // fmt: list tag overrides explicit format
    let fmtVal: any = null;
    if (s.tags?.list) fmtVal = 'checkboxes';
    else if (s.format) fmtVal = s.format; // 'plain' | 'checkboxes' | 'bullet'

    const fmtPatch = fmtVal ? { fmt: fmtVal } : {};

    const datePatch = s.reminderAt ? { date: s.reminderAt } : {};

    return { ...base, ...moodPatch, ...fmtPatch, ...datePatch };
  }

  const onSave = useCallback(async () => {
    if (!canSave) return;
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
      onClose?.();
    } catch (e) {
      console.error('[UnifiedOverlayV2] save failed', e);
      setIsSaving(false);
    }
  }, [canSave, baseType, state, initialSpaceId, mode, initialEntity, repo, draftKey, onClose]);

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
      <Animated.View style={{ flex: 1, opacity: fade }}>
        <Box flex={1} bg="bg" pt={6}>
          {/* Header: contextual title + base type pills */}
          <Box px={4} pb={3}>
            <Text variant="title">{headerFor(baseType, mode)}</Text>
            <Box mt={3} row gap={2}>
              {(['log', 'todo', 'habit'] as BaseType[]).map((t) => (
                <TypePill
                  key={t}
                  active={baseType === t}
                  onPress={() => dispatch({ type: 'SET_BASE_TYPE', to: t })}
                >
                  {BASE_LABEL[t]}
                </TypePill>
              ))}
            </Box>
            {/* Tag chips row under header */}
            <Box mt={2} row gap={2} px={0} style={{ marginTop: tokenSpacing.md }}>
              <TagChip
                label="Journal"
                active={!!state.tags?.journal}
                onPress={() => dispatch({ type: 'TOGGLE_TAG', tag: 'journal' })}
              />
              <TagChip
                label="List"
                active={!!state.tags?.list}
                onPress={() => dispatch({ type: 'TOGGLE_TAG', tag: 'list' })}
              />
            </Box>
          </Box>

          {/* Body: text input only (Level-1) */}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollPad}>
            <Box px={4}>
              <TextInput
                value={currentText}
                onChangeText={(t) => dispatch({ type: 'SET_TEXT', text: t })}
                placeholder="Drop your thought…"
                placeholderTextColor={lightTokens.colors.subtle}
                multiline
                autoFocus
                textAlignVertical="top"
                style={[styles.textArea, { color: lightTokens.colors.text }]}
              />
              {baseType === 'todo' ? (
                <Box row mt={3} style={{ alignItems: 'center' }}>
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
                </Box>
              ) : null}
              {/* Journal mood row */}
              {state.tags?.journal ? (
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
              {state.tags?.list && state.list ? (
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
                    style={[styles.textArea, { minHeight: 40, paddingVertical: 8 }]}
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
          {/* Expanded details panel (Phase-4) */}
          {state.expanded ? (
            <Box px={4} pb={2}>
              <Text variant="label">Details</Text>
              {/* People linker + reminder/todo due + space selector */}
              <Box mt={2}>
                {/* Thin picker for selecting an existing person (Phase-4) */}
                <PersonPicker
                  value={state.person ?? null}
                  onChange={(p) => dispatch({ type: 'SET_PERSON', person: p })}
                />

                <Box row mt={2} gap={2} style={{ alignItems: 'center' }}>
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
                  {baseType === 'todo' ? (
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
                  ) : null}
                </Box>

                <Box mt={2}>
                  {/* Space selector: load spaces when expanded */}
                  <ScopeSelector
                    selectedScope={
                      state.spaceId
                        ? {
                            type: 'space',
                            spaceId: state.spaceId,
                            label: spaces.find((s) => s.id === state.spaceId)?.name ?? 'Space',
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
          ) : null}

          {/* Toggle row for expanded "Add details" panel (Phase-4) */}
          <Box px={4} py={2} row style={{ alignItems: 'center' }}>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => dispatch({ type: 'TOGGLE_EXPANDED' })}
              title={state.expanded ? 'Hide details' : 'Add details'}
            />
            <Box flex={1} />
          </Box>

          {/* Save bar (fixed) */}
          <Box
            px={4}
            py={3}
            row
            gap={2}
            style={{
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: lightTokens.colors.border,
            }}
          >
            <Button variant="ghost" onPress={handleCancel} disabled={isSaving} title="Cancel" />
            <Box flex={1} />
            <Button onPress={onSave} disabled={!canSave} title={isSaving ? 'Saving...' : 'Save'} />
          </Box>
        </Box>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function headerFor(base: BaseType, mode: 'create' | 'edit') {
  if (mode === 'edit') return 'Edit';
  return base === 'log' ? 'New Log' : base === 'todo' ? 'New To-Do' : 'New Habit';
}

function TypePill({
  active,
  onPress,
  children,
}: {
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Box
      style={{
        paddingHorizontal: tokenSpacing.md,
        paddingVertical: tokenSpacing.sm,
        minHeight: 40,
        borderRadius: tokenRadius.sm,
      }}
    >
      <Button
        size="sm"
        variant={active ? 'primary' : 'neutral'}
        onPress={onPress}
        title={typeof children === 'string' ? children : undefined}
      />
    </Box>
  );
}

function TagChip({
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
    <Box style={styles.chip}>
      <Button
        size="sm"
        variant={active ? 'primary' : 'neutral'}
        onPress={_on}
        title={label}
        accessibilityLabel={`Tag ${label}`}
      />
    </Box>
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
  scrollPad: { paddingBottom: tokenSpacing['2xl'] },
  textArea: {
    minHeight: 120,
    maxHeight: 360,
    fontSize: lightTokens.typography.size.md,
    lineHeight: 22,
    paddingVertical: tokenSpacing.md,
    paddingHorizontal: tokenSpacing.base,
  },

  /* Details panel layout */
  detailsContainer: {
    paddingHorizontal: tokenSpacing.base,
    paddingVertical: tokenSpacing.sm,
    borderRadius: tokenRadius.sm,
    backgroundColor: lightTokens.colors.surface || '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: lightTokens.colors.border,
    // subtle elevation/shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
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
