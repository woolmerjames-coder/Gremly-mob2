import { View, Text, StyleSheet } from 'react-native';

export default function AskGremlyScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ask Gremly</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F6F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    color: '#2E5540',
  },
});
