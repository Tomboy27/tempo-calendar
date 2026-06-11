import { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/button';
import type { TaskInput } from '../lib/tasks';
import type { TaskPriority, TaskFrequency } from '../lib/types';

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<void>;
  initial?: Partial<TaskInput>;
  title?: string;
}

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'ASAP', label: 'ASAP' },
  { value: 'HIGH', label: 'High' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'LOW', label: 'Low' },
];

const FREQUENCIES: { value: TaskFrequency; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom' },
];

const COLORS = [
  '#B45309', '#DC2626', '#D97706', '#059669', '#2563EB',
  '#7C3AED', '#DB2777', '#0D9488', '#EA580C', '#4F46E5',
];

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function TaskDialog({ open, onClose, onSave, initial, title }: TaskDialogProps) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    duration_minutes: initial?.duration_minutes || 30,
    priority: (initial?.priority || 'NORMAL') as TaskPriority,
    frequency: (initial?.frequency || 'once') as TaskFrequency,
    due_date: initial?.due_date || '',
    color: initial?.color || '#B45309',
    tags: (initial?.tags || []).join(', '),
    preferred_days: initial?.preferred_days || [] as number[],
    is_habit: initial?.is_habit || false,
    can_split: initial?.can_split || false,
    is_busy_block: initial?.is_busy_block || false,
    ignore_if_cannot_schedule: initial?.ignore_if_cannot_schedule || false,
    can_balance_across_days: initial?.can_balance_across_days || false,
    buffer_before_minutes: initial?.buffer_before_minutes || 0,
    buffer_after_minutes: initial?.buffer_after_minutes || 0,
    notes: initial?.notes || '',
    deadline: initial?.deadline || '',
    is_locked: initial?.is_locked || false,
    auto_schedule: initial?.auto_schedule !== false,
    scheduling_cutoff_weeks: initial?.scheduling_cutoff_weeks || 8,
    preferred_time_start: (() => {
      try { return initial?.preferred_time_windows?.[0] ? JSON.parse(initial.preferred_time_windows[0]).start : ''; }
      catch { return ''; }
    })(),
    preferred_time_end: (() => {
      try { return initial?.preferred_time_windows?.[0] ? JSON.parse(initial.preferred_time_windows[0]).end : ''; }
      catch { return ''; }
    })(),
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description || undefined,
        duration_minutes: form.duration_minutes,
        priority: form.priority,
        frequency: form.frequency,
        due_date: form.due_date || undefined,
        color: form.color,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        preferred_days: form.preferred_days.length > 0 ? form.preferred_days : undefined,
        is_habit: form.is_habit,
        can_split: form.can_split,
        is_busy_block: form.is_busy_block,
        ignore_if_cannot_schedule: form.ignore_if_cannot_schedule,
        can_balance_across_days: form.can_balance_across_days,
        buffer_before_minutes: form.buffer_before_minutes || undefined,
        buffer_after_minutes: form.buffer_after_minutes || undefined,
        notes: form.notes || undefined,
        deadline: form.deadline || undefined,
        is_locked: form.is_locked,
        auto_schedule: form.auto_schedule,
        scheduling_cutoff_weeks: form.scheduling_cutoff_weeks,
        preferred_time_windows: form.preferred_time_start && form.preferred_time_end
          ? [JSON.stringify({ start: form.preferred_time_start, end: form.preferred_time_end })]
          : undefined,
      });
      onClose();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    setForm((p) => ({
      ...p,
      preferred_days: p.preferred_days.includes(day)
        ? p.preferred_days.filter((d) => d !== day)
        : [...p.preferred_days, day].sort(),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog-content p-0" role="dialog" aria-modal="true" aria-label={title || 'Task'}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">{title || 'New task'}</h3>
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-accent text-muted-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-5">
          {/* Basics */}
          <section className="space-y-3">
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Task title"
              className="w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground bg-background"
              autoFocus
            />

            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 text-xs border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground resize-none bg-background"
            />

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Duration</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={form.duration_minutes}
                    onChange={(e) => setForm((p) => ({ ...p, duration_minutes: Math.max(5, parseInt(e.target.value) || 5) }))}
                    className="w-full px-2 py-1.5 text-xs border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                    min={5}
                    step={5}
                  />
                  <span className="text-[10px] text-muted-foreground">min</span>
                </div>
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Due date</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                  className="w-full px-2 py-1.5 text-xs border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                />
              </div>
              <div className="w-20">
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Repeat</label>
                <select
                  value={form.frequency}
                  onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value as TaskFrequency }))}
                  className="w-full px-2 py-1.5 text-xs border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Priority */}
          <section>
            <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Priority</label>
            <div className="flex gap-0.5 p-0.5 bg-muted rounded-md">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, priority: p.value }))}
                  className={`flex-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                    form.priority === p.value
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          {/* Color */}
          <section>
            <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Color</label>
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, color: c }))}
                  className={`w-4 h-4 rounded-full transition-all ${
                    form.color === c ? 'ring-2 ring-offset-1 ring-foreground/30 scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </section>

          {/* Preferred days */}
          <section>
            <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Preferred days</label>
            <div className="flex gap-1">
              {DAYS.map((day, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i + 1)}
                  className={`w-7 h-7 text-[10px] font-medium rounded-md transition-colors ${
                    form.preferred_days.includes(i + 1)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </section>

          {/* Tags */}
          <section>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Tags</label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
              placeholder="Work, Personal (comma-separated)"
              className="w-full px-3 py-1.5 text-xs border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground bg-background"
            />
          </section>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Advanced settings
          </button>

          {/* Advanced */}
          {showAdvanced && (
            <section className="space-y-3 pt-2 border-t border-border">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'is_locked', label: 'Locked' },
                  { key: 'auto_schedule', label: 'Auto-schedule' },
                  { key: 'is_habit', label: 'Habit' },
                  { key: 'can_split', label: 'Can split' },
                  { key: 'is_busy_block', label: 'Busy block' },
                  { key: 'ignore_if_cannot_schedule', label: 'Skip if no slot' },
                  { key: 'can_balance_across_days', label: 'Balance across days' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(form as any)[key]}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.checked }))}
                      className="rounded border-border text-primary focus:ring-ring w-3.5 h-3.5"
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Buffer before (min)</label>
                  <input type="number" value={form.buffer_before_minutes} onChange={(e) => setForm((p) => ({ ...p, buffer_before_minutes: parseInt(e.target.value) || 0 }))} className="w-full px-2 py-1.5 text-xs border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background" min={0} step={5} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Buffer after (min)</label>
                  <input type="number" value={form.buffer_after_minutes} onChange={(e) => setForm((p) => ({ ...p, buffer_after_minutes: parseInt(e.target.value) || 0 }))} className="w-full px-2 py-1.5 text-xs border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background" min={0} step={5} />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Deadline</label>
                <input type="date" value={form.deadline} onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Scheduling horizon (weeks)</label>
                  <input type="number" value={form.scheduling_cutoff_weeks} onChange={(e) => setForm((p) => ({ ...p, scheduling_cutoff_weeks: Math.max(1, parseInt(e.target.value) || 8) }))} className="w-full px-2 py-1.5 text-xs border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background" min={1} max={52} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Preferred time</label>
                  <div className="flex items-center gap-1">
                    <input type="time" value={form.preferred_time_start} onChange={(e) => setForm((p) => ({ ...p, preferred_time_start: e.target.value }))} className="w-full px-1.5 py-1.5 text-[10px] border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background" />
                    <span className="text-[10px] text-muted-foreground">&ndash;</span>
                    <input type="time" value={form.preferred_time_end} onChange={(e) => setForm((p) => ({ ...p, preferred_time_end: e.target.value }))} className="w-full px-1.5 py-1.5 text-[10px] border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Internal notes" className="w-full px-3 py-1.5 text-xs border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground resize-none bg-background" />
              </div>
            </section>
          )}

          {saveError && (
            <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-md">
              <p className="text-xs text-destructive">{saveError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={!form.title.trim() || saving} className="flex-1">
              {saving ? 'Saving...' : initial ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}