import { Calendar, Sparkles, Inbox, Flame, Zap } from 'lucide-react';

/**
 * Illustrated product preview for the unauthenticated landing page.
 * Shows a miniature Tempo workspace: browser-chrome frame + left rail + week
 * calendar + Bento sidebar + a floating "conflicts detected" callout.
 *
 * Content is illustrative — "Sample task" / generic day labels so it doesn't
 * look like a real user's data.
 */
export function ProductPreviewMock() {
  return (
    <div className="relative w-full max-w-[560px] mx-auto">
      {/* Outer browser-chrome frame */}
      <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Top bar */}
        <div className="h-9 bg-muted/40 border-b border-border flex items-center gap-1.5 px-3.5">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-destructive/40" />
            <div className="w-2.5 h-2.5 rounded-full bg-warning/40" />
            <div className="w-2.5 h-2.5 rounded-full bg-success/40" />
          </div>
          <div className="flex-1 mx-3 h-5 rounded-md bg-background/60 border border-border" />
        </div>

        {/* App frame: rail + main + sidebar */}
        <div className="flex h-[340px]">
          {/* Left rail */}
          <div className="w-12 bg-card border-r border-border flex flex-col items-center py-3 gap-1.5">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center mb-1">
              <span className="text-[10px] font-bold text-primary-foreground">T</span>
            </div>
            <div className="w-7 h-7 rounded-md bg-primary/15 flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground">
              <Inbox className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1" />
            <div className="w-7 h-7 rounded-full bg-primary/15" />
          </div>

          {/* Main: week calendar */}
          <div className="flex-1 p-3 bg-background/50 min-w-0">
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-[11px] font-semibold text-foreground">This week</div>
              <div className="flex items-center gap-1">
                <div className="text-[9px] px-1.5 py-0.5 rounded bg-foreground text-background font-medium">Week</div>
                <div className="text-[9px] px-1.5 py-0.5 rounded text-muted-foreground">Day</div>
                <div className="text-[9px] px-1.5 py-0.5 rounded text-muted-foreground">Month</div>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <div key={i} className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {/* Illustrative: no day numbers — just day-letter header above, mini events below. */}
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="aspect-square rounded-md border border-border/60 bg-card p-1 flex flex-col gap-0.5"
                >
                  {/* "Today" indicator: a small primary dot in the highlighted column. */}
                  {i === 2 ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary self-start" />
                  ) : null}
                  {/* Mini events */}
                  {i === 0 && <div className="h-1.5 rounded-sm bg-event-task" />}
                  {i === 1 && <div className="h-1.5 rounded-sm bg-event-task w-3/4" />}
                  {i === 1 && <div className="h-1.5 rounded-sm bg-event-task-border w-2/3" />}
                  {i === 2 && <div className="h-1.5 rounded-sm bg-primary w-4/5" />}
                  {i === 2 && <div className="h-1.5 rounded-sm bg-primary/60 w-3/5" />}
                  {i === 3 && <div className="h-1.5 rounded-sm bg-event-task w-1/2" />}
                  {i === 4 && <div className="h-1.5 rounded-sm bg-event-task w-4/5" />}
                  {i === 4 && <div className="h-1.5 rounded-sm bg-event-task w-2/3" />}
                  {i === 5 && <div className="h-1.5 rounded-sm bg-event-task w-3/5" />}
                </div>
              ))}
            </div>

            {/* Quick-add preview */}
            <div className="mt-3 rounded-lg border border-border bg-card p-2 flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-muted-foreground" />
              <div className="text-[10px] text-muted-foreground flex-1 truncate">
                Try: &ldquo;call dentist tomorrow at 3pm&rdquo;
              </div>
              <div className="text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                Add
              </div>
            </div>
          </div>

          {/* Right: Bento sidebar */}
          <div className="w-[140px] border-l border-border bg-card p-2.5 flex flex-col gap-2">
            {/* Now card */}
            <div className="rounded-lg bg-primary/10 border border-primary/25 p-2">
              <div className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wider text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Now
              </div>
              <div className="mt-1 text-[10px] font-semibold text-foreground leading-tight">
                Sample task
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-primary/15 overflow-hidden">
                <div className="h-full w-2/3 bg-primary rounded-full" />
              </div>
              <div className="mt-1 text-[8px] text-muted-foreground tabular-nums">
                2:00 – 3:00 PM · 25m left
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-1">
              <div className="rounded-md border border-border bg-card p-1.5">
                <div className="text-[7px] uppercase tracking-wider text-muted-foreground">Inbox</div>
                <div className="text-[14px] font-semibold text-foreground tabular-nums leading-none mt-0.5">
                  3
                </div>
              </div>
              <div className="rounded-md border border-border bg-card p-1.5">
                <div className="text-[7px] uppercase tracking-wider text-muted-foreground">Streak</div>
                <div className="flex items-center gap-0.5 text-[14px] font-semibold text-foreground tabular-nums leading-none mt-0.5">
                  <Flame className="w-2.5 h-2.5 text-warning" />
                  7
                </div>
              </div>
            </div>

            {/* Tomorrow */}
            <div className="rounded-md border border-border bg-card p-1.5">
              <div className="text-[7px] uppercase tracking-wider text-muted-foreground mb-1">
                Tomorrow
              </div>
              <div className="space-y-0.5">
                <div className="text-[8px] text-foreground">9:00 · Meeting</div>
                <div className="text-[8px] text-foreground">1:00 · Review</div>
                <div className="text-[8px] text-muted-foreground">3:00 · Deep work</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating accent: smart-recalc banner (positioned to avoid left-edge clipping) */}
      <div className="absolute -bottom-4 left-4 sm:left-8 rounded-xl bg-card border border-border shadow-xl p-2.5 flex items-center gap-2 max-w-[220px] z-10">
        <div className="w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center shrink-0">
          <Zap className="w-3.5 h-3.5 text-warning" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-foreground">2 conflicts detected</div>
          <div className="text-[9px] text-muted-foreground leading-snug">
            One click to rebuild a clean plan.
          </div>
        </div>
      </div>
    </div>
  );
}
