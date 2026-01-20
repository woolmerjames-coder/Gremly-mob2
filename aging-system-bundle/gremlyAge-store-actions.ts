    // GREMLY AGE & RITUAL PROGRESS ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Ensures we're tracking the current ritual day.
     * If the day has rolled over, resets daily progress to allow fresh aging.
     * Also clears todo commitments (they reset daily, unlike habits which are date-based).
     * Returns the current ritual day string.
     */
    ensureCurrentRitualDay: () => {
      const { dayBoundaryHour, userTimezone, todayRitualDay } = get();
      const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const currentRitualDay = getRitualDay(dayBoundaryHour, timezone);

      // Check if we've crossed the day boundary
      if (todayRitualDay && currentRitualDay !== todayRitualDay) {
        console.log('[GremlyStore] Day boundary crossed, resetting ritual progress');
        set({
          todayRitualDay: currentRitualDay,
          todayDropsCount: 0,
          todaySweepsCount: 0,
          todayRitualCompletedAt: null, // CRITICAL: allows aging to happen again
        });

        // Clear commitment on all todos - they need to re-decide each day
        // Note: Habits use commitment_until which is date-based and self-expiring
        const todos = get().todos;
        const todosToReset = todos.filter((t) => t.commitment === true && !t.archived);

        if (todosToReset.length > 0) {
          console.log(
            '[ensureCurrentRitualDay] Clearing commitment on',
            todosToReset.length,
            'todos',
          );

          // Optimistic update - clear commitment in local state immediately
          set((state) => ({
            todos: state.todos.map((t) =>
              t.commitment === true && !t.archived
                ? { ...t, commitment: false, commitment_started_at: null }
                : t,
            ),
          }));

          // Fire and forget - persist to database asynchronously
          // Don't block the UI waiting for this
          const userId = get().userId;
          if (userId) {
            supabase
              .from('todos')
              .update({ commitment: false, commitment_started_at: null })
              .eq('owner_id', userId)
              .in(
                'id',
                todosToReset.map((t) => t.id),
              )
              .then(({ error }) => {
                if (error) {
                  console.error(
                    '[ensureCurrentRitualDay] Failed to clear todo commitments:',
                    error,
                  );
                } else {
                  console.log('[ensureCurrentRitualDay] ✅ Cleared todo commitments in database');
                }
              });
          }
        }
      } else if (!todayRitualDay) {
        // First time - just set the day
        set({ todayRitualDay: currentRitualDay });
      }

      return currentRitualDay;
    },

    incrementDropCount: async () => {
      const { userId } = get();
      if (!userId) return { dropsCount: 0, didAgeUp: false, newAge: get().gremlyAge };

      // Ensure we're on the current ritual day (resets state if day changed)
      const currentRitualDay = get().ensureCurrentRitualDay();

      // Call Supabase RPC to increment
      const { data, error } = await supabase.rpc('increment_drop_count', {
        p_owner_id: userId,
        p_ritual_day: currentRitualDay,
      });

      if (error) {
        console.error('[GremlyStore] incrementDropCount failed:', error);
        return { dropsCount: get().todayDropsCount, didAgeUp: false, newAge: get().gremlyAge };
      }

      const newDropsCount = data?.drops_count ?? get().todayDropsCount + 1;
      set({ todayDropsCount: newDropsCount, todayRitualDay: currentRitualDay });

      // Check if this completes the ritual
      const ageResult = await get().checkAndIncrementAge();
      return { dropsCount: newDropsCount, ...ageResult };
    },

    incrementSweepCount: async () => {
      const { userId } = get();
      if (!userId) return { sweepsCount: 0, didAgeUp: false, newAge: get().gremlyAge };

      // Ensure we're on the current ritual day (resets state if day changed)
      const currentRitualDay = get().ensureCurrentRitualDay();

      const { data, error } = await supabase.rpc('increment_sweep_count', {
        p_owner_id: userId,
        p_ritual_day: currentRitualDay,
      });

      if (error) {
        console.error('[GremlyStore] incrementSweepCount failed:', error);
        return { sweepsCount: get().todaySweepsCount, didAgeUp: false, newAge: get().gremlyAge };
      }

      const newSweepsCount = data?.sweeps_count ?? get().todaySweepsCount + 1;
      set({ todaySweepsCount: newSweepsCount, todayRitualDay: currentRitualDay });

      // Check if this completes the ritual
      const ageResult = await get().checkAndIncrementAge();
      return { sweepsCount: newSweepsCount, ...ageResult };
    },

    checkAndIncrementAge: async () => {
      const { userId, dayBoundaryHour, userTimezone, todayRitualCompletedAt, todayRitualDay } =
        get();
      if (!userId) return { didAgeUp: false, newAge: get().gremlyAge };

      const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const currentRitualDay = getRitualDay(dayBoundaryHour, timezone);

      // Defensive check: if ritual was completed for a different day, it doesn't count for today
      if (todayRitualCompletedAt && todayRitualDay !== currentRitualDay) {
        console.log(
          '[GremlyStore] checkAndIncrementAge: Stale ritual completion detected, clearing',
        );
        set({ todayRitualCompletedAt: null });
        // Continue to check RPC - don't return early
      } else if (todayRitualCompletedAt) {
        // Already completed today (and day matches)
        return { didAgeUp: false, newAge: get().gremlyAge };
      }

      const { data, error } = await supabase.rpc('check_and_increment_gremly_age', {
        p_owner_id: userId,
        p_ritual_day: currentRitualDay,
      });

      if (error) {
        console.error('[GremlyStore] checkAndIncrementAge failed:', error);
        return { didAgeUp: false, newAge: get().gremlyAge };
      }

      const result = data?.[0] ?? { did_age_up: false, new_age: get().gremlyAge };

      if (result.did_age_up) {
        set({
          gremlyAge: result.new_age,
          gremlyAgeLastIncrementedAt: new Date().toISOString(),
          todayRitualCompletedAt: new Date().toISOString(),
        });
        console.log('[GremlyStore] Gremly aged up to', result.new_age);
      }

      return { didAgeUp: result.did_age_up, newAge: result.new_age };
    },

    setDayBoundaryHour: async (hour: number) => {
      const userId = get().userId;
      if (!userId) return;

      const { error } = await supabase
        .from('cortex_preferences')
        .upsert(
          { owner_id: userId, day_boundary_hour: hour, updated_at: new Date().toISOString() },
          { onConflict: 'owner_id' },
        );

      if (error) {
        console.error('[GremlyStore] setDayBoundaryHour failed:', error);
        return;
      }

      set({ dayBoundaryHour: hour });

      // Refresh ritual progress since the day boundary changed
      await get().refreshRitualProgress();
    },

    setOnboardingCompletedAt: async (timestamp: string) => {
      const userId = get().userId;
      if (!userId) return;

      const { error } = await supabase.from('cortex_preferences').upsert(
        {
          owner_id: userId,
          onboarding_completed_at: timestamp,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id' },
      );

      if (error) {
        console.error('[GremlyStore] setOnboardingCompletedAt failed:', error);
        return;
      }
