import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Supabase client singleton with AsyncStorage persistence.
 * Reads from EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// DEV-ONLY: Log environment variable status for debugging
if (__DEV__) {
  console.log('[Supabase Client] Initializing...');
  console.log('[Supabase Client] URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
  if (supabaseUrl) {
    console.log('[Supabase Client] URL (last 10 chars):', supabaseUrl.slice(-10));
  }
  console.log('[Supabase Client] Anon Key:', supabaseAnonKey ? '✅ Set' : '❌ Missing');
  console.log(
    '[Supabase Client] Repo Backend:',
    process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory (default)',
  );
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Disable for React Native
  },
});

// DEV-ONLY: Health check on init
if (__DEV__) {
  supabase.auth.getSession().then(({ data }) => {
    console.log('[Supabase Client] session?', !!data.session, 'user?', data.session?.user?.id);
  });
}
