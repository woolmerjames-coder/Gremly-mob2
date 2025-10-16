import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import MascotIcon from './MascotIcon';

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

  useEffect(() => {
    // Rotate prompts every 6 seconds
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % PROMPTS.length);
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  return (
    <View
      className="rounded-2xl border border-gray-300 bg-white/50 p-3 flex-row items-center gap-3 mt-4"
      accessibilityRole="text"
      accessibilityLabel={`Journal inspiration: ${PROMPTS[currentIndex]}`}
    >
      {/* Mascot icon - static for reduced motion */}
      <View className="shrink-0">
        <MascotIcon pose="celebrate" size={32} />
      </View>

      {/* Rotating prompt text */}
      <Text className="text-sm text-gray-700 flex-1 italic">{PROMPTS[currentIndex]}</Text>
    </View>
  );
}
