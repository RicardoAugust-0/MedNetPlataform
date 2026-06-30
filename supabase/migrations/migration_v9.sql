-- Migration v9: personalização de perfil
-- 1. Novos campos opcionais em profiles: avatar_url, telefone, bio
-- 2. Bucket "avatars" para fotos de perfil (público, 2 MB, imagens comuns)
-- 3. Políticas: leitura pública, insert/update/delete só pelo dono na própria pasta {userId}/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS telefone   TEXT,
  ADD COLUMN IF NOT EXISTS bio        TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Leitura pública (avatares aparecem no Sidebar e onde mais for útil).
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- Usuários autenticados só podem inserir na própria pasta {auth.uid()}/...
CREATE POLICY "avatars_auth_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Só o dono pode sobrescrever (update) ou apagar.
CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND owner = auth.uid());

CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND owner = auth.uid());
