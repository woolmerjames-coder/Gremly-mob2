/**
 * SweepDemoFlow — Self-contained demo of the Sweep experience
 *
 * Shown after a user's first drop when they tap "Show me".
 * Uses 3 hardcoded demo candidates (1 todo + 2 notes) with real SweepCard
 * rendering so the user gets a true feel for the interaction without
 * any real data mutations.
 *
 * Steps: intro → cards → done
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, SafeAreaView, Dimensions } from 'react-native';
import Reanimated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — OLD file kept for reference; demo needs rewrite to SweepCardNew
import { SweepCard } from './SweepCard.OLD';
import { triggerLight, triggerSuccess } from '../../lib/haptics';
import { nowTimestamp } from '../../lib/date/DateService';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type {
  SweepCandidate,
  SweepCandidateTodo,
  SweepCandidateNote,
  SweepCardMeta,
  SweepTodoRow,
  SweepNoteRow,
} from '../../lib/sweep/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../assets/mascot/gremly-mascot.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_CELEBRATE = require('../../assets/mascot/sweepcomplete.png');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Demo data
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_USER_ID = 'demo-user';

function makeDemoTodo(): SweepCandidateTodo {
  return {
    id: 'demo-todo-1',
    kind: 'todo',
    createdAt: nowTimestamp(),
    dropId: null,
    skippedInSweepAt: null,
    isOverdue: false,
    isDueToday: false,
    isCreatedToday: true,
    raw: {
      id: 'demo-todo-1',
      owner_id: DEMO_USER_ID,
      name: 'Book dentist appointment',
      title: 'Book dentist appointment',
      status: 'active',
      archived: false,
      ai_placed: false,
      carry_forward: false,
      has_list: false,
      locked_in: false,
      sweep_reschedule_count: 0,
      body: null,
      body_legacy: null,
      canonical_type: null,
      commitment: null,
      commitment_archived_at: null,
      commitment_note: null,
      commitment_started_at: null,
      completed_at: null,
      created_at: nowTimestamp(),
      drop_id: null,
      due_date: null,
      due_day: null,
      due_time: null,
      is_pinned: null,
      labels: null,
      list_items: null,
      locked_in_at: null,
      notes: null,
      origin: 'demo',
      reminders_json: null,
      skipped_in_sweep_at: null,
      source_message_id: null,
      source_note_id: null,
      space_id: null,
      subtype: null,
      tags: null,
      tags_meta: null,
      time_estimate_minutes: null,
      undefined_due: null,
      updated_at: null,
      views: null,
      why_string: null,
      archived_at: null,
      archived_reason: null,
      resurface_at: null,
      scheduled_date: null,
      target_date: null,
    } as unknown as SweepTodoRow,
  };
}

function makeDemoNote1(): SweepCandidateNote {
  return {
    id: 'demo-note-1',
    kind: 'note',
    createdAt: nowTimestamp(),
    dropId: null,
    skippedInSweepAt: null,
    isOverdue: false,
    isDueToday: false,
    isCreatedToday: true,
    isEventToday: false,
    isEventPassed: false,
    daysUntilEvent: null,
    raw: {
      id: 'demo-note-1',
      owner_id: DEMO_USER_ID,
      title: "Gift ideas for Mum's birthday",
      body: 'Scarf, cookbook, spa voucher',
      archived: false,
      ai_placed: false,
      has_list: false,
      body_legacy: null,
      canonical_type: null,
      created_at: nowTimestamp(),
      date: null,
      drop_id: null,
      fmt: null,
      is_favorite: false,
      is_pinned: null,
      journal_subtype: null,
      labels: null,
      list_items: null,
      mood: null,
      origin: 'demo',
      reminders_json: null,
      skipped_in_sweep_at: null,
      source_message_id: null,
      space_id: null,
      subtype: 'idea',
      tags: null,
      tags_meta: null,
      updated_at: null,
      views: null,
      why_string: null,
      archived_at: null,
      archived_reason: null,
      event_time: null,
      needs_clarification: false,
      reminder_date: null,
      resurface_at: null,
      swept_at: null,
      target_date: null,
    } as unknown as SweepNoteRow,
  };
}

function makeDemoNote2(): SweepCandidateNote {
  return {
    id: 'demo-note-2',
    kind: 'note',
    createdAt: nowTimestamp(),
    dropId: null,
    skippedInSweepAt: null,
    isOverdue: false,
    isDueToday: false,
    isCreatedToday: true,
    isEventToday: false,
    isEventPassed: false,
    daysUntilEvent: null,
    raw: {
      id: 'demo-note-2',
      owner_id: DEMO_USER_ID,
      title: 'Try that Thai place on King St',
      body: null,
      archived: false,
      ai_placed: false,
      has_list: false,
      body_legacy: null,
      canonical_type: null,
      created_at: nowTimestamp(),
      date: null,
      drop_id: null,
      fmt: null,
      is_favorite: false,
      is_pinned: null,
      journal_subtype: null,
      labels: null,
      list_items: null,
      mood: null,
      origin: 'demo',
      reminders_json: null,
      skipped_in_sweep_at: null,
      source_message_id: null,
      space_id: null,
      subtype: null,
      tags: null,
      tags_meta: null,
      updated_at: null,
      views: null,
      why_string: null,
      archived_at: null,
      archived_reason: null,
      event_time: null,
      needs_clarification: false,
      reminder_date: null,
      resurface_at: null,
      swept_at: null,
      target_date: null,
    } as unknown as SweepNoteRow,
  };
}

const DEMO_CANDIDATES: SweepCandidate[] = [makeDemoTodo(), makeDemoNote1(), makeDemoNote2()];

function demoMeta(candidate: SweepCandidate): SweepCardMeta {
  return {
    typeChip: candidate.kind === 'todo' ? 'Todo' : 'Note',
    todoStatus: candidate.kind === 'todo' ? 'unscheduled' : null,
    logSubtype:
      candidate.kind === 'note'
        ? (candidate.raw as SweepNoteRow).subtype === 'idea'
          ? 'idea'
          : 'general'
        : null,
    habitStatus: null,
    isNew: true,
    resurfacingDate: null,
    spaceName: null,
    spaceId: null,
    isLockedIn: false,
    gremlyResponse:
      candidate.kind === 'todo'
        ? 'When do you want to do this?'
        : (candidate.raw as SweepNoteRow).subtype === 'idea'
          ? 'Nice idea — want to keep it or clear it?'
          : 'Keep it or let it go?',
    rescheduleCount: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

type DemoStep = 'intro' | 'cards' | 'done';

interface SweepDemoFlowProps {
  onComplete: () => void;
  /** If true, "Got it" returns to Mind Drop. If false, transitions to real Sweep. */
  returnsToMindDrop?: boolean;
}

export function SweepDemoFlow({ onComplete, returnsToMindDrop = false }: SweepDemoFlowProps) {
  const [step, setStep] = useState<DemoStep>('intro');
  const [cardIndex, setCardIndex] = useState(0);
  const [showCoachMark, setShowCoachMark] = useState(true);
  const markDemoSweepComplete = useGremlyStore((s) => s.markDemoSweepComplete);

  const candidate = DEMO_CANDIDATES[cardIndex];
  const meta = candidate ? demoMeta(candidate) : null;

  // ── Advance to next card or finish ──
  const advance = useCallback(
    (action: 'keep' | 'clear' | 'skip') => {
      triggerLight();

      if (cardIndex + 1 < DEMO_CANDIDATES.length) {
        setCardIndex((i) => i + 1);
      } else {
        triggerSuccess();
        setStep('done');
      }
    },
    [cardIndex],
  );

  // ── Handlers wired to SweepCard ──
  const onSkip = useCallback(() => advance('skip'), [advance]);
  const onClear = useCallback(() => advance('clear'), [advance]);
  const onConfirmQuickDate = useCallback(() => advance('keep'), [advance]);
  const onConfirmRemindLater = useCallback(() => advance('keep'), [advance]);
  const onConfirmCustomDate = useCallback(() => advance('keep'), [advance]);
  const onOpenEdit = useCallback(() => {
    // No-op in demo — just advance
    advance('keep');
  }, [advance]);

  // ── Intro screen ──
  if (step === 'intro') {
    return (
      <SafeAreaView style={styles.container}>
        <Reanimated.View entering={FadeIn.duration(400)} style={styles.centered}>
          <Image source={GREMLY_MASCOT} style={styles.mascot} resizeMode="contain" />
          <Text style={styles.heading}>The Sweep</Text>
          <Text style={styles.subtext}>
            Each evening, Gremly shows you everything you dropped during the day, one card at a
            time. You decide what to schedule, keep, or let go.
          </Text>
          <Text style={styles.introCallout}>Let's try it with a few example items.</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              triggerLight();
              setStep('cards');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Let's go</Text>
          </TouchableOpacity>
        </Reanimated.View>
      </SafeAreaView>
    );
  }

  // ── Done screen ──
  if (step === 'done') {
    return (
      <SafeAreaView style={styles.container}>
        <Reanimated.View entering={FadeInUp.duration(500)} style={styles.centered}>
          <Image source={GREMLY_CELEBRATE} style={styles.mascot} resizeMode="contain" />
          <Text style={styles.heading}>That's the Sweep!</Text>
          <Text style={styles.subtext}>
            Every evening, I'll gather your tasks, ideas, and thoughts and help you decide what's
            next.{'\n\n'}The more you drop during the day, the better I get.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={async () => {
              triggerLight();
              await markDemoSweepComplete();
              onComplete();
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {returnsToMindDrop ? 'Got it' : 'Start my Sweep'}
            </Text>
          </TouchableOpacity>
        </Reanimated.View>
      </SafeAreaView>
    );
  }

  // ── Cards step ──
  if (!candidate || !meta) return null;

  return (
    <SafeAreaView style={styles.cardScreenContainer}>
      <View style={styles.cardStep}>
        {/* Header / progress */}
        <View style={styles.cardHeader}>
          <Text style={styles.progressText}>
            Demo · {cardIndex + 1} of {DEMO_CANDIDATES.length}
          </Text>
          <TouchableOpacity
            onPress={async () => {
              triggerLight();
              await markDemoSweepComplete();
              onComplete();
            }}
          >
            <Text style={styles.skipAllText}>Skip demo</Text>
          </TouchableOpacity>
        </View>

        {/* Gremly header removed — was SweepGremlyHeader, now built into SweepCardShell */}

        {/* Card */}
        <Reanimated.View
          key={candidate.id}
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
          style={styles.cardContainer}
        >
          <SweepCard
            candidate={candidate}
            meta={meta}
            index={cardIndex}
            total={DEMO_CANDIDATES.length}
            onSkip={onSkip}
            onClear={onClear}
            onOpenEdit={onOpenEdit}
            onConvertToTodo={undefined}
            onConfirmQuickDate={onConfirmQuickDate}
            onConfirmRemindLater={onConfirmRemindLater}
            onConfirmCustomDate={onConfirmCustomDate}
            onAddToSpace={undefined}
            onConfirmHabitStart={undefined}
            hideBottomSaveExit
          />
        </Reanimated.View>
      </View>

      {/* Coach mark overlay — first card only, covers full screen */}
      {showCoachMark && cardIndex === 0 && (
        <View style={styles.coachOverlay}>
          <View style={styles.coachCard}>
            <Text style={styles.coachTitle}>How the Sweep works</Text>
            <Text style={styles.coachBody}>
              Pick an option on the right, then swipe right to schedule or keep it.{'\n\n'}Or swipe
              left to let it go.
            </Text>
            <TouchableOpacity
              style={styles.coachButton}
              onPress={() => setShowCoachMark(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.coachButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  cardScreenContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  mascot: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    marginBottom: 12,
    textAlign: 'center',
    paddingTop: 4,
    overflow: 'visible',
  },
  subtext: {
    fontSize: 16,
    lineHeight: 24,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  introCallout: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginTop: 16,
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: BRAND.radius.pill,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },

  // Cards step
  cardStep: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  skipAllText: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textDecorationLine: 'underline',
  },
  cardContainer: {
    flex: 1,
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
  },

  // Coach mark overlay
  coachOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    paddingHorizontal: 32,
  },
  coachCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: BRAND.colors.sageMist,
  },
  coachTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 16,
  },
  coachBody: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  coachButton: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
  },
  coachButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});

export default SweepDemoFlow;
