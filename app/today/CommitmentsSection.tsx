import React, { useState, useCallback } from 'react';
import { View } from 'react-native';
import { Box, Text, Button } from '../../ui';
import { Card } from '../../design-system/Card';
import { Icon, type IconName } from '../../components/ui/Icon';
import { useTheme } from '../../providers/ThemeProvider';
import type { CommitmentItem } from '../../lib/today/hooks/useCommitments';

interface CommitmentsSectionProps {
  items: CommitmentItem[];
  onRemove?: (id: string, type: 'habit' | 'todo') => Promise<void> | void;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getCommitmentStartedLabel(started?: string | null): string {
  if (!started) {
    return 'Started recently';
  }

  const startedDate = new Date(started);
  if (Number.isNaN(startedDate.getTime())) {
    return 'Started recently';
  }

  const now = new Date();
  const diffMs = now.getTime() - startedDate.getTime();
  const days = Math.max(0, Math.floor(diffMs / MS_PER_DAY));

  if (days <= 0) {
    return 'Started today';
  }

  if (days === 1) {
    return 'Started 1 day ago';
  }

  return `Started ${days} days ago`;
}

export default function CommitmentsSection({ items, onRemove }: CommitmentsSectionProps) {
  const { theme } = useTheme();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = useCallback(
    async (id: string, type: 'habit' | 'todo') => {
      if (!onRemove) return;
      setRemovingId(id);
      try {
        await onRemove(id, type);
      } finally {
        setRemovingId((current) => (current === id ? null : current));
      }
    },
    [onRemove],
  );

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <Box gap={3} testID="today-section-commitments">
      <Text variant="title">Commitments</Text>
      <Box gap={3}>
        {items.map((commitment) => {
          const iconName: IconName = commitment.type === 'habit' ? 'Activity' : 'CheckCircle2';
          const startedLabel = getCommitmentStartedLabel(commitment.commitment_started_at);
          const isRemoving = removingId === commitment.id;

          return (
            <Card
              key={commitment.id}
              variant="outlined"
              padding="md"
              testID={`commitment-card-${commitment.id}`}
            >
              <Box row gap={4} style={{ alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.colors.border.DEFAULT,
                    backgroundColor: theme.colors.cream,
                  }}
                >
                  <Icon name={iconName} size="sm" color={theme.colors.deepTeal.DEFAULT} />
                </View>
                <Box flex={1} gap={1}>
                  <Text variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                    {commitment.name}
                  </Text>
                  <Text variant="subtle">{startedLabel}</Text>
                  {commitment.commitment_note ? (
                    <Text
                      variant="subtle"
                      style={{ color: theme.colors.text.secondary }}
                      numberOfLines={1}
                    >
                      {commitment.commitment_note}
                    </Text>
                  ) : null}
                </Box>
                {onRemove ? (
                  <Button
                    label={isRemoving ? 'Removing...' : 'Remove'}
                    variant="ghost"
                    size="sm"
                    onPress={() => void handleRemove(commitment.id, commitment.type)}
                    disabled={isRemoving}
                    testID={`commitment-remove-${commitment.id}`}
                  />
                ) : null}
              </Box>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
}
