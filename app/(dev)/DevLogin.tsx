/**
 * DEV-ONLY: Development Login & Supabase Smoke Test
 *
 * This screen allows developers to:
 * - Test email/password authentication
 * - Test magic link authentication
 * - Create test records to verify Supabase integration
 * - Check current auth state
 * - Toggle DS UI feature flag override
 *
 * This screen is only accessible in development builds via the floating debug button.
 */

import React, { useState } from 'react';
import { TextInput, ScrollView, Alert } from 'react-native';
import { Screen, Box, Text } from '../../ui';
import { Button, Card } from '../../design-system';
import { useAuth } from '../../providers/AuthProvider';
import { useRepo } from '../../providers/RepoProvider';
import { useDsToggle } from '../../providers/DsToggleProvider';
import { FLAGS } from '../../config/flags';

export default function DevLogin() {
  const { user, userId, loading, signInWithEmail, signOut } = useAuth();
  const repo = useRepo();
  const { useDs, useDsOverride, toggleDsOverride } = useDsToggle();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [testResult, setTestResult] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handlePasswordSignIn = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter an email');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }

    try {
      await signInWithEmail(email, password);
      setTestResult('✅ Signed in with password');
    } catch (error) {
      setTestResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleMagicLinkSignIn = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter an email');
      return;
    }

    try {
      await signInWithEmail(email);
      setTestResult('✅ Magic link sent! Check your email.');
    } catch (error) {
      setTestResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setTestResult('✅ Signed out');
      setEmail('');
      setPassword('');
    } catch (error) {
      setTestResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCreateTestTodo = async () => {
    if (!userId) {
      Alert.alert('Error', 'You must be signed in to create a todo');
      return;
    }

    setIsCreating(true);
    setTestResult('Creating test todo...');

    try {
      const createInput = {
        type: 'todo' as const,
        title: 'Phase 4 smoke',
        due_date: null,
        undefined_due: true,
        space_id: null,
        ai_placed: false,
      };

      const result = await repo.create(createInput);
      setTestResult(`✅ Created todo: ${result.id}`);
    } catch (error) {
      setTestResult(
        `❌ Create failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFF7EA' }}>
      <Box p={4} pb={20}>
        {/* Header */}
        <Box mb={6}>
          <Box mb={2}>
            <Text variant="display">🔧 Dev Login & Smoke Test</Text>
          </Box>
          <Text variant="subtle">Test authentication, create test records, check DS UI state</Text>
        </Box>

        {/* DS Feature Flag */}
        <Box mb={4}>
          <Card>
            <Box mb={2}>
              <Text variant="title">�� DS UI Feature Flag</Text>
            </Box>
            <Box mb={2}>
              <Box mb={1}>
                <Text variant="label">
                  Compile-time (FLAGS.USE_DS_UI): {FLAGS.USE_DS_UI ? 'ON' : 'OFF'}
                </Text>
              </Box>
              <Box mb={1}>
                <Text variant="label">Runtime Override: {useDsOverride ? 'ON' : 'OFF'}</Text>
              </Box>
              <Text variant="label">Current UI: {useDs ? 'DS UI' : 'Legacy UI'}</Text>
            </Box>
            <Button
              label={useDsOverride ? 'Disable DS Override' : 'Enable DS Override'}
              variant="primary"
              onPress={toggleDsOverride}
            />
            <Box mt={2}>
              <Text variant="subtle">
                Toggle to test switching between DS and Legacy UI at runtime (dev only)
              </Text>
            </Box>
          </Card>
        </Box>

        {/* Auth Status */}
        <Box mb={4}>
          <Card>
            <Box mb={2}>
              <Text variant="title">Auth Status</Text>
            </Box>
            <Box gap={1}>
              <Text variant="label">Status: {user ? '✅ Signed In' : '❌ Not Signed In'}</Text>
              {user && (
                <>
                  <Text variant="label">User ID: {user.id?.slice(0, 8)}...</Text>
                  <Text variant="label">Email: {user.email || 'N/A'}</Text>
                </>
              )}
              {loading && <Text variant="label">⏳ Loading...</Text>}
            </Box>
          </Card>
        </Box>

        {/* Email/Password Form */}
        {!user && (
          <Box mb={4}>
            <Card>
              <Box mb={2}>
                <Text variant="title">Sign In</Text>
              </Box>
              <Box gap={3}>
                <Box>
                  <Box mb={1}>
                    <Text variant="label">Email</Text>
                  </Box>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="dev@example.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={{
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                      borderRadius: 16,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      fontSize: 16,
                    }}
                  />
                </Box>
                <Box>
                  <Box mb={1}>
                    <Text variant="label">Password (optional for magic link)</Text>
                  </Box>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secureTextEntry
                    style={{
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                      borderRadius: 16,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      fontSize: 16,
                    }}
                  />
                </Box>
                <Button
                  label="Sign In (Password)"
                  variant="primary"
                  onPress={handlePasswordSignIn}
                  disabled={!email || !password}
                />
                <Button
                  label="Sign In (Magic Link)"
                  variant="secondary"
                  onPress={handleMagicLinkSignIn}
                  disabled={!email}
                />
              </Box>
            </Card>
          </Box>
        )}

        {/* Sign Out Button */}
        {user && (
          <Box mb={4}>
            <Button label="Sign Out" variant="outline" onPress={handleSignOut} />
          </Box>
        )}

        {/* Test Record Creation */}
        {userId && (
          <Box mb={4}>
            <Card>
              <Box mb={2}>
                <Text variant="title">ℹ️ Supabase Smoke Test</Text>
              </Box>
              <Box mb={2}>
                <Text variant="body">
                  Create a test todo to verify Supabase schema, RLS, and repo layer are working.
                </Text>
              </Box>
              <Button
                label={isCreating ? 'Creating...' : 'Create Test Todo'}
                variant="primary"
                onPress={handleCreateTestTodo}
                disabled={isCreating}
              />
              {testResult && (
                <Box mt={2}>
                  <Text variant="label">{testResult}</Text>
                </Box>
              )}
            </Card>
          </Box>
        )}

        {/* Environment Info */}
        <Box mb={4}>
          <Card>
            <Box mb={2}>
              <Text variant="title">ℹ️ Environment Info</Text>
            </Box>
            <Box gap={1}>
              <Text variant="label">
                Supabase URL: {process.env.EXPO_PUBLIC_SUPABASE_URL?.slice(0, 30)}...
              </Text>
              <Text variant="label">
                Anon Key: {process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 20)}...
              </Text>
              <Text variant="label">__DEV__: {__DEV__ ? 'true' : 'false'}</Text>
            </Box>
          </Card>
        </Box>
      </Box>
    </ScrollView>
  );
}
