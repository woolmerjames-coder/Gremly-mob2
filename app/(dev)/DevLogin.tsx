/**
 * DEV-ONLY: Development Login & Supabase Smoke Test
 *
 * This screen allows developers to:
 * - Test email/password authentication
 * - Test magic link authentication
 * - Create test records to verify Supabase integration
 * - Check current auth state
 *
 * This screen is only accessible in development builds via the floating debug button.
 */

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
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';
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
      // Create todo with minimal fields - DB will auto-generate id, owner_id, timestamps
      const createInput = {
        type: 'todo' as const,
        title: 'Phase 4 smoke',
        body: 'created from Dev Login',
        undefined_due: true,
        ai_placed: false,
        // Do NOT send: owner_id, created_at, updated_at, id
      };

      if (__DEV__) {
        console.log('[DevLogin] Calling repo.create() with:', JSON.stringify(createInput, null, 2));
      }

      const todo = await repo.create(createInput);

      if (__DEV__) {
        console.log('[DevLogin] Todo created successfully:', JSON.stringify(todo, null, 2));
      }

      setTestResult(`✅ Todo created! ID: ${todo.id.substring(0, 8)}...`);

      // Verify we can read it back
      const retrieved = await repo.getById(todo.id);
      if (retrieved) {
        setTestResult((prev) => prev + '\n✅ Todo verified via getById()');
      }
    } catch (error) {
      if (__DEV__) {
        console.error('[DevLogin] Error creating todo:', error);
      }
      setTestResult(
        `❌ Error creating todo: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-[#FFF7EA]">
      <View className="p-4 pb-20">
        {/* Header */}
        <View className="mb-6">
          <Text className="text-2xl font-bold text-[#0F4C5C] mb-2">🔧 Dev Login & Smoke Test</Text>
          <Text className="text-sm text-gray-600">
            Development-only screen for testing Supabase auth and repo integration
          </Text>
        </View>

        {/* DS UI Toggle */}
        <View className="bg-white rounded-2xl p-4 mb-4 border border-gray-200">
          <Text className="text-sm font-semibold text-[#0F4C5C] mb-2">🎨 DS UI Feature Flag</Text>
          <View className="mb-2">
            <Text className="text-xs text-gray-600 mb-1">
              Flag (config/flags.ts):{' '}
              <Text className="font-mono">{FLAGS.USE_DS_UI ? 'ON' : 'OFF'}</Text>
            </Text>
            <Text className="text-xs text-gray-600 mb-1">
              Runtime Override: <Text className="font-mono">{useDsOverride ? 'ON' : 'OFF'}</Text>
            </Text>
            <Text className="text-xs text-gray-600">
              Effective:{' '}
              <Text className="font-mono font-bold">{useDs ? 'DS UI' : 'Legacy UI'}</Text>
            </Text>
          </View>
          <Pressable
            className="bg-[#0F4C5C] rounded-2xl py-3 px-4 items-center"
            onPress={toggleDsOverride}
          >
            <Text className="text-white text-sm font-semibold">
              {useDsOverride ? '🔴 Disable DS Override' : '🟢 Enable DS Override'}
            </Text>
          </Pressable>
          <Text className="text-xs text-gray-500 mt-2">
            ⚠️ Note: Requires app reload to take effect due to require() caching
          </Text>
        </View>

        {/* Auth Status */}
        <View className="bg-white rounded-2xl p-4 mb-4 border border-gray-200">
          <Text className="text-sm font-semibold text-[#0F4C5C] mb-2">Auth Status</Text>
          {loading ? (
            <Text className="text-gray-600">Loading...</Text>
          ) : user ? (
            <>
              <Text className="text-sm text-gray-800 mb-1">
                ✅ Signed in as: <Text className="font-mono">{user.email}</Text>
              </Text>
              <Text className="text-xs text-gray-500 font-mono">
                User ID: {userId?.substring(0, 16)}...
              </Text>
            </>
          ) : (
            <Text className="text-gray-600">❌ Not signed in</Text>
          )}
        </View>

        {/* Email Input */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-gray-700 mb-2">Email</Text>
          <TextInput
            className="bg-white border border-gray-300 rounded-xl px-4 py-3 text-base"
            placeholder="dev@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
        </View>

        {/* Password Input */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-gray-700 mb-2">
            Password <Text className="text-gray-400">(optional for magic link)</Text>
          </Text>
          <TextInput
            className="bg-white border border-gray-300 rounded-xl px-4 py-3 text-base"
            placeholder="Enter password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Auth Buttons */}
        <View className="mb-6">
          {!user ? (
            <>
              <Pressable
                className="bg-[#0F4C5C] rounded-2xl py-3 px-4 mb-3 active:opacity-70"
                onPress={handlePasswordSignIn}
              >
                <Text className="text-white text-center font-semibold">Sign In (Password)</Text>
              </Pressable>

              <Pressable
                className="bg-[#E9724C] rounded-2xl py-3 px-4 active:opacity-70"
                onPress={handleMagicLinkSignIn}
              >
                <Text className="text-white text-center font-semibold">Sign In (Magic Link)</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              className="bg-gray-600 rounded-2xl py-3 px-4 active:opacity-70"
              onPress={handleSignOut}
            >
              <Text className="text-white text-center font-semibold">Sign Out</Text>
            </Pressable>
          )}
        </View>

        {/* Smoke Test Section */}
        <View className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4">
          <Text className="text-sm font-semibold text-blue-900 mb-3">
            🧪 Smoke Test: Create Test To-Do
          </Text>
          <Pressable
            className={`rounded-2xl py-3 px-4 active:opacity-70 ${
              !userId || isCreating ? 'bg-gray-300' : 'bg-blue-600'
            }`}
            onPress={handleCreateTestTodo}
            disabled={!userId || isCreating}
          >
            <Text className="text-white text-center font-semibold">
              {isCreating ? 'Creating...' : 'Create Test To-Do'}
            </Text>
          </Pressable>
          {!userId && (
            <Text className="text-xs text-blue-700 mt-2">
              ℹ️ Sign in first to test repo operations
            </Text>
          )}
        </View>

        {/* Test Results */}
        {testResult ? (
          <View className="bg-gray-100 rounded-2xl p-4">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Result:</Text>
            <Text className="text-sm text-gray-800 font-mono whitespace-pre-wrap">
              {testResult}
            </Text>
          </View>
        ) : null}

        {/* Environment Info */}
        <View className="mt-6 bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
          <Text className="text-xs font-semibold text-yellow-900 mb-2">ℹ️ Environment Info</Text>
          <Text className="text-xs text-yellow-800 mb-1">
            Repo Backend: {process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory'}
          </Text>
          <Text className="text-xs text-yellow-800 mb-1">
            Supabase URL: {process.env.EXPO_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Not set'}
          </Text>
          <Text className="text-xs text-yellow-800">
            Supabase Key: {process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Not set'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
