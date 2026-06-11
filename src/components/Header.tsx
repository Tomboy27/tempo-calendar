import { Calendar, RefreshCw, Link2, Unlink, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { useState } from 'react';

interface HeaderProps {
  activeView: 'calendar' | 'tasks';
  onViewChange: (view: 'calendar' | 'tasks') => void;
  isAuthenticated: boolean;
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onScheduleAll: () => void;
  unscheduledCount: number;
}

export function Header({
  activeView, onViewChange, isAuthenticated, isLoaded, isLoading,
  error, onConnect, onDisconnect, onRefresh, onScheduleAll, unscheduledCount,
}: HeaderProps) {
  const [showAccount, setShowAccount] = useState(false);

  return (
    <header className="sticky top-0 z-30 h-11 flex items-center gap-3 px-4 bg-card/95 backdrop-blur-sm border-b border-border">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
          <Calendar className="w-3 h-3 text-primary-foreground" />
        </div>
        <span className="text-sm font-semibold text-foreground tracking-tight hidden sm:inline">FlowSavvy</span>
      </div>

      {/* Navigation - only when authenticated */}
      {isAuthenticated && (
        <div className="flex items-center gap-0.5 bg-muted rounded p-0.5">
          {(['calendar', 'tasks'] as const).map((view) => (
            <button
              key={view}
              onClick={() => onViewChange(view)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                activeView === view
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {view === 'calendar' ? 'Calendar' : 'Tasks'}
            </button>
          ))}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      {isAuthenticated && (
        <div className="flex items-center gap-2">
          {unscheduledCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onScheduleAll}
              className="h-7 px-2 text-xs font-medium gap-1.5"
            >
              <Calendar className="w-3 h-3" />
              <span className="hidden sm:inline">Schedule all</span>
              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-semibold">
                {unscheduledCount}
              </span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            className="h-7 w-7"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>

          {/* Account menu */}
          <div className="relative">
            <button
              onClick={() => setShowAccount(!showAccount)}
              className="flex items-center gap-1 h-7 px-2 rounded hover:bg-accent transition-colors text-xs text-muted-foreground"
            >
              <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-[9px] font-medium text-primary">G</span>
              </div>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showAccount && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAccount(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-md z-50 py-1 animate-slide-down">
                  <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                    Google Calendar
                  </div>
                  <button
                    onClick={() => { onDisconnect(); setShowAccount(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
                  >
                    <Unlink className="w-3 h-3" />
                    Disconnect
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Not authenticated */}
      {!isAuthenticated && isLoaded && !error && (
        <Button
          size="sm"
          onClick={onConnect}
          disabled={isLoading}
          className="h-7 px-3 text-xs gap-1.5"
        >
          <Link2 className="w-3 h-3" />
          {isLoading ? 'Connecting...' : 'Connect Google'}
        </Button>
      )}
    </header>
  );
}