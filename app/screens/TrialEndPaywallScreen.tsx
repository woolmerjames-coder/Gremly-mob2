/**
 * TrialEndPaywallScreen - Subscription paywall with two states:
 * 1. Mid-trial (source: 'settings') - voluntary visit from Settings
 * 2. Post-trial (source: 'expiry') - forced after trial expiration
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import MascotLottie from '../components/MascotLottie';
import * as WebBrowser from 'expo-web-browser';
import { useSubscriptionStatus } from '../../lib/subscriptions/useSubscriptionStatus';
import {
  fetchOfferings,
  purchasePackage,
  restorePurchases,
} from '../../lib/subscriptions/purchases';
import type { PurchasesPackage } from 'react-native-purchases';

type Plan = 'monthly' | 'annual';

export default function TrialEndPaywallScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<RouteProp<{ TrialEndPaywall: { source?: 'settings' | 'expiry' } }>>();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('annual');
  const [isProcessing, setIsProcessing] = useState(false);

  const fedDaysCount = useGremlyStore((s) => s.fedDaysCount);
  const todayDropsCount = useGremlyStore((s) => s.todayDropsCount);
  const gremlyAge = useGremlyStore((s) => s.gremlyAge);
  const setIsSubscribed = useGremlyStore((s) => s.setIsSubscribed);
  const { isTrialActive, daysUntilTrialCeiling } = useSubscriptionStatus();
  const daysRemaining = daysUntilTrialCeiling;

  const source = route.params?.source ?? (isTrialActive ? 'settings' : 'expiry');
  const isMidTrial = source === 'settings' && isTrialActive;

  // Fetch offerings from RevenueCat
  const [monthlyPkg, setMonthlyPkg] = useState<PurchasesPackage | null>(null);
  const [annualPkg, setAnnualPkg] = useState<PurchasesPackage | null>(null);

  useEffect(() => {
    fetchOfferings().then((offerings) => {
      if (!offerings?.current) return;
      const monthly = offerings.current.availablePackages.find(
        (p) => p.product.identifier === 'com.gremly.mob2.monthly',
      );
      const annual = offerings.current.availablePackages.find(
        (p) => p.product.identifier === 'com.gremly.mob2.annual',
      );
      if (monthly) setMonthlyPkg(monthly);
      if (annual) setAnnualPkg(annual);
    });
  }, []);

  const handleSubscribe = useCallback(async () => {
    const pkg = selectedPlan === 'annual' ? annualPkg : monthlyPkg;
    if (!pkg) {
      Alert.alert('Not available', 'This plan is not available right now. Please try again later.');
      return;
    }
    setIsProcessing(true);
    try {
      const result = await purchasePackage(pkg);
      if (result.success) {
        setIsSubscribed(true);
        navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Tabs' }] }));
      } else if (result.cancelled) {
        // User cancelled - do nothing
      }
    } catch (err) {
      Alert.alert('Purchase failed', 'Something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [navigation, selectedPlan, annualPkg, monthlyPkg, setIsSubscribed]);

  const handleRestore = useCallback(async () => {
    setIsProcessing(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        setIsSubscribed(true);
        navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Tabs' }] }));
      } else {
        Alert.alert(
          'No subscription found',
          'We could not find an active subscription to restore.',
        );
      }
    } catch (err) {
      Alert.alert('Restore failed', 'Something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [navigation, setIsSubscribed]);

  const handleNotNow = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Tabs' }] }));
    }
  }, [navigation]);

  const subscribeLabel =
    selectedPlan === 'annual' ? 'Subscribe for $69.99 per year' : 'Subscribe for $9.99 per month';

  const subscribeA11yLabel =
    selectedPlan === 'annual'
      ? 'Subscribe for 69 dollars 99 cents per year'
      : 'Subscribe for 9 dollars 99 cents per month';

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
          {isMidTrial ? 'Gremly Premium' : 'Keep the momentum going'}
        </Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          {isMidTrial
            ? 'Unlock Gremly forever'
            : "Your free trial has ended. Here's what we built together."}
        </Text>

        {/* Trial remaining (mid-trial only) */}
        {isMidTrial && (
          <Text style={styles.trialRemaining}>
            {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} of free access remaining
          </Text>
        )}

        {/* Stats row (post-trial only) */}
        {!isMidTrial && (
          <View style={styles.statsRow} accessibilityRole="summary">
            <View
              style={styles.statCard}
              accessible
              accessibilityLabel={`${fedDaysCount} ${fedDaysCount === 1 ? 'day' : 'days'} fed`}
            >
              <Text style={styles.statNumber} importantForAccessibility="no">
                {fedDaysCount}
              </Text>
              <Text style={styles.statLabel} importantForAccessibility="no">
                days fed
              </Text>
            </View>
            <View
              style={styles.statCard}
              accessible
              accessibilityLabel={`${todayDropsCount} ${todayDropsCount === 1 ? 'thought' : 'thoughts'}`}
            >
              <Text style={styles.statNumber} importantForAccessibility="no">
                {todayDropsCount}
              </Text>
              <Text style={styles.statLabel} importantForAccessibility="no">
                thoughts
              </Text>
            </View>
            <View style={styles.statCard} accessible accessibilityLabel={`Gremly age ${gremlyAge}`}>
              <Text style={styles.statNumber} importantForAccessibility="no">
                {gremlyAge}
              </Text>
              <Text style={styles.statLabel} importantForAccessibility="no">
                Gremly age
              </Text>
            </View>
          </View>
        )}

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
            accessibilityState={{
              checked: selectedPlan === 'monthly',
              selected: selectedPlan === 'monthly',
            }}
            accessibilityLabel="Monthly plan, 9 dollars 99 cents per month"
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
              accessibilityState={{
                checked: selectedPlan === 'annual',
                selected: selectedPlan === 'annual',
              }}
              accessibilityLabel="Annual plan, 69 dollars 99 cents per year, save 42 percent"
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
        <Text style={styles.disclosure} accessible accessibilityRole="text">
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
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
          >
            Privacy Policy
          </Text>
          <Text style={styles.legalSeparator} importantForAccessibility="no">
            |
          </Text>
          <Text
            style={styles.legalLink}
            onPress={() => WebBrowser.openBrowserAsync('https://www.gremly.app/terms-of-service')}
            accessibilityRole="link"
            accessibilityLabel="Terms of Service"
          >
            Terms of Service
          </Text>
        </View>
      </ScrollView>

      {/* Bottom CTA pinned */}
      <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <Pressable
          style={[styles.subscribeButton, isProcessing && { opacity: 0.6 }]}
          onPress={handleSubscribe}
          disabled={isProcessing}
          accessibilityRole="button"
          accessibilityLabel={subscribeA11yLabel}
        >
          {isProcessing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.subscribeButtonText}>{subscribeLabel}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleRestore}
          disabled={isProcessing}
          accessibilityRole="button"
          accessibilityLabel="Restore previous purchase"
        >
          <Text style={styles.restoreText}>Restore purchase</Text>
        </Pressable>

        {navigation.canGoBack() && (
          <Pressable onPress={handleNotNow} accessibilityRole="button" accessibilityLabel="Not now">
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
        )}
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
    marginBottom: 8,
  },
  trialRemaining: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: BRAND.colors.mossGreen,
    textAlign: 'center',
    marginBottom: 12,
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
