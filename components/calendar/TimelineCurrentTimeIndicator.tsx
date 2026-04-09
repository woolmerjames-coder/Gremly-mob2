import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { getDateService } from '../../lib/date';

const LABEL_WIDTH = 50;
const DOT_SIZE = 8;
const MOSS_GREEN = '#6B8F71';

interface TimelineCurrentTimeIndicatorProps {
  hourHeight: number;
}

export default function TimelineCurrentTimeIndicator({
  hourHeight,
}: TimelineCurrentTimeIndicatorProps) {
  const [top, setTop] = useState(() => computeTop(hourHeight));

  useEffect(() => {
    const id = setInterval(() => setTop(computeTop(hourHeight)), 60_000);
    return () => clearInterval(id);
  }, [hourHeight]);

  return (
    <View style={[styles.container, { top }]} pointerEvents="none">
      <View style={styles.dot} />
      <View style={styles.line} />
    </View>
  );
}

function computeTop(hourHeight: number): number {
  const now = getDateService().now();
  return (now.getHours() + now.getMinutes() / 60) * hourHeight;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: LABEL_WIDTH - DOT_SIZE / 2,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: MOSS_GREEN,
  },
  line: {
    flex: 1,
    height: 1.5,
    backgroundColor: MOSS_GREEN,
  },
});
