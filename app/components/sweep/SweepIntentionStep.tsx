/**
 * SweepIntentionStep — Week-mode step 3 (replaces mood step in week sweeps).
 *
 * Forward-looking "What's your focus this week?" prompt with:
 *   - Seed chips to lower blank-page cost
 *   - "Lock in what matters" button opening a bottom-sheet with all week items
 *   - Star-toggles addCommitment / removeCommitment (cap 5)
 *   - On Continue: saves a journal note (journal_subtype:'intention') if text entered
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  KeyboardAvoidingView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Image,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Star, X, RotateCcw } from 'lucide-react-native';
import { Text } from '../../../ui';
import { Icon } from '../../../design-system/Icon';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { getDateService } from '../../../lib/date/DateService';
import { useWeekDays } from '../../../lib/store/weekGridSelectors';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../../assets/mascot/clipboardgremly.png');

const PERIWINKLE = '#7B87D4';
// Softened periwinkle tokens for the lock-in section — same hue, lower intensity
const PERIWINKLE_SOFT_BG = 'rgba(123,135,212,0.07)';
const PERIWINKLE_SOFT_BORDER = 'rgba(123,135,212,0.18)';
const PERIWINKLE_SOFT = 'rgba(123,135,212,0.65)';
const PERIWINKLE_BG = 'rgba(123,135,212,0.12)';
const PERIWINKLE_BORDER = 'rgba(123,135,212,0.30)';
const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });
const MAX_LOCKED = 5;

/**
 * Format a YYYY-MM-DD date string as "Jun 9" — always month + day, never "Today"/weekday.
 * Used for the review context line where relative labels would be confusing.
 */
function formatShortDate(dateStr: string): string {
  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const [, m, d] = dateStr.split('-').map(Number);
  if (!m || !d) return dateStr;
  return `${MONTHS[m - 1]} ${d}`;
}

// By step 3 all session decisions are persisted — empty map gives the full week view
const EMPTY_DECISIONS = new Map<string, { dueDateStr?: string; action: string }>();

export interface SweepIntentionStepProps {
  onContinue: () => void;
  onSkip: () => void;
  weekStartDate: string;
}

export function SweepIntentionStep({ onContinue, onSkip, weekStartDate }: SweepIntentionStepProps) {
  const createNote = useGremlyStore((s) => s.createNote);
  const updateNote = useGremlyStore((s) => s.updateNote);
  const notes = useGremlyStore((s) => s.notes);
  const addCommitment = useGremlyStore((s) => s.addCommitment);
  const removeCommitment = useGremlyStore((s) => s.removeCommitment);
  const todos = useGremlyStore((s) => s.todos);

  // Find the existing intention note for the current week (for edit/upsert)
  const existingIntention = useMemo(() => {
    const ds = getDateService();
    const weekStart = ds.getStartOfWeek();
    const weekEnd = ds.addDays(weekStart, 6);
    return (
      notes.find(
        (n) =>
          n.journal_subtype === 'intention' &&
          !n.archived &&
          n.target_date != null &&
          n.target_date >= weekStart &&
          n.target_date <= weekEnd,
      ) ?? null
    );
  }, [notes]);

  // Prefill from existing note. Read store directly at mount for zero-flash init;
  // a ref prevents overwriting user edits if the store updates mid-session.
  const prefillAppliedRef = useRef(false);
  const [intentionText, setIntentionText] = useState<string>(() => {
    const storeNotes = useGremlyStore.getState().notes;
    const ds = getDateService();
    const weekStart = ds.getStartOfWeek();
    const weekEnd = ds.addDays(weekStart, 6);
    const existing = storeNotes.find(
      (n) =>
        n.journal_subtype === 'intention' &&
        !n.archived &&
        n.target_date != null &&
        n.target_date >= weekStart &&
        n.target_date <= weekEnd,
    );
    if (existing?.body) prefillAppliedRef.current = true;
    return existing?.body ?? '';
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showLockSheet, setShowLockSheet] = useState(false);

  const weekDays = useWeekDays(EMPTY_DECISIONS);

  const insets = useSafeAreaInsets();

  const allWeekItems = useMemo(() => {
    const result: Array<{
      id: string;
      title: string;
      date: string;
      dow: string;
      dayNum: number;
      tag: string | null;
      world: { name: string; accentColor: string } | null;
    }> = [];
    for (const day of weekDays) {
      for (const item of day.items) {
        result.push({
          id: item.id,
          title: item.title,
          date: day.date,
          dow: day.dow,
          dayNum: day.dayNum,
          tag: day.tag,
          world: item.world,
        });
      }
    }
    return result;
  }, [weekDays]);

  const committedIds = useMemo(
    () => new Set(todos.filter((t) => t.commitment === true && !t.archived).map((t) => t.id)),
    [todos],
  );

  const lockedCount = useMemo(
    () => allWeekItems.filter((item) => committedIds.has(item.id)).length,
    [allWeekItems, committedIds],
  );

  const lockedItems = useMemo(
    () => allWeekItems.filter((item) => committedIds.has(item.id)),
    [allWeekItems, committedIds],
  );

  // Week range label for the heading, e.g. "Week of Jun 8-14" (Monday to Sunday)
  const weekRangeLabel = useMemo(() => {
    const ds = getDateService();
    const monday = ds.getStartOfWeek();
    const sunday = ds.addDays(monday, 6);
    return `Week of ${formatShortDate(monday)}-${formatShortDate(sunday).replace(/^[A-Za-z]+ /, '')}`;
  }, []);

  // Review-mode metadata: dates for the context line shown when editing an existing intention.
  const reviewMeta = useMemo(() => {
    if (!existingIntention) return null;
    const ds = getDateService();
    const createdLocalDate = ds.extractLocalDate(existingIntention.created_at);
    const nextMonday = ds.addDays(existingIntention.target_date ?? weekStartDate, 7);
    return {
      createdLabel: createdLocalDate ? formatShortDate(createdLocalDate) : '',
      resetLabel: formatShortDate(nextMonday),
    };
  }, [existingIntention, weekStartDate]);

  const handleToggleCommitment = useCallback(
    async (id: string) => {
      if (committedIds.has(id)) {
        await removeCommitment(id, 'todo');
      } else {
        if (lockedCount >= MAX_LOCKED) return;
        await addCommitment(id, 'todo');
      }
    },
    [committedIds, lockedCount, addCommitment, removeCommitment],
  );

  const handleContinue = useCallback(async () => {
    const trimmed = intentionText.trim();
    if (!trimmed) {
      onContinue();
      return;
    }
    setIsSaving(true);
    try {
      if (existingIntention) {
        // Update the existing note instead of creating a duplicate
        await updateNote(existingIntention.id, {
          title: trimmed.slice(0, 80) || 'Weekly intention',
          body: trimmed,
        });
      } else {
        await createNote({
          subtype: 'journal',
          title: trimmed.slice(0, 80) || 'Weekly intention',
          body: trimmed || undefined,
          origin: 'manual',
          canonicalType: 'log',
          journal_subtype: 'intention',
          target_date: weekStartDate,
          tags: ['intention', 'sweep'],
          views: { sweep_origin: true, sweep_date: weekStartDate },
        });
      }
    } catch {
      // Non-blocking
    } finally {
      setIsSaving(false);
    }
    onContinue();
  }, [intentionText, existingIntention, createNote, updateNote, weekStartDate, onContinue]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{"What's your focus this week?"}</Text>
            <Text style={styles.subcopy}>Set an intention or goal.</Text>
          </View>
          <Image
            source={GREMLY_MASCOT}
            style={styles.mascotImage}
            resizeMode="contain"
            accessibilityLabel="Gremly mascot"
          />
        </View>

        {/* Week range — always shown so user knows which week this intention is for */}
        <View style={styles.weekRangeRow}>
          <Icon name="Calendar" size="xs" color={BRAND.colors.inkMuted} strokeWidth={1.5} />
          <Text style={styles.weekRangeText}>{weekRangeLabel}</Text>
        </View>

        {/* Review context line — only shown when re-entering an existing week intention */}
        {reviewMeta && (
          <View style={styles.reviewLine}>
            <RotateCcw size={11} strokeWidth={2} color={BRAND.colors.inkMuted} />
            <Text style={styles.reviewLineText}>
              {`You set this on ${reviewMeta.createdLabel}. Edit below, or it resets ${reviewMeta.resetLabel}.`}
            </Text>
          </View>
        )}

        {/* AI 'suggest an intention' affordance mounts here in the AI slice —
            quiet, on-tap, grounded in the user's week.
            Do NOT add static chips back. */}

        <View style={styles.inputSection}>
          <TextInput
            style={styles.input}
            placeholder="This week, I want to..."
            placeholderTextColor={BRAND.colors.inkMuted}
            multiline
            value={intentionText}
            onChangeText={setIntentionText}
            textAlignVertical="top"
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.lockBtn, pressed && { opacity: 0.75 }]}
          onPress={() => setShowLockSheet(true)}
          accessibilityRole="button"
          accessibilityLabel="Lock in priorities for the week"
        >
          <Star
            size={14}
            strokeWidth={1.75}
            color={lockedCount > 0 ? PERIWINKLE_SOFT : BRAND.colors.inkMuted}
            fill={lockedCount > 0 ? PERIWINKLE_SOFT : 'transparent'}
          />
          <Text style={styles.lockBtnText}>
            {lockedCount > 0
              ? `${lockedCount} ${lockedCount === 1 ? 'priority' : 'priorities'} locked in · tap to edit`
              : 'Lock in what matters'}
          </Text>
        </Pressable>

        {lockedItems.length > 0 && (
          <View style={styles.lockedList}>
            {lockedItems.map((item) => (
              <View key={item.id} style={styles.lockedRow}>
                <Star size={12} strokeWidth={1.75} color={PERIWINKLE_SOFT} fill={PERIWINKLE_SOFT} />
                <View
                  style={[
                    styles.worldDot,
                    {
                      backgroundColor: item.world?.accentColor
                        ? `${item.world.accentColor}99`
                        : 'rgba(34,34,34,0.22)',
                    },
                  ]}
                />
                <Text style={styles.lockedTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.lockedDay}>{item.dow}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
          onPress={handleContinue}
          disabled={isSaving}
          activeOpacity={0.8}
        >
          <View style={styles.primaryButtonContent}>
            <Text style={styles.primaryButtonText}>{isSaving ? 'Saving...' : 'Continue'}</Text>
            {!isSaving && (
              <Icon name="ArrowRight" size="sm" color={BRAND.colors.mossGreen} strokeWidth={2.5} />
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipButton} onPress={onSkip} disabled={isSaving}>
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showLockSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLockSheet(false)}
      >
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowLockSheet(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderLeft}>
                <Text style={styles.sheetTitle}>Lock in what matters</Text>
                <View style={styles.counterPill}>
                  <Text style={styles.counterText}>
                    {lockedCount} / {MAX_LOCKED}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => setShowLockSheet(false)}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel="Close"
              >
                <X size={18} strokeWidth={2} color={BRAND.colors.inkMuted} />
              </Pressable>
            </View>
            <Text style={styles.sheetSubcopy}>
              Star up to {MAX_LOCKED} items you are committed to this week.
            </Text>
            {allWeekItems.length === 0 ? (
              <View style={styles.emptySheet}>
                <Text style={styles.emptySheetText}>No items scheduled this week yet.</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {weekDays
                  .filter((day) => day.items.length > 0)
                  .map((day) => (
                    <View key={day.date} style={styles.dayGroup}>
                      <Text style={styles.dayGroupLabel}>
                        {day.dow.toUpperCase()} {day.dayNum}
                        {day.tag ? `  ${day.tag}` : ''}
                      </Text>
                      {day.items.map((item) => {
                        const isLocked = committedIds.has(item.id);
                        const atCap = !isLocked && lockedCount >= MAX_LOCKED;
                        return (
                          <Pressable
                            key={item.id}
                            style={({ pressed }) => [
                              styles.sheetItem,
                              atCap && styles.sheetItemDimmed,
                              pressed && !atCap && { opacity: 0.7 },
                            ]}
                            onPress={() => handleToggleCommitment(item.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`${isLocked ? 'Unstar' : 'Star'} ${item.title}`}
                          >
                            <Star
                              size={16}
                              strokeWidth={2}
                              color={isLocked ? PERIWINKLE : BRAND.colors.inkMuted}
                              fill={isLocked ? PERIWINKLE : 'transparent'}
                            />
                            <View
                              style={[
                                styles.worldDot,
                                {
                                  backgroundColor: item.world?.accentColor ?? BRAND.colors.inkMuted,
                                },
                              ]}
                            />
                            <Text
                              style={[styles.sheetItemText, atCap && styles.sheetItemTextDimmed]}
                              numberOfLines={1}
                            >
                              {item.title}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 8, backgroundColor: BRAND.colors.linenCream },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32, paddingHorizontal: 20, paddingTop: 48 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerText: { flex: 1 },
  mascotImage: { width: 80, height: 80, opacity: 0.9, marginLeft: 8, marginTop: -8 },
  title: {
    fontSize: 24,
    fontFamily: SERIF,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 8,
    lineHeight: 31,
    letterSpacing: -0.3,
  },
  subcopy: { fontSize: 14, fontWeight: '400', color: 'rgba(34,34,34,0.60)', lineHeight: 20 },
  weekRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: -12,
    marginBottom: 14,
  },
  weekRangeText: {
    fontSize: 12,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    lineHeight: 17,
  },
  reviewLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    marginTop: -8,
  },
  reviewLineText: {
    fontSize: 12,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    lineHeight: 17,
    flex: 1,
  },
  // chipsRow / chip / chipPressed / chipText removed — AI suggestion affordance replaces static chips
  inputSection: { marginBottom: 14 },
  input: {
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(191,216,192,0.30)',
    padding: 16,
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    minHeight: 100,
    lineHeight: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: BRAND.radius.lg,
    backgroundColor: PERIWINKLE_SOFT_BG,
    borderWidth: 1,
    borderColor: PERIWINKLE_SOFT_BORDER,
    marginBottom: 16,
  },
  lockBtnText: { fontSize: 14, fontWeight: '500', color: PERIWINKLE_SOFT, flex: 1 },
  lockedList: { gap: 8, marginBottom: 8 },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  worldDot: { width: 8, height: 8, borderRadius: 4 },
  lockedTitle: { flex: 1, fontSize: 14, fontWeight: '400', color: BRAND.colors.charcoalInk },
  lockedDay: { fontSize: 12, fontWeight: '500', color: BRAND.colors.inkMuted },
  footer: {
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: BRAND.colors.linenCream,
  },
  primaryButton: {
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: BRAND.radius.xl,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  primaryButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { fontSize: 17, fontWeight: '600', color: BRAND.colors.mossGreen },
  skipButton: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  skipButtonText: { color: 'rgba(34,34,34,0.55)', fontSize: 15, fontWeight: '500' },
  sheetRoot: { flex: 1 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: BRAND.colors.linenCream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '75%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(34,34,34,0.15)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sheetHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: BRAND.colors.charcoalInk },
  counterPill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: PERIWINKLE_BG,
    borderWidth: 1,
    borderColor: PERIWINKLE_BORDER,
  },
  counterText: { fontSize: 12, fontWeight: '600', color: PERIWINKLE },
  closeBtn: { padding: 4 },
  sheetSubcopy: { fontSize: 13, color: 'rgba(34,34,34,0.55)', marginBottom: 16 },
  sheetScroll: { flexShrink: 1 },
  sheetScrollContent: { paddingBottom: 8, gap: 12 },
  dayGroup: { gap: 4 },
  dayGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.colors.inkMuted,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BRAND.radius.md,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.06)',
  },
  sheetItemDimmed: { opacity: 0.38 },
  sheetItemText: { flex: 1, fontSize: 15, fontWeight: '400', color: BRAND.colors.charcoalInk },
  sheetItemTextDimmed: { color: BRAND.colors.inkMuted },
  emptySheet: { paddingVertical: 32, alignItems: 'center' },
  emptySheetText: {
    fontSize: 14,
    color: 'rgba(34,34,34,0.55)',
    textAlign: 'center',
    lineHeight: 21,
  },
});
