import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  ScrollView,
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
import { getTierForAge } from '../../lib/constants/soulDocument';

import MascotLottie from '../../app/components/MascotLottie';

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
  /** If true, opens directly to the gauge page (e.g., from fed toast tap) */
  initialPage?: 'help' | 'gauge';
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

export default function GremlyHelpCard({
  visible,
  onDismiss,
  screen,
  initialPage,
}: GremlyHelpCardProps) {
  const content = HELP_CONTENT[screen];
  const [activePage, setActivePage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const gremlyAge = useGremlyStore((s) => s.gremlyAge);
  const feedingGaugeValue = useGremlyStore((s) => s.feedingGaugeValue);
  const isFedToday = useGremlyStore((s) => s.isFedToday);
  const fedDaysCount = useGremlyStore((s) => s.fedDaysCount);
  const isTrainingMode = useGremlyStore((s) => s.isTrainingMode);
  const feedingHistory = useGremlyStore((s) => s.feedingHistory);
  const fetchFeedingHistory = useGremlyStore((s) => s.fetchFeedingHistory);

  const currentTier = getTierForAge(gremlyAge);

  const gaugePercent = Math.min(Math.round(feedingGaugeValue * 100), 100);
  const nextAge = gremlyAge + 1;

  // During training: page 1 = help/checklist, page 2 = gauge
  // After training: page 1 = gauge (promoted), page 2 = help (demoted)
  const gaugeFirst = !isTrainingMode;

  const getInitialPage = useCallback(() => {
    if (initialPage === 'gauge') {
      return gaugeFirst ? 0 : 1;
    }
    if (initialPage === 'help') {
      return gaugeFirst ? 1 : 0;
    }
    return 0; // Default to first page
  }, [initialPage, gaugeFirst]);

  useEffect(() => {
    if (visible) {
      const page = getInitialPage();
      setActivePage(page);
      if (page > 0) {
        setTimeout(() => {
          scrollRef.current?.scrollTo({ x: page * CARD_WIDTH, animated: false });
        }, 50);
      }
    }
  }, [visible, getInitialPage]);

  useEffect(() => {
    if (visible) {
      fetchFeedingHistory();
    }
  }, [visible, fetchFeedingHistory]);

  const getDayLabel = (dateStr: string): string => {
    const d = new Date(dateStr + 'T12:00:00');
    return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
  };

  const fedDaysInWeek = feedingHistory.filter((d) => d.isFed).length;

  // Calculate current streak (consecutive fed days ending today or yesterday)
  const currentStreak = (() => {
    let streak = 0;
    for (let i = feedingHistory.length - 1; i >= 0; i--) {
      if (feedingHistory[i].isFed) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  })();

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

  const renderGaugePage = () => (
    <View style={styles.page}>
      {/* Tier + Age header */}
      <Text style={styles.title}>
        {currentTier.name} · Age {gremlyAge}
      </Text>

      {/* MascotLottie with fill */}
      <View style={styles.mascotContainer}>
        <MascotLottie />
      </View>

      {/* Fed status text */}
      <Text style={[styles.fedStatus, isFedToday && styles.fedStatusComplete]}>
        {isFedToday ? 'Full today ✓' : `${gaugePercent}% full`}
      </Text>

      {/* Divider */}
      <View style={styles.sectionDivider} />

      {/* 7-day lookback */}
      <Text style={styles.lookbackLabel}>Last 7 days</Text>
      <View style={styles.lookbackRow}>
        {feedingHistory.map((day, i) => {
          const isToday = i === feedingHistory.length - 1;
          return (
            <View key={day.date} style={styles.lookbackDayContainer}>
              <View
                style={[
                  styles.lookbackDot,
                  day.isFed ? styles.lookbackDotFed : styles.lookbackDotMissed,
                  isToday && styles.lookbackDotToday,
                ]}
              />
              <Text style={[styles.lookbackDayLabel, isToday && styles.lookbackDayLabelToday]}>
                {getDayLabel(day.date)}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Streak + growth info */}
      <View style={styles.bottomInfoRow}>
        {currentStreak > 0 && (
          <>
            <Flame size={14} color={c.goldenPear} fill={c.goldenPear} />
            <Text style={styles.bottomInfoStreak}>{currentStreak} day streak</Text>
            <Text style={styles.bottomInfoDivider}>·</Text>
          </>
        )}
        <Text style={styles.bottomInfoGrowth}>
          {fedDaysCount} of 3 days to age {nextAge}
        </Text>
      </View>
    </View>
  );

  const renderHelpPage = () => (
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
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />

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
            scrollEnabled={true}
            style={styles.scrollView}
          >
            {gaugeFirst ? (
              <>
                {renderGaugePage()}
                {renderHelpPage()}
              </>
            ) : (
              <>
                {renderHelpPage()}
                {renderGaugePage()}
              </>
            )}
          </ScrollView>

          <View style={styles.dotsRow}>
            <Pressable onPress={() => goToPage(0)} hitSlop={8}>
              <View style={[styles.dot, activePage === 0 && styles.dotActive]} />
            </Pressable>
            <Pressable onPress={() => goToPage(1)} hitSlop={8}>
              <View style={[styles.dot, activePage === 1 && styles.dotActive]} />
            </Pressable>
          </View>

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
    height: 120,
    justifyContent: 'center',
  },
  fedStatus: {
    fontSize: 16,
    fontWeight: '600',
    color: c.mossGreen,
    textAlign: 'center',
    marginBottom: 16,
  },
  fedStatusComplete: {
    color: c.goldenPear,
  },
  sectionDivider: {
    width: 40,
    height: 2,
    backgroundColor: c.borderSubtle,
    borderRadius: 1,
    alignSelf: 'center',
    marginBottom: 14,
  },
  lookbackLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: c.inkMuted,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  lookbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
    marginBottom: 14,
  },
  lookbackDayContainer: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  lookbackDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  lookbackDotFed: {
    backgroundColor: c.mossGreen,
  },
  lookbackDotMissed: {
    backgroundColor: '#EDEFF2',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  lookbackDotToday: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: c.goldenPear,
  },
  lookbackDayLabel: {
    fontSize: 10,
    color: c.inkMuted,
    fontWeight: '400',
  },
  lookbackDayLabelToday: {
    fontWeight: '600',
    color: c.charcoalInk,
  },
  bottomInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bottomInfoStreak: {
    fontSize: 13,
    fontWeight: '600',
    color: c.goldenPear,
  },
  bottomInfoDivider: {
    fontSize: 13,
    color: c.inkMuted,
    marginHorizontal: 2,
  },
  bottomInfoGrowth: {
    fontSize: 13,
    color: c.inkMuted,
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
