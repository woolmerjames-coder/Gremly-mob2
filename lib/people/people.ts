/**
 * The people page (Worlds rebuild, stage 5): the one record for each person
 * in someone's life that the data fabric keeps (life_people), read for the
 * People list on Worlds and for a person's own page.
 *
 * The app only reads these tables. Gremly writes the page's words
 * (inngest-jobs context/personPage.js, through cortex type person-page), a
 * merge Gremly proposed happens on their tap (person-merge), and a
 * correction goes through Not right? (target kind person).
 *
 * Nothing private or about health is shown where it could be seen at a
 * glance: on the list, who someone is stays off when it came from a private
 * fact, and the page's dates and things to remember are written without them.
 */

import { supabase } from '../supabase/client';
import type { Chapter, WithYouItem } from '../supabase/types';
import type { Note, Todo } from '../types';

export interface PersonRecord {
  id: string;
  name: string | null;
  relationship: string | null;
  /** person: they said it; gremly: a fact they stated says it; understood: Gremly read it from the records */
  relationship_by: string | null;
  relationship_fact_id: string | null;
  /** The line Gremly keeps about them (personWords.js), written to the person */
  words: string | null;
  /** Who matters most to them now, 1 first; null for everyone else */
  matters_rank: number | null;
  merged_into: string | null;
  hidden_at: string | null;
}

/** What Gremly wrote for the page (personPage.js), kept on the record. */
export interface PersonPageWords {
  days: { fact_id: string; label: string }[];
  remember: { text: string; fact_ids: string[] }[];
  at?: string;
  version?: string;
}

export interface PersonFact {
  id: string;
  statement: string;
  about_date: string | null;
  about_date_end: string | null;
  timing: string | null;
  state: string;
  private: boolean;
  health: boolean;
  item_table: string | null;
  item_id: string | null;
}

/** On the list: who they are stays off when it rests on something private. */
export interface PersonListEntry extends PersonRecord {
  who_private: boolean;
  names: string[];
}

/** Two records Gremly proposed as one, from this person's side. */
export interface PersonMerge {
  id: string;
  other: Pick<PersonRecord, 'id' | 'name' | 'relationship' | 'relationship_by'>;
}

export interface PersonPage {
  person: PersonRecord;
  /** Who they are came from something private or about health, so it is not shown */
  who_private: boolean;
  /** Their record and every record merged into it */
  ids: string[];
  names: string[];
  facts: PersonFact[];
  chapterIds: string[];
  merges: PersonMerge[];
  page: PersonPageWords | null;
}

const RECORD =
  'id,name,relationship,relationship_by,relationship_fact_id,words,matters_rank,merged_into,hidden_at';

/**
 * Private, or about health: anything marked so, and a fact the kinds pass has
 * not read for health yet. None of it is shown anywhere on the people page or
 * the list. Pure.
 */
export function sensitive(f: { private?: boolean | null; health?: boolean | null }): boolean {
  return !!f.private || f.health !== false;
}
const OPEN_STATES = ['current', 'planned', 'unconfirmed', 'happened'];
const lower = (s: unknown) =>
  String(s || '')
    .trim()
    .toLowerCase();

// ── Words for the screen ─────────────────────────────────────────────────────

/** Who someone is, as a noun phrase from the person's side: "sister", "Sam's mum". Pure. */
function relation(rel: string | null | undefined): string {
  return String(rel || '')
    .trim()
    .replace(/^(my|your|their)\s+/i, '');
}

/** "Your sister", or "Sam's mum" when it is someone else's. Pure. */
export function yourRelation(rel: string | null | undefined): string {
  const r = relation(rel);
  if (!r) return '';
  // someone else's: Sam's mum, Priya's husband
  if (/^[^\s]+['’]s\s/.test(r)) return r.charAt(0).toUpperCase() + r.slice(1);
  return `Your ${r}`;
}

/** How someone is named on the screen: their name, or who they are when that is all there is. Pure. */
export function personTitle(
  p: Pick<PersonRecord, 'name' | 'relationship'> | null | undefined,
): string {
  if (!p) return 'Someone';
  return p.name?.trim() || yourRelation(p.relationship) || 'Someone';
}

/**
 * Who they are to the person, under their name. Empty when the title already
 * says it, or on the list when it rests on something private. Gremly's own
 * reading is said to be his. Pure.
 */
export function whoLine(
  p: Pick<PersonRecord, 'name' | 'relationship' | 'relationship_by'>,
  { hide = false }: { hide?: boolean } = {},
): string {
  if (hide || !p.name?.trim() || !relation(p.relationship)) return '';
  const who = yourRelation(p.relationship);
  return p.relationship_by === 'understood' ? `${who}, as Gremly understands it` : who;
}

/** The letter in their circle. Pure. */
export function initialOf(p: Pick<PersonRecord, 'name' | 'relationship'>): string {
  return (
    personTitle(p)
      .replace(/^Your\s+/, '')
      .trim()
      .charAt(0) || '?'
  ).toUpperCase();
}

// ── Days ─────────────────────────────────────────────────────────────────────

/**
 * The next time a day comes round each year, from a day, as YYYY-MM-DD: a
 * 29 February falls on the 28th in other years. The twin of
 * workers/shared/factTiming.js nextYearly. Pure.
 */
export function nextYearly(date: string | null | undefined, from: string): string | null {
  const d = String(date || '').slice(0, 10);
  const f = String(from || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return null;
  const month = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  const on = (year: number) => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
  };
  const year = Number(f.slice(0, 4));
  const first = on(year);
  return first >= f ? first : on(year + 1);
}

/**
 * The day a fact's label stands beside: the next time one that comes round
 * every year falls, or the day of one still ahead. Null for one that has
 * passed or has no day. The twin of personPage.js labelDay. Pure.
 */
export function labelDay(
  f: Pick<PersonFact, 'about_date' | 'about_date_end' | 'timing'>,
  today: string,
): string | null {
  const start = f.about_date ? String(f.about_date).slice(0, 10) : null;
  if (!start || f.timing === 'standing') return null;
  if (f.timing === 'yearly') return nextYearly(start, today);
  const end = f.about_date_end ? String(f.about_date_end).slice(0, 10) : start;
  return end >= today ? start : null;
}

/** The page's days, each beside the fact it is for as that stands now, soonest first. Pure. */
export function pageDays(
  page: PersonPageWords | null,
  facts: PersonFact[],
  today: string,
): { id: string; label: string; day: string; yearly: boolean }[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const out: { id: string; label: string; day: string; yearly: boolean }[] = [];
  for (const d of page?.days || []) {
    const f = byId.get(d.fact_id);
    // a fact put right or changed since takes its label with it until the page is written again
    if (!f || !OPEN_STATES.includes(f.state) || sensitive(f)) continue;
    const day = labelDay(f, today);
    if (day && d.label?.trim())
      out.push({ id: f.id, label: d.label.trim(), day, yearly: f.timing === 'yearly' });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** The things to remember whose facts all still stand. Pure. */
export function pageRemember(page: PersonPageWords | null, facts: PersonFact[]): string[] {
  const standing = new Set(
    facts.filter((f) => OPEN_STATES.includes(f.state) && !sensitive(f)).map((f) => f.id),
  );
  // a line rests on at least one fact, and goes when any of them does
  return (page?.remember || [])
    .filter(
      (r) =>
        r.text?.trim() &&
        (r.fact_ids || []).length > 0 &&
        r.fact_ids.every((id) => standing.has(id)),
    )
    .map((r) => r.text.trim());
}

// ── What is going on with them ──────────────────────────────────────────────

function namesOn(views: unknown): string[] {
  const people = (views as { people?: unknown } | null | undefined)?.people;
  return Array.isArray(people)
    ? people
        .map((x) => (typeof x === 'string' ? x : (x as { name?: string })?.name))
        .filter(Boolean)
        .map(lower)
    : [];
}

/**
 * Items a fact about them was read from, by table: those an open fact points
 * at, and those anything private or about health points at, which are never
 * shown however they name them. Pure.
 */
function itemIdsOf(facts: PersonFact[], table: string): { theirs: Set<string>; kept: Set<string> } {
  const at = (fs: PersonFact[]) =>
    new Set(fs.filter((f) => f.item_table === table && f.item_id).map((f) => f.item_id as string));
  return { theirs: at(facts.filter((f) => !sensitive(f))), kept: at(facts.filter(sensitive)) };
}

/** Their open todos: from a fact about them, or naming them. Soonest first. Pure. */
export function personTodos(todos: Todo[], names: string[], facts: PersonFact[]): Todo[] {
  const ids = itemIdsOf(facts, 'todos');
  const want = new Set(names.map(lower).filter(Boolean));
  return todos
    .filter(
      (t) => !t.completed_at && !(t as { archived?: boolean }).archived && !ids.kept.has(t.id),
    )
    .filter((t) => ids.theirs.has(t.id) || namesOn(t.views).some((n) => want.has(n)))
    .sort((a, b) => String(a.due_day || '9999').localeCompare(String(b.due_day || '9999')));
}

/** The last thing they noted about them: from a fact about them, or naming them. Pure. */
export function lastNoted(notes: Note[], names: string[], facts: PersonFact[]): Note | null {
  const ids = itemIdsOf(facts, 'notes');
  const want = new Set(names.map(lower).filter(Boolean));
  const theirs = notes
    .filter((n) => !(n as { archived?: boolean }).archived && !ids.kept.has(n.id))
    .filter((n) => ids.theirs.has(n.id) || namesOn(n.views).some((x) => want.has(x)))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return theirs[0] || null;
}

/** Their Chapters: linked to them, or naming them among who it was with. Open first. Pure. */
export function personChapters(
  chapters: Chapter[],
  chapterIds: string[],
  names: string[],
): Chapter[] {
  const ids = new Set(chapterIds);
  const want = new Set(names.map(lower).filter(Boolean));
  const withThem = (c: Chapter) =>
    ((c.with_you as WithYouItem[] | null) || []).some((w) => want.has(lower(w?.name)));
  const closed = (c: Chapter) => !!c.closed_at || c.phase === 'closed';
  return chapters
    .filter((c) => ids.has(c.id) || withThem(c))
    .sort((a, b) => Number(closed(a)) - Number(closed(b)));
}

/** The record a name on the screen is, by their name or any name they are known by. Pure. */
export function findByName(people: PersonListEntry[], name: string): PersonListEntry | null {
  const want = lower(name);
  if (!want) return null;
  return (
    people.find((p) => lower(p.name) === want) ||
    people.find((p) => p.names.some((n) => lower(n) === want)) ||
    null
  );
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** Everyone in their life Gremly keeps, who matters most first, then by name. */
export async function fetchPeople(): Promise<PersonListEntry[]> {
  const { data, error } = await supabase
    .from('life_people')
    .select(RECORD)
    .is('merged_into', null)
    .is('hidden_at', null)
    .limit(300);
  if (error) throw error;
  const people = (data ?? []) as PersonRecord[];
  if (!people.length) return [];
  const factIds = [
    ...new Set(people.map((p) => p.relationship_fact_id).filter(Boolean)),
  ] as string[];
  const [{ data: names }, { data: facts }] = await Promise.all([
    supabase
      .from('life_person_names')
      .select('person_id,name')
      .in(
        'person_id',
        people.map((p) => p.id),
      ),
    factIds.length
      ? supabase.from('life_facts').select('id,private,health').in('id', factIds)
      : Promise.resolve({ data: [] as { id: string; private: boolean; health: boolean }[] }),
  ]);
  const privateFact = new Set(
    ((facts ?? []) as { id: string; private: boolean; health: boolean }[])
      .filter(sensitive)
      .map((f) => f.id),
  );
  const namesOf = new Map<string, string[]>();
  for (const n of (names ?? []) as { person_id: string; name: string }[])
    namesOf.set(n.person_id, [...(namesOf.get(n.person_id) || []), n.name]);
  return (
    people
      .map((p) => ({
        ...p,
        who_private: !!p.relationship_fact_id && privateFact.has(p.relationship_fact_id),
        names: namesOf.get(p.id) || [],
      }))
      // someone known only by who they are, when that is private, is not listed
      .filter((p) => p.name?.trim() || !p.who_private)
      .sort(
        (a, b) =>
          (a.matters_rank ?? 99) - (b.matters_rank ?? 99) ||
          personTitle(a).localeCompare(personTitle(b)),
      )
  );
}

/**
 * One person's page as it stands: following a merge to the record kept,
 * with the records merged into it, their names, the facts about them, their
 * Chapters, merges Gremly proposed and the words Gremly wrote. Null when
 * they are not this person's.
 */
export async function fetchPersonPage(personId: string): Promise<PersonPage | null> {
  let id = personId;
  let person: PersonRecord | null = null;
  for (let i = 0; i < 4 && !person; i++) {
    const { data, error } = await supabase.from('life_people').select(RECORD).eq('id', id).limit(1);
    if (error) throw error;
    const p = ((data ?? []) as PersonRecord[])[0];
    if (!p) return null;
    if (p.merged_into) id = p.merged_into;
    else person = p;
  }
  if (!person) return null;
  // who they are, when it came from something private or about health, is not shown
  const whoFact = person.relationship_fact_id
    ? ((
        await supabase
          .from('life_facts')
          .select('id,private,health')
          .eq('id', person.relationship_fact_id)
          .limit(1)
      ).data ?? [])[0]
    : null;
  const who_private = !!whoFact && sensitive(whoFact as { private: boolean; health: boolean });
  const { data: into } = await supabase
    .from('life_people')
    .select('id')
    .eq('merged_into', person.id);
  const ids = [person.id, ...((into ?? []) as { id: string }[]).map((x) => x.id)];
  const [names, ties, links, merges, page] = await Promise.all([
    supabase.from('life_person_names').select('name').in('person_id', ids),
    supabase.from('life_fact_people').select('fact_id').in('person_id', ids).limit(300),
    supabase.from('chapter_people').select('chapter_id').in('person_id', ids),
    supabase
      .from('person_merges')
      .select('id,kept_id,merged_id')
      .eq('status', 'proposed')
      .or(`kept_id.eq.${person.id},merged_id.eq.${person.id}`),
    // the page's words, once its column is there (supabase/migrations/20261020100000_people_page.sql)
    supabase.from('life_people').select('page').eq('id', person.id).limit(1),
  ]);
  const factIds = [...new Set(((ties.data ?? []) as { fact_id: string }[]).map((t) => t.fact_id))];
  const facts = factIds.length
    ? (((
        await supabase
          .from('life_facts_now')
          .select(
            'id,statement,about_date,about_date_end,timing,state,private,health,item_table,item_id',
          )
          .in('id', factIds)
          .in('state', OPEN_STATES)
      ).data ?? []) as PersonFact[])
    : [];
  const proposed = (merges.data ?? []) as { id: string; kept_id: string; merged_id: string }[];
  const otherIds = proposed.map((m) => (m.kept_id === person!.id ? m.merged_id : m.kept_id));
  const others = otherIds.length
    ? (((
        await supabase
          .from('life_people')
          .select('id,name,relationship,relationship_by,relationship_fact_id,merged_into')
          .in('id', otherIds)
      ).data ?? []) as (PersonRecord & { merged_into: string | null })[])
    : [];
  // the same for the one Gremly thinks they are
  const otherFacts = [
    ...new Set(others.map((o) => o.relationship_fact_id).filter(Boolean)),
  ] as string[];
  const privateOther = new Set(
    otherFacts.length
      ? (
          ((await supabase.from('life_facts').select('id,private,health').in('id', otherFacts))
            .data ?? []) as { id: string; private: boolean; health: boolean }[]
        )
          .filter(sensitive)
          .map((f) => f.id)
      : [],
  );
  const other = new Map(
    others
      .filter((o) => !o.merged_into)
      .map((o) => [
        o.id,
        o.relationship_fact_id && privateOther.has(o.relationship_fact_id)
          ? { ...o, relationship: null }
          : o,
      ]),
  );
  return {
    person,
    who_private,
    ids,
    names: [
      ...new Set(
        [person.name, ...((names.data ?? []) as { name: string }[]).map((n) => n.name)].filter(
          Boolean,
        ) as string[],
      ),
    ],
    facts,
    chapterIds: [
      ...new Set(((links.data ?? []) as { chapter_id: string }[]).map((l) => l.chapter_id)),
    ],
    merges: proposed
      .map((m) => {
        const o = other.get(m.kept_id === person!.id ? m.merged_id : m.kept_id);
        return o
          ? {
              id: m.id,
              other: {
                id: o.id,
                name: o.name,
                relationship: o.relationship,
                relationship_by: o.relationship_by,
              },
            }
          : null;
      })
      .filter((m): m is PersonMerge => !!m),
    page: page.error
      ? null
      : ((((page.data ?? []) as { page: PersonPageWords | null }[])[0]?.page ??
          null) as PersonPageWords | null),
  };
}

/** The record a name is, among everyone they keep, or null. */
export async function fetchPersonIdByName(name: string): Promise<string | null> {
  return findByName(await fetchPeople(), name)?.id ?? null;
}

/** Someone on a Chapter, as a chip: by their record when Gremly linked them, by a name otherwise. */
export interface ChipPerson {
  name: string;
  id?: string;
}

/**
 * The people on a Chapter: those the weekly pass linked to it
 * (chapter_people), then any name among who it was with that is not one of
 * them. Pure.
 */
export function chapterChips(
  linked: { id: string; title: string; names: string[] }[],
  withYou: (WithYouItem | null | undefined)[] | null | undefined,
): ChipPerson[] {
  const out: ChipPerson[] = linked.map((p) => ({ name: p.title, id: p.id }));
  const known = new Set(linked.flatMap((p) => [p.title, ...p.names]).map(lower));
  for (const w of withYou || []) {
    const name = String(w?.name || '').trim();
    if (!name || known.has(lower(name))) continue;
    known.add(lower(name));
    out.push({ name });
  }
  return out;
}

/** The people the weekly pass linked to a Chapter, each as the record a merge kept. */
export async function fetchChapterPeople(
  chapterId: string,
): Promise<{ id: string; title: string; names: string[] }[]> {
  const { data: links, error } = await supabase
    .from('chapter_people')
    .select('person_id')
    .eq('chapter_id', chapterId);
  if (error) throw error;
  const ids = [...new Set(((links ?? []) as { person_id: string }[]).map((l) => l.person_id))];
  if (!ids.length) return [];
  const { data: rows } = await supabase
    .from('life_people')
    .select('id,name,relationship,merged_into,hidden_at')
    .in('id', ids);
  const people = (rows ?? []) as (PersonRecord & { merged_into: string | null })[];
  // a record merged away stands for the one it was merged into
  const keptIds = [...new Set(people.map((p) => p.merged_into || p.id))];
  const missing = keptIds.filter((id) => !people.some((p) => p.id === id));
  const kept = missing.length
    ? (((
        await supabase
          .from('life_people')
          .select('id,name,relationship,merged_into,hidden_at')
          .in('id', missing)
      ).data ?? []) as (PersonRecord & { merged_into: string | null })[])
    : [];
  const all = [...people, ...kept].filter((p) => !p.merged_into && !p.hidden_at);
  const { data: names } = await supabase
    .from('life_person_names')
    .select('person_id,name')
    .in(
      'person_id',
      all.map((p) => p.id),
    );
  return all.map((p) => ({
    id: p.id,
    title: personTitle(p),
    names: ((names ?? []) as { person_id: string; name: string }[])
      .filter((n) => n.person_id === p.id)
      .map((n) => n.name),
  }));
}
