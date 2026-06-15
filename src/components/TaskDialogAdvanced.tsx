import type { TaskFormSetter, TaskFormState } from './TaskDialogTypes';

interface TaskDialogAdvancedProps {
  form: TaskFormState;
  setForm: TaskFormSetter;
}

const COLORS = [
  '#2563EB', '#0D9488', '#059669', '#7C3AED', '#DB2777',
  '#B45309', '#DC2626', '#D97706', '#EA580C', '#4F46E5',
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Step 2 of the TaskDialog progressive-disclosure layout. Personalization
 * fields: free-form description, comma-separated tags, accent color, and
 * preferred days for non-repeating tasks.
 *
 * Repeating tasks show preferred days in the core flow (TaskDialogBasics),
 * so they do NOT appear here to avoid duplicate controls.
 */
export function TaskDialogAdvanced({ form, setForm }: TaskDialogAdvancedProps) {
  const isRepeating = form.task_type === 'repeating';

  const toggleDay = (day: number) => {
    setForm((p) => ({
      ...p,
      preferred_days: p.preferred_days.includes(day)
        ? p.preferred_days.filter((d) => d !== day)
        : [...p.preferred_days, day].sort(),
    }));
  };

  return (
    <section className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Any extra context..."
          rows={2}
          className="w-full px-3 py-2.5 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground resize-none bg-background"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tags</label>
        <input
          type="text"
          value={form.tags}
          onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
          placeholder="Work, Personal (comma-separated)"
          className="w-full px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground bg-background"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">Color</label>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm((p) => ({ ...p, color: c }))}
              className={`w-5 h-5 rounded-full transition-all ${
                form.color === c ? 'ring-2 ring-offset-2 ring-foreground/20 scale-110' : 'hover:scale-110'
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>

      {/* Preferred days only for non-repeating tasks (repeating tasks show this in the core flow) */}
      {!isRepeating && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Preferred days</label>
          <div className="flex gap-1.5">
            {DAYS.map((day, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i + 1)}
                className={`h-9 flex-1 min-w-0 text-xs font-medium rounded-lg transition-colors ${
                  form.preferred_days.includes(i + 1)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{day.charAt(0)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
