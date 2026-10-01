-- Lifemaps and context fixes, part 7: private facts.
-- Sensitive facts stay in the ledger for Gremly's understanding and for
-- conversations the person starts, and are kept off every display surface.
alter table public.life_facts add column if not exists private boolean not null default false;
comment on column public.life_facts.private is 'Sensitive (health, therapy, substances, money troubles, conflict and the like): Gremly may use it in conversations the person starts, never on cards, headlines or notifications.';
