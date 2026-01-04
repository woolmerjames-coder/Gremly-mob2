/**
 * Photo Upload Utility for Mind Drop
 *
 * Handles uploading photos to Supabase storage and linking them to notes.
 * Used by both Mind Drop submission and the overlay editor.
 */

import { supabase } from '../supabase/client';

/**
 * Upload photos to Supabase storage and link them to a note
 *
 * Flow:
 * 1. Fetch each photo from local URI
 * 2. Upload to Supabase storage (log-photos bucket)
 * 3. Insert record into log_photos table
 *
 * @param noteId - The note ID to link photos to
 * @param userId - The user ID (used in storage path)
 * @param photoUris - Array of local file:// URIs
 */
export async function uploadPhotosToNote(
  noteId: string,
  userId: string,
  photoUris: string[],
): Promise<void> {
  if (!photoUris || photoUris.length === 0) return;
  if (!noteId || !userId) {
    console.warn('[PhotoUpload] Missing noteId or userId');
    return;
  }

  console.log('[PhotoUpload] Uploading', photoUris.length, 'photos for note:', noteId);

  for (let i = 0; i < photoUris.length; i++) {
    const photoUri = photoUris[i];
    if (!photoUri.startsWith('file://')) {
      console.warn('[PhotoUpload] Skipping non-local URI:', photoUri.substring(0, 50));
      continue;
    }

    try {
      // Generate unique storage path
      const fileExt = photoUri.split('.').pop() || 'jpg';
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const storagePath = `${userId}/${noteId}/${uniqueId}.${fileExt}`;

      // Fetch file from local URI
      const response = await fetch(photoUri);
      const arrayBuffer = await response.arrayBuffer();

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('log-photos')
        .upload(storagePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        console.error('[PhotoUpload] Failed to upload photo:', uploadError);
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from('log-photos').getPublicUrl(storagePath);
      const publicUrl = urlData?.publicUrl || storagePath;

      // Insert into log_photos table
      const { error: insertError } = await supabase.from('log_photos').insert({
        note_id: noteId,
        url: publicUrl,
        position: i,
      });

      if (insertError) {
        console.error('[PhotoUpload] Failed to insert photo record:', insertError);
        continue;
      }

      console.log('[PhotoUpload] Successfully uploaded photo', i + 1, 'of', photoUris.length);
    } catch (err) {
      console.error('[PhotoUpload] Error uploading photo:', err);
      // Continue with remaining photos
    }
  }
}
