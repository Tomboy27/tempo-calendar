import { useState, useEffect, useCallback, useRef } from 'react';
import type { GoogleEvent, CalendarEvent, GoogleCalendar } from '../lib/google';
import {
  fetchCalendarEvents,
  fetchCalendarList,
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
  /** All available Google calendars for the user. */
  calendars: GoogleCalendar[];
  /** Which calendars are currently selected for syncing. */
  selectedCalendarIds: string[];
  /** Select/deselect a calendar for syncing. */
  toggleCalendarSelection: (calendarId: string) => void;
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
  /** Re-fetch calendar events using the current token. Optionally pass the visible calendar range. */
  refreshEvents: (range?: { start: Date; end: Date }) => Promise<void>;
}

function mapGoogleEvent(event: GoogleEvent, calendarId: string): CalendarEvent {
  return {
    id: event.id,
    title: event.summary,
    description: event.description || '',
    startTime: event.start.dateTime || event.start.date || '',
    endTime: event.end.dateTime || event.end.date || '',
    calendar: calendarId,
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
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('tempo-selected-calendars');
      return stored ? JSON.parse(stored) : ['primary'];
    } catch {
      return ['primary'];
    }
  });
  // Mirror selectedCalendarIds into a ref so fetchAndSetEvents can read
  // the latest selection without rebuilding the callback every time.
  const selectedCalendarIdsRef = useRef(selectedCalendarIds);
  useEffect(() => { selectedCalendarIdsRef.current = selectedCalendarIds; }, [selectedCalendarIds]);
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
  // Visible range ref so polling and manual refresh can use the current
  // window without rebuilding the fetch callback.
  const visibleRangeRef = useRef<{ start: Date; end: Date } | null>(null);
  // Mirror `disconnected` into a ref so internal callers (the fetch
  // closure and the polling interval) can read the latest value without
  // listing `disconnected` in their dependency arrays. This is the only
  // place that owns the mirror, preventing drift between state and ref.
  useEffect(() => { disconnectedRef.current = disconnected; }, [disconnected]);

  /**
   * Fetch calendar events. Optionally pass a visible range so events
   * are fetched for the exact window the user is looking at instead of
   * the hardcoded default (now + 7 days).
   */
  const fetchAndSetEvents = useCallback(async (range?: { start: Date; end: Date }) => {
    if (disconnectedRef.current) return;
    setError(null);
    setIsLoading(true);
    try {
      // Fetch events from ALL selected calendars, not just primary.
      const idsToFetch = selectedCalendarIdsRef.current.length > 0 ? selectedCalendarIdsRef.current : ['primary'];
      // Fetching events from selected calendars
      const allGoogleEvents: Array<{ event: GoogleEvent; calendarId: string }> = [];
      const perCalendarErrors: string[] = [];
      // Fetch in parallel — each calendar is independent.
      const timeMin = range?.start.toISOString();
      const timeMax = range?.end.toISOString();
      const results = await Promise.allSettled(
        idsToFetch.map((calId) => fetchCalendarEvents(calId, timeMin, timeMax).then((evts) => ({ calId, evts })))
      );
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const calId = idsToFetch[i];
        if (result.status === 'fulfilled') {
          for (const ev of result.value.evts) {
            allGoogleEvents.push({ event: ev, calendarId: result.value.calId });
          }
        } else {
          const calErr = result.reason;
          // Failed to fetch calendar — error recorded in perCalendarErrors
          const label = calErr instanceof GoogleAuthError ? calErr.message : String(calErr);
          perCalendarErrors.push(`${calId}: ${label}`);
        }
      }
      const mapped = allGoogleEvents.map((item) => mapGoogleEvent(item.event, item.calendarId));
      // Diff against the previous fetch to find events that disappeared.
      const newIds = new Set(mapped.map((e) => e.id));
      const deletedIds: string[] = [];
      for (const prevId of previousGoogleEventIdsRef.current) {
        if (!newIds.has(prevId)) deletedIds.push(prevId);
      }
      const hasBaseline = previousGoogleEventIdsRef.current.size > 0;
      if (hasBaseline && deletedIds.length > 0) {
        // Detected deleted Google events
        onEventsDeletedRef.current?.(deletedIds);
      }
      previousGoogleEventIdsRef.current = newIds;
      setEvents(mapped);
      setLastSyncAt(new Date());
      // Events loaded successfully
      // Surface per-calendar errors as a single error message so the UI can show them.
      if (perCalendarErrors.length > 0 && perCalendarErrors.length < idsToFetch.length) {
        setError(new GoogleAuthError(
          `Some calendars failed to sync: ${perCalendarErrors.join('; ')}`
        ));
      }
    } catch (err: unknown) {
      // Failed to fetch events — error surfaced via state
      if (err instanceof GoogleAuthError) {
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
      // Supabase session has Google access token — syncing
      setAccessToken(accessToken);
      // Use the stored visible range if available; otherwise let the
      // Google API use its default (now + 7 days) for the first fetch.
      void fetchAndSetEvents(visibleRangeRef.current ?? undefined);
    } else {
      // No Google access token in session — clearing
      clearAccessToken();
      setEvents([]);
      setLastSyncAt(null);
    }
  }, [accessToken, fetchAndSetEvents]);

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
      // Polling for external changes — use the stored visible range so
      // we don't fetch a hardcoded window while the user is looking at
      // a different month or week.
      void fetchAndSetEvents(visibleRangeRef.current ?? undefined);
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
    // connect() is a no-op — use auth.connectGoogleCalendar() to trigger a Google OAuth re-auth
  }, []);

  const disconnect = useCallback(() => {
    // Disconnecting Google Calendar (clearing in-memory token)
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

  const refreshEvents = useCallback(async (range?: { start: Date; end: Date }) => {
    if (!accessToken) return;
    if (range) visibleRangeRef.current = range;
    await fetchAndSetEvents(visibleRangeRef.current ?? undefined);
  }, [accessToken, fetchAndSetEvents]);

  const toggleCalendarSelection = useCallback((calendarId: string) => {
    const prev = selectedCalendarIdsRef.current;
    const next = prev.includes(calendarId)
      ? prev.filter((id) => id !== calendarId)
      : [...prev, calendarId];
    // Update the ref synchronously so fetchAndSetEvents reads the latest
    // selection without waiting for the useEffect mirror to fire.
    selectedCalendarIdsRef.current = next;
    setSelectedCalendarIds(next);
    try { localStorage.setItem('tempo-selected-calendars', JSON.stringify(next)); } catch { /* ignore */ }
    // Reset the deletion-detection baseline so deselecting a calendar
    // doesn't incorrectly report the removed events as deleted.
    previousGoogleEventIdsRef.current = new Set();
    // Immediately refetch events so the UI reflects the new selection
    // without waiting for the next poll interval. Use the stored visible
    // range so the fetch aligns with what the user is currently looking at.
    void fetchAndSetEvents(visibleRangeRef.current ?? undefined);
  }, [fetchAndSetEvents]);

  // Fetch calendar list when authenticated
  const fetchAndSetCalendars = useCallback(async () => {
    if (disconnectedRef.current) return;
    try {
      const list = await fetchCalendarList();
      setCalendars(list);
      // Only auto-add primary on the very first load (when the stored
      // selection is the default ['primary']). Once the user has explicitly
      // toggled calendars, do NOT force primary back into the selection.
      const stored = localStorage.getItem('tempo-selected-calendars');
      if (!stored) {
        const hasPrimary = list.some((c) => c.primary);
        if (hasPrimary) {
          const next = ['primary'];
          try { localStorage.setItem('tempo-selected-calendars', JSON.stringify(next)); } catch { /* ignore */ }
          setSelectedCalendarIds(next);
        }
      }
    } catch {
      // Failed to fetch calendar list — error surfaced via state
    }
  }, []);

  useEffect(() => {
    if (accessToken && !disconnectedRef.current) {
      void fetchAndSetCalendars();
    }
  }, [accessToken, fetchAndSetCalendars]);

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
    calendars,
    selectedCalendarIds,
    toggleCalendarSelection,
  };
}