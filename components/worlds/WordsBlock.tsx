/**
 * The words under a World's or a Chapter's name, or a closed Chapter's
 * memory, with who wrote them. Tap to rewrite. When the person wrote their
 * own, what Gremly would say sits underneath, to use or leave.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Pencil } from 'lucide-react-native';
import { F, W } from '../../lib/worlds/look';
import { Diamond } from './parts';

export function WordsBlock({
  text,
  yours,
  byLabel,
  emptyText,
  offered,
  onRewrite,
  onUseOffered,
  onKeepMine,
  testID,
}: {
  text: string | null;
  /** The person wrote these words */
  yours: boolean;
  /** Who wrote it, when Gremly did: Gremly, or The memory, by Gremly */
  byLabel: string;
  /** What shows when there are no words yet */
  emptyText: string;
  /** Gremly's words, offered under the person's own */
  offered?: string | null;
  onRewrite: () => void;
  onUseOffered?: () => void;
  onKeepMine?: () => void;
  testID?: string;
}) {
  const has = !!text?.trim();
  return (
    <View style={styles.words} testID={testID}>
      <Diamond style={{ marginTop: 8 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Pressable
          onPress={onRewrite}
          style={({ pressed }) => [
            styles.tap,
            pressed && { backgroundColor: 'rgba(46,85,64,0.06)' },
          ]}
          accessibilityRole="button"
          accessibilityLabel={has ? `${text}. Tap to rewrite` : emptyText}
        >
          <Text style={has ? styles.text : styles.empty}>{has ? text : emptyText}</Text>
        </Pressable>
        {has ? (
          <View style={styles.meta}>
            {yours ? (
              <View style={styles.yours}>
                <Pencil size={12} color={W.pearInk} />
                <Text style={styles.yoursText}>Your words</Text>
              </View>
            ) : (
              <Text style={styles.who}>{byLabel}</Text>
            )}
            <View style={styles.tapnote}>
              <Pencil size={12} color={W.faint} />
              <Text style={styles.tapnoteText}>Tap to rewrite</Text>
            </View>
          </View>
        ) : null}
        {yours && offered?.trim() ? (
          <View style={styles.alt}>
            <Text style={styles.altText}>Gremly would say: {offered}</Text>
            <View style={styles.altActs}>
              {onUseOffered ? (
                <Pressable onPress={onUseOffered} accessibilityRole="button" hitSlop={6}>
                  <Text style={styles.altBtn}>Use his</Text>
                </Pressable>
              ) : null}
              {onKeepMine ? (
                <Pressable onPress={onKeepMine} accessibilityRole="button" hitSlop={6}>
                  <Text style={styles.altBtn}>Keep mine</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  words: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tap: { borderRadius: 8, marginHorizontal: -4, paddingHorizontal: 4 },
  text: { fontFamily: F.body, fontSize: 16, lineHeight: 24, letterSpacing: -0.2, color: W.ink },
  empty: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: W.faint },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 6,
    minHeight: 24,
  },
  who: {
    fontFamily: F.bodySemi,
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(46,85,64,0.55)',
  },
  yours: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: W.pearWash,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  yoursText: { fontFamily: F.bodySemi, fontSize: 13, color: W.pearInk },
  tapnote: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tapnoteText: { fontFamily: F.body, fontSize: 13, color: W.faint },
  alt: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: W.line2,
  },
  altText: { fontFamily: F.body, fontSize: 13.5, lineHeight: 20, color: W.muted },
  altActs: { flexDirection: 'row', gap: 16, marginTop: 4 },
  altBtn: {
    fontFamily: F.bodySemi,
    fontSize: 13.5,
    color: W.moss,
    textDecorationLine: 'underline',
  },
});
