import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { TEMPO_VERSION, CHANGELOG } from '../lib/version';

const LAST_SEEN_KEY = 'tempo-last-seen-version';

/**
 * Tiny version badge that lives in the bottom-right corner.
 * Shows a "new" dot if the user hasn't seen the current version yet.
 * Click to open a popover with the full changelog.
 * Focus is restored to the trigger on close (Escape, click-outside, X).
 */
export function VersionBadge() {
  const [open, setOpen] = useState(false);
  // Read the "last seen" version from localStorage in the lazy initializer
  // so we only read it once on mount and never need a setState-in-effect.
  const [hasNew, setHasNew] = useState(() => {
    try {
      const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
      return lastSeen !== TEMPO_VERSION;
    } catch {
      return false;
    }
  });
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close + restore focus to the trigger
  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false);
    // Synchronous focus works: the trigger button stays mounted while
    // the popover unmounts on the next React render.
    triggerRef.current?.focus();
  }, []);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      closeAndFocusTrigger();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAndFocusTrigger();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closeAndFocusTrigger]);

  const handleOpen = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) {
      // Mark as seen
      try {
        localStorage.setItem(LAST_SEEN_KEY, TEMPO_VERSION);
        setHasNew(false);
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="fixed bottom-2 right-3 z-50 select-none">
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className={cn(
          'group relative inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/80 px-2.5 py-1 font-mono text-[10px] font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:border-border hover:bg-card hover:text-foreground',
        )}
        aria-label={`Tempo ${TEMPO_VERSION}. Click to see what's new.`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="text-foreground/70">{TEMPO_VERSION}</span>
        {hasNew && (
          <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-labelledby="version-badge-title"
          aria-modal="false"
          className="absolute bottom-full right-0 mb-2 w-[min(calc(100vw-2rem),340px)] rounded-xl border border-border bg-card shadow-lg overflow-hidden animate-scale-in"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span id="version-badge-title" className="text-xs font-semibold text-foreground">
                What's new
              </span>
            </div>
            <button
              onClick={closeAndFocusTrigger}
              className="p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Close changelog"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Changelog list */}
          <div className="max-h-[60vh] overflow-y-auto tempo-scrollbar">
            {CHANGELOG.map((entry) => (
              <div
                key={entry.version}
                className={cn(
                  'px-4 py-3 border-b border-border/60 last:border-b-0',
                  entry.version === TEMPO_VERSION && 'bg-primary/[0.03]',
                )}
              >
                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground font-mono">
                      {entry.version}
                    </span>
                    {entry.version === TEMPO_VERSION && (
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        Latest
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {entry.date}
                  </span>
                </div>
                <ul className="space-y-1">
                  {entry.changes.map((change, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed"
                    >
                      <Check className="h-3 w-3 text-success shrink-0 mt-0.5" />
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-[10px] text-muted-foreground text-center">
            Tempo Calendar · built with care
          </div>
        </div>
      )}
    </div>
  );
}
