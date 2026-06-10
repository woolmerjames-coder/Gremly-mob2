/**
 * SweepHubChooser -- Week-mode sweep hub (step 0.1).
 *
 * Shows a chooser of planning spokes. The user can either
 * "Lead me through it all" (chained linear run) or pick individual
 * spokes a la carte. Each completed spoke shows a tick but remains
 * re-enterable.
 *
 * Styled to match the NOW screen design language (NowHeader.tsx).
 */

import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import {
  CalendarRange,
  Compass,
  Repeat,
  CalendarDays,
  Check,
  ChevronRight,
  ChevronDown,
  Sparkles,
} from 'lucide-react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { makeStyles } from '../../../design/makeStyles';
import MascotLottie from '../MascotLottie';
import { useMascotMode } from '../../../contexts/MascotModeContext';

// TODO(cleanup-ledger): consolidate shared tints into BRAND
const CARD_BG = '#FAF8F5'; // same as NowHeader CARD_BG_TODAY
const TINT_SAGE = '#F2F7F0'; // same as NowHeader CARD_BG_HABITS
const TINT_SAGE_STRONG = '#E8F0EB'; // same as NowScreenV1 headerAddButton
const TINT_PERI = 'rgba(156,166,224,0.18)';
const TINT_GOLD = 'rgba(224,196,122,0.22)';
const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

export type HubSectionKey = 'todos' | 'intention' | 'habits' | 'events';

export interface HubSection {
  key: HubSectionKey;
  label: string;
  meta?: string;
  disabled?: boolean;
  comingSoon?: boolean;
}

export const HUB_SECTIONS: HubSection[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'intention', label: 'Intention' },
  { key: 'habits', label: 'Habits' },
  { key: 'events', label: 'Week ahead' },
];

const SECTION_SUBTITLES: Record<HubSectionKey, string> = {
  todos: 'Decide what makes the week',
  intention: 'One line to anchor it',
  habits: 'Targets for the week',
  events: 'A glance at the calendar',
};

const SECTION_ICONS: Record<
  HubSectionKey,
  React.ComponentType<{ size: number; strokeWidth: number; color: string }>
> = {
  todos: CalendarRange,
  intention: Compass,
  habits: Repeat,
  events: CalendarDays,
};

const SECTION_CHIP_BG: Record<HubSectionKey, string> = {
  todos: TINT_PERI,
  intention: TINT_GOLD,
  habits: TINT_SAGE,
  events: TINT_SAGE,
};

const SECTION_ICON_COLOR: Record<HubSectionKey, string> = {
  todos: BRAND.colors.periwinkleSmoke,
  intention: BRAND.colors.goldenPear,
  habits: BRAND.colors.mossGreen,
  events: BRAND.colors.mossGreen,
};

export interface SweepHubChooserProps {
  completed: Set<string>;
  onPickSection: (key: HubSectionKey) => void;
  onLeadThroughAll: () => void;
  onFinish: () => void;
  onExit: () => void;
  weekLabel: string;
}

export function SweepHubChooser({
  completed,
  onPickSection,
  onLeadThroughAll,
  onFinish,
  onExit,
  weekLabel,
}: SweepHubChooserProps) {
  // Ephemeral UI disclosure state — accepted exception to Zustand-default rule
  const [explainerOpen, setExplainerOpen] = useState(false);
  const styles = useStyles();
  const { resetInactivity } = useMascotMode();

  const handleMascotPress = () => {
    resetInactivity();
    setExplainerOpen((v) => !v);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header — mirrors NowHeader topRow exactly */}
        <View style={styles.topRow}>
          <View style={styles.greetingColumn}>
            <Text style={styles.greeting}>Weekly Sweep</Text>
            <Text style={styles.dateTime}>{weekLabel}</Text>
            <View style={styles.headerDivider} />
          </View>
          <View style={styles.mascotColumn}>
            <TouchableOpacity
              onPress={handleMascotPress}
              activeOpacity={0.8}
              accessibilityLabel="What is a sweep"
            >
              <MascotLottie width={64} />
            </TouchableOpacity>
          </View>
        </View>

        {/* "What's a sweep?" collapsible */}
        <TouchableOpacity
          style={styles.explainerTrigger}
          onPress={() => setExplainerOpen((v) => !v)}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="What is a sweep"
        >
          <Text style={styles.explainerTriggerText}>What's a sweep?</Text>
          <View style={explainerOpen ? styles.chevronOpen : undefined}>
            <ChevronDown size={13} strokeWidth={2.2} color={BRAND.colors.mossGreen} />
          </View>
        </TouchableOpacity>
        {explainerOpen && (
          <View style={styles.explainerBody}>
            <Text style={styles.explainerBodyText}>
              Get ahead of the week before it starts. Sort your todos into days, set an intention,
              and line up your habit targets. Run through everything or just the parts you need.
            </Text>
          </View>
        )}

        {/* Hero card */}
        <TouchableOpacity
          style={styles.heroCard}
          onPress={onLeadThroughAll}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Lead me through it all"
        >
          <View style={styles.heroChip}>
            <Sparkles size={22} strokeWidth={2} color={BRAND.colors.goldenPear} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Lead me through it all</Text>
            <Text style={styles.heroSub}>Guided · about 5 minutes</Text>
          </View>
          <ChevronRight size={16} strokeWidth={2} color={BRAND.colors.goldenPear} />
        </TouchableOpacity>

        {/* "Or one at a time" — TimeBlockSection label treatment */}
        <View style={styles.orLabelRow}>
          <View style={styles.orAccent} />
          <Text style={styles.orLabel}>Or one at a time</Text>
        </View>

        {/* Section cards */}
        <View style={styles.sectionList}>
          {HUB_SECTIONS.map((section) => {
            const isDone = completed.has(section.key);
            const isDisabled = !!section.disabled;
            const SectionIcon = SECTION_ICONS[section.key];

            return (
              <TouchableOpacity
                key={section.key}
                style={[
                  styles.sectionCard,
                  isDone && styles.sectionCardDone,
                  isDisabled && styles.sectionCardDisabled,
                ]}
                onPress={() => !isDisabled && onPickSection(section.key)}
                activeOpacity={isDisabled ? 1 : 0.78}
                accessibilityRole="button"
                accessibilityLabel={section.label}
                accessibilityState={{ disabled: isDisabled }}
              >
                <View
                  style={[styles.sectionChip, { backgroundColor: SECTION_CHIP_BG[section.key] }]}
                >
                  <SectionIcon size={19} strokeWidth={2} color={SECTION_ICON_COLOR[section.key]} />
                </View>
                <View style={styles.sectionTextBlock}>
                  <Text style={[styles.sectionLabel, isDone && styles.sectionLabelDone]}>
                    {section.label}
                  </Text>
                  <Text style={styles.sectionSubtitle}>
                    {section.meta ?? SECTION_SUBTITLES[section.key]}
                  </Text>
                </View>
                {isDisabled && section.comingSoon ? (
                  <Text style={styles.sectionMeta}>coming soon</Text>
                ) : isDone ? (
                  <View style={styles.doneCircle}>
                    <Check size={14} strokeWidth={2.6} color={BRAND.colors.mossGreen} />
                  </View>
                ) : !isDisabled ? (
                  <ChevronRight size={15} strokeWidth={2} color={BRAND.colors.inkMuted} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.finishButton}
          onPress={onFinish}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Done for now"
        >
          <Text style={styles.finishButtonText}>Done for now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.exitRow}
          onPress={onExit}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Save and exit"
        >
          <Text style={styles.exitText}>Save and exit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.linenCream,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 24,
  },

  // ── Header (mirrors NowHeader topRow exactly) ─────────────────────────────
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing[4],
    paddingTop: t.spacing[4],
  },
  greetingColumn: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  mascotColumn: {
    marginLeft: t.spacing[3],
    marginTop: 2,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  greeting: {
    fontSize: t.typography.size.xl,
    lineHeight: Math.ceil(t.typography.size.xl * 1.3),
    fontFamily: t.typography.fontFamily.bold,
    color: t.colors.moss,
  },
  dateTime: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginTop: 0,
  },
  headerDivider: {
    width: '32%',
    height: 3,
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 2,
    marginTop: 8,
  },

  // ── "What's a sweep?" collapsible ─────────────────────────────────────────
  explainerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: t.spacing[4],
    paddingTop: 10,
    paddingBottom: 2,
  },
  explainerTriggerText: {
    fontSize: 13,
    fontFamily: t.typography.fontFamily.medium,
    color: BRAND.colors.mossGreen,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  explainerBody: {
    backgroundColor: TINT_SAGE_STRONG,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginTop: 8,
    marginHorizontal: t.spacing[4],
  },
  explainerBodyText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: t.typography.fontFamily.regular,
    color: BRAND.colors.mossGreen,
  },

  // ── Hero card ─────────────────────────────────────────────────────────────
  heroCard: {
    ...CARD_SHADOW,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderColor: 'rgba(224,196,122,0.45)',
    marginTop: 18,
    marginHorizontal: t.spacing[4],
  },
  heroChip: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: TINT_GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: 17,
    fontFamily: t.typography.fontFamily.bold,
    color: BRAND.colors.charcoalInk,
  },
  heroSub: {
    fontSize: 12.5,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginTop: 2,
  },

  // ── "Or one at a time" label (TimeBlockSection treatment) ─────────────────
  orLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.spacing[4],
    marginTop: 22,
    marginBottom: 10,
  },
  orAccent: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    backgroundColor: BRAND.colors.inkMuted,
    marginRight: 10,
  },
  orLabel: {
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: BRAND.colors.inkMuted,
  },

  // ── Section cards ─────────────────────────────────────────────────────────
  sectionList: {
    gap: 10,
    paddingHorizontal: t.spacing[4],
  },
  sectionCard: {
    ...CARD_SHADOW,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
  },
  sectionCardDone: {
    backgroundColor: TINT_SAGE,
    borderColor: 'rgba(46,85,64,0.18)',
  },
  sectionCardDisabled: {
    opacity: 0.45,
  },
  sectionChip: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTextBlock: { flex: 1 },
  sectionLabel: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.bold,
    color: BRAND.colors.charcoalInk,
  },
  sectionLabelDone: {
    color: BRAND.colors.inkMuted,
  },
  sectionSubtitle: {
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginTop: 1,
  },
  sectionMeta: {
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
  },
  doneCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: BRAND.colors.sageMist,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: t.spacing[4],
    paddingTop: 10,
    paddingBottom: 12,
    gap: 2,
    backgroundColor: t.colors.linenCream,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
  },
  finishButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: BRAND.colors.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  finishButtonText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.bold,
    color: BRAND.colors.linenCream,
  },
  exitRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  exitText: {
    fontSize: 13,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
  },
}));
