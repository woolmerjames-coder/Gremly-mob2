import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, Box, Button } from '../../../ui';
import { BRAND } from '../../../design/brand';
import ProgressRing from './ProgressRing';
import GlowPulse from './GlowPulse';

export type RowType = 'todo' | 'habit';

type Props = {
  id: string;
  type: RowType;
  title: string;
  dueTime?: string | null;
  habitProgress?: { done: number; target: number } | null;
  completed?: boolean;
  onComplete: (id: string) => Promise<void> | void;
};

export default function TodayRow({
  id,
  type,
  title,
  dueTime,
  habitProgress,
  completed = false,
  onComplete,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [glow, setGlow] = useState(false);

  const stripeColor = useMemo(() => {
    if (completed) return BRAND.colors.goldenPear;
    return type === 'todo' ? BRAND.colors.mossGreen : BRAND.colors.sageMist;
  }, [type, completed]);

  const progress = useMemo(() => {
    if (!habitProgress) return undefined;
    const target = Math.max(1, habitProgress.target || 1);
    const done = Math.min(target, habitProgress.done || 0);
    return { ratio: done / target, label: `${done}/${target}` };
  }, [habitProgress]);

  const handleComplete = async () => {
    setGlow(true);
    await onComplete(id);
    setTimeout(() => setGlow(false), 500);
  };

  return (
    <Pressable
      onPress={() => setExpanded((e) => !e)}
      style={[styles.rowWrap, BRAND.elevation.one]}
      testID={`row-${type}-${id}`}
      accessibilityLabel={`${title}. ${type === 'todo' ? 'Task' : 'Habit'}`}
      accessibilityHint="Tap to expand for details"
    >
      <GlowPulse visible={glow} />
      <View style={[styles.stripe, { backgroundColor: stripeColor }]} testID={`row-stripe-${id}`} />
      <Box row style={styles.rowContent}>
        <Box style={{ flex: 1 }}>
          <Text variant="body" style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {expanded && (
            <>
              {type === 'todo' && dueTime ? (
                <Text variant="subtle" style={{ color: BRAND.colors.inkMuted }}>
                  Due: {dueTime}
                </Text>
              ) : null}
              {type === 'habit' && progress ? (
                <Text variant="subtle" style={{ color: BRAND.colors.inkMuted }}>
                  Today: {progress.label}
                </Text>
              ) : null}
            </>
          )}
        </Box>

        {type === 'habit' && progress ? (
          <View style={styles.rightCluster} testID={`row-ring-${id}`}>
            <ProgressRing
              size={22}
              stroke={3}
              progress={progress.ratio}
              progressColor={BRAND.colors.mossGreen}
              trackColor="rgba(0,0,0,0.08)"
            />
          </View>
        ) : (
          <View style={styles.rightCluster}>
            <Button
              label={completed ? 'Done' : 'Mark'}
              variant={completed ? 'neutral' : 'primary'}
              onPress={handleComplete}
              testID={`row-complete-${id}`}
              accessibilityLabel={completed ? 'Completed' : 'Mark complete'}
            />
          </View>
        )}
      </Box>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowWrap: {
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: 12,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  rowContent: {
    alignItems: 'center',
    gap: 12,
  },
  rightCluster: { marginLeft: 8 },
  title: { fontWeight: '600', color: BRAND.colors.charcoalInk },
});
