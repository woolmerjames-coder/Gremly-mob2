-- Lock In is gone from the app: something is on Today or it is not.
-- The flags come off every todo and habit, so nothing that still reads them
-- (an older build of the app, the brief's and Gremly's reads) treats an item
-- as locked in.
--
-- The columns stay. Older builds and Gremly's item reads select them by
-- name, so dropping them would break those reads. Notes people wrote with a
-- Lock In (commitment_note) and when one was made in the past (locked_in_at)
-- are history and are left as they are.
--
-- Counted before writing this: 25 todos with commitment on (5 of them still
-- open), 69 todos with a commitment start, 10 habits with a commitment end
-- date, 16 habits with a commitment start, 4 todos with locked_in on.

update public.todos
   set commitment = false,
       commitment_started_at = null
 where commitment is true
    or commitment_started_at is not null;

update public.habits
   set commitment = false,
       commitment_started_at = null,
       commitment_until = null
 where commitment is true
    or commitment_started_at is not null
    or commitment_until is not null;

update public.todos
   set locked_in = false
 where locked_in is true;

update public.habits
   set locked_in = false
 where locked_in is true;
