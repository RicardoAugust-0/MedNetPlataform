-- Migration: WhatsApp API Integration and Cost Tracking
-- Target: Supabase database

-- 1. Table for WhatsApp credentials
CREATE TABLE IF NOT EXISTS public.whatsapp_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  whatsapp_business_account_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.whatsapp_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can perform all actions on credentials
CREATE POLICY "admin_all_whatsapp_credentials" ON public.whatsapp_credentials
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2. Table for WhatsApp templates cache
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  language TEXT NOT NULL,
  status TEXT NOT NULL,
  components JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Policies: Authenticated users can read templates, only admins can modify
CREATE POLICY "authenticated_select_whatsapp_templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin_all_whatsapp_templates" ON public.whatsapp_templates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Table for WhatsApp dispatches history and logs
CREATE TABLE IF NOT EXISTS public.whatsapp_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  template_name TEXT NOT NULL,
  category TEXT,
  estimated_cost NUMERIC(10,4) DEFAULT 0.0000,
  status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  variables JSONB NOT NULL DEFAULT '[]'::JSONB,
  error_message TEXT,
  meta_message_id TEXT,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.whatsapp_dispatches ENABLE ROW LEVEL SECURITY;

-- Policies: Authenticated users can read and insert dispatches
CREATE POLICY "authenticated_select_whatsapp_dispatches" ON public.whatsapp_dispatches
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_whatsapp_dispatches" ON public.whatsapp_dispatches
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "admin_all_whatsapp_dispatches" ON public.whatsapp_dispatches
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS whatsapp_dispatches_created_at_idx ON public.whatsapp_dispatches (created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_dispatches_meta_message_id_idx ON public.whatsapp_dispatches (meta_message_id);

-- 4. Add tables to realtime publication if possible
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_dispatches;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_templates;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_credentials;
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;
