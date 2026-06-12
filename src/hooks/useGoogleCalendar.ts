import { useState, useEffect, useCallback, useRef } from 'react';
import type { GoogleEvent, CalendarEvent } from '../lib/google';
import {
  loadGoogleApi,
  requestAccessToken,
  trySilentAuth,
  fetchCalendarEvents,
  hasValidToken,
  isSignedIn,
  signOut,
  GoogleAuthError,
} from '../lib/google';

interface UseGoogleCalendarReturn {
  isLoaded: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Stable error object with a `code` for UI branching and `message` for display.
   *  Always a GoogleAuthError (non-Error throws are wrapped). */
  error: GoogleAuthError | null;
  events: CalendarEvent[];
  connect: () => Promise<void>;
  disconnect: () => void;
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

export function useGoogleCalendar(): UseGoogleCalendarReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GoogleAuthError | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const initialized = useRef(false);
  const authChecked = useRef(false);

  // Phase 1: Load Google API on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      if (initialized.current) return;
      initialized.current = true;

      try {
        console.log('[useGoogleCalendar] Loading Google API...');
        await loadGoogleApi();
        if (mounted) {
          setIsLoaded(true);
          console.log('[useGoogleCalendar] Google API loaded');
        }
      } catch (err) {
        console.error('[useGoogleCalendar] Failed to load Google API:', err);
        if (mounted) {
          setError(new GoogleAuthError('OTHER', 'Failed to load Google Calendar API'));
        }
      }
    }

    init();

    return () => {
      mounted = false;
      initialized.current = false;
    };
  }, []);

  // Phase 2: Once loaded, check for existing auth and auto-authenticate
  useEffect(() => {
    if (!isLoaded || authChecked.current) return;
    authChecked.current = true;

    async function checkAuth() {
      console.log('[useGoogleCalendar] Checking existing auth...');

      try {
        // Check if we have a valid token from sessionStorage
        if (hasValidToken()) {
          console.log('[useGoogleCalendar] Found valid token in sessionStorage, authenticating');
          setIsAuthenticated(true);
          setIsLoading(true);

          try {
            const googleEvents = await fetchCalendarEvents();
            const mapped = googleEvents.map(mapGoogleEvent);
            setEvents(mapped);
            console.log(`[useGoogleCalendar] Loaded ${mapped.length} events on restore`);
          } catch (err) {
            console.warn('[useGoogleCalendar] Failed to fetch events on restore:', err);
          } finally {
            setIsLoading(false);
          }
          return;
        }

        // Try silent auth - works if Google has a session cookie
        console.log('[useGoogleCalendar] No stored token, trying silent auth...');
        const ok = await trySilentAuth();

        if (ok) {
          console.log('[useGoogleCalendar] Silent auth succeeded');
          setIsAuthenticated(true);
          setIsLoading(true);

          try {
            const googleEvents = await fetchCalendarEvents();
            const mapped = googleEvents.map(mapGoogleEvent);
            setEvents(mapped);
            console.log(`[useGoogleCalendar] Loaded ${mapped.length} events after silent auth`);
          } catch (err) {
            console.warn('[useGoogleCalendar] Failed to fetch events after silent auth:', err);
          } finally {
            setIsLoading(false);
          }
        } else {
          console.log('[useGoogleCalendar] Silent auth failed, user needs to click connect');
        }
      } catch (err) {
        console.error('[useGoogleCalendar] Auth check failed:', err);
      }
    }

    checkAuth();
  }, [isLoaded]);

  const connect = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      console.log('[useGoogleCalendar] Requesting access token (consent popup)...');
      await requestAccessToken();
      console.log('[useGoogleCalendar] Access token obtained');
      setIsAuthenticated(true);

      // Auto-fetch events after connect
      console.log('[useGoogleCalendar] Auto-fetching events after connect...');
      const googleEvents = await fetchCalendarEvents();
      const mapped = googleEvents.map(mapGoogleEvent);
      setEvents(mapped);
      console.log(`[useGoogleCalendar] Loaded ${mapped.length} events`);
    } catch (err: unknown) {
      console.error('[useGoogleCalendar] Connection failed:', err);
      setIsAuthenticated(false);
      setError(
        err instanceof GoogleAuthError
          ? err
          : new GoogleAuthError('OTHER', err instanceof Error ? err.message : 'Failed to connect to Google Calendar')
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    console.log('[useGoogleCalendar] Disconnecting...');
    signOut();
    setIsAuthenticated(false);
    setEvents([]);
    setError(null);
    authChecked.current = false;
  }, []);

  const refreshEvents = useCallback(async () => {
    if (!isSignedIn()) {
      console.warn('[useGoogleCalendar] Not authenticated, cannot refresh');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      console.log('[useGoogleCalendar] Refreshing events...');
      const googleEvents = await fetchCalendarEvents();
      const mapped = googleEvents.map(mapGoogleEvent);
      setEvents(mapped);
      console.log(`[useGoogleCalendar] Refreshed ${mapped.length} events`);
    } catch (err: unknown) {
      console.error('[useGoogleCalendar] Refresh failed:', err);
      setError(
        err instanceof GoogleAuthError
          ? err
          : new GoogleAuthError('OTHER', err instanceof Error ? err.message : 'Failed to refresh events')
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoaded,
    isAuthenticated,
    isLoading,
    error,
    events,
    connect,
    disconnect,
    refreshEvents,
  };
}