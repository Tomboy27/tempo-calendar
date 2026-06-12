import { Calendar, ListTodo, Settings as SettingsIcon, LogOut, User, Unlink, Sun, Moon, Sparkles, RefreshCw, Link2, AlertCircle, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/utils';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export type LeftRailView = 'calendar' | 'tasks';

interface LeftRailProps {
  activeView: LeftRailView;
  onViewChange: (view: LeftRailView) => void;
  isAuthenticated: boolean;
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onScheduleAll: () => void;
  unscheduledCount: number;
  user: SupabaseUser | null;
  onSignIn: () => void;
  onSignOut: () => Promise<void>;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

/**
 * Left navigation rail. 64px wide, full height, sits flush against the left
 * edge. Replaces the old top "Calendar / Tasks" pill toggle (which was
 * ambiguous and took header real estate). Pattern matches Linear / Cron /
 * Notion's left-rail navigation.
 *
 * Structure:
 *   - Brand mark (top)
 *   - Primary nav (Calendar / Tasks) with active indicator + badge
 *   - Quick actions (Plan inbox, Refresh)
 *   - Settings link
 *   - Account avatar with popover (theme, disconnect, sign out)
 *
 * When not authenticated to a calendar, the rail collapses to brand + status
 * (loading spinner / error icon / connect CTA) + account, so it still feels
 * alive instead of empty.
 */
export function LeftRail({
  activeView,
  onViewChange,
  isAuthenticated,
  isLoaded,
  isLoading,
  error,
  onConnect,
  onDisconnect,
  onRefresh,
  onScheduleAll,
  unscheduledCount,
  user,
  onSignIn,
  onSignOut,
  theme,
  onToggleTheme,
  onOpenSettings,
}: LeftRailProps) {
  const [showAccount, setShowAccount] = useState(false);

  return (
    <aside
      className="w-[64px] shrink-0 h-full bg-card border-r border-border flex flex-col items-center py-3 gap-1 z-20"
      aria-label="Primary navigation"
    >
      {/* Brand mark */}
      <div
        className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-3 shadow-sm"
        title="Tempo Calendar"
      >
        {/* Tempo mark: three vertical bars of different heights.
            A rhythm/equalizer pattern that says "tempo" without being a letter. */}
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-6 h-6 text-primary-foreground"
          aria-hidden
        >
          <rect x="4" y="14" width="3" height="8" rx="0.6" />
          <rect x="10.5" y="7" width="3" height="15" rx="0.6" />
          <rect x="17" y="11" width="3" height="11" rx="0.6" />
        </svg>
      </div>

      {/* Primary nav + actions (only when authenticated) */}
      {isAuthenticated && (
        <div className="flex flex-col items-center gap-1 flex-1 w-full px-2">
          <RailItem
            icon={Calendar}
            label="Calendar"
            active={activeView === 'calendar'}
            onClick={() => onViewChange('calendar')}
          />
          <RailItem
            icon={ListTodo}
            label="Tasks"
            active={activeView === 'tasks'}
            onClick={() => onViewChange('tasks')}
            badge={unscheduledCount > 0 ? unscheduledCount : undefined}
          />
          <RailDivider />
          <RailItem
            icon={Sparkles}
            label="Plan inbox"
            active={false}
            onClick={onScheduleAll}
            disabled={unscheduledCount === 0}
          />
          <RailItem
            icon={RefreshCw}
            label="Refresh"
            active={false}
            onClick={onRefresh}
            disabled={isLoading}
          />
        </div>
      )}

      {/* Unauthenticated: status + connect CTA so the rail still feels alive */}
      {!isAuthenticated && (
        <div className="flex-1 w-full px-2 flex flex-col items-center gap-1.5">
          {error && (
            <div
              className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center"
              title={error}
              aria-label={error}
            >
              <AlertCircle className="w-4 h-4 text-destructive" />
            </div>
          )}
          {!error && !isLoaded && (
            <div
              className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"
              title="Loading"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
            </div>
          )}
          {isLoaded && !error && (
            <button
              onClick={onConnect}
              disabled={isLoading}
              className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm"
              title={isLoading ? 'Connecting…' : 'Connect Google Calendar'}
              aria-label="Connect Google Calendar"
            >
              <Link2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Bottom: settings + account */}
      <div className="flex flex-col items-center gap-1 w-full px-2 mt-2">
        {isAuthenticated && (
          <RailItem
            icon={SettingsIcon}
            label="Settings"
            active={false}
            onClick={onOpenSettings}
          />
        )}

        {/* Account menu */}
        <div className="relative w-full flex justify-center">
          {user ? (
            <>
              <button
                onClick={() => setShowAccount(!showAccount)}
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                  showAccount
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-primary/10 text-primary hover:bg-primary/20',
                )}
                aria-label="Account menu"
                aria-expanded={showAccount}
                title={user.email || 'Account'}
              >
                {user.email?.charAt(0).toUpperCase() || 'U'}
              </button>
              {showAccount && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowAccount(false)}
                    aria-hidden
                  />
                  <div
                    className="absolute left-full ml-2 bottom-0 w-56 bg-popover border border-border rounded-lg shadow-xl z-50 py-1 animate-slide-in-right"
                    role="menu"
                  >
                    <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border truncate">
                      {user.email}
                    </div>
                    <button
                      onClick={() => { onToggleTheme(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
                      role="menuitem"
                    >
                      {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                    </button>
                    {isAuthenticated && (
                      <button
                        onClick={() => { onDisconnect(); setShowAccount(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
                        role="menuitem"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        Disconnect calendar
                      </button>
                    )}
                    <div className="border-t border-border my-0.5" />
                    <button
                      onClick={() => { onSignOut(); setShowAccount(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/5 transition-colors"
                      role="menuitem"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <RailItem
              icon={User}
              label="Sign in"
              active={false}
              onClick={onSignIn}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

interface RailItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
  onClick: () => void;
}

function RailItem({ icon: Icon, label, active, disabled, badge, onClick }: RailItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative w-10 h-10 rounded-lg flex items-center justify-center transition-all',
        active && 'bg-primary/10 text-primary',
        !active && !disabled && 'text-muted-foreground hover:text-foreground hover:bg-accent',
        disabled && 'text-muted-foreground/40 cursor-not-allowed',
      )}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={label}
    >
      <Icon className="w-[18px] h-[18px]" />
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center tabular-nums">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {/* Active indicator: small left bar */}
      {active && (
        <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary" />
      )}
    </button>
  );
}

function RailDivider() {
  return <div className="w-6 h-px bg-border my-1" />;
}

// Re-export the ArrowLeft icon so the workspace can use it for a "back to calendar" button.
export { ArrowLeft };
