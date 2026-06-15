-- Migration: Add recurrence_end column to tasks table
-- This column stores the explicit end date of a recurrence series,
-- separate from the task deadline (which is a scheduling constraint).

-- Add the column (nullable, no default)
alter table tasks
add column if not exists recurrence_end date;

-- Add index for efficient filtering of recurring tasks by end date
-- when generating calendar occurrences.
create index if not exists idx_tasks_recurrence_end
  on tasks(recurrence_end)
  where recurrence_end is not null;

-- Add comment for documentation
comment on column tasks.recurrence_end is 'End date of a recurrence series (YYYY-MM-DD). Separate from deadline.';
