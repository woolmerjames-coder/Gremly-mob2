/**
 * Photos on a journal entry.
 *
 * They are the same photos a drop can carry: a file in the person's own
 * folder in storage, and a row saying which entry it belongs to. On the page
 * a photo is either one already saved with the entry, or one just chosen that
 * is still on the phone. Nothing is uploaded or deleted until the entry is
 * saved, so closing the page without Done changes nothing.
 *
 * Gremly does not look at photos. They are for the person.
 */
import { useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { create } from 'zustand';
import { getDateService } from '../date/DateService';
import { PHOTO_BUCKET, storagePath } from '../photos/privateUrl';
import { supabase } from '../supabase/client';
import { JOURNAL_COPY } from './words';

/** The most an entry can carry */
export const PHOTOS_MAX = 6;
/** How hard a chosen photo is squeezed before it is sent: smaller to send, still good to look at */
const QUALITY = 0.6;

/** A photo saved with an entry */
export type EntryPhoto = { id: string; url: string; position: number };

/** What was done to an entry's photos on the page */
export type PhotoChanges = {
  /** Chosen from the phone, and still on it */
  added: string[];
  /** Saved photos taken off, by id */
  removed: string[];
};

/** A photo as the page shows it */
export type PagePhoto = { key: string; url: string; saved: boolean };

export const NO_PHOTO_CHANGES: PhotoChanges = { added: [], removed: [] };

export function hasPhotoChanges(changes: PhotoChanges | null | undefined): boolean {
  return !!changes && (changes.added.length > 0 || changes.removed.length > 0);
}

/** The photos on the page: the saved ones still on it, then the ones just chosen. */
export function photosShown(saved: EntryPhoto[], changes: PhotoChanges): PagePhoto[] {
  return [
    ...saved
      .filter((p) => !changes.removed.includes(p.id))
      .map((p) => ({ key: p.id, url: p.url, saved: true })),
    ...changes.added.map((url) => ({ key: url, url, saved: false })),
  ];
}

/** Take a photo off the page: a saved one is marked to delete, a chosen one is let go. */
export function withoutPhoto(changes: PhotoChanges, photo: PagePhoto): PhotoChanges {
  return photo.saved
    ? { added: changes.added, removed: [...changes.removed, photo.key] }
    : { added: changes.added.filter((url) => url !== photo.key), removed: changes.removed };
}

/** Put chosen photos on the page, up to the room there is. One chosen twice is there once. */
export function withPhotos(
  changes: PhotoChanges,
  saved: EntryPhoto[],
  uris: string[],
): PhotoChanges {
  const room = PHOTOS_MAX - photosShown(saved, changes).length;
  const fresh = [...new Set(uris)].filter((url) => !changes.added.includes(url));
  return {
    added: [...changes.added, ...fresh.slice(0, Math.max(0, room))],
    removed: changes.removed,
  };
}

// ── the photos saved with each entry, as last read ──────────────────────────

interface EntryPhotosState {
  byEntry: Record<string, EntryPhoto[]>;
}

export const useEntryPhotosStore = create<EntryPhotosState>()(() => ({ byEntry: {} }));

const NONE: EntryPhoto[] = [];

function toPhoto(row: { id?: unknown; url?: unknown; position?: unknown }): EntryPhoto | null {
  if (typeof row.id !== 'string' || typeof row.url !== 'string') return null;
  return { id: row.id, url: row.url, position: Number(row.position) || 0 };
}

/** Read an entry's photos from the account. What was last read stays when it cannot be reached. */
export async function loadEntryPhotos(noteId: string): Promise<EntryPhoto[]> {
  try {
    const { data, error } = await supabase
      .from('log_photos')
      .select('id,url,position')
      .eq('note_id', noteId)
      .order('position', { ascending: true });
    if (error) throw error;
    const photos = ((data ?? []) as Record<string, unknown>[])
      .map(toPhoto)
      .filter((p): p is EntryPhoto => !!p);
    useEntryPhotosStore.setState((s) => ({ byEntry: { ...s.byEntry, [noteId]: photos } }));
    return photos;
  } catch (err) {
    console.warn('[Journal] could not read the photos of an entry:', err);
    return useEntryPhotosStore.getState().byEntry[noteId] ?? NONE;
  }
}

/** An entry's saved photos, read when it is first asked for and kept up as they change. */
export function useEntryPhotos(noteId: string | null | undefined): EntryPhoto[] {
  const photos = useEntryPhotosStore((s) => (noteId ? s.byEntry[noteId] : undefined));
  useEffect(() => {
    if (noteId) void loadEntryPhotos(noteId);
  }, [noteId]);
  return photos ?? NONE;
}

/**
 * How many photos an entry has, for a list. What was read here is the latest;
 * before that, the count the app loaded with the entry.
 */
export function entryPhotoCount(entry: { id: string; log_photos?: unknown }): number {
  const read = useEntryPhotosStore.getState().byEntry[entry.id];
  if (read) return read.length;
  return Array.isArray(entry.log_photos) ? entry.log_photos.length : 0;
}

// ── choosing, saving and deleting ───────────────────────────────────────────

export type PhotosChosen = { ok: true; uris: string[] } | { ok: false; message: string };

/** Let the person choose photos from their library, as many as there is room for. */
export async function choosePhotos(room: number): Promise<PhotosChosen> {
  if (room <= 0) return { ok: false, message: JOURNAL_COPY.photosFull };
  try {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: room > 1,
      selectionLimit: room,
      allowsEditing: false,
      quality: QUALITY,
    });
    if (res.canceled) return { ok: true, uris: [] };
    const uris = (res.assets ?? []).map((a) => a.uri).filter((u): u is string => !!u);
    return { ok: true, uris: uris.slice(0, room) };
  } catch (err) {
    console.warn('[Journal] could not open the photo library:', err);
    return { ok: false, message: JOURNAL_COPY.photosNoLibrary };
  }
}

async function upload(noteId: string, userId: string, uri: string, position: number) {
  const stamp = `${getDateService().now().getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${userId}/${noteId}/${stamp}.jpg`;
  const file = await (await fetch(uri)).arrayBuffer();
  const sent = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: 'image/jpeg', upsert: false });
  if (sent.error) throw sent.error;
  // the address is only where the file is: it is opened through a private link
  const url = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  const row = await supabase
    .from('log_photos')
    .insert({ note_id: noteId, owner_id: userId, url, position });
  if (row.error) {
    // a file nothing points at is of no use to anyone
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw row.error;
  }
}

/** Delete photo files from storage. A file that is already gone is not an error. */
export async function removePhotoFiles(photos: { url: string }[]): Promise<void> {
  const paths = photos.map((p) => storagePath(p.url)).filter((p): p is string => !!p);
  if (!paths.length) return;
  try {
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    if (error) throw error;
  } catch (err) {
    console.warn('[Journal] could not delete photo files:', err);
  }
}

/**
 * Carry out what was done to an entry's photos once the entry is saved: send
 * the chosen ones, delete the ones taken off. Each photo stands alone, so one
 * that fails does not stop the others. Says how many could not be added.
 */
export async function saveEntryPhotos(
  noteId: string,
  saved: EntryPhoto[],
  changes: PhotoChanges,
): Promise<{ failed: number }> {
  if (!hasPhotoChanges(changes)) return { failed: 0 };
  let failed = 0;
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data?.session?.user?.id ?? null;
  } catch (err) {
    console.warn('[Journal] could not tell who is signed in, to save photos:', err);
  }

  const gone = saved.filter((p) => changes.removed.includes(p.id));
  for (const photo of gone) {
    try {
      const { error } = await supabase.from('log_photos').delete().eq('id', photo.id);
      if (error) throw error;
      await removePhotoFiles([photo]);
    } catch (err) {
      console.warn('[Journal] could not take a photo off an entry:', err);
    }
  }

  const kept = saved.filter((p) => !changes.removed.includes(p.id));
  let position = kept.reduce((max, p) => Math.max(max, p.position + 1), 0);
  for (const uri of changes.added) {
    if (!userId) {
      failed += 1;
      continue;
    }
    try {
      await upload(noteId, userId, uri, position);
      position += 1;
    } catch (err) {
      console.warn('[Journal] could not add a photo to an entry:', err);
      failed += 1;
    }
  }
  await loadEntryPhotos(noteId);
  return { failed };
}

/** "One photo could not be added…", for after an entry is saved */
export function photosFailedMessage(failed: number): string {
  return failed === 1
    ? 'One photo could not be added. Your entry is saved. Open it to add the photo again.'
    : `${failed} photos could not be added. Your entry is saved. Open it to add them again.`;
}
