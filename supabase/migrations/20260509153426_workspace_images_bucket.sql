-- Migration: workspace_images_bucket

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-images',
  'workspace-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "workspace_images_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'workspace-images');

CREATE POLICY "workspace_images_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'workspace-images');

CREATE POLICY "workspace_images_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'workspace-images' AND owner = auth.uid());
