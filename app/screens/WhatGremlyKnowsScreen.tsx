/**
 * WhatGremlyKnowsScreen - View and edit what Gremly has learned
 */

import React, { useEffect, useState, useMemo, useLayoutEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, XCircle, PlusCircle, Trash2, Pencil } from 'lucide-react-native';
import { useUserProfileStore } from '../../stores/userProfileStore';
import { colors, spacing, borderRadius } from '../../design/tokens';
import { BRAND } from '../../design/brand';
import { formatDistanceToNow } from 'date-fns';

export default function WhatGremlyKnowsScreen() {
  const navigation = useNavigation();
  const [newFact, setNewFact] = useState('');
  const [editingIdentityField, setEditingIdentityField] = useState<string | null>(null);
  const [editingIdentityValue, setEditingIdentityValue] = useState('');

  // Hide default header
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const {
    profile,
    overrides,
    isLoading,
    error,
    fetchProfile,
    addFact,
    removeFact,
    editIdentityFact,
    forgetEverything,
    clearError,
  } = useUserProfileStore();

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute displayed facts:
  // AI facts + user-added facts - removed facts
  const displayedFacts = useMemo(() => {
    const aiFacts = profile?.facts || [];
    const addedFacts = overrides.filter((o) => o.action === 'add').map((o) => o.fact_text);
    const removedFacts = overrides
      .filter((o) => o.action === 'remove')
      .map((o) => o.fact_text.toLowerCase());

    // Combine AI + added, then filter out removed
    const combined = [...aiFacts, ...addedFacts];
    const unique = [...new Set(combined)]; // dedupe

    return unique.filter(
      (fact) =>
        !removedFacts.some(
          (removed) => fact.toLowerCase().includes(removed) || removed.includes(fact.toLowerCase()),
        ),
    );
  }, [profile?.facts, overrides]);

  const handleAddFact = async () => {
    if (!newFact.trim()) return;
    await addFact(newFact);
    setNewFact('');
  };

  const handleRemoveFact = (fact: string) => {
    Alert.alert('Remove this?', `Gremly will forget: "${fact}"`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeFact(fact),
      },
    ]);
  };

  const handleForgetEverything = () => {
    Alert.alert(
      'Forget Everything?',
      "This will reset all of Gremly's memory about you. Gremly will start learning again from scratch.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget Everything',
          style: 'destructive',
          onPress: forgetEverything,
        },
      ],
    );
  };

  // Identity helpers
  const identity = profile?.identity || {};
  const identityFields = useMemo(() => {
    const fields: { key: string; label: string; value: string }[] = [];
    if (identity.name || identity.pronouns || identity.gender) {
      const namePart = identity.name || '';
      const pronounPart = identity.pronouns
        ? `(${identity.pronouns})`
        : identity.gender === 'male'
          ? '(he/him)'
          : identity.gender === 'female'
            ? '(she/her)'
            : '';
      const display = [namePart, pronounPart].filter(Boolean).join(' ');
      if (display) fields.push({ key: 'name', label: 'Name & pronouns', value: display });
    }
    if (identity.age) fields.push({ key: 'age', label: 'Age', value: `${identity.age} years old` });
    if (identity.location)
      fields.push({ key: 'location', label: 'Location', value: `Lives in ${identity.location}` });
    if (identity.partner)
      fields.push({ key: 'partner', label: 'Partner', value: `Partner: ${identity.partner}` });
    return fields;
  }, [identity]);

  const handleEditIdentity = useCallback(
    (field: string) => {
      const currentValue = (identity[field as keyof typeof identity] as string) || '';
      setEditingIdentityField(field);
      setEditingIdentityValue(currentValue);
    },
    [identity],
  );

  const handleSaveIdentity = useCallback(async () => {
    if (!editingIdentityField) return;
    const value = editingIdentityValue.trim();
    await editIdentityFact(editingIdentityField, value || null);
    setEditingIdentityField(null);
    setEditingIdentityValue('');
  }, [editingIdentityField, editingIdentityValue, editIdentityFact]);

  const handleRemoveIdentity = useCallback(
    (field: string, label: string) => {
      Alert.alert(
        'Remove this?',
        `Are you sure? This helps Gremly use your correct name and pronouns.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => editIdentityFact(field, null),
          },
        ],
      );
    },
    [editIdentityFact],
  );

  const IDENTITY_CATEGORIES = [
    { key: 'name', label: 'Name' },
    { key: 'pronouns', label: 'Pronouns' },
    { key: 'age', label: 'Age' },
    { key: 'location', label: 'Location' },
    { key: 'partner', label: 'Partner' },
  ];

  const [showAddIdentityPicker, setShowAddIdentityPicker] = useState(false);

  const availableCategories = IDENTITY_CATEGORIES.filter(
    (cat) => !identity[cat.key as keyof typeof identity],
  );

  const lastUpdated = profile?.generatedAt
    ? formatDistanceToNow(new Date(profile.generatedAt), { addSuffix: true })
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={12}>
          <ChevronLeft size={24} color={BRAND.colors.charcoalInk} />
        </Pressable>
        <Text style={styles.title}>What Gremly Knows</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Intro text */}
        <Text style={styles.introText}>
          Gremly learns from your conversations to give more personalized support. You're always in
          control of what Gremly remembers.
        </Text>

        {lastUpdated && <Text style={styles.lastUpdated}>Last updated {lastUpdated}</Text>}

        {/* Loading state */}
        {isLoading && !profile && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
          </View>
        )}

        {/* Error state */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={clearError}>
              <Text style={styles.errorDismiss}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Identity Section */}
        {(identityFields.length > 0 || profile) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Who You Are</Text>
            <Text style={styles.sectionSubtitle}>
              These are core facts Gremly uses for your name and pronouns.
            </Text>

            {identityFields.map((field) => (
              <View key={field.key} style={styles.identityItem}>
                {editingIdentityField === field.key ? (
                  <View style={styles.identityEditRow}>
                    <TextInput
                      style={styles.identityEditInput}
                      value={editingIdentityValue}
                      onChangeText={setEditingIdentityValue}
                      onSubmitEditing={handleSaveIdentity}
                      autoFocus
                      returnKeyType="done"
                      placeholder={field.label}
                      placeholderTextColor={colors.text.tertiary}
                    />
                    <TouchableOpacity
                      onPress={handleSaveIdentity}
                      style={styles.identityEditButton}
                    >
                      <Text style={styles.identityEditButtonText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setEditingIdentityField(null)}
                      style={styles.identityEditButton}
                    >
                      <Text style={styles.identityCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text style={styles.factText}>{field.value}</Text>
                    <TouchableOpacity
                      onPress={() => handleEditIdentity(field.key)}
                      style={styles.editButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Pencil size={16} color={colors.text.tertiary} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ))}

            {/* Add identity fact */}
            {availableCategories.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.addIdentityButton}
                  onPress={() => setShowAddIdentityPicker(!showAddIdentityPicker)}
                >
                  <PlusCircle size={18} color={BRAND.colors.mossGreen} />
                  <Text style={styles.addIdentityText}>Add identity fact</Text>
                </TouchableOpacity>

                {showAddIdentityPicker && (
                  <View style={styles.identityPicker}>
                    {availableCategories.map((cat) => (
                      <TouchableOpacity
                        key={cat.key}
                        style={styles.identityPickerItem}
                        onPress={() => {
                          setShowAddIdentityPicker(false);
                          handleEditIdentity(cat.key);
                        }}
                      >
                        <Text style={styles.identityPickerText}>{cat.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Facts Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Things You've Shared</Text>
          <Text style={styles.sectionSubtitle}>These change as Gremly learns more.</Text>

          {displayedFacts.length === 0 && !isLoading && (
            <Text style={styles.emptyText}>
              Gremly hasn't learned any specific facts yet. They'll appear here as you chat.
            </Text>
          )}

          {displayedFacts.map((fact, index) => (
            <View key={`${fact}-${index}`} style={styles.factItem}>
              <Text style={styles.factText}>{fact}</Text>
              <TouchableOpacity
                onPress={() => handleRemoveFact(fact)}
                style={styles.removeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <XCircle size={20} color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add fact input */}
          <View style={styles.addFactContainer}>
            <TextInput
              style={styles.addFactInput}
              placeholder="Add something Gremly should know..."
              placeholderTextColor={colors.text.tertiary}
              value={newFact}
              onChangeText={setNewFact}
              onSubmitEditing={handleAddFact}
              returnKeyType="done"
            />
            {newFact.trim() && (
              <TouchableOpacity onPress={handleAddFact} style={styles.addButton}>
                <PlusCircle size={24} color={BRAND.colors.mossGreen} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Forget Everything */}
        <View style={styles.dangerSection}>
          <TouchableOpacity style={styles.forgetButton} onPress={handleForgetEverything}>
            <Trash2 size={20} color={colors.error} />
            <Text style={styles.forgetButtonText}>Forget Everything About Me</Text>
          </TouchableOpacity>
          <Text style={styles.forgetHint}>
            This resets Gremly's memory. Gremly will start learning again from your future
            conversations.
          </Text>
        </View>

        {/* Bottom padding */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  backButton: {
    padding: spacing.xs,
  },
  title: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: BRAND.colors.charcoalInk,
  },
  headerSpacer: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  introText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  lastUpdated: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: colors.text.tertiary,
    marginBottom: spacing.lg,
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  errorContainer: {
    backgroundColor: '#FEE',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  errorDismiss: {
    color: colors.error,
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: colors.text.tertiary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  identityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  identityEditRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  identityEditInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.charcoalInk,
    paddingVertical: 0,
  },
  identityEditButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  identityEditButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.mossGreen,
  },
  identityCancelText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: colors.text.tertiary,
  },
  editButton: {
    padding: spacing.xs,
  },
  addIdentityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  addIdentityText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.mossGreen,
    marginLeft: spacing.sm,
  },
  identityPicker: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  identityPickerItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  identityPickerText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.charcoalInk,
  },
  patternBox: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  patternText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.charcoalInk,
    lineHeight: 22,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  factItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  factText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.charcoalInk,
  },
  removeButton: {
    padding: spacing.xs,
  },
  addFactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
    marginTop: spacing.xs,
  },
  addFactInput: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.charcoalInk,
  },
  addButton: {
    padding: spacing.sm,
  },
  dangerSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  forgetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  forgetButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: colors.error,
    marginLeft: spacing.sm,
  },
  forgetHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 16,
  },
});
