import type { TaskPriority, TaskFrequency, TaskList, SchedulingProfile } from '../lib/types';
import type { TaskFormSetter, TaskFormState } from './TaskDialogTypes';
import { Repeat, Clock, CalendarDays } from 'lucide-react';

interface TaskDialogBasicsProps {
  form: TaskFormState;
  setForm: TaskFormSetter;
  onTaskTypeChange: (type: TaskFormState['task_type']) => void;
  taskLists: TaskList[];
  schedulingProfiles: SchedulingProfile[];
}

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'ASAP', label: 'ASAP' },
];

const FREQUENCIES: { value: TaskFrequency; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

const DURATION_PRESETS = [
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
  { label: '4h', value: 240 },
];

const TASK_TYPES: { value: TaskFormState['task_type']; label: string; icon: typeof Clock; desc: string }[] = [
  { value: 'flexible', label: 'Flexible', icon: Clock, desc: 'Tempo finds the best slot' },
  { value: 'fixed', label: 'Fixed time', icon: CalendarDays, desc: 'Set start and end time' },
  { value: 'repeating', label: 'Repeating', icon: Repeat, desc: 'Daily or weekly schedule' },
];

/**
 * Step 1 of the TaskDialog progressive-disclosure layout. Captures the
 * minimum fields required to plan a task, with task-type-aware fields.
 */
export function TaskDialogBasics({ form, setForm, onTaskTypeChange, taskLists, schedulingProfiles }: TaskDialogBasicsProps) {
  const isFixed = form.task_type === 'fixed';
  const isRepeating = form.task_type === 'repeating';

  return (
    <section className="space-y-4">
      {/* Task type selector — first thing the user sees */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">What kind of task is this?</label>
        <div className="grid grid-cols-3 gap-2">
          {TASK_TYPES.map((t) => {
            const Icon = t.icon;
            const active = form.task_type === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => onTaskTypeChange(t.value)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 transition-all ${
                  active
                    ? 'border-primary/40 bg-primary/5 text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-primary' : ''}`} />
                <span className="text-xs font-medium">{t.label}</span>
                <span className="text-[10px] leading-tight text-center opacity-70">{t.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Title — always present */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">What do you need to do?</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder={
            isFixed ? 'Work shift, class, appointment, meeting...'
              : isRepeating ? 'Morning standup, gym session, review...'
              : 'Write proposal, call dentist, review PRs...'
          }
          className="w-full px-3 py-2.5 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground bg-background"
          autoFocus
        />
      </div>

      {/* Duration presets — only for flexible and repeating */}
      {!isFixed && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">How long will it take?</label>
          <div className="flex gap-2">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setForm((p) => ({ ...p, duration_minutes: preset.value }))}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  form.duration_minutes === preset.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {preset.label}
              </button>
            ))}
            <div className="flex items-center gap-1.5 bg-muted rounded-lg px-2 h-10">
              <input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setForm((p) => ({ ...p, duration_minutes: Math.max(5, parseInt(e.target.value) || 5) }))}
                className="w-14 bg-transparent text-sm text-center focus:outline-none"
                min={5}
                step={5}
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          </div>
        </div>
      )}

      {/* Fixed time: start/end time inputs */}
      {isFixed && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Start time</label>
            <input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">End time</label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer pb-2.5">
                <input
                  type="checkbox"
                  checked={form.is_locked}
                  onChange={(e) => setForm((p) => ({ ...p, is_locked: e.target.checked }))}
                  className="rounded border-border text-primary focus:ring-ring w-4 h-4"
                />
                Locked (cannot move)
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Flexible: due date + repeat (once) */}
      {/* Repeating: frequency + repeat until */}
      <div className="grid grid-cols-2 gap-3">
        {!isFixed && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {isRepeating ? 'Recurrence end' : 'Due date'}
            </label>
            <input
              type="date"
              value={isRepeating ? form.recurrence_end : form.due_date}
              onChange={(e) => setForm((p) => (
                isRepeating ? { ...p, recurrence_end: e.target.value, repeat_until: e.target.value } : { ...p, due_date: e.target.value }
              ))}
              className="w-full px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            />
          </div>
        )}
        {isRepeating && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Repeat</label>
            <select
              value={form.frequency}
              onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value as TaskFrequency }))}
              className="w-full px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            >
              {FREQUENCIES.filter((f) => f.value !== 'once').map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        )}
        {!isRepeating && !isFixed && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Repeat</label>
            <select
              value={form.frequency}
              onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value as TaskFrequency }))}
              className="w-full px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Repeating: preferred days — surfaced in core flow, not hidden in advanced */}
      {isRepeating && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">On which days?</label>
          <div className="flex gap-1">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
              const dayNum = i + 1;
              const active = form.preferred_days.includes(dayNum);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      preferred_days: active
                        ? p.preferred_days.filter((d) => d !== dayNum)
                        : [...p.preferred_days, dayNum],
                    }))
                  }
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Selected days determine which days of the week the task appears.
          </p>
        </div>
      )}

      {/* Priority — always present */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">Priority</label>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, priority: p.value }))}
              className={`flex-1 px-2 py-2 text-xs font-medium rounded-md transition-colors ${
                form.priority === p.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* List + Profile — always present */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">List</label>
          <select
            value={form.list_id}
            onChange={(e) => setForm((p) => ({ ...p, list_id: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          >
            <option value="">No list</option>
            {taskLists.map((list) => (
              <option key={list.id} value={list.id}>{list.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Schedule profile</label>
          <select
            value={form.scheduling_profile_id}
            onChange={(e) => setForm((p) => ({ ...p, scheduling_profile_id: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          >
            <option value="">Default</option>
            {schedulingProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
