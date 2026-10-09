/**
 * One line or a few, written by the person: a name, the words about a
 * World or Chapter, or a memory.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { Btn, Field, SheetButtons, SheetNote, SheetTitle } from './Sheet';

export function TextEdit({
  title,
  note,
  initial,
  placeholder,
  multiline,
  saveLabel = 'Save',
  onSave,
  onCancel,
}: {
  title: string;
  note?: string | null;
  initial: string;
  placeholder?: string;
  multiline?: boolean;
  saveLabel?: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const clean = text.replace(/\s+/g, ' ').trim();
  return (
    <View>
      <SheetTitle>{title}</SheetTitle>
      {note ? <SheetNote>{note}</SheetNote> : <View style={{ height: 8 }} />}
      <Field
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        multiline={multiline}
        autoFocus
        returnKeyType={multiline ? 'default' : 'done'}
        onSubmitEditing={multiline ? undefined : () => clean && onSave(clean)}
        accessibilityLabel={title}
        testID="text-edit-field"
      />
      <SheetButtons>
        <Btn label="Cancel" kind="sec" onPress={onCancel} />
        <Btn
          label={saveLabel}
          onPress={() => onSave(clean)}
          disabled={!clean || clean === initial.replace(/\s+/g, ' ').trim()}
          testID="text-edit-save"
        />
      </SheetButtons>
    </View>
  );
}
