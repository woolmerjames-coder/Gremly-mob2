/**
 * StepSweep - Step 2 of the Morning Brief flow
 *
 * Handles rolled-over and unscheduled items via 3-position toggle.
 * Reuses MiniSweepItemRow and MiniSweepToggle — does NOT reuse
 * MiniSweepGate (its full-screen layout conflicts with the stepper).
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { Clock, ChevronLeft } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { getDateService } from '../../../lib/date';
import { useMiniSweepCalendarContext } from '../../../lib/store/capacitySelectors';
import { MiniSweepItemRow } from './MiniSweepItemRow';
import type { MiniSweepPosition } from './MiniSweepToggle';
import type { Todo } from '../../../lib/types';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface StepSweepProps {
  rolledOverTodos: Todo[];
  unscheduledTodos: Todo[];
  onContinue: () => void;
  onSkip: () => void;
  onBack?: () => void;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function StepSweep({
  rolledOverTodos,
  unscheduledTodos,
  onContinue,
  onSkip,
  onBack,
}: StepSweepProps) {
  // Calendar-aware Gremly message
  const { gremlyMessage } = useMiniSweepCalendarContext();

  // Zustand actions
  const updateTodo = useGremlyStore((s) => s.updateTodo);
  const archiveTodo = useGremlyStore((s) => s.archiveTodo);

  // Merge all items
  const allItems = useMemo(
    () => [...rolledOverTodos, ...unscheduledTodos],
    [rolledOverTodos, unscheduledTodos],
  );

  const totalItems = allItems.length;

  // If no items, auto-advance
  useEffect(() => {
    if (totalItems === 0) onContinue();
  }, [totalItems, onContinue]);

  // Initialize all to 'defer'
  const [decisions, setDecisions] = useState<Map<string, MiniSweepPosition>>(() => {
    const map = new Map<string, MiniSweepPosition>();
    allItems.forEach((item) => map.set(item.id, 'defer'));
    return map;
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleDecision = useCallback((id: string, decision: MiniSweepPosition) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(id, decision);
      return next;
    });
  }, []);

  const handleBulkAction = useCallback((ids: string[], decision: MiniSweepPosition) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.set(id, decision));
      return next;
    });
  }, []);

  // Commit all staged changes then advance
  const handleSave = useCallback(() => {
    if (isSaving) return;
    setIsSaving(true);

    const today = getDateService().getCurrentDate();

    const updates: Promise<void>[] = [];

    for (const [id, decision] of decisions.entries()) {
      switch (decision) {
        case 'today':
          updates.push(updateTodo(id, { due_day: today }));
          break;
        case 'archive':
          updates.push(archiveTodo(id, 'mini_sweep'));
          break;
        case 'defer':
          break;
      }
    }

    // Fire and forget — transition immediately
    Promise.all(updates).catch((error) => {
      console.error('[StepSweep] Error saving decisions:', error);
    });

    onContinue();
  }, [decisions, updateTodo, archiveTodo, onContinue, isSaving]);

  const changeCount = useMemo(
    () => Array.from(decisions.values()).filter((d) => d !== 'defer').length,
    [decisions],
  );

  if (totalItems === 0) return null;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Header area ─── */}
        <View style={styles.headerArea}>
          <Text style={styles.title}>A few loose ends</Text>
          <View style={styles.timeEstimate}>
            <Clock size={14} color={BRAND.colors.inkMuted} />
            <Text style={styles.timeText}>~{Math.max(1, Math.floor(totalItems / 6.5))} min</Text>
          </View>
          <Text style={styles.gremlyMessage}>{gremlyMessage}</Text>
          <Text style={styles.instructions}>
            Slide <Text style={styles.highlightRight}>right</Text> to add to today. Slide{' '}
            <Text style={styles.highlightLeft}>left</Text> to archive. Leave in{' '}
            <Text style={styles.highlightMiddle}>middle</Text> to revisit later.
          </Text>
        </View>

        {/* ─── Rolled Over section ─── */}
        {rolledOverTodos.length > 0 && (
          <View style={styles.section}>
            {/* Banner */}
            <View style={styles.sectionBanner}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionAccent} />
                <Text style={styles.sectionTitle}>Rolled Over ({rolledOverTodos.length})</Text>
                <Text style={styles.sectionHelper}>{'  ·  from yesterday/earlier'}</Text>
              </View>
              <View style={styles.columnLabels}>
                <Text style={styles.columnLabel}>← Archive</Text>
                <Text style={styles.columnLabel}>Defer</Text>
                <Text style={styles.columnLabel}>Today →</Text>
              </View>
            </View>

            {/* Items */}
            {rolledOverTodos.map((todo, index) => (
              <MiniSweepItemRow
                key={todo.id}
                item={todo}
                value={decisions.get(todo.id) ?? 'defer'}
                onChange={(value) => handleDecision(todo.id, value)}
                isLast={index === rolledOverTodos.length - 1}
              />
            ))}

            {/* Bulk actions */}
            <View style={styles.bulkActions}>
              <Pressable
                style={styles.bulkPill}
                onPress={() =>
                  handleBulkAction(
                    rolledOverTodos.map((t) => t.id),
                    'archive',
                  )
                }
              >
                <Text style={styles.bulkPillText}>All Archive</Text>
              </Pressable>
              <Pressable
                style={styles.bulkPill}
                onPress={() =>
                  handleBulkAction(
                    rolledOverTodos.map((t) => t.id),
                    'defer',
                  )
                }
              >
                <Text style={styles.bulkPillText}>All Defer</Text>
              </Pressable>
              <Pressable
                style={styles.bulkPill}
                onPress={() =>
                  handleBulkAction(
                    rolledOverTodos.map((t) => t.id),
                    'today',
                  )
                }
              >
                <Text style={styles.bulkPillText}>All Today</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Section separator */}
        {rolledOverTodos.length > 0 && unscheduledTodos.length > 0 && (
          <View style={styles.separator} />
        )}

        {/* ─── Unscheduled section ─── */}
        {unscheduledTodos.length > 0 && (
          <View style={styles.section}>
            {/* Banner */}
            <View style={styles.sectionBanner}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionAccent} />
                <Text style={styles.sectionTitle}>Unscheduled ({unscheduledTodos.length})</Text>
                <Text style={styles.sectionHelper}>{'  ·  recent captures'}</Text>
              </View>
              <View style={styles.columnLabels}>
                <Text style={styles.columnLabel}>← Archive</Text>
                <Text style={styles.columnLabel}>Defer</Text>
                <Text style={styles.columnLabel}>Today →</Text>
              </View>
            </View>

            {/* Items */}
            {unscheduledTodos.map((todo, index) => (
              <MiniSweepItemRow
                key={todo.id}
                item={todo}
                value={decisions.get(todo.id) ?? 'defer'}
                onChange={(value) => handleDecision(todo.id, value)}
                isLast={index === unscheduledTodos.length - 1}
              />
            ))}

            {/* Bulk actions */}
            <View style={styles.bulkActions}>
              <Pressable
                style={styles.bulkPill}
                onPress={() =>
                  handleBulkAction(
                    unscheduledTodos.map((t) => t.id),
                    'archive',
                  )
                }
              >
                <Text style={styles.bulkPillText}>All Archive</Text>
              </Pressable>
              <Pressable
                style={styles.bulkPill}
                onPress={() =>
                  handleBulkAction(
                    unscheduledTodos.map((t) => t.id),
                    'defer',
                  )
                }
              >
                <Text style={styles.bulkPillText}>All Defer</Text>
              </Pressable>
              <Pressable
                style={styles.bulkPill}
                onPress={() =>
                  handleBulkAction(
                    unscheduledTodos.map((t) => t.id),
                    'today',
                  )
                }
              >
                <Text style={styles.bulkPillText}>All Today</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ─── Footer ─── */}
      <View style={styles.footer}>
        <View style={styles.footerRow}>
          {onBack && (
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
              onPress={onBack}
            >
              <ChevronLeft size={20} color={BRAND.colors.inkMuted} />
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.continueBtn,
              onBack ? { flex: 1 } : undefined,
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={styles.continueBtnText}>
              {changeCount > 0 ? `Save & continue (${changeCount})` : 'Continue →'}
            </Text>
          </Pressable>
        </View>
        <Pressable
          style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.5 }]}
          onPress={onSkip}
        >
          <Text style={styles.skipBtnText}>Skip · keep all as-is</Text>
        </Pressable>
      </View>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  /* ─── Header ─── */
  headerArea: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    marginBottom: 4,
  },
  timeEstimate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  timeText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  gremlyMessage: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 4,
  },
  instructions: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    lineHeight: 18,
  },
  highlightRight: {
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
  },
  highlightLeft: {
    fontWeight: '700',
    color: BRAND.colors.inkMuted,
  },
  highlightMiddle: {
    fontWeight: '600',
    fontStyle: 'italic',
    color: BRAND.colors.periwinkleSmoke,
  },
  /* ─── Sections ─── */
  section: {
    marginBottom: 16,
  },
  sectionBanner: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionAccent: {
    width: 3,
    height: 16,
    backgroundColor: BRAND.colors.periwinkleSmoke,
    borderRadius: 2,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  sectionHelper: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
  columnLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  columnLabel: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
  bulkActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
  },
  bulkPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    backgroundColor: BRAND.colors.surface,
  },
  bulkPillText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
    marginVertical: 8,
  },
  /* ─── Footer ─── */
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: BRAND.colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtn: {
    backgroundColor: '#E8F0EB',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  skipBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipBtnText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
  },
});

export default StepSweep;
