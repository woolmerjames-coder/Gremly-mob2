// LEGACY: Superseded by NowHelperRow on NowScreenV1. Kept for reference.
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
      <Text style={styles.title}>Feeling overwhelmed?</Text>
      <Text style={styles.subtitle}>Pick a few to focus on →</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    marginTop: t.spacing[3],
    marginHorizontal: t.spacing[4],
    marginBottom: t.spacing[5],
    paddingHorizontal: t.spacing[4],
    paddingVertical: t.spacing[2],
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.card,
    borderWidth: 1,
    borderColor: t.colors.sageMist,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: t.colors.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: t.colors.subtle,
  },
}));
