-- Create log-photos storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'log-photos',
  'log-photos',
  true, -- Make bucket public
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload their own log photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own log photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own log photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view log photos" ON storage.objects;

-- Create RLS policy to allow authenticated users to upload their own photos
CREATE POLICY "Users can upload their own log photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'log-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Create RLS policy to allow authenticated users to read their own photos
CREATE POLICY "Users can read their own log photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'log-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Create RLS policy to allow authenticated users to delete their own photos
CREATE POLICY "Users can delete their own log photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'log-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Since bucket is public, allow anonymous read access
-- (This is needed for public URLs to work)
CREATE POLICY "Anyone can view log photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'log-photos');
