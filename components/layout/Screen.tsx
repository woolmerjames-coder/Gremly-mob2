import { ScrollView, View, Text } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  title?: string;
  scroll?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  testID?: string;
};

export default function Screen({ title, scroll = false, children, footer, testID }: Props) {
  const insets = useSafeAreaInsets();
  const Container = scroll ? ScrollView : View;

  return (
    <SafeAreaView testID={testID} style={{ flex: 1 }} className="bg-bg dark:bg-black">
      <Container
        contentContainerStyle={scroll ? { paddingBottom: insets.bottom + 16 } : undefined}
        className={scroll ? 'px-4 pt-3' : 'flex-1 px-4 pt-3'}
      >
        {title ? (
          <Text className="text-2xl font-bold mb-3 text-text-primary dark:text-white">{title}</Text>
        ) : null}
        {children}
      </Container>
      {footer ? (
        <View style={{ paddingBottom: insets.bottom }} className="px-4 pb-4">
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
