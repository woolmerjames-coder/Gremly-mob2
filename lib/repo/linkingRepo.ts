import { supabase } from '../supabase/client';

export async function upsertEveningNotificationPreference(params: {
  userId: string;
  eveningTime: string;
  updatedAt: string;
}): Promise<void> {
  const { error } = await supabase.from('notification_preferences').upsert(
    {
      user_id: params.userId,
      evening_enabled: true,
      evening_time: params.eveningTime,
      updated_at: params.updatedAt,
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    throw error;
  }
}

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
    onConflict: 'drop_id,world_id',
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
    onConflict: 'drop_id,chapter_id',
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
