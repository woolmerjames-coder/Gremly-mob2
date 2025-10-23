/**
 * Schema Contract - Development & CI verification system
 *
 * Ensures required database columns and constraints exist in Supabase Cloud.
 * - Dev: Shows banner/error if schema is missing required elements
 * - CI: Fails builds if schema drifts from requirements
 */

type ColReq = { table: string; columns: string[] };
type CheckReq = { table: string; mustAllowSubtypes?: boolean };

/**
 * Required columns for each table
 * These must exist for the app to function correctly
 */
const REQUIRED: ColReq[] = [
  {
    table: 'notes',
    columns: [
      'id',
      'title',
      'body',
      'subtype',
      'origin',
      'canonical_type',
      'ai_placed',
      'why_string',
      'source_message_id',
      'labels',
      'views',
      'owner_id',
    ],
  },
  {
    table: 'todos',
    columns: [
      'id',
      'name',
      'origin',
      'canonical_type',
      'ai_placed',
      'why_string',
      'source_message_id',
      'labels',
      'views',
      'owner_id',
    ],
  },
  {
    table: 'habits',
    columns: [
      'id',
      'name',
      'origin',
      'canonical_type',
      'ai_placed',
      'why_string',
      'source_message_id',
      'labels',
      'views',
      'owner_id',
    ],
  },
];

/**
 * Required constraint behaviors
 * Validates that database constraints are permissive enough
 */
const CHECKS: CheckReq[] = [
  // We only assert that notes.subtype check exists but is permissive (allows arbitrary strings OR null)
  { table: 'notes', mustAllowSubtypes: true },
];

/**
 * Verifies that the Supabase database schema matches our requirements
 * @param supabase - Supabase client instance
 * @throws Error if any required columns or constraints are missing/invalid
 */
export async function verifySchemaContract(supabase: any): Promise<void> {
  const missing: string[] = [];

  // Check required columns
  for (const r of REQUIRED) {
    try {
      const { data, error } = await supabase.rpc('list_columns', { tbl: r.table });
      if (error || !Array.isArray(data)) {
        missing.push(`${r.table}: unable to list columns (${error?.message || 'rpc failed'})`);
        continue;
      }

      const have = new Set((data as any[]).map((c) => c.column_name));
      for (const col of r.columns) {
        if (!have.has(col)) {
          missing.push(`${r.table}.${col}`);
        }
      }
    } catch (err) {
      missing.push(`${r.table}: RPC call failed (${err})`);
    }
  }

  // Check constraint behaviors
  for (const c of CHECKS) {
    if (!c.mustAllowSubtypes) continue;

    try {
      const { data, error } = await supabase.rpc('list_checks', { tbl: c.table });
      if (error) {
        missing.push(`${c.table}: unable to list checks (${error.message})`);
        continue;
      }

      const checks = (data as any[]).map((x) => String(x.check_clause).toLowerCase());
      const subtypeChecks = checks.filter((ch) => ch.includes('subtype'));

      // If no subtype constraints exist, that's perfectly permissive
      if (subtypeChecks.length === 0) {
        continue; // No constraints = permissive
      }

      // If subtype constraints exist, check if they're permissive
      const permissive = subtypeChecks.some(
        (ch) =>
          ch.includes('length(') ||
          ch.includes('is null') ||
          ch.includes('= any') ||
          ch.includes('in ('),
      );

      if (!permissive) {
        missing.push(`${c.table}.subtype check not permissive`);
      }
    } catch (err) {
      missing.push(`${c.table}: constraint check failed (${err})`);
    }
  }

  if (missing.length > 0) {
    const msg = `[SchemaContract] Missing/invalid: ${missing.join(', ')}`;

    if (__DEV__) {
      console.error(msg);
      // Optional: Show in-app banner/toast in dev
      // You could dispatch to a global state or show a React Native toast here
    }

    throw new Error(msg);
  }

  console.log('[SchemaContract] ✅ All requirements satisfied');
}

/**
 * Development-friendly version that doesn't throw but logs warnings
 * Use this for non-blocking dev checks
 */
export async function verifySchemaContractSoft(supabase: any): Promise<boolean> {
  try {
    await verifySchemaContract(supabase);
    return true;
  } catch (error) {
    if (__DEV__) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[SchemaContract] Validation failed (non-blocking):', message);
    }
    return false;
  }
}
