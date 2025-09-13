// Supabase client configuration
const SUPABASE_URL = 'https://pghywddpncjauftwmssb.supabase.co';
// TODO: Replace with your actual Supabase anon key from the dashboard
// Go to: https://supabase.com/dashboard/project/pghywddpncjauftwmssb/settings/api
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnaHl3ZGRwbmNqYXVmdHdtc3NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc3NTc3OTYsImV4cCI6MjA3MzMzMzc5Nn0.NbP1Ecco69lFT0ndDvYnOywivi2nw_4W18ZxA46wAhQ';

// Web app configuration
const WEB_APP_URL = 'http://localhost:3000'; // Change this to your web app URL

// Real-time synchronization channels
let sessionsChannel = null;
let messagesChannel = null;

// Initialize Supabase client
function createSupabaseClient() {
    if (typeof window.supabase !== 'undefined') {
        // Create Supabase client with Chrome extension specific configuration
        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: false,
                storage: {
                    getItem: (key) => {
                        try {
                            return localStorage.getItem(key);
                        } catch {
                            return null;
                        }
                    },
                    setItem: (key, value) => {
                        try {
                            localStorage.setItem(key, value);
                        } catch {
                            // Ignore storage errors
                        }
                    },
                    removeItem: (key) => {
                        try {
                            localStorage.removeItem(key);
                        } catch {
                            // Ignore storage errors
                        }
                    }
                }
            },
            realtime: {
                params: {
                    eventsPerSecond: 10
                }
            },
            global: {
                headers: {
                    'X-Client-Info': 'supabase-js-chrome-extension'
                }
            }
        });
        
        window.supabaseClient = supabase;
        window.WEB_APP_URL = WEB_APP_URL;
        
        // Setup real-time synchronization
        setupRealtimeSync(supabase);
        
        console.log('Supabase client created successfully');
        return supabase;
    } else {
        console.log('Supabase bundle not ready, retrying...');
        setTimeout(createSupabaseClient, 100);
        return null;
    }
}

// Setup real-time synchronization between extension and web app
function setupRealtimeSync(supabase) {
    // Get current user for filtering
    supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        
        const userId = user.id;
        
        // Listen for session changes from web app
        sessionsChannel = supabase
            .channel('extension-sessions')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chat_sessions',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                console.log('Session change detected:', payload);
                // Notify extension UI about session changes
                window.postMessage({
                    type: 'DATABASE_SYNC',
                    source: 'extension-realtime',
                    table: 'chat_sessions',
                    event: payload.eventType,
                    data: payload.new || payload.old
                }, '*');
            })
            .subscribe();
            
        // Listen for message changes from web app
        messagesChannel = supabase
            .channel('extension-messages')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chat_messages',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                console.log('Message change detected:', payload);
                // Notify extension UI about message changes
                window.postMessage({
                    type: 'DATABASE_SYNC',
                    source: 'extension-realtime',
                    table: 'chat_messages',
                    event: payload.eventType,
                    data: payload.new || payload.old
                }, '*');
            })
            .subscribe();
            
        console.log('Real-time synchronization setup complete');
    });
}

// Cleanup function for real-time channels
function cleanupRealtimeSync() {
    if (sessionsChannel) {
        window.supabaseClient.removeChannel(sessionsChannel);
        sessionsChannel = null;
    }
    if (messagesChannel) {
        window.supabaseClient.removeChannel(messagesChannel);
        messagesChannel = null;
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanupRealtimeSync);

// Start initialization
createSupabaseClient();
