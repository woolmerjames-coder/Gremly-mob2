/**
 * A field that holds one day, opening the phone's own date picker: inline
 * with Done and Cancel on iPhone, the system dialog on Android.
 */
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { Calendar } from 'lucide-react-native';
import { parseLocalYMD } from '../../lib/utils/dates';
import { F, W } from '../../lib/worlds/look';
import { dayShort } from '../../lib/worlds/model';
import { FieldLabel } from './Sheet';

export function DayField({
  label,
  value,
  onChange,
  today,
  placeholder = 'Pick a date',
  testID,
}: {
  label: string;
  value: string | null;
  onChange: (day: string) => void;
  today: string;
  placeholder?: string;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState<Date | null>(null);
  const shown = parseLocalYMD(value || today);

  function onPick(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') {
      setOpen(false);
      if (event.type === 'set' && date) onChange(format(date, 'yyyy-MM-dd'));
      return;
    }
    if (date) setStaged(date);
  }

  function done() {
    // Done takes the day the wheel shows, moved or not.
    onChange(format(staged || shown, 'yyyy-MM-dd'));
    setStaged(null);
    setOpen(false);
  }

  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        style={[styles.field, open && { borderColor: W.moss }]}
        onPress={() => {
          setStaged(null);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? dayShort(value) : 'none yet'}`}
        testID={testID}
      >
        <Text style={[styles.value, !value && { color: '#9a9a9a' }]}>
          {value ? dayShort(value) : placeholder}
        </Text>
        <Calendar size={17} color={W.faint} />
      </Pressable>
      {open && Platform.OS === 'ios' ? (
        <View style={styles.picker}>
          <View style={styles.pickerTop}>
            <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Pressable onPress={done} hitSlop={8} accessibilityRole="button">
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={staged || shown}
            mode="date"
            display="spinner"
            onChange={onPick}
            textColor={W.ink}
          />
        </View>
      ) : null}
      {open && Platform.OS === 'android' ? (
        <DateTimePicker value={shown} mode="date" display="default" onChange={onPick} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: W.field,
    backgroundColor: W.white,
    paddingHorizontal: 14,
    marginHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { fontFamily: F.body, fontSize: 16, color: W.ink },
  picker: {
    marginTop: 8,
    marginHorizontal: 4,
    backgroundColor: W.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: W.line,
    overflow: 'hidden',
  },
  pickerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  cancel: { fontFamily: F.body, fontSize: 15, color: W.muted },
  done: { fontFamily: F.bodySemi, fontSize: 15, color: W.moss },
});
