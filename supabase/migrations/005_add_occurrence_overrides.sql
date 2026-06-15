-- Add occurrence_overrides for per-occurrence state on repeating tasks.
-- The JSON structure is a map keyed by date string (YYYY-MM-DD):
--   {
--     "2026-01-15": { "scheduled_start": "...", "scheduled_end": "...", "status": "completed" },
--     "2026-01-16": { "status": "skipped" }
--   }
-- Only keys present in the map override the base task's schedule/status.

alter table tasks
  add column if not exists occurrence_overrides jsonb null default null;

-- Index for efficient lookup when checking if a specific date has an override.
create index if not exists idx_tasks_occurrence_overrides
  on tasks using gin (occurrence_overrides);
