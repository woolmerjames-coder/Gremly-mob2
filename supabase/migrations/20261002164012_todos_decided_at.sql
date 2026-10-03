-- Sweep remembers decisions. decided_at is when a todo was last decided:
-- given a day, a Lock In or a resurface date, anywhere in the app. The quick
-- sweep (the brief's Sweep first) asks only about todos that still need a
-- decision, so something settled last night is not asked about again.
alter table public.todos add column if not exists decided_at timestamptz;

create or replace function public.todos_mark_decided()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.decided_at is null and (new.due_day is not null or new.commitment is true) then
      new.decided_at := now();
    end if;
  elsif (new.due_day is distinct from old.due_day and new.due_day is not null)
     or (new.commitment is true and old.commitment is not true)
     or (new.resurface_at is distinct from old.resurface_at and new.resurface_at is not null) then
    new.decided_at := now();
  end if;
  return new;
end;
$$;

-- named to run after the triggers that fill due_day from due_date
drop trigger if exists zz_todos_mark_decided on public.todos;
create trigger zz_todos_mark_decided
  before insert or update on public.todos
  for each row execute function public.todos_mark_decided();

-- open todos that already have a day were decided when they were last changed
update public.todos
set decided_at = coalesce(updated_at, created_at)
where decided_at is null
  and due_day is not null
  and completed_at is null
  and archived is not true;
