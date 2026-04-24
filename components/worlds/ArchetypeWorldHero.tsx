// components/worlds/ArchetypeWorldHero.tsx

import { View, StyleSheet, Platform } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import MascotLottie from '../../app/components/MascotLottie';
import type { World } from '../../lib/supabase/types';

const SERIF_FONT = Platform.select({ ios: 'Georgia', default: 'serif' });

interface ArchetypeWorldHeroProps {
  world: World;
  statusLine: string;
  velocityDotColor: string;
}

export function ArchetypeWorldHero({
  world,
  statusLine,
  velocityDotColor,
}: ArchetypeWorldHeroProps) {
  const title = world.display_name || world.name;
  const summary = world.summary?.trim() || null;

  return (
    <View style={styles.container}>
      {/* Title + pill row + mascot */}
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
        <View style={styles.mascotWrap}>
          <MascotLottie width={90} />
        </View>
      </View>

      {/* World summary */}
      {summary ? (
        <Text style={styles.summary}>{summary}</Text>
      ) : (
        <Text style={[styles.summary, styles.summaryPlaceholder]}>
          No summary yet. Gremly&apos;s classifier will write one after your next weekly run.
        </Text>
      )}

      {/* End-of-hero divider — gives the page vertical structure
          between the narrative hero and the sections below */}
      <View style={styles.heroDivider} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  titleColumn: {
    flex: 1,
    marginRight: 14,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 44,
    letterSpacing: -0.8,
    color: lightTokens.colors.mossGreen,
  },
  statusRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  velocityDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    letterSpacing: 0.1,
    color: lightTokens.colors.warmGrey,
    flexShrink: 1,
  },
  mascotWrap: {
    flexShrink: 0,
    width: 90,
    height: 110,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  summary: {
    marginTop: 18,
    fontFamily: SERIF_FONT,
    fontSize: 16,
    lineHeight: 24,
    color: lightTokens.colors.worldsInk,
  },
  summaryPlaceholder: {
    color: lightTokens.colors.warmGrey,
    fontStyle: 'italic',
  },
  heroDivider: {
    marginTop: 24,
    width: 44,
    height: 3,
    borderRadius: 2,
    backgroundColor: lightTokens.colors.ambergold,
  },
});
