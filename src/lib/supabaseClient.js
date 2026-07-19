import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://gzktuteedbtnaxfdylyu.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6a3R1dGVlZGJ0bmF4ZmR5bHl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzY2NzIsImV4cCI6MjA5MDU1MjY3Mn0.zZL0Tyizzj3U8JTggYYKZ8BFrhDOKAzwISGNPJDAFzg';

let supabaseInstance = null;
let initPromise = null;

async function initSupabase() {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  // iOS Safari / standalone PWA suspends JS timers while backgrounded, so
  // supabase-js's internal refresh timer can miss a refresh window while the
  // app is closed. Re-check the session the moment the app becomes visible
  // again — getSession() transparently refreshes an expired-but-refreshable
  // token using the persisted refresh token, rather than waiting on a timer
  // that may never have fired while backgrounded.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        client.auth.getSession();
      }
    });
  }

  return client;
}

export async function getSupabase() {
  if (supabaseInstance) return supabaseInstance;
  if (!initPromise) {
    initPromise = initSupabase().then(client => {
      supabaseInstance = client;
      return client;
    });
  }
  return initPromise;
}

// For backwards compatibility — returns a proxy that lazily resolves
export const supabase = new Proxy({}, {
  get(_, prop) {
    return (...args) => getSupabase().then(client => client[prop](...args));
  }
});