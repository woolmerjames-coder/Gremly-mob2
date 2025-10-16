import { Text } from 'react-native';
import { Screen } from '../../ui';
import PlusFAB from '../../components/PlusFAB';
import { openManualAdd } from '../../components/ManualAddSheet';

export default function HubScreen() {
  return (
    <Screen title="Hub" scroll testID="screen-hub">
      <Text className="text-base text-text-primary">
        All | Habits | To-Dos | Journal | Lists + Sorting Tray
      </Text>

      {/* Plus FAB for Manual Add */}
      <PlusFAB onPress={() => openManualAdd()} />
    </Screen>
  );
}
