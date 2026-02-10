/**
 * CalendarConnectionsCard Component
 *
 * Displays connected calendar accounts and allows users to:
 * - View connected accounts with email
 * - Connect Outlook calendar via OAuth
 * - Connect Google calendar (coming soon)
 * - Disconnect calendar accounts
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Text } from '../../ui';
import { Calendar, Link2, Unlink, Mail } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { CalendarProvider } from '../../lib/calendar/CalendarClient';

// Microsoft and Google brand colors for icons
const PROVIDER_COLORS = {
  outlook: '#0078D4', // Microsoft blue
  google: '#4285F4', // Google blue
};

export default function CalendarConnectionsCard() {
  const connections = useGremlyStore((s) => s.calendarConnections);
  const connectCalendar = useGremlyStore((s) => s.connectCalendar);
  const disconnectCalendar = useGremlyStore((s) => s.disconnectCalendar);
  const refreshCalendarConnections = useGremlyStore((s) => s.refreshCalendarConnections);
  const loading = useGremlyStore((s) => s.calendarLoading);

  const [connectingProvider, setConnectingProvider] = useState<CalendarProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<CalendarProvider | null>(null);

  // Refresh connections on mount
  useEffect(() => {
    refreshCalendarConnections();
  }, [refreshCalendarConnections]);

  const outlookConnection = connections.find((c) => c.provider === 'outlook');
  const googleConnection = connections.find((c) => c.provider === 'google');

  const handleConnect = async (provider: CalendarProvider) => {
    setConnectingProvider(provider);
    try {
      const result = await connectCalendar(provider);
      if (!result.success) {
        Alert.alert(
          'Connection Failed',
          result.error || 'Unknown error occurred. Please try again.',
        );
      }
    } catch (error) {
      Alert.alert('Connection Failed', error instanceof Error ? error.message : 'Unexpected error');
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleDisconnect = async (provider: CalendarProvider) => {
    setDisconnectingProvider(provider);
    try {
      await disconnectCalendar(provider);
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const isConnecting = (provider: CalendarProvider) => connectingProvider === provider;
  const isDisconnecting = (provider: CalendarProvider) => disconnectingProvider === provider;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Calendar size={20} color={BRAND.colors.mossGreen} />
        <Text style={styles.title}>Calendar Connections</Text>
      </View>

      {/* Loading overlay for initial fetch */}
      {loading && connections.length === 0 && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={BRAND.colors.mossGreen} />
          <Text style={styles.loadingText}>Loading connections...</Text>
        </View>
      )}

      {/* Connection list */}
      <View style={styles.connectionsList}>
        {/* Outlook Connection */}
        {outlookConnection?.isConnected ? (
          <View style={styles.connectedRow}>
            <View style={styles.providerInfo}>
              <View style={[styles.providerIcon, { backgroundColor: PROVIDER_COLORS.outlook }]}>
                <Mail size={14} color="#FFFFFF" />
              </View>
              <View style={styles.providerDetails}>
                <Text style={styles.providerName}>Outlook</Text>
                <Text style={styles.providerEmail} numberOfLines={1}>
                  {outlookConnection.email || 'Connected'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={() => handleDisconnect('outlook')}
              disabled={isDisconnecting('outlook')}
              accessibilityLabel="Disconnect Outlook"
              accessibilityRole="button"
            >
              {isDisconnecting('outlook') ? (
                <ActivityIndicator size="small" color={BRAND.colors.inkSubtle} />
              ) : (
                <>
                  <Unlink size={14} color={BRAND.colors.inkSubtle} />
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.connectButton}
            onPress={() => handleConnect('outlook')}
            disabled={isConnecting('outlook')}
            accessibilityLabel="Connect Outlook Calendar"
            accessibilityRole="button"
          >
            {isConnecting('outlook') ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <View style={[styles.providerIcon, { backgroundColor: PROVIDER_COLORS.outlook }]}>
                  <Mail size={14} color="#FFFFFF" />
                </View>
                <Text style={styles.connectButtonText}>Connect Outlook</Text>
                <Link2 size={16} color="#FFFFFF" style={styles.linkIcon} />
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Google Connection */}
        {googleConnection?.isConnected ? (
          <View style={styles.connectedRow}>
            <View style={styles.providerInfo}>
              <View style={[styles.providerIcon, { backgroundColor: PROVIDER_COLORS.google }]}>
                <Mail size={14} color="#FFFFFF" />
              </View>
              <View style={styles.providerDetails}>
                <Text style={styles.providerName}>Google</Text>
                <Text style={styles.providerEmail} numberOfLines={1}>
                  {googleConnection.email || 'Connected'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={() => handleDisconnect('google')}
              disabled={isDisconnecting('google')}
              accessibilityLabel="Disconnect Google Calendar"
              accessibilityRole="button"
            >
              {isDisconnecting('google') ? (
                <ActivityIndicator size="small" color={BRAND.colors.inkSubtle} />
              ) : (
                <>
                  <Unlink size={14} color={BRAND.colors.inkSubtle} />
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.connectButton}
            onPress={() => handleConnect('google')}
            disabled={isConnecting('google')}
            accessibilityLabel="Connect Google Calendar"
            accessibilityRole="button"
          >
            {isConnecting('google') ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <View style={[styles.providerIcon, { backgroundColor: PROVIDER_COLORS.google }]}>
                  <Mail size={14} color="#FFFFFF" />
                </View>
                <Text style={styles.connectButtonText}>Connect Google Calendar</Text>
                <Link2 size={16} color="#FFFFFF" style={styles.linkIcon} />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Helper text */}
      <Text style={styles.helperText}>
        Connect your calendar to see events in your daily view and get smarter scheduling
        suggestions.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: '#E8E6E1',
    padding: 16,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 14,
    color: BRAND.colors.inkSubtle,
  },
  connectionsList: {
    gap: 12,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: '#E8E6E1',
    padding: 12,
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  providerIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerDetails: {
    flex: 1,
  },
  providerName: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  providerEmail: {
    fontSize: 12,
    color: BRAND.colors.inkSubtle,
    marginTop: 1,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BRAND.radius.sm,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  disconnectText: {
    fontSize: 13,
    color: BRAND.colors.inkSubtle,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: BRAND.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  connectButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  linkIcon: {
    marginLeft: 'auto',
  },
  helperText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    lineHeight: 18,
  },
});
