import React, { useEffect, useRef } from 'react';
import { Pressable, Text as RNText } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { Screen, Box, Text } from '../../ui';
import { useTodayData } from '../../selectors/today/useTodayData';
import { BRAND } from '../../design/brand';
import { useTokens, useColorSchemeSafe } from '../../design/makeStyles';
import { Dotline } from '../../components/today/Dotline';
import { useAuth } from '../../providers/AuthProvider';
import { useRepo } from '../../providers/RepoProvider';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';

const ProgressBar = ({ progress }: { progress: number }) => {
  const pct = Math.max(0, Math.min(1, progress || 0));
  const animated = useSharedValue(pct);

  useEffect(() => {
    animated.value = withTiming(pct, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
  }, [animated, pct]);

  const widthStyle = useAnimatedStyle(() => ({
    width: `${animated.value * 100}%`,
  }));

  return (
    <Box style={{ width: '78%', marginTop: 8, marginBottom: 12 }}>
      <Box
        style={{
          height: 8,
          backgroundColor: '#DDE8E0',
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          entering={FadeIn}
          style={[
            {
              height: 8,
              backgroundColor: '#2E5540',
              borderRadius: 999,
            },
            widthStyle,
          ]}
        />
      </Box>
    </Box>
  );
};

export default function TodayV4LanesView() {
  const { left, right, completeItem, loading } = useTodayData();
  const tokens = useTokens();
  const colorScheme = useColorSchemeSafe();
  const { user } = useAuth();
  const repo = useRepo();
  const { openEdit } = useUnifiedOverlayController();
  const displayName = (user?.user_metadata?.first_name as string) ?? 'James';
  const todayString = format(new Date(), 'EEEE, MMMM do');
  const verticalGuideColor =
    colorScheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(34,34,34,0.06)';
  const doneCount = right.length;
  const totalCount = left.length + right.length;
  const overallProgress = totalCount ? doneCount / totalCount : 0;
  const openingGuardRef = useRef(false);

  const Checkbox = ({ checked, onToggle }: { checked: boolean; onToggle: () => void }) => (
    <Pressable
      onPress={onToggle}
      accessibilityLabel={checked ? 'Uncomplete item' : 'Complete item'}
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: BRAND.colors.mossGreen,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: tokens.spacing[2],
        backgroundColor: checked ? BRAND.colors.mossGreen : 'transparent',
      }}
    >
      {checked ? <RNText style={{ color: '#fff', fontWeight: '700' }}>✓</RNText> : null}
    </Pressable>
  );

  if (loading) {
    return (
      <Screen>
        <Box flex={1} center>
          <Text variant="body">Loading your day...</Text>
        </Box>
      </Screen>
    );
  }
  return (
    <Screen scroll padded={false} testID="today-v4-lanes-screen">
      <Box px={4} pb={2}>
        <Box gap={1} mb={2}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#222222' }}>
            Hi, {displayName}
          </Text>
          <Text style={{ fontSize: 16, fontWeight: '500', color: 'rgba(34,34,34,0.75)' }}>
            {todayString}
          </Text>
        </Box>
        <ProgressBar progress={overallProgress} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#2E5540', marginBottom: 8 }}>
          Focus for today
        </Text>
      </Box>

      <Box row gap={4} px={4} pb={8} style={{ alignItems: 'flex-start' }}>
        <Box flex={1} gap={3}>
          <Text
            variant="label"
            style={{
              fontSize: 15,
              fontWeight: '700',
              letterSpacing: 0.2,
              color: BRAND.colors.goldenPear,
              marginBottom: tokens.spacing[2],
            }}
          >
            In Progress
          </Text>

          {left.map((item) => {
            const onComplete = () => {
              void Haptics.selectionAsync().catch(() => undefined);
              void completeItem(item.id, item.kind);
            };

            const openDetails = async () => {
              if (openingGuardRef.current) {
                return;
              }
              openingGuardRef.current = true;
              try {
                const record = await repo.getById(item.id);
                if (record) {
                  openEdit({ record });
                }
              } finally {
                setTimeout(() => {
                  openingGuardRef.current = false;
                }, 100);
              }
            };

            return (
              <Animated.View
                key={item.id}
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                layout={Layout.springify()}
              >
                <Box
                  row
                  py={2}
                  style={{
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRightWidth: 1,
                    borderRightColor: verticalGuideColor,
                  }}
                >
                  <Box row style={{ flex: 1, alignItems: 'center' }}>
                    <Checkbox checked={false} onToggle={onComplete} />
                    <Pressable onPress={() => void openDetails()} style={{ flex: 1 }}>
                      <Text
                        variant="body"
                        numberOfLines={2}
                        style={{
                          fontSize: 14,
                          lineHeight: 18,
                          marginRight: 8,
                          color: BRAND.colors.charcoalInk,
                        }}
                      >
                        {item.title}
                      </Text>
                    </Pressable>
                  </Box>
                  {item.kind === 'habit' ? (
                    <Dotline
                      total={
                        item.cadence === 'daily'
                          ? (item.targetPerDay ?? 1)
                          : (item.targetPerPeriod ?? 1)
                      }
                      filled={
                        item.cadence === 'daily' ? (item.todayCount ?? 0) : (item.periodCount ?? 0)
                      }
                      color={BRAND.colors.mossGreen}
                    />
                  ) : null}
                </Box>
              </Animated.View>
            );
          })}

          {left.length === 0 && (
            <Text variant="subtle" style={{ color: BRAND.colors.inkMuted }}>
              Nothing scheduled just yet.
            </Text>
          )}
        </Box>

        <Box flex={1} gap={3}>
          <Text
            variant="label"
            style={{
              fontSize: 15,
              fontWeight: '700',
              letterSpacing: 0.2,
              color: BRAND.colors.mossGreen,
              marginBottom: tokens.spacing[2],
            }}
          >
            Done
          </Text>

          {right.length === 0 && (
            <Text variant="subtle" style={{ color: BRAND.colors.sageMist }}>
              Nothing yet...
            </Text>
          )}

          {right.map((item) => {
            const undo = async () => {
              try {
                if (typeof repo.undoCompletion === 'function') {
                  await repo.undoCompletion(item.id);
                } else {
                  await completeItem(item.id, item.kind);
                }
              } catch (error) {
                void completeItem(item.id, item.kind);
              }
            };

            const openDetails = async () => {
              if (openingGuardRef.current) {
                return;
              }
              openingGuardRef.current = true;
              try {
                const record = await repo.getById(item.id);
                if (record) {
                  openEdit({ record });
                }
              } finally {
                setTimeout(() => {
                  openingGuardRef.current = false;
                }, 100);
              }
            };

            return (
              <Animated.View
                key={item.id}
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                layout={Layout.springify()}
              >
                <Box
                  row
                  py={2}
                  style={{
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRightWidth: 1,
                    borderRightColor: verticalGuideColor,
                  }}
                >
                  <Box row style={{ flex: 1, alignItems: 'center' }}>
                    <Checkbox checked onToggle={() => void undo()} />
                    <Pressable onPress={() => void openDetails()} style={{ flex: 1 }}>
                      <Text
                        variant="body"
                        numberOfLines={2}
                        style={{
                          fontSize: 14,
                          lineHeight: 18,
                          marginRight: 8,
                          color: BRAND.colors.mossGreen,
                          textDecorationLine: 'line-through',
                        }}
                      >
                        {item.title}
                      </Text>
                    </Pressable>
                  </Box>
                  {item.kind === 'habit' ? (
                    <Dotline
                      total={
                        item.cadence === 'daily'
                          ? (item.targetPerDay ?? 1)
                          : (item.targetPerPeriod ?? 1)
                      }
                      filled={
                        item.cadence === 'daily'
                          ? (item.targetPerDay ?? 1)
                          : (item.targetPerPeriod ?? 1)
                      }
                      color={BRAND.colors.mossGreen}
                    />
                  ) : null}
                </Box>
              </Animated.View>
            );
          })}
        </Box>
      </Box>
    </Screen>
  );
}
