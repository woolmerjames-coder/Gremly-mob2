/**
 * Diagnostic script to check sweep count discrepancy
 * 
 * Run with: 
 *   SUPABASE_OWNER_ID=<your-user-id> npx tsx scripts/dev/check-sweep-discrepancy.ts
 * 
 * Or set the USER_ID constant below.
 */

import { createClient } from '@supabase/supabase-js';
import { getDateService } from '../../lib/date';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load from .env.local manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const supabaseUrl = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const supabaseAnonKey = envVars['EXPO_PUBLIC_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Hardcode your user ID here for testing, or use SUPABASE_OWNER_ID env var
const USER_ID = process.env.SUPABASE_OWNER_ID || '';

async function main() {
  let userId = USER_ID;
  
  // Try to get from auth session if not provided
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    }
  }
  
  if (!userId) {
    console.log('❌ No user ID available.');
    console.log('Either:');
    console.log('  1. Set SUPABASE_OWNER_ID environment variable');
    console.log('  2. Hardcode USER_ID in the script');
    console.log('  3. Run while authenticated');
    return;
  }
  const today = getDateService().today();
  
  console.log('\n========================================');
  console.log('SWEEP DISCREPANCY DIAGNOSTIC');
  console.log('========================================');
  console.log(`User ID: ${userId}`);
  console.log(`Today: ${today}`);
  console.log('');

  // 1. Check for notes stuck as catchall
  console.log('\n--- NOTES WITH SUBTYPE = "catchall" ---');
  const { data: catchallNotes, error: catchallError } = await supabase
    .from('notes')
    .select('id, title, subtype, canonical_type, archived, created_at, labels')
    .eq('owner_id', userId)
    .eq('subtype', 'catchall')
    .eq('archived', false);

  if (catchallError) {
    console.log('Error:', catchallError.message);
  } else if (catchallNotes && catchallNotes.length > 0) {
    console.log(`⚠️  Found ${catchallNotes.length} notes STUCK AS CATCHALL:`);
    for (const note of catchallNotes) {
      console.log(`  - ${note.id.slice(0, 8)}... "${note.title?.slice(0, 40)}" (created: ${note.created_at?.split('T')[0]})`);
    }
    console.log('\nThese notes are NOT appearing in Sweep because they are filtered out by .neq("subtype", "catchall")');
  } else {
    console.log('✅ No notes stuck as catchall');
  }

  // 2. Check last sweep timestamp
  console.log('\n--- LAST SWEEP COMPLETED AT ---');
  const { data: prefs, error: prefsError } = await supabase
    .from('cortex_preferences')
    .select('last_sweep_completed_at')
    .eq('owner_id', userId)
    .maybeSingle();

  const lastSweepAt = prefs?.last_sweep_completed_at;
  const cutoffTimestamp = lastSweepAt ?? new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  
  if (prefsError) {
    console.log('Error:', prefsError.message);
  } else if (lastSweepAt) {
    console.log(`Last sweep: ${lastSweepAt}`);
    console.log(`Cutoff for new items: ${cutoffTimestamp}`);
  } else {
    console.log('No previous sweep recorded (first-time user)');
    console.log(`Using 48-hour fallback cutoff: ${cutoffTimestamp}`);
  }

  // 3. Count todos that match pill selector criteria (due today or overdue)
  console.log('\n--- TODOS (Pill Selector Criteria) ---');
  console.log('Criteria: due_day <= today, archived=false, status=active');
  
  const { data: pillTodos, error: pillError } = await supabase
    .from('todos')
    .select('id, name, due_day, status, archived, created_at, skipped_in_sweep_at')
    .eq('owner_id', userId)
    .eq('archived', false)
    .neq('status', 'completed')
    .lte('due_day', today);

  if (pillError) {
    console.log('Error:', pillError.message);
  } else {
    console.log(`Found ${pillTodos?.length ?? 0} todos matching pill criteria`);
    if (pillTodos && pillTodos.length > 0) {
      const overdue = pillTodos.filter(t => t.due_day && t.due_day < today);
      const dueToday = pillTodos.filter(t => t.due_day === today);
      console.log(`  - Due today: ${dueToday.length}`);
      console.log(`  - Overdue: ${overdue.length}`);
    }
  }

  // 4. Count todos that match engine criteria
  console.log('\n--- TODOS (Engine Criteria) ---');
  console.log(`Criteria: (due_day <= ${today}) OR (created_at > ${cutoffTimestamp}) OR (skipped_in_sweep_at IS NOT NULL)`);
  
  const todoOrClause = `due_day.lte.${today},created_at.gt.${cutoffTimestamp},skipped_in_sweep_at.not.is.null`;
  
  const { data: engineTodos, error: engineTodoError } = await supabase
    .from('todos')
    .select('id, name, due_day, status, archived, created_at, skipped_in_sweep_at')
    .eq('owner_id', userId)
    .eq('archived', false)
    .neq('status', 'completed')
    .or(todoOrClause);

  if (engineTodoError) {
    console.log('Error:', engineTodoError.message);
  } else {
    console.log(`Found ${engineTodos?.length ?? 0} todos matching engine criteria`);
  }

  // 5. Count notes that match engine criteria
  console.log('\n--- NOTES (Engine Criteria) ---');
  const noteOrClause = lastSweepAt
    ? `created_at.gt.${cutoffTimestamp},skipped_in_sweep_at.not.is.null`
    : `created_at.gte.${today}T00:00:00.000Z,skipped_in_sweep_at.not.is.null`;
  
  console.log(`Criteria: subtype != catchall, archived=false, (${noteOrClause})`);
  
  const { data: engineNotes, error: engineNoteError } = await supabase
    .from('notes')
    .select('id, title, subtype, canonical_type, archived, created_at, skipped_in_sweep_at')
    .eq('owner_id', userId)
    .eq('archived', false)
    .neq('subtype', 'catchall')
    .or(noteOrClause);

  if (engineNoteError) {
    console.log('Error:', engineNoteError.message);
  } else {
    console.log(`Found ${engineNotes?.length ?? 0} notes matching engine criteria`);
    if (engineNotes && engineNotes.length > 0) {
      const subtypeCounts: Record<string, number> = {};
      for (const note of engineNotes) {
        const st = note.subtype ?? 'null';
        subtypeCounts[st] = (subtypeCounts[st] ?? 0) + 1;
      }
      console.log('  Breakdown by subtype:', subtypeCounts);
    }
  }

  // 6. Show all non-archived notes for reference
  console.log('\n--- ALL NON-ARCHIVED NOTES (for reference) ---');
  const { data: allNotes, error: allNotesError } = await supabase
    .from('notes')
    .select('id, title, subtype, canonical_type, archived, created_at')
    .eq('owner_id', userId)
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(20);

  if (allNotesError) {
    console.log('Error:', allNotesError.message);
  } else {
    console.log(`Showing last 20 non-archived notes:`);
    for (const note of allNotes ?? []) {
      const st = note.subtype?.padEnd(15) ?? 'null'.padEnd(15);
      const title = (note.title ?? '').slice(0, 30).padEnd(32);
      console.log(`  ${note.id.slice(0, 8)}... | ${st} | ${title} | ${note.created_at?.split('T')[0]}`);
    }
  }

  // 7. Show all non-archived todos for reference
  console.log('\n--- ALL NON-ARCHIVED TODOS (for reference) ---');
  const { data: allTodos, error: allTodosError } = await supabase
    .from('todos')
    .select('id, name, due_day, status, archived, created_at')
    .eq('owner_id', userId)
    .eq('archived', false)
    .neq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(30);

  if (allTodosError) {
    console.log('Error:', allTodosError.message);
  } else {
    console.log(`Showing last 30 non-archived, non-completed todos:`);
    for (const todo of allTodos ?? []) {
      const dueDay = (todo.due_day ?? 'no-due').padEnd(12);
      const name = (todo.name ?? '').slice(0, 30).padEnd(32);
      console.log(`  ${todo.id.slice(0, 8)}... | ${dueDay} | ${name} | ${todo.created_at?.split('T')[0]}`);
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Pill count (todos due today/overdue): ${pillTodos?.length ?? 0}`);
  console.log(`Engine count (todos): ${engineTodos?.length ?? 0}`);
  console.log(`Engine count (notes): ${engineNotes?.length ?? 0}`);
  console.log(`Engine TOTAL: ${(engineTodos?.length ?? 0) + (engineNotes?.length ?? 0)}`);
  console.log(`Notes stuck as catchall: ${catchallNotes?.length ?? 0}`);
  
  // 8. Check total counts (including archived)
  console.log('\n--- TOTAL COUNTS (including archived) ---');
  const { count: totalTodos } = await supabase
    .from('todos')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', userId);
  console.log(`Total todos (all states): ${totalTodos ?? 0}`);
  
  const { count: totalNotes } = await supabase
    .from('notes')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', userId);
  console.log(`Total notes (all states): ${totalNotes ?? 0}`);
  
  if ((catchallNotes?.length ?? 0) > 0) {
    console.log('\n⚠️  ACTION NEEDED: Fix notes stuck as catchall');
  }
  
  const pillCount = pillTodos?.length ?? 0;
  const engineTotal = (engineTodos?.length ?? 0) + (engineNotes?.length ?? 0);
  
  if (pillCount !== engineTotal) {
    console.log(`\n⚠️  DISCREPANCY: Pill shows ${pillCount}, Engine shows ${engineTotal}`);
    console.log('This is expected if:');
    console.log('  1. There are notes in the sweep (pill only counts todos)');
    console.log('  2. Local state is out of sync with database');
    console.log('  3. Some todos were recently completed/archived');
  }
}

main().catch(console.error);
