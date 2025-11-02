#!/usr/bin/env node
/**
 * Schema Contract CI Check
 * 
 * Verifies that the Supabase Cloud database has all required columns
 * for the app to function correctly. Fails CI builds if schema drifts.
 * 
 * Usage: node scripts/check-schema.mjs
 * Requires: SB_URL and SB_SERVICE_ROLE environment variables
 */

import 'dotenv/config';
import fetch from 'node-fetch';

const url = process.env.SB_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SB_SERVICE_ROLE; // CI secret - service role key

const runningInCI = ['CI', 'GITHUB_ACTIONS', 'BITBUCKET_BUILD_NUMBER', 'BUILD_ID'].some(
  (flag) => {
    const raw = process.env[flag];
    if (!raw) return false;
    const normalized = String(raw).toLowerCase();
    return normalized !== '0' && normalized !== 'false';
  },
);

if (!url || !key) {
  if (runningInCI) {
    console.error('[SchemaContract CI] Missing environment variables:');
    console.error('  SB_URL (or EXPO_PUBLIC_SUPABASE_URL):', !!url);
    console.error('  SB_SERVICE_ROLE:', !!key);
    process.exit(1);
  }

  console.warn('[SchemaContract CI] Skipping schema check (no Supabase credentials detected).');
  console.warn('  Set SB_URL and SB_SERVICE_ROLE to run the schema contract locally.');
  process.exit(0);
}

/**
 * Call a Supabase RPC function via REST API
 */
async function rpc(functionName, body) {
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: { 
      'apikey': key, 
      'Authorization': `Bearer ${key}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${functionName} failed: ${response.status} ${text}`);
  }
  
  return response.json();
}

/**
 * Required columns for each table - must match lib/schema/contract.ts
 */
const REQUIRED = {
  notes: [
    'id', 'title', 'body', 'subtype', 'origin', 'canonical_type', 
    'ai_placed', 'why_string', 'source_message_id', 'labels', 'views', 'owner_id'
  ],
  todos: [
    'id', 'name', 'origin', 'canonical_type', 'ai_placed', 'why_string', 
    'source_message_id', 'labels', 'views', 'owner_id'
  ],
  habits: [
    'id', 'name', 'origin', 'canonical_type', 'ai_placed', 'why_string', 
    'source_message_id', 'labels', 'views', 'owner_id'
  ],
};

/**
 * Main schema verification logic
 */
async function checkSchema() {
  console.log('[SchemaContract CI] Checking database schema...');
  console.log('[SchemaContract CI] URL:', url.replace(/\/\/.*@/, '//***@')); // Hide credentials
  
  const missing = [];
  
  try {
    for (const [tableName, requiredColumns] of Object.entries(REQUIRED)) {
      console.log(`[SchemaContract CI] Checking table: ${tableName}`);
      
      const data = await rpc('list_columns', { tbl: tableName });
      
      if (!Array.isArray(data)) {
        missing.push(`${tableName}: RPC returned non-array`);
        continue;
      }
      
      const existingColumns = new Set(data.map(x => x.column_name));
      
      for (const requiredColumn of requiredColumns) {
        if (!existingColumns.has(requiredColumn)) {
          missing.push(`${tableName}.${requiredColumn}`);
        }
      }
      
      console.log(`[SchemaContract CI] ${tableName}: ${requiredColumns.length} required, ${existingColumns.size} found`);
    }
    
    // Check notes.subtype constraint permissiveness
    console.log('[SchemaContract CI] Checking notes.subtype constraints...');
    const notesChecks = await rpc('list_checks', { tbl: 'notes' });
    const subtypeChecks = notesChecks.filter(c => 
      c.check_clause && c.check_clause.toLowerCase().includes('subtype')
    );
    
    if (subtypeChecks.length > 0) {
      const permissive = subtypeChecks.some(c => {
        const clause = c.check_clause.toLowerCase();
        return clause.includes('length(') || 
               clause.includes('is null') || 
               clause.includes('= any') || 
               clause.includes('in (');
      });
      
      if (!permissive) {
        missing.push('notes.subtype check constraint not permissive');
      }
    }
    
  } catch (error) {
    console.error('[SchemaContract CI] RPC call failed:', error.message);
    missing.push(`RPC error: ${error.message}`);
  }
  
  if (missing.length > 0) {
    console.error('[SchemaContract CI] ❌ Missing/invalid schema elements:');
    missing.forEach(item => console.error(`  - ${item}`));
    console.error('\nSchema drift detected! Please update your database schema.');
    process.exit(1);
  } else {
    console.log('[SchemaContract CI] ✅ All schema requirements satisfied');
    console.log('[SchemaContract CI] Database schema is up to date');
  }
}

// Run the check
checkSchema().catch(error => {
  console.error('[SchemaContract CI] Unexpected error:', error);
  process.exit(1);
});