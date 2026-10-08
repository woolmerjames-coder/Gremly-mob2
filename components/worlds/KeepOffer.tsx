/**
 * The Save button under a reply worth keeping (Worlds rebuild, stage 2,
 * decision 3; lib/worlds/keep.ts). It names the Chapter or World the reply
 * belongs in; one tap keeps it there as a note, or as a list with tick boxes,
 * and the arrow beside it picks somewhere else. Once saved it says where,
 * with Undo while the chat is open, and Open it.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Check, ChevronDown, ListChecks, Plus } from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { resolveMascotAsset } from '../../lib/store/mascotRegistry';
import { getDateService } from '../../lib/date/DateService';
import type { KeepOfferMeta } from '../../lib/brief/types';
import { canUndoKept, placeNow, saveKept, undoKept, type KeepPlace } from '../../lib/worlds/keep';
import {
  chapterGremly,
  openChapters,
  shownWorlds,
  worldGremly,
  worldName,
} from '../../lib/worlds/model';
import { F, SHADOW, W } from '../../lib/worlds/look';
import { MenuRow, Sheet, SheetNote, SheetTitle } from './Sheet';
import { plural } from './parts';

const SHOWN_ROWS = 3;

export function KeepOffer({
  messageId,
  meta,
  onSaved,
  onUndone,
  onOpen,
}: {
  messageId: string;
  meta: KeepOfferMeta;
  /** Keep on the message where it went, so the chat shows it saved next time */
  onSaved: (saved: { id: string; place: KeepPlace }) => Promise<void> | void;
  onUndone: () => Promise<void> | void;
  /** Open the note it made */
  onOpen: (noteId: string, title: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [undoable, setUndoable] = useState(() => canUndoKept(messageId));
  const target = placeNow(meta.place);
  const what = meta.kind === 'list' ? 'List' : 'Note';

  const save = async (place: KeepPlace | null) => {
    if (busy) return;
    if (!place) {
      setPicking(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const note = await saveKept(messageId, meta, place);
      setUndoable(true);
      await onSaved({ id: note.id, place });
    } catch (err) {
      console.warn('[KeepOffer] could not save:', err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await undoKept(messageId);
      setUndoable(false);
      await onUndone();
    } catch (err) {
      console.warn('[KeepOffer] could not undo:', err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      {meta.kind === 'list' ? <ListPreview title={meta.title} rows={meta.lines} /> : null}
      {meta.saved ? (
        <>
          <View style={styles.saved} testID="keep-saved">
            <View style={styles.tick}>
              <Check size={15} color={W.linen} strokeWidth={3} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.savedTo} numberOfLines={1}>
                Saved to {meta.saved.place.name || 'your Worlds'}
              </Text>
              <Text style={styles.savedWhat} numberOfLines={1}>
                {what}: {meta.title}
              </Text>
            </View>
            {undoable ? (
              <Pressable
                onPress={() => void undo()}
                disabled={busy}
                style={({ pressed }) => [styles.undo, (pressed || busy) && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`Undo saving ${meta.title}`}
                testID="keep-undo"
              >
                <Text style={styles.undoText}>Undo</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => onOpen(meta.saved!.id, meta.title)}
            hitSlop={8}
            style={styles.open}
            accessibilityRole="button"
            accessibilityLabel={`Open ${meta.title}`}
            testID="keep-open"
          >
            <Text style={styles.openText}>Open it</Text>
            <ArrowRight size={15} color={W.moss} />
          </Pressable>
        </>
      ) : (
        <View style={styles.acts}>
          <Pressable
            onPress={() => void save(target)}
            disabled={busy}
            style={({ pressed }) => [styles.save, (pressed || busy) && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={
              target ? `Save ${meta.title} to ${target.name}` : `Save ${meta.title}`
            }
            testID="keep-save"
          >
            <Plus size={16} color={W.linen} strokeWidth={2.6} />
            <Text style={styles.saveText} numberOfLines={1}>
              {target ? `Save to ${target.name}` : 'Save it'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPicking(true)}
            disabled={busy}
            style={({ pressed }) => [styles.else, pressed && { backgroundColor: W.sageWash }]}
            accessibilityRole="button"
            accessibilityLabel="Save it somewhere else"
            testID="keep-else"
          >
            <ChevronDown size={18} color={W.moss} />
          </Pressable>
        </View>
      )}
      {failed ? (
        <Text style={styles.failed} accessibilityLiveRegion="polite">
          That did not go through. Try again in a moment.
        </Text>
      ) : null}
      <SaveWhere
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(place) => {
          setPicking(false);
          void save(place);
        }}
      />
    </View>
  );
}

/** A list's first few rows, with its tick boxes, above the button. */
function ListPreview({ title, rows }: { title: string; rows: string[] }) {
  const more = rows.length - SHOWN_ROWS;
  return (
    <View style={styles.list} testID="keep-list">
      <View style={styles.listHead}>
        <ListChecks size={18} color={W.moss} />
        <Text style={styles.listTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.listCount}>{plural(rows.length, 'item', 'items')}</Text>
      </View>
      {rows.slice(0, SHOWN_ROWS).map((r, i) => (
        <View key={i} style={styles.listRow}>
          <View style={styles.box} />
          <Text style={styles.listText}>{r}</Text>
        </View>
      ))}
      {more > 0 ? <Text style={styles.listMore}>and {more} more</Text> : null}
    </View>
  );
}

/** Somewhere else: a Chapter in motion, or straight into a World. */
function SaveWhere({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (place: KeepPlace) => void;
}) {
  const worlds = useGremlyStore((s) => s.worlds);
  const chapters = useGremlyStore((s) => s.chapters);
  const { open, shown, byId } = useMemo(() => {
    const today = getDateService().ritualDay();
    return {
      open: openChapters(chapters ?? [], today),
      shown: shownWorlds(worlds ?? []),
      byId: new Map((worlds ?? []).map((w) => [w.id, w])),
    };
  }, [worlds, chapters]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      label="Save it where"
      testID="keep-where"
      snack={false}
    >
      <SheetTitle>Save it where?</SheetTitle>
      <SheetNote>A Chapter in motion, or straight into a World.</SheetNote>
      {open.map((c) => {
        const w = c.primary_world_id ? byId.get(c.primary_world_id) : undefined;
        return (
          <MenuRow
            key={c.id}
            image={resolveMascotAsset(chapterGremly(c, w))}
            title={c.title}
            sub={w ? `Chapter in ${worldName(w)}` : 'Chapter'}
            onPress={() => onPick({ type: 'chapter', id: c.id, name: c.title })}
            testID={`keep-to-${c.id}`}
          />
        );
      })}
      {shown.map((w) => (
        <MenuRow
          key={w.id}
          image={resolveMascotAsset(worldGremly(w))}
          title={worldName(w)}
          sub="World"
          onPress={() => onPick({ type: 'world', id: w.id, name: worldName(w) })}
          testID={`keep-to-${w.id}`}
        />
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: W.white,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    ...SHADOW,
  },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  listTitle: { flex: 1, fontFamily: F.ui, fontSize: 17, color: W.forest },
  listCount: { fontFamily: F.body, fontSize: 13.5, color: W.muted },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: W.box,
  },
  listText: { flex: 1, fontFamily: F.body, fontSize: 15.5, lineHeight: 20, color: W.ink },
  listMore: { fontFamily: F.body, fontSize: 13.5, color: W.muted, marginLeft: 32, marginTop: 2 },
  acts: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  save: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: W.moss,
    borderRadius: 999,
    paddingHorizontal: 18,
    minHeight: 46,
    ...SHADOW,
  },
  saveText: { flexShrink: 1, fontFamily: F.ui, fontSize: 15.5, color: W.linen },
  else: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: W.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: W.sageWash,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: W.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedTo: { fontFamily: F.ui, fontSize: 15, color: W.forest },
  savedWhat: { fontFamily: F.body, fontSize: 13.5, color: W.muted, marginTop: 1 },
  undo: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: W.line2,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
  },
  undoText: { fontFamily: F.uiSemi, fontSize: 14, color: W.moss },
  open: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  openText: {
    fontFamily: F.uiSemi,
    fontSize: 14.5,
    color: W.moss,
    textDecorationLine: 'underline',
  },
  failed: { fontFamily: F.body, fontSize: 13.5, color: W.warn, marginTop: 8 },
});
