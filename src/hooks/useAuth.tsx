import { useState, useEffect, useCallback, useMemo, createContext, useContext, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

/**
 * Calendar scopes requested during Supabase Google OAuth. These are
 * forwarded to the underlying Google auth flow by Supabase, and the
 * resulting `provider_token` is what the app uses to call the
 * Google Calendar REST API. By piggybacking on Supabase's OAuth
 * (instead of GIS popups), we sidestep Chrome 131+'s third-party
 * cookie / popup blocker issues entirely.
 */
const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * The Google access token attached to the current Supabase session, or
   * `null` if the user signed in with email/password (or hasn't signed in).
   * Use this to call the Google Calendar REST API directly.
   */
  googleAccessToken: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  /**
   * Triggers Google OAuth with Calendar scopes and returns. Use this for
   * the in-app "Connect Calendar" button when the user is already signed
   * in via Supabase (any provider) but doesn't yet have a Google access
   * token. If the user is not signed in, prefer `signInWithGoogle` instead.
   */
  connectGoogleCalendar: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- supabase not configured, stop loading
      setIsLoading(false);
      return;
    }

    // Check for existing session
    supabase.auth.getSession().then(({ data, error: err }) => {
      if (!mountedRef.current) return;
      if (err) {
        // getSession error — surfaced via auth state
      } else {
        setSession(data.session);
        setUser(data.session?.user ?? null);
      }
      setIsLoading(false);
    });

    // Subscribe to auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mountedRef.current) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    setError(null);
    setIsLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (mountedRef.current) setIsLoading(false);
    if (err) {
      if (mountedRef.current) setError(err.message);
      throw err;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    setError(null);
    setIsLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    if (mountedRef.current) setIsLoading(false);
    if (err) {
      if (mountedRef.current) setError(err.message);
      throw err;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error('Supabase is not configured');
    setError(null);
    // Request Calendar scopes during the initial sign-in. Supabase's Google
    // OAuth flow runs server-side and returns a session with `provider_token`
    // (a Google access token) and `provider_refresh_token`. We use the
    // access token directly to call the Google Calendar REST API — this
    // sidesteps Chrome 131+'s third-party cookie / popup blockers that
    // break the legacy GIS popup flow.
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: GOOGLE_CALENDAR_SCOPES,
        queryParams: {
          // Always show the account picker so users on shared computers can
          // sign in with a different Google account without signing out of
          // the browser. The default (`select_account`) is already this
          // behavior, but we set it explicitly to make the intent clear.
          prompt: 'select_account',
        },
      },
    });
    if (err) {
      if (mountedRef.current) setError(err.message);
      throw err;
    }
  }, []);

  const connectGoogleCalendar = useCallback(async () => {
    if (!supabase) throw new Error('Supabase is not configured');
    setError(null);
    // Same OAuth call as sign-in, but exposed separately for the
    // "Connect Calendar" button on the calendar-gated screen. Calling
    // signInWithOAuth while already signed in (with any provider) links
    // the Google identity and refreshes the session with a new
    // `provider_token` that includes the Calendar scopes.
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: GOOGLE_CALENDAR_SCOPES,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (err) {
      if (mountedRef.current) setError(err.message);
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) throw new Error('Supabase is not configured');
    setError(null);
    setIsLoading(true);
    await supabase.auth.signOut();
    if (mountedRef.current) {
      setUser(null);
      setSession(null);
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /**
   * The Google access token attached to the current session, or null if
   * the user signed in with email/password. Recomputed on every session
   * change so consumers see fresh tokens.
   */
  const googleAccessToken = useMemo<string | null>(
    () => (session?.provider_token as string | undefined) ?? null,
    [session]
  );

  const value: AuthContextValue = {
    user,
    session,
    isLoading,
    isAuthenticated: !!user,
    googleAccessToken,
    signIn,
    signUp,
    signInWithGoogle,
    connectGoogleCalendar,
    signOut,
    error,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
