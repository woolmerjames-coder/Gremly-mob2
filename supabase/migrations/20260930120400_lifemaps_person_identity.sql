-- Lifemaps and context fixes, part 5: who the person is, for every prompt.
-- First name and pronouns come from what they told onboarding, then their
-- sign-in name. Pronouns are never guessed: null means write without them.

create or replace function public.person_identity(p_user uuid)
returns table (first_name text, pronouns text, identity jsonb)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce(
      nullif(trim(p.identity->>'name'), ''),
      nullif(trim(u.raw_user_meta_data->>'given_name'), ''),
      nullif(split_part(trim(coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.raw_user_meta_data->>'name', '')), ' ', 1), '')
    ) as first_name,
    coalesce(
      nullif(trim(p.identity->>'pronouns'), ''),
      case lower(coalesce(p.identity->>'gender', ''))
        when 'male' then 'he/him' when 'man' then 'he/him'
        when 'female' then 'she/her' when 'woman' then 'she/her'
      end,
      substring(p.profile_text from 'Pronouns: ([A-Za-z]+/[A-Za-z]+)')
    ) as pronouns,
    coalesce(p.identity, '{}'::jsonb) as identity
  from auth.users u
  left join public.user_profiles p on p.user_id = u.id
  where u.id = p_user;
$$;
revoke execute on function public.person_identity(uuid) from anon, authenticated, public;
grant execute on function public.person_identity(uuid) to service_role;
