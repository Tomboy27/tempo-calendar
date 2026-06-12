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
import { CommandPalette } from './components/CommandPalette';
import { VersionBadge } from './components/VersionBadge';
import { Button } from './components/ui/button';
import { LeftRail } from './components/LeftRail';
import { ProductPreviewMock } from './components/ProductPreviewMock';
import { AlertCircle, Link2, RefreshCw, LogIn, Zap, Settings2, Calendar, Sparkles, ArrowRight, BarChart3, Layers, Copy, ExternalLink, Check } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { format } from 'date-fns';
import { detectConflicts } from './lib/rescheduler';
import { isSupabaseReady } from './lib/supabase';
import { } from './lib/version';
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
  const calendar = useGoogleCalendar();
  const tasksHook = useTasks();
  const { theme, toggleTheme, setTheme, useSystemTheme } = useTheme();
  // (useSystemTheme is passed to SettingsPanel below)
  const [workingHours, setWorkingHours] = useWorkingHours();

  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeView, setActiveView] = useState<'calendar' | 'tasks'>('calendar');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [tempoView, setTempoView] = useState<'day' | 'week' | 'month'>('week');
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

  const handleEventDrop = async (eventId: string, newStart: Date, newEnd: Date) => {
    if (!eventId.startsWith('task-')) {
      toast.error('Google events are read-only here');
      return;
    }
    const taskId = eventId.replace('task-', '');
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
            <h1 className="mt-5 text-4xl lg:text-5xl font-semibold text-foreground tracking-tight leading-[1.05]">
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
              <h1 className="mt-5 text-4xl lg:text-5xl font-semibold text-foreground tracking-tight leading-[1.05]">
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
                  onClick={calendar.connect}
                  disabled={calendar.isLoading}
                  size="lg"
                  className="h-12 px-6 gap-2 text-sm font-semibold shadow-sm"
                >
                  <Link2 className="w-4 h-4" />
                  {calendar.isLoading ? 'Connecting…' : 'Connect Google Calendar'}
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  Read-only access. You can disconnect anytime.
                </span>
              </div>

              {calendar.error && (
                <div className="mt-5 p-4 bg-destructive/5 border border-destructive/20 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-destructive text-left leading-relaxed">{calendar.error.message}</p>
                  </div>
                  {calendar.error.code === 'ORIGIN_NOT_AUTHORIZED' && (
                    // `connect()` already calls setError(null) as its first line,
                    // so we don't need to disconnect first.
                    <OriginNotAuthorizedHelp onRecheck={calendar.connect} />
                  )}
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
        />
      </div>
    );
  }

  // Authenticated: full workspace
  return (
    <div className="h-[100dvh] flex app-gradient">
      <LeftRail
        activeView={activeView}
        onViewChange={setActiveView}
        isAuthenticated={calendar.isAuthenticated}
        isLoaded={calendar.isLoaded}
        isLoading={calendar.isLoading}
        error={calendar.error?.message ?? null}
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
      <div className="flex-1 flex flex-col min-w-0">
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
      />

      {/* Error banners */}
      {calendar.error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/5 border-b border-destructive/20 text-sm text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {calendar.error.message}
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
            defaultView={tempoView}
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            onEventDrop={handleEventDrop}
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
              onBackToCalendar={() => setActiveView('calendar')}
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
        onSetTheme={setTheme}
          onUseSystemTheme={useSystemTheme}
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
      </div>
    </div>
  );
}

/**
 * Inline helper shown when the Google sign-in fails with
 * `ORIGIN_NOT_AUTHORIZED` (the GIS `popup_failed_to_open` error).
 * The most common cause is that the current origin isn't listed under
 * "Authorized JavaScript origins" on the Google OAuth Client ID.
 *
 * Renders a one-click "Copy origin" button (with a graceful fallback when
 * the Clipboard API is unavailable) and a direct link to the Google Cloud
 * Console credentials page.
 */
function OriginNotAuthorizedHelp({ onRecheck }: { onRecheck?: () => void }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // Show a short prefix so the user can verify they're using the right
  // Client ID (full ID is sensitive but the prefix + length is enough to
  // disambiguate multiple Client IDs in the same GCP project).
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const clientIdPrefix = clientId ? `${clientId.slice(0, 24)}…` : '(not set)';

  // Clear any pending reset on unmount so we never call setState after teardown,
  // and cancel any in-flight timer when a new copy happens (avoids the
  // "Copied" label flickering on rapid re-clicks).
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(origin);
      setCopied(true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 2000);
    } catch (err) {
      console.warn('[OriginNotAuthorizedHelp] Copy failed:', err);
    }
  };

  const handleCopyDiag = () => {
    const diag = [
      `Origin: ${origin}`,
      `Client ID: ${clientId || '(not set)'}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : ''}`,
      `User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
    ].join('\n');
    // Drop the inline "Copied" state — the console.log + clipboard write is
    // enough confirmation, and avoids confusing the user with two "Copied"
    // labels (one for the origin button, one for the diagnostic button).
    navigator.clipboard.writeText(diag).catch((err) => {
      console.warn('[OriginNotAuthorizedHelp] Diagnostic copy failed:', err);
    });
    // eslint-disable-next-line no-console
    console.info('[Google OAuth Diagnostic]\n' + diag);
  };

  return (
    <div className="pl-6 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy current origin to clipboard"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
        >
          {copied ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy origin</>}
        </button>
        {onRecheck && (
          <button
            type="button"
            onClick={onRecheck}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Recheck
          </button>
        )}
        <button
          type="button"
          onClick={handleCopyDiag}
          aria-label="Copy diagnostic info to clipboard"
          title="Copies origin, client ID, URL, and user agent. Also logs to the browser console."
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
        >
          <Copy className="w-3 h-3" />
          Copy diagnostic
        </button>
        <a
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          Open Google Cloud Console
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div className="flex items-center gap-3 flex-wrap text-[11px] font-mono text-muted-foreground">
        <span><span className="text-muted-foreground/60">origin:</span> <code className="bg-muted/60 px-1.5 py-0.5 rounded">{origin}</code></span>
        <span><span className="text-muted-foreground/60">client id:</span> <code className="bg-muted/60 px-1.5 py-0.5 rounded">{clientIdPrefix}</code></span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Note: changes to Authorized JavaScript origins can take <strong>5–60 minutes</strong> to propagate on Google's side.
        Hard-refresh the page (Ctrl/Cmd+Shift+R) after editing, and verify the origin above exactly matches the one you added in Cloud Console.
      </p>
    </div>
  );
}

export default App;
