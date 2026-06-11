import { useState, useMemo, useEffect, useRef } from 'react';
import { useGoogleCalendar } from './hooks/useGoogleCalendar';
import { useTasks } from './hooks/useTasks';
import { useAuth } from './hooks/useAuth';
import { Header } from './components/Header';
import { TempoCalendar, type CalendarEventType } from './components/TempoCalendar';
import { BentoSidebar } from './components/BentoSidebar';
import { TaskList } from './components/TaskList';
import { TaskDialog } from './components/TaskDialog';
import { AuthDialog } from './components/AuthDialog';
import { SettingsPanel } from './components/SettingsPanel';
import { OnboardingTour } from './components/OnboardingTour';
import { Button } from './components/ui/button';
import { AlertCircle, Link2, RefreshCw, LogIn, Zap, Settings2 } from 'lucide-react';
import { detectConflicts } from './lib/rescheduler';
import { isSupabaseReady } from './lib/supabase';
import type { Task } from './lib/types';
import type { TaskInput } from './lib/tasks';

const TEMPO_VERSION = 'v1.0.0';

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem('tempo-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
  const calendar = useGoogleCalendar();
  const tasksHook = useTasks();
  const { theme, toggleTheme, setTheme } = useTheme();
  const [workingHours, setWorkingHours] = useWorkingHours();

  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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

  const tempoEvents = useMemo<CalendarEventType[]>(() => {
    const now = new Date();
    return allEvents.map((ev) => {
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
      const isLocked = originalTask?.is_locked === true;

      const variant: CalendarEventType['variant'] = isMissed
        ? 'destructive'
        : isLocked
          ? 'success'
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
          is_missed: isMissed,
          is_completed: isCompleted,
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

  const handleQuickAdd = async (title: string) => {
    await tasksHook.create({ title, duration_minutes: 30, priority: 'NORMAL' });
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

  useEffect(() => {
    if (auth.isAuthenticated && !didAuthTransitionRef.current) refresh();
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

  // Supabase not configured: configuration error screen
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
        <div className="fixed bottom-1.5 right-3 text-[10px] text-muted-foreground/30 select-none pointer-events-none z-50 font-mono">
          {TEMPO_VERSION}
        </div>
      </div>
    );
  }

  // Not signed in to Tempo: sign-in prompt
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
          onOpenSettings={() => setShowSettings(true)}
        />
        <main className="flex-1 grid place-items-center px-6 py-12">
          <div className="w-full max-w-[460px] rounded-2xl bg-card p-8 shadow-md border border-border">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-sm">
                <span className="text-lg font-bold text-primary-foreground tracking-tight">T</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-foreground tracking-tight">Tempo Calendar</h1>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  Tasks find their own time. Sign in and we'll handle the rest.
                </p>
              </div>
            </div>
            <Button onClick={() => setShowAuthDialog(true)} className="mt-6 w-full gap-2 h-10 shadow-sm">
              <LogIn className="w-4 h-4" />
              Sign in to Tempo
            </Button>
            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              {['Auto-schedule', 'Calendar sync', 'Smart recalc'].map((label) => (
                <div key={label} className="rounded-lg bg-muted/50 px-2 py-2.5 text-xs font-medium text-muted-foreground border border-border">
                  {label}
                </div>
              ))}
            </div>
          </div>
        </main>
        <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
        <SettingsPanel
          open={showSettings}
          onClose={() => setShowSettings(false)}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSetTheme={setTheme}
          user={auth.user}
          isGoogleConnected={calendar.isAuthenticated}
          onDisconnectGoogle={calendar.disconnect}
          onSignOut={auth.signOut}
          workingHours={workingHours}
          onWorkingHoursChange={setWorkingHours}
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
          onOpenSettings={() => setShowSettings(true)}
        />
        <main className="flex-1 grid place-items-center px-6 py-12">
          <div className="w-full max-w-[460px] rounded-2xl bg-card p-8 shadow-md border border-border">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-sm">
                <span className="text-lg font-bold text-primary-foreground tracking-tight">T</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-foreground tracking-tight">Tempo Calendar</h1>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  Tasks find their own time. Connect your calendar and we'll handle the rest.
                </p>
              </div>
            </div>
            <Button onClick={calendar.connect} disabled={calendar.isLoading} className="mt-6 w-full gap-2 h-10 shadow-sm">
              <Link2 className="w-4 h-4" />
              {calendar.isLoading ? 'Connecting...' : 'Connect Google Calendar'}
            </Button>
            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              {['Import events', 'Find space', 'Sync tasks'].map((label) => (
                <div key={label} className="rounded-lg bg-muted/50 px-2 py-2.5 text-xs font-medium text-muted-foreground border border-border">
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
        <SettingsPanel
          open={showSettings}
          onClose={() => setShowSettings(false)}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSetTheme={setTheme}
          user={auth.user}
          isGoogleConnected={false}
          onDisconnectGoogle={() => {}}
          onSignOut={auth.signOut}
          workingHours={workingHours}
          onWorkingHoursChange={setWorkingHours}
        />
      </div>
    );
  }

  // Authenticated: full workspace
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
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Error banners */}
      {calendar.error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/5 border-b border-destructive/20 text-sm text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {calendar.error}
        </div>
      )}

      {tasksHook.error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/5 border-b border-destructive/20 text-sm text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {tasksHook.error}
        </div>
      )}

      {/* Smart recalc banner */}
      {conflictCount > 0 && (
        <div
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
          className={`flex-1 flex flex-col min-w-0 p-3 gap-3 ${activeView === 'calendar' ? '' : 'hidden lg:flex'}`}
        >
          <TempoCalendar
            events={tempoEvents}
            defaultView="week"
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            startHour={parseInt(workingHours.start.split(':')[0], 10)}
            endHour={parseInt(workingHours.end.split(':')[0], 10) + 2}
            className="min-h-0"
          />
        </div>

        {/* Sidebar — Bento on calendar view, full TaskList on tasks view */}
        <div
          data-onboarding="quick-add"
          className={`w-80 lg:w-[360px] border-l border-border flex flex-col shrink-0 bg-card ${activeView === 'tasks' ? '' : 'hidden lg:flex'}`}
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
          ) : (
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
          )}
        </div>
      </div>

      {/* Dialogs */}
      <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />

      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSetTheme={setTheme}
        user={auth.user}
        isGoogleConnected={calendar.isAuthenticated}
        onDisconnectGoogle={calendar.disconnect}
        onSignOut={auth.signOut}
        workingHours={workingHours}
        onWorkingHoursChange={setWorkingHours}
      />

      <OnboardingTour onComplete={() => { /* persisted in localStorage */ }} />

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

      <div className="fixed bottom-1.5 right-3 text-[10px] text-muted-foreground/30 select-none pointer-events-none z-50 font-mono">
        {TEMPO_VERSION}
      </div>
    </div>
  );
}

export default App;
export { TEMPO_VERSION };
