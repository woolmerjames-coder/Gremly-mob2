/**
 * SweepDemoFlow — Self-contained demo of the Sweep experience
 *
 * Shown after a user's first drop when they tap "Show me".
 * Uses 4 hardcoded demo candidates (2 todos + 1 event + 1 idea) with real SweepCardNew
 * rendering so the user gets a true feel for the interaction without
 * any real data mutations.
 *
 * Steps: intro → cards → done
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, SafeAreaView } from 'react-native';
import Reanimated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { SweepCardNew } from './SweepCardNew';
import { triggerLight, triggerSuccess } from '../../lib/haptics';
import { nowTimestamp } from '../../lib/date/DateService';
import { format, addDays } from 'date-fns';
import { getDateService } from '../../lib/date';
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

// ─────────────────────────────────────────────────────────────────────────────
// Demo data
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_USER_ID = 'demo-user';

function getFutureEventDate(): string {
  return getDateService().toLocalDate(addDays(getDateService().now(), 10));
}

function makeDemoTodo1(): SweepCandidateTodo {
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
      name: 'Book the weekend trip',
      title: 'Book the weekend trip',
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

function makeDemoTodo2(): SweepCandidateTodo {
  return {
    id: 'demo-todo-2',
    kind: 'todo',
    createdAt: nowTimestamp(),
    dropId: null,
    skippedInSweepAt: null,
    isOverdue: false,
    isDueToday: false,
    isCreatedToday: true,
    raw: {
      id: 'demo-todo-2',
      owner_id: DEMO_USER_ID,
      name: 'Reply to Mia about Saturday',
      title: 'Reply to Mia about Saturday',
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

function makeDemoEvent(): SweepCandidateNote {
  return {
    id: 'demo-event-1',
    kind: 'note',
    createdAt: nowTimestamp(),
    dropId: null,
    skippedInSweepAt: null,
    isOverdue: false,
    isDueToday: false,
    isCreatedToday: true,
    isEventToday: false,
    isEventPassed: false,
    daysUntilEvent: 10,
    raw: {
      id: 'demo-event-1',
      owner_id: DEMO_USER_ID,
      title: 'Dinner with Jordan',
      body: null,
      archived: false,
      ai_placed: false,
      has_list: false,
      body_legacy: null,
      canonical_type: null,
      created_at: nowTimestamp(),
      date: getFutureEventDate(),
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
      subtype: 'event',
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

function makeDemoIdea(): SweepCandidateNote {
  return {
    id: 'demo-idea-1',
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
      id: 'demo-idea-1',
      owner_id: DEMO_USER_ID,
      title: 'Start a weekend hiking group',
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

const DEMO_CANDIDATES: SweepCandidate[] = [
  makeDemoTodo1(),
  makeDemoTodo2(),
  makeDemoEvent(),
  makeDemoIdea(),
];

function demoMeta(candidate: SweepCandidate): SweepCardMeta {
  const shared = {
    habitStatus: null,
    isNew: true,
    resurfacingDate: null,
    resurfacedFromDate: null,
    spaceName: null,
    spaceId: null,
    isLockedIn: false,
    gremlyResponse: null,
    rescheduleCount: 0,
  };

  if (candidate.kind === 'todo') {
    return {
      ...shared,
      typeChip: 'Todo',
      todoStatus: 'unscheduled',
      logSubtype: null,
      noteCardType: null,
      eventDate: null,
      eventDateFormatted: null,
      daysUntilEvent: null,
    };
  }

  const subtype = (candidate.raw as SweepNoteRow).subtype;

  if (subtype === 'event') {
    const eventDate = getFutureEventDate();
    return {
      ...shared,
      typeChip: 'Event',
      todoStatus: null,
      logSubtype: 'event',
      noteCardType: 'event',
      eventDate,
      eventDateFormatted: format(new Date(eventDate + 'T12:00:00'), 'EEE, MMM d'),
      daysUntilEvent: 10,
    };
  }

  // idea
  return {
    ...shared,
    typeChip: 'Idea',
    todoStatus: null,
    logSubtype: 'idea',
    noteCardType: 'idea',
    eventDate: null,
    eventDateFormatted: null,
    daysUntilEvent: null,
  };
}

const DEMO_TIPS: string[] = [
  'Pick when you want to do it, add a reminder if you like, then swipe right to keep it.',
  'Same deal — pick a date or swipe left to let it go.',
  'Events come with reminders. You can add a prep todo too, then swipe right.',
  'Ideas can resurface later or become a todo. Swipe right to keep, left to let go.',
];

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
  const markDemoSweepComplete = useGremlyStore((s) => s.markDemoSweepComplete);

  const candidate = DEMO_CANDIDATES[cardIndex];
  const meta = candidate ? demoMeta(candidate) : null;
  const tip = DEMO_TIPS[cardIndex] ?? null;

  // ── Advance to next card or finish ──
  const advance = useCallback(() => {
    triggerLight();

    if (cardIndex + 1 < DEMO_CANDIDATES.length) {
      setCardIndex((i) => i + 1);
    } else {
      triggerSuccess();
      setStep('done');
    }
  }, [cardIndex]);

  // ── Handlers wired to SweepCardNew ──
  const onSkip = useCallback(() => advance(), [advance]);
  const onClear = useCallback(() => advance(), [advance]);
  const onOpenEdit = useCallback(() => advance(), [advance]);
  const onConfirmTodoAction = useCallback(() => advance(), [advance]);
  const onConfirmEventAction = useCallback(() => advance(), [advance]);
  const onConfirmNoteAction = useCallback(() => advance(), [advance]);

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
            Every evening, I'll gather your tasks, ideas, and events and help you decide what's
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
            {cardIndex === 0
              ? 'Your first demo card'
              : `Demo · ${cardIndex + 1} of ${DEMO_CANDIDATES.length}`}
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

        {/* Mascot tip row */}
        {tip && (
          <Reanimated.View
            key={`tip-${cardIndex}`}
            entering={FadeIn.duration(250).delay(200)}
            exiting={FadeOut.duration(150)}
            style={styles.tipRow}
          >
            <Image source={GREMLY_MASCOT} style={styles.tipMascot} resizeMode="contain" />
            <View style={styles.tipBubble}>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          </Reanimated.View>
        )}

        {/* Card */}
        <Reanimated.View
          key={candidate.id}
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
          style={styles.cardContainer}
        >
          <SweepCardNew
            candidate={candidate}
            meta={meta}
            index={cardIndex}
            total={DEMO_CANDIDATES.length}
            onSkip={onSkip}
            onClear={onClear}
            onOpenEdit={onOpenEdit}
            onConfirmTodoAction={onConfirmTodoAction}
            onConfirmEventAction={onConfirmEventAction}
            onConfirmNoteAction={onConfirmNoteAction}
            hideGremlyMenu
          />
        </Reanimated.View>
      </View>
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
    paddingBottom: 4,
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

  // Tip row
  tipRow: {
    flexDirection: 'row' as const,
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 10,
    alignItems: 'flex-start',
  },
  tipMascot: {
    width: 48,
    height: 48,
  },
  tipBubble: {
    flex: 1,
    backgroundColor: 'rgba(191,216,192,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(191,216,192,0.35)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  tipText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500' as const,
    color: BRAND.colors.charcoalInk,
  },
});

export default SweepDemoFlow;
