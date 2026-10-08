/**
 * Start something new, by hand: a Chapter (a line, a date if there is one,
 * its World and its Gremly) or a whole new World (a name and its Gremly).
 * Gremly filling this in from the line comes with the box, in stage 2.
 */
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { World } from '../../lib/supabase/types';
import { resolveMascotAsset } from '../../lib/store/mascotRegistry';
import { F, W } from '../../lib/worlds/look';
import { worldGremly, worldName } from '../../lib/worlds/model';
import { Btn, Field, FieldLabel, SheetButtons, SheetNote, SheetTitle } from './Sheet';
import { DayField } from './DayField';
import { GremlyGrid } from './GremlyPick';
import { TextLink } from './parts';

export interface StartChapterInput {
  title: string;
  worldId: string | null;
  startDate: string | null;
  endDate: string | null;
  gremly: string | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

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
  const [what, setWhat] = useState('');
  const [two, setTwo] = useState(false);
  const [one, setOne] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(
    worldId || (worlds.length === 1 ? worlds[0].id : null),
  );
  const [own, setOwn] = useState<string | null>(null);
  const [pickOwn, setPickOwn] = useState(false);
  const [wname, setWname] = useState('');
  const [wgremly, setWgremly] = useState('gardener_gremly');
  const [problem, setProblem] = useState<string | null>(null);

  const placeWorld = worlds.find((w) => w.id === place) || null;
  const wears = own || worldGremly(placeWorld);

  function start() {
    const title = clean(what);
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
    onStartChapter({ title, worldId: place, startDate, endDate, gremly: own });
  }

  if (mode === 'world') {
    const name = clean(wname);
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
            disabled={!name}
            onPress={() => onMakeWorld({ name, gremly: wgremly })}
            testID="start-world-make"
          />
        </SheetButtons>
      </View>
    );
  }

  return (
    <View>
      <SheetTitle>Start something new</SheetTitle>
      <SheetNote>A trip, a goal, a project. Say what it is in a line.</SheetNote>
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
      {two ? (
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
            label="When, if there is a date"
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
      )}

      <FieldLabel>World</FieldLabel>
      {worlds.length ? (
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
        </View>
      ) : (
        <SheetNote>You have no Worlds yet. It can go in one later.</SheetNote>
      )}

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

      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      <SheetButtons>
        <Btn label="Start it" onPress={start} disabled={!clean(what)} testID="start-go" />
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

const styles = StyleSheet.create({
  link: { marginTop: 12, marginLeft: 4 },
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
