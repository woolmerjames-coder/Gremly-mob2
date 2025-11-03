import React from 'react';
import { View } from 'react-native';

interface DotlineProps {
  total: number;
  filled: number;
  color: string;
}

export function Dotline({ total, filled, color }: DotlineProps) {
  const safeTotal = Math.max(total, 0);
  const safeFilled = Math.max(Math.min(filled, safeTotal), 0);
  const dots = Array.from({ length: safeTotal });

  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {dots.map((_, index) => (
        <View
          key={`dot-${index}`}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: index < safeFilled ? color : 'rgba(0,0,0,0.12)',
          }}
        />
      ))}
    </View>
  );
}
