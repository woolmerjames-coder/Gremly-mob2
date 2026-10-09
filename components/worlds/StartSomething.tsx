/**
 * Start something new, by hand: a Chapter or a whole new World (a name and
 * its Gremly). For a Chapter they say what it is in a line, with a date if
 * there is one; Gremly fills in the rest (stage 3, lib/worlds/guess.ts): its
 * name, the World it belongs in or a new one when none fits, the days, a
 * Gremly to wear and which of their things already belong. Every field shows
 * to change before it is started. With no guess in time, they fill it in.
 */
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { World } from '../../lib/supabase/types';
import { resolveMascotAsset } from '../../lib/store/mascotRegistry';
import { F, W } from '../../lib/worlds/look';
import { worldGremly, worldName } from '../../lib/worlds/model';
import type { FiledItem } from '../../lib/worlds/actions';
import { guessChapter, type ChapterGuess } from '../../lib/worlds/guess';
import { Btn, Field, FieldLabel, SheetButtons, SheetNote, SheetTitle } from './Sheet';
import { DayField } from './DayField';
import { GremlyGrid } from './GremlyPick';
import { Diamond, TextLink } from './parts';
import { ItemRow, useItemRows } from './ItemRows';

export interface StartChapterInput {
  title: string;
  worldId: string | null;
  startDate: string | null;
  endDate: string | null;
  gremly: string | null;
  /** Their things that already belong in it */
  items: FiledItem[];
  /** None of their Worlds fits: this one is made first, and it goes in it */
  newWorld: { name: string; gremly: string } | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const NEW = 'new';

export function StartSomething({
  worlds,
  worldId,
  today,
  asWorld,
  onStartChapter,
  onMakeWorld,
}: {
  worlds: World[];
  /** The World it starts in, when opened from a World */
  worldId?: string | null;
  today: string;
  /** Open straight on a new World */
  asWorld?: boolean;
  onStartChapter: (input: StartChapterInput) => void;
  onMakeWorld: (input: { name: string; gremly: string }) => void;
}) {
  const [mode, setMode] = useState<'chapter' | 'world'>(asWorld ? 'world' : 'chapter');
  const [step, setStep] = useState<'line' | 'check'>('line');
  const [guessing, setGuessing] = useState(false);
  const [guessed, setGuessed] = useState<ChapterGuess | null>(null);
  const [what, setWhat] = useState('');
  const [name, setName] = useState('');
  const [two, setTwo] = useState(false);
  const [one, setOne] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(
    worldId || (worlds.length === 1 ? worlds[0].id : null),
  );
  const [own, setOwn] = useState<string | null>(null);
  const [pickOwn, setPickOwn] = useState(false);
  const [items, setItems] = useState<FiledItem[]>([]);
  const [left, setLeft] = useState<Set<string>>(() => new Set());
  const [wname, setWname] = useState('');
  const [wgremly, setWgremly] = useState('gardener_gremly');
  const [problem, setProblem] = useState<string | null>(null);
  const rows = useItemRows(items);

  const newWorld = guessed?.newWorld ?? null;
  const placeWorld = worlds.find((w) => w.id === place) || null;
  const wears = own || (place === NEW && newWorld ? newWorld.gremly : worldGremly(placeWorld));
  const worldIds = useMemo(() => worlds.map((w) => w.id), [worlds]);

  /** Next: Gremly fills in the rest from the line; a date they gave wins. */
  async function next() {
    const line = clean(what);
    if (!line) {
      setProblem('Give it a name first.');
      return;
    }
    setGuessing(true);
    const g = await guessChapter(line, today, worldIds);
    setGuessing(false);
    setGuessed(g);
    setName(g?.title || line);
    if (one) {
      setTwo(false);
    } else if (g?.startDate && g?.endDate && g.startDate !== g.endDate) {
      setTwo(true);
      setFrom(g.startDate);
      setTo(g.endDate);
    } else {
      setOne(g?.endDate || g?.startDate || null);
    }
    if (!worldId && g) setPlace(g.worldId || (g.newWorld ? NEW : place));
    if (g?.gremly) setOwn(g.gremly);
    setItems(g?.items ?? []);
    setLeft(new Set());
    setProblem(null);
    setStep('check');
  }

  function start() {
    const title = clean(name);
    if (!title) {
      setProblem('Give it a name first.');
      return;
    }
    let startDate: string | null = null;
    let endDate: string | null = null;
    if (two) {
      if (from && to && to < from) {
        setProblem('The end comes before the start. Pick an end on or after it.');
        return;
      }
      startDate = from;
      endDate = to;
    } else {
      endDate = one;
    }
    const isNew = place === NEW && !!newWorld;
    onStartChapter({
      title,
      worldId: isNew ? null : place,
      startDate,
      endDate,
      gremly: own,
      items: rows.filter((r) => !left.has(r.id)).map((r) => ({ type: r.type, id: r.id })),
      newWorld: isNew ? newWorld : null,
    });
  }

  if (mode === 'world') {
    const wn = clean(wname);
    return (
      <View>
        <SheetTitle>A new World</SheetTitle>
        <SheetNote>
          A World is a big part of your life that lasts, like work or home. Most people have five or
          six.
        </SheetNote>
        <FieldLabel>Name</FieldLabel>
        <Field
          value={wname}
          onChangeText={setWname}
          placeholder="Money, Garden, Studying"
          autoFocus
          accessibilityLabel="The World's name"
          testID="start-world-name"
        />
        <FieldLabel>Pick its Gremly</FieldLabel>
        <GremlyGrid current={wgremly} onPick={setWgremly} />
        <SheetButtons>
          {!asWorld ? <Btn label="Back" kind="sec" onPress={() => setMode('chapter')} /> : null}
          <Btn
            label="Make it"
            disabled={!wn}
            onPress={() => onMakeWorld({ name: wn, gremly: wgremly })}
            testID="start-world-make"
          />
        </SheetButtons>
      </View>
    );
  }

  const dates = two ? (
    <>
      <DayField label="From" value={from} today={today} onChange={setFrom} />
      <DayField label="To" value={to} today={from || today} onChange={setTo} />
      <TextLink
        label="It is just one date"
        onPress={() => {
          setTwo(false);
          setOne(to || from);
        }}
        style={styles.link}
      />
    </>
  ) : (
    <>
      <DayField
        label={step === 'line' ? 'When, if there is a date' : 'Date, if there is one'}
        value={one}
        today={today}
        onChange={setOne}
        placeholder="No date"
        testID="start-when"
      />
      <TextLink
        label="Add an end date"
        onPress={() => {
          setTwo(true);
          setFrom(one);
          setTo(null);
        }}
        style={styles.link}
      />
    </>
  );

  if (step === 'line') {
    return (
      <View>
        <SheetTitle>Start something new</SheetTitle>
        <SheetNote>Say what it is in a line. Gremly fills in the rest and you check it.</SheetNote>
        <FieldLabel>What is it?</FieldLabel>
        <Field
          value={what}
          onChangeText={(t) => {
            setWhat(t);
            setProblem(null);
          }}
          placeholder="A trip, a goal, a house move"
          autoFocus
          accessibilityLabel="What is it?"
          testID="start-what"
        />
        {dates}
        {problem ? <Text style={styles.problem}>{problem}</Text> : null}
        <SheetButtons>
          <Btn
            label={guessing ? 'Gremly is filling it in' : 'Next'}
            onPress={() => void next()}
            disabled={!clean(what) || guessing}
            testID="start-next"
          />
        </SheetButtons>
        <TextLink
          label="It is a whole new World"
          onPress={() => setMode('world')}
          style={[styles.link, { marginTop: 14 }]}
          testID="start-as-world"
        />
      </View>
    );
  }

  return (
    <View>
      <SheetTitle>Does this look right?</SheetTitle>
      <View style={styles.filled}>
        <Diamond size={9} />
        <Text style={styles.filledText}>
          {guessed
            ? 'Gremly filled this in from your line. Change anything before you start it.'
            : 'Fill in the rest, then start it.'}
        </Text>
      </View>
      <FieldLabel>Name</FieldLabel>
      <Field
        value={name}
        onChangeText={(t) => {
          setName(t);
          setProblem(null);
        }}
        accessibilityLabel="Its name"
        testID="start-name"
      />

      <FieldLabel>World</FieldLabel>
      {worlds.length || newWorld ? (
        <View style={styles.opts}>
          {worlds.map((w) => {
            const on = w.id === place;
            return (
              <Pressable
                key={w.id}
                onPress={() => setPlace(on ? null : w.id)}
                style={[styles.opt, on && styles.optOn]}
                accessibilityRole="button"
                accessibilityLabel={worldName(w)}
                accessibilityState={{ selected: on }}
                testID={`start-world-${w.id}`}
              >
                <Image
                  source={resolveMascotAsset(worldGremly(w))}
                  style={styles.optImg}
                  resizeMode="contain"
                />
                <Text style={[styles.optText, on && { color: W.forest }]}>{worldName(w)}</Text>
              </Pressable>
            );
          })}
          {newWorld ? (
            <Pressable
              onPress={() => setPlace(place === NEW ? null : NEW)}
              style={[styles.opt, place === NEW && styles.optOn]}
              accessibilityRole="button"
              accessibilityLabel={`A new World: ${newWorld.name}`}
              accessibilityState={{ selected: place === NEW }}
              testID="start-world-new"
            >
              <Image
                source={resolveMascotAsset(newWorld.gremly)}
                style={styles.optImg}
                resizeMode="contain"
              />
              <Text style={[styles.optText, place === NEW && { color: W.forest }]}>
                New: {newWorld.name}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <SheetNote>You have no Worlds yet. It can go in one later.</SheetNote>
      )}
      {place === NEW && newWorld ? (
        <SheetNote>None of your Worlds fits, so Gremly will make this one for it.</SheetNote>
      ) : null}

      {dates}

      <FieldLabel>Its Gremly</FieldLabel>
      <Pressable
        onPress={() => setPickOwn((v) => !v)}
        style={styles.gRow}
        accessibilityRole="button"
        accessibilityLabel={own ? 'It wears its own Gremly. Change it' : 'Give it its own Gremly'}
      >
        <Image source={resolveMascotAsset(wears)} style={styles.gImg} resizeMode="contain" />
        <Text style={styles.gText}>
          {own
            ? 'Its own Gremly'
            : place === NEW && newWorld
              ? `Wears ${newWorld.name}’s Gremly`
              : placeWorld
                ? `Wears ${worldName(placeWorld)}’s Gremly`
                : 'The plain Gremly'}
        </Text>
        <Text style={styles.gChange}>{pickOwn ? 'Done' : 'Change'}</Text>
      </Pressable>
      {pickOwn ? (
        <View style={{ marginTop: 8 }}>
          <GremlyGrid
            current={own}
            onPick={(slug) => {
              setOwn(slug === own ? null : slug);
              setPickOwn(false);
            }}
          />
        </View>
      ) : null}

      <FieldLabel>Already yours, and belongs here</FieldLabel>
      {rows.length ? (
        <View style={styles.items}>
          {rows.map((r) => (
            <ItemRow
              key={r.id}
              row={r}
              on={!left.has(r.id)}
              onToggle={() =>
                setLeft((s) => {
                  const n = new Set(s);
                  if (n.has(r.id)) n.delete(r.id);
                  else n.add(r.id);
                  return n;
                })
              }
            />
          ))}
        </View>
      ) : (
        <SheetNote>Nothing yet. New drops about it will land here.</SheetNote>
      )}

      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      <SheetButtons>
        <Btn label="Back" kind="sec" onPress={() => setStep('line')} testID="start-back" />
        <Btn label="Start it" onPress={start} disabled={!clean(name)} testID="start-go" />
      </SheetButtons>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { marginTop: 12, marginLeft: 4 },
  filled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: W.periWash,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 4,
    marginTop: 4,
  },
  filledText: { flex: 1, fontFamily: F.body, fontSize: 14.5, lineHeight: 20, color: W.periInk },
  items: { gap: 8, marginHorizontal: 4 },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4 },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 38,
    paddingLeft: 7,
    paddingRight: 14,
    borderRadius: 19,
    backgroundColor: W.white,
    borderWidth: 1.5,
    borderColor: W.line2,
  },
  optOn: { backgroundColor: W.sage, borderColor: W.sage },
  optImg: { width: 24, height: 24 },
  optText: { fontFamily: F.bodySemi, fontSize: 14, color: W.off },
  gRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: W.white,
    borderWidth: 1,
    borderColor: W.line,
  },
  gImg: { width: 36, height: 36 },
  gText: { flex: 1, fontFamily: F.bodyMedium, fontSize: 15, color: W.ink },
  gChange: { fontFamily: F.bodySemi, fontSize: 14, color: W.moss },
  problem: {
    fontFamily: F.body,
    fontSize: 14,
    lineHeight: 20,
    color: W.warn,
    marginTop: 10,
    marginHorizontal: 4,
  },
});
