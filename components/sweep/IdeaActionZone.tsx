import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, CheckSquare, Lightbulb, RotateCcw } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { ActionPill } from './ActionPill';
import { ContextHeader } from './ContextHeader';
import { SpaceButton } from './SpaceButton';
import type { SweepCandidate, SweepCardMeta } from '../../lib/sweep/types';

type ResurfaceTiming = 'nextweek' | '2weeks' | 'pick';

type IdeaActionZoneProps = {
  candidate: SweepCandidate;
  meta: SweepCardMeta;
  selectedAction: 'resurface' | 'maketodo' | 'fine';
  onSelectAction: (action: 'resurface' | 'maketodo' | 'fine') => void;
  selectedResurfaceTiming: ResurfaceTiming | null;
  onSelectResurfaceTiming: (timing: ResurfaceTiming | null) => void;
  confirmedResurfaceDate: string | null;
  onRequestResurfaceDatePicker: () => void;
  selectedSpaceId: string | null;
  selectedSpaceName: string | null;
  onRequestSpacePicker: () => void;
  onClearSpace: () => void;
};

const RESURFACE_PILLS: { key: ResurfaceTiming; label: string }[] = [
  { key: 'nextweek', label: 'Next week' },
  { key: '2weeks', label: '2 weeks' },
  { key: 'pick', label: 'Pick...' },
];

export function IdeaActionZone({
  candidate: _candidate,
  meta: _meta,
  selectedAction,
  onSelectAction,
  selectedResurfaceTiming,
  onSelectResurfaceTiming,
  confirmedResurfaceDate,
  onRequestResurfaceDatePicker,
  selectedSpaceId,
  selectedSpaceName,
  onRequestSpacePicker,
  onClearSpace,
}: IdeaActionZoneProps) {
  return (
    <View style={styles.container}>
      <ContextHeader
        status="new"
        label="WHAT'S NEXT?"
        icon={<Lightbulb size={12} strokeWidth={2.5} color={BRAND.colors.mossGreen} />}
      />

      <View style={styles.pillGroup}>
        <ActionPill
          icon={<RotateCcw size={16} strokeWidth={2} />}
          label="Resurface later"
          active={selectedAction === 'resurface'}
          onPress={() => onSelectAction('resurface')}
        />
        <ActionPill
          icon={<CheckSquare size={16} strokeWidth={2} />}
          label="Make it a todo"
          active={selectedAction === 'maketodo'}
          onPress={() => onSelectAction('maketodo')}
        />
        <ActionPill
          icon={<Check size={16} strokeWidth={2} />}
          label="It's fine as is"
          active={selectedAction === 'fine'}
          onPress={() => onSelectAction('fine')}
        />
      </View>

      {selectedAction === 'resurface' && (
        <Animated.View entering={FadeInUp.duration(150)} style={styles.subPillRow}>
          {RESURFACE_PILLS.map(({ key, label }) => {
            const isActive = selectedResurfaceTiming === key;
            const displayLabel =
              key === 'pick' && confirmedResurfaceDate ? confirmedResurfaceDate : label;

            return (
              <Pressable
                key={key}
                style={[styles.subPill, isActive ? styles.subPillActive : styles.subPillInactive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (isActive) return;
                  if (key === 'pick') {
                    onRequestResurfaceDatePicker();
                    onSelectResurfaceTiming('pick');
                  } else {
                    onSelectResurfaceTiming(key);
                  }
                }}
              >
                <Text
                  style={[
                    styles.subPillText,
                    isActive ? styles.subPillTextActive : styles.subPillTextInactive,
                  ]}
                >
                  {displayLabel}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>
      )}

      <SpaceButton
        active={selectedSpaceId !== null}
        spaceName={selectedSpaceName}
        onPress={selectedSpaceId !== null ? onClearSpace : onRequestSpacePicker}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 22,
  },
  pillGroup: {
    gap: 6,
  },
  subPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    paddingLeft: 44,
  },
  subPill: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 12,
  },
  subPillInactive: {
    backgroundColor: 'rgba(191,216,192,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(191,216,192,0.2)',
  },
  subPillActive: {
    backgroundColor: 'rgba(191,216,192,0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(46,85,64,0.3)',
  },
  subPillText: {
    fontSize: 11,
  },
  subPillTextInactive: {
    fontWeight: '500',
    color: 'rgba(34,34,34,0.45)',
  },
  subPillTextActive: {
    fontWeight: '700',
    color: '#2E5540',
  },
});
