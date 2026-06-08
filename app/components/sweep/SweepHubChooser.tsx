/**
 * SweepHubChooser -- Week-mode sweep hub (step 0.1).
 *
 * Shows a chooser of planning spokes. The user can either
 * "Lead me through it all" (chained linear run) or pick individual
 * spokes a la carte. Each completed spoke shows a tick but remains
 * re-enterable. Habits and Events are visible but disabled (coming soon).
 */

import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import {
  CalendarRange,
  Compass,
  Repeat,
  CalendarDays,
  Check,
  ChevronRight,
  Sparkles,
  LogOut,
} from 'lucide-react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';

export type HubSectionKey = 'todos' | 'intention' | 'habits' | 'events';

export interface HubSection {
  key: HubSectionKey;
  label: string;
  description: string;
  disabled?: boolean;
  comingSoon?: boolean;
}

export const HUB_SECTIONS: HubSection[] = [
  {
    key: 'todos',
    label: 'Plan my todos',
    description: 'Assign, schedule, and triage what needs doing.',
  },
  {
    key: 'intention',
    label: 'Set my intention',
    description: 'One sentence to anchor the week.',
  },
  {
    key: 'habits',
    label: 'Check in on habits',
    description: 'Log and review your weekly habits.',
  },
  {
    key: 'events',
    label: "Look at what's coming",
    description: 'Glance at what is on the calendar this week.',
    disabled: true,
    comingSoon: true,
  },
];

const SECTION_ICONS: Record<
  HubSectionKey,
  React.ComponentType<{ size: number; strokeWidth: number; color: string }>
> = {
  todos: CalendarRange,
  intention: Compass,
  habits: Repeat,
  events: CalendarDays,
};

export interface SweepHubChooserProps {
  completed: Set<string>;
  onPickSection: (key: HubSectionKey) => void;
  onLeadThroughAll: () => void;
  onFinish: () => void;
  onExit: () => void;
}

export function SweepHubChooser({
  completed,
  onPickSection,
  onLeadThroughAll,
  onFinish,
  onExit,
}: SweepHubChooserProps) {
  const enabledCompleted = HUB_SECTIONS.filter((s) => !s.disabled && completed.has(s.key)).length;
  const enabledTotal = HUB_SECTIONS.filter((s) => !s.disabled).length;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.heading}>What do you want to plan?</Text>
          <Text style={styles.subheading}>
            Work through it all, or pick the parts that matter most right now.
          </Text>
        </View>

        {/* Lead me through it all -- prominent primary */}
        <TouchableOpacity
          style={styles.leadCard}
          onPress={onLeadThroughAll}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Lead me through it all"
        >
          <View style={styles.leadCardIconWrap}>
            <Sparkles size={22} strokeWidth={2} color={BRAND.colors.mossGreen} />
          </View>
          <View style={styles.leadCardText}>
            <Text style={styles.leadCardTitle}>Lead me through it all</Text>
            <Text style={styles.leadCardDesc}>
              Decisions, intention, and habits in one guided run.
            </Text>
          </View>
          <ChevronRight size={18} strokeWidth={2.5} color={BRAND.colors.mossGreen} />
        </TouchableOpacity>

        {/* Section divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>or pick a section</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* A-la-carte spokes */}
        <View style={styles.spokeList}>
          {HUB_SECTIONS.map((section) => {
            const isDone = completed.has(section.key);
            const SectionIcon = SECTION_ICONS[section.key];
            const isDisabled = !!section.disabled;

            return (
              <TouchableOpacity
                key={section.key}
                style={[
                  styles.spokeCard,
                  isDone && styles.spokeCardDone,
                  isDisabled && styles.spokeCardDisabled,
                ]}
                onPress={() => !isDisabled && onPickSection(section.key)}
                activeOpacity={isDisabled ? 1 : 0.78}
                accessibilityRole="button"
                accessibilityLabel={section.label}
                accessibilityState={{ disabled: isDisabled }}
              >
                <View
                  style={[
                    styles.spokeIconWrap,
                    isDone && styles.spokeIconWrapDone,
                    isDisabled && styles.spokeIconWrapDisabled,
                  ]}
                >
                  <SectionIcon
                    size={18}
                    strokeWidth={2}
                    color={
                      isDone
                        ? BRAND.colors.mossGreen
                        : isDisabled
                          ? BRAND.colors.inkMuted
                          : BRAND.colors.charcoalInk
                    }
                  />
                </View>
                <View style={styles.spokeTextBlock}>
                  <View style={styles.spokeLabelRow}>
                    <Text style={[styles.spokeLabel, isDisabled && styles.spokeLabelDisabled]}>
                      {section.label}
                    </Text>
                    {section.comingSoon && (
                      <View style={styles.comingSoonPill}>
                        <Text style={styles.comingSoonText}>coming soon</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.spokeDesc, isDisabled && styles.spokeDescDisabled]}>
                    {section.description}
                  </Text>
                </View>
                {isDone && !isDisabled ? (
                  <View style={styles.doneCheck}>
                    <Check size={14} strokeWidth={2.5} color={BRAND.colors.mossGreen} />
                  </View>
                ) : !isDisabled ? (
                  <ChevronRight size={16} strokeWidth={2} color={BRAND.colors.inkMuted} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Progress hint */}
        {enabledCompleted > 0 && (
          <Text style={styles.progressHint}>
            {enabledCompleted} of {enabledTotal} sections done
          </Text>
        )}
      </ScrollView>

      {/* Footer actions */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.finishButton, enabledCompleted === 0 && styles.finishButtonMuted]}
          onPress={onFinish}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Done for now"
        >
          <Text
            style={[
              styles.finishButtonText,
              enabledCompleted === 0 && styles.finishButtonTextMuted,
            ]}
          >
            Done for now
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.exitRow}
          onPress={onExit}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Save and exit"
        >
          <LogOut size={13} strokeWidth={2} color={BRAND.colors.inkMuted} />
          <Text style={styles.exitText}>Save and exit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 24,
  },
  header: { marginBottom: 28 },
  heading: {
    fontSize: 26,
    fontFamily: 'Fraunces_700Bold_Italic',
    fontWeight: '700',
    fontStyle: 'italic',
    color: BRAND.colors.charcoalInk,
    marginBottom: 8,
    lineHeight: 33,
    letterSpacing: -0.4,
  },
  subheading: {
    fontSize: 15,
    fontWeight: '400',
    color: 'rgba(34,34,34,0.60)',
    lineHeight: 22,
  },

  // Lead card
  leadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: BRAND.radius.xl,
    paddingVertical: 20,
    paddingHorizontal: 18,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  leadCardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(46,85,64,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadCardText: { flex: 1 },
  leadCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
    marginBottom: 3,
  },
  leadCardDesc: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(46,85,64,0.75)',
    lineHeight: 18,
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(34,34,34,0.10)',
  },
  dividerLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },

  // Spoke list
  spokeList: { gap: 10, marginBottom: 16 },
  spokeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderRadius: BRAND.radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.09)',
  },
  spokeCardDone: {
    borderColor: 'rgba(191,216,192,0.70)',
    backgroundColor: 'rgba(191,216,192,0.15)',
  },
  spokeCardDisabled: {
    opacity: 0.52,
  },
  spokeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(34,34,34,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spokeIconWrapDone: {
    backgroundColor: 'rgba(191,216,192,0.30)',
  },
  spokeIconWrapDisabled: {
    backgroundColor: 'rgba(34,34,34,0.04)',
  },
  spokeTextBlock: { flex: 1 },
  spokeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  spokeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  spokeLabelDisabled: { color: BRAND.colors.inkMuted },
  spokeDesc: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(34,34,34,0.55)',
    lineHeight: 16,
  },
  spokeDescDisabled: { color: 'rgba(34,34,34,0.35)' },
  comingSoonPill: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(34,34,34,0.07)',
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    letterSpacing: 0.3,
  },
  doneCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(191,216,192,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(191,216,192,0.80)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Progress hint
  progressHint: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginBottom: 8,
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 2,
    backgroundColor: BRAND.colors.linenCream,
    borderTopWidth: 1,
    borderTopColor: 'rgba(34,34,34,0.06)',
  },
  finishButton: {
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: BRAND.radius.xl,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  finishButtonMuted: {
    backgroundColor: 'rgba(191,216,192,0.35)',
    shadowOpacity: 0,
    elevation: 0,
  },
  finishButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  finishButtonTextMuted: {
    color: 'rgba(46,85,64,0.50)',
  },
  exitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  exitText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
});
