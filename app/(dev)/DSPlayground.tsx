// @ts-nocheck - Dev file using className (legacy, requires NativeWind)
/**
 * DSPlayground - Smoke test for new design system primitives
 */

import React, { useState } from 'react';
import { Box, Text, Button, Input, Chip } from '../../ui';

export default function DSPlayground() {
  const [inputValue, setInputValue] = useState('');
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set(['daily']));

  const toggleChip = (id: string) => {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Box p={4} bg="bg" style={{ flex: 1 }}>
      <Box gap={4}>
        <Text variant="display">Design System Playground</Text>

        <Text variant="title">Typography Variants</Text>
        <Text variant="body">This is body text - the default variant.</Text>
        <Text variant="label">Label text for form fields</Text>
        <Text variant="subtle">Subtle text for secondary information</Text>

        <Text variant="title">Buttons</Text>
        <Box gap={2}>
          <Button title="Primary Button" onPress={() => console.log('Primary')} variant="primary" />
          <Button title="Neutral Button" onPress={() => console.log('Neutral')} variant="neutral" />
          <Button title="Danger Button" onPress={() => console.log('Danger')} variant="danger" />
        </Box>

        <Text variant="title">Input</Text>
        <Input
          label="Email Address"
          value={inputValue}
          onChangeText={setInputValue}
          placeholder="Enter your email"
          keyboardType="email-address"
        />

        <Text variant="title">Chips</Text>
        <Box row gap={2}>
          <Chip
            label="Daily"
            selected={selectedChips.has('daily')}
            onPress={() => toggleChip('daily')}
          />
          <Chip
            label="Weekly"
            selected={selectedChips.has('weekly')}
            onPress={() => toggleChip('weekly')}
          />
          <Chip
            label="Monthly"
            selected={selectedChips.has('monthly')}
            onPress={() => toggleChip('monthly')}
          />
        </Box>
      </Box>
    </Box>
  );
}
