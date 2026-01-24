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
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Keyboard,
} from 'react-native';
import { Text } from '../../ui';
import { Calendar, Link2, Unlink, Mail, Globe, X, Check } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { CalendarProvider } from '../../lib/calendar/CalendarClient';

// Microsoft and Google brand colors for icons
const PROVIDER_COLORS = {
  outlook: '#0078D4', // Microsoft blue
  google: '#4285F4', // Google blue
  ics: '#6B7280',
};

export default function CalendarConnectionsCard() {
  const connections = useGremlyStore((s) => s.calendarConnections);
  const connectCalendar = useGremlyStore((s) => s.connectCalendar);
  const connectIcsCalendar = useGremlyStore((s) => s.connectIcsCalendar);
  const disconnectCalendar = useGremlyStore((s) => s.disconnectCalendar);
  const refreshCalendarConnections = useGremlyStore((s) => s.refreshCalendarConnections);
  const loading = useGremlyStore((s) => s.calendarLoading);

  const [connectingProvider, setConnectingProvider] = useState<CalendarProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<CalendarProvider | null>(null);
  const [showIcsInput, setShowIcsInput] = useState(false);
  const [icsUrl, setIcsUrl] = useState('');
  const [icsLabel, setIcsLabel] = useState('');
  const [icsLoading, setIcsLoading] = useState(false);

  // Refresh connections on mount
  useEffect(() => {
    refreshCalendarConnections();
  }, [refreshCalendarConnections]);

  const outlookConnection = connections.find((c) => c.provider === 'outlook');
  const googleConnection = connections.find((c) => c.provider === 'google');
  const icsConnection = connections.find((c) => c.provider === 'ics');

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

  const handleConnectIcs = async () => {
    if (!icsUrl.trim()) {
      Alert.alert('Missing URL', 'Please paste your calendar URL');
      return;
    }

    Keyboard.dismiss();
    setIcsLoading(true);

    try {
      const result = await connectIcsCalendar(icsUrl.trim(), icsLabel.trim() || undefined);
      if (result.success) {
        setShowIcsInput(false);
        setIcsUrl('');
        setIcsLabel('');
        Alert.alert('Connected!', `Calendar "${result.calendarName || 'ICS Calendar'}" added`);
      } else {
        Alert.alert('Connection Failed', result.error || 'Could not load calendar. Check the URL.');
      }
    } catch (error) {
      Alert.alert('Connection Failed', error instanceof Error ? error.message : 'Unexpected error');
    } finally {
      setIcsLoading(false);
    }
  };

  const handleCancelIcs = () => {
    setShowIcsInput(false);
    setIcsUrl('');
    setIcsLabel('');
    Keyboard.dismiss();
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

        {/* ICS Calendar Connection */}
        {icsConnection?.isConnected ? (
          <View style={styles.connectedRow}>
            <View style={styles.providerInfo}>
              <View style={[styles.providerIcon, { backgroundColor: PROVIDER_COLORS.ics }]}>
                <Globe size={14} color="#FFFFFF" />
              </View>
              <View style={styles.providerDetails}>
                <Text style={styles.providerName}>Calendar Link</Text>
                <Text style={styles.providerEmail} numberOfLines={1}>
                  {icsConnection.email || 'Connected'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={() => handleDisconnect('ics')}
              disabled={isDisconnecting('ics')}
              accessibilityLabel="Disconnect ICS Calendar"
              accessibilityRole="button"
            >
              {isDisconnecting('ics') ? (
                <ActivityIndicator size="small" color={BRAND.colors.inkSubtle} />
              ) : (
                <>
                  <Unlink size={14} color={BRAND.colors.inkSubtle} />
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : showIcsInput ? (
          <View style={styles.icsInputContainer}>
            <View style={styles.icsInputHeader}>
              <View style={[styles.providerIcon, { backgroundColor: PROVIDER_COLORS.ics }]}>
                <Globe size={14} color="#FFFFFF" />
              </View>
              <Text style={styles.icsInputTitle}>Add Calendar Link</Text>
              <TouchableOpacity onPress={handleCancelIcs} style={styles.icsCloseButton}>
                <X size={18} color={BRAND.colors.inkSubtle} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.icsInput}
              placeholder="Paste calendar URL (.ics)"
              placeholderTextColor={BRAND.colors.inkMuted}
              value={icsUrl}
              onChangeText={setIcsUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!icsLoading}
            />
            <TextInput
              style={styles.icsInput}
              placeholder="Label (optional, e.g. Work Calendar)"
              placeholderTextColor={BRAND.colors.inkMuted}
              value={icsLabel}
              onChangeText={setIcsLabel}
              autoCapitalize="words"
              onSubmitEditing={handleConnectIcs}
              editable={!icsLoading}
            />
            <TouchableOpacity
              style={[styles.icsAddButton, icsLoading && styles.icsAddButtonDisabled]}
              onPress={handleConnectIcs}
              disabled={icsLoading || !icsUrl.trim()}
            >
              {icsLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Check size={16} color="#FFFFFF" />
                  <Text style={styles.icsAddButtonText}>Add Calendar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.connectButtonSecondary}
            onPress={() => setShowIcsInput(true)}
          >
            <View style={[styles.providerIcon, { backgroundColor: PROVIDER_COLORS.ics }]}>
              <Globe size={14} color="#FFFFFF" />
            </View>
            <View style={styles.icsButtonTextContainer}>
              <Text style={styles.connectButtonTextSecondary}>Add Calendar Link</Text>
              <Text style={styles.icsButtonSubtext}>
                For published or restricted work calendars
              </Text>
            </View>
            <Link2 size={16} color={BRAND.colors.mossGreen} style={styles.linkIcon} />
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
            style={[styles.connectButton, styles.connectButtonDisabled]}
            disabled={true}
            accessibilityLabel="Connect Google Calendar (Coming Soon)"
            accessibilityRole="button"
          >
            <View style={[styles.providerIcon, { backgroundColor: PROVIDER_COLORS.google }]}>
              <Mail size={14} color="#FFFFFF" />
            </View>
            <Text style={[styles.connectButtonText, styles.connectButtonTextDisabled]}>
              Connect Google
            </Text>
            <Text style={styles.comingSoonBadge}>Coming soon</Text>
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
  connectButtonDisabled: {
    backgroundColor: 'rgba(46, 85, 64, 0.4)',
  },
  connectButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  connectButtonTextDisabled: {
    opacity: 0.8,
  },
  linkIcon: {
    marginLeft: 'auto',
  },
  comingSoonBadge: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BRAND.radius.pill,
    marginLeft: 'auto',
  },
  helperText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    lineHeight: 18,
  },
  connectButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.mossGreen,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  connectButtonTextSecondary: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  icsButtonTextContainer: {
    flex: 1,
  },
  icsButtonSubtext: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    marginTop: 2,
  },
  icsInputContainer: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.mossGreen,
    padding: 12,
    gap: 10,
  },
  icsInputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  icsInputTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  icsCloseButton: {
    padding: 4,
  },
  icsInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: BRAND.radius.sm,
    borderWidth: 1,
    borderColor: '#E8E6E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
  },
  icsAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: BRAND.radius.sm,
    paddingVertical: 12,
    marginTop: 4,
  },
  icsAddButtonDisabled: {
    opacity: 0.6,
  },
  icsAddButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
