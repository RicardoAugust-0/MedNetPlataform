-- Migration: 20260626121500_retire_drivers_queue.sql
-- Retire the deprecated transit table public.drivers_queue and its triggers.

-- 1. Drop trigger if exists
DROP TRIGGER IF EXISTS drivers_queue_touch_updated_at ON public.drivers_queue;

-- 2. Drop touch trigger function
DROP FUNCTION IF EXISTS public.drivers_queue_touch_updated_at() CASCADE;

-- 3. Drop table drivers_queue
DROP TABLE IF EXISTS public.drivers_queue CASCADE;
