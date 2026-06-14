import { useState, useRef, useEffect } from 'react';
import {
  Clock,
  MoreHorizontal,
  Trash2,
  ExternalLink,
  XCircle,
  Check,
  RotateCcw,
} from 'lucide-react';
import { SubtaskProgressChip } from './SubtasksEditor';
import type { Task, Subtask } from '../lib/types';
import { format, parseISO, isToday, isTomorrow, differenceInDays } from 'date-fns';

// ============================================================
// Shared helpers (used by both TaskRow variants below).
// ============================================================

const PRIORITY_DOTS: Record<string, string> = {
  ASAP: 'bg-destructive',
  HIGH: 'bg-warning',
  NORMAL: 'bg-muted-foreground/40',
  LOW: 'bg-muted-foreground/20',
};

const PRIORITY_LABELS: Record<string, string> = {
  ASAP: 'ASAP',
  HIGH: 'High',
  NORMAL: 'Normal',
  LOW: 'Low',
};

function getUrgencyBadge(task: Task): { label: string; className: string } | null {
  if (!task.due_date) return null;
  const due = parseISO(task.due_date);
  if (isToday(due)) return { label: 'Due today', className: 'bg-destructive/10 text-destructive' };
  if (isTomorrow(due)) return { label: 'Tomorrow', className: 'bg-warning/10 text-warning' };
  const days = differenceInDays(due, new Date());
  if (days <= 3 && days >= 0) return { label: `${days}d left`, className: 'bg-warning/10 text-warning' };
  if (days < 0) return { label: 'Overdue', className: 'bg-overdue/10 text-overdue' };
  return null;
}

// ============================================================
// Active task row (completion checkbox, priority dot, content,
// action menu with Edit / Unschedule / Delete + confirm-delete flow).
// ============================================================

export interface TaskRowProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onUnschedule: (id: string) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
  isScheduled?: boolean;
  isCompleting?: boolean;
  subtasks?: Subtask[];
}

export function TaskRow({
  task,
  onEdit,
  onDelete,
  onUnschedule,
  onComplete,
  isScheduled,
  isCompleting,
  subtasks,
}: TaskRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [unscheduling, setUnscheduling] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  const isOverdue =
    task.is_scheduled &&
    task.scheduled_end &&
    new Date(task.scheduled_end) < new Date() &&
    task.status === 'active';

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/40 transition-colors group">
      {/* Completion checkbox */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onComplete(task.id);
        }}
        disabled={isCompleting}
        className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
          isCompleting
            ? 'border-primary bg-primary/20'
            : 'border-muted-foreground/30 hover:border-primary hover:bg-primary/10'
        }`}
        aria-label="Complete task"
      >
        {isCompleting ? (
          <div className="w-2.5 h-2.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : (
          <Check className="w-3 h-3 text-primary opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </button>

      {/* Priority indicator */}
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOTS[task.priority] || 'bg-muted-foreground/20'}`} />

      {/* Content */}
      <button
        type="button"
        className="flex-1 min-w-0 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onEdit(task)}
      >
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-medium truncate ${isOverdue ? 'text-overdue' : 'text-foreground'}`}>
            {task.title}
          </span>
          {task.is_locked && (
            <span className="text-[10px] font-medium text-success bg-success/10 px-1.5 py-0.5 rounded-md shrink-0">locked</span>
          )}
          {task.is_habit && (
            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md shrink-0">habit</span>
          )}
          {subtasks && <SubtaskProgressChip subtasks={subtasks} />}
        </div>
        <div className="flex items-center gap-2.5 mt-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {task.duration_minutes}m
          </span>
          {task.due_date && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {format(parseISO(task.due_date), 'MMM d')}
            </span>
          )}
          {(() => {
            const urgency = getUrgencyBadge(task);
            return urgency ? (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ${urgency.className}`}>
                {urgency.label}
              </span>
            ) : null;
          })()}
          {isScheduled && task.scheduled_start && (
            <span className="text-xs text-success flex items-center gap-1">
              {format(parseISO(task.scheduled_start), 'MMM d, h:mm a')}
            </span>
          )}
        </div>
      </button>

      {/* Actions */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setMenuPosition({
              top: rect.bottom + 4,
              right: window.innerWidth - rect.right,
            });
            setConfirmDelete(false);
            setMenuOpen(!menuOpen);
          }}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors sm:opacity-60 sm:group-hover:opacity-100"
          aria-label="More actions"
          aria-expanded={menuOpen}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div
            className="fixed w-44 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 animate-slide-down"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            {confirmDelete ? (
              <div className="p-3">
                <p className="mb-3 text-sm leading-snug text-foreground">Delete this task?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(task.id);
                      setConfirmDelete(false);
                      setMenuOpen(false);
                    }}
                    className="flex-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                    className="flex-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(task); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Edit
                </button>
                {isScheduled && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setUnscheduling(true);
                      await onUnschedule(task.id);
                      setUnscheduling(false);
                      setMenuOpen(false);
                    }}
                    disabled={unscheduling}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Unschedule
                  </button>
                )}
                <div className="border-t border-border my-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Completed task row (read-only summary + Reopen / Delete menu).
// ============================================================

export interface CompletedTaskRowProps {
  task: Task;
  onReopen: (id: string) => Promise<void>;
  onDelete: (id: string) => void;
}

export function CompletedTaskRow({ task, onReopen, onDelete }: CompletedTaskRowProps) {
  const [reopening, setReopening] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/40 transition-colors group">
      {/* Completed checkmark */}
      <div className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
        <Check className="w-3 h-3 text-primary-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate text-muted-foreground line-through">
            {task.title}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md shrink-0">
            {PRIORITY_LABELS[task.priority] || task.priority}
          </span>
        </div>
        <div className="flex items-center gap-2.5 mt-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {task.duration_minutes}m
          </span>
          {task.completed_at && (
            <span className="text-xs text-muted-foreground">
              {format(parseISO(task.completed_at), 'MMM d')}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setMenuPosition({
              top: rect.bottom + 4,
              right: window.innerWidth - rect.right,
            });
            setConfirmDelete(false);
            setMenuOpen(!menuOpen);
          }}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors sm:opacity-60 sm:group-hover:opacity-100"
          aria-label="More actions"
          aria-expanded={menuOpen}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div
            className="fixed w-44 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 animate-slide-down"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            {confirmDelete ? (
              <div className="p-3">
                <p className="mb-3 text-sm leading-snug text-foreground">Delete this task?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(task.id);
                      setConfirmDelete(false);
                      setMenuOpen(false);
                    }}
                    className="flex-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                    className="flex-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setReopening(true);
                    await onReopen(task.id);
                    setReopening(false);
                    setMenuOpen(false);
                  }}
                  disabled={reopening}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reopen
                </button>
                <div className="border-t border-border my-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
