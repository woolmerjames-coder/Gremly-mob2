/**
 * When is it? One date by default, with an end date one tap away.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { F, W } from '../../lib/worlds/look';
import { dayOf } from '../../lib/worlds/model';
import { Btn, SheetButtons, SheetNote, SheetTitle } from './Sheet';
import { DayField } from './DayField';
import { TextLink } from './parts';

export interface DatesChoice {
  startDate: string | null;
  endDate: string | null;
}

export function DatesPick({
  startDate,
  endDate,
  today,
  onSave,
}: {
  startDate: string | null;
  endDate: string | null;
  today: string;
  onSave: (d: DatesChoice) => void;
}) {
  const s0 = dayOf(startDate);
  const e0 = dayOf(endDate);
  const span0 = !!s0 && !!e0 && s0 !== e0;
  // A Chapter with only a start keeps it as a start; one with an end keeps it as an end.
  const oneIsStart = !!s0 && !e0;
  const [two, setTwo] = useState(span0);
  const [from, setFrom] = useState<string | null>(s0 || e0);
  const [to, setTo] = useState<string | null>(span0 ? e0 : null);
  const [one, setOne] = useState<string | null>(e0 || s0);
  const [problem, setProblem] = useState<string | null>(null);

  function save() {
    if (two) {
      if (!from || !to) {
        setProblem('Pick both days, or tap "It is just one date".');
        return;
      }
      if (to < from) {
        setProblem('The end comes before the start. Pick an end on or after it.');
        return;
      }
      onSave({ startDate: from, endDate: to });
      return;
    }
    if (!one) {
      setProblem('Pick a day, or tap "No date".');
      return;
    }
    onSave(oneIsStart ? { startDate: one, endDate: null } : { startDate: null, endDate: one });
  }

  return (
    <View>
      <SheetTitle>When is it?</SheetTitle>
      <SheetNote>
        {two
          ? 'Days to go, and anything due before it, follow these dates.'
          : 'Days to go, and anything due before it, follow this date.'}
      </SheetNote>
      {two ? (
        <>
          <DayField
            label="From"
            value={from}
            today={today}
            onChange={(d) => {
              setFrom(d);
              setProblem(null);
            }}
            testID="dates-from"
          />
          <DayField
            label="To"
            value={to}
            today={from || today}
            onChange={(d) => {
              setTo(d);
              setProblem(null);
            }}
            testID="dates-to"
          />
          <TextLink
            label="It is just one date"
            onPress={() => {
              setTwo(false);
              setOne(from || to);
              setProblem(null);
            }}
            style={styles.link}
          />
        </>
      ) : (
        <>
          <DayField
            label="Date"
            value={one}
            today={today}
            onChange={(d) => {
              setOne(d);
              setProblem(null);
            }}
            testID="dates-one"
          />
          <TextLink
            label="Add an end date"
            onPress={() => {
              setTwo(true);
              setFrom(one);
              setTo(null);
              setProblem(null);
            }}
            style={styles.link}
            testID="dates-add-end"
          />
        </>
      )}
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      <SheetButtons>
        <Btn
          label="No date"
          kind="sec"
          onPress={() => onSave({ startDate: null, endDate: null })}
          testID="dates-clear"
        />
        <Btn label="Save" onPress={save} testID="dates-save" />
      </SheetButtons>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { marginTop: 12, marginLeft: 4 },
  problem: {
    fontFamily: F.body,
    fontSize: 14,
    lineHeight: 20,
    color: W.warn,
    marginTop: 10,
    marginHorizontal: 4,
  },
});
