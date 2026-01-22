/**
 * Token storage via Supabase
 * Uses service key for server-side operations
 */

import type { CalendarToken, CalendarProvider, Env } from '../types';

export class TokenStorage {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(env: Env) {
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_SERVICE_KEY;
  }

  private async query<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<{ data: T | null; error: string | null }> {
    try {
      const url = `${this.supabaseUrl}/rest/v1/${path}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabaseKey,
          Authorization: `Bearer ${this.supabaseKey}`,
          Prefer: options.method === 'POST' ? 'return=representation' : 'return=minimal',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[TokenStorage] Error:', response.status, text);
        return { data: null, error: `Supabase error: ${response.status}` };
      }

      // Handle empty responses (DELETE, some updates)
      const text = await response.text();
      if (!text) {
        return { data: null, error: null };
      }

      const data = JSON.parse(text);
      return { data, error: null };
    } catch (err) {
      console.error('[TokenStorage] Exception:', err);
      return { data: null, error: String(err) };
    }
  }

  /**
   * Get token for a user and provider
   */
  async getToken(userId: string, provider: CalendarProvider): Promise<CalendarToken | null> {
    const path = `calendar_tokens?owner_id=eq.${userId}&provider=eq.${provider}&select=*`;
    const { data, error } = await this.query<CalendarToken[]>(path);

    if (error || !data || data.length === 0) {
      return null;
    }

    return data[0];
  }

  /**
   * Get all tokens for a user
   */
  async getTokensForUser(userId: string): Promise<CalendarToken[]> {
    const path = `calendar_tokens?owner_id=eq.${userId}&select=*`;
    const { data, error } = await this.query<CalendarToken[]>(path);

    if (error || !data) {
      return [];
    }

    return data;
  }

  /**
   * Save or update token (upsert)
   */
  async saveToken(
    userId: string,
    provider: CalendarProvider,
    tokenData: {
      access_token: string;
      refresh_token: string;
      access_token_expires_at: string;
      provider_email?: string | null;
      provider_account_id?: string | null;
    },
  ): Promise<{ success: boolean; error?: string }> {
    // Check if token exists
    const existing = await this.getToken(userId, provider);

    if (existing) {
      // Update existing token
      const path = `calendar_tokens?id=eq.${existing.id}`;
      const { error } = await this.query(path, {
        method: 'PATCH',
        body: JSON.stringify({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          access_token_expires_at: tokenData.access_token_expires_at,
          provider_email: tokenData.provider_email ?? existing.provider_email,
          provider_account_id: tokenData.provider_account_id ?? existing.provider_account_id,
          is_active: true,
          last_error: null,
          updated_at: new Date().toISOString(),
        }),
      });

      if (error) {
        return { success: false, error };
      }
    } else {
      // Insert new token
      const path = 'calendar_tokens';
      const { error } = await this.query(path, {
        method: 'POST',
        body: JSON.stringify({
          owner_id: userId,
          provider,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          access_token_expires_at: tokenData.access_token_expires_at,
          provider_email: tokenData.provider_email ?? null,
          provider_account_id: tokenData.provider_account_id ?? null,
          is_active: true,
        }),
      });

      if (error) {
        return { success: false, error };
      }
    }

    return { success: true };
  }

  /**
   * Update last synced timestamp
   */
  async updateLastSynced(userId: string, provider: CalendarProvider): Promise<void> {
    const existing = await this.getToken(userId, provider);
    if (!existing) return;

    const path = `calendar_tokens?id=eq.${existing.id}`;
    await this.query(path, {
      method: 'PATCH',
      body: JSON.stringify({
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  }

  /**
   * Record an error
   */
  async recordError(userId: string, provider: CalendarProvider, error: string): Promise<void> {
    const existing = await this.getToken(userId, provider);
    if (!existing) return;

    const path = `calendar_tokens?id=eq.${existing.id}`;
    await this.query(path, {
      method: 'PATCH',
      body: JSON.stringify({
        last_error: error,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  /**
   * Delete token (disconnect)
   */
  async deleteToken(
    userId: string,
    provider: CalendarProvider,
  ): Promise<{ success: boolean; error?: string }> {
    const path = `calendar_tokens?owner_id=eq.${userId}&provider=eq.${provider}`;
    const { error } = await this.query(path, {
      method: 'DELETE',
    });

    if (error) {
      return { success: false, error };
    }

    return { success: true };
  }
}
