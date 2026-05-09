-- Migration v6: Add position to links for reordering
ALTER TABLE public.links ADD COLUMN IF NOT EXISTS position INTEGER;

-- Initialize position with created_at order
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as pos
  FROM public.links
)
UPDATE public.links
SET position = ordered.pos
FROM ordered
WHERE public.links.id = ordered.id;
