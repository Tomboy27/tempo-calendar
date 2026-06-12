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

let accessToken: string | null = null;
let tokenExpiry: number | null = null;

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';
const STORAGE_KEY_TOKEN = 'tempo_google_token';
const STORAGE_KEY_EXPIRY = 'tempo_google_expiry';

/** Stable error codes for Google sign-in failures. The UI can match on
 *  `error.code` (decoupled from the user-facing `message`, which can be
 *  reworded or localized without breaking the self-serve UI). */
export type GoogleAuthErrorCode =
  | 'ORIGIN_NOT_AUTHORIZED'  // GIS popup_failed_to_open — Client ID missing this origin
  | 'POPUP_CLOSED'           // user dismissed the popup
  | 'ACCESS_DENIED'          // user declined consent
  | 'UNKNOWN_RISK_LEVEL'     // page is in an iframe or sandboxed
  | 'TIMEOUT'                // GIS callback never fired within 15s
  | 'MISSING_CLIENT_ID'      // VITE_GOOGLE_CLIENT_ID not set
  | 'OTHER';                 // unclassified

export class GoogleAuthError extends Error {
  readonly code: GoogleAuthErrorCode;
  constructor(code: GoogleAuthErrorCode, message: string) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
  }
}

// Restore token from sessionStorage on module load
(function restoreToken() {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY_TOKEN);
    const storedExpiry = sessionStorage.getItem(STORAGE_KEY_EXPIRY);
    if (stored && storedExpiry) {
      const expiry = parseInt(storedExpiry, 10);
      if (Date.now() < expiry) {
        accessToken = stored;
        tokenExpiry = expiry;
        console.log('[Google] Token restored from sessionStorage');
      } else {
        console.log('[Google] Stored token expired, clearing');
        sessionStorage.removeItem(STORAGE_KEY_TOKEN);
        sessionStorage.removeItem(STORAGE_KEY_EXPIRY);
      }
    }
  } catch {
    // sessionStorage not available
  }
})();

function persistToken(token: string, expiresIn: number) {
  accessToken = token;
  tokenExpiry = Date.now() + expiresIn * 1000;
  try {
    sessionStorage.setItem(STORAGE_KEY_TOKEN, token);
    sessionStorage.setItem(STORAGE_KEY_EXPIRY, String(tokenExpiry));
  } catch {
    // sessionStorage not available
  }
}

function clearPersistedToken() {
  accessToken = null;
  tokenExpiry = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY_TOKEN);
    sessionStorage.removeItem(STORAGE_KEY_EXPIRY);
  } catch {
    // sessionStorage not available
  }
}

export function loadGoogleApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.accounts) {
      console.log('[Google] API already loaded');
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      console.log('[Google] GIS library loaded successfully');
      resolve();
    };
    script.onerror = () => {
      console.error('[Google] Failed to load GIS library');
      reject(new Error('Failed to load Google Identity Services'));
    };
    document.body.appendChild(script);
  });
}

export function hasValidToken(): boolean {
  return accessToken !== null && tokenExpiry !== null && Date.now() < tokenExpiry;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Attempt a silent token request (no popup). Only works if the user has
 * previously granted consent in this browser session.
 */
export function trySilentAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    // If we already have a valid token, no need to request
    if (hasValidToken()) {
      console.log('[Google] Already have valid token, skipping silent auth');
      resolve(true);
      return;
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('[Google] Missing VITE_GOOGLE_CLIENT_ID');
      resolve(false);
      return;
    }

    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response: google.accounts.oauth2.TokenResponse) => {
        if (response.error) {
          console.log('[Google] Silent auth failed:', response.error);
          resolve(false);
          return;
        }
        console.log('[Google] Silent auth succeeded');
        persistToken(response.access_token, response.expires_in || 3600);
        resolve(true);
      },
    });

    client.requestAccessToken({ prompt: '' });
  });
}

/**
 * Request access token with user popup (consent prompt).
 * Returns the access token string on success.
 *
 * The promise ALWAYS settles within 60s so callers can reset loading state.
 * `error_callback` covers the case where the user dismisses the popup
 * without an explicit error response (GIS sometimes never fires the main
 * callback in that case, which previously left the app stuck on "Connecting").
 */
export function requestAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    clearPersistedToken();

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('[Google] Missing VITE_GOOGLE_CLIENT_ID');
      reject(new GoogleAuthError('MISSING_CLIENT_ID', 'Missing Google Client ID'));
      return;
    }

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      fn();
    };

    // Failsafe: if the GIS callback never fires (popup closed, blocked, etc.)
    // we reject so the UI can leave the loading state.
    const timeoutId = setTimeout(() => {
      console.warn('[Google] Consent flow timed out after 15s');
      settle(() => reject(new GoogleAuthError('TIMEOUT', 'Google sign-in timed out. Please try again.')));
    }, 15_000);

    // FedCM (Federated Credential Management) is Chrome 131+'s replacement
    // for the third-party-cookie-dependent popup flow. It uses a browser-
    // native dialog instead of a popup window, so it works regardless of:
    //   - Third-party cookie settings (Tracking Protection)
    //   - Popup blockers (browser or extension)
    //   - Browser policies that block popups
    //
    // GIS's `itp_support: true` enables FedCM mode automatically when the
    // browser supports it (the `IdentityCredential` global). In other
    // browsers it falls back to the standard popup flow.
    const isFedCmSupported =
      typeof window !== 'undefined' && 'IdentityCredential' in window;
    if (isFedCmSupported) {
      console.log('[Google] Using FedCM (browser-native sign-in dialog)');
    } else {
      console.log('[Google] Using popup-based sign-in (FedCM not supported)');
    }

    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      // Enable ITP/FedCM support when available. Conditional spread keeps
      // the config object clean in browsers where FedCM isn't supported
      // (avoids passing `itp_support: false`, which is a no-op but noisy).
      ...(isFedCmSupported ? { itp_support: true } : {}),
      callback: (response: google.accounts.oauth2.TokenResponse) => {
        if (response.error) {
          console.error('[Google] Auth error:', response.error, response.error_subtype, response.error_description);
          settle(() => reject(new GoogleAuthError('OTHER', response.error_description || response.error || 'Unknown Google sign-in error')));
          return;
        }
        console.log('[Google] Token obtained via consent flow');
        persistToken(response.access_token, response.expires_in || 3600);
        settle(() => resolve(response.access_token));
      },
      error_callback: (err) => {
        console.warn('[Google] Sign-in error callback fired:', err);
        // GIS error types: 'popup_closed' | 'popup_failed_to_open' |
        // 'unknown_risk_level' | 'access_denied' | 'immediate_failed' |
        // (FedCM mode) 'fedcm_failed' | 'fedcm_account_not_selected' |
        // 'fedcm_user_card_closed' | etc.
        // The `type` field is the most reliable signal; `message` varies
        // across browsers and is sometimes empty.
        const errType = (err as { type?: string })?.type || '';
        const errMsg = (err as { message?: string })?.message || '';

        let code: GoogleAuthErrorCode = 'OTHER';
        let message: string;

        if (errType === 'popup_failed_to_open' || /failed to open/i.test(errMsg)) {
          code = 'ORIGIN_NOT_AUTHORIZED';
          message = 'Couldn\'t open the Google sign-in window. Your browser may be blocking popups, or your Google Client ID isn\'t authorized for this origin. Allow popups, then add the origin to your Client ID\'s authorized JavaScript origins in Google Cloud Console.';
        } else if (errType === 'popup_closed' || /closed|cancelled|canceled/i.test(errMsg)) {
          code = 'POPUP_CLOSED';
          message = 'Google sign-in was cancelled.';
        } else if (errType === 'access_denied' || /access_denied|denied/i.test(errMsg)) {
          code = 'ACCESS_DENIED';
          message = 'Google sign-in was denied. Please try again and grant the requested permissions.';
        } else if (errType === 'unknown_risk_level') {
          code = 'UNKNOWN_RISK_LEVEL';
          message = 'Google blocked the sign-in for security reasons. Try again from a normal browser window (not an iframe or embedded view).';
        } else if (/fedcm/i.test(errType) || /fedcm/i.test(errMsg)) {
          // FedCM-specific errors (Chrome 131+). The browser-native dialog
          // was shown but the user dismissed it or something else failed.
          // We surface a generic message; the error is usually transient.
          code = 'OTHER';
          message = 'Browser-based sign-in was cancelled or failed. Please try again.';
        } else if (errMsg) {
          message = `Google sign-in failed: ${errMsg}`;
        } else {
          message = 'Google sign-in failed. Please try again.';
        }
        settle(() => reject(new GoogleAuthError(code, message)));
      },
    });

    try {
      client.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      console.error('[Google] requestAccessToken threw:', err);
      settle(() => reject(new GoogleAuthError('OTHER', err instanceof Error ? err.message : 'Failed to start Google sign-in')));
    }
  });
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
    throw new Error('Not authenticated');
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
      throw new Error(`Calendar API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Google] Fetched ${data.items?.length || 0} events`);
    return data.items || [];
  } catch (error) {
    console.error('[Google] Failed to fetch calendar events:', error);
    throw error;
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
    throw new Error('Not authenticated');
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
      throw new Error(`Create event error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[Google] Event created:', data.id);
    return data;
  } catch (error) {
    console.error('[Google] Failed to create event:', error);
    throw error;
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
    throw new Error('Not authenticated');
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
      throw new Error(`Update event error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[Google] Event updated:', data.id);
    return data;
  } catch (error) {
    console.error('[Google] Failed to update event:', error);
    throw error;
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!accessToken) {
    console.error('[Google] No access token available');
    throw new Error('Not authenticated');
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
      throw new Error(`Delete event error: ${response.status} - ${errorText}`);
    }

    console.log('[Google] Event deleted:', eventId);
  } catch (error) {
    console.error('[Google] Failed to delete event:', error);
    throw error;
  }
}

export function isSignedIn(): boolean {
  return hasValidToken();
}

export function signOut(): void {
  console.log('[Google] Signing out');
  clearPersistedToken();
}