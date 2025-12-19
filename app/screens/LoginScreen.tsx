/**
 * LoginScreen - Google Sign-In entry point
 * Clean, ADHD-friendly single-action login
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  SafeAreaView,
  Platform,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../../providers/AuthProvider';

const COLORS = {
  sage: '#5B7C6B',
  sageDark: '#4A6559',
  cream: '#FAF9F6',
  charcoal: '#2D2D2D',
  error: '#D64545',
};

export default function LoginScreen() {
  const { signInWithGoogle, signInWithApple, loading, error, clearError } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    clearError();
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('[LoginScreen] Sign in failed:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleAppleSignIn = async () => {
    setIsSigningIn(true);
    clearError();
    try {
      await signInWithApple();
    } catch (err: any) {
      // Don't log cancelled sign-ins
      if (err.message) {
        console.error('[LoginScreen] Apple sign in failed:', err);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const isLoading = loading || isSigningIn;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoSection}>
          <Image
            source={require('../../assets/images/gremlywaving.png')}
            style={styles.mascot}
            resizeMode="contain"
          />
          <Image
            source={require('../../assets/images/gremly_wordmark-removebg.png')}
            style={styles.wordmark}
            resizeMode="contain"
          />
          <Text style={styles.tagline}>Your brain's new best friend</Text>
        </View>

        <View style={styles.signInSection}>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.googleButton, isLoading && styles.googleButtonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.charcoal} size="small" />
            ) : (
              <>
                <Image
                  source={require('../../assets/images/google-icon2.png')}
                  style={styles.googleIcon}
                />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          )}

          <Text style={styles.disclaimer}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 40,
  },
  logoSection: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  mascot: {
    width: 180,
    height: 180,
    marginBottom: 16,
  },
  wordmark: {
    width: 160,
    height: 50,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 18,
    color: COLORS.sage,
    fontWeight: '500',
  },
  signInSection: {
    alignItems: 'center',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    width: '100%',
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
    textAlign: 'center',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  googleButtonDisabled: {
    opacity: 0.7,
  },
  googleIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.charcoal,
  },
  appleButton: {
    width: '100%',
    height: 54,
    marginTop: 12,
  },
  disclaimer: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
  },
});
