import React from 'react';
import { Pressable } from 'react-native';
import { Screen, Box, Text } from '../../ui';
import { useTodayData } from '../../selectors/today/useTodayData';
import { BRAND } from '../../design/brand';
import { useTokens } from '../../design/makeStyles';

export default function TodayV4LanesView() {
  const { left, right, progress, completeItem, loading } = useTodayData();
  const tokens = useTokens();
  const progressPercent = Math.min(progress * 100, 100);

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
        <Box
          radius={1}
          style={{
            flex: 1,
            width: `${progressPercent}%`,
            backgroundColor: BRAND.colors.goldenPear,
          }}
        />
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
            <Pressable
              key={item.id}
              onPress={() => completeItem(item.id, item.kind)}
              accessibilityLabel={`Complete ${item.title}`}
            >
              <Box row style={{ alignItems: 'center', justifyContent: 'space-between' }} py={2}>
                <Text variant="body" style={{ color: BRAND.colors.charcoalInk }}>
                  {item.title}
                </Text>
                {item.kind === 'habit' && item.totalCount ? (
                  <Text variant="label" style={{ color: BRAND.colors.goldenPear }}>
                    {item.completedCount ?? 0}/{item.totalCount}
                  </Text>
                ) : null}
              </Box>
            </Pressable>
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
            <Box
              key={item.id}
              row
              py={2}
              style={{ alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Text
                variant="body"
                style={{ color: BRAND.colors.mossGreen, textDecorationLine: 'line-through' }}
              >
                {item.title}
              </Text>
              {item.kind === 'habit' && item.totalCount ? (
                <Text variant="label" style={{ color: BRAND.colors.mossGreen }}>
                  {item.totalCount}/{item.totalCount}
                </Text>
              ) : null}
            </Box>
          ))}
        </Box>
      </Box>
    </Screen>
  );
}
