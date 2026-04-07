import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';

const LINEN_CREAM = '#F9F6F1';
const CHARCOAL = '#222222';

export default function CalendarHeader() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.left}>
        <ChevronLeft size={24} color={CHARCOAL} />
      </TouchableOpacity>
      <Text style={styles.title}>Calendar</Text>
      <View style={styles.right} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: LINEN_CREAM,
  },
  left: {
    width: 32,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: CHARCOAL,
  },
  right: {
    width: 32,
  },
});
