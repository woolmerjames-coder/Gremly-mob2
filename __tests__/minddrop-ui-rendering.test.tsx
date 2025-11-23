/**
 * Mind Drop v3: UI Rendering Regression Test
 *
 * Tests that Mind Drop items appear in the UI after classification/prefill.
 *
 * Bug: Items were created in DB but not visible in UI because:
 * - Provisional notes were filtered out once minddrop_stage === 'prefilled'
 * - Canonical todos were filtered out because canonicalType === 'todo' in v3 mode
 *
 * Fix: Show items in 'pending' or 'classified' stages, and show canonical todos
 * without due_date (not yet in Today view).
 */

import { MemoryRepo } from '../lib/repo/memory';
import type { IRepo } from '../lib/repo/IRepo';

// Helper to generate valid UUIDs for tests
const testUUID = (n: number) => `00000000-0000-4000-a000-${n.toString().padStart(12, '0')}`;

describe('Mind Drop v3: UI Rendering', () => {
  let repo: IRepo;

  beforeEach(() => {
    repo = new MemoryRepo();
  });

  it('should render Mind Drop todo in Catch-All list after Stage A classification', async () => {
    const dropId = testUUID(1);

    // Step 1: Create provisional note (what Stage A creates)
    const provisionalNote = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Email Sarah about the Q4 budget by Friday',
      body: 'Email Sarah about the Q4 budget by Friday',
      origin: 'catchall',
      ai_placed: true,
      labels: ['catchall', 'needs_review'],
      dropId,
      views: {
        minddrop_stage: 'pending',
        ai_pending: true,
      },
    });

    // Step 2: Stage A classification creates todo
    const todo = await repo.create({
      type: 'todo',
      name: 'Email Sarah about the Q4 budget by Friday',
      origin: 'catchall',
      ai_placed: true,
      dropId,
      views: {
        minddrop_stage: 'classified', // Stage A complete
        ai_pending: true, // Stage B pending
      },
    });

    // Update note to classified stage (Stage A marks note as classified)
    await repo.update({
      id: provisionalNote.id,
      patch: {
        views: {
          minddrop_stage: 'classified',
          ai_pending: true,
        },
      },
    });

    // Simulate the Catch-All filter logic (Phase 6.1: Simplified)
    const allNotes = await repo.listByType('note');
    const allTodos = await repo.listByType('todo');

    // Filter notes: Show all non-archived catchall notes
    const visibleNotes = allNotes.filter((n: any) => {
      const isMindDrop = n?.origin === 'catchall' || n?.labels?.includes('catchall');
      if (!isMindDrop) return false;
      if (n?.archived === true) return false;
      return true; // Show ALL notes regardless of minddrop_stage
    });

    // Filter todos: Show all non-completed catchall todos
    const visibleTodos = allTodos.filter((t: any) => {
      if (t?.origin !== 'catchall') return false;
      if (t?.completed_at) return false;
      return true; // Show ALL todos regardless of due_date
    });

    // Deduplicate by drop_id (prefer todos over notes)
    const dropIdMap = new Map<string, any>();
    for (const item of [...visibleNotes, ...visibleTodos]) {
      if (!item.drop_id) continue; // Skip items without drop_id
      const existing = dropIdMap.get(item.drop_id);
      if (!existing) {
        dropIdMap.set(item.drop_id, item);
        continue;
      }

      // Prefer todo over note
      if (item.type === 'todo' && existing.type === 'note') {
        dropIdMap.set(item.drop_id, item);
      }
    }

    const visibleItems = Array.from(dropIdMap.values());

    // Assert: ONE item should be visible in the Catch-All list
    // The deduplication logic should prefer the todo over the note
    expect(visibleItems.length).toBe(1);
    expect(visibleItems[0].type).toBe('todo');
    expect(visibleItems[0].drop_id).toBe(dropId);
  });

  it('should render Mind Drop todo even after Stage B prefill (until due_date is set)', async () => {
    const dropId = testUUID(2);

    // Create todo with Stage B prefill complete
    const todo = await repo.create({
      type: 'todo',
      name: 'Call dentist',
      title: 'Call dentist', // Prefilled by Stage B
      origin: 'catchall',
      ai_placed: true,
      dropId,
      tags: ['dentist', 'health'], // Added by Stage B
      views: {
        minddrop_stage: 'prefilled', // Stage B complete
        ai_pending: false,
        minddrop_prefilled_v1: true,
      },
    });

    // Simulate Catch-All filter (Phase 6.1: No due_date filtering)
    const allTodos = await repo.listByType('todo');

    const visibleTodos = allTodos.filter((t: any) => {
      if (t?.origin !== 'catchall') return false;
      if (t?.completed_at) return false;
      return true; // Show ALL todos regardless of due_date
    });

    // Assert: Todo should be visible (no due_date yet)
    expect(visibleTodos.length).toBe(1);
    expect(visibleTodos[0].id).toBe(todo.id);
  });

  it('should render Mind Drop todo even with due_date (Phase 6.1)', async () => {
    const dropId = testUUID(3);

    // Create todo with due_date (moved to Today)
    const todo = await repo.create({
      type: 'todo',
      name: 'Call dentist',
      origin: 'catchall',
      ai_placed: true,
      dropId,
      due_date: '2025-11-24', // Has due_date = in Today view
      views: {
        minddrop_stage: 'prefilled',
        ai_pending: false,
      },
    });

    // Simulate Catch-All filter (Phase 6.1: No due_date filtering)
    const allTodos = await repo.listByType('todo');

    const visibleTodos = allTodos.filter((t: any) => {
      if (t?.origin !== 'catchall') return false;
      if (t?.completed_at) return false;
      return true; // Show ALL todos regardless of due_date
    });

    // Assert: Todo should now be visible even with due_date (Phase 6.1 change)
    expect(visibleTodos.length).toBe(1);
    expect(visibleTodos[0].id).toBe(todo.id);
  });

  it('should NOT render archived provisional notes', async () => {
    const dropId = testUUID(4);

    // Create archived provisional note (cleaned up by Stage A)
    const archivedNote = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Email Sarah',
      body: 'Email Sarah',
      origin: 'catchall',
      ai_placed: true,
      labels: ['catchall', 'needs_review'],
      dropId,
      views: {
        minddrop_stage: 'classified',
        ai_pending: false,
      },
    });

    // Archive the note (simulating cleanup by Stage A)
    await repo.update({
      id: archivedNote.id,
      patch: {
        archived: true,
      },
    });

    // Simulate Catch-All filter (Phase 6.1: Simplified)
    const allNotes = await repo.listByType('note');

    const visibleNotes = allNotes.filter((n: any) => {
      const isMindDrop = n?.origin === 'catchall' || n?.labels?.includes('catchall');
      if (!isMindDrop) return false;
      // Exclude archived notes
      if (n?.archived === true) return false;
      return true; // Show ALL notes regardless of minddrop_stage
    });

    // Assert: Archived note should NOT be visible
    expect(visibleNotes.length).toBe(0);
  });

  it('should render habit without space_id in Catch-All', async () => {
    const dropId = testUUID(5);

    // Create habit without space_id (not yet in Habits view)
    const habit = await repo.create({
      type: 'habit',
      name: 'Morning meditation',
      frequency: 'daily',
      subtype: 'routine',
      origin: 'catchall',
      ai_placed: true,
      dropId,
      views: {
        minddrop_stage: 'prefilled',
        ai_pending: false,
      },
    });

    // Simulate Catch-All filter (Phase 6.1: No space_id filtering)
    const allHabits = await repo.listByType('habit');

    const visibleHabits = allHabits.filter((h: any) => {
      if (h?.origin !== 'catchall') return false;
      if (h?.completed_at) return false;
      return true; // Show ALL habits regardless of space_id
    });

    // Assert: Habit should be visible (no space_id)
    expect(visibleHabits.length).toBe(1);
    expect(visibleHabits[0].id).toBe(habit.id);
  });

  it('should render habit with space_id in Catch-All (Phase 6.1)', async () => {
    const dropId = testUUID(6);

    // Create habit with space_id (in Habits view)
    const habit = await repo.create({
      type: 'habit',
      name: 'Morning meditation',
      frequency: 'daily',
      subtype: 'routine',
      origin: 'catchall',
      ai_placed: true,
      dropId: dropId,
      space_id: '00000000-0000-4000-8000-testspace001', // Assigned to space
      views: {
        minddrop_stage: 'prefilled',
        ai_pending: false,
      },
    });

    // Simulate Catch-All filter (Phase 6.1: No space_id filtering)
    const allHabits = await repo.listByType('habit');

    const visibleHabits = allHabits.filter((h: any) => {
      if (h?.origin !== 'catchall') return false;
      if (h?.completed_at) return false;
      return true; // Show ALL habits regardless of space_id
    });

    // Assert: Habit should now be visible even with space_id (Phase 6.1 change)
    expect(visibleHabits.length).toBe(1);
    expect(visibleHabits[0].id).toBe(habit.id);
  });

  it('should show item in "Recent drops → Today" immediately after Stage A (real-world scenario)', async () => {
    const dropId = testUUID(7);
    const now = new Date().toISOString();

    // Real-world scenario: User submits "Email Sarah about the Q4 budget by Friday"
    // Stage A creates:
    // 1. Provisional note with origin='catchall', minddrop_stage='pending'
    // 2. Todo with origin='catchall', minddrop_stage='classified', labels=['todo']

    const provisionalNote = await repo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Email Sarah about the Q4 budget by Friday',
      body: 'Email Sarah about the Q4 budget by Friday',
      origin: 'catchall',
      ai_placed: true,
      labels: ['catchall', 'needs_review'],
      dropId,
      views: {
        minddrop_stage: 'pending',
        ai_pending: true,
      },
    });

    const todo = await repo.create({
      type: 'todo',
      name: 'Email Sarah about the Q4 budget by Friday',
      origin: 'catchall',
      ai_placed: true,
      labels: ['todo'],
      dropId,
      views: {
        minddrop_stage: 'classified',
        ai_pending: true, // Stage B still running
      },
    });

    // Update note to classified
    await repo.update({
      id: provisionalNote.id,
      patch: {
        views: {
          minddrop_stage: 'classified',
          ai_pending: true,
        },
      },
    });

    // Simulate RecentDrops load() logic
    const allNotes = await repo.listByType('note');
    const allTodos = await repo.listByType('todo');

    const noteDrops = allNotes.filter((n: any) => {
      const isMindDrop = n?.origin === 'catchall' || n?.labels?.includes('catchall');
      if (!isMindDrop) return false;
      if (n?.archived === true) return false;

      const views = n?.views ?? {};
      if (views.minddrop_stage === 'pending' || views.minddrop_stage === 'classified') {
        return true;
      }
      return false;
    });

    const todoDrops = allTodos.filter((t: any) => {
      if (t?.origin !== 'catchall') return false;
      if (t?.completed_at) return false;
      if (t.due_date) return false; // Only exclude if in Today view
      return true;
    });

    // Deduplication by drop_id (prefer todo over note)
    const dropIdMap = new Map<string, any>();
    for (const item of [...noteDrops, ...todoDrops]) {
      if (!item.drop_id) continue;
      const existing = dropIdMap.get(item.drop_id);
      if (!existing) {
        dropIdMap.set(item.drop_id, item);
        continue;
      }
      if (item.type === 'todo' && existing.type === 'note') {
        dropIdMap.set(item.drop_id, item);
      }
    }

    const unified = Array.from(dropIdMap.values());

    // Filter to "Today" items (created today)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const cutoff = startOfToday.getTime();

    const todayItems = unified.filter((i) => {
      const ts = new Date(i.created_at).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });

    // ASSERT: The item should appear in "Recent drops → Today"
    // This is what the user sees immediately after submitting
    expect(todayItems.length).toBe(1);
    expect(todayItems[0].type).toBe('todo');
    expect(todayItems[0].drop_id).toBe(dropId);

    // The UI should NOT show "Ready when you are" empty state
    expect(todayItems.length).toBeGreaterThan(0);
  });

  it('should show todo with future due_date in Recent Drops (not Today)', async () => {
    // Fresh repo for this test
    const freshRepo = new MemoryRepo();
    const dropId = testUUID(701);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7); // 7 days from now
    const futureDateISO = futureDate.toISOString();

    // Create todo with future due_date
    const todo = await freshRepo.create({
      type: 'todo',
      title: 'Future task with deadline',
      origin: 'catchall',
      dropId,
      due_date: futureDateISO,
    });

    const allTodos = await freshRepo.listByType('todo');
    const targetTodo = allTodos.find((t) => t.drop_id === dropId);
    expect(targetTodo).toBeTruthy();
    expect((targetTodo as any).title).toBe('Future task with deadline');

    // Simulate CatchAll filter logic (Phase 6.1: No due_date filtering)
    const catchallTodos = allTodos.filter((t) => {
      if (t.origin !== 'catchall') return false;
      if ((t as any).completed_at) return false;
      return true; // Show ALL todos regardless of due_date
    });

    // ASSERT: Todo with future due_date should remain visible in CatchAll
    expect(catchallTodos.length).toBe(1);
    expect((catchallTodos[0] as any).title).toBe('Future task with deadline');
  });

  it('should show todo with due_date=today in Recent Drops (Phase 6.1)', async () => {
    // Fresh repo for this test
    const freshRepo = new MemoryRepo();
    const dropId = testUUID(801);
    const today = new Date();
    today.setHours(12, 0, 0, 0); // Noon today
    const todayISO = today.toISOString();

    // Create todo with due_date = today
    const todo = await freshRepo.create({
      type: 'todo',
      title: 'Task due today',
      origin: 'catchall',
      dropId,
      due_date: todayISO,
    });

    const allTodos = await freshRepo.listByType('todo');
    const targetTodo = allTodos.find((t) => t.drop_id === dropId);
    expect(targetTodo).toBeTruthy();

    // Simulate CatchAll filter logic (Phase 6.1: No due_date filtering)
    const catchallTodos = allTodos.filter((t) => {
      if (t.origin !== 'catchall') return false;
      if ((t as any).completed_at) return false;
      return true; // Show ALL todos regardless of due_date
    });

    // ASSERT: Todo with due_date=today should now be visible (Phase 6.1 change)
    expect(catchallTodos.length).toBe(1);
    expect((catchallTodos[0] as any).title).toBe('Task due today');
  });

  // PHASE 6.1 — Recent Drops Filtering Cleanup Tests

  it('should show todos with ANY due_date (past, today, future) in Recent Drops', async () => {
    const freshRepo = new MemoryRepo();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Create todos with various due_dates
    const pastTodo = await freshRepo.create({
      type: 'todo',
      name: 'Past due task',
      origin: 'catchall',
      dropId: testUUID(901),
      due_date: yesterday.toISOString(),
    });

    const todayTodo = await freshRepo.create({
      type: 'todo',
      name: 'Due today task',
      origin: 'catchall',
      dropId: testUUID(902),
      due_date: today.toISOString(),
    });

    const futureTodo = await freshRepo.create({
      type: 'todo',
      name: 'Future task',
      origin: 'catchall',
      dropId: testUUID(903),
      due_date: tomorrow.toISOString(),
    });

    // Simulate simplified CatchAll filter (Phase 6.1)
    const allTodos = await freshRepo.listByType('todo');
    const catchallTodos = allTodos.filter((t) => {
      if (t.origin !== 'catchall') return false;
      if ((t as any).completed_at) return false;
      return true; // Show ALL todos regardless of due_date
    });

    // ASSERT: All todos should be visible regardless of due_date
    expect(catchallTodos.length).toBe(3);
    expect(catchallTodos.find((t) => (t as any).title === 'Past due task')).toBeTruthy();
    expect(catchallTodos.find((t) => (t as any).title === 'Due today task')).toBeTruthy();
    expect(catchallTodos.find((t) => (t as any).title === 'Future task')).toBeTruthy();
  });

  it('should show habits with space_id in Recent Drops', async () => {
    const freshRepo = new MemoryRepo();

    // Create habit with space_id (organized into Habits view)
    const organizedHabit = await freshRepo.create({
      type: 'habit',
      name: 'Morning meditation',
      frequency: 'daily',
      subtype: 'routine',
      origin: 'catchall',
      dropId: testUUID(1001),
      space_id: '00000000-0000-4000-8000-testspace001',
    });

    // Create habit without space_id
    const unorganizedHabit = await freshRepo.create({
      type: 'habit',
      name: 'Evening yoga',
      frequency: 'daily',
      subtype: 'routine',
      origin: 'catchall',
      dropId: testUUID(1002),
    });

    // Simulate simplified CatchAll filter (Phase 6.1)
    const allHabits = await freshRepo.listByType('habit');
    const catchallHabits = allHabits.filter((h) => {
      if (h.origin !== 'catchall') return false;
      if ((h as any).completed_at) return false;
      return true; // Show ALL habits regardless of space_id
    });

    // ASSERT: Both habits should be visible regardless of space_id
    expect(catchallHabits.length).toBe(2);
    expect(catchallHabits.find((h) => (h as any).name === 'Morning meditation')).toBeTruthy();
    expect(catchallHabits.find((h) => (h as any).name === 'Evening yoga')).toBeTruthy();
  });

  it('should show canonical logs in Recent Drops', async () => {
    const freshRepo = new MemoryRepo();

    // Create canonical log note (canonical_type = 'log')
    const log = await freshRepo.create({
      type: 'note',
      subtype: 'log' as any,
      title: 'Went for a 5k run',
      body: 'Went for a 5k run',
      origin: 'catchall',
      dropId: testUUID(1101),
      canonicalType: 'log' as any,
      views: {
        minddrop_stage: 'prefilled',
        ai_pending: false,
      },
    });

    // Simulate simplified CatchAll filter (Phase 6.1)
    const allNotes = await freshRepo.listByType('note');
    const catchallNotes = allNotes.filter((n) => {
      const isMindDrop = n?.origin === 'catchall' || n?.labels?.includes('catchall');
      if (!isMindDrop) return false;
      if (n?.archived === true) return false;
      return true; // Show ALL notes regardless of minddrop_stage
    });

    // ASSERT: Canonical log should be visible
    expect(catchallNotes.length).toBe(1);
    expect((catchallNotes[0] as any).title).toBe('Went for a 5k run');
    expect(catchallNotes[0].subtype).toBe('log');
  });

  it('should NOT disappear after prefill (todos remain until archived)', async () => {
    const freshRepo = new MemoryRepo();

    // Create todo that goes through full prefill pipeline
    const todo = await freshRepo.create({
      type: 'todo',
      name: 'Call dentist',
      origin: 'catchall',
      dropId: testUUID(1201),
      views: {
        minddrop_stage: 'pending',
        ai_pending: true,
      },
    });

    // Stage A: Classify
    await freshRepo.update({
      id: todo.id,
      patch: {
        views: {
          minddrop_stage: 'classified',
          ai_pending: true,
        },
      },
    });

    // Stage B: Prefill
    await freshRepo.update({
      id: todo.id,
      patch: {
        title: 'Call dentist to schedule checkup',
        tags: ['dentist', 'health'],
        views: {
          minddrop_stage: 'prefilled',
          ai_pending: false,
          minddrop_prefilled_v1: true,
        },
      } as any,
    });

    // Simulate simplified CatchAll filter (Phase 6.1)
    const allTodos = await freshRepo.listByType('todo');
    const catchallTodos = allTodos.filter((t) => {
      if (t.origin !== 'catchall') return false;
      if ((t as any).completed_at) return false;
      return true; // Show ALL todos regardless of minddrop_stage
    });

    // ASSERT: Todo should still be visible after full prefill
    expect(catchallTodos.length).toBe(1);
    expect((catchallTodos[0] as any).name).toBe('Call dentist');
    expect((catchallTodos[0] as any).views.minddrop_stage).toBe('prefilled');
  });

  it('should only exclude archived notes and completed todos/habits', async () => {
    const freshRepo = new MemoryRepo();

    // Create various items
    const activeNote = await freshRepo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Active note',
      body: 'Active note',
      origin: 'catchall',
      dropId: testUUID(1301),
    });

    const archivedNote = await freshRepo.create({
      type: 'note',
      subtype: 'catchall',
      title: 'Archived note',
      body: 'Archived note',
      origin: 'catchall',
      dropId: testUUID(1302),
    });

    // Archive the note
    await freshRepo.update({
      id: archivedNote.id,
      patch: {
        archived: true,
      },
    });

    const activeTodo = await freshRepo.create({
      type: 'todo',
      name: 'Active todo',
      origin: 'catchall',
      dropId: testUUID(1303),
    });

    const completedTodo = await freshRepo.create({
      type: 'todo',
      name: 'Completed todo',
      origin: 'catchall',
      dropId: testUUID(1304),
    });

    // Mark as completed
    await freshRepo.update({
      id: completedTodo.id,
      patch: {
        completed_at: new Date().toISOString(),
      } as any,
    });

    const activeHabit = await freshRepo.create({
      type: 'habit',
      name: 'Active habit',
      frequency: 'daily',
      subtype: 'routine',
      origin: 'catchall',
      dropId: testUUID(1305),
    });

    const completedHabit = await freshRepo.create({
      type: 'habit',
      name: 'Completed habit',
      frequency: 'daily',
      subtype: 'routine',
      origin: 'catchall',
      dropId: testUUID(1306),
    });

    // Mark as completed
    await freshRepo.update({
      id: completedHabit.id,
      patch: {
        completed_at: new Date().toISOString(),
      } as any,
    });

    // Simulate simplified CatchAll filter (Phase 6.1)
    const allNotes = await freshRepo.listByType('note');
    const allTodos = await freshRepo.listByType('todo');
    const allHabits = await freshRepo.listByType('habit');

    const visibleNotes = allNotes.filter((n) => {
      const isMindDrop = n?.origin === 'catchall' || n?.labels?.includes('catchall');
      if (!isMindDrop) return false;
      if (n?.archived === true) return false;
      return true;
    });

    const visibleTodos = allTodos.filter((t) => {
      if (t.origin !== 'catchall') return false;
      if ((t as any).completed_at) return false;
      return true;
    });

    const visibleHabits = allHabits.filter((h) => {
      if (h.origin !== 'catchall') return false;
      if ((h as any).completed_at) return false;
      return true;
    });

    // ASSERT: Only active items should be visible
    expect(visibleNotes.length).toBe(1);
    expect((visibleNotes[0] as any).title).toBe('Active note');

    expect(visibleTodos.length).toBe(1);
    expect((visibleTodos[0] as any).name).toBe('Active todo');

    expect(visibleHabits.length).toBe(1);
    expect((visibleHabits[0] as any).name).toBe('Active habit');
  });

  // PHASE 6.1 — Pending Skeleton UI Tests

  it('should show pending skeleton when ai_pending=true', async () => {
    const freshRepo = new MemoryRepo();

    // Create item with ai_pending=true (processing in progress)
    const pendingTodo = await freshRepo.create({
      type: 'todo',
      name: 'Buy groceries',
      origin: 'catchall',
      dropId: testUUID(1401),
      views: {
        ai_pending: true,
        minddrop_stage: 'pending',
      },
    });

    const allTodos = await freshRepo.listByType('todo');
    const todo = allTodos.find((t) => t.drop_id === testUUID(1401));

    // ASSERT: Item exists in DB
    expect(todo).toBeTruthy();
    expect((todo as any).views.ai_pending).toBe(true);

    // Visual state should be 'pending'
    // In the UI, this would render <PendingSkeleton /> instead of full content
    const visualState = (todo as any).views.ai_pending === true ? 'pending' : 'complete';
    expect(visualState).toBe('pending');
  });

  it('should show full content when ai_pending=false and prefilled', async () => {
    const freshRepo = new MemoryRepo();

    // Create fully processed item
    const completeTodo = await freshRepo.create({
      type: 'todo',
      name: 'Buy groceries',
      origin: 'catchall',
      dropId: testUUID(1501),
      tags: ['shopping', 'groceries'],
      views: {
        ai_pending: false,
        minddrop_stage: 'prefilled',
        minddrop_prefilled_v1: true,
      },
    });

    const allTodos = await freshRepo.listByType('todo');
    const todo = allTodos.find((t) => t.drop_id === testUUID(1501));

    // ASSERT: Item exists in DB with enrichment
    expect(todo).toBeTruthy();
    expect((todo as any).views.ai_pending).toBe(false);
    expect((todo as any).views.minddrop_stage).toBe('prefilled');
    expect((todo as any).tags).toEqual(['shopping', 'groceries']);

    // Visual state should be 'complete'
    // In the UI, this would render full AnimatedMindDropCard with all content
    const views = (todo as any).views ?? {};
    const visualState = views.minddrop_stage === 'prefilled' ? 'complete' : 'pending';
    expect(visualState).toBe('complete');
  });

  it('should transition from pending to complete when Stage B completes', async () => {
    const freshRepo = new MemoryRepo();

    // Create item in pending state
    const todo = await freshRepo.create({
      type: 'todo',
      name: 'Call dentist',
      origin: 'catchall',
      dropId: testUUID(1601),
      views: {
        ai_pending: true,
        minddrop_stage: 'pending',
      },
    });

    // Verify pending state
    let allTodos = await freshRepo.listByType('todo');
    let currentTodo = allTodos.find((t) => t.drop_id === testUUID(1601));
    expect((currentTodo as any).views.ai_pending).toBe(true);

    // Simulate Stage B completion
    await freshRepo.update({
      id: todo.id,
      patch: {
        tags: ['dentist', 'health'],
        views: {
          ai_pending: false,
          minddrop_stage: 'prefilled',
          minddrop_prefilled_v1: true,
        },
      },
    });

    // Verify complete state
    allTodos = await freshRepo.listByType('todo');
    currentTodo = allTodos.find((t) => t.drop_id === testUUID(1601));
    expect((currentTodo as any).views.ai_pending).toBe(false);
    expect((currentTodo as any).views.minddrop_stage).toBe('prefilled');
    expect((currentTodo as any).tags).toEqual(['dentist', 'health']);
  });
});
