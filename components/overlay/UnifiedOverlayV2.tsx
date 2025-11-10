/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, StyleSheet } from 'react-native';
import { Box, Text, Button } from '../../ui';
import { useRepo } from '../../providers/RepoProvider';
import type { UnifiedCreateOverlayProps } from './UnifiedCreateOverlay';
import type { CanonicalType } from '../../lib/types';
import { useOverlayV2Draft, readOverlayV2Draft, clearOverlayV2Draft } from './useOverlayV2Draft';

type BaseType = 'log' | 'todo' | 'habit';

const BASE_LABEL: Record<BaseType, string> = { log: 'Log', todo: 'To-Do', habit: 'Habit' };

export function UnifiedOverlayV2(props: UnifiedCreateOverlayProps) {
  const { visible, onClose, mode = 'create', initialEntity, initialSpaceId } = props;

  const repo = useRepo();
  const [baseType, setBaseType] = useState<BaseType>('log');
  const [text, setText] = useState('');
  const [title, setTitle] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const draftKey = useMemo(
    () => `overlayV2:draft:${mode}:${baseType}:${initialSpaceId ?? 'none'}`,
    [mode, baseType, initialSpaceId],
  );

  // load existing draft once
  useEffect(() => {
    let mounted = true;
    readOverlayV2Draft(draftKey).then((v) => {
      if (mounted && v && !text) setText(v);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // autosave on change
  useOverlayV2Draft(draftKey, text);

  // Initial defaults (match brief: text-first; first line becomes title)
  useEffect(() => {
    if (mode === 'edit' && initialEntity && 'type' in initialEntity) {
      const et = initialEntity.type;
      if (et === 'todo' || et === 'habit') setBaseType(et as BaseType);
      else setBaseType('log');
      // text/title prefill happens in Phase 2+ (parity), keeping Level-1 lean
    }
  }, [mode, initialEntity]);

  useEffect(() => {
    const firstLine = (text || '').split(/\r?\n/)[0] ?? '';
    setTitle(firstLine.trim().slice(0, 120));
  }, [text]);

  const canSave = text.trim().length > 0 && !isSaving;

  const onSave = useCallback(async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const input = buildCreateOrUpdateInput({
        mode,
        baseType,
        text,
        title,
        spaceId: initialSpaceId ?? null,
        initialEntity: initialEntity as any,
      });
      if (mode === 'edit' && (initialEntity as any)?.id) {
        await repo.update({ id: (initialEntity as any).id, patch: input as any });
      } else {
        await repo.create(input as any);
      }

      // clear local draft on success
      await clearOverlayV2Draft(draftKey);

      // NOTE: overlaySaved / analytics events are emitted by `OverlayHost` when the overlay
      // is closed (via the `onClose`/`onSaved` plumbing). Do NOT emit analytics or global
      // saved events from here — keep telemetry centralized in the Host.
      setIsSaving(false);
      onClose?.();
    } catch (e) {
      console.error('[UnifiedOverlayV2] save failed', e);
      setIsSaving(false);
      // brief: retry inline later; for now we keep content in place and leave draft intact
    }
  }, [canSave, mode, baseType, text, title, initialSpaceId, initialEntity, repo, onClose]);

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
      <Box flex={1} bg="bg" pt={6}>
        {/* Header: contextual title + base type pills */}
        <Box px={4} pb={3}>
          <Text variant="title">{headerFor(baseType, mode)}</Text>
          <Box mt={3} row gap={2}>
            {(['log', 'todo', 'habit'] as BaseType[]).map((t) => (
              <TypePill key={t} active={baseType === t} onPress={() => setBaseType(t)}>
                {BASE_LABEL[t]}
              </TypePill>
            ))}
          </Box>
        </Box>

        {/* Body: text input only (Level-1) */}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollPad}>
          <Box px={4}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Drop your thought…"
              placeholderTextColor={'#888'}
              multiline
              autoFocus
              textAlignVertical="top"
              style={styles.textArea}
            />
            {/* Tag row hidden at Level-1; lands in Phase 3 */}
          </Box>
        </ScrollView>

        {/* Save bar (fixed) */}
        <Box
          px={4}
          py={3}
          row
          gap={2}
          style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E7E2D9' }}
        >
          <Button variant="ghost" onPress={handleCancel} disabled={isSaving} title="Cancel" />
          <Box flex={1} />
          <Button onPress={onSave} disabled={!canSave} title={isSaving ? 'Saving...' : 'Save'} />
        </Box>
      </Box>
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
    <Button
      size="sm"
      variant={active ? 'primary' : 'neutral'}
      onPress={onPress}
      title={typeof children === 'string' ? children : undefined}
    />
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
  scrollPad: { paddingBottom: 64 },
  textArea: {
    minHeight: 120,
    maxHeight: 360,
    fontSize: 16,
    lineHeight: 22,
  },
});
