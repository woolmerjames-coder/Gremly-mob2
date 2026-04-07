import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { getDateService } from '../../lib/date';

const HOUR_HEIGHT = 70;
const LABEL_WIDTH = 50;
const DOT_SIZE = 10;

export default function TimelineCurrentTimeIndicator() {
  const [top, setTop] = useState(() => computeTop());

  useEffect(() => {
    // Update every 60 seconds
    const id = setInterval(() => setTop(computeTop()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={[styles.container, { top }]} pointerEvents="none">
      <View style={styles.dot} />
      <View style={styles.line} />
    </View>
  );
}

function computeTop(): number {
  const now = getDateService().now();
  return (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT;
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
    backgroundColor: '#E53935',
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: '#E53935',
  },
});
