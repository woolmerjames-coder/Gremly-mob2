/**
 * lib/subscriptions/purchases.ts - RevenueCat SDK initialization and helpers
 *
 * Wraps react-native-purchases for Gremly Pro subscription management.
 * Entitlement: "Gremly Pro"
 * Products: com.gremly.mob2.monthly, com.gremly.mob2.annual
 *
 * The native module is lazy-loaded so the top-level import does not crash
 * in Expo Go (which lacks the native RevenueCat binary).
 */

import type { PurchasesPackage, CustomerInfo, PurchasesOfferings } from 'react-native-purchases';
import Constants from 'expo-constants';
import { env } from '../env';

const ENTITLEMENT_ID = 'Gremly Pro';

let isExpoGo = false;
try {
  isExpoGo = Constants.appOwnership === 'expo' || !Constants.isDevice;
} catch {
  isExpoGo = false;
}

/** Lazy accessor - only touches the native module outside Expo Go */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPurchases(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-purchases').default;
  } catch {
    console.warn('[Purchases] Native module not available');
    return null;
  }
}

export function configurePurchases(): void {
  if (isExpoGo) {
    if (__DEV__) console.log('[Purchases] Skipping RevenueCat init in Expo Go');
    return;
  }
  const apiKey = env.revenueCatApiKey;
  if (!apiKey) {
    console.warn('[Purchases] No RevenueCat API key found, skipping configuration');
    return;
  }
  const Purchases = getPurchases();
  if (!Purchases) return;
  if (__DEV__) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { LOG_LEVEL } = require('react-native-purchases');
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    } catch {
      // ignore
    }
  }
  Purchases.configure({ apiKey });
  if (__DEV__) console.log('[Purchases] Configured');
}

export async function loginUser(userId: string): Promise<void> {
  if (isExpoGo) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logIn(userId);
    if (__DEV__) console.log('[Purchases] Logged in user:', userId);
  } catch (err) {
    console.warn('[Purchases] logIn failed:', err);
  }
}

export async function logoutUser(): Promise<void> {
  if (isExpoGo) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logOut();
    if (__DEV__) console.log('[Purchases] Logged out');
  } catch (err) {
    console.warn('[Purchases] logOut failed:', err);
  }
}

export async function getActiveEntitlement(): Promise<boolean> {
  if (isExpoGo) return false;
  const Purchases = getPurchases();
  if (!Purchases) return false;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return ENTITLEMENT_ID in (customerInfo.entitlements.active ?? {});
  } catch (err) {
    console.warn('[Purchases] getCustomerInfo failed:', err);
    return false;
  }
}

export async function fetchOfferings(): Promise<PurchasesOfferings | null> {
  if (isExpoGo) return null;
  const Purchases = getPurchases();
  if (!Purchases) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch (err) {
    console.warn('[Purchases] getOfferings failed:', err);
    return null;
  }
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<{ success: boolean; customerInfo?: CustomerInfo; cancelled?: boolean }> {
  if (isExpoGo) return { success: false, cancelled: true };
  const Purchases = getPurchases();
  if (!Purchases) return { success: false, cancelled: true };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isActive = ENTITLEMENT_ID in (customerInfo.entitlements.active ?? {});
    return { success: isActive, customerInfo };
  } catch (err: any) {
    if (err.userCancelled) {
      return { success: false, cancelled: true };
    }
    console.error('[Purchases] purchasePackage failed:', err);
    throw err;
  }
}

export async function restorePurchases(): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
}> {
  if (isExpoGo) return { success: false };
  const Purchases = getPurchases();
  if (!Purchases) return { success: false };
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isActive = ENTITLEMENT_ID in (customerInfo.entitlements.active ?? {});
    return { success: isActive, customerInfo };
  } catch (err) {
    console.error('[Purchases] restorePurchases failed:', err);
    throw err;
  }
}

export { ENTITLEMENT_ID };
