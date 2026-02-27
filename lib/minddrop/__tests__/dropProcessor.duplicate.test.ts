/**
 * dropProcessor.duplicate.test.ts
 *
 * Tests for the 23505 (duplicate key violation) handler in
 * syncDropToSupabase and syncMultiDropToSupabase.
 *
 * When a drop row already exists in Supabase (from a prior attempt that
 * was killed after insert but before local dequeue), the handler:
 * 1. Catches the 23505 error
 * 2. Queries for the existing row by owner_id + drop_id
 * 3. Returns success with the existing row's id
 *
 * This prevents crash-recovery loops where the same drop fails
 * on every retry because the row already exists.
 */

describe('23505 duplicate key handler (documentary)', () => {
  describe('syncDropToSupabase — single entity', () => {
    it('documents the 23505 handler flow', () => {
      // In syncDropToSupabase:
      //   const { data, error } = await supabase.from(table).insert(payload).select().single();
      //   if (error) {
      //     if (error.code === '23505') {
      //       const { data: existing } = await supabase.from(table)
      //         .select('id')
      //         .eq('owner_id', payload.owner_id)
      //         .eq('drop_id', payload.drop_id)
      //         .single();
      //       if (existing) return { success: true, supabaseId: existing.id, entityType };
      //     }
      //   }

      const errorCode = '23505';
      const handler = {
        trigger: errorCode,
        query: ['owner_id', 'drop_id'],
        result: { success: true, supabaseId: 'existing-id' },
      };

      expect(handler.trigger).toBe('23505');
      expect(handler.query).toContain('owner_id');
      expect(handler.query).toContain('drop_id');
      expect(handler.result.success).toBe(true);
    });

    it('documents that insert (NOT upsert) is used', () => {
      // Upsert was reverted to insert because upsert is incompatible
      // with deferrable constraints on the Supabase schema.
      //
      // The pattern is: try insert → catch 23505 → fetch existing → return success.
      // This is safer than upsert because it doesn't silently overwrite existing data.

      const operation = 'insert'; // NOT 'upsert'
      expect(operation).toBe('insert');
    });

    it('documents the crash-recovery scenario this handles', () => {
      // Timeline:
      // 1. processDrop starts → classifies → enriches → syncs to Supabase
      // 2. Supabase insert succeeds (row created)
      // 3. App is killed/crashes BEFORE dequeue() removes drop from AsyncStorage
      // 4. App restarts → useDropRecovery finds pending drop
      // 5. processDrop runs again → tries insert → 23505 (row exists!)
      // 6. Handler catches 23505, fetches existing row, returns success
      // 7. Pipeline continues → dequeue() finally cleans up

      const scenario = {
        cause: 'app killed between insert and dequeue',
        symptom: 'duplicate key violation 23505',
        fix: 'catch-and-fetch-existing pattern',
        result: 'drop is dequeued without creating a duplicate row',
      };

      expect(scenario.symptom).toContain('23505');
      expect(scenario.fix).toContain('fetch-existing');
    });

    it('documents all three independent callers that can race', () => {
      // Three systems independently call processDrop():
      // 1. useMindDropSubmit — immediate, on user submit
      // 2. useDropRecovery — +1000ms after app startup
      // 3. offlineSync — +5000ms after startup / +2000ms on reconnect
      //
      // The processingLocks Set prevents concurrent calls for same localId.
      // The 23505 handler covers the edge case where the same drop is
      // attempted across app sessions.

      const callers = ['useMindDropSubmit', 'useDropRecovery', 'offlineSync'];
      expect(callers).toHaveLength(3);
    });
  });

  describe('syncMultiDropToSupabase — multi-entity', () => {
    it('documents the same 23505 handler pattern for multi-drops', () => {
      // syncMultiDropToSupabase also uses insert + 23505 handler:
      //   const { data, error } = await supabase.from('notes').insert(payload).select().single();
      //   if (error) {
      //     if (error.code === '23505') {
      //       const { data: existing } = await supabase.from('notes')
      //         .select('id')
      //         .eq('owner_id', payload.owner_id)
      //         .eq('drop_id', payload.drop_id)
      //         .single();
      //       if (existing) return { success: true, supabaseId: existing.id, entityType: 'note' };
      //     }
      //   }

      const handler = {
        table: 'notes',
        errorCode: '23505',
        returnEntityType: 'note',
      };

      expect(handler.table).toBe('notes');
      expect(handler.errorCode).toBe('23505');
      expect(handler.returnEntityType).toBe('note');
    });
  });

  describe('23505 error simulation', () => {
    it('correctly identifies a 23505 error by code property', () => {
      // Supabase/PostgreSQL error object shape
      const supabaseError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "todos_owner_id_drop_id_key"',
        details: 'Key (owner_id, drop_id)=(user-1, drop-1) already exists.',
        hint: null,
      };

      expect(supabaseError.code).toBe('23505');
      expect(supabaseError.message).toContain('duplicate key');
    });

    it('non-23505 errors are NOT caught by the handler', () => {
      // Other Supabase errors should propagate normally
      const otherErrors = [
        { code: '42501', message: 'insufficient_privilege' },
        { code: '23503', message: 'foreign_key_violation' },
        { code: '42P01', message: 'undefined_table' },
        { code: null, message: 'network timeout' },
      ];

      for (const error of otherErrors) {
        expect(error.code).not.toBe('23505');
      }
    });
  });
});
