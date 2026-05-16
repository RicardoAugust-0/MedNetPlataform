CREATE TABLE public.profile_credentials (
  id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  maxtrack_password text,
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE public.profile_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creds_select_own" ON public.profile_credentials
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "creds_insert_own" ON public.profile_credentials
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "creds_update_own" ON public.profile_credentials
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "creds_delete_own" ON public.profile_credentials
  FOR DELETE TO authenticated
  USING (id = (SELECT auth.uid()));

INSERT INTO public.profile_credentials (id, maxtrack_password)
SELECT id, maxtrack_password
FROM public.profiles
WHERE maxtrack_password IS NOT NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS maxtrack_password;
