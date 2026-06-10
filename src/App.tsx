import { useState, useMemo, useEffect } from 'react';
import { useGoogleCalendar } from './hooks/useGoogleCalendar';
import { useTasks } from './hooks/useTasks';
import { Header } from './components/Header';
import { Card, CardHeader, CardContent, CardTitle } from './components/ui/card';
import { BigCalendar, type CalendarEventType } from './components/BigCalendar';
import { WeeklyCalendar } from './components/WeeklyCalendar';
import { TaskList } from './components/TaskList';
import { TaskDialog } from './components/TaskDialog';
import { Button } from './components/ui/button';
import { AlertCircle, RotateCw, Calendar, ListChecks } from 'lucide-react';
import type { Task } from './lib/types';
import type { TaskInput } from './lib/tasks';
import type { RescheduleResult } from './lib/rescheduler';

function App() {
  const calendar = useGoogleCalendar();
  const tasksHook = useTasks();

  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeView, setActiveView] = useState<'calendar' | 'tasks'>('calendar');
  const [conflictCount, setConflictCount] = useState(0);
  const [rescheduleResults, setRescheduleResults] = useState<RescheduleResult[]>([]);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [showRescheduleResults, setShowRescheduleResults] = useState(false);

  const unscheduledCount = useMemo(
    () => tasksHook.tasks.filter((t) => !t.is_scheduled).length,
    [tasksHook.tasks]
  );

  const allEvents = useMemo(() => {
    const googleEvents = calendar.events || [];
    const taskEvents = tasksHook.tasks
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
  }, [calendar.events, tasksHook.tasks]);

  const bigCalendarEvents = useMemo<CalendarEventType[]>(() => {
    const now = new Date();
    return allEvents.map((ev) => {
      // Find the original task for state metadata
      const originalTask = ev.source === 'task'
        ? tasksHook.tasks.find(t => `task-${t.id}` === ev.id)
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
        },
      };
    });
  }, [allEvents, tasksHook.tasks]);

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

  useEffect(() => {
    if (!calendar.isAuthenticated || allEvents.length === 0) return;
    const conflicts = tasksHook.detectConflicts(allEvents);
    setConflictCount(conflicts.length);
  }, [allEvents, calendar.isAuthenticated]);

  const handleReschedule = async () => {
    setRescheduleLoading(true);
    setShowRescheduleResults(false);
    try {
      const results = await tasksHook.reschedule(calendar.events);
      setRescheduleResults(results);
      setShowRescheduleResults(true);
    } finally {
      setRescheduleLoading(false);
    }
  };

  const handleSelectSlot = ({ start }: { start: Date }) => {
    setEditingTask(null);
    setShowTaskDialog(true);
  };

  const handleSelectEvent = (event: CalendarEventType) => {
    // Only allow editing task events
    if (!event.id.startsWith('task-')) return;
    const taskId = event.id.replace('task-', '');
    const task = tasksHook.tasks.find((t) => t.id === taskId);
    if (task) handleEditTask(task);
  };

  const scheduledCount = tasksHook.tasks.filter((t) => t.is_scheduled).length;
  const eventsCount = calendar.events.length;

  return (
    <div className="min-h-screen bg-background">
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
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Compact status strip when authenticated */}
        {calendar.isAuthenticated && (
          <div className="flex items-center gap-4 mb-6 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              {unscheduledCount} unscheduled
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              {scheduledCount} scheduled
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              {eventsCount} events
            </span>
            {conflictCount > 0 && (
              <button
                onClick={handleReschedule}
                disabled={rescheduleLoading}
                className="ml-auto inline-flex items-center gap-1 text-amber-700 hover:text-amber-900 font-medium"
              >
                <RotateCw className={`w-3 h-3 ${rescheduleLoading ? 'animate-spin' : ''}`} />
                {conflictCount} conflict{conflictCount > 1 ? 's' : ''} — reschedule
              </button>
            )}
          </div>
        )}

        {/* Hero / Unauthenticated */}
        {!calendar.isAuthenticated && !calendar.error && calendar.isLoaded && (
          <div className="max-w-xl mx-auto mt-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <Calendar className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
              Tempo Calendar
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              Auto-schedule your tasks into open time slots. Connect your Google Calendar to get started.
            </p>
            <Button
              size="lg"
              onClick={calendar.connect}
              disabled={calendar.isLoading}
              className="gap-2"
            >
              <Calendar className="w-4 h-4" />
              {calendar.isLoading ? 'Connecting...' : 'Connect Google Calendar'}
            </Button>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              {[
                { icon: ListChecks, title: 'Smart scheduling', desc: 'Tasks are placed in the best available time slots automatically.' },
                { icon: Calendar, title: 'Google Calendar sync', desc: 'Seamlessly syncs with your existing events and busy blocks.' },
                { icon: RotateCw, title: 'Conflict resolution', desc: 'Detects and resolves scheduling conflicts as they arise.' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="p-3 rounded-lg border border-border bg-card">
                  <Icon className="w-4 h-4 text-primary mb-2" />
                  <p className="text-xs font-medium text-foreground mb-0.5">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Errors */}
        {calendar.error && (
          <div className="flex items-start gap-3 p-4 mb-6 bg-destructive/10 border border-destructive/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Connection error</p>
              <p className="text-xs text-destructive/80 mt-0.5">{calendar.error}</p>
            </div>
          </div>
        )}

        {tasksHook.error && (
          <div className="flex items-center gap-2 p-4 mb-6 bg-destructive/10 border border-destructive/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive/80">{tasksHook.error}</p>
          </div>
        )}

        {tasksHook.syncErrors.length > 0 && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2 mb-3">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs font-medium text-amber-800">Sync issues ({tasksHook.syncErrors.length})</p>
              <button onClick={() => tasksHook.clearSyncErrors()} className="ml-auto text-xs text-amber-700 hover:text-amber-900 underline">Dismiss</button>
            </div>
            <ul className="text-xs text-amber-700 space-y-0.5 pl-5 list-disc">
              {tasksHook.syncErrors.slice(-5).map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        )}

        {/* Conflict Banner */}
        {calendar.isAuthenticated && conflictCount > 0 && (
          <div className="mb-6 p-4 bg-accent border border-border rounded-lg">
            <div className="flex items-center gap-3">
              <RotateCw className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 text-xs">
                <p className="font-medium text-foreground">
                  {conflictCount} task{conflictCount > 1 ? 's' : ''} conflict{conflictCount > 1 ? '' : ''} with Google Calendar
                </p>
                <p className="text-muted-foreground mt-0.5">Reschedule will move conflicting tasks to open slots.</p>
              </div>
              <Button
                onClick={handleReschedule}
                disabled={rescheduleLoading}
                size="sm"
              >
                <RotateCw className={`w-3.5 h-3.5 mr-1 ${rescheduleLoading ? 'animate-spin' : ''}`} />
                {rescheduleLoading ? 'Rescheduling...' : 'Reschedule'}
              </Button>
            </div>
          </div>
        )}

        {/* Reschedule Results */}
        {showRescheduleResults && rescheduleResults.length > 0 && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-2 mb-3">
              <RotateCw className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
              <p className="text-xs font-medium text-green-800">Reschedule complete</p>
              <button onClick={() => setShowRescheduleResults(false)} className="ml-auto text-xs text-green-700 hover:text-green-900 underline">Dismiss</button>
            </div>
            <ul className="text-xs text-green-700 space-y-0.5">
              {rescheduleResults.map((r, i) => (
                <li key={i}>
                  {r.success ? (
                    <span className="text-green-700">&#10003; "{r.taskTitle}" moved</span>
                  ) : (
                    <span className="text-destructive">&#10007; "{r.taskTitle}" &mdash; {r.reason}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Authenticated Content */}
        {calendar.isAuthenticated && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_288px] gap-6">
            <div>
              {activeView === 'calendar' && (
                <div className="space-y-4">
                  <div className="md:hidden">
                    <BigCalendar
                      events={bigCalendarEvents}
                      defaultView="day"
                      height={480}
                      onSelectEvent={handleSelectEvent}
                      onSelectSlot={handleSelectSlot}
                    />
                  </div>
                  <div className="hidden md:block">
                    <BigCalendar
                      events={bigCalendarEvents}
                      defaultView="week"
                      height={680}
                      onSelectEvent={handleSelectEvent}
                      onSelectSlot={handleSelectSlot}
                    />
                  </div>
                </div>
              )}
              {activeView === 'tasks' && (
                <TaskList
                  tasks={tasksHook.tasks}
                  isLoading={tasksHook.isLoading}
                  onAddTask={() => { setEditingTask(null); setShowTaskDialog(true); }}
                  onEditTask={handleEditTask}
                  onDeleteTask={tasksHook.remove}
                  onScheduleAll={handleScheduleAll}
                  onUnschedule={handleUnschedule}
                />
              )}
            </div>

            {/* Sidebar */}
            <div className="hidden xl:block space-y-4">
              <Card>
                <CardHeader className="px-4 py-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overview</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {[
                    { label: 'Unscheduled', value: unscheduledCount },
                    { label: 'Scheduled', value: scheduledCount },
                    { label: 'Events', value: eventsCount },
                    { label: 'Habits', value: tasksHook.tasks.filter((t) => t.is_habit).length },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                      <span className="text-xs font-medium text-foreground">{s.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <WeeklyCalendar
                events={allEvents}
                isLoading={calendar.isLoading || tasksHook.isLoading}
              />
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {!calendar.isAuthenticated && !calendar.error && !calendar.isLoaded && (
          <div className="flex items-center justify-center py-24">
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          </div>
        )}
      </main>

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
          } : undefined}
          title={editingTask ? 'Edit task' : 'New task'}
        />
      )}
    </div>
  );
}

export default App;