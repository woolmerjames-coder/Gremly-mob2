import React from 'react';
import { Pressable, Text } from 'react-native';
import { makeStyles } from '../../design/makeStyles';

type Props = {
  onPress: () => void;
};

export function NowOverwhelmCard({ onPress }: Props) {
  const styles = useStyles();

  return (
    <Pressable onPress={onPress} style={styles.card} accessibilityRole="button">
      <Text style={styles.title}>Too much?</Text>
      <Text style={styles.subtitle}>Try Overwhelm mode →</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    marginTop: t.spacing[3],
    marginHorizontal: t.spacing[4],
    marginBottom: t.spacing[4],
    paddingHorizontal: t.spacing[4],
    paddingVertical: t.spacing[3],
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.sageMist,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: t.colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: t.colors.subtle,
  },
}));
