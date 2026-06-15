import type { Dispatch, SetStateAction } from 'react';
import type { TaskPriority, TaskFrequency } from '../lib/types';

/**
 * The 25-field form shape used by the TaskDialog orchestrator and its
 * two step components (TaskDialogBasics, TaskDialogAdvanced) plus the
 * orchestrator's "Expert settings" deep-knobs section.
 *
 * Lifted out of TaskDialogBasics.tsx so neither step component owns the
 * shared form shape. The orchestrator owns the form state, both step
 * components receive `form` + `setForm` as props, and any future step
 * component can import the same types without forming an asymmetric
 * dependency on a sibling.
 */
export interface TaskFormState {
  title: string;
  description: string;
  duration_minutes: number;
  priority: TaskPriority;
  frequency: TaskFrequency;
  due_date: string;
  color: string;
  tags: string;
  preferred_days: number[];
  is_habit: boolean;
  can_split: boolean;
  is_busy_block: boolean;
  ignore_if_cannot_schedule: boolean;
  can_balance_across_days: boolean;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  notes: string;
  deadline: string;
  is_locked: boolean;
  auto_schedule: boolean;
  scheduling_cutoff_weeks: number;
  preferred_time_start: string;
  preferred_time_end: string;
  list_id: string;
  scheduling_profile_id: string;
  // Fixed-time fields — used only when creating a fixed-time block
  start_time: string;
  end_time: string;
  // Task type drives progressive disclosure in the UI
  task_type: 'flexible' | 'fixed' | 'repeating';
  // Repeating-specific
  repeat_until: string;
  // Proper recurrence end date (separate from scheduling deadline)
  recurrence_end: string;
}

/**
 * Setter for the form state — reuses React's `Dispatch<SetStateAction<T>>`
 * so the type matches exactly what `useState<TaskFormState>` returns and
 * the orchestrator can pass `setForm` directly to step components without
 * any wrapper or widening.
 *
 * Accepts either a full new `TaskFormState` value or a function that
 * produces the next state from the previous one. All current call sites
 * use the function form, but the type stays aligned with React's API.
 */
export type TaskFormSetter = Dispatch<SetStateAction<TaskFormState>>;
