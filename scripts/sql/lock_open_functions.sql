-- Closes the database functions that anyone holding the app's public key could
-- call. They run with their owner's rights, so until now the public key could,
-- given an id, complete another person's todo or habit, write their fed day or
-- their drop count, or read their chat summaries.
--
-- After this:
--   the public key (anon) and PUBLIC can call none of them;
--   the ones the app calls signed in still work for signed in people, and each
--   now refuses any person but the caller;
--   the ones only the workers or cron call are closed to signed in people too;
--   the service key, which the workers and cron use, is unchanged: it carries
--   no caller, so the checks let it through.
-- The three trigger functions on the same list are left alone. They cannot be
-- called on their own, only by their triggers.
--
-- Each check goes in right after the function's first BEGIN, taken from the
-- live definition, and the script stops if anything else in a function would
-- change. Running it twice changes nothing the second time.

begin;

do $lock$
declare
  f record;
  guard text;
  old_def text;
  pos int;
begin
  for f in
    select v.sig, v.allowed
    from (values
      ('public.check_and_increment_gremly_age(uuid, date)', 'p_owner_id = auth.uid()'),
      ('public.convert_or_create_from_drop(uuid, text, text, jsonb)', 'p_owner = auth.uid()'),
      ('public.get_or_create_ritual_progress(uuid, date)', 'p_owner_id = auth.uid()'),
      ('public.get_training_readiness(uuid, timestamptz)', 'p_owner_id = auth.uid()'),
      ('public.increment_drop_count(uuid, date)', 'p_owner_id = auth.uid()'),
      ('public.increment_sweep_count(uuid, date)', 'p_owner_id = auth.uid()'),
      ('public.mark_fed_today(uuid, date)', 'p_owner_id = auth.uid()'),
      ('public.complete_habit(uuid)',
       'EXISTS (SELECT 1 FROM public.habits WHERE id = _id AND owner_id = auth.uid())'),
      ('public.complete_item(text, uuid)',
       'EXISTS (SELECT 1 FROM public.todos WHERE id = _id AND owner_id = auth.uid())'
       || ' OR EXISTS (SELECT 1 FROM public.habits WHERE id = _id AND owner_id = auth.uid())')
    ) as v(sig, allowed)
  loop
    guard := E'  -- only the person themselves, or the service key, which has no caller\n'
      || '  IF auth.uid() IS NOT NULL AND NOT coalesce(' || f.allowed || E', false) THEN\n'
      || E'    RAISE EXCEPTION ''not allowed'' USING ERRCODE = ''42501'';\n'
      || E'  END IF;\n';
    old_def := pg_get_functiondef(f.sig::regprocedure);
    continue when position(guard in old_def) > 0;
    pos := position(E'\nbegin\n' in lower(old_def));
    if pos = 0 then
      raise exception 'No BEGIN line in %', f.sig;
    end if;
    execute left(old_def, pos + 6) || guard || substr(old_def, pos + 7);
    if replace(pg_get_functiondef(f.sig::regprocedure), guard, '') <> old_def then
      raise exception 'More than the check would change in %', f.sig;
    end if;
  end loop;
end
$lock$;

-- Nobody calls any of them with the public key.
revoke execute on function
  public.archive_stale_general_chats(),
  public.check_and_increment_gremly_age(uuid, date),
  public.complete_habit(uuid),
  public.complete_item(text, uuid),
  public.convert_or_create_from_drop(uuid, text, text, jsonb),
  public.get_or_create_ritual_progress(uuid, date),
  public.get_recent_entity_chat_summaries(uuid, text),
  public.get_rolling_habits(),
  public.get_training_readiness(uuid, timestamptz),
  public.get_users_needing_dco(date),
  public.increment_drop_count(uuid, date),
  public.increment_sweep_count(uuid, date),
  public.mark_fed_today(uuid, date),
  public.set_chat_summary(text, uuid, text)
from public, anon;

-- The app calls these signed in, and each now checks the caller
-- (get_rolling_habits only ever reads the caller's own habits).
grant execute on function
  public.check_and_increment_gremly_age(uuid, date),
  public.complete_habit(uuid),
  public.complete_item(text, uuid),
  public.convert_or_create_from_drop(uuid, text, text, jsonb),
  public.get_or_create_ritual_progress(uuid, date),
  public.get_rolling_habits(),
  public.get_training_readiness(uuid, timestamptz),
  public.increment_drop_count(uuid, date),
  public.increment_sweep_count(uuid, date),
  public.mark_fed_today(uuid, date)
to authenticated;

-- Only the workers or cron call these.
revoke execute on function
  public.archive_stale_general_chats(),
  public.get_recent_entity_chat_summaries(uuid, text),
  public.get_users_needing_dco(date),
  public.set_chat_summary(text, uuid, text)
from authenticated;

-- The service key keeps every one.
grant execute on function
  public.archive_stale_general_chats(),
  public.check_and_increment_gremly_age(uuid, date),
  public.complete_habit(uuid),
  public.complete_item(text, uuid),
  public.convert_or_create_from_drop(uuid, text, text, jsonb),
  public.get_or_create_ritual_progress(uuid, date),
  public.get_recent_entity_chat_summaries(uuid, text),
  public.get_rolling_habits(),
  public.get_training_readiness(uuid, timestamptz),
  public.get_users_needing_dco(date),
  public.increment_drop_count(uuid, date),
  public.increment_sweep_count(uuid, date),
  public.mark_fed_today(uuid, date),
  public.set_chat_summary(text, uuid, text)
to service_role;

notify pgrst, 'reload schema';

commit;
