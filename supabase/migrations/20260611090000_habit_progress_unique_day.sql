DELETE FROM habit_progress a
USING habit_progress b
WHERE a.owner_id = b.owner_id
  AND a.habit_id = b.habit_id
  AND a.occurred_day = b.occurred_day
  AND a.ctid > b.ctid;

ALTER TABLE habit_progress
ADD CONSTRAINT habit_progress_owner_habit_day_unique
UNIQUE (owner_id, habit_id, occurred_day);
