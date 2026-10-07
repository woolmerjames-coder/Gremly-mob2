/**
 * Private links to saved photos.
 *
 * A photo is saved with the address of its file in storage. That address only
 * opens while storage lets anyone look. A private link is made for the person
 * signed in, works for an hour, and opens whether storage is open to everyone
 * or not. Every screen that shows a saved photo shows it through one, so
 * storage can be closed to everyone else.
 *
 * A photo still on the phone, and any address that is not one of ours, is
 * left as it is.
 */
import { useEffect, useState } from 'react';
import { getDateService } from '../date/DateService';
import { supabase } from '../supabase/client';

export const PHOTO_BUCKET = 'log-photos';

/** How long a link works */
const LASTS_SECONDS = 60 * 60;
/** A link this close to running out is made again rather than used */
const SPARE_MS = 5 * 60 * 1000;

const links = new Map<string, { url: string; until: number }>();
const making = new Map<string, Promise<string | null>>();

const now = () => getDateService().now().getTime();

/**
 * Where a photo's file is in storage, from the address it was saved with.
 * Null for a photo still on the phone, or an address that is not in our storage.
 */
export function storagePath(url: string | null | undefined): string | null {
  if (!url || !/^https?:\/\//.test(url)) return null;
  const found = url.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/log-photos\/([^?#]+)/,
  );
  if (!found) return null;
  try {
    return decodeURIComponent(found[1]);
  } catch {
    return found[1];
  }
}

/** A link already made that still has time on it. */
export function readyPrivateUrl(url: string | null | undefined): string | null {
  const path = storagePath(url);
  if (!path) return url ?? null;
  const held = links.get(path);
  return held && held.until - now() > SPARE_MS ? held.url : null;
}

async function make(path: string): Promise<string | null> {
  const running = making.get(path);
  if (running) return running;
  const job = (async () => {
    try {
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(path, LASTS_SECONDS);
      if (error || !data?.signedUrl) throw error ?? new Error('no link came back');
      links.set(path, { url: data.signedUrl, until: now() + LASTS_SECONDS * 1000 });
      return data.signedUrl;
    } catch (err) {
      console.warn('[Photos] could not make a private link:', err);
      return null;
    } finally {
      making.delete(path);
    }
  })();
  making.set(path, job);
  return job;
}

/**
 * The link to show a photo with. When a private one cannot be made (no
 * signal, say), the saved address is handed back: it still opens for as long
 * as storage is open, and shows nothing once it is not.
 */
export async function privateUrl(url: string): Promise<string> {
  const ready = readyPrivateUrl(url);
  if (ready) return ready;
  const path = storagePath(url);
  if (!path) return url;
  return (await make(path)) ?? url;
}

/** The link to show a photo with, once it is ready. Null while it is being made. */
export function usePrivateUrl(url: string | null | undefined): string | null {
  const [link, setLink] = useState<{ of: string; url: string } | null>(() => {
    const ready = readyPrivateUrl(url);
    return url && ready ? { of: url, url: ready } : null;
  });
  useEffect(() => {
    if (!url) return;
    let live = true;
    void privateUrl(url).then((made) => {
      if (live) setLink({ of: url, url: made });
    });
    return () => {
      live = false;
    };
  }, [url]);
  // a link made for another photo is not this one's
  return url && link?.of === url ? link.url : null;
}

/** Forget every link. For tests, and for a change of who is signed in. */
export function forgetPrivateUrls(): void {
  links.clear();
  making.clear();
}
