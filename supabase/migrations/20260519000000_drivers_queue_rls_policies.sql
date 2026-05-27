-- RLS policies for drivers_queue
-- All authenticated operators share read/write access to the queue

CREATE POLICY "drivers_queue_select" ON public.drivers_queue
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "drivers_queue_insert" ON public.drivers_queue
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "drivers_queue_update" ON public.drivers_queue
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "drivers_queue_delete" ON public.drivers_queue
  FOR DELETE TO authenticated
  USING (true);
