-- Data fabric: what to watch once it is live (stage 7).
--
-- Read only. Each query stands alone: run the one you want in the SQL editor.
-- None of them is a gate. When a number looks off, say so and it gets fixed;
-- nothing waits on it.

-- 1. The check, by job, over the last 7 days: how many sentences it read, sent
--    back once, and left out. A job leaving out more than about a tenth of
--    what it reads is worth a look in its details.
select job,
       count(*) as runs,
       sum(checked) as checked,
       sum(sent_back) as sent_back,
       sum(left_out) as left_out,
       round(100.0 * sum(left_out) / nullif(sum(checked), 0), 1) as left_out_pct
from public.check_runs
where created_at > now() - interval '7 days'
group by job
order by checked desc;

-- 2. Which steps found sentences wrong, by job, over the last 7 days (each
--    detail names its field, outcome and the steps; never words).
select c.job, step, count(*) as times
from public.check_runs c,
     jsonb_array_elements(c.details) d,
     jsonb_array_elements_text(coalesce(d -> 'first', '[]'::jsonb) || coalesce(d -> 'second', '[]'::jsonb)) step
where c.created_at > now() - interval '7 days'
group by c.job, step
order by c.job, times desc;

-- 3. Corrections: what each did, newest first. passage_outcomes says what
--    happened to each sentence resting on what changed; lines_named, how many
--    lines Gremly showed them it was about.
select id, created_at, surface, target_kind, status,
       result -> 'facts_corrected' as corrected,
       result -> 'facts_changed' as changed,
       result -> 'facts_happened' as happened,
       result -> 'facts_made_private' as made_private,
       result -> 'facts_added' as added,
       result -> 'lines_named' as lines_named,
       result -> 'passages' as passages,
       result -> 'passage_outcomes' as outcomes
from public.user_corrections
where created_at > now() - interval '14 days'
order by created_at desc;

-- 4. What a correction costs, a day at a time (the bar is 1.5 cents or less).
select date_trunc('day', created_at) as day,
       count(distinct run_id) as corrections,
       round(sum(cost_usd)::numeric * 100, 2) as cents,
       round(sum(cost_usd)::numeric * 100 / nullif(count(distinct run_id), 0), 2) as cents_each
from public.ai_usage
where job = 'gremly-context-correction-apply'
  and created_at > now() - interval '14 days'
group by 1
order by 1 desc;

-- 5. What each stored sentence rests on, by surface and writer: which writers
--    record theirs, and how many of their sentences rest on nothing.
select surface, writer, count(*) as sentences,
       count(*) filter (where cardinality(fact_ids) = 0 and cardinality(person_ids) = 0 and items = '[]'::jsonb) as rest_on_nothing,
       max(written_at) as latest
from public.passage_refs
group by surface, writer
order by sentences desc;

-- 6. The weekly summary beside the old one (SUMMARY_FROM_PASS = "beside"): one
--    row a person a week, to read before it goes "on".
select user_id, window_start, window_end, created_at,
       payload ->> 'outcome' as outcome,
       payload ->> 'why' as why,
       jsonb_array_length(coalesce(payload -> 'content' -> 'cards', '[]'::jsonb)) as cards,
       payload -> 'left_out' as left_out
from public.shadow_runs
where run_kind = 'weekly_summary_from_pass'
order by created_at desc
limit 30;

-- 7. The weekly pass: what it noted about people, and whether each run
--    applied. people_noted at 0 week after week with people in the ledger is
--    worth a look.
select user_id, period_end, status, model, prompt_version,
       jsonb_array_length(coalesce(output -> 'people_notes', '[]'::jsonb)) as people_noted,
       (output -> 'summary_plan' -> 'cards') is not null as planned
from public.synthesis_runs
where kind = 'weekly' and created_at > now() - interval '21 days'
order by created_at desc;

-- 8. The line about each person (PERSON_WORDS = "on", after
--    supabase/migrations/20261016090000_data_fabric_stage6_person_words.sql):
--    how many have one, and how fresh.
select user_id,
       count(*) filter (where words is not null) as with_a_line,
       count(*) as people,
       max(words_updated_at) as latest
from public.life_people
where merged_into is null and hidden_at is null
group by user_id
order by with_a_line desc;

-- 9. The monthly story through the check: items kept and left out a run.
select user_id, created_at, checked, sent_back, left_out
from public.check_runs
where job = 'story'
order by created_at desc
limit 30;
