/// <reference types="vite/client" />

export interface GoogleEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  colorId?: string;
  status?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  calendar: string;
  source: 'google' | 'task';
  color?: string;
}

/** The active Google access token (in-memory only). */
let accessToken: string | null = null;

/**
 * Stable error type for Google API failures. Kept as a class (not just a
 * `new Error(...)`) so consumers can `instanceof` check.
 */
export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Set the active access token from an external source (e.g. Supabase's
 * `session.provider_token`, which is the Google access token attached to
 * the Supabase session after a Google OAuth sign-in). The token is held
 * in memory only — Supabase is the source of truth and re-syncs it on
 * every session change.
 *
 * Pass an empty string (or any falsy value) to clear the token.
 */
export function setAccessToken(token: string | null | undefined): void {
  if (!token) {
    if (accessToken !== null) {
      console.log('[Google] Access token cleared');
      accessToken = null;
    }
    return;
  }
  if (token !== accessToken) {
    console.log('[Google] Access token set from external source (Supabase provider_token)');
    accessToken = token;
  }
}

/** Clear the active access token. Used on sign-out and on token errors. */
export function clearAccessToken(): void {
  setAccessToken(null);
}

function getAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchCalendarEvents(
  calendarId: string = 'primary',
  timeMin?: string,
  timeMax?: string
): Promise<GoogleEvent[]> {
  if (!accessToken) {
    console.error('[Google] No access token available');
    throw new GoogleAuthError('Not authenticated');
  }

  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: timeMin || new Date().toISOString(),
    timeMax: timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  console.log('[Google] Fetching events from:', url);

  try {
    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Google] Calendar API error:', response.status, errorText);
      throw new GoogleAuthError(`Calendar API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Google] Fetched ${data.items?.length || 0} events`);
    return data.items || [];
  } catch (error) {
    if (error instanceof GoogleAuthError) throw error;
    console.error('[Google] Failed to fetch calendar events:', error);
    throw new GoogleAuthError(error instanceof Error ? error.message : 'Failed to fetch calendar events');
  }
}

export async function createCalendarEvent(event: {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  colorId?: string;
}): Promise<GoogleEvent> {
  if (!accessToken) {
    console.error('[Google] No access token available');
    throw new GoogleAuthError('Not authenticated');
  }

  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  console.log('[Google] Creating event:', event.summary);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Google] Create event error:', response.status, errorText);
      throw new GoogleAuthError(`Create event error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[Google] Event created:', data.id);
    return data;
  } catch (error) {
    if (error instanceof GoogleAuthError) throw error;
    console.error('[Google] Failed to create event:', error);
    throw new GoogleAuthError(error instanceof Error ? error.message : 'Failed to create event');
  }
}

export async function updateCalendarEvent(
  eventId: string,
  event: {
    summary?: string;
    description?: string;
    start?: { dateTime: string; timeZone?: string };
    end?: { dateTime: string; timeZone?: string };
    colorId?: string;
  }
): Promise<GoogleEvent> {
  if (!accessToken) {
    console.error('[Google] No access token available');
    throw new GoogleAuthError('Not authenticated');
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
  console.log('[Google] Updating event:', eventId);

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Google] Update event error:', response.status, errorText);
      throw new GoogleAuthError(`Update event error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[Google] Event updated:', data.id);
    return data;
  } catch (error) {
    if (error instanceof GoogleAuthError) throw error;
    console.error('[Google] Failed to update event:', error);
    throw new GoogleAuthError(error instanceof Error ? error.message : 'Failed to update event');
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!accessToken) {
    console.error('[Google] No access token available');
    throw new GoogleAuthError('Not authenticated');
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
  console.log('[Google] Deleting event:', eventId);

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Google] Delete event error:', response.status, errorText);
      throw new GoogleAuthError(`Delete event error: ${response.status} - ${errorText}`);
    }

    console.log('[Google] Event deleted:', eventId);
  } catch (error) {
    if (error instanceof GoogleAuthError) throw error;
    console.error('[Google] Failed to delete event:', error);
    throw new GoogleAuthError(error instanceof Error ? error.message : 'Failed to delete event');
  }
}

