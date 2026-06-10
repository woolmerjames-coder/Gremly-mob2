/**
 * SweepHubChooser -- Week-mode sweep hub (step 0.1).
 *
 * Shows a chooser of planning spokes. The user can either
 * "Lead me through it all" (chained linear run) or pick individual
 * spokes a la carte. Each completed spoke shows a tick but remains
 * re-enterable.
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
  ArrowRight,
} from 'lucide-react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';

export type HubSectionKey = 'todos' | 'intention' | 'habits' | 'events';

export interface HubSection {
  key: HubSectionKey;
  label: string;
  meta?: string;
  disabled?: boolean;
  comingSoon?: boolean;
}

export const HUB_SECTIONS: HubSection[] = [
  {
    key: 'todos',
    label: 'Todos',
  },
  {
    key: 'intention',
    label: 'Intention',
  },
  {
    key: 'habits',
    label: 'Habits',
  },
  {
    key: 'events',
    label: 'Week ahead',
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
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.eyebrowRow}>
          <Text style={styles.eyebrow}>WEEKLY SWEEP</Text>
          <Text style={styles.weekRange}>{weekLabel}</Text>
        </View>
        <Text style={styles.heading}>Plan your week.</Text>

        {/* Hero card */}
        <TouchableOpacity
          style={styles.heroCard}
          onPress={onLeadThroughAll}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Lead me through it all"
        >
          <View style={styles.heroCardText}>
            <Text style={styles.heroCardTitle}>Lead me through it all</Text>
            <Text style={styles.heroCardSub}>Guided · about 5 minutes</Text>
          </View>
          <View style={styles.heroCardArrow}>
            <ArrowRight size={19} strokeWidth={2.3} color={BRAND.colors.mossGreen} />
          </View>
        </TouchableOpacity>

        {/* Section list */}
        <Text style={styles.orLabel}>OR ONE AT A TIME</Text>
        <View>
          {HUB_SECTIONS.map((section, idx) => {
            const isDone = completed.has(section.key);
            const isDisabled = !!section.disabled;
            const isLast = idx === HUB_SECTIONS.length - 1;
            const SectionIcon = SECTION_ICONS[section.key];

            return (
              <TouchableOpacity
                key={section.key}
                style={[
                  styles.sectionRow,
                  !isLast && styles.sectionRowBorder,
                  isDisabled && styles.sectionRowDisabled,
                ]}
                onPress={() => !isDisabled && onPickSection(section.key)}
                activeOpacity={isDisabled ? 1 : 0.72}
                accessibilityRole="button"
                accessibilityLabel={section.label}
                accessibilityState={{ disabled: isDisabled }}
              >
                <SectionIcon
                  size={21}
                  strokeWidth={1.9}
                  color={
                    isDone
                      ? 'rgba(46,85,64,0.45)'
                      : isDisabled
                        ? 'rgba(46,85,64,0.30)'
                        : BRAND.colors.mossGreen
                  }
                />
                <Text style={[styles.sectionLabel, isDone && styles.sectionLabelDone]}>
                  {section.label}
                </Text>
                {section.meta || (isDisabled && section.comingSoon) ? (
                  <Text style={styles.sectionMeta}>
                    {isDisabled && section.comingSoon ? 'coming soon' : section.meta}
                  </Text>
                ) : null}
                {isDone ? (
                  <View style={styles.doneCircle}>
                    <Check size={12} strokeWidth={2.8} color={BRAND.colors.mossGreen} />
                  </View>
                ) : !isDisabled ? (
                  <ChevronRight size={15} strokeWidth={2.2} color="rgba(34,34,34,0.30)" />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer actions */}
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

  // Header
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: BRAND.colors.mossGreen,
  },
  weekRange: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(34,34,34,0.45)',
  },
  heading: {
    fontSize: 38,
    fontFamily: 'Fraunces_700Bold_Italic',
    fontWeight: '700',
    fontStyle: 'italic',
    color: BRAND.colors.charcoalInk,
    lineHeight: 40,
    letterSpacing: -0.5,
    marginBottom: 28,
  },

  // Hero card
  heroCard: {
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 30,
  },
  heroCardText: { flex: 1 },
  heroCardTitle: {
    fontSize: 23,
    fontFamily: 'Fraunces_700Bold_Italic',
    fontWeight: '700',
    fontStyle: 'italic',
    color: BRAND.colors.linenCream,
    lineHeight: 26,
    marginBottom: 6,
  },
  heroCardSub: {
    fontSize: 12.5,
    fontWeight: '500',
    color: 'rgba(249,246,241,0.62)',
  },
  heroCardArrow: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: BRAND.colors.goldenPear,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section list
  orLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: 'rgba(34,34,34,0.38)',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 19,
    paddingHorizontal: 2,
  },
  sectionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34,34,34,0.08)',
  },
  sectionRowDisabled: {
    opacity: 0.45,
  },
  sectionLabel: {
    flex: 1,
    fontSize: 16.5,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: BRAND.colors.charcoalInk,
  },
  sectionLabelDone: {
    color: 'rgba(34,34,34,0.45)',
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(34,34,34,0.38)',
  },
  doneCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BRAND.colors.sageMist,
    alignItems: 'center',
    justifyContent: 'center',
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
    height: 54,
    borderRadius: 27,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(46,85,64,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishButtonText: {
    fontSize: 15.5,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  exitRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  exitText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(34,34,34,0.40)',
  },
});
