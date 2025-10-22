/**
 * DEV-ONLY: Development Login & Supabase Smoke Test
 *
 * This screen verifies:
 * - Supabase authentication
 * - Database read/write access (RLS)
 * - Correct schema alignment (todos.name, todos.owner_id)
 */

import React, { useState } from 'react';
import { TextInput, ScrollView, Alert, ToastAndroid, Platform } from 'react-native';
import { Box, Text } from '../../ui';
import { Button, Card } from '../../design-system';
import { useAuth } from '../../providers/AuthProvider';
import { useRepo } from '../../providers/RepoProvider';
import { useDsToggle } from '../../providers/DsToggleProvider';
import { FLAGS } from '../../config/flags';
import { eventBus } from '../../lib/events';
import { supabase } from '../../lib/supabase/client';

export default function DevLogin() {
  const { user, userId, loading, signInWithEmail, devSignIn, signOut } = useAuth();
  const { useDs, useDsOverride, toggleDsOverride } = useDsToggle();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [testResult, setTestResult] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const showToast = (message: string) => {
    if (Platform.OS === 'android' && ToastAndroid) ToastAndroid.show(message, ToastAndroid.SHORT);
    else Alert.alert('Info', message);
  };

  // ---------- AUTH HANDLERS ----------

  const handleDevSignIn = async () => {
    try {
      await devSignIn();
      setTestResult('✅ Dev signed in successfully');
      showToast('Signed in as dev user');
      eventBus.emit('ItemSaved', { id: 'dev-login-trigger' });
    } catch (error: any) {
      const msg = error?.message ?? String(error ?? 'Unknown error');
      setTestResult(`❌ Error: ${msg}`);
    }
  };

  const handlePasswordSignIn = async () => {
    if (!email.trim()) return Alert.alert('Error', 'Please enter an email');
    if (!password.trim()) return Alert.alert('Error', 'Please enter a password');

    try {
      await signInWithEmail(email, password);
      setTestResult('✅ Signed in with password');
    } catch (error: any) {
      setTestResult(`❌ Error: ${error?.message ?? String(error)}`);
    }
  };

  const handleMagicLinkSignIn = async () => {
    if (!email.trim()) return Alert.alert('Error', 'Please enter an email');
    try {
      await signInWithEmail(email);
      setTestResult('✅ Magic link sent! Check your email.');
    } catch (error: any) {
      setTestResult(`❌ Error: ${error?.message ?? String(error)}`);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setTestResult('✅ Signed out');
      setEmail('');
      setPassword('');
    } catch (error: any) {
      setTestResult(`❌ Error: ${error?.message ?? String(error)}`);
    }
  };

  // ---------- SMOKE TESTS ----------

  const handleSmokeTest = async () => {
    setTestResult('Running Supabase smoke test...');
    try {
      const { data, error } = await supabase.from('todos').select('id').limit(1);
      if (error) {
        console.error('[DevLogin SmokeTest] error', error);
        Alert.alert('DB Error', `${error.code || ''} ${error.message}`);
        setTestResult(`❌ DB Error: ${error.code || ''} ${error.message}`);
      } else {
        Alert.alert('DB OK', `rows: ${data?.length ?? 0}`);
        setTestResult(`✅ DB OK - rows: ${data?.length ?? 0}`);
      }
    } catch (error: any) {
      const msg = error?.message ?? String(error ?? 'Unknown error');
      Alert.alert('Test Failed', msg);
      setTestResult(`❌ Test failed: ${msg}`);
    }
  };

  const handleCreateTestTodo = async () => {
    if (!userId) return Alert.alert('Error', 'You must be signed in to create a todo');
    setIsCreating(true);
    setTestResult('Creating test todo...');

    try {
      const payload = {
        name: 'Phase 4 smoke',
        owner_id: userId, // required for RLS
      };

      console.log('[DevLogin] Inserting todo payload:', payload);

      const { data, error } = await supabase.from('todos').insert([payload]).select('id').single();

      if (error) {
        console.error('[DevLogin] Insert error:', error);
        Alert.alert('Create failed', error.message || 'Unknown DB error');
        setTestResult(`❌ Create failed: ${error.message || 'Unknown DB error'}`);
      } else {
        Alert.alert('Success', `Created todo: ${data.id}`);
        setTestResult(`✅ Created todo: ${data.id}`);
      }
    } catch (error: any) {
      console.error('[DevLogin] Insert threw:', error);
      const msg = error?.message ?? String(error ?? 'Unknown error');
      setTestResult(`❌ Create failed: ${msg}`);
    } finally {
      setIsCreating(false);
    }
  };

  // ---------- RENDER ----------
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFF7EA' }}>
      <Box p={4} pb={20}>
        {/* Header */}
        <Box mb={6}>
          <Box mb={2}>
            <Text variant="display">🔧 Dev Login & Smoke Test</Text>
          </Box>
          <Text variant="subtle">Test authentication, RLS, and Supabase connectivity</Text>
        </Box>

        {/* DS Feature Flag */}
        <Box mb={4}>
          <Card>
            <Box mb={2}>
              <Text variant="title">🧪 DS UI Feature Flag</Text>
            </Box>
            <Box mb={2}>
              <Text variant="label">Compile-time: {FLAGS.USE_DS_UI ? 'ON' : 'OFF'}</Text>
              <Text variant="label">Runtime Override: {useDsOverride ? 'ON' : 'OFF'}</Text>
              <Text variant="label">Current UI: {useDs ? 'DS UI' : 'Legacy UI'}</Text>
            </Box>
            <Button
              label={useDsOverride ? 'Disable DS Override' : 'Enable DS Override'}
              variant="primary"
              onPress={toggleDsOverride}
            />
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

        {/* Sign-In */}
        {!user && (
          <>
            <Box mb={4}>
              <Card>
                <Box mb={2}>
                  <Text variant="title">⚡ Quick Dev Sign-In</Text>
                </Box>
                <Button
                  label="Sign In as Dev"
                  variant="primary"
                  onPress={handleDevSignIn}
                  disabled={loading}
                />
                {testResult && (
                  <Box mt={2}>
                    <Text variant="label">{testResult}</Text>
                  </Box>
                )}
              </Card>
            </Box>

            <Box mb={4}>
              <Card>
                <Box mb={2}>
                  <Text variant="title">Manual Sign In</Text>
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
                      <Text variant="label">Password (optional)</Text>
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
          </>
        )}

        {/* Sign Out */}
        {user && (
          <Box mb={4}>
            <Button label="Sign Out" variant="outline" onPress={handleSignOut} />
          </Box>
        )}

        {/* Smoke + Create */}
        {userId && (
          <Box mb={4}>
            <Card>
              <Box mb={2}>
                <Text variant="title">🔍 Supabase Smoke Test</Text>
              </Box>
              <Button label="Run Smoke Test" variant="outline" onPress={handleSmokeTest} />
              <Box mt={3}>
                <Button
                  label={isCreating ? 'Creating...' : 'Create Test Todo'}
                  variant="primary"
                  onPress={handleCreateTestTodo}
                  disabled={isCreating}
                />
              </Box>
              {testResult && (
                <Box mt={2}>
                  <Text variant="label">{testResult}</Text>
                </Box>
              )}
            </Card>
          </Box>
        )}

        {/* Env Info */}
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
