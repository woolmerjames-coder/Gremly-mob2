import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  ScrollView,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  ArrowDownToLine,
  Sparkles,
  Moon,
  CheckCircle2,
  ListChecks,
  PlusCircle,
  Inbox,
  ArrowRightLeft,
  Grip,
  FolderOpen,
  MessageCircle,
  Tag,
  Settings,
  Search,
  LayoutGrid,
  ArrowRight,
  CircleDot,
  Flame,
  Flag,
  CalendarCheck,
  Coffee,
} from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../assets/mascot/gremly-mascot.png');

const c = BRAND.colors;
const ICON_SIZE = 20;
const ICON_COLOR = c.mossGreen;
const CARD_WIDTH = 300;
const CARD_PADDING = 24;

type ScreenType =
  | 'minddrop'
  | 'today'
  | 'organize'
  | 'sweep'
  | 'sweep-habits'
  | 'spaces'
  | 'space-detail'
  | 'hub';

interface GremlyHelpCardProps {
  visible: boolean;
  onDismiss: () => void;
  screen: ScreenType;
}

interface HelpStep {
  icon: React.ReactNode;
  text: string;
}

interface HelpContent {
  title: string;
  steps: HelpStep[];
}

const HELP_CONTENT: Record<ScreenType, HelpContent> = {
  minddrop: {
    title: 'Mind Drop',
    steps: [
      {
        icon: <ArrowDownToLine size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Type anything \u2014 tasks, ideas, reminders',
      },
      {
        icon: <Sparkles size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Gremly figures out what it is',
      },
      {
        icon: <Moon size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Review it all in Evening Sweep',
      },
    ],
  },
  today: {
    title: 'Today',
    steps: [
      {
        icon: <ListChecks size={ICON_SIZE} color={ICON_COLOR} />,
        text: "What you've committed to for today",
      },
      {
        icon: <CheckCircle2 size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Check off tasks, check your calendar and habits',
      },
      {
        icon: <Sparkles size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Tap Organize to prioritize and schedule your day',
      },
    ],
  },
  sweep: {
    title: 'Evening Sweep',
    steps: [
      {
        icon: <Inbox size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Your drops and open items, waiting for decisions',
      },
      {
        icon: <ArrowRightLeft size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Swipe right to keep, left to let go',
      },
      {
        icon: <Grip size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Tap the buttons to schedule or refile',
      },
    ],
  },
  'sweep-habits': {
    title: 'Habits today',
    steps: [
      {
        icon: <ArrowRight size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Building a habit? Slide right to mark it done',
      },
      {
        icon: <CircleDot size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Breaking a habit? Hold the button to confirm you held strong',
      },
      {
        icon: <Flame size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Every day counts \u2014 your streaks build here',
      },
    ],
  },
  spaces: {
    title: 'Spaces',
    steps: [
      {
        icon: <FolderOpen size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Areas of your life \u2014 work, health, projects, and anything else',
      },
      {
        icon: <Sparkles size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Gremly suggests new Spaces based on your drops',
      },
      {
        icon: <PlusCircle size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Create your own or tap Add to accept a suggestion',
      },
    ],
  },
  'space-detail': {
    title: 'Inside a Space',
    steps: [
      {
        icon: <MessageCircle size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Chat with Gremly about anything here',
      },
      {
        icon: <Tag size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Assign todos, habits, and notes \u2014 or create them by chat',
      },
      {
        icon: <Flag size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Set a goal to give this Space direction',
      },
    ],
  },
  organize: {
    title: 'Organize',
    steps: [
      {
        icon: <CalendarCheck size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Pick what matters today and lock in 1\u20133 items',
      },
      {
        icon: <Sparkles size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Check your calendar and let Gremly organize the rest',
      },
      {
        icon: <Coffee size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Takes a couple of minutes \u2014 do it over coffee',
      },
    ],
  },
  hub: {
    title: 'Hub',
    steps: [
      {
        icon: <Search size={ICON_SIZE} color={ICON_COLOR} />,
        text: "Search anything you've ever dropped",
      },
      {
        icon: <LayoutGrid size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Browse by timeline, journals, people, or week',
      },
      {
        icon: <Settings size={ICON_SIZE} color={ICON_COLOR} />,
        text: 'Adjust notifications, preferences, and account',
      },
    ],
  },
};

export default function GremlyHelpCard({ visible, onDismiss, screen }: GremlyHelpCardProps) {
  const content = HELP_CONTENT[screen];
  const [activePage, setActivePage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const gremlyAge = useGremlyStore((s) => s.gremlyAge);
  const todayDropsCount = useGremlyStore((s) => s.todayDropsCount);
  const todaySweepsCount = useGremlyStore((s) => s.todaySweepsCount);
  const hasPage2 = gremlyAge > 0;

  const goToPage = useCallback((page: number) => {
    scrollRef.current?.scrollTo({ x: page * CARD_WIDTH, animated: true });
    setActivePage(page);
  }, []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
    setActivePage(page);
  }, []);

  const handleDismiss = useCallback(() => {
    setActivePage(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
    onDismiss();
  }, [onDismiss]);

  const renderRitualDots = (filled: number, total: number) => {
    const dots: string[] = [];
    for (let i = 0; i < total; i++) {
      dots.push(i < filled ? '\u25CF' : '\u25CB');
    }
    return dots.join('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        {/* Backdrop - tapping dismisses */}
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />

        {/* Card - sibling of backdrop, not nested inside it */}
        <View style={styles.card}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            onScroll={handleScroll}
            scrollEventThrottle={16}
            scrollEnabled={hasPage2}
            style={styles.scrollView}
          >
            {/* Page 1: Help steps */}
            <View style={styles.page}>
              <Text style={styles.title}>{content.title}</Text>
              {content.steps.length > 0 && (
                <View style={styles.stepsContainer}>
                  {content.steps.map((step, i) => (
                    <View key={i} style={styles.stepRow}>
                      <View style={styles.stepIcon}>{step.icon}</View>
                      <Text style={styles.stepText}>{step.text}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Page 2: Gremly age and ritual progress */}
            {hasPage2 && (
              <View style={styles.page}>
                <Text style={styles.title}>{'Gremly \u00B7 Age ' + gremlyAge}</Text>
                <View style={styles.mascotContainer}>
                  <Image source={GREMLY_MASCOT} style={styles.mascotImage} resizeMode="contain" />
                </View>
                <Text style={styles.ritualLabel}>Today's ritual</Text>
                <View style={styles.ritualRow}>
                  <Text style={styles.ritualDots}>{renderRitualDots(todayDropsCount, 3)}</Text>
                  <Text style={styles.ritualText}>{todayDropsCount}/3 drops</Text>
                </View>
                <View style={styles.ritualRow}>
                  <Text style={styles.ritualDots}>{renderRitualDots(todaySweepsCount, 3)}</Text>
                  <Text style={styles.ritualText}>{todaySweepsCount}/3 sweeps</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Tappable dot indicators */}
          {hasPage2 && (
            <View style={styles.dotsRow}>
              <Pressable onPress={() => goToPage(0)} hitSlop={8}>
                <View style={[styles.dot, activePage === 0 && styles.dotActive]} />
              </Pressable>
              <Pressable onPress={() => goToPage(1)} hitSlop={8}>
                <View style={[styles.dot, activePage === 1 && styles.dotActive]} />
              </Pressable>
            </View>
          )}

          <Pressable style={styles.button} onPress={handleDismiss}>
            <Text style={styles.buttonText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BRAND.radius.lg,
    paddingTop: CARD_PADDING,
    paddingBottom: CARD_PADDING,
    width: CARD_WIDTH,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  scrollView: {
    width: CARD_WIDTH,
  },
  page: {
    width: CARD_WIDTH,
    paddingHorizontal: CARD_PADDING,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: c.charcoalInk,
    marginBottom: 20,
  },
  stepsContainer: {
    gap: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: c.sageMist,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepText: {
    fontSize: 15,
    color: c.charcoalInk,
    lineHeight: 22,
    flex: 1,
  },
  mascotContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  mascotImage: {
    width: 80,
    height: 80,
  },
  ritualLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: c.charcoalInk,
    marginBottom: 10,
  },
  ritualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  ritualDots: {
    fontSize: 14,
    color: c.mossGreen,
    marginRight: 8,
    letterSpacing: 2,
  },
  ritualText: {
    fontSize: 14,
    color: c.charcoalInk,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  dotActive: {
    backgroundColor: c.mossGreen,
  },
  button: {
    backgroundColor: c.mossGreen,
    borderRadius: BRAND.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    marginHorizontal: CARD_PADDING,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
