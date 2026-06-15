import { useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Repeat, CalendarDays, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';
import { format } from 'date-fns';

export type OccurrenceEditScope = 'this' | 'all' | 'future';

interface OccurrenceEditDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (scope: OccurrenceEditScope) => void;
  taskTitle: string;
  occurrenceDate: Date;
  changeType: 'move' | 'resize' | 'complete' | 'skip' | 'edit';
}

export function OccurrenceEditDialog({
  open,
  onClose,
  onConfirm,
  taskTitle,
  occurrenceDate,
  changeType,
}: OccurrenceEditDialogProps) {
  const titleId = useId();
  const descId = useId();
  const isEditType = changeType === 'edit';
  const [scope, setScope] = useState<OccurrenceEditScope>(isEditType ? 'all' : 'this');

  const changeLabels: Record<string, string> = {
    move: 'Move this occurrence to a new time',
    resize: 'Resize this occurrence',
    complete: 'Mark this occurrence as done',
    skip: 'Skip this occurrence',
    edit: 'Edit this occurrence',
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content p-0 w-full max-w-[400px]"
          aria-labelledby={titleId}
          aria-describedby={descId}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div>
              <Dialog.Title id={titleId} className="text-sm font-semibold text-foreground">
                Edit recurring occurrence
              </Dialog.Title>
              <Dialog.Description id={descId} className="mt-0.5 text-[11px] text-muted-foreground">
                {changeLabels[changeType] || 'Edit this occurrence'}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="p-0.5 rounded hover:bg-accent text-muted-foreground transition-colors"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </Dialog.Close>
          </div>

          {/* Occurrence info */}
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Repeat className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-medium truncate">{taskTitle}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <CalendarDays className="w-3 h-3" />
              <span>{format(occurrenceDate, 'EEEE, MMMM d, yyyy')}</span>
            </div>
          </div>

          {/* Scope selection */}
          <div className="px-5 py-4 space-y-2">
            <label className={`flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-accent/30 transition-colors ${isEditType ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <input
                type="radio"
                name="occurrence-scope"
                value="this"
                checked={scope === 'this'}
                onChange={() => !isEditType && setScope('this')}
                disabled={isEditType}
                className="mt-0.5 w-4 h-4 text-primary focus:ring-ring"
              />
              <div>
                <div className="text-sm font-medium text-foreground">This occurrence only</div>
                <div className="text-[11px] text-muted-foreground">
                  {isEditType ? 'Not available for edits — edit applies to the whole series.' : `The change applies only to ${format(occurrenceDate, 'MMM d')}.`}
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-accent/30 transition-colors">
              <input
                type="radio"
                name="occurrence-scope"
                value="future"
                checked={scope === 'future'}
                onChange={() => setScope('future')}
                className="mt-0.5 w-4 h-4 text-primary focus:ring-ring"
              />
              <div>
                <div className="text-sm font-medium text-foreground">This and future occurrences</div>
                <div className="text-[11px] text-muted-foreground">
                  Changes from {format(occurrenceDate, 'MMM d')} onwards. Earlier occurrences stay the same.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-accent/30 transition-colors">
              <input
                type="radio"
                name="occurrence-scope"
                value="all"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                className="mt-0.5 w-4 h-4 text-primary focus:ring-ring"
              />
              <div>
                <div className="text-sm font-medium text-foreground">All occurrences</div>
                <div className="text-[11px] text-muted-foreground">
                  The change applies to every occurrence of this task.
                </div>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="px-5 py-4 border-t border-border flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1 h-10">
              Cancel
            </Button>
            <Button
              onClick={() => onConfirm(scope)}
              className="flex-1 h-10 gap-1.5"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              Confirm
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
