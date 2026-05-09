-- Migration v7: Add position to ws_pages for reordering
ALTER TABLE public.ws_pages ADD COLUMN IF NOT EXISTS position INTEGER;

-- Initialize position with created_at order
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) - 1 AS pos
  FROM public.ws_pages
)
UPDATE public.ws_pages
SET position = ordered.pos
FROM ordered
WHERE public.ws_pages.id = ordered.id;
