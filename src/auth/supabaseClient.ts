import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

let client: SupabaseClient | null = null;

// Create only when running in a page/popup (not service worker)
if (typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined') {
  client = createClient(supabaseUrl, supabaseAnonKey);
}

// New: preferred getter (null when unavailable)
export const getSupabase = (): SupabaseClient | null => client;

// Backwards-compat: existing named export (may be null)
export const supabase = client;