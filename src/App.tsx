import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useGoogleCalendar } from './hooks/useGoogleCalendar';
import { useTasks } from './hooks/useTasks';
import { useAuth } from './hooks/useAuth';
import { useSubtasks } from './hooks/useSubtasks';
import { useSubtasksBatch } from './hooks/useSubtasksBatch';
import { Header } from './components/Header';
import { TempoCalendar, type CalendarEventType } from './components/TempoCalendar';
import { BentoSidebar } from './components/BentoSidebar';
import { TaskList } from './components/TaskList';
import { TaskDialog } from './components/TaskDialog';
import { AuthDialog } from './components/AuthDialog';
import { SettingsPanel } from './components/SettingsPanel';
import { OnboardingTour } from './components/OnboardingTour';
import { CommandPalette } from './components/CommandPalette';
import { VersionBadge } from './components/VersionBadge';
import { FocusMode } from './components/FocusMode';
import { Button } from './components/ui/button';
import { LeftRail } from './components/LeftRail';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { ProductPreviewMock } from './components/ProductPreviewMock';
import { AlertCircle, Link2, RefreshCw, LogIn, Zap, Settings2, Calendar, Sparkles, ArrowRight, BarChart3, Layers } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { format } from 'date-fns';
import { detectConflicts } from './lib/rescheduler';
import { isSupabaseReady } from './lib/supabase';
import { generateRecurringOccurrences } from './lib/recurring';
import type { Task } from './lib/types';
import type { TaskInput } from './lib/tasks';
import { OccurrenceEditDialog, type OccurrenceEditScope } from './components/OccurrenceEditDialog';

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem('tempo-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return 'light'; // Default to light; user can explicitly choose dark
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('tempo-theme', theme);
  }, [theme]);

  return {
    theme,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    setTheme: (t: 'light' | 'dark') => setTheme(t),
    useSystemTheme: () => {
      try { localStorage.removeItem('tempo-theme'); } catch { /* ignore */ }
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    },
  };
}

interface WorkingHoursState {
  start: string;
  end: string;
}

function useWorkingHours(): [WorkingHoursState, (h: WorkingHoursState) => void] {
  const [state, setState] = useState<WorkingHoursState>(() => {
    if (typeof window === 'undefined') return { start: '09:00', end: '17:00' };
    try {
      const stored = localStorage.getItem('tempo-working-hours');
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return { start: '09:00', end: '17:00' };
  });
  useEffect(() => {
    try { localStorage.setItem('tempo-working-hours', JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);
  return [state, setState];
}

function App() {
  const auth = useAuth();
  const tasksHook = useTasks();

  // Ref for the focus-mode-open state, read inside the deletion handler
  // before `focusMode` is declared further down. Avoids putting `focusMode`
  // in the handler's useCallback deps (which would rebuild it on every
  // open/close and re-arm the calendar hook's onEventsDeleted callback).
  const focusModeOpenRef = useRef(false);

  // Two-way Google sync: when the calendar hook's polling detects that
  // one or more Google events have disappeared (the user deleted them
  // in Google Calendar), unlink the local tasks that were synced to
  // those events and toast the user. The task itself is preserved (we
  // just clear the link to the now-gone Google event).
  //
  // Focus Mode is an immersive Pomodoro surface — Sonner renders toasts
  // into a document-level portal so they would pop up on top of the
  // full-screen overlay and break the work session. We suppress the
  // toast while focus mode is open; the unlink still happens silently.
  const handleGoogleEventsDeleted = useCallback(async (deletedIds: string[]) => {
    if (deletedIds.length === 0) return;
    if (focusModeOpenRef.current) return; // Don't disturb Focus Mode
    try {
      const { count, titles } = await tasksHook.unlinkFromGoogleEvents(deletedIds);
      if (count > 0) {
        const description = titles.length <= 2
          ? titles.join(', ')
          : `${titles.slice(0, 2).join(', ')} and ${titles.length - 2} more`;
        toast.warning(
          count === 1 ? 'Task unlinked from Google' : `${count} tasks unlinked from Google`,
          { description: `Deleted in Google: ${description}` }
        );
      }
    } catch {
      // Failed to unlink deleted Google events — error surfaced via state
    }
  }, [tasksHook]);

  // `useGoogleCalendar` now consumes the Google access token from the
  // Supabase session directly (no GIS popups). The token is null until
  // the user signs in via Supabase Google OAuth, at which point the
  // hook auto-fetches events.
  const calendar = useGoogleCalendar({
    accessToken: auth.googleAccessToken,
    onEventsDeleted: handleGoogleEventsDeleted,
  });
  const { theme, toggleTheme, setTheme, useSystemTheme } = useTheme();
  // (useSystemTheme is passed to SettingsPanel below)
  const [workingHours, setWorkingHours] = useWorkingHours();

  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [occurrenceEdit, setOccurrenceEdit] = useState<{
    open: boolean;
    taskId: string;
    occurrenceDate: Date;
    changeType: 'move' | 'resize' | 'complete' | 'skip' | 'edit';
    pendingUpdate: { scheduled_start?: string; scheduled_end?: string; duration_minutes?: number } | null;
  }>({ open: false, taskId: '', occurrenceDate: new Date(), changeType: 'move', pendingUpdate: null });
  const [activeView, setActiveView] = useState<'calendar' | 'tasks' | 'insights'>('calendar');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [tempoView, setTempoView] = useState<'day' | 'week' | 'month'>('week');
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date }>(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeMonthsAhead = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    return { start: oneWeekAgo, end: threeMonthsAhead };
  });
  const [focusMode, setFocusMode] = useState<{ open: boolean; taskId: string | null }>({ open: false, taskId: null });
  // Keep the ref in sync so the deletion handler can read it without
  // being rebuilt on every focus-mode open/close.
  useEffect(() => {
    focusModeOpenRef.current = focusMode.open;
  }, [focusMode.open]);
  const didAuthTransitionRef = useRef(auth.isAuthenticated);

  const { tasks: allTasks, refresh } = tasksHook;

  // Subtasks: batch loader for the list view (chip), single-task hook
  // for the in-dialog editor. The dialog wrappers below also call
  // `subtasksBatch.refresh()` so the list chip stays in sync.
  const taskIds = useMemo(() => allTasks.map((t) => t.id), [allTasks]);
  const subtasksBatch = useSubtasksBatch(taskIds);
  const editingTaskSubtasks = useSubtasks(editingTask?.id ?? null);

  // Focus Mode: the task being focused on (may be null while loading or
  // if it was deleted) and the next 5 active, scheduled tasks for the
  // up-next queue.
  const focusCurrentTask = useMemo(() => {
    if (!focusMode.taskId) return null;
    return allTasks.find((t) => t.id === focusMode.taskId) || null;
  }, [focusMode.taskId, allTasks]);

  const focusQueue = useMemo(() => {
    return allTasks
      .filter((t) => t.status === 'active' && t.id !== focusMode.taskId && t.is_scheduled)
      .sort((a, b) => (a.scheduled_start || '').localeCompare(b.scheduled_start || ''))
      .slice(0, 5);
  }, [focusMode.taskId, allTasks]);

  const unscheduledCount = useMemo(
    () => allTasks.filter((t) => t.status === 'active' && !t.is_scheduled).length,
    [allTasks]
  );

  const allEvents = useMemo(() => {
    const googleEvents = calendar.events || [];
    // Only include non-repeating tasks here; repeating tasks generate
    // their own occurrences via generateRecurringOccurrences so the base
    // event is not duplicated.
    const taskEvents = allTasks
      .filter((t) => t.is_scheduled && t.scheduled_start && t.scheduled_end && t.frequency === 'once')
      .map((t) => ({
        id: `task-${t.id}`,
        title: t.title,
        description: t.description || '',
        startTime: t.scheduled_start!,
        endTime: t.scheduled_end!,
        calendar: 'tasks',
        source: 'task' as const,
        color: t.color,
      }));
    return [...googleEvents, ...taskEvents];
  }, [calendar.events, allTasks]);

  const tempoEvents = useMemo<CalendarEventType[]>(() => {
    const now = new Date();
    // Use the visible calendar range from TempoCalendar so recurring
    // occurrences are generated for the exact window the user is looking at.
    // Add a small buffer (1 week back, 1 week ahead) so drag-ghosts and
    // edge navigation still have data available.
    const from = new Date(visibleRange.start.getTime() - 7 * 24 * 60 * 60 * 1000);
    const horizon = new Date(visibleRange.end.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Base events from allEvents
    const baseEvents = allEvents.map((ev) => {
      const originalTask = ev.source === 'task'
        ? allTasks.find((t) => `task-${t.id}` === ev.id)
        : null;
      const isMissed = Boolean(
        originalTask?.status === 'missed' ||
        (originalTask?.is_scheduled &&
          originalTask?.scheduled_end &&
          new Date(originalTask.scheduled_end) < now)
      );
      const isCompleted = originalTask?.status === 'completed';
      const isSkipped = originalTask?.status === 'skipped';
      const isLocked = originalTask?.is_locked === true;
      const isBusyBlock = originalTask?.is_busy_block === true;
      const isRecurring = originalTask?.frequency !== 'once';        const variant: CalendarEventType['variant'] = isSkipped
        ? 'muted'
        : isCompleted
          ? 'muted'
          : isMissed
            ? 'destructive'
            : isLocked
              ? 'success'
              : isBusyBlock
                ? 'primary'
                : isRecurring
                  ? 'warning'
                  : ev.source === 'google'
                    ? 'muted'
                    : 'secondary';

      return {
        id: ev.id,
        title: ev.title,
        start: new Date(ev.startTime),
        end: new Date(ev.endTime),
        variant,
        data: {
          description: ev.description,
          source: ev.source,
          color: ev.color,
          is_locked: isLocked,
          is_missed: isMissed,            is_completed: isCompleted,
            is_skipped: isSkipped,
            is_busy_block: isBusyBlock,
            is_recurring: isRecurring,
          },
        };
      });

    // Generate recurring occurrences for repeating tasks
    const recurringEvents: CalendarEventType[] = [];
    for (const task of allTasks) {
      if (task.frequency !== 'once' && task.is_scheduled && task.scheduled_start && task.scheduled_end) {
        recurringEvents.push(...generateRecurringOccurrences(task, from, horizon));
      }
    }

    return [...baseEvents, ...recurringEvents];
  }, [allEvents, allTasks, visibleRange]);

  const handleSaveTask = async (input: TaskInput) => {
    if (editingTask) {
      await tasksHook.update(editingTask.id, input);
      setEditingTask(null);
    } else {
      await tasksHook.create(input);
    }
  };

  const handleQuickAdd = async (input: string | { title: string; date?: string; time?: string }) => {
    if (typeof input === 'string') {
      await tasksHook.create({ title: input, duration_minutes: 30, priority: 'NORMAL' });
      return;
    }
    await tasksHook.create({
      title: input.title,
      duration_minutes: 30,
      priority: 'NORMAL',
      ...(input.date ? { due_date: input.date } : {}),
      ...(input.time ? { due_time: input.time } : {}),
    });
  };

  // Open Focus Mode on the most relevant active task: prefer a task
  // scheduled for now or in the near future, then by priority + due date.
  const handleOpenFocus = useCallback(() => {
    const priorityRank: Record<string, number> = { ASAP: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    const active = allTasks.filter((t) => t.status === 'active');
    if (active.length === 0) {
      toast.error('No active tasks to focus on');
      return;
    }
    const sorted = [...active].sort((a, b) => {
      if (a.scheduled_start && !b.scheduled_start) return -1;
      if (!a.scheduled_start && b.scheduled_start) return 1;
      if (a.scheduled_start && b.scheduled_start) return a.scheduled_start.localeCompare(b.scheduled_start);
      const pa = priorityRank[a.priority] ?? 9;
      const pb = priorityRank[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
    });
    setFocusMode({ open: true, taskId: sorted[0].id });
  }, [allTasks]);

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setShowTaskDialog(true);
  };

  const handleScheduleAll = async () => {
    await tasksHook.scheduleAll(calendar.events);
  };

  const handleUnschedule = async (id: string) => {
    await tasksHook.unschedule(id);
  };

  const conflictCount = useMemo(() => {
    if (!calendar.isAuthenticated || allEvents.length === 0) return 0;
    const scheduled = allTasks.filter((t) => t.is_scheduled);
    return detectConflicts(scheduled, allEvents).length;
  }, [allEvents, calendar.isAuthenticated, allTasks]);

  // Auto-complete the parent task when all its subtasks are done.
  // Triggers only when the batch's subtask map or the editing task id
  // changes. Reads the current task from `tasksHook.tasks` via a ref so
  // the toast doesn't re-fire if the user toggles another subtask after
  // auto-completion.
  //
  // Debounced by 400ms: if a user is rapidly toggling the last remaining
  // subtask on/off, we wait for a stable "all done" state before firing
  // the auto-complete. This avoids two concurrent requests racing to
  // flip the parent's status.
  const tasksHookRef = useRef(tasksHook);
  useEffect(() => { tasksHookRef.current = tasksHook; }, [tasksHook]);

  useEffect(() => {
    if (!editingTask) return;
    const subs = subtasksBatch.byTaskId.get(editingTask.id) || [];
    if (subs.length === 0) return;
    if (!subs.every((s) => s.completed)) return;
    const timer = setTimeout(() => {
      // Re-read the latest state via the ref so the timer closure always
      // sees the current tasks array without adding it to the deps.
      const current = tasksHookRef.current.tasks.find((t) => t.id === editingTask.id);
      if (current && current.status === 'active') {
        tasksHookRef.current.complete(editingTask.id);
        toast.success('All subtasks done — task auto-completed!');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [subtasksBatch.byTaskId, editingTask?.id]);

  useEffect(() => {
    if (auth.isAuthenticated && !didAuthTransitionRef.current) refresh();
    didAuthTransitionRef.current = auth.isAuthenticated;
  }, [auth.isAuthenticated, refresh]);

  // Re-fetch Google events when the visible calendar range changes so
  // the user always sees imported events for the window they are looking at.
  // Mirror `calendar` into a ref so the effect can call `refreshEvents`
  // without listing the whole `calendar` object in its deps.
  const calendarRef = useRef(calendar);
  useEffect(() => { calendarRef.current = calendar; }, [calendar]);

  useEffect(() => {
    if (calendarRef.current.isAuthenticated && visibleRange) {
      void calendarRef.current.refreshEvents(visibleRange);
    }
  }, [visibleRange.start.toISOString(), visibleRange.end.toISOString()]);

  // Cmd/Ctrl+K opens command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // F8 opens focus mode (the Pomodoro workspace). F8 is rarely bound in
  // browsers, unlike Cmd+Shift+F which is "Find" in every major browser.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F8' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        handleOpenFocus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleOpenFocus]);

  const handleReschedule = async () => {
    setRescheduleLoading(true);
    try {
      await tasksHook.reschedule(calendar.events);
    } finally {
      setRescheduleLoading(false);
    }
  };

  /**
   * Trigger a Supabase Google OAuth re-auth with Calendar scopes. The
   * page will redirect to Google; on return, the session will include
   * a `provider_token` that flows into `auth.googleAccessToken` and
   * the calendar auto-connects.
   */
  const handleConnectCalendar = async () => {
    try {
      await auth.connectGoogleCalendar();
    } catch {
      // Failed to start Google Calendar OAuth — error surfaced via toast
    }
  };

  const handleSelectSlot = () => {
    setEditingTask(null);
    setShowTaskDialog(true);
  };

  const handleEventDrop = async (eventId: string, newStart: Date, newEnd: Date) => {
    if (!eventId.startsWith('task-')) {
      toast.error('Google events are read-only here');
      return;
    }
    const m = eventId.match(/^task-(.+?)(?:-occ-.+)?$/);
    const taskId = m?.[1] ?? '';
    if (!taskId) return;
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;

    // Recurring occurrences: show scope dialog
    if (eventId.includes('-occ-')) {
      const occDate = newStart;
      setOccurrenceEdit({
        open: true,
        taskId,
        occurrenceDate: occDate,
        changeType: 'move',
        pendingUpdate: {
          scheduled_start: newStart.toISOString(),
          scheduled_end: newEnd.toISOString(),
        },
      });
      return;
    }

    try {
      await tasksHook.update(taskId, {
        is_scheduled: true,
        scheduled_start: newStart.toISOString(),
        scheduled_end: newEnd.toISOString(),
      });
      toast.success('Moved', { description: `Rescheduled to ${format(newStart, 'EEE h:mm a')}` });
    } catch (err) {
      toast.error('Could not reschedule', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const handleEventResize = async (eventId: string, newStart: Date, newEnd: Date) => {
    if (!eventId.startsWith('task-')) {
      toast.error('Google events are read-only here');
      return;
    }
    const m = eventId.match(/^task-(.+?)(?:-occ-.+)?$/);
    const taskId = m?.[1] ?? '';
    if (!taskId) return;
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;

    // Recurring occurrences: show scope dialog
    if (eventId.includes('-occ-')) {
      const occDate = newStart;
      const durationMin = Math.round((newEnd.getTime() - newStart.getTime()) / (60 * 1000));
      setOccurrenceEdit({
        open: true,
        taskId,
        occurrenceDate: occDate,
        changeType: 'resize',
        pendingUpdate: {
          scheduled_start: newStart.toISOString(),
          scheduled_end: newEnd.toISOString(),
          duration_minutes: durationMin,
        },
      });
      return;
    }

    const durationMin = Math.round((newEnd.getTime() - newStart.getTime()) / (60 * 1000));
    if (durationMin < 5) {
      toast.error('Too short', { description: 'Events must be at least 5 minutes long' });
      return;
    }
    try {
      await tasksHook.update(taskId, {
        is_scheduled: true,
        scheduled_start: newStart.toISOString(),
        scheduled_end: newEnd.toISOString(),
        duration_minutes: durationMin,
      });
      toast.success('Resized', { description: `${format(newStart, 'h:mma')} – ${format(newEnd, 'h:mma')}` });
    } catch (err) {
      toast.error('Could not resize', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const handleSelectEvent = (event: CalendarEventType) => {
    if (!event.id.startsWith('task-')) return;
    const m = event.id.match(/^task-(.+?)(?:-occ-.+)?$/);
    const taskId = m?.[1] ?? '';
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;

    // Recurring occurrences: show scope dialog instead of jumping straight to the base task
    if (event.id.includes('-occ-')) {
      const occDate = event.start;
      setOccurrenceEdit({
        open: true,
        taskId,
        occurrenceDate: occDate,
        changeType: 'edit',
        pendingUpdate: null,
      });
      return;
    }

    handleEditTask(task);
  };

  // Supabase not configured: configuration error screen
  if (!isSupabaseReady()) {
    return (
      <div className="min-h-[100dvh] flex flex-col app-gradient">
        <Header
          isAuthenticated={false}
          onDisconnect={() => {}}
          onRefresh={() => {}}
          onScheduleAll={() => {}}
          unscheduledCount={0}
          user={null}
          onSignOut={async () => {}}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSettings={() => setShowSettings(true)}
        />
        <main className="flex-1 grid place-items-center px-6 py-12">
          <div className="w-full max-w-[460px] rounded-2xl bg-card p-8 shadow-md border border-border">
            <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center mb-5">
              <Settings2 className="w-5 h-5 text-destructive" />
            </div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight">Configuration Required</h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Tempo needs Supabase environment variables to function. Add these to your Vercel project settings:
            </p>
            <div className="mt-4 p-3.5 bg-muted/50 rounded-xl text-[12px] font-mono text-muted-foreground space-y-1.5 border border-border">
              <div>VITE_SUPABASE_URL=https://your-project.supabase.co</div>
              <div>VITE_SUPABASE_ANON_KEY=your-anon-key</div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              Find these in your{' '}
              <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline underline-offset-2 hover:text-primary/80">
                Supabase dashboard
              </a>
              {' '}→ Project Settings → API.
            </p>
          </div>
        </main>
      <VersionBadge />
    </div>
  );
}

  // Not signed in to Tempo: sign-in prompt
  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-[100dvh] flex flex-col app-gradient">
        <Header
          isAuthenticated={false}
          onDisconnect={calendar.disconnect}
          onRefresh={calendar.refreshEvents}
          onScheduleAll={handleScheduleAll}
          unscheduledCount={unscheduledCount}
          user={auth.user}
          onSignOut={auth.signOut}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSettings={() => setShowSettings(true)}
        />
        <main className="flex-1 grid lg:grid-cols-[1.1fr_1fr] gap-8 items-center px-6 lg:px-16 py-10 max-w-[1280px] mx-auto w-full">
          {/* Left: copy + CTA */}
          <div className="max-w-[520px]">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-3 h-3" />
              Calendar + tasks, finally
            </div>
            <h1 className="mt-5 text-4xl lg:text-5xl display-1 text-foreground leading-[1.05]">
              Tasks find their own time.
            </h1>
            <p className="mt-5 text-base lg:text-lg text-muted-foreground leading-relaxed">
              Tempo reads your calendar, finds open slots, and places your work where it belongs. You describe the task. We handle the schedule.
            </p>

            {/* Value props */}
            <ul className="mt-7 space-y-3">
              {[
                { icon: Calendar, title: 'Auto-schedule', body: 'Type a task, pick a time, done. Tempo places it into open space on your Google Calendar.' },
                { icon: Layers, title: 'Smart reschedule', body: 'When something shifts, one click rebuilds a conflict-free plan for the rest of the day.' },
                { icon: BarChart3, title: 'Streaks + insights', body: 'Track what you actually ship. Daily streak, completion rate, and overdue counts at a glance.' },
              ].map((p) => (
                <li key={p.title} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <p.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{p.title}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{p.body}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex items-center gap-3 flex-wrap">
              <Button
                onClick={() => setShowAuthDialog(true)}
                size="lg"
                className="h-12 px-6 gap-2 text-sm font-semibold shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                Sign in to get started
                <ArrowRight className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Free during beta. No credit card.
              </span>
            </div>
          </div>

          {/* Right: product preview (desktop only) */}
          <div className="hidden lg:block">
            <ProductPreviewMock />
          </div>
          </main>
        <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        theme={theme}
        onSetTheme={setTheme}
        onUseSystemTheme={useSystemTheme}
        user={auth.user}
        isGoogleConnected={calendar.isAuthenticated}
        onDisconnectGoogle={calendar.disconnect}
        onSignOut={auth.signOut}
        workingHours={workingHours}
        onWorkingHoursChange={setWorkingHours}
        lastSyncAt={calendar.lastSyncAt}
        syncedEventCount={calendar.events.length}
        syncError={calendar.error?.message ?? null}
        isSyncing={calendar.isLoading}
        calendars={calendar.calendars}
        selectedCalendarIds={calendar.selectedCalendarIds}
        onToggleCalendar={calendar.toggleCalendarSelection}
      />
      </div>
    );
  }

  // Not authenticated with Google: connect calendar screen
  if (!calendar.isAuthenticated) {
    if (!calendar.isLoaded || calendar.isLoading) {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center app-gradient">
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading</span>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-[100dvh] flex flex-col app-gradient">
        <Header
          isAuthenticated={false}
          onDisconnect={calendar.disconnect}
          onRefresh={calendar.refreshEvents}
          onScheduleAll={handleScheduleAll}
          unscheduledCount={unscheduledCount}
          user={auth.user}
          onSignOut={auth.signOut}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSettings={() => setShowSettings(true)}
        />
        <main className="flex-1 grid lg:grid-cols-[1.1fr_1fr] gap-8 items-center px-6 lg:px-16 py-10 max-w-[1280px] mx-auto w-full overflow-y-auto tempo-scrollbar">
            {/* Left: copy + CTA */}
            <div className="max-w-[520px]">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="w-3 h-3" />
                One last step
              </div>
            <h1 className="mt-5 text-4xl lg:text-5xl display-1 text-foreground leading-[1.05]">
              Connect your calendar.
            </h1>
              <p className="mt-5 text-base lg:text-lg text-muted-foreground leading-relaxed">
                Tempo reads your Google Calendar to find open time. We&rsquo;ll place your tasks where they actually fit.
              </p>

              {/* Value props */}
              <ul className="mt-7 space-y-3">
                {[
                  { icon: Calendar, title: 'Import events', body: 'Existing meetings show up instantly as busy blocks. Tasks will never overlap them.' },
                  { icon: Layers, title: 'Find space', body: 'Tempo scans your week for open slots that match your working hours and preferences.' },
                  { icon: BarChart3, title: 'Sync tasks', body: 'Scheduled tasks push back to Google Calendar. One source of truth, always.' },
                ].map((p) => (
                  <li key={p.title} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <p.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{p.title}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">{p.body}</div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex items-center gap-3 flex-wrap">
                <Button
                  onClick={handleConnectCalendar}
                  disabled={calendar.isLoading}
                  size="lg"
                  className="h-12 px-6 gap-2 text-sm font-semibold shadow-sm"
                >
                  <Link2 className="w-4 h-4" />
                  {calendar.isLoading ? 'Connecting…' : 'Connect Google Calendar'}
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  You&rsquo;ll be redirected to Google to grant read access. You can disconnect anytime.
                </span>
              </div>

              {calendar.error && (
                <div className="mt-5 p-4 bg-destructive/5 border border-destructive/20 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-destructive text-left leading-relaxed">{calendar.error.message}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Right: product preview (desktop only) */}
            <div className="hidden lg:block">
              <ProductPreviewMock />
            </div>
          </main>
      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        theme={theme}
        onSetTheme={setTheme}
        onUseSystemTheme={useSystemTheme}
        user={auth.user}
        isGoogleConnected={false}
        onDisconnectGoogle={() => {}}
        onSignOut={auth.signOut}
        workingHours={workingHours}
        onWorkingHoursChange={setWorkingHours}
        lastSyncAt={calendar.lastSyncAt}
        syncedEventCount={0}
        syncError={calendar.error?.message ?? null}
        isSyncing={calendar.isLoading}
        calendars={[]}
        selectedCalendarIds={[]}
        onToggleCalendar={() => {}}
      />
      </div>
    );
  }

  // Authenticated: full workspace
  return (
    <div className="h-[100dvh] flex app-gradient">        <LeftRail
          activeView={activeView}
          onViewChange={setActiveView}
          isAuthenticated={calendar.isAuthenticated}
          isLoaded={calendar.isLoaded}
          isLoading={calendar.isLoading}
          error={calendar.error?.message ?? null}
          lastSyncAt={calendar.lastSyncAt}
          onConnect={handleConnectCalendar}
          onDisconnect={calendar.disconnect}
          onRefresh={calendar.refreshEvents}
          onScheduleAll={handleScheduleAll}
          unscheduledCount={unscheduledCount}
          user={auth.user}
          onSignIn={() => setShowAuthDialog(true)}
          onSignOut={auth.signOut}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSettings={() => setShowSettings(true)}
        />
      <div
        className="flex-1 flex flex-col min-w-0"
        inert={focusMode.open && calendar.isAuthenticated ? true : undefined}
      >
      <Header
        isAuthenticated={calendar.isAuthenticated}
        onDisconnect={calendar.disconnect}
        onRefresh={calendar.refreshEvents}
        onScheduleAll={handleScheduleAll}
        unscheduledCount={unscheduledCount}
        user={auth.user}
        onSignOut={auth.signOut}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setShowSettings(true)}
        onOpenFocus={handleOpenFocus}
      />

      {/* Error banners */}
      {calendar.error && (
        <div role="alert" className="flex items-center gap-2 px-4 py-2 bg-destructive/5 border-b border-destructive/20 text-sm text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {calendar.error.message}
        </div>
      )}

      {tasksHook.error && (
        <div role="alert" className="flex items-center gap-2 px-4 py-2 bg-destructive/5 border-b border-destructive/20 text-sm text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {tasksHook.error}
        </div>
      )}

      {tasksHook.syncErrors.length > 0 && (
        <div
          role="alert"
          className="flex items-center gap-3 px-4 py-2.5 bg-destructive/5 border-b border-destructive/20 text-sm text-destructive cursor-pointer"
          onClick={tasksHook.clearSyncErrors}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 min-w-0">
            {tasksHook.syncErrors.length === 1
              ? tasksHook.syncErrors[0]
              : `${tasksHook.syncErrors.length} sync errors`}
          </span>
          <span className="text-[10px] font-medium opacity-70">Click to dismiss</span>
        </div>
      )}

      {/* Smart recalc banner */}
      {conflictCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          data-onboarding="conflict-banner"
          className="flex items-center gap-3 px-4 py-2.5 bg-warning/5 border-b border-warning/20 animate-slide-down"
        >
          <div className="w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm text-warning font-semibold">
              {conflictCount} scheduling {conflictCount === 1 ? 'conflict' : 'conflicts'} detected
            </span>
            <p className="text-xs text-muted-foreground leading-snug">
              We can rebuild a clean plan in one click.
            </p>
          </div>
          <button
            onClick={handleReschedule}
            disabled={rescheduleLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-warning px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-warning/90 disabled:opacity-60 transition-colors shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rescheduleLoading ? 'animate-spin' : ''}`} />
            Recalculate
          </button>
        </div>
      )}

      {/* Main workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Calendar workspace */}
        <div
          data-onboarding="calendar"
          className={`flex-1 flex flex-col min-w-0 p-3 gap-3 ${activeView === 'calendar' ? '' : activeView === 'insights' ? 'hidden' : 'hidden lg:flex'}`}
        >
          <TempoCalendar
            events={tempoEvents}
            defaultView={tempoView}
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
            onViewRangeChange={setVisibleRange}
            startHour={parseInt(workingHours.start.split(':')[0], 10)}
            endHour={parseInt(workingHours.end.split(':')[0], 10) + 2}
            className="min-h-0"
          />
        </div>

        {/* Sidebar — Bento on calendar view, full TaskList on tasks view, hidden on insights */}
        <div
          data-onboarding="quick-add"
          className={`w-80 lg:w-[360px] border-l border-border flex flex-col shrink-0 bg-card ${activeView === 'calendar' ? '' : 'hidden lg:flex'} ${activeView === 'insights' ? 'lg:hidden' : ''}`}
        >
          {activeView === 'calendar' ? (
            <BentoSidebar
              tasks={allTasks}
              conflictCount={conflictCount}
              isLoading={tasksHook.isLoading}
              onQuickAdd={handleQuickAdd}
              onAddTask={() => { setEditingTask(null); setShowTaskDialog(true); }}
              onSelectTask={handleEditTask}
              onViewAllTasks={() => setActiveView('tasks')}
              onScheduleAll={handleScheduleAll}
              isScheduling={rescheduleLoading}
            />
          ) : activeView === 'tasks' ? (
            <TaskList
              tasks={tasksHook.tasks}
              isLoading={tasksHook.isLoading}
              onAddTask={() => { setEditingTask(null); setShowTaskDialog(true); }}
              onEditTask={handleEditTask}
              onDeleteTask={tasksHook.remove}
              onScheduleAll={handleScheduleAll}
              onUnschedule={handleUnschedule}
              onCompleteTask={tasksHook.complete}
              onReopenTask={tasksHook.reopen}
              taskLists={tasksHook.taskLists}
              onBackToCalendar={() => setActiveView('calendar')}
              subtasksByTaskId={subtasksBatch.byTaskId}
            />
          ) : null}
        </div>

        {/* Insights view — full-screen analytics panel */}
        {activeView === 'insights' && (
          <AnalyticsPanel
            tasks={tasksHook.tasks}
            onClose={() => setActiveView('calendar')}
          />
        )}
      </div>

      {/* Dialogs */}
      <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />

      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        theme={theme}
        onSetTheme={setTheme}
        onUseSystemTheme={useSystemTheme}
        user={auth.user}
        isGoogleConnected={calendar.isAuthenticated}
        onDisconnectGoogle={calendar.disconnect}
        onSignOut={auth.signOut}
        workingHours={workingHours}
        onWorkingHoursChange={setWorkingHours}
        lastSyncAt={calendar.lastSyncAt}
        syncedEventCount={calendar.events.length}
        syncError={calendar.error?.message ?? null}
        isSyncing={calendar.isLoading}
        calendars={calendar.calendars}
        selectedCalendarIds={calendar.selectedCalendarIds}
        onToggleCalendar={calendar.toggleCalendarSelection}
      />

      <OnboardingTour onComplete={() => { /* persisted in localStorage */ }} />

      {occurrenceEdit.open && (
        <OccurrenceEditDialog
          key={`${occurrenceEdit.taskId}-${occurrenceEdit.changeType}-${occurrenceEdit.occurrenceDate.toISOString()}`}
          open={occurrenceEdit.open}
          onClose={() => setOccurrenceEdit((p) => ({ ...p, open: false }))}
          onConfirm={async (scope: OccurrenceEditScope) => {
            const { taskId, occurrenceDate, changeType, pendingUpdate } = occurrenceEdit;
            const task = allTasks.find((t) => t.id === taskId);
            if (!task) return;
            const dateKey = format(occurrenceDate, 'yyyy-MM-dd');

            try {
              if (scope === 'this') {
                // Create an occurrence override for this specific date
                const overrides = task.occurrence_overrides || {};
                if (changeType === 'skip' || changeType === 'complete') {
                  await tasksHook.update(taskId, {
                    occurrence_overrides: {
                      ...overrides,
                      [dateKey]: {
                        status: changeType === 'skip' ? 'skipped' : 'completed',
                        scheduled_start: task.scheduled_start ?? undefined,
                        scheduled_end: task.scheduled_end ?? undefined,
                      },
                    },
                  });
                  toast.success(changeType === 'skip' ? 'Skipped' : 'Completed', {
                    description: `${format(occurrenceDate, 'MMM d')}`,
                  });
                } else if (changeType === 'edit') {
                  // For "edit this", open the base task dialog
                  setOccurrenceEdit((p) => ({ ...p, open: false }));
                  handleEditTask(task);
                  return;
                } else if (pendingUpdate) {
                  await tasksHook.update(taskId, {
                    occurrence_overrides: {
                      ...overrides,
                      [dateKey]: {
                        scheduled_start: pendingUpdate.scheduled_start,
                        scheduled_end: pendingUpdate.scheduled_end,
                      },
                    },
                  });
                  toast.success('Updated', { description: `${format(occurrenceDate, 'MMM d')}` });
                }
              } else if (scope === 'all') {
                // Update the base task
                if (changeType === 'skip' || changeType === 'complete') {
                  await tasksHook.update(taskId, {
                    status: changeType === 'skip' ? 'skipped' : 'completed',
                  });
                } else if (changeType === 'edit') {
                  // For "edit all", just open the base task dialog
                  setOccurrenceEdit((p) => ({ ...p, open: false }));
                  handleEditTask(task);
                  return;
                } else if (pendingUpdate) {
                  await tasksHook.update(taskId, {
                    scheduled_start: pendingUpdate.scheduled_start,
                    scheduled_end: pendingUpdate.scheduled_end,
                    ...(pendingUpdate.duration_minutes ? { duration_minutes: pendingUpdate.duration_minutes } : {}),
                  });
                }
                toast.success('All occurrences updated');
              } else if (scope === 'future') {
                // Change recurrence_end to stop at the occurrence date, then create a new task
                if (changeType === 'skip') {
                  // End the series before this occurrence: all future occurrences are skipped
                  const prevDate = new Date(occurrenceDate.getTime() - 24 * 60 * 60 * 1000);
                  const newRecurrenceEnd = format(prevDate, 'yyyy-MM-dd');
                  await tasksHook.update(taskId, {
                    recurrence_end: newRecurrenceEnd,
                  });
                  toast.success('Series ended', { description: `From ${format(occurrenceDate, 'MMM d')} onwards` });
                } else if (changeType === 'complete') {
                  // Split the series: end old task, create new completed task from this occurrence
                  const prevDate = new Date(occurrenceDate.getTime() - 24 * 60 * 60 * 1000);
                  const newRecurrenceEnd = format(prevDate, 'yyyy-MM-dd');
                  await tasksHook.update(taskId, {
                    recurrence_end: newRecurrenceEnd,
                  });
                  const baseStart = new Date(task.scheduled_start!);
                  const baseEnd = new Date(task.scheduled_end!);
                  const durationMs = baseEnd.getTime() - baseStart.getTime();
                  // Ensure the new task's preferred_days includes the occurrence day so the
                  // first generated occurrence falls on the exact occurrence date.
                  // Only do this for weekly tasks; daily tasks should keep all days.
                  const isoDay = occurrenceDate.getDay() === 0 ? 7 : occurrenceDate.getDay();
                  const preferredDays = new Set(task.preferred_days ?? []);
                  if (task.frequency === 'weekly') {
                    preferredDays.add(isoDay);
                  }
                  // For open-ended completed series, cap the new task at the occurrence date
                  // so it doesn't generate muted occurrences forever.
                  const newRecurrenceEndCap = task.recurrence_end || format(occurrenceDate, 'yyyy-MM-dd');
                  await tasksHook.create({
                    title: task.title,
                    description: task.description || undefined,
                    duration_minutes: task.duration_minutes,
                    priority: task.priority,
                    frequency: task.frequency,
                    due_date: task.due_date || undefined,
                    color: task.color,
                    tags: task.tags || undefined,
                    preferred_days: task.frequency === 'daily'
                      ? task.preferred_days || undefined
                      : Array.from(preferredDays),
                    is_habit: task.is_habit,
                    can_split: task.can_split,
                    is_busy_block: task.is_busy_block,
                    ignore_if_cannot_schedule: task.ignore_if_cannot_schedule,
                    can_balance_across_days: task.can_balance_across_days,
                    buffer_before_minutes: task.buffer_before_minutes || undefined,
                    buffer_after_minutes: task.buffer_after_minutes || undefined,
                    notes: task.notes || undefined,
                    is_locked: task.is_locked,
                    auto_schedule: task.auto_schedule,
                    scheduling_cutoff_weeks: task.scheduling_cutoff_weeks,
                    preferred_time_windows: task.preferred_time_windows || undefined,
                    list_id: task.list_id || undefined,
                    scheduling_profile_id: task.scheduling_profile_id || undefined,
                    is_recurring: true,
                    recurrence_end: newRecurrenceEndCap,
                    scheduled_start: occurrenceDate.toISOString(),
                    scheduled_end: new Date(occurrenceDate.getTime() + durationMs).toISOString(),
                    is_scheduled: true,
                    status: 'completed',
                  });
                  toast.success('Series completed', { description: `From ${format(occurrenceDate, 'MMM d')} onwards` });
                } else if (changeType === 'edit') {
                  // For "edit future", open the base task dialog (user can adjust recurrence_end)
                  setOccurrenceEdit((p) => ({ ...p, open: false }));
                  handleEditTask(task);
                  return;
                } else if (pendingUpdate) {
                  // Split the series: set recurrence_end to the day before this occurrence
                  const prevDate = new Date(occurrenceDate.getTime() - 24 * 60 * 60 * 1000);
                  const newRecurrenceEnd = format(prevDate, 'yyyy-MM-dd');
                  await tasksHook.update(taskId, {
                    recurrence_end: newRecurrenceEnd,
                  });
                  // Create a new task with the updated schedule starting from this occurrence
                  await tasksHook.create({
                    title: task.title,
                    description: task.description || undefined,
                    duration_minutes: pendingUpdate.duration_minutes || task.duration_minutes,
                    priority: task.priority,
                    frequency: task.frequency,
                    due_date: task.due_date || undefined,
                    color: task.color,
                    tags: task.tags || undefined,
                    preferred_days: task.preferred_days || undefined,
                    is_habit: task.is_habit,
                    can_split: task.can_split,
                    is_busy_block: task.is_busy_block,
                    ignore_if_cannot_schedule: task.ignore_if_cannot_schedule,
                    can_balance_across_days: task.can_balance_across_days,
                    buffer_before_minutes: task.buffer_before_minutes || undefined,
                    buffer_after_minutes: task.buffer_after_minutes || undefined,
                    notes: task.notes || undefined,
                    is_locked: task.is_locked,
                    auto_schedule: task.auto_schedule,
                    scheduling_cutoff_weeks: task.scheduling_cutoff_weeks,
                    preferred_time_windows: task.preferred_time_windows || undefined,
                    list_id: task.list_id || undefined,
                    scheduling_profile_id: task.scheduling_profile_id || undefined,
                    is_recurring: true,
                    recurrence_end: task.recurrence_end || undefined,
                    scheduled_start: pendingUpdate.scheduled_start,
                    scheduled_end: pendingUpdate.scheduled_end,
                    is_scheduled: true,
                  });
                  toast.success('Series split', { description: 'Future occurrences use the new schedule' });
                }
              }
            } catch (err) {
              toast.error('Could not update', { description: err instanceof Error ? err.message : 'Unknown error' });
            } finally {
              setOccurrenceEdit((p) => ({ ...p, open: false }));
            }
          }}
          taskTitle={allTasks.find((t) => t.id === occurrenceEdit.taskId)?.title ?? ''}
          occurrenceDate={occurrenceEdit.occurrenceDate}
          changeType={occurrenceEdit.changeType}
        />
      )}

      {showTaskDialog && (
        <TaskDialog
          open={showTaskDialog}
          onClose={() => { setShowTaskDialog(false); setEditingTask(null); }}
          onSave={handleSaveTask}
          initial={editingTask ? {
            title: editingTask.title,
            description: editingTask.description || undefined,
            duration_minutes: editingTask.duration_minutes,
            priority: editingTask.priority,
            frequency: editingTask.frequency,
            due_date: editingTask.due_date || undefined,
            due_time: editingTask.due_time || undefined,
            color: editingTask.color,
            tags: editingTask.tags || undefined,
            preferred_days: editingTask.preferred_days || undefined,
            is_habit: editingTask.is_habit,
            can_split: editingTask.can_split,
            is_busy_block: editingTask.is_busy_block,
            ignore_if_cannot_schedule: editingTask.ignore_if_cannot_schedule,
            can_balance_across_days: editingTask.can_balance_across_days,
            buffer_before_minutes: editingTask.buffer_before_minutes || undefined,
            buffer_after_minutes: editingTask.buffer_after_minutes || undefined,
            notes: editingTask.notes || undefined,
            deadline: editingTask.deadline || undefined,
            is_locked: editingTask.is_locked,
            auto_schedule: editingTask.auto_schedule,
            scheduling_cutoff_weeks: editingTask.scheduling_cutoff_weeks,
            preferred_time_windows: editingTask.preferred_time_windows || undefined,
            list_id: editingTask.list_id || undefined,
            scheduling_profile_id: editingTask.scheduling_profile_id || undefined,
          } : undefined}
          title={editingTask ? 'Edit task' : 'New task'}
          taskLists={tasksHook.taskLists}
          schedulingProfiles={tasksHook.schedulingProfiles}
          taskId={editingTask?.id}
          subtasksProps={editingTask ? {
            subtasks: editingTaskSubtasks.subtasks,
            onAdd: async (input) => {
              const r = await editingTaskSubtasks.add(input);
              await subtasksBatch.refresh();
              return r;
            },
            onUpdate: async (id, updates) => {
              const r = await editingTaskSubtasks.update(id, updates);
              await subtasksBatch.refresh();
              return r;
            },
            onRemove: async (id) => {
              await editingTaskSubtasks.remove(id);
              await subtasksBatch.refresh();
            },
            onReorder: async (orderedIds) => {
              await editingTaskSubtasks.reorder(orderedIds);
              await subtasksBatch.refresh();
            },
          } : undefined}
        />
      )}

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onQuickAdd={handleQuickAdd}
        onNavigate={setTempoView}
        onOpenSettings={() => setShowSettings(true)}
        onToggleTheme={toggleTheme}
        onScheduleAll={handleScheduleAll}
        currentView={tempoView}
        theme={theme}
      />

      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: '!rounded-xl !border !border-border !bg-card !text-foreground !shadow-lg !text-sm',
            description: '!text-muted-foreground !text-xs',
          },
        }}
        richColors
        closeButton
      />

      <VersionBadge />

      {focusMode.open && calendar.isAuthenticated && (
        <FocusMode
          open={focusMode.open}
          currentTask={focusCurrentTask}
          queue={focusQueue}
          onClose={() => setFocusMode({ open: false, taskId: null })}
          onCompleteTask={async (id) => {
            await tasksHook.complete(id);
            const next = focusQueue[0];
            if (next) setFocusMode({ open: true, taskId: next.id });
            else setFocusMode({ open: false, taskId: null });
          }}
          onSwitchTask={(taskId) => setFocusMode({ open: true, taskId })}
        />
      )}
      </div>
    </div>
  );
}

export default App;

