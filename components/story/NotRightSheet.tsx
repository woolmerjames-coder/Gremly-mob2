/**
 * "Not right?": the person marks something Gremly wrote and says what's up
 * with it. The choice and their words go to the context pipeline, which fixes
 * it everywhere (brief, chat, story, Worlds). Opened from the Not right?
 * button at the bottom of screens Gremly writes prose on.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Check, PencilLine } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { sendNotRight, type NotRightKind } from '../../lib/story/storyApi';

const C = lightTokens.colors;

const KINDS: {
  id: NotRightKind;
  label: string;
  hint: string;
  doneTitle: string;
  doneLine: string;
}[] = [
  {
    id: 'wrong',
    label: 'It’s wrong',
    hint: 'Gremly drops it and won’t say it again.',
    doneTitle: 'Fixed everywhere',
    doneLine: 'Your brief, chat, your story and Worlds will have the right version in a moment.',
  },
  {
    id: 'changed',
    label: 'It’s changed',
    hint: 'The old plan stays in your history as what was planned.',
    doneTitle: 'Updated everywhere',
    doneLine: 'The new version is what Gremly knows now. The old one is kept as history.',
  },
  {
    id: 'done',
    label: 'It’s done',
    hint: 'Marked as happened, so it can count in your story.',
    doneTitle: 'Marked as done',
    doneLine: 'It can show up in your story now, and Gremly won’t treat it as ahead.',
  },
  {
    id: 'private',
    label: 'Keep it private',
    hint: 'Off notifications, headlines and cards. Still yours where you open things.',
    doneTitle: 'Kept private',
    doneLine:
      'It’s off notifications, headlines and cards. You’ll still see it in your story, and in chat when you bring it up.',
  },
];

export interface NotRightTarget {
  /** The words Gremly wrote that the person is pointing at. Empty for a whole screen. */
  text: string;
  /** story, world, chapter, chat, brief */
  kind: string;
  id?: string | null;
}

interface Props {
  visible: boolean;
  target: NotRightTarget | null;
  onClose: () => void;
}

export function NotRightSheet({ visible, target, onClose }: Props) {
  const [kind, setKind] = useState<NotRightKind>('wrong');
  const [said, setSaid] = useState('');
  const [step, setStep] = useState<'how' | 'sending' | 'done' | 'failed'>('how');

  useEffect(() => {
    if (visible) {
      setKind('wrong');
      setSaid('');
      setStep('how');
    }
  }, [visible]);

  const active = KINDS.find((k) => k.id === kind) ?? KINDS[0];
  // Without a marked line, their own words are what tells Gremly what is wrong.
  const needsWords = !target?.text;
  const canSend = !needsWords || said.trim().length > 2;

  async function send() {
    if (!target || !canSend) return;
    setStep('sending');
    const ok = await sendNotRight({
      targetText: target.text || said.trim(),
      targetKind: target.kind,
      targetId: target.id ?? null,
      kind,
      said,
    });
    setStep(ok ? 'done' : 'failed');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {step === 'done' ? (
            <View style={styles.doneBox}>
              <View style={styles.doneIcon}>
                <Check size={26} color={C.mossGreen} strokeWidth={2.4} />
              </View>
              <Text style={styles.title}>{active.doneTitle}</Text>
              <Text style={styles.doneLine}>{active.doneLine}</Text>
              <Pressable onPress={onClose} style={styles.secondaryBtn} accessibilityRole="button">
                <Text style={styles.secondaryBtnText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.title}>What’s not right?</Text>
              {target?.text ? (
                <View style={styles.quote}>
                  <Text style={styles.quoteText} numberOfLines={4}>
                    “{target.text}”
                  </Text>
                </View>
              ) : null}
              <View style={styles.kinds}>
                {KINDS.map((k) => {
                  const on = k.id === kind;
                  return (
                    <Pressable
                      key={k.id}
                      onPress={() => setKind(k.id)}
                      style={[styles.kind, on && styles.kindOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.kindText, on && styles.kindTextOn]}>{k.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.hint}>{active.hint}</Text>
              <Text style={styles.label}>
                {needsWords ? 'WHAT’S NOT RIGHT?' : 'WHAT’S RIGHT? (OPTIONAL)'}
              </Text>
              <TextInput
                value={said}
                onChangeText={setSaid}
                placeholder="In your own words"
                placeholderTextColor="rgba(26,58,40,0.45)"
                multiline
                style={styles.input}
                accessibilityLabel={needsWords ? 'What is not right' : 'What is right'}
              />
              {step === 'failed' ? (
                <Text style={styles.failed}>That didn’t send. Try again in a moment.</Text>
              ) : null}
              <Pressable
                onPress={send}
                disabled={!canSend || step === 'sending'}
                style={[styles.primaryBtn, (!canSend || step === 'sending') && { opacity: 0.5 }]}
                accessibilityRole="button"
              >
                {step === 'sending' ? (
                  <ActivityIndicator color={C.linenCream} />
                ) : (
                  <Text style={styles.primaryBtnText}>Fix it everywhere</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The Not right? button at the bottom of screens Gremly writes prose on. */
export function NotRightLink({ onPress, note }: { onPress: () => void; note?: string }) {
  return (
    <View style={styles.linkWrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}
      >
        <PencilLine size={15} color="#4A4E7A" />
        <Text style={styles.linkText}>Not right?</Text>
      </Pressable>
      {note ? <Text style={styles.linkNote}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,51,40,0.38)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.linenCream,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
    gap: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D8D2C6',
    marginBottom: 4,
  },
  title: { fontFamily: 'Fraunces-SemiBold', fontSize: 22, lineHeight: 27, color: C.worldsInk },
  quote: {
    backgroundColor: '#EFEBE2',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quoteText: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, color: '#33463C' },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.18)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  kindOn: { borderWidth: 1.5, borderColor: C.mossGreen, backgroundColor: '#EAF2E8' },
  kindText: { fontFamily: 'Inter-Medium', fontSize: 14, color: '#33463C' },
  kindTextOn: { color: C.worldsInk },
  hint: {
    fontFamily: 'Inter-Regular',
    fontSize: 12.5,
    lineHeight: 18,
    color: '#4D5A52',
    marginTop: -4,
  },
  label: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 11, letterSpacing: 1.2, color: '#5C665F' },
  input: {
    minHeight: 84,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.18)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: C.worldsInk,
    textAlignVertical: 'top',
    marginTop: -6,
  },
  failed: { fontFamily: 'Inter-Regular', fontSize: 13, color: C.danger },
  primaryBtn: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: C.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '700',
    color: C.linenCream,
  },
  secondaryBtn: {
    alignSelf: 'stretch',
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.22)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '700',
    color: C.mossGreen,
  },
  doneBox: { alignItems: 'center', gap: 10, paddingTop: 6 },
  doneIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EAF2E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLine: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 21,
    color: '#4D5A52',
    textAlign: 'center',
    maxWidth: 300,
  },
  linkWrap: { alignItems: 'center', paddingVertical: 12, gap: 2 },
  link: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(74,78,122,0.30)',
    backgroundColor: '#ECEEFA',
  },
  linkText: { fontFamily: 'Inter-Medium', fontSize: 14, fontWeight: '600', color: '#4A4E7A' },
  linkNote: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: '#4D5A52' },
});
