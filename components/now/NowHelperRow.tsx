import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { makeStyles } from '../../design/makeStyles';

type Props = {
  onPressOverwhelm: () => void;
  onPressAddMore: () => void;
};

export function NowHelperRow({ onPressOverwhelm, onPressAddMore }: Props) {
  const styles = useStyles();

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPressOverwhelm}
        style={[styles.card, styles.cardLeft]}
        accessibilityRole="button"
      >
        <Text style={styles.title}>Feeling overwhelmed?</Text>
        <Text style={styles.subtitle}>Pick a few to focus on →</Text>
      </Pressable>

      <Pressable
        onPress={onPressAddMore}
        style={[styles.card, styles.cardRight]}
        accessibilityRole="button"
      >
        <Text style={styles.title}>Add more to your list</Text>
        <Text style={styles.subtitle}>Open a blank page →</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    marginHorizontal: t.spacing[4],
    marginTop: t.spacing[3],
    marginBottom: t.spacing[5],
  },
  card: {
    flex: 1,
    paddingHorizontal: t.spacing[3],
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
  cardLeft: {
    marginRight: t.spacing[2],
  },
  cardRight: {
    marginLeft: t.spacing[2],
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: t.colors.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: t.colors.subtle,
  },
}));
