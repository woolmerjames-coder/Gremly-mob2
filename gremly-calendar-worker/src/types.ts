/**
 * Shared types for calendar worker
 */

export type CalendarProvider = 'outlook' | 'google' | 'ics';

export interface CalendarEvent {
  id: string;
  provider: CalendarProvider;
  providerEventId: string;
  title: string;
  startAt: string; // ISO timestamp
  endAt: string; // ISO timestamp
  isAllDay: boolean;
  location: string | null;
  description: string | null;
  calendarName?: string | null;
}

// For ICS calendars: access_token = ics_url, refresh_token = '', provider_email = calendar label/name
export interface CalendarToken {
  id: string;
  owner_id: string;
  provider: CalendarProvider;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  provider_email: string | null;
  provider_account_id: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface CalendarConnectionStatus {
  provider: CalendarProvider;
  isConnected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface Env {
  // Azure/Outlook
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
  AZURE_REDIRECT_URI: string;

  // Google (Phase 4)
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

// Microsoft Graph API response types
export interface MSGraphEvent {
  id: string;
  subject: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  isAllDay: boolean;
  location?: {
    displayName?: string;
  };
  bodyPreview?: string;
}

export interface MSGraphCalendarResponse {
  value: MSGraphEvent[];
  '@odata.nextLink'?: string;
}

export interface MSGraphTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface MSGraphUserResponse {
  id: string;
  mail: string | null;
  userPrincipalName: string;
  displayName: string;
}
