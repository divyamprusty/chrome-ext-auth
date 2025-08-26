import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

// Check environment for WebSocket capability before creating client
let supabase: ReturnType<typeof createClient> | undefined = undefined;

if (typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined') {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // WebSocket not available, don't initialize Supabase client
  // Optionally, export a stub or throw
  console.warn('[Supabase] WebSocket not available. Supabase client not initialized.');
}

export { supabase };