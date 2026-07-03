-- Documentos do motorista (CNH, ASO, Polissonografia) para ingestão por OCR + extração por IA.
CREATE TABLE IF NOT EXISTS public.driver_documents (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  motorista_nome    text        NOT NULL,
  placa             text,
  tipo_documento    text        NOT NULL CHECK (tipo_documento IN ('cnh', 'aso', 'polissonografia')),
  storage_path      text        NOT NULL,
  file_name         text        NOT NULL,
  status            text        NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processado', 'revisado', 'erro')),
  ocr_text          text,
  extracted_data    jsonb,
  error_message     text,
  uploaded_by       uuid        DEFAULT auth.uid() REFERENCES auth.users(id),
  reviewed_by       uuid        REFERENCES auth.users(id),
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_documents_motorista ON public.driver_documents (motorista_nome);

ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_driver_documents" ON public.driver_documents
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_driver_documents" ON public.driver_documents
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_driver_documents" ON public.driver_documents
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_driver_documents" ON public.driver_documents
  FOR DELETE TO authenticated
  USING (true);

-- Bucket privado para os arquivos (CNH/ASO/Polissonografia) — sem leitura pública.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-documents',
  'driver-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "driver_documents_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'driver-documents');

CREATE POLICY "driver_documents_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'driver-documents');

CREATE POLICY "driver_documents_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'driver-documents');
