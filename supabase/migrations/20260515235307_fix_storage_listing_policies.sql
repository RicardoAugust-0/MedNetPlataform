DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "workspace_images_public_read" ON storage.objects;

CREATE POLICY "avatars_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "workspace_images_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'workspace-images');
