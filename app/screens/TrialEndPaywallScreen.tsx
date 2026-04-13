/**
 * TrialEndPaywallScreen - Shown when the user's 8-day trial has expired
 * and they have no active subscription.
 */

import React, { useState, useCallback } from 'react';
import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import MascotLottie from '../components/MascotLottie';
import * as WebBrowser from 'expo-web-browser';

type Plan = 'monthly' | 'annual';

export default function TrialEndPaywallScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('annual');

  const fedDaysCount = useGremlyStore((s) => s.fedDaysCount);
  const todayDropsCount = useGremlyStore((s) => s.todayDropsCount); // TODO: replace with lifetime total_drops when available
  const gremlyAge = useGremlyStore((s) => s.gremlyAge);

  const handleSubscribe = useCallback(async () => {
    console.log('[Paywall] Subscribe pressed: plan=' + selectedPlan);
    // TODO: RevenueCat Purchases.purchasePackage() goes here
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Tabs' }] }));
  }, [navigation, selectedPlan]);

  const handleRestore = useCallback(() => {
    console.log('[Paywall] Restore pressed');
  }, []);

  const handleNotNow = useCallback(() => {
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Tabs' }] }));
  }, [navigation]);

  const subscribeLabel =
    selectedPlan === 'annual' ? 'Subscribe - $69.99/year' : 'Subscribe - $9.99/month';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Mascot */}
        <View style={styles.mascotContainer}>
          <View style={{ transform: [{ scale: 2 }] }}>
            <MascotLottie showFullColor />
          </View>
        </View>

        {/* Headline */}
        <Text style={styles.headline} maxFontSizeMultiplier={1.3}>
          Keep the momentum going
        </Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          Your free trial has ended - here's what we built together
        </Text>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard} accessibilityLabel={`${fedDaysCount} days fed`}>
            <Text style={styles.statNumber}>{fedDaysCount}</Text>
            <Text style={styles.statLabel}>days fed</Text>
          </View>
          <View style={styles.statCard} accessibilityLabel={`${todayDropsCount} thoughts`}>
            <Text style={styles.statNumber}>{todayDropsCount}</Text>
            <Text style={styles.statLabel}>thoughts</Text>
          </View>
          <View style={styles.statCard} accessibilityLabel={`${gremlyAge} Gremly age`}>
            <Text style={styles.statNumber}>{gremlyAge}</Text>
            <Text style={styles.statLabel}>Gremly age</Text>
          </View>
        </View>

        {/* Gap */}
        <View style={{ height: 20 }} />

        {/* Pricing cards */}
        <View
          style={styles.pricingRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Subscription plan"
        >
          {/* Monthly */}
          <Pressable
            style={[
              styles.pricingCard,
              selectedPlan === 'monthly' ? styles.pricingCardSelected : styles.pricingCardDefault,
            ]}
            onPress={() => setSelectedPlan('monthly')}
            accessibilityRole="radio"
            accessibilityState={{ checked: selectedPlan === 'monthly' }}
          >
            <Text style={styles.pricingLabel}>Monthly</Text>
            <Text style={styles.pricingPrice}>$9.99</Text>
            <Text style={styles.pricingPeriod}>/month</Text>
          </Pressable>

          {/* Annual */}
          <View style={{ flex: 1 }}>
            {/* Badge */}
            <View style={styles.badgeContainer}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Save 42%</Text>
              </View>
            </View>
            <Pressable
              style={[
                styles.pricingCard,
                selectedPlan === 'annual' ? styles.pricingCardSelected : styles.pricingCardDefault,
              ]}
              onPress={() => setSelectedPlan('annual')}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedPlan === 'annual' }}
            >
              <Text style={styles.pricingLabel}>Annual</Text>
              <Text style={styles.pricingPrice}>$69.99</Text>
              <Text style={styles.pricingPeriod}>/year</Text>
            </Pressable>
          </View>
        </View>

        {/* Reassurance */}
        <Text style={styles.reassurance}>
          Cancel anytime. Your Gremly and all your data will be waiting if you come back.
        </Text>

        {/* Apple-required subscription disclosure */}
        <Text style={styles.disclosure}>
          Payment will be charged to your Apple ID account at confirmation of purchase. Subscription
          automatically renews unless canceled at least 24 hours before the end of the current
          period. Your account will be charged for renewal within 24 hours prior to the end of the
          current period. You can manage and cancel your subscriptions by going to your App Store
          account settings after purchase. Any unused portion of a free trial period will be
          forfeited when you purchase a subscription.
        </Text>
        <View style={styles.legalLinks}>
          <Text
            style={styles.legalLink}
            onPress={() => WebBrowser.openBrowserAsync('https://www.gremly.app/privacy-policy')}
          >
            Privacy Policy
          </Text>
          <Text style={styles.legalSeparator}>|</Text>
          <Text
            style={styles.legalLink}
            onPress={() => WebBrowser.openBrowserAsync('https://www.gremly.app/terms-of-service')}
          >
            Terms of Service
          </Text>
        </View>
      </ScrollView>

      {/* Bottom CTA pinned */}
      <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <Pressable
          style={styles.subscribeButton}
          onPress={handleSubscribe}
          accessibilityRole="button"
        >
          <Text style={styles.subscribeButtonText}>{subscribeLabel}</Text>
        </Pressable>

        <Pressable onPress={handleRestore} accessibilityRole="button">
          <Text style={styles.restoreText}>Restore purchase</Text>
        </Pressable>

        <Pressable onPress={handleNotNow} accessibilityRole="button">
          <Text style={styles.notNowText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    overflow: 'visible',
  },
  mascotContainer: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    marginBottom: -16,
  },
  headline: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 28,
    lineHeight: 36,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    paddingTop: 8,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginBottom: 20,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    paddingHorizontal: 0,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(61,92,61,0.06)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 24,
    lineHeight: 32,
    color: BRAND.colors.mossGreen,
  },
  statLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },

  // Pricing
  pricingRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    paddingHorizontal: 0,
  },
  pricingCard: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  pricingCardDefault: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: BRAND.colors.borderSubtle,
  },
  pricingCardSelected: {
    backgroundColor: 'rgba(61,92,61,0.05)',
    borderWidth: 2,
    borderColor: BRAND.colors.mossGreen,
  },
  pricingLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
  },
  pricingPrice: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 22,
    color: BRAND.colors.charcoalInk,
  },
  pricingPeriod: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  badgeContainer: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
  },
  badge: {
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#FFFFFF',
  },

  reassurance: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: '#B0B8B0',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
  },
  disclosure: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#B0B8B0',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 12,
    lineHeight: 16,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  legalLink: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#B0B8B0',
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#B0B8B0',
  },

  // Bottom CTA
  bottomContainer: {
    paddingHorizontal: 32,
    paddingTop: 8,
  },
  subscribeButton: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 16,
    borderRadius: BRAND.radius.md,
    alignItems: 'center',
  },
  subscribeButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    color: '#FFFFFF',
  },
  restoreText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: BRAND.colors.mossGreen,
    textAlign: 'center',
    marginTop: 12,
  },
  notNowText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: '#B0B8B0',
    textAlign: 'center',
    marginTop: 8,
  },
});
