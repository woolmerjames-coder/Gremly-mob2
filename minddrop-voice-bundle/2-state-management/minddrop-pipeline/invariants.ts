/**
 * Classification Invariants
 *
 * Runtime assertions for Mind Drop data integrity.
 * These check for inconsistent states that indicate bugs.
 *
 * In dev: logs warnings
 * In prod: silently no-ops (unless EXPO_PUBLIC_INVARIANT_CHECKS=true)
 */

import type { MindDropBucket } from './types';

const INVARIANT_CHECKS_ENABLED =
  typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.EXPO_PUBLIC_INVARIANT_CHECKS === 'true';

/**
 * Log an invariant violation
 */
function logViolation(name: string, message: string, data: Record<string, unknown>): void {
  if (!INVARIANT_CHECKS_ENABLED) return;

  console.warn(`[INVARIANT:${name}] ${message}`, data);
}

/**
 * Check: If has_list is true, list_items should be non-empty or list_items_count > 0
 */
export function checkHasListConsistency(
  entityId: string,
  hasListFlag: boolean,
  listItemsCount: number | null | undefined,
  listItems: unknown[] | null | undefined,
): boolean {
  if (!hasListFlag) return true;

  const count = listItemsCount ?? 0;
  const itemsLength = Array.isArray(listItems) ? listItems.length : 0;

  if (count === 0 && itemsLength === 0) {
    logViolation('has_list_consistency', 'has_list=true but no list items found', {
      entityId,
      hasListFlag,
      listItemsCount: count,
      listItemsLength: itemsLength,
    });
    return false;
  }

  return true;
}

/**
 * Check: Habits should not have due_date set (they're recurring, not one-off)
 */
export function checkHabitNoDueDate(
  entityId: string,
  bucket: MindDropBucket,
  dueDate: string | null | undefined,
  dueDay: string | null | undefined,
): boolean {
  if (bucket !== 'habit') return true;

  if (dueDate || dueDay) {
    logViolation('habit_no_due_date', 'Habit has due_date/due_day set (should be null)', {
      entityId,
      bucket,
      dueDate,
      dueDay,
    });
    return false;
  }

  return true;
}

/**
 * Check: Logs should not have due_date set (they're records, not tasks)
 */
export function checkLogNoDueDate(
  entityId: string,
  bucket: MindDropBucket,
  dueDate: string | null | undefined,
  dueDay: string | null | undefined,
): boolean {
  if (bucket !== 'log') return true;

  if (dueDate || dueDay) {
    logViolation('log_no_due_date', 'Log has due_date/due_day set (should be null)', {
      entityId,
      bucket,
      dueDate,
      dueDay,
    });
    return false;
  }

  return true;
}

/**
 * Check: Entity should have either title or name (not empty)
 */
export function checkHasTitleOrName(
  entityId: string,
  title: string | null | undefined,
  name: string | null | undefined,
  body: string | null | undefined,
): boolean {
  const hasTitle = title && title.trim().length > 0;
  const hasName = name && name.trim().length > 0;
  const hasBody = body && body.trim().length > 0;

  if (!hasTitle && !hasName && !hasBody) {
    logViolation('has_title_or_name', 'Entity has no title, name, or body', {
      entityId,
      titleLength: title?.length ?? 0,
      nameLength: name?.length ?? 0,
      bodyLength: body?.length ?? 0,
    });
    return false;
  }

  return true;
}

/**
 * Check: Phase 2 should not change canonical type (unless feature flag allows)
 */
export function checkPhase2TypeStability(
  entityId: string,
  phase1Type: MindDropBucket,
  phase2Type: MindDropBucket | null | undefined,
  allowTypeChange: boolean = false,
): boolean {
  if (!phase2Type) return true; // No phase2 type set
  if (allowTypeChange) return true; // Feature flag allows

  if (phase1Type !== phase2Type) {
    logViolation('phase2_type_stability', 'Phase 2 changed canonical type (not allowed)', {
      entityId,
      phase1Type,
      phase2Type,
      allowTypeChange,
    });
    return false;
  }

  return true;
}

/**
 * Check: Todo with null title but non-empty body (suspicious)
 */
export function checkTodoTitleConsistency(
  entityId: string,
  bucket: MindDropBucket,
  title: string | null | undefined,
  name: string | null | undefined,
  body: string | null | undefined,
): boolean {
  if (bucket !== 'todo') return true;

  const hasTitle = title && title.trim().length > 0;
  const hasName = name && name.trim().length > 0;
  const hasBody = body && body.trim().length > 0;

  if (!hasTitle && !hasName && hasBody) {
    logViolation('todo_title_consistency', 'Todo has body but no title/name', {
      entityId,
      titleLength: title?.length ?? 0,
      nameLength: name?.length ?? 0,
      bodyLength: body?.length ?? 0,
      bodyPreview: body?.slice(0, 50),
    });
    return false;
  }

  return true;
}

/**
 * Run all invariant checks on an entity
 */
export function checkAllInvariants(entity: {
  id: string;
  bucket?: MindDropBucket;
  type?: string;
  title?: string | null;
  name?: string | null;
  body?: string | null;
  has_list?: boolean;
  list_items_count?: number | null;
  list_items?: unknown[] | null;
  due_date?: string | null;
  due_day?: string | null;
}): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const bucket = (entity.bucket ?? entity.type) as MindDropBucket | undefined;

  if (!bucket) {
    return { valid: true, violations }; // Can't check without bucket
  }

  if (!checkHasTitleOrName(entity.id, entity.title, entity.name, entity.body)) {
    violations.push('has_title_or_name');
  }

  if (
    !checkHasListConsistency(
      entity.id,
      entity.has_list ?? false,
      entity.list_items_count,
      entity.list_items,
    )
  ) {
    violations.push('has_list_consistency');
  }

  if (!checkHabitNoDueDate(entity.id, bucket, entity.due_date, entity.due_day)) {
    violations.push('habit_no_due_date');
  }

  if (!checkLogNoDueDate(entity.id, bucket, entity.due_date, entity.due_day)) {
    violations.push('log_no_due_date');
  }

  if (!checkTodoTitleConsistency(entity.id, bucket, entity.title, entity.name, entity.body)) {
    violations.push('todo_title_consistency');
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
