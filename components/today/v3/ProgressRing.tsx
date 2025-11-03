import React from 'react';
import Svg, { Circle } from 'react-native-svg';

type Props = {
  size?: number;
  stroke?: number;
  progress: number; // 0..1
  trackColor?: string;
  progressColor?: string;
};

export default function ProgressRing({
  size = 20,
  stroke = 3,
  progress,
  trackColor = 'rgba(0,0,0,0.08)',
  progressColor = '#2E5540',
}: Props) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));

  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={stroke}
        fill="transparent"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={progressColor}
        strokeWidth={stroke}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        fill="transparent"
      />
    </Svg>
  );
}
