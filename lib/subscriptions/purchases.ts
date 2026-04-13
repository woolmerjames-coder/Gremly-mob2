/**
 * lib/subscriptions/purchases.ts - RevenueCat SDK initialization and helpers
 *
 * Wraps react-native-purchases for Gremly Pro subscription management.
 * Entitlement: "Gremly Pro"
 * Products: com.gremly.mob2.monthly, com.gremly.mob2.annual
 */

import Purchases, {
  LOG_LEVEL,
  PurchasesPackage,
  CustomerInfo,
  PurchasesOfferings,
} from 'react-native-purchases';
import { env } from '../env';

const ENTITLEMENT_ID = 'Gremly Pro';

export function configurePurchases(): void {
  const apiKey = env.revenueCatApiKey;
  if (!apiKey) {
    console.warn('[Purchases] No RevenueCat API key found, skipping configuration');
    return;
  }
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  Purchases.configure({ apiKey });
  if (__DEV__) console.log('[Purchases] Configured');
}

export async function loginUser(userId: string): Promise<void> {
  try {
    await Purchases.logIn(userId);
    if (__DEV__) console.log('[Purchases] Logged in user:', userId);
  } catch (err) {
    console.warn('[Purchases] logIn failed:', err);
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await Purchases.logOut();
    if (__DEV__) console.log('[Purchases] Logged out');
  } catch (err) {
    console.warn('[Purchases] logOut failed:', err);
  }
}

export async function getActiveEntitlement(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return ENTITLEMENT_ID in (customerInfo.entitlements.active ?? {});
  } catch (err) {
    console.warn('[Purchases] getCustomerInfo failed:', err);
    return false;
  }
}

export async function fetchOfferings(): Promise<PurchasesOfferings | null> {
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
