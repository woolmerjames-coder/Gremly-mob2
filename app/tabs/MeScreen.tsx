import { Screen, Text } from '../../ui';

export default function MeScreen() {
  return (
    <Screen title="Me" scroll testID="screen-me">
      <Text variant="body">Streaks & Wins, Progress %, Mood check + mini journal.</Text>
    </Screen>
  );
}
