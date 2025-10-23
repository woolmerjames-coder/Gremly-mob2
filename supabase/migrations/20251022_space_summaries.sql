-- Phase 10.8: Space Insight Summaries
-- Rolling, lightweight summaries for each Space

-- 1) Summary history (append-only)
create table if not exists public.space_summaries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  summary text not null,
  extracted_bullets jsonb not null default '[]'::jsonb, -- short bullet insights
  last_message_id uuid,                                  -- snapshot anchor
  source_window int not null default 0,                  -- msgs considered
  model text not null,
  token_usage int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists space_summaries_space_id_idx on public.space_summaries(space_id);
create index if not exists space_summaries_created_at_idx on public.space_summaries(created_at);

-- 2) Convenience columns on spaces (latest projection)
alter table public.spaces
  add column if not exists last_summary text,
  add column if not exists last_summary_at timestamptz,
  add column if not exists last_summary_tokens int default 0;

-- 3) Helpful RPC for app
create or replace function public.get_latest_space_summary(p_space uuid)
returns table (
  id uuid,
  summary text,
  extracted_bullets jsonb,
  created_at timestamptz
) language sql stable as $$
  select s.id, s.summary, s.extracted_bullets, s.created_at
  from public.space_summaries s
  where s.space_id = p_space
  order by s.created_at desc
  limit 1;
$$;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
