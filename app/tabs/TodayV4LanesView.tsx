import React, { useEffect } from 'react';
import { Pressable, Text as RNText } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import { Screen, Box, Text } from '../../ui';
import { useTodayData } from '../../selectors/today/useTodayData';
import { BRAND } from '../../design/brand';
import { useTokens, useColorSchemeSafe } from '../../design/makeStyles';
import { Dotline } from '../../components/today/Dotline';
import { useAuth } from '../../providers/AuthProvider';
import { useRepo } from '../../providers/RepoProvider';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';

export default function TodayV4LanesView() {
  const { left, right, progress, completeItem, loading } = useTodayData();
  const tokens = useTokens();
  const colorScheme = useColorSchemeSafe();
  const { user } = useAuth();
  const repo = useRepo();
  const { openEdit } = useUnifiedOverlayController();
  const displayName = (user?.user_metadata?.first_name as string) ?? 'James';
  const todayString = format(new Date(), 'EEEE, MMMM do');
  const progressValue = useSharedValue(progress);
  const pulse = useSharedValue(1);
  const verticalGuideColor = colorScheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

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

  useEffect(() => {
    const prev = progressValue.value;
    progressValue.value = withTiming(progress, { duration: 600 });

    const hitMilestone =
      (prev < 0.25 && progress >= 0.25) ||
      (prev < 0.5 && progress >= 0.5) ||
      (prev < 1 && progress >= 1);

    if (hitMilestone) {
      pulse.value = withTiming(1.05, { duration: 200 }, () => {
        pulse.value = withTiming(1, { duration: 200 });
      });
    }
  }, [progress, progressValue, pulse]);

  const animatedBar = useAnimatedStyle(() => ({
    width: `${Math.min(progressValue.value * 100, 100)}%`,
    transform: [{ scaleY: pulse.value }],
  }));

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
      <Box mx={4} my={3} radius={1} style={{ height: 6, backgroundColor: BRAND.colors.sageMist }}>
        <Animated.View
          style={[
            {
              height: 6,
              borderRadius: BRAND.radius.sm,
              overflow: 'hidden',
            },
            animatedBar,
          ]}
        >
          <LinearGradient
            colors={[BRAND.colors.goldenPear, BRAND.colors.mossGreen]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </Box>

      <Box px={4} pb={2}>
        <Box gap={1} mb={2}>
          <Text variant="title" style={{ fontSize: 20, color: BRAND.colors.charcoalInk }}>
            Hi, {displayName}
          </Text>
          <Text variant="label" style={{ color: '#6A6F76' }}>
            {todayString}
          </Text>
        </Box>
        <Text
          variant="title"
          style={{
            fontSize: 18,
            color: BRAND.colors.mossGreen,
            marginBottom: tokens.spacing[2],
          }}
        >
          Focus for today
        </Text>
      </Box>

      <Box row gap={4} px={4} pb={8} style={{ alignItems: 'flex-start' }}>
        <Box flex={1} gap={3}>
          <Text
            variant="label"
            style={{
              fontSize: 14,
              fontWeight: '600',
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
              const record = await repo.getById(item.id);
              if (record) {
                openEdit({ record });
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
              fontSize: 14,
              fontWeight: '600',
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
              const record = await repo.getById(item.id);
              if (record) {
                openEdit({ record });
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
