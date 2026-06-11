import { useState, useMemo, useEffect, useRef } from 'react';
import { useGoogleCalendar } from './hooks/useGoogleCalendar';
import { useTasks } from './hooks/useTasks';
import { useAuth } from './hooks/useAuth';
import { Header } from './components/Header';
import { BigCalendar, type CalendarEventType } from './components/BigCalendar';
import { TaskList } from './components/TaskList';
import { TaskDialog } from './components/TaskDialog';
import { AuthDialog } from './components/AuthDialog';
import { Button } from './components/ui/button';
import { AlertCircle, Link2, RefreshCw, LogIn, Zap, Settings2 } from 'lucide-react';
import { detectConflicts } from './lib/rescheduler';
import { isSupabaseReady } from './lib/supabase';
import type { Task } from './lib/types';
import type { TaskInput } from './lib/tasks';

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem('tempo-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('tempo-theme', theme);
  }, [theme]);

  return { theme, toggleTheme: () => setTheme(t => t === 'dark' ? 'light' : 'dark') };
}

function App() {
  const auth = useAuth();
  const calendar = useGoogleCalendar();
  const tasksHook = useTasks();
  const { theme, toggleTheme } = useTheme();

  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeView, setActiveView] = useState<'calendar' | 'tasks'>('calendar');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const didAuthTransitionRef = useRef(auth.isAuthenticated);

  const { tasks: allTasks, refresh } = tasksHook;

  const unscheduledCount = useMemo(
    () => allTasks.filter((t) => t.status === 'active' && !t.is_scheduled).length,
    [allTasks]
  );

  const allEvents = useMemo(() => {
    const googleEvents = calendar.events || [];
    const taskEvents = allTasks
      .filter((t) => t.is_scheduled && t.scheduled_start && t.scheduled_end)
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

  const bigCalendarEvents = useMemo<CalendarEventType[]>(() => {
    const now = new Date();
    return allEvents.map((ev) => {
      const originalTask = ev.source === 'task'
        ? allTasks.find(t => `task-${t.id}` === ev.id)
        : null;

      return {
        id: ev.id,
        title: ev.title,
        start: new Date(ev.startTime),
        end: new Date(ev.endTime),
        variant: ev.source === 'task' ? 'secondary' as const : 'primary' as const,
        data: {
          description: ev.description,
          source: ev.source,
          color: ev.color,
          is_locked: originalTask?.is_locked ?? false,
          is_missed: originalTask?.status === 'missed' ||
            (originalTask?.is_scheduled && originalTask?.scheduled_end && new Date(originalTask.scheduled_end) < now),
          is_flexible: originalTask?.is_scheduled && !originalTask?.is_locked,
          is_completed: originalTask?.status === 'completed',
        },
      };
    });
  }, [allEvents, allTasks]);

  const handleSaveTask = async (input: TaskInput) => {
    if (editingTask) {
      await tasksHook.update(editingTask.id, input);
      setEditingTask(null);
    } else {
      await tasksHook.create(input);
    }
  };

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

  // Refresh tasks when user transitions from unauthenticated to authenticated
  useEffect(() => {
    if (auth.isAuthenticated && !didAuthTransitionRef.current) {
      refresh();
    }
    didAuthTransitionRef.current = auth.isAuthenticated;
  }, [auth.isAuthenticated, refresh]);

  const handleReschedule = async () => {
    setRescheduleLoading(true);
    try {
      await tasksHook.reschedule(calendar.events);
    } finally {
      setRescheduleLoading(false);
    }
  };

  const handleSelectSlot = () => {
    setEditingTask(null);
    setShowTaskDialog(true);
  };

  const handleSelectEvent = (event: CalendarEventType) => {
    if (!event.id.startsWith('task-')) return;
    const taskId = event.id.replace('task-', '');
    const task = allTasks.find((t) => t.id === taskId);
    if (task) handleEditTask(task);
  };

  // Supabase not configured: show configuration error
  if (!isSupabaseReady()) {
    return (
      <div className="min-h-[100dvh] flex flex-col app-gradient">
        <Header
          activeView={activeView}
          onViewChange={setActiveView}
          isAuthenticated={false}
          isLoaded={false}
          isLoading={false}
          error={null}
          onConnect={() => {}}
          onDisconnect={() => {}}
          onRefresh={() => {}}
          onScheduleAll={() => {}}
          unscheduledCount={0}
          user={null}
          onSignIn={() => {}}
          onSignOut={async () => {}}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <main className="flex-1 grid place-items-center px-6">
          <div className="w-full max-w-[460px] rounded-xl bg-card p-8 shadow-sm border border-border">
            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 mb-4">
              <Settings2 className="w-5 h-5 text-destructive" />
            </div>
            <h1 className="text-base font-semibold text-foreground">Configuration Required</h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              This app needs Supabase environment variables to function. Add these to your Vercel project settings:
            </p>
            <div className="mt-4 p-3 bg-muted/50 rounded-lg text-xs font-mono text-muted-foreground space-y-1">
              <div>VITE_SUPABASE_URL=https://your-project.supabase.co</div>
              <div>VITE_SUPABASE_ANON_KEY=your-anon-key</div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Find these in your{' '}
              <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">Supabase dashboard</a>
              {' '}→ Project Settings → API.
            </p>
          </div>
        </main>
        <div className="fixed bottom-1.5 right-3 text-[10px] text-muted-foreground/25 select-none pointer-events-none z-50">
          {TEMPO_VERSION}
        </div>
      </div>
    );
  }

  // Not signed in to Tempo: show auth prompt
  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-[100dvh] flex flex-col app-gradient">
        <Header
          activeView={activeView}
          onViewChange={setActiveView}
          isAuthenticated={false}
          isLoaded={calendar.isLoaded}
          isLoading={calendar.isLoading}
          error={calendar.error}
          onConnect={calendar.connect}
          onDisconnect={calendar.disconnect}
          onRefresh={calendar.refreshEvents}
          onScheduleAll={handleScheduleAll}
          unscheduledCount={unscheduledCount}
          user={auth.user}
          onSignIn={() => setShowAuthDialog(true)}
          onSignOut={auth.signOut}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <main className="flex-1 grid place-items-center px-6">
          <div className="w-full max-w-[440px] rounded-xl bg-card p-8 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <span className="text-base font-bold text-primary-foreground">T</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-foreground">Tempo Calendar</h1>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  Tasks find their own time. Sign in to connect your calendar and we'll handle the rest.
                </p>
              </div>
            </div>
            <Button onClick={() => setShowAuthDialog(true)} className="mt-6 w-full gap-2 h-10">
              <LogIn className="w-4 h-4" />
              Sign in to Tempo
            </Button>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {['Auto-schedule', 'Calendar sync', 'Smart recalc'].map((label) => (
                <div key={label} className="rounded-lg bg-muted/50 px-2 py-2.5 text-xs font-medium text-muted-foreground">
                  {label}
                </div>
              ))}
            </div>
          </div>
        </main>
        <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
      </div>
    );
  }

  // Unauthenticated Google: clean setup screen
  if (!calendar.isAuthenticated) {
    if (!calendar.isLoaded || calendar.isLoading) {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center app-gradient">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
            <span className="text-sm">Loading</span>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-[100dvh] flex flex-col app-gradient">
        <Header
          activeView={activeView}
          onViewChange={setActiveView}
          isAuthenticated={false}
          isLoaded={calendar.isLoaded}
          isLoading={calendar.isLoading}
          error={calendar.error}
          onConnect={calendar.connect}
          onDisconnect={calendar.disconnect}
          onRefresh={calendar.refreshEvents}
          onScheduleAll={handleScheduleAll}
          unscheduledCount={unscheduledCount}
          user={auth.user}
          onSignIn={() => setShowAuthDialog(true)}
          onSignOut={auth.signOut}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <main className="flex-1 grid place-items-center px-6">
          <div className="w-full max-w-[440px] rounded-xl bg-card p-8 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <span className="text-base font-bold text-primary-foreground">T</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-foreground">Tempo Calendar</h1>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  Tasks find their own time. Connect your calendar and we’ll handle the rest.
                </p>
              </div>
            </div>
            <Button onClick={calendar.connect} disabled={calendar.isLoading} className="mt-6 w-full gap-2 h-10">
              <Link2 className="w-4 h-4" />
              {calendar.isLoading ? 'Connecting...' : 'Connect Google Calendar'}
            </Button>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {['Import events', 'Find space', 'Sync tasks'].map((label) => (
                <div key={label} className="rounded-lg bg-muted/50 px-2 py-2.5 text-xs font-medium text-muted-foreground">
                  {label}
                </div>
              ))}
            </div>
            {calendar.error && (
              <div className="mt-5 p-3 bg-destructive/5 border border-destructive/20 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive text-left">{calendar.error}</p>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Authenticated: calendar workspace + task sidebar
  return (
    <div className="h-[100dvh] flex flex-col app-gradient">
      <Header
        activeView={activeView}
        onViewChange={setActiveView}
        isAuthenticated={calendar.isAuthenticated}
        isLoaded={calendar.isLoaded}
        isLoading={calendar.isLoading}
        error={calendar.error}
        onConnect={calendar.connect}
        onDisconnect={calendar.disconnect}
        onRefresh={calendar.refreshEvents}
        onScheduleAll={handleScheduleAll}
        unscheduledCount={unscheduledCount}
        user={auth.user}
        onSignIn={() => setShowAuthDialog(true)}
        onSignOut={auth.signOut}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Error banners */}
      {calendar.error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/5 border-b border-destructive/20 text-xs text-destructive">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {calendar.error}
        </div>
      )}

      {tasksHook.error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/5 border-b border-destructive/20 text-xs text-destructive">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {tasksHook.error}
        </div>
      )}

      {/* Smart recalc banner */}
      {conflictCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-warning/5 border-b border-warning/20">
          <Zap className="w-4 h-4 text-warning shrink-0" />
          <span className="text-sm text-warning font-medium">
            {conflictCount} scheduling {conflictCount === 1 ? 'conflict' : 'conflicts'} detected
          </span>
          <button
            onClick={handleReschedule}
            disabled={rescheduleLoading}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning/20 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rescheduleLoading ? 'animate-spin' : ''}`} />
            Recalculate
          </button>
        </div>
      )}

      <div className="flex items-center gap-4 border-b border-border bg-card/70 px-4 py-2.5 text-sm text-muted-foreground">
        <span><strong className="font-semibold text-foreground">{unscheduledCount}</strong> unscheduled</span>
        <span><strong className="font-semibold text-foreground">{tasksHook.tasks.filter((t) => t.is_scheduled).length}</strong> scheduled</span>
        <span><strong className="font-semibold text-foreground">{calendar.events.length}</strong> calendar events</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Calendar workspace */}
        <div className={`flex-1 flex flex-col min-w-0 ${activeView === 'calendar' ? '' : 'hidden lg:flex'}`}>
          <div className="flex-1 p-3 overflow-hidden">
            <div className="h-full">
              <div className="md:hidden h-full">
                <BigCalendar
                  events={bigCalendarEvents}
                  defaultView="day"
                  onSelectEvent={handleSelectEvent}
                  onSelectSlot={handleSelectSlot}
                />
              </div>
              <div className="hidden md:block h-full">
                <BigCalendar
                  events={bigCalendarEvents}
                  defaultView="week"
                  onSelectEvent={handleSelectEvent}
                  onSelectSlot={handleSelectSlot}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Task sidebar */}
        <div className={`w-80 lg:w-96 border-l border-border flex flex-col shrink-0 ${activeView === 'tasks' ? '' : 'hidden lg:flex'}`}>
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
          />
        </div>
      </div>

      {/* Auth dialog */}
      <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />

      {/* Version — inconspicuous */}
      <div className="fixed bottom-1.5 right-3 text-[10px] text-muted-foreground/25 select-none pointer-events-none z-50">
        {TEMPO_VERSION}
      </div>

      {/* Task dialog */}
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
        />
      )}
    </div>
  );
}

export default App;

// Version banner — inconspicuous, bottom-right
// Increment on each phase completion
const TEMPO_VERSION = 'v0.2.2';
export { TEMPO_VERSION };

