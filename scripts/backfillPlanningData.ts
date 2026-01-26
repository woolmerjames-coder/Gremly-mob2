/**
 * Backfill Planning Data Script
 *
 * Populates energy_type, prep_buffer_minutes, and cooldown_buffer_minutes
 * for existing todos and habits that don't have this data.
 *
 * Usage:
 *   npx ts-node scripts/backfillPlanningData.ts
 *
 * Or add to package.json:
 *   "scripts": {
 *     "backfill:planning": "ts-node scripts/backfillPlanningData.ts"
 *   }
 *
 * Required environment variables:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_SERVICE_KEY - Service role key (not anon key) for admin access
 */

import { createClient } from '@supabase/supabase-js';
import { calculateBuffers, inferEnergyTypeFromTitle } from '../lib/planning';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('  SUPABASE_URL');
  console.error('  SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function backfillTodos() {
  console.log('Backfilling todos...');

  // Get all todos without energy_type
  const { data: todos, error } = await supabase
    .from('todos')
    .select('id, name, title, time_estimate_minutes, energy_type')
    .is('energy_type', null);

  if (error) {
    console.error('Error fetching todos:', error);
    return;
  }

  console.log(`Found ${todos?.length || 0} todos to backfill`);

  let successCount = 0;
  let errorCount = 0;

  for (const todo of todos || []) {
    const todoTitle = todo.name || todo.title || '';
    const energyType = inferEnergyTypeFromTitle(todoTitle);
    const buffers = calculateBuffers(
      energyType,
      todoTitle,
      todo.time_estimate_minutes || 30
    );

    const { error: updateError } = await supabase
      .from('todos')
      .update({
        energy_type: energyType,
        prep_buffer_minutes: buffers.prep_buffer_minutes,
        cooldown_buffer_minutes: buffers.cooldown_buffer_minutes,
      })
      .eq('id', todo.id);

    if (updateError) {
      console.error(`Error updating todo ${todo.id}:`, updateError);
      errorCount++;
    } else {
      console.log(`Updated todo: "${todoTitle.substring(0, 40)}" -> ${energyType}`);
      successCount++;
    }
  }

  console.log(`Todos: ${successCount} updated, ${errorCount} errors`);
}

async function backfillHabits() {
  console.log('Backfilling habits...');

  const { data: habits, error } = await supabase
    .from('habits')
    .select('id, name, title, time_estimate_minutes, energy_type')
    .is('energy_type', null);

  if (error) {
    console.error('Error fetching habits:', error);
    return;
  }

  console.log(`Found ${habits?.length || 0} habits to backfill`);

  let successCount = 0;
  let errorCount = 0;

  for (const habit of habits || []) {
    const habitTitle = habit.name || habit.title || '';
    const energyType = inferEnergyTypeFromTitle(habitTitle);
    const buffers = calculateBuffers(
      energyType,
      habitTitle,
      habit.time_estimate_minutes || 30
    );

    const { error: updateError } = await supabase
      .from('habits')
      .update({
        energy_type: energyType,
        prep_buffer_minutes: buffers.prep_buffer_minutes,
        cooldown_buffer_minutes: buffers.cooldown_buffer_minutes,
      })
      .eq('id', habit.id);

    if (updateError) {
      console.error(`Error updating habit ${habit.id}:`, updateError);
      errorCount++;
    } else {
      console.log(`Updated habit: "${habitTitle.substring(0, 40)}" -> ${energyType}`);
      successCount++;
    }
  }

  console.log(`Habits: ${successCount} updated, ${errorCount} errors`);
}

async function main() {
  console.log('Starting planning data backfill...\n');
  console.log(`Supabase URL: ${supabaseUrl.substring(0, 30)}...`);
  console.log('');

  await backfillTodos();
  console.log('');
  await backfillHabits();
  console.log('\nBackfill complete!');
}

main().catch(console.error);
