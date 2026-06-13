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
  /**
   * Called when the latest fetch detects that one or more Google events
   * have disappeared (e.g. the user deleted them in Google Calendar).
   * The consumer should reconcile local state — typically by unlinking
   * any tasks whose `google_event_id` matches a deleted ID.
   *
   * Fires on the FIRST poll after a new auth (skipped, because the
   * `previousGoogleEventIdsRef` is reset on auth change so the diff
   * only contains events that vanished during this session).
   */
  onEventsDeleted?: (deletedIds: string[]) => void;
  /**
   * How often to re-fetch events automatically, in ms. Default 60_000.
   * Pass `0` to disable polling. Polling is paused while the tab is
   * hidden and while the user is in the `disconnected` state.
   */
  pollIntervalMs?: number;
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
  /** Timestamp of the most recent successful fetch, or null. */
  lastSyncAt: Date | null;
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

export function useGoogleCalendar({
  accessToken,
  onEventsDeleted,
  pollIntervalMs = 60_000,
}: UseGoogleCalendarOptions): UseGoogleCalendarReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GoogleAuthError | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  // `disconnect()` is a local action that flips the derived
  // `isAuthenticated` to false without requiring the parent to clear the
  // `accessToken` prop. We keep BOTH a state (for the public flag, which
  // is safe to read in render) AND a ref (for internal use, so the
  // `useCallback`/`useEffect` deps below stay stable — a state dep would
  // re-fire the token-sync effect on disconnect and undo the disconnect).
  const [disconnected, setDisconnected] = useState(false);
  const disconnectedRef = useRef(false);
  // Track which token we last acted on so we don't refetch on every render
  // (e.g. when the parent passes the same token reference).
  const lastTokenRef = useRef<string | null | undefined>(undefined);
  // Track the set of Google event IDs we saw on the previous successful
  // fetch so we can diff against the next fetch and report deletions.
  // Reset on auth change / disconnect so we don't fire `onEventsDeleted`
  // for events that vanished while the user was signed out.
  const previousGoogleEventIdsRef = useRef<Set<string>>(new Set());
  // `onEventsDeleted` is a consumer callback — keep a ref so the
  // fetchAndSetEvents closure doesn't need to be rebuilt when it changes.
  const onEventsDeletedRef = useRef(onEventsDeleted);
  useEffect(() => { onEventsDeletedRef.current = onEventsDeleted; }, [onEventsDeleted]);
  // Mirror `disconnected` into a ref so internal callers (the fetch
  // closure and the polling interval) can read the latest value without
  // listing `disconnected` in their dependency arrays. This is the only
  // place that owns the mirror, preventing drift between state and ref.
  useEffect(() => { disconnectedRef.current = disconnected; }, [disconnected]);

  const fetchAndSetEvents = useCallback(async () => {
    if (disconnectedRef.current) return;
    setError(null);
    setIsLoading(true);
    try {
      console.log('[useGoogleCalendar] Fetching calendar events with Supabase-provided token');
      const googleEvents = await fetchCalendarEvents();
      const mapped = googleEvents.map(mapGoogleEvent);
      // Diff against the previous fetch to find events that disappeared
      // (i.e. the user deleted them in Google Calendar between polls).
      // The catch block below never calls `onEventsDeleted`, so a transient
      // fetch failure (network blip, auth glitch) can't fire a false
      // "delete everything" event from this path. We do, however, gate on
      // a non-empty baseline so the very first fetch after sign-in doesn't
      // report "all events deleted" when the ref starts empty.
      const newIds = new Set(mapped.map((e) => e.id));
      const deletedIds: string[] = [];
      for (const prevId of previousGoogleEventIdsRef.current) {
        if (!newIds.has(prevId)) deletedIds.push(prevId);
      }
      const hasBaseline = previousGoogleEventIdsRef.current.size > 0;
      if (hasBaseline && deletedIds.length > 0) {
        console.log(`[useGoogleCalendar] Detected ${deletedIds.length} deleted Google event(s)`, deletedIds);
        onEventsDeletedRef.current?.(deletedIds);
      }
      previousGoogleEventIdsRef.current = newIds;
      setEvents(mapped);
      setLastSyncAt(new Date());
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
      // Intentionally do NOT clear `events` or update
      // `previousGoogleEventIdsRef` on error. A transient error would
      // otherwise make the next successful fetch look like "every event
      // reappeared" or, worse, cause a false "deletion" of the entire
      // calendar. Keeping the previous state lets the next successful
      // fetch reconcile naturally.
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sync the access token from the Supabase session into the `google`
  // module whenever it changes, then auto-fetch events. This effect
  // intentionally performs the initial sync; the only alternative is
  // to gate everything on a user action, which would leave the calendar
  // empty until the first interaction. The setState calls below are
  // legitimate and short-circuited by `lastTokenRef` to avoid loops.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (accessToken === lastTokenRef.current) return;
    lastTokenRef.current = accessToken;
    // A fresh accessToken means the user has (re-)authenticated, so
    // clear any prior `disconnect()` override AND reset the diff baseline
    // so we don't report "deletions" for events that disappeared while
    // the user was signed out (we only care about events that vanish
    // during an active session). The state setter also flows to
    // `disconnectedRef` via the mirror effect above.
    setDisconnected(false);
    previousGoogleEventIdsRef.current = new Set();

    if (accessToken) {
      console.log('[useGoogleCalendar] Supabase session has a Google access token, syncing');
      setAccessToken(accessToken);
      void fetchAndSetEvents();
    } else {
      console.log('[useGoogleCalendar] No Google access token in session, clearing');
      clearAccessToken();
      setEvents([]);
      setLastSyncAt(null);
    }
  }, [accessToken, fetchAndSetEvents]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Polling for external changes (two-way sync). Only runs when
  // authenticated, not while disconnected, not while the tab is hidden,
  // and only if `pollIntervalMs > 0`. The setInterval callback is the
  // intended pattern for recurring fetches and reads `disconnectedRef`
  // (not the `disconnected` state) so this effect doesn't re-arm on
  // every disconnect/reconnect.
  useEffect(() => {
    if (!accessToken || !pollIntervalMs || pollIntervalMs <= 0) return;
    const id = window.setInterval(() => {
      if (disconnectedRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      console.log('[useGoogleCalendar] Polling for external changes');
      void fetchAndSetEvents();
    }, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [accessToken, pollIntervalMs, fetchAndSetEvents]);

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
    setLastSyncAt(null);
    lastTokenRef.current = null;
    // The state setter flows to `disconnectedRef` via the mirror effect
    // above, so the ref is updated in one place only.
    setDisconnected(true);
    previousGoogleEventIdsRef.current = new Set();
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
    isAuthenticated: accessToken !== null && !disconnected,
    isLoading,
    error,
    events,
    lastSyncAt,
    connect,
    disconnect,
    refreshEvents,
  };
}