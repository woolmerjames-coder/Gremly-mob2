import React, { useCallback } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { BRAND } from '../../design/brand';

export default function TrainingIntroScreen() {
  const navigation = useNavigation();
  const startTraining = useGremlyStore((s) => s.startTraining);

  const handleStart = useCallback(async () => {
    await startTraining();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Tabs' }],
      }),
    );
  }, [navigation, startTraining]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.mascotContainer}>
          <Image
            source={require('../../assets/mascot/gremly-mascot.png')}
            style={{ width: 160, height: 160 }}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.headline}>Train your Gremly</Text>

        <Text style={styles.body}>
          Your Gremly needs to learn how your brain works. It starts with dropping thoughts.
        </Text>
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.button} onPress={handleStart}>
          <Text style={styles.buttonText}>Let's start</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  mascotContainer: {
    marginBottom: 32,
  },
  mascot: {
    width: 180,
    height: 180,
  },
  headline: {
    fontSize: 24,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 15 * 1.5,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  button: {
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
