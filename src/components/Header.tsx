import { Calendar, RefreshCw, Unlink, ChevronDown, LogOut, Sun, Moon, Settings as SettingsIcon } from 'lucide-react';
import { Button } from './ui/button';
import { useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface HeaderProps {
  isAuthenticated: boolean;
  onDisconnect: () => void;
  onRefresh: () => void;
  onScheduleAll: () => void;
  unscheduledCount: number;
  user: SupabaseUser | null;
  onSignOut: () => Promise<void>;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export function Header({
  isAuthenticated,
  onDisconnect, onRefresh, onScheduleAll, unscheduledCount,
  user, onSignOut, theme, onToggleTheme, onOpenSettings,
}: HeaderProps) {
  const [showAccount, setShowAccount] = useState(false);

  return (
    <header className="sticky top-0 z-30 h-12 flex items-center gap-3 px-4 bg-card/95 backdrop-blur-sm border-b border-border">
      {/* Brand */}
      <div className="flex items-center gap-2.5 mr-2">
        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
          <Calendar className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <span className="text-sm font-semibold text-foreground tracking-tight hidden sm:inline">Tempo Calendar</span>
      </div>

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
              className="h-8 px-3 text-xs font-medium gap-2"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Schedule all</span>
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md text-xs font-semibold">
                {unscheduledCount}
              </span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            className="h-8 w-8"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            className="h-8 w-8"
            title="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </Button>

          {/* Account menu */}
          <div className="relative">
            <button
              onClick={() => setShowAccount(!showAccount)}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg hover:bg-accent transition-colors text-xs text-muted-foreground"
            >
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-[10px] font-medium text-primary">{user?.email?.charAt(0).toUpperCase() || 'U'}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showAccount && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAccount(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 animate-slide-down">
                  <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border truncate">
                    {user?.email || 'Account'}
                  </div>
                  <button
                    onClick={() => { onToggleTheme(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
                  >
                    {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                  </button>
                  <button
                    onClick={() => { onDisconnect(); setShowAccount(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    Disconnect Google Calendar
                  </button>
                  <button
                    onClick={() => { onSignOut(); setShowAccount(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out of Tempo
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Note: the two unauthenticated branches ("not signed in to Tempo" and
          "signed in but not connected to Google") used to render a small CTA
          button here. Each branch now has a prominent primary CTA in the
          main content area, and the LeftRail is hidden on those branches,
          so the small Header CTA was redundant. The Header is brand +
          status only in unauth states; the workspace branch shows the
          full set of actions below. */}
    </header>
  );
}