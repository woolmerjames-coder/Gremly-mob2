import { View, Pressable, StyleSheet } from 'react-native';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';

interface ModuleSectionProps {
  label: string;
  seeAllOnPress?: () => void;
  children: React.ReactNode;
}

export function ModuleSection({ label, seeAllOnPress, children }: ModuleSectionProps) {
  return (
    <View>
      <View style={styles.hdr}>
        <Text style={styles.label}>{label}</Text>
        {seeAllOnPress ? (
          <Pressable onPress={seeAllOnPress}>
            <Text style={styles.seeAll}>see all</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hdr: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 10,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
  },
  seeAll: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    fontWeight: '600',
    color: lightTokens.colors.worldsInk,
  },
});
