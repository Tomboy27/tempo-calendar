import { useState, useEffect } from 'react';
import { X, Sun, Moon, Monitor, Bell, LogOut, Unlink, User, Calendar, Info, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSetTheme: (theme: 'light' | 'dark') => void;
  onUseSystemTheme: () => void;
  user: SupabaseUser | null;
  isGoogleConnected: boolean;
  onDisconnectGoogle: () => void;
  onSignOut: () => Promise<void>;
  workingHours: { start: string; end: string };
  onWorkingHoursChange: (hours: { start: string; end: string }) => void;
}

type Section = 'appearance' | 'schedule' | 'account';

export function SettingsPanel({
  open,
  onClose,
  theme,
  onToggleTheme,
  onSetTheme,
  onUseSystemTheme,
  user,
  isGoogleConnected,
  onDisconnectGoogle,
  onSignOut,
  workingHours,
  onWorkingHoursChange,
}: SettingsPanelProps) {
  const [section, setSection] = useState<Section>('appearance');

  // Lock scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={cn(
          'fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[420px] bg-card border-l border-border shadow-2xl',
          'flex flex-col animate-slide-in-right',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Settings</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Make Tempo feel like yours</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Section nav */}
          <nav className="w-[140px] border-r border-border bg-muted/20 py-3 px-2 shrink-0">
            {([
              { key: 'appearance', label: 'Appearance', icon: Sun },
              { key: 'schedule', label: 'Schedule', icon: Calendar },
              { key: 'account', label: 'Account', icon: User },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setSection(key)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium rounded-md transition-colors mb-0.5 text-left',
                  section === key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-card/50 hover:text-foreground',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </nav>

          {/* Section content */}
          <div className="flex-1 overflow-y-auto tempo-scrollbar p-5">
            {section === 'appearance' && (
              <div className="space-y-6">
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                    Theme
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: 'light', label: 'Light', icon: Sun, isSystem: false },
                      { value: 'dark', label: 'Dark', icon: Moon, isSystem: false },
                      { value: 'system', label: 'Auto', icon: Monitor, isSystem: true },
                    ] as const).map(({ value, label, icon: Icon, isSystem }) => {
                      const isActive = isSystem
                        ? !localStorage.getItem('tempo-theme')
                        : theme === value;
                      return (
                        <button
                          key={value}
                          onClick={() => {
                            if (isSystem) {
                              onUseSystemTheme();
                            } else {
                              onSetTheme(value as 'light' | 'dark');
                            }
                          }}
                          className={cn(
                            'flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors',
                            isActive
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="text-xs font-medium">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                    About
                  </h3>
                  <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">App</span>
                      <span className="font-medium text-foreground">Tempo Calendar</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-mono text-foreground">{import.meta.env.MODE === 'production' ? 'v1.0.0' : 'dev'}</span>
                    </div>
                    <a
                      href="https://github.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between text-xs hover:text-foreground transition-colors pt-1.5 border-t border-border mt-2"
                    >
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        Source & docs
                      </span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </a>
                  </div>
                </section>
              </div>
            )}

            {section === 'schedule' && (
              <div className="space-y-6">
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                    Working hours
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    Tasks are scheduled into open time within these hours. Defaults to 9 - 5.
                  </p>
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card">
                    <input
                      type="time"
                      value={workingHours.start}
                      onChange={(e) => onWorkingHoursChange({ ...workingHours, start: e.target.value })}
                      className="px-2 py-1.5 text-sm font-medium bg-muted rounded-md focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
                    />
                    <span className="text-muted-foreground text-sm">to</span>
                    <input
                      type="time"
                      value={workingHours.end}
                      onChange={(e) => onWorkingHoursChange({ ...workingHours, end: e.target.value })}
                      className="px-2 py-1.5 text-sm font-medium bg-muted rounded-md focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
                    />
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                    Notifications
                  </h3>
                  <button
                    disabled
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-card opacity-60 cursor-not-allowed"
                  >
                    <div className="flex items-center gap-2.5">
                      <Bell className="w-4 h-4 text-muted-foreground" />
                      <div className="text-left">
                        <div className="text-sm font-medium text-foreground">Reminders</div>
                        <div className="text-[11px] text-muted-foreground">Coming soon</div>
                      </div>
                    </div>
                  </button>
                </section>
              </div>
            )}

            {section === 'account' && (
              <div className="space-y-6">
                {user && (
                  <section>
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                      Signed in
                    </h3>
                    <div className="p-3 rounded-lg border border-border bg-card flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-primary">
                          {user.email?.charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{user.email}</div>
                        <div className="text-[11px] text-muted-foreground">Tempo account</div>
                      </div>
                    </div>
                  </section>
                )}

                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                    Connections
                  </h3>
                  <div className="space-y-2">
                    <div className="p-3 rounded-lg border border-border bg-card flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-info/10 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-info" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">Google Calendar</div>
                        <div className="text-[11px] text-muted-foreground">
                          {isGoogleConnected ? 'Connected' : 'Not connected'}
                        </div>
                      </div>
                      {isGoogleConnected && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={onDisconnectGoogle}
                          className="h-8 text-xs gap-1.5"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                          Disconnect
                        </Button>
                      )}
                    </div>
                  </div>
                </section>

                {user && (
                  <section>
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                      Sign out
                    </h3>
                    <Button
                      variant="ghost"
                      onClick={onSignOut}
                      className="w-full h-10 justify-center gap-2 text-destructive hover:bg-destructive/5 hover:text-destructive"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out of Tempo
                    </Button>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
