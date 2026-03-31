import { createClient } from '@supabase/supabase-js';
import { base44 } from '@/api/base44Client';

let supabaseInstance = null;
let initPromise = null;

async function initSupabase() {
  // Try Vite env vars first (for local dev / Hostinger)
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (url && key) {
    return createClient(url, key);
  }

  // Fall back to backend function (Base44 preview environment)
  const response = await base44.functions.invoke('getSupabaseConfig', {});
  const { supabaseUrl, supabaseAnonKey } = response.data;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase credentials not available. Set SUPABASE_URL and SUPABASE_ANON_KEY in secrets.');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
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