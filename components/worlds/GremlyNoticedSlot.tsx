import { View, Pressable, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldObservationForWorld } from '../../lib/store/worldsSelectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

interface GremlyNoticedSlotProps {
  worldId: string;
}

export function GremlyNoticedSlot({ worldId }: GremlyNoticedSlotProps) {
  const observation = useWorldObservationForWorld(worldId);
  const dismiss = useGremlyStore((s) => s.dismissWorldObservation);

  return (
    <View>
      <View style={styles.sec}>
        <Text style={styles.secLabel}>GREMLY NOTICED</Text>
      </View>
      {observation ? (
        <View style={styles.populated}>
          <Pressable
            onPress={() => dismiss(observation.id)}
            style={styles.dismissBtn}
            testID={`dismiss-observation-${observation.id}`}
          >
            <X size={14} color={lightTokens.colors.noticedBorder} />
          </Pressable>
          <Text style={styles.label}>{labelForKind(observation.kind)}</Text>
          <Text style={styles.title}>{firstLine(observation.text)}</Text>
          {restLines(observation.text) ? (
            <Text style={styles.body}>{restLines(observation.text)}</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyLabel}>YOUR WEEK'S PATTERN DROPS MONDAY MORNING</Text>
          <Text style={styles.emptyBody}>
            Gremly needs a full week of signal before producing observations. Next one lands Sunday
            evening.
          </Text>
        </View>
      )}
    </View>
  );
}

function labelForKind(kind: string): string {
  switch (kind) {
    case 'pattern':
      return 'WEEKLY PATTERN';
    case 'cross_reference':
      return 'PATTERN RECOGNIZED';
    case 'trajectory':
      return 'TRAJECTORY';
    case 'risk':
      return 'WORTH WATCHING';
    default:
      return 'GREMLY NOTICED';
  }
}

function firstLine(text: string): string {
  const first = text.split(/(?<=[.!?])\s+/)[0];
  return first || text;
}

function restLines(text: string): string {
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.slice(1).join(' ').trim();
}

const styles = StyleSheet.create({
  sec: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 10 },
  secLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
  },
  populated: {
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 13,
    paddingLeft: 14,
    paddingRight: 30,
    backgroundColor: lightTokens.colors.noticedBg,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: lightTokens.colors.noticedBorder,
    position: 'relative',
  },
  dismissBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: lightTokens.colors.noticedLabel,
    marginBottom: 3,
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
    color: lightTokens.colors.worldsInk,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 16,
    color: lightTokens.colors.noticedText,
    marginTop: 3,
  },
  empty: {
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 13,
    backgroundColor: lightTokens.colors.noticedSurfaceFaint,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: lightTokens.colors.noticedEdgeSoft,
    borderRadius: 12,
  },
  emptyLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: lightTokens.colors.noticedLabel,
  },
  emptyBody: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 16,
    color: lightTokens.colors.warmGrey,
    marginTop: 3,
  },
});
