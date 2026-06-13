import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar, Zap, Inbox, Sparkles, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
  target: string; // CSS selector for spotlight
}

const STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Tempo',
    body: "Tasks find their own time. Let's take 30 seconds to see how it works.",
    icon: Sparkles,
    target: 'body',
  },
  {
    id: 'add',
    title: 'Add a task in two seconds',
    body: 'Type into the quick-add bar above. Press Enter to schedule it. Hit the sparkle for full options.',
    icon: Inbox,
    target: '[data-onboarding="quick-add"]',
  },
  {
    id: 'calendar',
    title: 'Your week at a glance',
    body: 'Click any empty slot to create a task at that time. Click an event to edit or unschedule it.',
    icon: Calendar,
    target: '[data-onboarding="calendar"]',
  },
  {
    id: 'conflicts',
    title: 'We catch conflicts',
    body: 'When a task overlaps a calendar event, we flag it. One click recalculates a clean plan.',
    icon: Zap,
    target: '[data-onboarding="conflict-banner"]',
  },
];

const STORAGE_KEY = 'tempo-onboarded-v1';

interface OnboardingTourProps {
  forceOpen?: boolean;
  onComplete: () => void;
}

export function OnboardingTour({ forceOpen, onComplete }: OnboardingTourProps) {
  const [open, setOpen] = useState(() => {
    if (forceOpen) return true;
    try {
      return !localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });
  const [stepIndex, setStepIndex] = useState(0);
  // Measured bounding box of the spotlighted element. Lifted to the parent
  // so the tooltip can anchor to it instead of always centering on the screen.
  const [spotlightBox, setSpotlightBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Sync open state when forceOpen changes after mount.
  // React docs pattern: "Adjusting state when a prop changes".
  // Tracking the previous value in a ref and updating state during render
  // (not in an effect) is the canonical way to derive state from a prop
  // without triggering the react-hooks/set-state-in-effect lint rule.
  // The react-hooks/refs read+write on the lines below is the allowed
  // exception for this exact "previous-prop-in-ref" idiom.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  /* eslint-disable react-hooks/refs */
  const prevForceOpenRef = useRef(forceOpen);
  if (forceOpen !== prevForceOpenRef.current) {
    prevForceOpenRef.current = forceOpen;
    if (forceOpen) {
      setOpen(true);
      setStepIndex(0);
    }
  }
  /* eslint-enable react-hooks/refs */

  const finish = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
    setOpen(false);
    onComplete();
  }, [onComplete]);

  const next = useCallback(() => {
    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1);
    else finish();
  }, [stepIndex, finish]);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  if (!open) return null;
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const hasSpotlight = step.target !== 'body' && spotlightBox !== null;
  const tooltipPosition = computeTooltipPosition(spotlightBox);

  return (
    <>
      {/* Dim layer with spotlight cutout */}
      <div className="fixed inset-0 z-[60] pointer-events-none">
        <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px] animate-fade-in" />
        {step.target !== 'body' && (
          <Spotlight target={step.target} onMeasure={setSpotlightBox} />
        )}
      </div>

      {/* Tooltip card — anchored to the spotlighted element when possible */}
      <div
        className={cn(
          'fixed z-[70] bg-card border border-border rounded-2xl shadow-2xl',
          'animate-scale-in p-6',
          hasSpotlight ? 'w-[min(calc(100vw-2rem),420px)]' : 'w-[min(calc(100vw-2rem),420px)] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
        )}
        style={hasSpotlight ? tooltipPosition : undefined}
      >
        <button
          onClick={finish}
          className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <step.icon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground tracking-tight">{step.title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{step.body}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1 rounded-full transition-all',
                  i === stepIndex ? 'w-5 bg-primary' : 'w-1.5 bg-muted',
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {stepIndex > 0 && (
              <button
                onClick={back}
                className="h-9 px-3 text-xs font-medium rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
            <button
              onClick={next}
              className="h-9 px-4 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            >
              {isLast ? (
                <>
                  Get started
                  <Check className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Spotlight({
  target,
  onMeasure,
}: {
  target: string;
  onMeasure: (box: { top: number; left: number; width: number; height: number } | null) => void;
}) {
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const el = document.querySelector(target);
      if (!el) { setBox(null); onMeasure(null); return; }
      const rect = el.getBoundingClientRect();
      const pad = 8;
      const next = {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      };
      setBox(next);
      onMeasure(next);
    };
    update();

    // Use ResizeObserver + scroll listener instead of a 400ms setInterval.
    const el = document.querySelector(target);
    let observer: ResizeObserver | null = null;
    if (el) {
      observer = new ResizeObserver(update);
      observer.observe(el);
    }
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [target, onMeasure]);

  if (!box) return null;

  return (
    <div
      className="absolute pointer-events-none rounded-xl ring-2 ring-primary/60 ring-offset-2 ring-offset-transparent transition-all duration-200"
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        boxShadow: '0 0 0 9999px oklch(0 0 0 / 0.4)',
      }}
    />
  );
}

/**
 * Position the tooltip card relative to the spotlighted element. Prefers
 * below the spotlight, centered horizontally. Falls back to above, and
 * clamps to the viewport edges so the card never overflows.
 *
 * The "body" step has no spotlight — the caller should fall back to
 * screen-center positioning in that case.
 */
function computeTooltipPosition(box: { top: number; left: number; width: number; height: number } | null): React.CSSProperties {
  if (!box || typeof window === 'undefined') {
    return {};
  }
  const TOOLTIP_MAX_W = 420;
  const TOOLTIP_MAX_H = 280; // rough estimate for overflow detection
  const GAP = 16;
  const EDGE = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Horizontal: center on the spotlight, clamp to viewport edges
  const spotlightCenterX = box.left + box.width / 2;
  const desiredLeft = spotlightCenterX - TOOLTIP_MAX_W / 2;
  const clampedLeft = Math.max(EDGE, Math.min(vw - TOOLTIP_MAX_W - EDGE, desiredLeft));

  // Vertical: prefer below the spotlight; fall back to above; clamp to viewport
  const belowTop = box.top + box.height + GAP;
  const aboveTop = box.top - TOOLTIP_MAX_H - GAP;
  let top: number;
  if (belowTop + TOOLTIP_MAX_H <= vh - EDGE) {
    top = belowTop;
  } else if (aboveTop >= EDGE) {
    top = aboveTop;
  } else {
    // Neither fits perfectly — pick whichever is closer to its preferred edge
    top = belowTop < vh / 2 ? belowTop : aboveTop;
    top = Math.max(EDGE, Math.min(vh - TOOLTIP_MAX_H - EDGE, top));
  }

  return { top, left: clampedLeft };
}
