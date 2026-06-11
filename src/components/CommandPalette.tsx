import { useState, useMemo, useRef } from 'react';
import { Command } from 'cmdk';
import { Calendar, Plus, Settings, Sun, Moon, Inbox, Sparkles, Zap, Check } from 'lucide-react';
import { toast } from 'sonner';
import * as chrono from 'chrono-node';
import { format, isToday, isTomorrow } from 'date-fns';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuickAdd: (input: { title: string; date?: string; time?: string }) => Promise<void> | void;
  onNavigate: (view: 'day' | 'week' | 'month') => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  onScheduleAll: () => Promise<void> | void;
  currentView: 'day' | 'week' | 'month';
  theme: 'light' | 'dark';
}

/**
 * Parse natural language date/time from a title like
 *   "Call dentist tomorrow at 3pm"
 *   "Review PRs friday"
 *   "Team standup monday 9:30am"
 * Returns { title, date?, time? } with the date/time stripped.
 */
function parseNaturalDate(input: string): { title: string; date?: string; time?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { title: '' };

  const results = chrono.parse(trimmed, new Date(), { forwardDate: true });
  if (results.length === 0) return { title: trimmed };

  // Take the first parsed date; strip its text from the title
  const first = results[0];
  const date = first.start.date();

  // Build ISO date
  const isoDate = format(date, 'yyyy-MM-dd');

  // Extract time if present
  let time: string | undefined;
  if (first.start.isCertain('hour')) {
    time = format(date, 'HH:mm');
  }

  // Strip the matched text from the original input
  const before = trimmed.slice(0, first.index);
  const after = trimmed.slice(first.index + first.text.length);
  const title = `${before} ${after}`.replace(/\s+/g, ' ').trim();

  return {
    title: title || trimmed,
    date: isoDate,
    time,
  };
}

export function CommandPalette({
  open,
  onOpenChange,
  onQuickAdd,
  onNavigate,
  onOpenSettings,
  onToggleTheme,
  onScheduleAll,
  currentView,
  theme,
}: CommandPaletteProps) {
  const [value, setValue] = useState('');

  // Derived: parse preview synchronously from value (avoids set-state-in-effect)
  const parsedPreview = useMemo(() => {
    if (!value.trim()) return null;
    const parsed = parseNaturalDate(value);
    return parsed.date || parsed.time ? parsed : null;
  }, [value]);

  // Reset on close via ref-during-render (canonical external-prop-to-state pattern)
  const prevOpenRef = useRef(open);
  if (open !== prevOpenRef.current) {
    prevOpenRef.current = open;
    if (!open && value !== '') {
      setValue('');
    }
  }

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const parsed = parseNaturalDate(trimmed);
    await onQuickAdd({
      title: parsed.title,
      date: parsed.date,
      time: parsed.time,
    });

    // Friendly toast
    if (parsed.date) {
      const d = new Date(parsed.date);
      const when = isToday(d) ? 'today' : isTomorrow(d) ? 'tomorrow' : format(d, 'EEE, MMM d');
      const at = parsed.time ? ` at ${format(new Date(`2000-01-01T${parsed.time}`), 'h:mm a')}` : '';
      toast.success('Task added', { description: `${when}${at} — we'll find time.` });
    } else {
      toast.success('Task added', { description: 'In your inbox. Auto-schedule when ready.' });
    }

    onOpenChange(false);
  };

  const actions = useMemo(() => [
    { group: 'Navigate', items: [
      { id: 'view-day', label: 'Day view', icon: Calendar, shortcut: 'D', current: currentView === 'day', action: () => onNavigate('day') },
      { id: 'view-week', label: 'Week view', icon: Calendar, shortcut: 'W', current: currentView === 'week', action: () => onNavigate('week') },
      { id: 'view-month', label: 'Month view', icon: Calendar, shortcut: 'M', current: currentView === 'month', action: () => onNavigate('month') },
    ]},
    { group: 'Actions', items: [
      { id: 'schedule-all', label: 'Schedule everything in inbox', icon: Zap, shortcut: 'S', action: async () => { await onScheduleAll(); toast.success('Inbox planned', { description: 'Tasks placed into open slots.' }); } },
      { id: 'settings', label: 'Open settings', icon: Settings, shortcut: ',', action: () => { onOpenSettings(); onOpenChange(false); } },
    ]},
    { group: 'Appearance', items: [
      { id: 'theme', label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', icon: theme === 'dark' ? Sun : Moon, shortcut: 'T', action: () => { onToggleTheme(); onOpenChange(false); } },
    ]},
  ], [currentView, theme, onNavigate, onScheduleAll, onOpenSettings, onToggleTheme]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-[99] animate-fade-in"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="fixed left-1/2 top-[20vh] -translate-x-1/2 z-[100] w-[min(calc(100vw-2rem),580px)] bg-card border border-border rounded-2xl shadow-xl overflow-hidden animate-scale-in"
      >
        <Command label="Command palette" loop>
          <Command.Input
            value={value}
            onValueChange={setValue}
            placeholder="Type a command, or just type a task..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (value.trim()) {
                  e.preventDefault();
                  handleSubmit();
                }
              }
            }}
          />

          {parsedPreview && value.trim() && (
            <div className="px-4 py-2.5 border-b border-border bg-accent/40 flex items-center gap-2.5 text-[12px]">
              <Sparkles className="w-3.5 h-3.5 text-accent-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-foreground font-medium">"{parsedPreview.title}"</span>
                {parsedPreview.date && (
                  <span className="text-muted-foreground">
                    {' — '}
                    {isToday(new Date(parsedPreview.date)) ? 'today' : isTomorrow(new Date(parsedPreview.date)) ? 'tomorrow' : format(new Date(parsedPreview.date), 'EEE, MMM d')}
                  </span>
                )}
                {parsedPreview.time && (
                  <span className="text-muted-foreground"> at {format(new Date(`2000-01-01T${parsedPreview.time}`), 'h:mm a')}</span>
                )}
              </div>
              <kbd className="text-[10px] font-mono text-muted-foreground bg-card px-1.5 py-0.5 rounded border border-border">↵</kbd>
            </div>
          )}

          <Command.List>
            <Command.Empty>
              {value.trim()
                ? <>Press <kbd className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">↵</kbd> to add "{value.trim()}" as a task.</>
                : 'Type to search or add a task.'}
            </Command.Empty>

            {value.trim() && (
              <Command.Group heading="Add task">
                <Command.Item
                  value={`add-${value}`}
                  onSelect={handleSubmit}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add "<span className="font-medium">{parsedPreview?.title || value.trim()}</span>"</span>
                  <kbd>↵</kbd>
                </Command.Item>
              </Command.Group>
            )}

            {actions.map((group) => (
              <Command.Group key={group.group} heading={group.group}>
                {group.items.map((item: any) => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      item.action();
                      if (item.id !== 'schedule-all') onOpenChange(false);
                    }}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                    {item.current && <Check className="w-3 h-3 ml-auto text-primary" />}
                    {item.shortcut && !item.current && <kbd>{item.shortcut}</kbd>}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}

            <Command.Group heading="Tips">
              <Command.Item disabled value="tip-1">
                <span className="text-muted-foreground text-[12px]">Try <span className="font-mono text-foreground">"call dentist tomorrow at 3pm"</span></span>
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="font-mono bg-card px-1.5 py-0.5 rounded border border-border text-[10px]">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="font-mono bg-card px-1.5 py-0.5 rounded border border-border text-[10px]">↵</kbd>
                select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="font-mono bg-card px-1.5 py-0.5 rounded border border-border text-[10px]">esc</kbd>
                close
              </span>
            </div>
            <span className="flex items-center gap-1">
              <Inbox className="w-3 h-3" />
              {parsedPreview ? 'Smart add' : 'Quick add'}
            </span>
          </div>
        </Command>
      </div>
    </>
  );
}
