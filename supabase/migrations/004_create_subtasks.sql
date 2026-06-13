-- 004_create_subtasks.sql
-- Adds a `subtasks` table so any task can be broken into smaller, checkable
-- steps with a progress bar. Cascading on `task_id` delete keeps the table
-- clean when a parent task is removed.

create table if not exists subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  -- Set when `completed` flips to true; cleared when it flips back.
  -- Lets the UI show "completed 3h ago" and the Analytics feature
  -- compute time-to-completion per subtask. Cheap to add now,
  -- expensive to add once there's prod data.
  completed_at timestamp with time zone
);

-- Lookup by parent task is the hot path (the dialog fetches subtasks
-- whenever a task is opened). The composite index also serves the
-- common "list subtasks for a task, ordered by sort_order" query, so
-- a separate single-column index on `task_id` alone is not needed.
create index if not exists subtasks_task_id_sort_idx on subtasks(task_id, sort_order);

-- Keep `updated_at` in sync on row updates. Uses a uniquely-named
-- function (rather than a shared `update_updated_at_column()`) so this
-- migration never silently overwrites a differently-evolved version of
-- that function used by other tables.
create or replace function update_subtasks_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists subtasks_updated_at on subtasks;
create trigger subtasks_updated_at
  before update on subtasks
  for each row
  execute function update_subtasks_updated_at_column();

-- Keep `completed_at` in sync with `completed`. When `completed` flips
-- false → true, stamp `completed_at`; when it flips back, clear it.
-- Fires on BOTH INSERT (so pre-completed subtasks created via import /
-- migration get a timestamp) and UPDATE (so live toggles stay in sync).
-- `completed` is NOT NULL, so a plain `!=` comparison is correct here.
-- The `or tg_op = 'INSERT'` branch handles the case where `OLD` is not
-- available (no previous row) — Postgres evaluates it to TRUE on
-- inserts, FALSE on updates where the value didn't change.
create or replace function update_subtasks_completed_at_column()
returns trigger as $$
begin
  if tg_op = 'INSERT' or new.completed != old.completed then
    new.completed_at = case when new.completed then now() else null end;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists subtasks_completed_at_insert on subtasks;
create trigger subtasks_completed_at_insert
  before insert on subtasks
  for each row
  execute function update_subtasks_completed_at_column();

drop trigger if exists subtasks_completed_at_update on subtasks;
create trigger subtasks_completed_at_update
  before update on subtasks
  for each row
  execute function update_subtasks_completed_at_column();

-- Row Level Security: users can only see/modify subtasks for tasks they
-- own. The tasks RLS policy already gates by `auth.uid() = user_id` (see
-- 001_create_tasks.sql); we replicate that here via a join.
alter table subtasks enable row level security;

drop policy if exists "subtasks_select_own" on subtasks;
create policy "subtasks_select_own" on subtasks
  for select using (
    exists (
      select 1 from tasks
      where tasks.id = subtasks.task_id
      and tasks.user_id = auth.uid()
    )
  );

drop policy if exists "subtasks_insert_own" on subtasks;
create policy "subtasks_insert_own" on subtasks
  for insert with check (
    exists (
      select 1 from tasks
      where tasks.id = subtasks.task_id
      and tasks.user_id = auth.uid()
    )
  );

drop policy if exists "subtasks_update_own" on subtasks;
create policy "subtasks_update_own" on subtasks
  for update using (
    exists (
      select 1 from tasks
      where tasks.id = subtasks.task_id
      and tasks.user_id = auth.uid()
    )
  );

drop policy if exists "subtasks_delete_own" on subtasks;
create policy "subtasks_delete_own" on subtasks
  for delete using (
    exists (
      select 1 from tasks
      where tasks.id = subtasks.task_id
      and tasks.user_id = auth.uid()
    )
  );

-- Table-level grants. RLS only gates rows; without these grants all
-- queries return "permission denied for table subtasks" at the role
-- level. Mirrors the convention used by other tables in this project.
grant select, insert, update, delete on table subtasks to authenticated;
