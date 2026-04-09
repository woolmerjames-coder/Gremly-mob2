import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';

interface UserProfile {
  profileText: string | null;
  facts: string[];
  identity: IdentityData;
  generatedAt: string | null;
  relationshipStartedAt: string | null;
  overridesApplied: number;
}

interface IdentityData {
  name?: string;
  gender?: string;
  pronouns?: string;
  age?: string;
  partner?: string;
  location?: string;
  conditions?: string[];
  extracted_at?: string;
  source?: string;
}

interface Override {
  id: string;
  action: 'add' | 'remove';
  fact_text: string;
  created_at: string;
}

interface UserProfileStore {
  // State
  profile: UserProfile | null;
  overrides: Override[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchProfile: () => Promise<void>;
  addFact: (fact: string) => Promise<void>;
  removeFact: (fact: string) => Promise<void>;
  editIdentityFact: (field: string, value: string | string[] | null) => Promise<void>;
  forgetEverything: () => Promise<void>;
  clearError: () => void;
}

export const useUserProfileStore = create<UserProfileStore>((set, get) => ({
  profile: null,
  overrides: [],
  isLoading: false,
  error: null,

  fetchProfile: async () => {
    set({ isLoading: true, error: null });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch profile and overrides in parallel
      const [profileRes, overridesRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('profile_text, signals, identity, generated_at, relationship_started_at')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('user_profile_overrides')
          .select('id, action, fact_text, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      // Profile might not exist yet (new user)
      const profile: UserProfile = {
        profileText: profileRes.data?.profile_text || null,
        facts: profileRes.data?.signals?.facts || [],
        identity: profileRes.data?.identity || {},
        generatedAt: profileRes.data?.generated_at || null,
        relationshipStartedAt: profileRes.data?.relationship_started_at || null,
        overridesApplied: profileRes.data?.signals?.overrides_applied || 0,
      };

      set({
        profile,
        overrides: overridesRes.data || [],
        isLoading: false,
      });
    } catch (err) {
      console.error('[UserProfileStore] Fetch error:', err);
      set({ error: 'Failed to load profile', isLoading: false });
    }
  },

  addFact: async (fact: string) => {
    const trimmedFact = fact.trim();
    if (!trimmedFact) return;

    set({ isLoading: true, error: null });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_profile_overrides')
        .insert({
          user_id: user.id,
          action: 'add',
          fact_text: trimmedFact,
        })
        .select()
        .single();

      if (error) throw error;

      // Optimistically add to local state
      const currentOverrides = get().overrides;
      const currentProfile = get().profile;

      set({
        overrides: [data, ...currentOverrides],
        profile: currentProfile
          ? {
              ...currentProfile,
              facts: [...currentProfile.facts, trimmedFact],
            }
          : null,
        isLoading: false,
      });
    } catch (err) {
      console.error('[UserProfileStore] Add fact error:', err);
      set({ error: 'Failed to add fact', isLoading: false });
    }
  },

  removeFact: async (fact: string) => {
    set({ isLoading: true, error: null });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if this was a user-added fact (we can delete the override)
      // or an AI-extracted fact (we need to add a 'remove' override)
      const existingAddOverride = get().overrides.find(
        (o) => o.action === 'add' && o.fact_text.toLowerCase() === fact.toLowerCase(),
      );

      if (existingAddOverride) {
        // Delete the 'add' override
        const { error } = await supabase
          .from('user_profile_overrides')
          .delete()
          .eq('id', existingAddOverride.id);

        if (error) throw error;

        set({
          overrides: get().overrides.filter((o) => o.id !== existingAddOverride.id),
          profile: get().profile
            ? {
                ...get().profile!,
                facts: get().profile!.facts.filter((f) => f.toLowerCase() !== fact.toLowerCase()),
              }
            : null,
          isLoading: false,
        });
      } else {
        // Add a 'remove' override for AI-extracted fact
        const { data, error } = await supabase
          .from('user_profile_overrides')
          .insert({
            user_id: user.id,
            action: 'remove',
            fact_text: fact,
          })
          .select()
          .single();

        if (error) throw error;

        set({
          overrides: [data, ...get().overrides],
          profile: get().profile
            ? {
                ...get().profile!,
                facts: get().profile!.facts.filter((f) => f.toLowerCase() !== fact.toLowerCase()),
              }
            : null,
          isLoading: false,
        });
      }
    } catch (err) {
      console.error('[UserProfileStore] Remove fact error:', err);
      set({ error: 'Failed to remove fact', isLoading: false });
    }
  },

  editIdentityFact: async (field: string, value: string | string[] | null) => {
    set({ isLoading: true, error: null });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Read current identity, update field
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('identity')
        .eq('user_id', user.id)
        .single();

      const updatedIdentity = { ...(profile?.identity || {}), [field]: value };

      // Remove null/empty fields
      if (value === null || value === '') {
        delete updatedIdentity[field];
      }

      const { error } = await supabase
        .from('user_profiles')
        .update({ identity: updatedIdentity })
        .eq('user_id', user.id);

      if (error) throw error;

      // Optimistic update
      set((state) => ({
        profile: state.profile ? { ...state.profile, identity: updatedIdentity } : null,
        isLoading: false,
      }));
    } catch (err) {
      console.error('[UserProfileStore] Edit identity error:', err);
      set({ error: 'Failed to update identity', isLoading: false });
    }
  },

  forgetEverything: async () => {
    set({ isLoading: true, error: null });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Delete profile and all overrides
      await Promise.all([
        supabase.from('user_profiles').delete().eq('user_id', user.id),
        supabase.from('user_profile_overrides').delete().eq('user_id', user.id),
      ]);

      set({
        profile: null,
        overrides: [],
        isLoading: false,
      });
    } catch (err) {
      console.error('[UserProfileStore] Forget everything error:', err);
      set({ error: 'Failed to reset profile', isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
