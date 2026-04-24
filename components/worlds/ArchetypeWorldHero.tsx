// components/worlds/ArchetypeWorldHero.tsx

import { View, StyleSheet, Platform } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import type { World } from '../../lib/supabase/types';

interface ArchetypeWorldHeroProps {
  world: World;
  accentColor: string;
  velocityDotColor: string;
  statusLine: string;
  underlineColor: string;
}

// iOS renders dashed; Android may render solid (RN Text decoration limitation)
const SERIF_FONT = Platform.select({ ios: 'Georgia', default: 'serif' });

export function ArchetypeWorldHero({
  world,
  accentColor,
  velocityDotColor,
  statusLine,
  underlineColor,
}: ArchetypeWorldHeroProps) {
  const title = world.display_name || world.name;
  const summary = world.summary?.trim() || null;

  return (
    <View style={styles.container}>
      {/* Name + velocity dot + accent circle row */}
      <View style={styles.topRow}>
        <View style={styles.titleColumn}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.velocityDot, { backgroundColor: velocityDotColor }]} />
            <Text style={styles.statusText} numberOfLines={1}>
              {statusLine}
            </Text>
          </View>
        </View>
        <View style={[styles.accentCircle, { backgroundColor: accentColor }]} />
      </View>

      {/* Serif summary (or placeholder) */}
      {summary ? (
        <Text
          style={[
            styles.summary,
            {
              textDecorationColor: underlineColor,
              // iOS renders dashed; Android may render solid (RN Text decoration limitation)
              textDecorationLine: 'underline',
              textDecorationStyle: 'dashed',
            },
          ]}
        >
          {summary}
        </Text>
      ) : (
        <Text style={[styles.summary, styles.summaryPlaceholder]}>
          No summary yet. Gremly&apos;s classifier will write one after your next weekly run.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingLeft: 2,
    paddingRight: 2,
    paddingBottom: 32,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  titleColumn: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    color: lightTokens.colors.worldsInk,
  },
  statusRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  velocityDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusText: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: lightTokens.colors.warmGrey,
    flexShrink: 1,
  },
  accentCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    flexShrink: 0,
  },
  summary: {
    fontFamily: SERIF_FONT,
    fontSize: 15,
    lineHeight: 22.5,
    color: lightTokens.colors.worldsInk,
  },
  summaryPlaceholder: {
    color: lightTokens.colors.warmGrey,
    fontStyle: 'italic',
  },
});
