import { useState, useEffect, useCallback, useRef } from 'react';
import type { GoogleEvent, CalendarEvent } from '../lib/google';
import {
  fetchCalendarEvents,
  setAccessToken,
  clearAccessToken,
  GoogleAuthError,
} from '../lib/google';

interface UseGoogleCalendarOptions {
  /**
   * The Google access token attached to the current Supabase session, or
   * `null` if the user signed in with email/password (or isn't signed in).
   * When this changes, the hook syncs it into the `google` module and
   * auto-fetches events.
   */
  accessToken: string | null;
}

interface UseGoogleCalendarReturn {
  /** Always true (kept for API compatibility; nothing to "load" anymore). */
  isLoaded: boolean;
  /** True iff `accessToken` is non-null. Derived directly from the prop. */
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Stable error object for UI display. Always a `GoogleAuthError`. */
  error: GoogleAuthError | null;
  events: CalendarEvent[];
  /**
   * No-op for API compatibility. Calendar connection now happens
   * automatically as soon as the user signs in to Supabase via Google,
   * via the `provider_token` attached to the session. The button that
   * previously called this should now call `auth.connectGoogleCalendar()`
   * to trigger a Google OAuth re-auth.
   */
  connect: () => Promise<void>;
  /** Disconnect by clearing the in-memory token. Does not affect Supabase session. */
  disconnect: () => void;
  /** Re-fetch calendar events using the current token. */
  refreshEvents: () => Promise<void>;
}

function mapGoogleEvent(event: GoogleEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.summary,
    description: event.description || '',
    startTime: event.start.dateTime || event.start.date || '',
    endTime: event.end.dateTime || event.end.date || '',
    calendar: 'primary',
    source: 'google',
    color: event.colorId ? getColorFromId(event.colorId) : undefined,
  };
}

function getColorFromId(colorId: string): string {
  const colors: Record<string, string> = {
    '1': '#7986cb',
    '2': '#33b679',
    '3': '#8e24aa',
    '4': '#e67c73',
    '5': '#f6c026',
    '6': '#f5511d',
    '7': '#039be5',
    '8': '#616161',
    '9': '#3f51b5',
    '10': '#0b8043',
    '11': '#d50000',
  };
  return colors[colorId] || '#7986cb';
}

export function useGoogleCalendar({ accessToken }: UseGoogleCalendarOptions): UseGoogleCalendarReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GoogleAuthError | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  // Track which token we last acted on so we don't refetch on every render
  // (e.g. when the parent passes the same token reference).
  const lastTokenRef = useRef<string | null | undefined>(undefined);
  // `disconnect()` is a local action that shouldn't get re-applied when
  // the parent re-renders with the same `accessToken`. We use a ref (not
  // state) so flipping it doesn't trigger a re-render — the `isAuthenticated`
  // value is recomputed on render and reads the ref.
  const disconnectedRef = useRef(false);

  const fetchAndSetEvents = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      console.log('[useGoogleCalendar] Fetching calendar events with Supabase-provided token');
      const googleEvents = await fetchCalendarEvents();
      const mapped = googleEvents.map(mapGoogleEvent);
      setEvents(mapped);
      console.log(`[useGoogleCalendar] Loaded ${mapped.length} events`);
    } catch (err: unknown) {
      console.error('[useGoogleCalendar] Failed to fetch events:', err);
      if (err instanceof GoogleAuthError) {
        // The REST helpers throw `GoogleAuthError` with a message that
        // encodes the HTTP status for 4xx responses. Re-wrap 401s with a
        // friendlier "session expired" message; pass everything else
        // through unchanged. Also clear the in-memory token so the next
        // call fails fast with "Not authenticated" instead of retrying
        // with the same dead token (and surfacing the same 401).
        if (/401|invalid[_\s-]?token|expired|unauthor/i.test(err.message)) {
          clearAccessToken();
          setError(new GoogleAuthError(
            'Google session expired. Please sign in again to reconnect your calendar.'
          ));
        } else {
          setError(err);
        }
      } else {
        setError(new GoogleAuthError(
          err instanceof Error ? err.message : 'Failed to fetch calendar events'
        ));
      }
      // Don't keep showing stale events after an error.
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sync the access token from the Supabase session into the `google`
  // module whenever it changes, then auto-fetch events.
  useEffect(() => {
    if (accessToken === lastTokenRef.current) return;
    lastTokenRef.current = accessToken;
    // A fresh accessToken means the user has (re-)authenticated, so
    // clear any prior `disconnect()` override.
    disconnectedRef.current = false;

    if (accessToken) {
      console.log('[useGoogleCalendar] Supabase session has a Google access token, syncing');
      setAccessToken(accessToken);
      void fetchAndSetEvents();
    } else {
      console.log('[useGoogleCalendar] No Google access token in session, clearing');
      clearAccessToken();
      setEvents([]);
    }
  }, [accessToken, fetchAndSetEvents]);

  /**
   * Legacy no-op kept for API compatibility. The actual "connect" flow
   * now lives in `useAuth.connectGoogleCalendar`, which triggers a
   * Supabase Google OAuth re-auth that refreshes the session with a
   * new `provider_token` (which flows back through the accessToken prop).
   */
  const connect = useCallback(async () => {
    console.warn(
      '[useGoogleCalendar] connect() is a no-op. Use auth.connectGoogleCalendar() to trigger a Google OAuth re-auth.'
    );
  }, []);

  const disconnect = useCallback(() => {
    console.log('[useGoogleCalendar] Disconnecting (clearing in-memory Google token only)');
    clearAccessToken();
    setEvents([]);
    setError(null);
    lastTokenRef.current = null;
    disconnectedRef.current = true;
  }, []);

  const refreshEvents = useCallback(async () => {
    if (!accessToken) {
      console.warn('[useGoogleCalendar] No Google access token in session, cannot refresh');
      return;
    }
    await fetchAndSetEvents();
  }, [accessToken, fetchAndSetEvents]);

  return {
    // `isLoaded` was originally "have we finished loading the GIS library
    // + first auth check?" In the new flow there's nothing to load, so
    // it's always true. Kept for API compatibility with `App.tsx`.
    isLoaded: true,
    // Derived from the prop, with a local override so `disconnect()`
    // can flip it to false even though the `accessToken` prop is unchanged.
    isAuthenticated: accessToken !== null && !disconnectedRef.current,
    isLoading,
    error,
    events,
    connect,
    disconnect,
    refreshEvents,
  };
}