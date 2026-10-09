import { supabase } from '../supabase/client';

// The links' own keys (supabase/migrations/20260421120000_worlds_foundation.sql):
// an upsert must name every column of one, or the database refuses it.
const WORLD_LINK_KEY = 'drop_id,drop_type,world_id';
const CHAPTER_LINK_KEY = 'drop_id,drop_type,chapter_id';

export async function upsertDropWorldLinks(
  rows: Array<{
    drop_id: string;
    drop_type: string;
    world_id: string;
    owner_id: string;
    relevance_score: number;
    assigned_by: 'user';
    reason: null;
  }>,
): Promise<void> {
  const { error } = await supabase.from('drop_world_links').upsert(rows, {
    onConflict: WORLD_LINK_KEY,
    ignoreDuplicates: true,
  });

  if (error) {
    throw error;
  }
}

export async function deleteDropWorldLink(dropId: string, worldId: string): Promise<void> {
  const { error } = await supabase
    .from('drop_world_links')
    .delete()
    .eq('drop_id', dropId)
    .eq('world_id', worldId);

  if (error) {
    throw error;
  }
}

export async function upsertDropChapterLinks(
  rows: Array<{
    drop_id: string;
    drop_type: string;
    chapter_id: string;
    owner_id: string;
    relevance_score: number;
    assigned_by: 'user';
    reason: null;
  }>,
): Promise<void> {
  const { error } = await supabase.from('drop_chapter_links').upsert(rows, {
    onConflict: CHAPTER_LINK_KEY,
    ignoreDuplicates: true,
  });

  if (error) {
    throw error;
  }
}

export async function deleteDropChapterLink(dropId: string, chapterId: string): Promise<void> {
  const { error } = await supabase
    .from('drop_chapter_links')
    .delete()
    .eq('drop_id', dropId)
    .eq('chapter_id', chapterId);

  if (error) {
    throw error;
  }
}
