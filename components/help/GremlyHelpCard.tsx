import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Image } from 'react-native';
import { Lightbulb } from 'lucide-react-native';
import { BRAND } from '../../design/brand';

const c = BRAND.colors;

type ScreenType = 'minddrop' | 'today' | 'sweep' | 'spaces' | 'hub';

interface GremlyHelpCardProps {
  visible: boolean;
  onDismiss: () => void;
  screen: ScreenType;
}

interface HelpContent {
  title: string;
  description: string;
  tip: string;
  footer: string;
}

const HELP_CONTENT: Record<ScreenType, HelpContent> = {
  minddrop: {
    title: "What's Mind Drop?",
    description:
      'Your mental inbox. Drop anything — tasks, ideas, worries. This is how you feed Gremly.',
    tip: 'Each drop becomes a Todo (something to do), Habit (something recurring), or Note (something to remember). Tap any card if Gremly guessed wrong.',
    footer:
      'Your drops flow into Evening Sweep for processing. Drop 3 each day to help Gremly grow.',
  },
  today: {
    title: "What's Today?",
    description: "Your focus list — what you've committed to today.",
    tip: 'Tick the checkbox to complete. Tap to see details.',
    footer: 'Use "+ Add to Today" for new tasks, or hit Sweep to process what\'s waiting.',
  },
  sweep: {
    title: "What's Sweep?",
    description:
      'Your evening triage. Decide what deserves attention — both new drops and open items that need decisions.',
    tip: 'Tap a button to choose what happens, then swipe right to confirm. Swipe left to archive or let go. Leave in the middle to skip for now.',
    footer: 'Process 3 cards each day to help Gremly grow.',
  },
  spaces: {
    title: 'What are Spaces?',
    description: 'Areas of your life that matter — work, health, relationships, whatever you need.',
    tip: 'Assign items to Spaces from Mind Drop or Sweep. Chat with Gremly about any Space for ideas and support.',
    footer: '',
  },
  hub: {
    title: "What's the Hub?",
    description:
      'Your settings. Adjust notifications, set when your day starts, manage your account.',
    tip: '',
    footer: '',
  },
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MASCOT = require('../../assets/mascot/gremly-mascot.png');

export default function GremlyHelpCard({ visible, onDismiss, screen }: GremlyHelpCardProps) {
  const content = HELP_CONTENT[screen];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Header row */}
          <View style={styles.headerRow}>
            <Image
              source={MASCOT}
              style={styles.mascot}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <Text style={styles.title}>{content.title}</Text>
          </View>

          {/* Description */}
          <Text style={styles.description}>{content.description}</Text>

          {/* Tip box (if tip exists) */}
          {content.tip ? (
            <View style={styles.tipBox}>
              <Lightbulb size={18} color={c.mossGreen} />
              <Text style={styles.tipText}>{content.tip}</Text>
            </View>
          ) : null}

          {/* Footer (if exists) */}
          {content.footer ? <Text style={styles.footer}>{content.footer}</Text> : null}

          {/* Got it button */}
          <Pressable style={styles.button} onPress={onDismiss}>
            <Text style={styles.buttonText}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BRAND.radius.lg,
    padding: 24,
    width: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mascot: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: c.charcoalInk,
    flex: 1,
  },
  description: {
    fontSize: 15,
    color: c.charcoalInk,
    marginTop: 12,
    lineHeight: 22,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: c.sageMist,
    borderRadius: BRAND.radius.md,
    padding: 12,
    marginTop: 16,
  },
  tipText: {
    fontSize: 14,
    color: c.inkSubtle,
    marginLeft: 10,
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    fontSize: 13,
    color: c.inkMuted,
    marginTop: 16,
    lineHeight: 18,
  },
  button: {
    backgroundColor: c.mossGreen,
    borderRadius: BRAND.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
