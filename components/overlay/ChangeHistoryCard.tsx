/**
 * The item's history in its overlay: what chat or Mind Drop changed, and a
 * label over the words the user first wrote while those words are untouched.
 *
 * The card leads with the latest change ("Moved to Mon 5 Oct, 3:00pm" over
 * "was Fri 2 Oct, 10:00am · from Mind Drop · just now"). With more than one
 * change, "N changes" opens the rest, newest first, ending with where the item
 * began. The words themselves stay where they were, a shade softer, under
 * "Your original drop", so the first thing read is how the item is now.
 *
 * Mockup is spec: the "Item history after an edit" canvas, Recommended and
 * Two changes artboards (September 2026). Lucide icons only.
 */
import React, { useState } from 'react';
import {
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  FilePlus2,
  FileText,
  Flame,
  Inbox,
  Pencil,
  Repeat,
} from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { getDateService } from '../../lib/date/DateService';
import {
  changeDetail,
  changeLine,
  originLine,
  type ChangeEntry,
  type HistoryIcon,
} from '../../lib/chat/changeHistory';

/** The first words, a shade softer than text the user is writing now. */
export const ORIGINAL_TEXT_COLOR = '#4A4F55';

const ICONS: Record<HistoryIcon, typeof Pencil> = {
  moved: CalendarClock,
  renamed: Pencil,
  repeat: Repeat,
  added: FilePlus2,
  note: FileText,
  done: CircleCheck,
  logged: Flame,
};

const SUBTLE = '#55605A';

function Line({
  Icon,
  title,
  detail,
  latest,
}: {
  Icon: typeof Pencil;
  title: string;
  detail: string;
  latest?: boolean;
}) {
  return (
    <View style={styles.line}>
      <View style={[styles.iconWrap, !latest && styles.iconWrapEarlier]}>
        <Icon
          size={latest ? 15 : 14}
          color={latest ? lightTokens.colors.mossGreen : SUBTLE}
          strokeWidth={2}
        />
      </View>
      <View style={styles.words}>
        <Text style={latest ? styles.title : styles.titleEarlier} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.detail} numberOfLines={2}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

export function ChangeHistoryCard({
  entries,
  origin,
  createdAt,
  style,
}: {
  entries: ChangeEntry[];
  origin?: string | null;
  createdAt?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  const now = getDateService().now();
  const latest = entries[entries.length - 1];
  const earlier = entries.slice(0, -1).reverse();
  const start = originLine(origin, createdAt);
  const head = changeLine(latest);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };

  return (
    <View style={[styles.card, style]} testID="change-history">
      <Line Icon={ICONS[head.icon]} title={head.title} detail={changeDetail(latest, now)} latest />
      {open && earlier.length > 0 ? (
        <View style={styles.earlier} testID="change-history-earlier">
          {earlier.map((e) => {
            const l = changeLine(e);
            return (
              <Line key={e.id} Icon={ICONS[l.icon]} title={l.title} detail={changeDetail(e, now)} />
            );
          })}
          {start ? <Line Icon={Inbox} title={start.title} detail={start.detail} /> : null}
        </View>
      ) : null}
      {earlier.length > 0 ? (
        <Pressable
          testID="change-history-toggle"
          accessibilityRole="button"
          accessibilityLabel={open ? 'Hide history' : `Show all ${entries.length} changes`}
          onPress={toggle}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        >
          <Text style={styles.toggleText}>
            {open ? 'Hide history' : `${entries.length} changes`}
          </Text>
          {open ? (
            <ChevronUp size={13} color={lightTokens.colors.mossGreen} />
          ) : (
            <ChevronDown size={13} color={lightTokens.colors.mossGreen} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/** "YOUR ORIGINAL DROP · Wed 30 Sep", over the words while they are the first ones. */
export function OriginalTextLabel({
  label,
  day,
  style,
}: {
  label: string;
  day?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.labelRow, style]} testID="original-text-label">
      <Text style={styles.labelText}>{label}</Text>
      {day ? <Text style={styles.labelDay}>· {day}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(191,216,192,0.30)',
    borderRadius: 12,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapEarlier: { backgroundColor: 'rgba(255,255,255,0.6)' },
  words: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: '600', color: lightTokens.colors.deepForest },
  titleEarlier: { fontSize: 13, fontWeight: '500', color: '#33403A' },
  detail: { fontSize: 12, color: SUBTLE },
  earlier: {
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(46,85,64,0.18)',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  toggleText: { fontSize: 12, fontWeight: '500', color: lightTokens.colors.mossGreen },
  pressed: { opacity: 0.6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  labelText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#6F6A5E',
  },
  labelDay: { fontSize: 11, color: '#6F6A5E' },
});

export default ChangeHistoryCard;
