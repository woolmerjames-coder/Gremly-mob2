import { useState, useEffect } from 'react';
import MascotIcon from './MascotIcon';
import { Box, Text } from '../ui';
import { Card } from '../design-system';
import { useTokens } from '../design/makeStyles';

/**
 * JournalInspiration Component
 *
 * Displays rotating encouraging prompts for journal writing.
 * Changes every 6 seconds with a subtle mascot icon.
 * Respects reduced-motion preferences by showing static SVG only.
 */

const PROMPTS = [
  'What made you smile today?',
  'What are you grateful for right now?',
  "What's one thing you learned recently?",
  'How are you feeling in this moment?',
  'What would make tomorrow great?',
  "What's something you're proud of?",
];

export default function JournalInspiration() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const tokens = useTokens();

  useEffect(() => {
    // Rotate prompts every 6 seconds
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % PROMPTS.length);
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Card
      testID="journal-inspiration"
      variant="outlined"
      style={{
        marginTop: tokens.spacing[4],
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
      }}
      accessibilityRole="text"
      accessibilityLabel={`Journal inspiration: ${PROMPTS[currentIndex]}`}
    >
      <Box row center gap={3}>
        {/* Mascot icon - static for reduced motion */}
        <Box style={{ flexShrink: 0 }}>
          <MascotIcon pose="celebrate" size={32} />
        </Box>

        {/* Rotating prompt text */}
        <Text
          variant="body"
          style={{
            flex: 1,
            fontStyle: 'italic',
            color: tokens.colors.subtle,
          }}
        >
          {PROMPTS[currentIndex]}
        </Text>
      </Box>
    </Card>
  );
}
