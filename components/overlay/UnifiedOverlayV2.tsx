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
import type { UnifiedCreateOverlayProps } from './UnifiedCreateOverlay';
import { v2Reducer, initialV2State, firstLine, type BaseType } from './overlayV2.state';
import { useOverlayV2Draft, readOverlayV2Draft, clearOverlayV2Draft } from './useOverlayV2Draft';

const BASE_LABEL: Record<BaseType, string> = { log: 'Log', todo: 'To-Do', habit: 'Habit' };

export function UnifiedOverlayV2(props: UnifiedCreateOverlayProps) {
  const { visible, onClose, mode = 'create', initialEntity, initialSpaceId } = props;

  const repo = useRepo();
  const [state, dispatch] = useReducer(v2Reducer, initialV2State);
  const baseType = state.baseType;
  const [isSaving, setIsSaving] = useState(false);
  const [showDueModal, setShowDueModal] = useState(false);
  const [customDate, setCustomDate] = useState('');

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
        due_at: s.todo.due_at ?? null,
        space_id: spaceId,
        origin: 'catchall' as const,
      };
    }
    if (baseType === 'habit') {
      return {
        type: 'habit' as const,
        title: s.habit.title || firstLine(s.habit.notes) || 'Untitled',
        notes: s.habit.notes || null,
        frequency: s.habit.schedule ?? 'custom',
        space_id: spaceId,
        origin: 'catchall' as const,
      };
    }
    // base note payload
    const base = {
      type: 'note' as const,
      subtype: 'catchall' as const,
      title: s.log.title || firstLine(s.log.body) || 'Untitled note',
      body: s.log.body,
      space_id: spaceId,
      origin: 'catchall' as const,
    };

    // mood (Journal) and fmt (List) patches
    const moodPatch = s.tags?.journal ? { mood: s.mood ?? 'neu' } : {};
    const fmtPatch = s.tags?.list ? { fmt: 'checkboxes' as const } : {};

    return { ...base, ...moodPatch, ...fmtPatch };
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
                    onPress={() => setShowDueModal(true)}
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
                        // fallback: open custom date modal prefilled
                        setCustomDate(d.replace(/^\D+/g, ''));
                        setShowDueModal(true);
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

          <Modal visible={showDueModal} transparent animationType="fade">
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
                        dispatch({ type: 'SET_TODO_DUE', due_at: iso });
                        setShowDueModal(false);
                      }}
                      title="Today"
                    />
                    <Button
                      variant="ghost"
                      onPress={() => {
                        const iso = addDays(new Date(), 1).toISOString();
                        dispatch({ type: 'SET_TODO_DUE', due_at: iso });
                        setShowDueModal(false);
                      }}
                      title="Tomorrow"
                    />
                    <Button
                      variant="ghost"
                      onPress={() => {
                        dispatch({ type: 'SET_TODO_DUE', due_at: null });
                        setShowDueModal(false);
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
                    <Button variant="ghost" onPress={() => setShowDueModal(false)} title="Cancel" />
                    <Box flex={1} />
                    <Button
                      onPress={() => {
                        try {
                          if (customDate.trim().length === 0) return;
                          const parsed = new Date(`${customDate}T00:00:00`);
                          if (isNaN(parsed.getTime())) return;
                          dispatch({ type: 'SET_TODO_DUE', due_at: parsed.toISOString() });
                          setCustomDate('');
                          setShowDueModal(false);
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
  chip: {
    minHeight: 36,
    paddingHorizontal: tokenSpacing.md,
    paddingVertical: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
    justifyContent: 'center',
  },
  chipSmall: {
    minHeight: 36,
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
    minHeight: 36,
  },
});
