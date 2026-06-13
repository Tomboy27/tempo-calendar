import { useState, useRef, useEffect, useCallback } from 'react';

export type PomodoroMode = 'work' | 'short-break' | 'long-break';

export const POMODORO_DEFAULTS = {
  workSeconds: 25 * 60,
  shortBreakSeconds: 5 * 60,
  longBreakSeconds: 15 * 60,
  cyclesBeforeLongBreak: 4,
} as const;

export interface PomodoroState {
  mode: PomodoroMode;
  timeRemaining: number;
  isRunning: boolean;
  cyclesCompleted: number;
}

export interface UsePomodoroOptions {
  /** Fires after a work or break phase ends (just before the next mode is set). */
  onPhaseComplete?: (completedMode: PomodoroMode) => void;
}

function getDuration(mode: PomodoroMode): number {
  if (mode === 'work') return POMODORO_DEFAULTS.workSeconds;
  if (mode === 'short-break') return POMODORO_DEFAULTS.shortBreakSeconds;
  return POMODORO_DEFAULTS.longBreakSeconds;
}

// Module-level AudioContext singleton — avoids leaking a context per chime
// (a long focus session with 8+ pomodoros would otherwise leak 8+ contexts).
let audioContextSingleton: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (audioContextSingleton) return audioContextSingleton;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    audioContextSingleton = new AudioCtx();
    return audioContextSingleton;
  } catch {
    return null;
  }
}

/**
 * Play a short, pleasant 3-note chime using the Web Audio API.
 * Best-effort: any failure (no AudioContext, autoplay blocked) is silent.
 */
function playChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  // Some browsers start the context in 'suspended' until a user gesture;
  // resume best-effort so the chime isn't silent on first phase end.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => { /* ignore */ });
  }
  try {
    const play = (time: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.18, time + 0.01);
      gain.gain.linearRampToValueAtTime(0, time + 0.22);
      osc.start(time);
      osc.stop(time + 0.24);
    };
    play(ctx.currentTime, 880);
    play(ctx.currentTime + 0.28, 880);
    play(ctx.currentTime + 0.56, 1175);
  } catch {
    /* Audio is best-effort. */
  }
}

function showSystemNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try { new Notification(title, { body, silent: false }); } catch { /* ignore */ }
  }
}

function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => { /* ignore */ });
  }
}

/**
 * Pomodoro timer with work/short-break/long-break cycles.
 * Defaults: 25 min work → 5 min short break, every 4th break is 15 min.
 * The hook owns the interval and notifies via sound + (optional) browser
 * notification when a phase ends. Mute is stored in a ref so toggling
 * does not cause a re-render.
 */
export function usePomodoro(options: UsePomodoroOptions = {}) {
  const [mode, setMode] = useState<PomodoroMode>('work');
  const [timeRemaining, setTimeRemaining] = useState<number>(POMODORO_DEFAULTS.workSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [cyclesCompleted, setCyclesCompleted] = useState(0);

  const onCompleteRef = useRef(options.onPhaseComplete);
  const mutedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = options.onPhaseComplete;
  }, [options.onPhaseComplete]);

  const handlePhaseComplete = useCallback(() => {
    setIsRunning(false);
    if (!mutedRef.current) playChime();
    if (mode === 'work') {
      const newCycles = cyclesCompleted + 1;
      setCyclesCompleted(newCycles);
      const nextMode: PomodoroMode =
        newCycles % POMODORO_DEFAULTS.cyclesBeforeLongBreak === 0 ? 'long-break' : 'short-break';
      setMode(nextMode);
      setTimeRemaining(getDuration(nextMode));
      showSystemNotification(
        'Work session done',
        nextMode === 'long-break' ? 'Time for a long break.' : 'Time for a short break.'
      );
      onCompleteRef.current?.('work');
    } else {
      const completedMode = mode;
      setMode('work');
      setTimeRemaining(POMODORO_DEFAULTS.workSeconds);
      showSystemNotification('Break over', 'Ready for the next work session?');
      onCompleteRef.current?.(completedMode);
    }
  }, [mode, cyclesCompleted]);

  // Tick interval. Self-clears when the timer hits 0 and defers the
  // phase-complete handler via queueMicrotask to avoid setState inside
  // the setState updater function.
  useEffect(() => {
    if (!isRunning) return;
    requestNotificationPermission();
    let intervalId: number | null = null;
    intervalId = window.setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (intervalId !== null) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
          queueMicrotask(() => handlePhaseComplete());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [isRunning, handlePhaseComplete]);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setTimeRemaining(getDuration(mode));
  }, [mode]);

  const skip = useCallback(() => {
    setIsRunning(false);
    if (mode === 'work') {
      const newCycles = cyclesCompleted + 1;
      setCyclesCompleted(newCycles);
      const nextMode: PomodoroMode =
        newCycles % POMODORO_DEFAULTS.cyclesBeforeLongBreak === 0 ? 'long-break' : 'short-break';
      setMode(nextMode);
      setTimeRemaining(getDuration(nextMode));
    } else {
      setMode('work');
      setTimeRemaining(POMODORO_DEFAULTS.workSeconds);
    }
  }, [mode, cyclesCompleted]);

  const setPhase = useCallback((next: PomodoroMode) => {
    setIsRunning(false);
    setMode(next);
    setTimeRemaining(getDuration(next));
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
  }, []);

  return {
    state: { mode, timeRemaining, isRunning, cyclesCompleted } as PomodoroState,
    totalDuration: getDuration(mode),
    start, pause, reset, skip, setPhase, setMuted,
  };
}
