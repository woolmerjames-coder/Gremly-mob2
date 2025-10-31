import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
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
import { Screen, Box, Text } from '../../ui';
import { useTodayData } from '../../selectors/today/useTodayData';
import { BRAND } from '../../design/brand';
import { useTokens } from '../../design/makeStyles';
import { Dotline } from '../../components/today/Dotline';

export default function TodayV4LanesView() {
  const { left, right, progress, completeItem, loading } = useTodayData();
  const tokens = useTokens();
  const progressValue = useSharedValue(progress);
  const pulse = useSharedValue(1);

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

      <Box row gap={4} px={4} pb={8} style={{ alignItems: 'flex-start' }}>
        <Box flex={1} gap={3}>
          <Text
            variant="label"
            style={{ color: BRAND.colors.goldenPear, marginBottom: tokens.spacing[2] }}
          >
            In Progress
          </Text>

          {left.map((item) => (
            <Animated.View
              key={item.id}
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              layout={Layout.springify()}
            >
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => undefined);
                  completeItem(item.id, item.kind);
                }}
                accessibilityLabel={`Complete ${item.title}`}
              >
                <Box row style={{ alignItems: 'center', justifyContent: 'space-between' }} py={2}>
                  <Text
                    variant="body"
                    numberOfLines={1}
                    style={{
                      color: BRAND.colors.charcoalInk,
                      flex: 1,
                      marginRight: tokens.spacing[2],
                    }}
                  >
                    {item.title}
                  </Text>
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
                      color={BRAND.colors.goldenPear}
                    />
                  ) : null}
                </Box>
              </Pressable>
            </Animated.View>
          ))}

          {left.length === 0 && (
            <Text variant="subtle" style={{ color: BRAND.colors.inkMuted }}>
              Nothing scheduled just yet.
            </Text>
          )}
        </Box>

        <Box flex={1} gap={3}>
          <Text
            variant="label"
            style={{ color: BRAND.colors.mossGreen, marginBottom: tokens.spacing[2] }}
          >
            Done
          </Text>

          {right.length === 0 && (
            <Text variant="subtle" style={{ color: BRAND.colors.sageMist }}>
              Nothing yet...
            </Text>
          )}

          {right.map((item) => (
            <Animated.View
              key={item.id}
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              layout={Layout.springify()}
            >
              <Box row py={2} style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Text
                  variant="body"
                  numberOfLines={1}
                  style={{
                    color: BRAND.colors.mossGreen,
                    textDecorationLine: 'line-through',
                    flex: 1,
                    marginRight: tokens.spacing[2],
                  }}
                >
                  {item.title}
                </Text>
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
          ))}
        </Box>
      </Box>
    </Screen>
  );
}
