import { useEffect, useState } from 'react';
import { X, Play, Pause, RotateCcw, SkipForward, Check, Volume2, VolumeX, Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { usePomodoro, type PomodoroMode } from '../hooks/usePomodoro';
import type { Task } from '../lib/types';
import { format, parseISO } from 'date-fns';

interface FocusModeProps {
  open: boolean;
  currentTask: Task | null;
  queue: Task[];
  onClose: () => void;
  onCompleteTask: (taskId: string) => Promise<void> | void;
  onSwitchTask: (taskId: string) => void;
}

const MODE_LABELS: Record<PomodoroMode, string> = {
  work: 'Focus',
  'short-break': 'Short break',
  'long-break': 'Long break',
};

const TIMER_SIZE = 320;
const TIMER_RADIUS = 140;
const TIMER_STROKE = 6;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;

export function FocusMode({ open, currentTask, queue, onClose, onCompleteTask, onSwitchTask }: FocusModeProps) {
  const [muted, setMuted] = useState(false);
  const [showQueue, setShowQueue] = useState(true);

  const { state, totalDuration, start, pause, reset, skip, setPhase, setMuted: setHookMuted } = usePomodoro();

  useEffect(() => { setHookMuted(muted); }, [muted, setHookMuted]);

  // Keyboard shortcuts. Skipped when typing in form fields.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (state.isRunning) {
          pause();
        } else {
          start();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (queue[0]) onSwitchTask(queue[0].id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentTask) void onCompleteTask(currentTask.id);
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        reset();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        skip();
      } else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        setShowQueue((s) => !s);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, state.isRunning, currentTask, queue, onClose, onCompleteTask, onSwitchTask, start, pause, reset, skip]);

  if (!open) return null;

  const minutes = Math.floor(state.timeRemaining / 60);
  const seconds = state.timeRemaining % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const progress = totalDuration > 0 ? 1 - state.timeRemaining / totalDuration : 0;
  const dashOffset = TIMER_CIRCUMFERENCE * (1 - progress);

  const isBreak = state.mode !== 'work';
  const modeLabel = MODE_LABELS[state.mode];
  const ringColor = isBreak ? 'var(--success)' : 'var(--primary)';

  return (
    <div className="fixed inset-0 z-[100] bg-background/97 backdrop-blur-md flex flex-col animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="label">Focus Mode</span>
          {state.cyclesCompleted > 0 && (
            <span className="num text-[11px]">
              · {state.cyclesCompleted} {state.cyclesCompleted === 1 ? 'pomodoro' : 'pomodoros'} completed
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setMuted((m) => !m)} title={muted ? 'Unmute (M)' : 'Mute (M)'}>
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowQueue((s) => !s)} title="Toggle queue (Q)">
            {showQueue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} title="Exit focus mode (Esc)">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Center: Timer + task */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-7 min-w-0">
          {/* Circular timer */}
          <div className="relative" style={{ width: TIMER_SIZE, height: TIMER_SIZE }}>
            <svg width={TIMER_SIZE} height={TIMER_SIZE} className="-rotate-90">
              <circle
                cx={TIMER_SIZE / 2}
                cy={TIMER_SIZE / 2}
                r={TIMER_RADIUS}
                fill="none"
                stroke="var(--border)"
                strokeWidth={TIMER_STROKE}
              />
              <circle
                cx={TIMER_SIZE / 2}
                cy={TIMER_SIZE / 2}
                r={TIMER_RADIUS}
                fill="none"
                stroke={ringColor}
                strokeWidth={TIMER_STROKE}
                strokeDasharray={TIMER_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.95s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className={`label ${isBreak ? 'text-success' : 'text-muted-foreground'}`}>{modeLabel}</div>
              <div className="num text-7xl font-light text-foreground tracking-tight mt-2 tabular-nums">
                {display}
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground num">
                {state.cyclesCompleted} {state.cyclesCompleted === 1 ? 'pomodoro' : 'pomodoros'} completed
              </div>
            </div>
          </div>

          {/* Current task */}
          {currentTask ? (
            <div className="text-center max-w-md">
              <div className="label text-muted-foreground mb-1.5">Now focusing on</div>
              <h2 className="text-xl font-semibold text-foreground leading-tight">{currentTask.title}</h2>
              {currentTask.description && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{currentTask.description}</p>
              )}
              <div className="mt-2 text-xs text-muted-foreground num">
                {currentTask.duration_minutes}m
                {currentTask.due_date && ` · due ${format(parseISO(currentTask.due_date), 'MMM d')}`}
                {currentTask.scheduled_start && ` · ${format(parseISO(currentTask.scheduled_start), 'h:mm a')}`}
              </div>
            </div>
          ) : (
            <div className="text-center max-w-md">
              <h2 className="text-lg font-semibold text-foreground">No task selected</h2>
              <p className="mt-1 text-sm text-muted-foreground">Pick a task from the queue to start focusing.</p>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2">
            <Button onClick={state.isRunning ? pause : start} size="lg" className="gap-2 px-7 h-11" autoFocus>
              {state.isRunning ? <><Pause className="w-4 h-4" />Pause</> : <><Play className="w-4 h-4" />Start</>}
            </Button>
            <Button onClick={reset} variant="ghost" size="icon" className="h-11 w-11" title="Reset (R)">
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button onClick={skip} variant="ghost" size="icon" className="h-11 w-11" title="Skip phase (S)">
              <SkipForward className="w-4 h-4" />
            </Button>
            {currentTask && (
              <Button
                onClick={() => void onCompleteTask(currentTask.id)}
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                title="Complete task (Enter)"
              >
                <Check className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Mode tabs */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-full">
            {(['work', 'short-break', 'long-break'] as PomodoroMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setPhase(m)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  state.mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Up next queue + shortcuts */}
        {showQueue && (
          <aside className="w-80 shrink-0 border-l border-border/50 p-6 overflow-y-auto hidden md:flex md:flex-col">
            <div className="label text-muted-foreground mb-3">Up next</div>
            {queue.length === 0 ? (
              <p className="text-sm text-muted-foreground">No more active tasks scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {queue.map((task, i) => (
                  <li key={task.id}>
                    <button
                      onClick={() => onSwitchTask(task.id)}
                      className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/30 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="num text-xs text-muted-foreground w-4">{i + 1}</span>
                        <span className="flex-1 text-sm font-medium text-foreground truncate">{task.title}</span>
                      </div>
                      <div className="mt-1 ml-6 text-[11px] text-muted-foreground num">
                        {task.duration_minutes}m
                        {task.scheduled_start && ` · ${format(parseISO(task.scheduled_start), 'h:mm a')}`}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 pt-6 border-t border-border/50">
              <div className="label text-muted-foreground mb-2">Shortcuts</div>
              <div className="text-[11px] text-muted-foreground space-y-1.5">
                {[
                  ['Start / Pause', 'Space'],
                  ['Next task', 'N'],
                  ['Complete', '⏎'],
                  ['Reset', 'R'],
                  ['Skip', 'S'],
                  ['Toggle queue', 'Q'],
                  ['Mute', 'M'],
                  ['Exit', 'Esc'],
                ].map(([label, key]) => (
                  <div key={label} className="flex justify-between">
                    <span>{label}</span>
                    <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">{key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
