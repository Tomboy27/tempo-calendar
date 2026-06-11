import { useState, useMemo, useEffect } from 'react';
import { useGoogleCalendar } from './hooks/useGoogleCalendar';
import { useTasks } from './hooks/useTasks';
import { Header } from './components/Header';
import { BigCalendar, type CalendarEventType } from './components/BigCalendar';
import { TaskList } from './components/TaskList';
import { TaskDialog } from './components/TaskDialog';
import { Button } from './components/ui/button';
import { AlertCircle, Link2 } from 'lucide-react';
import type { Task } from './lib/types';
import type { TaskInput } from './lib/tasks';
import type { RescheduleResult } from './lib/rescheduler';

function App() {
  const calendar = useGoogleCalendar();
  const tasksHook = useTasks();

  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeView, setActiveView] = useState<'calendar' | 'tasks'>('calendar');

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

  const handleSelectSlot = ({ start }: { start: Date }) => {
    setEditingTask(null);
    setShowTaskDialog(true);
  };

  const handleSelectEvent = (event: CalendarEventType) => {
    if (!event.id.startsWith('task-')) return;
    const taskId = event.id.replace('task-', '');
    const task = tasksHook.tasks.find((t) => t.id === taskId);
    if (task) handleEditTask(task);
  };

  // Unauthenticated: clean setup screen
  if (!calendar.isAuthenticated) {
    if (!calendar.isLoaded || calendar.isLoading) {
      return (
        <div className="h-screen flex items-center justify-center bg-background">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-spin" />
            <span className="text-xs">Loading...</span>
          </div>
        </div>
      );
    }

    return (
      <div className="h-screen flex flex-col bg-background">
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
        />
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center mx-auto mb-4">
              <span className="text-sm font-bold text-primary-foreground">F</span>
            </div>
            <h1 className="text-lg font-semibold text-foreground mb-1.5">FlowSavvy</h1>
            <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
              Auto-schedule your tasks into open time slots on your Google Calendar.
            </p>
            <Button onClick={calendar.connect} disabled={calendar.isLoading} className="gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              {calendar.isLoading ? 'Connecting...' : 'Connect Google Calendar'}
            </Button>
            {calendar.error && (
              <div className="mt-4 p-3 bg-destructive/5 border border-destructive/20 rounded-md flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                <p className="text-[11px] text-destructive text-left">{calendar.error}</p>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Authenticated: calendar workspace + task sidebar
  return (
    <div className="h-screen flex flex-col bg-background">
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
        <div className={`w-72 lg:w-80 border-l border-border flex flex-col shrink-0 ${activeView === 'tasks' ? '' : 'hidden lg:flex'}`}>
          <TaskList
            tasks={tasksHook.tasks}
            isLoading={tasksHook.isLoading}
            onAddTask={() => { setEditingTask(null); setShowTaskDialog(true); }}
            onEditTask={handleEditTask}
            onDeleteTask={tasksHook.remove}
            onScheduleAll={handleScheduleAll}
            onUnschedule={handleUnschedule}
          />
        </div>
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
          } : undefined}
          title={editingTask ? 'Edit task' : 'New task'}
        />
      )}
    </div>
  );
}

export default App;